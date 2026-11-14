import { buildBugReport, type BugReportCollection } from '@shared/foundation/bugReport'
import { readPreviousSession, readRecentLogDiagnostics, readRecentLogLines } from './previousSession'
import { BUG_REPORT_LOG_SCAN_LINES } from './reportDelivery'

/** All desktop delivery paths collect the same persisted diagnostics. */
export function collectDesktopReport(
  userData: string,
  input: Omit<BugReportCollection, 'lines' | 'failureLines' | 'session' | 'runtimeDiagnostics'>
) {
  const runtimeDiagnostics = readRecentLogDiagnostics(userData)
  return buildBugReport({
    ...input,
    session: readPreviousSession(userData)
      ?? { startedAt: (input.generatedAt ?? new Date()).toISOString(), ended: true },
    lines: readRecentLogLines(userData, BUG_REPORT_LOG_SCAN_LINES),
    failureLines: runtimeDiagnostics.split('\n'),
    ...(runtimeDiagnostics === '' ? {} : { runtimeDiagnostics })
  })
}
