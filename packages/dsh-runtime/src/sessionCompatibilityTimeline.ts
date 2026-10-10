import { randomUUID } from 'node:crypto'
import { renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'
import { createAssistantMessage, createSystemMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import { Session, SessionId, type SessionEvent, type SessionHeader } from '@deepseek-ai/dsh-session'
import { sessionFormatCatalog } from '@deepseek-ai/dsh-session-format-catalog'
import { readDshSessionLog } from './trajectory'

export interface CompatibilityTimelineMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  sessionEventSeq?: number
  createdAt?: string
  reasoning?: string
}
export interface CompatibilityTimelineMutation {
  updates?: CompatibilityTimelineMessage[]
  inserts?: CompatibilityTimelineMessage[]
}

/** Caller owns the existing closed-session/write-lease and projection refresh. */
export function mutateDshCompatibilityTimeline(sessionRoot: string, sessionId: string,
  mutation: CompatibilityTimelineMutation): CompatibilityTimelineMessage[] {
  const log = readDshSessionLog(sessionRoot, sessionId)
  if (!log) throw new Error(`DSH Session does not exist: ${sessionId}`)
  if (log.header.isSeeded || log.inheritedEventCount !== 0) throw new Error('Inherited DSH sessions must be materialized before timeline edits')
  if (log.header.version !== sessionFormatCatalog.currentVersion || basename(log.path) !== `session.v${sessionFormatCatalog.currentVersion}.jsonl`) {
    throw new Error('Migrate the DSH Session before timeline edits')
  }
  const seen = new Set<number>()
  const events = [...log.events] as unknown as SessionEvent[]
  for (const patch of mutation.updates ?? []) {
    const seq = patch.sessionEventSeq
    if (!Number.isSafeInteger(seq) || seen.has(seq!)) throw new Error('Timeline update needs a unique DSH event sequence')
    seen.add(seq!)
    const index = events.findIndex(event => event.seq === seq && ['user/message', 'assistant/message', 'system/message'].includes(event.type)
      && event.surfaceOp === 'append')
    if (index < 0) throw new Error(`DSH message does not exist: ${seq}`)
    const event = events[index]!, data = object(event.data), message = object(event.type === 'user/message' ? data : data.message)
    const priorBlocks = Array.isArray(message.content) ? message.content : []
    const blocks = priorBlocks.filter(block => object(block).type !== 'text')
    blocks.unshift({ type: 'text', text: patch.content })
    const edited = { ...message, content: blocks, eleckoiCompatibility: { ...object(message.eleckoiCompatibility), id: patch.id,
      role: patch.role, ...(patch.reasoning !== undefined ? { reasoning: patch.reasoning } : {}) } }
    events[index] = { ...event, data: event.type === 'user/message' ? edited : { ...data, message: edited } } as SessionEvent
  }
  const session = Session.create(SessionId(sessionId), events, log.header as unknown as SessionHeader, log.inheritedEventCount as Parameters<typeof Session.create>[3])
  const inserted: CompatibilityTimelineMessage[] = []
  let turn = events.reduce((highest, event) => Math.max(highest, Number(object(event.data).turn) || 0), 0)
  const surface = events.filter(event => event.surfaceOp !== undefined)
  if ((mutation.inserts?.length ?? 0) > 0 && surface.length === 0) {
    // DSH reserves the first surface node for its system-prompt owner. A plugin
    // inserting the first human message must leave that genuine head available.
    turn += 1
    session.append('turn/start', { turn }); session.append('step/start', { turn, step: 1 })
    session.append('system/message', { turn, step: 1, message: createSystemMessage('') }, { surfaceOp: 'append' })
    session.append('step/end', { turn, step: 1 }); session.append('turn/end', { turn, reason: { kind: 'completed' } })
  }
  for (const input of mutation.inserts ?? []) {
    const marker = { id: input.id || randomUUID(), role: input.role, reasoning: input.reasoning ?? '', pluginInserted: true }
    if (input.role === 'assistant') {
      turn += 1
      session.append('turn/start', { turn }); session.append('step/start', { turn, step: 1 })
      const message = createAssistantMessage({ content: [{ type: 'text', text: input.content }], source: { provider: 'eleckoi-plugin', model: 'manual' } })
      const event = session.append('assistant/message', { turn, step: 1, message: { ...message, eleckoiCompatibility: marker } as typeof message, stream: [] }, { surfaceOp: 'append' })
      session.append('step/end', { turn, step: 1 }); session.append('turn/end', { turn, reason: { kind: 'completed' } })
      inserted.push({ ...input, id: marker.id, sessionEventSeq: Number(event.seq) })
    } else if (input.role === 'system') {
      turn += 1
      session.append('turn/start', { turn }); session.append('step/start', { turn, step: 1 })
      const message = createSystemMessage(input.content)
      const event = session.append('system/message', { turn, step: 1, message: { ...message, eleckoiCompatibility: marker } as typeof message }, { surfaceOp: 'append' })
      session.append('step/end', { turn, step: 1 }); session.append('turn/end', { turn, reason: { kind: 'completed' } })
      inserted.push({ ...input, id: marker.id, sessionEventSeq: Number(event.seq) })
    } else {
      const message = createUserMessage({ content: [{ type: 'text', text: input.content }], source: { kind: 'user' } })
      const event = session.append('user/message', { ...message, eleckoiCompatibility: marker } as typeof message, { surfaceOp: 'append' })
      inserted.push({ ...input, id: marker.id, sessionEventSeq: Number(event.seq) })
    }
  }
  const rows = [sessionFormatCatalog.encodeCurrentHeader(log.header, log.inheritedEventCount),
    ...session.snapshotEvents().map(event => sessionFormatCatalog.encodeCurrentEvent(event as unknown as Parameters<typeof sessionFormatCatalog.encodeCurrentEvent>[0]))]
  const restore = sessionFormatCatalog.createRestore(rows[0], { recovery: 'strict', validation: 'current' })
  for (const row of rows.slice(1)) restore.decodeRow(row)
  const verified = restore.finish()
  if (verified.header.id !== sessionId || verified.events.length !== session.snapshotEvents().length) throw new Error('DSH timeline validation failed')
  const temporary = `${log.path}.${randomUUID()}.tmp`
  try {
    writeFileSync(temporary, `${rows.map(row => JSON.stringify(row)).join('\n')}\n`, { flag: 'wx' })
    renameSync(temporary, log.path)
  } finally { rmSync(temporary, { force: true }) }
  return inserted
}
function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
