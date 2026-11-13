// @vitest-environment jsdom
import { expect, it, vi } from 'vitest'
import { installRichDocumentMeasurement } from '@eleckoi/author-sdk'

it('publishes the first height while iframe animation frames are suspended, then batches later updates', () => {
  let mutated!: () => void, hide!: () => void, painted!: () => void
  let bottom = 160
  const disconnect = vi.fn(), publish = vi.fn()
  vi.stubGlobal('MutationObserver', class { constructor(callback: () => void) { mutated = callback } observe() {} disconnect = disconnect })
  vi.stubGlobal('ResizeObserver', undefined)
  vi.spyOn(document.body, 'getBoundingClientRect').mockImplementation(() => ({ top: 0, bottom }) as DOMRect)
  const page = { scrollY: 0, innerWidth: 900, innerHeight: 800,
    document,
    getComputedStyle: () => ({ marginBottom: '0' }),
    requestAnimationFrame: vi.fn(callback => { painted = callback; return 1 }), cancelAnimationFrame: vi.fn(),
    addEventListener: (type: string, callback: () => void) => { if (type === 'pagehide') hide = callback }, removeEventListener() {},
  }
  try {
    installRichDocumentMeasurement(page as unknown as Window, publish)
    expect(publish.mock.calls).toEqual([[160]])
    expect(page.requestAnimationFrame).not.toHaveBeenCalled()
    bottom = 240; mutated(); mutated()
    expect(page.requestAnimationFrame).toHaveBeenCalledOnce()
    expect(publish).toHaveBeenCalledOnce()
    painted(); expect(publish.mock.calls).toEqual([[160], [240]])
    hide(); expect(disconnect).toHaveBeenCalledOnce()
  } finally { vi.unstubAllGlobals(); vi.restoreAllMocks() }
})
