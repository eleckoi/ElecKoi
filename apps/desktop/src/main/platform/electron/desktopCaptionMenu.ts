import { app, Menu, type BrowserWindow, type MenuItemConstructorOptions, type WebContents } from 'electron'
import { DESKTOP_SHELL_IPC } from '@shared/contracts/desktopShell'
import { assertTrustedDshClientFrame } from './validateSender'
import { resolveDesktopLocale } from '@shared/contracts/desktopMenuLocale'
import { DesktopError } from '@shared/foundation/DesktopError'
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes'

/** Keep the official Windows developer shortcuts available while the caption menu is closed. */
export function installDesktopDeveloperShortcuts(): () => void {
  const previous = Menu.getApplicationMenu()
  const shortcuts = Menu.buildFromTemplate([
    { role: 'toggleDevTools', visible: false },
    { role: 'toggleDevTools', visible: false, accelerator: 'F12' },
  ])
  Menu.setApplicationMenu(shortcuts)
  return () => { if (Menu.getApplicationMenu() === shortcuts) Menu.setApplicationMenu(previous) }
}

/** Native caption commands retain the focused editor and its own undo history. */
export function createDesktopCaptionMenu(
  getWindow: () => BrowserWindow | undefined,
  getFocusedGuest: (owner: WebContents) => WebContents | undefined,
) {
  return (event: Electron.IpcMainInvokeEvent, name: unknown, x: unknown, y: unknown, language: unknown): Promise<void> => {
    const mainWindow = getWindow()
    assertTrustedDshClientFrame(event.sender, event.senderFrame?.url ?? '',
      event.senderFrame === event.sender.mainFrame, mainWindow ? [mainWindow.webContents] : [])
    if (mainWindow === undefined || event.sender !== mainWindow.webContents
      || event.senderFrame !== mainWindow.webContents.mainFrame) throw new DesktopError(
        ELECKOI_FAILURE_CODES.senderUntrusted, 'desktop menu: rejected sender', { what: '桌面菜单调用来源' })
    if ((name !== 'application' && name !== 'edit')
      || typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)
      || x < 0 || y < 0 || x > 100_000 || y > 100_000
      || typeof language !== 'string') throw new DesktopError(
        ELECKOI_FAILURE_CODES.inputUnsupported, 'desktop menu: invalid popup request', { what: '桌面菜单请求' })
    const window = mainWindow
    const { messages } = resolveDesktopLocale(language)
    const command = (value: 'about' | 'check-updates') => () => {
      if (!window.isDestroyed()) window.webContents.send(DESKTOP_SHELL_IPC.menuCommand, value)
    }
    const editItem = (label: string, keyCode: string, modifiers: Array<'control'>, accelerator?: string): MenuItemConstructorOptions => ({
      label,
      ...(accelerator === undefined ? {} : { accelerator }),
      click: () => {
        if (window.isDestroyed()) return
        const contents = getFocusedGuest(window.webContents) ?? window.webContents
        contents.focus()
        contents.sendInputEvent({ type: 'keyDown', keyCode, modifiers })
        contents.sendInputEvent({ type: 'keyUp', keyCode, modifiers })
      },
    })
    const applicationItems: MenuItemConstructorOptions[] = [
      { label: messages.aboutMenu.replace('DeepSeek Harness', 'ElecKoi'), click: command('about') },
      { type: 'separator' },
      { label: messages.checkUpdatesMenu, click: command('check-updates') },
      ...!app.isPackaged ? [
        { type: 'separator' as const },
        { label: messages.reloadPageMenu, role: 'reload' as const },
        { label: messages.restartAppHostMenu, click: () => { app.relaunch(); app.quit() } },
      ] : [],
      { role: 'toggleDevTools', label: messages.toggleDevToolsMenu, accelerator: 'Ctrl+Shift+I' },
      { type: 'separator' },
      { role: 'quit', label: messages.exitApplication },
    ]
    const items: MenuItemConstructorOptions[] = name === 'application' ? applicationItems : [
      editItem(messages.undo, 'Z', ['control'], 'Ctrl+Z'),
      editItem(messages.redo, 'Y', ['control'], 'Ctrl+Y'),
      { type: 'separator' },
      editItem(messages.cut, 'X', ['control'], 'Ctrl+X'),
      editItem(messages.copy, 'C', ['control'], 'Ctrl+C'),
      editItem(messages.paste, 'V', ['control'], 'Ctrl+V'),
      editItem(messages.delete, 'Delete', []),
      { type: 'separator' },
      editItem(messages.selectAll, 'A', ['control'], 'Ctrl+A'),
    ]
    const zoom = mainWindow.webContents.getZoomFactor()
    return new Promise<void>((resolve) => {
      Menu.buildFromTemplate(items).popup({ window, x: Math.round(x * zoom), y: Math.round(y * zoom), callback: resolve })
    })
  }
}
