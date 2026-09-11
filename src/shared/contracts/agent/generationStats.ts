import { z } from 'zod'

const tokenUsageSchema = z.object({
  uncachedInputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cacheReadTokens: z.number().int().nonnegative(),
  cacheWriteTokens: z.number().int().nonnegative()
}).strict()

const contextPressureSchema = z.object({
  pressureTokens: z.number().int().nonnegative().optional(),
  projectedTokens: z.number().int().nonnegative().optional(),
  contextWindow: z.number().int().positive().optional()
}).strict()

const contextBreakdownSchema = z.object({
  systemTokens: z.number().int().nonnegative(),
  toolsTokens: z.number().int().nonnegative(),
  messageTokens: z.number().int().nonnegative()
}).strict()

export const agentGenerationStatsSchema = z.object({
  turns: z.number().int().nonnegative(),
  steps: z.number().int().nonnegative(),
  llmMs: z.number().nonnegative(),
  toolMs: z.number().nonnegative(),
  ttftMs: z.number().nonnegative(),
  ttftSteps: z.number().int().nonnegative(),
  decodeMs: z.number().nonnegative(),
  decodeTokens: z.number().nonnegative(),
  tokenUsage: tokenUsageSchema,
  contextPressure: contextPressureSchema,
  contextBreakdown: contextBreakdownSchema
}).strict()

export type AgentGenerationStats = z.output<typeof agentGenerationStatsSchema>
