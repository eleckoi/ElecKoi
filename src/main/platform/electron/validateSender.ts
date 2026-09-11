import type { WebContents } from 'electron'
import { DesktopError, DESKTOP_ERROR_CODES } from '@shared/contracts/gateway/DesktopError'

export function isAppRendererUrl(url: string): boolean {
  try {
    const candidate = new URL(url)
    const developmentUrl = process.env.ELECTRON_RENDERER_URL
    if (developmentUrl !== undefined) {
      return candidate.origin === new URL(developmentUrl).origin
    }
    if (candidate.protocol !== 'file:') return false
    const path = decodeURIComponent(candidate.pathname).replaceAll('\\', '/')
    return path.endsWith('/out/renderer/index.html')
  } catch {
    return false
  }
}

export function isAllowedExternalUrl(url: string): boolean {
  try {
    const candidate = new URL(url)
    return candidate.protocol === 'https:'
  } catch {
    return false
  }
}

export function assertTrustedRenderer(sender: WebContents): void {
  if (!isAppRendererUrl(sender.getURL())) {
    throw new DesktopError(DESKTOP_ERROR_CODES.FORBIDDEN, '拒绝来自非 ElecKoi 页面进程的调用。')
  }
}
