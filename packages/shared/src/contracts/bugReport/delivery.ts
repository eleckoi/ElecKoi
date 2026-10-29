/**
 * 报告投递的线上形状——渲染层与主进程之间那一层。
 *
 * 判据（[ADR 0041](../../../../../docs/adr/0041-bug-report-delivery.md)）：主进程负责收集与脱敏，
 * 渲染层负责展示与选择通道。所以过边界的只有这几样东西：**已脱敏的报告**、**通道配置**、**用户的
 * 选择**，以及失败时落盘的**草稿**（决定 14：失败不丢，也不偷偷重发）。
 *
 * 两条约束：
 *
 * 1. **报告只从主进程流向渲染层。** 渲染层不拼报告、不改报告；它拿到的那份已经脱敏。导出时主进程
 *    重新收集一遍，不信任渲染层回传的副本。
 * 2. **地址不进渲染层代码，只经这里的数据过去。** 收件邮箱、收件仓库与表单链接来自发布配置；为空
 *    表示该通道未配置，界面不显示对应按钮。
 */
import type { BugReportFormConfig } from './form'
import { isBugReport, type BugReport } from './report'

/**
 * 代发通道能用的托管服务。
 *
 * `eleckoi-relay` 是自有的 Cloudflare Worker 中转（[ADR 0041](../../../../../docs/adr/0041-bug-report-delivery.md) 决定 10）：
 * 客户端只认一个端点，后面接 issue 与邮件摘要都是服务端的事。前两个是「客户端公开标识」那一类的
 * 托管表单服务，`eleckoi-relay` 的入口不需要密钥——防线在服务端的限流与结构校验。
 */
export const BUG_REPORT_RELAY_PROVIDERS = ['web3forms', 'formspree', 'eleckoi-relay'] as const

/** 代发服务名。 */
export type BugReportRelayProvider = (typeof BUG_REPORT_RELAY_PROVIDERS)[number]

/**
 * 代发通道：由第三方托管服务把报告变成一封邮件。
 *
 * 它解决的是 `mailto:` 最弱的一环——Windows 上没配默认邮件客户端时，`mailto:` 点了没反应。
 * 代价写在 ADR 0041：报告经第三方中转，公开标识可被提取，免费额度有限。
 */
export interface BugReportRelayConfig {
  readonly provider: BugReportRelayProvider
  /** 服务端点（完整 https URL）。 */
  readonly endpoint: string
  /** Web3Forms 的 access key；Formspree 用不到，留空。 */
  readonly accessKey: string
  /** 邮件里显示的发件人名字。 */
  readonly fromName?: string
}

/**
 * 通道配置。空字符串 = 该通道未配置。
 *
 * 邮件目的地可以是一个邮件列表：`mailboxName` 是它在界面上的名字，`subscribeUrl` 让报告人能
 * 自己跟进（邮件通道没有回执，不订阅就跟丢了）。
 */
export interface BugReportDeliveryConfig {
  readonly mailbox: string
  /** 邮件目的地的显示名，例如列表名；空就用「邮件」。 */
  readonly mailboxName?: string
  /** 想跟进这条报告时可以订阅的地址。 */
  readonly subscribeUrl?: string
  readonly repository: string
  /** 代发通道；没配就没有这个字段。 */
  readonly relay?: BugReportRelayConfig
  /**
   * 飞书表单通道（决定 12，默认收件端点）；没配就没有这个字段。
   *
   * 分享链接与题目名都来自发布配置：客户端不推导链接、不改题目名。
   */
  readonly form?: BugReportFormConfig
}

/** 代发请求：与预览同形——主进程重新收集，不相信渲染层回传的报告。 */
export interface BugReportSendRequest {
  readonly includeLogTail: boolean
  readonly notes?: string
}

/** 代发结果；失败一律抛，`sent` 为真只表示服务返回了 2xx。 */
export interface BugReportSendResult {
  readonly sent: boolean
  /**
   * 收件方给的回执，例如收件箱 issue 的编号。只有 `eleckoi-relay` 会给——
   * 报告人看不到私有仓库，但至少知道他那一份被收到了。
   */
  readonly receipt?: string
}

/** 预览请求：要不要带日志尾、用户补的一句话。 */
export interface BugReportPreviewRequest {
  readonly includeLogTail: boolean
  readonly notes?: string
}

/** 预览结果：已脱敏的报告 + 通道配置。 */
export interface BugReportPreview {
  readonly report: BugReport
  readonly delivery: BugReportDeliveryConfig
}

/** 导出请求：导出永远带日志尾（用户按的就是「把它存下来」）。 */
export interface BugReportExportRequest {
  readonly notes?: string
}

/** 导出结果；用户在保存对话框里取消时 `saved` 为假。 */
export interface BugReportExportResult {
  readonly saved: boolean
  readonly path?: string
}

/**
 * 落草稿的请求：发送失败或用户中途关闭时，主进程把已脱敏的报告存进
 * `userData/bug-reports/pending/`（[ADR 0041](../../../../../docs/adr/0041-bug-report-delivery.md) 决定 14）。
 */
export interface BugReportDraftSaveRequest {
  readonly includeLogTail: boolean
  readonly notes?: string
}

/** 草稿写成功后的回执：键由主进程生成，渲染层不猜。 */
export interface BugReportDraftSaved {
  readonly key: string
  readonly savedAt: string
}

/** 一份待重发的草稿：已脱敏的报告 + 落盘时间。 */
export interface BugReportPendingDraft {
  readonly key: string
  readonly savedAt: string
  readonly report: BugReport
}

/** 启动时最多问一次的「上次有 N 份没发出去」。 */
export interface BugReportPendingDrafts {
  readonly drafts: readonly BugReportPendingDraft[]
}

/**
 * 草稿键的最大长度，与 `BUG_REPORT_DRAFT_KEY_PATTERN` 的 `{1,120}` 对齐。
 *
 * 主进程拿它截断过长的签名，所以上限只在这里写一次：形状守卫与落盘实现读同一个数。
 */
export const BUG_REPORT_DRAFT_KEY_MAX_LENGTH = 120

/**
 * 草稿键的形态：只允许 `[A-Za-z0-9._-]`，1..120 字符。
 *
 * 主进程拿它拼文件名，所以这里是防目录穿越的那道门。
 */
export const BUG_REPORT_DRAFT_KEY_PATTERN = /^[A-Za-z0-9._-]{1,120}$/

/**
 * 草稿键是否可用。
 *
 * @param value - 任意值（渲染层回传、文件名解析结果都先过这里）。
 * @returns 形态合法时为 true。
 */
export function isBugReportDraftKey(value: unknown): value is string {
  return typeof value === 'string' && BUG_REPORT_DRAFT_KEY_PATTERN.test(value)
}

/**
 * 磁盘读回时的整份校验：键、落盘时间、报告形状都对才收。
 *
 * 键要重过一次 {@link isBugReportDraftKey}——读回路径同样不能把 `../` 之类带进来。**永不抛。**
 *
 * @param value - 任意值（`JSON.parse` 的结果）。
 * @returns 合法时为 true。
 */
export function isBugReportPendingDraft(value: unknown): value is BugReportPendingDraft {
  if (!isRecord(value)) return false
  if (!isBugReportDraftKey(value.key)) return false
  if (typeof value.savedAt !== 'string' || value.savedAt.trim() === '') return false
  return isBugReport(value.report)
}

/** 可以打开的投递通道。 */
export const BUG_REPORT_TARGET_KINDS = ['mail', 'issue', 'form'] as const

/** 通道名。 */
export type BugReportTargetKind = (typeof BUG_REPORT_TARGET_KINDS)[number]

/** 要交给系统浏览器或邮件客户端的地址。 */
export interface BugReportExternalTarget {
  readonly kind: BugReportTargetKind
  readonly url: string
}

/** 邮件通道只接受 `mailto:`，issue 通道只接受 GitHub 的 https 地址，表单通道只接受 http(s)。 */
const MAIL_URL_PREFIX = 'mailto:'
const ISSUE_URL_PREFIX = 'https://github.com/'

/**
 * 是不是一个可以交给系统的投递地址。
 *
 * 主进程用它挡渲染层送来的任意 URL：只有这几种前缀能进 `shell.openExternal`，所以
 * `file://` 之类不会被打开。表单通道是「浏览器打开一个外部页面」，所以只放行 http(s)，
 * 不推导、不校验 `/form/` 形状（决定 12）。
 *
 * @param value - 任意值（跨进程来的载荷必须先校验）。
 * @returns 合法时为 true。
 */
export function isBugReportExternalTarget(value: unknown): value is BugReportExternalTarget {
  if (!isRecord(value)) return false
  if (!isBugReportTargetKind(value.kind)) return false
  if (typeof value.url !== 'string') return false
  const url = value.url.trim()
  if (value.kind === 'mail') return hasPayload(url, MAIL_URL_PREFIX)
  if (value.kind === 'issue') return hasPayload(url, ISSUE_URL_PREFIX)
  return hasPayload(url, 'https://') || hasPayload(url, 'http://')
}

/**
 * 报告里「有没有可用的通道」。
 *
 * 表单配了分享链接就算一条（决定 11：没配端点时不渲染会失败的按钮）。
 *
 * @param config - 通道配置。
 * @returns 至少一条通道配好时为 true。
 */
export function hasBugReportChannel(config: BugReportDeliveryConfig): boolean {
  return (
    config.mailbox.trim() !== '' ||
    config.repository.trim() !== '' ||
    config.relay !== undefined ||
    (config.form !== undefined && config.form.shareUrl.trim() !== '')
  )
}

/**
 * 代发服务名是否认识。
 *
 * @param value - 任意值（环境变量或跨进程载荷）。
 * @returns 是 {@link BUG_REPORT_RELAY_PROVIDERS} 里的一员时为 true。
 */
export function isBugReportRelayProvider(value: unknown): value is BugReportRelayProvider {
  return typeof value === 'string' && (BUG_REPORT_RELAY_PROVIDERS as readonly string[]).includes(value)
}

/**
 * 通道名是否认识。
 *
 * @param value - 任意值（跨进程载荷）。
 * @returns 是 {@link BUG_REPORT_TARGET_KINDS} 里的一员时为 true。
 */
export function isBugReportTargetKind(value: unknown): value is BugReportTargetKind {
  return typeof value === 'string' && (BUG_REPORT_TARGET_KINDS as readonly string[]).includes(value)
}

/** 前缀之后还有内容（避免 `https://` 这种空地址）。 */
function hasPayload(url: string, prefix: string): boolean {
  return url.startsWith(prefix) && url.length > prefix.length
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
