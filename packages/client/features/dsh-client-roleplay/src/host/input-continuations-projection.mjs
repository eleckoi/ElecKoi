import { z } from 'zod'

export const INPUT_CONTINUATION_EVENT = 'eleckoi/input-continuation'
export const INPUT_CONTINUATIONS_PROJECTION = 'eleckoiInputContinuations'
const linkSchema = z.object({
  turn: z.number().int().positive(), inputEventSeq: z.number().int().nonnegative(), inputMessageId: z.string().min(1),
  kind: z.literal('subagent').optional()
}).strict()
const inputSchema = z.object({
  turn: z.number().int().nonnegative(), eventSeq: z.number().int().nonnegative(), messageId: z.string().min(1)
}).strict()
const viewSchema = z.object({ links: z.array(linkSchema), inputs: z.array(inputSchema) }).strict()
const stateSchema = viewSchema.extend({
  currentTurn: z.number().int().nonnegative(), children: z.record(z.string(), inputSchema),
  sends: z.record(z.string(), z.object({ childId: z.string(), input: inputSchema }).strict())
}).strict()

function currentInput(state) {
  const direct = state.inputs.findLast(input => input.turn === state.currentTurn)
  if (direct) return direct
  const link = state.links.find(link => link.turn === state.currentTurn)
  return link && state.inputs.find(input => input.eventSeq === link.inputEventSeq && input.messageId === link.inputMessageId)
}

/** Exact durable input identities for assistant turns that do not append a user event. */
export const inputContinuationsProjection = {
  key: INPUT_CONTINUATIONS_PROJECTION,
  stateVersion: 3,
  stateSchema,
  init: () => ({ links: [], inputs: [], currentTurn: 0, children: {}, sends: {} }),
  apply(state, event) {
    if (event.type === 'turn/start') return { ...state, currentTurn: event.data.turn }
    if (event.type === 'turn/end' && state.currentTurn === event.data.turn) return { ...state, currentTurn: 0, sends: {} }
    if (event.type === 'user/message' && event.data.source.kind === 'user') {
      const input = inputSchema.parse({
        turn: state.currentTurn, eventSeq: event.seq, messageId: event.data.id
      })
      return { ...state, inputs: [...state.inputs.filter(item => item.eventSeq !== event.seq), input] }
    }
    if (event.type === 'subagent/catalog') {
      const input = currentInput(state)
      if (input) return { ...state, children: { ...state.children, [event.data.childId]: input } }
    }
    if (event.type === 'tool/call' && event.data.name === 'send_message') {
      let args
      try { args = JSON.parse(event.data.arguments) } catch { return state }
      const input = currentInput(state)
      if (input && state.children[args?.agent_id]) return { ...state, sends: { ...state.sends,
        [event.data.callId]: { childId: args.agent_id, input }
      } }
    }
    if (event.type === 'tool/result') {
      const callId = event.data.message.toolCallId
      const sent = state.sends[callId]
      if (sent) {
        const { [callId]: _settled, ...sends } = state.sends
        return { ...state, sends, ...(!event.data.message.isError ? { children: { ...state.children, [sent.childId]: sent.input } } : {}) }
      }
    }
    if (event.type === 'user/message' && ['agent-message', 'subagent-settled'].includes(event.data.source.kind)
      && state.currentTurn > 0 && !currentInput(state)) {
      // Follow the sender's actual delegation, including successful follow-ups;
      // a delayed child must never attach to a newer, unrelated human input.
      const input = state.children[event.data.source.senderSessionId]
      if (input && input.turn !== state.currentTurn) return { ...state, links: [...state.links, {
        turn: state.currentTurn, inputEventSeq: input.eventSeq, inputMessageId: input.messageId, kind: 'subagent'
      }] }
    }
    if (event.type !== INPUT_CONTINUATION_EVENT) return state
    const link = linkSchema.parse(event.data)
    return { ...state, links: [...state.links.filter(item => item.turn !== link.turn), link] }
  },
  wire: { viewSchema, view: ({ links, inputs }) => ({ links, inputs }) }
}
