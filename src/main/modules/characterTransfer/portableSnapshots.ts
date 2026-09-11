import { randomUUID } from 'node:crypto'
import type {
  SettingLibrary,
  SettingLibraryEntry,
  SettingLibraryGroup,
  SettingLibraryPromptPosition,
  SettingLibraryVersion
} from '@shared/contracts/settingLibrary/schemas'
import type {
  VariableConfig,
  VariableConfigVersion,
  VariableItemConfig,
  VariableObjectConfig,
  VariableReadMode,
  VariableValueType
} from '@shared/contracts/variables/schemas'
import { normalizeSettingLibrary } from '@main/modules/settingLibraries'
import { normalizeVariableConfig } from '@main/modules/variables'

type JsonObject = Record<string, unknown>

const POSITIONS = new Set([
  'instructions', 'after_instructions', 'before_history', 'after_history',
  'before_latest_user_input', 'after_latest_user_input', 'before_tool_flow', 'after_tool_flow'
])

export function decodeSettingLibrarySnapshot(json: string, characterId: string): SettingLibrary {
  const root = parseObject(json, '设定库快照格式不正确')
  if (root.format !== 'eleckoi.setting-library-snapshot') throw new Error('这不是 ElecKoi 设定库快照')
  const versions = objectList(root.versions).map(settingVersion)
  if (!versions.length) throw new Error('ElecKoi 角色卡里的设定库为空')
  const activeVersionId = string(root.active_version_id)
  const active = versions.find((version) => version.id === activeVersionId) ?? versions[0]!
  return normalizeSettingLibrary(characterId, {
    characterId,
    name: active.name,
    entries: active.entries,
    groups: active.groups,
    promptPositions: active.promptPositions,
    activeVersionId: active.id,
    versions,
    listAllExpanded: active.listAllExpanded,
    expandedGroupIds: active.expandedGroupIds
  })
}

export function decodeVariableConfigSnapshot(json: string, characterId: string): VariableConfig {
  const root = parseObject(json, '变量配置文件格式不正确')
  if (root.format !== 'eleckoi.variable-config') throw new Error('这不是 ElecKoi 变量配置文件')
  const supplied = objectList(root.versions)
  const versions = (supplied.length ? supplied : [root]).map((value, index) => variableVersion(value, index))
  const requested = string(root.active_version_id)
  const active = versions.find((version) => version.id === requested) ?? versions[0]!
  return normalizeVariableConfig(characterId, {
    characterId,
    name: active.name,
    initialStateJson: active.initialStateJson,
    schemaCode: active.schemaCode,
    objects: active.objects,
    variables: active.variables,
    expandedObjectIds: active.expandedObjectIds,
    activeVersionId: active.id,
    versions
  })
}

function settingVersion(value: JsonObject, index: number): SettingLibraryVersion {
  return {
    id: string(value.id) || `library-snapshot-${index + 1}-${randomUUID()}`,
    name: string(value.name),
    entries: objectList(value.entries).map(settingEntry),
    groups: objectList(value.groups).map(settingGroup),
    promptPositions: objectList(value.prompt_positions).map(promptPosition),
    listAllExpanded: boolean(value.list_all_expanded, true),
    expandedGroupIds: stringList(value.expanded_group_ids),
    createdAt: string(value.created_at),
    updatedAt: string(value.updated_at)
  }
}

function settingEntry(value: JsonObject, index: number): SettingLibraryEntry {
  const kind = enumValue(value.kind, ['normal', 'opening', 'roleplay_plan', 'history_compaction', 'hidden_tool_timeline'], 'normal')
  const triggerMode = enumValue(value.trigger_mode, ['always', 'agent_tool'], null)
  return {
    id: string(value.id) || `setting-${randomUUID()}`,
    title: string(value.title).slice(0, 120),
    iconId: string(value.icon_id),
    kind,
    groupId: string(value.group_id),
    content: string(value.content),
    openingMessages: objectList(value.opening_messages).map((message, messageIndex) => ({
      id: string(message.id) || `opening-${messageIndex + 1}-${randomUUID()}`,
      title: string(message.title),
      content: string(message.content),
      initialVariableStateJson: string(message.initial_variable_state)
    })),
    defaultOpeningMessageId: string(value.default_opening_message_id),
    agentSelectionHint: string(value.agent_selection_hint),
    agentReadStrategy: enumValue(value.agent_read_strategy, ['required', 'keyword', 'normal', 'variable_condition'], 'normal'),
    agentReadCondition: string(value.agent_read_condition),
    dynamicMode: enumValue(value.dynamic_mode, ['single_condition', 'ejs_controller', 'ejs_reference'], 'single_condition'),
    keywords: stringList(value.keywords),
    keywordScanDepth: Math.max(0, integer(value.keyword_scan_depth, 1)),
    conditionKeywords: stringList(value.condition_keywords),
    keywordCondition: enumValue(value.keyword_condition, ['none', 'any', 'all', 'not_any'], 'none'),
    keywordUseRegex: boolean(value.keyword_use_regex),
    keywordIgnoreCase: boolean(value.keyword_ignore_case, true),
    keywordWholeWord: boolean(value.keyword_whole_word),
    keywordRecursionDepth: Math.max(0, integer(value.keyword_recursion_depth)),
    triggerMode,
    enabled: kind === 'roleplay_plan' ? false : boolean(value.enabled, true),
    position: POSITIONS.has(string(value.position)) ? string(value.position) as SettingLibraryEntry['position'] : null,
    promptPositionId: string(value.prompt_position_id),
    insertRole: enumValue(value.insert_role, ['system', 'user', 'assistant'], 'user'),
    order: Math.max(1, integer(value.order, index + 1)),
    viewOrder: integer(value.view_order),
    groupViewOrder: integer(value.group_view_order),
    treeViewOrder: integer(value.tree_view_order, index + 1),
    createdAt: string(value.created_at),
    updatedAt: string(value.updated_at)
  }
}

function settingGroup(value: JsonObject, index: number): SettingLibraryGroup {
  return {
    id: string(value.id) || `group-${randomUUID()}`,
    name: string(value.name).slice(0, 80),
    parentId: string(value.parent_id),
    order: Math.max(1, integer(value.order, index + 1)),
    treeViewOrder: integer(value.tree_view_order, index + 1),
    createdAt: string(value.created_at),
    updatedAt: string(value.updated_at)
  }
}

function promptPosition(value: JsonObject, index: number): SettingLibraryPromptPosition {
  return {
    id: string(value.id) || `prompt-position-${randomUUID()}`,
    name: string(value.name).slice(0, 60),
    anchor: POSITIONS.has(string(value.anchor)) ? string(value.anchor) as SettingLibraryPromptPosition['anchor'] : 'after_instructions',
    order: Math.max(1, integer(value.order, index + 1)),
    createdAt: string(value.created_at),
    updatedAt: string(value.updated_at)
  }
}

function variableVersion(value: JsonObject, index: number): VariableConfigVersion {
  const initialState = record(value.initial_state) ?? {}
  return {
    id: string(value.id) || string(value.active_version_id) || `variable-config-${index + 1}-${randomUUID()}`,
    name: string(value.name),
    initialStateJson: JSON.stringify(initialState, null, 2),
    schemaCode: string(value.schema_code),
    objects: objectList(value.objects).map(variableObject),
    variables: objectList(value.variables).map(variableItem),
    expandedObjectIds: stringList(value.expanded_object_ids),
    createdAt: string(value.created_at),
    updatedAt: string(value.updated_at)
  }
}

function variableObject(value: JsonObject, index: number): VariableObjectConfig {
  return {
    id: string(value.id) || `variable-object-${randomUUID()}`,
    name: string(value.name).slice(0, 40),
    parentId: string(value.parent_id),
    enabled: boolean(value.enabled, true),
    description: string(value.description),
    updateRule: string(value.update_rule),
    dynamicKey: boolean(value.dynamic_key),
    order: Math.max(0, integer(value.order, index + 1)),
    treeViewOrder: Math.max(0, integer(value.tree_view_order, index + 1)),
    createdAt: string(value.created_at),
    updatedAt: string(value.updated_at)
  }
}

function variableItem(value: JsonObject, index: number): VariableItemConfig {
  const rawType = string(value.type)
  const type: VariableValueType = ['', 'number', 'string', 'boolean', 'array'].includes(rawType) ? rawType as VariableValueType : ''
  const rawMode = string(value.read_mode)
  const readMode: VariableReadMode = rawMode === 'required' ? 'required' : 'on_demand'
  return {
    id: string(value.id) || `variable-${randomUUID()}`,
    title: string(value.title).slice(0, 60),
    objectId: string(value.object_id),
    enabled: boolean(value.enabled, true),
    type,
    defaultValue: string(value.default_value),
    description: string(value.description),
    updateRule: string(value.update_rule),
    readMode,
    order: Math.max(1, integer(value.order, index + 1)),
    treeViewOrder: Math.max(0, integer(value.tree_view_order, index + 1)),
    createdAt: string(value.created_at),
    updatedAt: string(value.updated_at)
  }
}

function parseObject(json: string, message: string): JsonObject {
  try {
    const value: unknown = JSON.parse(json)
    const result = record(value)
    if (!result) throw new Error(message)
    return result
  } catch (error) { throw new Error(message, { cause: error }) }
}

function enumValue<const T extends string, F extends T | null>(value: unknown, choices: readonly T[], fallback: F): T | F {
  return typeof value === 'string' && choices.includes(value as T) ? value as T : fallback
}
function record(value: unknown): JsonObject | undefined { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : undefined }
function objectList(value: unknown): JsonObject[] { return Array.isArray(value) ? value.map(record).filter((item): item is JsonObject => !!item) : [] }
function string(value: unknown): string { return typeof value === 'string' ? value : '' }
function stringList(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && !!item) : [] }
function boolean(value: unknown, fallback = false): boolean { return typeof value === 'boolean' ? value : fallback }
function integer(value: unknown, fallback = 0): number { return Number.isInteger(value) ? value as number : fallback }
