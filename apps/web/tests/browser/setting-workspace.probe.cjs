const { app, BrowserWindow } = require('electron');
const { pathToFileURL } = require('node:url');
const { dirname, join, resolve } = require('node:path');
const { mkdirSync, writeFileSync } = require('node:fs');
const file = process.argv[2], reportPath = process.argv[3], output = dirname(reportPath), evidence = resolve('build/setting-workspace-check');
mkdirSync(evidence, { recursive: true });
app.setPath('userData', join(output, 'profile')); app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1480, height: 970, webPreferences: { sandbox: true, backgroundThrottling: false } });
  const errors = [], layouts = [], actions = {};
  win.webContents.on('console-message', ({ level, message }) => { if (level === 'error') errors.push(message); });
  const evaluate = text => win.webContents.executeJavaScript(text);
  const settle = async () => { await evaluate('document.fonts.ready'); await new Promise(resolve => setTimeout(resolve, 160)); };
  const click = async selector => { await evaluate(`document.querySelector(${JSON.stringify(selector)})?.click()`); await settle(); };
  const textClick = async (selector, text) => { await evaluate(`(() => { const target=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.textContent.trim()===${JSON.stringify(text)}); if(!target)throw Error('Missing '+${JSON.stringify(text)}); target.click(); })()`); await settle(); };
  const input = async (selector, value) => { await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.focus();e.select();})()`); await win.webContents.insertText(value); await settle(); };
  const snap = async (name, validateTabs = true) => {
    await evaluate('document.getAnimations().forEach(animation=>animation.finish())');
    await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
    await win.webContents.capturePage(); await settle();
    const data = (await win.webContents.capturePage()).toPNG(); for (const dir of [output,evidence]) writeFileSync(join(dir, name + '.png'), data);
    const tabs = await evaluate(`[...document.querySelectorAll('.setting-workspace [role=tablist]')].map(group=>{const selected=group.querySelector('[aria-selected=true]').getBoundingClientRect(),indicator=group.querySelector('[aria-hidden=true]').getBoundingClientRect();return {label:group.getAttribute('aria-label'),selected:selected.toJSON(),indicator:indicator.toJSON()};})`);
    if(validateTabs)for(const tab of tabs)if(Math.abs(tab.selected.left-tab.indicator.left)>1 || Math.abs(tab.selected.width-tab.indicator.width)>1)throw Error('Selected tab indicator is misaligned: '+JSON.stringify(tab));
  };
  const check = (condition, message) => { if (!condition) throw Error(message); };
  const select = async id => { await evaluate(`(()=>{const r=[...document.querySelectorAll('[role=treeitem]')].find(e=>e.textContent.includes(${JSON.stringify(id)}));if(!r)throw Error('Missing row');r.click();})()`); await settle(); };
  const settings = () => textClick('.setting-view-switch [role=tab]', '设置');
  async function load(width, theme) {
    win.setContentSize(width, 970); await win.loadURL(pathToFileURL(file).href + '?theme=' + theme);
    for(let i=0;i<80;i++){if(await evaluate('!!document.querySelector("[data-fixture-section=card]")'))break;await new Promise(r=>setTimeout(r,25));}
    await click('.character-editor-navigation [aria-label="设定库"]');
    for(let i=0;i<80;i++){if(await evaluate('!!document.querySelector(".setting-document-title input")'))break;await new Promise(r=>setTimeout(r,25));}await settle();
  }
  try {
    for (const [width, theme] of [[1480,'light'], [900,'light'], [1480,'dark']]) {
      await load(width, theme);
      check(await evaluate('(()=>{const save=document.querySelector(".setting-directory-actions .setting-document-save"),create=document.querySelector(".setting-create").getBoundingClientRect(),more=document.querySelector(".setting-directory-more").getBoundingClientRect(),r=save.getBoundingClientRect(),directory=document.querySelector(".setting-directory").getBoundingClientRect();return document.querySelectorAll(".setting-document .setting-document-save").length===0 && directory.width===(innerWidth===1480?480:284) && create.right<r.left && r.right<more.left && Math.abs(create.top-r.top)<1 && Math.abs(more.top-r.top)<1 && r.right<=directory.right && more.right<=directory.right;})()'),'Save must appear once after New in the widened directory header without overflow');actions.directorySavePlacement=true;
      const savePosition = await evaluate('document.querySelector(".setting-document-save").getBoundingClientRect().toJSON()');
      await evaluate('(()=>{const tree=document.querySelector(".setting-library-tree.editor-sidebar-directory"),r=tree.getBoundingClientRect();tree.dispatchEvent(new MouseEvent("mousedown",{bubbles:true,button:0,clientX:r.left+8,clientY:r.bottom-12}));})()');await settle();
      check(await evaluate('!!document.querySelector(".setting-document-empty") && document.querySelectorAll(".setting-document-save").length===1 && document.querySelector(".setting-document-save").disabled'),'Unselected settings workspace must retain its single save button');
      await click('[aria-label="停用合成人设"]');
      check(await evaluate('!!document.querySelector(".setting-document-empty") && !document.querySelector(".setting-document-save").disabled && window.workspaceCalls.role===0'),'Directory-only edits must enable save without selecting or autosaving');
      const emptySavePosition = await evaluate('document.querySelector(".setting-document-save").getBoundingClientRect().toJSON()');
      check(savePosition.top===emptySavePosition.top && savePosition.right===emptySavePosition.right,'Unselected settings save moved within its directory toolbar');
      await snap(`directory-save-${theme}-${width}`);await click('.setting-document-save');
      check(await evaluate('window.workspaceCalls.role===1 && document.querySelector(".setting-document-save").disabled && window.workspaceSaved().role.entries.find(e=>e.id==="persona").enabled===false'),'Directory-only edit did not reach the existing save service');actions.directorySave=true;
      await load(width, theme);
      const controlStyles = await evaluate(`(()=>{const target=document.querySelector('.setting-library-tree-switch'),rules=[];function visit(list){for(const rule of list){if(rule.selectorText&&target.matches(rule.selectorText))rules.push({selector:rule.selectorText,css:rule.style.cssText});if(rule.cssRules)visit(rule.cssRules);}}for(const sheet of document.styleSheets)visit(sheet.cssRules);return {height:target.getBoundingClientRect().height,width:target.getBoundingClientRect().width,rules};})()`);
      writeFileSync(join(evidence,'control-styles.json'),JSON.stringify(controlStyles,null,2));
      check(controlStyles.height===16 && controlStyles.width===28, 'Directory toggle dimensions changed: '+JSON.stringify(controlStyles));
      check(await evaluate('document.querySelectorAll(".setting-document-save").length===1 && !!document.querySelector(".setting-writing-board .cm-editor")'), 'Missing default body or unified save');
      if(width===1480&&theme==='light')await snap('content-light-1480');
      await select('合成书店'); await settings(); await click('.setting-keyword-details > summary');
      const geometry = await evaluate(`(()=>{ const rect=s=>document.querySelector(s).getBoundingClientRect().toJSON(), style=s=>getComputedStyle(document.querySelector(s));
        const rows=[...document.querySelectorAll('.setting-property-row')];return {width:innerWidth,theme:${JSON.stringify(theme)},overflow:document.documentElement.scrollWidth>innerWidth,
          directory:rect('.setting-directory'),editor:rect('.setting-document'),workspace:rect('.character-editor-workspace'),keyword:rect('.setting-keywords-inline > .setting-library-keyword-field > .setting-library-keyword-input'),
          radii:[style('.setting-directory').borderRadius,style('.setting-document').borderRadius],heading:style('.setting-document-title input').fontSize,
          labels:rows.map(e=>({font:getComputedStyle(e.firstElementChild).fontSize,weight:getComputedStyle(e.firstElementChild).fontWeight})),
          aligned:rows.every(e=>Math.abs(e.children[1].getBoundingClientRect().left-rows[0].children[1].getBoundingClientRect().left)<1),
          keywordAligned:Math.abs(rect('.setting-keywords-inline > .setting-library-keyword-field > .setting-library-keyword-input').left-rows[0].children[1].getBoundingClientRect().left)<1,
          titleLines:[style('.setting-directory-heading').borderBottomWidth,style('.setting-document-heading').borderBottomWidth],bodyWidth:rect('.setting-settings-board').width};})()`);
      layouts.push(geometry);
      check(!geometry.overflow && geometry.radii.every(r=>r==='16px') && geometry.editor.top===geometry.workspace.top && geometry.directory.top===geometry.workspace.top && geometry.directory.bottom===geometry.editor.bottom && geometry.editor.left-geometry.directory.right===8, 'Panel geometry differs from confirmed design: '+JSON.stringify(geometry));
      check(geometry.keyword.height===67 && geometry.aligned && geometry.keywordAligned && geometry.heading==='18px' && geometry.labels.every(s=>s.font==='13px'&&s.weight==='400') && geometry.titleLines.every(s=>s==='0px') && geometry.bodyWidth<=640, 'Property geometry differs from design: '+JSON.stringify(geometry));
      await snap(`settings-${theme}-${width}`);
      await select('角色设定');await snap(`folder-${theme}-${width}`);
      if(width===1480 && theme==='light') {
        await click('.setting-folder-more');await snap('folder-actions-light-1480');await textClick('[role=menuitem]','删除文件夹');
        check(await evaluate('document.querySelector("[role=alertdialog]")?.textContent.includes("文件夹内的设定也会一起删除")'), 'Folder action must open the original deletion confirmation');
        await textClick('.setting-library-dialog button','取消');
        check(await evaluate('!document.querySelector("[role=alertdialog]") && !!document.querySelector(".setting-group-settings") && window.workspaceCalls.role===0'), 'Cancelling folder deletion must retain its contents without saving');actions.folderActions=true;
      }
      await select('合成书店');await settings();await click('.setting-keyword-details > summary');
      if(width===900) {
        await select('合成对话');await settings();await click('[aria-label="位置内顺序减一"]');await click('[aria-label="位置内顺序减一"]');
        check(await evaluate('(()=>{const field=document.querySelector(".setting-library-order-card .setting-library-number-control").getBoundingClientRect(),icon=document.querySelector(".setting-order-warning-compact").getBoundingClientRect(),full=document.querySelector(".setting-order-warning-full");return icon.width===24 && icon.left>=field.right+11 && Math.abs((field.top+field.bottom)/2-(icon.top+icon.bottom)/2)<1 && getComputedStyle(full).display==="none" && document.querySelector(".setting-library-order-warning").title.includes("条目已关闭");})()'),'Narrow warning must remain beside the field with a complete tooltip');
        await evaluate('(()=>{const board=document.querySelector(".setting-settings-board");board.scrollTop=board.scrollHeight;})()');await snap('order-light-900');await click('.setting-document-save');actions.responsiveWarning=true;
      }
      if(theme==='dark') {
        await select('合成对话');await settings();
        await evaluate('(()=>{const board=document.querySelector(".setting-settings-board");board.scrollTop=board.scrollHeight;})()');await snap('order-dark-1480');
      }
      if(width!==1480||theme!=='light')continue;
      await click('[aria-label="扫描深度加一"]'); await click('button[aria-label="递归匹配"]'); await click('[aria-label="递归次数加一"]');
      await input('.setting-keywords-inline > .setting-library-keyword-field input','合成新增关键词');win.webContents.sendInputEvent({type:'keyDown',keyCode:'ENTER'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'ENTER'});await settle();
      check(await evaluate('document.querySelector(".setting-keywords-inline").textContent.includes("合成新增关键词") && document.querySelector("input[aria-label=扫描深度]").value==="4" && document.querySelector("input[aria-label=递归次数]").value==="2"'), 'Native keyword callbacks failed');
      await click('.setting-keyword-details > summary');await click('.setting-keyword-details > summary');
      check(await evaluate('document.querySelector("input[aria-label=扫描深度]").value==="4"'), 'Inline collapse lost draft');actions.inlineKeywords=true;
      await select('合成关系');await settings();await click('[aria-label="选择条目图标"]');
      check(await evaluate('document.querySelector("[aria-label=图标页码]").textContent==="2 / 2" && document.querySelector("[aria-label=下一页图标]").disabled'), 'Selected icon page missing');
      await click('[aria-label="上一页图标"]');await snap('icons-light-1480');await click('.setting-icon-grid button');
      check(await evaluate('!document.querySelector(".setting-entry-icons") && !document.querySelector(".setting-document-save").disabled'), 'Icon selection lost draft');actions.iconPaging=true;
      await select('合成对话');await settings();await click('[aria-label="位置内顺序减一"]');await click('[aria-label="位置内顺序减一"]');
      check(await evaluate('!!document.querySelector(".setting-library-order-warning") && document.querySelector("[aria-label=启用合成对话]").getAttribute("aria-checked")==="false"'), 'Conflict must disable only that entry');
      const warningPlacement = await evaluate('(()=>{const field=document.querySelector(".setting-library-order-card .setting-library-number-control").getBoundingClientRect(),warning=document.querySelector(".setting-library-order-warning").getBoundingClientRect();return {field:field.toJSON(),warning:warning.toJSON(),weight:getComputedStyle(document.querySelector(".setting-library-order-warning")).fontWeight};})()');
      check(warningPlacement.warning.left>=warningPlacement.field.right+11 && Math.abs((warningPlacement.field.top+warningPlacement.field.bottom)/2-(warningPlacement.warning.top+warningPlacement.warning.bottom)/2)<1 && warningPlacement.weight==='400','Order warning must sit beside its number control: '+JSON.stringify(warningPlacement));
      await evaluate('(()=>{const board=document.querySelector(".setting-settings-board");board.scrollTop=board.scrollHeight;})()');await settle();await snap('order-light-1480');
      await input('input[aria-label="位置内顺序"]','7');check(await evaluate('!document.querySelector(".setting-library-order-warning")'), 'Order correction failed');actions.order=true;
      await textClick('.setting-scope-switch [role=tab]','全局');await click('.global-setting-library-name');await select('共享条目');
      await evaluate(`(()=>{const view=window.editorViewFor('设定正文');view.dispatch({changes:{from:0,to:view.state.doc.length,insert:'合成共享正文已修改'}})})()`);await settle();
      check(await evaluate('window.workspaceCalls.role===0 && window.workspaceCalls.global===0'), 'View changes or edits auto-saved');
      await click('.setting-document-save');check(await evaluate('window.workspaceCalls.role===1 && window.workspaceCalls.global===1 && document.querySelector(".setting-document-save").disabled'), 'Unified save did not cover both scopes');actions.unifiedSave=true;
      await textClick('.setting-scope-switch [role=tab]','角色');
      await click('.setting-version-button');await snap('version-light-1480');
      const menuWidth=await evaluate('(()=>{const a=document.querySelector(".setting-version-button").getBoundingClientRect(),m=[...document.querySelectorAll("[role=menu]")].find(e=>e.getBoundingClientRect().width>0)?.getBoundingClientRect();return m&&m.width>=a.width&&m.bottom<=a.top+1;})()');
      check(menuWidth,'Version popup must open above at full width');await textClick('[role=menuitem]','v2 · 合成版本');await settle();
      check(await evaluate('document.querySelector(".setting-document-title input").value==="另一版本条目" && window.workspaceCalls.role===1'), 'Version switch saved or lost active version');
      await click('.setting-version-button');await textClick('[role=menuitem]','v1 · 合成角色');
      await select('合成书店');await settings();await click('.setting-keyword-details > summary');check(await evaluate('document.querySelector("input[aria-label=扫描深度]").value==="4"'), 'Version switching lost draft body/settings');actions.version=true;
      const before=await evaluate('document.querySelector(".setting-directory").getBoundingClientRect().width');await evaluate('document.querySelector(".setting-pane-resizer").focus()');
      win.webContents.sendInputEvent({type:'keyDown',keyCode:'RIGHT'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'RIGHT'});await settle();
      check(await evaluate('document.querySelector(".setting-directory").getBoundingClientRect().width')===before+16,'Keyboard resize failed');await evaluate('document.querySelector(".setting-pane-resizer").dispatchEvent(new MouseEvent("dblclick",{bubbles:true}))');await settle();
      check(await evaluate('document.querySelector(".setting-directory").getBoundingClientRect().width')===480,'Reset width failed');actions.resize=true;
      await select('合成关系');await textClick('.setting-content-tools button','文字');await textClick('[role=menuitem]','EJS');
      check(await evaluate('document.querySelector(".setting-format-button").textContent.includes("EJS")'), 'EJS format menu failed');await click('.setting-immersive-host button');
      check(await evaluate('!!document.querySelector(".immersive-markdown-editor") && !document.querySelector(".immersive-markdown-tabs")'),'EJS immersion exposed Markdown preview');await click('.immersive-markdown-exit');actions.format=true;
      await click('.character-editor-navigation [aria-label="基础资料"]');
      check(await evaluate('!!document.querySelector(".unsaved-changes-dialog") && !!document.querySelector(".setting-workspace")'), 'Leaving the workspace lost the unsaved guard');
      await textClick('.unsaved-changes-dialog button','取消');check(await evaluate('!!document.querySelector(".setting-workspace") && !document.querySelector(".unsaved-changes-dialog")'),'Cancel failed to retain the workspace draft');actions.navigationGuard=true;
      await click('.setting-document-save');
      await select('合成关系');
      await evaluate('(()=>{const row=[...document.querySelectorAll("[role=treeitem]")].find(e=>e.textContent.includes("合成关系"));row.dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,clientX:row.getBoundingClientRect().left+80,clientY:row.getBoundingClientRect().top+16}));})()');await settle();
      await textClick('[role=menuitem]','删除');await textClick('.setting-library-dialog button','删除');
      check(await evaluate('!!document.querySelector(".setting-document-empty") && document.querySelectorAll(".setting-document-save").length===1 && !document.querySelector(".setting-document-save").disabled'),'Deleting the selected setting must retain save');
      await snap('deleted-save-light-1480');await click('.setting-document-save');
      check(await evaluate('document.querySelector(".setting-document-save").disabled && !window.workspaceSaved().role.entries.some(e=>e.id==="relation")'),'Deleted setting draft did not reach unified save');actions.deletedSave=true;
      await click('.setting-directory-more');await textClick('[role=menuitem]','多选');
      check(await evaluate('!!document.querySelector(".setting-document-empty") && document.querySelectorAll(".setting-document-save").length===1'),'Multi-select must not remove the workspace save');
      await click('[aria-label="选择合成世界"]');await textClick('.editor-selection-bar button','删除');await textClick('.setting-library-dialog button','删除');
      check(await evaluate('!!document.querySelector(".setting-document-empty") && !document.querySelector(".setting-document-save").disabled'),'Batch deletion must retain an enabled save');await click('.setting-document-save');
      check(await evaluate('document.querySelector(".setting-document-save").disabled && !window.workspaceSaved().role.entries.some(e=>e.id==="worldview")'),'Batch deletion did not reach unified save');actions.batchSave=true;
    }
    check(!errors.length,errors.join('\n'));writeFileSync(reportPath,JSON.stringify({layouts,actions,errors},null,2));win.destroy();app.exit(0);
  } catch(error) {await snap('failure',false);writeFileSync(join(evidence,'failure.json'),JSON.stringify({message:error.message,layouts,actions,errors},null,2));console.error(error);win.destroy();app.exit(1);}
});
