/**
 * 报告 → 飞书表单的预填链接。把一份 `BugReport` 变成浏览器打开就已填好的表单页。
 *
 * 判据（[ADR 0041](../../../../../docs/adr/0041-bug-report-delivery.md) 决定 12）：投递不需要账号、
 * 不需要收件服务器，用户点开链接、看一眼前文、按一次「Submit Anonymously」。所以这里只拼字符串，
 * 不发请求、不读配置、不推导链接——分享链接由维护者从飞书界面复制，客户端只往后追加参数。
 *
 * 四条约束：
 *
 * 1. **题目名是发布契约。** 参数名是 `prefill_<题目名>`，题目名由配置给（可能是中文，所以参数名也要
 *    过 `encodeURIComponent`）。维护者改题目名等于破坏预填，客户端必须跟着发版。
 * 2. **长度按编码后算。** 中文经 `encodeURIComponent` 后一个字符变 9 个，飞书的可用上限在 60,000 与
 *    100,000 之间，所以守卫必须看最终 URL 的长度，不看正文长度。
 * 3. **超限按两档降级，永不失败。** 先截日志尾并在正文里注明，再只带摘要；摘要也装不下就硬截。
 *    返回 `undefined` 只表示「端点没配」（分享链接空或不是 http(s)），不表示「太长」。
 * 4. **正文只有一份实现。** 全文与摘要都复用 `mailto.ts` 的格式化器，表单、邮件、复制发出去的
 *    是同一份内容。
 */
import { formatBugReportBody, formatBugReportSummary } from './mailto'
import {
  bugReportSignature,
  bugReportVersionToken,
  limitLogTail,
  type BugReport
} from './report'

/**
 * 预填 URL 的长度预算（编码后的字符数）。
 *
 * 实测（2026-10-29）可用区间在 60,000 与 100,000 之间，取保守值——链接经浏览器、粘贴板与
 * 第三方跳转都可能被再加工，余量比省那几 KB 值钱。
 */
export const BUG_REPORT_FORM_MAX_URL_LENGTH = 32000

/** 第一档降级时日志尾保留多少行。 */
export const BUG_REPORT_FORM_LOG_TAIL_LINES = 40

/** 硬截时正文末尾的标注。 */
const HARD_TRUNCATED_MARK = '（已截断）'

/**
 * 一次表单投递的降级原因。界面据此写句子；契约不拼用户文案
 * （[ADR 0041](../../../../../docs/adr/0041-bug-report-delivery.md)「与已有记录的关系」：报告里的字段是
 * 数据，不是句子；界面上的说明由渲染层写）。
 *
 * 三档与 {@link BugReportFormUrl} 的标记一一对应：截日志尾、只带摘要、摘要也硬截。
 */
export type BugReportFormDegradation = 'log-tail-truncated' | 'summarized' | 'hard-truncated'

/**
 * 表单题目名映射。题目名是发布契约：维护者改题目名 = 客户端必须跟着发版。
 *
 * 每个键是一个**角色**，值是那个角色在表单里的**题目名**（或字段 id）——正文与元信息等文本一律由
 * 报告重新拼，不从配置读，所以同一份配置能复用于每份报告。
 */
export interface BugReportFormFields {
  /** 报告正文（完整文本）的题目名。必填：没有正文的表单没有意义。 */
  readonly body: string
  /** 元信息（签名 / 版本 / 平台 / 生成时间 / 上次会话）的题目名。可选。 */
  readonly meta?: string
  /** 失败码列表的题目名。可选。 */
  readonly code?: string
  /** 附件提示的题目名（客户端不经表单上传文件）。可选。 */
  readonly file?: string
}

/** 表单投递端点。 */
export interface BugReportFormConfig {
  /** 表单**填写页**的分享链接。必须带 `/form/` 段——飞书返回的 `/share/base/shrc…` 未登录会 302 到登录页。 */
  readonly shareUrl: string
  readonly fields: BugReportFormFields
}

/** 拼好的表单链接，以及"这次发出去的是什么"。 */
export interface BugReportFormUrl {
  readonly url: string
  /** 正文被降级成摘要（第二档）。 */
  readonly summarized: boolean
  /** 日志尾被截短（第一档）。 */
  readonly truncatedLogTail: boolean
  /** 降级原因的判别值；`[]` = 全文。句子由渲染层写，这里只给枚举。 */
  readonly reasons: readonly BugReportFormDegradation[]
}

/** 一份表单题目的取值：角色 → 进链接的文本。 */
interface BugReportFormValues {
  readonly body: string
  readonly meta: string
  readonly code: string
  readonly file: string
}

/**
 * 报告 → 一条已经填好的表单链接。
 *
 * @param report - 已脱敏的报告。
 * @param config - 分享链接与题目名映射（发布配置注入，不写死在仓库里）。
 * @param options.maxLength - 编码后 URL 的上限，缺省 {@link BUG_REPORT_FORM_MAX_URL_LENGTH}。
 * @returns 链接与降级标记；分享链接不可用时返回 `undefined`（界面据此不渲染这个通道）。
 */
export function buildBugReportFormUrl(
  report: BugReport,
  config: BugReportFormConfig,
  options: { readonly maxLength?: number } = {}
): BugReportFormUrl | undefined {
  const shareUrl = config.shareUrl.trim()
  if (!isHttpUrl(shareUrl)) return undefined
  if (config.fields.body.trim() === '') return undefined

  const maxLength = options.maxLength ?? BUG_REPORT_FORM_MAX_URL_LENGTH
  const compose = (body: string): string =>
    composeFormUrl(shareUrl, config.fields, formValuesOf(report, body))

  const fullUrl = compose(formatBugReportBody(report))
  if (fullUrl.length <= maxLength) {
    return { url: fullUrl, summarized: false, truncatedLogTail: false, reasons: [] }
  }

  // 第一档：只留最近 40 行日志尾，并在正文末尾说明截断与原始行数。
  const logTail = report.logTail
  if (logTail !== undefined && lineCount(logTail) > BUG_REPORT_FORM_LOG_TAIL_LINES) {
    const truncated = limitLogTail(logTail, BUG_REPORT_FORM_LOG_TAIL_LINES)
    const body = `${formatBugReportBody({ ...report, logTail: truncated })}\n${logTailTruncatedMark(logTail)}`
    const url = compose(body)
    if (url.length <= maxLength) {
      return { url, summarized: false, truncatedLogTail: true, reasons: ['log-tail-truncated'] }
    }
  }

  // 第二档：只带摘要。全文由调用方交给剪贴板。
  const summary = formatBugReportSummary(report)
  const summaryUrl = compose(summary)
  if (summaryUrl.length <= maxLength) {
    return { url: summaryUrl, summarized: true, truncatedLogTail: false, reasons: ['summarized'] }
  }

  // 第三档：摘要也装不下，硬截到能装下的长度。仍然返回——「太长」不是「端点没配」。
  const skeleton = compose('').length
  const budget = maxLength - skeleton
  const body = fitBody(summary, HARD_TRUNCATED_MARK, budget)
  return {
    url: compose(body),
    summarized: true,
    truncatedLogTail: false,
    reasons: ['summarized', 'hard-truncated']
  }
}

/**
 * 表单配置的形状校验。
 *
 * 用在读内置配置与收跨进程载荷的地方：形状不对按「未配置」处理。**永不抛。**
 *
 * @param value - 任意值。
 * @returns 合法时为 true。
 */
export function isBugReportFormConfig(value: unknown): value is BugReportFormConfig {
  if (!isRecord(value)) return false
  if (typeof value.shareUrl !== 'string') return false
  const fields = value.fields
  if (!isRecord(fields)) return false
  if (typeof fields.body !== 'string' || fields.body.trim() === '') return false
  return (
    isOptionalString(fields.meta) && isOptionalString(fields.code) && isOptionalString(fields.file)
  )
}

/** 正文之外的三条题目：元信息、失败码、附件提示。 */
function formValuesOf(report: BugReport, body: string): BugReportFormValues {
  return {
    body,
    meta: [
      `签名：${bugReportSignature(report)}`,
      `版本：${bugReportVersionToken(report.environment.appVersion)}`,
      `平台：${report.environment.platform}`,
      `架构：${report.environment.arch}`,
      `生成时间：${report.generatedAt}`,
      `上次会话：${report.session.ended ? '正常结束' : '异常结束'}`
    ].join(' · '),
    code: formatCodeList(report),
    file: '完整 JSON 可用「导出文件」另存；客户端不经表单上传文件。'
  }
}

/** 失败码用顿号连接；空列表给一句固定说明（原生崩溃来不及写失败行）。 */
function formatCodeList(report: BugReport): string {
  const codes = report.failures.map((failure) => failure.code)
  return codes.length === 0 ? '无失败行（可能是原生崩溃或强杀）' : codes.join('、')
}

/** 按「角色在配置里存在才拼参数」的顺序拼 URL：不塞空参数。 */
function composeFormUrl(
  shareUrl: string,
  fields: BugReportFormFields,
  values: BugReportFormValues
): string {
  const params = [prefillParam(fields.body, values.body)]
  if (fields.meta !== undefined) params.push(prefillParam(fields.meta, values.meta))
  if (fields.code !== undefined) params.push(prefillParam(fields.code, values.code))
  if (fields.file !== undefined) params.push(prefillParam(fields.file, values.file))
  const separator = shareUrl.includes('?') ? '&' : '?'
  return `${shareUrl}${separator}${params.join('&')}`
}

function prefillParam(name: string, value: string): string {
  return `prefill_${encodeURIComponent(name)}=${encodeURIComponent(value)}`
}

/** 日志尾的原行数，只用于截断标注。 */
function lineCount(text: string): number {
  return text.split('\n').length
}

/** 第一档降级的正文标注：截了什么、原来多少行、现在多少行。 */
function logTailTruncatedMark(logTail: string): string {
  return `（日志尾已截断：原文 ${lineCount(logTail)} 行，这里只保留最近 ${BUG_REPORT_FORM_LOG_TAIL_LINES} 行。）`
}

/**
 * 硬截：留下 `text` 里装得进 `budget` 个编码字符的最长前缀，末尾带一句标注。
 *
 * 按码点切（`Array.from`），保证不会把代理对切成半个字符——`encodeURIComponent` 对孤立代理项会抛。
 * 连标注都装不下时返回空串：宁可正文为空，也不要抛。
 */
function fitBody(text: string, mark: string, budget: number): string {
  if (budget <= 0) return ''
  const chars = Array.from(text)
  const withMark = (count: number): string => `${chars.slice(0, count).join('').trimEnd()}\n${mark}`
  let best = ''
  let low = 0
  let high = chars.length
  while (low <= high) {
    const middle = Math.floor((low + high) / 2)
    const candidate = withMark(middle)
    if (encodeURIComponent(candidate).length <= budget) {
      best = candidate
      low = middle + 1
    } else {
      high = middle - 1
    }
  }
  if (best !== '') return best
  return encodeURIComponent(mark).length <= budget ? mark : ''
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\/\S/i.test(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string'
}
