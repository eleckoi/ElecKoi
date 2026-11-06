/**
 * 报告 → GitHub issue。正文、隐藏签名块与一条预填链接。
 *
 * 判据（[ADR 0042](../../../../../docs/adr/0042-bug-report-delivery.md) 决定 4）：issue 通道进
 * **收件箱仓库**，由那里的 workflow 按签名折叠，主仓库的 issue 列表不涨。折叠要知道「这是哪条
 * 签名」，所以正文第一行埋一行渲染时不可见的注释块；它既是 workflow 的输入，也是这份契约与
 * workflow 之间唯一的耦合点。
 *
 * 四条约束：
 *
 * 1. **用户在浏览器里点提交，不是客户端建 issue。** 这里只拼 URL，不带 token、不发请求。
 * 2. **签名块在正文里，不在 URL 参数里。** GitHub 的 issue 表单会吃掉 `?body=` 预填（模板优先），
 *    所以长报告本来就只能「复制正文 → 粘贴」，签名必须跟着正文走。
 * 3. **长度按编码后算。** 中文经 `encodeURIComponent` 一个字符变 9 个，守卫看最终 URL 长度。
 * 4. **装不下就摘要。** 与邮件通道同一个取舍：宁可多一步粘贴，也不发半份日志。
 */
import { BUG_REPORT_NO_FAILURE_CODE, type BugReport, type BugReportPlatform } from './report'
import {
  BUG_REPORT_LOG_TAIL_MAX_LINES,
  BUG_REPORT_SCHEMA_VERSION,
  bugReportSignature,
  bugReportSubject,
  bugReportVersionToken,
  isBugReportPlatform
} from './report'

/** 签名块的标记；workflow 与 {@link parseBugReportSignatureComment} 都认这一个词。 */
export const BUG_REPORT_SIGNATURE_MARKER = 'eleckoi-report'

/**
 * 预填 URL 的长度上限（编码后的字符数）。
 *
 * GitHub 与大浏览器在 8 KB 上下，取保守值；超了就只带摘要。
 */
export const BUG_REPORT_ISSUE_URL_MAX_LENGTH = 6000

/** 收件箱仓库名的形态：`owner/name`。 */
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/

/** 从正文里读回来的签名。字段与 {@link bugReportSignatureRecord} 一一对应。 */
export interface BugReportSignatureRecord {
  readonly schemaVersion: number
  /** 去重键，与 `bugReportSignature(report)` 相等。 */
  readonly signature: string
  readonly code: string
  readonly version: string
  readonly platform: BugReportPlatform
}

/** 拼好的 issue 三件套。 */
export interface BugReportIssueLink {
  readonly url: string
  readonly title: string
  /** 进 URL 的正文；`summarized` 为真时是摘要。 */
  readonly body: string
  /** 正文是不是被降级成了摘要（完整正文由调用方另行提供，通常进剪贴板）。 */
  readonly summarized: boolean
}

/** 预填 issue 需要的配置。 */
export interface BugReportIssueOptions {
  /** `owner/name`，由发布配置注入，不写死在仓库里。 */
  readonly repository: string
  /** 顺带预填的标签；只有对该仓库有写权限的用户才会生效，是便利不是保证。 */
  readonly labels?: readonly string[]
  /** 编码后 URL 的上限，缺省 {@link BUG_REPORT_ISSUE_URL_MAX_LENGTH}。 */
  readonly maxLength?: number
}

/**
 * 收件箱仓库名是否合法。
 *
 * @param value - 任意字符串。
 * @returns 形如 `owner/name` 时为 true。
 */
export function isBugReportRepository(value: string): boolean {
  return REPOSITORY_PATTERN.test(value.trim())
}

/**
 * 报告的签名记录——写进隐藏注释块、由 workflow 读回来的那五个字段。
 *
 * @param report - 报告。
 * @returns 签名记录。
 */
export function bugReportSignatureRecord(report: BugReport): BugReportSignatureRecord {
  return {
    schemaVersion: BUG_REPORT_SCHEMA_VERSION,
    signature: bugReportSignature(report),
    code: report.failures[0]?.code ?? BUG_REPORT_NO_FAILURE_CODE,
    version: bugReportVersionToken(report.environment.appVersion),
    platform: report.environment.platform
  }
}

/**
 * 隐藏签名块：一行 Markdown 注释，渲染时不显示。
 *
 * @param report - 报告。
 * @returns `<!-- eleckoi-report:{…} -->`。
 */
export function formatBugReportSignatureComment(report: BugReport): string {
  return `<!-- ${BUG_REPORT_SIGNATURE_MARKER}:${JSON.stringify(bugReportSignatureRecord(report))} -->`
}

/**
 * 从 issue 正文里读回签名块。
 *
 * workflow 用它做折叠；本地也用它验证「拼出来的正文能被读回去」。**永不抛**。
 *
 * @param body - issue 正文。
 * @returns 签名记录；没有、超量或被改坏时返回 `undefined`。
 */
export function parseBugReportSignatureComment(body: string): BugReportSignatureRecord | undefined {
  const match = new RegExp(`<!--\\s*${BUG_REPORT_SIGNATURE_MARKER}:(\\{[\\s\\S]*?\\})\\s*-->`).exec(body)
  if (match === null) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(match[1] ?? '')
  } catch {
    return undefined
  }
  return signatureRecordOf(parsed)
}

/**
 * issue 正文（Markdown）。
 *
 * @param report - 已脱敏的报告。
 * @returns Markdown 正文，第一行是隐藏签名块。
 */
export function formatBugReportIssueBody(report: BugReport): string {
  const lines: string[] = [
    formatBugReportSignatureComment(report),
    '',
    `**版本**：\`${bugReportVersionToken(report.environment.appVersion)}\` · ${report.environment.platform} · ${report.environment.arch}`,
    `**生成时间**：${report.generatedAt}`,
    `**上次会话**：${report.session.ended ? '正常结束' : '异常结束'}（${report.session.startedAt} 开始）`,
    `**签名**：\`${bugReportSignature(report)}\``
  ]
  if (report.environment.osVersion !== undefined) lines.push(`**系统**：${report.environment.osVersion}`)
  if (report.environment.runtime !== undefined) lines.push(`**运行时**：${report.environment.runtime}`)

  lines.push('', `### 失败（${report.failures.length} 条）`, '')
  if (report.failures.length === 0) {
    lines.push('没有记录到失败行（可能是原生崩溃或强杀）。')
  } else {
    for (const failure of report.failures) {
      lines.push(`- \`${failure.code}\` — ${failure.message.trim() === '' ? '（无诊断文案）' : failure.message}`)
      if (failure.details !== undefined) {
        lines.push('', fenced(JSON.stringify(failure.details, null, 2), 'json'), '')
      }
    }
  }

  if (report.logTail !== undefined && report.logTail !== '') {
    const lineCount = report.logTail.split('\n').length
    lines.push(
      '',
      '<details>',
      `<summary>日志尾（最后 ${Math.min(lineCount, BUG_REPORT_LOG_TAIL_MAX_LINES)} 行，已脱敏）</summary>`,
      '',
      fenced(report.logTail),
      '',
      '</details>'
    )
  }

  if (report.notes !== undefined && report.notes.trim() !== '') {
    lines.push('', `**备注**：${report.notes.trim()}`)
  }

  lines.push('', '> 本报告由 ElecKoi 生成，发送前可以自行删改。')
  return lines.join('\n')
}

/**
 * issue 摘要正文：装不进 URL 时用它。
 *
 * @param report - 报告。
 * @returns Markdown 摘要，第一行仍是隐藏签名块（折叠不依赖正文长度）。
 */
export function formatBugReportIssueSummary(report: BugReport): string {
  const codes = report.failures.map((failure) => failure.code)
  return [
    formatBugReportSignatureComment(report),
    '',
    `**版本**：\`${bugReportVersionToken(report.environment.appVersion)}\` · ${report.environment.platform} · ${report.environment.arch}`,
    `**生成时间**：${report.generatedAt}`,
    `**签名**：\`${bugReportSignature(report)}\``,
    `**失败码**：${codes.length === 0 ? '无失败行' : codes.map((code) => `\`${code}\``).join('、')}`,
    '',
    '完整报告（含日志尾）请粘贴到本 issue 下方；导出方式见应用内的说明。'
  ].join('\n')
}

/**
 * 报告 → 一条预填的「新建 issue」链接。
 *
 * @param report - 已脱敏的报告。
 * @param options - 收件箱仓库、可选标签与长度上限。
 * @returns 三件套；仓库名不合法时返回 `undefined`。
 */
export function buildBugReportIssueUrl(
  report: BugReport,
  options: BugReportIssueOptions
): BugReportIssueLink | undefined {
  const repository = options.repository.trim()
  if (!isBugReportRepository(repository)) return undefined
  const maxLength = options.maxLength ?? BUG_REPORT_ISSUE_URL_MAX_LENGTH
  const title = bugReportSubject(report)
  const labels = options.labels !== undefined && options.labels.length > 0
    ? `&labels=${encodeURIComponent(options.labels.join(','))}`
    : ''

  const fullBody = formatBugReportIssueBody(report)
  const fullUrl = composeIssueUrl(repository, title, fullBody, labels)
  if (fullUrl.length <= maxLength) {
    return { url: fullUrl, title, body: fullBody, summarized: false }
  }

  const summary = formatBugReportIssueSummary(report)
  return {
    url: composeIssueUrl(repository, title, summary, labels),
    title,
    body: summary,
    summarized: true
  }
}

function composeIssueUrl(repository: string, title: string, body: string, labels: string): string {
  const encodedTitle = encodeURIComponent(title)
  const encodedBody = encodeURIComponent(body)
  return `https://github.com/${repository}/issues/new?title=${encodedTitle}&body=${encodedBody}${labels}`
}

/** 正文里可能出现围栏，围栏长度取比正文最长反引号串更长的那一档。 */
function fenced(text: string, language = ''): string {
  const longest = Math.max(2, ...(text.match(/`+/g) ?? []).map((run) => run.length))
  const fence = '`'.repeat(longest + 1)
  return `${fence}${language}\n${text}\n${fence}`
}

/** 已解析的 JSON → 签名记录（校验形状）。 */
function signatureRecordOf(value: unknown): BugReportSignatureRecord | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const fields = value as Record<string, unknown>
  if (typeof fields.schemaVersion !== 'number' || !Number.isInteger(fields.schemaVersion)) return undefined
  if (!isFilledString(fields.signature)) return undefined
  if (!isFilledString(fields.code)) return undefined
  if (!isFilledString(fields.version)) return undefined
  if (!isBugReportPlatform(fields.platform)) return undefined
  return {
    schemaVersion: fields.schemaVersion,
    signature: fields.signature,
    code: fields.code,
    version: fields.version,
    platform: fields.platform
  }
}

function isFilledString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}
