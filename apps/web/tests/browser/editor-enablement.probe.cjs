const { app, BrowserWindow } = require('electron');
const { writeFileSync } = require('node:fs');
const { dirname, join } = require('node:path');
const { pathToFileURL } = require('node:url');
const [htmlPath, reportPath] = process.argv.slice(2);
app.setPath('userData', join(dirname(htmlPath), 'browser-profile'));
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1200, height: 800, webPreferences: { sandbox: true, backgroundThrottling: false } });
  const evaluate = async source => { try { return await win.webContents.executeJavaScript(source); } catch (error) { throw Error(error.message + '\nEvaluation: ' + source); } };
  const wait = async source => {
    for (let attempt = 0; attempt < 120; attempt++) {
      if (await evaluate(source)) return;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    throw new Error(`Timed out: ${source}`);
  };
  try {
    await win.loadURL(pathToFileURL(htmlPath).href);
    const reports = [];
    for (const kind of ['regex', 'scripts']) for (const ownerScope of ['character', 'preset']) {
      await wait('Boolean(document.querySelector("nav"))');
      await evaluate(`document.querySelector('[data-editor="${kind}:${ownerScope}"]').click()`);
      await wait(`document.querySelector('main').dataset.current === '${kind}:${ownerScope}' && document.querySelectorAll('.rs-directory-library').length === 1 && document.querySelector('.setting-document-save')?.disabled`);
      const rowSelector = kind === 'regex' ? '.regex-rule-row' : '.script-list-row';
      const nameSelector = kind === 'regex' ? '.regex-rule-main .rs-row-name' : '.script-list-name > span';
      for (let groupIndex = 0; groupIndex < 2; groupIndex++) {
        const label = groupIndex === 0 ? '全局' : ownerScope === 'preset' ? '预设' : '角色';
        await evaluate(`[...document.querySelectorAll('.setting-scope-switch [role="tab"]')].find(tab=>tab.textContent.trim()===${JSON.stringify(label)}).click()`);
        await wait(`[...document.querySelectorAll('.setting-scope-switch [role="tab"]')].some(tab=>tab.textContent.trim()===${JSON.stringify(label)} && tab.getAttribute('aria-selected')==='true') && document.querySelectorAll('.rs-directory-library').length===1`);
        const select = `document.querySelector('.rs-directory-library')`;
        const measure = `(()=>{const group=${select}, palette=getComputedStyle(group);
          document.getElementById('text-reference').style.color=palette.getPropertyValue('--text');
          document.getElementById('muted-reference').style.color=palette.getPropertyValue('--muted');
          return {nameColors:[...group.querySelectorAll('${nameSelector}')].map(name=>getComputedStyle(name).color),
          itemStates:[...group.querySelectorAll('${rowSelector}')].map(row=>row.dataset.enabled==='true'),
          scopeOn:group.querySelector('.rs-library-heading [role=switch]').getAttribute('aria-checked')==='true',
          text:getComputedStyle(document.getElementById('text-reference')).color, muted:getComputedStyle(document.getElementById('muted-reference')).color}})()`;
        const before = await evaluate(measure);
        await evaluate(`${select}.querySelector('.rs-library-heading [role=switch]').click()`);
        await wait(`${select}.querySelector('.rs-library-heading [role=switch]').getAttribute('aria-checked')==='false'`);
        const off = await evaluate(measure);
        const oldSaveCount = await evaluate('Number(document.body.dataset.saveCount || 0)');
        await evaluate(`document.querySelector('.setting-document-save').click()`);
        await wait(`Number(document.body.dataset.saveCount) > ${oldSaveCount} && document.querySelector('.setting-document-save').disabled`);
        const afterSave = await evaluate(measure);
        await evaluate(`${select}.querySelector('.rs-library-heading [role=switch]').click()`);
        await wait(`${select}.querySelector('.rs-library-heading [role=switch]').getAttribute('aria-checked')==='true'`);
        const restored = await evaluate(measure);
        await evaluate(`${select}.querySelector('${rowSelector} [role=switch]').click()`);
        await wait(`${select}.querySelector('${rowSelector} [role=switch]').getAttribute('aria-checked')==='false'`);
        const itemOff = await evaluate(measure);
        reports.push({ kind, ownerScope, groupIndex, before, off, afterSave, restored, itemOff });
      }
    }
    const immersive = [];
    const sourceActions = [];
    for (const kind of ['scripts']) {
      win.setContentSize(1200, 800);
      await evaluate(`document.querySelector('[data-editor="${kind}:character"]').click()`);
      await wait(`document.querySelector('main').dataset.current === '${kind}:character' && document.querySelectorAll('.rs-directory-library').length === 1`);
      await evaluate(`document.querySelector('${'.script-list-row.is-nested .script-list-name'}').click()`);
      await wait('Boolean(document.querySelector("[aria-label=脚本源码输入区] .cm-editor"))');
      for (const [width, height] of [[1200, 800], [400, 760]]) {
        win.setContentSize(width, height);
        await wait(`window.innerWidth === ${width} && window.innerHeight === ${height}`);
        await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
        await evaluate('Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {})))');

        await evaluate(`document.querySelector('[aria-label=脚本源码输入区] .setting-immersive-host button').click()`);
        await wait('Boolean(document.querySelector(".immersive-markdown-editor"))');
        const content = 'export default () => {\n  return () => {};\n};\n';
        await evaluate(`(() => { const view=window.editorViewFor('脚本源码');view.dispatch({changes:{from:0,to:view.state.doc.length,insert:${JSON.stringify(content)}}}); })()`);
        const dimensions = await evaluate(`(() => { const dialog=document.querySelector('.immersive-markdown-editor'), r=dialog.getBoundingClientRect(), editor=dialog.querySelector('.cm-content');return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,editorHeight:editor.clientHeight,code:getComputedStyle(editor).whiteSpace,preview:!!dialog.querySelector('[role=tablist]')}; })()`);
        await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
        await wait('!document.querySelector(".immersive-markdown-editor")');
        const synced = await evaluate('window.editorViewFor("脚本源码").state.doc.toString()');
        immersive.push({ kind, width, height, ...dimensions, synced, content });
      }
    }
    reports[0].immersive = immersive;
    reports[0].sourceActions = sourceActions;
    writeFileSync(reportPath, JSON.stringify(reports, null, 2));
    win.destroy(); app.exit(0);
  } catch (error) { console.error(error); win.destroy(); app.exit(1); }
});
