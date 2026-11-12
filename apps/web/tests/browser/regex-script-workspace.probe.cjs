const { app, BrowserWindow } = require('electron');
const { pathToFileURL } = require('node:url');
const { dirname, join } = require('node:path');
const { mkdirSync, writeFileSync } = require('node:fs');
const file = process.argv[2], reportPath = process.argv[3], output = dirname(reportPath);
app.setPath('userData', join(output, 'browser-profile')); app.disableHardwareAcceleration(); app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1480, height: 970, webPreferences: { sandbox: true, backgroundThrottling: false, offscreen: true } });
  const errors = [], layouts = [], actions = {}, performance = [];
  win.webContents.on('console-message', ({ level, message }) => { if (level === 'error') errors.push(message); });
  const evaluate = code => { writeFileSync(join(output, 'progress.json'), JSON.stringify({code:code.slice(0,400),time:new Date().toISOString()})); return win.webContents.executeJavaScript(code); }, check = (value, message) => { if (!value) throw Error(message); };
  const settle = async () => { await new Promise(resolve => setTimeout(resolve, 150)); };
  const wait = async selector => { for (let i = 0; i < 80; i++) { if (await evaluate(`!!document.querySelector(${JSON.stringify(selector)})`)) return; await settle(); } throw Error('Missing ' + selector); };
  const click = async selector => { await wait(selector); await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`); await settle(); };
  const textClick = async (selector, label) => { check(await evaluate(`(()=>{const el=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.textContent.trim()===${JSON.stringify(label)});el?.click();return !!el})()`), 'Missing ' + label); await settle(); };
  const edit = async (label, value) => { await evaluate(`(() => {
    const v = window.editorViewFor(${JSON.stringify(label)});
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: ${JSON.stringify(value)} } });
  })()`); await settle(); };
  const value = label => evaluate(`window.editorViewFor(${JSON.stringify(label)}).state.doc.toString()`);
  const select = (kind, label) => textClick(kind === 'regex' ? '.regex-rule-main' : '.script-list-name', label);
  const snap = async name => { await evaluate('document.getAnimations().forEach(a=>a.finish())'); await settle(); await win.webContents.capturePage(); writeFileSync(join(output, name + '.png'), (await win.webContents.capturePage()).toPNG()); };
  async function load(kind, width = 1480, theme = 'light', long = false) {
    if (win.webContents.getURL().startsWith('file:') && await evaluate('!!document.querySelector(".setting-document-save:not(:disabled)")')) await click('.setting-document-save');
    win.setContentSize(width, 970); await win.loadURL(pathToFileURL(file).href + `?kind=${kind}&theme=${theme}${long ? '&long=1' : ''}`); await wait('.character-editor-navigation');
    await textClick('.character-editor-navigation button', kind === 'regex' ? '正则' : '脚本'); await wait('.rs-row'); await wait('.setting-version-button');
    await select(kind, kind === 'regex' ? '对白排版' : '书店日常'); await wait('.cm-editor'); await settle();
  }
  try {
    for (const kind of ['regex', 'scripts']) for (const [width, theme] of [[1480, 'light'], [900, 'light'], [1480, 'dark']]) {
      await load(kind, width, theme);
      const layout = await evaluate(`(()=>{const r=s=>document.querySelector(s).getBoundingClientRect().toJSON();return {kind:${JSON.stringify(kind)},width:innerWidth,theme:${JSON.stringify(theme)},directory:r('.setting-directory'),editor:r('.setting-document'),save:r('.setting-document-save'),create:r('.setting-create'),more:r('.setting-directory-more'),font:getComputedStyle(document.querySelector('.cm-content')).fontSize,overflow:document.documentElement.scrollWidth>innerWidth,editors:document.querySelectorAll('.cm-editor').length}})()`);
      check(!layout.overflow && layout.directory.top === 40 && layout.editor.top === 40 && layout.directory.width === (width === 1480 ? 480 : 284) && layout.editor.left - layout.directory.right === 8 && layout.directory.bottom === layout.editor.bottom && layout.font === '14px', 'Layout ' + JSON.stringify(layout));
      check(layout.create.right < layout.save.left && layout.save.right < layout.more.left && await evaluate('document.querySelectorAll(".setting-document-save").length===1 && !document.querySelector(".setting-document .setting-document-save")'), 'Unified save position');
      layouts.push(layout); await snap(`${kind}-${theme}-${width}`);
      if (kind === 'regex') {
        check(await evaluate('document.querySelectorAll(".rs-view-tabs [role=tab]").length===2 && !!document.querySelector(".rs-regex-options [role=switch]") && document.querySelectorAll(".cm-editor").length===2'), 'Regex options must share Edit with both text editors');
        check(await evaluate('(()=>{const boards=[...document.querySelectorAll(".rs-regex-edit>.rs-writing")].map(e=>e.getBoundingClientRect()), options=document.querySelector(".rs-regex-options").getBoundingClientRect(), panel=document.querySelector(".setting-document").getBoundingClientRect();return Math.abs(boards[0].height-boards[1].height)<1 && boards[0].height>150 && panel.bottom-boards[1].bottom<30 && options.bottom<boards[0].top && !!document.querySelector("input[aria-label=规则名称设置]")})()'), 'Regex inputs must share remaining height and retain Basic information');
        actions.regexMergedEdit = true;
        if (width === 900) {
          win.setContentSize(900, 650); await settle();
          check(await evaluate('(()=>{const e=document.querySelector(".rs-regex-edit");e.scrollTop=e.scrollHeight;return e.scrollHeight>e.clientHeight && [...document.querySelectorAll(".rs-regex-edit>.rs-writing")].at(-1).getBoundingClientRect().bottom<=e.getBoundingClientRect().bottom+1})()'), 'Short windows must scroll to all regex configuration');
          await snap('regex-short-light-900'); win.setContentSize(900, 970); await settle();
        }
        await textClick('[role=tab]', '测试'); await snap(`${kind}-test-${theme}-${width}`);
        check(await evaluate('!document.querySelector(".rs-regex-options") && document.querySelectorAll(".cm-editor").length===2'), 'Test should only mount its own inputs');
      } else {
        await textClick('[role=tab]', '设置'); await snap(`${kind}-settings-${theme}-${width}`);
        check(await evaluate('document.querySelectorAll(".rs-script-tabs [role=tab]").length===3 && !!document.querySelector(".rs-buttons [role=switch]") && document.querySelectorAll(".cm-editor").length===1'), 'Buttons must share Settings with JSON; source must unmount');
        actions.scriptMergedButtons = true;
      }
      if (width !== 1480 || theme !== 'light') continue;
      await load(kind); const noun = kind === 'regex' ? '正则' : '脚本', source = kind === 'regex' ? '替换内容' : '脚本源码';
      await edit(source, '完整草稿\n最后一行'); check(await evaluate('window.workspaceCalls===0 && !document.querySelector(".setting-document-save").disabled'), 'Editing must remain a manual draft');
      await click(`[aria-label="${source}输入区"] .setting-immersive-host button`); check(await evaluate('document.querySelectorAll(".cm-editor").length') === (kind === 'regex' ? 2 : 1), 'Immersion duplicates the full active document'); await edit(source, '沉浸编辑后的完整草稿'); await click('.immersive-markdown-exit'); check(await value(source) === '沉浸编辑后的完整草稿', 'Immersion draft lost'); actions[kind + 'Immersion'] = true;
      await evaluate('window.workspaceFails=true'); await click('.setting-document-save'); check(await evaluate('!!document.querySelector("[role=alert]") && !document.querySelector(".setting-document-save").disabled'), 'Failed save must retain draft'); await evaluate('window.workspaceFails=false'); await click('.setting-document-save'); check(await evaluate('document.querySelector(".setting-document-save").disabled && window.workspaceCalls===2'), 'Unified save retry'); actions[kind + 'SaveRetry'] = true;
      await evaluate('document.querySelector(".rs-directory-content").dispatchEvent(new MouseEvent("mousedown",{bubbles:true,button:0}))'); await settle(); check(await evaluate('!!document.querySelector(".setting-document-empty") && !!document.querySelector(".setting-document-save") && !document.querySelector(".cm-editor")'), 'Empty selection must retain save and release editors'); await click('.rs-library-heading [role=switch]'); await click('.setting-document-save'); actions[kind + 'DirectorySave'] = true;
      await click('.setting-directory-more'); await textClick('[role=menuitem]', '多选'); await click('.editor-selection-bar input'); await textClick('.editor-selection-bar button', '复制'); check(await evaluate('!document.querySelector(".setting-document-save").disabled'), 'Multi copy lost unified save'); await click('.setting-directory-more'); await textClick('[role=menuitem]', '完成多选'); await click('.setting-document-save'); actions[kind + 'Multi'] = true;
      await textClick('[role=tab]', '全局'); check(await evaluate('document.querySelector(".rs-library-heading").textContent.includes("全局")'), 'Global scope missing'); await textClick('[role=tab]', '角色'); actions[kind + 'Scopes'] = true;
      await click('.setting-version-button'); await textClick('[role=menuitem]', '管理版本'); await wait('.editor-management-modal'); await snap(`${kind}-manager-light-1480`);
      if (kind === 'scripts') { await textClick('.editor-management-modal button', '打开源码目录'); check(await evaluate('window.openDirectoryCalls===1'), 'Original source directory action missing'); }
      await textClick('.editor-management-modal button', '创建空白版本'); await evaluate(`(()=>{const e=document.querySelector('[placeholder="版本名称"]');e.focus();e.select()})()`); await win.webContents.insertText('空白测试'); await textClick('button', '创建'); await click('.editor-management-modal [aria-label=关闭]'); check(await evaluate('!!document.querySelector(".setting-document-empty") && !!document.querySelector(".setting-document-save") && !document.querySelector(".rs-row")'), 'Empty version state'); const emptyPosition = await evaluate('(()=>{const p=document.querySelector(".rs-directory-empty").getBoundingClientRect(), tree=document.querySelector(".rs-directory-library [role=tree]").getBoundingClientRect();return {dx:Math.abs(p.left+p.width/2-tree.left-tree.width/2),dy:Math.abs(p.top+p.height/2-tree.top-tree.height/2)}})()');
      check(emptyPosition.dx < 1 && emptyPosition.dy < 1, 'Empty directory text must be centered: ' + JSON.stringify(emptyPosition));
      await snap(`${kind}-empty-light-1480`); actions[kind + 'EmptyCentered'] = true; actions[kind + 'Version'] = true;
      await click('.setting-create'); await textClick('[role=menuitem]', kind === 'regex' ? '正则规则' : '脚本'); check(await evaluate('!!document.querySelector(".setting-document-heading input")'), 'Create failed'); await click(kind === 'regex' ? '[aria-label=当前规则操作]' : '[aria-label=当前脚本操作]'); await textClick('[role=menuitem]', kind === 'regex' ? '删除规则' : '删除脚本'); await textClick('[role=alertdialog] button', '删除'); check(await evaluate('!!document.querySelector(".setting-document-empty") && !document.querySelector(".setting-document-save").disabled'), 'Delete lost save'); actions[kind + 'Delete'] = true;
      await load(kind);
      if (kind === 'regex') {
        await click('[aria-label="修改发送给 AI 的提示词"]');
        check(await evaluate(`[...document.querySelectorAll('.rs-regex-options [role="switch"]')].every(el => el.getAttribute('aria-checked') === 'true')`), 'Both processing ranges must remain selectable');
        await click('.setting-document-save'); check(await evaluate('window.workspaceSaved().characterRules[0].displayOnly && window.workspaceSaved().characterRules[0].promptOnly'), 'Both range flags must survive unified save'); actions.regexBothRanges = true;
        await snap('regex-both-ranges-light-1480');
        await textClick('[role=tab]', '测试'); await edit('测试输入', '「测试」'); await textClick('button', '运行测试'); check(await value('测试结果') === '“测试”', 'Original test service result'); actions.regexTest = true;
        await click('[aria-label=当前规则操作]'); await textClick('[role=menuitem]', '移至全局正则'); check(await evaluate('document.querySelector(".rs-library-heading").textContent.includes("全局") && document.querySelector(".setting-document-title input").value==="对白排版"'), 'Scope move lost current rule'); actions.regexMove = true;
      } else {
        await textClick('[role=tab]', '设置'); await edit('脚本设置', 'invalid'); await click('.setting-document-save'); check(await evaluate('!!document.querySelector("[role=alert]")'), 'JSON validation missing'); await select(kind, '天气小记'); await select(kind, '书店日常'); await textClick('[role=tab]', '设置'); check(await value('脚本设置') === 'invalid', 'JSON failure lost buffer'); await edit('脚本设置', '{"值":42}'); await click('.setting-document-save'); check(await evaluate('document.querySelector(".setting-document-save").disabled'), 'JSON repair failed'); actions.scriptJson = true;
        await select(kind, '快捷互动按钮'); await textClick('[role=tab]', '设置'); await textClick('button', '新增按钮'); check(await evaluate('document.querySelectorAll(".rs-button-row").length===3'), 'Compatibility button editing missing'); actions.scriptButtons = true; await snap('scripts-compatibility-settings-light-1480');
      }
      await load(kind, 1480, 'light', true); const longLabel = kind === 'regex' ? '替换内容' : '脚本源码';
      const measurement = await evaluate(`(()=>{const v=window.editorViewFor(${JSON.stringify(longLabel)});const start=performance.now(), length=v.state.doc.length, lines=v.state.doc.lines;v.dispatch({selection:{anchor:length},scrollIntoView:true});return {kind:${JSON.stringify(kind)},length,lines,dispatchMs:performance.now()-start}})()`); await settle();
      Object.assign(measurement, await evaluate(`(()=>{const v=window.editorViewFor(${JSON.stringify(longLabel)}); const start=performance.now();v.dispatch({changes:{from:v.state.doc.length,insert:'末尾保留'}});return {editMs:performance.now()-start,domLines:v.dom.querySelectorAll('.cm-line').length,tail:v.state.doc.sliceString(v.state.doc.length-4),viewport:v.viewport}})()`));
      check(measurement.lines > 90000 && measurement.domLines < 500 && measurement.tail === '末尾保留', 'Large document was fully rendered or truncated: ' + JSON.stringify(measurement)); performance.push(measurement); await click('.setting-document-save'); check(await evaluate('document.querySelector(".setting-document-save").disabled'), 'Large document save failed'); actions[kind + 'Long'] = true;
    }
    check(!errors.length, errors.join('\n')); writeFileSync(reportPath, JSON.stringify({ status: 'passed', errors, layouts, actions, performance }, null, 2)); win.destroy(); app.exit(0);
  } catch (error) { await snap('failure'); writeFileSync(reportPath, JSON.stringify({ status: 'failed', message: error.message, errors, layouts, actions, performance }, null, 2)); console.error(JSON.stringify({message:error.message,errors,layouts,actions})); win.destroy(); app.exit(1); }
});
