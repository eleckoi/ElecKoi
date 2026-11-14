import { z } from 'zod'

export const updatePhaseSchema = z.enum([
  'disabled',
  'idle',
  'checking',
  'available',
  'downloading',
  'verifying',
  'ready',
  'installing',
  'error'
])

export const updateProgressSchema = z.object({
  percent: z.number().min(0).max(100),
  transferredBytes: z.number().nonnegative(),
  totalBytes: z.number().nonnegative(),
  bytesPerSecond: z.number().nonnegative()
})

export const updateStatusSchema = z.object({
  phase: updatePhaseSchema,
  currentVersion: z.string().min(1),
  availableVersion: z.string().min(1).nullable(),
  releaseName: z.string().nullable(),
  releaseNotes: z.string().nullable(),
  releaseDate: z.string().nullable(),
  downloadSizeBytes: z.number().nonnegative().nullable(),
  progress: updateProgressSchema.nullable(),
  message: z.string().nullable(),
  failedOperation: z.enum(['check', 'download', 'install', 'configuration']).optional()
})

export const updateInstallResultSchema = z.object({
  accepted: z.boolean(),
  reason: z.enum(['not_ready', 'agent_running']).nullable()
})

export type UpdateStatus = z.infer<typeof updateStatusSchema>
export type UpdateInstallResult = z.infer<typeof updateInstallResultSchema>
