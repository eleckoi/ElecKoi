const { app, BrowserWindow } = require('electron');
const { writeFileSync } = require('node:fs');
const { dirname, join } = require('node:path');
const { pathToFileURL } = require('node:url');
const [htmlPath, reportPath] = process.argv.slice(2);
app.setPath('userData', join(dirname(htmlPath), 'browser-profile'));
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, backgroundThrottling: false } });
  const evaluate = async source => { try { return await win.webContents.executeJavaScript(source); } catch (error) { throw Error(error.message + '\nEvaluation: ' + source); } };
  const errors = []; win.webContents.on('console-message', event => { if (event.level === 'error') errors.push(event.message); });
  const wait = async source => { for (let i = 0; i < 160; i++) { if (await evaluate(source)) return; await new Promise(resolve => setTimeout(resolve, 25)); } throw new Error(`Timed out: ${source}; errors: ${errors.join('\n')}`); };
  try {
    const reports = [];
    for (const theme of ['light', 'dark']) for (const width of [1440, 1024, 768]) {
      win.setContentSize(width, 900); await win.loadURL(pathToFileURL(htmlPath).href);
      await win.webContents.insertCSS('.editor-sidebar-pane{animation:none!important}.editor-sidebar-directory,.setting-library-tree-label{transition:none!important}');
      await wait(`document.querySelector('.role-setting-library-container')`);
      await evaluate(`document.documentElement.dataset.theme='${theme}';document.body.toggleAttribute('data-ds-dark-theme','${theme}'==='dark')`);
      const initial = await evaluate(`(() => {const r=document.querySelector('.role-setting-library-container').getBoundingClientRect();return {width:r.width, border:getComputedStyle(document.querySelector('.role-setting-library-container')).borderTopWidth, tabsInContent:Boolean(document.querySelector('.setting-scope-switch').closest('.setting-directory')), tabsBelowToolbar:document.querySelector('.setting-scope-switch').getBoundingClientRect().bottom<=document.querySelector('.setting-directory-search').getBoundingClientRect().top, tabs:[...document.querySelectorAll('.setting-scope-switch [role=tab]')].map(n=>n.textContent), selected:document.querySelector('.setting-scope-switch [aria-selected=true]').textContent,globalsVisible:Boolean(document.querySelector('.global-setting-libraries'))}})()`);
      await win.webContents.capturePage(undefined, {stayHidden:true});await new Promise(resolve=>setTimeout(resolve,150));
      writeFileSync(join(dirname(reportPath), `role-setting-libraries-${theme}-${width}.png`),(await win.webContents.capturePage()).toPNG());
      await evaluate(`[...document.querySelectorAll('.setting-scope-switch [role=tab]')].find(n=>n.textContent==='全局').click()`);
      await wait(`document.querySelector('.global-setting-library-name')`);
      await evaluate(`document.documentElement.dataset.theme='${theme}';document.body.toggleAttribute('data-ds-dark-theme','${theme}'==='dark');document.querySelector('.global-setting-library-expand').click()`);
      await wait(`document.querySelector('.global-setting-library-entries [role=treeitem]')`);
      await evaluate(`document.querySelector('.global-setting-library-entries [role=treeitem]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:100,clientY:180}))`);
      await wait(`document.querySelector('.editor-context-menu')`);
      const rightClickKeptClosed = await evaluate(`!document.querySelector('.setting-document .setting-document-title input')`);
      await evaluate(`document.querySelector('.editor-directory-heading').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,composed:true}))`);
      await wait(`!document.querySelector('.editor-context-menu')`);
      await evaluate(`document.querySelector('.global-setting-library-entries [role=treeitem]').click()`);
      await wait(`document.querySelector('.setting-document .setting-document-title input')`);
      await evaluate(`[...document.querySelectorAll('.setting-view-switch button')].find(n=>n.textContent.endsWith('正文')).click()`);
      await wait(`document.querySelector('[role=textbox][aria-label="设定正文"]')`);
      await evaluate('document.fonts.ready'); await new Promise(resolve => setTimeout(resolve, 300));
      const layout = await evaluate(`(() => { const rect=n=>{const r=n.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};
        const page=document.querySelector('.setting-workspace'),glob=document.querySelector('.global-setting-libraries');
        const inspector=document.querySelector('.setting-document');return{page:rect(page),global:rect(glob),inspector:rect(inspector),
          overflow:page.scrollWidth>page.clientWidth, editorVisible:rect(inspector).width>0, owner:'全局设定库 / '+document.querySelector('.global-setting-library:has(.is-selected) .global-setting-library-name').textContent,
          count:document.querySelectorAll('.global-setting-library').length, readOnly:!document.querySelector('[role=textbox][aria-label="设定正文"]').isContentEditable,
          canCreate:!document.querySelector('[aria-label="新建"]').disabled, noManager:!document.querySelector('[aria-label="管理"]'),toolbar:[...document.querySelectorAll('.editor-collection-actions button')].map(n=>({text:n.textContent.trim(),...rect(n)}))};})()`);
      await win.webContents.capturePage(undefined, { stayHidden: true });
      await new Promise(resolve => setTimeout(resolve, 100));
      const divider = null;
      await win.webContents.capturePage(undefined, { stayHidden: true });
      await new Promise(resolve => setTimeout(resolve, 200));
      writeFileSync(join(dirname(reportPath), `global-setting-libraries-${theme}-${width}.png`), (await win.webContents.capturePage()).toPNG());
      await evaluate(`document.querySelector('.global-setting-library-entries [role=treeitem]').click()`);
      const keys = [['keydown','Control','ControlLeft'],['keydown','Shift','ShiftLeft'],['keydown','D','KeyD'],
        ['keyup','D','KeyD'],['keyup','Shift','ShiftLeft'],['keyup','Control','ControlLeft'],
        ['keydown','ArrowDown','ArrowDown'],['keyup','ArrowDown','ArrowDown'],['keydown','ArrowDown','ArrowDown'],['keyup','ArrowDown','ArrowDown'],['keydown','Enter','Enter'],['keyup','Enter','Enter']];
      for (const [type,key,code] of keys) {
        await evaluate(`document.querySelector('.global-setting-library-entries [role=tree]').dispatchEvent(new KeyboardEvent('${type}',{key:'${key}',code:'${code}',bubbles:true,cancelable:true}))`);
      }
      const reordered = await evaluate(`Array.from(document.querySelectorAll('.global-setting-library-entries .setting-library-tree-label')).map(n=>n.textContent)`);
      await evaluate(`(() => {const view=window.editorViewFor('设定正文');view.dispatch({changes:{from:0,to:view.state.doc.length,insert:'合成编辑后的正文'}});})()`);
      await evaluate(`document.querySelectorAll('.global-setting-library-entries [role=switch]')[1].click()`);
      const readAppearance = () => evaluate(`(() => {
        const library=document.querySelector('.global-setting-library'), name=library.querySelector('.global-setting-library-name');
        return { nameOpacity:Number(getComputedStyle(name).opacity), nameColor:getComputedStyle(name).color,
          disabled:library.classList.contains('is-disabled'),
          labels:[...library.querySelectorAll('.setting-library-tree-label')].map(node=>({opacity:Number(getComputedStyle(node).opacity),color:getComputedStyle(node).color})),
          switches:[...library.querySelectorAll('.global-setting-library-entries [role=switch]')].map(node=>node.getAttribute('aria-checked')) };
      })()`);
      await new Promise(resolve=>setTimeout(resolve,180));
      const enabledAppearance = await readAppearance();
      await evaluate(`document.querySelector('.global-setting-library-header [role=switch]').click()`);
      await new Promise(resolve=>setTimeout(resolve,180));
      const disabledAppearance = await readAppearance();
      await evaluate(`document.querySelector('.global-setting-library-expand').click()`);
      await wait(`!document.querySelector('.global-setting-library-entries')`);
      const collapsedAppearance = await readAppearance();
      await evaluate(`document.querySelector('.global-setting-library-expand').click()`);
      await wait(`document.querySelector('.global-setting-library-entries [role=switch]')`);
      await evaluate(`document.querySelector('.global-setting-library-header [role=switch]').click()`);
      await new Promise(resolve=>setTimeout(resolve,180));
      const restoredAppearance = await readAppearance();
      await evaluate(`document.querySelector('.global-setting-library-header [role=switch]').click()`);
      await wait(`!document.querySelector('.setting-document-save').disabled`);
      await evaluate(`document.querySelector('.setting-document-save').click()`);
      await wait('window.syntheticGlobals().revision===1');
      const saved = await evaluate('window.syntheticGlobals().libraries[0].enabled');
      const contentsSaved = await evaluate(`window.syntheticGlobals().libraries[0].entries[0].content==='合成编辑后的正文'&&window.syntheticGlobals().libraries[1].entries[0].content==='合成行动规则'`);
      reports.push({ theme, width, initial, layout, disabledSaved: saved === false, contentsSaved, reordered, divider, rightClickKeptClosed,
        appearance:{enabled:enabledAppearance,disabled:disabledAppearance,collapsed:collapsedAppearance,restored:restoredAppearance} });
    }
    writeFileSync(reportPath, JSON.stringify({ reports, errors }, null, 2)); win.destroy(); app.quit();
  } catch (error) { writeFileSync(reportPath, JSON.stringify({ error: error.stack, errors })); app.exit(1); }
});
