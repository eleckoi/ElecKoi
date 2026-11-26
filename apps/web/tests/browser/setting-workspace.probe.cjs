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
    if (validateTabs) {
      const aligned = await evaluate(`[...document.querySelectorAll('.setting-workspace [role=tablist]')].every(group=>{
        const selected=group.querySelector('[aria-selected=true]');
        const indicator=group.querySelector('[aria-hidden=true]')?.getBoundingClientRect(),rect=selected.getBoundingClientRect();
        return !indicator || (Math.abs(rect.left-indicator.left)<1 && Math.abs(rect.width-indicator.width)<1);
      })`);
      if (!aligned) throw Error('Selected tab indicator is misaligned');
    }
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
      check(await evaluate(`(() => {
        const directory = document.querySelector('.setting-directory').getBoundingClientRect();
        const list = document.querySelector('.setting-library-tree').getBoundingClientRect();
        const version = document.querySelector('.setting-version-button').getBoundingClientRect();
        return version.top >= list.bottom && version.bottom <= directory.bottom;
      })()`), 'Version switcher must remain visible below the directory list');
      check(await evaluate(`(() => {
        const manage = document.querySelector('.setting-directory-actions .setting-toolbar-version-manage');
        const adjacentImport = manage?.previousElementSibling?.matches('.setting-toolbar-import, :has(> .setting-toolbar-import)');
        const rect = manage?.getBoundingClientRect();
        return adjacentImport && rect.right <= document.querySelector('.character-studio-toolbar').getBoundingClientRect().right;
      })()`), 'Version management must be beside Import in the directory toolbar');
      const toolbar = await evaluate(`(() => {
        const rect = selector => document.querySelector(selector).getBoundingClientRect().toJSON();
        return {
          create: rect('.setting-toolbar-create'), save: rect('.setting-directory-actions .setting-document-save'),
          search: rect('.setting-search-input'), select: rect('.editor-directory-select'), directory: rect('.setting-directory'), header: rect('.character-studio-toolbar'),
          hasLegacyMenu: !!document.querySelector('.character-studio-toolbar .setting-toolbar-icon'),
          inspectorSaveCount: document.querySelectorAll('.setting-document .setting-document-save').length,
        };
      })()`);
      const { create, save, search, select: multiSelect, directory, header, inspectorSaveCount, hasLegacyMenu } = toolbar;
      check(!hasLegacyMenu && inspectorSaveCount === 0 && directory.width === Math.min(480, Math.max(260, header.width - 388))
        && create.right < save.left && Math.abs(create.top - save.top) < 1 && save.right <= header.right
        && search.right < multiSelect.left && multiSelect.right <= directory.right,
      'Save must appear once in the workspace header after New: ' + JSON.stringify(toolbar));
      actions.directorySavePlacement = true;
      check(await evaluate(`(() => {
        const button = document.querySelector('.editor-directory-select');
        const tree = document.querySelector('.setting-library-tree');
        const area = tree.closest('.sidebar-scroll-area');
        return !button.textContent.trim() && !!button.querySelector('svg, img') && button.title === '多选'
          && getComputedStyle(tree).scrollbarWidth === 'none'
          && Math.abs(area.getBoundingClientRect().right - directoryRight()) === 4;
        function directoryRight() { return document.querySelector('.setting-directory').getBoundingClientRect().right; }
      })()`), 'Directory must use an icon-only toggle and leave a four-pixel gap for the chat scrollbar');
      if (width === 1480 && theme === 'light') {
        await evaluate('document.querySelector(".setting-library-tree").parentElement.style.flex = "0 0 140px"');
        await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
        await win.webContents.capturePage();
        await settle();
        const scrollState = await evaluate(`(() => {
          const tree = document.querySelector('.setting-library-tree');
          const area = tree.parentElement;
          const scrollbar = area.querySelector('[role="scrollbar"]');
          scrollbar?.focus();
          scrollbar?.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }));
          return { railRight: scrollbar?.getBoundingClientRect().right, areaRight: area.getBoundingClientRect().right,
            scrollTop: tree.scrollTop, scrollHeight: tree.scrollHeight, clientHeight: tree.clientHeight };
        })()`);
        check(scrollState.railRight === scrollState.areaRight && scrollState.scrollTop > 0
          && Math.abs(scrollState.scrollTop - (scrollState.scrollHeight - scrollState.clientHeight)) < 2,
        'The directory scrollbar must appear on overflow and scroll to the end with the keyboard: ' + JSON.stringify(scrollState));
        await evaluate('(()=>{const tree=document.querySelector(".setting-library-tree");tree.scrollTop=0;tree.parentElement.style.removeProperty("flex");tree.parentElement.querySelector("[role=scrollbar]")?.blur();})()');
        await settle();
      }
      const savePosition = await evaluate('document.querySelector(".setting-document-save").getBoundingClientRect().toJSON()');
      await evaluate('(()=>{const tree=document.querySelector(".setting-library-tree.editor-sidebar-directory"),r=tree.getBoundingClientRect();tree.dispatchEvent(new MouseEvent("mousedown",{bubbles:true,button:0,clientX:r.left+8,clientY:r.bottom-12}));})()');await settle();
      check(await evaluate('!!document.querySelector(".setting-document-empty") && document.querySelectorAll(".setting-document-save").length===1 && document.querySelector(".setting-document-save").disabled'),'Unselected settings workspace must retain its single save button');
      await click('[aria-label="合成人设的触发规则"]');
      check(await evaluate('!!document.querySelector(".setting-document-empty") && !document.querySelector(".setting-document-save").disabled && window.workspaceCalls.role===0'),'Directory-only edits must enable save without selecting or autosaving');
      const emptySavePosition = await evaluate('document.querySelector(".setting-document-save").getBoundingClientRect().toJSON()');
      check(savePosition.top===emptySavePosition.top && savePosition.right===emptySavePosition.right,'Unselected settings save moved within its directory toolbar');
      await snap(`directory-save-${theme}-${width}`);await click('.setting-document-save');
      check(await evaluate('window.workspaceCalls.role===1 && document.querySelector(".setting-document-save").disabled && window.workspaceSaved().role.entries.find(e=>e.id==="persona").enabled===false'),'Directory-only edit did not reach the existing save service');actions.directorySave=true;
      await load(width, theme);
      const controlStyles = await evaluate(`(()=>{const target=document.querySelector('.setting-library-tree-switch'),rules=[];function visit(list){for(const rule of list){if(rule.selectorText&&target.matches(rule.selectorText))rules.push({selector:rule.selectorText,css:rule.style.cssText});if(rule.cssRules)visit(rule.cssRules);}}for(const sheet of document.styleSheets)visit(sheet.cssRules);return {height:target.getBoundingClientRect().height,width:target.getBoundingClientRect().width,rules};})()`);
      writeFileSync(join(evidence,'control-styles.json'),JSON.stringify(controlStyles,null,2));
      check(controlStyles.height===18 && controlStyles.width===32, 'Directory toggle must use the shared editor switch size: '+JSON.stringify(controlStyles));
      check(await evaluate('document.querySelectorAll(".setting-document-save").length===1 && !!document.querySelector(".setting-writing-board .cm-editor")'), 'Missing default body or unified save');
      if(width===1480&&theme==='light')await snap('content-light-1480');
      await select('合成书店'); await settings();
      check(await evaluate('document.querySelector(".setting-keyword-details").open'), 'Matching rules must start expanded');
      const geometry = await evaluate(`(()=>{ const rect=s=>document.querySelector(s).getBoundingClientRect().toJSON(), style=s=>getComputedStyle(document.querySelector(s));
        const rows=[...document.querySelectorAll('.setting-rule-fields .setting-property-row')].filter(row=>!row.closest('.setting-usage-primary'));return {width:innerWidth,theme:${JSON.stringify(theme)},overflow:document.documentElement.scrollWidth>innerWidth,
          directory:rect('.setting-directory'),editor:rect('.setting-document'),workspace:rect('.character-editor-workspace'),header:rect('.character-studio-toolbar'),keyword:rect('.setting-keywords-inline > .setting-library-keyword-field > .setting-library-keyword-input'),
          radii:[style('.setting-directory').borderRadius,style('.setting-document').borderRadius],heading:style('.setting-document-title input').fontSize,
          labels:rows.map(e=>({font:getComputedStyle(e.firstElementChild).fontSize,weight:getComputedStyle(e.firstElementChild).fontWeight})),
          aligned:rows.every(e=>Math.abs(e.children[1].getBoundingClientRect().left-rows[0].children[1].getBoundingClientRect().left)<1),
          keywordAligned:Math.abs(rect('.setting-keywords-inline > .setting-library-keyword-field > .setting-library-keyword-input').left-rows[0].children[1].getBoundingClientRect().left)<1,
          titleLines:[style('.editor-directory-heading').borderBottomWidth,style('.setting-document-heading').borderBottomWidth],bodyWidth:rect('.setting-settings-board').width};})()`);
      layouts.push(geometry);
      check(!geometry.overflow && geometry.radii.every(r=>r==='0px') && geometry.header.top===geometry.workspace.top && geometry.editor.top===geometry.header.bottom && geometry.directory.top===geometry.header.bottom && geometry.directory.bottom===geometry.editor.bottom && geometry.editor.left-geometry.directory.right===1, 'Panel geometry differs from confirmed design: '+JSON.stringify(geometry));
      check(geometry.keyword.height>=67 && geometry.aligned && geometry.keywordAligned && geometry.heading==='16px' && geometry.labels.every(s=>s.font==='13px'&&s.weight==='400') && geometry.titleLines.join(',')==='1px,0px' && geometry.bodyWidth<=640, 'Property geometry differs from design: '+JSON.stringify(geometry));
      await snap(`settings-${theme}-${width}`);
      await select('角色设定');await snap(`folder-${theme}-${width}`);
      if(width===1480 && theme==='light') {
        await click('.setting-folder-more');await snap('folder-actions-light-1480');await textClick('[role=menuitem]','删除文件夹');
        check(await evaluate('document.querySelector(".product-dialog")?.textContent.includes("文件夹内的设定也会一起删除")'), 'Folder action must open the deletion confirmation');
        await textClick('.product-dialog button','取消');
        check(await evaluate('!document.querySelector(".product-dialog") && !!document.querySelector(".setting-group-settings") && window.workspaceCalls.role===0'), 'Cancelling folder deletion must retain its contents without saving');actions.folderActions=true;
      }
      await select('合成书店');await settings();
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
      check(await evaluate('!!document.querySelector(".setting-library-order-warning") && document.querySelector("[aria-label=合成对话的触发规则]").getAttribute("aria-checked")==="false"'), 'Conflict must disable only that entry');
      const warningPlacement = await evaluate('(()=>{const field=document.querySelector(".setting-library-order-card .setting-library-number-control").getBoundingClientRect(),warning=document.querySelector(".setting-library-order-warning").getBoundingClientRect();return {field:field.toJSON(),warning:warning.toJSON(),weight:getComputedStyle(document.querySelector(".setting-library-order-warning")).fontWeight};})()');
      check(warningPlacement.warning.left>=warningPlacement.field.right+11 && Math.abs((warningPlacement.field.top+warningPlacement.field.bottom)/2-(warningPlacement.warning.top+warningPlacement.warning.bottom)/2)<1 && warningPlacement.weight==='400','Order warning must sit beside its number control: '+JSON.stringify(warningPlacement));
      await evaluate('(()=>{const board=document.querySelector(".setting-settings-board");board.scrollTop=board.scrollHeight;})()');await settle();await snap('order-light-1480');
      await input('input[aria-label="位置内顺序"]','7');check(await evaluate('!document.querySelector(".setting-library-order-warning")'), 'Order correction failed');actions.order=true;
      await textClick('.setting-scope-switch [role=tab]','全局');await click('.global-setting-library-name');await select('共享条目');
      await evaluate(`(()=>{const view=window.editorViewFor('设定正文');view.dispatch({changes:{from:0,to:view.state.doc.length,insert:'合成共享正文已修改'}})})()`);await settle();
      check(await evaluate('window.workspaceCalls.role===0 && window.workspaceCalls.global===0'), 'View changes or edits auto-saved');
      await click('.setting-document-save');check(await evaluate('window.workspaceCalls.role===1 && window.workspaceCalls.global===1 && document.querySelector(".setting-document-save").disabled'), 'Unified save did not cover both scopes');actions.unifiedSave=true;
      await textClick('.setting-scope-switch [role=tab]','角色');
      await click('.setting-toolbar-version-manage');
      check(await evaluate('document.querySelector("[role=dialog]")?.textContent.includes("版本管理")'), 'Directory toolbar must open version management');
      await click('[role="dialog"] [aria-label="关闭"]');
      await click('.setting-version-button');await snap('version-light-1480');
      check(await evaluate('document.querySelector(".editor-picker-row[aria-pressed=true]").textContent.trim()==="v1 · 合成角色"'), 'Current version must be marked');
      await input('[aria-label="搜索版本"]','合成版本');
      check(await evaluate('document.querySelectorAll(".editor-picker-row").length===1'), 'Version search must filter by name');
      await textClick('.editor-picker-row','v2 · 合成版本');await settle();
      check(await evaluate('document.querySelector(".setting-document-title input").value==="另一版本条目" && window.workspaceCalls.role===1'), 'Version switch saved or lost active version');
      await click('.setting-version-button');await textClick('.editor-picker-row','v1 · 合成角色');
      await select('合成书店');await settings();check(await evaluate('document.querySelector("input[aria-label=扫描深度]").value==="4"'), 'Version switching lost draft body/settings');actions.version=true;
      const before=await evaluate('document.querySelector(".setting-directory").getBoundingClientRect().width');await evaluate('document.querySelector(".setting-pane-resizer").focus()');
      win.webContents.sendInputEvent({type:'keyDown',keyCode:'RIGHT'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'RIGHT'});await settle();
      check(await evaluate('document.querySelector(".setting-directory").getBoundingClientRect().width')===before+16,'Keyboard resize failed');await evaluate('document.querySelector(".setting-pane-resizer").dispatchEvent(new MouseEvent("dblclick",{bubbles:true}))');await settle();
      check(await evaluate('document.querySelector(".setting-directory").getBoundingClientRect().width')===480,'Reset width failed');actions.resize=true;
      await select('合成关系');
      await evaluate(`(()=>{const view=window.editorViewFor('设定正文');view.dispatch({changes:{from:0,to:view.state.doc.length,insert:'首段<%= 2 %>尾段'}})})()`);await settle();
      check(await evaluate('document.querySelector(".setting-template-status")?.textContent.includes("EJS") && window.editorViewFor("设定正文").state.doc.toString()==="首段<%= 2 %>尾段"'), 'Mixed body format was not recognized');await click('.setting-immersive-host button');
      check(await evaluate('!!document.querySelector(".immersive-markdown-editor") && !document.querySelector(".immersive-markdown-tabs")'),'EJS immersion exposed Markdown preview');await click('.immersive-markdown-exit');actions.format=true;
      await click('.character-editor-navigation [aria-label="基础资料"]');
      check(await evaluate('!!document.querySelector(".product-dialog") && !!document.querySelector(".setting-workspace")'), 'Leaving the workspace lost the unsaved guard');
      await textClick('.product-dialog button','取消');check(await evaluate('!!document.querySelector(".setting-workspace") && !document.querySelector(".product-dialog")'),'Cancel failed to retain the workspace draft');actions.navigationGuard=true;
      await click('.setting-document-save');
      await select('合成关系');
      await evaluate('(()=>{const row=[...document.querySelectorAll("[role=treeitem]")].find(e=>e.textContent.includes("合成关系"));row.dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,clientX:row.getBoundingClientRect().left+80,clientY:row.getBoundingClientRect().top+16}));})()');await settle();
      await textClick('[role=menuitem]','删除');await textClick('.product-dialog button','删除');
      check(await evaluate('!!document.querySelector(".setting-document-empty") && document.querySelectorAll(".setting-document-save").length===1 && !document.querySelector(".setting-document-save").disabled'),'Deleting the selected setting must retain save');
      await snap('deleted-save-light-1480');await click('.setting-document-save');
      check(await evaluate('document.querySelector(".setting-document-save").disabled && !window.workspaceSaved().role.entries.some(e=>e.id==="relation")'),'Deleted setting draft did not reach unified save');actions.deletedSave=true;
      await click('.editor-directory-select');
      check(await evaluate('!!document.querySelector(".setting-document-empty") && document.querySelectorAll(".setting-document-save").length===1'),'Multi-select must not remove the workspace save');
      await click('[aria-label="选择合成世界"]');await textClick('.editor-selection-bar button','删除');await textClick('.product-dialog button','删除');
      check(await evaluate('!!document.querySelector(".setting-document-empty") && !document.querySelector(".setting-document-save").disabled'),'Batch deletion must retain an enabled save');await click('.setting-document-save');
      check(await evaluate('document.querySelector(".setting-document-save").disabled && !window.workspaceSaved().role.entries.some(e=>e.id==="worldview")'),'Batch deletion did not reach unified save');actions.batchSave=true;
    }
    await load(1920, 'dark');
    const insets = selector => evaluate(`(() => {
      const panel = document.querySelector(${JSON.stringify(selector)});
      const content = panel.querySelector('.cm-content').getBoundingClientRect(), frame = panel.getBoundingClientRect();
      return [content.left - frame.left, frame.right - content.right, content.width];
    })()`);
    const inline = await insets('.setting-writing-board');
    check(inline[0]<=32 && inline[1]<=32 && inline[2]>1000, 'Wide setting body must use the available editor width: '+inline);
    await click('.setting-immersive-host button');
    const immersive = await insets('.immersive-markdown-body');
    check(immersive[0]<=32 && immersive[1]<=32 && immersive[2]>1700, 'Wide immersive setting body must keep compact margins: '+immersive);
    actions.wideBody = true;
    check(!errors.length,errors.join('\n'));writeFileSync(reportPath,JSON.stringify({layouts,actions,errors},null,2));win.destroy();app.exit(0);
  } catch(error) {await snap('failure',false);writeFileSync(join(evidence,'failure.json'),JSON.stringify({message:error.message,layouts,actions,errors},null,2));console.error(error);win.destroy();app.exit(1);}
});
