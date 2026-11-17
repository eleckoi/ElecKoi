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
    await evaluate(`(() => {const node=document.querySelector(${JSON.stringify(selector)}),outer=node.closest('.editor-management-content');(document.documentElement.dataset.eleckoiMobile==='true'&&outer?outer:node).scrollBy(0,${distance});})()`);
    await pause();
  }
  try {
    await load(412, 915);
    const reports = [];
    for (const [width, height, query] of [[412, 915, ''], [360, 640, ''], [780, 360, ''], [1200, 800, '?desktop']]) {
      await load(width, height, query);
      await evaluate('[...document.querySelectorAll("button")].find(e=>e.textContent.trim()==="并入设定库").click()');
      await waitFor('document.querySelectorAll(".setting-library-manager-rows button").length === 41');
      const initial = await evaluate('(() => {const body=document.querySelector(".setting-library-manager-body"),list=body.querySelector(".setting-library-manager-card"),mobile=document.documentElement.dataset.eleckoiMobile==="true",owner=mobile?list.closest(".editor-management-content"):list;return {mobile,client:owner.clientHeight,scroll:owner.scrollHeight,overflow:getComputedStyle(owner).overflowY,header:document.querySelector(".editor-management-content h2").getBoundingClientRect().top,footer:body.lastElementChild.getBoundingClientRect().top};})()');
      await scroll('.setting-library-manager-card', 600);
      const moved = await evaluate('(document.documentElement.dataset.eleckoiMobile==="true"?document.querySelector(".editor-management-content"):document.querySelector(".setting-library-manager-card")).scrollTop');
      await scroll('.setting-library-manager-card', 4000);
      const final = await evaluate('(() => { const list=document.querySelector(".setting-library-manager-card"),last=list.querySelector("button:last-child").getBoundingClientRect(),r=(document.documentElement.dataset.eleckoiMobile==="true"?list.closest(".editor-management-content"):list).getBoundingClientRect();return {bottomVisible:last.top>=r.top&&last.bottom<=r.bottom,header:document.querySelector(".editor-management-content h2").getBoundingClientRect().top,footer:list.parentElement.lastElementChild.getBoundingClientRect().top,bodyTop:list.parentElement.scrollTop}; })()');
      await evaluate('document.querySelector(".setting-library-manager-rows button:last-child").click()');
      await waitFor('Boolean(document.querySelector(".setting-library-picker-list"))');
      await scroll('.setting-library-picker-list', 4000);
      const picker = await evaluate('(() => {const list=document.querySelector(".setting-library-picker-list"),owner=document.documentElement.dataset.eleckoiMobile==="true"?list.closest(".editor-management-content"):list,r=owner.getBoundingClientRect(),last=list.lastElementChild.getBoundingClientRect();return {top:owner.scrollTop,lastVisible:last.top>=r.top&&last.bottom<=r.bottom};})()');
      reports.push({ kind: 'sources', width, height, initial, moved, final, picker });
    }
    for (const mode of ['setting', 'variable']) {
      await load(360, 380, mode === 'variable' ? '?mode=variable' : '');
      await scroll('.editor-management-content > :last-child', 1500);
      reports.push(await evaluate(`(() => { const body=document.querySelector('.editor-management-content'),cards=[...body.querySelectorAll('.editor-management-action')],last=cards.at(-1).getBoundingClientRect(),r=body.getBoundingClientRect();return {kind:'home',mode:'${mode}',top:body.scrollTop,noClippedCards:cards.every(e=>e.scrollHeight<=e.clientHeight),lastVisible:last.top>=r.top&&last.bottom<=r.bottom}; })()`));
    }
    writeFileSync(reportPath, JSON.stringify(reports));
    win.destroy(); app.exit(0);
  } catch (error) { console.error(error); win.destroy(); app.exit(1); }
});
