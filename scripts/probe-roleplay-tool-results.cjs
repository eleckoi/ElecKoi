const { writeFileSync } = require('node:fs')

const paths = Array.from({ length: 86 }, (_, index) => `Synthetic setting ${String(index).padStart(3, '0')}`)
const variablePaths = Array.from({ length: 128 }, (_, index) => `/field${String(index).padStart(3, '0')}`)
const calls = [
  ['glob-settings', 'eleckoi_glob_setting_files', {}],
  ['grep-settings', 'eleckoi_grep_setting_files', { pattern: 'SETTING_TAIL_085', output_mode: 'content' }],
  ['read-settings', 'eleckoi_read_setting_files', { paths }],
  ['glob-variables', 'eleckoi_glob_variables', {}],
  ['grep-variables', 'eleckoi_grep_variables', { pattern: 'VARIABLE_TAIL_127', output_mode: 'content' }],
  ['read-variables', 'eleckoi_read_variables', { paths: variablePaths }],
].map(([id, name, args]) => ({ id: `tools-${id}`, type: 'function_call', call_id: `tools-${id}`, name, arguments: JSON.stringify(args) }))

async function configure(remoteCall, characterId) {
  const time = new Date().toISOString()
  const library = await remoteCall('eleckoiCharacterConfiguration/readSettingLibrary', { characterId })
  const entries = paths.map((title, index) => ({ id: `setting-${index}`, title, iconId: 'setting', kind: 'normal', groupId: '',
    content: `Synthetic setting body ${index}\n${index === 85 ? 'Long synthetic line. '.repeat(300) : ''}SETTING_TAIL_${String(index).padStart(3, '0')}`,
    openingMessages: [], defaultOpeningMessageId: '', agentSelectionHint: 'Synthetic selection hint',
    agentReadStrategy: index < 18 ? 'required' : index < 33 ? 'keyword' : 'normal', dynamicMode: 'standard', contentMode: 'plain_text',
    keywords: index >= 18 && index < 33 ? ['Synthetic roleplay'] : [], keywordScanDepth: 1, conditionKeywords: [], keywordCondition: 'none', keywordUseRegex: false,
    keywordIgnoreCase: true, keywordWholeWord: false, keywordRecursionDepth: 0, triggerMode: 'agent_tool', enabled: true,
    position: null, promptPositionId: '', insertRole: 'system', order: index, viewOrder: index, groupViewOrder: index,
    treeViewOrder: index, createdAt: time, updatedAt: time }))
  await remoteCall('eleckoiCharacterConfiguration/saveSettingLibrary', { characterId, library: { ...library, entries,
    versions: library.versions.map(version => version.id === library.activeVersionId ? { ...version, entries } : version) } })
  const config = await remoteCall('eleckoiCharacterConfiguration/readVariableConfig', { characterId })
  const variables = variablePaths.map((path, index) => ({ id: `variable-${index}`, title: path.slice(1), objectId: '', enabled: true,
    type: 'string', defaultValue: `VARIABLE_TAIL_${String(index).padStart(3, '0')}`, description: 'Synthetic variable description',
    updateRule: 'Synthetic variable update rule', readMode: index === 0 ? 'required' : 'on_demand', order: index + 1,
    treeViewOrder: index, createdAt: time, updatedAt: time }))
  const state = Object.fromEntries(variables.map(variable => [variable.title, variable.defaultValue]))
  const draft = { ...config, variables, objects: [], initialStateJson: JSON.stringify(state), schemaCode: '' }
  draft.versions = config.versions.map(version => version.id === config.activeVersionId
    ? { ...version, variables, objects: [], initialStateJson: draft.initialStateJson, schemaCode: '' } : version)
  await remoteCall('eleckoiCharacterConfiguration/saveVariableConfig', { characterId, config: draft })
}

async function run({ window, waitFor, nativeTheme, modelBodies, remoteCall, conversationId }) {
  const execute = source => window.webContents.executeJavaScript(source)
  await execute(`document.querySelector('[data-composer-input]').focus()`)
  await window.webContents.insertText('Synthetic roleplay tool result browser check')
  await waitFor(`document.querySelector('button[aria-label="发送消息"]')?.disabled === false`, 'Tool probe input did not enable')
  await execute(`document.querySelector('button[aria-label="发送消息"]').click()`)
  await waitFor(`document.querySelector('.message.theirs')?.innerText.includes('Synthetic recovered reply') && !document.querySelector('button[aria-label="停止生成"]')`, 'Tool probe did not finish')
  const open = async () => {
    await execute(`document.querySelector('.message.theirs button[aria-label="更多"]').click()`)
    await waitFor(`Boolean(document.querySelector('.message.theirs button[aria-label="查看过程"]'))`, 'Tool process menu did not open')
    await execute(`document.querySelector('.message.theirs button[aria-label="查看过程"]').click()`)
    await waitFor(`document.querySelectorAll('.roleplay-tool-call').length === 6`, 'The six product Tool views did not render')
  }
  await open()
  const call = id => `[data-roleplay-tool-name="${calls.find(call => call.id === 'tools-' + id).name}"]`
  await execute(`document.querySelector('${call('glob-settings')} [data-disclosure-row]').click()`)
  await waitFor(`document.querySelector('${call('glob-settings')} .roleplay-result-summary')?.textContent === '匹配 86固定必读 18本轮须读 15'`, 'Fixed and turn-required counts did not survive the real Host output')
  await search(`${call('glob-settings')} input`, paths[18])
  await waitFor(`document.querySelector('${call('glob-settings')} .roleplay-result-row .roleplay-reading-badge')?.textContent === '本轮须读'`, 'Keyword activation was collapsed into a generic required badge')
  const categories = []
  for (const theme of ['light', 'dark']) {
    nativeTheme.themeSource = theme
    await capture('tools-categories-' + theme)
    const state = await execute(`(() => {const scope=document.querySelector('${call('glob-settings')}');return {theme:'${theme}',summary:scope.querySelector('.roleplay-result-summary').textContent,badge:scope.querySelector('.roleplay-result-detail .roleplay-reading-badge').textContent,colors:['fixed','turn'].map(kind=>getComputedStyle(scope.querySelector('.roleplay-result-summary [data-reading-kind="'+kind+'"]')).color)};})()`)
    if(state.badge!=='本轮须读'||state.colors[0]===state.colors[1])throw Error('Required category labels or colors were lost: '+JSON.stringify(state))
    categories.push(state)
  }
  await execute(`document.querySelector('${call('glob-settings')} [data-disclosure-row]').click()`)
  await execute(`document.querySelector('${call('read-settings')} [data-disclosure-row]').click()`)
  await waitFor(`document.querySelector('${call('read-settings')} [data-result-count]')?.dataset.resultCount === '86'`, 'All 86 settings did not reach the result browser')
  const mounted = await execute(`document.querySelectorAll('${call('read-settings')} .roleplay-result-row').length`)
  if (mounted < 1 || mounted > 20) throw Error('Setting directory was not virtualized: ' + mounted)
  if(await execute(`Boolean(document.querySelector('.roleplay-result-expand'))`))throw Error('The redundant body expansion control remains')
  const bars=await execute(`['.roleplay-result-directory','.roleplay-result-detail-scroll'].map(selector=>{const element=document.querySelector('${call('read-settings')} '+selector);return {selector,width:getComputedStyle(element).scrollbarWidth,skin:getComputedStyle(element,'::-webkit-scrollbar').width,thumb:getComputedStyle(element,'::-webkit-scrollbar-thumb').backgroundColor};})`)
  if(bars.some(bar=>bar.width!=='auto'||bar.skin!=='5px'))throw Error('A result viewport bypasses the native DSH scrollbar skin: '+JSON.stringify(bars))
  await capture('tools-directory')
  async function search(selector, value) {
    await execute(`(() => { const input = document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); })()`)
  }
  await search(`${call('read-settings')} input`, 'SETTING_TAIL_085')
  await waitFor(`document.querySelector('${call('read-settings')} .roleplay-result-toolbar').textContent.includes('1 / 86')`, 'Search could not find the last full setting')
  await execute(`document.querySelector('${call('read-settings')} .roleplay-result-row').click()`)
  await captureSettingStart()
  await waitFor(`(() => {const scroll=document.querySelector('${call('read-settings')} .roleplay-result-detail-scroll');scroll.scrollTop=scroll.scrollHeight;return scroll.textContent.includes('SETTING_TAIL_085');})()`, 'The selected setting lost its tail')
  async function capture(suffix) {
    if (process.env.ELECKOI_CLIENT_PROBE_SCREENSHOT) {
      await new Promise(resolve => setTimeout(resolve, 200))
      writeFileSync(process.env.ELECKOI_CLIENT_PROBE_SCREENSHOT.replace(/\.png$/, '-' + suffix + '.png'), (await window.webContents.capturePage()).toPNG())
    }
  }
  async function captureSettingStart(){
    if(process.env.ELECKOI_CLIENT_PROBE_SCREENSHOT){
      await execute('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
      writeFileSync(process.env.ELECKOI_CLIENT_PROBE_SCREENSHOT.replace(/\.png$/,'-tools-read-start.png'),(await window.webContents.capturePage()).toPNG())
    }
  }
  for (const theme of ['light', 'dark']) {
    nativeTheme.themeSource = theme
    await capture('tools-' + theme)
  }
  await execute(`document.querySelector('${call('read-settings')} [data-disclosure-row]').click();document.querySelector('${call('read-variables')} [data-disclosure-row]').click()`)
  await waitFor(`document.querySelector('${call('read-variables')} [data-result-count]')?.dataset.resultCount === '128'`, 'All 128 variables did not reach the result browser')
  await search(`${call('read-variables')} input`, 'VARIABLE_TAIL_127')
  await waitFor(`document.querySelector('${call('read-variables')} .roleplay-result-toolbar').textContent.includes('1 / 128')`, 'The final variable could not be found by value')
  await execute(`document.querySelector('${call('read-variables')} .roleplay-result-row').click()`)
  await waitFor(`document.querySelector('${call('read-variables')} .roleplay-result-detail-scroll').textContent.includes('VARIABLE_TAIL_127')`, 'Variable metadata did not render')
  await capture('tools-variables')
  await search(`${call('read-variables')} input`, '')
  await waitFor(`document.querySelector('${call('read-variables')} .roleplay-result-toolbar').textContent.trim() === '128 项'`, 'Clearing local search did not restore every variable')
  window.setSize(390, 844)
  await execute(`document.documentElement.dataset.eleckoiMobile='true';document.querySelector('${call('read-variables')} .roleplay-result-back').click()`)
  await new Promise(resolve => setTimeout(resolve, 200))
  const previous = await execute(`(() => {const list=document.querySelector('${call('read-variables')} .roleplay-result-directory');list.scrollTop=48*95;list.dispatchEvent(new Event('scroll'));return list.scrollTop;})()`)
  await waitFor(`Boolean(document.querySelector('${call('read-variables')} [data-result-index="95"]'))`, 'Mobile virtual directory did not scroll')
  await execute(`document.querySelector('${call('read-variables')} [data-result-index="95"]').click()`)
  await waitFor(`getComputedStyle(document.querySelector('${call('read-variables')} .roleplay-result-detail')).visibility === 'visible'`, 'Mobile result did not enter single-item reading')
  await capture('tools-mobile-reading')
  await execute(`document.querySelector('${call('read-variables')} .roleplay-result-back').click()`)
  await waitFor(`(() => {const list=document.querySelector('${call('read-variables')} .roleplay-result-directory'), bounds=list.getBoundingClientRect();return Array.from(list.querySelectorAll('.roleplay-result-row')).some(row => {const rect=row.getBoundingClientRect();return rect.top<bounds.bottom && rect.bottom>bounds.top;});})()`, 'Returning from reading left a blank virtual directory')
  const mobile = await execute(`(() => {const browser=document.querySelector('${call('read-variables')} .roleplay-result-browser');return { position:browser.querySelector('.roleplay-result-directory').scrollTop,overflow:browser.scrollWidth>browser.clientWidth };})()`)
  if (mobile.overflow || Math.abs(mobile.position - previous) > 1) throw Error('Mobile directory return lost its position: ' + JSON.stringify({ previous, mobile }))
  await capture('tools-mobile-directory')
  await execute(`delete document.documentElement.dataset.eleckoiMobile`)
  window.setSize(1440, 1000)
  await execute(`document.querySelector('${call('read-variables')} .roleplay-tool-inspect').click()`)
  await waitFor(`!document.querySelector('.roleplay-process-dialog') && document.querySelector('.chat-header-tabs [aria-selected="true"]').textContent==='轨迹' && document.querySelector('.chat-panel').textContent.includes('Schema')`, 'Product tool inspection did not use the native trajectory')
  await execute(`Array.from(document.querySelectorAll('.chat-header-tabs [role="tab"]')).find(button=>button.textContent==='对话').click()`)
  await waitFor(`Boolean(document.querySelector('.message.theirs button[aria-label="更多"]'))`, 'Roleplay chat did not return after inspection')
  await execute(`document.querySelector('.message.theirs button[aria-label="更多"]').click()`)
  await waitFor(`Boolean(document.querySelector('.message-tools-expanded button[aria-label="查看过程"]'))`, 'Message action icons did not expand')
  const icons = await execute(`(() => {const bar=document.querySelector('.message-tools-expanded');return ['查看过程','复制','重新生成'].map(label=>{const button=bar.querySelector('[aria-label="'+label+'"]'),icon=button.querySelector('svg');return {label,width:getComputedStyle(icon).width,color:getComputedStyle(icon).color};});})()`)
  if(new Set(icons.map(icon=>icon.color)).size!==1)throw Error('Message action icon color differs: '+JSON.stringify(icons))
  if(process.env.ELECKOI_CLIENT_PROBE_SCREENSHOT){
    await execute('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
    await new Promise(resolve => setTimeout(resolve,150))
    const bounds=await execute(`(() => {const rect=document.querySelector('.message-tools-expanded').getBoundingClientRect();return {x:Math.max(0,Math.floor(rect.x)-10),y:Math.max(0,Math.floor(rect.y)-10),width:Math.ceil(rect.width)+20,height:Math.ceil(rect.height)+20};})()`)
    writeFileSync(process.env.ELECKOI_CLIENT_PROBE_SCREENSHOT.replace(/\.png$/,'-tools-actions.png'),(await window.webContents.capturePage(bounds)).toPNG())
  }
  if (!JSON.stringify(modelBodies.at(-1)).includes('SETTING_TAIL_085') || !JSON.stringify(modelBodies.at(-1)).includes('VARIABLE_TAIL_127')) throw Error('The real model continuation lost tool result tails')
  const logs = await remoteCall('session/list', { _request: {} })
  if (logs.items.some(item => item.running)) throw Error('Tool probe left a running Session')
  console.log(JSON.stringify({ settings: 86, variables: 128, categories, mounted, mobile, bars, icons, conversationId, trajectory: true, completeModelResults: true }))
}

module.exports = { calls, configure, run }
