import { z } from 'zod'

const schema = z.string().max(480)
const activitySchema = z.number().int().nonnegative()

/** A single replayable timestamp covers new input and regeneration without copying message history. */
export const conversationActivityProjection = {
  key: 'eleckoiConversationActivity',
  stateVersion: 1,
  stateSchema: activitySchema,
  init: () => 0,
  apply(state, event) {
    return event.type === 'turn/start'
      || (event.type === 'user/message' && event.data.source?.kind === 'user')
      ? Math.max(state, event.time) : state
  },
  wire: { viewSchema: activitySchema, view: state => state }
}

/** The official projection cache owns the bounded catalog preview across restarts and rewinds. */
export const conversationPreviewProjection = {
  key: 'eleckoiConversationPreview',
  stateVersion: 1,
  stateSchema: schema,
  init: () => '',
  apply(state, event) {
    let message
    if (event.type === 'user/message' && event.data.source?.kind === 'user') message = event.data
    if (event.type === 'assistant/message' && event.surfaceOp === 'append') message = event.data.message
    if (!message) return state
    const text = message.content.filter(block => block.type === 'text').map(block => block.text).join('').trim()
    return text ? [...text].slice(0, 240).join('') : state
  },
  wire: { viewSchema: schema, view: state => state }
}
