import { z } from 'zod'

export const settingLibraryPositionSchema = z.enum([
  'instructions',
  'insert_point_1',
  'insert_point_2',
  'insert_point_3',
  'insert_point_4',
  'insert_point_5'
])

export const settingLibraryInsertRoleSchema = z.enum(['system', 'user', 'assistant'])
export const settingLibraryTriggerModeSchema = z.enum(['always', 'agent_tool'])
export const settingLibraryPromptPositionSideSchema = z.enum([
  'before_setting_position',
  'after_setting_position'
])
export const settingLibraryAgentReadStrategySchema = z.enum(['required', 'keyword', 'normal'])
export const settingLibraryDynamicModeSchema = z.enum(['standard', 'ejs_reference'])
export const settingLibraryContentModeSchema = z.enum(['plain_text', 'ejs'])
export const settingLibraryKeywordConditionSchema = z.enum(['none', 'any', 'all', 'not_any', 'not_all'])
export const settingLibraryEntryKindSchema = z.enum([
  'normal',
  'opening',
  'history_compaction',
  'hidden_tool_timeline'
])

export const settingLibraryOpeningMessageSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  content: z.string(),
  variableVersionId: z.string().optional(),
  initialVariableStateJson: z.string()
})

export const settingLibraryEntrySchema = z.object({
  id: z.string().min(1),
  title: z.string().max(120),
  iconId: z.string(),
  kind: settingLibraryEntryKindSchema,
  groupId: z.string(),
  sendGroupId: z.string().optional(),
  content: z.string(),
  openingMessages: z.array(settingLibraryOpeningMessageSchema),
  defaultOpeningMessageId: z.string(),
  agentSelectionHint: z.string(),
  agentReadStrategy: settingLibraryAgentReadStrategySchema,
  dynamicMode: settingLibraryDynamicModeSchema,
  contentMode: settingLibraryContentModeSchema,
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
  updatedAt: z.string(),
  sillyTavern: z.record(z.string(), z.json()).optional()
})

export const settingLibraryStoredEntrySchema = settingLibraryEntrySchema.extend({
  dynamicMode: settingLibraryDynamicModeSchema.catch('standard'),
  triggerMode: settingLibraryTriggerModeSchema.nullable().catch(null)
}).strip()

export const settingLibraryEntryChangesSchema = settingLibraryEntrySchema.omit({
  id: true, kind: true, openingMessages: true, defaultOpeningMessageId: true,
  createdAt: true, updatedAt: true
}).partial().strict().refine(value => Object.keys(value).length > 0, '条目修改不能为空。')

export const settingLibraryEntryUpdateSchema = z.object({
  id: z.string().min(1),
  changes: settingLibraryEntryChangesSchema
}).strict()

export const settingLibraryGroupSchema = z.object({
  id: z.string().min(1),
  name: z.string().max(80),
  parentId: z.string(),
  mergeSend: z.boolean().optional(),
  order: z.number().int().min(1),
  treeViewOrder: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
  sillyTavern: z.record(z.string(), z.json()).optional()
})

export const settingLibraryPromptPositionSchema = z.object({
  id: z.string().min(1),
  name: z.string().max(60),
  anchor: settingLibraryPositionSchema,
  side: settingLibraryPromptPositionSideSchema,
  order: z.number().int().min(1),
  createdAt: z.string(),
  updatedAt: z.string()
})

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
})

export const settingLibrarySchema = z.object({
  characterId: z.string().min(1),
  name: z.string(),
  entries: z.array(settingLibraryEntrySchema),
  groups: z.array(settingLibraryGroupSchema),
  promptPositions: z.array(settingLibraryPromptPositionSchema),
  activeVersionId: z.string().min(1),
  versions: z.array(settingLibraryVersionSchema),
  listAllExpanded: z.boolean(),
  expandedGroupIds: z.array(z.string()),
  worldbookBindings: z.record(z.string(), z.object({
    global: z.boolean(), characterIds: z.array(z.string()), conversationIds: z.array(z.string()),
    primaryCharacterIds: z.array(z.string()).optional(), deleted: z.boolean().optional()
  })).optional()
})

export const settingLibraryConversationSchema = z.object({
  sessionId: z.string().min(1),
  title: z.string(),
  characterName: z.string(),
  characterAvatar: z.string(),
  summary: z.string(),
  updatedAt: z.string(),
  library: settingLibrarySchema
})

export type SettingLibrary = z.output<typeof settingLibrarySchema>
export type SettingLibraryEntry = z.output<typeof settingLibraryEntrySchema>
export type SettingLibraryEntryChanges = z.output<typeof settingLibraryEntryChangesSchema>
export type SettingLibraryEntryUpdate = z.output<typeof settingLibraryEntryUpdateSchema>
export type SettingLibraryGroup = z.output<typeof settingLibraryGroupSchema>
export type SettingLibraryPromptPosition = z.output<typeof settingLibraryPromptPositionSchema>
export type SettingLibraryVersion = z.output<typeof settingLibraryVersionSchema>
export type SettingLibraryConversation = z.output<typeof settingLibraryConversationSchema>
