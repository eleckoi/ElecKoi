import { z } from 'zod'
import { settingLibraryEntrySchema } from '../settingLibrary/schemas'

/** Creator prompts share the tree editor, but only support literal text and required/optional reads. */
export const creatorPresetEntrySchema = settingLibraryEntrySchema.extend({
  agentReadStrategy: z.enum(['required', 'normal']),
  dynamicMode: z.literal('standard'),
  contentMode: z.literal('plain_text'),
  keywords: z.array(z.string()).length(0),
  keywordScanDepth: z.literal(1),
  conditionKeywords: z.array(z.string()).length(0),
  keywordCondition: z.literal('none'),
  keywordUseRegex: z.literal(false),
  keywordIgnoreCase: z.literal(true),
  keywordWholeWord: z.literal(false),
  keywordRecursionDepth: z.literal(0),
})
