import { randomUUID } from 'node:crypto'
import { copyFileSync, existsSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'
import { sessionFormatCatalog } from '@deepseek-ai/dsh-session-format-catalog'
import { ELECKOI_FAILURE_CODES, productFailure } from '@eleckoi/dsh-product-api'
import { readDshSessionLog } from './trajectory'
import { retainSessionModelPreferences } from './sessionModelPreferences'
import { interruptedTurnClosers, Session, SessionId, SessionLogOffset, SessionSeq, type SessionEvent, type SessionHeader } from '@deepseek-ai/dsh-session'
import { buildForkSeed } from '@deepseek-ai/dsh-session/fork'

type MessageRole = 'user' | 'assistant'

/** Delete the selected message and its suffix, preserving the exact earlier history. */
export function deleteDshSessionMessagesFrom(
  sessionRoot: string, sessionId: string, eventSeq: number, role: MessageRole
): void {
  if (!Number.isSafeInteger(eventSeq) || eventSeq < 0) throw productFailure(ELECKOI_FAILURE_CODES.inputInvalid, '消息删除参数不正确。', { field: '消息删除参数' })
  const log = readEditableDshSessionLog(sessionRoot, sessionId)
  const index = log.events.findIndex(event => event.seq === eventSeq
    && event.type === (role === 'user' ? 'user/message' : 'assistant/message') && event.surfaceOp === 'append')
  if (index < 0) throw productFailure(ELECKOI_FAILURE_CODES.lookupNotFound, '找不到要删除的消息；原聊天记录未修改。', { what: '要删除的消息' })
  const events = log.events.slice(0, index)
  // This is an explicit user edit, not recovery from a crashed Host.
  events.push(...interruptedTurnClosers(events).map(event => event.type === 'turn/end'
    ? { ...event, data: { ...event.data, reason: { kind: 'aborted', reason: { kind: 'user' } } } } as SessionEvent
    : event))
  retainSessionModelPreferences(events, log.events)
  rewriteDshSessionEvents(sessionRoot, log, events)
}

/** Edit the selected persisted message while preserving every other Session event. */
export function editDshSessionMessage(
  sessionRoot: string, sessionId: string, eventSeq: number, role: MessageRole, content: string
): void {
  if (!Number.isSafeInteger(eventSeq) || eventSeq < 0 || !content.trim()) throw productFailure(ELECKOI_FAILURE_CODES.inputInvalid, '消息编辑参数不正确。', { field: '消息编辑参数' })
  const log = readEditableDshSessionLog(sessionRoot, sessionId)
  const type = role === 'user' ? 'user/message' : 'assistant/message'
  const matches = log.events.filter((event) => event.seq === eventSeq && event.type === type
    && event.surfaceOp === 'append'
    && isRecord(event.data))
  if (matches.length !== 1) throw productFailure(ELECKOI_FAILURE_CODES.lookupNotFound, '找不到唯一对应的消息；原聊天记录未修改。', { what: '要编辑的消息' })
  const selected = matches[0]!
  const data = selected.data as Record<string, unknown>
  const message = (role === 'user' ? data : data.message) as Record<string, unknown>
  if (message.role !== role || !Array.isArray(message.content)) {
    throw productFailure(ELECKOI_FAILURE_CODES.stateMismatch, '消息角色或内容与编辑目标不一致；原聊天记录未修改。', { what: '消息角色或内容' })
  }
  if (role === 'assistant') {
    const raw = message.content.filter(isRecord).filter(block => block.type === 'text').map(block => String(block.text || '')).join('')
    const bodyStart = raw.indexOf('<FINAL>')
    const bodyEnd = raw.lastIndexOf('</FINAL>')
    if (bodyStart >= 0 && raw.slice(0, bodyStart).includes('<ACTION_CALL name="generate_image">')) {
      if (bodyEnd < bodyStart) throw productFailure(ELECKOI_FAILURE_CODES.dataShapeInvalid, '原回复缺少完整的最终正文边界，未修改生图提示词。', { what: '原回复的最终正文边界' })
      content = `${raw.slice(0, bodyStart + '<FINAL>'.length)}\n${content}\n${raw.slice(bodyEnd)}`
    }
  }
  let replaced = false
  const blocks = message.content.flatMap((part: unknown) => {
    if (!isRecord(part) || part.type !== 'text') return [part]
    if (replaced) return []
    replaced = true
    return [{ ...part, text: content }]
  })
  if (!replaced) blocks.unshift({ type: 'text', text: content })
  const editedMessage = { ...message, content: blocks }
  const editedData = role === 'user' ? editedMessage : { ...data, message: editedMessage }
  const events = log.events.map((event) => event === selected
    ? { ...event, data: editedData } as typeof event : event)
  rewriteDshSessionEvents(sessionRoot, log, events)
}

export function readEditableDshSessionLog(sessionRoot: string, sessionId: string): NonNullable<ReturnType<typeof readDshSessionLog>> {
  const log = readDshSessionLog(sessionRoot, sessionId)
  if (!log) throw productFailure(ELECKOI_FAILURE_CODES.lookupNotFound, '找不到要编辑的 DSH 会话。', { what: '要编辑的 DSH 会话' })
  if (log.header.origin === 'subagent') {
    throw productFailure(ELECKOI_FAILURE_CODES.statePrecondition, '不能直接修改继承了父会话事件的 DSH 子会话。', { what: '在父会话上编辑' })
  }
  if (log.header.version !== sessionFormatCatalog.currentVersion
    || basename(log.path) !== `session.v${sessionFormatCatalog.currentVersion}.jsonl`) {
    throw productFailure(ELECKOI_FAILURE_CODES.dataLegacyMismatch, 'DSH 会话必须先迁移到当前格式，才能编辑消息。', { what: 'DSH 会话的格式', expected: '当前格式' })
  }
  return log
}

/** Preserve the current official format, identities and all unrelated events. */
export function rewriteDshSessionEvents(sessionRoot: string, log: NonNullable<ReturnType<typeof readDshSessionLog>>, events: SessionEvent[]): void {
  const sessionId = log.header.id
  const { rows, eventCount } = encodeEditedSessionRows(log, events)
  const serialized = `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`
  const restore = sessionFormatCatalog.createRestore(rows[0], { recovery: 'strict', validation: 'current' })
  for (const row of rows.slice(1)) restore.decodeRow(row)
  const verified = restore.finish()
  if (verified.header.id !== sessionId || verified.events.length !== eventCount) {
    throw productFailure(ELECKOI_FAILURE_CODES.internal, '编辑后的 DSH 会话验证失败；原聊天记录未修改。', { what: '编辑后的 DSH 会话校验' })
  }

  const revision = statSync(log.path, { bigint: true })
  const suffix = randomUUID()
  const temporary = `${log.path}.${suffix}.tmp`
  const backup = `${log.path}.${suffix}.bak`
  let committed = false
  let retainBackup = false
  try {
    writeFileSync(temporary, serialized, { encoding: 'utf8', flag: 'wx' })
    const current = statSync(log.path, { bigint: true })
    if (current.dev !== revision.dev || current.ino !== revision.ino
      || current.size !== revision.size || current.mtimeNs !== revision.mtimeNs
      || current.ctimeNs !== revision.ctimeNs) {
      throw productFailure(ELECKOI_FAILURE_CODES.conflictStaleRevision, 'DSH 会话日志在编辑期间发生变化；原聊天记录未修改。', { what: 'DSH 会话日志' })
    }
    copyFileSync(log.path, backup)
    renameSync(temporary, log.path)
    committed = true
    const reread = readDshSessionLog(sessionRoot, sessionId)
    if (!reread || reread.events.length !== eventCount
      || JSON.stringify(reread.events.map(event => sessionFormatCatalog.encodeCurrentEvent(event))) !== JSON.stringify(rows.slice(1))) {
      throw productFailure(ELECKOI_FAILURE_CODES.internal, '编辑后的 DSH 会话无法读取。', { what: '编辑后的 DSH 会话' })
    }
  } catch (error) {
    if (committed && existsSync(backup)) {
      try { renameSync(backup, log.path) } catch {
        retainBackup = true
        throw productFailure(ELECKOI_FAILURE_CODES.ioFailed, `编辑失败，原始会话日志保存在 ${backup}。`, { operation: 'write', path: log.path })
      }
    }
    throw error
  } finally {
    if (existsSync(temporary)) rmSync(temporary, { force: true })
    if (!retainBackup && existsSync(backup)) rmSync(backup, { force: true })
  }
}

/** Rebuild a root's inherited cut after an edit while retaining receipt ownership. */
export function encodeEditedSessionRows(log: NonNullable<ReturnType<typeof readDshSessionLog>>, events: SessionEvent[]) {
  if (!log.header.isSeeded && log.inheritedEventCount === 0) {
    return { rows: [sessionFormatCatalog.encodeCurrentHeader(log.header, log.inheritedEventCount),
      ...events.map(event => sessionFormatCatalog.encodeCurrentEvent(event))], eventCount: events.length }
  }
  const seed = events.length ? buildForkSeed(events, SessionSeq(events.length - 1)) : []
  const session = Session.create(SessionId(log.header.id), seed,
    { ...log.header, isSeeded: true } as unknown as SessionHeader, SessionLogOffset(events.length))
  const retained = session.snapshotEvents()
  return { rows: [sessionFormatCatalog.encodeCurrentHeader(
    { ...session.header, delegationDepth: session.header.delegationDepth ?? 0 } as unknown as Parameters<typeof sessionFormatCatalog.encodeCurrentHeader>[0], session.inheritedEventCount),
    ...retained.map(event => sessionFormatCatalog.encodeCurrentEvent(event as unknown as Parameters<typeof sessionFormatCatalog.encodeCurrentEvent>[0]))], eventCount: retained.length }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
