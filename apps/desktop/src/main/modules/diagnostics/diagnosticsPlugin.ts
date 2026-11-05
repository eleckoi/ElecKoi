/**
 * Bug 报告的主进程侧：收集、导出、打开投递通道、存草稿（[ADR 0041](../../../../../docs/adr/0041-bug-report-delivery.md)）。
 *
 * 判据：渲染层只做展示与选择，报告一律在主进程生成——日志在它手里，脱敏也在它手里。所以这里
 * 只有四件事：
 *
 * 1. **收集**：读最近日志 → 判断上次会话 → 拼报告 → 脱敏（`buildBugReport` 内部完成）。
 * 2. **导出**：用户按了「导出」就带日志尾，写成一个 JSON 文件。
 * 3. **打开通道**：只放行 `mailto:`、GitHub 的 https 地址与**配置里那一个**表单端点，其余一律拒收；
 *    打开失败折成 `eleckoi/shell/open-failed`（带 `what: 'mail' | 'form'`，决定 13）。
 * 4. **草稿**：失败或中途关闭时把已脱敏的报告存进 `userData/bug-reports/pending/`（决定 14）。
 *
 * 两条约束：
 *
 * 1. **地址来自发布配置，不写死在代码里**（见 `bundledReportConfig.ts`）。表单通道还要再收窄一次：
 *    形状校验只说明「是个 http(s) 地址」，是不是配置的那个端点由 `isConfiguredFormTarget` 判。
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
import {
  bugReportRelayReceipt,
  buildBugReportRelayRequest,
  isRetriableRelayStatus
} from '@shared/contracts/bugReport/relay'
import type { BugReport } from '@shared/contracts/bugReport/report'
import { assertTrustedDshClientFrame } from '@main/platform/electron/validateSender'
import { handleDesktopIpcCall } from '@main/platform/electron/desktopIpcHandler'
import { logAction } from '@main/platform/logging/logActions'
import { buildBugReport } from './bugReportCollection'
import { readReportConfig, refreshRemoteReportConfig } from './bundledReportConfig'
import { bestEffort } from '@shared/foundation/swallowedFailure'
import { bugReportOpenFailure, isConfiguredFormTarget } from './reportOpen'
import { errorTextOf } from './failureText'
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
    // 投递配置每次现读：远程配置（可选）刷新完，下一次预览就该用新的。
    const deliveryOf = (): ReturnType<typeof readReportConfig> => readReportConfig(process.env, userData)
    const draftDirectory = pendingDraftDirectory(userData)
    // 远程配置只在配了 `configUrl` 时才联网；失败静默，报告功能不依赖网络（ADR 0041 决定 16 修订）。
    void refreshRemoteReportConfig({ userData }).catch(bestEffort)

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
        const preview: BugReportPreview = { report: collect(parsed), delivery: deliveryOf() }
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
            `写入报告文件失败：${errorTextOf(error)}`, { operation: 'write', path: target })
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
          '报告投递地址不合合同：只接受 mailto:、GitHub issue 链接与配置里的表单端点。', {
            issues: [{ path: 'target', message: '必须是 mailto:、https://github.com/ 开头的地址或 http(s) 表单地址' }]
          })
      }
      // 形状校验只说明「是个 http(s) 地址」；表单通道还要是配置里那一个端点，否则主进程的
      // `openExternal` 就成了「渲染层想开什么就开什么」。
      if (target.kind === 'form' && !isConfiguredFormTarget(target.url, deliveryOf().form?.shareUrl)) {
        throw new DesktopError(ELECKOI_FAILURE_CODES.contractInvalidRequest,
          '报告投递地址不合合同：表单通道只允许打开配置里的表单端点。', {
            issues: [{
              path: 'target.url',
              message: '必须是配置里的表单分享链接本身，或它后面接 ? / & 的预填链接'
            }]
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
      const delivery = deliveryOf()
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

/** 重试前等多久（决定 14 只允许一次重试；给瞬时故障一点余地，又别让对话框看起来卡住）。 */
const BUG_REPORT_RELAY_RETRY_DELAY_MS = 250

/** 一次 POST 的结果：`ok` 为假时 `status` 是服务返回的状态码。 */
type RelayResponse =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly status: number }

/**
 * 把一条代发请求发出去；429 与 5xx 在同一次用户动作里重试一次（决定 14）。
 *
 * 三类失败都折成 `net/operation-failed`：连不上、超时、服务返回非 2xx。超时必须自己设——
 * 对话框在等这个 Promise，`fetch` 默认没有超时。
 *
 * 重试只发生在用户点下去的那一次里，且只对限流与临时性服务端错误：再试一次可能就好了。其它非 2xx
 * 是「请求本身不对」，重试只是再错一次；**网络层失败不重试**——连不上再试还是连不上，直接降级，
 * 用户手里还有剪贴板与导出。
 *
 * @param url - 服务端点（已校验 https）。
 * @param body - 请求体。
 * @returns 响应体原文（只有自有 Worker 会给回执，其余服务用不上）。
 */
async function postRelayRequest(url: string, body: Readonly<Record<string, unknown>>): Promise<string> {
  const first = await postOnce(url, body)
  if (first.ok) return first.text
  if (!isRetriableRelayStatus(first.status)) throw relayStatusFailure(first.status)
  await delay(BUG_REPORT_RELAY_RETRY_DELAY_MS)
  const second = await postOnce(url, body)
  if (second.ok) return second.text
  throw relayStatusFailure(second.status)
}

/**
 * 发一次 POST，不带重试。
 *
 * 非 2xx 是「服务答复了」，作为结果返回（要不要重试由调用方判）；`fetch` 抛出与超时是「没答复」，
 * 直接折成 `net/operation-failed`——这类失败一律不重试。
 */
async function postOnce(url: string, body: Readonly<Record<string, unknown>>): Promise<RelayResponse> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), BUG_REPORT_RELAY_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    })
    if (!response.ok) return { ok: false, status: response.status }
    return { ok: true, text: await response.text() }
  } catch (error) {
    throw new DesktopError(ELECKOI_FAILURE_CODES.netOperationFailed,
      `报告代发服务不可达：${errorTextOf(error)}`, { operation: 'request', what: '报告代发服务' })
  } finally {
    clearTimeout(timer)
  }
}

/** 服务返回非 2xx 时的契约错误：带上状态码，重试用尽时也用它。 */
function relayStatusFailure(status: number): DesktopError {
  return new DesktopError(ELECKOI_FAILURE_CODES.netOperationFailed,
    `报告代发服务返回 ${status}。`, { operation: 'request', what: '报告代发服务' })
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

