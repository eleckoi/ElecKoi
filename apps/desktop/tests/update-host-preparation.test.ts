import { beforeEach, expect, it, vi } from 'vitest'
import { updatesPlugin } from '../src/main/modules/updates/updatesPlugin'

const fixture = vi.hoisted(() => ({
  options: undefined as any,
  confirm: vi.fn(async () => true),
  updater: {},
  handlers: new Map(),
}))
vi.mock('electron', () => ({ app: { isPackaged: true, getPreferredSystemLanguages: () => ['zh'], getLocale: () => 'zh', getVersion: () => '0.2.19' },
  BrowserWindow: { getFocusedWindow: () => undefined }, ipcMain: { handle: vi.fn(), removeHandler: vi.fn() } }))
vi.mock('electron-updater', () => ({ default: { autoUpdater: fixture.updater } }))
vi.mock('../src/main/modules/updates/UpdateService', () => ({ UpdateService: class {
  constructor(options: unknown) { fixture.options = options }
  nativeStatus() { return { phase: 'ready', version: '0.2.20' } }
  start() {} dispose() {}
} }))
vi.mock('../src/main/modules/updates/DesktopUpdatePrompts', () => ({ DesktopUpdatePrompts: class {
  confirmInstall = fixture.confirm
  dispose() {}
} }))
vi.mock('../src/main/modules/updates/GitHubApiProvider', () => ({ configureGitHubApiUpdates: vi.fn() }))
vi.mock('../src/main/platform/electron/dsh/locale-cache', () => ({ readDesktopLocaleCache: () => 'zh' }))
vi.mock('../src/main/platform/electron/desktopIpcHandler', () => ({ handleDesktopIpcCall: vi.fn() }))

beforeEach(() => { fixture.confirm.mockReset().mockResolvedValue(true) })
function setup() {
  const pluginHost = { updateTasks: vi.fn(async () => false), close: vi.fn(async () => {}) }
  const windows = { all: () => [], stopFileTransfers: vi.fn(async () => {}), restartHost: vi.fn(async () => {}), updateOverlays: {} }
  const dispose = updatesPlugin.apply({ appPaths: { userData: 'synthetic' }, pluginHost, electronWindows: windows,
    appLog: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }, provide: vi.fn() } as never)
  return { pluginHost, windows, dispose, prepare: () => fixture.options.prepareInstall(), release: () => fixture.options.releaseInstall() }
}
it('leaves the running Host and file transfers untouched when the native confirmation is canceled', async () => {
  const f = setup(); fixture.confirm.mockResolvedValue(false)
  try {
    expect(await f.prepare()).toBe(false)
    expect(f.pluginHost.updateTasks.mock.calls).toEqual([['inspect']])
    expect(f.pluginHost.close).not.toHaveBeenCalled()
    expect(f.windows.stopFileTransfers).not.toHaveBeenCalled()
  } finally { f.dispose() }
})
it('rejects tasks admitted after inspection and releases their admission lock', async () => {
  const f = setup(); f.pluginHost.updateTasks.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
  try {
    await expect(f.prepare()).rejects.toMatchObject({ kind: 'tasks-changed' })
    expect(f.pluginHost.updateTasks.mock.calls).toEqual([['inspect'], ['lock'], ['unlock']])
    expect(f.pluginHost.close).not.toHaveBeenCalled()
  } finally { f.dispose() }
})
it('restores the Host when a confirmed clean shutdown fails before installation is authorized', async () => {
  const f = setup(); f.pluginHost.close.mockRejectedValueOnce(new Error('Synthetic cleanup failure'))
  try {
    await expect(f.prepare()).rejects.toThrow('Synthetic cleanup failure')
    expect(f.pluginHost.close).toHaveBeenCalledWith(true)
    expect(f.windows.restartHost).toHaveBeenCalledOnce()
    await f.release()
    expect(f.windows.restartHost).toHaveBeenCalledOnce()
  } finally { f.dispose() }
})
it('settles transfers and closes cleanly before authorizing installation, then restores the Host on handoff failure', async () => {
  const f = setup()
  try {
    expect(await f.prepare()).toBe(true)
    expect(f.windows.stopFileTransfers.mock.invocationCallOrder[0]).toBeLessThan(f.pluginHost.close.mock.invocationCallOrder[0]!)
    expect(f.pluginHost.close).toHaveBeenCalledWith(true)
    expect(f.windows.restartHost).not.toHaveBeenCalled()
    await f.release()
    expect(f.windows.restartHost).toHaveBeenCalledOnce()
  } finally { f.dispose() }
})
