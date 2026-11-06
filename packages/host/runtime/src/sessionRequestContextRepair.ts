import { randomUUID } from 'node:crypto'
import { copyFileSync, existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { SessionId, type SessionEvent, type SessionHeader } from '@deepseek-ai/dsh-session'
import * as JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { SessionWriteLease } from '@deepseek-ai/dsh-session-persistence-jsonl'
import { validateStoredEvents } from '@deepseek-ai/dsh-session-persistence'
import { sessionFormatCatalog } from '@deepseek-ai/dsh-session-format-catalog'
import { REQUEST_CONTEXT_EVENT } from '@eleckoi/dsh-client-roleplay/host/request-context-record.mjs'
import { requestContextRecordSchema } from '@eleckoi/dsh-client-roleplay/host/request-context-schema.mjs'
import { ELECKOI_FAILURE_CODES, productFailure } from '@eleckoi/dsh-product-api'
import { readDshSessionLog } from './trajectory'

/**
 * Repair only the missing optional-event marker on validated request annotations.
 * RETIRE WHEN: 停止支持产生未标记记录的旧版本直升，且仍受支持的 Session 恢复、
 * 导入入口已能先转换该形态后，删除本文件、Host 启动扫描、index 导出和专用修复用例。
 * 历史 request-context Schema 仅用于恢复校验；新请求预览只保留在运行期内存。
 */
export async function repairRequestContextLog(root: string, id: string): Promise<number> {
  const located = readDshSessionLog(root, id)
  if (!located || located.header.version !== sessionFormatCatalog.currentVersion) return 0
  if (!located.events.some(event => event.type === REQUEST_CONTEXT_EVENT && event.ignorable === undefined)) return 0
  const lease = await SessionWriteLease.acquire(dirname(located.path), SessionId(id))
  try {
    const original = readFileSync(located.path, 'utf8')
    const rows: unknown[] = original.split(/\r?\n/).filter(line => line.trim()).map(line => JSON.parse(line))
    const restore = sessionFormatCatalog.createRestore(rows[0], { recovery: 'strict', validation: 'transformed' })
    for (const row of rows.slice(1)) restore.decodeRow(row)
    const log = restore.finish()
    if (log.header.id !== id || log.header.version !== sessionFormatCatalog.currentVersion) {
      throw productFailure(ELECKOI_FAILURE_CODES.stateMismatch, '请求上下文修复的 Session 身份或版本不匹配。', { what: '请求上下文修复的会话标识与版本' })
    }
    let pending: number | undefined
    let repaired = 0
    const events = log.events.map(event => {
      if (event.type === 'step/start') pending = event.seq
      if (event.type === 'step/end' || event.type === 'turn/end') pending = undefined
      if (event.type !== REQUEST_CONTEXT_EVENT || event.ignorable !== undefined) return event
      const record = requestContextRecordSchema.parse(event.data)
      if (record.requestSeq !== pending || record.requestSeq >= event.seq) {
        throw productFailure(ELECKOI_FAILURE_CODES.stateMismatch, `请求上下文记录 ${event.seq} 没有对应正在执行的步骤；原日志未修改。`, { what: '请求上下文记录与执行步骤的对应关系' })
      }
      repaired++
      return { ...event, ignorable: true as const }
    })
    if (repaired === 0) return 0
    // The format catalog returns unbranded records; the official storage validator
    // establishes the Session event contract before any bytes are replaced.
    validateStoredEvents(log.header as unknown as SessionHeader,
      events as unknown as SessionEvent[])
    const encoded = [sessionFormatCatalog.encodeCurrentHeader(log.header, log.inheritedEventCount),
      ...events.map(event => sessionFormatCatalog.encodeCurrentEvent(event))]
    const checked = sessionFormatCatalog.createRestore(encoded[0], { recovery: 'strict', validation: 'current' })
    for (const row of encoded.slice(1)) checked.decodeRow(row)
    checked.finish()
    const serialized = `${encoded.map(row => JSON.stringify(row)).join('\n')}\n`
    const suffix = randomUUID()
    const temporary = `${located.path}.${suffix}.tmp`
    const backup = `${located.path}.request-context-${suffix}.bak`
    let committed = false
    try {
      writeFileSync(temporary, serialized, { encoding: 'utf8', flag: 'wx' })
      if (readFileSync(located.path, 'utf8') !== original) throw productFailure(ELECKOI_FAILURE_CODES.conflictStaleRevision, 'Session 日志在修复期间发生变化。', { what: 'Session 日志' })
      copyFileSync(located.path, backup)
      renameSync(temporary, located.path)
      committed = true
      if (readFileSync(located.path, 'utf8') !== serialized) throw productFailure(ELECKOI_FAILURE_CODES.internal, 'Session 修复写入校验失败。', { what: 'Session 修复的写入校验' })
      const reread = readDshSessionLog(root, id)
      if (!reread || reread.header.id !== id || reread.events.length !== log.events.length) {
        throw productFailure(ELECKOI_FAILURE_CODES.internal, 'Session 修复后的完整性校验失败。', { what: '修复后的 Session 完整性' })
      }
    } catch (error) {
      if (committed) {
        try { renameSync(backup, located.path) }
        catch { throw productFailure(ELECKOI_FAILURE_CODES.ioFailed, `修复失败，原日志备份位于 ${backup}。`, { operation: 'write', path: located.path }) }
      }
      throw error
    } finally {
      if (existsSync(temporary)) rmSync(temporary)
    }
    return repaired
  } finally { await lease.release() }
}

/** Run before Host composition so no Agent writer can race the repair. */
export async function repairRequestContextLogs(root: string): Promise<number> {
  if (!existsSync(root)) return 0
  const ctx = new Context()
  let repaired = 0
  try {
    await ctx.plugin(JsonlSessionPersistence, { root, compression: 'none' })
    for (const stored of await ctx.sessionPersistence.list()) {
      try { repaired += await repairRequestContextLog(root, stored.header.id) }
      catch (error) { console.error(`DSH Session ${stored.header.id} 请求上下文修复失败：`, error) }
    }
  } finally { await ctx.fiber.dispose() }
  if (repaired) console.info(`DSH 请求上下文记录已修复：${repaired}`)
  return repaired
}
