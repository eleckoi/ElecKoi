const { app, BrowserWindow, ipcMain, protocol } = require('electron')
const { writeFile } = require('node:fs/promises')
const { resolve } = require('node:path')

const [frontend, profile, report] = process.argv.slice(2)
const { serveDshClientAsset } = require(resolve(profile, 'transport.cjs'))
app.setPath('userData', profile)
app.disableHardwareAcceleration()
protocol.registerSchemesAsPrivileged([{ scheme: 'dsh-app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }])

const failures = [
  `({ message: 'Synthetic request failed', code: 'synthetic/network', details: { status: 503, attempts: 0, retryable: false }, cause: new Error('Synthetic nested cause') })`,
  `Object.assign(new Error('Synthetic standard failure', { cause: new Error('Synthetic inner failure') }), { code: 'synthetic/standard', details: { stage: 'bootstrap' } })`,
  `new AggregateError([new Error('Synthetic first member'), { message: 'Synthetic second member', code: 'synthetic/member' }], 'Synthetic aggregate', { cause: new Error('Synthetic aggregate cause') })`,
  `(() => { const value = { message: 'Synthetic circular failure', details: { complete: '完整诊断'.repeat(2000) + 'SYNTHETIC_END', count: 42n } }; value.cause = value; value.shared = value.details; return value })()`,
  `(() => { const frame = document.createElement('iframe'); document.documentElement.append(frame); return Object.assign(new frame.contentWindow.TypeError('Synthetic foreign error'), { code: 'synthetic/foreign' }) })()`,
  `'Synthetic literal failure'`,
  `new DOMException('Synthetic aborted request', 'AbortError')`,
  `({ message: 'Synthetic accessor failure', get dangerous() { throw new Error('Do not execute arbitrary accessors') } })`
]

app.whenReady().then(async () => {
  const reported = new Map()
  ipcMain.handle('eleckoi:dsh-client-boot', () => ({ injections: [], streamBaseUrl: 'http://127.0.0.1:1' }))
  ipcMain.handle('eleckoi:dsh-client-boot-failed', (event, message) => {
    if (typeof message !== 'string') throw new Error('The production boot bridge did not send a string')
    const index = Number(new URL(event.sender.getURL()).searchParams.get('case'))
    reported.set(index, message)
  })
  protocol.handle('dsh-app', async request => {
    const response = await serveDshClientAsset(request, frontend)
    const url = new URL(request.url)
    if (url.pathname !== '/') return response
    const failure = failures[Number(url.searchParams.get('case'))]
    if (failure === undefined) throw new Error('Unknown synthetic failure')
    const setup = `<script>globalThis.__DSH_BOOT_READY__.reject(${failure});</script>`
    return new Response((await response.text()).replace('</head>', setup + '</head>'), {
      status: response.status, headers: response.headers
    })
  })
  const window = new BrowserWindow({
    show: false, webPreferences: {
      preload: resolve(profile, 'preload.cjs'), sandbox: true, contextIsolation: true,
      offscreen: true, backgroundThrottling: false
    }
  })
  try {
    const rows = []
    for (let index = 0; index < failures.length; index++) {
      await window.loadURL(`dsh-app://app/?case=${index}`)
      const deadline = Date.now() + 10_000
      let message
      do {
        message = reported.get(index)
        if (typeof message === 'string') break
        await new Promise(resolve => setTimeout(resolve, 25))
      } while (Date.now() < deadline)
      if (typeof message !== 'string') throw new Error(`Boot failure ${index} was not reported`)
      const pageDetail = await window.webContents.executeJavaScript('document.querySelector("pre")?.textContent')
      rows.push({ index, message, pageDetail })
    }
    await writeFile(report, JSON.stringify(rows))
  } finally {
    window.destroy()
    protocol.unhandle('dsh-app')
    ipcMain.removeHandler('eleckoi:dsh-client-boot')
    ipcMain.removeHandler('eleckoi:dsh-client-boot-failed')
  }
  app.exit(0)
}).catch(error => { console.error(error); app.exit(1) })
