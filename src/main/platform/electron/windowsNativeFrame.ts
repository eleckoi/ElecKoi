import { join } from 'node:path'
import { app, type BrowserWindow } from 'electron'
import koffi from 'koffi'

type WindowsNativeFrameLibrary = {
  install: (hwnd: bigint | number) => boolean
}

let nativeFrameLibrary: WindowsNativeFrameLibrary | undefined

/**
 * Preserve the real Win10 DWM shadow while removing its visible non-client
 * border. The actual WndProc subclass lives in a tiny native DLL: Chromium's
 * Windows message stack must never cross a long-lived JavaScript callback.
 */
export function installWindowsNativeFrame(window: BrowserWindow): void {
  if (process.platform !== 'win32') return

  const hwnd = readNativeHandle(window.getNativeWindowHandle())
  if (!getNativeFrameLibrary().install(hwnd)) {
    throw new Error('无法安装 ElecKoi 的 Windows 无边框阴影。')
  }
}

function getNativeFrameLibrary(): WindowsNativeFrameLibrary {
  if (nativeFrameLibrary !== undefined) return nativeFrameLibrary

  const architecture = process.arch === 'x64' ? 'win32-x64' : undefined
  if (architecture === undefined) {
    throw new Error(`Windows 无边框阴影暂不支持 ${process.arch} 架构。`)
  }

  const developmentPath = join(app.getAppPath(), 'resources', 'native', architecture, 'eleckoi-window-frame.dll')
  const packagedPath = join(process.resourcesPath, 'native', architecture, 'eleckoi-window-frame.dll')
  const library = koffi.load(app.isPackaged ? packagedPath : developmentPath)
  const install = library.func('bool __stdcall ElecKoiInstallWindowFrame(void *hwnd)') as WindowsNativeFrameLibrary['install']

  nativeFrameLibrary = { install }
  return nativeFrameLibrary
}

function readNativeHandle(buffer: Buffer): bigint | number {
  return process.arch === 'ia32'
    ? buffer.readUInt32LE(0)
    : buffer.readBigUInt64LE(0)
}
