const { app, BrowserWindow } = require('electron');
const { writeFileSync } = require('node:fs');
const { dirname, join } = require('node:path');
const { pathToFileURL } = require('node:url');
const [html, report] = process.argv.slice(2);
app.setPath('userData', join(dirname(html), 'profile')); app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 400, height: 800, webPreferences: { sandbox: true, backgroundThrottling: false } });
  const run = text => win.webContents.executeJavaScript(text), errors = [], layouts = [];
  const wait = async text => { for (let i = 0; i < 150; i++) { if (await run(text)) return; await new Promise(resolve => setTimeout(resolve, 20)); } throw Error('Timeout: ' + text + ' ' + JSON.stringify(await run(`({ errors:${JSON.stringify(errors)}, scroll:[...document.querySelectorAll('.mobile-message-list,.conversation-scroll')].map(v=>({height:v.clientHeight,total:v.scrollHeight,offset:v.scrollTop,rows:[...v.querySelectorAll('[data-index]')].map(n=>n.dataset.index),size:v.firstElementChild?.style.height})) })`))); };
  win.webContents.on('console-message', ({ level, message }) => { if (level === 'error') errors.push(message); });
  try {
    await win.loadURL(pathToFileURL(html).href); await wait('!!window.listProbe');
    for (const platform of ['mobile', 'desktop']) for (const cover of [true, false]) {
      await run(`listProbe.setVisible(false)`);
      await new Promise(resolve => setTimeout(resolve, 30));
      await run(`listProbe.model.scrollPositions.clear(); listProbe.setPlatform('${platform}'); listProbe.setCover(${cover}); listProbe.setVisible(true)`);
      const selector = platform === 'mobile' ? '.mobile-message-list' : '.conversation-scroll';
      await wait(`document.querySelector('${selector} [data-index="0"]')`);
      const top = await run(`(()=>{const v=document.querySelector('${selector}'); return {mounted:v.querySelectorAll('[data-index]').length,height:v.clientHeight,total:v.scrollHeight,first:v.querySelector('[data-index="0"]').getBoundingClientRect().top-v.getBoundingClientRect().top}})()`);
      await run(`document.querySelector('${selector}').scrollTop=410000`);
      await wait(`+document.querySelector('${selector} [data-index]').dataset.index>1000`);
      const middle = await run(`(()=>{const v=document.querySelector('${selector}');return {mounted:v.querySelectorAll('[data-index]').length,index:+v.querySelector('[data-index]').dataset.index,offset:v.scrollTop}})()`);
      if (platform === 'mobile') {
        await run('listProbe.setVisible(false)'); await new Promise(resolve => setTimeout(resolve, 30)); await run('listProbe.setVisible(true)');
        await wait(`document.querySelector('${selector}').scrollTop>400000`);
        const restored = await run(`document.querySelector('${selector}').scrollTop`);
        if (Math.abs(restored - middle.offset) > 1) throw Error('Scroll position lost');
      }
      await run(`document.querySelector('${selector}').scrollTop=10000000`);
      await wait(`document.querySelector('${selector} [data-index="10000"]')`);
      const last = await run(`(()=>{const v=document.querySelector('${selector}'); return {mounted:v.querySelectorAll('[data-index]').length,hasLast:v.textContent.includes('Sample 10000'),overflow:v.scrollWidth>v.clientWidth}})()`);
      await run(`document.querySelector('${selector} [data-index="10000"] ${platform === 'mobile' ? '.mobile-message-open' : 'button'}').click()`);
      if (platform === 'mobile') {
        await run(`document.querySelector('${selector} [data-index="10000"] .mobile-message-menu').click()`);
        const result = await run(`(()=>{const target=document.querySelector('${selector} [data-index="10000"] .mobile-swipe-content'); target.dispatchEvent(new PointerEvent('pointerdown',{pointerId:7,isPrimary:true,button:0,clientX:250,clientY:20,bubbles:true})); target.setPointerCapture=()=>{}; target.dispatchEvent(new PointerEvent('pointermove',{pointerId:7,isPrimary:true,button:0,clientX:90,clientY:20,bubbles:true})); target.dispatchEvent(new PointerEvent('pointerup',{pointerId:7,isPrimary:true,button:0,clientX:90,clientY:20,bubbles:true}));return true})()`);
        await wait(`!document.querySelector('${selector} [data-index="10000"] .mobile-swipe-actions').inert`);
        await run(`document.querySelector('${selector} [data-index="10000"] .mobile-swipe-actions button').click()`);
      } else {
        await run(`document.querySelector('${selector} [data-index="10000"] button').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:120,clientY:100}))`);
        await wait(`!!document.querySelector('.conversation-context-menu')`);
        await run(`document.querySelector('.conversation-context-menu button').click()`);
      }
      layouts.push({ platform, cover, top, middle, last });
    }
    writeFileSync(report, JSON.stringify({ layouts, actions: await run('listProbe.actions'), errors }, null, 2));
  } finally { win.destroy(); app.quit(); }
}).catch(error => { console.error(error); app.exit(1); });
