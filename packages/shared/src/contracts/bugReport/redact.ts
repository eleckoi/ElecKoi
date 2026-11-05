/**
 * 报告脱敏——把「本机才该知道的东西」换成占位符。
 *
 * 判据（[ADR 0042](../../../../../docs/adr/0042-bug-report-delivery.md)）：报告要发给维护者，所以
 * 它默认只带失败码与日志尾；即便如此，日志里的路径、用户名、邮箱和凭据参数也不该跟着走。
 *
 * 三条约束：
 *
 * 1. **纯函数。** 同样的输入永远得到同样的输出，能单测；不读环境变量、不碰文件系统。
 * 2. **宁可多删。** 认不出的形态保持原样是允许的，但**已经认出的必须删干净**：显式给的
 *    `home` / `userData` 优先于通用形态，用户名最后统一抹（路径抹掉之后，散落在别处的同一个
 *    用户名还在）。
 * 3. **不猜语义。** 只处理有明确形态的东西（路径前缀、邮箱、`token=` 这类参数），不去猜哪个
 *    数字是 QQ 号、哪段是对话内容——猜错会删掉诊断信息。
 */
import type { BugReport, BugReportFailure } from './report'

/** 家目录占位符。 */
export const REDACTED_HOME = '<home>'

/** 应用数据目录占位符（`userData`、Android 沙箱目录）。 */
export const REDACTED_USER_DATA = '<userData>'

/** 用户名占位符。 */
export const REDACTED_USER_NAME = '<user>'

/** 邮箱占位符。 */
export const REDACTED_EMAIL = '<email>'

/** 凭据占位符。 */
export const REDACTED_SECRET = '<redacted>'

/** 脱敏需要的本机路径。都是可选的：不给就走通用形态。 */
export interface BugReportRedactionOptions {
  /** 家目录，例如 `C:\Users\alice` 或 `/home/alice`。 */
  readonly home?: string
  /** 应用数据目录，例如 `C:\Users\alice\AppData\Roaming\ElecKoi`。 */
  readonly userData?: string
  /** 系统用户名；不给时从 `home` 末段推导。 */
  readonly userName?: string
}

/** Windows 用户目录：`C:\Users\<名>`，容忍被 JSON 转义成双反斜杠的形态。 */
const WINDOWS_HOME_PATTERN = /[A-Za-z]:\\{1,2}Users\\{1,2}[^\\\s"',;]+/g

/** POSIX 用户目录：`/home/<名>` 与 macOS 的 `/Users/<名>`。 */
const POSIX_HOME_PATTERN = /(?<![\w.-])\/(?:home|Users)\/[^/\s"':,;]+/g

/** Android 沙箱：`/data/data/<包名>` 与 `/data/user/<N>/<包名>`。 */
const ANDROID_SANDBOX_PATTERN = /(?<![\w.-])\/data\/(?:data|user\/\d+)\/[A-Za-z0-9_.]+/g

/** 邮箱。 */
const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g

/** `token=…` / `api_key: "…"` / `"token":"…"` / `Authorization: Bearer …` 这类参数。键名后面可能还有
 * 一个 JSON 的闭合引号，所以 `[:=]` 前允许一个可选的引号。 */
const SECRET_PARAM_PATTERN =
  /((?:api[_-]?key|access[_-]?token|refresh[_-]?token|auth[_-]?token|token|secret|password|passwd|authorization)\s*["']?\s*[:=]\s*)(["']?)((?:Bearer|Basic)\s+)?([^\s"'&,;}\]]+)/gi

/** 用户名短于这个长度就不做全局替换：单字符会误伤正文。 */
const MIN_USER_NAME_LENGTH = 2

/**
 * 一段文本脱敏。
 *
 * @param text - 原文。
 * @param options - 本机路径与用户名；缺省只用通用形态。
 * @returns 脱敏后的文本；没有可识别内容时原样返回。
 */
export function redactReportText(text: string, options: BugReportRedactionOptions = {}): string {
  if (text === '') return ''
  let redacted = text

  // 显式路径最先替换，且**长的先换**：`userData` 通常就在家目录下面，先换家目录会让剩下的
  // 一段再也匹配不上 `userData`，结果只抹掉半截。
  const userData = options.userData?.trim() ?? ''
  if (userData !== '') redacted = replaceAllIgnoreCase(redacted, userData, REDACTED_USER_DATA)
  const home = options.home?.trim() ?? ''
  if (home !== '') redacted = replaceAllIgnoreCase(redacted, home, REDACTED_HOME)

  redacted = redacted
    .replace(WINDOWS_HOME_PATTERN, REDACTED_HOME)
    .replace(POSIX_HOME_PATTERN, REDACTED_HOME)
    .replace(ANDROID_SANDBOX_PATTERN, REDACTED_USER_DATA)
    .replace(EMAIL_PATTERN, REDACTED_EMAIL)
    .replace(SECRET_PARAM_PATTERN, (_match, key: string, quote: string, scheme: string | undefined) => {
      return `${key}${quote}${scheme ?? ''}${REDACTED_SECRET}`
    })

  // 用户名最后抹：路径换掉之后，用户名还会以目录名、参数值等形式散落在别处。
  const userName = userNameOf(options)
  if (userName !== undefined) redacted = replaceAllWholeWord(redacted, userName, REDACTED_USER_NAME)
  return redacted
}

/**
 * 整份报告脱敏：失败说明、详情里的字符串、日志尾、备注都过一遍。
 *
 * `code` 与 `details` 非字符串的值原样保留——码是枚举，数字/布尔没有身份信息。
 *
 * @param report - 报告。
 * @param options - 本机路径与用户名。
 * @returns 新的报告对象；入参不变。
 */
export function redactBugReport(
  report: BugReport,
  options: BugReportRedactionOptions = {}
): BugReport {
  return {
    ...report,
    failures: report.failures.map((failure) => redactFailure(failure, options)),
    ...(report.logTail === undefined
      ? {}
      : { logTail: redactReportText(report.logTail, options) }),
    ...(report.notes === undefined ? {} : { notes: redactReportText(report.notes, options) })
  }
}

function redactFailure(
  failure: BugReportFailure,
  options: BugReportRedactionOptions
): BugReportFailure {
  return {
    code: failure.code,
    message: redactReportText(failure.message, options),
    ...(failure.details === undefined
      ? {}
      : { details: redactDetails(failure.details, options) })
  }
}

function redactDetails(
  details: Readonly<Record<string, unknown>>,
  options: BugReportRedactionOptions
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(details)) {
    if (typeof value === 'string') result[key] = redactReportText(value, options)
    else if (Array.isArray(value)) {
      result[key] = value.map((item) => (typeof item === 'string' ? redactReportText(item, options) : item))
    } else result[key] = value
  }
  return result
}

/** 用户名：显式给的优先，否则取家目录末段。太短的一律不抹。 */
function userNameOf(options: BugReportRedactionOptions): string | undefined {
  const explicit = options.userName?.trim() ?? ''
  const candidate = explicit !== '' ? explicit : lastPathSegment(options.home ?? '')
  return candidate.length >= MIN_USER_NAME_LENGTH ? candidate : undefined
}

function lastPathSegment(path: string): string {
  const match = /[\\/]([^\\/]+)[\\/]?$/.exec(path.trim())
  return match?.[1]?.trim() ?? ''
}

/** 大小写不敏感的全量替换（Windows 路径大小写不固定）。 */
function replaceAllIgnoreCase(text: string, search: string, replacement: string): string {
  if (search === '') return text
  return text.replace(new RegExp(escapeRegExp(search), 'gi'), replacement)
}

/** 全词替换：`cam` 不会命中 `camera`。 */
function replaceAllWholeWord(text: string, word: string, replacement: string): string {
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}_])${escapeRegExp(word)}(?![\\p{L}\\p{N}_])`,
    'gu'
  )
  return text.replace(pattern, replacement)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
