import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  getCookies: vi.fn(), authenticate: vi.fn(async () => 'dsh-auth-synthetic=token'),
  open: vi.fn(async () => undefined), restart: undefined as (() => Promise<void>) | undefined,
}))
vi.mock('electron', () => ({
  app: Object.assign(new EventEmitter(), { getPreferredSystemLanguages: () => ['zh-CN'] }),
  BrowserWindow: class {}, ipcMain: Object.assign(new EventEmitter(), { handle: vi.fn(), removeHandler: vi.fn() }),
  nativeTheme: {}, protocol: { handle: vi.fn(), unhandle: vi.fn() }, screen: {}, shell: {},
  session: { defaultSession: { cookies: { get: state.getCookies, remove: vi.fn() },
    webRequest: { onBeforeSendHeaders: vi.fn() }, setPermissionRequestHandler: vi.fn(), setPermissionCheckHandler: vi.fn() } },
  dialog: {}, clipboard: {}, nativeImage: {}, systemPreferences: {}, Menu: {}, webContents: {},
}))
vi.mock('../src/main/platform/electron/ElectronWindowHost', () => ({ ElectronWindowHost: class {
  constructor(restart: () => Promise<void>) { state.restart = restart }
  define() {} all() { return [] } close() {} open = state.open
  updateOverlays = { input() {} }
} }))
vi.mock('../src/main/platform/electron/desktopBrowserGuests', () => ({ DesktopBrowserGuests: class { dispose() {} } }))
vi.mock('../src/main/platform/electron/mainPluginNavigation', () => ({ installMainPluginNavigation: () => () => {} }))
vi.mock('../src/main/platform/electron/desktopCaptionMenu', () => ({ createDesktopCaptionMenu: () => () => {}, installDesktopDeveloperShortcuts() {} }))
vi.mock('../src/main/platform/electron/dsh/keyboard', () => ({ installDesktopShortcuts: () => ({ dispose() {} }) }))
vi.mock('../src/main/platform/electron/dsh/file-actions', () => ({ installFileActions() {} }))
vi.mock('../src/main/platform/electron/dsh/file-drag', () => ({ installDesktopFileDrag: () => async () => {} }))
vi.mock('../src/main/platform/electron/dsh/directory-picker', () => ({ installDesktopDirectoryPicker() {} }))
vi.mock('../src/main/platform/electron/dsh/microphone-permissions', () => ({ installMicrophonePermissions() {} }))
vi.mock('../src/main/platform/electron/dshClientDocument', async importOriginal => ({
  ...await importOriginal<typeof import('../src/main/platform/electron/dshClientDocument')>(),
  authenticateDshClientHost: state.authenticate,
}))

import { mainWindowPlugin } from '../src/main/platform/electron/mainWindowPlugin'

afterEach(() => { vi.clearAllMocks(); vi.restoreAllMocks(); state.restart = undefined })

describe('Main window official Host cookie cleanup', () => {
  it.each(['pending', 'rejected'])('opens and restarts the Host while old-cookie cleanup is %s', async mode => {
    const pending = Promise.withResolvers<readonly { name: string }[]>()
    const failure = new Error('Synthetic cookie store failure')
    const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => {})
    state.getCookies.mockImplementation(() => mode === 'pending' ? pending.promise : Promise.reject(failure))
    const order: string[] = []
    state.authenticate.mockImplementation(async () => { order.push('authenticate'); return 'dsh-auth-synthetic=token' })
    state.open.mockImplementation(async () => { order.push('open') })
    const ctx = {
      appPaths: { userData: 'synthetic-profile' }, appLog: { info() {}, error() {}, warn() {} },
      pluginHost: { start: async () => ({ url: 'http://127.0.0.1:32123/login', injections: [] }), onFailure: () => () => {} },
      provide() {}, effect() {}, emit() {},
    }
    const dispose = await mainWindowPlugin.apply(ctx as never)
    try {
      expect(order).toEqual(['authenticate', 'open'])
      expect(state.getCookies).toHaveBeenCalledOnce()
      await state.restart!()
      expect(order).toEqual(['authenticate', 'open', 'authenticate'])
      expect(state.getCookies).toHaveBeenCalledTimes(2)
      if (mode === 'rejected') expect(diagnostic).toHaveBeenCalledWith('desktop: legacy Host cookie cleanup failed', failure)
    } finally { pending.resolve([]); await dispose() }
  }, 10_000)
})
