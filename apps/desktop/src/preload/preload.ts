import { contextBridge, ipcRenderer } from 'electron'
import { DESKTOP_SHELL_IPC, type DesktopBrowserBridge, type DesktopBrowserLeaseId, type DesktopBrowserReservation, type DshDesktopProductApi } from '@shared/contracts/desktopShell'
import type { DesktopHostFailureNotice } from '@shared/contracts/errors/ipc'
import type { UpdateInstallResult, UpdateStatus } from '@shared/contracts/updates/schemas'
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
} from '@shared/contracts/bugReport/delivery'
import { hasDesktopIpcFailureMarker, unwrapDesktopIpcResult } from '@shared/foundation/ipcFailure'

/**
 * 边界⑤ preload 侧的**薄适配器**：调一次请求/响应通道。
 *
 * 主进程侧（`apps/desktop/src/main/platform/electron/desktopIpcHandler.ts`）把 handler 的抛出折成
 * 线上失败对象**返回**；这里把它变回**拒绝**——渲染层的 `foldFailure` 认 `isDSHRemoteError` 标记，
 * 所以码与详情原样到场，不需要第二套失败方言，也不在这里拼用户可见句子（唯一解析点在渲染层）。
 */
function invokeOrFail<Result>(channel: string, ...args: unknown[]): Promise<Result> {
  return unwrapDesktopIpcResult(() => ipcRenderer.invoke(channel, ...args))
}

function createDesktopBrowserBridge(): DesktopBrowserBridge {
  const listeners = new Map<DesktopBrowserLeaseId, Set<(url: string) => void>>()
  ipcRenderer.on(DESKTOP_SHELL_IPC.browserOpenRequested, (_event, request: unknown) => {
    if (typeof request !== 'object' || request === null || !('lease' in request) || !('url' in request)
      || typeof request.lease !== 'string' || typeof request.url !== 'string') return
    const callbacks = listeners.get(request.lease as DesktopBrowserLeaseId)
    if (callbacks === undefined) return
    for (const callback of [...callbacks]) {
      try {
        callback(request.url)
      } catch (error) {
        console.error('Desktop browser link handler failed', error)
      }
    }
  })
  return {
    acquire: (workspace) => invokeOrFail<DesktopBrowserReservation>(DESKTOP_SHELL_IPC.browserAcquire, workspace),
    release: (lease) => invokeOrFail<void>(DESKTOP_SHELL_IPC.browserRelease, lease),
    onOpenRequested(lease, listener) {
      let callbacks = listeners.get(lease)
      if (callbacks === undefined) {
        callbacks = new Set()
        listeners.set(lease, callbacks)
      }
      callbacks.add(listener)
      return () => {
        callbacks?.delete(listener)
        if (callbacks?.size === 0) listeners.delete(lease)
      }
    }
  }
}

function createDesktopProductApi(): DshDesktopProductApi {
  return {
    protocolVersion: 1,
    browser: createDesktopBrowserBridge(),
    updates: {
      status: () => invokeOrFail<UpdateStatus>(DESKTOP_SHELL_IPC.updatesStatus),
      check: () => invokeOrFail<UpdateStatus>(DESKTOP_SHELL_IPC.updatesCheck),
      download: () => invokeOrFail<UpdateStatus>(DESKTOP_SHELL_IPC.updatesDownload),
      install: () => invokeOrFail<UpdateInstallResult>(DESKTOP_SHELL_IPC.updatesInstall),
      subscribe(listener) {
        const handle = (_event: Electron.IpcRendererEvent, status: Parameters<typeof listener>[0]): void => listener(status)
        ipcRenderer.on(DESKTOP_SHELL_IPC.updatesChanged, handle)
        return () => ipcRenderer.off(DESKTOP_SHELL_IPC.updatesChanged, handle)
      }
    },
    windowControls: {
      minimize: () => invokeOrFail<void>(DESKTOP_SHELL_IPC.windowControl, 'minimize'),
      maximizeToggle: () => invokeOrFail<void>(DESKTOP_SHELL_IPC.windowControl, 'maximize'),
      close: () => invokeOrFail<void>(DESKTOP_SHELL_IPC.windowControl, 'close')
    },
    host: {
      subscribeFailure(listener) {
        // 主进程送的是**失败对象**（边界⑤ 的线上形状），不是拼好的句子。
        // 只转发带失败标记的值：没有标记说明送来的不是一次失败，宁可不显示，也不要显示一句错话。
        const handle = (_event: Electron.IpcRendererEvent, value: unknown): void => {
          if (hasDesktopIpcFailureMarker(value)) listener(value as DesktopHostFailureNotice)
        }
        ipcRenderer.on(DESKTOP_SHELL_IPC.hostFailure, handle)
        return () => ipcRenderer.off(DESKTOP_SHELL_IPC.hostFailure, handle)
      }
    },
    bugReport: {
      preview: (request: BugReportPreviewRequest) =>
        invokeOrFail<BugReportPreview>(DESKTOP_SHELL_IPC.bugReportPreview, request),
      export: (request: BugReportExportRequest) =>
        invokeOrFail<BugReportExportResult>(DESKTOP_SHELL_IPC.bugReportExport, request),
      open: (target: BugReportExternalTarget) =>
        invokeOrFail<void>(DESKTOP_SHELL_IPC.bugReportOpen, target),
      send: (request: BugReportSendRequest) =>
        invokeOrFail<BugReportSendResult>(DESKTOP_SHELL_IPC.bugReportSend, request),
      saveDraft: (request: BugReportDraftSaveRequest) =>
        invokeOrFail<BugReportDraftSaved>(DESKTOP_SHELL_IPC.bugReportSaveDraft, request),
      drafts: () => invokeOrFail<BugReportPendingDrafts>(DESKTOP_SHELL_IPC.bugReportDrafts),
      discardDraft: (key: string) =>
        invokeOrFail<void>(DESKTOP_SHELL_IPC.bugReportDiscardDraft, key)
    }
  }
}

const documentLocation = (globalThis as unknown as { location?: { protocol: string; hostname: string } }).location
if (documentLocation?.protocol === 'dsh-app:' && documentLocation.hostname === 'app' && process.isMainFrame) {
  type BootNode = {
    nextElementSibling: BootNode | null
    textContent: string | null
    style: { cssText: string }
    remove(): void
    after(node: BootNode): void
  }
  const browser = globalThis as unknown as {
    document: {
      querySelector(selector: string): BootNode | null
      createElement(tag: string): BootNode
      documentElement: { getAttribute(name: string): string | null }
      readyState: string
    }
    MutationObserver: new (callback: () => void) => { observe(target: object, options: object): void }
    addEventListener(name: string, listener: () => void, options: { once: boolean }): void
  }
  const showBootFailure = (message: string): void => {
    const spinner = browser.document.querySelector('[data-dsh-boot-spinner]')
    if (spinner === null) return
    const hint = spinner.nextElementSibling
    spinner.remove()
    if (hint !== null) hint.textContent = '插件加载失败'
    const detail = browser.document.createElement('pre')
    detail.textContent = message
    detail.style.cssText = 'max-width:min(640px,80vw);white-space:pre-wrap;overflow-wrap:anywhere;text-align:left;font:12px/1.5 monospace;color:inherit;'
    hint?.after(detail)
  }
  contextBridge.exposeInMainWorld('dshDesktopBoot', {
    ready: () => invokeOrFail<unknown>('eleckoi:dsh-client-boot'),
    failed: (message: string) => {
      showBootFailure(message)
      return invokeOrFail<void>('eleckoi:dsh-client-boot-failed', message)
    }
  })

  let sentThemeSource: string | undefined
  const sendThemeSource = (): void => {
    const source = browser.document.documentElement.getAttribute('data-ds-theme-source')
    if (source === null || source === sentThemeSource) return
    sentThemeSource = source
    ipcRenderer.send('eleckoi:dsh-native-theme', source)
  }
  const observeThemeSource = (): void => {
    new browser.MutationObserver(sendThemeSource).observe(browser.document.documentElement, {
      attributes: true,
      attributeFilter: ['data-ds-theme-source']
    })
    sendThemeSource()
  }
  if (browser.document.readyState === 'loading') {
    browser.addEventListener('DOMContentLoaded', observeThemeSource, { once: true })
  } else observeThemeSource()
}

contextBridge.exposeInMainWorld(
  'dshDesktop',
  documentLocation?.protocol === 'dsh-app:' && documentLocation.hostname === 'app' && process.isMainFrame
    ? createDesktopProductApi()
    : { protocolVersion: 1 }
)
