import { z } from 'zod'

export const HISTORY_RESTORED_EVENT: 'eleckoi/history-restored'
export const HISTORY_STATS_PROJECTION: 'eleckoiHistoryStatsAdjustment'
export const historyRestoredSchema: z.ZodObject<{ messageIds: z.ZodArray<z.ZodString> }>

export interface HistoryStatsState {
  messageIds: string[]
  step: { turn: number; historical: boolean; requested: boolean } | null
  steps: number
  candidateTurns: number[]
  requestedTurns: number[]
}

export const historyStatsProjection: {
  key: typeof HISTORY_STATS_PROJECTION
  stateVersion: number
  stateSchema: z.ZodType<HistoryStatsState>
  init(): HistoryStatsState
  apply(state: HistoryStatsState, event: { type: string; data: unknown }): HistoryStatsState
  wire: {
    viewSchema: z.ZodType<{ steps: number; turns: number }>
    view(state: HistoryStatsState): { steps: number; turns: number }
  }
}
