import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative, resolve, sep } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import WebServer, { renderIndexInjections } from '@deepseek-ai/dsh-host-webserver'
import { JSDOM, VirtualConsole } from 'jsdom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installWebClientAssets } from '../src/webClientAssets'
import { WEBVIEW_BOOT_COMPATIBILITY_SCRIPT } from '../src/webViewBootCompatibility'

const cleanups = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })

function oldWebView(html = '<!doctype html><html><head></head><body></body></html>', runScripts = 'outside-only') {
  const errors = []
  const console = new VirtualConsole()
  console.on('jsdomError', error => errors.push(error))
  const page = new JSDOM(html, {
    runScripts, virtualConsole: console, url: 'http://127.0.0.1/',
    beforeParse(window) { delete window.Promise.withResolvers; delete window.AbortSignal.any; delete window.AbortSignal.prototype.throwIfAborted }
  })
  cleanups.push(() => page.window.close())
  return { window: page.window, errors }
}

function compatibleWebView() {
  const { window } = oldWebView()
  window.eval(WEBVIEW_BOOT_COMPATIBILITY_SCRIPT)
  return window
}

describe('WebView boot API compatibility', () => {
  it('preserves existing APIs and installs missing APIs only once', () => {
    const { window } = oldWebView()
    const nativePromise = () => {}, nativeAny = () => {}, nativeThrow = () => {}
    window.Promise.withResolvers = nativePromise
    window.AbortSignal.any = nativeAny
    window.AbortSignal.prototype.throwIfAborted = nativeThrow
    window.eval(WEBVIEW_BOOT_COMPATIBILITY_SCRIPT)
    expect(window.Promise.withResolvers).toBe(nativePromise)
    expect(window.AbortSignal.any).toBe(nativeAny)
    expect(window.AbortSignal.prototype.throwIfAborted).toBe(nativeThrow)
    delete window.Promise.withResolvers
    delete window.AbortSignal.any
    delete window.AbortSignal.prototype.throwIfAborted
    window.eval(WEBVIEW_BOOT_COMPATIBILITY_SCRIPT)
    const promise = window.Promise.withResolvers, any = window.AbortSignal.any, throwIfAborted = window.AbortSignal.prototype.throwIfAborted
    window.eval(WEBVIEW_BOOT_COMPATIBILITY_SCRIPT)
    expect(window.Promise.withResolvers).toBe(promise)
    expect(window.AbortSignal.any).toBe(any)
    expect(window.AbortSignal.prototype.throwIfAborted).toBe(throwIfAborted)
    for (const [target, key] of [[window.Promise, 'withResolvers'], [window.AbortSignal, 'any'], [window.AbortSignal.prototype, 'throwIfAborted']]) {
      expect(Object.getOwnPropertyDescriptor(target, key)).toMatchObject({ configurable: true, writable: true, enumerable: false })
    }
  })

  it('checks cancellation with the original reason and rejects invalid receivers', () => {
    const window = compatibleWebView()
    const controller = new window.AbortController()
    expect(controller.signal.throwIfAborted()).toBeUndefined()
    const reason = { kind: 'synthetic-cancel' }
    controller.abort(reason)
    let thrown
    try { controller.signal.throwIfAborted() } catch (error) { thrown = error }
    expect(thrown).toBe(reason)
    const standard = new window.AbortController()
    standard.abort()
    expect(() => standard.signal.throwIfAborted()).toThrow(window.DOMException)
    expect(() => window.AbortSignal.prototype.throwIfAborted.call({ aborted: false })).toThrow(window.TypeError)
  })

  it('settles deferred promises, preserves rejection reasons and supports subclasses', async () => {
    const window = compatibleWebView()
    const deferred = window.Promise.withResolvers()
    deferred.resolve('synthetic-result')
    await expect(deferred.promise).resolves.toBe('synthetic-result')
    const rejected = window.Promise.withResolvers(), reason = new Error('synthetic-rejection')
    const assertion = expect(rejected.promise).rejects.toBe(reason)
    rejected.reject(reason)
    await assertion
    const Subclass = window.eval('(class extends Promise {})')
    const subclass = window.Promise.withResolvers.call(Subclass)
    expect(subclass.promise).toBeInstanceOf(Subclass)
    subclass.resolve(42)
    await expect(subclass.promise).resolves.toBe(42)
    expect(() => window.Promise.withResolvers.call({})).toThrow(window.TypeError)
    expect(() => window.Promise.withResolvers.call(function () {})).toThrow(window.TypeError)
  })

  it('uses the first already aborted source and validates every input before returning', () => {
    const window = compatibleWebView()
    const first = new window.AbortController(), second = new window.AbortController()
    const reason = { kind: 'synthetic-cancel' }
    first.abort(reason); second.abort('second')
    const signal = window.AbortSignal.any(new Set([first.signal, second.signal]))
    expect(signal).toBeInstanceOf(window.AbortSignal)
    expect(signal.aborted).toBe(true)
    expect(signal.reason).toBe(reason)
    expect(window.AbortSignal.any([]).aborted).toBe(false)
    expect(() => window.AbortSignal.any([first.signal, { aborted: false }])).toThrow(window.TypeError)
    expect(() => window.AbortSignal.any()).toThrow(window.TypeError)
    expect(() => window.AbortSignal.any('')).toThrow(window.TypeError)
    expect(() => window.AbortSignal.any({ 0: first.signal, length: 1 })).toThrow(window.TypeError)
  })

  it('propagates cancellation once through nested signals and ignores synthetic abort events', () => {
    const window = compatibleWebView()
    const first = new window.AbortController(), second = new window.AbortController()
    const combined = window.AbortSignal.any([first.signal, first.signal, second.signal])
    const nested = window.AbortSignal.any([combined]), onAbort = vi.fn()
    nested.addEventListener('abort', onAbort)
    first.signal.dispatchEvent(new window.Event('abort'))
    expect(combined.aborted).toBe(false)
    const reason = { kind: 'synthetic-cancel' }
    second.abort(reason)
    expect(combined.reason).toBe(reason)
    expect(nested.reason).toBe(reason)
    first.abort('later')
    expect(nested.reason).toBe(reason)
    expect(onAbort).toHaveBeenCalledTimes(1)
  })

  it('releases all subscriptions across repeated requests on a shared connection signal', () => {
    const window = compatibleWebView()
    const connection = new window.AbortController()
    const add = vi.spyOn(connection.signal, 'addEventListener'), remove = vi.spyOn(connection.signal, 'removeEventListener')
    for (let index = 0; index < 100; index++) {
      const request = new window.AbortController()
      const signal = window.AbortSignal.any([request.signal, connection.signal])
      request.abort(index)
      expect(signal.reason).toBe(index)
    }
    expect(add).toHaveBeenCalledTimes(100)
    expect(remove).toHaveBeenCalledTimes(100)
    const removed = new Set(remove.mock.calls.map(call => call[1]))
    expect(add.mock.calls.every(call => removed.has(call[1]))).toBe(true)
  })

  it('cleans abandoned subscriptions when the combined signal is finalized', () => {
    const { window } = oldWebView()
    let finalize
    const registrations = new Map()
    window.FinalizationRegistry = class {
      constructor(callback) { finalize = callback }
      register(_target, heldValue, token) { registrations.set(token, heldValue) }
      unregister(token) { return registrations.delete(token) }
    }
    window.eval(WEBVIEW_BOOT_COMPATIBILITY_SCRIPT)
    const source = new window.AbortController(), remove = vi.spyOn(source.signal, 'removeEventListener')
    const combined = window.AbortSignal.any([source.signal])
    finalize(registrations.get(combined))
    expect(remove).toHaveBeenCalledTimes(1)
  })

  it('injects compatibility before the actual Host readiness gate and client scripts', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'eleckoi-webview-boot-'))
    cleanups.push(async () => {
      const path = relative(resolve(tmpdir()), resolve(directory))
      if (path === '' || path === '..' || path.startsWith('..' + sep)) throw new Error('Invalid temporary directory')
      await rm(directory, { recursive: true, force: true })
    })
    await mkdir(join(directory, 'assets'))
    await writeFile(join(directory, 'dsh.html'), '<link href="./assets/synthetic.css"><script src="./assets/synthetic.js"></script>')
    await writeFile(join(directory, 'assets/synthetic.css'), '')
    await writeFile(join(directory, 'assets/synthetic.js'), '')
    const ctx = new Context()
    cleanups.push(() => ctx.fiber.dispose())
    await ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 })
    await installWebClientAssets(ctx, directory)
    const html = '<!doctype html><html><head><script>globalThis.headDeferred = Promise.withResolvers()</script></head><body><script>__DSH_BOOT_READY__.promise.then(() => { const signal = AbortSignal.any([]); signal.throwIfAborted(); headDeferred.resolve(signal); globalThis.clientStarted = true })</script></body></html>'
    const rows = ctx.webServer.collectIndexInjections(await import('../../../tests/support/owner-peer.js').then(({ ownerPeer }) => ownerPeer(ctx)))
    const withoutCompatibility = renderIndexInjections(html, rows.filter(row => row.kind !== 'script'))
    const negative = oldWebView(withoutCompatibility, 'dangerously')
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(negative.window.clientStarted).toBeUndefined()
    expect(negative.errors.some(error => error.message.includes('withResolvers'))).toBe(true)
    const positive = oldWebView(ctx.webServer.renderIndex(html), 'dangerously')
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(positive.errors).toEqual([])
    expect(positive.window.clientStarted).toBe(true)
    expect(positive.window.__ELECKOI_CLIENT_PLATFORM__.kind).toBe('android')
    await expect(positive.window.headDeferred.promise).resolves.toBeInstanceOf(positive.window.AbortSignal)
  })
})
