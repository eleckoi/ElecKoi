const { app, BrowserWindow, ipcMain, nativeTheme, protocol, session, webFrameMain } = require('electron')
const { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { dirname, join, resolve } = require('node:path')
const { spawn } = require('node:child_process')
const { createServer } = require('node:http')
const Module = require('node:module')
const { buildSync } = Module.createRequire(require.resolve('vite'))('esbuild')
app.on('window-all-closed', () => {})

// 主进程源用 `@shared` 别名（vite / tsconfig），而本探针在 Electron 里裸加载、没有别名解析器；
// 所以先按同一别名打包再 `_compile`，与 probe-dsh-desktop-plugin-host.mjs、
// probe-local-media-crop.cjs 同一手法。
const documentPath = resolve('apps/desktop/src/main/platform/electron/dshClientDocument.ts')
const documentModule = new Module(documentPath, module)
documentModule.paths = module.paths
documentModule._compile(buildSync({
  entryPoints: [documentPath], bundle: true, write: false, platform: 'node', format: 'cjs',
  alias: { '@shared': resolve('packages/shared/src') },
}).outputFiles[0].text, documentPath)
const document = documentModule.exports
protocol.registerSchemesAsPrivileged([{ scheme: 'dsh-app', privileges: {
  standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true,
} }])
const root = mkdtempSync(join(tmpdir(), 'eleckoi-client-probe-'))
app.setPath('userData', root)
const errors = []
let host
let window
let failed = false
let modelServer
let modelRequests = 0
let workspaceIsolationSetup = false
let updateProbe
let disposeNative
const { loadNativeModule, installProbeDesktopNative } = require('./probe-desktop-native.cjs')
const { DesktopUpdateOverlays } = loadNativeModule('apps/desktop/src/main/platform/electron/dsh/update-overlay.ts')
const updateOverlays = new DesktopUpdateOverlays()
const modelBodies = []
const nativeAuthorMode = process.argv.includes('--native-author')
const pluginCreationMode = process.argv.includes('--plugin-creation-check')
const chatOnlyMode = process.argv.includes('--chat-only')
const processDialogMode = process.argv.includes('--process-dialog-check')
const roleplayToolMode = process.argv.includes('--roleplay-tools-check')
const toolScenario = roleplayToolMode ? require('./probe-roleplay-tool-results.cjs') : null
const subagentNavigationMode = processDialogMode || process.argv.includes('--subagent-navigation-check')
async function main() {
  const { DshDesktopPluginHost, resolveDshWebFrontendDirectory, ELECKOI_DESKTOP_BUNDLES, registerDesktopBundles } = await import('@eleckoi/desktop-host')
  const { initProfile, readProfileManifest, writeProfileBundles } = await import('@deepseek-ai/dsh-app-boot')
  const { OPTIONAL_BUNDLES, PROFILE_TEMPLATES } = await import('@deepseek-ai/dsh-official-bundles')
  await app.whenReady()
  modelServer = createServer((_request, response) => {
    if (nativeAuthorMode || roleplayToolMode || pluginCreationMode) {
      let body = ''
      _request.setEncoding('utf8')
      _request.on('data', chunk => { body += chunk })
      _request.on('end', () => { modelBodies.push(JSON.parse(body)) })
    }
    modelRequests += 1
    if (pluginCreationMode && !workspaceIsolationSetup && modelRequests <= 3) {
      const calls = [
        ['skill', { name: 'eleckoi-plugin-development' }],
        ['skill', { name: 'cordis-plugin-development' }],
        ['read', { file_path: join(dirname(require.resolve('@eleckoi/dsh-client-shell/package.json')), 'skills/eleckoi-plugin-development/references/services.md') }],
      ]
      const [name, args] = calls[modelRequests - 1]
      const item = { id: `plugin-call-${modelRequests}`, type: 'function_call', call_id: `plugin-call-${modelRequests}`, name, arguments: JSON.stringify(args) }
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      const events = [
        { type: 'response.created', response: { id: `plugin-${modelRequests}`, model: 'example-model', status: 'in_progress', output: [] } },
        { type: 'response.output_item.added', output_index: 0, item: { ...item, arguments: '' } },
        { type: 'response.function_call_arguments.delta', output_index: 0, item_id: item.id, delta: item.arguments },
        { type: 'response.output_item.done', output_index: 0, item },
        { type: 'response.completed', response: { id: `plugin-${modelRequests}`, model: 'example-model', status: 'completed', output: [item], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } },
      ]
      response.end(events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''))
      return
    }
    if (roleplayToolMode && modelRequests === 1) {
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      const output = toolScenario.calls
      const events = [{ type: 'response.created', response: { id: 'tool-probe', model: 'example-model', status: 'in_progress', output: [] } }]
      output.forEach((item, index) => events.push(
        { type: 'response.output_item.added', output_index: index, item: { ...item, arguments: '' } },
        { type: 'response.function_call_arguments.delta', output_index: index, item_id: item.id, delta: item.arguments },
        { type: 'response.output_item.done', output_index: index, item }))
      events.push({ type: 'response.completed', response: { id: 'tool-probe', model: 'example-model', status: 'completed', output, usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } })
      response.end(events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''))
      return
    }
    if (subagentNavigationMode && modelRequests === 1) {
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      const item = { id: 'synthetic-delegation', type: 'function_call', call_id: 'synthetic-delegation', name: 'subagent',
        arguments: JSON.stringify({ description: 'Synthetic child task', prompt: 'Return a synthetic greeting.' }) }
      const toolIndex = processDialogMode ? 1 : 0
      const reasoning = { id: 'synthetic-reasoning', type: 'reasoning', summary: [{ type: 'summary_text', text: 'Synthetic delegation reasoning.' }] }
      const events = [
        { type: 'response.created', response: { id: 'synthetic-response', model: 'example-model', status: 'in_progress', output: [] } },
        ...(processDialogMode ? [
          { type: 'response.output_item.added', output_index: 0, item: { ...reasoning, summary: [] } },
          { type: 'response.reasoning_summary_part.added', output_index: 0, item_id: reasoning.id, summary_index: 0, part: { type: 'summary_text', text: '' } },
          { type: 'response.reasoning_summary_text.delta', output_index: 0, item_id: reasoning.id, summary_index: 0, delta: reasoning.summary[0].text },
          { type: 'response.output_item.done', output_index: 0, item: reasoning },
        ] : []),
        { type: 'response.output_item.added', output_index: toolIndex, item: { ...item, arguments: '' } },
        { type: 'response.function_call_arguments.delta', output_index: toolIndex, item_id: item.id, delta: item.arguments },
        { type: 'response.output_item.done', output_index: toolIndex, item },
        { type: 'response.completed', response: { id: 'synthetic-response', model: 'example-model', status: 'completed', output: [...(processDialogMode ? [reasoning] : []), item], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } },
      ]
      response.end(events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''))
      return
    }
    if (workspaceIsolationSetup || nativeAuthorMode || subagentNavigationMode || modelRequests > 1) {
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      let text = nativeAuthorMode ? 'Synthetic native reply' : modelRequests === 2 ? 'Synthetic recovered reply' : `Synthetic regenerated reply ${modelRequests}`
      if (chatOnlyMode && process.argv.includes('--handoff-check')) {
        text += '\n\n```html\n<!doctype html><html><body style="margin:0"><section style="height:240px;background:#123456;color:white">Synthetic rich card</section></body></html>\n```'
      }
      const item = { id: 'synthetic-message', type: 'message', role: 'assistant', content: [] }
      const finalReasoning = { id: 'synthetic-final-reasoning', type: 'reasoning', summary: [{ type: 'summary_text', text: 'Synthetic final reasoning.' }] }
      const messageIndex = processDialogMode ? 1 : 0
      const events = [
        { type: 'response.created', response: { id: 'synthetic-response', model: 'example-model', status: 'in_progress', output: [] } },
        ...(processDialogMode ? [{ type: 'response.output_item.added', output_index: 0, item: finalReasoning },
          { type: 'response.output_item.done', output_index: 0, item: finalReasoning }] : []),
        { type: 'response.output_item.added', output_index: messageIndex, item },
        { type: 'response.content_part.added', output_index: messageIndex, content_index: 0, item_id: item.id, part: { type: 'output_text', text: '', annotations: [] } },
        { type: 'response.output_text.delta', output_index: messageIndex, content_index: 0, item_id: item.id, delta: text },
        { type: 'response.completed', response: { id: 'synthetic-response', model: 'example-model', status: 'completed',
          output: [...(processDialogMode ? [finalReasoning] : []), { ...item, status: 'completed', content: [{ type: 'output_text', text, annotations: [] }] }], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } },
      ]
      const payload = events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join('')
      if (modelRequests > 2) setTimeout(() => response.end(payload), 600)
      else response.end(payload)
      return
    }
    response.writeHead(402, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ error: { message: 'Synthetic payment rejection' } }))
  })
  await new Promise(resolve => modelServer.listen(0, '127.0.0.1', resolve))
  const endpoint = `http://127.0.0.1:${modelServer.address().port}/v1`
  if (nativeAuthorMode || chatOnlyMode || pluginCreationMode) {
    const profile = join(root, 'home', 'profiles', 'desktop')
    initProfile(profile, [...PROFILE_TEMPLATES.web.bundles, ...ELECKOI_DESKTOP_BUNDLES])
    registerDesktopBundles(profile)
    const manifest = readProfileManifest('dsh', profile)
    writeProfileBundles(profile, manifest, manifest.dsh.profile.bundles.filter(name =>
      !nativeAuthorMode || name !== '@eleckoi/dsh-client-html-resources'))
    writeFileSync(join(profile, 'cordis.patch.yml'), JSON.stringify([
      { id: 'llm-pi-ai', config: { providers: { 'synthetic-native': { api: 'openai-responses', baseURL: endpoint,
        apiKeyEnv: 'ELECKOI_SYNTHETIC_PROBE_KEY', models: [{ id: 'example-model', contextWindow: 65536, maxTokens: 8192 }] } } } },
      { id: 'agent-default-model', config: { provider: 'synthetic-native', model: 'example-model' } },
      ...(pluginCreationMode ? [{ id: 'session-query-sqlite', config: { path: ':memory:', openAt: 'first-search' } }] : []),
    ]))
    process.env.ELECKOI_SYNTHETIC_PROBE_KEY = 'synthetic-probe-key'
  }
  const hostOptions = { runtimeDataRoot: root, workspaceRoot: join(root, 'workspace'),
    productDatabasePath: join(root, 'product.sqlite'), productMediaRoot: join(root, 'media'),
    presetTemplatePath: resolve('apps/desktop/resources/dsh/agent-preset-template/agent.cordis.yml'),
    agentPatchPath: resolve('apps/desktop/resources/dsh/desktop-agent.patch.yml'), executablePath: process.execPath,
    packageManager: { entryPath: join(dirname(require.resolve('pnpm')), 'bin', 'pnpm.mjs'), nodeBinPath: resolve('apps/desktop/resources/dsh/node-bin') },
    onDiagnostic: message => { if (message.includes('ERROR')) errors.push(message) },
  }
  host = new DshDesktopPluginHost(hostOptions)
  let ready = await host.start()
  let cookie = await document.authenticateDshClientHost(ready.url)
  protocol.handle('dsh-app', async request => {
    const url = new URL(request.url)
    if (url.hostname === 'shell') {
      const types = { 'update-dialog.html': 'text/html', 'update-dialog.js': 'text/javascript', 'update-dialog.css': 'text/css',
        'design-platform.css': 'text/css', 'shell-theme.js': 'text/javascript', 'update-close.svg': 'image/svg+xml' }
      const name = url.pathname.slice(1)
      if (!Object.hasOwn(types, name)) return new Response(null, { status: 404 })
      return new Response(readFileSync(resolve('apps/desktop/resources/shell', name)), { headers: { 'content-type': types[name] } })
    }
    if (document.isDshClientAsset(url.pathname)) return document.serveDshClientAsset(request, resolveDshWebFrontendDirectory())
    return document.forwardDshClientRequest(request, ready.url, cookie)
  })
  ipcMain.handle('eleckoi:dsh-client-boot', () => ({ injections: ready.injections, streamBaseUrl: new URL(ready.url).origin }))
  ipcMain.handle('eleckoi:dsh-client-boot-failed', (_event, error) => errors.push(error))
  if (process.argv.includes('--updates-check')) {
    updateProbe = require('./probe-eleckoi-updates-scenario.cjs').createUpdateProbe({ ipcMain, getWindow: () => window, overlays: updateOverlays })
  } else {
    ipcMain.handle('dsh-desktop:updates-status', () => ({ phase: 'idle', currentVersion: app.getVersion(), availableVersion: null, releaseName: null, releaseNotes: null, releaseDate: null, downloadSizeBytes: null, progress: null, message: null }))
  }
  session.defaultSession.webRequest.onBeforeSendHeaders({ urls: ['ws://127.0.0.1/*'] }, (details, callback) => {
    const headers = Object.fromEntries(Object.entries(details.requestHeaders).map(([key, value]) => [key.toLowerCase(), value]))
    callback({ requestHeaders: { ...headers, origin: new URL(ready.url).origin, cookie, 'sec-fetch-site': 'same-origin' } })
  })
  window = new BrowserWindow({ show: false, width: 1440, height: 1000,
    webPreferences: { preload: resolve('apps/desktop/out/preload/preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, offscreen: true, backgroundThrottling: false } })
  disposeNative = installProbeDesktopNative({ window, root, getReady: () => ready, host, overlays: updateOverlays })
  window.webContents.on('console-message', ({ level, message }) => {
    if (level === 'error' || message.includes('initial Session restoration failed:')) errors.push(message)
  })
  const executeJavaScript = window.webContents.executeJavaScript.bind(window.webContents)
  window.webContents.executeJavaScript = async (source, ...args) => {
    try { return await executeJavaScript(source, ...args) }
    catch (error) {
      throw new Error(`Renderer probe expression failed:\n${source}\n${errors.join('\n')}`, { cause: error })
    }
  }
  window.webContents.on('did-fail-load', (_event, code, message, url, isMainFrame, processId, routingId) => {
    setImmediate(() => {
      const frame = webFrameMain.fromId(processId, routingId)
      // Removed authored frames can report their canceled navigation after unmount.
      if (code === -3 && !isMainFrame && url === 'about:srcdoc' && !frame) return
      errors.push(`${code}: ${message}; url=${url}; mainFrame=${isMainFrame}; frame=${JSON.stringify(frame ? { detached: frame.detached, url: frame.url, name: frame.name } : null)}`)
    })
  })
  await window.loadURL('dsh-app://app/')
  const waitFor = async (expression, label) => {
    const deadline = Date.now() + 35_000
    while (Date.now() < deadline) {
      if (await window.webContents.executeJavaScript(expression)) return
      await new Promise(resolve => setTimeout(resolve, 150))
    }
    throw new Error(`${label}: ${(await window.webContents.executeJavaScript('document.body.innerText')).slice(0, 1600)}\n${errors.join('\n')}`)
  }
  if (process.argv.includes('--studio-rightbar-check')) {
    await window.loadURL('dsh-app://app/?view=creator-studio')
    await waitFor(`Boolean(document.querySelector('.creator-studio-development-enter'))`, 'Creator Studio entry did not render')
    await window.webContents.executeJavaScript(`document.querySelector('.creator-studio-development-enter').click()`)
    await waitFor(`Boolean(document.querySelector('.creator-simple-chat-header [role="tab"]'))`, 'Studio view row did not render')
    const tabFrames = []
    for (const theme of ['light', 'dark']) for (const width of [1440, 900, 700]) {
      nativeTheme.themeSource = theme
      window.setSize(width, 900)
      // Offscreen capture must wait for the resized native surface to commit.
      await new Promise(resolve => setTimeout(resolve, 250))
      await window.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
      const measurements = await window.webContents.executeJavaScript(`(() => {
        const row = document.querySelector('.creator-simple-view-row');
        const list = row.querySelector('[role="tablist"]');
        const tabs = Array.from(list.querySelectorAll('[role="tab"]'));
        const more = row.querySelector('[data-plugin-entry-more="conversation"]');
        return { rowHeight: row.getBoundingClientRect().height, tabGap: getComputedStyle(list).gap,
          moreHeight: more?.getBoundingClientRect().height, moreInsideList: list.contains(more),
          tabs: tabs.map(tab => { const style = getComputedStyle(tab); return { label: tab.textContent,
            fontSize: style.fontSize, lineHeight: style.lineHeight, fontWeight: style.fontWeight,
            height: tab.getBoundingClientRect().height, underlineHeight: getComputedStyle(tab, '::after').height }; }),
          overflow: document.documentElement.scrollWidth > innerWidth };
      })()`)
      if (measurements.rowHeight !== 25 || measurements.tabGap !== '32px' || measurements.moreHeight !== 22
        || measurements.moreInsideList || measurements.overflow || measurements.tabs.some(tab => tab.fontSize !== '13px'
          || tab.lineHeight !== '16px' || tab.fontWeight !== '500' || tab.height !== 25 || tab.underlineHeight !== '2px')) {
        throw new Error('Studio view row differs from locked official measurements: ' + JSON.stringify({ theme, width, measurements }))
      }
      tabFrames.push({ theme, width, ...measurements })
      if (process.env.ELECKOI_CLIENT_PROBE_SCREENSHOT) writeFileSync(process.env.ELECKOI_CLIENT_PROBE_SCREENSHOT.replace(/\.png$/, `-studio-${theme}-${width}.png`), (await window.webContents.capturePage()).toPNG())
    }
    nativeTheme.themeSource = 'light'
    window.setSize(1440, 1000)
    await new Promise(resolve => setTimeout(resolve, 250))
    await window.webContents.executeJavaScript(`document.querySelector('.creator-simple-sidebar-toggle[aria-expanded="false"]')?.click()`)
    let previousSession
    for (let index = 0; index < 4; index += 1) {
      await waitFor(`Boolean(document.querySelector('[data-sidebar-right-expand]')) && Boolean(document.querySelector('[data-sidebar-right-panel]')) && Boolean(document.querySelector('.creator-simple-new')) && !document.querySelector('.creator-simple-new').disabled`, 'Studio sidebar did not bind a conversation')
      const sessionId = await window.webContents.executeJavaScript(`document.querySelector('[data-sidebar-right-panel]').dataset.sidebarRightSession`)
      if (sessionId === previousSession) throw new Error('Studio did not switch the right sidebar Session')
      await window.webContents.executeJavaScript(`document.querySelector('[data-sidebar-right-expand]').click()`)
      await waitFor(`Boolean(document.querySelector('[data-sidebar-right-panel][data-sidebar-right-open]'))`, 'Studio right sidebar did not open')
      await window.webContents.executeJavaScript(`document.querySelector('[data-sidebar-right-toggle]').click()`)
      await waitFor(`!document.querySelector('[data-sidebar-right-panel][data-sidebar-right-open]')`, 'Studio right sidebar did not close')
      previousSession = sessionId
      if (index < 3) {
        await window.webContents.executeJavaScript(`document.querySelector('.creator-simple-new').click()`)
        await waitFor(`document.querySelector('[data-sidebar-right-panel]')?.dataset.sidebarRightSession !== ${JSON.stringify(sessionId)}`, 'Studio sidebar Session did not advance')
      }
    }
    await window.webContents.executeJavaScript(`document.querySelector('[data-plugin-entry-more="conversation"]').click()`)
    await waitFor(`Array.from(document.querySelectorAll('[role="menuitem"]')).some(button => button.innerText.includes('浏览更多插件'))`, 'Studio did not render official plugin menu actions')
    await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('[role="menuitem"]')).find(button => button.innerText.includes('浏览更多插件')).click()`)
    await waitFor(`Boolean(document.querySelector('[data-plugin-panel]'))`, 'Studio menu did not open the official plugin panel')
    await window.webContents.executeJavaScript(`document.querySelector('button[aria-label="返回工作室对话"]').click()`)
    await waitFor(`Boolean(document.querySelector('.creator-simple-conversation [data-composer-input]'))`, 'Studio did not return to its conversation after browsing plugins')
    const failures = errors.filter(error => /Sidebar Session|Slot entry crashed|TypeError/.test(error))
    if (failures.length) throw new Error('Studio right sidebar lifecycle failed: ' + failures.join('\n'))
    process.stdout.write('Creator Studio tabs match locked official sizes: ' + JSON.stringify(tabFrames) + '\nCreator Studio right sidebar opened and closed across four new conversations; its official plugin menu opened and returned.\n')
    return
  }
  await waitFor(`document.querySelector('.side-panel-brand .eleckoi-wordmark')`, 'ElecKoi shell did not render')
  if (process.argv.includes('--workspace-schedule-check')) {
    const run = source => window.webContents.executeJavaScript(source)
    if (await run(`!!document.querySelector('.navigation-rail-shell [data-navigation-id="schedules"]')`)) throw new Error('Scheduled tasks remain in the global navigation')
    await run(`document.querySelector('[data-navigation-id="creatorStudio"]').click()`)
    await waitFor(`!!document.querySelector('.native-workspace-sidebar button[aria-label="自动化任务"]')`, 'Official scheduled tasks missing from workspace sidebar')
    await run(`document.querySelector('.native-workspace-sidebar button[aria-label="自动化任务"]').click()`)
    await waitFor(`!!document.querySelector('.native-workspace-sidebar button[aria-label="自动化任务"][aria-current="page"]')`, 'Task selection did not stay in the workspace sidebar')
    await waitFor(`document.querySelector('.main-panel-content')?.textContent.includes('自动化任务')`, 'Official task manager did not render')
    if (!await run(`!!document.querySelector('.navigation-rail-shell [data-navigation-id="plugins"]') && !!document.querySelector('.navigation-rail-shell [data-plugin-entry-more="sidebar"]')`)) throw new Error('Plugins or More moved out of global navigation')
    if (await run(`!!document.querySelector('.native-workspace-sidebar button[aria-label="插件"], .native-workspace-sidebar button[aria-label="更多"]')`)) throw new Error('Plugins or More duplicated into the workspace sidebar')
    for (const theme of ['light', 'dark']) for (const width of [1440, 900, 700]) {
      nativeTheme.themeSource = theme
      window.setSize(width, 900)
      await run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
      await run('Promise.allSettled(document.getAnimations().filter(animation=>animation.effect?.getComputedTiming().iterations!==Infinity).map(animation=>animation.finished))')
      const state = await run(`(()=>{const s=document.querySelector('.native-workspace-sidebar'),b=s.querySelector('button[aria-label="自动化任务"]'),label=b.lastElementChild;return {width:s.getBoundingClientRect().width,inside:s.contains(b),label:label.textContent,opacity:Number(getComputedStyle(label).opacity),global:!!document.querySelector('.navigation-rail-shell [data-navigation-id="schedules"]'),overflow:document.documentElement.scrollWidth>innerWidth}})()`)
      if (state.width < 250 || !state.inside || state.label !== '自动化任务' || state.opacity < .99 || state.global || state.overflow) throw new Error('Workspace task placement failed: ' + JSON.stringify({ theme, width, ...state }))
      if (process.env.ELECKOI_CLIENT_PROBE_SCREENSHOT && width === 1440) writeFileSync(process.env.ELECKOI_CLIENT_PROBE_SCREENSHOT.replace('.png', `-${theme}.png`), (await window.webContents.capturePage()).toPNG())
    }
    if (errors.length) throw new Error(errors.join('\n'))
    process.stdout.write('Official scheduled tasks appear only in the workspace sidebar; task manager selection, retained workspace sidebar and six light/dark widths passed.\n')
    return
  }
  if (updateProbe) {
    await updateProbe.run({ window, waitFor, errors, restart: async () => {
      await window.loadURL('about:blank')
      await host.close()
      ready = await host.start()
      cookie = await document.authenticateDshClientHost(ready.url)
      await window.loadURL('dsh-app://app/')
    } })
    return
  }
  const remoteCall = async (method, args) => {
    const response = await fetch(new URL(`/api/${method}`, ready.url), {
      method: 'POST', headers: { cookie, origin: new URL(ready.url).origin,
        'sec-fetch-site': 'same-origin', 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: 'eleckoi-client-probe', method, payload: { args } }),
    })
    const result = (await response.json()).result
    if (!response.ok || result.ok === false) throw new Error(`${method}: ${JSON.stringify(result)}`)
    return result.value ?? result
  }
  if (process.argv.includes('--startup-only')) {
    await new Promise(resolve => setTimeout(resolve, 500))
    const initial = await remoteCall('session/list', { _request: {} })
    if (initial.items.length !== 0) throw new Error('Product startup created an unrequested Session')
    mkdirSync(hostOptions.workspaceRoot, { recursive: true })
    await remoteCall('workspace/create', { request: { path: hostOptions.workspaceRoot } })
    await new Promise(resolve => setTimeout(resolve, 500))
    if ((await remoteCall('session/list', { _request: {} })).items.length !== 0) throw new Error('Workspace list updates created an unrequested Session')
    await window.loadURL('about:blank')
    await host.close()
    host = new DshDesktopPluginHost(hostOptions)
    ready = await host.start()
    cookie = await document.authenticateDshClientHost(ready.url)
    await window.loadURL('dsh-app://app/')
    await waitFor(`document.querySelector('.side-panel-brand .eleckoi-wordmark')`, 'Product shell did not restore')
    await new Promise(resolve => setTimeout(resolve, 500))
    if ((await remoteCall('session/list', { _request: {} })).items.length !== 0) throw new Error('Cold startup selected or created a Workspace Session')
    if (modelRequests !== 0) throw new Error('Startup unexpectedly requested a model')
    if (errors.length) throw new Error(errors.join('\n'))
    process.stdout.write('Product startup, Workspace list updates and cold restart created no unsolicited Sessions.\n')
    return
  }
  if (nativeAuthorMode) {
    const { runNativeAuthorScenario } = require('./probe-eleckoi-native-author-scenario.cjs')
    await runNativeAuthorScenario({ window, ready, cookie, waitFor, requests: () => modelRequests, modelBodies, errors, productDataRoot: root })
    return
  }
  if (pluginCreationMode) {
    const { runPluginCreationScenario } = require('./probe-plugin-creation-scenario.cjs')
    await runPluginCreationScenario({ window, nativeTheme, hostOptions, remoteCall, waitFor,
      requests: () => modelRequests, modelBodies, errors,
      isolationSetup: active => { workspaceIsolationSetup = active; if (!active) { modelRequests = 0; modelBodies.length = 0 } } })
    return
  }
  const checkOptionalPluginCards = async (expectedEnabled = false) => {
    await window.webContents.executeJavaScript(`(() => {
      const button = document.querySelector('button[aria-label="插件"]')
      if (!button) throw new Error('Plugin navigation did not render')
      button.click()
    })()`)
    await waitFor(`document.querySelector('[data-plugin-group="extensions"], [data-plugin-group="more"]') !== null`, 'Official plugin catalog did not render')
    await window.webContents.executeJavaScript(`(() => {
      const group = document.querySelector('[data-plugin-group="extensions"]')
      const more = Array.from(group?.querySelectorAll('button') ?? []).find(button => ['更多', 'More'].includes(button.innerText.trim()))
      more?.click()
    })()`)
    await waitFor(`${JSON.stringify(OPTIONAL_BUNDLES)}.every(name => {
      const card = document.querySelector('[data-plugin-package="' + name + '"]')
      return card?.getAttribute('data-plugin-status') === ${JSON.stringify(expectedEnabled ? 'running' : 'disabled')}
        && card.querySelector('[role="switch"]')?.getAttribute('aria-checked') === ${JSON.stringify(String(expectedEnabled))}
    })`, 'Official optional plugin cards or saved switches did not render')
  }
  if (process.argv.includes('--plugins-only')) {
    await checkOptionalPluginCards()
    for (const name of OPTIONAL_BUNDLES) {
      await window.webContents.executeJavaScript(`document.querySelector('[data-plugin-package="' + ${JSON.stringify(name)} + '"] [role="switch"]').click()`)
      await waitFor(`document.querySelector('[data-plugin-package="' + ${JSON.stringify(name)} + '"]')?.getAttribute('data-plugin-status') === 'running'`, 'Official plugin switch did not enable ' + name)
    }
    await window.loadURL('about:blank')
    await host.close()
    host = new DshDesktopPluginHost(hostOptions)
    ready = await host.start()
    cookie = await document.authenticateDshClientHost(ready.url)
    await window.loadURL('dsh-app://app/')
    await waitFor(`document.querySelector('button[aria-label="插件"]') !== null`, 'Plugin navigation did not restore')
    await checkOptionalPluginCards(true)
    for (const name of OPTIONAL_BUNDLES) {
      await window.webContents.executeJavaScript(`document.querySelector('[data-plugin-package="' + ${JSON.stringify(name)} + '"] [role="switch"]').click()`)
      await waitFor(`document.querySelector('[data-plugin-package="' + ${JSON.stringify(name)} + '"]')?.getAttribute('data-plugin-status') === 'disabled'`, 'Official plugin switch did not disable ' + name)
    }
    if (process.env.ELECKOI_CLIENT_PROBE_SCREENSHOT) writeFileSync(process.env.ELECKOI_CLIENT_PROBE_SCREENSHOT, (await window.webContents.capturePage()).toPNG())
    process.stdout.write(`All ${OPTIONAL_BUNDLES.length} official optional plugin cards, UI switches and cold restart selection passed.\n`)
    return
  }
  if (!chatOnlyMode) {
  await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('button')).find(button => button.getAttribute('aria-label') === '模型配置')?.click()`)
  await waitFor(`document.querySelector('.model-provider-sidebar') !== null || document.body.innerText.includes('基础配置')`, 'Custom model page did not render')
  await waitFor(`document.body.innerText.includes('基础配置') && document.body.innerText.includes('模型参数')`, 'Model editor did not render')
  const dedicatedFormat = await window.webContents.executeJavaScript(`(() => {
    const select = document.querySelector('.model-api-format-control select')
    return { disabled: select.disabled, value: select.value,
      options: Array.from(select.options).map(option => ({ value: option.value, label: option.textContent })) }
  })()`)
  if (!dedicatedFormat.disabled || dedicatedFormat.value !== 'anthropic_messages'
    || JSON.stringify(dedicatedFormat.options) !== JSON.stringify([{ value: 'anthropic_messages', label: 'Messages API' }])) {
    throw new Error(`Dedicated model format contract failed: ${JSON.stringify(dedicatedFormat)}`)
  }
  await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('button')).find(button => button.innerText.trim() === '添加模型')?.click()`)
  await window.webContents.executeJavaScript(`(() => {
    const input = document.querySelector('input[aria-label="模型名"]')
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'example-model')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })()`)
  await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('button')).find(button => button.innerText.trim() === '添加并使用')?.click()`)
  await waitFor(`document.querySelector('.model-parameter-grid input[max="1"]')?.disabled === false`, 'Model parameters did not enable')
  await window.webContents.executeJavaScript(`(() => {
    const input = document.querySelector('.model-parameter-grid input[max="1"]')
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '0.96')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })()`)
  await waitFor(`Array.from(document.querySelectorAll('.model-save-actions button')).some(button => button.innerText === '保存配置' && !button.disabled)`, 'Dedicated parameters did not become savable')
  await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.model-save-actions button')).find(button => button.innerText === '保存配置').click()`)
  await waitFor(`document.querySelector('.model-parameter-grid input[max="1"]')?.value === '0.96' && Array.from(document.querySelectorAll('.model-save-actions button')).some(button => button.innerText === '保存配置' && button.disabled)`, 'Dedicated parameters did not save through Remote')
  await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.model-config-sidebar button')).find(button => button.innerText.includes('自定义模型提供商'))?.click()`)
  await waitFor(`document.querySelector('.model-hero-copy h3')?.innerText === '自定义模型提供商'`, 'Custom provider did not open')
  const customFormats = await window.webContents.executeJavaScript(`(() => {
    const select = document.querySelector('.model-api-format-control select')
    return { disabled: select.disabled, values: Array.from(select.options).map(option => option.value) }
  })()`)
  if (customFormats.disabled || JSON.stringify(customFormats.values) !== JSON.stringify([
    'responses', 'chat_completions', 'anthropic_messages', 'google_gemini'
  ])) throw new Error(`Custom model format contract failed: ${JSON.stringify(customFormats)}`)
  await window.webContents.executeJavaScript(`(() => {
    const set = (selector, value) => {
      const input = document.querySelector(selector)
      if (!input) throw new Error('Missing model input: ' + selector)
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }
    set('.model-detail-form input[placeholder="待命名"]', 'Example configuration')
    set('.model-detail-form input[placeholder="填写模型提供商 API 地址"]', ${JSON.stringify(endpoint)})
    set('.model-api-key-control input', 'synthetic-probe-value')
  })()`)
  await waitFor(`document.querySelector('.model-detail-form input[placeholder="填写模型提供商 API 地址"]')?.value === ${JSON.stringify(endpoint)}`, 'Model endpoint draft was not updated')
  await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('button')).find(button => button.innerText.trim() === '添加模型')?.click()`)
  await waitFor(`document.querySelector('.model-manual-add input') !== null`, 'Manual model input did not open')
  await window.webContents.executeJavaScript(`(() => { const input = document.querySelector('.model-manual-add input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'example-model'); input.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.model-manual-add button')).find(button => button.innerText.trim() === '添加并使用')?.click()`)
  await waitFor(`document.querySelector('.model-picker-value')?.innerText === 'example-model'`, 'Manual model was not selected')
  await window.webContents.executeJavaScript(`(() => {
    const input = document.querySelector('.model-parameter-grid input[max="1"]')
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '0.95')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })()`)
  await waitFor(`Array.from(document.querySelectorAll('.model-save-actions button')).some(button => button.innerText === '保存配置' && !button.disabled)`, 'Save remained disabled')
  await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.model-save-actions button')).find(button => button.innerText === '保存配置').click()`)
  await waitFor(`document.querySelector('.model-api-key-control input')?.placeholder === '已保存，留空保留'`, 'Model profile or credential save failed')
  await window.reload()
  await waitFor(`document.querySelector('.side-panel-brand .eleckoi-wordmark')`, 'Shell did not reload')
  await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('button')).find(button => button.getAttribute('aria-label') === '模型配置')?.click()`)
  await waitFor(`document.body.innerText.includes('基础配置')`, 'Model page did not reload')
  await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.model-config-sidebar button')).find(button => button.innerText.includes('自定义模型提供商'))?.click()`)
  await waitFor(`document.querySelector('.model-detail-form input[placeholder="待命名"]')?.value === 'Example configuration' && document.querySelector('.model-api-key-control input')?.placeholder === '已保存，留空保留' && document.querySelector('.model-detail-form input[placeholder="填写模型提供商 API 地址"]')?.value === ${JSON.stringify(endpoint)}`, 'Saved model configuration was not restored through Remote')
  await waitFor(`document.querySelector('.model-parameter-grid input[max="1"]')?.value === '0.95'`, 'Saved Top P was not restored through Remote')
  if (errors.length) throw new Error(errors.join('\n'))
  const runtimeError = await window.webContents.executeJavaScript(`document.body.innerText.includes('运行错误') ? document.body.innerText : ''`)
  if (runtimeError) throw new Error(runtimeError)
  await window.webContents.executeJavaScript(`document.querySelector('.model-api-key-control button').click()`)
  await waitFor(`document.querySelector('.model-api-key-control input')?.value === 'synthetic-probe-value' && document.querySelector('.model-api-key-control input')?.type === 'text'`, 'Saved credential did not reveal through Remote')
  await window.webContents.executeJavaScript(`document.querySelector('.model-api-key-control button').click()`)
  await waitFor(`document.querySelector('.model-api-key-control input')?.value === '' && document.querySelector('.model-api-key-control input')?.type === 'password'`, 'Hidden credential was retained in the input')
  if (!await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.model-save-actions button')).some(button => button.innerText === '保存配置' && button.disabled)`)) throw new Error('Revealing a credential dirtied the configuration')
  }
  const settings = await remoteCall('settings/describe', {})
  const providers = settings.namespaces.find(row => row.ns === 'llm-pi-ai').value.providers
  const provider = Object.keys(providers).find(id => providers[id].baseURL === endpoint)
  if (!provider) throw new Error('Synthetic model profile is missing')
  const characterId = 'synthetic-chat-character'
  if (chatOnlyMode) await remoteCall('eleckoiCharacters/create', { character: { id: characterId, name: 'Synthetic character' } })
  if (roleplayToolMode) await toolScenario.configure(remoteCall, characterId)
  const created = await remoteCall('eleckoiConversations/create', { input: { title: 'Example chat',
    ...(chatOnlyMode ? { metadata: { characterId } } : {}) } })
  await remoteCall('eleckoiConversationModels/select', { conversationId: created.conversation.id,
    selection: { provider, model: 'example-model' } })
  await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('button')).find(button => button.getAttribute('aria-label') === '消息')?.click()`)
  const conversationLabel = chatOnlyMode ? 'Synthetic character' : 'Example chat'
  await waitFor(`Array.from(document.querySelectorAll('.conversation-main b')).some(node => node.innerText === ${JSON.stringify(conversationLabel)})`, 'Synthetic conversation did not appear')
  await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.conversation-main b')).find(node => node.innerText === ${JSON.stringify(conversationLabel)}).click()`)
  await waitFor(`document.querySelector('[data-composer-input][contenteditable="true"]') !== null`, 'Synthetic conversation did not open')
  if (roleplayToolMode) {
    await toolScenario.run({ window, waitFor, nativeTheme, modelBodies, remoteCall, conversationId: created.conversation.id })
    return
  }
  if (subagentNavigationMode) {
    const catalog = await remoteCall('eleckoiAgentPresets/catalog', {})
    const preset = await remoteCall('eleckoiAgentPresets/read', { presetId: catalog.activePresetIds.roleplay })
    await remoteCall('eleckoiAgentPresets/save', { preset: { ...preset, toolGroups: preset.toolGroups.map(group => group.id === 'builtin:collaboration' ? { ...group, included: true, enabled: true } : group) }, expectedRegexRules: preset.regexRules })
    await window.webContents.executeJavaScript(`document.querySelector('[data-composer-input]').focus()`)
    await window.webContents.insertText('Synthetic delegation navigation')
    await waitFor(`document.querySelector('button[aria-label="发送消息"]')?.disabled === false`, 'Delegation input did not enable')
    await window.webContents.executeJavaScript(`document.querySelector('button[aria-label="发送消息"]').click()`)
    await waitFor(`Boolean(document.querySelector('.chat-header-title-cluster button[aria-haspopup="tree"]'))`, 'Roleplay subagent catalog did not render')
    if (await window.webContents.executeJavaScript(`Boolean(document.querySelector('.chat-header-preset'))`)) throw new Error('Product preset label remained alongside the official header actions')
    await window.webContents.executeJavaScript(`document.querySelector('.chat-header-title-cluster button[aria-haspopup="tree"]').click()`)
    await waitFor(`Boolean(document.querySelector('[role="treeitem"]'))`, 'Subagent catalog did not open')
    await window.webContents.executeJavaScript(`window.__eleckoiProbeRoleplayPanel = document.querySelector('.chat-panel')`)
    await window.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
    if (process.env.ELECKOI_CLIENT_PROBE_SCREENSHOT) writeFileSync(process.env.ELECKOI_CLIENT_PROBE_SCREENSHOT, (await window.webContents.capturePage()).toPNG())
    await window.webContents.executeJavaScript(`document.querySelector('[role="treeitem"]').click()`)
    await waitFor(`Boolean(document.querySelector('[data-sidebar-right-open] [data-sidebar-chat]'))`, 'Subagent navigation did not open the official child sidebar')
    if (!await window.webContents.executeJavaScript(`document.querySelector('.chat-panel') === window.__eleckoiProbeRoleplayPanel && Boolean(document.querySelector('.chat-panel button[aria-label="对话操作"]'))`)) throw new Error('Opening a child replaced the roleplay conversation')
    await window.webContents.executeJavaScript(`document.querySelector('[data-sidebar-right-toggle]').click()`)
    await waitFor(`!document.querySelector('[data-sidebar-right-open]') && document.querySelector('.chat-panel') === window.__eleckoiProbeRoleplayPanel`, 'Closing the child sidebar did not preserve the parent conversation')
    const settleDeadline = Date.now() + 35_000
    let listed
    do {
      listed = await remoteCall('session/list', { _request: {} })
      if (!listed.items.some(item => item.running)) break
      if (Date.now() >= settleDeadline) throw new Error('Delegated Sessions did not settle before shutdown')
      await new Promise(resolve => setTimeout(resolve, 150))
    } while (true)
    if (listed.items.filter(item => item.origin === 'subagent').length !== 1) throw new Error('Delegation navigation created an unexpected number of children')
    const syntheticReplies = `Array.from(document.querySelectorAll('.chat-panel .message.theirs')).filter(message => message.innerText.includes('Synthetic'))`
    await waitFor(`${syntheticReplies}.length === 1 && !document.querySelector('.chat-panel button[aria-label="停止生成"]')`, 'Delegation did not settle to one visible parent answer')
    if (processDialogMode) {
      await window.webContents.executeJavaScript(`document.querySelector('.chat-panel .message.theirs button[aria-label="更多"]').click()`)
      await waitFor(`Boolean(document.querySelector('.chat-panel .message.theirs button[aria-label="查看过程"]'))`, 'Process history action did not open')
      await window.webContents.executeJavaScript(`document.querySelector('.chat-panel .message.theirs button[aria-label="查看过程"]').click()`)
      await waitFor(`Boolean(document.querySelector('.roleplay-process-content [data-process-node-kind="tool-call"] [data-disclosure-row]'))`, 'Official tool renderer did not mount inside the process dialog')
      await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.roleplay-process-content [aria-expanded="false"]')).forEach(button => button.click())`)
      await waitFor(`Array.from(document.querySelectorAll('.roleplay-process-content button')).some(button => button.textContent.includes('查看'))`, 'Official tool inspect control did not render')
      await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.roleplay-process-content button')).find(button => button.textContent.includes('查看')).click()`)
      await waitFor(`!document.querySelector('.roleplay-process-dialog') && document.querySelector('.chat-header-tabs [aria-selected="true"]').textContent === '轨迹'`, 'Call inspection did not open the official trajectory')
      await waitFor(`Boolean(document.querySelector('[data-inspector-split]')) || document.querySelector('.chat-panel').innerText.includes('Schema')`, 'Native trajectory call inspector did not open')
      if (!await window.webContents.executeJavaScript(`document.querySelector('.chat-panel') === window.__eleckoiProbeRoleplayPanel`)) throw new Error('Tool inspection replaced the parent panel')
      await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.chat-header-tabs [role="tab"]')).find(button => button.textContent === '对话').click()`)
      await waitFor(`Boolean(document.querySelector('.chat-panel .message.theirs button[aria-label="更多"]'))`, 'Returning from trajectory did not restore the roleplay chat')
      await window.webContents.executeJavaScript(`document.querySelector('.chat-panel .message.theirs button[aria-label="更多"]').click()`)
      await waitFor(`Boolean(document.querySelector('.chat-panel .message.theirs button[aria-label="查看过程"]'))`, 'Process action did not reopen')
      await window.webContents.executeJavaScript(`document.querySelector('.chat-panel .message.theirs button[aria-label="查看过程"]').click()`)
      await waitFor(`Boolean(document.querySelector('.roleplay-process-content [data-variant="think"]'))`, 'Native reasoning renderer did not mount')
      const finalThoughts = await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.roleplay-process-content [data-variant="think"]')).filter(row => row.textContent.includes('Synthetic final reasoning.')).map(row => { const node = row.closest('[data-process-node-key]'); return { key: node.dataset.processNodeKey, part: node.dataset.processPart }; })`)
      if (finalThoughts.length === 0 || new Set(finalThoughts.map(row => row.key)).size !== finalThoughts.length) throw new Error('Final reasoning rendered more than once: ' + JSON.stringify(finalThoughts))
      await window.webContents.executeJavaScript(`document.querySelector('.roleplay-process-content [data-variant="think"] [aria-expanded="true"]')?.click()`)
      const results = []
      for (const theme of ['light', 'dark']) {
        nativeTheme.themeSource = theme
        await new Promise(resolve => setTimeout(resolve, 150))
        results.push(await window.webContents.executeJavaScript(`(() => {
          const dialog = document.querySelector('.roleplay-process-dialog'), content = document.querySelector('.roleplay-process-scroll');
          return { width: dialog.getBoundingClientRect().width, overflow: content.scrollWidth > content.clientWidth + 1,
            nodes: Array.from(document.querySelectorAll('[data-process-node-key]')).map(node => node.dataset.processNodeKind),
            bulb: (() => { const leading = document.querySelector('.roleplay-process-content [data-variant="think"] [data-disclosure-row] > :first-child');
              const style = getComputedStyle(leading, '::after'); return { width: style.width, mask: style.maskImage }; })() };
        })()`))
        if (process.env.ELECKOI_CLIENT_PROBE_SCREENSHOT) writeFileSync(process.env.ELECKOI_CLIENT_PROBE_SCREENSHOT.replace(/\.png$/, '-process-' + theme + '.png'), (await window.webContents.capturePage()).toPNG())
      }
      if (results.some(result => result.overflow || result.width > 821 || result.bulb.width !== '14px' || result.bulb.mask === 'none')) throw new Error('Process dialog geometry failed: ' + JSON.stringify(results))
      window.setSize(390, 844)
      await window.webContents.executeJavaScript(`document.documentElement.dataset.eleckoiMobile = 'true'`)
      await new Promise(resolve => setTimeout(resolve, 300))
      await window.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
      const mobile = await window.webContents.executeJavaScript(`(() => {
        const dialog = document.querySelector('.roleplay-process-dialog'), scroll = dialog.querySelector('.roleplay-process-scroll');
        return { width: dialog.getBoundingClientRect().width, viewport: innerWidth,
          close: dialog.querySelector('.roleplay-process-close').getBoundingClientRect().width, overflow: scroll.scrollWidth > scroll.clientWidth + 1 };
      })()`)
      if (mobile.width > mobile.viewport || mobile.close < 44 || mobile.overflow) throw new Error('Mobile process geometry failed: ' + JSON.stringify(mobile))
      if (process.env.ELECKOI_CLIENT_PROBE_SCREENSHOT) writeFileSync(process.env.ELECKOI_CLIENT_PROBE_SCREENSHOT.replace(/\.png$/, '-process-mobile.png'), (await window.webContents.capturePage()).toPNG())
      await window.webContents.executeJavaScript(`delete document.documentElement.dataset.eleckoiMobile`)
      window.setSize(1440, 1000)
      await window.webContents.executeJavaScript(`document.querySelector('[aria-label="关闭处理过程"]').click()`)
      await waitFor(`!document.querySelector('.roleplay-process-dialog') && Boolean(document.querySelector('[data-composer-input]'))`, 'Closing the process dialog removed the composer')
      process.stdout.write('Official trajectory call navigation and single final reasoning passed: ' + JSON.stringify(results) + '\n')
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      const previousRequests = modelRequests
      await window.webContents.executeJavaScript(`document.querySelector('button[aria-label="扮演菜单"]').click()`)
      await waitFor(`Array.from(document.querySelectorAll('.composer-more-menu button')).some(button => button.innerText.trim() === '重新生成' && !button.disabled)`, 'Delegated reply regeneration did not enable')
      await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.composer-more-menu button')).find(button => button.innerText.trim() === '重新生成').click()`)
      await waitFor(`${syntheticReplies}.length === 1 && ${syntheticReplies}[0].innerText.includes('Synthetic regenerated reply ${previousRequests + 1}') && !document.querySelector('.chat-panel button[aria-label="停止生成"]')`, 'Delegated reply regeneration did not settle to one answer')
      if (modelRequests !== previousRequests + 1) throw new Error('Regeneration submitted an extra model request')
    }
    const regenerated = await remoteCall('eleckoiConversations/details', { conversationId: created.conversation.id })
    if (regenerated.runtimeSessionId !== created.runtimeSessionId) throw new Error('Delegated reply regeneration changed the main Session')
    if (errors.length) throw new Error(errors.join('\n'))
    process.stdout.write('Roleplay preserved its parent panel while opening the official child sidebar, settled to one answer and regenerated twice in the same Session.\n')
    return
  }
  if (process.argv.includes('--header-layout-check')) {
    const results = []
    for (const theme of ['light', 'dark']) for (const width of [1440, 900]) {
      nativeTheme.themeSource = theme
      window.setSize(width, width === 1440 ? 1000 : 760)
      await new Promise(resolve => setTimeout(resolve, 150))
      const geometry = await window.webContents.executeJavaScript(`(async () => {
      const measure = () => {
        const rect = selector => {
          const node = document.querySelector(selector), box = node.getBoundingClientRect(), css = getComputedStyle(node);
          return { top: box.top, bottom: box.bottom, width: box.width, height: box.height, paddingTop: css.paddingTop, gridRows: css.gridTemplateRows };
        };
        return Object.fromEntries(['.chat-header', '.chat-header-title-row', '.chat-header h1', '.chat-header-title-cluster', '.chat-header-actions', '.chat-header-tabs', '.chat-header-tabs [role="tab"]', '[data-plugin-entry-more="conversation"]'].map(selector => [selector, rect(selector)]));
      };
      const menu = document.querySelector('[data-plugin-entry-more="conversation"]');
      const host = menu.parentElement;
      const before = measure(), hostStyle = host.style.display;
      host.style.display = 'none';
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const withoutMenu = measure();
      host.style.display = hostStyle;
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return { before, withoutMenu, background: getComputedStyle(document.querySelector('.chat-panel')).backgroundColor,
        iconWidth: menu.querySelector('svg').getBoundingClientRect().width,
        sidebarIconWidth: document.querySelector('.official-sidebar-column button[aria-label="更多"] svg').getBoundingClientRect().width };
      })()`)
      const menuSelector = '[data-plugin-entry-more="conversation"]'
      for (const [selector, box] of Object.entries(geometry.before)) {
        if (selector === menuSelector) continue
        const original = geometry.withoutMenu[selector]
        if (Math.abs(box.top - original.top) > 0.5 || Math.abs(box.height - original.height) > 0.5) {
          throw new Error('Plugin menu displaced the existing header: ' + JSON.stringify({ theme, width, selector, box, original }))
        }
      }
      if (geometry.before[menuSelector].height !== 22 || geometry.before[menuSelector].width !== 22 || geometry.iconWidth !== 13 || geometry.sidebarIconWidth !== 18) {
        throw new Error('Plugin menu does not match the official control dimensions: ' + JSON.stringify(geometry))
      }
      results.push({ theme, width, background: geometry.background, titleInset: geometry.before['.chat-header h1'].top - geometry.before['.chat-header'].top,
        headerHeight: geometry.before['.chat-header'].height, tabHeight: geometry.before['.chat-header-tabs'].height })
      if (process.env.ELECKOI_CLIENT_PROBE_SCREENSHOT && width === 1440) {
        const path = process.env.ELECKOI_CLIENT_PROBE_SCREENSHOT.replace(/\.png$/, '-' + theme + '.png')
        writeFileSync(path, (await window.webContents.capturePage()).toPNG())
      }
    }
    if (results[0].background === results[2].background) throw new Error('Header check did not exercise both themes')
    process.stdout.write('Plugin menu preserved header geometry in both themes and widths: ' + JSON.stringify(results) + '\n')
    window.setSize(1440, 1000)
    if (!process.argv.includes('--rc3-check')) return
  }
  if (process.argv.includes('--rc3-check')) {
    if (await window.webContents.executeJavaScript(`Boolean(document.querySelector('button[aria-label="自动化任务"]'))`)) throw new Error('Automation navigation unexpectedly remained enabled')
    const checkMenu = async selector => {
      await waitFor(`Boolean(document.querySelector(${JSON.stringify(selector)}))`, 'Official plugin menu launcher did not render: ' + selector)
      await window.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(selector)}).click()`)
      await waitFor(`Array.from(document.querySelectorAll('[role="menuitem"]')).some(button => button.innerText.includes('浏览更多插件')) && Array.from(document.querySelectorAll('[role="menuitem"]')).some(button => button.innerText.includes('创建你的插件'))`, 'Official entry menu actions did not render')
      await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('[role="menuitem"]')).find(button => button.innerText.includes('浏览更多插件')).click()`)
      await waitFor(`Boolean(document.querySelector('[data-plugin-panel]'))`, 'Official menu did not open the plugin catalog')
      await window.webContents.executeJavaScript(`document.querySelector('button[aria-label="消息"]').click()`)
      await waitFor(`Boolean(document.querySelector('[data-composer-input]'))`, 'Conversation did not restore after browsing plugins')
    }
    await checkMenu('.official-sidebar-column button[aria-label="更多"]')
    await checkMenu('[data-plugin-entry-more="conversation"]')
    await window.webContents.executeJavaScript(`document.querySelector('[data-sidebar-right-expand]').click()`)
    await checkMenu('[data-sidebar-right-guide] button[aria-label="更多工具"]')
    mkdirSync(hostOptions.workspaceRoot, { recursive: true })
    await remoteCall('workspace/create', { request: { path: hostOptions.workspaceRoot } })
    await window.webContents.executeJavaScript(`document.querySelector('.official-sidebar-column button[aria-label="更多"]').click()`)
    await waitFor(`Array.from(document.querySelectorAll('[role="menuitem"]')).some(button => button.innerText.includes('创建你的插件'))`, 'Plugin creation action did not render')
    await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('[role="menuitem"]')).find(button => button.innerText.includes('创建你的插件')).click()`)
    await waitFor(`Array.from(document.querySelectorAll('[data-composer-input]')).some(input => input.textContent.includes('创建一个带左侧栏入口的 DSH 插件。'))`, 'Official plugin creation did not initialize the Creator draft')
    if (modelRequests !== 0) throw new Error('Creating a plugin draft unexpectedly requested a model')
    const failures = errors.filter(error => /Sidebar Session|Slot entry crashed|TypeError/.test(error))
    if (failures.length) throw new Error(failures.join('\n'))
    process.stdout.write('DSH rc.3 sidebar, conversation and rightbar menus browsed official plugins; plugin creation initialized its unsent draft; automation navigation was absent.\n')
    return
  }
  if (process.argv.includes('--web-search-check')) {
    const catalog = await remoteCall('eleckoiAgentPresets/catalog', {})
    const preset = await remoteCall('eleckoiAgentPresets/read', { presetId: catalog.activePresetIds.roleplay })
    await remoteCall('eleckoiAgentPresets/save', { preset: { ...preset, toolGroups: preset.toolGroups.map(group => group.id === 'builtin:web' ? { ...group, included: true, enabled: true } : group) }, expectedRegexRules: preset.regexRules })
    const openTools = async () => {
      await window.webContents.executeJavaScript(`document.querySelector('button[aria-label="扮演菜单"]').click()`)
      await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('[role="menuitem"]')).find(button => button.innerText.trim() === '工具').click()`)
      await waitFor(`Boolean(Array.from(document.querySelectorAll('.agent-tool-open')).find(button => button.innerText.includes('联网搜索')))`, 'Web tool did not render')
      await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.agent-tool-open')).find(button => button.innerText.includes('联网搜索')).click()`)
      await waitFor(`Boolean(document.querySelector('.web-search-config'))`, 'Web configuration did not load')
    }
    await openTools()
    const choices = await window.webContents.executeJavaScript(`({search:[...document.querySelectorAll('[aria-label="搜索方式"] strong')].map(node => node.innerText),buttons:document.querySelectorAll('.web-search-config button').length,fetch:document.querySelectorAll('[aria-label="网页抓取方式"]').length,inputs:document.querySelectorAll('.web-search-config input').length})`)
    if (JSON.stringify(choices) !== JSON.stringify({ search: ['DeepSeek', 'Tavily'], buttons: 3, fetch: 0, inputs: 0 })) throw new Error('Web settings must have two provider cards and a separate configuration button: ' + JSON.stringify(choices))
    if (process.env.ELECKOI_CLIENT_PROBE_SCREENSHOT) {
      await window.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
      writeFileSync(process.env.ELECKOI_CLIENT_PROBE_SCREENSHOT, (await window.webContents.capturePage()).toPNG())
    }
    await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.web-search-mode button')).find(button => button.querySelector('strong')?.innerText === 'Tavily').click()`)
    await waitFor(`Boolean(document.querySelector('[aria-label="Tavily API Key"]'))`, 'Tavily configuration did not remain available')
    if (await remoteCall('eleckoiWebSearch/selection', {}) !== 'tavily') throw new Error('Tavily selection did not save')
    const openDeepSeek = async () => {
      await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.web-search-mode button')).find(button => button.querySelector('strong')?.innerText === 'DeepSeek').click()`)
      await waitFor(`document.querySelector('[aria-label="搜索方式"] button[aria-pressed="true"] strong')?.innerText === 'DeepSeek' && document.querySelector('.web-search-config')?.getAttribute('aria-busy') === 'false'`, 'DeepSeek selection did not save in the tool dialog')
      await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.web-search-config button')).find(button => button.innerText === '前往官方插件配置').click()`)
      await waitFor(`Boolean(document.querySelector('[data-plugin-item-detail="web-search"]')) && !document.querySelector('.agent-tools-content')`, 'Configuration button did not open official settings and close the tool dialog')
    }
    const saveOfficial = async () => {
      await waitFor(`Array.from(document.querySelectorAll('[data-plugin-item-detail="web-search"] button')).some(button => button.innerText === '保存' && !button.disabled)`, 'Official web settings did not become editable')
      await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('[data-plugin-item-detail="web-search"] button')).find(button => button.innerText === '保存').click()`)
      await waitFor(`Array.from(document.querySelectorAll('[data-plugin-item-detail="web-search"] button')).some(button => button.innerText === '保存' && button.disabled)`, 'Official web settings did not finish saving')
    }
    const returnToTools = async () => {
      await window.webContents.executeJavaScript(`document.querySelector('button[aria-label="消息"]').click()`)
      await waitFor(`Boolean(document.querySelector('[data-composer-input]'))`, 'Conversation did not return from official settings')
      await openTools()
      await waitFor(`document.querySelector('[aria-label="搜索方式"] button[aria-pressed="true"] strong')?.innerText === 'DeepSeek'`, 'Tool dialog did not reflect the official saved settings')
    }
    await openDeepSeek()
    if (await remoteCall('eleckoiWebSearch/selection', {}) !== 'provider_native') throw new Error('Selecting DeepSeek did not persist Messages search before configuration')
    await window.webContents.executeJavaScript(`document.querySelector('[data-plugin-item-detail="web-search"] [role="switch"]').click()`)
    await saveOfficial()
    if (await remoteCall('eleckoiWebSearch/selection', {}) !== 'deepseek_search_api' || await remoteCall('eleckoiWebSearch/fetchSelection', {}) !== 'deepseek_fetch_api') throw new Error('Official Search API selection did not save')
    await returnToTools()
    await openDeepSeek()
    await window.webContents.executeJavaScript(`document.querySelector('[data-plugin-item-detail="web-search"] [role="switch"]').click()`)
    await saveOfficial()
    if (await remoteCall('eleckoiWebSearch/selection', {}) !== 'provider_native' || await remoteCall('eleckoiWebSearch/fetchSelection', {}) !== 'http') throw new Error('Official Messages selection did not save')
    await returnToTools()
    if (errors.length) throw new Error(errors.join('\n'))
    process.stdout.write('Web tool persisted DeepSeek Messages selection independently from configuration navigation and reflected both official search modes after saving.\n')
    return
  }
  const checkRightbar = async label => {
    await waitFor(`Boolean(document.querySelector('[data-sidebar-right-expand]'))`, 'Right sidebar expand control did not render: ' + label)
    await window.webContents.executeJavaScript(`document.querySelector('[data-sidebar-right-expand]').click()`)
    await waitFor(`Boolean(document.querySelector('[data-sidebar-right-panel][data-sidebar-right-open]'))`, 'Right sidebar did not open: ' + label)
    await window.webContents.executeJavaScript(`document.querySelector('[data-sidebar-right-toggle]').click()`)
    await waitFor(`!document.querySelector('[data-sidebar-right-panel][data-sidebar-right-open]') && Boolean(document.querySelector('[data-sidebar-right-expand]'))`, 'Right sidebar did not close: ' + label)
    const failures = errors.filter(error => /Sidebar Session|Slot entry crashed in .rightbar/.test(error))
    if (failures.length) throw new Error('Right sidebar lifecycle failed: ' + failures.join('\n'))
    process.stdout.write('Right sidebar opened and closed: ' + label + '\n')
  }
  if (process.argv.includes('--rightbar-check')) {
    await checkRightbar('initial conversation')
    await window.webContents.executeJavaScript(`document.querySelector('button[aria-label="插件"]').click()`)
    await waitFor(`Boolean(document.querySelector('[data-plugin-panel]'))`, 'Plugin panel did not open during sidebar navigation check')
    await window.webContents.executeJavaScript(`document.querySelector('button[aria-label="消息"]').click()`)
    await waitFor(`Boolean(document.querySelector('[data-composer-input]'))`, 'Conversation did not return from plugin panel')
    await checkRightbar('returned from plugin panel')
  }
  await window.webContents.executeJavaScript(`document.querySelector('[data-composer-input]').focus()`)
  await window.webContents.insertText('Synthetic input')
  await waitFor(`document.querySelector('button[aria-label="发送消息"]')?.disabled === false`, 'Send did not enable')
  await window.webContents.executeJavaScript(`document.querySelector('button[aria-label="发送消息"]').click()`)
  await waitFor(`Boolean(document.querySelector('button[aria-label="查看处理过程：生成失败"]')) && !document.querySelector('button[aria-label="停止生成"]') && !document.body.innerText.includes('深度求索中')`, 'Failed model request did not settle with a terminal notice')
  const failureArchive = JSON.parse(await remoteCall('eleckoiConversations/exportArchive', { conversationId: created.conversation.id }))
  if (modelRequests !== 1 || !failureArchive.sessionLogs.some(log => log.events.some(event =>
    event.type === 'turn/end' && event.data.reason?.kind === 'error'
    && event.data.reason.error.code === 'PI_AI_ERROR' && event.data.reason.error.message.includes('Synthetic payment rejection')))) {
    throw new Error('Payment failure did not retain the official provider error in its Session: ' + JSON.stringify({ modelRequests, reasons: failureArchive.sessionLogs.flatMap(log => log.events.filter(event => event.type === 'turn/end').map(event => event.data.reason)) }))
  }
  await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('button')).find(button => button.innerText.trim() === '关闭')?.click()`)
  await window.webContents.executeJavaScript(`document.querySelector('[data-composer-input]').focus()`)
  await window.webContents.insertText('Synthetic retry')
  await waitFor(`document.querySelector('button[aria-label="发送消息"]')?.disabled === false`, 'Retry did not enable')
  await window.webContents.executeJavaScript(`document.querySelector('button[aria-label="发送消息"]').click()`)
  await waitFor(`document.body.innerText.includes('Synthetic recovered reply') && !document.querySelector('button[aria-label="停止生成"]') && !document.body.innerText.includes('深度求索中')`, 'Retry did not complete in the original conversation')
  const current = await remoteCall('eleckoiConversations/details', { conversationId: created.conversation.id })
  if (current.runtimeSessionId !== created.runtimeSessionId || modelRequests !== 2) throw new Error('Failure recovery changed Session identity or duplicated a request')
  await window.loadURL('about:blank')
  await host.close()
  host = new DshDesktopPluginHost(hostOptions)
  ready = await host.start()
  cookie = await document.authenticateDshClientHost(ready.url)
  await window.loadURL('dsh-app://app/')
  await waitFor(`document.body.innerText.includes('Synthetic recovered reply')`, 'Cold restart did not restore the conversation')
  await waitFor(`document.querySelector('.chat-model-trigger-label')?.innerText === 'example-model'`, 'Cold restart did not restore the model selection')
  await waitFor(`document.querySelector('[data-composer-dock]') !== null`, 'Cold restart did not restore official composer statistics')
  if (process.argv.includes('--rightbar-check')) await checkRightbar('cold restored conversation')
  const statsTypography = await window.webContents.executeJavaScript(`(() => {
    const controls = Array.from(document.querySelectorAll('[data-composer-stat]'))
    if (!controls.length) throw new Error('Official statistics controls are unavailable')
    const original = document.body.style.getPropertyValue('--dsh-content-font-size')
    if (original !== '14px') throw new Error('Default content font was overwritten: ' + original)
    const sheet = document.querySelector('link[data-eleckoi-styles]').sheet
    const measure = () => controls.map(element => ({ stat: element.dataset.composerStat, fontSize: getComputedStyle(element).fontSize,
      family: getComputedStyle(element).fontFamily, iconWidth: element.querySelector('svg').getBoundingClientRect().width }))
    const reports = []
    try {
      for (const [textSize, statSize] of [[14, '12px'], [21, '18px']]) {
        document.body.style.setProperty('--dsh-content-font-size', textSize + 'px')
        const local = measure()
        sheet.disabled = true
        const official = measure()
        sheet.disabled = false
        if (local.some(row => row.fontSize !== statSize || row.iconWidth !== 14) || JSON.stringify(local) !== JSON.stringify(official)) {
          throw new Error('Statistics typography differs from the official styles: ' + JSON.stringify({ textSize, local, official }))
        }
        reports.push({ textSize, statSize })
      }
    } finally { sheet.disabled = false; document.body.style.setProperty('--dsh-content-font-size', original) }
    return reports
  })()`)
  process.stdout.write('Official statistics typography follows content font settings: ' + JSON.stringify(statsTypography) + '\n')
  await window.webContents.executeJavaScript(`(() => {
    const root = document.querySelector('[data-composer-dock]')
    const failures = []
    const inspect = () => {
      const current = document.querySelector('[data-composer-dock]')
      if (!current) failures.push('Statistics disappeared')
      else if (current !== root) failures.push('Statistics row was replaced')
      else if (!current.textContent.trim()) failures.push('Statistics became empty')
    }
    const observer = new MutationObserver(inspect)
    const composer = document.querySelector('[data-composer-card]')?.parentElement
    if (!composer?.contains(root)) throw new Error('Composer statistics are outside the resident input surface')
    observer.observe(composer, { childList: true, subtree: true, characterData: true })
    window.__eleckoiStatsProbe = { failures, observer }
  })()`)
  if (process.argv.includes('--regeneration-check')) await window.webContents.executeJavaScript(`(() => {
    const failures = [];
    const inspect = () => {
      const current = document.querySelector('.chat-panel');
      if (!current) failures.push('Conversation disappeared');
      else if (!current.querySelector('[data-composer-input]')) failures.push('Composer disappeared');
    };
    const observer = new MutationObserver(inspect);
    observer.observe(document.querySelector('#eleckoi-root'), { childList:true, subtree:true });
    window.__eleckoiRegenerationProbe = { failures, observer };
  })()`)
  const regenerate = async () => {
    await window.webContents.executeJavaScript(`document.querySelector('button[aria-label="扮演菜单"]').click()`)
    await waitFor(`Array.from(document.querySelectorAll('.composer-more-menu button')).some(button => button.innerText.trim() === '重新生成' && !button.disabled)`, 'Regeneration did not enable')
    await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.composer-more-menu button')).find(button => button.innerText.trim() === '重新生成').click()`)
  }
  await regenerate()
  await waitFor(`document.body.innerText.includes('运行错误') || (document.body.innerText.includes('Synthetic regenerated reply 3') && !document.querySelector('button[aria-label="停止生成"]'))`, 'Cold regeneration did not settle')
  if (await window.webContents.executeJavaScript(`document.body.innerText.includes('运行错误')`)) throw new Error(await window.webContents.executeJavaScript('document.body.innerText'))
  await regenerate()
  await waitFor(`document.body.innerText.includes('运行错误') || (document.body.innerText.includes('Synthetic regenerated reply 4') && !document.querySelector('button[aria-label="停止生成"]'))`, 'Repeated regeneration did not settle')
  if (await window.webContents.executeJavaScript(`document.body.innerText.includes('运行错误')`)) throw new Error(await window.webContents.executeJavaScript('document.body.innerText'))
  const regenerated = await remoteCall('eleckoiConversations/details', { conversationId: created.conversation.id })
  if (regenerated.runtimeSessionId !== created.runtimeSessionId || modelRequests !== 4) throw new Error('Regeneration changed Session identity or duplicated a request')
  await new Promise(resolve => setTimeout(resolve, 300))
  const statsFailures = await window.webContents.executeJavaScript(`(() => {
    window.__eleckoiStatsProbe.observer.disconnect()
    return window.__eleckoiStatsProbe.failures
  })()`)
  if (statsFailures.length) throw new Error(`Regeneration composer statistics flickered: ${statsFailures.join(', ')}`)
  if (process.argv.includes('--rightbar-check')) await checkRightbar('regenerated conversation')
  if (process.argv.includes('--regeneration-check')) {
    const failures = await window.webContents.executeJavaScript(`(() => {
      window.__eleckoiRegenerationProbe.observer.disconnect();
      return [...new Set(window.__eleckoiRegenerationProbe.failures)];
    })()`);
    if (failures.length) throw new Error(`Regeneration interrupted the conversation surface: ${failures.join(', ')}`);
    process.stdout.write('Regeneration kept the conversation and composer continuously mounted.\n');
  }
  if (chatOnlyMode && process.argv.includes('--handoff-check')) {
    await waitFor(`Array.from(document.querySelectorAll('.rich-message-frame')).some(frame => frame.style.height === '240px') && !document.querySelector('.rich-message-staging[aria-hidden="true"]')`, 'Rich conversation did not settle without scrolling')
    const otherCharacterId = 'synthetic-other-character'
    await remoteCall('eleckoiCharacters/create', { character: { id: otherCharacterId, name: 'Synthetic other character' } })
    await remoteCall('eleckoiConversations/create', { input: { title: 'Synthetic other chat', metadata: { characterId: otherCharacterId } } })
    await waitFor(`Array.from(document.querySelectorAll('.conversation-main b')).some(node => node.innerText === 'Synthetic other character')`, 'Second synthetic conversation did not appear')
    await window.webContents.executeJavaScript(`(() => {
      const failures = [];
      const inspect = () => {
        if (document.querySelector('.chat-panel') && !document.querySelector('[data-composer-input]')) failures.push('Composer absent');
      };
      const observer = new MutationObserver(inspect);
      observer.observe(document.querySelector('#eleckoi-root'), { childList:true, subtree:true });
      window.__eleckoiHandoffProbe = { failures, observer };
    })()`)
    for (const label of ['Synthetic other character', conversationLabel, 'Synthetic other character', conversationLabel]) {
      await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.conversation-main b')).find(node => node.innerText === ${JSON.stringify(label)}).click()`)
      await waitFor(`document.querySelector('.chat-header h1')?.innerText === ${JSON.stringify(label)} && document.querySelector('[data-composer-input]')`, 'Conversation switch did not restore the composer')
      await new Promise(resolve => setTimeout(resolve, 150))
      if (process.argv.includes('--rightbar-check')) await checkRightbar('switched to ' + label)
    }
    const handoffFailures = await window.webContents.executeJavaScript(`(() => {
      window.__eleckoiHandoffProbe.observer.disconnect(); return window.__eleckoiHandoffProbe.failures;
    })()`)
    if (handoffFailures.length) throw new Error(`Conversation composer disappeared during switching: ${handoffFailures.length}`)
    process.stdout.write('Switching between loaded character conversations kept the composer present.\n')
  }
  if (process.env.ELECKOI_CLIENT_PROBE_SCREENSHOT) writeFileSync(process.env.ELECKOI_CLIENT_PROBE_SCREENSHOT, (await window.webContents.capturePage()).toPNG())
  process.stdout.write(chatOnlyMode
    ? 'Built ElecKoi roleplay send, failed request recovery, cold restart and continuous regeneration statistics passed.\n'
    : 'ElecKoi production desktop boot, saved credential reveal, failed model request termination and continuous regeneration statistics passed.\n')
}
main().catch(error => { process.stderr.write(`${error.stack || error}\n`); failed = true }).finally(async () => {
  try {
    updateProbe?.dispose()
    await disposeNative?.()
    if (window && !window.isDestroyed()) await window.loadURL('about:blank')
    window?.destroy()
    await host?.close()
    modelServer?.closeAllConnections()
    if (modelServer) await new Promise(resolve => modelServer.close(resolve))
    protocol.unhandle('dsh-app')
  } finally {
    const cleaner = spawn(process.execPath, ['-e', `(${cleanupAfterExit.toString()})()`, String(process.pid), root], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, detached: true, windowsHide: true, stdio: 'ignore',
    })
    cleaner.unref()
    app.exit(failed ? 1 : 0)
  }
})

async function cleanupAfterExit() {
  const { resolve, sep, basename } = require('node:path')
  const target = resolve(process.argv[2])
  if (!target.startsWith(resolve(require('node:os').tmpdir()) + sep) || !basename(target).startsWith('eleckoi-client-probe-')) return
  const pid = Number(process.argv[1])
  for (let attempt = 0; attempt < 300; attempt += 1) {
    try { process.kill(pid, 0) } catch (error) {
      if (error.code === 'ESRCH') require('node:fs').rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
      return
    }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
}
