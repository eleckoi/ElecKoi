/**
 * 报告 → 代发服务的请求体。
 *
 * 判据（[ADR 0041](../../../../../docs/adr/0041-bug-report-delivery.md)）：`mailto:` 在没配默认
 * 邮件客户端的机器上点了没反应，所以给邮件通道加一条「由托管服务代发」的路。这里只拼请求，不发请求
 * ——发请求要网络与超时，那是主进程的事。
 *
 * 三条约束：
 *
 * 1. **只认公开标识。** Web3Forms 的 access key 与 Formspree 的表单地址都是设计上可以放进客户端的；
 *    任何「只在服务端用」的密钥都不进这个形状。
 * 2. **端点必须是 https。** 报告里有版本、失败码与（可选的）日志尾，明文 HTTP 免谈。
 * 3. **正文与邮件通道同一份。** 复用 `formatBugReportBody`，两条通道发出去的内容必须一样，
 *    否则「用户在预览里看到的就是发出去的」这条承诺就破了。
 */
import type { BugReport } from './report'
import { bugReportSubject } from './report'
import { formatBugReportBody, type BugReportLetterOptions } from './mailto'
import {
  isBugReportRelayProvider,
  type BugReportRelayConfig
} from './delivery'

/** 自有 Worker 中转的服务名。 */
export const BUG_REPORT_RELAY_WORKER_PROVIDER = 'eleckoi-relay'

/** Worker 中转入参的版本号。字段只增不改，Worker 按它收紧校验。 */
export const BUG_REPORT_RELAY_ENVELOPE_VERSION = 1

/**
 * 发给自有 Worker 的中转信封。
 *
 * 与托管表单那种「一串平铺字段」不同，这里是我们自己的形状：整份已脱敏的报告原样过去，
 * Worker 再校验、再清洗、再决定落 issue 还是进每日摘要。
 */
export interface BugReportRelayEnvelope {
  readonly schemaVersion: typeof BUG_REPORT_RELAY_ENVELOPE_VERSION
  readonly report: BugReport
  readonly letter?: {
    readonly mailboxName?: string
    readonly subscribeUrl?: string
  }
}

/** 一条可以直接 `fetch` 的请求。 */
export interface BugReportRelayRequest {
  readonly url: string
  readonly body: Readonly<Record<string, unknown>>
}

/**
 * 拼代发请求。
 *
 * @param relay - 代发配置（来自发布配置）。
 * @param report - 已脱敏的报告。
 * @param letter - 正文里可选择带上的列表名与订阅地址。
 * @returns 请求；配置不完整时返回 `undefined`，由调用方按「通道不可用」处理。
 */
export function buildBugReportRelayRequest(
  relay: BugReportRelayConfig,
  report: BugReport,
  letter: BugReportLetterOptions = {}
): BugReportRelayRequest | undefined {
  if (!isBugReportRelayProvider(relay.provider)) return undefined
  if (!isHttpsUrl(relay.endpoint)) return undefined
  if (relay.provider === 'web3forms' && relay.accessKey.trim() === '') return undefined

  if (relay.provider === BUG_REPORT_RELAY_WORKER_PROVIDER) {
    const name = letter.mailboxName?.trim() ?? ''
    const subscribe = letter.subscribeUrl?.trim() ?? ''
    const envelope: BugReportRelayEnvelope = {
      schemaVersion: BUG_REPORT_RELAY_ENVELOPE_VERSION,
      report,
      ...(name === '' && subscribe === '' ? {} : {
        letter: {
          ...(name === '' ? {} : { mailboxName: name }),
          ...(subscribe === '' ? {} : { subscribeUrl: subscribe })
        }
      })
    }
    // 信封是具名接口，而传输层要的是「可 JSON 序列化的对象」；两者形状一致，只是没有索引签名，
    // 所以这里转一次。值本身没有变化。
    return { url: relay.endpoint, body: envelope as unknown as Readonly<Record<string, unknown>> }
  }

  const subject = bugReportSubject(report)
  const message = formatBugReportBody(report, letter)
  if (relay.provider === 'web3forms') {
    return {
      url: relay.endpoint,
      body: {
        access_key: relay.accessKey.trim(),
        subject,
        from_name: fromNameOf(relay),
        message
      }
    }
  }
  return {
    url: relay.endpoint,
    body: {
      _subject: subject,
      message
    }
  }
}

/**
 * 发件人显示名。
 *
 * @param relay - 代发配置。
 * @returns 配置里的名字；没配就用产品名。
 */
export function fromNameOf(relay: BugReportRelayConfig): string {
  const name = relay.fromName?.trim() ?? ''
  return name === '' ? 'ElecKoi' : name
}

/**
 * 这个 HTTP 状态码值不值得在同一次用户动作里重试一次：只有 429 与 5xx。
 *
 * 判据是 [ADR 0041](../../../../../docs/adr/0041-bug-report-delivery.md) 决定 14：限流与临时性服务端错误
 * 再试一次可能就好了；其它 4xx 是「请求本身不对」，重试只会再错一次。网络层失败（连不上、DNS、TLS）
 * 不在这个函数里——那种情况由调用方直接降级，连不上再试还是连不上。
 *
 * @param status - HTTP 状态码。
 * @returns 429 或 500..599 时为 true；不是整数、或落在 HTTP 范围外时为 false。
 */
export function isRetriableRelayStatus(status: number): boolean {
  if (!Number.isInteger(status)) return false
  return status === 429 || (status >= 500 && status <= 599)
}

/**
 * 从代发服务的响应里取回执。
 *
 * 只有自有 Worker 会给：它回 `{ "ok": true, "issue": 123 }`。托管表单服务回什么不可控，
 * 一律不给回执——宁可不显示，也不要显示一个编出来的编号。
 *
 * @param provider - 代发服务名。
 * @param responseText - 响应体原文。
 * @returns `#123` 这样的回执，或 `undefined`。
 */
export function bugReportRelayReceipt(
  provider: string,
  responseText: string
): string | undefined {
  if (provider !== BUG_REPORT_RELAY_WORKER_PROVIDER) return undefined
  try {
    const parsed: unknown = JSON.parse(responseText)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined
    const issue = (parsed as Record<string, unknown>).issue
    if (typeof issue === 'number' && Number.isInteger(issue) && issue > 0) return `#${issue}`
    if (typeof issue === 'string' && issue.trim() !== '') return `#${issue.trim()}`
    return undefined
  } catch {
    return undefined
  }
}

function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value.trim())
    return url.protocol === 'https:' && url.hostname !== ''
  } catch {
    return false
  }
}
