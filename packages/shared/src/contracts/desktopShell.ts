import type { DesktopHostFailureNotice } from './errors/ipc'
import type {
  BugReportDraftSaveRequest,
  BugReportDraftSaved,
  BugReportExportRequest,
  BugReportExportResult,
  BugReportExternalTarget,
  BugReportPendingDrafts,
  BugReportPreview,
  BugReportPreviewRequest,
  BugReportSendRequest,
  BugReportSendResult
} from './bugReport/delivery'
import type { UpdateInstallResult, UpdateStatus } from './updates/schemas'

/** Main-issued identity for one Electron browser guest reservation. */
export type DesktopBrowserLeaseId = string & { readonly __desktopBrowserLeaseId: unique symbol }

/** Main-approved storage partition for one browser guest. */
export interface DesktopBrowserReservation {
  readonly lease: DesktopBrowserLeaseId
  readonly partition: string
}

/** Main-approved request to open an HTTP(S) page from an existing guest. */
export interface DesktopBrowserOpenRequest {
  readonly lease: DesktopBrowserLeaseId
  readonly url: string
}

/** Narrow browser transport exposed by the Electron preload. */
export interface DesktopBrowserBridge {
  acquire(workspace: string): Promise<DesktopBrowserReservation>
  release(lease: DesktopBrowserLeaseId): Promise<void>
  onOpenRequested(lease: DesktopBrowserLeaseId, listener: (url: string) => void): () => void
}

/** Private IPC channels owned by the Electron desktop shell. */
export const DESKTOP_SHELL_IPC = {
  updatesStatus: 'dsh-desktop:updates-status',
  updatesCheck: 'dsh-desktop:updates-check',
  updatesDownload: 'dsh-desktop:updates-download',
  updatesInstall: 'dsh-desktop:updates-install',
  updatesChanged: 'dsh-desktop:updates-changed',
  hostFailure: 'dsh-desktop:host-failure',
  windowControl: 'dsh-desktop:window-control',
  windowsMenu: 'dsh-desktop:windows-menu',
  menuCommand: 'dsh-desktop:menu-command',
  browserAcquire: 'dsh-desktop:browser-acquire',
  browserRelease: 'dsh-desktop:browser-release',
  browserOpenRequested: 'dsh-desktop:browser-open-requested',
  bugReportPreview: 'dsh-desktop:bug-report-preview',
  bugReportExport: 'dsh-desktop:bug-report-export',
  bugReportOpen: 'dsh-desktop:bug-report-open',
  bugReportSend: 'dsh-desktop:bug-report-send',
  bugReportSaveDraft: 'dsh-desktop:bug-report-save-draft',
  bugReportDrafts: 'dsh-desktop:bug-report-drafts',
  bugReportDiscardDraft: 'dsh-desktop:bug-report-discard-draft'
} as const

/** Narrow desktop-only capabilities exposed by the preload script. */
export interface DshDesktopProductApi {
  readonly protocolVersion: 1
  readonly browser: DesktopBrowserBridge
  readonly updates?: {
    status(): Promise<UpdateStatus>
    check(): Promise<UpdateStatus>
    download(): Promise<UpdateStatus>
    install(): Promise<UpdateInstallResult>
    subscribe(listener: (status: UpdateStatus) => void): () => void
  }
  readonly windowControls?: {
    minimize(): Promise<void>
    maximizeToggle(): Promise<void>
    close(): Promise<void>
  }
  readonly menu?: {
    subscribe(listener: (command: 'about' | 'check-updates') => void): () => void
  }
  /**
   * Bug 报告的三步（ADR 0042）：预览已脱敏的报告、导出到文件、打开一条投递通道。
   *
   * 报告只在主进程生成；渲染层拿到的是脱敏后的副本，导出时主进程重新收集，不回写渲染层的版本。
   * 地址（邮箱 / 仓库）来自发布配置，经 `preview` 一起给渲染层，为空表示该通道不可用。
   */
  readonly bugReport?: {
    preview(request: BugReportPreviewRequest): Promise<BugReportPreview>
    export(request: BugReportExportRequest): Promise<BugReportExportResult>
    open(target: BugReportExternalTarget): Promise<void>
    /** 经托管代发服务直接寄出；没配代发通道时拒绝。 */
    send(request: BugReportSendRequest): Promise<BugReportSendResult>
    /**
     * 把已脱敏的报告存成一份草稿（ADR 0042 决定 14：失败不丢）。写不进去时拒绝。
     */
    saveDraft(request: BugReportDraftSaveRequest): Promise<BugReportDraftSaved>
    /** 列出现有待重发的草稿（新到旧）；坏文件跳过，永不拒绝。 */
    drafts(): Promise<BugReportPendingDrafts>
    /** 删一份草稿；键非法或文件不存在都不拒绝。 */
    discardDraft(key: string): Promise<void>
  }
  readonly host?: {
    /**
     * 边界⑤ 的宿主失败通知：**送失败对象，不送拼好的用户句子**。
     *
     * 用户可见文案只有一个解析点在渲染层（`apps/web/src/utils/failureText.js`），
     * 所以这里只搬 `{ code, message, details }`（外加子进程的 `stack` 与宿主本机日志的
     * `logPath` 诊断指针）。
     * 以前这里是一个裸字符串，渲染层只能原样显示——码与详情在跨进程那一刻就没了。
     */
    subscribeFailure(listener: (notice: DesktopHostFailureNotice) => void): () => void
  }
}
