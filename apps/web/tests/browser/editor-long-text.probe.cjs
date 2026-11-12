const { app, BrowserWindow } = require('electron');
const { pathToFileURL } = require('node:url');
const { dirname, join } = require('node:path');
const { writeFileSync } = require('node:fs');
const directory = process.argv[2], reportPath = process.argv[3];
app.setPath('userData', join(directory, 'browser-profile')); app.disableHardwareAcceleration(); app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1480, height: 970, webPreferences: { sandbox: true, backgroundThrottling: false, offscreen: true } });
  const errors = [], measurements = [], actions = {};
  win.webContents.on('console-message', ({ level, message }) => { if (level === 'error') errors.push(message); });
  const run = code => win.webContents.executeJavaScript(code), pause = () => new Promise(resolve => setTimeout(resolve, 180));
  const check = (value, message) => { if (!value) throw Error(message); };
  const wait = async selector => { for (let i = 0; i < 80; i++) { if (await run(`!!document.querySelector(${JSON.stringify(selector)})`)) return; await pause(); } throw Error('Missing ' + selector); };
  const click = async selector => { await wait(selector); await run(`document.querySelector(${JSON.stringify(selector)}).click()`); await pause(); };
  const textClick = async (selector, text) => { check(await run(`(() => { const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.textContent.trim()===${JSON.stringify(text)});e?.click();return !!e; })()`), 'Missing ' + text); await pause(); };
  try {
    for (const kind of ['setting', 'variable', 'character-openings']) for (const mode of ['multi', 'single']) {
      await win.loadURL(pathToFileURL(join(directory, `${kind}.html`)).href + '?long=' + mode); await wait('.character-editor-navigation');
      await textClick('.character-editor-navigation button', kind === 'setting' ? '设定库' : kind === 'variable' ? '变量' : '开场白');
      if (kind === 'variable') { await wait('.variable-tree-label'); await textClick('.variable-tree-label', '好感度'); }
      else if (kind === 'setting') { await wait('.setting-library-tree-row-content'); await textClick('.setting-library-tree-row-content', '合成人设'); }
      await wait('.cm-editor'); await pause();
      for (const label of kind !== 'variable' ? ['正文'] : ['说明', '更新规则']) {
        const actualLabel = await run(`(() => { const labels=[...document.querySelectorAll('[role=textbox]')].map(e=>e.getAttribute('aria-label'));return ${JSON.stringify(kind)}!=='variable'?labels[0]:${JSON.stringify(label)}; })()`);
        const state = await run(`(() => { const v=window.editorViewFor(${JSON.stringify(actualLabel)}); const start=performance.now();v.dispatch({selection:{anchor:v.state.doc.length},scrollIntoView:true});return {kind:${JSON.stringify(kind)},mode:${JSON.stringify(mode)},label:${JSON.stringify(label)},length:v.state.doc.length,lines:v.state.doc.lines,scrollDispatchMs:performance.now()-start}; })()`); await pause();
        Object.assign(state, await run(`(() => {const v=window.editorViewFor(${JSON.stringify(actualLabel)}),start=performance.now();v.dispatch({changes:{from:v.state.doc.length,insert:'末尾保留'}});return {editMs:performance.now()-start,domLines:v.dom.querySelectorAll('.cm-line').length,visibleRanges:v.visibleRanges,tail:v.state.doc.sliceString(v.state.doc.length-4)};})()`));
        check(state.length > 1000000 && state.domLines < 500 && state.tail === '末尾保留', 'Document rendering or tail failed: ' + JSON.stringify(state));
        const editorCount = await run('document.querySelectorAll(".cm-editor").length'); await click(kind === 'setting' ? '.setting-immersive-host button' : kind === 'character-openings' ? '.setting-immersive-host button' : `[aria-label="${label}输入区"] .setting-immersive-host button`);
        check(await run('document.querySelectorAll(".cm-editor").length') === editorCount, 'Immersion must not duplicate the long document');
        await click('.immersive-markdown-exit'); check(await run(`window.editorViewFor(${JSON.stringify(actualLabel)}).state.doc.sliceString(window.editorViewFor(${JSON.stringify(actualLabel)}).state.doc.length-4)`) === '末尾保留', 'Immersion lost text');
        measurements.push(state); actions[`${kind}-${mode}-${label}-immersion`] = true;
      }
      await click(kind === 'character-openings' ? '.setting-library-save-button' : '.setting-document-save'); check(await run('document.querySelector(".setting-library-save-button").disabled'), 'Long field unified save failed');
      if (kind === 'setting') check(await run('window.workspaceSaved().role.entries[0].content.endsWith("末尾保留")'), 'Setting tail was not saved');
      else if (kind === 'variable') check(await run('window.variableWorkspaceSaved().variables[0].description.endsWith("末尾保留") && window.variableWorkspaceSaved().variables[0].updateRule.endsWith("末尾保留")'), 'Variable long fields were not saved');
      if (kind === 'character-openings') check(await run('window.openingSaved().openingMessages[0].content.endsWith("末尾保留")'), 'Opening tail was not saved');
      actions[`${kind}-${mode}-save`] = true;
      await run('document.getAnimations().forEach(a=>a.finish())'); writeFileSync(join(directory, `${kind}-${mode}.png`), (await win.webContents.capturePage()).toPNG());
    }
    check(!errors.length, errors.join('\n')); writeFileSync(reportPath, JSON.stringify({ status: 'passed', errors, measurements, actions }, null, 2)); win.destroy(); app.exit(0);
  } catch (error) { writeFileSync(join(directory, 'failure.png'), (await win.webContents.capturePage()).toPNG()); console.error(JSON.stringify({ message: error.message, errors, measurements, actions })); writeFileSync(reportPath, JSON.stringify({ status: 'failed', message: error.message, errors, measurements, actions }, null, 2)); win.destroy(); app.exit(1); }
});
