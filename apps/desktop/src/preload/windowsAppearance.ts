import { ipcRenderer } from 'electron'
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes'
import { DesktopError } from '@shared/foundation/DesktopError'
import { WINDOWS_TITLEBAR_HEIGHT } from '../windowsLayout'

/** Keep the native Windows caption in the document's current palette. */
export function installWindowsAppearance(): () => void {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 1
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (context === null) throw new DesktopError(ELECKOI_FAILURE_CODES.internal,
    'Desktop caption requires a 2D canvas context', { what: '窗口标题栏的 2D 绘图环境' })
  const root = document.documentElement
  root.setAttribute('data-native-window-controls', '')
  root.style.setProperty('--window-caption-height', `${WINDOWS_TITLEBAR_HEIGHT}px`)
  root.style.setProperty('--dsh-windows-titlebar-height', `${WINDOWS_TITLEBAR_HEIGHT}px`)
  // Managers extend their content canvas behind the caption, unlike the sidebar-backed shell.
  const view = new URLSearchParams(window.location.search).get('view')
  const background = view === 'character-manager' ? 'var(--character-manager-canvas,var(--chat))'
    : view === 'preset-manager' ? 'var(--chat,var(--dsw-alias-bg-base))'
      : 'var(--list,var(--dsw-specific-sidebar-fill))'
  const probe = document.createElement('span')
  probe.style.cssText = `position:fixed;visibility:hidden;pointer-events:none;background-color:${background};color:var(--title-fg,var(--dsw-alias-label-primary))`
  document.body.append(probe)
  const nativeColor = (color: string): string => {
    context.clearRect(0, 0, 1, 1)
    context.fillStyle = color
    context.fillRect(0, 0, 1, 1)
    const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data
    return `rgba(${red}, ${green}, ${blue}, ${Number(alpha) / 255})`
  }
  let previous = ''
  const send = (): void => {
    const style = getComputedStyle(probe)
    const values = [root.getAttribute('data-ds-theme-source'), nativeColor(style.backgroundColor), nativeColor(style.color)]
    const current = JSON.stringify(values)
    if (current === previous) return
    previous = current
    ipcRenderer.send('eleckoi:dsh-native-theme', ...values)
  }
  const observer = new MutationObserver(send)
  observer.observe(root, { attributes: true, attributeFilter: ['data-theme', 'data-ds-theme-source'] })
  observer.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme', 'style'] })
  observer.observe(document.head, { childList: true, subtree: true, characterData: true })
  document.head.addEventListener('load', send, true)
  send()
  return () => {
    observer.disconnect()
    probe.remove()
    document.head.removeEventListener('load', send, true)
  }
}
