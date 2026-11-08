const { app, BrowserWindow } = require('electron');
const { writeFileSync, mkdirSync } = require('node:fs');
const { dirname, join } = require('node:path');
const [html, report, screenshots] = process.argv.slice(2);
app.setPath('userData', dirname(html));
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true, sandbox: true, backgroundThrottling: false } });
  const run = source => win.webContents.executeJavaScript(source), pause = () => new Promise(resolve => setTimeout(resolve, 70));
  const rows = [], errors = [];
  win.webContents.on('console-message', details => { if (details.level === 'error' || details.level === 3) errors.push(details.message); });
  async function waitFor(source) {
    for (let n = 0; n < 80; n++) { if (await run(source)) return; await pause(); }
    throw new Error('Mutation fixture did not reach: ' + source);
  }
  const call = id => `.roleplay-tool-call[data-tool-call-id="${id}"]`;
  const open = async id => { await run(`document.querySelector(${JSON.stringify(call(id) + ' [data-disclosure-row]')}).click()`); await pause(); await pause(); };
  async function tail(id, marker) {
    const selector = call(id) + ' .roleplay-mutation-body';
    for (let n = 0; n < 35; n++) {
      await run(`{const e=document.querySelector(${JSON.stringify(selector)});e.scrollTop=e.scrollHeight;e.dispatchEvent(new Event('scroll'));}`); await pause();
      if (await run(`document.querySelector(${JSON.stringify(selector)}).textContent.includes(${JSON.stringify(marker)})`)) return true;
    }
    return false;
  }
  try {
    for (const width of [390, 1000]) for (const dark of [false, true]) {
      win.setContentSize(width, 920); await win.loadFile(html);
      await run(`document.documentElement.dataset.theme=${JSON.stringify(dark ? 'dark' : 'light')};document.body.toggleAttribute('data-ds-dark-theme',${dark})`);
      await waitFor('document.querySelectorAll(".roleplay-tool-call").length === 11');
      await open('variables'); await open('edit_file');
      const visual = await run(`(() => {const cards=[...document.querySelectorAll('.roleplay-mutation-body')],parts=cards.flatMap(card=>[...card.querySelectorAll('.roleplay-mutation-part')].map(e=>e.getBoundingClientRect()));return {
        readable:document.body.textContent.includes('共伞')&&document.body.textContent.includes('增加')&&document.body.textContent.includes('一起走吗'),
        fallback:!!document.querySelector('[data-native-fallback]'),bookPaths:document.querySelector('[data-tool-call-id=read] [data-disclosure-row] svg').querySelectorAll('path').length,
        noOverlap:cards.every(card=>{const r=[...card.querySelectorAll('.roleplay-mutation-part')].map(e=>e.getBoundingClientRect());return r.every((e,i)=>!i||e.top>=r[i-1].bottom-.5)}),
        horizontalOverflow:cards.some(e=>e.scrollWidth>e.clientWidth+1),failed:document.querySelector('[data-tool-call-id=failed]').dataset.mutationState,
        unchanged:document.querySelector('[data-tool-call-id=unchanged]').dataset.mutationState,
        editIcon:!!document.querySelector('[data-tool-call-id=move_file] [data-disclosure-row] use[href="#dsw-icon-edit-outline-regular"]'),
        iconArtwork:!!document.querySelector('#dsw-icon-edit-outline-regular path')};})()`);
      if (screenshots) {
        mkdirSync(screenshots, { recursive: true }); await win.webContents.capturePage(); await pause();
        writeFileSync(join(screenshots, `mutations-${dark ? 'dark' : 'light'}-${width}.png`), (await win.webContents.capturePage()).toPNG());
      }
      const settings = [];
      await open('variables'); await open('edit_file');
      for (const id of ['move_file', 'delete_file', 'make_directory', 'write_file', 'move_directory', 'delete_directory', 'failed', 'unchanged']) {
        await open(id);
        settings.push(await run(`({id:${JSON.stringify(id)},text:document.querySelector(${JSON.stringify(call(id))}).textContent,body:!!document.querySelector(${JSON.stringify(call(id) + ' .roleplay-mutation-body')})})`));
        await open(id);
      }
      await win.loadFile(html, { search: 'volume' }); await waitFor('document.querySelectorAll(".roleplay-tool-call").length === 11');
      await open('variables'); const variableTail = await tail('variables', 'VARIABLE_MUTATION_TAIL');
      const mountedVariables = await run('document.querySelectorAll("[data-tool-call-id=variables] .roleplay-mutation-part").length');
      await open('edit_file'); const settingTail = await tail('edit_file', 'NEW_MUTATION_TAIL');
      const mountedText = await run('document.querySelectorAll("[data-tool-call-id=edit_file] .roleplay-mutation-part").length');
      rows.push({ width, dark, ...visual, settings, variableTail, settingTail, mountedVariables, mountedText });
    }
    writeFileSync(report, JSON.stringify({ rows, errors })); win.destroy(); app.exit(0);
  } catch (error) { console.error(error, errors); win.destroy(); app.exit(1); }
});
