/**
 * 抛出值的诊断原文——报告模块里三处失败包装共用一句说法。
 *
 * 只取 `message`，不 `JSON.stringify` 整个错误：`DesktopError.details` 里可能带路径，
 * 用户文案那边另有脱敏与拼装，这里只负责把「抛出来的是什么」写成一行可读文本。
 *
 * @param error - 捕获到的任意值（`Error`、字符串、别的）。
 * @returns 可直接拼进开发者诊断的文本。
 */
export function errorTextOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
