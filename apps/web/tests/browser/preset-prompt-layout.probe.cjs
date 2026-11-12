const { app, BrowserWindow } = require('electron');
const { writeFileSync } = require('node:fs');
const { dirname, join } = require('node:path');
const { pathToFileURL } = require('node:url');
const [htmlPath, reportPath] = process.argv.slice(2);
app.setPath('userData', join(dirname(htmlPath), 'browser-profile'));
app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, backgroundThrottling: false } });
  const evaluate = async source => {
    try { return await win.webContents.executeJavaScript(source); }
    catch (error) { throw new Error(`Browser evaluation failed: ${source}`, { cause: error }); }
  };
  const pause = () => new Promise(resolve => setTimeout(resolve, 50));
  const settleLayout = async () => {
    await pause();
    await evaluate('document.getAnimations().forEach(animation => animation.finish())');
    await pause();
  };
  async function wait(source) {
    for (let attempt = 0; attempt < 120; attempt++) { if (await evaluate(source)) return; await pause(); }
    throw new Error(`Timed out: ${source}`);
  }
  const measure = `(() => {
    const tree=document.querySelector('.setting-library-tree'), row=tree.querySelector('.setting-library-tree-row-content');
    const inspector=document.querySelector('.setting-document'), directory=document.querySelector('.setting-directory');
    const toggle=row.querySelector('[role=switch]'), a=row.getBoundingClientRect(),b=inspector.getBoundingClientRect(),c=toggle.getBoundingClientRect();
    const hit=document.elementFromPoint(c.x+c.width/2,c.y+c.height/2);
    return {rowRight:a.right,inspectorLeft:b.left,inspectorTop:b.top,directoryTop:directory.getBoundingClientRect().top,
      toggleReachable:hit===toggle||toggle.contains(hit),treeWidth:tree.getBoundingClientRect().width,
      resizer:!!document.querySelector('[role=separator]'),empty:!!document.querySelector('.setting-document-empty')};
  })()`;
  try {
    const reports = [];
    for (const width of [1440, 1100, 900]) {
      win.setContentSize(width, 800);
      await win.loadURL(pathToFileURL(htmlPath).href);
      await wait('document.querySelectorAll(".setting-library-tree-row-content").length > 0');
      const closed = await evaluate(measure);
      await evaluate('document.querySelector(".setting-library-tree-label").click()');
      await wait('Boolean(document.querySelector(".setting-document-title input"))');
      await settleLayout();
      const open = await evaluate(measure);
      if (open.resizer) {
        await evaluate(`document.querySelector('[role=separator]').dispatchEvent(new KeyboardEvent('keydown', {key:'ArrowLeft', shiftKey:true, bubbles:true}))`);
        await settleLayout();
      }
      const resized = await evaluate(measure);
      const wasChecked = await evaluate(`document.querySelector('.setting-library-tree-row-content [role=switch]').getAttribute('aria-checked')`);
      await evaluate(`document.querySelector('.setting-library-tree-row-content [role=switch]').click()`);
      await wait(`document.querySelector('.setting-library-tree-row-content [role=switch]').getAttribute('aria-checked') !== ${JSON.stringify(wasChecked)}`);
      await evaluate('document.querySelectorAll(".setting-library-tree-label")[1].click()');
      await wait('document.querySelector(".setting-document-title input").value === "合成提示词 2"');
      await evaluate(`document.querySelector('.setting-library-tree').dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}))`);
      await wait('Boolean(document.querySelector(".setting-document-empty"))');
      await settleLayout();
      const afterClose = await evaluate(measure);
      await evaluate('document.querySelector(".setting-library-tree").scrollTop = 100000');
      await wait('document.querySelector(".setting-library-tree").scrollTop > 0');
      const lastVisible = await evaluate(`(()=>{const tree=document.querySelector('.setting-library-tree'),row=[...tree.querySelectorAll('.setting-library-tree-row-content')].at(-1),a=row.getBoundingClientRect(),b=tree.getBoundingClientRect();return a.top>=b.top&&a.bottom<=b.bottom})()`);
      reports.push({ width, closed, open, resized, afterClose, lastVisible });
    }
    writeFileSync(reportPath, JSON.stringify({ reports }, null, 2));
    win.destroy(); app.exit(0);
  } catch (error) { console.error(error); win.destroy(); app.exit(1); }
});
