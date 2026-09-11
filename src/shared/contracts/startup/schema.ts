import { z } from 'zod'

export const startupProfileSchema = z.object({
  version: z.literal(1).default(1),
  disableHardwareAcceleration: z.boolean().default(false),
  userDataPath: z.string().default('')
})

export type StartupProfile = z.output<typeof startupProfileSchema>
