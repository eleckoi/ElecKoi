// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { DESKTOP_SHELL_IPC } from '@shared/contracts/desktopShell'
const ipc = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('electron', () => ({ ipcRenderer: ipc }))
import { installWindowsMenu } from '../src/preload/windowsMenu'

let menu: ReturnType<typeof installWindowsMenu> | undefined
afterEach(() => {
  menu?.dispose(); menu = undefined
  document.body.replaceChildren()
  vi.clearAllMocks()
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
