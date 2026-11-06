/**
 * 报告收集在共享层（`@shared/foundation/bugReport`）——桌面主进程与 Android 渲染层共用同一份。
 *
 * 这里只保留旧路径，免得调用点与用例各改一遍；不要在这里重新实现逻辑。
 */
export {
  buildBugReport,
  collectReportFailures,
  type BugReportCollection
} from '@shared/foundation/bugReport'
