import { randomUUID } from 'node:crypto'
import { copyFileSync, existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { createUserMessage, freezeMessage, MessageId } from '@deepseek-ai/dsh-llm'
import { KNOWN_SESSION_EVENT_TYPES, Session, SessionId, SessionSeq } from '@deepseek-ai/dsh-session'
import { SessionWriteLease } from '@deepseek-ai/dsh-session-persistence-jsonl'
import { sessionFormatCatalog } from '@deepseek-ai/dsh-session-format-catalog'
import { REQUEST_CONTEXT_EVENT } from '@eleckoi/dsh-client-roleplay/host/request-context-record.mjs'
import { HISTORY_RESTORED_EVENT } from '@eleckoi/dsh-client-roleplay/host/history-stats-projection.mjs'
import type {} from '@eleckoi/dsh-client-roleplay/projections'
import { readDshSessionLog } from './trajectory'
import type { EditableSessionEvent, EditableSessionJson } from './sessionMessageEdit'
import { runtimeEventToFormat } from './sessionFormatBoundary.mjs'

type Row = Record<string, string | number | null>
export interface HistoryRecoveryArchive {
  tables: Record<string, Row[]>
}

/**
 * Recover only ledger-backed, unanswered inputs preceding the first native turn.
 * TODO(迁移清理)：停止支持缺少独立历史输入的旧聊天直升，且受支持的恢复、导入入口
 * 已把这些输入持久写为正式 Session 消息后，删除本文件、启动恢复调用、index 导出
 * 和专用历史补回用例。保留当前请求投影、检查点和正常重新生成路径。
 * HISTORY_RESTORED_EVENT 的统计读取仍服务已迁移日志；未转换这些持久标记前不能
 * 一并删除 history-stats-projection，且该投影还服务当前已有输入的续接统计。
 */
export async function recoverSessionHistory(root: string, id: string, archive: HistoryRecoveryArchive): Promise<number> {
  const located = readDshSessionLog(root, id)
  if (!located || located.header.isSeeded || located.inheritedEventCount !== 0) return 0
  const lease = await SessionWriteLease.acquire(dirname(located.path), SessionId(id))
  try {
    const original = readFileSync(located.path, 'utf8')
    const rows = original.split(/\r?\n/).filter(line => line.trim()).map(line => JSON.parse(line))
    const restore = sessionFormatCatalog.createRestore(rows[0], { recovery: 'strict', validation: 'current' })
    for (const row of rows.slice(1)) restore.decodeRow(row)
    const log = restore.finish()
    if (log.header.id !== id || log.header.version !== sessionFormatCatalog.currentVersion) {
      throw new Error('旧聊天历史恢复的 Session 身份或版本不匹配。')
    }
    const events = log.events
    const envelopeIndex = events.findIndex(event => event.type === 'user/message'
      && record(record(event.data).source).kind === 'plugin:eleckoi-request-projection')
    if (envelopeIndex < 0) return 0
    const envelope = events[envelopeIndex]!
    const data = record(envelope.data)
    const text = messageText(data)
    const prefix = ['ELECKOI_REQUEST_PROJECTION_V2\n', 'ELECKOI_REQUEST_PROJECTION_V1\n']
      .find(value => text.startsWith(value))
    if (!prefix) return 0
    const snapshot = record(JSON.parse(text.slice(prefix.length)))
    if (snapshot.historyMode === 'prefix' || !Array.isArray(snapshot.history)) return 0
    const history = snapshot.history.map(item => {
      const entry = record(item)
      if ((entry.role !== 'user' && entry.role !== 'assistant') || typeof entry.content !== 'string') {
        throw new Error('旧聊天历史快照格式不正确，原日志未修改。')
      }
      return { role: entry.role, content: entry.content }
    })
    const tables = archive.tables
    const conversation = tables.agent_conversations.find(row => row.runtimeThreadId === id)
    if (!conversation) return 0
    const active = tables.agent_branch_turns.filter(row => row.branchId === conversation.activeBranchId)
      .sort((left, right) => Number(left.sequence) - Number(right.sequence))
    const activeTurns = active.map(row => tables.agent_turns.find(turn => turn.id === row.turnId))
    if (activeTurns.some(turn => !turn)) throw new Error('旧聊天活动消息账本不完整，原日志未修改。')
    if (activeTurns[0]?.kind === 'opening' && history[0]?.role === 'assistant') history.shift()
    let currentIndex = -1
    for (let index = 0; index < envelopeIndex; index++) if (directUser(events[index]!)) currentIndex = index
    if (currentIndex < 0 || !history.length) return 0
    const native = events.slice(0, currentIndex).filter(event => directUser(event)
      || (event.type === 'assistant/message' && event.surfaceOp === 'append'))
      .map(event => ({ role: event.type === 'user/message' ? 'user' : 'assistant',
        content: messageText(event.type === 'user/message' ? record(event.data) : record(record(event.data).message)) }))
    if (native.length >= history.length) return 0
    const missingCount = history.length - native.length
    if (!native.every((message, index) => message.role === history[missingCount + index]?.role
      && message.content === history[missingCount + index]?.content)) {
      throw new Error('旧聊天历史与原生消息无法唯一对应，原日志未修改。')
    }
    const missing = history.slice(0, missingCount)
    if (missing.some(item => item.role !== 'user')) {
      throw new Error('旧聊天缺少可验证的历史回复，不能补造模型记录；原日志未修改。')
    }
    const known = new Set<string>(KNOWN_SESSION_EVENT_TYPES)
    if (events.some(event => !known.has(event.type) && String(event.type) !== REQUEST_CONTEXT_EVENT
      && String(event.type) !== HISTORY_RESTORED_EVENT)) {
      throw new Error('旧聊天含有无法重定位的外部插件记录，原日志未修改。')
    }
    const firstTurn = events.slice(0, envelopeIndex).find(event => event.type === 'turn/start')
    const turnNumber = record(firstTurn?.data).turn
    const owners = new Set(tables.agent_responses.filter(row => row.runtimeThreadId === id
      && row.dshTurn === turnNumber).map(row => row.turnId))
    const ownerIndex = activeTurns.findIndex(turn => owners.has(turn!.id))
    const historicalUsers = activeTurns.slice(0, ownerIndex).filter(turn => turn!.kind === 'user')
    if (ownerIndex < 0 || historicalUsers.length !== history.length
      || historicalUsers.slice(0, missingCount).some(turn => tables.agent_responses.some(row => row.turnId === turn!.id))) {
      throw new Error('旧聊天未回复输入与活动账本无法唯一对应，原日志未修改。')
    }
    const firstUserIndex = events.findIndex(directUser)
    const turnIndex = events.findIndex(event => event.type === 'turn/start')
    const inboxIndex = events.findIndex(event => event.type === 'agent/inbox/spliced')
    let insertion = Math.min(...[firstUserIndex, turnIndex, inboxIndex].filter(index => index >= 0))
    // A native system head is bound to its real step. Restore old inputs just
    // after that head, never ahead of it or outside its lifecycle bracket.
    const headIndex = events.findIndex(event => event.surfaceOp !== undefined)
    if (headIndex >= insertion && events[headIndex]?.type === 'system/message') insertion = headIndex + 1
    const generated = Session.create(SessionId(id))
    const additions = missing.map((item, index) => {
      const turn = historicalUsers[index]!
      const time = typeof turn!.createdAt === 'string' ? Date.parse(turn!.createdAt) : NaN
      if (typeof turn!.id !== 'string' || !turn!.id || !Number.isSafeInteger(time) || time < 0) {
        throw new Error('旧聊天历史输入身份或时间不正确，原日志未修改。')
      }
      const message = freezeMessage({ ...createUserMessage({
        content: [{ type: 'text', text: item.content }], source: { kind: 'user' }
      }), id: MessageId(turn!.id) })
      const event = generated.append('user/message', message, { surfaceOp: 'append' })
      return { ...runtimeEventToFormat(event), seq: insertion + index, time }
    })
    const marker = runtimeEventToFormat(generated.append(HISTORY_RESTORED_EVENT,
      { messageIds: additions.map(event => String(record(event.data).id)) }, { ignorable: true }))
    const ordered = [...events.slice(0, insertion), marker, ...additions, ...events.slice(insertion)]
    const originals = new Set(events)
    const relocated = new Map<number, number>()
    ordered.forEach((event, index) => { if (originals.has(event)) relocated.set(event.seq, index) })
    const shift = (seq: number): number => {
      const target = relocated.get(seq)
      if (target === undefined) throw new Error('旧聊天包含不能重定位的消息引用，原日志未修改。')
      return target
    }
    const recovered = ordered.map((event, index) => originals.has(event)
      ? shiftEvent(event, shift, id) : { ...event, seq: SessionSeq(index) })
    const encoded = [sessionFormatCatalog.encodeCurrentHeader(log.header, log.inheritedEventCount),
      ...recovered.map(event => sessionFormatCatalog.encodeCurrentEvent(
        event))]
    const checked = sessionFormatCatalog.createRestore(encoded[0], { recovery: 'strict', validation: 'current' })
    for (const row of encoded.slice(1)) checked.decodeRow(row)
    checked.finish()
    const serialized = `${encoded.map(row => JSON.stringify(row)).join('\n')}\n`
    const suffix = randomUUID()
    const temporary = `${located.path}.${suffix}.tmp`
    const backup = `${located.path}.history-${suffix}.bak`
    let committed = false
    try {
      writeFileSync(temporary, serialized, { encoding: 'utf8', flag: 'wx' })
      if (readFileSync(located.path, 'utf8') !== original) throw new Error('旧聊天日志在历史恢复期间发生变化。')
      copyFileSync(located.path, backup)
      renameSync(temporary, located.path)
      committed = true
      const reread = readDshSessionLog(root, id)
      if (readFileSync(located.path, 'utf8') !== serialized || reread?.events.length !== recovered.length
        || reread?.header.id !== id) throw new Error('旧聊天历史恢复写入校验失败。')
    } catch (error) {
      if (committed) {
        try { renameSync(backup, located.path) }
        catch (cause) { throw new Error(`历史恢复失败，原日志备份位于 ${backup}。`, { cause }) }
      }
      throw error
    } finally { if (existsSync(temporary)) rmSync(temporary) }
    return additions.length
  } finally { await lease.release() }
}

function shiftEvent(event: EditableSessionEvent, shift: (seq: number) => number, eventSessionId: string): EditableSessionEvent {
  const data = record(structuredClone(event.data))
  if (event.type === 'developer/message' && data.headerSeq !== undefined) data.headerSeq = shift(Number(data.headerSeq))
  if (event.type === REQUEST_CONTEXT_EVENT) {
    if (!Number.isSafeInteger(data.requestSeq)) throw new Error('旧聊天请求记录序号不正确，原日志未修改。')
    data.requestSeq = shift(Number(data.requestSeq))
  }
  if (event.type === 'compaction/summary' || event.type === 'compaction/prune') {
    const range = record(data.shadowedRange)
    range.start = shift(Number(range.start)); range.end = shift(Number(range.end))
    if (Array.isArray(data.shadowedSeqs)) data.shadowedSeqs = data.shadowedSeqs.map(seq => shift(Number(seq)))
  }
  if (event.type === 'image/offload' && Array.isArray(data.targets)) {
    for (const target of data.targets) { const value = record(target); value.seq = shift(Number(value.seq)) }
  }
  if (event.type === 'command/done' && typeof data.sourceEventSeq === 'number') data.sourceEventSeq = shift(data.sourceEventSeq)
  if (event.type === 'session/title' && Array.isArray(data.messageSeqs)) data.messageSeqs = data.messageSeqs.map(seq => shift(Number(seq)))
  if (event.type === 'session-log-deepseek/delivery-accepted' && data.sessionId === eventSessionId
    && typeof data.throughSeq === 'number') data.throughSeq = shift(data.throughSeq)
  const surface = record(event.surfaceOp)
  return { ...event, seq: shift(event.seq),
    ...(event.surfaceOp && event.surfaceOp !== 'append' ? { surfaceOp: { ...jsonObject(surface), startSeq: shift(Number(surface.startSeq)), endSeq: shift(Number(surface.endSeq)) } } : {}),
    ...(Array.isArray(event.sourceEventSeqs) ? { sourceEventSeqs: event.sourceEventSeqs.map(seq => shift(Number(seq))) } : {}), data: jsonObject(data) }
}
function jsonObject(value: Record<string, unknown>): { [key: string]: EditableSessionJson } {
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, jsonValue(entry)]))
}
function jsonValue(value: unknown): EditableSessionJson {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (Array.isArray(value)) return value.map(jsonValue)
  if (isRecord(value)) return jsonObject(value)
  throw new TypeError('正式 Session 事件包含非 JSON 数据。')
}

function directUser(event: EditableSessionEvent): boolean {
  return event.type === 'user/message' && event.surfaceOp === 'append' && record(record(event.data).source).kind === 'user'
}
function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}
function messageText(message: Record<string, unknown>): string {
  return Array.isArray(message.content) ? message.content.map(part => {
    const block = record(part)
    return block.type === 'text' && typeof block.text === 'string' ? block.text : ''
  }).join('') : ''
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
