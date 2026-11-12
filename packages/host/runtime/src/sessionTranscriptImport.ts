import { randomUUID } from 'node:crypto'
import { renameSync, rmSync, writeFileSync } from 'node:fs'
import { createAssistantMessage, createSystemMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import { Session, SessionId, type SessionEvent, type SessionHeader } from '@deepseek-ai/dsh-session'
import { sessionFormatCatalog } from '@deepseek-ai/dsh-session-format-catalog'
import { ELECKOI_FAILURE_CODES, productFailure } from '@eleckoi/dsh-product-api'
import { readDshSessionLog } from './trajectory'

export interface TranscriptMessage {
  role: 'user' | 'assistant'
  content: string
  variableStateJson?: string
}
export interface ImportedTranscriptMessage extends TranscriptMessage {
  id: string
  sessionEventSeq: number
  turn: number | null
}

/** The caller owns the write lease and imports only into a newly created Session. */
export function importDshTranscript(sessionRoot: string, sessionId: string, messages: TranscriptMessage[]): ImportedTranscriptMessage[] {
  const log = readDshSessionLog(sessionRoot, sessionId)
  const initializationEvents = new Set(['permission/preset', 'sandbox/mode', 'approval/policy', 'model/selection', 'eleckoi/model-parameters'])
  if (!log || log.header.isSeeded || log.inheritedEventCount
    || log.events.some(event => !initializationEvents.has(event.type))) {
    throw productFailure(ELECKOI_FAILURE_CODES.statePrecondition, '聊天导入需要尚未开始对话的 Session。', { what: '新建一个尚未开始对话的聊天' })
  }
  const session = Session.create(SessionId(sessionId), log.events as unknown as Parameters<typeof Session.create>[1], log.header as unknown as SessionHeader)
  const result: ImportedTranscriptMessage[] = []
  let turn = 1
  session.append('turn/start', { turn })
  session.append('step/start', { turn, step: 1 })
  session.append('system/message', { turn, step: 1, message: createSystemMessage('') }, { surfaceOp: 'append' })
  session.append('step/end', { turn, step: 1 })
  session.append('turn/end', { turn, reason: { kind: 'completed' } })
  for (const input of messages) {
    if (input.role === 'user') {
      const message = createUserMessage({ content: [{ type: 'text', text: input.content }], source: { kind: 'user' } })
      const event = session.append('user/message', message, { surfaceOp: 'append' })
      result.push({ ...input, id: message.id as string, sessionEventSeq: Number(event.seq), turn: null })
    } else {
      turn += 1
      session.append('turn/start', { turn })
      session.append('step/start', { turn, step: 1 })
      const message = createAssistantMessage({ content: [{ type: 'text', text: input.content }], source: { provider: 'eleckoi-import', model: 'transcript' } })
      const event = session.append('assistant/message', { turn, step: 1, message, stream: [] }, { surfaceOp: 'append' })
      session.append('step/end', { turn, step: 1 })
      session.append('turn/end', { turn, reason: { kind: 'completed' } })
      result.push({ ...input, id: message.id as string, sessionEventSeq: Number(event.seq), turn })
    }
  }
  const events = session.snapshotEvents()
  const rows = [sessionFormatCatalog.encodeCurrentHeader(log.header, log.inheritedEventCount),
    ...events.map(event => sessionFormatCatalog.encodeCurrentEvent(event as unknown as SessionEvent))]
  const restore = sessionFormatCatalog.createRestore(rows[0], { recovery: 'strict', validation: 'current' })
  for (const row of rows.slice(1)) restore.decodeRow(row)
  if (restore.finish().events.length !== events.length) throw productFailure(ELECKOI_FAILURE_CODES.internal, '聊天日志导入校验失败。', { what: '聊天日志导入的校验' })
  const temporary = `${log.path}.${randomUUID()}.tmp`
  try {
    writeFileSync(temporary, `${rows.map(row => JSON.stringify(row)).join('\n')}\n`, { flag: 'wx' })
    renameSync(temporary, log.path)
  } finally { rmSync(temporary, { force: true }) }
  return result
}
