import { randomUUID } from 'node:crypto'
import type { CharacterImportFile, CharacterImportPreview, CharacterImportResult, CharacterImportSource } from '@shared/contracts/characters/transfer'
import type { CharacterRecord } from '@shared/contracts/entities/persona'
import type { SettingLibrary } from '@shared/contracts/settingLibrary/schemas'
import type { VariableConfig } from '@shared/contracts/variables/schemas'
import type { RegexRuleRepository } from '@main/modules/regexRules'
import { includeImportedRulesInActiveVersion } from '@shared/foundation/regex/RegexRuleProcessor'
import type { SettingLibraryRepository } from '@main/modules/settingLibraries'
import type { VariableConfigRepository } from '@main/modules/variables'
import type { SqliteDatabase } from '@main/platform/sqlite/SqliteDatabase'
import type { CharacterRepository } from '@main/modules/personas'
import { decodeCharacterCard } from './characterCardFormats'
import type { DecodedCharacterCard, PortableAsset } from './characterTransferTypes'
import { decodeSettingLibrarySnapshot, decodeVariableConfigSnapshot } from './portableSnapshots'
import { isPng } from '@main/platform/filesystem/PngTextChunkCodec'

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
    private readonly regexRules: RegexRuleRepository
  ) {}

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
      characterMode: source.characterMode,
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
}

function retargetLibrary(library: SettingLibrary, characterId: string): SettingLibrary {
  const withoutRoleplayPlan = (entries: SettingLibrary['entries']) => entries.filter((entry) => (
    entry.id !== 'fixed-roleplay-plan' && entry.kind !== 'roleplay_plan'
  ))
  return {
    ...library,
    characterId,
    entries: withoutRoleplayPlan(library.entries),
    versions: library.versions.map((version) => ({ ...version, entries: withoutRoleplayPlan(version.entries) }))
  }
}

function retargetVariables(config: VariableConfig, characterId: string): VariableConfig {
  return { ...config, characterId }
}

function decodeInput(base64: string): Uint8Array {
  const normalized = base64.trim()
  if (!normalized) throw new Error('角色卡文件为空')
  const bytes = Buffer.from(normalized, 'base64')
  if (!bytes.length) throw new Error('角色卡文件为空')
  if (bytes.length > 64 * 1024 * 1024) throw new Error('角色卡不能超过 64 MB')
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
