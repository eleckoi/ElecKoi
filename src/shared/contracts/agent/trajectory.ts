import { z } from 'zod'

export const agentTrajectoryRecordKindSchema = z.enum([
  'system',
  'user',
  'context',
  'assistant',
  'tool',
  'compaction'
])

export const agentTrajectoryRecordStatusSchema = z.enum([
  'running',
  'complete',
  'error',
  'cancelled'
])

export const agentTrajectoryRequestSchema = z.object({
  number: z.number().int().positive(),
  seq: z.number().int().nonnegative(),
  turn: z.number().int().positive().nullable(),
  step: z.number().int().positive().nullable(),
  status: agentTrajectoryRecordStatusSchema,
  reason: z.string(),
  provider: z.string(),
  model: z.string(),
  detail: z.string(),
  rawJson: z.string(),
  timeMillis: z.number().int().nonnegative().nullable(),
  durationMillis: z.number().int().nonnegative().nullable()
})

export const agentTrajectoryRecordSchema = z.object({
  id: z.string().min(1),
  index: z.number().int().positive(),
  seq: z.number().int().nonnegative(),
  type: z.string().min(1),
  kind: agentTrajectoryRecordKindSchema,
  title: z.string(),
  preview: z.string(),
  source: z.string(),
  input: z.string(),
  output: z.string(),
  detail: z.string(),
  rawJson: z.string(),
  timeMillis: z.number().int().nonnegative().nullable(),
  durationMillis: z.number().int().nonnegative().nullable(),
  turn: z.number().int().positive().nullable(),
  step: z.number().int().positive().nullable(),
  status: agentTrajectoryRecordStatusSchema,
  requests: z.array(agentTrajectoryRequestSchema)
})

export const agentTrajectorySnapshotSchema = z.object({
  conversationId: z.string().min(1),
  runtimeThreadId: z.string().min(1).nullable(),
  records: z.array(agentTrajectoryRecordSchema),
  totalRecords: z.number().int().nonnegative(),
  hasMore: z.boolean(),
  beforeIndex: z.number().int().positive().nullable(),
  startedAtMillis: z.number().int().nonnegative().nullable(),
  completedAtMillis: z.number().int().nonnegative().nullable()
})

export type AgentTrajectoryRecord = z.infer<typeof agentTrajectoryRecordSchema>
export type AgentTrajectoryRequest = z.infer<typeof agentTrajectoryRequestSchema>
export type AgentTrajectorySnapshot = z.infer<typeof agentTrajectorySnapshotSchema>
