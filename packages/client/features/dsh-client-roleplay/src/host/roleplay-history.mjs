import {
  createRoleplayReplyAccumulator, DELEGATED_ROLEPLAY_REPLY_EVENT, delegatedRoleplayReplyBlocks,
  isDelegatedRoleplayReply, ROLEPLAY_OUTPUT_EVENT,
} from '@eleckoi/dsh-product-api'

const emptyReplies = Object.freeze([])

/** Share derived replies across reads of the same live DSH Session. */
export function createRoleplayHistoryReader(ctx) {
  const bySession = new WeakMap()
  ctx.on('session/disposed', session => { bySession.delete(session) })
  ctx.on('session/event', (session, event) => {
    const history = bySession.get(session)
    if (!history || event.seq < history.nextSeq) return
    if (event.seq !== history.nextSeq) {
      bySession.delete(session)
      return
    }
    history.nextSeq += 1
    if (event.type === ROLEPLAY_OUTPUT_EVENT || event.type === 'assistant/message'
      || event.type === 'tool/result' || event.type === 'turn/end' || event.type === DELEGATED_ROLEPLAY_REPLY_EVENT) {
      history.pending.push(event)
    }
  })

  return async function readRoleplayReplies(sessionId, signal) {
    const session = ctx.sessions.get(sessionId)
    // A batch is committed before its events are individually published.
    // Only use the incremental result after the feed reaches the live cut.
    const cached = session && bySession.get(session)
    if (cached && cached.nextSeq === session.seq) {
      signal?.throwIfAborted()
      try {
        const replies = foldReplies(cached, cached.pending)
        cached.pending.length = 0
        return replies
      } catch (error) {
        bySession.delete(session)
        throw error
      }
    }

    const observation = await ctx.sessionQuery.observeSession(sessionId, { projectionMode: 'none', ...(signal ? { signal } : {}) })
    try {
      const history = {
        append: createRoleplayReplyAccumulator(),
        replies: [], processOnly: [], delegated: [], snapshot: emptyReplies,
        nextSeq: observation.cursor + 1, pending: [],
      }
      const replies = foldReplies(history, observation.events)
      if (session && ctx.sessions.get(sessionId) === session && observation.source === 'live'
        && observation.header === session.header && history.nextSeq === session.seq) {
        bySession.set(session, history)
      }
      return replies
    } finally {
      observation[Symbol.dispose]()
    }
  }
}

function foldReplies(history, events) {
  const delegatedCount = history.delegated.length
  for (const event of events) {
    if (isDelegatedRoleplayReply(event)) {
      const blocks = delegatedRoleplayReplyBlocks(event.data)
      history.delegated.push({ event, anchorMessageId: event.data.anchorMessageId,
        messageId: 'eleckoi-delegated-reply-' + event.data.id, blocks,
        content: blocks.map(block => `${block.speakerName}：${block.text}`).join('\n\n') })
      continue
    }
    const reply = history.append(event)
    if (!reply) continue
    if ('messageId' in reply) history.replies.push(reply)
    else history.processOnly.push(reply)
  }
  if (history.delegated.length !== delegatedCount) {
    history.delegated.sort((left, right) => (left.event.data.anchorSeq ?? left.event.seq) - (right.event.data.anchorSeq ?? right.event.seq))
  }
  if (history.snapshot.length !== history.replies.length + history.processOnly.length + history.delegated.length) {
    history.snapshot = Object.freeze([...history.replies, ...history.processOnly, ...history.delegated])
  }
  return history.snapshot
}
