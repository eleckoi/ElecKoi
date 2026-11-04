// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { DESKTOP_SHELL_IPC } from '@shared/contracts/desktopShell'
const ipc = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('electron', () => ({ ipcRenderer: ipc }))
import { installWindowsMenu } from '../src/preload/windowsMenu'
import { installWindowsAppearance } from '../src/preload/windowsAppearance'

let menu: ReturnType<typeof installWindowsMenu> | undefined
afterEach(() => {
  menu?.dispose(); menu = undefined
  document.body.replaceChildren()
  document.documentElement.removeAttribute('data-native-window-controls')
  document.documentElement.style.removeProperty('--window-caption-height')
  document.documentElement.style.removeProperty('--dsh-windows-titlebar-height')
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

it('uses the native 40px caption and publishes theme colors only while mounted', async () => {
  const send = vi.fn()
  Object.assign(ipc, { send })
  const context = { clearRect: vi.fn(), fillRect: vi.fn(), fillStyle: '',
    getImageData: () => ({ data: [17, 17, 17, 255] }) }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D)
  const stop = installWindowsAppearance()
  expect(document.documentElement.hasAttribute('data-native-window-controls')).toBe(true)
  expect(document.documentElement.style.getPropertyValue('--window-caption-height')).toBe('40px')
  expect(document.documentElement.style.getPropertyValue('--dsh-windows-titlebar-height')).toBe('40px')
  expect(send).toHaveBeenLastCalledWith('eleckoi:dsh-native-theme', null, 'rgba(17, 17, 17, 1)', 'rgba(17, 17, 17, 1)')
  document.documentElement.setAttribute('data-ds-theme-source', 'dark')
  await Promise.resolve()
  expect(send).toHaveBeenLastCalledWith('eleckoi:dsh-native-theme', 'dark', 'rgba(17, 17, 17, 1)', 'rgba(17, 17, 17, 1)')
  stop()
  const calls = send.mock.calls.length
  document.documentElement.setAttribute('data-ds-theme-source', 'light')
  await Promise.resolve()
  expect(send).toHaveBeenCalledTimes(calls)
  expect(document.body.querySelector('span')).toBeNull()
  document.documentElement.removeAttribute('data-ds-theme-source')
})

it('keeps the editor selection when pointer or keyboard opens a native menu and releases the open state', async () => {
  document.documentElement.lang = 'zh-CN'
  const seat = document.createElement('span')
  seat.dataset.desktopMenuSeat = ''
  const input = document.createElement('textarea')
  input.value = 'Synthetic selected text'
  document.body.append(seat, input)
  menu = installWindowsMenu()
  const host = seat.firstElementChild as HTMLElement
  const [application, edit] = [...host.shadowRoot!.querySelectorAll('button')] as [HTMLButtonElement, HTMLButtonElement]
  expect(application.textContent).toBe('应用')
  expect(edit.textContent).toBe('编辑')
  input.focus(); input.setSelectionRange(10, 18)
  let finish!: () => void
  const pending = new Promise<void>(resolve => { finish = resolve })
  ipc.invoke.mockReturnValueOnce(pending)
  const pointer = new MouseEvent('pointerdown', { bubbles: true, cancelable: true })
  edit.dispatchEvent(pointer)
  expect(pointer.defaultPrevented).toBe(true)
  edit.click()
  expect(ipc.invoke).toHaveBeenLastCalledWith(DESKTOP_SHELL_IPC.windowsMenu, 'edit', 0, 0, 'zh-CN')
  expect(document.activeElement).toBe(input)
  expect([input.selectionStart, input.selectionEnd]).toEqual([10, 18])
  expect(edit.getAttribute('aria-expanded')).toBe('true')
  finish(); await pending; await Promise.resolve()
  expect(edit.getAttribute('aria-expanded')).toBe('false')

  application.focus()
  application.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
  expect(host.shadowRoot!.activeElement).toBe(edit)
  edit.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
  expect(document.activeElement).toBe(input)
  expect([input.selectionStart, input.selectionEnd]).toEqual([10, 18])
})

it('follows the rendered caption seat and locale across remounts, then disposes its DOM', async () => {
  menu = installWindowsMenu()
  const first = document.createElement('span')
  first.dataset.desktopMenuSeat = ''
  document.body.append(first)
  await Promise.resolve()
  const host = first.firstElementChild!
  first.remove()
  const next = document.createElement('span')
  next.dataset.desktopMenuSeat = ''
  document.body.append(next)
  await Promise.resolve()
  expect(next.firstElementChild).toBe(host)
  document.documentElement.lang = 'en'
  menu.update()
  expect(host.shadowRoot!.querySelector('[role=menubar]')!.getAttribute('aria-label')).toBe('Application menu')
  expect(host.shadowRoot!.querySelector('button')!.textContent).toBe('Application')
  menu.dispose(); menu = undefined
  expect(next.children.length).toBe(0)
})
