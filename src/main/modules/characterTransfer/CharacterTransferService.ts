import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import type {
  CharacterExportBatchResult,
  CharacterExportFormat,
  CharacterExportResult,
  CharacterImportFile,
  CharacterImportPreview,
  CharacterImportResult,
  CharacterImportSource
} from '@shared/contracts/characters/transfer'
import type { CharacterRecord } from '@shared/contracts/entities/persona'
import type { SettingLibrary } from '@shared/contracts/settingLibrary/schemas'
import type { VariableConfig } from '@shared/contracts/variables/schemas'
import type { RegexRuleRepository } from '@main/modules/regexRules'
import { includeImportedRulesInActiveVersion } from '@shared/foundation/regex/RegexRuleProcessor'
import type { SettingLibraryRepository } from '@main/modules/settingLibraries'
import type { VariableConfigRepository } from '@main/modules/variables'
import type { SqliteDatabase } from '@main/platform/sqlite/SqliteDatabase'
import type { CharacterRepository } from '@main/modules/personas'
import type { LocalMediaStore } from '@main/platform/filesystem/LocalMediaStore'
import {
  decodeCharacterCard,
  encodeCharacterCardJson,
  encodePortableCharacterPayload
} from './characterCardFormats'
import type { DecodedCharacterCard, PortableAsset } from './characterTransferTypes'
import {
  decodeSettingLibrarySnapshot,
  decodeVariableConfigSnapshot,
  encodeSettingLibrarySnapshot,
  encodeVariableConfigSnapshot
} from './portableSnapshots'
import { isPng, writePngText } from '@main/platform/filesystem/PngTextChunkCodec'

interface PreparedItem {
  id: string
  displayName: string
  decoded?: DecodedCharacterCard
  errorMessage: string
  imageAvailable: boolean
}

export class CharacterTransferService {
  private prepared = new Map<string, PreparedItem[]>()

  constructor(
    private readonly store: SqliteDatabase,
    private readonly characters: CharacterRepository,
    private readonly settingLibraries: SettingLibraryRepository,
    private readonly variables: VariableConfigRepository,
    private readonly regexRules: RegexRuleRepository,
    private readonly mediaAssets?: LocalMediaStore
  ) {}

  export(characterId: string, format: CharacterExportFormat): CharacterExportResult {
    const character = this.characters.get().items.find((item) => item.id === characterId)
    if (!character) throw new Error('找不到对应的角色卡。')
    const persona = record(character.persona)
    const assets = [
      this.portableAsset('avatar.circle', string(persona.assistant_avatar, string(character.avatar))),
      this.portableAsset('avatar.square', string(persona.assistant_square)),
      this.portableAsset('avatar.portrait', string(persona.assistant_cover))
    ].filter((asset): asset is PortableAsset => !!asset)
    if (assets.reduce((total, asset) => total + asset.bytes.length, 0) > 48 * 1024 * 1024) {
      throw new Error('角色图片总大小不能超过 48 MB')
    }
    const packageData = {
      character: {
        name: string(character.name, string(persona.assistant_name, '未命名角色')),
        group: string(character.group, string(character.groupName)),
        frontendBeautyEnabled: boolean(character.frontendBeautyEnabled),
        profileAge: string(character.profileAge),
        profileSex: string(character.profileSex),
        profileHeight: string(character.profileHeight),
        profileBirthday: string(character.profileBirthday),
        profileLike: string(character.profileLike),
        imagePrompt: string(persona.image_prompt),
        opening: string(persona.opening),
        showOpening: boolean(persona.show_opening)
      },
      assets,
      settingLibraryJson: encodeSettingLibrarySnapshot(this.settingLibraries.get(characterId)),
      variableConfigJson: encodeVariableConfigSnapshot(this.variables.get(characterId)),
      regexRules: this.regexRules.get(characterId).characterRules
        .slice().sort((left, right) => left.order - right.order)
    }
    const json = encodeCharacterCardJson(packageData)
    const safeName = safeExportFileStem(packageData.character.name)
    if (format === 'json') {
      return {
        fileName: `${safeName}.json`,
        mimeType: 'application/json',
        base64: Buffer.from(json, 'utf8').toString('base64')
      }
    }
    const baseImage = assets.find((asset) => asset.key === 'avatar.portrait' && asset.mediaType === 'image/png')
      ?? assets.find((asset) => asset.key === 'avatar.square' && asset.mediaType === 'image/png')
      ?? assets.find((asset) => asset.key === 'avatar.circle' && asset.mediaType === 'image/png')
    const png = writePngText(baseImage?.bytes ?? fallbackPng(), new Map([
      ['eleckoi-card', encodePortableCharacterPayload(packageData)]
    ]))
    return {
      fileName: `${safeName}.png`,
      mimeType: 'image/png',
      base64: Buffer.from(png).toString('base64')
    }
  }

  /** 批量导出到指定目录：一次选目录，逐个写盘；单个失败不打断其余。 */
  exportMany(
    characterIds: string[],
    format: CharacterExportFormat,
    directory: string
  ): Pick<CharacterExportBatchResult, 'written' | 'failures'> {
    const written: Array<{ characterId: string; fileName: string }> = []
    const failures: Array<{ characterId: string; message: string }> = []
    try {
      mkdirSync(directory, { recursive: true })
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '导出目录不可用。'
      return { written: [], failures: characterIds.map((characterId) => ({ characterId, message })) }
    }
    for (const characterId of characterIds) {
      try {
        const exported = this.export(characterId, format)
        const target = uniqueFilePath(directory, exported.fileName)
        writeFileSync(target, Buffer.from(exported.base64, 'base64'))
        written.push({ characterId, fileName: basename(target) })
      } catch (cause) {
        failures.push({ characterId, message: cause instanceof Error ? cause.message : '导出失败。' })
      }
    }
    return { written, failures }
  }

  prepare(files: CharacterImportFile[], source: CharacterImportSource): CharacterImportPreview {
    if (!files.length) throw new Error('请至少选择一张角色卡')
    if (files.length > 50) throw new Error('一次最多导入 50 张角色卡')
    const items = files.map((file, index): PreparedItem => {
      let imageAvailable = false
      try {
        const bytes = decodeInput(file.base64)
        imageAvailable = isPng(bytes)
        const decoded = decodeCharacterCard(bytes, source)
        return { id: `card-${index + 1}`, displayName: file.displayName, decoded, errorMessage: '', imageAvailable }
      } catch (error) {
        return {
          id: `card-${index + 1}`,
          displayName: file.displayName,
          errorMessage: error instanceof Error ? error.message : '无法读取这张角色卡',
          imageAvailable
        }
      }
    })
    const token = randomUUID()
    this.prepared.clear()
    this.prepared.set(token, items)
    return {
      token,
      items: items.map((item, index) => ({
        id: item.id,
        name: item.decoded?.packageData.character.name || fileStem(item.displayName) || `第 ${index + 1} 张角色卡`,
        summary: item.decoded?.summary || '',
        imageAvailable: item.imageAvailable,
        errorMessage: item.errorMessage,
        importable: !!item.decoded && !item.errorMessage
      }))
    }
  }

  commit(token: string): CharacterImportResult {
    const items = this.prepared.get(token)
    this.prepared.delete(token)
    if (!items) throw new Error('角色卡已失效，请重新选择')
    const importedCharacterIds: string[] = []
    const failedMessages: string[] = []
    for (const item of items) {
      if (!item.decoded) continue
      try {
        const characterId = this.importOne(item.decoded)
        importedCharacterIds.push(characterId)
      } catch (error) {
        failedMessages.push(`${item.decoded.packageData.character.name}：${error instanceof Error ? error.message : '导入失败'}`)
      }
    }
    if (!importedCharacterIds.length) throw new Error(failedMessages[0] || '没有可导入的角色卡')
    const collection = this.characters.select(importedCharacterIds[0]!)
    return { collection, importedCharacterIds, failedMessages }
  }

  discard(token: string): void {
    this.prepared.delete(token)
  }

  private importOne(decoded: DecodedCharacterCard): string {
    const characterId = `character-${randomUUID()}`
    try {
      this.store.withWriteTx((db) => {
        this.characters.createInTransaction(this.characterRecord(characterId, decoded), db)
        const library = this.importedLibrary(characterId, decoded)
        if (library) this.settingLibraries.saveInTransaction(characterId, library, db)
        const variables = this.importedVariables(characterId, decoded)
        if (variables) this.variables.saveInTransaction(characterId, variables, db)
        if (decoded.regexRules.length) {
          const current = this.regexRules.get(characterId, db)
          const imported = decoded.regexRules.map((rule) => ({ scope: 'Character' as const, rule }))
          const merged = includeImportedRulesInActiveVersion({
            ...current,
            characterRules: [...current.characterRules, ...decoded.regexRules]
          }, imported)
          this.regexRules.saveInTransaction(characterId, merged, current.revision, db)
        }
      })
      this.characters.commitMediaChanges()
    } catch (error) {
      this.characters.rollbackMediaChanges()
      throw error
    }
    return characterId
  }

  private characterRecord(characterId: string, decoded: DecodedCharacterCard): CharacterRecord {
    const source = decoded.packageData.character
    const assets = decoded.packageData.assets
    const explicit = assets.length > 0
    const fallback = !explicit && decoded.sourceImage ? dataUrl('image/png', decoded.sourceImage) : ''
    const circle = assetUrl(assets, 'avatar.circle') || fallback
    const square = assetUrl(assets, 'avatar.square') || (!explicit ? fallback : '')
    const portrait = assetUrl(assets, 'avatar.portrait') || (!explicit ? fallback : '')
    return {
      id: characterId,
      name: source.name,
      avatar: circle,
      group: source.group.trim(),
      folder: '',
      frontendBeautyEnabled: source.frontendBeautyEnabled,
      profileAge: source.profileAge,
      profileSex: source.profileSex,
      profileHeight: source.profileHeight,
      profileBirthday: source.profileBirthday,
      profileLike: source.profileLike,
      chatBackground: '',
      persona: {
        assistant_name: source.name,
        assistant_avatar: circle,
        assistant_square: square,
        assistant_cover: portrait,
        image_prompt: source.imagePrompt,
        opening: source.opening,
        show_opening: source.showOpening,
        user_name: '', user_avatar: '', user_square: '', user_portrait: ''
      }
    }
  }

  private importedLibrary(characterId: string, decoded: DecodedCharacterCard): SettingLibrary | undefined {
    const snapshot = decoded.packageData.settingLibraryJson
    if (snapshot) return decodeSettingLibrarySnapshot(snapshot, characterId)
    if (!decoded.settingLibrary) return undefined
    return retargetLibrary(decoded.settingLibrary, characterId)
  }

  private importedVariables(characterId: string, decoded: DecodedCharacterCard): VariableConfig | undefined {
    const snapshot = decoded.packageData.variableConfigJson
    if (snapshot) return decodeVariableConfigSnapshot(snapshot, characterId)
    if (!decoded.variableConfig) return undefined
    return retargetVariables(decoded.variableConfig, characterId)
  }

  private portableAsset(key: string, reference: string): PortableAsset | undefined {
    if (!reference) return undefined
    const data = decodeImageDataUrl(reference)
    if (data) return { key, mediaType: data.mediaType, bytes: data.bytes }
    const path = this.mediaAssets?.pathForReference(reference)
    if (!path) return undefined
    const mediaType = mediaTypeFromExtension(extname(path))
    return mediaType ? { key, mediaType, bytes: readFileSync(path) } : undefined
  }
}

function retargetLibrary(library: SettingLibrary, characterId: string): SettingLibrary {
  return { ...library, characterId }
}

function retargetVariables(config: VariableConfig, characterId: string): VariableConfig {
  return { ...config, characterId }
}

function decodeInput(base64: string): Uint8Array {
  const normalized = base64.trim()
  if (!normalized) throw new Error('角色卡文件为空')
  const bytes = Buffer.from(normalized, 'base64')
  if (!bytes.length) throw new Error('角色卡文件为空')
  if (bytes.length > 96 * 1024 * 1024) throw new Error('角色卡不能超过 96 MB')
  return bytes
}

function assetUrl(assets: PortableAsset[], key: string): string {
  const asset = assets.find((item) => item.key === key)
  return asset ? dataUrl(asset.mediaType.startsWith('image/') ? asset.mediaType : 'image/png', asset.bytes) : ''
}

function dataUrl(mediaType: string, bytes: Uint8Array): string {
  return `data:${mediaType};base64,${Buffer.from(bytes).toString('base64')}`
}

function fileStem(name: string): string {
  const leaf = name.replace(/\\/g, '/').split('/').at(-1) ?? ''
  return leaf.replace(/\.[^.]+$/, '').trim()
}

function decodeImageDataUrl(value: string): { mediaType: string; bytes: Uint8Array } | undefined {
  const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,([a-z0-9+/=\r\n]+)$/i.exec(value)
  if (!match) return undefined
  const bytes = Buffer.from(match[2]!.replace(/\s+/g, ''), 'base64')
  return bytes.length ? { mediaType: match[1]!.toLowerCase(), bytes } : undefined
}

function mediaTypeFromExtension(extension: string): string {
  return ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' } as Record<string, string>)[extension.toLowerCase()] ?? ''
}

function fallbackPng(): Uint8Array {
  return Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function string(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function boolean(value: unknown): boolean {
  return value === true || value === 1
}

const RESERVED_FILE_STEMS = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i
/** 名字过长会被文件系统拒绝，也会顶破契约的 fileName.max(260)，这里留足扩展名与序号的空间。 */
const MAX_FILE_STEM_LENGTH = 80

/**
 * 角色名会直接变成文件名，所以统一在这里做一次规范化（导出与批量落盘共用）：
 * 去掉路径分隔符、Windows 保留字符与控制字符，截断长度，避开 Windows 保留设备名。
 */
function safeExportFileStem(name: string): string {
  const cleaned = Array.from(name
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/[. ]+$/, '')
    .trim())
    .slice(0, MAX_FILE_STEM_LENGTH)
    .join('')
    .replace(/[. ]+$/, '')
  if (cleaned.length === 0) return 'ElecKoi角色'
  return RESERVED_FILE_STEMS.test(cleaned) ? `_${cleaned}` : cleaned
}

/** 目录里已有同名文件时按 "名字 (2).ext" 递增，不覆盖用户已有的文件。 */
function uniqueFilePath(directory: string, fileName: string): string {
  const extension = extname(fileName)
  const stem = extension.length > 0 ? fileName.slice(0, -extension.length) : fileName
  let candidate = join(directory, fileName)
  for (let index = 2; existsSync(candidate) && index < 1000; index += 1) {
    candidate = join(directory, `${stem} (${index})${extension}`)
  }
  return candidate
}
