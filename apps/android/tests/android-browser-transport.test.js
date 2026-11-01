import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'
import { describe, expect, it } from 'vitest'

const facade = readFileSync(new URL('../app/src/main/assets/platform-facade.js', import.meta.url), 'utf8')
const cookieScript = readFileSync(new URL('../app/src/compat/assets/eleckoi-browser/cookies.js', import.meta.url), 'utf8')
const compatPage = readFileSync(new URL('../app/src/compat/assets/eleckoi-browser/page.js', import.meta.url), 'utf8')

function pageWithTransport(asyncTransport) {
  const dom = new JSDOM('<html><body></body></html>', { url: 'http://127.0.0.1:31001/', runScripts: 'outside-only', pretendToBeVisual: true })
  const calls = [], window = dom.window
  window.matchMedia = () => ({ matches: false })
  window.HTMLCanvasElement.prototype.getContext = () => ({ clearRect() {}, fillRect() {}, getImageData: () => ({ data: new Uint8ClampedArray(4) }) })
  window.ElecKoiAndroidTransport = { invoke(method, json) {
    const args = JSON.parse(json); calls.push({ method, args })
    let result = null
    if (method === 'replyNotificationStatus') result = JSON.stringify({ enabled: true, allowed: false })
    if (method === 'setReplyNotifications') result = JSON.stringify({ enabled: args[0], allowed: false })
    if (method === 'backgroundRunStatus') result = JSON.stringify({ batteryExempt: false, backgroundRestricted: false, enhancedEnabled: false, overlayAllowed: false })
    if (method === 'setEnhancedBackground') result = JSON.stringify({ batteryExempt: false, backgroundRestricted: false, enhancedEnabled: args[0], overlayAllowed: false })
    if (method === 'beginFile') result = JSON.stringify({ success: true, result: 'synthetic-transfer' })
    if (['writeFile', 'finishFile', 'abortFile'].includes(method)) result = JSON.stringify({ success: true, result: '' })
    if (method === 'finishFile') queueMicrotask(() => window.dispatchEvent(new window.CustomEvent('eleckoi:platform-result', {
      detail: { id: calls.find(call => call.method === 'beginFile').args[0], success: true, result: 'content://synthetic/output' }
    })))
    const reply = JSON.stringify({ success: true, result })
    return asyncTransport ? Promise.resolve(reply) : reply
  } }
  window.eval(facade)
  return { dom, window, calls }
}

describe.each([false, true])('shared Android facade with asynchronous transport=%s', asyncTransport => {
  it('keeps background preference changes separate from user-owned system permission settings', async () => {
    const { dom, window, calls } = pageWithTransport(asyncTransport)
    try {
      expect((await window.ElecKoiPlatform.backgroundRun.status()).enhancedEnabled).toBe(false)
      expect((await window.ElecKoiPlatform.backgroundRun.setEnhanced(true)).overlayAllowed).toBe(false)
      await window.ElecKoiPlatform.backgroundRun.settings('battery')
      await window.ElecKoiPlatform.backgroundRun.settings('overlay')
      expect(calls.slice(-2)).toEqual([{ method: 'backgroundRunSettings', args: ['battery'] }, { method: 'backgroundRunSettings', args: ['overlay'] }])
    } finally { dom.window.close() }
  })
  it('reads and saves native notification preferences with both browser transports', async () => {
    const { dom, window, calls } = pageWithTransport(asyncTransport)
    try {
      expect(await window.ElecKoiPlatform.replyNotifications.status()).toEqual({ enabled: true, allowed: false })
      expect(await window.ElecKoiPlatform.replyNotifications.setEnabled(false)).toEqual({ enabled: false, allowed: false })
      await window.ElecKoiPlatform.replyNotifications.settings()
      expect(calls.slice(-3)).toEqual([
        { method: 'replyNotificationStatus', args: [] }, { method: 'setReplyNotifications', args: [false] }, { method: 'notificationSettings', args: [] },
      ])
    } finally { dom.window.close() }
  })
  it('resizes the Android layout viewport for the keyboard and preserves existing viewport options', async () => {
    const { dom, window } = pageWithTransport(asyncTransport)
    try {
      expect(window.document.documentElement.hasAttribute('data-eleckoi-browser')).toBe(false)
      const viewport = window.document.createElement('meta')
      viewport.name = 'viewport'; viewport.content = 'width=device-width, initial-scale=1.25, interactive-widget=resizes-visual'
      window.document.head.append(viewport)
      window.document.dispatchEvent(new window.Event('DOMContentLoaded'))
      expect(viewport.content).toBe('width=device-width, initial-scale=1.25, interactive-widget=resizes-content')
      expect(window.document.querySelectorAll('meta[name="viewport"]')).toHaveLength(1)
    } finally { window.close() }
  })
  it('streams an export in order and waits for the actual native save result', async () => {
    const { dom, window, calls } = pageWithTransport(asyncTransport)
    let read = false
    try {
      const blob = { type: 'text/plain', stream: () => ({ getReader: () => ({
        read: async () => read ? { done: true } : (read = true, { done: false, value: new Uint8Array([65, 66]) }),
        releaseLock() {}
      }) }) }
      expect(await window.ElecKoiPlatform.saveBlob('synthetic.txt', blob)).toEqual({ result: 'content://synthetic/output', cancelled: false })
      const writes = calls.filter(call => ['beginFile', 'writeFile', 'finishFile'].includes(call.method))
      expect(writes.map(call => call.method)).toEqual(['beginFile', 'writeFile', 'finishFile'])
      expect(writes[1].args).toEqual(['synthetic-transfer', 'QUI='])
    } finally { dom.window.close() }
  })
  it('respects the page navigation guard and updates only supported platform attributes', () => {
    const { dom, window } = pageWithTransport(asyncTransport)
    try {
      window.addEventListener('eleckoi:platform-back', event => event.preventDefault(), { once: true })
      expect(window.ElecKoiPlatform.browserCommand({ type: 'back', payload: {} })).toBe(true)
      expect(window.ElecKoiPlatform.browserCommand({ type: 'back', payload: {} })).toBe(false)
      window.ElecKoiPlatform.browserCommand({ type: 'attribute', payload: { name: 'data-eleckoi-ime-visible', value: true } })
      expect(window.document.documentElement.hasAttribute('data-eleckoi-ime-visible')).toBe(true)
      expect(() => window.ElecKoiPlatform.browserCommand({ type: 'attribute', payload: { name: 'onclick', value: true } })).toThrow('Unsupported')
    } finally { dom.window.close() }
  })
})

it('the bundled browser identifies its build explicitly without classifying the device', () => {
  const dom = new JSDOM('', { url: 'http://127.0.0.1:31001/', runScripts: 'outside-only' })
  try {
    dom.window.eval(compatPage)
    expect(dom.window.document.documentElement.getAttribute('data-eleckoi-browser')).toBe('compat')
  } finally { dom.window.close() }
})

it('the bundled cookie transport preserves plugin cookies and rejects foreign origins', async () => {
  const dom = new JSDOM('', { runScripts: 'outside-only' })
  let handler
  const responses = [], cookies = new Map([['plugin', 'keep']])
  dom.window.browser = {
    runtime: { connectNative: () => ({ onDisconnect: { addListener() {} }, onMessage: { addListener(fn) { handler = fn } }, postMessage(value) { responses.push(value) } }) },
    cookies: {
      getAll: async () => [...cookies].map(([name, value]) => ({ name, value })),
      set: async value => { cookies.set(value.name, value.value); return value },
      remove: async value => { cookies.delete(value.name) }
    }
  }
  try {
    dom.window.eval(cookieScript)
    const name = 'dsh-auth-' + 'a'.repeat(43)
    await handler({ id: 'set', operation: 'set', url: 'http://127.0.0.1:31001/', header: `${name}=synthetic; Path=/; HttpOnly; SameSite=Strict` })
    await handler({ id: 'get', operation: 'get', url: 'http://127.0.0.1:31001/' })
    expect(responses[1].result).toContain('plugin=keep')
    expect(responses[1].result).toContain(`${name}=synthetic`)
    await handler({ id: 'foreign', operation: 'get', url: 'https://example.invalid/' })
    expect(responses[2].success).toBe(false)
    expect(cookies.get('plugin')).toBe('keep')
  } finally { dom.window.close() }
})
