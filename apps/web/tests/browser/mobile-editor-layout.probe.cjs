const { app, BrowserWindow } = require('electron');
const { writeFileSync } = require('node:fs');
const { dirname, join } = require('node:path');
const { pathToFileURL } = require('node:url');
const [htmlPath, reportPath] = process.argv.slice(2);
app.setPath('userData', join(dirname(htmlPath), 'browser-profile'));
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 390, height: 844, webPreferences: { sandbox: true, backgroundThrottling: false } });
  const evaluate = source => win.webContents.executeJavaScript(source);
  const wait = async source => {
    for (let attempt = 0; attempt < 120; attempt++) {
      if (await evaluate(source)) return;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    throw new Error(`Timed out: ${source}`);
  };
  try {
    await win.loadURL(pathToFileURL(htmlPath).href);
    await win.webContents.insertCSS('*, *::before, *::after { animation: none !important; transition: none !important; }');
    const reports = [], merges = [], searches = [];
    for (const theme of ['light', 'dark']) for (const width of [320, 390, 1200]) for (const scope of ['character', 'preset']) {
      const compact = width !== 1200, key = `merge:${scope}:${compact}`;
      win.setContentSize(width, 844);
      await wait(`window.innerWidth===${width}`);
      await evaluate(`document.documentElement.dataset.theme='${theme}'; document.body.toggleAttribute('data-ds-dark-theme','${theme}'==='dark'); document.documentElement.dataset.eleckoiMobile='${compact}'`);
      await evaluate(`document.querySelector('[data-editor="${key}"]').click()`);
      await wait(`document.querySelector('main').dataset.current==='${key}' && Boolean(document.querySelector('.editor-management-modal'))`);
      await evaluate(`[...document.querySelector('.editor-management-modal').querySelectorAll('button')].find(button=>button.textContent==='并入设定库').click()`);
      await wait(`Boolean(document.querySelector('.setting-library-manager-row:not(:disabled)'))`);
      await evaluate(`document.querySelector('.setting-library-manager-row:not(:disabled)').click()`);
      await wait(`document.querySelectorAll('.setting-library-tri-checkbox').length===3`);
      const report = await evaluate(`(()=>{const rect=node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}};return {dialog:rect(document.querySelector('.editor-management-modal')),boxes:[...document.querySelectorAll('.setting-library-tri-checkbox')].map(node=>({hit:rect(node),mark:rect(node.firstElementChild)}))}})()`);
      await evaluate(`document.querySelectorAll('.setting-library-tri-checkbox')[1].click()`);
      await wait(`document.querySelector('.setting-library-tri-checkbox').getAttribute('aria-checked')==='mixed'`);
      report.mixed = await evaluate(`document.querySelector('.setting-library-tri-checkbox').getAttribute('aria-checked')`);
      await evaluate(`document.querySelector('.setting-library-tri-checkbox').click()`);
      await wait(`[...document.querySelectorAll('.setting-library-tri-checkbox')].every(node=>node.getAttribute('aria-checked')==='true')`);
      report.checked = await evaluate(`[...document.querySelectorAll('.setting-library-tri-checkbox')].map(node=>node.getAttribute('aria-checked'))`);
      report.canMerge = await evaluate(`!document.querySelector('.setting-library-merge-button').disabled`);
      merges.push({ width, compact, scope, theme, ...report });
    }
    writeFileSync(reportPath, JSON.stringify({ layouts: reports, merges, searches }, null, 2)); win.destroy(); app.exit(0);
  } catch (error) { console.error(error); win.destroy(); app.exit(1); }
});
