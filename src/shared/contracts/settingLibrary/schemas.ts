import { z } from 'zod'

export const settingLibraryPositionSchema = z.enum([
  'instructions',
  'after_instructions',
  'before_history',
  'after_history',
  'before_latest_user_input',
  'after_latest_user_input',
  'before_tool_flow',
  'after_tool_flow'
])

export const settingLibraryInsertRoleSchema = z.enum(['system', 'user', 'assistant'])
export const settingLibraryTriggerModeSchema = z.enum(['always', 'agent_tool'])
export const settingLibraryAgentReadStrategySchema = z.enum(['required', 'keyword', 'normal', 'variable_condition'])
export const settingLibraryDynamicModeSchema = z.enum(['single_condition', 'ejs_controller', 'ejs_reference'])
export const settingLibraryKeywordConditionSchema = z.enum(['none', 'any', 'all', 'not_any'])
export const settingLibraryEntryKindSchema = z.enum([
  'normal',
  'opening',
  'roleplay_plan',
  'history_compaction',
  'hidden_tool_timeline'
])

export const settingLibraryOpeningMessageSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  content: z.string(),
  initialVariableStateJson: z.string()
}).strict()

export const settingLibraryEntrySchema = z.object({
  id: z.string().min(1),
  title: z.string().max(120),
  iconId: z.string(),
  kind: settingLibraryEntryKindSchema,
  groupId: z.string(),
  content: z.string(),
  openingMessages: z.array(settingLibraryOpeningMessageSchema),
  defaultOpeningMessageId: z.string(),
  agentSelectionHint: z.string(),
  agentReadStrategy: settingLibraryAgentReadStrategySchema,
  agentReadCondition: z.string(),
  dynamicMode: settingLibraryDynamicModeSchema,
  keywords: z.array(z.string()),
  keywordScanDepth: z.number().int().min(0),
  conditionKeywords: z.array(z.string()),
  keywordCondition: settingLibraryKeywordConditionSchema,
  keywordUseRegex: z.boolean(),
  keywordIgnoreCase: z.boolean(),
  keywordWholeWord: z.boolean(),
  keywordRecursionDepth: z.number().int().min(0),
  triggerMode: settingLibraryTriggerModeSchema.nullable(),
  enabled: z.boolean(),
  position: settingLibraryPositionSchema.nullable(),
  promptPositionId: z.string(),
  insertRole: settingLibraryInsertRoleSchema,
  order: z.number().int().min(1),
  viewOrder: z.number().int(),
  groupViewOrder: z.number().int(),
  treeViewOrder: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string()
}).strict()

export const settingLibraryGroupSchema = z.object({
  id: z.string().min(1),
  name: z.string().max(80),
  parentId: z.string(),
  order: z.number().int().min(1),
  treeViewOrder: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string()
}).strict()

export const settingLibraryPromptPositionSchema = z.object({
  id: z.string().min(1),
  name: z.string().max(60),
  anchor: settingLibraryPositionSchema,
  order: z.number().int().min(1),
  createdAt: z.string(),
  updatedAt: z.string()
}).strict()

export const settingLibraryVersionSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  entries: z.array(settingLibraryEntrySchema),
  groups: z.array(settingLibraryGroupSchema),
  promptPositions: z.array(settingLibraryPromptPositionSchema),
  listAllExpanded: z.boolean(),
  expandedGroupIds: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string()
}).strict()

export const settingLibrarySchema = z.object({
  characterId: z.string().min(1),
  name: z.string(),
  entries: z.array(settingLibraryEntrySchema),
  groups: z.array(settingLibraryGroupSchema),
  promptPositions: z.array(settingLibraryPromptPositionSchema),
  activeVersionId: z.string().min(1),
  versions: z.array(settingLibraryVersionSchema),
  listAllExpanded: z.boolean(),
  expandedGroupIds: z.array(z.string())
}).strict()

export const settingLibraryConversationSchema = z.object({
  sessionId: z.string().min(1),
  title: z.string(),
  characterName: z.string(),
  characterAvatar: z.string(),
  summary: z.string(),
  updatedAt: z.string(),
  library: settingLibrarySchema
}).strict()

export type SettingLibrary = z.output<typeof settingLibrarySchema>
export type SettingLibraryEntry = z.output<typeof settingLibraryEntrySchema>
export type SettingLibraryGroup = z.output<typeof settingLibraryGroupSchema>
export type SettingLibraryPromptPosition = z.output<typeof settingLibraryPromptPositionSchema>
export type SettingLibraryVersion = z.output<typeof settingLibraryVersionSchema>
export type SettingLibraryConversation = z.output<typeof settingLibraryConversationSchema>
