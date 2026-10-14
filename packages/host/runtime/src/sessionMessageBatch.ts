import { createAssistantMessage, createSystemMessage, createUserMessage } from '@deepseek-ai/dsh-llm'

declare module '@deepseek-ai/dsh-llm/message' {
  interface MessageSourceMap { 'plugin:eleckoi-author-system': { kind: 'plugin:eleckoi-author-system' } }
}
import { readEditableDshSessionLog, rewriteDshSessionEvents, type EditableSessionEvent, type EditableSessionJson, type EditableSessionObject } from './sessionMessageEdit'
import { assistantContinuationSuffixEvents } from '@eleckoi/dsh-client-roleplay/host/assistant-continuation.mjs'

export interface SessionMessageBatchItem {
  id?: string
  eventSeq?: number
  role: 'user' | 'assistant' | 'system'
  content: string
}
export interface SessionMessageBatchResult {
  messages: Array<{ id: string; eventSeq: number; turn: number | null; role: SessionMessageBatchItem['role'] }>
  turns: Array<{ previous: number; current: number }>
  sequences: Array<{ previous: number; current: number }>
}
const object = (value: EditableSessionJson | undefined): value is EditableSessionObject => !!value && typeof value === 'object' && !Array.isArray(value)
const record = (value: EditableSessionJson | undefined): EditableSessionObject => object(value) ? value : {}
const array = (value: EditableSessionJson | undefined): readonly EditableSessionJson[] => Array.isArray(value) ? value : []
type Chunk = { events: EditableSessionEvent[]; selected?: EditableSessionEvent; item?: SessionMessageBatchItem }

/** Reorder native message/turn units, retaining their complete tool and reasoning trace. */
export function batchDshSessionMessages(sessionRoot: string, sessionId: string,
  previous: SessionMessageBatchItem[], desired: SessionMessageBatchItem[]): SessionMessageBatchResult {
  const log = readEditableDshSessionLog(sessionRoot, sessionId)
  // Author writes can precede the first Agent request. Reserve the official
  // system head just as transcript import does, so a later system update does
  // not follow an unprotected user/assistant surface after reopening the log.
  const firstSurface = log.events.find(event => event.surfaceOp !== undefined)
  const initialization: Chunk | undefined = firstSurface?.type === 'system/message' ? undefined : createChunk({ role: 'system', content: '' }, true)
  if (initialization) { delete initialization.item; delete initialization.selected }
  const original = new Map(previous.filter(item => item.eventSeq !== undefined).map(item => [item.eventSeq!, item]))
  const units = new Map<number, Chunk>(), originalOrder: Chunk[] = []
  const remember = (chunk: Chunk) => {
    originalOrder.push(chunk)
    if (chunk.selected) units.set(Number(chunk.selected.seq), chunk)
  }
  for (let index = 0; index < log.events.length;) {
    const event = log.events[index]!
    if (event.type !== 'turn/start') {
      remember({ events: [event], ...(original.has(Number(event.seq)) ? { selected: event } : {}) })
      index++; continue
    }
    const events: EditableSessionEvent[] = []
    const turn = record(event.data).turn
    do { events.push(log.events[index++]!) }
    while (index < log.events.length && !(events.at(-1)?.type === 'turn/end' && record(events.at(-1)?.data).turn === turn))
    if (events.at(-1)?.type !== 'turn/end') throw new Error('消息批次操作需要已结束的 Agent 回合。')
    const directInput = (event: EditableSessionEvent) => event.type === 'user/message' && record(record(event.data).source).kind === 'user'
    const selected = events.find(item => original.has(Number(item.seq)) && !directInput(item))
    const users = events.filter(item => original.has(Number(item.seq)) && directInput(item))
    for (const user of users) remember({ events: [user], selected: user })
    const chunk = { events: events.filter(item => !users.includes(item)), ...(selected ? { selected } : {}) }
    remember(chunk)
  }
  // A group admission is written immediately before turn/start. Its durable
  // speaker record belongs to that exact actor turn when the reply moves/deletes.
  for (const chunk of [...originalOrder]) {
    if (chunk.events.length !== 1 || chunk.events[0]?.type !== 'eleckoi/group-response') continue
    const actor = chunk.events[0], actorTurn = record(actor.data).turn
    const target = originalOrder.find(candidate => candidate.events.some(event => event.type === 'turn/start' && record(event.data).turn === actorTurn))
    if (!target) throw new Error('群聊发言记录缺少其正式 Agent 回合。')
    target.events.unshift(actor)
    originalOrder.splice(originalOrder.indexOf(chunk), 1)
  }
  // The native Agent may create its protected system head inside the same
  // turn as the first reply. It must remain the first surface event when that
  // reply moves; every later system replacement still references its real ID.
  if (firstSurface?.type === 'system/message') {
    const chunk = originalOrder.find(item => item.events.includes(firstSurface))
    if (chunk?.selected) {
      chunk.events = chunk.events.filter(event => event !== firstSurface)
      // V4 requires system/message to belong to an open turn/step. Give the
      // original head its own closed initialization envelope, retaining its
      // exact seq/message ID for provider state and later surface replacements.
      const created = createChunk({ role: 'system', content: '' }, true)
      const envelope: Chunk = { events: created.events }
      const head: EditableSessionEvent = { ...firstSurface, data: { ...record(firstSurface.data), turn: -1, step: 1 } }
      envelope.events[envelope.events.indexOf(created.selected)] = head
      originalOrder.unshift(envelope)
    }
  }
  // A public reply includes all of its continuation turns. Keep each native
  // tool/reasoning envelope beside its root when moving or deleting the floor.
  const folded = new Set<Chunk>(), roots = new Map<string, Chunk>()
  for (const chunk of originalOrder) {
    const message = record(record(chunk.selected?.data).message)
    if (chunk.selected?.type === 'assistant/message' && typeof message.id === 'string') roots.set(message.id, chunk)
  }
  for (const chunk of originalOrder) {
    const links = chunk.events.filter(event => event.type === 'eleckoi/input-continuation' && record(event.data).mode === 'continue')
    for (const link of links) {
      const data = record(link.data), root = typeof data.targetAssistantMessageId === 'string' ? roots.get(data.targetAssistantMessageId) : undefined
      const suffix = originalOrder.find(candidate => candidate.events.some(event => event.type === 'turn/start' && record(event.data).turn === data.turn))
      if (!root || !suffix || root === suffix) continue
      if (chunk !== root) { root.events.push(...chunk.events); folded.add(chunk) }
      root.events.push(...suffix.events); folded.add(suffix)
      for (const event of suffix.events) {
        const id = record(record(event.data).message).id
        if (event.type === 'assistant/message' && typeof id === 'string') roots.set(id, root)
      }
    }
  }
  for (let index = originalOrder.length - 1; index >= 0; index--) if (folded.has(originalOrder[index]!)) originalOrder.splice(index, 1)
  const used = new Set<number>()
  const desiredChunks: Chunk[] = []
  for (const item of desired) {
    if (!['user', 'assistant', 'system'].includes(item.role) || typeof item.content !== 'string') throw new TypeError('消息角色或正文无效。')
    let chunk: Chunk
    if (item.eventSeq !== undefined) {
      const existing = units.get(item.eventSeq)
      if (!existing?.selected || used.has(item.eventSeq)) throw new Error(`消息事件不存在或重复：${item.eventSeq}`)
      used.add(item.eventSeq)
      const events = structuredClone(existing.events)
      const index = events.findIndex(event => event.seq === item.eventSeq)
      const originalEvent = events[index], previousItem = original.get(item.eventSeq)
      if (!originalEvent || !previousItem) throw new Error(`消息事件缺少原始投影：${item.eventSeq}`)
      const rootId = record(record(originalEvent.data).message).id
      const suffixes = assistantContinuationSuffixEvents(events, rootId)
      if (!suffixes.length || previousItem.content !== item.content || previousItem.role !== item.role) {
        events[index] = updateMessage(originalEvent, item)
        const suffixSeqs = new Set(suffixes.map(event => Number(event.seq)))
        for (const [position, event] of events.entries()) if (suffixSeqs.has(Number(event.seq))) {
          events[position] = updateMessage(event, { role: 'assistant', content: '' })
        }
      }
      const selected = events[index]
      if (!selected) throw new Error(`消息事件已丢失：${item.eventSeq}`)
      chunk = { events, selected, item }
      if (item.role === 'user' && events.length > 1) {
        // A converted reply is a direct input, outside its former turn. Keep
        // an existing tool trace as a closed turn; discard only a plain envelope.
        const trace = events.filter(event => event !== selected)
        const hasTrace = trace.some(event => !['turn/start', 'turn/end', 'step/start', 'step/end'].includes(event.type))
        chunk.events = [...(hasTrace ? trace : []), selected]
      }
      if (chunk.events.length === 1 && item.role !== 'user') {
        const envelope = createChunk(item)
        const selectedIndex = envelope.events.indexOf(envelope.selected)
        envelope.events[selectedIndex] = selected
        chunk = { ...envelope, selected }
      }
    } else chunk = createChunk(item)
    desiredChunks.push(chunk)
  }
  // Non-chat events stay beside their surviving boundary, rather than being
  // moved ahead of initialization and all conversation turns.
  const positions = new Map(desired.map((item, index) => [item.eventSeq, index]))
  const retained = new Map<number, Chunk[]>()
  for (const [index, chunk] of originalOrder.entries()) {
    if (chunk.selected) continue
    const following = originalOrder.slice(index + 1).find(item => item.selected && positions.has(Number(item.selected.seq)))
    const preceding = originalOrder.slice(0, index).findLast(item => item.selected && positions.has(Number(item.selected.seq)))
    const beforeFirstMessage = !originalOrder.slice(0, index).some(item => item.selected)
    let boundary = beforeFirstMessage ? 0 : following ? positions.get(Number(following.selected!.seq))! : preceding ? positions.get(Number(preceding.selected!.seq))! + 1 : 0
    for (const event of chunk.events) {
      const references = [...array(event.sourceEventSeqs), ...(object(event.surfaceOp) ? [event.surfaceOp.startSeq, event.surfaceOp.endSeq] : [])]
      for (const seq of references) {
        const dependency = desiredChunks.findIndex(item => item.events.some(event => Number(event.seq) === Number(seq)))
        if (dependency >= 0) boundary = Math.max(boundary, dependency + 1)
      }
    }
    retained.set(boundary, [...(retained.get(boundary) ?? []), { events: structuredClone(chunk.events) }])
  }
  const chunks: Chunk[] = initialization ? [initialization] : []
  for (let index = 0; index <= desiredChunks.length; index++) {
    chunks.push(...(retained.get(index) ?? []))
    if (index < desiredChunks.length) chunks.push(desiredChunks[index]!)
  }
  // Reordered continuation turns always point at the preceding real input.
  // A deleted input must not leave a stale numeric reference to another event.
  const continuationInputs = new Map<EditableSessionEvent, EditableSessionEvent>()
  let latestInput: EditableSessionEvent | undefined
  for (const chunk of chunks) chunk.events = chunk.events.filter(event => {
    if (event.type === 'user/message' && record(record(event.data).source).kind === 'user') latestInput = event
    if (event.type !== 'eleckoi/input-continuation') return true
    if (!latestInput) return false
    continuationInputs.set(event, latestInput)
    return true
  })
  let turn = 0
  const turns = new Map<number, number>(), sequences = new Map<number, number>()
  const events = chunks.flatMap(chunk => chunk.events)
  for (const [index, event] of events.entries()) {
    if (Number(event.seq) >= 0) sequences.set(Number(event.seq), index)
    if (event.type === 'turn/start') {
      turn++
      const previousTurn = record(event.data).turn
      if (typeof previousTurn === 'number' && previousTurn > 0) turns.set(previousTurn, turn)
    }
  }
  let currentTurn = 0
  const output = events.map((event, index) => {
    if (event.type === 'turn/start') currentTurn++
    let data = remap(structuredClone(event.data), turns, sequences)
    if (record(data).turn === -1) data = { ...record(data), turn: currentTurn }
    const input = continuationInputs.get(event)
    if (input) {
      const inputMessageId = record(input.data).id
      if (typeof inputMessageId !== 'string') throw new Error('续写对应的正式用户输入缺少消息编号。')
      data = { ...record(data), inputEventSeq: events.indexOf(input), inputMessageId }
    }
    let result: EditableSessionEvent = { ...event, seq: index, data }
    if (event.sourceEventSeqs !== undefined) {
      if (!Array.isArray(event.sourceEventSeqs)) throw new Error('消息来源事件序列不是数组。')
      result = { ...result, sourceEventSeqs: event.sourceEventSeqs.map(seq => requiredSequence(sequences, Number(seq))) }
    }
    if (object(event.surfaceOp)) {
      const startSeq = requiredSequence(sequences, Number(event.surfaceOp.startSeq)), endSeq = requiredSequence(sequences, Number(event.surfaceOp.endSeq))
      if (startSeq > endSeq) throw new Error('重排跨越了已压缩的历史范围；请先恢复对应历史。')
      result = { ...result, surfaceOp: { ...event.surfaceOp, startSeq, endSeq } }
    }
    return result
  })
  const messages: SessionMessageBatchResult['messages'] = []
  let offset = 0
  for (const chunk of chunks) {
    if (chunk.item && chunk.selected) {
      const index = chunk.events.indexOf(chunk.selected)
      const selected = output[offset + index]!
      const value = record(selected.data), body = selected.type === 'user/message' ? value : record(value.message)
      if (typeof body.id !== 'string') throw new Error('正式消息缺少消息编号。')
      messages.push({ id: body.id, eventSeq: Number(selected.seq), turn: chunk.item.role === 'user' ? null : selected.type === 'user/message'
        ? Number(record(output.slice(0, offset + index + 1).findLast(event => event.type === 'turn/start')?.data).turn) : Number(value.turn), role: chunk.item.role })
    }
    offset += chunk.events.length
  }
  rewriteDshSessionEvents(sessionRoot, log, output)
  return { messages, turns: [...turns].map(([previous, current]) => ({ previous, current })),
    sequences: [...sequences].map(([previous, current]) => ({ previous, current })) }
}

function requiredSequence(sequences: Map<number, number>, seq: number): number {
  const next = sequences.get(seq)
  if (next === undefined) throw new Error(`消息 ${seq} 仍被压缩或重写记录引用；请先恢复对应历史再删除。`)
  return next
}
function remap(value: EditableSessionJson, turns: Map<number, number>, sequences: Map<number, number>, key = ''): EditableSessionJson {
  if (typeof value === 'number') {
    if (/^(?:turn|fromTurn|toTurn|sourceTurn|parentTurn)$/.test(key)) return turns.get(value) ?? value
    if (/(?:Seq|EventSeq)$/.test(key)) return sequences.get(value) ?? value
    return value
  }
  if (Array.isArray(value)) return value.map(item => remap(item, turns, sequences, key.endsWith('Seqs') ? key.slice(0, -1) : key))
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([name, item]) => [name,
    // User text, tool arguments and provider replay data are opaque.
    ['message', 'arguments', 'stream', 'replay'].includes(name) ? item : remap(item, turns, sequences, name)]))
  return value
}
function updateMessage(event: EditableSessionEvent, item: SessionMessageBatchItem): EditableSessionEvent {
  const data = record(event.data), previous = event.type === 'user/message' ? data : record(data.message)
  const text = item.role === 'assistant' && !item.content.includes('<FINAL>') ? `<FINAL>\n${item.content}\n</FINAL>` : item.content
  let written = false
  if (!Array.isArray(previous.content)) throw new Error('正式消息正文不是内容块数组。')
  const content = previous.content.flatMap((block: EditableSessionJson) => {
    if (record(block).type !== 'text') return item.role === previous.role || item.role === 'assistant'
      || item.role === 'user' && (record(block).type === 'image' || record(block).type === 'file') ? [block] : []
    if (written) return []
    written = true; return [{ ...record(block), text }]
  })
  if (!written) content.push({ type: 'text', text })
  const sameSource = item.role === previous.role && (item.role !== 'user' || record(previous.source).kind === 'user')
  if (typeof previous.id !== 'string') throw new Error('正式消息缺少消息编号。')
  const message = sameSource ? { ...previous, content }
    : { ...newMessage(item.role, text), id: previous.id, content }
  if (item.role !== 'assistant') return { ...event, type: 'user/message', data: message }
  return { ...event, type: item.role === 'assistant' ? 'assistant/message' : 'system/message',
    data: { turn: data.turn ?? -1, step: data.step ?? 1, ...(item.role === 'assistant' ? { stream: data.stream ?? [] } : {}), message } }
}
/** Message constructors produce runtime objects; the format catalog accepts lossless JSON. */
function messageJson(value: unknown): EditableSessionJson {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (Array.isArray(value)) return value.map(messageJson)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([, item]) => item !== undefined).map(([key, item]) => [key, messageJson(item)]))
  throw new TypeError('正式消息包含不可持久化的非 JSON 值。')
}
function newMessage(role: SessionMessageBatchItem['role'], text: string, nativeSystem = false): EditableSessionObject {
  const message = role === 'system' ? nativeSystem ? createSystemMessage(text)
    : createUserMessage({ source: { kind: 'plugin:eleckoi-author-system' }, content: [{ type: 'text', text }] })
    : role === 'user' ? createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text }] })
    : createAssistantMessage({ source: { provider: 'eleckoi-author', model: 'authored-message' }, content: [{ type: 'text', text }] })
  const data = messageJson(message)
  if (!object(data)) throw new Error('正式消息构造器没有返回消息对象。')
  return data
}
function createChunk(item: SessionMessageBatchItem, nativeSystem = false): Chunk & { item: SessionMessageBatchItem; selected: EditableSessionEvent } {
  const text = item.role === 'assistant' && !item.content.includes('<FINAL>') ? `<FINAL>\n${item.content}\n</FINAL>` : item.content
  const message = newMessage(item.role, text, nativeSystem)
  const event = (type: string, data: EditableSessionJson, surface = false): EditableSessionEvent => ({ type, data, seq: -1, time: Date.now(), ...(surface ? { surfaceOp: 'append' } : {}) })
  const selected = item.role === 'user' || item.role === 'system' && !nativeSystem ? event('user/message', message, true)
    : event(`${item.role}/message`, { turn: -1, step: 1, message, ...(item.role === 'assistant' ? { stream: [] } : {}) }, true)
  return { item, selected, events: item.role === 'user' ? [selected] : [event('turn/start', { turn: -1 }), event('step/start', { turn: -1, step: 1 }),
    selected, event('step/end', { turn: -1, step: 1 }), event('turn/end', { turn: -1, reason: { kind: 'completed' } })] }
}
