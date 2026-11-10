const { app, BrowserWindow } = require('electron');
const { writeFileSync } = require('node:fs');
const { join, dirname } = require('node:path');
const [html, report] = process.argv.slice(2);
app.setPath('userData', join(dirname(html), 'browser-profile'));app.commandLine.appendSwitch('force-device-scale-factor','1');app.disableHardwareAcceleration();
app.whenReady().then(async () => {
 const win = new BrowserWindow({ show:false,width:1440,height:900,webPreferences:{sandbox:true,backgroundThrottling:false} });
 const errors=[],layouts=[],actions={};
 win.webContents.on('console-message',event=>{if(event.level==='error')errors.push(event.message)});
 const run=source=>win.webContents.executeJavaScript(source),pause=()=>new Promise(resolve=>setTimeout(resolve,160));
 async function click(source){await run(`${source}.click()`);await pause();}
 const node=path=>`document.querySelector('.vm-page:not([hidden]) [data-node-path=${JSON.stringify(JSON.stringify(path))} ]')`;
 // JSON Pointer paths are matched by their explicit data value, including escaped keys.
 async function entry(path,scope='.vm-page:not([hidden])'){await click(`[...document.querySelectorAll('${scope} [data-node-path]')].find(e=>e.dataset.nodePath===${JSON.stringify(path)})`);}
 async function mount(width,theme,missing=false){win.setContentSize(width,width<768?844:900);await run(`window.remountVariables(${JSON.stringify({mobile:width<768,theme,missing})})`);await pause();await win.webContents.capturePage();await pause();}
 async function shot(name){await win.webContents.capturePage();await pause();writeFileSync(join(dirname(report),name+'.png'),(await win.webContents.capturePage()).toPNG());}
 async function tab(label){await click(`[...document.querySelectorAll('[role=tab]')].find(e=>e.textContent===${JSON.stringify(label)})`);}
 try {
  await win.loadFile(html);for(let i=0;i<50&&!await run(`!!window.remountVariables`);i++)await pause();
  for(const theme of ['light','dark'])for(const width of [1440,1024,390,320,430]){
   await mount(width,theme);await entry('/角色');await entry('/角色/同行者');
   const layout=await run(`(()=>{const d=document.querySelector('${width<768?'.mobile-variable-manager':'.vm-dialog'}'),font=s=>{const e=d.querySelector(s);if(!e)return null;const c=getComputedStyle(e);return {size:parseFloat(c.fontSize),weight:c.fontWeight,line:c.lineHeight}};return {width:${width},theme:'${theme}',base:getComputedStyle(d).backgroundColor,overflow:d.scrollWidth>d.clientWidth||document.documentElement.scrollWidth>innerWidth,visibleRows:[...d.querySelectorAll('.vm-value-row')].filter(e=>e.getBoundingClientRect().height).length,nested:!!d.querySelector('[data-breadcrumb-path="/角色/同行者"]'),fonts:{directory:font('.vm-directory-select'),selectedDirectory:font('.vm-directory-row.selected .vm-directory-select'),value:font('.vm-field-value'),name:font('.vm-field-name'),tab:font('.vm-tabs>button'),title:font('${width<768?'.mobile-overlay-header h2':'.vm-header h2'}')}}})()`);
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
  if(errors.length||layouts.some(l=>l.overflow||!l.nested||l.base==='rgba(0, 0, 0, 0)'||!l.visibleRows||(l.width>=768?(l.fonts.directory.size!==13||l.fonts.selectedDirectory.weight!=='550'||l.fonts.value.size!==14):(l.fonts.name.size!==13||l.fonts.value.size!==16||l.fonts.tab.size!==14)))||Object.values(actions).some(value=>!value))throw Error('Variable manager browser check failed');
  console.log(JSON.stringify({layouts:layouts.length,actions:Object.keys(actions).length,errors}));win.destroy();app.exit(0);
 }catch(error){console.error(error,errors);writeFileSync(report,JSON.stringify({layouts,actions,errors,failure:String(error)}));win.destroy();app.exit(1)}
});
