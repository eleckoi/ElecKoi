const { app, BrowserWindow, nativeTheme, protocol, session, ipcMain } = require('electron')
const { spawn } = require('node:child_process')
const { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } = require('node:fs')
const { networkInterfaces, tmpdir } = require('node:os')
const { createServer } = require('node:net')
const { dirname, join, resolve } = require('node:path')

const Module = require('node:module')
const { buildSync } = Module.createRequire(require.resolve('vite'))('esbuild')
const documentPath = resolve('apps/desktop/src/main/platform/electron/dshClientDocument.ts')
const documentModule = new Module(documentPath, module)
documentModule.paths = module.paths
documentModule._compile(buildSync({
  entryPoints: [documentPath], bundle: true, write: false, platform: 'node', format: 'cjs',
  alias: { '@shared': resolve('packages/shared/src') }
}).outputFiles[0].text, documentPath)
const document = documentModule.exports
protocol.registerSchemesAsPrivileged([{ scheme: 'dsh-app', privileges: {
  standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true
} }])

const root = mkdtempSync(join(tmpdir(), 'eleckoi-dsh-client-'))
app.setPath('userData', root)
app.on('window-all-closed', () => {})
let failed = false
let host
let window
let protocolRegistered = false
const diagnostics = []

async function main() {
  const { DshDesktopPluginHost, resolveDshWebFrontendDirectory, ELECKOI_DESKTOP_BUNDLES } = await import('@eleckoi/desktop-host')
  const packageManager = {
    entryPath: join(dirname(require.resolve('pnpm')), 'bin', 'pnpm.mjs'),
    nodeBinPath: join(__dirname, '..', 'apps', 'desktop', 'resources', 'dsh', 'node-bin')
  }
  await app.whenReady()
  let remotePort
  if (process.env.ELECKOI_POCKET_PROBE_PACKAGE) {
    const { initProfile } = await import('@deepseek-ai/dsh-app-boot')
    const { PROFILE_TEMPLATES } = await import('@deepseek-ai/dsh-official-bundles')
    const profile = join(root, 'home', 'profiles', 'desktop')
    const packageDirectory = resolve(process.env.ELECKOI_POCKET_PROBE_PACKAGE)
    const metadata = JSON.parse(readFileSync(join(packageDirectory, 'package.json'), 'utf8'))
    if (metadata.name !== 'dsh-pocket') throw new Error('Unexpected remote plugin package')
    initProfile(profile, [...PROFILE_TEMPLATES.web.bundles, ...ELECKOI_DESKTOP_BUNDLES, metadata.name])
    cpSync(dirname(packageDirectory), join(profile, 'node_modules'), { recursive: true })
    const reservation = createServer()
    await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve))
    remotePort = reservation.address().port
    await new Promise(resolve => reservation.close(resolve))
    writeFileSync(join(profile, 'cordis.patch.yml'), JSON.stringify([{ id: 'dsh-pocket', config: { port: remotePort } }]))
  }
  if (process.env.ELECKOI_PLUGIN_CLIENT_THEME === 'dark') nativeTheme.themeSource = 'dark'
  host = new DshDesktopPluginHost({
    runtimeDataRoot: root,
    workspaceRoot: join(root, 'workspace'),
    productDatabasePath: join(root, 'product.sqlite'),
    productMediaRoot: join(root, 'media'),
    presetTemplatePath: resolve('apps/desktop/resources/dsh/agent-preset-template/agent.cordis.yml'),
    agentPatchPath: resolve('apps/desktop/resources/dsh/desktop-agent.patch.yml'),
    executablePath: process.execPath,
    packageManager,
    onDiagnostic: message => diagnostics.push(`host:${message}`)
  })
  const ready = await host.start()
  let browserUrl = ready.url
  if (remotePort) {
    const address = Object.values(networkInterfaces()).flat().find(row => row.family === 'IPv4' && !row.internal && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(row.address))?.address
    if (!address) throw new Error('The remote plugin probe needs a local network interface')
    const firstVisit = await fetch(`http://${address}:${remotePort}/?token=synthetic-invalid`)
    await firstVisit.body?.cancel()
    const lanToken = join(root, 'home', 'dsh-pocket', 'token-lan')
    const token = readFileSync(existsSync(lanToken) ? lanToken : join(root, 'home', 'dsh-pocket', 'token'), 'utf8').trim()
    browserUrl = `http://${address}:${remotePort}/?token=${encodeURIComponent(token)}`
  }
  const cookie = await document.authenticateDshClientHost(ready.url)
  protocol.handle('dsh-app', async request => {
    const url = new URL(request.url)
    if (document.isDshClientAsset(url.pathname)) return document.serveDshClientAsset(request, resolveDshWebFrontendDirectory())
    return document.forwardDshClientRequest(request, ready.url, cookie)
  })
  protocolRegistered = true
  ipcMain.handle('eleckoi:dsh-client-boot', () => ({ injections: ready.injections, streamBaseUrl: new URL(ready.url).origin }))
  ipcMain.handle('eleckoi:dsh-client-boot-failed', (_event, error) => diagnostics.push(error))
  ipcMain.handle('dsh-desktop:updates-status', () => ({ phase: 'disabled', currentVersion: app.getVersion(), availableVersion: null, releaseName: null, releaseNotes: null, releaseDate: null, downloadSizeBytes: null, progress: null, message: null }))
  session.defaultSession.webRequest.onBeforeSendHeaders({ urls: ['ws://127.0.0.1/*'] }, (details, callback) => {
    const headers = Object.fromEntries(Object.entries(details.requestHeaders).map(([key, value]) => [key.toLowerCase(), value]))
    callback({ requestHeaders: { ...headers, origin: new URL(ready.url).origin, cookie, 'sec-fetch-site': 'same-origin' } })
  })
  window = new BrowserWindow({
    width: 1280,
    height: 850,
    show: false,
    webPreferences: { ...(process.argv.includes('--browser') ? {} : { preload: resolve('apps/desktop/out/preload/preload.cjs') }), contextIsolation: true, nodeIntegration: false, sandbox: true, offscreen: true, backgroundThrottling: false }
  })
  window.webContents.on('console-message', details => {
    diagnostics.push(`console:${details.level}:${details.message}`)
  })
  window.webContents.on('did-fail-load', (_event, code, description, url) => {
    diagnostics.push(`load:${code}:${description}:${url}`)
  })
  let loadTimeout
  try {
    await Promise.race([
      window.loadURL(process.argv.includes('--browser') ? browserUrl : 'dsh-app://app/'),
      new Promise((_, reject) => { loadTimeout = setTimeout(() => reject(new Error('Client navigation timed out:\n' + diagnostics.slice(-30).join('\n'))), 40_000) })
    ])
  } finally { clearTimeout(loadTimeout) }
  const deadline = Date.now() + 30_000
  let navigationReady = false
  while (Date.now() < deadline) {
    navigationReady = await window.webContents.executeJavaScript(`Boolean(document.querySelector('button[aria-label="插件"], button[aria-label="Plugins"]'))`)
    if (navigationReady) break
    await new Promise(resolve => setTimeout(resolve, 300))
  }
  if (!navigationReady) {
    const body = await window.webContents.executeJavaScript('document.body.innerText')
    throw new Error(`DSH client did not show plugin navigation: ${body.slice(0, 1000)}\n${diagnostics.slice(-100).join('\n')}`)
  }
  if (process.argv.includes('--browser')) {
    const inputs = await window.webContents.executeJavaScript(`({ assets: globalThis.__ELECKOI_CLIENT_ASSETS__, preload: typeof globalThis.dshDesktopBoot })`)
    if (!inputs.assets?.script?.startsWith('/eleckoi/assets/') || inputs.preload !== 'undefined') {
      throw new Error('Browser product boot depends on desktop inputs: ' + JSON.stringify(inputs))
    }
  }
  await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('button')).find(button => button.getAttribute('aria-label') === '插件' || button.getAttribute('aria-label') === 'Plugins')?.click()`)
  let pluginPage = ''
  while (Date.now() < deadline) {
    pluginPage = await window.webContents.executeJavaScript('document.body.innerText')
    if (pluginPage.includes('添加插件') || pluginPage.includes('Add Plugin')) break
    await new Promise(resolve => setTimeout(resolve, 300))
  }
  if (!pluginPage.includes('添加插件') && !pluginPage.includes('Add Plugin')) {
    throw new Error(`DSH plugin center did not render: ${pluginPage.slice(0, 500)}`)
  }
  if (process.env.ELECKOI_PLUGIN_CLIENT_THEME === 'dark') {
    const dark = await window.webContents.executeJavaScript(`document.body.hasAttribute('data-ds-dark-theme')`)
    if (!dark) throw new Error('DSH plugin center did not follow the desktop dark mode.')
  }
  const waitFor = async (predicate, message) => {
    const expires = Date.now() + 15_000
    while (Date.now() < expires) {
      if (await window.webContents.executeJavaScript(predicate)) return
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    throw new Error(message)
  }
  if (process.argv.includes('--browser')) {
    const frames = []
    await waitFor(`Boolean(document.querySelector('[data-plugin-panel] [data-plugin-package]'))`, 'Browser plugin inventory did not finish loading')
    const remoteStatus = await window.webContents.executeJavaScript(`(async () => {
      const method = 'eleckoiSystem/status'
      const response = await fetch('/api/' + method, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'client-request', rpcId: 'synthetic-browser-check', method, payload: { args: {} } }) })
      const body = await response.json()
      if (!response.ok || body.result?.ok === false) throw new Error('Browser Remote call failed')
      return body.result.value ?? body.result
    })()`)
    if (remoteStatus.architecture !== 'dsh-remote') throw new Error('Browser did not reach the product Host')
    for (const width of [1280, 800, 390]) {
      window.setContentSize(width, 850)
      await window.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
      if (width === 390) {
        await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.side-panel-collapse-button, [data-sidebar-toggle]')).find(button => button.getBoundingClientRect().width > 0 && !button.closest('[inert]'))?.click()`)
        await waitFor(`document.querySelector('[data-plugin-panel]')?.getBoundingClientRect().width > 250`, 'Narrow browser sidebar did not close')
      }
      await waitFor(`Boolean(document.querySelector('[data-plugin-panel]'))`, 'Browser plugin page did not render')
      const frame = await window.webContents.executeJavaScript(`({ width: innerWidth, product: typeof globalThis.__ELECKOI_DSH_APP__, nativeControls: document.querySelectorAll('.window-controls').length, preload: typeof globalThis.dshDesktopBoot, overflow: document.documentElement.scrollWidth > innerWidth })`)
      if (Math.abs(frame.width - width) > 1 || frame.product !== 'function' || frame.nativeControls || frame.preload !== 'undefined') {
        throw new Error('Unexpected browser frame: ' + JSON.stringify(frame))
      }
      frames.push(frame)
      if (process.env.ELECKOI_BROWSER_PROBE_REPORT) writeFileSync(`${process.env.ELECKOI_BROWSER_PROBE_REPORT}-${width}.png`, (await window.webContents.capturePage()).toPNG())
    }
    await window.loadURL(new URL('/', browserUrl).href)
    await waitFor(`Boolean(document.querySelector('button[aria-label="插件"], button[aria-label="Plugins"]'))`, 'Browser cold navigation did not restore product UI')
    const unexpectedErrors = diagnostics.filter(message => message.startsWith('console:error:') || message.startsWith('load:'))
    if (unexpectedErrors.length) throw new Error(unexpectedErrors.join('\n'))
    if (process.env.ELECKOI_BROWSER_PROBE_REPORT) writeFileSync(process.env.ELECKOI_BROWSER_PROBE_REPORT + '.json', JSON.stringify({ remotePlugin: Boolean(remotePort), frames, remoteStatus, reopened: true, errors: unexpectedErrors }, null, 2))
    process.stdout.write((remotePort ? 'Remote plugin proxy' : 'HTTP browser') + ' without preload rendered product navigation and the official plugin center, then reopened successfully: ' + JSON.stringify(frames) + '\n')
    return
  }
  const pluginList = `Boolean(document.querySelector('[data-plugin-group="extensions"]'))`
  const backSelector = '[data-plugin-panel] header button[aria-label="返回插件"], [data-plugin-panel] header button[aria-label="Back to plugins"]'
  for (const width of [1280, 800]) {
    window.setContentSize(width, 850)
    await waitFor(pluginList, 'DSH official plugin catalog did not render.')
    const listControls = await window.webContents.executeJavaScript(`(() => {
      const group = document.querySelector('[data-plugin-group="extensions"]')
      const more = Array.from(group.querySelectorAll('button')).find(button => ['更多', 'More'].includes(button.innerText.trim()))
      const add = Array.from(document.querySelectorAll('button')).find(button => ['添加插件', 'Add Plugin'].includes(button.innerText.trim()))
      if (!more || !add) throw new Error('DSH official list controls are unavailable.')
      return { moreFont: getComputedStyle(more).fontSize, moreEndPadding: getComputedStyle(more).paddingInlineEnd,
        addHeight: add.getBoundingClientRect().height, addPadding: getComputedStyle(add).padding, addFont: getComputedStyle(add).fontSize }
    })()`)
    if (JSON.stringify(listControls) !== JSON.stringify({ moreFont: '14px', moreEndPadding: '0px', addHeight: 32, addPadding: '0px 12px', addFont: '13px' })) {
      throw new Error(`DSH official list control styles changed at ${width}px: ${JSON.stringify(listControls)}`)
    }
    await window.webContents.executeJavaScript(`(() => {
      const group = document.querySelector('[data-plugin-group="extensions"]')
      Array.from(group?.querySelectorAll('button') ?? []).find(button => ['更多', 'More'].includes(button.innerText.trim()))?.click()
    })()`)
    await waitFor(`Boolean(document.querySelector(${JSON.stringify(backSelector)}))`, 'DSH official experimental plugin back control did not render.')
    const result = await window.webContents.executeJavaScript(`(() => {
      const button = document.querySelector(${JSON.stringify(backSelector)})
      const svg = button.querySelector('svg')
      const buttonRect = button.getBoundingClientRect(), iconRect = svg.getBoundingClientRect()
      return { width: buttonRect.width, height: buttonRect.height, padding: getComputedStyle(button).padding,
        iconWidth: iconRect.width, iconHeight: iconRect.height,
        centered: Math.abs(buttonRect.left + buttonRect.width / 2 - iconRect.left - iconRect.width / 2) < 0.5 }
    })()`)
    if (JSON.stringify(result) !== JSON.stringify({ width: 28, height: 28, padding: '0px', iconWidth: 20, iconHeight: 20, centered: true })) {
      throw new Error(`DSH official back control was resized at ${width}px: ${JSON.stringify(result)}`)
    }
    if (width === 1280 && process.env.ELECKOI_PLUGIN_BACK_SCREENSHOT) {
      await window.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
      writeFileSync(process.env.ELECKOI_PLUGIN_BACK_SCREENSHOT, (await window.webContents.capturePage()).toPNG())
    }
    await window.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(backSelector)}).click()`)
    await waitFor(pluginList, 'DSH official back action did not return to the plugin list.')
  }
  window.setContentSize(1280, 850)
  for (const width of [1280, 800]) {
    window.setContentSize(width, 850)
    await window.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
    await window.webContents.executeJavaScript(`document.querySelector('[data-plugin-package="@deepseek-ai/dsh-experimental-agent-team-profile"] button')?.click()`)
    await waitFor(`Boolean(document.querySelector('[data-plugin-detail="@deepseek-ai/dsh-experimental-agent-team-profile"]'))`, 'Team detail did not open.')
    const report = await window.webContents.executeJavaScript(`(() => {
      const detail = document.querySelector('[data-plugin-detail="@deepseek-ai/dsh-experimental-agent-team-profile"]')
      const elements = { title: detail.querySelector('h3'), back: detail.querySelector('button[aria-label]'), icon: detail.querySelector('button[aria-label] svg') }
      const measure = () => Object.fromEntries(Object.entries(elements).map(([name, element]) => {
        const css = getComputedStyle(element), range = document.createRange()
        range.selectNodeContents(element)
        return [name, { fontSize: css.fontSize, fontFamily: css.fontFamily, fontWeight: css.fontWeight, lineHeight: css.lineHeight,
          ...(name === 'icon' ? { width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height } : { textWidth: range.getBoundingClientRect().width }) }]
      }))
      const local = measure()
      const sheet = document.querySelector('link[data-eleckoi-styles]').sheet
      try { sheet.disabled = true; return { local, official: measure() } }
      finally { sheet.disabled = false }
    })()`)
    if (JSON.stringify(report.local) !== JSON.stringify(report.official)) throw new Error(`Plugin detail typography differs from the official styles at ${width}px: ${JSON.stringify(report)}`)
    if (width === 1280 && process.env.ELECKOI_PLUGIN_DETAIL_SCREENSHOT) {
      await window.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
      writeFileSync(process.env.ELECKOI_PLUGIN_DETAIL_SCREENSHOT, (await window.webContents.capturePage()).toPNG())
    }
    await window.webContents.executeJavaScript(`document.querySelector('[data-plugin-detail="@deepseek-ai/dsh-experimental-agent-team-profile"] button[aria-label]').click()`)
    await waitFor(pluginList, 'Plugin detail did not return to its list.')
  }
  window.setContentSize(1280, 850)
  process.stdout.write('Plugin detail back label, icon and title match the official font, size, weight and text width at 1280px and 800px.\n')
  process.stdout.write('DSH official back arrow is 20px in its 28px control, list action styles and return navigation passed at 1280px and 800px.\n')
  const actionDeadline = Date.now() + 15_000
  let addEnabled = false
  while (Date.now() < actionDeadline) {
    addEnabled = await window.webContents.executeJavaScript(`Boolean(Array.from(document.querySelectorAll('button')).find(button => (button.innerText.trim() === '添加插件' || button.innerText.trim() === 'Add Plugin') && !button.disabled))`)
    if (addEnabled) break
    await new Promise(resolve => setTimeout(resolve, 300))
  }
  if (!addEnabled) throw new Error('DSH add-plugin button remained disabled.')
  await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('button')).find(button => button.innerText.trim() === '添加插件' || button.innerText.trim() === 'Add Plugin').click()`)
  let installDialog = ''
  while (Date.now() < actionDeadline) {
    installDialog = await window.webContents.executeJavaScript('document.body.innerText')
    if ((installDialog.includes('插件安装引导') || installDialog.includes('Plugin installation guide'))
      && (installDialog.includes('安装源') || installDialog.includes('Registry'))) break
    await new Promise(resolve => setTimeout(resolve, 300))
  }
  if ((!installDialog.includes('插件安装引导') && !installDialog.includes('Plugin installation guide'))
    || (!installDialog.includes('安装源') && !installDialog.includes('Registry'))) {
    throw new Error(`DSH add-plugin dialog did not include guide and package source: ${installDialog.slice(0, 500)}`)
  }
  const installSpec = process.env.ELECKOI_PLUGIN_CLIENT_INSTALL_SPEC
  if (installSpec) {
    const bundle = installSpec.replace(/@[^@/]+$/, '')
    const entered = await window.webContents.executeJavaScript(`(() => {
      const input = document.querySelector('input[aria-label="包名或地址"], input[aria-label="Package name or address"]')
      if (!input) return false
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(installSpec)})
      input.dispatchEvent(new Event('input', { bubbles: true }))
      return true
    })()`)
    if (!entered) throw new Error('DSH add-plugin input is unavailable.')
    await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('button')).find(button => button.innerText.trim() === '安装' || button.innerText.trim() === 'Install')?.click()`)
    const installDeadline = Date.now() + 90_000
    let phase = ''
    while (Date.now() < installDeadline) {
      phase = await window.webContents.executeJavaScript(`document.querySelector('[data-install-phase]')?.getAttribute('data-install-phase') ?? ''`)
      if (phase === 'done' || phase === 'failed') break
      await new Promise(resolve => setTimeout(resolve, 300))
    }
    if (phase !== 'done') throw new Error(`DSH UI plugin install ended in phase ${phase}: ${(await window.webContents.executeJavaScript('document.body.innerText')).slice(-1000)}`)
    await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('button')).find(button => button.innerText.trim() === '立即启用' || button.innerText.trim() === 'Enable now')?.click()`)
    while (Date.now() < installDeadline) {
      const found = await window.webContents.executeJavaScript(`Boolean(document.querySelector('[data-plugin-package="${bundle}"]'))`)
      if (found) break
      await new Promise(resolve => setTimeout(resolve, 300))
    }
    const opened = await window.webContents.executeJavaScript(`(() => {
      const card = document.querySelector('[data-plugin-package="${bundle}"]')
      const button = card?.querySelector('button')
      button?.click()
      return Boolean(button)
    })()`)
    if (!opened) throw new Error(`Installed plugin card ${bundle} is unavailable.`)
    const detail = await window.webContents.executeJavaScript(`Boolean(document.querySelector('[data-plugin-detail="${bundle}"]'))`)
    if (!detail) throw new Error(`Installed plugin detail ${bundle} is unavailable.`)
    await window.webContents.executeJavaScript(`document.querySelector('[data-plugin-detail="${bundle}"] button[aria-label^="卸载"], [data-plugin-detail="${bundle}"] button[aria-label^="Uninstall"]')?.click()`)
    const confirmed = await window.webContents.executeJavaScript(`(() => {
      const dialog = Array.from(document.querySelectorAll('[role="dialog"]')).at(-1)
      const button = Array.from(dialog?.querySelectorAll('button') ?? []).find(row => row.innerText.trim() === '卸载' || row.innerText.trim() === 'Uninstall')
      button?.click()
      return Boolean(button)
    })()`)
    if (!confirmed) throw new Error('DSH uninstall confirmation is unavailable.')
    while (Date.now() < installDeadline) {
      const found = await window.webContents.executeJavaScript(`Boolean(document.querySelector('[data-plugin-package="${bundle}"]'))`)
      if (!found) break
      await new Promise(resolve => setTimeout(resolve, 300))
    }
    const remained = await window.webContents.executeJavaScript(`Boolean(document.querySelector('[data-plugin-package="${bundle}"]'))`)
    if (remained) throw new Error(`DSH UI did not remove ${bundle}.`)
    process.stdout.write(`DSH official client installed, enabled and uninstalled ${bundle} through its UI.\n`)
  }
  if (!installSpec) {
    const closed = await window.webContents.executeJavaScript(`(() => {
      const close = document.querySelector('[role="dialog"] button[aria-label="关闭"], [role="dialog"] button[aria-label="Close"]')
      close?.click()
      return Boolean(close)
    })()`)
    if (!closed) throw new Error('Add-plugin dialog close control is unavailable.')
    const closeDeadline = Date.now() + 5_000
    while (Date.now() < closeDeadline) {
      if (!await window.webContents.executeJavaScript(`Boolean(document.querySelector('[role="dialog"]'))`)) break
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    if (await window.webContents.executeJavaScript(`Boolean(document.querySelector('[role="dialog"]'))`)) throw new Error('Add-plugin dialog remained open.')
  }
  const configOpened = await window.webContents.executeJavaScript(`(() => {
    const card = document.querySelector('[data-plugin-item="web-search"]')
    const button = card?.querySelector('button')
    button?.click()
    return Boolean(button)
  })()`)
  if (!configOpened) throw new Error('DSH official plugin configuration entry is unavailable.')
  const webDeadline = Date.now() + 15_000
  let configured = false
  while (Date.now() < webDeadline) {
    configured = await window.webContents.executeJavaScript(`Boolean(document.querySelector('[data-plugin-item-detail="web-search"] #plugin-config-web-search-max-uses'))`)
    if (configured) break
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  if (!configured) throw new Error('DSH official Messages search configuration page did not render.')
  const switched = await window.webContents.executeJavaScript(`(() => {
    const control = document.querySelector('[role="switch"][aria-label="启用新版 Web 搜索 API"], [role="switch"][aria-label="Use the new Web Search API"]')
    control?.click()
    return Boolean(control && !control.disabled)
  })()`)
  if (!switched) throw new Error('DSH official Search API switch is unavailable.')
  configured = false
  while (Date.now() < webDeadline) {
    configured = await window.webContents.executeJavaScript(`Boolean(document.querySelector('[data-plugin-item-detail="web-search"] #plugin-config-web-search-count'))`)
    if (configured) break
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  if (!configured) throw new Error('DSH official Search API settings did not replace the Messages fields.')
  const screenshotPath = process.env.ELECKOI_PLUGIN_CLIENT_SCREENSHOT
  if (screenshotPath) {
    await window.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
    writeFileSync(screenshotPath, (await window.webContents.capturePage()).toPNG())
  }
  process.stdout.write('DSH official client rendered plugin navigation, add dialog, guide, package source and configuration in Electron.\n')
}

main().catch(error => {
  process.stderr.write(`${error.stack ?? error}\n${diagnostics.slice(-100).join('\\n')}\\n`)
  failed = true
}).finally(async () => {
  try {
    if (window && !window.isDestroyed()) await window.loadURL('about:blank')
    window?.destroy()
    await host?.close()
    if (protocolRegistered) protocol.unhandle('dsh-app')
  } finally {
    const cleaner = spawn(process.execPath, ['-e', `(${cleanupAfterExit.toString()})()`, String(process.pid), root], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, detached: true, windowsHide: true, stdio: 'ignore'
    })
    cleaner.unref()
    app.exit(failed ? 1 : 0)
  }
})

async function cleanupAfterExit() {
  const { resolve, sep, basename } = require('node:path')
  const target = resolve(process.argv[2])
  if (!target.startsWith(resolve(require('node:os').tmpdir()) + sep) || !basename(target).startsWith('eleckoi-dsh-client-')) return
  const pid = Number(process.argv[1])
  for (let attempt = 0; attempt < 300; attempt += 1) {
    try { process.kill(pid, 0) } catch (error) {
      if (error.code === 'ESRCH') require('node:fs').rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
      return
    }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
}
