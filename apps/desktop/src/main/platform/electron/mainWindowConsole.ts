import type { BrowserWindow, WebContentsConsoleMessageEventParams } from 'electron'
import type { Logger } from 'pino'
import { relayRendererActionLog } from '@main/platform/logging/logActions'

/** Forward main-frame diagnostics only for the lifetime of their native window. */
export function installMainWindowConsole(window: BrowserWindow, appLog: Pick<Logger, 'info' | 'error'>): () => void {
  const contents = window.webContents
  let disposed = false
  const onConsoleMessage = (details: WebContentsConsoleMessageEventParams): void => {
    // Native teardown can deliver console events after the owner has been destroyed.
    if (disposed || window.isDestroyed() || contents.isDestroyed()) return
    // Author-card frames have their own diagnostics, including srcdoc teardown messages.
    if (details.sourceId === 'about:srcdoc' || (details.frame && details.frame !== contents.mainFrame)) return
    if (relayRendererActionLog(appLog, details.message)) return
    if (details.level !== 'error') return
    appLog.error({
      message: details.message,
      lineNumber: details.lineNumber,
      sourceId: details.sourceId,
      url: contents.getURL()
    }, 'DSH client renderer error')
  }
  const dispose = (): void => {
    disposed = true
    contents.off('console-message', onConsoleMessage)
    contents.off('destroyed', dispose)
    window.off('closed', dispose)
  }
  contents.on('console-message', onConsoleMessage)
  contents.once('destroyed', dispose)
  window.once('closed', dispose)
  return dispose
}
