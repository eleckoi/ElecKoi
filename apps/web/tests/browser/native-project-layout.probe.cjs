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
      await wait('window.layoutSeat.querySelector("iframe")?.contentWindow?.ElecKoi');
      if (automatic) await wait('window.layoutSeat.querySelector("iframe").getBoundingClientRect().height===240');
      await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      const report = await evaluate(`(()=>{
        const frame=window.layoutSeat.querySelector('iframe'),region=frame.parentElement;
        const rect=element=>element.getBoundingClientRect().toJSON();
        return {width:${width},shadow:${shadow},automatic:${automatic},frame:rect(frame),region:rect(region),host:rect(document.querySelector('main')),footer:rect(document.querySelector('footer'))};
      })()`);
      await evaluate('window.triggerProjectLayoutNotification()');
      for (let i = 0; i < 5; i++) { await win.webContents.capturePage(); await new Promise(resolve => setTimeout(resolve, 50)); }
      await wait('window.layoutFrame.contentWindow?.layoutObserverSettled');
      await evaluate('window.triggerProjectMediaFailure()');
      await wait('window.layoutFrame.contentWindow?.layoutMediaFailed && window.layoutSeat.querySelectorAll("details pre").length===2');
      report.diagnostic = await evaluate(`({sameFrame:window.layoutSeat.querySelector('iframe')===window.layoutFrame,
        ...window.layoutLifecycle, alert:window.layoutSeat.querySelector('[role=alert]')?.textContent||'',
        messages:[...window.layoutSeat.querySelectorAll('details pre')].map(node=>node.textContent)})`);
      reports.push(report);
    }
    writeFileSync(reportPath, JSON.stringify(reports)); win.destroy(); app.exit(0);
  } catch (error) { console.error(error); win.destroy(); app.exit(1); }
});
