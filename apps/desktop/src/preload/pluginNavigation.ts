import { ipcRenderer } from 'electron'
import { DESKTOP_SHELL_IPC, type DshDesktopProductApi } from '@shared/contracts/desktopShell'
import { desktopIpcFailureOf, unwrapDesktopIpcResult } from '@shared/foundation/ipcFailure'

// RETIRE WHEN: replace the complete ADR 0043 adapter with official Desktop window navigation.
export function createDesktopPluginNavigation(): NonNullable<DshDesktopProductApi['plugins']> {
  return {
    openSettings: id => unwrapDesktopIpcResult(() => ipcRenderer.invoke(DESKTOP_SHELL_IPC.pluginSettingsOpen, id)),
    subscribeOpenSettings(listener) {
      const handle = (_event: Electron.IpcRendererEvent, key: number, id: 'web-search' | 'subagent'): void => {
        Promise.resolve().then(() => listener(id)).then(
          result => ipcRenderer.send(DESKTOP_SHELL_IPC.pluginSettingsResult, key, result),
          error => ipcRenderer.send(DESKTOP_SHELL_IPC.pluginSettingsResult, key, desktopIpcFailureOf(error))
        )
      }
      ipcRenderer.on(DESKTOP_SHELL_IPC.pluginSettingsRequested, handle)
      return () => ipcRenderer.off(DESKTOP_SHELL_IPC.pluginSettingsRequested, handle)
    }
  }
}
