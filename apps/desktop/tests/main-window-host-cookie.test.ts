import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => {
  const mainFrame = { url: 'dsh-app://app/' }
  const window = {
    isDestroyed: () => false,
    once: vi.fn(), setIcon: vi.fn(), setAppDetails: vi.fn(),
    setBackgroundColor: vi.fn(),
    show: vi.fn(),
    webContents: { id: 1, mainFrame, getURL: () => mainFrame.url, reload: vi.fn(), on: vi.fn(), setWindowOpenHandler: vi.fn() },
  }
  const childFrame = { url: 'dsh-app://app/?view=character-editor&character=synthetic' }
  const child = { webContents: { id: 2, mainFrame: childFrame, getURL: () => childFrame.url, reload: vi.fn() } }
  return {
    window, child, definitions: new Map<string, { afterCreate?: (window: unknown) => void }>(),
    getCookies: vi.fn(), authenticate: vi.fn(async () => 'dsh-auth-synthetic=token'),
    readTheme: vi.fn<() => Promise<'light' | 'dark' | 'system'>>().mockResolvedValue('dark'),
    open: vi.fn(async () => window), restart: undefined as (() => Promise<void>) | undefined,
  }
})
vi.mock('electron', () => ({
  app: Object.assign(new EventEmitter(), { getPreferredSystemLanguages: () => ['zh-CN'], getAppPath: () => 'synthetic-app' }),
  BrowserWindow: class {}, ipcMain: Object.assign(new EventEmitter(), { handle: vi.fn(), removeHandler: vi.fn() }),
  nativeTheme: {}, protocol: { handle: vi.fn(), unhandle: vi.fn() }, screen: {}, shell: {},
  session: { defaultSession: { cookies: { get: state.getCookies, remove: vi.fn() },
    webRequest: { onBeforeSendHeaders: vi.fn() }, setPermissionRequestHandler: vi.fn(), setPermissionCheckHandler: vi.fn() } },
  dialog: {}, clipboard: {}, nativeImage: {}, systemPreferences: {}, Menu: {}, webContents: {},
}))
vi.mock('../src/main/platform/electron/ElectronWindowHost', () => ({ ElectronWindowHost: class {
  constructor(restart: () => Promise<void>) { state.restart = restart }
  define(name: string, blueprint: { afterCreate?: (window: unknown) => void }) { state.definitions.set(name, blueprint) }
  all() { return [state.window, state.child] } close() {} open = state.open
  updateOverlays = { input() {} }
} }))
vi.mock('../src/main/platform/electron/desktopBrowserGuests', () => ({ DesktopBrowserGuests: class { bind() {} dispose() {} } }))
vi.mock('../src/main/platform/electron/mainPluginNavigation', () => ({ installMainPluginNavigation: () => () => {} }))
vi.mock('../src/main/platform/electron/desktopCaptionMenu', () => ({ createDesktopCaptionMenu: () => () => {}, installDesktopDeveloperShortcuts() {} }))
vi.mock('../src/main/platform/electron/dsh/keyboard', () => ({ installDesktopShortcuts: () => ({ attach() {}, dispose() {} }) }))
vi.mock('../src/main/platform/electron/textContextMenu', () => ({ installTextContextMenu() {} }))
vi.mock('../src/main/platform/electron/windowsNativeFrame', () => ({ installWindowsNativeFrame() {} }))
vi.mock('../src/main/platform/electron/mainWindowConsole', () => ({ installMainWindowConsole() {} }))
vi.mock('../src/main/platform/electron/dsh/file-actions', () => ({ installFileActions() {} }))
vi.mock('../src/main/platform/electron/dsh/file-drag', () => ({ installDesktopFileDrag: () => async () => {} }))
vi.mock('../src/main/platform/electron/dsh/directory-picker', () => ({ installDesktopDirectoryPicker() {} }))
vi.mock('../src/main/platform/electron/dsh/microphone-permissions', () => ({ installMicrophonePermissions() {} }))
vi.mock('../src/main/platform/electron/dsh/welcome-backend', () => ({
  connectDesktopWelcome: () => ({ readThemePreference: state.readTheme }),
}))
vi.mock('../src/main/platform/electron/dshClientDocument', async importOriginal => ({
  ...await importOriginal<typeof import('../src/main/platform/electron/dshClientDocument')>(),
  authenticateDshClientHost: state.authenticate,
}))

import { ipcMain, nativeTheme } from 'electron'
import { mainWindowPlugin } from '../src/main/platform/electron/mainWindowPlugin'

afterEach(() => { vi.clearAllMocks(); vi.restoreAllMocks(); state.restart = undefined; state.definitions.clear() })

describe('Main window official Host cookie cleanup', () => {
  it.each(['pending', 'rejected'])('opens and restarts the Host while old-cookie cleanup is %s', async mode => {
    const pending = Promise.withResolvers<readonly { name: string }[]>()
    const failure = new Error('Synthetic cookie store failure')
    const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => {})
    state.getCookies.mockImplementation(() => mode === 'pending' ? pending.promise : Promise.reject(failure))
    const order: string[] = []
    state.authenticate.mockImplementation(async () => { order.push('authenticate'); return 'dsh-auth-synthetic=token' })
    state.open.mockImplementation(async () => { order.push('open'); return state.window })
    const ctx = {
      appPaths: { userData: 'synthetic-profile' }, appLog: { info() {}, error() {}, warn() {} },
      pluginHost: { start: async () => ({ url: 'http://127.0.0.1:32123/login', injections: [] }), onFailure: () => () => {} },
      provide() {}, effect() {}, emit() {},
    }
    const dispose = await mainWindowPlugin.apply(ctx as never)
    try {
      expect(order).toEqual(['open', 'authenticate'])
      expect(state.getCookies).toHaveBeenCalledOnce()
      await state.restart!()
      expect(order).toEqual(['open', 'authenticate', 'authenticate'])
      expect(state.getCookies).toHaveBeenCalledTimes(2)
      if (mode === 'rejected') expect(diagnostic).toHaveBeenCalledWith('desktop: legacy Host cookie cleanup failed', failure)
    } finally { pending.resolve([]); await dispose() }
  }, 10_000)

  it('lets the main document wait for an authenticated Host before showing the window', async () => {
    const pageLoaded = Promise.withResolvers<typeof state.window>()
    const hostStarted = Promise.withResolvers<{ url: string; injections: readonly unknown[] }>()
    const theme = Promise.withResolvers<'light' | 'dark' | 'system'>()
    const start = vi.fn(() => hostStarted.promise)
    state.open.mockReturnValueOnce(pageLoaded.promise)
    state.getCookies.mockResolvedValue([])
    state.readTheme.mockReturnValueOnce(theme.promise)
    const ctx = {
      appPaths: { userData: 'synthetic-profile' }, appLog: { info() {}, error() {}, warn() {} },
      pluginHost: { start, onFailure: () => () => {} }, provide() {}, effect() {}, emit() {},
    }
    const applying = mainWindowPlugin.apply(ctx as never)
    await Promise.resolve()
    expect(state.open).toHaveBeenCalledWith('main')
    expect(start).not.toHaveBeenCalled()
    const boot = vi.mocked(ipcMain.handle).mock.calls.find(([channel]) => channel === 'eleckoi:dsh-client-boot')?.[1]
    expect(boot).toBeDefined()
    const sender = state.window.webContents
    const received = vi.fn()
    const response = Promise.resolve(boot!({ sender, senderFrame: sender.mainFrame } as never)).then(received)
    pageLoaded.resolve(state.window)
    await Promise.resolve()
    expect(start).toHaveBeenCalledOnce()
    expect(received).not.toHaveBeenCalled()
    expect(state.window.show).not.toHaveBeenCalled()
    hostStarted.resolve({ url: 'http://127.0.0.1:32123/login', injections: ['synthetic-injection'] })
    await vi.waitFor(() => expect(state.readTheme).toHaveBeenCalledOnce())
    expect(state.window.show).not.toHaveBeenCalled()
    theme.resolve('dark')
    const dispose = await applying
    try {
      await response
      expect(received).toHaveBeenCalledWith({
        streamBaseUrl: 'http://127.0.0.1:32123', injections: ['synthetic-injection'],
      })
      expect(state.window.show).toHaveBeenCalledOnce()
      expect(nativeTheme.themeSource).toBe('dark')
    } finally { await dispose() }
  })
})

it('routes main preload and boot failures to recovery while logging a child boot failure locally', async () => {
  const emit = vi.fn()
  const logError = vi.fn()
  state.getCookies.mockResolvedValue([])
  const dispose = await mainWindowPlugin.apply({
    appPaths: { userData: 'synthetic-profile', resolveResource: () => 'synthetic.ico' },
    appLog: { info() {}, error: logError, warn() {} },
    pluginHost: { start: async () => ({ url: 'http://127.0.0.1:32123/login', injections: [] }), onFailure: () => () => {} },
    provide() {}, effect() {}, emit,
  } as never)
  try {
    state.definitions.get('main')!.afterCreate!(state.window)
    const bootFailed = vi.mocked(ipcMain.handle).mock.calls.find(([channel]) => channel === 'eleckoi:dsh-client-boot-failed')![1]
    const child = state.child.webContents
    const main = state.window.webContents
    expect(await bootFailed({ sender: child, senderFrame: child.mainFrame } as never, 'child error')).toBeUndefined()
    expect(emit).not.toHaveBeenCalled()
    expect(logError).toHaveBeenCalledWith({ message: 'child error', webContentsId: child.id }, 'DSH child window boot failed')

    await bootFailed({ sender: main, senderFrame: main.mainFrame } as never, 'main boot error')
    expect(emit).toHaveBeenCalledWith('eleckoi/desktop-fatal', expect.objectContaining({ message: 'main boot error' }))

    const original = new Error('synthetic preload failure')
    const preloadError = main.on.mock.calls.find(([event]) => event === 'preload-error')![1]
    preloadError({}, 'preload.cjs', original)
    expect(emit).toHaveBeenLastCalledWith('eleckoi/desktop-fatal', original)
    expect(logError).toHaveBeenCalledWith({ err: original, path: 'preload.cjs' }, 'DSH main window preload failed')
  } finally { await dispose() }
})
