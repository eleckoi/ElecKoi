const { mkdirSync, writeFileSync } = require('node:fs')

exports.runPluginCreationScenario = async ({ window, nativeTheme, hostOptions, remoteCall, waitFor, requests, modelBodies, errors, isolationSetup }) => {
  const run = source => window.webContents.executeJavaScript(source)
  isolationSetup(true)
  const marker = 'Synthetic workspace visibility marker'
  await remoteCall('eleckoiCharacters/create', { character: { id: 'workspace-protected-role', name: 'Synthetic protected role' } })
  const role = await remoteCall('eleckoiConversations/create', { input: { title: 'Synthetic protected role', metadata: { characterId: 'workspace-protected-role' } } })
  const roleSession = (await remoteCall('session/list', { _request: {} })).items.find(item => item.projections?.values?.agentPreset === 'eleckoi-active').sessionId
  const studio = await remoteCall('eleckoiCreatorStudioSessions/create', { characterId: '' })
  await remoteCall('eleckoiCreatorStudioSessions/rename', { sessionId: studio.sessionId, title: 'Synthetic protected studio' })
  mkdirSync(hostOptions.workspaceRoot, { recursive: true })
  const loose = await remoteCall('session/create', { request: { cwd: hostOptions.workspaceRoot, agentPreset: 'cordis' } })
  await remoteCall('session/rename', { request: { sessionId: loose.sessionId, title: 'Synthetic native workspace' } })
  for (const sessionId of [roleSession, studio.sessionId, loose.sessionId]) {
    const beforeRequests = requests()
    await remoteCall('session/prompt', { request: { requestId: 'synthetic-visibility-' + sessionId, sessionId, mode: 'queue', content: [{ type: 'text', text: marker }] } })
    const deadline = Date.now() + 15000
    let settled = false
    while (Date.now() < deadline) {
      const row = (await remoteCall('session/list', { _request: {} })).items.find(item => item.sessionId === sessionId)
      if (requests() > beforeRequests && !row.running && row.projections?.values?.sessionListMetadata?.blank === false) { settled = true; break }
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    if (!settled) throw new Error('Isolation fixture did not become a settled nonblank Session: ' + sessionId)
  }
  const globalMatches = await remoteCall('session/search', { request: { query: marker } })
  if (![roleSession, studio.sessionId, loose.sessionId].every(id => globalMatches.items.some(item => item.sessionId === id))) {
    throw new Error('Isolation fixtures were not searchable in the shared catalog: ' + JSON.stringify(globalMatches))
  }
  const protectedSessions = (await remoteCall('session/list', { _request: {} })).items.filter(item => [roleSession, studio.sessionId].includes(item.sessionId))
  if (protectedSessions.length !== 2) throw new Error('Protected Session fixtures were not retained in the global catalog')
  isolationSetup(false)
  await waitFor(`Array.from(document.querySelectorAll('.qq-rail .rail-nav-group button[aria-label]')).every(button => button.querySelector('svg')) && document.querySelector('.rail-brand-seat img')?.complete`, 'Original navigation icons did not finish loading')
  await run(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`)
  const originalRail = await run(`(() => {
    const rail = document.querySelector('.navigation-rail-shell');
    return { width: rail?.getBoundingClientRect().width,
      buttons: Array.from(rail?.querySelectorAll('button[aria-label]') || []).map(button => button.getAttribute('aria-label')),
      official: !!document.querySelector('.native-workspace-sidebar'), list: !!document.querySelector('.side-panel-shell') };
  })()`)
  if (!originalRail.width || originalRail.official || !originalRail.list || !originalRail.buttons.includes('更多插件')) {
    throw new Error('Original product navigation was not restored: ' + JSON.stringify(originalRail))
  }
  if (process.env.ELECKOI_CLIENT_PROBE_SCREENSHOT) writeFileSync(process.env.ELECKOI_CLIENT_PROBE_SCREENSHOT.replace(/\.png$/, '-original-navigation.png'), (await window.webContents.capturePage()).toPNG())
  const permission = await remoteCall('permissionPresets/catalog', {})
  const values = permission.options.map(option => option.value)
  if (JSON.stringify(values) !== JSON.stringify(['read-only', 'workspace-write', 'danger-full-access'])
    || permission.defaultPreset !== 'workspace-write') throw new Error('Unexpected permissions: ' + JSON.stringify(permission))
  mkdirSync(hostOptions.workspaceRoot, { recursive: true })
  await remoteCall('workspace/create', { request: { path: hostOptions.workspaceRoot } })
  await run(`document.querySelector('.qq-rail button[aria-label="更多插件"]').click()`)
  await waitFor(`Array.from(document.querySelectorAll('[role="menuitem"]')).some(button => button.innerText === '进入工作区界面')`, 'Workspace entry did not render')
  const menuRows = await run(`Array.from(document.querySelectorAll('[role="menuitem"]')).map(button => button.innerText)`)
  if (menuRows.indexOf('进入工作区界面') !== menuRows.indexOf('创建你的插件') + 1) throw new Error('Workspace entry was not below plugin creation: ' + menuRows)
  await run(`Array.from(document.querySelectorAll('[role="menuitem"]')).find(button => button.innerText === '进入工作区界面').click()`)
  await waitFor(`Boolean(document.querySelector('.native-workspace-sidebar button[aria-label="新建会话"]')) && Boolean(document.querySelector('[data-composer-input]'))`, 'Workspace entry did not reach the native Workspace')
  if (await run(`document.querySelector('[data-composer-input]').textContent.includes('创建一个带左侧栏入口的 DSH 插件。') || Boolean(document.querySelector('[role="menuitem"]'))`)) throw new Error('Workspace entry prepared a plugin prompt or left its menu open')
  if (requests() !== 0) throw new Error('Entering Workspace sent a model request')
  await run(`document.querySelector('.qq-rail button[aria-label="消息"]').click()`)
  await waitFor(`Boolean(document.querySelector('.side-panel-shell')) && !document.querySelector('.native-workspace-sidebar')`, 'Workspace entry did not return to roleplay')
  await run(`document.querySelector('.qq-rail button[aria-label="更多插件"]').click()`)
  await waitFor(`Array.from(document.querySelectorAll('[role="menuitem"]')).some(button => button.innerText.includes('创建你的插件'))`, 'Plugin creation action did not render')
  await run(`Array.from(document.querySelectorAll('[role="menuitem"]')).find(button => button.innerText.includes('创建你的插件')).click()`)
  await waitFor(`Boolean(document.querySelector('.native-workspace-sidebar button[aria-label="新建会话"]')) && document.querySelector('[data-composer-input]')?.textContent.includes('创建一个带左侧栏入口的 DSH 插件。')`, 'Official Workspace sidebar and Creator draft did not render')
  await run(`Array.from(document.querySelectorAll('.native-workspace-sidebar [data-row-key^="workspace:"][aria-expanded="false"]')).forEach(row => row.click())`)
  await waitFor(`document.querySelector('.native-workspace-sidebar').innerText.includes('Synthetic native workspace')`, 'Ordinary native Session disappeared from Workspace')
  if (await run(`document.querySelector('.native-workspace-sidebar').innerText.includes('Synthetic protected')`)) throw new Error('Product Sessions leaked into Workspace rows')
  await run(`document.querySelector('.native-workspace-sidebar button[aria-label="搜索会话"]').click()`)
  await waitFor(`document.querySelector('.native-workspace-sidebar input')`, 'Workspace search did not open')
  await run(`(() => { const field = document.querySelector('.native-workspace-sidebar input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(field, ${JSON.stringify(marker)}); field.dispatchEvent(new Event('input', { bubbles: true })); })()`)
  await waitFor(`document.querySelector('.native-workspace-sidebar').innerText.includes('Synthetic native workspace')`, 'Workspace content search lost its native match')
  await new Promise(resolve => setTimeout(resolve, 500))
  if (await run(`document.querySelector('.native-workspace-sidebar').innerText.includes('Synthetic protected')`)) throw new Error('Product Sessions leaked into Workspace content search')
  await run(`document.querySelector('.native-workspace-sidebar input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
  await waitFor(`document.querySelector('.native-workspace-sidebar').innerText.includes('工作区')`, 'Workspace search did not return to its grouped browser')
  if (requests() !== 0) throw new Error('Preparing a plugin draft sent a model request')
  const frames = []
  for (const theme of ['light', 'dark']) for (const width of [1440, 900, 700]) {
    nativeTheme.themeSource = theme
    window.setSize(width, 900)
    await new Promise(resolve => setTimeout(resolve, 250))
    await run(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`)
    const box = await run(`(() => {
      const sidebar = document.querySelector('.native-workspace-sidebar').getBoundingClientRect();
      const main = document.querySelector('.main-panel-shell').getBoundingClientRect();
      const rail = document.querySelector('.navigation-rail-shell').getBoundingClientRect();
      const caption = document.querySelector('.native-workspace-caption').getBoundingClientRect();
      const brand = document.querySelector('.native-workspace-body .eleckoi-wordmark').getBoundingClientRect();
      const toggle = document.querySelector('.native-workspace-sidebar button[aria-label="收起侧边栏"]').getBoundingClientRect();
      const menu = document.querySelector('[data-desktop-menu-seat]').getBoundingClientRect();
      return { sidebar: { left: sidebar.left, right: sidebar.right, width: sidebar.width }, main: { left: main.left, right: main.right },
        caption: { bottom: caption.bottom, brandTop: brand.top, toggleTop: toggle.top, toggleBottom: toggle.bottom, toggleRight: toggle.right, menuLeft: menu.left },
        menuSeats: document.querySelectorAll('[data-desktop-menu-seat]').length,
        rail: { left: rail.left, right: rail.right, width: rail.width },
        railButtons: Array.from(document.querySelectorAll('.qq-rail button[aria-label]')).map(button => button.getAttribute('aria-label')),
        duplicatedNavigation: Array.from(document.querySelectorAll('.native-workspace-sidebar button[aria-label]')).some(button => ${JSON.stringify(originalRail.buttons)}.includes(button.getAttribute('aria-label'))),
        newSession: !!document.querySelector('.native-workspace-sidebar button[aria-label="新建会话"]'),
        workspace: document.querySelector('.native-workspace-sidebar').innerText.includes('工作区'),
        menuSeat: !!document.querySelector('[data-desktop-menu-seat]'),
        overflow: document.documentElement.scrollWidth > innerWidth, composer: !!document.querySelector('[data-composer-input]') };
    })()`)
    if (!box.newSession || !box.workspace || !box.composer || !box.menuSeat || box.menuSeats !== 1 || box.overflow || box.sidebar.width !== 280
      || box.caption.brandTop < box.caption.bottom || box.caption.toggleBottom > box.caption.bottom
      || box.caption.toggleTop < 0 || box.caption.toggleRight > box.caption.menuLeft
      || box.rail.left !== 0 || box.rail.width !== (width <= 1280 ? 52 : originalRail.width) || Math.abs(box.sidebar.left - box.rail.right) > 1
      || box.duplicatedNavigation || JSON.stringify(box.railButtons) !== JSON.stringify(originalRail.buttons)
      || Math.abs(box.main.left - box.sidebar.right) > 1) {
      throw new Error('Workspace layout failed: ' + JSON.stringify({ theme, width, box }))
    }
    frames.push({ theme, width, ...box })
    if (process.env.ELECKOI_CLIENT_PROBE_SCREENSHOT) {
      writeFileSync(process.env.ELECKOI_CLIENT_PROBE_SCREENSHOT.replace(/\.png$/, `-${theme}-${width}.png`), (await window.webContents.capturePage()).toPNG())
    }
  }
  nativeTheme.themeSource = 'light'
  window.setSize(1440, 1000)
  await run(`document.querySelector('.native-workspace-sidebar button[aria-label="收起侧边栏"]').click()`)
  await waitFor(`document.querySelector('.native-workspace-sidebar').getBoundingClientRect().width === 0 && document.querySelector('.navigation-rail-shell').getBoundingClientRect().width === ${originalRail.width}`, 'Collapsing Workspace did not keep the fixed navigation')
  if (await run(`document.querySelectorAll('[data-desktop-menu-seat]').length !== 1 || !document.querySelector('.main-panel-shell [data-desktop-menu-seat]')`)) throw new Error('Collapsed Workspace did not move its single caption menu to the main titlebar')
  await run(`document.querySelector('.main-panel-shell button[aria-label="展开侧边栏"]').click()`)
  await waitFor(`document.querySelector('.native-workspace-sidebar').getBoundingClientRect().width === 280`, 'Official sidebar did not expand')
  await waitFor(`document.querySelector('button[aria-label="发送消息"]')?.disabled === false`, 'Native send did not enable')
  await run(`document.querySelector('button[aria-label="发送消息"]').click()`)
  await waitFor(`document.body.innerText.includes('Synthetic regenerated reply 4')`, 'Native plugin creation did not finish its skill/read round')
  if (requests() !== 4) throw new Error('Unexpected plugin request count: ' + requests())
  const catalog = JSON.stringify(modelBodies[0])
  for (const name of ['eleckoi-plugin-development', 'cordis-plugin-development', 'cordis_inspect_query', 'plugin_manager']) {
    if (!catalog.includes(name)) throw new Error('Creator request omitted ' + name)
  }
  for (const [index, text] of [[1, 'Product-specific rules'], [2, 'Persistent Harness plugins'], [3, '# 服务接口']]) {
    if (!JSON.stringify(modelBodies[index]).includes(text)) throw new Error('Real skill/reference read did not reach request ' + index + ': ' + text)
  }
  const sessions = (await remoteCall('session/list', { _request: {} })).items
  const created = sessions.find(item => item.projections.values.agentPreset === 'cordis' && item.sessionId !== loose.sessionId)
  if (!created) throw new Error('Plugin creation did not retain the official cordis preset: ' + JSON.stringify(sessions))
  window.setSize(700, 900)
  await new Promise(resolve => setTimeout(resolve, 250))
  await run(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`)
  await run(`document.querySelector('[data-sidebar-right-expand]').click()`)
  await waitFor(`document.querySelector('[data-sidebar-right-panel][data-sidebar-right-open]') && document.querySelector('.native-workspace-sidebar').getBoundingClientRect().width === 0 && document.querySelector('.navigation-rail-shell').getBoundingClientRect().width === 52`, 'Narrow right sidebar did not preserve fixed navigation while hiding Workspace')
  await run(`document.querySelector('[data-sidebar-right-toggle]').click()`)
  await waitFor(`!document.querySelector('[data-sidebar-right-panel][data-sidebar-right-open]')`, 'Native right sidebar did not close')
  await run(`document.querySelector('.main-panel-shell button[aria-label="展开侧边栏"]').click()`)
  await waitFor(`document.querySelector('.native-workspace-sidebar').getBoundingClientRect().width === 280`, 'Workspace did not reopen after narrow right sidebar')
  window.setSize(1440, 1000)
  await new Promise(resolve => setTimeout(resolve, 250))
  await run(`document.querySelector('.qq-rail button[aria-label="消息"]').click()`)
  await waitFor(`Boolean(document.querySelector('.side-panel-shell')) && !document.querySelector('.native-workspace-sidebar')`, 'Returning to roleplay did not restore its list')
  if (await run(`document.documentElement.hasAttribute('data-windows-titlebar')`)) throw new Error('Workspace Windows chrome leaked into roleplay')
  await waitFor(`document.querySelector('.qq-rail button[aria-label="消息"]')?.getAttribute('aria-current') === 'page'`, 'Original navigation did not identify the current product page')
  await waitFor(`document.querySelector('.navigation-rail-shell')?.getBoundingClientRect().width === ${originalRail.width}`, 'Original navigation geometry did not return')
  const restoredRail = await run(`(() => {
    const rail = document.querySelector('.navigation-rail-shell');
    return { width: rail?.getBoundingClientRect().width,
      buttons: Array.from(rail?.querySelectorAll('button[aria-label]') || []).map(button => button.getAttribute('aria-label')),
      official: !!document.querySelector('.native-workspace-sidebar'), list: !!document.querySelector('.side-panel-shell') };
  })()`)
  if (JSON.stringify(originalRail) !== JSON.stringify(restoredRail)) throw new Error('Returning changed the original navigation: ' + JSON.stringify({ originalRail, restoredRail }))
  await run(`(() => { const row = Array.from(document.querySelectorAll('.conversation-main b')).find(node => node.innerText === 'Synthetic protected role').closest('button'); if (!row.classList.contains('active')) row.click(); })()`)
  await waitFor(`Boolean(document.querySelector('[data-composer-input]')) && Boolean(document.querySelector('[data-sidebar-right-expand]'))`, 'Roleplay did not bind after leaving native Workspace')
  await run(`document.querySelector('[data-sidebar-right-expand]').click()`)
  await waitFor(`Boolean(document.querySelector('[data-sidebar-right-panel][data-sidebar-right-open]'))`, 'Roleplay sidebar vanished after visiting native Workspace')
  const rightbarSession = await run(`document.querySelector('[data-sidebar-right-panel][data-sidebar-right-open]').dataset.sidebarRightSession`)
  if (rightbarSession !== roleSession) throw new Error('Roleplay sidebar selected the previous Workspace Session')
  await run(`document.querySelector('[data-sidebar-right-toggle]').click()`)
  await waitFor(`!document.querySelector('[data-sidebar-right-panel][data-sidebar-right-open]') && Boolean(document.querySelector('[data-sidebar-right-expand]'))`, 'Roleplay sidebar did not close after native Workspace')
  await run(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`)
  if (process.env.ELECKOI_CLIENT_PROBE_SCREENSHOT) writeFileSync(process.env.ELECKOI_CLIENT_PROBE_SCREENSHOT.replace(/\.png$/, '-returned-navigation.png'), (await window.webContents.capturePage()).toPNG())
  await run(`document.querySelector('.qq-rail button[aria-label="社区"]').click()`)
  await waitFor(`Boolean(document.querySelector('.community-dialog[role="dialog"]'))`, 'Original navigation did not preserve the community action')
  const failures = errors.filter(error => /Slot entry crashed|TypeError|当前聊天与输入框会话不一致/.test(error))
  if (failures.length) throw new Error(failures.join('\n'))
  const remaining = (await remoteCall('session/list', { _request: {} })).items
  for (const before of protectedSessions) {
    const after = remaining.find(item => item.sessionId === before.sessionId)
    if (!after || JSON.stringify(after.projections) !== JSON.stringify(before.projections)) throw new Error('Workspace navigation changed a protected Session')
  }
  if (!(await remoteCall('eleckoiConversations/list', {})).some(item => item.id === role.conversation.id)) throw new Error('Roleplay catalog lost its protected conversation')
  if (!(await remoteCall('eleckoiCreatorStudioSessions/list', {})).some(item => item.sessionId === studio.sessionId)) throw new Error('Studio catalog lost its protected conversation')
  process.stdout.write('Real roleplay and Studio Sessions stayed in their own catalogs and out of Workspace rows and content search; ordinary native Session remained visible.\n')
  process.stdout.write('Original navigation restored before and after plugin creation: ' + JSON.stringify(originalRail) + '\nOfficial plugin creation submitted, loaded official and ElecKoi skills and product reference, retained cordis Session and three permission choices; sidebar layout/collapse/return passed: ' + JSON.stringify(frames) + '\n')
}
