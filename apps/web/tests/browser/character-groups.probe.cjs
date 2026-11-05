const { app, BrowserWindow } = require('electron');
const { mkdirSync, writeFileSync } = require('node:fs');
const { dirname, join } = require('node:path');
const { pathToFileURL } = require('node:url');
const [html, report] = process.argv.slice(2);
app.setPath('userData', dirname(html));
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, offscreen: true, backgroundThrottling: false } });
  const run = source => win.webContents.executeJavaScript(source);
  const pause = () => new Promise(resolve => setTimeout(resolve, 35));
  const rows = [];
  try {
    for (const width of [280, 328, 440]) for (const dark of [false, true]) {
      win.setContentSize(width, 640);
      await win.loadURL(pathToFileURL(html).href);
      for (let n = 0; n < 80 && !await run('Boolean(document.querySelector(".character-group-row"))'); n++) await new Promise(resolve => setTimeout(resolve, 30));
      await run(`document.documentElement.dataset.theme=${JSON.stringify(dark ? 'dark' : 'light')};document.body.toggleAttribute('data-ds-dark-theme',${dark})`);
      await pause();
      const measure = index => run(`(() => {
        const scroll=document.querySelector('.character-list-scroll'),header=document.querySelectorAll('.character-group-row')[${index}],rect=node=>node.getBoundingClientRect().toJSON();
        const style=getComputedStyle(scroll),bar=scroll.parentElement.querySelector('.sidebar-scrollbar'),thumb=bar?.querySelector('.sidebar-scroll-thumb');
        return {header:rect(header),scroll:rect(scroll),scrollTop:scroll.scrollTop,clientWidth:scroll.clientWidth,
          scrollbarWidth:bar?getComputedStyle(bar).width:null,scrollbarColor:thumb?getComputedStyle(thumb).backgroundColor:null,nativeScrollbar:getComputedStyle(scroll,'::-webkit-scrollbar').display,gutter:style.scrollbarGutter,
          expanded:header.getAttribute('aria-expanded'),topHit:document.elementFromPoint(header.getBoundingClientRect().left+80,scroll.getBoundingClientRect().top+10)?.closest('.character-group-row')===header};
      })()`);
      const collapsed = await measure(0);
      await run('document.querySelectorAll(".character-group-row")[0].click()');
      await pause();
      const expanded = await measure(0);
      await run('document.querySelector(".character-list-scroll").dispatchEvent(new WheelEvent("wheel",{deltaY:1800,bubbles:true,cancelable:true}))');
      await pause();
      const sticky = await measure(0);
      if (process.argv[4] && width === 328) {
        mkdirSync(process.argv[4], { recursive: true });
        writeFileSync(join(process.argv[4], `groups-${dark ? 'dark' : 'light'}.png`), (await win.webContents.capturePage()).toPNG());
      }
      // Keep another expanded section below the first, so collapsing cannot
      // accidentally pass just because the whole directory stops overflowing.
      await run('document.querySelectorAll(".character-group-row")[1].click()');
      await pause();
      await run('document.querySelectorAll(".character-group-row")[0].click()');
      await pause();
      const folded = await measure(0);
      await run(`(() => {const scroll=document.querySelector('.character-list-scroll'),group=document.querySelectorAll('.character-group-block')[1];scroll.scrollTop+=group.getBoundingClientRect().top-scroll.getBoundingClientRect().top+1200})()`);
      await pause();
      const nextSticky = await measure(1);
      const old = await measure(0);
      await run('document.querySelectorAll(".character-group-row")[1].click()');
      await pause();
      const nextFolded = await measure(1);
      rows.push({ width, dark, collapsed, expanded, sticky, folded, nextSticky, old, nextFolded });
    }
    writeFileSync(report, JSON.stringify(rows));
    win.destroy(); app.exit(0);
  } catch (error) { console.error(error); win.destroy(); app.exit(1); }
});
