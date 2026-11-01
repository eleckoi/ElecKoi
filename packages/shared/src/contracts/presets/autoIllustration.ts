import { z } from 'zod'

export const AUTO_ILLUSTRATION_PLUGIN = '@eleckoi/dsh-auto-illustration'
export const autoIllustrationSchema = z.object({
  enabled: z.boolean().default(false),
  modelConfigId: z.string().default('')
}).strict()
