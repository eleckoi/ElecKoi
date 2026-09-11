import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopBridge } from '@shared/contracts/desktopBridge'
import { DESKTOP_EVENT_CHANNEL, DESKTOP_REQUEST_CHANNEL } from '@shared/contracts/gateway/channels'
import type { GatewayEventEnvelope } from '@shared/contracts/gateway/types'

const bridge: DesktopBridge = {
  request: (name, input) => ipcRenderer.invoke(DESKTOP_REQUEST_CHANNEL, { name, input }),
  subscribe: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, envelope: GatewayEventEnvelope) => listener(envelope)
    ipcRenderer.on(DESKTOP_EVENT_CHANNEL, wrapped)
    return () => ipcRenderer.removeListener(DESKTOP_EVENT_CHANNEL, wrapped)
  }
}

contextBridge.exposeInMainWorld('eleckoi', bridge)
