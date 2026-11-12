const { app, BrowserWindow } = require('electron');
const { writeFileSync } = require('node:fs');
const { dirname, resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
app.disableHardwareAcceleration();
app.setPath('userData', resolve(dirname(process.argv[3]), 'position-profile'));
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 390, height: 844, webPreferences: { sandbox: true, offscreen: true, backgroundThrottling: false } });
  const report = { layouts: [], screenshots: false };
  const run = code => win.webContents.executeJavaScript(code);
  const settle = () => new Promise(resolve => setTimeout(resolve, 120));
  const check = (value, message) => { if (!value) throw Error(message); };
  const click = async (selector, text) => { await run(`Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(e=>${text ? `e.textContent.trim()===${JSON.stringify(text)}` : 'true'}).click()`); await settle(); };
  const wait = async code => { for (let i = 0; i < 60; i++) { if (await run(code)) return; await settle(); } throw Error('Missing ' + code); };
  try {
    for (const [width, height, mobile, theme] of [[390,844,true,'light'],[320,420,true,'dark'],[768,1024,true,'light'],[1480,700,false,'light']]) {
      win.setContentSize(width, height);
      await win.loadURL(pathToFileURL(process.argv[2]).href + (mobile ? '?view=mobile-editor&mobile=1' : '?view=preset-editor&preset=synthetic-preset&section=prompts') + `&reset=1&theme=${theme}`);
      await wait("!!document.querySelector('.character-editor-navigation button')");
      await click('.character-editor-navigation button', '预设提示词');
      await wait("!!document.querySelector('.setting-library-tree-row')");
      await click('.setting-library-tree-row');
      if (mobile) await click('.mobile-editor-actions button', '编辑');
      await wait("!!document.querySelector('.setting-view-switch')");
      await click('.setting-view-switch button', '设置');
      await click('.setting-reading-settings button', '提示词常驻');
      const data = await run(`(()=>{const r=e=>e?.getBoundingClientRect().toJSON(),card=document.querySelector('.setting-library-order-card'),number=card.querySelector('.setting-library-number-row'),preview=card.querySelector('.setting-library-order-preview'),list=preview.querySelector('ol');return{width:innerWidth,height:innerHeight,numberLabel:r(number.firstElementChild),numberControl:r(number.lastElementChild),previewLabel:r(preview.firstElementChild),previewContent:r(preview.lastElementChild),emptyList:!!list&&!list.children.length,emptyText:preview.lastElementChild.textContent.trim(),documentScroll:document.querySelector('.mobile-editor-document')?.scrollTop}})()`);
      data.mobile = mobile;
      data.controlStyle = await run(`(()=>{const e=document.querySelector('.setting-library-number-control'),s=getComputedStyle(e);return{display:s.display,columns:s.gridTemplateColumns,children:[...e.children].map(c=>c.getBoundingClientRect().toJSON())}})()`);
      await run("document.querySelector('.setting-library-position-manage').scrollIntoView({block:'center'})");
      const previousScroll = await run("document.querySelector('.mobile-editor-document')?.scrollTop");
      await click('.setting-library-position-manage');
      data.manager = await run(`(()=>{const g=document.querySelector('.setting-position-guide'),m=document.querySelector('.setting-position-manager'),r=e=>e.getBoundingClientRect().toJSON();return{guide:r(g),manager:r(m),client:g.clientHeight,scroll:g.scrollHeight,overflow:getComputedStyle(g).overflowY,tabs:document.querySelectorAll('.setting-view-switch').length,title:document.querySelector('.mobile-header h1')?.textContent,outerScroll:document.querySelector('.mobile-editor-document')?.scrollTop}})()`);
      const point = data.manager.guide;
      win.webContents.sendInputEvent({ type: 'mouseWheel', x: Math.round(point.left+point.width/2), y: Math.round(Math.min(height-70,point.top+point.height/2)), deltaY: -500, deltaX: 0 });
      await settle();
      data.manager.scrolled = await run("document.querySelector('.setting-position-guide').scrollTop");
      if (mobile && data.manager.scroll>data.manager.client+1) {
        await run("document.querySelector('.setting-position-guide').scrollTop=0");
        win.webContents.debugger.attach('1.3');
        const x=point.left+point.width/2, y=point.top+point.height*0.75;
        await win.webContents.debugger.sendCommand('Input.dispatchTouchEvent', {type:'touchStart',touchPoints:[{x,y}]});
        for(let step=1;step<=8;step++) {
          await win.webContents.debugger.sendCommand('Input.dispatchTouchEvent', {type:'touchMove',touchPoints:[{x,y:y-step*16}]});
          await new Promise(resolve=>setTimeout(resolve,20));
        }
        await win.webContents.debugger.sendCommand('Input.dispatchTouchEvent', {type:'touchEnd',touchPoints:[]});
        win.webContents.debugger.detach(); await settle();
        data.manager.touchScrolled = await run("document.querySelector('.setting-position-guide').scrollTop");
        check(data.manager.touchScrolled>0,'Touch swipe did not scroll position management');
      }
      const createSelector = mobile ? '.mobile-header-actions button' : '.setting-position-manager-header button';
      await click(createSelector, '新建');
      await run(`(()=>{const e=document.querySelector('.setting-position-dialog input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'合成自定义位置');e.dispatchEvent(new Event('input',{bubbles:true}))})()`); await settle();
      await click('.setting-position-dialog button[type=submit]');
      await click(mobile ? '.mobile-header [aria-label="返回"]' : '.setting-position-back');
      data.restoredScroll = await run("document.querySelector('.mobile-editor-document')?.scrollTop");
      data.previousScroll = previousScroll;
      data.returned = await run("!document.querySelector('.setting-position-manager')&&!!document.querySelector('.setting-insert-settings')");
      data.focusRestored = await run("document.activeElement?.classList.contains('setting-library-position-manage')");
      data.currentPeer = await run("document.querySelector('.setting-order-items li[aria-current=true]')?.textContent");
      await click('.setting-view-switch button', '正文');
      data.content = await run("!!document.querySelector('.setting-writing-board .cm-editor')&&!document.querySelector('.setting-position-manager')");
      await click(mobile ? '.mobile-header-actions button' : '.setting-directory .setting-library-save-button', '保存');
      data.saved = await run("window.savedPreset().promptPositions.some(p=>p.name==='合成自定义位置')");
      report.layouts.push(data);
    }
    for (const data of report.layouts) {
      check(data.manager.tabs === 0, 'Document tabs remain active in position management');
      check(data.manager.guide.bottom <= data.height+1 && (data.manager.scroll<=data.manager.client+1 || data.manager.scrolled>0), 'Position guide is not a bounded working scroller: '+JSON.stringify(data));
      check(data.returned && data.content && data.saved && data.focusRestored, 'Position return/focus/content/save failed');
      check(data.currentPeer?.includes('当前'), 'Populated position lost the current entry');
      check(!data.emptyList && data.emptyText.length>0, 'Empty peer list still renders a thin outline');
      if (data.mobile) {
        check(data.numberControl.height<=46, 'Mobile number control is not horizontal: '+JSON.stringify(data.controlStyle));
        check(data.numberControl.top>=data.numberLabel.bottom-1 && data.previewContent.top>=data.previewLabel.bottom-1, 'Mobile insertion labels need their own row: '+JSON.stringify(data));
        check(Math.abs(data.restoredScroll-data.previousScroll)<2, 'Returning from positions lost settings scroll');
      }
    }
    win.setContentSize(390,844);
    await win.loadURL(pathToFileURL(process.argv[2]).href+'?view=mobile-editor&mobile=1&reset=1&emptyProfile=1');
    await wait("!!document.querySelector('.preset-usage-copy.is-empty')");
    report.usage = await run(`(()=>{const r=e=>e.getBoundingClientRect().toJSON(),p=document.querySelector('.preset-usage-copy.is-empty'),u=document.querySelector('.preset-usage-section'),b=document.querySelector('.preset-basic-card'),updates=document.querySelector('.preset-updates');return{empty:r(p),section:r(u),basics:r(b),updates:r(updates),center:getComputedStyle(p).textAlign,display:getComputedStyle(p).display,place:getComputedStyle(p).placeItems,background:getComputedStyle(u).backgroundColor}})()`);
    check(report.usage.center==='center'&&report.usage.place==='center'&&report.usage.empty.height>=88&&report.usage.section.top-report.usage.basics.bottom>=12,'Usage needs a centered empty state and its own separated card: '+JSON.stringify(report.usage));
    report.passed = true;
  } catch (error) { report.passed=false; report.failure=error.stack||String(error); }
  writeFileSync(process.argv[3], JSON.stringify(report,null,2)); win.destroy(); app.exit(report.passed?0:1);
});
