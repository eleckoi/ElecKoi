/**
 * 打开外部程序失败的**纯映射**——不 import `electron`，所以用例能直接跑。
 *
 * 判据（[ADR 0041](../../../../../docs/adr/0041-bug-report-delivery.md) 决定 13）：打开失败折成
 * `eleckoi/shell/open-failed`，详情带判别值 `what: 'mail' | 'form'`。用户可见文案由渲染层给，
 * 所以这里**不拼用户句子**，`message` 只留原始诊断（`details.ts` 说得很清楚：`what` 是判别值，
 * 不是名词短语，渲染层负责映射成「邮件客户端 / 浏览器」）。
 *
 * 为什么详情只有两个值：`issue` 通道已经不是用户侧入口（决定 11），但地址合同里还留着它；
 * 它打开的是浏览器，所以和 `form` 归为一类。
 */
import type { BugReportTargetKind } from '@shared/contracts/bugReport/delivery'
import type { EleckoiShellOpenFailedDetails } from '@shared/contracts/errors/details'
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes'
import { DesktopError } from '@shared/foundation/DesktopError'

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

/** 抛出值的诊断原文；非 `Error` 的抛出也要有话说。 */
function errorTextOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
