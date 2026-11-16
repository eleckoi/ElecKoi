const { app, BrowserWindow } = require('electron');
const { writeFileSync } = require('node:fs');
const { dirname } = require('node:path');
const { pathToFileURL } = require('node:url');
const [htmlPath, reportPath] = process.argv.slice(2);
app.setPath('userData', dirname(htmlPath)); app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, offscreen: true, backgroundThrottling: false } });
  const errors = [], layouts = [], run = code => win.webContents.executeJavaScript(code);
  win.webContents.on('console-message', details => { if (details.level === 'error') errors.push(details.message); });
  const wait = async code => { for (let i=0;i<100;i++) { if (await run(code)) return; await new Promise(resolve => setTimeout(resolve,20)); } throw Error(code); };
  const measure = () => run(`(()=>{const row=document.querySelector('.message-roleplay'),floor=row.querySelector('.message-floor').getBoundingClientRect(),content=row.querySelector('.message-content').getBoundingClientRect(),prev=row.querySelector('.opening-pager-prev').getBoundingClientRect(),next=row.querySelector('.opening-pager-next').getBoundingClientRect(),page=row.querySelector('.opening-pager-index').getBoundingClientRect();return {arrowsTop:Math.min(prev.top,next.top),arrowsBottom:Math.max(prev.bottom,next.bottom),pageTop:page.top,floorBottom:floor.bottom,contentBottom:content.bottom,arrowOffset:Math.abs(prev.top-next.top),overflow:row.scrollWidth>row.clientWidth+1}})()`);
  try {
    for (const theme of ['light','dark']) for (const width of [320,390,1200]) for (const shape of ['portrait','circle','rounded_square']) for (const bubbles of [false,true]) {
      win.setContentSize(width,844);
      await win.loadURL(pathToFileURL(htmlPath).href+`?opening=short&theme=${theme}&shape=${shape}${bubbles?'&bubbles':''}${width===1200?'&desktop':''}`);
      await wait("!!document.querySelector('.opening-pager-next')");
      const report = { theme, width, shape, bubbles, ...await measure() };
      await run("document.querySelector('.opening-pager-next').click()");
      await wait("document.querySelector('.opening-pager-index').textContent==='2/3'&&!document.querySelector('.opening-pager-next').disabled");
      Object.assign(report, await run("({blankPage:document.querySelector('.opening-pager-index').textContent,blankHasBody:!!document.querySelector('.markdown-message')})"));
      const blank = await measure();
      if (blank.arrowsTop<blank.floorBottom-.5||blank.arrowsTop<blank.contentBottom-.5) throw Error('Blank overlap: '+JSON.stringify(blank));
      await run("document.querySelector('.opening-pager-next').click()");
      await wait("document.querySelector('.opening-pager-index').textContent==='3/3'&&!document.querySelector('.opening-pager-prev').disabled");
      const long = await measure();
      if (long.arrowsTop<long.floorBottom-.5||long.arrowsTop>=long.contentBottom||Math.abs(long.arrowsBottom-long.contentBottom)>.5||Math.abs(long.pageTop-long.contentBottom)>.5||long.overflow) throw Error('Long body alignment: '+JSON.stringify(long));
      report.long = long;
      await run("document.querySelector('.opening-pager-prev').click()");
      await wait("document.querySelector('.opening-pager-index').textContent==='2/3'&&!document.querySelector('.opening-pager-prev').disabled");
      await run("document.querySelector('.opening-pager-prev').click()");
      await wait("document.querySelector('.opening-pager-index').textContent==='1/3'&&!document.querySelector('.opening-pager-next').disabled");
      report.returnPage=await run("document.querySelector('.opening-pager-index').textContent");
      layouts.push(report);
    }
    writeFileSync(reportPath,JSON.stringify({layouts,errors},null,2)); win.destroy(); app.exit(0);
  } catch(error) {
    console.error(error);
    console.error(JSON.stringify({ errors, state: await run("({page:document.querySelector('.opening-pager-index')?.textContent,busy:document.querySelector('.opening-pager')?.getAttribute('aria-busy'),animations:document.getAnimations().map(animation=>({state:animation.playState,time:animation.currentTime})),body:document.querySelector('.markdown-message')?.textContent.slice(0,30)})") }));
    win.destroy(); app.exit(1);
  }
});
