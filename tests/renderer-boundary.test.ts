import { afterEach, describe, expect, it } from 'vitest'
import { isAllowedExternalUrl, isAppRendererUrl } from '../src/main/platform/electron/validateSender'

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
    expect(isAllowedExternalUrl('mqqapi://card/show_pslcard?src_type=internal&version=1&uin=1041463229&card_type=group&source=qrcode')).toBe(false)
    expect(isAllowedExternalUrl('mqqapi://card/show_pslcard?uin=123456789&card_type=group')).toBe(false)
    expect(isAllowedExternalUrl('mqqapi://message/open?uin=1041463229')).toBe(false)
    expect(isAllowedExternalUrl('tencent://groupwpa/?subcmd=all&param=7b2267726f757055696e223a3132333435363738397d')).toBe(false)
    expect(isAllowedExternalUrl('http://example.com')).toBe(false)
    expect(isAllowedExternalUrl('file:///C:/private/secret.txt')).toBe(false)
    expect(isAllowedExternalUrl('javascript:alert(1)')).toBe(false)
    expect(isAllowedExternalUrl('not-a-url')).toBe(false)
  })
})
