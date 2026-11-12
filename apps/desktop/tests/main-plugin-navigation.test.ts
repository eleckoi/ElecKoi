import { EventEmitter } from 'node:events'
import { afterEach, expect, it, vi } from 'vitest'
import type { BrowserWindow, IpcMainInvokeEvent } from 'electron'
import { DESKTOP_SHELL_IPC } from '@shared/contracts/desktopShell'
import { desktopIpcFailureOf } from '@shared/foundation/ipcFailure'
import { DesktopError } from '@shared/foundation/DesktopError'
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes'

const mocked = vi.hoisted(() => ({ handlers: new Map(), listeners: new Map() }))
vi.mock('electron', () => ({ ipcMain: {
  handle: (key: string, fn: unknown) => mocked.handlers.set(key, fn),
  removeHandler: (key: string) => mocked.handlers.delete(key),
  on: (key: string, fn: unknown) => mocked.listeners.set(key, fn),
  removeListener: (key: string) => mocked.listeners.delete(key)
} }))
import { installMainPluginNavigation } from '../src/main/platform/electron/mainPluginNavigation'

let dispose: (() => void) | undefined
afterEach(() => { dispose?.(); dispose = undefined; vi.useRealTimers() })
function setup() {
  const target = Object.assign(new EventEmitter(), { webContents: { mainFrame: {}, send: vi.fn() } })
  const child = { sender: { mainFrame: {} }, senderFrame: {} }
  const assertSender = vi.fn((event: unknown) => {
    if (event !== child) throw new DesktopError(ELECKOI_FAILURE_CODES.senderUntrusted, '合成非受管页面', {})
  })
  const openMain = vi.fn(async () => target as unknown as BrowserWindow)
  dispose = installMainPluginNavigation(assertSender, openMain)
  const open = (id: unknown, sender: unknown = child) => mocked.handlers.get(DESKTOP_SHELL_IPC.pluginSettingsOpen)(sender as IpcMainInvokeEvent, id)
  const reply = (result?: unknown, sender: unknown = target.webContents, key?: number) => mocked.listeners.get(DESKTOP_SHELL_IPC.pluginSettingsResult)(
    { sender, senderFrame: (sender as any).mainFrame }, key ?? target.webContents.send.mock.lastCall?.[1], result)
  return { target, child, openMain, open, reply }
}

it('focuses the existing main window, waits for its navigation and ignores acknowledgements from another renderer', async () => {
  const h = setup()
  let done = false
  const opened = h.open('web-search').then((value: unknown) => { done = true; return value })
  await Promise.resolve()
  expect(h.openMain).toHaveBeenCalledOnce()
  expect(h.target.webContents.send).toHaveBeenCalledWith(DESKTOP_SHELL_IPC.pluginSettingsRequested, expect.any(Number), 'web-search')
  h.reply(undefined, h.child.sender)
  mocked.listeners.get(DESKTOP_SHELL_IPC.pluginSettingsResult)({ sender: h.target.webContents, senderFrame: {} }, h.target.webContents.send.mock.lastCall?.[1], undefined)
  await Promise.resolve()
  expect(done).toBe(false)
  h.reply()
  await expect(opened).resolves.toBeUndefined()
  expect(h.target.listenerCount('closed')).toBe(0)
})

it('preserves official navigation errors and supports a clean retry', async () => {
  const h = setup(), failure = desktopIpcFailureOf(new DesktopError(ELECKOI_FAILURE_CODES.lifecycleNotReady, '合成插件未就绪', { what: '合成插件' }))
  const first = h.open('web-search'); await Promise.resolve(); h.reply(failure)
  await expect(first).resolves.toMatchObject(failure)
  const second = h.open('subagent'); await Promise.resolve(); h.reply()
  await expect(second).resolves.toBeUndefined()
})

it('rejects untrusted callers and unsupported destinations before touching the main window', async () => {
  const h = setup()
  await expect(h.open('web-search', {})).resolves.toMatchObject({ code: ELECKOI_FAILURE_CODES.senderUntrusted })
  await expect(h.open('arbitrary-destination')).resolves.toMatchObject({ code: ELECKOI_FAILURE_CODES.inputUnsupported })
  expect(h.openMain).not.toHaveBeenCalled()
})

it('releases a request if the main window closes or never acknowledges, including shutdown', async () => {
  vi.useFakeTimers()
  const h = setup()
  const first = h.open('web-search'); await Promise.resolve(); h.target.emit('closed')
  await expect(first).resolves.toMatchObject({ code: ELECKOI_FAILURE_CODES.lifecycleNotReady })
  const second = h.open('web-search'); await Promise.resolve(); await vi.advanceTimersByTimeAsync(10000)
  await expect(second).resolves.toMatchObject({ code: ELECKOI_FAILURE_CODES.lifecycleNotReady })
  const third = h.open('subagent'); await Promise.resolve(); dispose?.(); dispose = undefined
  await expect(third).resolves.toMatchObject({ code: ELECKOI_FAILURE_CODES.lifecycleDisposed })
  expect(h.target.listenerCount('closed')).toBe(0)
  expect(vi.getTimerCount()).toBe(0)
})
