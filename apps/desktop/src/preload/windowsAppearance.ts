import { ipcRenderer } from 'electron'
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes'
import { DesktopError } from '@shared/foundation/DesktopError'
import { WINDOWS_TITLEBAR_HEIGHT, windowsCaptionFill } from '../windowsLayout'

/** Keep the native Windows caption in the document's current palette. */
export function installWindowsAppearance(): () => void {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 1
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (context === null) throw new DesktopError(ELECKOI_FAILURE_CODES.internal,
    'Desktop caption requires a 2D canvas context', { what: '窗口标题栏的 2D 绘图环境' })
  const root = document.documentElement
  root.setAttribute('data-windows-titlebar', '')
  root.setAttribute('data-native-window-controls', '')
  root.style.setProperty('--window-caption-height', `${WINDOWS_TITLEBAR_HEIGHT}px`)
  root.style.setProperty('--dsh-windows-titlebar-height', `${WINDOWS_TITLEBAR_HEIGHT}px`)
  // Managers extend their content canvas behind the caption, unlike the sidebar-backed shell.
  const view = new URLSearchParams(window.location.search).get('view')
  const background = view === 'character-manager' || view === 'preset-manager'
    ? 'var(--character-manager-canvas,var(--chat,var(--dsw-alias-bg-base)))'
    : 'var(--dsw-specific-sidebar-fill,var(--list))'
  const probe = document.createElement('span')
  probe.style.cssText = `position:fixed;visibility:hidden;pointer-events:none;background-color:${background};color:var(--dsw-alias-label-primary,var(--title-fg))`
  document.body.append(probe)
  const nativeColor = (color: string, translucentFallback?: string): string => {
    context.clearRect(0, 0, 1, 1)
    context.fillStyle = color
    context.fillRect(0, 0, 1, 1)
    const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data
    // Electron paints the group and each button separately, so partial alpha shows seams.
    const opacity = Number(alpha) / 255
    if (translucentFallback && opacity > 0 && opacity < 1) return translucentFallback
    return `rgba(${red}, ${green}, ${blue}, ${opacity})`
  }
  let previous = ''
  let frame: HTMLIFrameElement | null = null
  const frameObserver = new MutationObserver(() => send())
  const coveringFramePalette = (): { color: string; symbolColor: string } | null => {
    const width = root.clientWidth, height = root.clientHeight
    const candidate = document.elementFromPoint?.(width - 1, WINDOWS_TITLEBAR_HEIGHT / 2)
    const next = candidate instanceof HTMLIFrameElement ? candidate : null
    if (next !== frame && (next || !frame?.isConnected)) {
      frameObserver.disconnect()
      frame = next
      for (let node: HTMLElement | null = frame; node && node !== document.body; node = node.parentElement) {
        frameObserver.observe(node, { attributes: true, attributeFilter: ['style', 'class', 'hidden'], childList: true })
      }
    }
    if (!frame || next !== frame || !width || !height) return null
    const bounds = frame.getBoundingClientRect()
    if (bounds.left > 0 || bounds.top > 0 || bounds.right < width || bounds.bottom < height) return null
    // Full-window author portals can cover the application caption without
    // entering native fullscreen. Keep native controls above that document.
    const ancestors: HTMLElement[] = []
    for (let node: HTMLElement | null = frame; node; node = node.parentElement) ancestors.unshift(node)
    context.clearRect(0, 0, 1, 1)
    context.fillStyle = getComputedStyle(probe).backgroundColor
    context.fillRect(0, 0, 1, 1)
    for (const node of ancestors) {
      context.fillStyle = getComputedStyle(node).backgroundColor
      context.fillRect(0, 0, 1, 1)
    }
    const [red, green, blue] = context.getImageData(0, 0, 1, 1).data
    const linear = (value: number): number => value / 255 <= 0.04045 ? value / 255 / 12.92 : ((value / 255 + 0.055) / 1.055) ** 2.4
    const luminance = 0.2126 * linear(red!) + 0.7152 * linear(green!) + 0.0722 * linear(blue!)
    return { color: 'rgba(0, 0, 0, 0)', symbolColor: luminance > 0.179 ? '#111111' : '#ffffff' }
  }
  const send = (): void => {
    const style = getComputedStyle(probe)
    const covering = coveringFramePalette()
    const dark = document.body.hasAttribute('data-ds-dark-theme') || getComputedStyle(root).colorScheme === 'dark'
    const values = [root.getAttribute('data-ds-theme-source'), covering?.color ?? nativeColor(style.backgroundColor, windowsCaptionFill(dark)),
      covering?.symbolColor ?? nativeColor(style.color)]
    const current = JSON.stringify(values)
    if (current === previous) return
    previous = current
    ipcRenderer.send('eleckoi:dsh-native-theme', ...values)
  }
  const observer = new MutationObserver(send)
  observer.observe(root, { attributes: true, attributeFilter: ['data-theme', 'data-ds-theme-source', 'style', 'class'] })
  // Theme plugins also switch their palette through body data attributes.
  observer.observe(document.body, { attributes: true, childList: true })
  observer.observe(document.head, { childList: true, subtree: true, characterData: true })
  document.head.addEventListener('load', send, true)
  window.addEventListener('resize', send)
  send()
  return () => {
    observer.disconnect()
    frameObserver.disconnect()
    probe.remove()
    document.head.removeEventListener('load', send, true)
    window.removeEventListener('resize', send)
  }
}
