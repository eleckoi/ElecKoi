const { app, BrowserWindow } = require('electron');
const { mkdirSync, writeFileSync } = require('node:fs');
const { dirname, join } = require('node:path');
const { pathToFileURL } = require('node:url');
const [html, report, screenshots] = process.argv.slice(2);
app.setPath('userData', dirname(html));
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, offscreen: true, backgroundThrottling: false } });
  const run = source => win.webContents.executeJavaScript(source);
  const pause = () => new Promise(resolve => setTimeout(resolve, 55));
  const rows = [], errors = [];
  win.webContents.on('console-message', details => { if (details.level === 'error' || details.level === 3) errors.push(details.message); });
  try {
    for (const kind of ['presets', 'plugins', 'models', 'messages']) for (const width of [280, 328, 440]) for (const dark of [false, true]) {
      const selectors = kind === 'models' ? { scroll: '.model-config-list', heading: '.model-group-row', group: '.model-group-block', item: '.model-config-provider' }
        : kind === 'messages' ? { scroll: '.conversation-scroll', heading: '.absent-group', item: '.conversation-item' }
        : { scroll: '.character-list-scroll', heading: '.character-group-row', group: '.character-group-block', item: kind === 'plugins' ? '.plugin-list-row' : '.preset-list-row' };
      win.setContentSize(width, 640);
      const url = pathToFileURL(html); url.searchParams.set('kind', kind);
      await win.loadURL(url.href);
      await run(`window.selectors=${JSON.stringify(selectors)}`);
      for (let n = 0; n < 80 && !await run('Boolean(document.querySelector(selectors.heading) || document.querySelector(selectors.item))'); n++) await pause();
      await run(`document.documentElement.dataset.theme=${JSON.stringify(dark ? 'dark' : 'light')};document.body.toggleAttribute('data-ds-dark-theme',${dark})`);
      await pause();
      const measure = index => run(`(() => {
        const scroll=document.querySelector(selectors.scroll),header=document.querySelectorAll(selectors.heading)[${index}],rect=node=>node?.getBoundingClientRect().toJSON();
        const style=getComputedStyle(scroll),bar=scroll.parentElement.querySelector('.sidebar-scrollbar'),thumb=bar?.querySelector('.sidebar-scroll-thumb'),item=scroll.querySelector(selectors.item);
        return {header:rect(header),scroll:rect(scroll),scrollTop:scroll.scrollTop,clientWidth:scroll.clientWidth,scrollWidth:scroll.scrollWidth,
          item:rect(item),scrollbarWidth:bar?getComputedStyle(bar).width:null,scrollbarColor:thumb?getComputedStyle(thumb).backgroundColor:null,
          scrollbarHover:style.getPropertyValue('--dsh-scrollbar-thumb-hover').trim(),nativeScrollbar:getComputedStyle(scroll,'::-webkit-scrollbar').display,
          gutter:style.scrollbarGutter,standardWidth:style.scrollbarWidth,standardColor:style.scrollbarColor,
          expanded:header?.getAttribute('aria-expanded'),topHit:header ? document.elementFromPoint(header.getBoundingClientRect().left+80,scroll.getBoundingClientRect().top+10)?.closest(selectors.heading)===header : null};
      })()`);
      const clickHeading = index => run(`document.querySelectorAll(selectors.heading)[${index}].click()`);
      const wheel = async () => {
        const bounds = await run('document.querySelector(selectors.scroll).getBoundingClientRect().toJSON()');
        const point = { x: 100, y: Math.round(bounds.top + 100) };
        win.webContents.sendInputEvent({ type: 'mouseMove', ...point });
        win.webContents.sendInputEvent({ type: 'mouseWheel', ...point, deltaX: 0, deltaY: -1800, canScroll: true });
        let previous = -1, stable = 0;
        for (let n = 0; n < 30 && stable < 3; n++) {
          await pause();
          const current = await run('document.querySelector(selectors.scroll).scrollTop');
          stable = current === previous && current > 0 ? stable + 1 : 0;
          previous = current;
        }
      };
      const collapsed = await measure(0);
      let expanded, sticky, folded, nextSticky, old, nextFolded;
      if (kind !== 'messages') {
        await clickHeading(0); await pause(); expanded = await measure(0);
        await wheel(); sticky = await measure(0);
        if (screenshots && width === 328) {
          mkdirSync(screenshots, { recursive: true });
          writeFileSync(join(screenshots, `${kind}-${dark ? 'dark' : 'light'}.png`), (await win.webContents.capturePage()).toPNG());
        }
        await clickHeading(1); await pause(); await clickHeading(0); await pause(); folded = await measure(0);
        await run(`(() => {const scroll=document.querySelector(selectors.scroll),group=document.querySelectorAll(selectors.group)[1];scroll.scrollTop+=group.getBoundingClientRect().top-scroll.getBoundingClientRect().top+1200})()`);
        await pause(); nextSticky = await measure(1); old = await measure(0);
        await clickHeading(1); await pause(); nextFolded = await measure(1);
        await clickHeading(0); await clickHeading(1); await pause();
      } else { await wheel(); sticky = await measure(0); }
      const search = async value => { await run(`(() => {const input=document.querySelector('input[type="search"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}))})()`); await pause(); };
      await search('合成条目 90');
      const filtered = await run(`({count:document.querySelectorAll(selectors.item).length,names:[...document.querySelectorAll(selectors.item)].map(node=>node.textContent)})`);
      await run('document.querySelector(selectors.item)?.click()'); await pause();
      const selected = await run('Boolean(document.querySelector(selectors.item+".active"))');
      await search('');
      const restored = await run('document.querySelectorAll(selectors.item).length');
      await run('document.querySelector(selectors.scroll).scrollTop=0'); await pause();
      const dragStart = await run(`(() => {const bar=document.querySelector('.sidebar-scrollbar'),thumb=bar.querySelector('.sidebar-scroll-thumb'),r=bar.getBoundingClientRect(),t=thumb.getBoundingClientRect();return {x:Math.round(r.right-2),y:Math.round(t.top+t.height/2),end:Math.round(r.top+r.height*.8),max:document.querySelector(selectors.scroll).scrollHeight-document.querySelector(selectors.scroll).clientHeight}})()`);
      win.webContents.sendInputEvent({type:'mouseMove',x:dragStart.x,y:dragStart.y});
      win.webContents.sendInputEvent({type:'mouseDown',x:dragStart.x,y:dragStart.y,button:'left',clickCount:1});
      await pause();
      const captured = await run('document.querySelector(".sidebar-scroll-area").classList.contains("is-dragging")');
      win.webContents.sendInputEvent({type:'mouseMove',x:dragStart.x,y:dragStart.end,modifiers:['leftButtonDown']});
      await pause();
      win.webContents.sendInputEvent({type:'mouseUp',x:dragStart.x,y:dragStart.end,button:'left',clickCount:1}); await pause();
      const dragged = await run('({value:document.querySelector(selectors.scroll).scrollTop,released:!document.querySelector(".sidebar-scroll-area").classList.contains("is-dragging")})');
      await run('document.querySelector(".sidebar-scrollbar").dispatchEvent(new KeyboardEvent("keydown",{key:"Home",bubbles:true,cancelable:true}))'); await pause();
      const home = await run('document.querySelector(selectors.scroll).scrollTop');
      await run('document.querySelector(".sidebar-scrollbar").dispatchEvent(new KeyboardEvent("keydown",{key:"End",bubbles:true,cancelable:true}))'); await pause();
      const end = await run('document.querySelector(selectors.scroll).scrollTop');
      let trackInput;
      if(width===328&&!dark) {
        await run('document.querySelector(selectors.scroll).scrollTop=0'); await pause();
        const track=await run('document.querySelector(".sidebar-scrollbar").getBoundingClientRect().toJSON()');
        const point={x:Math.round(track.right-2),y:Math.round(track.top+track.height*.6)};
        win.webContents.sendInputEvent({type:'mouseMove',...point});
        win.webContents.sendInputEvent({type:'mouseDown',...point,button:'left',clickCount:1});
        win.webContents.sendInputEvent({type:'mouseUp',...point,button:'left',clickCount:1}); await pause();
        const clicked=await run('document.querySelector(selectors.scroll).scrollTop');
        await run('document.querySelector(selectors.scroll).scrollTop=0'); await pause();
        const wheelPoint={x:point.x,y:Math.round(track.top+100)};
        win.webContents.sendInputEvent({type:'mouseMove',...wheelPoint});
        win.webContents.sendInputEvent({type:'mouseWheel',...wheelPoint,deltaX:0,deltaY:-120,canScroll:true}); await pause();
        trackInput={clicked,wheel:await run('document.querySelector(selectors.scroll).scrollTop')};
      }
      url.searchParams.set('short','1'); await win.loadURL(url.href); await run(`window.selectors=${JSON.stringify(selectors)}`);
      for (let n=0;n<80&&!await run('Boolean(document.querySelector(selectors.heading)||document.querySelector(selectors.item))');n++) await pause();
      await run(`document.documentElement.dataset.theme=${JSON.stringify(dark ? 'dark' : 'light')};document.body.toggleAttribute('data-ds-dark-theme',${dark})`);
      if(kind!=='messages') await clickHeading(0);
      await pause(); await run('document.querySelector(selectors.item).click()'); await pause();
      const short = await run(`(() => {const scroll=document.querySelector(selectors.scroll),item=scroll.querySelector(selectors.item),r=item.getBoundingClientRect();return {scroll:scroll.getBoundingClientRect().toJSON(),item:r.toJSON(),clientWidth:scroll.clientWidth,bar:!!document.querySelector('.sidebar-scrollbar'),selected:item.classList.contains('active'),background:getComputedStyle(item).backgroundColor,rightHit:document.elementFromPoint(r.right-1,r.top+r.height/2)?.closest(selectors.item)===item}})()`);
      if(screenshots&&width===328) writeFileSync(join(screenshots,`${kind}-short-${dark?'dark':'light'}.png`),(await win.webContents.capturePage()).toPNG());
      rows.push({kind,width,dark,collapsed,expanded,sticky,folded,nextSticky,old,nextFolded,filtered,selected,restored,drag:{captured,...dragged,max:dragStart.max,home,end},trackInput,short});
    }
    writeFileSync(report, JSON.stringify({ rows, errors }));
    win.destroy(); app.exit(0);
  } catch (error) { console.error(error, errors); win.destroy(); app.exit(1); }
});
