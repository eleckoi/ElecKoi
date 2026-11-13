import { z } from 'zod'

export const regexRuleScopeSchema = z.enum(['Global', 'AgentPreset', 'Character'])
export const regexRuleTargetSchema = z.enum([
  'UserInput',
  'AiOutput',
  'SettingContent',
  'Reasoning'
])
export const regexRuleSurfaceSchema = z.enum(['Stored', 'Display', 'Prompt'])

export const regexRuleSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  pattern: z.string(),
  replacement: z.string(),
  targets: z.array(regexRuleTargetSchema),
  enabled: z.boolean(),
  displayOnly: z.boolean(),
  promptOnly: z.boolean(),
  runOnEdit: z.boolean(),
  order: z.number().int().nonnegative(),
  trimStrings: z.array(z.string()).optional(),
  minDepth: z.number().int().nullable().optional(),
  maxDepth: z.number().int().nullable().optional(),
  substituteRegex: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional()
})

export const regexLibrarySchema = z.strictObject({
  scope: z.enum(['global', 'character', 'preset']), ownerId: z.string(), enabled: z.boolean(),
  rules: z.array(regexRuleSchema), revision: z.number().int().nonnegative(), ownerRevision: z.string().regex(/^[a-f0-9]{64}$/),
}).superRefine((library, context) => {
  if (library.scope === 'global' ? library.ownerId !== '' : !library.ownerId) context.addIssue({ code: 'custom', path: ['ownerId'], message: '正则库归属与作用域不匹配。' })
  if (new Set(library.rules.map(rule => rule.id)).size !== library.rules.length) context.addIssue({ code: 'custom', path: ['rules'], message: '正则规则编号重复。' })
})
export type RegexLibrary = z.output<typeof regexLibrarySchema>

export const regexRuleVersionSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  globalEnabledIds: z.array(z.string()),
  agentPresetEnabledIds: z.array(z.string()),
  characterEnabledIds: z.array(z.string())
})

export const regexRuleCollectionSchema = z.object({
  characterId: z.string().min(1),
  agentPresetId: z.string(),
  agentPresetName: z.string(),
  agentPresetRegexRevision: z.string().regex(/^[a-f0-9]{64}$/),
  globalEnabled: z.boolean().optional(),
  agentPresetEnabled: z.boolean().optional(),
  characterEnabled: z.boolean().optional(),
  globalRules: z.array(regexRuleSchema),
  agentPresetRules: z.array(regexRuleSchema),
  characterRules: z.array(regexRuleSchema),
  versions: z.array(regexRuleVersionSchema),
  activeVersionId: z.string(),
  revision: z.number().int().nonnegative()
})

export const regexRuleImportDocumentSchema = z.object({
  displayName: z.string().min(1),
  json: z.string()
}).strict()

export const regexRuleImportResultSchema = z.object({
  collection: regexRuleCollectionSchema,
  importedFileCount: z.number().int().nonnegative(),
  importedRuleCount: z.number().int().nonnegative(),
  failedFileNames: z.array(z.string())
}).strict()

export const regexEditorTargetSchema = z.object({
  scope: z.enum(['character', 'preset']),
  ownerId: z.string().min(1)
}).strict()

/** 编辑器仅携带全局及指定归属；另一归属的规则和版本成员为空。 */
export const regexRuleEditorCollectionSchema = regexRuleCollectionSchema.omit({
  characterId: true, agentPresetId: true, agentPresetName: true, agentPresetRegexRevision: true
}).extend({
  target: regexEditorTargetSchema,
  ownerRevision: z.string().regex(/^[a-f0-9]{64}$/)
}).strict()

export const regexRuleTestResultSchema = z.object({
  output: z.string(),
  validationMessage: z.string().nullable()
}).strict()

export type RegexRuleScope = z.infer<typeof regexRuleScopeSchema>
export type RegexRuleTarget = z.infer<typeof regexRuleTargetSchema>
export type RegexRuleSurface = z.infer<typeof regexRuleSurfaceSchema>
export type RegexRule = z.infer<typeof regexRuleSchema>
export type RegexRuleVersion = z.infer<typeof regexRuleVersionSchema>
export type RegexRuleCollection = z.infer<typeof regexRuleCollectionSchema>
export type RegexEditorTarget = z.infer<typeof regexEditorTargetSchema>
export type RegexRuleEditorCollection = z.infer<typeof regexRuleEditorCollectionSchema>
export type RegexRuleImportDocument = z.infer<typeof regexRuleImportDocumentSchema>
