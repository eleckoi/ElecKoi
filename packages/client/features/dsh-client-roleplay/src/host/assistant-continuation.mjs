import { createUserMessage } from '@deepseek-ai/dsh-llm'

export const ASSISTANT_CONTINUATION_SOURCE = 'plugin:eleckoi-assistant-continuation'
export const ASSISTANT_CONTINUATION_INSTRUCTION = 'Continue the last assistant response directly from its current end. Preserve the existing response and do not restart, repeat, summarize, or quote it. Return only the new continuation, using the current Agent preset and its normal final-response format. Use the available tools when needed.'

/** Continuation links are durable Session records, never a second transcript. */
export function assistantContinuationLinks(events) {
  return events.filter(event => event.type === 'eleckoi/input-continuation' && event.data.mode === 'continue')
    .map(event => event.data).sort((a, b) => a.turn - b.turn)
}

/** Fold native settled bodies for the public chat contract, retaining root identity. */
export function mergeAssistantContinuationRows(rows, links) {
  for (const link of links) {
    const target = rows.find(row => row.role === 'assistant' && (row.dshMessageId === link.targetAssistantMessageId
      || row.continuationMessageIds?.includes(link.targetAssistantMessageId)))
    const suffix = rows.find(row => row.role === 'assistant' && row.dshTurn === link.turn)
    if (!suffix || target === suffix) continue
    // If a composite reply was converted to another role, its retained trace
    // must not expose an empty continuation as a new chat floor.
    if (!target) { if (!String(suffix.content ?? '').trim()) rows.splice(rows.indexOf(suffix), 1); continue }
    target.content += suffix.content
    const raw = String(target.rawContent ?? ''), marker = raw.indexOf('<FINAL>')
    target.rawContent = marker < 0 ? target.content : `${raw.slice(0, marker)}<FINAL>\n${target.content}\n</FINAL>`
    target.status = suffix.status
    target.variableStateJson = suffix.variableStateJson
    target.continuationMessageIds = [...(target.continuationMessageIds ?? []), suffix.dshMessageId]
    target.continuationEventSeqs = [...(target.continuationEventSeqs ?? []), suffix.sessionEventSeq]
    target.continuationTurns = [...(target.continuationTurns ?? []), suffix.dshTurn]
    rows.splice(rows.indexOf(suffix), 1)
  }
  return rows
}

/** Final continuation events to fold when the user edits the complete bubble. */
export function assistantContinuationSuffixEvents(events, rootId) {
  const turns = new Set(assistantContinuationLinks(events).filter(link => link.targetAssistantMessageId === rootId).map(link => link.turn))
  const byTurn = new Map()
  for (const event of events) {
    if (event.type !== 'assistant/message' || !turns.has(event.data.turn) || event.surfaceOp !== 'append') continue
    const message = event.data.message
    if (message.content?.some(block => block.type === 'tool-call')) continue
    const text = message.content?.filter(block => block.type === 'text').map(block => block.text).join('') ?? ''
    if (text.includes('<FINAL>') || message.source?.model === 'authored-message') byTurn.set(event.data.turn, event)
  }
  return [...byTurn.values()]
}

/** Select the original input and displayed reply root without removing any native history. */
export function assistantContinuationTarget(agent) {
  if (agent.status !== 'idle' || agent.inbox.hasPending) throw new Error('续写需要已停止且没有排队输入的聊天。')
  const messages = agent.session.deriveMessages()
  const reply = messages.findLast(message => message.role === 'assistant'
    && message.content?.some(block => block.type === 'text' && block.text?.length)
    && !message.content.some(block => block.type === 'tool-call'))
  if (!reply) throw new Error('当前聊天没有可续写的模型正文。')
  const input = messages.slice(0, messages.indexOf(reply)).findLast(message => message.role === 'user' && message.source?.kind === 'user')
  if (!input || messages.slice(messages.indexOf(reply) + 1).some(message => message.source?.kind === 'user'))
    throw new Error('模型正文后已有新的用户输入，不能续写旧回复。')
  const events = agent.session.snapshotEvents()
  const inputEvent = events.find(event => event.type === 'user/message' && event.data.id === input.id)
  if (!inputEvent) throw new Error('续写对应的原始用户输入不在正式 Session 中。')
  let replyTurn = 0
  for (const event of events) if (event.type === 'assistant/message' && event.data.message.id === reply.id) replyTurn = event.data.turn
  const previous = events.findLast(event => event.type === 'eleckoi/input-continuation' && event.data.mode === 'continue' && event.data.turn === replyTurn)
  return { inputMessageId: input.id, inputEventSeq: Number(inputEvent.seq),
    targetAssistantMessageId: previous?.data.targetAssistantMessageId ?? reply.id,
    text: input.content.filter(block => block.type === 'text').map(block => block.text).join('') }
}

/** Native Agent admission; the control message is durable and every prior turn remains untouched. */
export function startAssistantContinuation(agent, target, requestId, operationId, signal) {
  signal.throwIfAborted()
  const previous = agent.session.snapshotEvents().find(event => event.type === 'eleckoi/input-continuation'
    && event.data.mode === 'continue' && event.data.requestId === requestId)
  if (previous) return { turn: previous.data.turn, operationId: previous.data.operationId }
  if (agent.status !== 'idle' || agent.inbox.hasPending) throw new Error('续写准备期间聊天开始了其它生成。')
  const turn = agent.session.snapshotEvents().filter(event => event.type === 'turn/start').at(-1)?.data.turn + 1 || 1
  agent.session.append('eleckoi/input-continuation', { turn, inputMessageId: target.inputMessageId,
    inputEventSeq: target.inputEventSeq, mode: 'continue', targetAssistantMessageId: target.targetAssistantMessageId,
    requestId, operationId }, { ignorable: true })
  agent.followup(createUserMessage({ content: [{ type: 'text', text: ASSISTANT_CONTINUATION_INSTRUCTION }],
    source: { kind: ASSISTANT_CONTINUATION_SOURCE, rpcId: requestId, targetAssistantMessageId: target.targetAssistantMessageId } }))
  return { turn, operationId }
}
