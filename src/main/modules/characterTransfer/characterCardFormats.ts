import { gunzipSync } from 'node:zlib'
import { randomUUID } from 'node:crypto'
import type { RegexRule } from '@shared/contracts/regex/schemas'
import type { SettingLibrary, SettingLibraryEntry, SettingLibraryGroup } from '@shared/contracts/settingLibrary/schemas'
import { validateRegexRule } from '@shared/foundation/regex/RegexRuleProcessor'
import { decodeRegexDocuments } from '@shared/foundation/regexRuleTransfer'
import { emptyEntry, normalizeSettingLibrary } from '@main/modules/settingLibraries'
import { convertMvuVariables, isMvuInfrastructureEntry } from './mvuImport'
import { isPng, readPngText } from '@main/platform/filesystem/PngTextChunkCodec'
import type { DecodedCharacterCard, PortableCharacterPackage } from './characterTransferTypes'

type JsonObject = Record<string, unknown>

const MAX_INPUT_BYTES = 64 * 1024 * 1024
const MAX_EXPANDED_BYTES = 96 * 1024 * 1024
const MAX_ATTACHMENTS_BYTES = 48 * 1024 * 1024

export function decodeCharacterCard(bytes: Uint8Array, source: 'eleckoi' | 'sillytavern'): DecodedCharacterCard {
  if (bytes.length > MAX_INPUT_BYTES) throw new Error('角色卡不能超过 64 MB')
  return source === 'sillytavern' ? decodeSillyTavern(bytes) : decodeElecKoi(bytes)
}

function decodeElecKoi(bytes: Uint8Array): DecodedCharacterCard {
  if (!isPng(bytes)) {
    const text = new TextDecoder().decode(bytes).trim()
    if (!text.startsWith('{')) throw new Error('无法识别这个角色卡')
    return decodeStandardCard(parseJsonObject(text, '角色卡 JSON 已损坏'))
  }
  const chunks = readPngText(bytes)
  const portable = chunks.get('eleckoi-card')
  if (portable) {
    return {
      packageData: decodePortablePackage(portable),
      sourceImage: bytes,
      complete: true,
      summary: 'ElecKoi 完整角色卡',
      regexRules: []
    }
  }
  const standard = chunks.get('chara')
  if (!standard) throw new Error('图片里没有角色卡数据')
  return { ...decodeStandardCard(parseEncodedJson(standard, '标准角色卡数据损坏')), sourceImage: bytes }
}

function decodeSillyTavern(bytes: Uint8Array): DecodedCharacterCard {
  if (!isPng(bytes)) {
    const text = new TextDecoder().decode(bytes).trim()
    if (!text.startsWith('{')) throw new Error('酒馆角色卡必须是 PNG 或 JSON 文件')
    return convertSillyTavernCard(parseJsonObject(text, '酒馆角色卡 JSON 已损坏'))
  }
  const chunks = readPngText(bytes)
  const encoded = chunks.get('ccv3')?.trim() || chunks.get('chara')?.trim()
  if (!encoded) throw new Error('图片里没有酒馆角色卡数据')
  return { ...convertSillyTavernCard(parseEncodedJson(encoded, '酒馆角色卡数据无法解码')), sourceImage: bytes }
}

function decodeStandardCard(root: JsonObject): DecodedCharacterCard {
  const data = record(root.data) ?? root
  const name = string(data.name).trim() || '导入角色'
  const opening = string(data.first_mes)
  const result: DecodedCharacterCard = {
    packageData: {
      character: portableCharacter({ name, opening, show_opening: !!opening }),
      assets: [], settingLibraryJson: '', variableConfigJson: ''
    },
    complete: false,
    summary: '标准角色卡',
    regexRules: []
  }
  return result
}

function convertSillyTavernCard(root: JsonObject): DecodedCharacterCard {
  const data = record(root.data)
  if (!data) throw new Error('酒馆角色卡缺少角色数据')
  const name = cleanString(data.name) || '未命名角色'
  const openings = [cleanString(data.first_mes), ...stringList(data.alternate_greetings)].map((item) => item.trim()).filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index)
  const worldBook = record(data.character_book)
  const extensions = record(data.extensions)
  const variableConversion = convertMvuVariables(extensions, worldBook, openings)
  const settingLibrary = convertedSettingLibrary(name, cleanString(data.description), openings, variableConversion.openingStates, worldBook)
  const regexRules = convertedRegexRules(extensions)
  const worldBookCount = settingLibrary.entries.filter((entry) => entry.id.startsWith('tavern-world-entry-')).length
  const result: DecodedCharacterCard = {
    packageData: {
      character: portableCharacter({
        name,
        opening: openings[0] ?? '',
        show_opening: openings.length > 0
      }),
      assets: [], settingLibraryJson: '', variableConfigJson: ''
    },
    complete: false,
    summary: `剧情小说模式 · 世界书 ${worldBookCount} · 开场白 ${openings.length} · 正则 ${regexRules.length} · 变量 ${variableConversion.config?.variables.length ?? 0}`,
    settingLibrary,
    regexRules
  }
  if (variableConversion.config) result.variableConfig = variableConversion.config
  return result
}

function convertedSettingLibrary(
  cardName: string,
  description: string,
  openings: string[],
  openingStates: string[],
  worldBook: JsonObject | undefined
): SettingLibrary {
  const timestamp = new Date().toISOString()
  const openingEntry: SettingLibraryEntry = {
    ...emptyEntry('fixed-opening-assistant', timestamp),
    title: 'AI角色开场白',
    iconId: 'chat',
    kind: 'opening',
    content: openings[0] ?? '',
    openingMessages: openings.map((content, index) => ({
      id: `tavern-opening-${index + 1}`,
      title: index === 0 ? '默认开场' : `备用开场 ${index}`,
      content,
      initialVariableStateJson: openingStates[index] ?? ''
    })),
    defaultOpeningMessageId: openings.length ? 'tavern-opening-1' : '',
    insertRole: 'assistant'
  }
  const groups: SettingLibraryGroup[] = []
  const entries: SettingLibraryEntry[] = [openingEntry]
  if (description) {
    groups.push(settingGroup('tavern-character-basics', '角色基础设定', 1, timestamp))
    entries.push({
      ...emptyEntry('tavern-character-description', timestamp),
      title: '角色描述',
      groupId: 'tavern-character-basics',
      content: description,
      agentSelectionHint: '酒馆角色卡中的角色基础描述',
      agentReadStrategy: 'required',
      triggerMode: 'agent_tool'
    })
  }
  const worldEntries = convertWorldBookEntries(worldBook, timestamp)
  if (worldEntries.length) {
    const requestedName = cleanString(worldBook?.name) || '酒馆世界书'
    const groupName = description && requestedName === '角色基础设定' ? '酒馆世界书' : requestedName
    groups.push(settingGroup('tavern-world-book', groupName, groups.length + 1, timestamp))
    entries.push(...worldEntries)
  }
  const versionId = `library-${randomUUID()}`
  return normalizeSettingLibrary('pending-character', {
    characterId: 'pending-character',
    name: cleanString(worldBook?.name) || `${cardName} 设定库`,
    entries,
    groups,
    promptPositions: [],
    activeVersionId: versionId,
    versions: [],
    listAllExpanded: true,
    expandedGroupIds: groups.map((group) => group.id)
  })
}

function convertWorldBookEntries(worldBook: JsonObject | undefined, timestamp: string): SettingLibraryEntry[] {
  const usedTitles = new Set<string>()
  const raw = worldBookEntries(worldBook).flatMap((item, index) => {
    const keys = stringList(item.keys ?? item.key).map((key) => key.trim()).filter(Boolean)
    const rawTitle = cleanString(item.name) || cleanString(item.comment) || keys[0] || `世界书条目 ${index + 1}`
    if (isMvuInfrastructureEntry(item, rawTitle)) return []
    return [{ item, index, keys, rawTitle, title: uniqueTitle(rawTitle, usedTitles), id: `tavern-world-entry-${randomUUID()}` }]
  })
  const byRawTitle = new Map<string, typeof raw>()
  for (const entry of raw) byRawTitle.set(entry.rawTitle, [...(byRawTitle.get(entry.rawTitle) ?? []), entry])
  const controllerResources = new Map<string, typeof raw>()
  for (const controller of raw.filter((entry) => isEjsController(string(entry.item.content)))) {
    const content = string(controller.item.content)
    const literalNames = [...content.matchAll(/getwi\s*\(\s*(?:(?:null|["'][^"']*["'])\s*,\s*)?(["'])([^"']+)\1/gi)]
      .map((match) => match[2]).filter((value): value is string => !!value)
    const callCount = [...content.matchAll(/getwi\s*\(/gi)].length
    const candidates = callCount > literalNames.length
      ? raw.filter((entry) => !isEjsController(string(entry.item.content)))
      : literalNames.flatMap((title) => byRawTitle.get(title)?.slice(0, 1) ?? [])
    controllerResources.set(controller.id, candidates.filter((entry, index, values) => values.findIndex((item) => item.id === entry.id) === index))
  }
  const materialIds = new Set([...controllerResources.values()].flat().map((entry) => entry.id))
  return raw.map(({ item, index, keys, title, id }) => {
    const content = string(item.content)
    if (isEjsController(content)) return {
      ...emptyEntry(id, timestamp), title, groupId: 'tavern-world-book', content,
      agentSelectionHint: '酒馆 EJS 动态控制器，渲染结果为 Agent 必读',
      agentReadStrategy: 'variable_condition', dynamicMode: 'ejs_controller', triggerMode: 'agent_tool',
      enabled: enabledFrom(item), order: index + 1, treeViewOrder: index + 1
    }
    if (materialIds.has(id)) return {
      ...emptyEntry(id, timestamp), title, groupId: 'tavern-world-book', content,
      agentSelectionHint: '供 EJS 控制器通过 getwi 读取的引用条目',
      agentReadStrategy: 'variable_condition', dynamicMode: 'ejs_reference', triggerMode: 'agent_tool',
      enabled: true, order: index + 1, treeViewOrder: index + 1
    }
    const constant = boolean(item.constant)
    const secondary = stringList(item.secondary_keys ?? item.keysecondary).map((key) => key.trim()).filter(Boolean)
    const selectiveLogic = integer(record(item.extensions)?.selectiveLogic)
    return {
      ...emptyEntry(id, timestamp), title, groupId: 'tavern-world-book', content,
      agentSelectionHint: constant ? '酒馆世界书常驻条目，Agent 必读' : '酒馆世界书关键词命中时读取',
      agentReadStrategy: constant ? 'required' : 'keyword',
      keywords: constant ? [] : keys,
      conditionKeywords: constant ? [] : secondary,
      keywordCondition: constant || !secondary.length ? 'none' : selectiveLogic === 2 ? 'not_any' : selectiveLogic === 3 ? 'all' : 'any',
      keywordUseRegex: !constant && boolean(item.use_regex),
      keywordIgnoreCase: !boolean(item.case_sensitive, boolean(record(item.extensions)?.case_sensitive)),
      keywordWholeWord: boolean(item.match_whole_words, boolean(record(item.extensions)?.match_whole_words)),
      triggerMode: 'agent_tool', enabled: enabledFrom(item), order: index + 1, treeViewOrder: index + 1
    }
  })
}

function convertedRegexRules(extensions: JsonObject | undefined): RegexRule[] {
  const scripts = extensions?.regex_scripts
  if (!Array.isArray(scripts) || !scripts.length) return []
  const decoded = decodeRegexDocuments([{
    displayName: '酒馆角色卡',
    json: JSON.stringify({ regex_scripts: scripts })
  }], 'Character')
  return decoded.rules.map(({ rule }) => rule)
    .filter((rule) => validateRegexRule(rule) === null)
    .map((rule, order) => ({ ...rule, order }))
}

function decodePortablePackage(encoded: string): PortableCharacterPackage {
  let expanded: Buffer
  try { expanded = gunzipSync(Buffer.from(encoded, 'base64'), { maxOutputLength: MAX_EXPANDED_BYTES }) }
  catch (error) { throw new Error('ElecKoi 角色卡数据损坏', { cause: error }) }
  const root = parseJsonObject(expanded.toString('utf8'), 'ElecKoi 角色卡数据损坏')
  if (root.format !== 'eleckoi.character-card') throw new Error('这不是 ElecKoi 角色卡')
  if (root.version !== 1) throw new Error('暂不支持这个角色卡版本')
  const character = portableCharacter(record(root.character) ?? {})
  const assets = objectList(root.assets).map((asset) => ({
    key: string(asset.key).slice(0, 80),
    mediaType: string(asset.media_type).slice(0, 80),
    bytes: decodeBase64(string(asset.data), '角色卡附件损坏')
  }))
  if (assets.reduce((total, asset) => total + asset.bytes.length, 0) > MAX_ATTACHMENTS_BYTES) throw new Error('角色附件总大小不能超过 48 MB')
  return {
    character,
    assets,
    settingLibraryJson: string(root.setting_library),
    variableConfigJson: string(root.variable_config)
  }
}

function portableCharacter(value: JsonObject): PortableCharacterPackage['character'] {
  const mode = string(value.character_mode) || 'story'
  return {
    name: (string(value.name) || '导入角色').slice(0, 120),
    group: string(value.group).slice(0, 40),
    characterMode: mode === 'agent' ? 'agent' : 'story',
    frontendBeautyEnabled: boolean(value.frontend_beauty_enabled),
    profileAge: string(value.profile_age), profileSex: string(value.profile_sex),
    profileHeight: string(value.profile_height), profileBirthday: string(value.profile_birthday),
    profileLike: string(value.profile_like), imagePrompt: string(value.image_prompt),
    opening: string(value.opening), showOpening: boolean(value.show_opening)
  }
}

function parseEncodedJson(value: string, message: string): JsonObject {
  const trimmed = value.trim()
  if (trimmed.startsWith('{')) return parseJsonObject(trimmed, message)
  try { return parseJsonObject(Buffer.from(trimmed, 'base64').toString('utf8'), message) }
  catch (error) { throw new Error(message, { cause: error }) }
}

function parseJsonObject(value: string, message: string): JsonObject {
  try {
    const parsed: unknown = JSON.parse(value)
    const result = record(parsed)
    if (!result) throw new Error(message)
    return result
  } catch (error) { throw new Error(message, { cause: error }) }
}

function decodeBase64(value: string, message: string): Uint8Array {
  try {
    const bytes = Buffer.from(value, 'base64')
    if (!bytes.length && value) throw new Error(message)
    return bytes
  } catch (error) { throw new Error(message, { cause: error }) }
}

function settingGroup(id: string, name: string, order: number, timestamp: string): SettingLibraryGroup {
  return { id, name, parentId: '', order, treeViewOrder: order, createdAt: timestamp, updatedAt: timestamp }
}

function worldBookEntries(worldBook: JsonObject | undefined): JsonObject[] {
  const entries = worldBook?.entries
  if (Array.isArray(entries)) return entries.map(record).filter((item): item is JsonObject => !!item)
  const values = record(entries)
  return values ? Object.keys(values).sort((a, b) => (Number(a) || Number.MAX_SAFE_INTEGER) - (Number(b) || Number.MAX_SAFE_INTEGER))
    .map((key) => record(values[key])).filter((item): item is JsonObject => !!item) : []
}

function uniqueTitle(requested: string, used: Set<string>): string {
  const base = requested.trim().slice(0, 120) || '未命名设定'
  if (!used.has(base.toLocaleLowerCase())) { used.add(base.toLocaleLowerCase()); return base }
  let suffix = 2
  while (used.has(`${base} (${suffix})`.slice(0, 120).toLocaleLowerCase())) suffix += 1
  const candidate = `${base} (${suffix})`.slice(0, 120)
  used.add(candidate.toLocaleLowerCase())
  return candidate
}

function isEjsController(content: string): boolean { return /<%[_=\-#]?/.test(content) }
function enabledFrom(item: JsonObject): boolean { return Object.hasOwn(item, 'enabled') ? boolean(item.enabled, true) : !boolean(item.disable) }
function cleanString(value: unknown): string { return value === null || value === undefined || value === 'null' ? '' : string(value) }
function record(value: unknown): JsonObject | undefined { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : undefined }
function objectList(value: unknown): JsonObject[] { return Array.isArray(value) ? value.map(record).filter((item): item is JsonObject => !!item) : [] }
function string(value: unknown): string { return typeof value === 'string' ? value : '' }
function stringList(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [] }
function boolean(value: unknown, fallback = false): boolean { return typeof value === 'boolean' ? value : fallback }
function integer(value: unknown, fallback = 0): number { return Number.isInteger(value) ? value as number : fallback }
