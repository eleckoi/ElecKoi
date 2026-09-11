import { z } from 'zod'

export const webSearchModeSchema = z.enum(['provider_native', 'tavily'])

export const webSearchSettingsSchema = z.object({
  mode: webSearchModeSchema,
  apiKeyConfigured: z.boolean(),
  maxResults: z.union([z.literal(3), z.literal(5), z.literal(8)])
})

export const webSearchSettingsUpdateSchema = webSearchSettingsSchema.pick({
  mode: true,
  maxResults: true
})

export const tavilyConnectionSchema = z.object({
  ok: z.literal(true),
  plan: z.string(),
  used: z.number().int().nonnegative(),
  limit: z.number().int().nonnegative()
})

export type WebSearchMode = z.infer<typeof webSearchModeSchema>
export type WebSearchSettings = z.infer<typeof webSearchSettingsSchema>
export type WebSearchSettingsUpdate = z.infer<typeof webSearchSettingsUpdateSchema>
export type TavilyConnection = z.infer<typeof tavilyConnectionSchema>

