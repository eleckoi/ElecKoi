import { afterEach, describe, expect, it } from 'vitest'
import { assertTrustedDshClientFrame, assertTrustedRenderer, isAllowedExternalUrl, isAppRendererUrl, isDshChildUrl } from '../src/main/platform/electron/validateSender'
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes'
import { DesktopError } from '@shared/foundation/DesktopError'
import type { WebContents } from 'electron'

const originalRendererUrl = process.env.ELECTRON_RENDERER_URL

afterEach(() => {
  if (originalRendererUrl === undefined) delete process.env.ELECTRON_RENDERER_URL
  else process.env.ELECTRON_RENDERER_URL = originalRendererUrl
})

describe('Renderer trust boundary', () => {
  it('accepts the exact development origin and rejects prefix spoofing', () => {
    process.env.ELECTRON_RENDERER_URL = 'http://127.0.0.1:5173/'
    expect(isAppRendererUrl('http://127.0.0.1:5173/?view=chat')).toBe(true)
    expect(isAppRendererUrl('http://127.0.0.1:5173.evil.example/')).toBe(false)
  })

  it('accepts only the production renderer entry file', () => {
    delete process.env.ELECTRON_RENDERER_URL
    expect(isAppRendererUrl('file:///C:/app/out/renderer/index.html?view=chat')).toBe(true)
    expect(isAppRendererUrl('file:///C:/downloads/untrusted.html')).toBe(false)
    expect(isAppRendererUrl('https://example.com/out/renderer/index.html')).toBe(false)
  })

  it('allows HTTPS URLs and rejects local or custom protocols', () => {
    expect(isAllowedExternalUrl('https://example.com/search?q=eleckoi')).toBe(true)
    expect(isAllowedExternalUrl('mqqapi://card/show_pslcard?src_type=internal&version=1&uin=000000000&card_type=group&source=qrcode')).toBe(false)
    expect(isAllowedExternalUrl('mqqapi://card/show_pslcard?uin=000000000&card_type=group')).toBe(false)
    expect(isAllowedExternalUrl('mqqapi://message/open?uin=000000000')).toBe(false)
    expect(isAllowedExternalUrl('tencent://groupwpa/?subcmd=all&param=7b2267726f757055696e223a307d')).toBe(false)
    expect(isAllowedExternalUrl('http://example.com')).toBe(false)
    expect(isAllowedExternalUrl('file:///C:/private/secret.txt')).toBe(false)
    expect(isAllowedExternalUrl('javascript:alert(1)')).toBe(false)
    expect(isAllowedExternalUrl('not-a-url')).toBe(false)
  })

  it('accepts the owned DSH top frame and rejects a same-origin subframe', () => {
    const sender = { getURL: () => 'dsh-app://app/' } as WebContents
    expect(() => assertTrustedDshClientFrame(sender, 'dsh-app://app/', true, [sender])).not.toThrow()
    expect(() => assertTrustedDshClientFrame(sender, 'dsh-app://app/', false, [sender])).toThrow()
    expect(() => assertTrustedDshClientFrame(sender, 'dsh-app://app/', true, [])).toThrow()
    expect(() => assertTrustedDshClientFrame(sender, 'dsh-app://app.evil.invalid/', true, [sender])).toThrow()
  })

  it('boots only owned DSH child routes and rejects arbitrary same-origin pages', () => {
    const url = 'dsh-app://app/?view=character-editor&character=character-1'
    const sender = { getURL: () => url } as WebContents
    expect(isDshChildUrl(url)).toBe(true)
    expect(isDshChildUrl('dsh-app://app/?view=chat&chat=conversation-1')).toBe(true)
    expect(isDshChildUrl('dsh-app://app/?view=creator-studio')).toBe(true)
    expect(isDshChildUrl('dsh-app://app/?view=unknown')).toBe(false)
    expect(isDshChildUrl('dsh-app://app/?view=chat')).toBe(false)
    expect(isDshChildUrl('dsh-app://app/?view=chat&chat=one&extra=1')).toBe(false)
    expect(isDshChildUrl('dsh-app://app.evil.invalid/?view=chat&chat=one')).toBe(false)
    expect(() => assertTrustedDshClientFrame(sender, url, true, [sender])).not.toThrow()
    expect(() => assertTrustedDshClientFrame(sender, url, true, [])).toThrow()
    expect(() => assertTrustedDshClientFrame(sender, 'dsh-app://app/?view=unknown', true, [sender])).toThrow()
  })

  it('reports untrusted senders with the contract code', () => {
    const sender = { getURL: () => 'dsh-app://app/' } as WebContents
    const capture = (call: () => void): unknown => {
      try {
        call()
        return undefined
      } catch (error) {
        return error
      }
    }
    const fromPage = capture(() => assertTrustedRenderer(sender, 'https://evil.example/', true))
    expect(fromPage).toBeInstanceOf(DesktopError)
    expect((fromPage as DesktopError).code).toBe(ELECKOI_FAILURE_CODES.senderUntrusted)
    const fromFrame = capture(() => assertTrustedDshClientFrame(sender, 'dsh-app://app/', true, []))
    expect(fromFrame).toBeInstanceOf(DesktopError)
    expect((fromFrame as DesktopError).code).toBe(ELECKOI_FAILURE_CODES.senderUntrusted)
  })

  it.each(['creator', 'roleplay'])('opens and boots the preset manager for the %s category', purpose => {
    const url = `dsh-app://app/?view=preset-manager&purpose=${purpose}`
    const sender = { getURL: () => url } as WebContents
    expect(isDshChildUrl(url)).toBe(true)
    expect(() => assertTrustedDshClientFrame(sender, url, true, [sender])).not.toThrow()
    expect(isDshChildUrl('dsh-app://app/?view=preset-manager')).toBe(true)
  })

  it.each([
    'view=preset-manager&purpose=unknown',
    'view=preset-manager&purpose=',
    'view=preset-manager&purpose=creator&purpose=roleplay',
    'view=preset-manager&purpose=creator&extra=1',
    'view=creator-studio&purpose=creator',
    'view=character-manager&purpose=roleplay',
  ])('rejects unexpected child route parameters: %s', query => {
    expect(isDshChildUrl(`dsh-app://app/?${query}`)).toBe(false)
  })
})
