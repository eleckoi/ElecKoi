const { app, BrowserWindow } = require('electron')
const { writeFileSync } = require('node:fs')
const { resolve } = require('node:path')
const directory = process.argv[2]
const report = { scenarios: [], uncaught: [], electron: process.versions.electron }
app.setPath('userData', resolve(directory, 'profile'))
app.disableHardwareAcceleration()
app.on('window-all-closed', () => {})
process.on('uncaughtException', error => { report.uncaught.push(error.stack) })

app.whenReady().then(async () => {
  const { installMainWindowConsole } = require(resolve(directory, 'main.cjs'))
  try {
    for (const operation of ['close', 'destroy', 'contents']) {
      const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true } })
      const contents = window.webContents, errors = [], actions = []
      const existing = new Set(contents.listeners('console-message'))
      const dispose = installMainWindowConsole(window, { error: (record, message) => errors.push({ record, message }),
        info: record => actions.push(record) })
      const queued = contents.listeners('console-message').find(listener => !existing.has(listener))
      await window.loadURL('data:text/html,<html><body>Lifecycle fixture<script>addEventListener("unload",()=>console.error("Synthetic unload diagnostic"))</script></body></html>')
      await contents.executeJavaScript('console.error("Synthetic live diagnostic")')
      const liveLogged = errors.some(entry => entry.record.message === 'Synthetic live diagnostic')
      const details = { sourceId: 'synthetic.js', lineNumber: 1, message: 'Synthetic late diagnostic', level: 'error', frame: contents.mainFrame }
      const closed = new Promise(resolve => contents.once('destroyed', resolve))
      const ownerClosed = new Promise(resolve => window.once('closed', resolve))
      if (operation === 'close') window.close()
      else if (operation === 'destroy') window.destroy()
      else contents.close({ waitForBeforeUnload: false })
      await closed
      let lateError
      try { queued(details) } catch (error) { lateError = error.message }
      const ownerDestroyedAtContentsTeardown = window.isDestroyed()
      await ownerClosed
      let afterCloseError
      try { queued(details) } catch (error) { afterCloseError = error.message }
      report.scenarios.push({ operation, liveLogged, lateError,
        afterCloseError, ownerDestroyedAtContentsTeardown,
        ownerDestroyed: window.isDestroyed(), contentsDestroyed: contents.isDestroyed(),
        loggingReleased: !contents.listeners('console-message').includes(queued),
        lateLogged: errors.some(entry => entry.record.message === details.message) })
      dispose()
    }
  } catch (error) { report.failure = error.stack }
  finally {
    writeFileSync(resolve(directory, 'report.json'), JSON.stringify(report, null, 2))
    app.exit(report.failure || report.uncaught.length ? 1 : 0)
  }
})
