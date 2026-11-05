/**
 * Bug 报告的形状——桌面端与 Android 端共用的一份导出物。
 *
 * 判据（[ADR 0041](../../../../../docs/adr/0041-bug-report-delivery.md)）：用户点一次「报告问题」，
 * 生成的东西要能独立看懂——版本、平台、上次会话是不是异常结束、出现过哪些失败码、尾巴上的日志。
 * 维护者不回问就知道「这是哪个版本的哪条失败」。
 *
 * 四条约束：
 *
 * 1. **只增不改。** `schemaVersion` 是给将来留的；读的一端按版本收紧校验，不猜字段。
 * 2. **不含身份信息。** 不放 `sessionId`、不放用户名；配对会话靠 `startedAt` 与 `ended` 就够
 *    （脱敏规则见 `redact.ts`）。
 * 3. **纯数据。** 没有 IO、没有 Electron、没有 `node:`，两端各自收集后填进同一个形状。
 * 4. **失败先折叠。** 同一个码在日志里会刷屏，报告里只留一条（{@link foldBugReportFailures}）。
 */

/** 报告格式版本。字段只增不改；读的一端低于这个版本按缺失处理，高于则不猜。 */
export const BUG_REPORT_SCHEMA_VERSION = 1

/** 主题行前缀。邮箱侧折叠规则与维护者搜索都认这一个词。 */
export const BUG_REPORT_SUBJECT_PREFIX = '[ElecKoi]'

/**
 * 一次报告里没有任何失败行时的占位（崩溃本身可能没来得及写失败行）。
 *
 * 刻意**不**写成 `eleckoi/…` 的形状：它不是失败码，只是主题行里的占位符——写成码的形状会被当成
 * 一条真的失败去定位，而码表里根本没有它（[ADR 0040](../../../../../docs/adr/0040-error-contract.md)）。
 */
export const BUG_REPORT_NO_FAILURE_CODE = 'none'

/** 报告里最多保留几条失败（同一个码只算一条）。 */
export const BUG_REPORT_MAX_FAILURES = 20

/** 日志尾最多保留多少行。取最后若干行：崩溃发生在结尾那一段。 */
export const BUG_REPORT_LOG_TAIL_MAX_LINES = 200

/**
 * 已经支持的平台。
 *
 * 产品平台是 Windows 与 Android；`macos` / `linux` 是开发机与将来的发行版——开发机上跑出来的报告
 * 也要能落进同一个形状，否则本地调试就只能手写一份。
 */
export const BUG_REPORT_PLATFORMS = ['windows', 'macos', 'linux', 'android'] as const

/** 平台名。 */
export type BugReportPlatform = (typeof BUG_REPORT_PLATFORMS)[number]

/** 一条失败：契约码 + 开发者诊断 + 参数化详情（[ADR 0040](../../../../../docs/adr/0040-error-contract.md)）。 */
export interface BugReportFailure {
  readonly code: string
  /** 开发者诊断原文；进报告前要过脱敏。 */
  readonly message: string
  /** 参数化详情；值里的字符串同样要过脱敏。 */
  readonly details?: Readonly<Record<string, unknown>>
}

/** 跑出这份报告的环境。 */
export interface BugReportEnvironment {
  /** 应用版本，原样记录（带不带 `v` 都行，签名时统一处理）。 */
  readonly appVersion: string
  readonly platform: BugReportPlatform
  readonly arch: string
  /** 系统版本；收集不到就不写。 */
  readonly osVersion?: string
  /** 运行时版本（Electron / Node / Android WebView），收集不到就不写。 */
  readonly runtime?: string
}

/** 上一次会话的起止情况：`ended` 为假就是崩溃或强杀（日志里「有 start 没 end」）。 */
export interface BugReportSession {
  readonly startedAt: string
  readonly ended: boolean
}

/** 一份完整的报告。 */
export interface BugReport {
  readonly schemaVersion: typeof BUG_REPORT_SCHEMA_VERSION
  /** 生成时刻（ISO 8601）。 */
  readonly generatedAt: string
  readonly environment: BugReportEnvironment
  readonly session: BugReportSession
  readonly failures: readonly BugReportFailure[]
  /** 已脱敏的日志尾；用户不勾选就没有这个字段。 */
  readonly logTail?: string
  /** 用户自己补的一句话；同样已脱敏。 */
  readonly notes?: string
}

/**
 * 版本号 → 主题里的版本段。
 *
 * @param appVersion - 应用版本原文。
 * @returns 带 `v` 前缀的版本段；原文已经有 `v` 就不再叠一层。
 */
export function bugReportVersionToken(appVersion: string): string {
  return appVersion.startsWith('v') ? appVersion : `v${appVersion}`
}

/**
 * 去重键：同一签名的报告在邮箱侧折叠成一条。
 *
 * @param report - 报告。
 * @returns `<失败码>@<版本>:<平台>`；没有失败码时用 {@link BUG_REPORT_NO_FAILURE_CODE}。
 */
export function bugReportSignature(report: BugReport): string {
  const code = report.failures[0]?.code ?? BUG_REPORT_NO_FAILURE_CODE
  return `${code}@${bugReportVersionToken(report.environment.appVersion)}:${report.environment.platform}`
}

/**
 * 邮件主题：`[ElecKoi] <失败码> @ <版本> <平台>`。
 *
 * 给人看的形态（空格分隔），去重键用 {@link bugReportSignature}。两者刻意分开：主题要能一眼认出
 * 是哪条失败，签名要能塞进邮箱规则且不依赖显示宽度。
 *
 * @param report - 报告。
 * @returns 主题行。
 */
export function bugReportSubject(report: BugReport): string {
  const code = report.failures[0]?.code ?? BUG_REPORT_NO_FAILURE_CODE
  const version = bugReportVersionToken(report.environment.appVersion)
  return `${BUG_REPORT_SUBJECT_PREFIX} ${code} @ ${version} ${report.environment.platform}`
}

/**
 * 日志尾只留最后若干行。
 *
 * 取最后而不是最前：崩溃与失败的现场在结尾，开头的会话标记没有诊断价值。
 *
 * @param text - 日志原文。
 * @param maxLines - 保留行数，取缺省或一个正整数。
 * @returns 截断后的文本；行数不超限时原样返回（不重排、不补换行）。
 */
export function limitLogTail(text: string, maxLines: number = BUG_REPORT_LOG_TAIL_MAX_LINES): string {
  if (!Number.isFinite(maxLines) || maxLines <= 0) return ''
  const lines = text.split('\n')
  if (lines.length <= maxLines) return text
  return lines.slice(lines.length - maxLines).join('\n')
}

/**
 * 失败折叠：按码去重（先到的保留），并截到上限。
 *
 * @param failures - 收集到的失败，可能同一个码重复很多次。
 * @returns 折叠后的新数组；入参不变。
 */
export function foldBugReportFailures(failures: readonly BugReportFailure[]): BugReportFailure[] {
  const byCode = new Map<string, BugReportFailure>()
  for (const failure of failures) {
    if (!byCode.has(failure.code)) byCode.set(failure.code, failure)
    if (byCode.size >= BUG_REPORT_MAX_FAILURES) break
  }
  return [...byCode.values()]
}

/**
 * 是不是一份合法报告。
 *
 * 用在两端交界处（主进程收渲染层的构件、将来收 Android 传来的包）：形状不对就整份拒收，
 * 不猜、不修补。**永不抛。**
 *
 * @param value - 任意值。
 * @returns 合法时为 true。
 */
export function isBugReport(value: unknown): value is BugReport {
  if (!isRecord(value)) return false
  if (value.schemaVersion !== BUG_REPORT_SCHEMA_VERSION) return false
  if (!isFilledString(value.generatedAt)) return false

  const environment = value.environment
  if (!isRecord(environment)) return false
  if (!isFilledString(environment.appVersion)) return false
  if (!isBugReportPlatform(environment.platform)) return false
  if (!isFilledString(environment.arch)) return false
  if (!isOptionalFilledString(environment.osVersion)) return false
  if (!isOptionalFilledString(environment.runtime)) return false

  const session = value.session
  if (!isRecord(session)) return false
  if (!isFilledString(session.startedAt)) return false
  if (typeof session.ended !== 'boolean') return false

  const failures = value.failures
  if (!Array.isArray(failures)) return false
  if (failures.length > BUG_REPORT_MAX_FAILURES) return false
  if (!failures.every(isBugReportFailure)) return false

  if (!isOptionalString(value.logTail)) return false
  if (!isOptionalString(value.notes)) return false
  return true
}

/**
 * 平台名校验。
 *
 * @param value - 任意值。
 * @returns 是 {@link BUG_REPORT_PLATFORMS} 里的一员时为 true。
 */
export function isBugReportPlatform(value: unknown): value is BugReportPlatform {
  return typeof value === 'string' && (BUG_REPORT_PLATFORMS as readonly string[]).includes(value)
}

/**
 * 单条失败的形状校验。
 *
 * @param value - 任意值。
 * @returns 合法时为 true。
 */
function isBugReportFailure(value: unknown): value is BugReportFailure {
  if (!isRecord(value)) return false
  if (!isFilledString(value.code)) return false
  if (typeof value.message !== 'string') return false
  if (value.details === undefined) return true
  return isRecord(value.details)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFilledString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string'
}

function isOptionalFilledString(value: unknown): boolean {
  return value === undefined || isFilledString(value)
}
