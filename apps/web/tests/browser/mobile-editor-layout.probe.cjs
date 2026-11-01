const { app, BrowserWindow } = require('electron');
const { writeFileSync } = require('node:fs');
const { dirname, join } = require('node:path');
const { pathToFileURL } = require('node:url');
const [htmlPath, reportPath] = process.argv.slice(2);
app.setPath('userData', join(dirname(htmlPath), 'browser-profile'));
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 390, height: 844, webPreferences: { sandbox: true, backgroundThrottling: false } });
  const evaluate = source => win.webContents.executeJavaScript(source);
  const wait = async source => {
    for (let attempt = 0; attempt < 120; attempt++) {
      if (await evaluate(source)) return;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    throw new Error(`Timed out: ${source}`);
  };
  try {
    await win.loadURL(pathToFileURL(htmlPath).href);
    await win.webContents.insertCSS('*, *::before, *::after { animation: none !important; transition: none !important; }');
    const reports = [], merges = [], searches = [];
    for (const theme of ['light', 'dark']) for (const width of [320, 390, 768, 1200]) {
      const compact = width !== 1200;
      win.setContentSize(width, 844);
      await wait(`window.innerWidth===${width}`);
      await evaluate(`document.documentElement.dataset.theme='${theme}'; document.body.toggleAttribute('data-ds-dark-theme','${theme}'==='dark'); document.documentElement.dataset.eleckoiMobile='${compact}'`);
      for (const kind of ['settings', 'variables', 'regex', 'scripts']) for (const scope of ['character', 'preset']) {
        const key = `${kind}:${scope}:${compact}`;
        await wait('Boolean(document.querySelector("nav"))');
        await evaluate(`document.querySelector('[data-editor="${key}"]').click()`);
        await wait(`document.querySelector('main').dataset.current==='${key}' && Boolean(document.querySelector('.editor-collection-toolbar')) && !document.querySelector('button[aria-label="管理"]').disabled`);
        await evaluate('document.fonts.ready');
        const layout = await evaluate(`(()=>{
          const rect=node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}}, style=node=>getComputedStyle(node);
          const browser=document.querySelector('.editor-collection-browser'), toolbar=browser.querySelector('.editor-collection-toolbar'), bottom=browser.querySelector('.mobile-editor-actions [role=toolbar]');
          const groups=[...browser.querySelectorAll('.editor-library-group')].map(group=>({bounds:rect(group), borderBottom:style(group).borderBottomWidth,
            header:rect(group.querySelector('.editor-library-header')), heading:rect(group.querySelector('.editor-library-heading')),
            headingTag:group.querySelector('.editor-library-heading').tagName, headingIcons:group.querySelectorAll('.editor-library-heading svg').length,
            rows:rect(group.querySelector('.editor-library-rows')), rowsFill:style(group.querySelector('.editor-library-rows')).backgroundColor,
            radius:style(group.querySelector('.editor-library-rows')).borderRadius, outline:style(group.querySelector('.editor-library-rows')).boxShadow,
            toggle:rect(group.querySelector('.editor-library-header label')), tracks:[...group.querySelectorAll('.script-switch i, .regex-rule-switch i')].map(rect), switchFill:style(group.querySelector('.editor-library-header i')).backgroundColor}));
          const appearance=node=>{const s=style(node);return [s.backgroundColor,s.color,s.borderWidth,s.borderRadius].join('|')},ref=document.querySelector('[data-official-controls]'),refSearch=ref.querySelector('input').parentElement,refButtons=[...ref.querySelectorAll('button')]; return {officialSearch:appearance(toolbar.querySelector('.editor-collection-search'))===appearance(refSearch),officialActions:[...toolbar.querySelectorAll('.editor-collection-action')].every(node=>refButtons.some(ref=>appearance(ref)===appearance(node))),browser:rect(browser), scrollWidth:browser.scrollWidth, topButtons:[...toolbar.querySelectorAll('button')].map(button=>button.textContent),
            toolbar:rect(toolbar), search:rect(toolbar.querySelector('.editor-collection-search')), actions:[...toolbar.querySelectorAll('.editor-collection-action')].map(rect),
            searchFill:style(toolbar.querySelector('.editor-collection-search')).backgroundColor, actionFill:style(toolbar.querySelector('[aria-label="管理"]')).backgroundColor,
            bottom:bottom?rect(bottom):null, bottomButtons:bottom?[...bottom.querySelectorAll('button')].map(button=>({label:button.textContent,rect:rect(button)})):[], groups};
        })()`);
        if (theme === 'light' && width === 390 && scope === 'character') {
          const screenshot = await win.webContents.capturePage();
          writeFileSync(join(dirname(reportPath), `${kind}.png`), screenshot.toPNG());
        }
        if (compact && width === 390 && !['settings', 'variables'].includes(kind)) {
          await evaluate(`document.querySelector('button[aria-label="管理"]').click()`);
          await wait(`Boolean(document.querySelector('.editor-management-modal'))`);
          await evaluate(`[...document.querySelector('.editor-management-modal').querySelectorAll('button')].find(button=>button.textContent==='重命名当前版本').click()`);
          await wait(`document.activeElement===document.querySelector('.version-name-dialog input')`);
          const measureDialog = `(()=>{const dialog=document.querySelector('.version-name-dialog'), rect=node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}};return {dialog:rect(dialog),input:rect(dialog.querySelector('input')),buttons:[...dialog.lastElementChild.querySelectorAll('button')].map(rect),close:rect(dialog.querySelector('[aria-label="关闭"]')),scrollArea:rect(dialog.querySelector('.editor-management-content > :last-child')),error:dialog.querySelector('[role="alert"]')?.textContent}})()`;
          layout.versionDialog = { before: await evaluate(measureDialog) };
          win.setContentSize(width, 340);
          await evaluate(`document.documentElement.setAttribute('data-eleckoi-ime-visible','')`);
          await wait(`window.innerHeight===340`);
          await evaluate(`(()=>{const input=document.querySelector('.version-name-dialog input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
          await evaluate(`document.querySelector('.version-name-dialog').lastElementChild.querySelector('button:last-child').click()`);
          await wait(`Boolean(document.querySelector('.version-name-dialog [role="alert"]'))`);
          layout.versionDialog.after = await evaluate(measureDialog);
          if (theme === 'light' && scope === 'character') {
            await evaluate(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
            writeFileSync(join(dirname(reportPath), `${kind}-version-dialog.png`), (await win.webContents.capturePage()).toPNG());
          }
          await evaluate(`document.querySelector('.version-name-dialog').lastElementChild.querySelector('button').click()`);
          await wait(`!document.querySelector('.version-name-dialog')`);
          await evaluate(`document.querySelector('.editor-management-modal [aria-label="关闭"]').click()`);
          await wait(`!document.querySelector('.editor-management-modal')`);
          win.setContentSize(width, 844);
          await evaluate(`document.documentElement.removeAttribute('data-eleckoi-ime-visible')`);
        }
        reports.push({ kind, scope, width, theme, compact, ...layout });
      }
    }
    for (const theme of ['light', 'dark']) for (const width of [320, 390, 1200]) for (const scope of ['character', 'preset']) {
      const compact = width !== 1200, key = `merge:${scope}:${compact}`;
      win.setContentSize(width, 844);
      await wait(`window.innerWidth===${width}`);
      await evaluate(`document.documentElement.dataset.theme='${theme}'; document.body.toggleAttribute('data-ds-dark-theme','${theme}'==='dark'); document.documentElement.dataset.eleckoiMobile='${compact}'`);
      await evaluate(`document.querySelector('[data-editor="${key}"]').click()`);
      await wait(`document.querySelector('main').dataset.current==='${key}' && Boolean(document.querySelector('.editor-management-modal'))`);
      await evaluate(`[...document.querySelector('.editor-management-modal').querySelectorAll('button')].find(button=>button.textContent==='并入设定库').click()`);
      await wait(`Boolean(document.querySelector('.setting-library-manager-row:not(:disabled)'))`);
      await evaluate(`document.querySelector('.setting-library-manager-row:not(:disabled)').click()`);
      await wait(`document.querySelectorAll('.setting-library-tri-checkbox').length===3`);
      const report = await evaluate(`(()=>{const rect=node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}};return {dialog:rect(document.querySelector('.editor-management-modal')),boxes:[...document.querySelectorAll('.setting-library-tri-checkbox')].map(node=>({hit:rect(node),mark:rect(node.firstElementChild)}))}})()`);
      await evaluate(`document.querySelectorAll('.setting-library-tri-checkbox')[1].click()`);
      await wait(`document.querySelector('.setting-library-tri-checkbox').getAttribute('aria-checked')==='mixed'`);
      report.mixed = await evaluate(`document.querySelector('.setting-library-tri-checkbox').getAttribute('aria-checked')`);
      await evaluate(`document.querySelector('.setting-library-tri-checkbox').click()`);
      await wait(`[...document.querySelectorAll('.setting-library-tri-checkbox')].every(node=>node.getAttribute('aria-checked')==='true')`);
      report.checked = await evaluate(`[...document.querySelectorAll('.setting-library-tri-checkbox')].map(node=>node.getAttribute('aria-checked'))`);
      report.canMerge = await evaluate(`!document.querySelector('.setting-library-merge-button').disabled`);
      merges.push({ width, compact, scope, theme, ...report });
    }
    for (const theme of ['light', 'dark']) for (const width of [320, 390, 412, 768, 1200]) for (const kind of ['prompts', 'tools', 'branches']) {
      const compact = width !== 1200, scope = kind === 'branches' ? 'character' : 'preset', key = `${kind}:${scope}:${compact}`;
      win.setContentSize(width, 844);
      await wait(`window.innerWidth===${width}`);
      await evaluate(`document.documentElement.dataset.theme='${theme}'; document.body.toggleAttribute('data-ds-dark-theme','${theme}'==='dark'); document.documentElement.dataset.eleckoiMobile='${compact}'`);
      await evaluate(`document.querySelector('[data-editor="${key}"]').click()`);
      await wait(`document.querySelector('main').dataset.current==='${key}' && Boolean(document.querySelector('main input'))`);
      const layout = await evaluate(`(()=>{const input=document.querySelector('main input'),search=input.parentElement,toolbar=search.parentElement,rect=node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}},style=getComputedStyle(search),r=input.getBoundingClientRect();const ref=document.querySelector('[data-official-controls]'),refSearch=getComputedStyle(ref.querySelector('input').parentElement),refAction=getComputedStyle(ref.querySelector('button'));return {referenceRadius:refSearch.borderRadius,referenceBorder:refSearch.borderWidth,referenceActionRadius:refAction.borderRadius,input:rect(input),search:rect(search),toolbar:rect(toolbar),radius:style.borderRadius,border:style.borderWidth,fill:style.backgroundColor,reachable:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===input,actions:[...toolbar.querySelectorAll('.editor-collection-action')].map(node=>({label:node.textContent,rect:rect(node),fill:getComputedStyle(node).backgroundColor,color:getComputedStyle(node).color,radius:getComputedStyle(node).borderRadius}))}})()`);
      if (compact && kind !== 'branches') {
        writeFileSync(join(dirname(reportPath), `${kind}-${width}-${theme}.png`), (await win.webContents.capturePage()).toPNG());
      }
      await evaluate(`(()=>{const input=document.querySelector('main input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'合成查询');input.dispatchEvent(new Event('input',{bubbles:true}))})()`);
      await wait(`document.querySelector('main input').value==='合成查询'`);
      searches.push({ kind, scope, width, compact, theme, ...layout });
    }
    writeFileSync(reportPath, JSON.stringify({ layouts: reports, merges, searches }, null, 2)); win.destroy(); app.exit(0);
  } catch (error) { console.error(error); win.destroy(); app.exit(1); }
});
