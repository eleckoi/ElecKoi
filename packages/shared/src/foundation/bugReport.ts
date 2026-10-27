/**
 * 从日志行拼出一份 Bug 报告——纯函数，不碰文件系统。桌面主进程与 Android 渲染层共用。
 *
 * 判据（[ADR 0041](../../../../docs/adr/0041-bug-report-delivery.md)）：报告要能独立看懂，所以
 * 它只留三样东西——环境（版本 / 平台 / 架构）、上次会话是否异常结束、失败行（码 + 诊断 + 详情）。
 * 日志尾是可选加项，默认不带。
 *
 * 三条约束：
 *
 * 1. **红线在出口。** 拼完立刻过 `redactBugReport`，调用方拿到的就是脱敏后的报告；没有「先拼一份
 *    原文再脱敏」的中间状态可漏。
 * 2. **只认契约形状的行。** 失败行必须同时有 `phase: 'failure'` 与字符串 `code`（`logAction` 与
 *    渲染层转发都写这个形状）；其余行只进日志尾。
 * 3. **失败先折叠。** 同一个码刷屏几十次也只留一条（`foldBugReportFailures`）。
 */
import {
  BUG_REPORT_SCHEMA_VERSION,
  foldBugReportFailures,
  limitLogTail,
  type BugReport,
  type BugReportEnvironment,
  type BugReportFailure,
  type BugReportSession
} from '../contracts/bugReport/report'
import { redactBugReport, type BugReportRedactionOptions } from '../contracts/bugReport/redact'

/** 收集一份报告要的输入。 */
export interface BugReportCollection {
  /** 最近一段日志行（已按时间顺序）。 */
  readonly lines: readonly string[]
  readonly environment: BugReportEnvironment
  readonly session: BugReportSession
  /** 用户是否勾选了「带上日志尾」。 */
  readonly includeLogTail: boolean
  /** 用户补的一句话。 */
  readonly notes?: string
  /** 本机路径，用于脱敏；不给就只过通用形态。 */
  readonly redaction?: BugReportRedactionOptions
  /** 生成时刻；用例传固定值。 */
  readonly generatedAt?: Date
}

/**
 * 日志行 → 失败列表（未折叠）。
 *
 * @param lines - 日志行。
 * @returns 按出现顺序的失败；形状不对的行跳过。
 */
export function collectReportFailures(lines: readonly string[]): BugReportFailure[] {
  const failures: BugReportFailure[] = []
  for (const line of lines) {
    const record = parseRecord(line)
    if (record === undefined) continue
    if (record.phase !== 'failure') continue
    const code = record.code
    if (typeof code !== 'string' || code.trim() === '') continue
    const message = typeof record.msg === 'string' ? record.msg : code
    const details = record.details
    failures.push({
      code,
      message,
      ...(isRecord(details) ? { details } : {})
    })
  }
  return failures
}

/**
 * 拼一份已脱敏的报告。
 *
 * @param collection - 输入。
 * @returns 报告；`logTail` 只在勾选时出现。
 */
export function buildBugReport(collection: BugReportCollection): BugReport {
  const notes = collection.notes?.trim() ?? ''
  const report: BugReport = {
    schemaVersion: BUG_REPORT_SCHEMA_VERSION,
    generatedAt: (collection.generatedAt ?? new Date()).toISOString(),
    environment: collection.environment,
    session: collection.session,
    failures: foldBugReportFailures(collectReportFailures(collection.lines)),
    ...(collection.includeLogTail
      ? { logTail: limitLogTail(collection.lines.join('\n')) }
      : {}),
    ...(notes === '' ? {} : { notes })
  }
  return redactBugReport(report, collection.redaction ?? {})
}

function parseRecord(line: string): Record<string, unknown> | undefined {
  const trimmed = line.trim()
  if (!trimmed.startsWith('{')) return undefined
  try {
    const parsed: unknown = JSON.parse(trimmed)
    return isRecord(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
