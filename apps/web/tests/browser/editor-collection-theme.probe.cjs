const { app, BrowserWindow } = require('electron');
const { writeFileSync } = require('node:fs');
const { dirname, join } = require('node:path');
const { pathToFileURL } = require('node:url');
const [html, reportPath] = process.argv.slice(2);
app.setPath('userData', join(dirname(html), 'profile')); app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, backgroundThrottling: false } });
  const run = code => win.webContents.executeJavaScript(code), errors = [], layouts = [];
  win.webContents.on('console-message', event => { if (event.level === 'error') errors.push(event.message); });
  const wait = async code => { for (let i=0; i<100; i++) { if (await run(code)) return; await new Promise(resolve => setTimeout(resolve, 20)); } throw Error(code); };
  try {
    await win.loadURL(pathToFileURL(html).href);
    await win.webContents.insertCSS('*,*::before,*::after{transition:none!important;animation:none!important}');
    for (const theme of ['light','dark']) for (const width of [320,390,768]) for (const owner of ['character','preset']) for (const kind of ['regex','scripts']) {
      win.setContentSize(width, 844);
      const compact = true, key = `${kind}:${owner}:${compact}`;
      await run(`document.documentElement.dataset.theme='${theme}';document.body.toggleAttribute('data-ds-dark-theme',${theme==='dark'});document.documentElement.dataset.eleckoiMobile='${compact}';document.querySelector('[data-editor="${key}"]').click()`);
      await wait(`document.querySelector('main').dataset.current==='${key}'&&!!document.querySelector('.editor-library-rows :is(.regex-rule-main,.script-list-name)')`);
      await run("document.querySelector('.editor-library-rows :is(.regex-rule-main,.script-list-name)').click()");
      await wait("!!document.querySelector('.editor-library-rows .is-selected')");
      const colors = await run(`(()=>{const row=document.querySelector('.editor-library-rows .is-selected'),surface=row.closest('.editor-library-rows'),track=row.querySelector('i'),on=document.querySelector('[aria-label="官方开启参考"]'),reference=getComputedStyle(document.querySelector('[data-official-surface]')),pseudo=track.closest('.script-switch')?'::before':'::after';return {surface:getComputedStyle(surface).backgroundColor,officialSurface:reference.backgroundColor,text:getComputedStyle(row.querySelector('.script-list-name,.regex-rule-main')).color,officialText:reference.color,selected:getComputedStyle(row).backgroundColor,officialActive:getComputedStyle(document.querySelector('[data-official-active]')).backgroundColor,onTrack:getComputedStyle(track).backgroundColor,officialOnTrack:getComputedStyle(on).backgroundColor,onThumb:getComputedStyle(track,pseudo).backgroundColor,officialOnThumb:getComputedStyle(on.firstElementChild).backgroundColor}})()`);
      await run("document.querySelector('.editor-library-rows .is-selected input').click()");
      await wait("!document.querySelector('.editor-library-rows .is-selected input').checked");
      Object.assign(colors, await run(`(()=>{const row=document.querySelector('.editor-library-rows .is-selected'),track=row.querySelector('i'),off=document.querySelector('[aria-label="官方关闭参考"]'),pseudo=track.closest('.script-switch')?'::before':'::after';return {offTrack:getComputedStyle(track).backgroundColor,officialOffTrack:getComputedStyle(off).backgroundColor,offThumb:getComputedStyle(track,pseudo).backgroundColor,officialOffThumb:getComputedStyle(off.firstElementChild).backgroundColor,checked:row.querySelector('input').checked,overflow:document.documentElement.scrollWidth>innerWidth}})()`));
      layouts.push({ theme, width, owner, kind, ...colors });
      if(theme==='dark'&&width===390&&owner==='character')writeFileSync(join(dirname(html),`${kind}-mobile-dark.png`),(await win.webContents.capturePage()).toPNG());
    }
    writeFileSync(reportPath, JSON.stringify({layouts,errors},null,2)); win.destroy(); app.exit(0);
  } catch(error) { console.error(error); win.destroy(); app.exit(1); }
});
