import type { Logger } from 'pino'
import { foldFailure } from '@shared/foundation/failure'

/**
 * 主进程的进程级出口。
 *
 * 两个事件，各挂一个监听，**只记录、不改变默认行为**：
 *
 * - `uncaughtExceptionMonitor`：Node 在默认崩溃行为**之前**触发它，而且它**不能阻止**进程退出
 *   （能阻止的是 `uncaughtException`，那个会接管退出策略）。所以崩溃后日志里是"有 start、
 *   没有 end"——这正是会话首尾标记的验收判据；
 * - `unhandledRejection`：与渲染层那条落点一致，只写日志、不 `preventDefault`。
 *
 * 日志里一行要能读出三件事：`code`（契约码）、`message`（开发者诊断原文）、`details`（参数化详情）。
 * `err` 保留原始抛出值（`Error` 带栈）；不经 pino 的 `err` 序列化器取码——它只投影
 * `type` / `message` / `stack`，会把 `code` 与 `details` 丢掉。
 */

/** 进程级失败事件。 */
export type ProcessFailureEvent = 'unhandledRejection' | 'uncaughtExceptionMonitor'

/** `installProcessFailureLogging` 挂事件的目标（缺省 `process`；用例传事件发射器）。 */
export interface ProcessFailureTarget {
  on(event: 'unhandledRejection', listener: (reason: unknown, promise: Promise<unknown>) => void): unknown
  on(event: 'uncaughtExceptionMonitor', listener: (error: Error, origin: string) => void): unknown
}

/** 每个事件一句固定的开发者文案（不是用户可见句子）。 */
const FAILURE_CONTEXT: Readonly<Record<ProcessFailureEvent, string>> = {
  unhandledRejection: '主进程出现未处理的 Promise 拒绝',
  uncaughtExceptionMonitor: '主进程出现未捕获异常'
}

/**
 * 把一次进程级失败写成一行日志：`err` 是原始抛出值（`Error` 带栈），`code` / `message` /
 * `details` 是 `foldFailure` 折叠后的契约面（码 + 开发者诊断 + 参数化详情）。
 * @param logger - 主进程日志。
 * @param event - 事件名（同时作为结构化字段，便于按事件检索）。
 * @param failure - 未处理拒绝的原因 / 未捕获异常。
 * @param origin - `uncaughtExceptionMonitor` 给的来源；`unhandledRejection` 没有。
 */
export function logProcessFailure(
  logger: Pick<Logger, 'error'>,
  formatDiagnostic: (failure: unknown) => string,
  event: ProcessFailureEvent,
  failure: unknown,
  origin?: string
): void {
  const folded = foldFailure(failure)
  logger.error({
    event,
    phase: 'failure',
    diagnostic: formatDiagnostic(failure),
    ...(origin === undefined ? {} : { origin }),
    err: failure,
    code: folded.code,
    message: folded.message,
    details: folded.details
  }, FAILURE_CONTEXT[event])
}

/**
 * 给主进程挂上两个进程级出口。
 * @param logger - 主进程日志。
 * @param target - 事件目标；缺省 `process`。
 */
export function installProcessFailureLogging(
  logger: Pick<Logger, 'error'>,
  formatDiagnostic: (failure: unknown) => string,
  target: ProcessFailureTarget = process
): void {
  target.on('unhandledRejection', (reason) => {
    logProcessFailure(logger, formatDiagnostic, 'unhandledRejection', reason)
  })
  target.on('uncaughtExceptionMonitor', (error, origin) => {
    logProcessFailure(logger, formatDiagnostic, 'uncaughtExceptionMonitor', error, origin)
  })
}
