import type { BrowserWindow, MenuItemConstructorOptions, WebContents } from 'electron'
import { beforeEach, expect, it, vi } from 'vitest'
import { DESKTOP_SHELL_IPC } from '@shared/contracts/desktopShell'
const native = vi.hoisted(() => ({ popup: vi.fn(), buildFromTemplate: vi.fn(), quit: vi.fn() }))
vi.mock('electron', () => ({
  Menu: { buildFromTemplate: native.buildFromTemplate },
  app: { isPackaged: true, quit: native.quit },
}))
import { createDesktopCaptionMenu } from '../src/main/platform/electron/desktopCaptionMenu'

beforeEach(() => {
  vi.clearAllMocks()
  native.popup.mockImplementation(({ callback }) => callback())
  native.buildFromTemplate.mockReturnValue({ popup: native.popup })
})
function fixture() {
  const frame = { url: 'dsh-app://app/' }
  const contents = { mainFrame: frame, getURL: () => frame.url, getZoomFactor: () => 1.5,
    focus: vi.fn(), sendInputEvent: vi.fn(), send: vi.fn() }
  const window = { webContents: contents, isDestroyed: () => false }
  const focused = vi.fn<() => WebContents | undefined>(() => undefined)
  const popup = createDesktopCaptionMenu(() => window as unknown as BrowserWindow, focused)
  const event = { sender: contents, senderFrame: frame } as unknown as Electron.IpcMainInvokeEvent
  return { contents, window, popup, event, focused }
}
it('opens a zoom-correct native menu and routes editing keys into the original editor or owned guest', async () => {
  const f = fixture()
  await f.popup(f.event, 'edit', 30, 40, 'zh-CN')
  expect(native.popup).toHaveBeenCalledWith({ window: f.window, x: 45, y: 60, callback: expect.any(Function) })
  const items = native.buildFromTemplate.mock.calls[0]![0] as MenuItemConstructorOptions[]
  expect(items.filter(item => item.type !== 'separator').map(item => item.label)).toEqual(['撤销', '重做', '剪切', '复制', '粘贴', '删除', '全选'])
  ;(items[0]!.click as () => void)()
  expect(f.contents.sendInputEvent.mock.calls.map(([input]) => input)).toEqual([
    { type: 'keyDown', keyCode: 'Z', modifiers: ['control'] },
    { type: 'keyUp', keyCode: 'Z', modifiers: ['control'] },
  ])
  const guest = { focus: vi.fn(), sendInputEvent: vi.fn() }
  f.focused.mockReturnValue(guest as unknown as WebContents)
  ;(items.find(item => item.label === '粘贴')!.click as () => void)()
  expect(guest.focus).toHaveBeenCalledOnce()
  expect(guest.sendInputEvent).toHaveBeenCalledWith({ type: 'keyDown', keyCode: 'V', modifiers: ['control'] })
})
it('uses the existing About and update surfaces, and rejects untrusted frames and malformed requests', async () => {
  const f = fixture()
  await f.popup(f.event, 'application', 10, 20, 'zh-CN')
  const items = native.buildFromTemplate.mock.calls[0]![0] as MenuItemConstructorOptions[]
  ;(items.find(item => item.label === '关于 ElecKoi')!.click as () => void)()
  expect(f.contents.send).toHaveBeenLastCalledWith(DESKTOP_SHELL_IPC.menuCommand, 'about')
  ;(items.find(item => item.label === '检查更新…')!.click as () => void)()
  expect(f.contents.send).toHaveBeenLastCalledWith(DESKTOP_SHELL_IPC.menuCommand, 'check-updates')
  expect(() => f.popup({ ...f.event, senderFrame: { url: 'about:srcdoc' } } as Electron.IpcMainInvokeEvent, 'edit', 0, 0, 'zh-CN')).toThrow()
  expect(() => f.popup(f.event, 'other', 0, 0, 'zh-CN')).toThrow('invalid popup')
  expect(() => f.popup(f.event, 'edit', NaN, 0, 'zh-CN')).toThrow('invalid popup')
  expect(native.buildFromTemplate).toHaveBeenCalledOnce()
})
