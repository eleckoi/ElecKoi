export { diagnosticsPlugin } from './diagnosticsPlugin'
export { buildBugReport, collectReportFailures, type BugReportCollection } from './bugReportCollection'
export {
  BUG_REPORT_SESSION_SCAN_FILES,
  parseSessionEvents,
  previousSessionOf,
  readPreviousSession,
  readRecentLogLines,
  type SessionEvent
} from './previousSession'
export {
  BUG_REPORT_LOG_SCAN_LINES,
  BUG_REPORT_MAILBOX_ENV,
  BUG_REPORT_REPOSITORY_ENV,
  desktopReportEnvironment,
  desktopReportPlatform,
  exportFileName,
  readBugReportDelivery,
  type DesktopEnvironmentInput
} from './reportDelivery'
