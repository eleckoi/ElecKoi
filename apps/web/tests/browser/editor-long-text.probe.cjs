const { app, BrowserWindow } = require('electron');
const { pathToFileURL } = require('node:url');
const { dirname, join } = require('node:path');
const { writeFileSync } = require('node:fs');
const directory = process.argv[2], reportPath = process.argv[3];
const mobileOnly = process.argv.includes('--mobile-caret');
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
  async function checkCodeMirrorCaret(label, selector, { visualOnly = false } = {}) {
    await wait(selector);
    const selection = await run(`(() => {
      const input = document.querySelector(${JSON.stringify(selector)});
      const view = window.editorViewFor(input.getAttribute('aria-label'));
      window.mobileCaretView = view;
      const { from, to } = view.state.doc.line(view.state.doc.lines - 8);
      view.focus();
      view.dispatch({ selection: { anchor: from + 1, head: to }, effects: view.constructor.scrollIntoView(to, { y: 'end', yMargin: 22 }) });
      return { anchor: from + 1, head: to };
    })()`);
    await pause();
    const measureCaret = `(() => {
      const view = window.mobileCaretView;
      const {anchor, head} = view.state.selection.main;
      const coords = view.coordsAtPos(head);
      const {top, bottom} = view.scrollDOM.getBoundingClientRect();
      return {anchor, head, top, bottom, caret: coords?.bottom, focused: document.activeElement === view.contentDOM};
    })()`;
    const before = await run(measureCaret);
    check(before.caret > 420 && before.caret <= Math.min(before.bottom, 820), label + ' selection must start visible near the bottom: ' + JSON.stringify(before));
    for (const height of [420, 335]) {
      if (visualOnly) await run(`Object.defineProperty(visualViewport, 'height', { value: ${height}, configurable: true }); visualViewport.dispatchEvent(new Event('resize'))`);
      else win.setContentSize(390, height);
      await pause();
      const after = await run(measureCaret);
      check(after.focused && after.anchor === selection.anchor && after.head === selection.head
        && after.caret > Math.max(0, after.top) && after.caret <= Math.min(after.bottom, height),
      label + ' selection is out of view after resize: ' + JSON.stringify(after));
    }
    await run(`window.mobileCaretView.dispatch(window.mobileCaretView.state.replaceSelection('键盘高度变化后继续输入'))`);
  }
  async function mobileMultiline() {
    win.setContentSize(390, 820);
    await win.loadURL(pathToFileURL(join(directory, 'setting.html')).href + '?long=multi&mobile&theme=dark&caret');
    await wait('.character-basic-intro-field textarea');
    const introSelection = await run(`(() => {
      const field = document.querySelector('.character-basic-intro-field textarea');
      const form = field.closest('.character-basic-content');
      const line = 132;
      const start = field.value.indexOf('第 ' + line + ' 行');
      field.focus({ preventScroll: true });
      field.setSelectionRange(start + 3, start + 6, 'backward');
      const style = getComputedStyle(field);
      window.introCaretOffset = parseFloat(style.paddingTop) + (line + 1) * parseFloat(style.lineHeight);
      field.scrollTop = window.introCaretOffset - field.clientHeight + 15;
      form.scrollTop += field.getBoundingClientRect().bottom - 790;
      return { start: start + 3, end: start + 6 };
    })()`);
    await pause();
    const measureIntro = `(() => {
      const field = document.querySelector('.character-basic-intro-field textarea');
      const box = field.getBoundingClientRect();
      const form = field.closest('.character-basic-content');
      return { focused: field === document.activeElement, start: field.selectionStart, end: field.selectionEnd,
        direction: field.selectionDirection, fieldTop: box.top, fieldBottom: box.bottom,
        viewport: [innerHeight, visualViewport.height], form: [form.clientHeight, form.scrollHeight, form.scrollTop, getComputedStyle(form).overflowY],
        caret: box.top + field.clientTop + window.introCaretOffset - field.scrollTop };
    })()`;
    const introBefore = await run(measureIntro);
    check(introBefore.caret > 420 && introBefore.caret <= 820, 'The native selection must begin visible near the bottom: ' + JSON.stringify(introBefore));
    win.setContentSize(390, 420);
    await pause();
    const introAfter = await run(measureIntro);
    check(introAfter.focused && introAfter.start === introSelection.start && introAfter.end === introSelection.end
      && introAfter.direction === 'backward' && introAfter.caret > Math.max(0, introAfter.fieldTop)
      && introAfter.caret <= Math.min(introAfter.fieldBottom, 420) + 1,
    'Role description selection should remain visible and unchanged: ' + JSON.stringify(introAfter));
    actions.mobileIntro = true;

    win.setContentSize(390, 820);
    await textClick('.character-editor-navigation button', '设定库');
    await wait('.setting-library-tree-label[title="合成人设"]');
    await run(`document.querySelector('.setting-library-tree-label[title="合成人设"]').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`);
    await checkCodeMirrorCaret('Inline setting', '.cm-content[aria-label="设定正文"]');
    actions.mobileSetting = true;
    win.setContentSize(390, 820);
    await click('.setting-immersive-host button');
    check(await run(`(() => {
      const dialog = document.querySelector('.immersive-markdown-editor');
      const header = dialog.querySelector('header');
      const back = header.querySelector('.immersive-markdown-exit');
      const button = back.getBoundingClientRect();
      return header.querySelectorAll('button').length === 1 && !header.querySelector('strong') && !header.querySelector('[role=tablist]')
        && back.getAttribute('aria-label') === '返回' && back.querySelector('svg') && button.width >= 48 && button.height >= 48 && button.left < 16
        && dialog.getBoundingClientRect().height === innerHeight && !dialog.querySelector('.cm-editor').contains(document.activeElement);
    })()`), 'The mobile immersive editor should open with one top-left Back arrow');
    await checkCodeMirrorCaret('Immersive setting', '.immersive-markdown-editor .cm-content');
    await click('.immersive-markdown-exit');
    check(await run(`!document.querySelector('.immersive-markdown-editor') && window.editorViewFor('设定正文').state.doc.toString().includes('键盘高度变化后继续输入')`), 'Back should leave the immersive editor and retain the draft');
    await textClick('.mobile-header-actions button', '保存');
    check(await run(`window.workspaceSaved().role.entries[0].content.includes('键盘高度变化后继续输入')`), 'Mobile setting draft should save before the next scenario');
    actions.mobileImmersion = true;

    win.setContentSize(390, 820);
    await win.loadURL(pathToFileURL(join(directory, 'preset-editor.html')).href + '?view=mobile-editor&mobile&caret&reset');
    await click('[aria-label="编辑更新：合成更新"]');
    await checkCodeMirrorCaret('Preset update note', '.preset-content-composer .cm-content[aria-label="更新内容"]', { visualOnly: true });
    await click('.mobile-preset-save:enabled');
    const presetSave = await run(`({ saved: window.savedPreset().profile.timeline.some(item => item.note.includes('键盘高度变化后继续输入')),
      calls: window.saveCalls, notice: window.mobileNotice, error: document.querySelector('.preset-content-error')?.textContent })`);
    check(presetSave.saved, 'Preset note edit should save after the keyboard resize: ' + JSON.stringify(presetSave));
    await run(`delete visualViewport.height; visualViewport.dispatchEvent(new Event('resize'))`);
    await pause();
    check(await run(`!document.querySelector('.mobile-preset-editor').style.maxHeight`), 'Closing the keyboard should restore the full preset editor height');
    actions.mobilePresetUpdate = true;
  }
  try {
    if (mobileOnly) await mobileMultiline();
    for (const kind of mobileOnly ? [] : ['setting', 'variable', 'character-openings']) for (const mode of ['multi', 'single']) {
      await win.loadURL(pathToFileURL(join(directory, `${kind}.html`)).href + '?long=' + mode); await wait('.character-editor-navigation');
      await textClick('.character-editor-navigation button', kind === 'setting' ? '设定库' : kind === 'variable' ? '变量' : '开场白');
      if (kind === 'variable') { await wait('.variable-tree-label'); await textClick('.variable-tree-label', '好感度'); }
      else if (kind === 'setting') { await wait('.setting-library-tree-label'); await textClick('.setting-library-tree-label', '合成人设'); }
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
