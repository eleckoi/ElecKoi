const { app, BrowserWindow } = require('electron');
const { writeFileSync } = require('node:fs');
const { dirname, join } = require('node:path');
const { pathToFileURL } = require('node:url');
const [htmlPath, reportPath] = process.argv.slice(2);
app.setPath('userData', join(dirname(htmlPath), 'browser-profile'));
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, backgroundThrottling: false } });
  const evaluate = async source => {
    try { return await win.webContents.executeJavaScript(source); }
    catch (error) { throw new Error(`Browser evaluation failed: ${source}`, { cause: error }); }
  };
  const wait = async source => {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await evaluate(source)) return;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    throw new Error(`Timed out: ${source}`);
  };
  try {
    const reports = [];
    for (const theme of ['light', 'dark']) for (const [width, height] of [[1440, 900], [900, 500], [390, 700], [320, 640]]) {
      const compact = width < 700;
      win.setContentSize(width, height);
      await win.loadURL(`${pathToFileURL(htmlPath).href}${compact ? '?compact' : ''}`);
      await wait('Boolean(document.querySelector("[data-testid]")) || Boolean(document.querySelector(".character-basic-content"))');
      await evaluate(`document.documentElement.dataset.theme='${theme}'; document.documentElement.dataset.eleckoiMobile='${compact}';
        document.body.toggleAttribute('data-ds-dark-theme','${theme}'==='dark'); document.querySelector('button[aria-label="开场白"]').click()`);
      await wait('Boolean(document.querySelector(".setting-library-opening-item"))');
      await evaluate(`document.fonts.ready`);
      await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      const layout = await evaluate(`(() => {
        const panel=document.querySelector('.character-openings-panel'), content=panel.querySelector('.character-openings-content'), buttons=[...panel.querySelectorAll('button')];
        const sample=color=>{const ctx=new OffscreenCanvas(1,1).getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data]};
        const measure=node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};
        const panelRect=measure(panel);return {panel:panelRect,scrolls:content.scrollHeight>content.clientHeight,
          switchPresent:!!panel.querySelector('[role=switch]'), search:measure(panel.querySelector('.editor-collection-search')),
          searchAppearance:(()=>{const s=getComputedStyle(panel.querySelector('.editor-collection-search'));return {height:s.height,background:s.backgroundColor,border:s.borderTopColor,radius:s.borderRadius}})(),
          horizontalOverflow:panel.scrollWidth>panel.clientWidth,toolbar:measure(panel.firstElementChild),
          title:measure(panel.querySelector('.setting-library-opening-toggle strong')),
          card:measure(panel.querySelector('.setting-library-opening-item')),
          material:(()=>{const card=panel.querySelector('.setting-library-opening-item'),material=getComputedStyle(card.firstElementChild),reference=document.createElement('div');reference.style.cssText='background:var(--dsw-menu-surface-fill);backdrop-filter:var(--dsw-menu-backdrop-filter)';card.append(reference);const official=getComputedStyle(reference),value={fill:material.backgroundColor,filter:material.backdropFilter,officialFill:official.backgroundColor,officialFilter:official.backdropFilter};reference.remove();return value})(),
          iconButtons:[...panel.querySelectorAll('.setting-library-opening-tools button')].map(measure),
          headingColor:sample(getComputedStyle(panel.querySelector('.setting-library-opening-summary')).backgroundColor),
          borderColor:sample(getComputedStyle(panel.querySelector('.setting-library-opening-item')).borderTopColor),
          pageColor:sample(getComputedStyle(document.querySelector('.character-editor-workspace')).backgroundColor),
          navigation:[...document.querySelectorAll('.character-editor-navigation button')].map(button=>button.getAttribute('aria-label')),
          controls:buttons.filter(button=>button.getAttribute('aria-label')==='新建开场白'||button.classList.contains('setting-library-save-button')).map(measure)};
      })()`);
      await win.webContents.capturePage(undefined, { stayHidden: true });
      await new Promise(resolve => setTimeout(resolve, 200));
      writeFileSync(join(dirname(reportPath), `character-openings-${theme}-${width}.png`), (await win.webContents.capturePage()).toPNG());
      await evaluate(`document.querySelector('.setting-library-opening-toggle').click()`);
      await wait(`!document.querySelector('.setting-library-opening-fields')`);
      if (width===1440) {
        await win.webContents.capturePage(undefined, { stayHidden: true });
        await new Promise(resolve => setTimeout(resolve, 200));
        writeFileSync(join(dirname(reportPath), `character-openings-collapsed-${theme}.png`), (await win.webContents.capturePage()).toPNG());
        if (theme==='light') {
          const clip=await evaluate(`(() => {const toolbar=document.querySelector('.character-openings-toolbar').getBoundingClientRect(),card=document.querySelector('.setting-library-opening-item').getBoundingClientRect();return {x:Math.floor(toolbar.x),y:Math.floor(toolbar.y),width:Math.ceil(card.right-toolbar.x+22),height:Math.ceil(card.bottom-toolbar.y+22)}})()`);
          writeFileSync(join(dirname(reportPath), 'character-openings-toolbar-preview.png'), (await win.webContents.capturePage(clip)).toPNG());
        }
      }
      await evaluate(`[...document.querySelectorAll('button')].find(button=>button.getAttribute('aria-label')==='新建开场白').click()`);
      await wait('document.querySelectorAll(".setting-library-opening-item").length===2');
      await wait(`document.querySelectorAll('.setting-library-opening-item')[1].querySelector('.setting-library-opening-fields')!==null`);
      const backupButtons=await evaluate(`Array.from(document.querySelectorAll('.setting-library-opening-item')[1].querySelectorAll('.setting-library-opening-tools button')).map(button=>{const r=button.getBoundingClientRect();return {width:r.width,height:r.height,right:r.right}})`);
      await evaluate(`(() => {const select=document.querySelector('.setting-library-opening-fields select');select.value='synthetic-variables';select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await evaluate(`document.querySelector('.setting-library-save-button').click()`);
      await wait('window.syntheticSaveCount===1');
      await wait(`document.querySelector('.setting-library-save-button').disabled && document.querySelector('.setting-library-save-button').textContent==='保存'`);
      await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      if (theme==='light'&&width===1440) {
        await evaluate(`document.querySelector('.setting-library-opening-item.is-expanded .setting-library-opening-toggle').click()`);
        await wait(`!document.querySelector('.setting-library-opening-fields')`);
        await win.webContents.capturePage(undefined, { stayHidden: true });
        await new Promise(resolve => setTimeout(resolve, 200));
        const clip=await evaluate(`(() => {const toolbar=document.querySelector('.character-openings-toolbar').getBoundingClientRect(),list=document.querySelector('.setting-library-opening-list').getBoundingClientRect();return {x:Math.floor(toolbar.x),y:Math.floor(toolbar.y),width:Math.ceil(list.right-toolbar.x+22),height:Math.ceil(list.bottom-toolbar.y+22)}})()`);
        writeFileSync(join(dirname(reportPath), 'character-openings-list-preview.png'), (await win.webContents.capturePage(clip)).toPNG());
      }
      await evaluate(`document.querySelector('button[aria-label="设定库"]').click()`);
      await wait('Boolean(document.querySelector(".setting-library-layout"))');
      const settingsSeparated = await evaluate(`!document.querySelector('.setting-library-opening-item')&&!document.querySelector('[role=tree]').textContent.includes('开场白')`);
      const referenceSearchAppearance = await evaluate(`(()=>{const s=getComputedStyle(document.querySelector('.editor-collection-search'));return {height:s.height,background:s.backgroundColor,border:s.borderTopColor,radius:s.borderRadius}})()`);
      await evaluate(`document.querySelector('button[aria-label="开场白"]').click()`);
      await wait('document.querySelectorAll(".setting-library-opening-item").length===2');
      await evaluate(`document.querySelectorAll('.setting-library-opening-toggle')[1].click()`);
      const binding = await evaluate(`document.querySelector('.setting-library-opening-fields select').value`);
      const noOpeningVersions = await evaluate(`!document.querySelector('select[aria-label="开场白版本"]')`);
      reports.push({ theme, width, height, layout, backupButtons, settingsSeparated, binding, noOpeningVersions, referenceSearchAppearance });
    }
    writeFileSync(reportPath, JSON.stringify(reports)); app.exit(0);
  } catch (error) {
    console.error(error);
    console.error(await evaluate(`JSON.stringify({active:document.querySelector('[aria-current=page]')?.getAttribute('aria-label'),
      dialogs:[...document.querySelectorAll('[role=alertdialog]')].map(node=>node.textContent),
      sections:[...document.querySelectorAll('section')].map(node=>node.className),error:document.querySelector('[role=alert]')?.textContent})`));
    app.exit(1);
  }
});
