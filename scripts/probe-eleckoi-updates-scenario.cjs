const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { writeFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { loadNativeModule } = require('./probe-desktop-native.cjs')

exports.createUpdateProbe = ({ ipcMain, getWindow, overlays }) => {
  const { UpdateService } = loadNativeModule('apps/desktop/src/main/modules/updates/UpdateService.ts')
  const { DesktopUpdatePrompts } = loadNativeModule('apps/desktop/src/main/modules/updates/DesktopUpdatePrompts.ts')
  const { presentDesktopUpdate } = loadNativeModule('apps/desktop/src/main/modules/updates/dsh/update-presentation.ts')
  let surface
  const create = overlays.create.bind(overlays)
  overlays.create = (...args) => { surface = create(...args); return surface }
  const prompts = new DesktopUpdatePrompts(resolve('apps/desktop/out/preload/preload-update-dialog.cjs'), getWindow, overlays)
  const info = { version: '0.2.20', releaseName: 'ElecKoi v0.2.20', releaseNotes: 'Synthetic update', releaseDate: '2026-11-06T00:00:00Z', files: [{ url: 'synthetic.exe', sha512: 'synthetic', size: 100 }] }
  const updater = new EventEmitter()
  let checks = 0, downloads = 0, installs = 0, completeDownload, active = false
  updater.checkForUpdates = async () => { checks++; updater.emit('update-available', info); return { updateInfo: info, isUpdateAvailable: true } }
  updater.downloadUpdate = () => { downloads++; return new Promise(done => { completeDownload = () => {
    updater.emit('update-downloaded', { ...info, downloadedFile: 'synthetic.exe' }); done([])
  } }) }
  updater.quitAndInstall = () => { installs++ }
  const publish = status => {
    getWindow()?.webContents.send('dsh-desktop:updates-changed', status)
    void prompts.notify(service).catch(error => { throw error })
  }
  const service = new UpdateService({ updater, currentVersion: '0.2.19', enabled: true, disabledMessage: '',
    open: (language, manual) => prompts.open(service, language, manual),
    prepareInstall: () => prompts.confirmInstall(info.version, active), releaseInstall: async () => {}, publish,
    logger: { info() {}, warn() {}, error() {} } })
  const channels = ['status', 'check', 'download', 'install', 'open']
  for (const method of channels) ipcMain.handle(`dsh-desktop:updates-${method}`, (_event, ...args) => method === 'status'
    ? { ...service.status(), ...presentDesktopUpdate(service.nativeStatus()) } : service[method](...args))
  return {
    dispose() { prompts.dispose(); service.dispose(); for (const name of channels) ipcMain.removeHandler(`dsh-desktop:updates-${name}`) },
    async run({ window, waitFor, errors, restart }) {
      const execute = source => window.webContents.executeJavaScript(source)
      const click = selector => execute(`document.querySelector(${JSON.stringify(selector)}).click()`)
      const languageSelector = '[data-group="language"] [data-slot="settings.general.item"] button[aria-haspopup="menu"]'
      const openLanguage = async title => {
        await waitFor(`[...document.querySelectorAll('.app-settings-sidebar button')].some(button=>button.textContent===${JSON.stringify(title)})`, 'Chat display settings entry missing')
        await execute(`[...document.querySelectorAll('.app-settings-sidebar button')].find(button=>button.textContent===${JSON.stringify(title)}).click()`)
        await waitFor(`!!document.querySelector('[data-group="language"] summary')`, 'Language group missing')
        await execute(`(() => { const group=document.querySelector('[data-group="language"]'); if(!group.open) group.querySelector('summary').click() })()`)
        await waitFor(`!!document.querySelector(${JSON.stringify(languageSelector)})`, 'Official language selector missing')
      }
      await waitFor(`!!document.querySelector('.rail-settings-trigger')`, 'Settings entry missing')
      await click('.rail-settings-trigger')
      await waitFor(`!!document.querySelector('.app-settings-sidebar')`, 'Settings missing')
      await openLanguage('聊天显示')
      for (const [id, label] of [['en','English'],['ja','日本語'],['es','Español'],['fr','Français'],['ru','Русский'],['pt','Português'],['zh','中文'],['de','Deutsch']]) {
        await click(languageSelector)
        await waitFor(`document.querySelectorAll('[role^="menuitem"]').length===8`, 'Official eight-language menu missing')
        await execute(`[...document.querySelectorAll('[role^="menuitem"]')].find(item=>item.textContent.trim()===${JSON.stringify(label)}).click()`)
        await waitFor(`document.documentElement.lang===${JSON.stringify(id === 'zh' ? 'zh-CN' : id)}`, 'Language did not change to ' + id)
      }
      await waitFor(`globalThis.__DSH_LOCALE__.read().then(value=>value.preference==='de')`, 'Official Host did not save German preference')
      await restart()
      await waitFor(`document.documentElement.lang==='de' && !!document.querySelector('.rail-user-trigger')`, 'Saved official language did not survive Host restart')
      await click('.rail-settings-trigger')
      await waitFor(`!!document.querySelector('.app-settings-sidebar')`, 'Settings after Host restart missing')
      await openLanguage('Chat-Anzeige')
      await click(languageSelector)
      await waitFor(`document.querySelectorAll('[role^="menuitem"]').length===8`, 'Restored language menu missing')
      await execute(`[...document.querySelectorAll('[role^="menuitem"]')].find(item=>item.textContent.trim()==='中文').click()`)
      await waitFor(`document.documentElement.lang==='zh-CN'`, 'Language could not return to Chinese')
      const native = async test => {
        const deadline = Date.now() + 15000
        while (Date.now() < deadline) {
          if (surface && !surface.isDestroyed() && await surface.webContents.executeJavaScript(test)) return surface.webContents
          await new Promise(done => setTimeout(done, 50))
        }
        throw new Error('Official native update document did not reach: ' + test)
      }
      const originalVisible = window.isVisible.bind(window)
      let visible = true
      window.isVisible = () => visible
      service.start()
      const offer = await native(`document.body.innerText.includes('0.2.20') && !!document.querySelector('#actions button')`)
      assert.equal(downloads, 0, 'Automatic discovery must offer before downloading')
      await offer.executeJavaScript(`document.querySelector('#close').click()`)
      await waitFor(`!!document.querySelector('.rail-desktop-update button')`, 'Official update indicator missing')
      const placement = await execute(`(()=>{const b=document.querySelector('.rail-desktop-update button').getBoundingClientRect(),a=document.querySelector('.rail-user-trigger').getBoundingClientRect(),i=document.querySelector('.rail-desktop-update svg').getBoundingClientRect();return {bottom:b.bottom,avatarTop:a.top,center:b.x+b.width/2,avatarCenter:a.x+a.width/2,width:b.width,icon:i.width}})()`)
      assert.ok(placement.bottom <= placement.avatarTop)
      assert.ok(Math.abs(placement.center - placement.avatarCenter) < 1)
      assert.equal(placement.width, 38)
      assert.equal(placement.icon, 14)
      await click('.rail-desktop-update button')
      const reopenedOffer = await native(`document.body.innerText.includes('0.2.20') && !!document.querySelector('#actions button')`)
      await reopenedOffer.executeJavaScript(`document.querySelector('#actions button').click()`)
      const progressView = await native(`document.querySelector('#title').textContent.includes('%')`)
      updater.emit('download-progress', { percent: 46, transferred: 46, total: 100, bytesPerSecond: 10 })
      await native(`document.querySelector('#title').textContent.includes('46%')`)
      await progressView.executeJavaScript(`document.querySelector('#close').focus()`)
      updater.emit('download-progress', { percent: 47, transferred: 47, total: 100, bytesPerSecond: 10 })
      await native(`document.querySelector('#title').textContent.includes('47%')`)
      assert.equal(await progressView.executeJavaScript(`document.activeElement.id`), 'close', 'Progress must preserve the close target')
      await progressView.executeJavaScript(`document.querySelector('#close').click()`)
      await waitFor(`document.querySelector('.rail-desktop-update button')?.getAttribute('aria-disabled')==='false'`, 'Background download cannot be reopened')
      const bounds = await execute(`(()=>{const r=document.querySelector('.rail-desktop-update button').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`)
      window.webContents.sendInputEvent({ type: 'mouseMove', ...bounds })
      await waitFor(`!!document.querySelector('[role="tooltip"]')`, 'Update tooltip missing')
      const bubble = await execute(`(()=>{const t=document.querySelector('[role="tooltip"]'),r=t.getBoundingClientRect(),s=document.querySelector('.navigation-rail-shell').getBoundingClientRect();return {parent:t.parentElement.tagName,right:r.right,railRight:s.right,width:r.width,text:t.textContent,hit:(()=>{const old=t.style.pointerEvents;t.style.pointerEvents='auto';const hit=document.elementFromPoint(Math.floor(r.left+r.width/2),Math.floor(r.top+r.height/2))?.closest('[role="tooltip"]')===t;t.style.pointerEvents=old;return hit})()}})()`)
      assert.equal(bubble.parent, 'BODY')
      assert.ok(bubble.right > bubble.railRight && bubble.width > 80 && bubble.hit, 'Tooltip is clipped or covered')
      assert.ok(bubble.text.includes('47'))
      window.webContents.sendInputEvent({ type: 'mouseMove', x: 400, y: 300 })
      await click('.rail-desktop-update button')
      const reopenedProgress = await native(`document.querySelector('#title').textContent.includes('47%')`)
      assert.equal(downloads, 1)
      await reopenedProgress.executeJavaScript(`document.querySelector('#close').click()`)
      await waitFor(`document.querySelector('.rail-desktop-update button')?.getAttribute('aria-disabled')==='false'`, 'Download did not return to background')
      visible = false
      completeDownload()
      await waitFor(`document.querySelector('.rail-desktop-update button')?.getAttribute('aria-label').includes('重启')`, 'Downloaded state missing')
      assert.equal(installs, 0)
      visible = true; window.emit('show')
      const view = await native(`document.body.innerText.includes('0.2.20') && !!document.querySelector('#actions button')`)
      assert.equal(view.getURL(), 'dsh-app://shell/update-dialog.html')
      assert.equal(await execute(`!!document.querySelector('.app-update-dialog')`), false)
      if (process.env.ELECKOI_CLIENT_PROBE_SCREENSHOT) writeFileSync(process.env.ELECKOI_CLIENT_PROBE_SCREENSHOT, (await window.webContents.capturePage()).toPNG())
      await view.executeJavaScript(`document.querySelector('#close').click()`)
      await waitFor(`document.querySelector('.rail-desktop-update button')?.getAttribute('aria-disabled')==='false'`, 'Canceled install did not restore the update indicator')
      assert.equal(installs, 0)
      active = true
      await click('.rail-desktop-update button')
      const warning = await native(`document.body.innerText.includes('任务') && document.querySelectorAll('#actions button').length===2`)
      await warning.executeJavaScript(`document.querySelector('#actions button').click()`)
      await waitFor(`document.querySelector('.rail-desktop-update button')?.getAttribute('aria-disabled')==='true'`, 'Install handoff missing')
      window.isVisible = originalVisible
      assert.equal(checks, 1); assert.equal(downloads, 1); assert.equal(installs, 1)
      assert.deepEqual(errors, [])
      process.stdout.write('Official eight-language selection and Host restart persistence; automatic update offers, 14px official icon, unclipped tooltip, live progress, background dismissal/reopen without duplicate downloads, ready confirmation on return and active-task confirmation passed; no executable installed.\n')
    }
  }
}
