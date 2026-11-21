const { app, BrowserWindow } = require('electron');
const { writeFileSync } = require('node:fs');
const { join, dirname } = require('node:path');
const { pathToFileURL } = require('node:url');
const [html, report, mode] = process.argv.slice(2);
app.setPath('userData', join(dirname(html), 'profile')); app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, backgroundThrottling: false } });
  const run = text => win.webContents.executeJavaScript(text), errors = [], layouts = [];
  const returns = [];
  const pause = () => new Promise(resolve => setTimeout(resolve, 40));
  const wait = async text => { for (let n = 0; n < 200; n++) { if (await run(text)) return; await new Promise(resolve => setTimeout(resolve, 20)); } throw Error('Timeout: ' + text + JSON.stringify(errors)); };
  win.webContents.on('console-message', ({ level, message }) => { if (level === 'error') errors.push(message); });
  try {
    const url = pathToFileURL(html);
    if (mode === 'slots') url.searchParams.set('slots', 'true');
    await win.loadURL(url.href); await wait('!!window.masonryProbe');
    if (mode === 'slots') {
      for (const mobile of [true, false]) {
        win.setContentSize(mobile ? 390 : 900, 820);
        await run(`masonryProbe.setMobile(${mobile})`);
        const list = mobile ? '.mobile-character-list' : '.character-manager-scroll';
        await wait(`!!document.querySelector('${list} [data-masonry-id="card-0"]')`);
        if (mobile) {
          const sizes = await run(`['[data-slot="eleckoi.character.library.search"] button', '.mobile-header-actions > button[aria-haspopup="menu"]'].map(selector => {
            const { width, height } = document.querySelector(selector).getBoundingClientRect();
            return { width, height };
          })`);
          if (sizes[0].width !== sizes[1].width || sizes[0].height !== sizes[1].height) {
            throw Error('Slot wrapper changed the search touch target: ' + JSON.stringify(sizes));
          }
        }
        await run(`document.querySelector('${list}').scrollTop=100000000`);
        await wait(`!!document.querySelector('[data-masonry-id="card-10000"]')`);
        const mounted = await run(`document.querySelectorAll('${list} [data-masonry-id]').length`);
        if (mounted >= 65) throw Error('Slot wrapper expanded the virtualized roster: ' + mounted);
        const card = 'document.querySelector(\'[data-masonry-id="card-10000"] button\')';
        if (mobile) {
          await run(`${card}.click()`);
          await wait(`!!document.querySelector('.mobile-character-profile')`);
          await run(`document.querySelector('.mobile-root-page:has(> .mobile-character-profile) .mobile-header-actions [aria-haspopup="menu"]').click()`);
        } else {
          await run(`${card}.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:200,clientY:200}))`);
        }
        await wait(`!!document.querySelector('[data-slot="eleckoi.character.library.item.menu.actions"] button')`);
        await run(`document.querySelector('[data-slot="eleckoi.character.library.item.menu.actions"] button').click()`);
        await wait(`!document.querySelector('[role="menu"]')`);
        if (mobile) await run(`masonryProbe.scrollPositions.clear();masonryProbe.setRoute({kind:'root'})`);
      }
      writeFileSync(report, JSON.stringify({ actions: await run('masonryProbe.actions'), errors }));
      return;
    }
    for (const mobile of [true, false]) for (const [width, height, theme] of (mobile ? [[390, 820, 'light'], [768, 900, 'dark'], [1280, 800, 'light']] : [[1440, 900, 'light'], [900, 700, 'dark'], [1900, 900, 'light']])) {
      await run('masonryProbe.setVisible(false)'); await pause();
      win.setContentSize(width, height);
      await run(`masonryProbe.scrollPositions.clear();masonryProbe.setMobile(${mobile});masonryProbe.setRoute({kind:'root'});document.documentElement.dataset.theme='${theme}';masonryProbe.setVisible(true)`);
      await wait(`document.querySelector('[data-masonry-id="card-0"]')`); await pause();
      const selector = mobile ? '.mobile-character-list' : '.character-manager-scroll';
      const inspect = () => run(`(()=>{const v=document.querySelector('${selector}'),grid=v.querySelector('[data-virtual-masonry]'),viewport=v.getBoundingClientRect(),cards=[...grid.querySelectorAll('[data-masonry-id]')].map(node=>({id:node.dataset.masonryId,...Object.fromEntries(['x','y','width','height','right','bottom'].map(k=>[k,node.getBoundingClientRect()[k]]))}));return {mounted:cards.length,offset:v.scrollTop,total:v.scrollHeight,columns:getComputedStyle(grid).gridTemplateColumns.split(' ').length,overflow:v.scrollWidth>v.clientWidth,overlap:cards.some((a,i)=>cards.slice(i+1).some(b=>a.x<b.right-.5&&b.x<a.right-.5&&a.y<b.bottom-.5&&b.y<a.bottom-.5)),visible:cards.filter(c=>c.bottom>viewport.top&&c.y<viewport.bottom).map(c=>c.id),cards}})()`);
      const top = await inspect();
      await run(`document.querySelector('${selector}').scrollTop=500000`); await wait(`+document.querySelector('[data-masonry-id]').dataset.index>1000`); await pause();
      const middle = await inspect();
      if (mobile) {
        const targets = [middle.visible[0], middle.visible.at(-2)];
        for (const target of targets) {
          const before = (await inspect()).cards.find(card => card.id === target);
          await run(`document.querySelector('[data-masonry-id="${target}"] button').click()`);
          await wait(`!!document.querySelector('.mobile-character-profile')`);
          const coveredList = await run(`(() => {
            const list = document.querySelector('${selector}');
            const card = list.querySelector('[data-masonry-id="${target}"] button');
            card.focus();
            return { visibility: getComputedStyle(list).visibility, focused: document.activeElement === card, offset: list.scrollTop };
          })()`);
          if (coveredList.visibility !== 'hidden' || coveredList.focused || coveredList.offset === 0) {
            throw Error('Role library did not stay hidden at its scroll position behind the profile: ' + JSON.stringify(coveredList));
          }
          await run(`document.querySelector('.mobile-header button[aria-label="返回"]').click()`);
          await wait(`!document.querySelector('.mobile-character-profile')`);
          await pause();
          const restored = await inspect();
          const after = restored.cards.find(card => card.id === target);
          if (!restored.visible.includes(target) || Math.abs(after.y - before.y) > 2 || Math.abs(after.x - before.x) > 1) {
            throw Error('Return position lost: ' + JSON.stringify({ width, target, before, after, offsets: [middle.offset, restored.offset] }));
          }
          returns.push({ width, target, dx: after.x - before.x, dy: after.y - before.y });
        }
      }
      await run(`document.querySelector('${selector}').scrollTop=100000000`); await wait(`!!document.querySelector('[data-masonry-id="card-10000"]')`); await pause();
      const last = await inspect();
      if (!mobile) {
        await run(`document.querySelector('[data-masonry-id="card-10000"] button').click()`);
        await run(`document.querySelector('[data-masonry-id="card-10000"] button').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:200,clientY:200}))`);
        await wait(`!!document.querySelector('[role="menu"]')`);
        await run(`[...document.querySelector('[role="menu"]').querySelectorAll('button')].find(b=>b.textContent==='复制角色卡').click()`);
        await wait(`masonryProbe.actions.some(a=>a[0]==='duplicate'&&a[1]==='card-10000')`);
      }
      const screenshot = join(dirname(report), `masonry-${mobile ? 'mobile' : 'pc'}-${width}.png`);
      await run(`document.querySelector('${selector}').scrollTop=0`);
      await wait(`document.querySelector('${selector}').scrollTop<2&&!!document.querySelector('[data-masonry-id="card-0"]')`);
      await run(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
      if (await run(`document.querySelector('${selector}').scrollTop>2`)) throw Error('Scrolled back after returning to top');
      writeFileSync(screenshot, (await win.webContents.capturePage()).toPNG());
      layouts.push({ mobile, width, theme, top, middle, last });
    }
    // Resize a live desktop gallery across responsive column boundaries.
    await run(`document.querySelector('.character-manager-scroll').scrollTop=250000`); await pause();
    win.setContentSize(900, 800); await pause(); await pause();
    const resized = await run(`(()=>{const v=document.querySelector('.character-manager-scroll'),cards=[...v.querySelectorAll('[data-masonry-id]')].map(n=>({id:n.dataset.masonryId,r:n.getBoundingClientRect()}));return {columns:getComputedStyle(v.querySelector('[data-virtual-masonry]')).gridTemplateColumns.split(' ').length,mounted:cards.length,offset:v.scrollTop}})()`);
    writeFileSync(report, JSON.stringify({ layouts, returns, resized, actions: await run('masonryProbe.actions'), errors }, null, 2));
  } finally { win.destroy(); app.quit(); }
}).catch(error => { console.error(error); app.exit(1); });
