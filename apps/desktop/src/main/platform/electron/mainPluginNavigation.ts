import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import { DESKTOP_SHELL_IPC } from '@shared/contracts/desktopShell'
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes'
import { DesktopError } from '@shared/foundation/DesktopError'
import { desktopIpcFailureOf, unwrapDesktopIpcResult } from '@shared/foundation/ipcFailure'
import { handleDesktopIpcCall } from './desktopIpcHandler'

/** Forward editor links to the existing main renderer; it owns official navigation. */
// RETIRE WHEN: official Desktop supports managed cross-window plugin navigation with
// acknowledgements; remove this ADR 0043 adapter, its preload API and contract together.
export function installMainPluginNavigation(
  assertSender: (event: IpcMainInvokeEvent) => unknown,
  openMain: () => Promise<BrowserWindow>
): () => void {
  let sequence = 0
  let disposed = false
  const pending = new Map<number, { target: BrowserWindow; finish: (result: unknown) => void }>()
  const receive = (event: Electron.IpcMainEvent, key: unknown, result: unknown): void => {
    if (typeof key !== 'number') return
    const request = pending.get(key)
    if (!request || event.sender !== request.target.webContents || event.senderFrame !== event.sender.mainFrame) return
    request.finish(result)
  }
  ipcMain.on(DESKTOP_SHELL_IPC.pluginSettingsResult, receive)
  handleDesktopIpcCall(DESKTOP_SHELL_IPC.pluginSettingsOpen, async (event, id) => {
    assertSender(event)
    if (id !== 'web-search' && id !== 'subagent') {
      throw new DesktopError(ELECKOI_FAILURE_CODES.inputUnsupported, '插件设置入口不受支持。', { what: '插件设置入口' })
    }
    const target = await openMain()
    if (disposed) throw new DesktopError(ELECKOI_FAILURE_CODES.lifecycleDisposed, '插件设置导航已关闭。', { what: '插件设置导航' })
    await new Promise<void>((resolve, reject) => {
      const key = ++sequence
      const finish = (result: unknown): void => {
        if (!pending.delete(key)) return
        clearTimeout(timer)
        target.removeListener('closed', closed)
        void unwrapDesktopIpcResult(async () => result).then(() => resolve(), reject)
      }
      const unavailable = () => finish(desktopIpcFailureOf(new DesktopError(ELECKOI_FAILURE_CODES.lifecycleNotReady,
        '主窗口插件设置当前不可用。', { what: '主窗口插件设置' })))
      const closed = () => unavailable()
      const timer = setTimeout(unavailable, 10000)
      pending.set(key, { target, finish })
      target.once('closed', closed)
      try { target.webContents.send(DESKTOP_SHELL_IPC.pluginSettingsRequested, key, id) }
      catch (error) { pending.delete(key); clearTimeout(timer); target.removeListener('closed', closed); reject(error) }
    })
  })
  return () => {
    disposed = true
    ipcMain.removeHandler(DESKTOP_SHELL_IPC.pluginSettingsOpen)
    ipcMain.removeListener(DESKTOP_SHELL_IPC.pluginSettingsResult, receive)
    for (const { finish } of [...pending.values()]) finish(desktopIpcFailureOf(new DesktopError(
      ELECKOI_FAILURE_CODES.lifecycleDisposed, '插件设置导航已关闭。', { what: '插件设置导航' })))
  }
}
