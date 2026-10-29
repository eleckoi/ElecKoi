/**
 * Bug 报告的主进程侧：收集、导出、打开投递通道、存草稿（[ADR 0041](../../../../../docs/adr/0041-bug-report-delivery.md)）。
 *
 * 判据：渲染层只做展示与选择，报告一律在主进程生成——日志在它手里，脱敏也在它手里。所以这里
 * 只有四件事：
 *
 * 1. **收集**：读最近日志 → 判断上次会话 → 拼报告 → 脱敏（`buildBugReport` 内部完成）。
 * 2. **导出**：用户按了「导出」就带日志尾，写成一个 JSON 文件。
 * 3. **打开通道**：只放行 `mailto:`、GitHub 的 https 地址与表单的 http(s) 地址，其余一律拒收；
 *    打开失败折成 `eleckoi/shell/open-failed`（带 `what: 'mail' | 'form'`，决定 13）。
 * 4. **草稿**：失败或中途关闭时把已脱敏的报告存进 `userData/bug-reports/pending/`（决定 14）。
 *
 * 两条约束：
 *
 * 1. **地址来自发布配置，不写死在代码里**（见 `bundledReportConfig.ts`）。
 * 2. **失败带码。** 载荷不合合同走 `contract/invalid-request`（带 `issues`），写文件失败走
 *    `io/failed`（带 `operation` / `path`）。三个投递动作各有开始 / 成功 / 失败日志行；
 *    草稿是尽力而为的功能，不为它新增日志动作。
 */
import { writeFileSync } from 'node:fs'
import * as os from 'node:os'
import { app, dialog, ipcMain, shell } from 'electron'
import type { Context, Plugin } from '@deepseek-ai/cordis'
import { DESKTOP_SHELL_IPC } from '@shared/contracts/desktopShell'
import { LOG_ACTIONS } from '@shared/contracts/logActions'
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes'
import { DesktopError } from '@shared/foundation/DesktopError'
import {
  isBugReportDraftKey,
  isBugReportExternalTarget,
  type BugReportDraftSaved,
  type BugReportExportRequest,
  type BugReportExportResult,
  type BugReportPendingDrafts,
  type BugReportPreview,
  type BugReportPreviewRequest,
  type BugReportSendResult
} from '@shared/contracts/bugReport/delivery'
import { bugReportRelayReceipt, buildBugReportRelayRequest } from '@shared/contracts/bugReport/relay'
import type { BugReport } from '@shared/contracts/bugReport/report'
import { assertTrustedDshClientFrame } from '@main/platform/electron/validateSender'
import { handleDesktopIpcCall } from '@main/platform/electron/desktopIpcHandler'
import { logAction } from '@main/platform/logging/logActions'
import { buildBugReport } from './bugReportCollection'
import { readReportConfig } from './bundledReportConfig'
import { bugReportOpenFailure } from './reportOpen'
import {
  discardPendingDraft,
  listPendingDrafts,
  pendingDraftDirectory,
  savePendingDraft
} from './reportDrafts'
import { readPreviousSession, readRecentLogLines } from './previousSession'
import {
  BUG_REPORT_LOG_SCAN_LINES,
  BUG_REPORT_RELAY_TIMEOUT_MS,
  desktopReportEnvironment,
  exportFileName
} from './reportDelivery'

export const diagnosticsPlugin = {
  name: 'eleckoi-bug-report',
  inject: ['appLog', 'appPaths', 'electronWindows'],
  apply(ctx: Context) {
    const appLog = ctx.appLog
    const userData = ctx.appPaths.userData
    const windows = ctx.electronWindows
    const delivery = readReportConfig()
    const draftDirectory = pendingDraftDirectory(userData)

    const assertSender = (event: Electron.IpcMainInvokeEvent): void => assertTrustedDshClientFrame(
      event.sender,
      event.senderFrame?.url ?? '',
      event.senderFrame === event.sender.mainFrame,
      windows.all().map(window => window.webContents)
    )

    const collect = (request: { readonly includeLogTail: boolean; readonly notes?: string }): BugReport => {
      // 首次运行（没有上一份日志）按「无异常会话」处理：报告里不该凭空出现一次崩溃。
      const session = readPreviousSession(userData)
        ?? { startedAt: new Date().toISOString(), ended: true }
      return buildBugReport({
        lines: readRecentLogLines(userData, BUG_REPORT_LOG_SCAN_LINES),
        environment: desktopReportEnvironment({
          appVersion: app.getVersion(),
          platform: process.platform,
          arch: process.arch,
          osType: os.type(),
          osRelease: os.release(),
          ...(process.versions.electron === undefined ? {} : { electronVersion: process.versions.electron }),
          nodeVersion: process.versions.node
        }),
        session,
        includeLogTail: request.includeLogTail,
        ...(request.notes === undefined ? {} : { notes: request.notes }),
        redaction: { home: app.getPath('home'), userData }
      })
    }

    handleDesktopIpcCall(DESKTOP_SHELL_IPC.bugReportPreview, (event, request) => {
      assertSender(event)
      const parsed = previewRequestOf(request)
      logAction(appLog, LOG_ACTIONS.bugReportPreview, 'start')
      try {
        const preview: BugReportPreview = { report: collect(parsed), delivery }
        logAction(appLog, LOG_ACTIONS.bugReportPreview, 'success')
        return preview
      } catch (error) {
        logAction(appLog, LOG_ACTIONS.bugReportPreview, 'failure', error)
        throw error
      }
    })

    handleDesktopIpcCall(DESKTOP_SHELL_IPC.bugReportExport, async (event, request) => {
      assertSender(event)
      const parsed = exportRequestOf(request)
      logAction(appLog, LOG_ACTIONS.bugReportExport, 'start')
      try {
        const report = collect({
          includeLogTail: true,
          ...(parsed.notes === undefined ? {} : { notes: parsed.notes })
        })
        const target = await chooseExportPath(windows, exportFileName(new Date()))
        if (target === undefined) {
          logAction(appLog, LOG_ACTIONS.bugReportExport, 'success')
          return { saved: false } satisfies BugReportExportResult
        }
        try {
          writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
        } catch (error) {
          throw new DesktopError(ELECKOI_FAILURE_CODES.ioFailed,
            `写入报告文件失败：${errorTextOf(error)}`, { operation: '写入报告文件', path: target })
        }
        logAction(appLog, LOG_ACTIONS.bugReportExport, 'success')
        return { saved: true, path: target } satisfies BugReportExportResult
      } catch (error) {
        logAction(appLog, LOG_ACTIONS.bugReportExport, 'failure', error)
        throw error
      }
    })

    handleDesktopIpcCall(DESKTOP_SHELL_IPC.bugReportOpen, async (event, target) => {
      assertSender(event)
      if (!isBugReportExternalTarget(target)) {
        throw new DesktopError(ELECKOI_FAILURE_CODES.contractInvalidRequest,
          '报告投递地址不合合同：只接受 mailto: 与 GitHub issue 链接。', {
            issues: [{ path: 'target', message: '必须是 mailto: 或 https://github.com/ 开头的地址' }]
          })
      }
      logAction(appLog, LOG_ACTIONS.bugReportOpen, 'start')
      try {
        await shell.openExternal(target.url)
        logAction(appLog, LOG_ACTIONS.bugReportOpen, 'success')
      } catch (error) {
        // 失败行带上新码：用户看到的是「没能打开」，日志里要能读出是哪类外部程序。
        const failure = bugReportOpenFailure(target.kind, error)
        logAction(appLog, LOG_ACTIONS.bugReportOpen, 'failure', failure)
        throw failure
      }
    })

    handleDesktopIpcCall(DESKTOP_SHELL_IPC.bugReportSend, async (event, request) => {
      assertSender(event)
      const parsed = previewRequestOf(request)
      const relay = delivery.relay
      if (relay === undefined) {
        throw new DesktopError(ELECKOI_FAILURE_CODES.lifecycleNotReady,
          '没有配置报告代发通道。', { what: '报告代发通道' })
      }
      logAction(appLog, LOG_ACTIONS.bugReportSend, 'start')
      try {
        const report = collect(parsed)
        const relayRequest = buildBugReportRelayRequest(relay, report, {
          ...(delivery.mailboxName === undefined ? {} : { mailboxName: delivery.mailboxName }),
          ...(delivery.subscribeUrl === undefined ? {} : { subscribeUrl: delivery.subscribeUrl })
        })
        if (relayRequest === undefined) {
          throw new DesktopError(ELECKOI_FAILURE_CODES.contractInvalidRequest,
            '报告代发配置不完整：端点必须是 https，Web3Forms 还需要 access key。', {
              issues: [{ path: 'relay', message: '端点必须是 https，Web3Forms 还需要 access key' }]
            })
        }
        const responseText = await postRelayRequest(relayRequest.url, relayRequest.body)
        const receipt = bugReportRelayReceipt(relay.provider, responseText)
        logAction(appLog, LOG_ACTIONS.bugReportSend, 'success')
        return {
          sent: true,
          ...(receipt === undefined ? {} : { receipt })
        } satisfies BugReportSendResult
      } catch (error) {
        logAction(appLog, LOG_ACTIONS.bugReportSend, 'failure', error)
        throw error
      }
    })

    // 草稿三条都**不写日志动作**：它是尽力而为的功能，失败经 IPC 错误回到渲染层就够，
    // 不为它扩共享日志契约（LOG_ACTIONS）。
    handleDesktopIpcCall(DESKTOP_SHELL_IPC.bugReportSaveDraft, (event, request) => {
      assertSender(event)
      const parsed = previewRequestOf(request)
      return savePendingDraft({
        directory: draftDirectory,
        report: collect(parsed),
        now: new Date()
      }) satisfies BugReportDraftSaved
    })

    handleDesktopIpcCall(DESKTOP_SHELL_IPC.bugReportDrafts, event => {
      assertSender(event)
      return {
        drafts: listPendingDrafts({ directory: draftDirectory, now: new Date() })
      } satisfies BugReportPendingDrafts
    })

    handleDesktopIpcCall(DESKTOP_SHELL_IPC.bugReportDiscardDraft, (event, key) => {
      assertSender(event)
      if (!isBugReportDraftKey(key)) {
        throw new DesktopError(ELECKOI_FAILURE_CODES.contractInvalidRequest,
          '报告草稿键不合合同：只接受文件名安全字符。', {
            issues: [{ path: 'key', message: '必须是 [A-Za-z0-9._-] 组成的草稿键' }]
          })
      }
      discardPendingDraft({ directory: draftDirectory, key })
    })

    return () => {
      ipcMain.removeHandler(DESKTOP_SHELL_IPC.bugReportPreview)
      ipcMain.removeHandler(DESKTOP_SHELL_IPC.bugReportExport)
      ipcMain.removeHandler(DESKTOP_SHELL_IPC.bugReportOpen)
      ipcMain.removeHandler(DESKTOP_SHELL_IPC.bugReportSend)
      ipcMain.removeHandler(DESKTOP_SHELL_IPC.bugReportSaveDraft)
      ipcMain.removeHandler(DESKTOP_SHELL_IPC.bugReportDrafts)
      ipcMain.removeHandler(DESKTOP_SHELL_IPC.bugReportDiscardDraft)
    }
  }
} satisfies Plugin.Object

async function chooseExportPath(
  windows: { all(): Electron.BrowserWindow[] },
  fileName: string
): Promise<string | undefined> {
  const window = windows.all().find(candidate => !candidate.isDestroyed())
  const options: Electron.SaveDialogOptions = {
    title: '导出诊断报告',
    defaultPath: fileName,
    filters: [{ name: '诊断报告', extensions: ['json'] }]
  }
  const result = window === undefined
    ? await dialog.showSaveDialog(options)
    : await dialog.showSaveDialog(window, options)
  if (result.canceled || result.filePath === undefined || result.filePath === '') return undefined
  return result.filePath
}

function previewRequestOf(value: unknown): BugReportPreviewRequest {
  const fields = requestFields(value)
  const includeLogTail = fields.includeLogTail
  if (typeof includeLogTail !== 'boolean') throw invalidRequest('includeLogTail', '必须是布尔值')
  const notes = optionalNotes(fields)
  return { includeLogTail, ...(notes === undefined ? {} : { notes }) }
}

function exportRequestOf(value: unknown): BugReportExportRequest {
  const notes = optionalNotes(requestFields(value))
  return notes === undefined ? {} : { notes }
}

function requestFields(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw invalidRequest('request', '必须是对象')
  }
  return value as Record<string, unknown>
}

function optionalNotes(fields: Record<string, unknown>): string | undefined {
  const notes = fields.notes
  if (notes === undefined) return undefined
  if (typeof notes !== 'string') throw invalidRequest('notes', '必须是字符串')
  return notes
}

function invalidRequest(path: string, message: string): DesktopError {
  return new DesktopError(ELECKOI_FAILURE_CODES.contractInvalidRequest,
    `报告请求不合合同：${path} ${message}。`, { issues: [{ path, message }] })
}

/**
 * 把一条代发请求发出去。
 *
 * 三种失败都折成 `net/operation-failed`：连不上、超时、服务返回非 2xx。超时必须自己设——
 * 对话框在等这个 Promise，`fetch` 默认没有超时。
 *
 * @param url - 服务端点（已校验 https）。
 * @param body - 请求体。
 * @returns 响应体原文（只有自有 Worker 会给回执，其余服务用不上）。
 */
async function postRelayRequest(url: string, body: Readonly<Record<string, unknown>>): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), BUG_REPORT_RELAY_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    })
    if (!response.ok) {
      throw new DesktopError(ELECKOI_FAILURE_CODES.netOperationFailed,
        `报告代发服务返回 ${response.status}。`, { operation: '发送报告', what: '报告代发服务' })
    }
    return await response.text()
  } catch (error) {
    if (error instanceof DesktopError) throw error
    throw new DesktopError(ELECKOI_FAILURE_CODES.netOperationFailed,
      `报告代发服务不可达：${errorTextOf(error)}`, { operation: '发送报告', what: '报告代发服务' })
  } finally {
    clearTimeout(timer)
  }
}

function errorTextOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
