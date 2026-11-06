/**
 * 报告 → 邮件。把一份 `BugReport` 变成正文、摘要和一条 `mailto:` 链接。
 *
 * 判据（[ADR 0042](../../../../../docs/adr/0042-bug-report-delivery.md)）：投递不靠服务器，靠用户
 * 已经有的邮件客户端。所以这里只拼字符串，不发邮件、不读配置；收件地址由调用方（发布配置）给。
 *
 * 三条约束：
 *
 * 1. **长度按编码后算。** `mailto:` 会被 shell / 邮件客户端当作命令行参数，各家上限不一致，
 *    中文经 `encodeURIComponent` 后一个字符变 9 个，所以守卫必须看最终 URL 的长度，不看正文长度。
 * 2. **超限降级，不截正文。** 装不下就换成摘要（版本、平台、失败码、生成时间），完整正文由调用方
 *    交给剪贴板——宁可多一步粘贴，也不要发出半份日志。
 * 3. **正文是纯文本。** 没有 HTML、没有附件；附件（zip）由导出流程另外提供。
 */
import type { BugReport } from './report'
import {
  BUG_REPORT_LOG_TAIL_MAX_LINES,
  bugReportSignature,
  bugReportSubject,
  bugReportVersionToken
} from './report'

/**
 * `mailto:` 的长度上限（编码后的字符数）。
 *
 * Windows 的 `ShellExecute` 对整条命令有约 2048 字符的限制，再给邮件客户端留一点余地。macOS 与
 * 各客户端更宽松，取保守值对谁都不吃亏。
 */
export const BUG_REPORT_MAILTO_MAX_LENGTH = 1800

/** 收件地址的宽松形态校验：有且只有一个 `@`，两边非空，域名里有根点。 */
export const BUG_REPORT_MAILBOX_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** 正文里可选择带上的页脚信息（列表名 / 订阅地址）。 */
export interface BugReportLetterOptions {
  /** 邮件目的地的显示名，例如列表名。 */
  readonly mailboxName?: string
  /** 想跟进时可以订阅的地址。 */
  readonly subscribeUrl?: string
  /** `mailto:` 编码后的长度上限；缺省 {@link BUG_REPORT_MAILTO_MAX_LENGTH}。 */
  readonly maxLength?: number
}

/** 拼好的邮件三件套。 */
export interface BugReportMailto {
  /** `mailto:` 链接，已经过长度守卫。 */
  readonly url: string
  readonly subject: string
  /** 进链接的正文；`summarized` 为真时是摘要。 */
  readonly body: string
  /** 正文是不是被降级成了摘要（完整正文由调用方另行提供）。 */
  readonly summarized: boolean
}

/**
 * 收件地址是否可用。
 *
 * @param value - 任意字符串。
 * @returns 形态合法时为 true。
 */
export function isBugReportMailbox(value: string): boolean {
  return BUG_REPORT_MAILBOX_PATTERN.test(value.trim())
}

/**
 * 完整正文。
 *
 * @param report - 已脱敏的报告。
 * @returns 纯文本正文；换行用 `\n`，进 URL 时再转 `\r\n`。
 */
export function formatBugReportBody(report: BugReport, letter: BugReportLetterOptions = {}): string {
  const lines: string[] = [
    'ElecKoi 故障报告',
    '',
    `签名：${bugReportSignature(report)}`,
    `版本：${bugReportVersionToken(report.environment.appVersion)} · ${report.environment.platform} · ${report.environment.arch}`,
    `生成时间：${report.generatedAt}`,
    `上次会话：${report.session.startedAt} 开始 · ${report.session.ended ? '正常结束' : '异常结束'}`
  ]

  if (report.environment.osVersion !== undefined) lines.push(`系统：${report.environment.osVersion}`)
  if (report.environment.runtime !== undefined) lines.push(`运行时：${report.environment.runtime}`)

  lines.push('', `失败（${report.failures.length} 条）：`)
  if (report.failures.length === 0) {
    lines.push('- 没有记录到失败行（可能是原生崩溃或强杀）')
  } else {
    for (const failure of report.failures) {
      lines.push(`- ${failure.code}`)
      if (failure.message.trim() !== '') lines.push(`  ${failure.message}`)
      if (failure.details !== undefined) lines.push(`  详情：${JSON.stringify(failure.details)}`)
    }
  }

  if (report.logTail !== undefined && report.logTail !== '') {
    const lineCount = report.logTail.split('\n').length
    lines.push('', `日志尾（最后 ${Math.min(lineCount, BUG_REPORT_LOG_TAIL_MAX_LINES)} 行，已脱敏）：`, report.logTail)
  }

  if (report.notes !== undefined && report.notes.trim() !== '') {
    lines.push('', '备注：', report.notes.trim())
  }

  lines.push('', '——本报告由 ElecKoi 生成，发送前可以自行删改。')
  const followUp = followUpLine(letter)
  if (followUp !== '') lines.push(followUp)
  return lines.join('\n')
}

/**
 * 摘要正文：装不进 `mailto:` 时用它，保底让维护者看到「哪个版本、哪条失败」。
 *
 * @param report - 报告。
 * @returns 纯文本摘要。
 */
export function formatBugReportSummary(report: BugReport, letter: BugReportLetterOptions = {}): string {
  const codes = report.failures.map((failure) => failure.code)
  return [
    'ElecKoi 故障报告（摘要）',
    '',
    `签名：${bugReportSignature(report)}`,
    `版本：${bugReportVersionToken(report.environment.appVersion)} · ${report.environment.platform} · ${report.environment.arch}`,
    `生成时间：${report.generatedAt}`,
    `上次会话：${report.session.ended ? '正常结束' : '异常结束'}`,
    `失败码：${codes.length === 0 ? '无失败行' : codes.join('、')}`,
    '',
    '完整报告（含日志尾）请粘贴到本邮件下方；导出方式见应用内的说明。',
    ...(followUpLine(letter) === '' ? [] : ['', followUpLine(letter)])
  ].join('\n')
}

/**
 * 报告 → 一条可用的 `mailto:`。
 *
 * @param report - 已脱敏的报告。
 * @param mailbox - 收件地址（发布配置注入，不写死在仓库里）。
 * @param maxLength - 编码后 URL 的上限，缺省 {@link BUG_REPORT_MAILTO_MAX_LENGTH}。
 * @returns 三件套；地址不合法时返回 `undefined`（调用方应改为显示地址 + 复制正文）。
 */
export function buildBugReportMailto(
  report: BugReport,
  mailbox: string,
  letter: BugReportLetterOptions = {}
): BugReportMailto | undefined {
  const to = mailbox.trim()
  if (!isBugReportMailbox(to)) return undefined

  const maxLength = letter.maxLength ?? BUG_REPORT_MAILTO_MAX_LENGTH
  const subject = bugReportSubject(report)
  const fullBody = formatBugReportBody(report, letter)
  const fullUrl = composeMailto(to, subject, fullBody)
  if (fullUrl.length <= maxLength) {
    return { url: fullUrl, subject, body: fullBody, summarized: false }
  }

  const summary = formatBugReportSummary(report, letter)
  return { url: composeMailto(to, subject, summary), subject, body: summary, summarized: true }
}

/**
 * 页脚里的跟进方式。
 *
 * 邮件通道没有回执：发出去就跟丢了。所以目的地是列表时，正文里给一句怎么订阅——报告人想跟进
 * 就自己加入，不想就不用做任何事。
 */
function followUpLine(letter: BugReportLetterOptions): string {
  const name = letter.mailboxName?.trim() ?? ''
  const subscribe = letter.subscribeUrl?.trim() ?? ''
  if (name === '' && subscribe === '') return ''
  const target = name === '' ? '报告列表' : name
  return subscribe === '' ? `已投递到 ${target}。` : `已投递到 ${target}；想跟进可以在 ${subscribe} 订阅。`
}

function composeMailto(to: string, subject: string, body: string): string {
  const crlf = body.replace(/\r?\n/g, '\r\n')
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(crlf)}`
}
