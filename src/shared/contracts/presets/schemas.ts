import { z } from 'zod'
import { agentToolGroupSchema } from '../agent/tools'
import { regexRuleSchema } from '../regex/schemas'
import {
  settingLibraryEntrySchema,
  settingLibraryGroupSchema,
  settingLibraryPromptPositionSchema
} from '../settingLibrary/schemas'
import { roleplayPlanSettingsSchema } from './roleplayPlan'

export const agentPresetModelFamilySchema = z.enum([
  'general',
  'claude',
  'openai',
  'gemini',
  'deepseek',
  'other'
])

export const agentPresetModelTagSchema = z.object({
  id: z.string().min(1).max(40),
  label: z.string().min(1).max(40),
  providerId: z.string().max(80)
}).strict()

export const agentPresetTimelineItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().max(80),
  dateLabel: z.string().max(24),
  note: z.string().max(800)
}).strict()

export const agentPresetProfileSchema = z.object({
  authorName: z.string().max(40),
  authorAvatarPath: z.string(),
  usageInstructions: z.string().max(1_000),
  timeline: z.array(agentPresetTimelineItemSchema).max(100)
}).strict()

export const agentPresetLibraryGroupSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(60),
  sortIndex: z.number().int().nonnegative()
}).strict()

export const agentPresetSummarySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(60),
  modelFamily: agentPresetModelFamilySchema,
  modelTags: z.array(agentPresetModelTagSchema).max(8),
  libraryGroupId: z.string(),
  activeVersionId: z.string(),
  activeVersionNumber: z.number().int().positive(),
  entryCount: z.number().int().nonnegative(),
  profile: agentPresetProfileSchema
}).strict()

export const agentPresetCatalogSchema = z.object({
  activePresetId: z.string(),
  groups: z.array(agentPresetLibraryGroupSchema),
  presets: z.array(agentPresetSummarySchema)
}).strict()

export const subagentModelSelectionSchema = z.object({
  configId: z.string(),
  model: z.string()
}).strict()

export const agentPresetSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(60),
  modelFamily: agentPresetModelFamilySchema,
  modelTags: z.array(agentPresetModelTagSchema).max(8),
  libraryGroupId: z.string(),
  activeVersionId: z.string().min(1),
  activeVersionNumber: z.number().int().positive(),
  profile: agentPresetProfileSchema,
  entries: z.array(settingLibraryEntrySchema),
  groups: z.array(settingLibraryGroupSchema),
  promptPositions: z.array(settingLibraryPromptPositionSchema),
  toolGroups: z.array(agentToolGroupSchema),
  subagentModelSelection: subagentModelSelectionSchema,
  roleplayPlan: roleplayPlanSettingsSchema,
  regexRules: z.array(regexRuleSchema),
  expandedGroupIds: z.array(z.string())
}).strict()

export const agentPresetImportDocumentSchema = z.object({
  displayName: z.string().min(1).max(260),
  mimeType: z.string().max(120),
  base64: z.string().min(1).max(90 * 1024 * 1024)
}).strict()

export const agentPresetImportSourceSchema = z.enum(['eleckoi', 'sillytavern'])

export const agentPresetImportResultSchema = z.object({
  preset: agentPresetSchema,
  source: agentPresetImportSourceSchema,
  skippedUnsupportedEntries: z.number().int().nonnegative(),
  skippedDepthRegexCount: z.number().int().nonnegative()
}).strict()

export const agentPresetExportResultSchema = z.object({
  fileName: z.string().min(1),
  json: z.string().min(1)
}).strict()

export type AgentPreset = z.output<typeof agentPresetSchema>
export type AgentPresetCatalog = z.output<typeof agentPresetCatalogSchema>
export type AgentPresetImportDocument = z.output<typeof agentPresetImportDocumentSchema>
export type AgentPresetImportResult = z.output<typeof agentPresetImportResultSchema>
export type AgentPresetImportSource = z.output<typeof agentPresetImportSourceSchema>
export type AgentPresetLibraryGroup = z.output<typeof agentPresetLibraryGroupSchema>
export type AgentPresetProfile = z.output<typeof agentPresetProfileSchema>
export type AgentPresetSummary = z.output<typeof agentPresetSummarySchema>
export type SubagentModelSelection = z.output<typeof subagentModelSelectionSchema>
