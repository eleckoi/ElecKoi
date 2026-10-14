import { z } from 'zod'

export const INPUT_CONTINUATION_EVENT = 'eleckoi/input-continuation'
export const INPUT_CONTINUATIONS_PROJECTION = 'eleckoiInputContinuations'
const linkSchema = z.object({
  turn: z.number().int().positive(), inputEventSeq: z.number().int().nonnegative(), inputMessageId: z.string().min(1),
  mode: z.literal('continue').optional(), targetAssistantMessageId: z.string().min(1).optional(),
  requestId: z.string().min(1).optional(), operationId: z.string().min(1).optional()
}).strict()
const inputSchema = z.object({
  turn: z.number().int().nonnegative(), eventSeq: z.number().int().nonnegative(), messageId: z.string().min(1)
}).strict()
const viewSchema = z.object({ links: z.array(linkSchema), inputs: z.array(inputSchema) }).strict()
const stateSchema = viewSchema.extend({ currentTurn: z.number().int().nonnegative() }).strict()

/** Exact durable input identities for assistant turns that do not append a user event. */
export const inputContinuationsProjection = {
  key: INPUT_CONTINUATIONS_PROJECTION,
  stateVersion: 3,
  stateSchema,
  init: () => ({ links: [], inputs: [], currentTurn: 0 }),
  apply(state, event) {
    if (event.type === 'turn/start') return { ...state, currentTurn: event.data.turn }
    if (event.type === 'turn/end' && state.currentTurn === event.data.turn) return { ...state, currentTurn: 0 }
    if (event.type === 'user/message' && event.data.source.kind === 'user') {
      const input = inputSchema.parse({
        turn: state.currentTurn, eventSeq: event.seq, messageId: event.data.id
      })
      return { ...state, inputs: [...state.inputs.filter(item => item.eventSeq !== event.seq), input] }
    }
    if (event.type !== INPUT_CONTINUATION_EVENT) return state
    const link = linkSchema.parse(event.data)
    return { ...state, links: [...state.links.filter(item => item.turn !== link.turn), link] }
  },
  wire: { viewSchema, view: ({ links, inputs }) => ({ links, inputs }) }
}
