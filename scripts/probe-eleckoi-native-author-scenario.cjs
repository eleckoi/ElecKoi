const assert = require('node:assert/strict')
const { existsSync, readFileSync, writeFileSync } = require('node:fs')
const { join, resolve } = require('node:path')
const { pathToFileURL } = require('node:url')
const { tmpdir } = require('node:os')

/** Exercises the built desktop Client against its real isolated Host and local model endpoint. */
exports.runNativeAuthorScenario = async ({ window, ready, cookie, waitFor, requests, modelBodies, errors, productDataRoot, inspectRetiredNavigations }) => {
  process.stdout.write('Native author Client: preparing synthetic role and preset.\n')
  const boot = ready.injections.find(row => row?.kind === 'global' && row.name === '__DSH_BOOT__')
  assert(!boot.value.entries.some(entry => entry.id === '@eleckoi/dsh-client-html-resources'))
  const call = async (method, args) => {
    const response = await fetch(new URL(`/api/${method}`, ready.url), {
      method: 'POST', headers: { cookie, origin: new URL(ready.url).origin, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: 'synthetic-native-desktop', method, payload: { args } }),
    })
    const result = (await response.json()).result
    assert(response.ok, method)
    assert.notEqual(result.ok, false, `${method}: ${JSON.stringify(result)}`)
    return result.value ?? result
  }
  const characterId = 'synthetic-native-character'
  await call('eleckoiCharacters/create', { character: { id: characterId, name: 'Synthetic native character' } })
  const preset = await call('eleckoiAgentPresets/create', { name: 'Synthetic native preset', libraryGroupId: '', purpose: 'roleplay' })
  const settingLibrary = await call('eleckoiCharacterConfiguration/readSettingLibrary', { characterId })
  const { createEntryDraft } = await import(pathToFileURL(resolve('apps/web/src/modules/settingLibraries/model/settingLibraryEditing.js')).href)
  const option = { ...createEntryDraft('', 1, []), triggerMode: 'always', position: 'instructions',
    promptPositionId: '', enabled: true, insertRole: 'system' }
  const chatOptions = [
    { ...option, id: 'synthetic-chat-option-a', title: 'Synthetic chat option A', content: 'Synthetic chat setting option A' },
    { ...option, id: 'synthetic-chat-option-b', title: 'Synthetic chat option B', content: 'Synthetic chat setting option B', enabled: false },
  ]
  const presetOptions = [
    { ...option, id: 'synthetic-preset-option-a', title: 'Synthetic preset option A', content: 'Synthetic preset prompt option A' },
    { ...option, id: 'synthetic-preset-option-b', title: 'Synthetic preset option B', content: 'Synthetic preset prompt option B', enabled: false },
  ]
  const savedRoleLibrary = await call('eleckoiCharacterConfiguration/saveSettingLibrary', { characterId,
    library: { ...settingLibrary, entries: [...settingLibrary.entries, ...chatOptions] } })
  await call('eleckoiAgentPresets/save', { preset: { ...preset, entries: [...preset.entries, ...presetOptions] }, expectedRegexRules: [] })
  await call('eleckoiAgentPresets/setActive', { presetId: preset.id })
  const config = await call('eleckoiCharacterConfiguration/readVariableConfig', { characterId })
  const fields = { initialStateJson: '{"value":1}', variables: [{ id: 'synthetic-value', title: 'value', objectId: '',
    enabled: true, type: 'number', defaultValue: '1', description: '', updateRule: '', readMode: 'on_demand',
    order: 1, treeViewOrder: 1, createdAt: '', updatedAt: '' }],
    schemaCode: 'z.looseObject({value:z.number().min(0)}).transform(state=>({...state,value:state.value+1}))' }
  const versions = config.versions.filter(version => version.id === config.activeVersionId)
  assert.equal(versions.length, 1)
  Object.assign(config, fields); Object.assign(versions[0], fields)
  await call('eleckoiCharacterConfiguration/saveVariableConfig', { characterId, config })
  const openings = await call('eleckoiCharacterConfiguration/readCharacterOpenings', { characterId })
  await call('eleckoiCharacterConfiguration/saveCharacterOpenings', { characterId, value: { ...openings,
    defaultOpeningMessageId: 'synthetic-native-opening', openingMessages: [{ id: 'synthetic-native-opening',
      title: 'Synthetic native opening', content: 'Synthetic opening', variableVersionId: config.activeVersionId }] } })
  const owners = [['global', ''], ['preset', preset.id], ['character', characterId]]
  const scriptPanel = { id: 'synthetic-settings', title: 'Synthetic script settings', html: '<!doctype html><html><head><meta name="eleckoi-author-api" content="0.1.0"></head><body><label>Multiplier <input id="multiplier" type="number"></label><button id="save-settings">Save</button><output id="settings-status"></output><script type="module" src="../panel.js"></script></body></html>' }
  for (const [scope, ownerId] of owners) {
    const library = await call('eleckoiCharacterConfiguration/readScriptLibrary', { scope, ownerId })
    library.enabled = true
    library.trees = [{ type: 'script', id: 'synthetic-script', name: 'Synthetic native script', enabled: true, info: '',
      data: {}, button: { enabled: true, buttons: [] }, export_with: { data: true, button: true },
      runtime: { kind: 'eleckoi-module', apiVersion: 1 }, content: `export default(context)=>{const{api,scope}=context;
        const stop=api.variables.registerRule({id:'synthetic-rule',stage:'afterSchema',async run(candidate){
          await new Promise(resolve=>setTimeout(resolve,20));candidate.signal.throwIfAborted();
          candidate.state[scope+'Visits']=(candidate.state[scope+'Visits']||0)+1;
          if(scope==='character')candidate.state.derived=candidate.state.value*(context.settings.multiplier||2);
        }});
        document.body.dataset.nativeScope=scope;
        globalThis.nativeContext=context;
        const request=api.scripts.registerHandler('inspect',({data,caller})=>({data,caller,scope}));
        const fill=api.scripts.registerHandler('fill-draft',async({api,data})=>{await api.input.set(data);return {filled:data}});
        const fail=api.scripts.registerHandler('fail',()=>{throw new Error('Synthetic request failure')});
        const button=api.ui.registerButton({id:'settings',label:'Synthetic '+scope+' settings',
          async onClick({api}){await api.ui.openPanel(${JSON.stringify(scriptPanel)})}});
        return()=>{request();fill();fail();button();stop();document.body.dataset.cleaned='yes'};
      }` }]
    await call('eleckoiCharacterConfiguration/saveScriptLibrary', { library })
    const files = await call('eleckoiCharacterConfiguration/readScriptWorkspace', { scope, ownerId })
    writeFileSync(join(files.path, 'panel.js'), `const api=await window.ElecKoiReady;
      document.body.style.cssText='font:15px system-ui;margin:16px;color:rgb(32,32,32);background:white;overflow-wrap:anywhere';
      const field=document.querySelector('#multiplier'),output=document.querySelector('#settings-status');
      let settings=await api.script.getSettings();field.value=settings.values.multiplier||2;output.textContent='ready';
      document.querySelector('#save-settings').onclick=async()=>{try{
        settings=await api.script.setSettings({multiplier:Number(field.value)},settings.revision);
        output.textContent=JSON.stringify(settings);output.dataset.saved='yes';
      }catch(error){output.textContent=error.message;output.dataset.saved='error'}};`)
  }
  const created = await call('eleckoiConversations/create', { input: { title: 'Synthetic native chat', metadata: { characterId } } })
  const conversationId = created.conversation.id
  const owner = { scope: 'character', characterId }
  const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="eleckoi-author-api" content="0.1.0"><link rel="stylesheet" href="page.css"></head><body><img src="pixel.png" alt=""><label>Value<input id="value" type="number" value="5"></label><button id="draft">Fill draft</button><button id="send">Confirm</button><output id="result"></output><script type="module" src="page.js"></script></body></html>'
  const program = `const api=await window.ElecKoiReady;
    if(globalThis.TavernHelper||globalThis.Mvu||globalThis.SillyTavern)throw new Error('Unexpected compatibility runtime');
    window.nativeEvents=[];
    for(const name of ['agent.state.changed','agent.run.finished'])api.events.on(name,event=>window.nativeEvents.push({name,...event}));
    const output=document.querySelector('#result');
    document.querySelector('#draft').onclick=()=>api.scripts.request(${JSON.stringify({ scope: 'character', ownerId: characterId, scriptId: 'synthetic-script' })},'fill-draft','Synthetic draft');
    document.querySelector('#send').onclick=async()=>{output.dataset.status='running';try{
      const state=await api.variables.merge({value:Number(document.querySelector('#value').value)});
      const receipt=await api.chat.send('Synthetic accepted '+state.value);
      output.textContent=JSON.stringify({state,receipt,context:await api.context.current()});output.dataset.status='accepted';
    }catch(error){output.textContent=error.message;output.dataset.status='rejected'}};
    output.textContent='ready';`
  await window.loadURL(`dsh-app://app/?view=character-editor&character=${characterId}`)
  await waitFor(`document.querySelector('#character-editor-navigation button[aria-label="前端"]')`, 'Character configuration frontend entry did not render')
  await window.webContents.executeJavaScript(`document.querySelector('#character-editor-navigation button[aria-label="前端"]').click()`)
  const workbench = `document.querySelector('.character-frontend-editor')?.shadowRoot`
  await waitFor(`${workbench}?.querySelector('[aria-label="角色前端包"] input[type="file"]')`, 'Native role package browser did not render')
  const { createRequire } = require('node:module')
  const { zipSync } = createRequire(require.resolve('@eleckoi/dsh-product-data'))('fflate')
  const files = {
    'eleckoi.frontend.json': Buffer.from(JSON.stringify({ manifestVersion: 1, sdkVersion: '0.1.0', scope: 'character', entryFile: 'index.html',
      bindings: [{ target: 'root', view: 'chat', entryFile: 'index.html' }] })),
    'index.html': Buffer.from(html), 'page.js': Buffer.from(program),
    'page.css': Buffer.from('body{font:15px system-ui;margin:16px;color:rgb(32,32,32);background:white}label,output{display:block;margin:12px 0}output{overflow-wrap:anywhere}input,button{padding:8px;max-width:100%;box-sizing:border-box}'),
    'pixel.png': Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6n8AAAAASUVORK5CYII=', 'base64'),
  }
  const archive = Buffer.from(zipSync(files)).toString('base64')
  await window.webContents.executeJavaScript(`(() => {
    const input=${workbench}.querySelector('input[type="file"]'),transfer=new DataTransfer();
    transfer.items.add(new File([Uint8Array.from(atob(${JSON.stringify(archive)}),value=>value.charCodeAt(0))],'synthetic-native.zip',{type:'application/zip'}));
    input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));
  })()`)
  await waitFor(`${workbench}?.querySelector('.cf-source')?.textContent.includes('eleckoi-author-api')`, 'Imported role entry file did not render')
  const workspace = await call('eleckoiAuthorFrontends/workspace', { owner })
  assert.equal(workspace.projects.length, 1); assert.equal(workspace.selectedProjectId, null)
  const projectId = workspace.projects[0].id
  assert.deepEqual(workspace.projects[0].files.slice().sort(), Object.keys(files).sort())
  assert.equal(await window.webContents.executeJavaScript(`Boolean(${workbench}.querySelector('textarea'))`), false)
  const captureEditor = async path => {
    await window.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())))')
    const image = await new Promise((resolve, reject) => {
      const painted = (_event, _dirty, image) => { clearTimeout(timer); window.webContents.removeListener('paint', painted); resolve(image) }
      const timer = setTimeout(() => { window.webContents.removeListener('paint', painted); reject(new Error('Editor did not repaint')) }, 15000)
      window.webContents.on('paint', painted); window.webContents.invalidate()
    })
    writeFileSync(path, image.toPNG())
  }
  await window.webContents.executeJavaScript(`${workbench}.querySelector('[aria-label="包内文件"] button[title="page.js"]').click()`)
  await waitFor(`${workbench}.querySelector('.cf-source')?.textContent.includes('Synthetic accepted')`, 'Imported script file did not render')
  const frontendShot = join(tmpdir(), 'eleckoi-frontend-package-files.png')
  await captureEditor(frontendShot)
  await window.webContents.executeJavaScript(`document.querySelector('#character-editor-navigation button[aria-label="脚本"]').click()`)
  await waitFor(`document.querySelector('[aria-label="角色脚本"] .script-list-row')`, 'Script editor directory did not load')
  await window.webContents.executeJavaScript(`(() => {
    const row=document.querySelector('[aria-label="角色脚本"] .script-list-row'),bounds=row.getBoundingClientRect();
    row.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:bounds.left+40,clientY:bounds.top+16}));
  })()`)
  await waitFor(`document.querySelector('[role="menu"][aria-label="脚本操作"]')`, 'Script context menu did not open')
  await window.webContents.executeJavaScript(`document.querySelector('[role="menu"][aria-label="脚本操作"] button').click()`)
  await waitFor(`document.querySelector('.script-inspector')`, 'Script context edit command did not open the inspector')
  await waitFor(`document.querySelector('.editor-sidebar-pane').getBoundingClientRect().right<=innerWidth`, 'Script inspector did not finish entering the viewport')
  const editorBounds = async () => window.webContents.executeJavaScript(`(() => {
    const toolbar=document.querySelector('.script-libraries-panel .editor-collection-toolbar').getBoundingClientRect(),pane=document.querySelector('.editor-sidebar-pane').getBoundingClientRect();
    return {belowToolbar:pane.top>=toolbar.bottom-1,toolbarFullWidth:Math.abs(toolbar.right-document.querySelector('.script-libraries-panel').getBoundingClientRect().right)<1,
      withinViewport:pane.right<=innerWidth&&pane.bottom<=innerHeight,
      folderControl:Boolean(document.querySelector('.script-inspector .script-identity select'))};
  })()`)
  assert.deepEqual(await editorBounds(), { belowToolbar: true, toolbarFullWidth: true, withinViewport: true, folderControl: true })
  const scriptEditorShot = join(tmpdir(), 'eleckoi-script-editor-desktop.png')
  await captureEditor(scriptEditorShot)
  window.setContentSize(1024, 800)
  await waitFor(`innerWidth<=1030&&document.querySelector('.script-inspector').getBoundingClientRect().right<=innerWidth`, 'Script editor did not fit a narrower desktop')
  assert.deepEqual(await editorBounds(), { belowToolbar: true, toolbarFullWidth: true, withinViewport: true, folderControl: true })
  window.setContentSize(1440, 1000)
  await waitFor(`innerWidth>=1400`, 'Desktop editor viewport did not return')
  process.stdout.write(`Native editor screenshots: ${frontendShot}, ${scriptEditorShot}\n`)
  await window.webContents.executeJavaScript(`document.querySelector('#character-editor-navigation button[aria-label="前端"]').click()`)
  await waitFor(`${workbench}?.querySelector('[aria-label="包内文件"] button[title="index.html"]')`, 'Frontend package directory did not reload')
  await window.webContents.executeJavaScript(`${workbench}.querySelector('[aria-label="包内文件"] button[title="index.html"]').click()`)
  await waitFor(`${workbench}?.querySelector('.cf-source')?.textContent.includes('eleckoi-author-api')`, 'Native role entry file did not reload')
  assert.equal((await call('eleckoiAuthorFrontends/readFile', { owner, projectId, input: { path: 'index.html' } })).content, html)
  assert.equal((await call('eleckoiAuthorFrontends/readFile', { owner, projectId, input: { path: 'page.js' } })).content, program)
  await window.webContents.executeJavaScript(`${workbench}.querySelector('.cf-use').click()`)
  await waitFor(`!${workbench}?.querySelector('.cf-use')`, 'Role frontend did not enable')
  assert.equal((await call('eleckoiAuthorFrontends/workspace', { owner })).selectedProjectId, projectId)
  await window.loadURL('dsh-app://app/')
  await waitFor(`document.querySelector('button[aria-label="消息"]')`, 'Main chat navigation did not render')
  await window.webContents.executeJavaScript(`document.querySelector('button[aria-label="消息"]').click()`)
  const chats = await call('eleckoiConversations/list', {})
  assert.equal(chats.length, 1); assert.equal(chats[0].id, conversationId)
  await waitFor(`document.querySelectorAll('.conversation-item').length===1`, 'Native chat was missing from the directory')
  await window.webContents.executeJavaScript(`(() => {
    const entries=document.querySelectorAll('.conversation-item');if(entries.length!==1)throw new Error('Synthetic chat directory is ambiguous');
    if(!entries[0].classList.contains('active'))entries[0].click();
  })()`)
  const page = `Array.from(document.querySelectorAll('iframe')).find(frame=>frame.contentDocument?.querySelector('#result'))`
  await waitFor(`${page}?.contentDocument.querySelector('#result')?.textContent==='ready'`, 'Native role page did not boot in the chat')
  await waitFor(`Array.from(document.querySelectorAll('iframe[title="ElecKoi author script"]')).length===3&&Array.from(document.querySelectorAll('iframe[title="ElecKoi author script"]')).every(frame=>frame.contentDocument.body.dataset.nativeScope)`, 'Three native scripts did not start')
  const actual = await window.webContents.executeJavaScript(`(() => {
    const frame=${page};window.__nativeOldApi=frame.contentWindow.ElecKoi;
    window.__nativeScriptPages=[...document.querySelectorAll('iframe[title="ElecKoi author script"]')].map(frame=>frame.contentWindow);
    return {image:frame.contentDocument.querySelector('img').naturalWidth,
      color:frame.contentWindow.getComputedStyle(frame.contentDocument.body).color};
  })()`)
  assert.equal(actual.image, 1); assert.equal(actual.color, 'rgb(32, 32, 32)')
  await waitFor(`${page}?.contentWindow.ElecKoi?.scripts.list().then(result=>result.items.length===3&&result.items.every(item=>item.actions.includes('inspect'))).catch(error=>{if(error.code==='SCRIPTS_NOT_READY')return false;throw error})`, 'Synthetic script request handlers did not finish startup')
  const scriptRequests = await window.webContents.executeJavaScript(`(async () => {
    const api=${page}.contentWindow.ElecKoi;
    const items=(await api.scripts.list()).items;
    if(items.length!==3)throw new Error('Expected three exact script identities');
    const results=await Promise.all(items.map(item=>api.scripts.request(item.identity,'inspect',{text:'Synthetic frontend request'})));
    let failed;try{await api.scripts.request(items[0].identity,'fail',null)}catch(error){failed={code:error.code,message:error.message}}
    return {results,failed};
  })()`)
  assert.deepEqual(scriptRequests.results.map(result => result.scope), ['global', 'preset', 'character'])
  assert(scriptRequests.results.every(result => result.data.text === 'Synthetic frontend request' && result.caller.surface === 'character-frontend'
    && result.caller.conversationId === conversationId && result.caller.projectId === projectId))
  assert.deepEqual(scriptRequests.failed, { code: 'SCRIPT_HANDLER_FAILED', message: 'Synthetic request failure' })
  process.stdout.write('Native author Client: frontend requests reached three exact script handlers with real results and errors.\n')
  const scriptSettings = await window.webContents.executeJavaScript(`(async () => {
    const frame=[...document.querySelectorAll('iframe[title="ElecKoi author script"]')].find(frame=>frame.contentDocument.body.dataset.nativeScope==='character');
    const api=frame.contentWindow.ElecKoi;
    const before=await api.script.getSettings();
    const after=await api.script.setSettings({multiplier:3},before.revision);
    return {before,after,unchanged:frame.contentWindow===window.__nativeScriptPages[2],
      current:frame.contentWindow.nativeContext.settings,pending:frame.contentWindow.__ElecKoiAuthorPendingCount()};
  })()`)
  assert.equal(scriptSettings.unchanged, true); assert.equal(scriptSettings.pending, 0)
  assert.deepEqual(scriptSettings.after.values, { multiplier: 3 })
  assert.deepEqual(scriptSettings.current, { multiplier: 3 })
  assert.equal(scriptSettings.after.revision, scriptSettings.before.revision + 1)
  await window.webContents.executeJavaScript(`document.querySelector('button[aria-label="扮演菜单"]').click()`)
  await waitFor(`document.querySelector('.composer-more-menu')`, 'Chat action menu did not open')
  await window.webContents.executeJavaScript(`[...document.querySelectorAll('.composer-more-menu button')].find(button=>button.textContent==='脚本').click()`)
  await waitFor(`document.querySelectorAll('[aria-label="脚本按钮"] button').length===3`, 'Three scoped script buttons did not render')
  await window.webContents.executeJavaScript(`[...document.querySelectorAll('[aria-label="脚本按钮"] button')].find(button=>button.title==='Synthetic native script · Synthetic character settings').click()`)
  const settingsPage = `document.querySelector('.native-script-dialog iframe')`
  await waitFor(`${settingsPage}?.contentDocument.querySelector('#settings-status')?.textContent==='ready'`, 'Script panel relative module or native SDK did not boot')
  const panelRequest = await window.webContents.executeJavaScript(`${settingsPage}.contentWindow.ElecKoi.scripts.request(${JSON.stringify({ scope: 'character', ownerId: characterId, scriptId: 'synthetic-script' })},'inspect',null)`)
  assert.equal(panelRequest.caller.surface, 'script-panel')
  assert.deepEqual(panelRequest.caller.script, { scope: 'character', ownerId: characterId, scriptId: 'synthetic-script' })
  assert.equal(await window.webContents.executeJavaScript(`${settingsPage}.contentDocument.querySelector('#multiplier').value`), '3')
  const desktopShot = join(tmpdir(), 'eleckoi-native-script-panel-desktop.png'), mobileShot = join(tmpdir(), 'eleckoi-native-script-panel-mobile.png')
  writeFileSync(desktopShot, (await window.webContents.capturePage()).toPNG())
  const compactPaint = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { window.webContents.removeListener('paint', painted); reject(new Error('Compact script panel did not repaint')) }, 15000)
    const painted = (_event, _dirty, image) => {
      if (image.getSize().width >= 800) return
      clearTimeout(timer); window.webContents.removeListener('paint', painted); resolve(image)
    }
    window.webContents.on('paint', painted)
  })
  window.setContentSize(390, 780)
  window.webContents.invalidate()
  await waitFor(`window.innerWidth<=400&&window.innerHeight<=800&&document.querySelector('.native-script-dialog').getBoundingClientRect().width<=window.innerWidth&&document.querySelector('.native-script-dialog').getBoundingClientRect().height<=window.innerHeight`, 'Script panel exceeded the compact viewport')
  writeFileSync(mobileShot, (await compactPaint).toPNG())
  window.setContentSize(1440, 1000)
  await waitFor(`window.innerWidth>=1400`, 'Desktop viewport did not return')
  await window.webContents.executeJavaScript(`(() => {
    const doc=${settingsPage}.contentDocument;doc.querySelector('#multiplier').value='3';doc.querySelector('#save-settings').click();
  })()`)
  await waitFor(`${settingsPage}?.contentDocument.querySelector('#settings-status')?.dataset.saved==='yes'`, 'Script panel settings did not save')
  assert.deepEqual(JSON.parse(await window.webContents.executeJavaScript(`${settingsPage}.contentDocument.querySelector('#settings-status').textContent`)).values, { multiplier: 3 })
  assert.equal(await window.webContents.executeJavaScript(`window.__nativeScriptPages.every(page=>[...document.querySelectorAll('iframe[title="ElecKoi author script"]')].some(frame=>frame.contentWindow===page))`), true)
  await window.webContents.executeJavaScript(`(() => {window.__nativePanelApi=${settingsPage}.contentWindow.ElecKoi;document.querySelector('[aria-label="关闭作者面板"]').click()})()`)
  await waitFor(`!document.querySelector('.native-script-dialog')`, 'Script panel did not close')
  assert.equal(await window.webContents.executeJavaScript(`window.__nativePanelApi.context.current().then(()=> 'unexpected',error=>error.code)`), 'FRAME_CLOSED')
  process.stdout.write(`Native script UI screenshots: ${desktopShot}, ${mobileShot}\n`)
  const storedScripts = await call('eleckoiCharacterConfiguration/readScriptLibrary', { scope: 'character', ownerId: characterId })
  assert.deepEqual(storedScripts.trees[0].data, { multiplier: 3 })
  const switches = await window.webContents.executeJavaScript(`(async () => {
    const api=${page}.contentWindow.ElecKoi;
    const preset=await api.presets.current();
    const settings=await api.settingLibrary.updateEntries([
      {id:'synthetic-chat-option-a',changes:{enabled:false}},
      {id:'synthetic-chat-option-b',changes:{enabled:true}},
    ]);
    const prompts=await api.presets.updateEntries(preset.id,[
      {id:'synthetic-preset-option-a',changes:{enabled:false}},
      {id:'synthetic-preset-option-b',changes:{enabled:true}},
    ]);
    return {settings,prompts,presetId:preset.id};
  })()`)
  assert.equal(switches.presetId, preset.id)
  assert.deepEqual(switches.settings.map(entry => entry.enabled), [false, true])
  assert.deepEqual(switches.prompts.map(entry => entry.enabled), [false, true])
  const roleOriginal = await call('eleckoiCharacterConfiguration/readSettingLibrary', { characterId })
  assert.deepEqual(roleOriginal.entries, savedRoleLibrary.entries.map(entry => switches.settings.find(changed => changed.id === entry.id) || entry))
  assert.deepEqual(roleOriginal.versions.find(version => version.id === roleOriginal.activeVersionId).entries, roleOriginal.entries)
  await window.webContents.executeJavaScript(`${page}.contentDocument.querySelector('#draft').click()`)
  await waitFor(`document.querySelector('[data-composer-input]')?.innerText==='Synthetic draft'`, 'Native SDK did not fill the real composer')
  const original = await call('eleckoiAuthorVariables/getState', { conversationId })
  await window.webContents.executeJavaScript(`(() => {const doc=${page}.contentDocument;doc.querySelector('#value').value='-1';doc.querySelector('#send').click()})()`)
  await waitFor(`${page}?.contentDocument.querySelector('#result')?.dataset.status==='rejected'`, 'Invalid native variables did not report failure')
  assert.equal(await call('eleckoiAuthorVariables/getState', { conversationId }), original); assert.equal(requests(), 0)
  await window.webContents.executeJavaScript(`(() => {const doc=${page}.contentDocument;doc.querySelector('#value').value='5';doc.querySelector('#send').click()})()`)
  await waitFor(`${page}?.contentDocument.querySelector('#result')?.dataset.status==='accepted'`, 'Native page variable retry and direct send did not complete')
  process.stdout.write('Native author Client: variable rejection, retry and direct generation passed.\n')
  const result = await window.webContents.executeJavaScript(`(() => {const frame=${page};return {
    result:JSON.parse(frame.contentDocument.querySelector('#result').textContent),events:frame.contentWindow.nativeEvents,
    draft:document.querySelector('[data-composer-input]').innerText};})()`)
  assert.deepEqual(result.result.state, { value: 6, globalVisits: 1, presetVisits: 1, characterVisits: 1, derived: 18 })
  assert.equal(result.result.context.characterId, characterId); assert.equal(result.result.context.conversationId, conversationId)
  assert.equal(result.result.context.projectId, projectId); assert.equal(result.draft, 'Synthetic draft'); assert.equal(requests(), 1)
  assert.equal(modelBodies.length, 1)
  const actualRequest = JSON.stringify(modelBodies[0])
  for (const marker of ['Synthetic chat setting option B', 'Synthetic preset prompt option B']) assert(actualRequest.includes(marker), marker)
  for (const marker of ['Synthetic chat setting option A', 'Synthetic preset prompt option A']) assert(!actualRequest.includes(marker), marker)
  assert.equal(result.events.filter(event => event.name === 'agent.run.finished').length, 1)
  const finished = result.events.find(event => event.name === 'agent.run.finished')
  assert.equal(finished.reason, 'completed'); assert.equal(finished.message.content, 'Synthetic native reply')
  assert(result.events.some(event => event.name === 'agent.state.changed' && event.generationId === finished.generationId))
  const input = await window.webContents.executeJavaScript(`(async () => {
    const api=${page}.contentWindow.ElecKoi;
    const read=await api.input.get();const appended=await api.input.append(' appended');
    const displayed=document.querySelector('[data-composer-input]').innerText;
    const cleared=await api.input.clear();const empty=await api.input.send();
    await api.input.set('Synthetic composer message');const submitted=await api.input.send();
    return {read,appended,displayed,cleared,empty,submitted};
  })()`)
  assert.deepEqual(input, { read: { text: 'Synthetic draft' }, appended: { text: 'Synthetic draft appended' },
    displayed: 'Synthetic draft appended', cleared: { text: '' }, empty: { submitted: false }, submitted: { submitted: true } })
  await waitFor(`${page}?.contentWindow.nativeEvents.filter(event=>event.name==='agent.run.finished').length===2&&document.querySelector('[data-composer-input]')?.innerText===''`, 'Native composer submission did not complete')
  const sent = await window.webContents.executeJavaScript(`${page}.contentWindow.ElecKoi.messages.list()`)
  assert.equal(sent.filter(message => message.role === 'user' && message.content === 'Synthetic composer message').length, 1)
  assert.equal(requests(), 2)
  const global = await call('eleckoiCharacterConfiguration/readScriptLibrary', { scope: 'global', ownerId: '' })
  global.enabled = false; await call('eleckoiCharacterConfiguration/saveScriptLibrary', { library: global })
  await waitFor(`document.querySelectorAll('iframe[title="ElecKoi author script"]').length===2`, 'Disabled global script remained running')
  await window.webContents.executeJavaScript(`document.querySelector('button[aria-label="扮演菜单"]').click()`)
  await waitFor(`document.querySelector('[role="menu"][aria-label="扮演菜单"]')`, 'Roleplay menu did not open')
  await window.webContents.executeJavaScript(`[...document.querySelectorAll('[role="menuitem"]')].find(button=>button.textContent.trim()==='脚本').click()`)
  await waitFor(`document.querySelectorAll('[aria-label="脚本按钮"] button').length===2`, 'Disabled global script button remained in the dialog')
  await window.webContents.executeJavaScript(`document.querySelector('button[aria-label="关闭脚本"]').click()`)
  process.stdout.write('Native author Client: scoped script shutdown and button dialog passed.\n')
  const updated = await window.webContents.executeJavaScript(`${page}.contentWindow.ElecKoi.variables.merge({value:7})`)
  assert.deepEqual(updated, { value: 8, globalVisits: 1, presetVisits: 2, characterVisits: 2, derived: 24 })
  await call('eleckoiAuthorFrontends/restoreDefault', { owner })
  await waitFor(`!(${page})&&document.body.innerText.includes('Synthetic native reply')`, 'Default transcript did not return')
  assert.equal(await window.webContents.executeJavaScript(`window.__nativeOldApi.context.current().then(()=> 'unexpected',error=>error.code)`), 'FRAME_CLOSED')
  for (const [scope, ownerId] of owners.slice(1)) {
    const library = await call('eleckoiCharacterConfiguration/readScriptLibrary', { scope, ownerId })
    library.enabled = false; await call('eleckoiCharacterConfiguration/saveScriptLibrary', { library })
  }
  await waitFor(`!document.querySelector('iframe[title="ElecKoi author script"]')&&window.__nativeScriptPages.every(page=>page.document.body.dataset.cleaned==='yes')`, 'Native script shutdown did not finish cleanup')
  const resources = await window.webContents.executeJavaScript(`performance.getEntriesByType('resource').map(entry=>entry.name)`)
  assert(!resources.some(name => name.includes('/eleckoi/html/')))
  assert.equal((await call('eleckoiConversations/details', { conversationId })).runtimeSessionId, created.runtimeSessionId)
  const otherId = 'synthetic-preserved-character'
  await call('eleckoiCharacters/create', { character: { id: otherId, name: 'Synthetic preserved character' } })
  const otherOwner = { scope: 'character', characterId: otherId }
  const otherProject = await call('eleckoiAuthorFrontends/importProject', { owner: otherOwner, input: { html: 'Synthetic preserved role page' } })
  const sharedProject = await call('eleckoiAuthorFrontends/importProject', { owner: { scope: 'application' }, input: { html: 'Synthetic preserved application page', select: false } })
  const roleScripts = await call('eleckoiCharacterConfiguration/readScriptWorkspace', { scope: 'character', ownerId: characterId })
  const globalScripts = await call('eleckoiCharacterConfiguration/readScriptWorkspace', { scope: 'global', ownerId: '' })
  const presetScripts = await call('eleckoiCharacterConfiguration/readScriptWorkspace', { scope: 'preset', ownerId: preset.id })
  await call('eleckoiAuthorFrontends/select', { owner, projectId })
  await waitFor(`${page}?.contentDocument.querySelector('#result')?.textContent==='ready'`, 'Native role page did not return before deletion')
  window.setContentSize(420, 900)
  await waitFor(`innerWidth<=430`, 'Mobile chat viewport did not resize')
  await waitFor(`${page}?.contentDocument.querySelector('#result')?.textContent==='ready'`, 'Native role page did not render in the mobile chat')
  await window.webContents.executeJavaScript(`void(window.__nativeDeleteChatApi=${page}.contentWindow.ElecKoi)`)
  await call('eleckoiConversations/delete', { conversationId })
  await waitFor(`!(${page})`, 'Deleted conversation frontend remained mounted')
  assert.equal(await window.webContents.executeJavaScript(`window.__nativeDeleteChatApi.context.current().then(()=> 'unexpected',error=>error.code)`), 'FRAME_CLOSED')
  assert(!(await call('eleckoiConversations/list', {})).some(item => item.id === conversationId))
  assert((await call('eleckoiCharacters/list', {})).items.some(item => item.id === characterId))
  assert.equal((await call('eleckoiAuthorFrontends/workspace', { owner })).selectedProjectId, projectId)
  assert(existsSync(join(productDataRoot, 'author-frontends', 'projects', projectId)))
  process.stdout.write('Native author Client: mobile conversation deletion closes its frontend and preserves the role project.\n')
  const nextChat = await call('eleckoiConversations/create', { input: { title: 'Synthetic deletion chat', metadata: { characterId } } })
  window.setContentSize(1440, 1000)
  await window.loadURL(`dsh-app://app/?chat=${encodeURIComponent(nextChat.conversation.id)}`)
  await waitFor(`${page}?.contentDocument.querySelector('#result')?.textContent==='ready'`, 'Native role page did not reopen for role deletion')
  await window.webContents.executeJavaScript(`(() => {
    window.__nativeDeleteApi=${page}.contentWindow.ElecKoi;
    window.__nativeDeletionFailures=[];
    window.addEventListener('eleckoi:plugin-error',event=>window.__nativeDeletionFailures.push({
      stack:String(event.detail?.error?.stack),pageMounted:!!(${page})
    }));
  })()`)
  const deleted = await call('eleckoiCharacters/delete', { characterIds: [characterId] })
  assert(!deleted.items.some(character => character.id === characterId))
  assert(deleted.items.some(character => character.id === otherId))
  await waitFor(`!(${page})`, 'Deleted role frontend remained mounted')
  assert.equal(await window.webContents.executeJavaScript(`window.__nativeDeleteApi.context.current().then(()=> 'unexpected',error=>error.code)`), 'FRAME_CLOSED')
  const index = JSON.parse(readFileSync(join(productDataRoot, 'author-frontends', 'projects.json'), 'utf8'))
  assert(!Object.hasOwn(index.projects, projectId)); assert(!Object.hasOwn(index['character-settings'], characterId))
  assert(!existsSync(join(productDataRoot, 'author-frontends', 'projects', projectId)))
  assert(!existsSync(join(roleScripts.path, roleScripts.entries[0].file)))
  assert(existsSync(join(globalScripts.path, globalScripts.entries[0].file)))
  assert(existsSync(join(presetScripts.path, presetScripts.entries[0].file)))
  assert.deepEqual(await call('eleckoiAuthorFrontends/workspace', { owner: otherOwner }), otherProject)
  assert.deepEqual(await call('eleckoiAuthorFrontends/workspace', { owner: { scope: 'application' } }), sharedProject)
  assert.equal((await call('eleckoiConversations/list', {})).length, 0)
  const removedAsset = await fetch(new URL(`/eleckoi/frontends/${projectId}/index.html`, ready.url), { headers: { cookie } })
  assert.equal(removedAsset.status, 404)
  assert.deepEqual(errors, [], JSON.stringify(await window.webContents.executeJavaScript('window.__nativeDeletionFailures')))
  const examples = join(process.cwd(), 'packages', 'examples', 'native-author')
  process.stdout.write('Native author Client: scoped role deletion passed; importing published examples.\n')
  const importDocument = name => ({ displayName: name, mimeType: 'application/json', base64: readFileSync(join(examples, name)).toString('base64') })
  const preview = await call('eleckoiCharacters/prepareImport', { files: [importDocument('example.character.json')], source: 'eleckoi' })
  assert.equal(preview.items[0].importable, true)
  const exampleId = (await call('eleckoiCharacters/commitImport', { token: preview.token })).importedCharacterIds[0]
  const examplePreset = (await call('eleckoiAgentPresets/import', { source: 'eleckoi', document: importDocument('example.preset.json'), purpose: 'roleplay' })).preset
  assert.deepEqual(examplePreset.entries.filter(entry => entry.id.startsWith('example-')).map(entry => entry.id), ['example-brief', 'example-detailed'])
  await call('eleckoiAgentPresets/setActive', { presetId: examplePreset.id })
  const regex = await call('eleckoiCharacterConfiguration/readRegexRules', { characterId: exampleId })
  const ejsRule = { id: 'synthetic-ejs-rule', name: 'Synthetic regex EJS', pattern: '/<output id="state"><\\/output>/',
    replacement: '<output id="state"></output><output id="synthetic-regex-ejs"><%= await Promise.resolve(42) %></output>',
    targets: ['AiOutput'], enabled: true, displayOnly: true, promptOnly: false, runOnEdit: true, order: 1 }
  regex.characterRules.push(ejsRule); regex.characterEnabled = true
  regex.versions = regex.versions.map(version => version.id === regex.activeVersionId
    ? { ...version, characterEnabledIds: [...new Set([...version.characterEnabledIds, ejsRule.id])] } : version)
  await call('eleckoiCharacterConfiguration/saveRegexRules', { characterId: exampleId, collection: regex, expectedRevision: regex.revision })
  const ejsTest = await call('eleckoiCharacterConfiguration/testRegexRule', { text: 'TOKEN', target: 'AiOutput',
    rule: { ...ejsRule, pattern: 'TOKEN', replacement: '<%= await Promise.resolve(getvar("score") * 2) %>' },
    options: { surface: 'Display', variablesJson: '{"score":12}' } })
  assert.deepEqual(ejsTest, { output: '24', validationMessage: null })
  for (const [scope, ownerId] of [['character', exampleId], ['preset', examplePreset.id], ['global', '']]) {
    const library = await call('eleckoiCharacterConfiguration/readScriptLibrary', { scope, ownerId })
    library.enabled = true
    if (scope === 'global') library.trees = [{ type: 'script', id: 'example-global', name: 'Synthetic global command', enabled: true, info: '', data: {},
      button: { enabled: true, buttons: [] }, export_with: { data: true, button: true }, runtime: { kind: 'eleckoi-module', apiVersion: 1 }, content: readFileSync(join(examples, 'global.js'), 'utf8') }]
    else library.trees.forEach(script => { script.enabled = true })
    await call('eleckoiCharacterConfiguration/saveScriptLibrary', { library })
  }
  const exampleChat = await call('eleckoiConversations/create', { input: { title: 'Synthetic published example', metadata: { characterId: exampleId } } })
  await window.loadURL('dsh-app://app/')
  await waitFor(`document.querySelector('button[aria-label="消息"]')`, 'Example chat navigation did not render')
  await window.webContents.executeJavaScript(`document.querySelector('button[aria-label="消息"]').click()`)
  await waitFor(`document.querySelectorAll('.conversation-item').length===1`, 'Example chat directory did not render')
  await window.webContents.executeJavaScript(`(() => {const row=document.querySelector('.conversation-item');if(!row.classList.contains('active'))row.click()})()`)
  const examplePage = `Array.from(document.querySelectorAll('iframe')).find(frame=>frame.contentDocument?.querySelector('#score'))`
  await waitFor(`${examplePage}?.contentDocument.querySelector('#update')?.disabled===false&&document.querySelectorAll('iframe[title="ElecKoi author script"]').length===3`, 'Published example opening or scripts did not boot')
  try {
    await waitFor(`${examplePage}?.contentDocument.querySelector('#synthetic-regex-ejs')?.textContent==='42'`, 'Message regex EJS was not computed before rendering its native HTML')
  } catch (error) {
    const details = await call('eleckoiConversations/details', { conversationId: exampleChat.conversation.id })
    const evidence = await window.webContents.executeJavaScript(`(() => ({errors:[...document.querySelectorAll('.script-execution-error,[role="alert"]')].map(node=>node.textContent),frames:[...document.querySelectorAll('iframe')].map(frame=>({title:frame.title,source:frame.srcdoc?.includes('synthetic-regex-ejs'),result:frame.contentDocument?.querySelector('#synthetic-regex-ejs')?.textContent}))}))()`)
    throw new Error(error.message + '\nEJS diagnostics: ' + JSON.stringify({ evidence, opening: details.messages?.filter(message => message.id === 'opening').map(message=>({id:message.id,sourceMatch:message.content?.includes('<output id="state"></output>'),displayMatch:message.displayContent?.includes('synthetic-regex-ejs'),hasEjs:message.displayContent?.includes('regex-ejs:start'),variables:message.variableStateJson})), rules: await call('eleckoiCharacterConfiguration/readRegexRules', { characterId: exampleId }) }))
  }
  process.stdout.write('Native author Client: actual message regex replacement evaluated async EJS and rendered its result.\n')
  await window.webContents.executeJavaScript(`(() => {const frame=${examplePage},select=frame.contentDocument.querySelector('#opening');select.value='example-advanced';select.dispatchEvent(new frame.contentWindow.Event('change'))})()`)
  try {
    await waitFor(`${examplePage}?.contentDocument.querySelector('#update')?.disabled===false&&JSON.parse(${examplePage}.contentDocument.querySelector('#state').textContent).score===10`, 'Published example opening did not select its bound initial state')
  } catch (error) {
    throw new Error(`${error.message}\n${JSON.stringify({ state: await call('eleckoiAuthorVariables/getState', { conversationId: exampleChat.conversation.id }),
      page: await window.webContents.executeJavaScript(`(() => {const frame=${examplePage};return frame&&{state:frame.contentDocument.querySelector('#state').textContent,status:frame.contentDocument.querySelector('#status').textContent,opening:frame.contentDocument.querySelector('#opening').value,disabled:frame.contentDocument.querySelector('#update').disabled}})()`) })}`)
  }
  const updateScore = async (value, total) => {
    await window.webContents.executeJavaScript(`(() => {const doc=${examplePage}.contentDocument;doc.querySelector('#score').value=${JSON.stringify(String(value))};doc.querySelector('#update').click()})()`)
    try {
      await waitFor(`${examplePage}?.contentDocument.querySelector('#update')?.disabled===false&&JSON.parse(${examplePage}.contentDocument.querySelector('#state').textContent).total===${total}`, 'Published example rule did not accept the expected derived state')
    } catch (error) {
      throw new Error(`${error.message}\n${JSON.stringify({ state: await call('eleckoiAuthorVariables/getState', { conversationId: exampleChat.conversation.id }),
        page: await window.webContents.executeJavaScript(`(() => {const frame=${examplePage};return frame&&{state:frame.contentDocument.querySelector('#state').textContent,status:frame.contentDocument.querySelector('#status').textContent,disabled:frame.contentDocument.querySelector('#update').disabled}})()`) })}`)
    }
  }
  await updateScore(5, 10)
  const beforeMessageRequest = await call('eleckoiAuthorVariables/getState', { conversationId: exampleChat.conversation.id })
  await window.webContents.executeJavaScript(`(() => {
    const frame=${examplePage},doc=frame.contentDocument,api=frame.contentWindow.ElecKoi;
    const button=doc.createElement('button'),output=doc.createElement('output');
    button.id='synthetic-script-request';button.textContent='Synthetic script operation';output.id='synthetic-script-result';
    button.onclick=async()=>{try{const result=await api.scripts.request(${JSON.stringify({ scope: 'character', ownerId: exampleId, scriptId: 'example-score-rule' })},'calculate-score',{score:12});output.textContent=JSON.stringify(result);output.dataset.status='ok'}catch(error){output.textContent=error.message;output.dataset.status='error'}};
    doc.body.append(button,output);button.click();
  })()`)
  await waitFor(`${examplePage}?.contentDocument.querySelector('#synthetic-script-result')?.dataset.status==='ok'`, 'Message frontend button did not receive its script result')
  assert.deepEqual(JSON.parse(await window.webContents.executeJavaScript(`${examplePage}.contentDocument.querySelector('#synthetic-script-result').textContent`)), { total: 24, level: 2 })
  assert.equal(await call('eleckoiAuthorVariables/getState', { conversationId: exampleChat.conversation.id }), beforeMessageRequest)
  process.stdout.write('Native author Client: actual message frontend button received the imported script result without changing story variables.\n')
  process.stdout.write('Native author Client: alternate opening and example derivation passed.\n')
  const openButtons = async () => {
    await window.webContents.executeJavaScript(`document.querySelector('button[aria-label="扮演菜单"]').click()`)
    await waitFor(`document.querySelector('.composer-more-menu')`, 'Example action menu did not open')
    await window.webContents.executeJavaScript(`(() => {const button=[...document.querySelectorAll('.composer-more-menu button')].find(button=>button.textContent==='脚本');if(button.getAttribute('aria-expanded')!=='true')button.click()})()`)
    await waitFor(`document.querySelectorAll('[aria-label="脚本按钮"] button').length===3&&[...document.querySelectorAll('[aria-label="脚本按钮"] button')].every(button=>!button.disabled)`, 'Published example buttons did not become ready')
  }
  const exampleButton = async label => window.webContents.executeJavaScript(`[...document.querySelectorAll('[aria-label="脚本按钮"] button')].find(button=>button.querySelector('span').textContent===${JSON.stringify(label)}).click()`)
  await openButtons()
  await exampleButton('积分设置')
  await waitFor(`${settingsPage}?.contentDocument.querySelector('#multiplier')?.disabled===false`, 'Published example settings helper file did not boot')
  await window.webContents.executeJavaScript(`(() => {const doc=${settingsPage}.contentDocument;doc.querySelector('#multiplier').value='3';doc.querySelector('form').requestSubmit()})()`)
  await waitFor(`${settingsPage}?.contentDocument.querySelector('output')?.textContent==='已保存'`, 'Published example settings did not persist')
  await window.webContents.executeJavaScript(`document.querySelector('[aria-label="关闭作者面板"]').click()`)
  await updateScore(12, 36)
  const acceptedExample = await call('eleckoiAuthorVariables/getState', { conversationId: exampleChat.conversation.id })
  const beforeExampleRequests = requests()
  await window.webContents.executeJavaScript(`(() => {const doc=${examplePage}.contentDocument;doc.querySelector('#score').value='-1';doc.querySelector('#update').click()})()`)
  await waitFor(`${examplePage}?.contentDocument.querySelector('#update')?.disabled===false&&${examplePage}.contentDocument.querySelector('#status').textContent.length>0`, 'Published example invalid state did not visibly fail')
  assert.equal(await call('eleckoiAuthorVariables/getState', { conversationId: exampleChat.conversation.id }), acceptedExample)
  assert.equal(requests(), beforeExampleRequests)
  const exampleOwner = { scope: 'character', characterId: exampleId }
  const exampleProject = await call('eleckoiAuthorFrontends/importProject', { owner: exampleOwner, input: { html: readFileSync(join(examples, 'frontend.html'), 'utf8'), select: false } })
  assert.equal(exampleProject.selectedProjectId, null)
  await call('eleckoiAuthorFrontends/select', { owner: exampleOwner, projectId: exampleProject.projects[0].id })
  await waitFor(`${examplePage}?.contentDocument.querySelector('#update')?.disabled===false&&${examplePage}.contentWindow.ElecKoi.context.current().then(context=>context.surface==='character-frontend')`, 'Published example project did not boot')
  assert.equal((await window.webContents.executeJavaScript(`${examplePage}.contentWindow.ElecKoi.context.current()`)).surface, 'character-frontend')
  await openButtons()
  await exampleButton('切换简洁回复')
  await waitFor(`${examplePage}.contentWindow.ElecKoi.presets.getEntry(${JSON.stringify(examplePreset.id)},'example-detailed').then(entry=>entry.enabled)`, 'Imported preset button did not retain the author entry identities')
  const changedPreset = await call('eleckoiAgentPresets/read', { presetId: examplePreset.id })
  assert.deepEqual(changedPreset.entries.filter(entry => entry.id.startsWith('example-')).map(entry => entry.enabled), [false, true])
  await window.webContents.executeJavaScript(`${examplePage}.contentWindow.ElecKoi.input.set('Synthetic removable draft')`)
  await openButtons()
  await exampleButton('清空输入框')
  try {
    await waitFor(`${examplePage}.contentWindow.ElecKoi.input.get().then(input=>input.text===''&&document.querySelector('[data-composer-input]')?.innerText.trim()==='')`, 'Published global example did not clear the real composer')
  } catch (error) {
    throw new Error(`${error.message}\n${JSON.stringify(await window.webContents.executeJavaScript(`(async () => ({input:await ${examplePage}.contentWindow.ElecKoi.input.get(),display:document.querySelector('[data-composer-input]').innerText,alerts:[...document.querySelectorAll('[role="alert"]')].map(node=>node.textContent)}))()`))}`)
  }
  await window.webContents.executeJavaScript(`(() => {const doc=${examplePage}.contentDocument;doc.querySelector('#message').value='Synthetic published example draft';doc.querySelector('#draft').click()})()`)
  await waitFor(`document.querySelector('[data-composer-input]')?.innerText==='Synthetic published example draft'&&${examplePage}.contentDocument.querySelector('#draft').disabled===false`, 'Published example did not fill the real composer')
  await window.webContents.executeJavaScript(`(() => {const doc=${examplePage}.contentDocument;doc.querySelector('#score').value='12';doc.querySelector('form').requestSubmit()})()`)
  await waitFor(`${examplePage}?.contentDocument.querySelector('#send')?.disabled===false&&${examplePage}.contentDocument.querySelector('#messages').textContent.includes('Synthetic native reply')`, 'Published example direct generation did not finish')
  assert.equal(requests(), beforeExampleRequests + 1)
  assert.deepEqual(JSON.parse(await call('eleckoiAuthorVariables/getState', { conversationId: exampleChat.conversation.id })), { score: 12, total: 36, level: 2 })
  assert.equal(await window.webContents.executeJavaScript(`document.querySelector('[data-composer-input]').innerText`), 'Synthetic published example draft')
  const exampleRequest = JSON.stringify(modelBodies.at(-1))
  assert(exampleRequest.includes(examplePreset.entries.find(entry => entry.id === 'example-detailed').content))
  assert(!exampleRequest.includes(examplePreset.entries.find(entry => entry.id === 'example-brief').content))
  inspectRetiredNavigations()
  assert.deepEqual(errors, [])
  process.stdout.write('Published native author example files import and run in the built desktop: bound alternate opening, relative helper module, async derivation, settings panel, rejection/retry, explicit role frontend, imported preset entry switches, global composer command and direct generation passed.\n')
  process.stdout.write('Built ElecKoi desktop runs without compatibility bundles: role frontend ZIP import/browse/use, module/style/image assets, three script scopes and chat menu buttons, native author settings modal with relative assets, live persisted script settings without restart, character and preset original switches in the actual model request, single Zod and async rules, rejection/retry, real composer read/write/clear/submit and direct generation, scope disable, page/script cleanup and role deletion with scoped frontend resource removal passed.\n')
}
