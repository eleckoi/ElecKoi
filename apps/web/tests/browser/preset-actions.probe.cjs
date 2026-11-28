const { app, BrowserWindow } = require('electron');
const { writeFileSync } = require('node:fs');
const { dirname, join } = require('node:path');
const { pathToFileURL } = require('node:url');
const [htmlPath, reportPath] = process.argv.slice(2);
app.setPath('userData', join(dirname(htmlPath), 'browser-profile'));
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, backgroundThrottling: false } });
  win.webContents.on('console-message', event => { if (event.level === 'error') console.error('Renderer:', event.message); });
  const evaluate = source => win.webContents.executeJavaScript(source);
  const pause = () => new Promise(resolve => setTimeout(resolve, 35));
  async function wait(source) {
    for (let attempt = 0; attempt < 120; attempt++) { if (await evaluate(source)) return; await pause(); }
    throw new Error(`Timed out: ${source}`);
  }
  async function click(selector) {
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'nearest'})`);
    await pause();
    await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}), r=el.getBoundingClientRect();
      const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2); if(!el.contains(hit)) throw new Error('Control is covered: '+${JSON.stringify(selector)});
      hit.closest('button').click(); })()`);
    await pause();
  }
  try {
    const reports = [];
    for (const theme of ['light', 'dark']) for (const width of [1100, 412]) {
      win.setContentSize(width, 1000);
      await win.loadURL(pathToFileURL(htmlPath).href);
      await wait('Boolean(document.querySelector(".setting-position-more"))');
      await evaluate(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`);
      await evaluate('document.querySelector(".setting-position-guide").scrollTop=10000');
      await click('[aria-label="管理位置：first"]');
      await wait('Boolean(document.querySelector("[role=menu]"))');
      const menu = await evaluate(`(() => { const menu=document.querySelector('[role=menu]'), r=menu.getBoundingClientRect();
        const next=document.querySelector('[aria-label="管理位置：second"]').getBoundingClientRect();
        const targets=[...menu.querySelectorAll('button')].map(el=>{ const b=el.getBoundingClientRect(); const y=b.y+b.height/2;
          return [b.x+4,b.x+b.width/2,b.right-4].every(x=>el.contains(document.elementFromPoint(x,y))); });
        return {targets,withinViewport:r.x>=0&&r.right<=innerWidth&&r.y>=0&&r.bottom<=innerHeight, detached:!menu.closest('[data-position-key]'),nextTop:next.top}; })()`);
      await click('[role=menu] button:first-child');
      await wait('Boolean(document.querySelector(\'[role="dialog"][aria-label="重命名位置"]\'))');
      await click('[role="dialog"][aria-label="重命名位置"] [aria-label="关闭"]');
      await click('[aria-label="管理位置：first"]');
      await click('[role=menu] .is-destructive');
      await wait('Boolean(document.querySelector(\'[role="dialog"][aria-label^="删除"]\'))');
      await click('[role="dialog"][aria-label^="删除"] .product-dialog-actions button:last-child');
      await wait('!document.querySelector(\'[data-position-key="custom:first"]\')');
      const correctPosition = await evaluate('Boolean(document.querySelector(\'[data-position-key="custom:second"]\'))');
      await click('#fail-save');
      await click('[aria-label^="删除更新："]');
      await wait('Boolean(document.querySelector(".preset-content-modal"))');
      await click('.preset-content-modal .is-danger');
      await wait('document.querySelector(".preset-content-modal")?.textContent.includes("Synthetic save failed")');
      const failurePreserved = await evaluate('Boolean(document.querySelector(".preset-update-record"))');
      await click('.preset-content-modal .preset-content-button:not(.is-danger)');
      await click('#fail-save');
      await click('[aria-label^="删除更新："]');
      await click('.preset-content-modal .is-danger');
      await wait('!document.querySelector(".preset-update-record")');
      reports.push({ theme, width, menu, correctPosition, failurePreserved, empty: await evaluate('document.querySelector(".preset-updates-empty")?.textContent') });
    }
    writeFileSync(reportPath, JSON.stringify(reports));
    app.exit(0);
  } catch (error) { console.error(error); app.exit(1); }
});
