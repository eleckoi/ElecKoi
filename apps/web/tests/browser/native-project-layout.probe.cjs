const { app, BrowserWindow } = require('electron');
const { writeFileSync } = require('node:fs');
const { dirname, join } = require('node:path');
const { pathToFileURL } = require('node:url');
const [htmlPath, reportPath] = process.argv.slice(2);
app.setPath('userData', join(dirname(htmlPath), 'browser-profile'));
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, backgroundThrottling: false } });
  const evaluate = source => win.webContents.executeJavaScript(source);
  const wait = async source => {
    for (let i = 0; i < 160; i++) { if (await evaluate(source)) return; await new Promise(resolve => setTimeout(resolve, 25)); }
    throw new Error(`Timed out: ${source}`);
  };
  try {
    await win.loadURL(pathToFileURL(htmlPath).href);
    const reports = [];
    for (const width of [1100, 1600]) for (const shadow of [false, true]) for (const automatic of [false, true]) {
      win.setContentSize(width, 900);
      await wait(`innerWidth===${width}`);
      await evaluate(`window.renderProjectLayout(${shadow},${automatic})`);
      await wait('window.layoutSeat.querySelector("iframe")?.contentWindow?.__ElecKoiDocumentChannel');
      if (automatic) await wait('window.layoutSeat.querySelector("iframe").getBoundingClientRect().height===240');
      await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      reports.push(await evaluate(`(()=>{
        const frame=window.layoutSeat.querySelector('iframe'),region=frame.parentElement;
        const rect=element=>element.getBoundingClientRect().toJSON();
        return {width:${width},shadow:${shadow},automatic:${automatic},frame:rect(frame),region:rect(region),host:rect(document.querySelector('main')),footer:rect(document.querySelector('footer'))};
      })()`));
    }
    writeFileSync(reportPath, JSON.stringify(reports)); win.destroy(); app.exit(0);
  } catch (error) { console.error(error); win.destroy(); app.exit(1); }
});
