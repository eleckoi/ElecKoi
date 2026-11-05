/**
 * 打开外部程序失败的**纯映射**——不 import `electron`，所以用例能直接跑。
 *
 * 判据（[ADR 0042](../../../../../docs/adr/0042-bug-report-delivery.md) 决定 13）：打开失败折成
 * `eleckoi/shell/open-failed`，详情带判别值 `what: 'mail' | 'form'`。用户可见文案由渲染层给，
 * 所以这里**不拼用户句子**，`message` 只留原始诊断（`details.ts` 说得很清楚：`what` 是判别值，
 * 不是名词短语，渲染层负责映射成「邮件客户端 / 浏览器」）。
 *
 * 为什么详情只有两个值：`issue` 通道已经不是用户侧入口（决定 11），但地址合同里还留着它；
 * 它打开的是浏览器，所以和 `form` 归为一类。
 *
 * 另加一道纯判定 {@link isConfiguredFormTarget}：表单通道打开的是外网页面，主进程不能变成
 * 「渲染层想开什么就开什么」——只放行发布配置里那一个端点（决定 12 / 16：泄漏的后果只能是脏数据）。
 */
import type { BugReportTargetKind } from '@shared/contracts/bugReport/delivery'
import type { EleckoiShellOpenFailedDetails } from '@shared/contracts/errors/details'
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes'
import { DesktopError } from '@shared/foundation/DesktopError'
import { errorTextOf } from './failureText'

/**
 * 渲染层请求打开的表单地址是不是配置里那一个端点。
 *
 * 只允许 `shareUrl` 本身或 `shareUrl` 后面接 `?` / `&` 的预填链接——主进程的 `openExternal`
 * 不能变成「渲染层想开什么就开什么」（评审发现：`kind:'form'` 现在放行任意 http(s)）。
 *
 * @param url - 渲染层送来的地址。
 * @param shareUrl - 发布配置里的表单分享链接；没配就是 `undefined`。
 * @returns 是那个端点、或它后面接查询串的预填链接时为 true。
 */
export function isConfiguredFormTarget(url: string, shareUrl: string | undefined): boolean {
  const configured = shareUrl?.trim() ?? ''
  if (configured === '') return false
  const candidate = url.trim()
  if (candidate === configured) return true
  if (!candidate.startsWith(configured)) return false
  const separator = candidate.charAt(configured.length)
  return separator === '?' || separator === '&'
}

/**
 * 打开外部程序失败 → 带 `eleckoi/shell/open-failed` 的契约错误。
 *
 * @param kind - 用户点的通道（邮件 / 表单 / issue）。
 * @param error - `shell.openExternal` 的抛出值（任意形态）。
 * @returns 契约错误：`what` 区分邮件客户端与浏览器，`message` 保留原始诊断。
 */
export function bugReportOpenFailure(kind: BugReportTargetKind, error: unknown): DesktopError {
  const details: EleckoiShellOpenFailedDetails = { what: kind === 'mail' ? 'mail' : 'form' }
  return new DesktopError(ELECKOI_FAILURE_CODES.shellOpenFailed,
    `打开外部程序失败：${errorTextOf(error)}`, details)
}

