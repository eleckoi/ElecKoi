import {
  settingLibraryEntrySchema,
  settingLibraryGroupSchema,
  settingLibraryPromptPositionSchema,
  type SettingLibraryEntry,
  type SettingLibraryGroup,
  type SettingLibraryPromptPosition
} from '@shared/contracts/settingLibrary/schemas'

type JsonObject = Record<string, unknown>

function object(value: string): JsonObject {
  const parsed: unknown = JSON.parse(value)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('设定库数据格式不正确。')
  return parsed as JsonObject
}

function string(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function number(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function boolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function objects(value: unknown): JsonObject[] {
  return Array.isArray(value)
    ? value.filter((item): item is JsonObject => !!item && typeof item === 'object' && !Array.isArray(item))
    : []
}

export function readEntry(payloadJson: string): SettingLibraryEntry {
  const value = object(payloadJson)
  return settingLibraryEntrySchema.parse({
    id: string(value.id),
    title: string(value.title),
    iconId: string(value.icon_id),
    kind: string(value.kind) || 'normal',
    groupId: string(value.group_id),
    content: string(value.content),
    openingMessages: objects(value.opening_messages).map((message) => ({
      id: string(message.id),
      title: string(message.title),
      content: string(message.content),
      initialVariableStateJson: string(message.initial_variable_state)
    })),
    defaultOpeningMessageId: string(value.default_opening_message_id),
    agentSelectionHint: string(value.agent_selection_hint),
    agentReadStrategy: string(value.agent_read_strategy) || 'normal',
    agentReadCondition: string(value.agent_read_condition),
    dynamicMode: string(value.dynamic_mode) || 'single_condition',
    keywords: strings(value.keywords),
    keywordScanDepth: number(value.keyword_scan_depth, 1),
    conditionKeywords: strings(value.condition_keywords),
    keywordCondition: string(value.keyword_condition) || 'none',
    keywordUseRegex: boolean(value.keyword_use_regex),
    keywordIgnoreCase: boolean(value.keyword_ignore_case, true),
    keywordWholeWord: boolean(value.keyword_whole_word),
    keywordRecursionDepth: number(value.keyword_recursion_depth),
    triggerMode: string(value.trigger_mode) || null,
    enabled: boolean(value.enabled, true),
    position: string(value.position) || null,
    promptPositionId: string(value.prompt_position_id),
    insertRole: string(value.insert_role) || 'user',
    order: number(value.order, 1),
    viewOrder: number(value.view_order),
    groupViewOrder: number(value.group_view_order),
    treeViewOrder: number(value.tree_view_order),
    createdAt: string(value.created_at),
    updatedAt: string(value.updated_at)
  })
}

export function writeEntry(entry: SettingLibraryEntry): string {
  return JSON.stringify({
    id: entry.id,
    title: entry.title,
    icon_id: entry.iconId,
    kind: entry.kind,
    group_id: entry.groupId,
    content: entry.content,
    opening_messages: entry.openingMessages.map((message) => ({
      id: message.id,
      title: message.title,
      content: message.content,
      initial_variable_state: message.initialVariableStateJson
    })),
    default_opening_message_id: entry.defaultOpeningMessageId,
    agent_selection_hint: entry.agentSelectionHint,
    agent_read_strategy: entry.agentReadStrategy,
    agent_read_condition: entry.agentReadCondition,
    dynamic_mode: entry.dynamicMode,
    keywords: entry.keywords,
    keyword_scan_depth: entry.keywordScanDepth,
    condition_keywords: entry.conditionKeywords,
    keyword_condition: entry.keywordCondition,
    keyword_use_regex: entry.keywordUseRegex,
    keyword_ignore_case: entry.keywordIgnoreCase,
    keyword_whole_word: entry.keywordWholeWord,
    keyword_recursion_depth: entry.keywordRecursionDepth,
    trigger_mode: entry.triggerMode ?? '',
    enabled: entry.enabled,
    position: entry.position ?? '',
    prompt_position_id: entry.promptPositionId,
    insert_role: entry.insertRole,
    order: entry.order,
    view_order: entry.viewOrder,
    group_view_order: entry.groupViewOrder,
    tree_view_order: entry.treeViewOrder,
    created_at: entry.createdAt,
    updated_at: entry.updatedAt
  })
}

export function readGroup(payloadJson: string): SettingLibraryGroup {
  const value = object(payloadJson)
  return settingLibraryGroupSchema.parse({
    id: string(value.id), name: string(value.name), parentId: string(value.parent_id),
    order: number(value.order, 1), treeViewOrder: number(value.tree_view_order),
    createdAt: string(value.created_at), updatedAt: string(value.updated_at)
  })
}

export function writeGroup(group: SettingLibraryGroup): string {
  return JSON.stringify({
    id: group.id, name: group.name, parent_id: group.parentId, order: group.order,
    tree_view_order: group.treeViewOrder, created_at: group.createdAt, updated_at: group.updatedAt
  })
}

export function readPromptPositions(payloadJson: string): SettingLibraryPromptPosition[] {
  const parsed: unknown = JSON.parse(payloadJson)
  if (!Array.isArray(parsed)) throw new Error('设定库提示词位置格式不正确。')
  return parsed.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('设定库提示词位置格式不正确。')
    const value = item as JsonObject
    return settingLibraryPromptPositionSchema.parse({
      id: string(value.id), name: string(value.name), anchor: string(value.anchor) || 'after_instructions',
      order: number(value.order, 1), createdAt: string(value.created_at), updatedAt: string(value.updated_at)
    })
  })
}

export function writePromptPositions(positions: SettingLibraryPromptPosition[]): string {
  return JSON.stringify(positions.map((position) => ({
    id: position.id, name: position.name, anchor: position.anchor, order: position.order,
    created_at: position.createdAt, updated_at: position.updatedAt
  })))
}
