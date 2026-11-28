const { app, BrowserWindow } = require('electron');
const { writeFileSync } = require('node:fs');
const { join, dirname } = require('node:path');
const [html, report] = process.argv.slice(2);
app.setPath('userData', join(dirname(html), 'browser-profile'));app.commandLine.appendSwitch('force-device-scale-factor','1');app.disableHardwareAcceleration();

function readLayout(width, theme) {
  const mobile = width < 768;
  const dialog = document.querySelector(mobile ? '.mobile-variable-manager' : '.variable-viewer-modal[role="dialog"]');
  const find = selector => dialog.querySelector(selector);
  const style = (selector, pseudo) => getComputedStyle(find(selector), pseudo);
  const font = selector => {
    const { fontSize, fontWeight } = style(selector);
    return { size: parseFloat(fontSize), weight: fontWeight };
  };
  const borderVisible = (selector, side) => {
    const css = style(selector);
    return parseFloat(css[`border${side}Width`]) > 0 && css[`border${side}Color`] !== 'rgba(0, 0, 0, 0)';
  };
  const base = getComputedStyle(dialog).backgroundColor;
  const result = {
    width, theme, base,
    overflow: dialog.scrollWidth > dialog.clientWidth || document.documentElement.scrollWidth > innerWidth,
    visibleRows: [...dialog.querySelectorAll('.vm-value-row')].filter(row => row.getBoundingClientRect().height).length,
    nested: Boolean(find('[data-breadcrumb-path="/角色/同行者"]')),
    fonts: { value: font('.vm-field-value'), name: font('.vm-field-name'), tab: font('.vm-tabs > button') },
  };
  if (!mobile) {
    result.fonts.directory = font('.vm-directory-select');
    result.fonts.selectedDirectory = font('.vm-directory-row.selected .vm-directory-select');
    const indicator = style('.vm-tabs > [aria-selected="true"]', '::after');
    const search = '.vm-toolbar-search';
    const input = find(`${search} input`);
    input.blur();
    const searchBorder = style(search).borderTopColor;
    input.focus();
    result.readability = {
      indicator: parseFloat(indicator.height) >= 2 && indicator.backgroundColor !== 'rgba(0, 0, 0, 0)',
      selectedDirectory: style('.vm-directory-row.selected').backgroundColor !== style('.vm-directory-row:not(.selected)').backgroundColor,
      tableHeader: style('.vm-table-head').backgroundColor !== 'rgba(0, 0, 0, 0)',
      tableBorder: borderVisible('.vm-browser', 'Top') && borderVisible('.vm-directory', 'Right'),
      versionBorder: borderVisible('.vm-config-trigger', 'Top'),
      searchBorder: borderVisible(search, 'Top'),
      searchFocus: document.activeElement === input && style(search).borderTopColor !== searchBorder,
      searchPlaceholder: style(`${search} input`, '::placeholder').color,
      searchBackground: style(search).backgroundColor,
    };
    input.blur();
  }
  return result;
}

app.whenReady().then(async () => {
 const win = new BrowserWindow({ show:false,width:1440,height:900,webPreferences:{sandbox:true,backgroundThrottling:false} });
 const errors=[],layouts=[],actions={};
 win.webContents.on('console-message',event=>{if(event.level==='error')errors.push(event.message)});
 const run=source=>win.webContents.executeJavaScript(source),pause=()=>new Promise(resolve=>setTimeout(resolve,160));
 async function click(source){await run(`${source}.click()`);await pause();}
 // JSON Pointer paths are matched by their explicit data value, including escaped keys.
 async function entry(path,scope='.vm-page:not([hidden])'){await click(`[...document.querySelectorAll('${scope} [data-node-path]')].find(e=>e.dataset.nodePath===${JSON.stringify(path)})`);}
 async function mount(width,theme,missing=false){win.setContentSize(width,width<768?844:900);await run(`window.remountVariables(${JSON.stringify({mobile:width<768,theme,missing})})`);await pause();await win.webContents.capturePage();await pause();}
 async function shot(name){await win.webContents.capturePage();await pause();writeFileSync(join(dirname(report),name+'.png'),(await win.webContents.capturePage()).toPNG());}
 async function tab(label){await click(`[...document.querySelectorAll('[role=tab]')].find(e=>e.textContent===${JSON.stringify(label)})`);}
 try {
  await win.loadFile(html);for(let i=0;i<50&&!await run(`!!window.remountVariables`);i++)await pause();
  for(const theme of ['light','dark'])for(const width of [1440,1024,390,320,430]){
   await mount(width,theme);await entry('/角色');await entry('/角色/同行者');
   const layout=await run(`(${readLayout})(${width},${JSON.stringify(theme)})`);
   layouts.push(layout);if(width===390||width===1440)await shot(`${theme}-${width}`);
   await click(`document.querySelector('.vm-config-trigger')`);actions[`${theme}-${width}-selector`]=await run(`!!document.querySelector('[role=menuitemradio]')`);
   await click(`[...document.querySelectorAll('[role=menuitemradio]')].find(e=>e.textContent==='日常剧情')`);
   actions[`${theme}-${width}-selection`]=await run(`document.querySelector('.vm-config-trigger').textContent.includes('日常剧情')&&window.variableCalls.at(-1)[0]==='synthetic-chat'&&window.variableCalls.at(-1)[2]===''`);
   await tab('历史快照');await click(`[...document.querySelectorAll('.vm-floor')].find(e=>e.textContent.includes('第 1 楼'))`);
   await pause();if(width===390||width===1440)await shot(`history-${theme}-${width}`);
   actions[`${theme}-${width}-history`]=await run(`!!document.querySelector('.vm-change-row')&&document.querySelector('.vm-change-table').getBoundingClientRect().height>0&&document.querySelector('.vm-page').offsetHeight===0&&document.querySelector('.vm-change-table').textContent.includes('删除项')`);
  }
  await mount(1440,'light');await click(`document.querySelector('.vm-config-trigger')`);await run(`window.rejectVariableSelection=true`);
  await click(`[...document.querySelectorAll('[role=menuitemradio]')].find(e=>e.textContent==='调查剧情')`);
  actions.failedSaveRetainsSelection=await run(`document.querySelector('.vm-config-trigger').textContent.includes('选择变量配置')&&document.querySelector('.vm-error').textContent.includes('合成保存失败')`);
  await run(`document.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))`);await pause();
  await entry('/大量字段');await run(`document.querySelector('.vm-page .vm-scroll').scrollTop=500000`);await win.webContents.capturePage();await pause();await pause();
  actions.longListEnd=await run(`!!document.querySelector('[data-node-path="/大量字段/字段1002"]')&&document.querySelector('.vm-page .vm-scroll').textContent.includes('末尾关键词')`);
  actions.virtualized=await run(`document.querySelectorAll('.vm-page .vm-value-row').length<100`);
  await click(`document.querySelector('.vm-page [data-breadcrumb-path=""]')`);await entry('/大量字段');await win.webContents.capturePage();await pause();
  actions.pathScrollRestored=await run(`document.querySelector('.vm-page .vm-scroll').scrollTop>0&&!!document.querySelector('[data-node-path="/大量字段/字段1002"]')`);
  await run(`document.querySelector('.vm-toolbar input').focus()`);await win.webContents.insertText('末尾关键词');await pause();
  actions.searchFindsTail=await run(`!!document.querySelector('.vm-page [data-node-path="/大量字段/字段1002"]')&&document.querySelector('.vm-page .vm-scroll').textContent.includes('大量字段')`);
  await mount(390,'light');await entry('/场景');await entry('/场景/数组');await entry('/场景/数组/0');await entry('/场景/数组/0/详情');
  actions.arraysAndLiterals=await run(`document.querySelector('.vm-current-body').textContent.includes('false')&&document.querySelector('.vm-current-body').textContent.includes('null')`);
  await run(`window.variableBack()`);await pause();actions.parentBack=await run(`!!document.querySelector('[data-breadcrumb-path="/场景/数组/0"][aria-current="location"]')`);
  await mount(390,'light',true);await click(`document.querySelector('.vm-config-trigger')`);await click(`[...document.querySelectorAll('[role=menuitemradio]')].find(e=>e.textContent==='日常剧情')`);
  actions.lateAssociationEmpty=await run(`document.querySelector('.vm-config-trigger').textContent.includes('日常剧情')&&document.querySelector('.vm-current-body').textContent.includes('暂无变量')`);
  writeFileSync(report,JSON.stringify({layouts,actions,errors},null,2));
  console.log(JSON.stringify({layouts:layouts.length,actions:Object.keys(actions).length,errors}));win.destroy();app.exit(0);
 }catch(error){console.error(error,errors);writeFileSync(report,JSON.stringify({layouts,actions,errors,failure:String(error)}));win.destroy();app.exit(1)}
});
