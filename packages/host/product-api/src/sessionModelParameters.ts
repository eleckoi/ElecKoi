import { z } from 'zod'
import type { SessionModelParameterPatch, SessionModelParameterState } from './types.js'
export type { SessionModelParameterPatch, SessionModelParameterState } from './types.js'

export const SESSION_MODEL_PARAMETERS = 'eleckoiModelParameters'
export const SESSION_MODEL_PARAMETERS_EVENT = 'eleckoi/model-parameters'
const tokens = z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable().optional()
export const sessionModelParameterPatchSchema = z.object({
  contextWindowTokens: tokens, maxOutputTokens: tokens, autoCompactTokenLimit: tokens,
  temperature: z.number().finite().nonnegative().nullable().optional(),
  topP: z.number().finite().min(0).max(1).nullable().optional(),
}).strict()
export const sessionModelParameterKey = (provider: string, model: string): string => JSON.stringify([provider, model])
const stateSchema = z.object({ revision: z.number().int().nonnegative(), entries: z.record(z.string(), sessionModelParameterPatchSchema) }).strict().transform(value => value as SessionModelParameterState)

/** Official Session projection owns persistence, rewind, inheritance and client subscriptions. */
export const sessionModelParametersProjection = {
  key: SESSION_MODEL_PARAMETERS as 'eleckoiModelParameters', stateVersion: 1, stateSchema,
  init: (): SessionModelParameterState => ({ revision: 0, entries: {} }),
  apply(state: SessionModelParameterState, event: { type: string; data: unknown }): SessionModelParameterState {
    if (event.type !== SESSION_MODEL_PARAMETERS_EVENT) return state
    return stateSchema.parse(event.data)
  },
  wire: { viewSchema: stateSchema, view: (state: SessionModelParameterState) => state },
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    'eleckoi/model-parameters': SessionModelParameterState
  }
}
declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap { eleckoiModelParameters: SessionModelParameterState }
  interface SessionProjectionStateMap { eleckoiModelParameters: SessionModelParameterState }
}
