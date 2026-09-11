/// <reference types="vite/client" />

import type { DesktopBridge } from '../../shared/contracts/desktopBridge'

declare global {
  interface Window {
    eleckoi: DesktopBridge
  }
}

export {}
