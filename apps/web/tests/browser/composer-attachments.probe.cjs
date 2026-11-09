const { app, BrowserWindow, nativeTheme } = require('electron');
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
    const bounds = await evaluate(`(()=>{const r=document.querySelector('[data-composer-card]').getBoundingClientRect(),q=document.querySelector('[data-queue-dock]')?.getBoundingClientRect(),y=Math.max(0,Math.floor(q?.top??r.y)-8);return {x:Math.max(0,Math.floor(r.x)-8),y,width:Math.min(innerWidth-Math.max(0,Math.floor(r.x)-8),Math.ceil(r.width)+16),height:Math.min(innerHeight-y,Math.ceil(r.bottom)-y+8)}})()`);
    writeFileSync(join(dirname(reportPath), name), (await win.webContents.capturePage(bounds)).toPNG());
  };
  const wait = async source => {
    for (let count = 0; count < 100; count++) { if (await evaluate(source)) return; await new Promise(resolve => setTimeout(resolve, 20)); }
    throw new Error(`Timed out: ${source}`);
  };
  try {
    const reports = [], queues = [], menus = [];
    for (const surface of ['roleplay', 'studio']) for (const width of [320, 390, 768, 1440]) {
      win.setContentSize(width, 900);
      const url = pathToFileURL(htmlPath); url.search = `surface=${surface}&mobile=${width < 768}`;
      await win.loadURL(url.href); await wait('!!window.composerFixture && !!document.querySelector("[data-composer-input]")');
      for (const theme of ['light', 'dark']) {
        nativeTheme.themeSource=theme;
        await evaluate(`document.documentElement.dataset.theme='${theme}';document.body.toggleAttribute('data-ds-dark-theme','${theme}'==='dark')`);
        await evaluate(`document.querySelector('.composer-more-trigger').click()`);
        await wait(`!!document.querySelector('.composer-more-menu')`);
        await evaluate('document.fonts.ready');
        await settle();
        const menu = await evaluate(`(()=>{
          const panel=document.querySelector('.composer-more-menu'), rect=node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}};
          return {panel:rect(panel),anchor:rect(panel.parentElement),scrollWidth:panel.scrollWidth,clientWidth:panel.clientWidth,
            buttons:[...panel.querySelectorAll('button')].map(button=>({text:button.textContent,box:rect(button),label:rect(button.querySelector('span'))})),
            pageWidth:document.documentElement.scrollWidth,draft:document.querySelector('[data-composer-input]').textContent};
        })()`);
        menus.push({surface,width,theme,...menu});
        if(width===390){
          await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
          await new Promise(resolve=>setTimeout(resolve,150));
          writeFileSync(join(dirname(reportPath), surface+'-menu-'+theme+'.png'),(await win.webContents.capturePage()).toPNG());
        }
        await evaluate(`[...document.querySelectorAll('.composer-more-menu button')].find(button=>button.textContent==='工具').click()`);
        await wait(`!document.querySelector('.composer-more-menu')`);
        menus[menus.length-1].actionRan=await evaluate(`window.composerFixture.toolsOpened===true`);
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
        if (surface === 'studio') {
          await evaluate('window.composerFixture.setCount(0)');
          for (const count of [1, 3, 8]) {
            await evaluate(`window.composerFixture.setQueueCount(${count})`);
            await wait('!!document.querySelector("[data-queue-dock]")');
            if (count > 1) {
              await wait('!!document.querySelector("[data-queue-dock] button[aria-expanded]")');
              await evaluate(`(()=>{const button=document.querySelector('[data-queue-dock] button[aria-expanded]');if(button.getAttribute('aria-expanded')==='false')button.click()})()`);
            }
            await wait(`document.querySelectorAll('[data-queue-dock] li').length===${count}`);
            await settle();
            const state = await evaluate(`(()=>{const rect=node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,right:r.right,bottom:r.bottom}},q=document.querySelector('[data-queue-dock]');return {queue:rect(q),panel:rect(q.firstElementChild),card:rect(document.querySelector('[data-composer-card]')),pageWidth:document.documentElement.scrollWidth,draft:document.querySelector('[data-composer-input]').textContent,actionPresent:['queue.edit','queue.remove','queue.steer'].every(name=>!!q.querySelector('button[aria-label="'+name+'"]'))}})()`);
            queues.push({ width, theme, count, ...state });
            if (width === 1440 && count === 8) await capture(`studio-queue-${theme}.png`);
          }
          await evaluate('window.composerFixture.setQueueCount(0)');
          await wait('!document.querySelector("[data-queue-dock]")');
        }
      }
    }
    win.setContentSize(390, 200);
    const officialUrl = pathToFileURL(htmlPath); officialUrl.search = 'official=true';
    await win.loadURL(officialUrl.href); await wait('!!window.composerFixture');
    await evaluate(`document.querySelector('link[href="fixture.css"]').remove();window.composerFixture.setCount(2)`);
    await wait(`document.querySelector('[role="group"]')?.children.length===2`);
    await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    writeFileSync(join(dirname(reportPath), 'official-upload.png'), (await win.webContents.capturePage({ x: 0, y: 0, width: 390, height: 90 })).toPNG());
    writeFileSync(reportPath, JSON.stringify({ attachments: reports, queues, menus }, null, 2)); win.destroy(); app.exit(0);
  } catch (cause) { console.error(cause); win.destroy(); app.exit(1); }
});
