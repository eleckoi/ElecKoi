import { z } from 'zod'
import { INPUT_CONTINUATION_EVENT } from './input-continuations-projection.mjs'

// RETIRE WHEN: 停止历史补回的写入后，已迁移日志仍含此标记；只有受支持的旧日志
// 已完成等价统计转换并能正确重放时，才能删除该标记分支、专用状态及旧日志用例。
// INPUT_CONTINUATION_EVENT 仍用于当前已有输入续接，必须保留其统计与投影登记。
export const HISTORY_RESTORED_EVENT = 'eleckoi/history-restored'
export const HISTORY_STATS_PROJECTION = 'eleckoiHistoryStatsAdjustment'
export const historyRestoredSchema = z.object({ messageIds: z.array(z.string().min(1)).min(1) }).strict()

/** Presentation-only discounts for retained input boundaries without a model request. */
export const historyStatsProjection = {
  key: HISTORY_STATS_PROJECTION,
  stateVersion: 2,
  stateSchema: z.object({
    messageIds: z.array(z.string()),
    step: z.object({ turn: z.number().int().positive(), historical: z.boolean(), requested: z.boolean(),
      inputEventSeq: z.number().int().nonnegative().nullable(), inputMessageId: z.string().nullable() }).nullable(),
    closedInputs: z.array(z.object({ eventSeq: z.number().int().nonnegative(), messageId: z.string(), turn: z.number().int().positive(), discounted: z.boolean() })),
    steps: z.number().int().nonnegative(),
    candidateTurns: z.array(z.number().int().positive()),
    requestedTurns: z.array(z.number().int().positive())
  }).strict(),
  init: () => ({ messageIds: [], step: null, closedInputs: [], steps: 0, candidateTurns: [], requestedTurns: [] }),
  apply(state, event) {
    if (event.type === INPUT_CONTINUATION_EVENT) {
      const retained = state.closedInputs.find(item => item.eventSeq === event.data.inputEventSeq
        && item.messageId === event.data.inputMessageId && !item.discounted)
      if (!retained) return state
      return { ...state, steps: state.steps + 1,
        closedInputs: state.closedInputs.map(item => item === retained ? { ...item, discounted: true } : item),
        candidateTurns: [...new Set([...state.candidateTurns, retained.turn])] }
    }
    if (event.type === HISTORY_RESTORED_EVENT) {
      const { messageIds } = historyRestoredSchema.parse(event.data)
      return { ...state, messageIds: [...new Set([...state.messageIds, ...messageIds])] }
    }
    if (event.type === 'step/start') return { ...state, step: { turn: event.data.turn, historical: false, requested: false, inputEventSeq: null, inputMessageId: null } }
    if (!state.step) return state
    if (event.type === 'user/message' && event.data.source.kind === 'user') {
      return { ...state, step: { ...state.step, inputEventSeq: event.seq, inputMessageId: event.data.id,
        historical: state.messageIds.includes(event.data.id) } }
    }
    if (['request/header', 'request/context', 'assistant/chunk', 'assistant/message', 'assistant/attempt', 'llm/retry', 'eleckoi/request-context'].includes(event.type)) {
      return { ...state, step: { ...state.step, requested: true },
        requestedTurns: [...new Set([...state.requestedTurns, state.step.turn])] }
    }
    if (event.type === 'step/end') {
      const excluded = state.step.historical && !state.step.requested
      return { ...state, step: null, steps: state.steps + Number(excluded),
        closedInputs: state.step.inputEventSeq !== null && !state.step.requested
          ? [...state.closedInputs.filter(item => item.eventSeq !== state.step.inputEventSeq), {
            eventSeq: state.step.inputEventSeq, messageId: state.step.inputMessageId, turn: state.step.turn, discounted: excluded,
          }] : state.closedInputs,
        candidateTurns: excluded ? [...new Set([...state.candidateTurns, state.step.turn])] : state.candidateTurns }
    }
    if (event.type === 'turn/end') return { ...state, step: null }
    return state
  },
  wire: {
    viewSchema: z.object({ steps: z.number().int().nonnegative(), turns: z.number().int().nonnegative() }).strict(),
    view: state => ({ steps: state.steps,
      turns: state.candidateTurns.filter(turn => !state.requestedTurns.includes(turn)).length })
  }
}
