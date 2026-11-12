import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'

const facade = readFileSync(new URL('../app/src/main/assets/platform-facade.js', import.meta.url), 'utf8')
function clientPage() {
  const page = new JSDOM('<!doctype html><html><body><div id="root" data-dsh-boot><div><div>HARNESS</div><div data-dsh-boot-spinner></div><div>Loading plugins…</div></div></div></body></html>', {
    url: 'http://127.0.0.1:12345/', runScripts: 'outside-only', pretendToBeVisual: true
  })
  const ready = [], failures = [], appearances = []
  page.window.matchMedia = () => ({ matches: true })
  page.window.HTMLCanvasElement.prototype.getContext = () => {
    let fill = '#000000', pixel = [0, 0, 0, 0]
    const color = value => value.startsWith('#') ? [...value.slice(1).match(/../g).map(byte => parseInt(byte, 16)), 1]
      : [...value.match(/[\d.]+/g).map(Number)]
    return {
      set fillStyle(value) { fill = value }, get fillStyle() { return fill }, globalAlpha: 1,
      clearRect() { pixel = [0, 0, 0, 0] },
      fillRect() {
        const [r, g, b, a = 1] = color(fill)
        const alpha = a * this.globalAlpha
        pixel = [r, g, b].map((value, index) => value * alpha + pixel[index] * (1 - alpha)).concat(255)
      },
      getImageData() { return { data: new Uint8ClampedArray(pixel) } }
    }
  }
  page.window.ElecKoiAndroid = {
    clientReady: url => ready.push(url), clientFailed: (url, message) => failures.push({ url, message }),
    appearance: (mode, surface) => appearances.push({ mode, surface })
  }
  page.window.eval(facade)
  return { page, ready, failures, appearances }
}
const paint = window => new Promise(resolve => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)))
function mountSurface(window, surface) {
  const appRoot = window.document.createElement('div')
  appRoot.id = 'eleckoi-root'
  appRoot.style.setProperty('--surface-raised', surface)
  const mobileWindow = window.document.createElement('main')
  mobileWindow.className = 'mobile-shell'
  mobileWindow.style.setProperty('--mobile-system-bar-bg', surface)
  appRoot.append(mobileWindow)
  window.document.body.append(appRoot)
  return appRoot
}

describe('Android startup admission', () => {
  it('reports readiness only after the actual application replaces the official boot page', async () => {
    const { page, ready, failures } = clientPage()
    try {
      const { window } = page
      await paint(window)
      expect(ready).toEqual([])
      window.document.body.innerHTML = '<div id="eleckoi-root"><main class="main-window-shell"></main></div>'
      await new Promise(resolve => setTimeout(resolve, 60))
      expect(ready).toEqual(['http://127.0.0.1:12345/'])
      window.eval(facade)
      window.document.body.appendChild(window.document.createElement('div'))
      await paint(window)
      expect(ready).toHaveLength(1)
      expect(failures).toEqual([])
    } finally { page.window.close() }
  })
  it('reports the real root failure instead of hiding it behind an endless animation', async () => {
    const { page, ready, failures } = clientPage()
    try {
      page.window.document.body.innerHTML = '<div data-slot-error="root">Required client service is unavailable</div>'
      await paint(page.window)
      expect(ready).toEqual([])
      expect(failures).toEqual([{ url: 'http://127.0.0.1:12345/', message: 'Required client service is unavailable' }])
    } finally { page.window.close() }
  })
  it('reveals the official plugin failure report while the native progress covers boot', async () => {
    const { page, ready, failures } = clientPage()
    try {
      const boot = page.window.document.querySelector('[data-dsh-boot]')
      const card = boot.firstElementChild
      card.replaceChildren(card.firstElementChild)
      const report = page.window.document.createElement('div')
      report.textContent = 'Failed to load plugins: synthetic-client. Synthetic dependency unavailable.'
      card.append(report)
      await paint(page.window)
      expect(ready).toEqual([])
      expect(failures).toEqual([{ url: 'http://127.0.0.1:12345/', message: 'HARNESSFailed to load plugins: synthetic-client. Synthetic dependency unavailable.' }])
    } finally { page.window.close() }
  })
  it('waits for the real application palette instead of selecting a dark phone theme', async () => {
    const { page, appearances } = clientPage()
    try {
      const { window } = page
      await paint(window)
      expect(appearances).toEqual([])
      window.document.documentElement.dataset.theme = 'light'
      await paint(window)
      expect(appearances).toEqual([])
      mountSurface(window, '#ffffff')
      await paint(window)
      expect(appearances).toEqual([{ mode: 'light', surface: '#ffffff' }])
    } finally { page.window.close() }
  })
  it('follows actual application theme changes and does not resend an unchanged palette', async () => {
    const { page, appearances } = clientPage()
    try {
      const { window } = page
      const appRoot = mountSurface(window, '#232324')
      window.document.documentElement.style.setProperty('--shell-backdrop', '#151517')
      window.document.documentElement.dataset.theme = 'dark'
      await paint(window)
      window.document.documentElement.style.setProperty('--shell-backdrop', '#191919')
      await paint(window)
      expect(appearances).toEqual([{ mode: 'dark', surface: '#232324' }])
      window.document.documentElement.dataset.theme = 'light'
      appRoot.style.setProperty('--surface-raised', '#ffffff')
      appRoot.firstElementChild.style.setProperty('--mobile-system-bar-bg', '#ffffff')
      window.document.documentElement.style.setProperty('--shell-backdrop', '#f5f5f5')
      await paint(window)
      expect(appearances).toEqual([
        { mode: 'dark', surface: '#232324' },
        { mode: 'light', surface: '#ffffff' }
      ])
    } finally { page.window.close() }
  })
  it('tracks the app surface palette while the same dark mode remains active', async () => {
    const { page, appearances } = clientPage()
    try {
      const { window } = page
      window.document.documentElement.dataset.theme = 'dark'
      const appRoot = mountSurface(window, '#232324')
      await paint(window)
      appRoot.firstElementChild.style.setProperty('--mobile-system-bar-bg', '#29292b')
      await paint(window)
      expect(appearances).toEqual([
        { mode: 'dark', surface: '#232324' },
        { mode: 'dark', surface: '#29292b' }
      ])
    } finally { page.window.close() }
  })
  it('syncs drawer, settings and rightbar changes without observing streaming message children', async () => {
    const { page, appearances } = clientPage()
    try {
      const { window } = page
      window.document.documentElement.dataset.theme = 'light'
      const appRoot = mountSurface(window, '#ffffff')
      const mobileWindow = appRoot.firstElementChild
      const computedStyle = window.getComputedStyle.bind(window)
      window.getComputedStyle = element => element === mobileWindow ? {
        getPropertyValue: name => name === '--mobile-system-bar-bg'
          ? mobileWindow.dataset.drawerPresent === 'true' || (mobileWindow.dataset.mobilePanel === 'settings' && mobileWindow.dataset.mobileRightbar !== 'true')
            ? '#f9fafb' : '#ffffff'
          : computedStyle(element).getPropertyValue(name)
      } : computedStyle(element)
      await paint(window)
      mobileWindow.dataset.drawerPresent = 'true'
      await paint(window)
      mobileWindow.dataset.mobilePanel = 'settings'
      mobileWindow.dataset.drawerPresent = 'false'
      await paint(window)
      expect(appearances).toEqual([{ mode: 'light', surface: '#ffffff' }, { mode: 'light', surface: '#f9fafb' }])
      const before = appearances.length
      for (let index = 0; index < 40; index++) mobileWindow.append(window.document.createElement('p'))
      await paint(window)
      expect(appearances).toHaveLength(before)
      mobileWindow.dataset.mobileRightbar = 'true'
      await paint(window)
      mobileWindow.dataset.mobileRightbar = 'false'
      await paint(window)
      mobileWindow.dataset.mobilePanel = 'messages'
      await paint(window)
      expect(appearances.slice(-3)).toEqual([
        { mode: 'light', surface: '#ffffff' }, { mode: 'light', surface: '#f9fafb' }, { mode: 'light', surface: '#ffffff' }
      ])
    } finally { page.window.close() }
  })
  it('updates the system bars when model routes change within the same panel, including dark themes', async () => {
    const { page, appearances } = clientPage()
    try {
      const { window } = page
      window.document.documentElement.dataset.theme = 'light'
      const mobileWindow = mountSurface(window, '#ffffff').firstElementChild
      mobileWindow.dataset.mobilePanel = 'model'
      mobileWindow.dataset.mobileRoute = 'root'
      const computedStyle = window.getComputedStyle.bind(window)
      window.getComputedStyle = element => element === mobileWindow ? {
        getPropertyValue: name => name === '--mobile-system-bar-bg'
          ? window.document.documentElement.dataset.theme === 'dark'
            ? mobileWindow.dataset.mobileRoute === 'model-editor' ? '#1a1b1e' : '#232324'
            : mobileWindow.dataset.mobileRoute === 'model-editor' ? '#f9fafb' : '#ffffff'
          : computedStyle(element).getPropertyValue(name)
      } : computedStyle(element)
      await paint(window)
      mobileWindow.dataset.mobileRoute = 'model-editor'
      await paint(window)
      expect(appearances.at(-1)).toEqual({ mode: 'light', surface: '#f9fafb' })
      mobileWindow.dataset.mobileRoute = 'root'
      await paint(window)
      expect(appearances.at(-1)).toEqual({ mode: 'light', surface: '#ffffff' })
      window.document.documentElement.dataset.theme = 'dark'
      await paint(window)
      mobileWindow.dataset.mobileRoute = 'model-editor'
      await paint(window)
      expect(appearances.at(-1)).toEqual({ mode: 'dark', surface: '#1a1b1e' })
      mobileWindow.dataset.mobileRoute = 'root'
      await paint(window)
      expect(appearances.at(-1)).toEqual({ mode: 'dark', surface: '#232324' })
    } finally { page.window.close() }
  })
  it('composites official pseudo-element masks and nested product masks, restoring the surviving page color', async () => {
    const { page, appearances } = clientPage()
    try {
      const { window } = page
      window.document.documentElement.dataset.theme = 'light'
      const root = mountSurface(window, '#ffffff')
      const original = window.getComputedStyle.bind(window)
      const official = window.document.createElement('div')
      official.style.zIndex = '1000'
      const product = window.document.createElement('div')
      product.style.backgroundColor = 'rgba(0, 0, 0, 0.5)'; product.style.zIndex = '1200'
      window.getComputedStyle = (element, pseudo) => pseudo === '::after' && element === official
        ? { backgroundColor: 'rgba(0, 0, 0, 0.25)', opacity: '1' } : original(element)
      window.document.body.append(official, product)
      const notify = (mask, pseudo, active) => window.document.dispatchEvent(new window.CustomEvent('eleckoi:system-bar-mask', { detail: { mask, pseudo, active } }))
      await paint(window)
      notify(official, '::after', true)
      await paint(window)
      expect(appearances.at(-1)).toEqual({ mode: 'light', surface: '#bfbfbf' })
      notify(product, '', true)
      await paint(window)
      expect(appearances.at(-1)).toEqual({ mode: 'light', surface: '#606060' })
      notify(product, '', false)
      await paint(window)
      expect(appearances.at(-1)).toEqual({ mode: 'light', surface: '#bfbfbf' })
      window.document.documentElement.dataset.theme = 'dark'
      root.firstElementChild.style.setProperty('--mobile-system-bar-bg', '#202020')
      await paint(window)
      expect(appearances.at(-1)).toEqual({ mode: 'dark', surface: '#181818' })
      notify(official, '::after', false)
      await paint(window)
      expect(appearances.at(-1)).toEqual({ mode: 'dark', surface: '#202020' })
    } finally { page.window.close() }
  })
  it('paints a declared full-height drawer surface into the native bars and restores its scrim on closing', async () => {
    const { page, appearances } = clientPage()
    try {
      const { window } = page
      window.document.documentElement.dataset.theme = 'light'
      mountSurface(window, '#ffffff')
      const mask = window.document.createElement('div')
      mask.style.backgroundColor = 'rgba(0,0,0,0.3)'
      const surface = window.document.createElement('section')
      surface.style.backgroundColor = '#ffffff'
      mask.append(surface); window.document.body.append(mask)
      await paint(window)
      const notify = (active, declaredSurface) => window.document.dispatchEvent(new window.CustomEvent('eleckoi:system-bar-mask', {
        detail: { mask, pseudo: '', surface: declaredSurface, active }
      }))
      notify(true)
      await paint(window)
      expect(appearances.at(-1).surface).not.toBe('#ffffff')
      notify(true, surface)
      await paint(window)
      expect(appearances.at(-1).surface).toBe('#ffffff')
      surface.style.backgroundColor = '#202020'
      window.document.documentElement.dataset.theme = 'dark'
      await paint(window)
      expect(appearances.at(-1)).toEqual({ mode: 'dark', surface: '#202020' })
      notify(false, surface)
      await paint(window)
      expect(appearances.at(-1).surface).toBe('#ffffff')
    } finally { page.window.close() }
  })
  it('coalesces mask registration and avoids rescanning appearance for unrelated body portals', async () => {
    const { page, appearances } = clientPage()
    try {
      const { window } = page
      window.document.documentElement.dataset.theme = 'light'
      mountSurface(window, '#ffffff')
      const mask = window.document.createElement('div')
      mask.style.backgroundColor = 'rgba(0,0,0,0.5)'
      mask.setAttribute('role', 'presentation')
      const surface = window.document.createElement('section')
      surface.setAttribute('role', 'dialog'); surface.setAttribute('aria-modal', 'true')
      mask.append(surface)
      mask.getAnimations = options => { expect(options?.subtree).not.toBe(true); return [] }
      window.document.body.append(mask)
      await paint(window)
      const original = window.getComputedStyle.bind(window)
      let reads = 0
      window.getComputedStyle = (...args) => { reads++; return original(...args) }
      const notify = active => window.document.dispatchEvent(new window.CustomEvent('eleckoi:system-bar-mask', {
        detail: { mask, pseudo: '', active }
      }))
      notify(true); notify(true)
      expect(reads).toBe(0)
      await paint(window)
      expect(appearances.at(-1)).toEqual({ mode: 'light', surface: '#808080' })
      reads = 0
      const portal = window.document.createElement('div')
      window.document.body.append(portal)
      await paint(window)
      portal.remove()
      await paint(window)
      expect(reads).toBe(0)
      notify(false)
      await paint(window)
      expect(appearances.at(-1)).toEqual({ mode: 'light', surface: '#ffffff' })
    } finally { page.window.close() }
  })
  it('tracks official body portals through mount, color changes and removal', async () => {
    const { page, appearances } = clientPage()
    try {
      const { window } = page
      window.document.documentElement.dataset.theme = 'light'
      mountSurface(window, '#ffffff')
      await paint(window)
      const portal = window.document.createElement('div')
      portal.setAttribute('role', 'presentation'); portal.style.cssText = 'position:fixed;inset:0;z-index:1000'
      const mask = window.document.createElement('div')
      mask.setAttribute('aria-hidden', 'true'); mask.style.cssText = 'position:absolute;inset:0'
      const dialog = window.document.createElement('section')
      dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true')
      portal.append(mask, dialog)
      const original = window.getComputedStyle.bind(window)
      let opacity = '0.5'
      window.getComputedStyle = (element, pseudo) => element === mask && pseudo === '::after'
        ? { display: 'block', visibility: 'visible', backgroundColor: 'rgba(0,0,0,1)', opacity } : original(element, pseudo)
      window.document.body.append(portal)
      await paint(window)
      expect(appearances.at(-1)).toEqual({ mode: 'light', surface: '#808080' })
      opacity = '0.25'; mask.className = 'closing'
      await paint(window)
      expect(appearances.at(-1)).toEqual({ mode: 'light', surface: '#bfbfbf' })
      portal.remove()
      await paint(window)
      expect(appearances.at(-1)).toEqual({ mode: 'light', surface: '#ffffff' })
    } finally { page.window.close() }
  })
  it('sends rasterized sRGB bytes even when Canvas serializes a CSS Color 4 value', async () => {
    const page = new JSDOM('<!doctype html><html data-theme="light"><body><div id="eleckoi-root"><main class="mobile-shell" style="--mobile-system-bar-bg:color(srgb .7 .7 .7)"></main></div></body></html>', { runScripts: 'outside-only' })
    try {
      const appearances = []
      page.window.HTMLCanvasElement.prototype.getContext = () => ({
        fillStyle: 'color(srgb .7 .7 .7)', clearRect() {}, fillRect() {},
        getImageData: () => ({ data: new Uint8ClampedArray([179, 179, 179, 255]) })
      })
      page.window.ElecKoiAndroid = { appearance: (mode, surface) => appearances.push({ mode, surface }) }
      page.window.eval(facade)
      expect(appearances).toEqual([{ mode: 'light', surface: '#b3b3b3' }])
    } finally { page.window.close() }
  })
})
