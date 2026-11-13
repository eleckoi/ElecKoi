import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { app, BrowserWindow, ipcMain, nativeTheme, net, protocol, screen, session, shell, type BrowserWindowConstructorOptions, type IpcMainInvokeEvent } from 'electron'
import { windowsAppUserModelId } from './windowsAppIdentity'
import type { Context, Plugin } from '@deepseek-ai/cordis'
import { assertTrustedDshClientFrame, isAllowedExternalUrl, isAppRendererUrl, isDshAppUrl, isDshChildUrl } from './validateSender'
import { ElectronWindowHost } from './ElectronWindowHost'
import { installMainPluginNavigation } from './mainPluginNavigation'
import { installTextContextMenu } from './textContextMenu'
import { installWindowsNativeFrame } from './windowsNativeFrame'
import { DesktopBrowserGuests } from './desktopBrowserGuests'
import { installMainWindowConsole } from './mainWindowConsole'
import { editorWindowSize, isEditorFrame, MAIN_WINDOW_SIZE, matchEditorWindowSize } from './editorWindowSizing'
import { authenticateDshClientHost, DSH_CLIENT_ORIGIN, forwardDshClientRequest, isDshClientAsset, serveDshClientAsset } from './dshClientDocument'
import { DESKTOP_SHELL_IPC } from '@shared/contracts/desktopShell'
import { LOG_ACTIONS } from '@shared/contracts/logActions'
import { foldFailure } from '@shared/foundation/failure'
import { desktopHostFailureNoticeOf } from '@shared/foundation/ipcFailure'
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes'
import { DesktopError } from '@shared/foundation/DesktopError'
import { logAction, relayRendererActionLog } from '@main/platform/logging/logActions'
import { handleDesktopIpcCall } from './desktopIpcHandler'
import { createDesktopCaptionMenu, installDesktopDeveloperShortcuts } from './desktopCaptionMenu'
import { WINDOWS_TITLEBAR_HEIGHT } from '../../../windowsLayout'
import { installFileActions } from './dsh/file-actions'
import { installDesktopFileDrag } from './dsh/file-drag'
import { installDesktopShortcuts } from './dsh/keyboard'
import { installMicrophonePermissions } from './dsh/microphone-permissions'
import { installDesktopDirectoryPicker } from './dsh/directory-picker'
import { readDeviceInfo } from './dsh/device-info'
import { connectDesktopWelcome } from './dsh/welcome-backend'
import { DESKTOP_IPC } from '@shared/contracts/desktopNative'
import { writeDesktopLocaleCache } from '@main/platform/electron/dsh/locale-cache'
import { resolveDesktopStartupLocale } from '@main/platform/electron/dsh/locale'

export const mainWindowPlugin = {
  name: 'eleckoi-main-window',
  inject: ['appPaths', 'appLog', 'pluginHost'],
  provide: 'electronWindows',
  async apply(ctx: Context) {
    const appPaths = ctx.appPaths
    const appLog = ctx.appLog
    const pluginHost = ctx.pluginHost
    nativeTheme.themeSource = 'system'

    const windows = new ElectronWindowHost(async () => {
      pluginHostReady = undefined
      const restarted = await runPluginHostStart()
      pluginHostReady = { ...restarted, cookie: await authenticateDshClientHost(restarted.url) }
      if (fileDragStopped) { disposeFileDrag = startFileDrag(); fileDragStopped = false }
      for (const window of windows.all()) window.webContents.reload()
    }, async () => {
      if (!fileDragStopped) { await disposeFileDrag(); fileDragStopped = true }
    })
    ctx.provide('electronWindows', windows)
    let mainWindow: BrowserWindow | undefined
    if (process.platform === 'win32') {
      ctx.effect(() => installDesktopDeveloperShortcuts(), 'eleckoi: official Windows developer shortcuts')
      handleDesktopIpcCall(DESKTOP_SHELL_IPC.windowsMenu,
        createDesktopCaptionMenu(() => mainWindow, owner => browserGuests.focusedContents(owner)))
    }
    let pluginHostReady: { url: string; injections: readonly unknown[]; cookie: string } | undefined
    const browserGuests = new DesktopBrowserGuests(() => pluginHostReady?.url)
    const assertNativeOwner = (event: IpcMainInvokeEvent): BrowserWindow => {
      const owner = windows.all().find(window => window.webContents === event.sender)
      if (!owner || event.senderFrame !== owner.webContents.mainFrame || !event.senderFrame.url.startsWith(`${DSH_CLIENT_ORIGIN}/`)) {
        throw new DesktopError(ELECKOI_FAILURE_CODES.senderUntrusted, '拒绝非受管应用页面的桌面操作。', { what: '桌面操作', guard: 'managed-application-frame' })
      }
      return owner
    }
    const shortcuts = installDesktopShortcuts(() => mainWindow, appPaths.userData,
      process.platform === 'darwin' ? 'macos' : process.platform === 'win32' ? 'windows' : 'linux',
      () => {}, window => windows.updateOverlays.input(window))
    installFileActions(assertNativeOwner, () => pluginHostReady?.url)
    const startFileDrag = () => installDesktopFileDrag(assertNativeOwner, (address, signal) => pluginHost.resolveDragResource(address, signal))
    let disposeFileDrag = startFileDrag()
    let fileDragStopped = false
    installDesktopDirectoryPicker(() => mainWindow)
    installMicrophonePermissions(session.defaultSession, () => mainWindow?.webContents)
    ipcMain.handle(DESKTOP_IPC.deviceInfo, event => { assertNativeOwner(event); return readDeviceInfo() })
    ipcMain.handle(DESKTOP_IPC.localeBootstrap, async event => {
      assertNativeOwner(event)
      const ready = pluginHostReady
      if (!ready) throw new DesktopError(ELECKOI_FAILURE_CODES.lifecycleNotReady, '语言服务尚未就绪。', { what: '语言服务' })
      const backend = await connectDesktopWelcome(ready.url, (url, init) => net.fetch(url, init))
      return { languages: app.getPreferredSystemLanguages(), preference: await backend.readLocalePreference() }
    })
    const localeChanged = (event: Electron.IpcMainEvent, language: unknown): void => {
      if (event.sender !== mainWindow?.webContents || event.senderFrame !== mainWindow.webContents.mainFrame || typeof language !== 'string') return
      writeDesktopLocaleCache(appPaths.userData, resolveDesktopStartupLocale(language, app.getPreferredSystemLanguages()).id)
    }
    ipcMain.on(DESKTOP_IPC.localeChanged, localeChanged)

    windows.define('main', {
      singleton: true,
      closesHostOnClose: true,
      options: () => windowOptions(appPaths, false),
      load: (window) => window.loadURL(`${DSH_CLIENT_ORIGIN}/`),
      afterCreate: (window) => {
        mainWindow = window
        window.once('closed', () => { if (mainWindow === window) mainWindow = undefined })
        shortcuts.attach(window)
        browserGuests.bind(window, (guest, lease) => shortcuts.attachGuest(window, guest, lease))
        configureMainWindow(appPaths, appLog, windows, window)
        window.webContents.on('render-process-gone', (_event, details) => {
          if (details.reason !== 'clean-exit') {
            ctx.emit('eleckoi/desktop-fatal', new DesktopError(ELECKOI_FAILURE_CODES.internal, `页面渲染进程退出：${details.reason} (${details.exitCode})`, { what: '页面渲染进程' }))
          }
        })
      }
    })
    windows.define('child', {
      singleton: false,
      instanceKey: (payload) => {
        const frameName = (payload as { frameName?: unknown })?.frameName
        return typeof frameName === 'string' ? frameName : ''
      },
      options: (payload) => windowOptions(appPaths, true, payload, mainWindow),
      load: async (window, payload) => {
        const url = (payload as { url?: unknown })?.url
        if (typeof url !== 'string' || (!isAppRendererUrl(url) && !isDshChildUrl(url))) {
          throw new DesktopError(ELECKOI_FAILURE_CODES.securityDenied, '拒绝打开非 ElecKoi 子窗口。', { what: '非 ElecKoi 子窗口地址' })
        }
        await window.loadURL(url)
      },
      afterCreate: (window) => {
        installTextContextMenu(window)
        configureWindowsAppDetails(appPaths, window)
        installWindowsNativeFrame(window)
        window.webContents.on('did-finish-load', () => installWindowsNativeFrame(window))
        window.webContents.on('console-message', ({ level, message }) => {
          // 子窗口里的用户动作（导入 / 导出角色卡等）也走 console → 主进程日志这条路。
          if (relayRendererActionLog(appLog, message)) return
          if (level === 'error') appLog.error({ message }, 'ElecKoi child window console error')
        })
        window.webContents.on('did-fail-load', (_event, code, description, url) => {
          appLog.error({ code, description, url }, 'ElecKoi child window failed to load')
        })
        window.once('ready-to-show', () => window.show())
        configureWindowNavigation(appLog, windows, window, true, () => mainWindow)
      }
    })
    protocol.handle('dsh-app', async (request) => {
      const url = new URL(request.url)
      if (url.hostname === 'shell') {
        const name = url.pathname.slice(1)
        const types: Record<string, string> = { 'update-dialog.html': 'text/html', 'update-dialog.js': 'text/javascript',
          'update-dialog.css': 'text/css', 'design-platform.css': 'text/css', 'shell-theme.js': 'text/javascript', 'update-close.svg': 'image/svg+xml' }
        if (!Object.hasOwn(types, name)) return new Response(null, { status: 404 })
        return new Response(await readFile(appPaths.resolveResource('shell', name)), { headers: { 'content-type': types[name]! } })
      }
      if (url.hostname !== 'app') return new Response(null, { status: 404 })
      if (isDshClientAsset(url.pathname)) return serveDshClientAsset(request, pluginHost.frontendDirectory())
      const ready = pluginHostReady
      if (ready === undefined) return new Response(null, { status: 503 })
      try {
        const response = await forwardDshClientRequest(request, ready.url, ready.cookie)
        if (!response.ok && url.pathname.startsWith('/plugins/')) {
          appLog.error({ status: response.status, pathname: url.pathname }, 'DSH client plugin asset failed')
        }
        return response
      } catch (error) {
        appLog.error({ error, pathname: url.pathname }, 'DSH client request failed')
        return new Response(null, { status: 502 })
      }
    })
    handleDesktopIpcCall('eleckoi:dsh-client-boot', (event) => {
      assertTrustedDshClientFrame(
        event.sender,
        event.senderFrame?.url ?? '',
        event.senderFrame === event.sender.mainFrame,
        windows.all().map(window => window.webContents)
      )
      const ready = pluginHostReady
      if (ready === undefined) {
        throw new DesktopError(ELECKOI_FAILURE_CODES.lifecycleNotReady, 'DSH 插件宿主尚未启动。', { what: 'DSH 插件宿主' })
      }
      return {
        injections: ready.injections,
        streamBaseUrl: new URL(ready.url).origin
      }
    })
    handleDesktopIpcCall('eleckoi:dsh-client-boot-failed', (event, message: unknown) => {
      assertTrustedDshClientFrame(
        event.sender,
        event.senderFrame?.url ?? '',
        event.senderFrame === event.sender.mainFrame,
        windows.all().map(window => window.webContents)
      )
      if (typeof message !== 'string') {
        throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, 'DSH 插件页面错误格式不正确。', { what: 'DSH 插件页面错误' })
      }
      appLog.error({ message }, 'DSH plugin client boot failed')
      ctx.emit('eleckoi/desktop-fatal', new DesktopError(ELECKOI_FAILURE_CODES.pluginLoadFailed, message, { what: 'DSH 插件页面启动' }))
    })
    const syncNativeTheme = (event: Electron.IpcMainEvent, source: unknown, color: unknown, symbolColor: unknown) => {
      const target = windows.all().find(window => window.webContents === event.sender)
      if (!target || event.senderFrame !== target.webContents.mainFrame) return
      const url = event.senderFrame.url
      if (url !== `${DSH_CLIENT_ORIGIN}/` && !isDshChildUrl(url)) return
      if (target === mainWindow && (source === 'light' || source === 'dark' || source === 'system')) nativeTheme.themeSource = source
      const validColor = (value: unknown): value is string => typeof value === 'string'
        && /^(?:#[\da-f]{3,8}|rgba?\([\d.,%\s]+\))$/iu.test(value)
      if (process.platform === 'win32' && validColor(color) && validColor(symbolColor)) target.setTitleBarOverlay({ color, symbolColor })
    }
    ipcMain.on('eleckoi:dsh-native-theme', syncNativeTheme)
    session.defaultSession.webRequest.onBeforeSendHeaders({ urls: ['ws://127.0.0.1/*'] }, (details, callback) => {
      const ready = pluginHostReady
      const trustedSender = windows.all().some(window => window.webContents.id === details.webContentsId)
      if (ready === undefined || !trustedSender) { callback({}); return }
      const target = new URL(ready.url)
      if (new URL(details.url).host !== target.host) { callback({}); return }
      const headers = Object.fromEntries(Object.entries(details.requestHeaders).map(([name, value]) => [name.toLowerCase(), value]))
      if (headers.origin !== DSH_CLIENT_ORIGIN) { callback({ cancel: true }); return }
      callback({ requestHeaders: { ...headers, origin: target.origin, cookie: ready.cookie, 'sec-fetch-site': 'same-origin' } })
    })
    const focusMainWindow = () => { void windows.open('main') }
    const disposePluginNavigation = installMainPluginNavigation(assertNativeOwner, () => windows.open('main'))
    app.on('activate', focusMainWindow)
    app.on('second-instance', focusMainWindow)
    const detachPluginFailure = pluginHost.onFailure(error => {
      // 边界⑤：把边界③ 折好的失败对象原样交给渲染层（只加子进程的 stack 指针）。
      // 以前这里送一句写死的中文，码与详情在跨进程那一刻就没了——用户只看到「插件服务意外退出」，
      // 开发者连是哪个码都查不到。
      const failure = foldFailure(error)
      const notice = desktopHostFailureNoticeOf({
        ...failure,
        ...typeof error === 'object' && error !== null && typeof (error as { stack?: unknown }).stack === 'string'
          ? { stack: (error as { stack: string }).stack }
          : {}
      })
      for (const window of windows.all()) {
        if (!window.isDestroyed()) window.webContents.send(DESKTOP_SHELL_IPC.hostFailure, notice)
      }
    })

    handleDesktopIpcCall(DESKTOP_SHELL_IPC.windowControl, (event, action: unknown) => {
      assertTrustedDshClientFrame(
        event.sender,
        event.senderFrame?.url ?? '',
        event.senderFrame === event.sender.mainFrame,
        windows.all().map(window => window.webContents)
      )
      if (action !== 'minimize' && action !== 'maximize' && action !== 'close') {
        throw new DesktopError(ELECKOI_FAILURE_CODES.inputUnsupported, '桌面窗口操作不受支持。', {
          what: '桌面窗口操作',
          expected: 'minimize、maximize、close'
        })
      }
      const target = BrowserWindow.fromWebContents(event.sender)
      if (target === null || target.isDestroyed()) return
      if (action === 'minimize') target.minimize()
      if (action === 'maximize') {
        if (target.isMaximized()) target.unmaximize()
        else target.maximize()
      }
      if (action === 'close') target.close()
    })
    handleDesktopIpcCall(DESKTOP_SHELL_IPC.browserAcquire, (event, workspace: unknown) => {
      assertTrustedDshClientFrame(
        event.sender,
        event.senderFrame?.url ?? '',
        event.senderFrame === event.sender.mainFrame,
        windows.all().map(window => window.webContents)
      )
      return browserGuests.acquire(event.sender, workspace)
    })
    handleDesktopIpcCall(DESKTOP_SHELL_IPC.browserRelease, async (event, lease: unknown) => {
      assertTrustedDshClientFrame(
        event.sender,
        event.senderFrame?.url ?? '',
        event.senderFrame === event.sender.mainFrame,
        windows.all().map(window => window.webContents)
      )
      await browserGuests.release(event.sender, lease)
    })
    /**
     * 启动 DSH 插件宿主：开始 / 成功 / 失败各一行（失败行带契约码与详情），失败原样抛出。
     *
     * 插件宿主起不来是应用打不开的主要形态，日志里必须能一眼看出卡在这一步、码是什么。
     */
    async function runPluginHostStart(): Promise<Awaited<ReturnType<typeof pluginHost.start>>> {
      logAction(appLog, LOG_ACTIONS.pluginHostStart, 'start')
      try {
        const started = await pluginHost.start()
        logAction(appLog, LOG_ACTIONS.pluginHostStart, 'success')
        return started
      } catch (error) {
        logAction(appLog, LOG_ACTIONS.pluginHostStart, 'failure', error)
        throw error
      }
    }

    const ready = await runPluginHostStart()
    pluginHostReady = { ...ready, cookie: await authenticateDshClientHost(ready.url) }
    await windows.open('main')
    return async () => {
      await disposeFileDrag()
      shortcuts.dispose()
      for (const channel of [DESKTOP_IPC.fileSave, DESKTOP_IPC.clipboardImageRead, DESKTOP_IPC.directoryPick,
        DESKTOP_IPC.deviceInfo, DESKTOP_IPC.localeBootstrap]) ipcMain.removeHandler(channel)
      ipcMain.removeListener(DESKTOP_IPC.localeChanged, localeChanged)
      session.defaultSession.setPermissionRequestHandler(null)
      session.defaultSession.setPermissionCheckHandler(null)
      if (process.platform === 'win32') ipcMain.removeHandler(DESKTOP_SHELL_IPC.windowsMenu)
      ipcMain.removeHandler(DESKTOP_SHELL_IPC.windowControl)
      ipcMain.removeHandler(DESKTOP_SHELL_IPC.browserAcquire)
      ipcMain.removeHandler(DESKTOP_SHELL_IPC.browserRelease)
      detachPluginFailure()
      ipcMain.removeHandler('eleckoi:dsh-client-boot')
      ipcMain.removeHandler('eleckoi:dsh-client-boot-failed')
      ipcMain.removeListener('eleckoi:dsh-native-theme', syncNativeTheme)
      session.defaultSession.webRequest.onBeforeSendHeaders(null)
      protocol.unhandle('dsh-app')
      app.removeListener('activate', focusMainWindow)
      disposePluginNavigation()
      app.removeListener('second-instance', focusMainWindow)
      windows.close()
    }
  }
} satisfies Plugin.Object

function windowOptions(appPaths: Context['appPaths'], child: boolean, payload?: unknown, mainWindow?: BrowserWindow): BrowserWindowConstructorOptions {
  const size = child ? initialChildWindowSize(payload, mainWindow) : initialWindowSize()
  return {
    title: child ? 'ElecKoi' : 'ElecKoi',
    ...size,
    minWidth: 900,
    minHeight: 600,
    center: true,
    show: false,
    ...(process.platform === 'win32'
      ? { titleBarStyle: 'hidden' as const, titleBarOverlay: { height: WINDOWS_TITLEBAR_HEIGHT,
        color: nativeTheme.shouldUseDarkColors ? '#1b1b1c' : '#f9fafb', symbolColor: nativeTheme.shouldUseDarkColors ? '#f2f2f5' : '#111111' } }
      : { frame: false }),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#13131a' : '#ffffff',
    icon: appPaths.resolveResource('icons', process.platform === 'win32' ? 'eleckoi-app-icon.ico' : 'eleckoi-app-icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: !child
    }
  }
}

function configureMainWindow(appPaths: Context['appPaths'], appLog: Context['appLog'], windows: ElectronWindowHost, window: BrowserWindow): void {
  installTextContextMenu(window)
  configureWindowsAppDetails(appPaths, window)
  installWindowsNativeFrame(window)
  window.webContents.on('did-finish-load', () => installWindowsNativeFrame(window))
  installMainWindowConsole(window, appLog)
  window.webContents.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
    // Rich author cards use srcDoc iframes. Replacing their document while a
    // message changes reports ERR_ABORTED (-3) for about:srcdoc; it is an
    // expected subframe lifecycle event, not a failed DSH application load.
    if (!isMainFrame && code === -3) return
    appLog.error({ code, description, url, isMainFrame }, 'DSH client renderer failed to load')
  })
  window.once('ready-to-show', () => window.show())
  configureWindowNavigation(appLog, windows, window, true, () => window)
}

function configureWindowNavigation(appLog: Context['appLog'], windows: ElectronWindowHost, window: BrowserWindow, allowDshClient = false, mainWindow: () => BrowserWindow | undefined = () => undefined): void {
  window.webContents.on('will-navigate', (event, url) => {
    if (!isAppRendererUrl(url) && !(allowDshClient && isDshAppUrl(url))) event.preventDefault()
  })
  window.webContents.setWindowOpenHandler(({ url, frameName }) => {
    if (isAppRendererUrl(url) || isDshChildUrl(url)) {
      void windows.open('child', { url, frameName }).then(child => {
        if (isEditorFrame(frameName)) matchEditorWindowSize(child, mainWindow())
      }).catch(error => appLog.error({ error, frameName }, 'ElecKoi child window failed to open'))
    }
    else if (isAllowedExternalUrl(url)) {
      void shell.openExternal(url).catch((error: unknown) => {
        appLog.warn({ error, url }, 'Failed to open external URL')
      })
    }
    else appLog.warn({ url }, 'Blocked external window request')
    return { action: 'deny' }
  })
}

function configureWindowsAppDetails(appPaths: Context['appPaths'], window: BrowserWindow): void {
  if (process.platform !== 'win32') return

  const executable = `"${process.execPath}"`
  // ICO supplies native small/large frames; a full-size PNG becomes an oversized HICON.
  const windowIconPath = appPaths.resolveResource('icons', 'eleckoi-app-icon.ico')
  const relaunchCommand = process.defaultApp
    ? `${executable} "${app.getAppPath()}"`
    : executable

  window.setIcon(windowIconPath)
  window.setAppDetails({
    appId: windowsAppUserModelId,
    appIconPath: process.defaultApp
      ? appPaths.resolveResource('icons', 'eleckoi-app-icon.ico')
      : process.execPath,
    appIconIndex: 0,
    relaunchCommand,
    relaunchDisplayName: 'ElecKoi'
  })
}

function initialWindowSize(): { width: number; height: number } {
  return { ...MAIN_WINDOW_SIZE }
}

function initialChildWindowSize(payload?: unknown, mainWindow?: BrowserWindow): { width: number; height: number } {
  const frameName = (payload as { frameName?: unknown } | undefined)?.frameName
  if (isEditorFrame(frameName)) return editorWindowSize(mainWindow)
  if (frameName === 'creator-studio') {
    return fitWindowSize(1536, 1070)
  }
  if (frameName === 'character-manager' || frameName === 'preset-manager') {
    return fitWindowSize(1500, 1040)
  }
  return fitWindowSize(960, 720)
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
