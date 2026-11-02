const { app, BrowserWindow } = require('electron');
const { writeFileSync } = require('node:fs');
const { dirname, join } = require('node:path');
const { pathToFileURL } = require('node:url');
const [htmlPath, reportPath] = process.argv.slice(2);
app.setPath('userData', join(dirname(htmlPath), 'browser-profile'));
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1440, height: 900,
    webPreferences: { sandbox: true, backgroundThrottling: false } });
  win.webContents.on('console-message', event => { if (event.level === 'error') console.error(event.message); });
  const evaluate = source => win.webContents.executeJavaScript(source);
  const settle = () => new Promise(resolve => setTimeout(resolve, 25));
  const capture = async name => {
    await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    const bounds = await evaluate(`(()=>{const r=document.querySelector('[data-composer-card]').getBoundingClientRect();return {x:Math.max(0,Math.floor(r.x)-8),y:Math.max(0,Math.floor(r.y)-8),width:Math.min(innerWidth-Math.max(0,Math.floor(r.x)-8),Math.ceil(r.width)+16),height:Math.min(innerHeight-Math.max(0,Math.floor(r.y)-8),Math.ceil(r.height)+16)}})()`);
    writeFileSync(join(dirname(reportPath), name), (await win.webContents.capturePage(bounds)).toPNG());
  };
  const wait = async source => {
    for (let count = 0; count < 100; count++) { if (await evaluate(source)) return; await new Promise(resolve => setTimeout(resolve, 20)); }
    throw new Error(`Timed out: ${source}`);
  };
  try {
    const reports = [];
    for (const surface of ['roleplay', 'studio']) for (const width of [320, 390, 768, 1440]) {
      win.setContentSize(width, 900);
      const url = pathToFileURL(htmlPath); url.search = `surface=${surface}&mobile=${width < 768}`;
      await win.loadURL(url.href); await wait('!!window.composerFixture && !!document.querySelector("[data-composer-input]")');
      for (const theme of ['light', 'dark']) {
        await evaluate(`document.documentElement.dataset.theme='${theme}';document.body.toggleAttribute('data-ds-dark-theme','${theme}'==='dark')`);
        for (const count of [0, 1, 6, 7, 20]) {
          await evaluate(`window.composerFixture.setCount(${count})`);
          await wait(`document.querySelectorAll('[role="group"] > div').length===${count}`);
          await settle();
          const state = await evaluate(`(()=>{const rect=node=>{const r=node.getBoundingClientRect();return {x:r.x,width:r.width,right:r.right}},card=document.querySelector('[data-composer-card]'),seat=document.querySelector('[data-composer-seat]'),rail=document.querySelector('[role="group"]');return {card:rect(card),seat:rect(seat),pageWidth:document.documentElement.scrollWidth,count:rail?.children.length??0,rail:rail?{...rect(rail),scroll:rail.scrollWidth,client:rail.clientWidth}:null,draft:document.querySelector('[data-composer-input]').textContent}})()`);
          reports.push({ surface, width, theme, count, ...state });
          if (count === 20 && [390, 1440].includes(width) && theme === 'light') {
            await capture(`${surface}-${width}.png`);
          }
        }
        await evaluate(`(()=>{const rail=document.querySelector('[role="group"]');rail.scrollLeft=rail.scrollWidth;rail.dispatchEvent(new Event('scroll'));})()`); await settle();
        const lastVisible = await evaluate(`(()=>{const rail=document.querySelector('[role="group"]'),last=rail.lastElementChild;return last.getBoundingClientRect().right<=rail.getBoundingClientRect().right+1})()`);
        if (!lastVisible) throw new Error('Last attachment cannot be reached');
        await evaluate(`document.querySelector('[role="group"]').lastElementChild.querySelector('button[aria-label^="file.remove"]').click()`);
        await wait(`document.querySelector('[role="group"]').children.length===19`);
      }
    }
    win.setContentSize(390, 200);
    const officialUrl = pathToFileURL(htmlPath); officialUrl.search = 'official=true';
    await win.loadURL(officialUrl.href); await wait('!!window.composerFixture');
    await evaluate(`document.querySelector('link[href="fixture.css"]').remove();window.composerFixture.setCount(2)`);
    await wait(`document.querySelector('[role="group"]')?.children.length===2`);
    await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    writeFileSync(join(dirname(reportPath), 'official-upload.png'), (await win.webContents.capturePage({ x: 0, y: 0, width: 390, height: 90 })).toPNG());
    writeFileSync(reportPath, JSON.stringify({ attachments: reports }, null, 2)); win.destroy(); app.exit(0);
  } catch (cause) { console.error(cause); win.destroy(); app.exit(1); }
});
