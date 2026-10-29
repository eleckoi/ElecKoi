/**
 * 上一次会话有没有正常结束——从日志里读，不新建状态。
 *
 * 判据（[ADR 0041](../../../../../docs/adr/0041-bug-report-delivery.md) 决定 15）：`AppLog` 每次运行写
 * 一对会话标记（`session.started` / `session.ended`，带同一个 `sessionId`），"有 start 没 end"就是
 * 崩溃或强杀。"上一次会话"取**最近一次没有配对 `ended` 的会话**——不能只看最后一次：崩溃之后再正常
 * 退出几次，异常结论不该被冲成"正常结束"（User Story 12）。
 *
 * 三条约束：
 *
 * 1. **当前会话不参与判断。** 现在正在运行，所以日志里最后一个 `session.started` 一定是本次；
 *    答案只在它之前的会话里找，往后扫到更早的那次崩溃也算数。
 * 2. **跨文件，但有上界。** 日志按天分文件、超限还会轮转成 `.log.1`，所以从新到旧扫；最多读
 *    {@link BUG_REPORT_SESSION_SCAN_FILES} 个文件，找到"没有 ended 的过去会话"就提前停。
 * 3. **只读，永不抛。** 日志缺失、损坏、读不了都返回 `undefined`——报告功能不能因为日志坏了而失败。
 */
import { closeSync, openSync, readdirSync, readSync, statSync } from 'node:fs'
import { join, basename } from 'node:path'
import { APP_LOG_DIRECTORY_NAME, APP_LOG_PREFIX } from '@main/platform/logging/logRotation'
import type { BugReportSession } from '@shared/contracts/bugReport/report'

/** 认得的日志文件名：`eleckoi-desktop-<YYYY-MM-DD>.log` 或它的 `.N` 轮转副本。 */
const LOG_FILE_NAME = new RegExp(`^${APP_LOG_PREFIX}-\\d{4}-\\d{2}-\\d{2}\\.log(\\.\\d+)?$`)

/** 单个文件最多读多少字节（从文件尾读）：日志超过这个体积时只留尾巴。 */
const LOG_READ_MAX_BYTES = 8 * 1024 * 1024

/**
 * 从新到旧最多读几个日志文件。
 *
 * 判定要看多远：崩溃可能隔了好几次正常启动，所以不能像以前那样"凑够两次开始就停"；但也不能
 * 把整周的日志都读进来。日志按天分文件、保留 7 天，一天的轮转副本加几天前足矣。
 */
export const BUG_REPORT_SESSION_SCAN_FILES = 7

/** 一条会话标记。 `time` 是 pino 写的 epoch 毫秒。 */
export interface SessionEvent {
  readonly kind: 'started' | 'ended'
  readonly sessionId: string
  readonly time: number
}

/**
 * 从日志行里挑出会话标记。
 *
 * 只认 `action` 恰好是 `session.started` / `session.ended` 且带字符串 `sessionId` 与数字 `time`
 * 的 JSON 行；普通行、半行、坏 JSON 一律跳过（**永不抛**）。
 *
 * @param lines - 日志行（pino JSON，一行一个对象）。
 * @returns 按出现顺序排列的会话标记。
 */
export function parseSessionEvents(lines: readonly string[]): SessionEvent[] {
  const events: SessionEvent[] = []
  for (const line of lines) {
    const record = parseRecord(line)
    if (record === undefined) continue
    const action = record.action
    const kind = action === 'session.started' ? 'started' : action === 'session.ended' ? 'ended' : undefined
    if (kind === undefined) continue
    const sessionId = record.sessionId
    const time = record.time
    if (typeof sessionId !== 'string' || sessionId === '') continue
    if (typeof time !== 'number' || !Number.isFinite(time)) continue
    events.push({ kind, sessionId, time })
  }
  return events
}

/**
 * 上一次会话的起止情况。
 *
 * 规则：当前会话（最后一个 `session.started`）不参与判断；在它之前的会话里取**最近一次没有
 * 配对 `session.ended` 的**——它可能隔了好几次正常启动，但崩溃证据不会被后来的正常退出冲掉。
 * 之前每次都正常退出时，退一步返回最近一次已结束的会话。
 *
 * @param events - 按时间顺序排列的会话标记（含本次会话的开始）。
 * @returns 上次会话；只有一次开始（首次运行）或没有开始标记时返回 `undefined`。
 */
export function previousSessionOf(events: readonly SessionEvent[]): BugReportSession | undefined {
  const currentStart = lastIndexWhere(events, event => event.kind === 'started')
  if (currentStart <= 0) return undefined
  const sessions = pastSessions(events.slice(0, currentStart))
  for (let index = sessions.length - 1; index >= 0; index -= 1) {
    const session = sessions[index]
    if (session === undefined || session.ended) continue
    return { startedAt: new Date(session.time).toISOString(), ended: false }
  }
  const last = sessions.at(-1)
  if (last === undefined) return undefined
  return { startedAt: new Date(last.time).toISOString(), ended: true }
}

/** 本次会话之前的一次会话；`ended` 表示配对上了同一个 `sessionId` 的结束标记。 */
interface PastSession {
  readonly sessionId: string
  readonly time: number
  ended: boolean
}

/**
 * 把会话标记还原成一次次的会话。
 *
 * @param events - 本次会话开始之前的标记（按时间顺序）。
 * @returns 按开始顺序排列的会话；没有开始标记时为空。
 */
function pastSessions(events: readonly SessionEvent[]): PastSession[] {
  const sessions: PastSession[] = []
  for (const event of events) {
    if (event.kind === 'started') {
      sessions.push({ sessionId: event.sessionId, time: event.time, ended: false })
      continue
    }
    // 结束标记只认同一个 sessionId；对不上就丢掉（日志坏了也不能抛）。
    const opened = lastOpenSession(sessions, event.sessionId)
    if (opened !== undefined) opened.ended = true
  }
  return sessions
}

function lastOpenSession(sessions: readonly PastSession[], sessionId: string): PastSession | undefined {
  for (let index = sessions.length - 1; index >= 0; index -= 1) {
    const session = sessions[index]
    if (session !== undefined && !session.ended && session.sessionId === sessionId) return session
  }
  return undefined
}

/**
 * 从磁盘读上一次会话。
 *
 * 从新到旧读日志（最多 {@link BUG_REPORT_SESSION_SCAN_FILES} 个文件），每读完一个就用手上
 * 全部标记判一次：已经找到"过去会话没有 ended"就可以提前停——那是最终答案，更旧的文件里
 * 的事件都发生在它之前，改写不了它。找不到就继续往前读，直到读满上限。
 *
 * @param userData - 应用数据根目录（日志在它下面的 `logs/`）。
 * @returns 上次会话；读不到时返回 `undefined`。
 */
export function readPreviousSession(userData: string): BugReportSession | undefined {
  const events: SessionEvent[] = []
  for (const file of logFilesNewestFirst(userData).slice(0, BUG_REPORT_SESSION_SCAN_FILES)) {
    const text = readTextTail(file)
    if (text === undefined) continue
    // 这次是新文件在前、旧文件在后，所以旧的接在左边。
    events.unshift(...parseSessionEvents(text.split('\n')))
    const session = previousSessionOf(events)
    // 有 start 没 end 的过去会话：证据找到了，更旧的文件不再有发言权。
    if (session !== undefined && !session.ended) return session
  }
  return previousSessionOf(events)
}

/**
 * 最近一份日志的末尾若干行（给报告收集用）。
 *
 * @param userData - 应用数据根目录。
 * @param maxLines - 最多返回多少行。
 * @returns 行数组；没有可用日志时为空数组。
 */
export function readRecentLogLines(userData: string, maxLines: number): string[] {
  if (!Number.isFinite(maxLines) || maxLines <= 0) return []
  for (const file of logFilesNewestFirst(userData)) {
    const text = readTextTail(file)
    if (text === undefined || text.trim() === '') continue
    const lines = text.split('\n').filter(line => line.trim() !== '')
    return lines.slice(Math.max(0, lines.length - maxLines))
  }
  return []
}

/** 日志目录 `logs/` 的绝对路径。 */
export function appLogDirectoryOf(userData: string): string {
  return join(userData, APP_LOG_DIRECTORY_NAME)
}

/** 日志文件，按修改时间从新到旧。 */
function logFilesNewestFirst(userData: string): string[] {
  const directory = appLogDirectoryOf(userData)
  let names: string[]
  try {
    names = readdirSync(directory)
  } catch {
    return []
  }
  const files = names
    .filter(name => LOG_FILE_NAME.test(name))
    .map(name => join(directory, name))
    .map(path => ({ path, time: modifiedAt(path), name: basename(path) }))
    .sort((left, right) => right.time - left.time || right.name.localeCompare(left.name))
  return files.map(file => file.path)
}

function modifiedAt(path: string): number {
  try {
    return statSync(path).mtimeMs
  } catch {
    return 0
  }
}

/**
 * 读文件尾：最多 {@link LOG_READ_MAX_BYTES} 字节，起点不在行首时丢掉半行。
 *
 * @param path - 文件路径。
 * @returns 文本；读不了时返回 `undefined`。
 */
function readTextTail(path: string): string | undefined {
  let descriptor: number | undefined
  try {
    descriptor = openSync(path, 'r')
    const size = statSync(path).size
    const start = Math.max(0, size - LOG_READ_MAX_BYTES)
    const buffer = Buffer.alloc(size - start)
    let filled = 0
    while (filled < buffer.length) {
      const read = readSync(descriptor, buffer, filled, buffer.length - filled, start + filled)
      if (read <= 0) break
      filled += read
    }
    const text = buffer.subarray(0, filled).toString('utf8')
    if (start === 0) return text
    const firstBreak = text.indexOf('\n')
    return firstBreak < 0 ? '' : text.slice(firstBreak + 1)
  } catch {
    return undefined
  } finally {
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor)
      } catch {
        // 关不上不影响返回值：文件句柄由进程退出回收。
      }
    }
  }
}

function lastIndexWhere<T>(items: readonly T[], predicate: (item: T) => boolean): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index]
    if (item !== undefined && predicate(item)) return index
  }
  return -1
}

function parseRecord(line: string): Record<string, unknown> | undefined {
  const trimmed = line.trim()
  if (!trimmed.startsWith('{')) return undefined
  try {
    const parsed: unknown = JSON.parse(trimmed)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined
    return parsed as Record<string, unknown>
  } catch {
    return undefined
  }
}
