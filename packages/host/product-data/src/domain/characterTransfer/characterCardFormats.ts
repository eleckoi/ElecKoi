import { createCharacterOpenings, characterOpeningsSchema } from '@shared/contracts/characterOpenings/schemas'
import { tavernEntryScanDepth } from '@shared/foundation/tavernWorldBook'
import { gzipSync, gunzipSync } from 'node:zlib'
import { randomUUID } from 'node:crypto'
import type { RegexRule } from '@shared/contracts/regex/schemas'
import { regexRuleTargetSchema } from '@shared/contracts/regex/schemas'
import type { SettingLibrary, SettingLibraryEntry, SettingLibraryGroup } from '@shared/contracts/settingLibrary/schemas'
import { validateRegexRule } from '@shared/foundation/regex/RegexRuleProcessor'
import { decodeRegexDocuments } from '@shared/foundation/regexRuleTransfer'
import { emptyEntry, normalizeSettingLibrary } from '@product-data/domain/settingLibraries'
import { convertMvuVariables, type MvuVariableConversion } from './mvuImport'
import { decodePortableScriptLibrary } from '@product-data/domain/scripts'
import { isPng, readPngText } from '@product-data/storage/media/PngTextChunkCodec'
import type { DecodedCharacterCard, PortableCharacterPackage } from './characterTransferTypes'
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes'
import { DesktopError } from '@shared/foundation/DesktopError'

type JsonObject = Record<string, unknown>


export function decodeCharacterCard(bytes: Uint8Array, source: 'eleckoi' | 'sillytavern'): DecodedCharacterCard {
  return source === 'sillytavern' ? decodeSillyTavern(bytes) : decodeElecKoi(bytes)
}

function decodeElecKoi(bytes: Uint8Array): DecodedCharacterCard {
  if (!isPng(bytes)) {
    const text = new TextDecoder().decode(bytes).trim()
    if (!text.startsWith('{')) throw new DesktopError(ELECKOI_FAILURE_CODES.inputUnsupported, '无法识别这个角色卡', { what: '角色卡的格式' })
    const packageData = decodePortableRoot(parseJsonObject(text, 'ElecKoi 角色卡 JSON 已损坏'))
    return {
      packageData,
      complete: true,
      summary: 'ElecKoi 完整角色卡',
      regexRules: packageData.regexRules
    }
  }
  const chunks = readPngText(bytes)
  const portable = chunks.get('eleckoi-card')
  if (portable) {
    const packageData = decodePortablePackage(portable)
    return {
      packageData,
      sourceImage: bytes,
      complete: true,
      summary: 'ElecKoi 完整角色卡',
      regexRules: packageData.regexRules
    }
  }
  throw new DesktopError(ELECKOI_FAILURE_CODES.inputUnsupported, '图片里没有 ElecKoi 角色卡数据', { what: '图片里的 ElecKoi 角色卡数据' })
}

function decodeSillyTavern(bytes: Uint8Array): DecodedCharacterCard {
  if (!isPng(bytes)) {
    const text = new TextDecoder().decode(bytes).trim()
    if (!text.startsWith('{')) throw new DesktopError(ELECKOI_FAILURE_CODES.inputUnsupported, '酒馆角色卡必须是 PNG 或 JSON 文件', { what: '角色卡文件格式', expected: 'PNG 或 JSON' })
    return convertSillyTavernCard(parseJsonObject(text, '酒馆角色卡 JSON 已损坏'))
  }
  const chunks = readPngText(bytes)
  const encoded = chunks.get('ccv3')?.trim() || chunks.get('chara')?.trim()
  if (!encoded) throw new DesktopError(ELECKOI_FAILURE_CODES.inputUnsupported, '图片里没有酒馆角色卡数据', { what: '图片里的酒馆角色卡数据' })
  return { ...convertSillyTavernCard(parseEncodedJson(encoded, '酒馆角色卡数据无法解码')), sourceImage: bytes }
}

function convertSillyTavernCard(root: JsonObject): DecodedCharacterCard {
  const data = record(root.data)
  if (!data) throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, '酒馆角色卡缺少角色数据', { what: '酒馆角色卡的角色数据' })
  const name = cleanString(data.name) || '未命名角色'
  const openings = [cleanString(data.first_mes), ...stringList(data.alternate_greetings)].map((item) => item.trim()).filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index)
  const worldBook = record(data.character_book)
  const extensions = record(data.extensions)
  let variableConversion: MvuVariableConversion
  try { variableConversion = convertMvuVariables(extensions, worldBook, openings) }
  catch (error) {
    variableConversion = { openingVersionIds: [], consumedEntries: new Set(),
      warnings: [`变量配置未导入，原始初始化内容保留在设定和开场白中：${error instanceof Error ? error.message : String(error)}`] }
  }
  const settingLibrary = convertedSettingLibrary(name, cleanString(data.description), worldBook, variableConversion.consumedEntries)
  const regexRules = convertedRegexRules(extensions)
  const worldBookCount = settingLibrary.entries.filter((entry) => entry.id.startsWith('tavern-world-entry-')).length
  const result: DecodedCharacterCard = {
    packageData: {
      character: portableCharacter({
        name,
        profile_like: cleanString(data.creator_notes),
        opening: openings[0] ?? '',
        show_opening: openings.length > 0
      }),
      assets: [], settingLibraryJson: '', variableConfigJson: '', regexRules: []
    },
    complete: false,
    warnings: variableConversion.warnings,
    summary: `剧情小说模式 · 世界书 ${worldBookCount} · 开场白 ${openings.length} · 正则 ${regexRules.length} · 变量 ${variableConversion.config?.variables.length ?? 0}`,
    settingLibrary,
    regexRules
  }
  const openingConfig = createCharacterOpenings('pending-character', openings[0] ?? '', openings.length > 0)
  if (openings.length) {
    openingConfig.openingMessages = openings.map((content, index) => ({ id: `tavern-opening-${index + 1}`,
      title: index === 0 ? '默认开场' : `备用开场 ${index}`, content,
      variableVersionId: variableConversion.openingVersionIds[index] ?? '' }))
    openingConfig.defaultOpeningMessageId = openingConfig.openingMessages[0]!.id
  }
  result.openings = characterOpeningsSchema.parse(openingConfig)
  if (variableConversion.config) result.variableConfig = variableConversion.config
  return result
}

function convertedSettingLibrary(
  cardName: string,
  description: string,
  worldBook: JsonObject | undefined,
  consumedEntries: Set<JsonObject>
): SettingLibrary {
  const timestamp = new Date().toISOString()
  const groups: SettingLibraryGroup[] = []
  const entries: SettingLibraryEntry[] = []
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
  const worldEntries = convertWorldBookEntries(worldBook, timestamp, consumedEntries)
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

function convertWorldBookEntries(worldBook: JsonObject | undefined, timestamp: string, consumedEntries: Set<JsonObject>): SettingLibraryEntry[] {
  const usedTitles = new Set<string>()
  const raw = worldBookEntries(worldBook).flatMap((item, index) => {
    const keys = stringList(item.keys ?? item.key).map((key) => key.trim()).filter(Boolean)
    const rawTitle = cleanString(item.name) || cleanString(item.comment) || keys[0] || `世界书条目 ${index + 1}`
    if (consumedEntries.has(item)) return []
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
      agentReadStrategy: 'normal', dynamicMode: 'standard', contentMode: 'ejs', triggerMode: 'agent_tool',
      enabled: enabledFrom(item), order: index + 1, treeViewOrder: index + 1
    }
    if (materialIds.has(id)) return {
      ...emptyEntry(id, timestamp), title, groupId: 'tavern-world-book', content,
      agentSelectionHint: '供 EJS 控制器通过 getwi 读取的 EJS引用设定',
      agentReadStrategy: 'normal', dynamicMode: 'ejs_reference', triggerMode: 'agent_tool',
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
      keywordScanDepth: tavernEntryScanDepth(item, worldBook),
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
  if (decoded.failedFileNames.length) throw new DesktopError(ELECKOI_FAILURE_CODES.inputUnsupported, '角色卡正则包含不支持的应用目标或无效格式，未导入。', { what: '角色卡正则的应用目标或格式' })
  return decoded.rules.map(({ rule }) => rule)
    .filter((rule) => validateRegexRule(rule) === null)
    .map((rule, order) => ({ ...rule, order }))
}

export function encodeCharacterCardJson(value: PortableCharacterPackage): string {
  return JSON.stringify(portableRoot(value), null, 2)
}

export function encodePortableCharacterPayload(value: PortableCharacterPackage): string {
  return gzipSync(Buffer.from(encodeCharacterCardJson(value), 'utf8')).toString('base64')
}

export function decodePortablePackage(encoded: string): PortableCharacterPackage {
  let expanded: Buffer
  try { expanded = gunzipSync(Buffer.from(encoded, 'base64')) }
  catch (error) { throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, 'ElecKoi 角色卡数据损坏', { what: 'ElecKoi 角色卡数据' }) }
  const root = parseJsonObject(expanded.toString('utf8'), 'ElecKoi 角色卡数据损坏')
  return decodePortableRoot(root)
}

function decodePortableRoot(root: JsonObject): PortableCharacterPackage {
  if (root.format !== 'eleckoi.character-card') throw new DesktopError(ELECKOI_FAILURE_CODES.inputUnsupported, '这不是 ElecKoi 角色卡', { what: '角色卡格式' })
  if (root.version !== 1 && root.version !== 2) throw new DesktopError(ELECKOI_FAILURE_CODES.inputUnsupported, '暂不支持这个角色卡版本', { what: '角色卡版本', expected: '1 / 2' })
  if (root.version === 2 && (typeof root.character_openings !== 'string' || !root.character_openings)) {
    throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, 'v2 角色卡缺少独立开场白。', { what: '角色卡的独立开场白' })
  }
  const character = portableCharacter(record(root.character) ?? {})
  const assets = objectList(root.assets).map((asset) => ({
    key: string(asset.key),
    mediaType: string(asset.media_type),
    bytes: decodeBase64(string(asset.data), '角色卡附件损坏')
  }))
  return {
    character,
    assets,
    ...(root.character_openings === undefined ? {} : { characterOpeningsJson: string(root.character_openings) }),
    settingLibraryJson: string(root.setting_library),
    variableConfigJson: string(root.variable_config),
    regexRules: decodePortableRegexRules(root.regex_rules),
    ...(root.script_library === undefined ? {} : { scriptLibrary: decodePortableScriptLibrary(root.script_library) }),
  }
}

function portableRoot(value: PortableCharacterPackage): JsonObject {
  return {
    format: 'eleckoi.character-card',
    version: value.characterOpeningsJson ? 2 : 1,
    ...(value.characterOpeningsJson ? { character_openings: value.characterOpeningsJson } : {}),
    character: {
      name: value.character.name,
      frontend_beauty_enabled: value.character.frontendBeautyEnabled,
      profile_age: value.character.profileAge,
      profile_sex: value.character.profileSex,
      profile_height: value.character.profileHeight,
      profile_birthday: value.character.profileBirthday,
      profile_like: value.character.profileLike,
      image_prompt: value.character.imagePrompt,
      opening: value.character.opening,
      show_opening: value.character.showOpening
    },
    assets: value.assets.map((asset) => ({
      key: asset.key,
      media_type: asset.mediaType,
      data: Buffer.from(asset.bytes).toString('base64')
    })),
    setting_library: value.settingLibraryJson,
    variable_config: value.variableConfigJson,
    ...(value.scriptLibrary ? { script_library: {
      trees: value.scriptLibrary.trees, variables: value.scriptLibrary.variables, enabled: value.scriptLibrary.enabled,
      files: value.scriptLibrary.files ?? []
    } } : {}),
    regex_rules: value.regexRules.map((rule) => ({
      id: rule.id,
      name: rule.name,
      pattern: rule.pattern,
      replacement: rule.replacement,
      targets: rule.targets,
      enabled: rule.enabled,
      display_only: rule.displayOnly,
      prompt_only: rule.promptOnly,
      run_on_edit: rule.runOnEdit,
      trim_strings: rule.trimStrings ?? [],
      min_depth: rule.minDepth ?? null,
      max_depth: rule.maxDepth ?? null,
      substitute_regex: rule.substituteRegex ?? 0,
      order: rule.order
    }))
  }
}

function decodePortableRegexRules(value: unknown): RegexRule[] {
  return objectList(value).map((source, index) => {
    const rule: RegexRule = {
      id: string(source.id).trim() || `regex-${randomUUID()}`,
      name: string(source.name),
      pattern: string(source.pattern),
      replacement: string(source.replacement),
      targets: regexRuleTargetSchema.array().parse(stringList(source.targets)),
      enabled: boolean(source.enabled, true),
      displayOnly: boolean(source.display_only),
      promptOnly: boolean(source.prompt_only),
      runOnEdit: boolean(source.run_on_edit),
      trimStrings: stringList(source.trim_strings),
      minDepth: source.min_depth == null ? null : integer(source.min_depth, 0),
      maxDepth: source.max_depth == null ? null : integer(source.max_depth, 0),
      substituteRegex: source.substitute_regex === 1 ? 1 : source.substitute_regex === 2 ? 2 : 0,
      order: Math.max(0, integer(source.order, index))
    }
    const validationMessage = validateRegexRule(rule)
    if (validationMessage) throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, `角色卡正则“${rule.name || rule.id}”无效：${validationMessage}`, { field: 'regexRules' })
    return rule
  }).sort((left, right) => left.order - right.order)
}

function portableCharacter(value: JsonObject): PortableCharacterPackage['character'] {
  return {
    name: string(value.name) || '导入角色',
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
  catch { throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, message, { what: '角色卡数据' }) }
}

function parseJsonObject(value: string, message: string): JsonObject {
  try {
    const parsed: unknown = JSON.parse(value)
    const result = record(parsed)
    if (!result) throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, message, { what: '角色卡数据' })
    return result
  } catch { throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, message, { what: '角色卡数据' }) }
}

function decodeBase64(value: string, message: string): Uint8Array {
  try {
    const bytes = Buffer.from(value, 'base64')
    if (!bytes.length && value) throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, message, { what: '角色卡数据' })
    return bytes
  } catch { throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, message, { what: '角色卡数据' }) }
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
  const base = requested.trim() || '未命名设定'
  if (!used.has(base.toLocaleLowerCase())) { used.add(base.toLocaleLowerCase()); return base }
  let suffix = 2
  while (used.has(`${base} (${suffix})`.toLocaleLowerCase())) suffix += 1
  const candidate = `${base} (${suffix})`
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
