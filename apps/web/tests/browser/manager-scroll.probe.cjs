const { app, BrowserWindow } = require('electron');
const { writeFileSync } = require('node:fs');
const { pathToFileURL } = require('node:url');
const { dirname } = require('node:path');
const [htmlPath, reportPath] = process.argv.slice(2);
app.setPath('userData', dirname(htmlPath));
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-renderer-backgrounding');

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 412, height: 915, webPreferences: { backgroundThrottling: false, sandbox: true } });
  const evaluate = source => win.webContents.executeJavaScript(source);
  const pause = () => new Promise(resolve => setTimeout(resolve, 60));
  async function waitFor(source) {
    for (let attempt = 0; attempt < 80; attempt++) { if (await evaluate(source)) return; await pause(); }
    throw new Error(`Timed out: ${source}`);
  }
  async function load(width, height, query = '') {
    win.setContentSize(width, height);
    await win.loadURL(`${pathToFileURL(htmlPath).href}${query}`);
    await waitFor('Boolean(document.querySelector("[role=dialog]"))');
  }
  async function scroll(selector, distance) {
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollBy(0,${distance})`);
    await pause();
  }
  try {
    const reports = [];
    for (const [width, height, query] of [[412, 915, '?merge'], [360, 640, '?merge'], [780, 360, '?merge'], [1200, 800, '?merge&desktop']]) {
      await load(width, height, query);
      await waitFor('document.querySelectorAll(".editor-picker-row").length === 40');
      const inspect = `(() => {
        const dialog=document.querySelector('.editor-search-modal'), list=dialog.querySelector('.editor-search-pane-results');
        const r=list.getBoundingClientRect(),last=list.querySelector('.editor-picker-row:last-child').getBoundingClientRect();
        const search=dialog.querySelector('input[type=search]'),local=[...dialog.querySelectorAll('button')].find(button=>button.textContent.trim()==='从本地文件');
        return {client:list.clientHeight,scroll:list.scrollHeight,overflow:getComputedStyle(list).overflowY,
          search:search.getBoundingClientRect().top,footer:local.getBoundingClientRect().top,top:list.scrollTop,
          bottomVisible:last.top>=r.top-1&&last.bottom<=r.bottom+1};
      })()`;
      const initial = await evaluate(inspect);
      await scroll('.editor-search-pane-results', 4000);
      const final = await evaluate(inspect);
      const moved = final.top;
      await evaluate(`(() => { const input=document.querySelector('.editor-search-pane input');
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'角色 39');
        input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
      await waitFor('document.querySelectorAll(".editor-picker-row").length === 1');
      await evaluate('document.querySelector(".editor-picker-row").click()');
      await waitFor('Boolean(document.querySelector(".setting-library-import-rows"))');
      await scroll('.editor-search-pane-results', 4000);
      const picker = await evaluate('(() => {const owner=document.querySelector(".editor-search-pane-results"),r=owner.getBoundingClientRect(),last=owner.querySelector(".setting-library-picker-row:last-child").getBoundingClientRect();return {top:owner.scrollTop,height:owner.clientHeight,scrollHeight:owner.scrollHeight,lastTop:last.top,lastBottom:last.bottom,listTop:r.top,listBottom:r.bottom,lastVisible:last.top>=r.top-1&&last.bottom<=r.bottom+1};})()');
      reports.push({ kind: 'sources', width, height, initial, moved, final, picker });
    }
    for (const mode of ['setting', 'variable']) {
      await load(360, 380, mode === 'variable' ? '?mode=variable' : '');
      await scroll('.editor-management-content', 1500);
      reports.push(await evaluate(`(() => { const body=document.querySelector('.editor-management-content'),cards=[...body.querySelectorAll('.editor-management-action')],last=cards.at(-1).getBoundingClientRect(),r=body.getBoundingClientRect();return {kind:'home',mode:'${mode}',top:body.scrollTop,actions:cards.map(card=>card.textContent.trim()),noClippedCards:cards.every(e=>e.scrollHeight<=e.clientHeight),lastVisible:last.top>=r.top&&last.bottom<=r.bottom}; })()`));
    }
    writeFileSync(reportPath, JSON.stringify(reports));
    win.destroy(); app.exit(0);
  } catch (error) { console.error(error); win.destroy(); app.exit(1); }
});
