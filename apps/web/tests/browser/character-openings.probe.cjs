const { app, BrowserWindow } = require('electron');
const { writeFileSync } = require('node:fs');
const { dirname, join } = require('node:path');
const { pathToFileURL } = require('node:url');
const [htmlPath, reportPath] = process.argv.slice(2);
app.setPath('userData', join(dirname(htmlPath), 'browser-profile'));
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, backgroundThrottling: false, offscreen: true } });
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
      if (!compact) {
        await wait('Boolean(document.querySelector(".opening-list-item"))');
        await evaluate('document.fonts.ready');
        await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
        const check=(value,message)=>{if(!value)throw Error(message)}, actions={};
        const click=async selector=>{await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);await new Promise(r=>setTimeout(r,100))};
        const textClick=async (selector,text)=>{await evaluate(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.textContent.trim()===${JSON.stringify(text)});if(!e)throw Error('Missing '+${JSON.stringify(text)});e.click()})()`);await new Promise(r=>setTimeout(r,100))};
        const input=async(selector,value)=>{await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.focus();e.select()})()`);await win.webContents.insertText(value);await new Promise(r=>setTimeout(r,100))};
        const snapshot=async name=>{await evaluate('document.getAnimations().forEach(a=>a.finish())');await win.webContents.capturePage();await new Promise(r=>setTimeout(r,150));writeFileSync(join(dirname(reportPath),name+'.png'),(await win.webContents.capturePage()).toPNG())};
        const layout=await evaluate(`(()=>{const r=s=>document.querySelector(s).getBoundingClientRect().toJSON();return {navigation:[...document.querySelectorAll('.character-editor-navigation button')].map(e=>e.getAttribute('aria-label')),directory:r('.setting-directory'),editor:r('.setting-document'),board:r('.opening-writing'),immersive:r('.setting-immersive-host button'),create:r('.setting-create'),save:r('.setting-document-save'),overflow:document.documentElement.scrollWidth>innerWidth,editors:document.querySelectorAll('.cm-editor').length,font:getComputedStyle(document.querySelector('.cm-content')).fontSize,trees:document.querySelectorAll('.character-openings-panel [role=tree]').length,tabs:document.querySelectorAll('.character-openings-panel [role=tab]').length,switches:document.querySelectorAll('.character-openings-panel [role=switch]').length}})()`);
        check(!layout.overflow && layout.directory.top===40 && layout.editor.top===40 && (width===1440?layout.directory.width===480:layout.editor.width===380) && layout.editor.left-layout.directory.right===8 && layout.directory.bottom===layout.editor.bottom,'Opening desktop geometry: '+JSON.stringify(layout));
        check(layout.create.right<layout.save.left && layout.editors===1 && layout.font==='14px' && !layout.trees && !layout.tabs && !layout.switches,'Flat list / single body / directory save');
        check(layout.immersive.bottom<=layout.board.bottom && layout.immersive.right<=layout.board.right && layout.immersive.left>layout.board.left+layout.board.width/2,'Immersion should live inside lower right');
        await snapshot(`character-openings-${theme}-${width}`);
        await click('[aria-label="新建开场白"]');await input('[aria-label="标题"]','备用测试');
        await evaluate(`(()=>{const e=document.querySelector('[aria-label="关联变量版本"]');e.value='synthetic-variables';e.dispatchEvent(new Event('change',{bubbles:true}))})()`);
        await evaluate(`(()=>{const v=window.editorViewFor('开场白正文');v.dispatch({changes:{from:0,to:v.state.doc.length,insert:'备用正文 <div>代码原样保留</div>'}})})()`);
        check(await evaluate('window.syntheticSaveCount===0 && document.querySelectorAll(".cm-editor").length===1'),'Manual draft / one mounted body');actions.manualDraft=true;
        if(width===1440 && theme==='light') {
          await click('.setting-immersive-host button');check(await evaluate('document.querySelectorAll(".cm-editor").length===1 && !document.querySelector(".opening-writing .cm-editor")'),'Immersion duplicates body');
          await evaluate(`(()=>{const v=window.editorViewFor('开场白正文');v.dispatch({changes:{from:v.state.doc.length,insert:'沉浸末尾'}})})()`);await click('.immersive-markdown-exit');check(await evaluate('window.editorViewFor("开场白正文").state.doc.toString().endsWith("沉浸末尾")'),'Immersion lost draft');actions.immersion=true;
          await evaluate('window.syntheticSaveFails=true');await click('.setting-document-save');check(await evaluate('!!document.querySelector("[role=alert]") && !document.querySelector(".setting-document-save").disabled'),'Save failure must retain draft');await evaluate('window.syntheticSaveFails=false');actions.saveFailure=true;
        }
        await click('.setting-document-save');await wait('window.syntheticSaveCount===1');
        check(await evaluate('window.openingSaved().openingMessages[1].variableVersionId==="synthetic-variables" && window.openingSaved().openingMessages[1].content.includes("<div>")'),'Binding and full content save');actions.bindingSave=true;
        if(width===1440 && theme==='light') {
          await input('[aria-label="搜索开场白"]','代码原样');check(await evaluate('document.querySelectorAll(".opening-list-item").length===1 && document.querySelector(".setting-document-save").disabled'),'Body search must not edit data');await input('[aria-label="搜索开场白"]','没有这个开场');check(await evaluate('!!document.querySelector(".opening-list-empty") && !!document.querySelector(".setting-document-save")'),'Empty search lost save');await snapshot('character-openings-empty-search');await input('[aria-label="搜索开场白"]','');actions.search=true;
          await click('[aria-label="开场白操作"]');await textClick('[role=menuitem]','复制开场白');check(await evaluate('document.querySelectorAll(".opening-list-item").length===3 && document.querySelector("[aria-label=关联变量版本]").value==="synthetic-variables"'),'Copy lost binding');actions.copy=true;
          await click('[aria-label="开场白操作"]');await textClick('[role=menuitem]','上移');check(await evaluate('document.querySelectorAll(".opening-list-name")[1].textContent==="备用测试 副本"'),'Move up failed');await click('[aria-label="开场白操作"]');await textClick('[role=menuitem]','下移');check(await evaluate('document.querySelectorAll(".opening-list-name")[2].textContent==="备用测试 副本"'),'Move down failed');actions.order=true;
          await click('[aria-label="开场白操作"]');await textClick('[role=menuitem]','删除开场白');await textClick('[role=alertdialog] button','取消');check(await evaluate('document.querySelectorAll(".opening-list-item").length===3'),'Cancel removed opening');await click('[aria-label="开场白操作"]');await textClick('[role=menuitem]','删除开场白');await textClick('[role=alertdialog] button','删除');check(await evaluate('document.querySelectorAll(".opening-list-item").length===2'),'Delete failed');actions.delete=true;
          await evaluate('document.querySelector(".opening-list-item").dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,clientX:260,clientY:170}))');await textClick('[role=menuitem]','删除开场白');await textClick('[role=alertdialog] button','删除');await click('.setting-document-save');check(await evaluate('window.openingSaved().openingMessages.length===1 && window.openingSaved().defaultOpeningMessageId===window.openingSaved().openingMessages[0].id && !!document.querySelector(".opening-primary-label")'),'Primary promotion failed');actions.primaryPromotion=true;
          await evaluate('document.querySelector(".opening-directory-list").dispatchEvent(new MouseEvent("mousedown",{bubbles:true,button:0}))');await wait('!!document.querySelector(".setting-document-empty")');check(await evaluate('!!document.querySelector(".setting-document-save") && !document.querySelector(".cm-editor")'),'Empty selection lost save or mounted body');await snapshot('character-openings-empty-selection');await click('[aria-label="新建开场白"]');await click('.setting-document-save');actions.emptySelection=true;
          await evaluate('document.querySelector("[aria-label=调整目录宽度]").focus()');win.webContents.sendInputEvent({type:'keyDown',keyCode:'RIGHT'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'RIGHT'});await new Promise(r=>setTimeout(r,100));check(await evaluate('document.querySelector(".setting-directory").getBoundingClientRect().width===496'),'Resize failed');actions.resize=true;
        }
        await click('button[aria-label="设定库"]');await wait('!!document.querySelector(".is-setting-library .setting-workspace")');check(await evaluate('!document.querySelector(".opening-list-item") && !document.querySelector("[role=tree]").textContent.includes("开场白")'),'Openings leaked into settings tree');await click('button[aria-label="开场白"]');await wait('document.querySelectorAll(".opening-list-item").length===2');actions.reopen=true;
        reports.push({desktop:true,width,height,theme,layout,actions});continue;
      }
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
