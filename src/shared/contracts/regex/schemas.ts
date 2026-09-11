import { z } from 'zod'

export const regexRuleScopeSchema = z.enum(['Global', 'AgentPreset', 'Character'])
export const regexRuleTargetSchema = z.enum([
  'UserInput',
  'AiOutput',
  'SlashCommand',
  'SettingContent',
  'Reasoning'
])
export const regexRuleSurfaceSchema = z.enum(['Stored', 'Display', 'Prompt'])

export const regexRuleSchema = z.object({
  id: z.string().min(1),
  name: z.string().max(60),
  pattern: z.string().max(4_000),
  replacement: z.string(),
  targets: z.array(regexRuleTargetSchema),
  enabled: z.boolean(),
  displayOnly: z.boolean(),
  promptOnly: z.boolean(),
  runOnEdit: z.boolean(),
  order: z.number().int().nonnegative()
}).strict()

export const regexRuleVersionSchema = z.object({
  id: z.string().min(1),
  name: z.string().max(60),
  globalEnabledIds: z.array(z.string()),
  agentPresetEnabledIds: z.array(z.string()),
  characterEnabledIds: z.array(z.string())
}).strict()

export const regexRuleCollectionSchema = z.object({
  characterId: z.string().min(1),
  agentPresetId: z.string(),
  agentPresetName: z.string(),
  globalRules: z.array(regexRuleSchema),
  agentPresetRules: z.array(regexRuleSchema),
  characterRules: z.array(regexRuleSchema),
  versions: z.array(regexRuleVersionSchema),
  activeVersionId: z.string(),
  revision: z.number().int().nonnegative()
}).strict()

export const regexRuleImportDocumentSchema = z.object({
  displayName: z.string().min(1).max(260),
  json: z.string().max(8 * 1024 * 1024)
}).strict()

export const regexRuleImportResultSchema = z.object({
  collection: regexRuleCollectionSchema,
  importedFileCount: z.number().int().nonnegative(),
  importedRuleCount: z.number().int().nonnegative(),
  failedFileNames: z.array(z.string())
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
export type RegexRuleImportDocument = z.infer<typeof regexRuleImportDocumentSchema>
