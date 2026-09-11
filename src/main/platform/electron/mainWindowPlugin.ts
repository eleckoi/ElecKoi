import { join } from 'node:path'
import { app, BrowserWindow, nativeTheme, screen, shell, type BrowserWindowConstructorOptions } from 'electron'
import type { Context, Plugin } from '@deepseek-ai/cordis'
import type { AppearanceMode } from '@shared/contracts/settings/schemas'
import { isAllowedExternalUrl, isAppRendererUrl } from './validateSender'
import { ElectronWindowHost } from './ElectronWindowHost'
import { installWindowsNativeFrame } from './windowsNativeFrame'

export const mainWindowPlugin = {
  name: 'eleckoi-main-window',
  inject: ['appPaths', 'appLog', 'desktopGateway', 'agentSessions', 'userSettings'],
  provide: 'electronWindows',
  async apply(ctx: Context) {
    let appearanceMode = ctx.userSettings.read('appearance.mode')
    nativeTheme.themeSource = appearanceMode

    const windows = new ElectronWindowHost()
    ctx.provide('electronWindows', windows)

    windows.define('main', {
      singleton: true,
      closesHostOnClose: true,
      options: () => windowOptions(ctx, false),
      load: (window) => loadRenderer(window),
      afterCreate: (window) => configureMainWindow(ctx, windows, window)
    })
    windows.define('child', {
      singleton: false,
      instanceKey: (payload) => {
        const frameName = (payload as { frameName?: unknown })?.frameName
        return typeof frameName === 'string' ? frameName : ''
      },
      options: (payload) => windowOptions(ctx, true, payload),
      load: async (window, payload) => {
        const url = (payload as { url?: unknown })?.url
        if (typeof url !== 'string' || !isAppRendererUrl(url)) {
          throw new Error('拒绝打开非 ElecKoi 子窗口。')
        }
        await window.loadURL(url)
      },
      afterCreate: (window) => {
        configureWindowsAppDetails(ctx, window)
        installWindowsNativeFrame(window)
        window.webContents.on('did-finish-load', () => installWindowsNativeFrame(window))
        window.once('ready-to-show', () => window.show())
      }
    })

    const focusMainWindow = () => { void windows.open('main') }
    app.on('activate', focusMainWindow)
    app.on('second-instance', focusMainWindow)

    const unregisterControl = ctx.desktopGateway.register(
      'command.window.control',
      ({ action }, request) => {
        const target = request.windowId === undefined ? undefined : BrowserWindow.fromId(request.windowId)
        if (target != null && !target.isDestroyed()) {
          if (action === 'minimize') target.minimize()
          if (action === 'maximize') {
            if (target.isMaximized()) target.unmaximize()
            else target.maximize()
          }
          if (action === 'close') target.close()
        }
        return { ok: true as const }
      }
    )

    const publishAppearanceMode = () => {
      ctx.desktopGateway.broadcast('settings.changed', {
        key: 'appearance.mode',
        value: appearanceMode
      })
    }
    const handleNativeThemeUpdated = () => {
      if (appearanceMode === 'system') publishAppearanceMode()
    }
    nativeTheme.on('updated', handleNativeThemeUpdated)

    const unregisterAppearanceMode = ctx.desktopGateway.register(
      'command.appearance.set_mode',
      ({ mode }) => {
        appearanceMode = ctx.userSettings.write('appearance.mode', mode)
        nativeTheme.themeSource = appearanceMode
        publishAppearanceMode()
        return {
          mode: appearanceMode,
          resolved: resolveAppearanceMode(appearanceMode)
        }
      }
    )

    await windows.open('main')
    return () => {
      unregisterControl()
      unregisterAppearanceMode()
      nativeTheme.removeListener('updated', handleNativeThemeUpdated)
      app.removeListener('activate', focusMainWindow)
      app.removeListener('second-instance', focusMainWindow)
      windows.close()
    }
  }
} satisfies Plugin.Object

function windowOptions(ctx: Context, child: boolean, payload?: unknown): BrowserWindowConstructorOptions {
  const size = child ? initialChildWindowSize(payload) : initialWindowSize()
  return {
    title: child ? 'ElecKoi' : 'ElecKoi',
    ...size,
    minWidth: 900,
    minHeight: 600,
    center: true,
    show: false,
    ...(process.platform === 'win32'
      ? { titleBarStyle: 'hidden' as const }
      : { frame: false }),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#13131a' : '#ffffff',
    icon: ctx.appPaths.resolveResource('icons', 'eleckoi-app-icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  }
}

function resolveAppearanceMode(mode: AppearanceMode): 'light' | 'dark' {
  if (mode === 'system') return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  return mode
}

function configureMainWindow(ctx: Context, windows: ElectronWindowHost, window: BrowserWindow): void {
  configureWindowsAppDetails(ctx, window)
  installWindowsNativeFrame(window)
  window.webContents.on('did-finish-load', () => installWindowsNativeFrame(window))
  window.once('ready-to-show', () => window.show())
  window.webContents.on('will-navigate', (event, url) => {
    if (!isAppRendererUrl(url)) event.preventDefault()
  })
  window.webContents.setWindowOpenHandler(({ url, frameName }) => {
    if (isAppRendererUrl(url)) void windows.open('child', { url, frameName })
    else if (isAllowedExternalUrl(url)) {
      void shell.openExternal(url).catch((error: unknown) => {
        ctx.appLog.warn({ error, url }, 'Failed to open external URL')
      })
    }
    else ctx.appLog.warn({ url }, 'Blocked external window request')
    return { action: 'deny' }
  })
}

function configureWindowsAppDetails(ctx: Context, window: BrowserWindow): void {
  if (process.platform !== 'win32') return

  const executable = `"${process.execPath}"`
  const relaunchCommand = process.defaultApp
    ? `${executable} "${app.getAppPath()}"`
    : executable

  window.setAppDetails({
    appId: 'com.eleckoi.desktop',
    appIconPath: process.defaultApp
      ? ctx.appPaths.resolveResource('icons', 'eleckoi-app-icon.ico')
      : process.execPath,
    appIconIndex: 0,
    relaunchCommand,
    relaunchDisplayName: 'ElecKoi'
  })
}

async function loadRenderer(window: BrowserWindow): Promise<void> {
  if (process.env.ELECTRON_RENDERER_URL !== undefined) {
    await window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    await window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function initialWindowSize(): { width: number; height: number } {
  return fitWindowSize(1440, 960)
}

function initialChildWindowSize(payload?: unknown): { width: number; height: number } {
  const frameName = (payload as { frameName?: unknown } | undefined)?.frameName
  return typeof frameName === 'string' && frameName.startsWith('character-editor-')
    ? fitWindowSize(1520, 1120)
    : fitWindowSize(960, 720)
}

function fitWindowSize(preferredWidth: number, preferredHeight: number): { width: number; height: number } {
  const workArea = screen.getPrimaryDisplay().workAreaSize
  const workAreaMargin = 64
  const scale = Math.min(
    1,
    (workArea.width - workAreaMargin) / preferredWidth,
    (workArea.height - workAreaMargin) / preferredHeight
  )

  return {
    width: Math.max(900, Math.floor(preferredWidth * scale)),
    height: Math.max(600, Math.floor(preferredHeight * scale))
  }
}
