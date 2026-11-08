import { autoIllustrationSchema, AUTO_ILLUSTRATION_PLUGIN } from '@shared/contracts/presets/autoIllustration'
import { upgradeAutoIllustrationConfiguration } from './autoIllustrationUpgrade'
import { randomUUID } from 'node:crypto'
import { agentToolGroups } from '@product-data/domain/agentTools'
import { pluginToolGroupSchema, portablePluginToolGroups } from '@shared/contracts/agent/tools'
import { isPng, readPngText, writePngTextOnly } from '@product-data/storage/media/PngTextChunkCodec'
import { decodeRegexDocuments } from '@shared/foundation/regexRuleTransfer'
import { normalizeAgentPresetPrompts } from '@shared/contracts/presets/builtIns'
import { agentPresetPurposeSchema } from '@shared/contracts/presets/schemas'
import { creatorPresetEntrySchema } from '@shared/contracts/presets/creatorPrompts'
import { upgradeLegacyCreatorPrompt } from '@shared/foundation/legacyCreatorPrompts'
import { defaultRoleplayPlanSettings, roleplayPlanSettingsSchema } from '@shared/contracts/presets/roleplayPlan'
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes'
import { DesktopError } from '@shared/foundation/DesktopError'
import { decodePortableScriptLibrary, type PortableScriptLibrary } from '@product-data/domain/scripts'
import type {
  AgentPreset,
  AgentPresetImportDocument,
  AgentPresetImportSource,
  AgentPresetPurpose
} from '@shared/contracts/presets/schemas'
import type {
  SettingLibraryEntry,
  SettingLibraryGroup,
  SettingLibraryPromptPosition
} from '@shared/contracts/settingLibrary/schemas'

type JsonObject = Record<string, unknown>

const ELECKOI_FORMAT = 'eleckoi.agent-preset'
const ELECKOI_FORMAT_VERSION = 3
const ELECKOI_PNG_PRESET_KEY = 'eleckoi_agent_preset'
const SILLY_TAVERN_GLOBAL_PROMPT_ORDER_ID = '100001'
const SILLY_TAVERN_PROMPT_GROUP_ID = 'tavern-preset-prompts'
const FALLBACK_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
const avatarMediaTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

const modelFamilies = new Set<AgentPreset['modelFamily']>(['general', 'claude', 'openai', 'gemini', 'deepseek', 'other'])
const entryKinds = new Set<SettingLibraryEntry['kind']>(['normal', 'opening', 'history_compaction', 'hidden_tool_timeline'])
const readStrategies = new Set<SettingLibraryEntry['agentReadStrategy']>(['required', 'keyword', 'normal'])
const dynamicModes = new Set<SettingLibraryEntry['dynamicMode']>(['standard', 'ejs_reference'])
const contentModes = new Set<SettingLibraryEntry['contentMode']>(['plain_text', 'ejs'])
const keywordConditions = new Set<SettingLibraryEntry['keywordCondition']>(['none', 'any', 'all', 'not_any'])
const positions = new Set<NonNullable<SettingLibraryEntry['position']>>([
  'instructions', 'insert_point_1', 'insert_point_2', 'insert_point_3', 'insert_point_4', 'insert_point_5'
])
export interface DecodedAgentPresetImport {
  scriptLibrary?: PortableScriptLibrary
  preset: AgentPreset
  source: AgentPresetImportSource
  skippedUnsupportedEntries: number
  skippedDepthRegexCount: number
  authorAvatarBase64?: string
  authorAvatarMediaType?: string
  versions: AgentPresetTransferVersion[]
}

export interface AgentPresetTransferAvatar {
  mediaType: string
  base64: string
}

export interface AgentPresetTransferContent {
  usageInstructions: AgentPreset['profile']['usageInstructions']
  timeline: AgentPreset['profile']['timeline']
  entries: AgentPreset['entries']
  groups: AgentPreset['groups']
  promptPositions: AgentPreset['promptPositions']
  toolGroups: AgentPreset['toolGroups']
  subagentModelSelection?: AgentPreset['subagentModelSelection']
  toolModelConfigIds?: AgentPreset['toolModelConfigIds']
  autoIllustration?: AgentPreset['autoIllustration']
  roleplayPlan: AgentPreset['roleplayPlan']
  regexRules: AgentPreset['regexRules']
  expandedGroupIds: AgentPreset['expandedGroupIds']
}

export interface AgentPresetTransferVersion extends AgentPresetTransferContent {
  id: string
  number: number
  name: string
  createdAtEpochMs: number
}

export interface AgentPresetEncodeOptions {
  scriptLibrary?: PortableScriptLibrary
  authorAvatar?: AgentPresetTransferAvatar
  versions?: AgentPresetTransferVersion[]
}

export function decodeAgentPresetImport(
  document: AgentPresetImportDocument,
  source: AgentPresetImportSource,
  purpose: AgentPresetPurpose = 'roleplay'
): DecodedAgentPresetImport {
  agentPresetPurposeSchema.parse(purpose)
  const bytes = decodeInput(document.base64)
  if (source === 'sillytavern') {
    if (isPng(bytes)) throw new DesktopError(ELECKOI_FAILURE_CODES.inputUnsupported, '酒馆预设请选择 JSON 文件。', { what: '酒馆预设的文件格式', expected: 'JSON' })
    return decodeSillyTavern(document, parseRoot(new TextDecoder().decode(bytes), '酒馆预设'), purpose)
  }
  return decodeElecKoi(document, bytes, purpose)
}

export function encodeElecKoiAgentPreset(preset: AgentPreset, options: AgentPresetEncodeOptions = {}): string {
  const content = contentToPortable({
    usageInstructions: preset.profile.usageInstructions,
    timeline: preset.profile.timeline,
    entries: preset.entries,
    groups: preset.groups,
    promptPositions: preset.promptPositions,
    toolGroups: preset.toolGroups,
    ...(preset.subagentModelSelection ? { subagentModelSelection: preset.subagentModelSelection } : {}),
    ...(preset.toolModelConfigIds ? { toolModelConfigIds: preset.toolModelConfigIds } : {}),
    ...(preset.autoIllustration ? { autoIllustration: preset.autoIllustration } : {}),
    roleplayPlan: preset.roleplayPlan,
    regexRules: preset.regexRules,
    expandedGroupIds: preset.expandedGroupIds
  })
  return JSON.stringify({
    format: ELECKOI_FORMAT,
    version: ELECKOI_FORMAT_VERSION,
    preset: {
      name: preset.name,
      purpose: preset.purpose,
      model_family: preset.modelFamily,
      model_tags: preset.modelTags.map((tag) => ({ id: tag.id, label: tag.label, provider_id: tag.providerId })),
      profile: {
        author_name: preset.profile.authorName,
        usage_instructions: preset.profile.usageInstructions,
        timeline: preset.profile.timeline.map((item) => ({
          id: item.id, title: item.title, date_label: item.dateLabel, note: item.note
        })),
        ...(options.authorAvatar ? {
          author_avatar: { media_type: options.authorAvatar.mediaType, data: options.authorAvatar.base64 }
        } : {})
      },
      active_version_id: preset.activeVersionId,
      active_version_number: preset.activeVersionNumber,
      ...(options.scriptLibrary ? { script_library: {
        trees: options.scriptLibrary.trees, variables: options.scriptLibrary.variables, enabled: options.scriptLibrary.enabled,
        files: options.scriptLibrary.files ?? []
      } } : {}),
      ...content,
      versions: (options.versions ?? []).map((version) => ({
        id: version.id,
        number: version.number,
        name: version.name,
        created_at_epoch_ms: version.createdAtEpochMs,
        usage_instructions: version.usageInstructions,
        timeline: timelineToPortable(version.timeline),
        ...contentToPortable(version)
      }))
    }
  }, null, 2)
}

export function encodeElecKoiAgentPresetPng(json: string, coverPng?: Uint8Array): Uint8Array {
  const cover = coverPng && isPng(coverPng) ? coverPng : FALLBACK_PNG
  return writePngTextOnly(cover, new Map([
    [ELECKOI_PNG_PRESET_KEY, Buffer.from(json, 'utf8').toString('base64')]
  ]))
}

function decodeElecKoi(document: AgentPresetImportDocument, bytes: Uint8Array, purpose: AgentPresetPurpose): DecodedAgentPresetImport {
  let json: string
  let authorAvatarBase64: string | undefined
  if (isPng(bytes)) {
    const chunks = readPngText(bytes)
    const encoded = chunks.get(ELECKOI_PNG_PRESET_KEY)
    if (!encoded) throw new DesktopError(ELECKOI_FAILURE_CODES.inputUnsupported, '图片里没有 ElecKoi 预设数据。', { what: '图片里的 ElecKoi 预设数据' })
    json = Buffer.from(encoded, 'base64').toString('utf8')
  } else {
    json = new TextDecoder().decode(bytes)
  }
  const root = parseRoot(json, 'ElecKoi 预设')
  // RETIRE WHEN: 停止导入预设 v1 后删除白名单中的 1 和无需 purpose 的分支；
  // 停止导入 v1/v2 后另删下方创作提示词转换和专用旧文件回归，保留当前 v3。
  if (root.format !== ELECKOI_FORMAT || ![1, 2, ELECKOI_FORMAT_VERSION].includes(integerValue(root.version, -1))) {
    throw new DesktopError(ELECKOI_FAILURE_CODES.inputUnsupported, '这不是当前版本的 ElecKoi 预设文件。', { what: 'ElecKoi 预设文件版本', expected: String(ELECKOI_FORMAT_VERSION) })
  }
  const value = objectValue(root.preset)
  if (!value) throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, 'ElecKoi 预设缺少 preset 数据。', { what: 'ElecKoi 预设的 preset 数据', path: 'preset' })
  if (root.version !== 1 && agentPresetPurposeSchema.parse(value.purpose) !== purpose) {
    throw new DesktopError(ELECKOI_FAILURE_CODES.stateMismatch, '预设文件用途与当前分类不同，请切换到对应的预设分类后导入。', { what: '预设文件的用途' })
  }
  const timestamp = new Date().toISOString()
  const familyValue = stringValue(value.model_family) as AgentPreset['modelFamily']
  const modelFamily = modelFamilies.has(familyValue) ? familyValue : 'general'
  const tags = objectList(value.model_tags).flatMap((tag) => {
    const id = stringValue(tag.id).trim().toLocaleLowerCase()
    const label = stringValue(tag.label).trim()
    return id && label ? [{ id, label, providerId: stringValue(tag.provider_id).trim() }] : []
  })
  const profile = objectValue(value.profile)
  const embeddedAvatar = objectValue(profile?.author_avatar)
  if (embeddedAvatar) {
    authorAvatarBase64 = stringValue(embeddedAvatar.data).trim()
    validateEmbeddedAvatar(authorAvatarBase64)
  }
  const authorAvatarMediaType = embeddedAvatar
    ? validateAvatarMediaType(stringValue(embeddedAvatar.media_type))
    : authorAvatarBase64 ? 'image/png' : undefined
  const legacyCreator = purpose === 'creator' && root.version !== ELECKOI_FORMAT_VERSION
  const content = contentFromPortable(value, profile, document.displayName, timestamp, purpose, legacyCreator)
  const activeVersionId = stringValue(value.active_version_id) || 'import:v1'
  const activeVersionNumber = Math.max(1, integerValue(value.active_version_number, 1))
  const versions = objectList(value.versions).map((version, index) => ({
    id: stringValue(version.id) || `import:v${index + 1}`,
    number: Math.max(1, integerValue(version.number, index + 1)),
    name: stringValue(version.name).trim() || stringValue(value.name).trim() || suggestedName(document.displayName),
    createdAtEpochMs: Math.max(0, integerValue(version.created_at_epoch_ms, Date.now())),
    ...contentFromPortable(version, version, document.displayName, timestamp, purpose, legacyCreator)
  }))
  return {
    source: 'eleckoi',
    ...(value.script_library === undefined ? {} : { scriptLibrary: decodePortableScriptLibrary(value.script_library) }),
    ...(authorAvatarBase64 ? { authorAvatarBase64 } : {}),
    ...(authorAvatarMediaType ? { authorAvatarMediaType } : {}),
    versions,
    skippedUnsupportedEntries: 0,
    skippedDepthRegexCount: 0,
    preset: {
      id: `agent-preset-import-${randomUUID()}`,
      purpose,
      name: stringValue(value.name).trim() || suggestedName(document.displayName),
      modelFamily,
      modelTags: tags.length ? tags : [{ id: modelFamily, label: modelFamily === 'general' ? '通用' : modelFamily, providerId: '' }],
      libraryGroupId: '', activeVersionId, activeVersionNumber,
      profile: {
        authorName: stringValue(profile?.author_name), authorAvatarPath: '',
        usageInstructions: content.usageInstructions,
        timeline: content.timeline
      },
      entries: content.entries,
      groups: content.groups,
      promptPositions: content.promptPositions,
      toolGroups: content.toolGroups,
      ...(content.subagentModelSelection ? { subagentModelSelection: content.subagentModelSelection } : {}),
      ...(content.toolModelConfigIds ? { toolModelConfigIds: content.toolModelConfigIds } : {}),
      ...(content.autoIllustration ? { autoIllustration: content.autoIllustration } : {}),
      roleplayPlan: content.roleplayPlan,
      regexRules: content.regexRules,
      expandedGroupIds: content.expandedGroupIds
    }
  }
}

function decodeSillyTavern(document: AgentPresetImportDocument, root: JsonObject, purpose: AgentPresetPurpose): DecodedAgentPresetImport {
  const definitions = new Map<string, JsonObject>()
  for (const prompt of objectList(root.prompts)) {
    const identifier = stringValue(prompt.identifier).trim()
    if (identifier) definitions.set(identifier, prompt)
  }
  if (!definitions.size) throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, '酒馆预设没有 prompts 条目。', { what: '酒馆预设的 prompts 条目', path: 'prompts' })
  const promptOrder = objectList(root.prompt_order)
    .find((item) => String(item.character_id) === SILLY_TAVERN_GLOBAL_PROMPT_ORDER_ID)
  if (!promptOrder || !Array.isArray(promptOrder.order)) {
    throw new DesktopError(ELECKOI_FAILURE_CODES.lookupNotFound, '找不到酒馆预设外层条目顺序（100001）。', { what: '酒馆预设外层条目顺序' })
  }
  const timestamp = new Date().toISOString()
  const usedTitles = new Set<string>()
  const entries: SettingLibraryEntry[] = []
  let skippedUnsupportedEntries = 0
  promptOrder.order.forEach((candidate, orderIndex) => {
    const orderEntry = objectValue(candidate)
    const prompt = orderEntry ? definitions.get(stringValue(orderEntry.identifier).trim()) : undefined
    if (!prompt || booleanValue(prompt.marker)) {
      skippedUnsupportedEntries += 1
      return
    }
    entries.push({
      ...emptyEntry(`tavern-preset-entry-${orderIndex + 1}`, timestamp),
      title: uniqueTitle(stringValue(prompt.name) || `提示词 ${orderIndex + 1}`, usedTitles),
      groupId: SILLY_TAVERN_PROMPT_GROUP_ID,
      content: stringValue(prompt.content),
      agentSelectionHint: '酒馆预设常驻条目，Agent 必读',
      agentReadStrategy: 'required', triggerMode: 'agent_tool',
      enabled: booleanValue(orderEntry?.enabled, true), insertRole: insertRole(prompt.role),
      order: orderIndex + 1, viewOrder: orderIndex + 1, groupViewOrder: 1, treeViewOrder: orderIndex + 1
    })
  })
  if (!entries.length) throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, '酒馆预设外层列表没有可导入的提示词。', { what: '酒馆预设外层列表的可导入提示词', path: 'prompt_order.order' })
  const extensionScripts = objectValue(root.extensions)?.regex_scripts
  const rawScripts = Array.isArray(extensionScripts)
    ? extensionScripts
    : Array.isArray(root.regex_scripts) ? root.regex_scripts : []
  let skippedDepthRegexCount = 0
  const supportedScripts = rawScripts.filter((candidate) => {
    const rule = objectValue(candidate)
    if (!rule) return false
    if (!hasUnsupportedRegexDepth(rule)) return true
    skippedDepthRegexCount += 1
    return false
  })
  const decodedRegex = decodeRegexDocuments([{
    displayName: document.displayName,
    json: JSON.stringify({ regex_scripts: supportedScripts })
  }], 'AgentPreset')
  if (decodedRegex.failedFileNames.length) throw new DesktopError(ELECKOI_FAILURE_CODES.inputUnsupported, '预设正则包含不支持的应用目标或无效格式，未导入。', { what: '预设正则的应用目标或格式' })
  const regexRules = decodedRegex.rules.map(({ rule }) => rule)
  return {
    source: 'sillytavern', skippedUnsupportedEntries, skippedDepthRegexCount, versions: [],
    preset: {
      id: `agent-preset-import-${randomUUID()}`,
      purpose,
      name: stringValue(root.name).trim() || suggestedName(document.displayName),
      modelFamily: 'general', modelTags: [{ id: 'general', label: '通用', providerId: '' }],
      libraryGroupId: '', activeVersionId: 'import:v1', activeVersionNumber: 1,
      profile: { authorName: '', authorAvatarPath: '', usageInstructions: '', timeline: [] },
      entries: normalizeAgentPresetPrompts(entries, [], purpose).entries,
      groups: [{
        id: SILLY_TAVERN_PROMPT_GROUP_ID, name: '酒馆提示词', parentId: '', order: 1,
        treeViewOrder: 1, createdAt: timestamp, updatedAt: timestamp
      }],
      promptPositions: [], toolGroups: agentToolGroups(),
      roleplayPlan: defaultRoleplayPlanSettings(), regexRules,
      expandedGroupIds: [SILLY_TAVERN_PROMPT_GROUP_ID]
    }
  }
}

function contentToPortable(content: AgentPresetTransferContent): JsonObject {
  return {
    plugin_configuration: { [AUTO_ILLUSTRATION_PLUGIN]: content.autoIllustration ?? { enabled: false, modelConfigId: '' } },
    entries: content.entries.map(entryToPortable),
    groups: content.groups.map((group) => ({
      id: group.id, name: group.name, parent_id: group.parentId, order: group.order,
      tree_view_order: group.treeViewOrder, created_at: group.createdAt, updated_at: group.updatedAt
    })),
    regex_rules: content.regexRules.map((rule) => ({
      id: rule.id, name: rule.name, pattern: rule.pattern, replacement: rule.replacement,
      targets: rule.targets, enabled: rule.enabled, display_only: rule.displayOnly,
      prompt_only: rule.promptOnly, run_on_edit: rule.runOnEdit, order: rule.order,
      trim_strings: rule.trimStrings ?? [], min_depth: rule.minDepth ?? null,
      max_depth: rule.maxDepth ?? null, substitute_regex: rule.substituteRegex ?? 0
    })),
    prompt_positions: content.promptPositions.map((position) => ({
      id: position.id, name: position.name, anchor: position.anchor, side: position.side, order: position.order,
      created_at: position.createdAt, updated_at: position.updatedAt
    })),
    tool_configuration: {
      included_group_ids: content.toolGroups.filter((group) => group.included).map((group) => group.id),
      enabled_group_ids: content.toolGroups.filter((group) => group.included && group.enabled).map((group) => group.id),
      ...(content.toolGroups.some(group => group.source === 'extension') ? { plugin_tools: portablePluginToolGroups(content.toolGroups) } : {}),
      ...(content.subagentModelSelection?.configId || content.subagentModelSelection?.model ? { subagent_model_selection: content.subagentModelSelection } : {}),
      ...(content.toolModelConfigIds && Object.keys(content.toolModelConfigIds).length ? { tool_model_config_ids: content.toolModelConfigIds } : {})
    },
    roleplay_plan: content.roleplayPlan,
    expanded_group_ids: content.expandedGroupIds
  }
}

function contentFromPortable(
  value: JsonObject,
  profile: JsonObject | undefined,
  displayName: string,
  timestamp: string,
  purpose: AgentPresetPurpose,
  legacyCreator = false
): AgentPresetTransferContent {
  const groups = objectList(value.groups).map((group, index) => groupFromPortable(group, index, timestamp))
  const promptPositions = objectList(value.prompt_positions)
    .map((position, index) => positionFromPortable(position, index, timestamp))
  const decodedRegex = decodeRegexDocuments([{
    displayName,
    json: JSON.stringify({ rules: Array.isArray(value.regex_rules) ? value.regex_rules : [] })
  }], 'AgentPreset')
  if (decodedRegex.failedFileNames.length) throw new DesktopError(ELECKOI_FAILURE_CODES.inputUnsupported, '预设正则包含不支持的应用目标或无效格式，未导入。', { what: '预设正则的应用目标或格式' })
  const regexRules = decodedRegex.rules.map(({ rule }) => rule)
  const roleplayPlan = roleplayPlanSettingsSchema.safeParse(value.roleplay_plan)
  const toolConfiguration = objectValue(value.tool_configuration)
  const includedGroupIds = new Set(stringList(toolConfiguration?.included_group_ids))
  const enabledGroupIds = new Set(stringList(toolConfiguration?.enabled_group_ids))
  const builtInToolGroups = toolConfiguration
    ? agentToolGroups(enabledGroupIds).map((group) => ({
      ...group,
      included: includedGroupIds.has(group.id),
      enabled: includedGroupIds.has(group.id) && enabledGroupIds.has(group.id)
    }))
    : agentToolGroups()
  const pluginTools = pluginToolGroupSchema.array().parse(toolConfiguration?.plugin_tools ?? [])
  const toolGroups = [...builtInToolGroups, ...portablePluginToolGroups(pluginTools)]
  return {
    usageInstructions: stringValue(profile?.usage_instructions),
    timeline: timelineFromPortable(profile?.timeline),
    entries: normalizeAgentPresetPrompts(objectList(value.entries)
      .map((entry, index) => entryFromPortable(entry, index, timestamp))
      // RETIRE WHEN: 停止导入 ElecKoi 预设 v1/v2 后删除转换分支、参数和专用回归；
      // 共用转换器还须等待 schema v15 数据库升级退役，当前 creator 校验始终保留。
      .map(entry => legacyCreator ? upgradeLegacyCreatorPrompt(entry) : entry), promptPositions, purpose).entries
      .map(entry => purpose === 'creator' ? creatorPresetEntrySchema.parse(entry) : entry),
    groups,
    promptPositions,
    toolGroups,
    ...(toolConfiguration?.subagent_model_selection ? { subagentModelSelection: toolConfiguration.subagent_model_selection as AgentPreset['subagentModelSelection'] } : {}),
    ...illustrationFromPortable(value, toolConfiguration),
    roleplayPlan: roleplayPlan.success ? roleplayPlan.data : defaultRoleplayPlanSettings(),
    regexRules,
    expandedGroupIds: stringList(value.expanded_group_ids)
  }
}

function timelineToPortable(timeline: AgentPreset['profile']['timeline']): JsonObject[] {
  return timeline.map((item) => ({
    id: item.id, title: item.title, date_label: item.dateLabel, note: item.note
  }))
}

function timelineFromPortable(value: unknown): AgentPreset['profile']['timeline'] {
  return objectList(value).flatMap((item, index) => {
    const title = stringValue(item.title).trim()
    return title ? [{
      id: stringValue(item.id) || `timeline-${index + 1}`,
      title, dateLabel: stringValue(item.date_label), note: stringValue(item.note)
    }] : []
  })
}

function entryFromPortable(value: JsonObject, index: number, timestamp: string): SettingLibraryEntry {
  const kind = stringValue(value.kind) as SettingLibraryEntry['kind']
  if (!entryKinds.has(kind)) throw new DesktopError(ELECKOI_FAILURE_CODES.inputUnsupported, `ElecKoi 预设包含不支持的设定类型：${kind || '空值'}。`, { what: '预设条目的设定类型', expected: 'normal / opening / history_compaction / hidden_tool_timeline' })
  const strategy = stringValue(value.agent_read_strategy) as SettingLibraryEntry['agentReadStrategy']
  const dynamic = stringValue(value.dynamic_mode) as SettingLibraryEntry['dynamicMode']
  const contentMode = stringValue(value.content_mode) as SettingLibraryEntry['contentMode']
  const condition = stringValue(value.keyword_condition) as SettingLibraryEntry['keywordCondition']
  const trigger = stringValue(value.trigger_mode)
  const position = stringValue(value.position) as NonNullable<SettingLibraryEntry['position']>
  return {
    ...emptyEntry(stringValue(value.id) || `import-entry-${index + 1}`, timestamp),
    title: stringValue(value.title), iconId: stringValue(value.icon_id),
    kind, groupId: stringValue(value.group_id), content: stringValue(value.content),
    openingMessages: objectList(value.opening_messages).map((message, messageIndex) => ({
      id: stringValue(message.id) || `opening-${index + 1}-${messageIndex + 1}`,
      title: stringValue(message.title), content: stringValue(message.content),
    })),
    defaultOpeningMessageId: stringValue(value.default_opening_message_id),
    agentSelectionHint: stringValue(value.agent_selection_hint),
    agentReadStrategy: readStrategies.has(strategy) ? strategy : 'normal',
    dynamicMode: dynamicModes.has(dynamic) ? dynamic : 'standard',
    contentMode: contentModes.has(contentMode) ? contentMode : 'plain_text',
    keywords: stringList(value.keywords), keywordScanDepth: Math.max(0, integerValue(value.keyword_scan_depth, 1)),
    conditionKeywords: stringList(value.condition_keywords),
    keywordCondition: keywordConditions.has(condition) ? condition : 'none',
    keywordUseRegex: booleanValue(value.keyword_use_regex), keywordIgnoreCase: booleanValue(value.keyword_ignore_case, true),
    keywordWholeWord: booleanValue(value.keyword_whole_word), keywordRecursionDepth: Math.max(0, integerValue(value.keyword_recursion_depth)),
    triggerMode: trigger === 'always' || trigger === 'agent_tool' ? trigger : null,
    enabled: booleanValue(value.enabled, true), position: positions.has(position) ? position : null,
    promptPositionId: stringValue(value.prompt_position_id), insertRole: insertRole(value.insert_role),
    order: Math.max(1, integerValue(value.order, index + 1)), viewOrder: integerValue(value.view_order, index + 1),
    groupViewOrder: integerValue(value.group_view_order), treeViewOrder: integerValue(value.tree_view_order, index + 1),
    createdAt: stringValue(value.created_at) || timestamp, updatedAt: stringValue(value.updated_at) || timestamp
  }
}

function entryToPortable(entry: SettingLibraryEntry): JsonObject {
  return {
    id: entry.id, title: entry.title, icon_id: entry.iconId, kind: entry.kind, group_id: entry.groupId,
    content: entry.content,
    opening_messages: entry.openingMessages.map((message) => ({
      id: message.id, title: message.title, content: message.content,
    })),
    default_opening_message_id: entry.defaultOpeningMessageId,
    agent_selection_hint: entry.agentSelectionHint, agent_read_strategy: entry.agentReadStrategy,
    dynamic_mode: entry.dynamicMode,
    content_mode: entry.contentMode,
    keywords: entry.keywords, keyword_scan_depth: entry.keywordScanDepth,
    condition_keywords: entry.conditionKeywords, keyword_condition: entry.keywordCondition,
    keyword_use_regex: entry.keywordUseRegex, keyword_ignore_case: entry.keywordIgnoreCase,
    keyword_whole_word: entry.keywordWholeWord, keyword_recursion_depth: entry.keywordRecursionDepth,
    trigger_mode: entry.triggerMode ?? '', enabled: entry.enabled, position: entry.position ?? '',
    prompt_position_id: entry.promptPositionId, insert_role: entry.insertRole, order: entry.order,
    view_order: entry.viewOrder, group_view_order: entry.groupViewOrder, tree_view_order: entry.treeViewOrder,
    created_at: entry.createdAt, updated_at: entry.updatedAt
  }
}

function groupFromPortable(value: JsonObject, index: number, timestamp: string): SettingLibraryGroup {
  return {
    id: stringValue(value.id) || `import-group-${index + 1}`, name: stringValue(value.name),
    parentId: stringValue(value.parent_id), order: Math.max(1, integerValue(value.order, index + 1)),
    treeViewOrder: integerValue(value.tree_view_order, index + 1),
    createdAt: stringValue(value.created_at) || timestamp, updatedAt: stringValue(value.updated_at) || timestamp
  }
}

function positionFromPortable(value: JsonObject, index: number, timestamp: string): SettingLibraryPromptPosition {
  const anchor = stringValue(value.anchor) as SettingLibraryPromptPosition['anchor']
  return {
    id: stringValue(value.id) || `import-position-${index + 1}`, name: stringValue(value.name),
    anchor: positions.has(anchor) ? anchor : 'insert_point_1',
    side: value.side === 'after_setting_position' ? 'after_setting_position' : 'before_setting_position',
    order: Math.max(1, integerValue(value.order, index + 1)),
    createdAt: stringValue(value.created_at) || timestamp, updatedAt: stringValue(value.updated_at) || timestamp
  }
}

function emptyEntry(id: string, timestamp: string): SettingLibraryEntry {
  return {
    id, title: '', iconId: '', kind: 'normal', groupId: '', content: '', openingMessages: [],
    defaultOpeningMessageId: '', agentSelectionHint: '', agentReadStrategy: 'normal',
    dynamicMode: 'standard', contentMode: 'plain_text', keywords: [], keywordScanDepth: 1,
    conditionKeywords: [], keywordCondition: 'none', keywordUseRegex: false, keywordIgnoreCase: true,
    keywordWholeWord: false, keywordRecursionDepth: 0, triggerMode: null, enabled: true,
    position: null, promptPositionId: '', insertRole: 'system', order: 1, viewOrder: 0,
    groupViewOrder: 0, treeViewOrder: 0, createdAt: timestamp, updatedAt: timestamp
  }
}

function decodeInput(base64: string): Uint8Array {
  const normalized = base64.trim().replace(/\s+/g, '')
  const bytes = Buffer.from(normalized, 'base64')
  if (!bytes.length || bytes.toString('base64').replace(/=+$/, '') !== normalized.replace(/=+$/, '')) {
    throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, '预设文件数据无效。', { field: 'data' })
  }
  return bytes
}

function validateEmbeddedAvatar(base64: string): void {
  const normalized = base64.replace(/\s+/g, '')
  const bytes = Buffer.from(normalized, 'base64')
  if (!bytes.length || bytes.toString('base64').replace(/=+$/, '') !== normalized.replace(/=+$/, '')) {
    throw new DesktopError(ELECKOI_FAILURE_CODES.mediaInvalid, '预设卡作者头像已损坏。', { what: '预设卡作者头像', field: 'author_avatar' })
  }
}

function validateAvatarMediaType(value: string): string {
  const normalized = value.trim().toLocaleLowerCase()
  if (!avatarMediaTypes.has(normalized)) throw new DesktopError(ELECKOI_FAILURE_CODES.mediaInvalid, '预设卡作者头像格式不受支持。', { what: '预设卡作者头像的格式', field: 'media_type' })
  return normalized
}

function parseRoot(json: string, label: string): JsonObject {
  try {
    const root = objectValue(JSON.parse(json))
    if (!root) throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, `${label} JSON 已损坏。`, { what: `${label} JSON`, path: '' })
    return root
  } catch {
    throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, `${label} JSON 已损坏。`, { what: `${label} JSON`, path: '' })
  }
}

function objectValue(value: unknown): JsonObject | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : undefined
}
function objectList(value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.map(objectValue).filter((item): item is JsonObject => Boolean(item)) : []
}
function stringValue(value: unknown): string { return typeof value === 'string' ? value : '' }
function stringList(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [] }
function booleanValue(value: unknown, fallback = false): boolean { return typeof value === 'boolean' ? value : fallback }
function integerValue(value: unknown, fallback = 0): number { return Number.isInteger(value) ? value as number : fallback }

function insertRole(value: unknown): SettingLibraryEntry['insertRole'] {
  const role = stringValue(value).toLocaleLowerCase()
  return role === 'user' || role === 'assistant' ? role : 'system'
}

function hasUnsupportedRegexDepth(value: JsonObject): boolean {
  return ['minDepth', 'maxDepth', 'min_depth', 'max_depth'].some((key) => {
    const depth = value[key]
    return depth !== undefined && depth !== null && (typeof depth !== 'string' || depth.trim().length > 0)
  })
}

function uniqueTitle(requested: string, used: Set<string>): string {
  const base = requested.trim() || '未命名提示词'
  if (!used.has(base.toLocaleLowerCase())) { used.add(base.toLocaleLowerCase()); return base }
  let index = 2
  while (true) {
    const suffix = ` (${index})`
    const candidate = `${base}${suffix}`
    const key = candidate.toLocaleLowerCase()
    if (!used.has(key)) { used.add(key); return candidate }
    index += 1
  }
}

function suggestedName(displayName: string): string {
  return displayName.replace(/\.(json|png)$/i, '').trim() || '导入预设'
}

// RETIRE WHEN: supported imported presets no longer contain tool-owned image
// settings. Remove the legacy branch and its shared upgrade helper together.
function illustrationFromPortable(value: JsonObject, tools: JsonObject | undefined) {
  const plugins = value.plugin_configuration as JsonObject | undefined
  if (plugins?.[AUTO_ILLUSTRATION_PLUGIN]) return {
    autoIllustration: autoIllustrationSchema.parse(plugins[AUTO_ILLUSTRATION_PLUGIN]),
    toolModelConfigIds: (tools?.tool_model_config_ids ?? {}) as Record<string, string>
  }
  const upgraded = upgradeAutoIllustrationConfiguration({
    includedGroupIds: stringList(tools?.included_group_ids), enabledGroupIds: stringList(tools?.enabled_group_ids),
    toolModelConfigIds: tools?.tool_model_config_ids
  })
  return { autoIllustration: upgraded.autoIllustration, toolModelConfigIds: upgraded.toolModelConfigIds }
}
