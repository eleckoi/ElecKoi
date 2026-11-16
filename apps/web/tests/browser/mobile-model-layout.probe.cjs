const { app, BrowserWindow } = require('electron');
const { writeFileSync } = require('node:fs');
const { dirname, join } = require('node:path');
const { pathToFileURL } = require('node:url');
const [htmlPath, reportPath] = process.argv.slice(2);
app.setPath('userData', join(dirname(htmlPath), 'browser-profile'));
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 390, height: 900, webPreferences: { sandbox: true, offscreen: true, backgroundThrottling: false } });
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
    const reports = [];
    for (const theme of ['light', 'dark']) for (const width of [320, 390, 640]) for (const mode of ['editor']) {
      win.setContentSize(width, 900);
      await evaluate(`document.documentElement.dataset.theme='${theme}'; document.body.toggleAttribute('data-ds-dark-theme',${theme==='dark'}); document.querySelector('nav [data-mode="${mode}"]').click()`);
      await wait(`document.querySelector('main').dataset.mode === '${mode}' && Boolean(document.querySelector('.model-input-capabilities'))`);
      const report = await evaluate(`(() => {
        const root=document.querySelector('${mode === 'editor' ? '.mobile-model-config-detail' : '.mobile-chat-models'}'),
          form=root.querySelector('.model-detail-form'), capabilities=root.querySelector('.model-capabilities'), inputs=root.querySelector('.model-input-capabilities'),
          reasoning=root.querySelector('.model-reasoning-profile'), remove=root.querySelector('[aria-label="删除配置"]');
        const bounds=node=>{const {x,y,width,height,bottom}=node.getBoundingClientRect();return {x,y,width,height,bottom};};
        return {formWidth:form.clientWidth, scrollWidth:form.scrollWidth, overflowNodes:[...form.querySelectorAll('*')].filter(node=>node.getBoundingClientRect().right>form.getBoundingClientRect().right+1).map(node=>({tag:node.tagName,className:node.className,text:node.textContent.slice(0,60),rect:bounds(node)})), capabilities:bounds(capabilities), inputs:bounds(inputs),
          parameterHeadingVisible:root.querySelector('.model-section-heading').getClientRects().length > 0,
          inputBorderRight:getComputedStyle(inputs).borderRightWidth,
          checkboxes:[...inputs.querySelectorAll('input')].map(input=>({...bounds(input),label:bounds(input.closest('label'))})),
          remove:remove?{...bounds(remove),icon:bounds(remove.querySelector('svg')),background:getComputedStyle(remove).backgroundColor,
            touchSize:remove.getBoundingClientRect().width - 2 * parseFloat(getComputedStyle(remove,'::after').left)}:null,
          reasoning:reasoning?{...bounds(reasoning),legend:bounds(reasoning.querySelector('legend')),buttons:[...reasoning.querySelectorAll('button')].map(bounds)}:null};
      })()`);
      if (mode === 'picker') {
        report.save = await evaluate(`(() => {
          const save=document.querySelector('.mobile-chat-models .mobile-overlay-primary');
          const reference=document.createElement('button'); reference.className='mobile-overlay-primary';
          save.parentElement.append(reference);
          const sample=node=>{const css=getComputedStyle(node);return {background:css.backgroundColor,color:css.color,opacity:css.opacity}};
          const disabled={disabled:save.disabled,...sample(save)}, expected=sample(reference);
          save.disabled=false; const enabled=sample(save); save.disabled=disabled.disabled; reference.remove();
          return {disabled,enabled,expected};
        })()`);
      }
      if (mode === 'editor') {
        report.controls = await evaluate(`(() => {
          const toggle=document.querySelector('.model-capability-toggle [role=switch]'),label=document.querySelector('.model-capability-toggle > span:last-child');
          const sample=node=>{const r=node.getBoundingClientRect(),s=getComputedStyle(node);return {width:r.width,height:r.height,background:s.backgroundColor}};
          const range=document.createRange();range.selectNodeContents(label);
          return {track:sample(toggle),thumb:sample(toggle.firstElementChild),reference:sample(document.querySelector('.reference-switch')),referenceThumb:sample(document.querySelector('.reference-switch > span')),
            labelLines:range.getClientRects().length,accents:[...document.querySelectorAll('.model-input-capabilities input,.model-directory-toggle input')].map(node=>getComputedStyle(node).accentColor),referenceAccent:getComputedStyle(document.querySelector('.reference-checkbox input')).accentColor};
        })()`);
        await evaluate(`document.querySelector('.model-capability-toggle [role=switch]').click()`);
        await wait(`!document.querySelector('.model-input-capabilities').disabled`);
        report.controls.customEditable=await evaluate(`!document.querySelector('.model-input-capabilities').disabled`);
        if(theme==='dark'&&width===390) {
          await evaluate(`document.querySelector('.model-capabilities').scrollIntoView({block:'center'})`);
          await new Promise(resolve=>setTimeout(resolve,80));
          writeFileSync(join(dirname(reportPath),'model-capabilities-dark.png'),(await win.webContents.capturePage()).toPNG());
        }
        await evaluate(`document.querySelector('.model-capability-toggle > span:last-child').click()`);
        await wait(`document.querySelector('.model-input-capabilities').disabled`);
        report.controls.defaultsRestored=true;
        report.modelActions = await evaluate(`(()=>{const rect=node=>{const r=node.getBoundingClientRect(),s=getComputedStyle(node);return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,background:s.backgroundColor,color:s.color,fontSize:s.fontSize,borderRadius:s.borderRadius}},buttons=[...document.querySelectorAll('.mobile-model-connection-actions button')];return buttons.map(button=>({text:button.textContent,...rect(button)}))})()`);
        await evaluate(`document.querySelector('.model-picker-value').click()`);
        await wait(`Boolean(document.querySelector('[aria-label="模型列表"]'))`);
        report.modelList = await evaluate(`(()=>{const dialog=document.querySelector('[aria-label="模型列表"]'), input=dialog.querySelector('input'), css=getComputedStyle(input); return {text:dialog.textContent,inputBorder:css.borderWidth,inputRadius:css.borderRadius}})()`);
        await evaluate(`document.querySelector('[aria-label="模型列表"] [aria-label="关闭"]').click()`);
        await wait(`!document.querySelector('[aria-label="模型列表"]')`);
      }
      await evaluate(`document.querySelector('[data-mode=updates]').click()`);
      await wait(`!!document.querySelector('.preset-updates .is-section-action')`);
      await evaluate(`document.querySelector('.preset-updates .is-section-action').scrollIntoView({block:'nearest'})`);
      report.updates=await evaluate(`(()=>{const button=document.querySelector('.preset-updates .is-section-action'),r=button.getBoundingClientRect(),s=getComputedStyle(button),heading=button.previousElementSibling.getBoundingClientRect(),icon=button.querySelector('svg'),symbol=document.querySelector(icon.querySelector('use').getAttribute('href'));return {height:r.height,fontSize:s.fontSize,color:s.color,background:s.backgroundColor,iconColor:getComputedStyle(icon).color,iconPresent:!!symbol?.querySelector('path'),sameRow:Math.abs(r.y+r.height/2-heading.y-heading.height/2)<1,overflow:document.documentElement.scrollWidth>innerWidth}})()`);
      const paint = () => evaluate(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
      const glyphRect=await evaluate(`(()=>{const r=document.querySelector('.preset-updates .is-section-action svg').getBoundingClientRect();return {x:Math.floor(r.x),y:Math.floor(r.y),width:Math.ceil(r.width),height:Math.ceil(r.height)}})()`);
      const countInk=image=>{
        const pixels=image.toBitmap({scaleFactor:1}),background=report.updates.background.match(/[\d.]+/g).slice(0,3).map(Number).reverse();
        let ink=0;
        for(let offset=0;offset<pixels.length;offset+=4) if(pixels[offset+3]>200&&background.some((channel,index)=>Math.abs(pixels[offset+index]-channel)>50)) ink++;
        return ink;
      };
      await paint();
      report.updates.iconInk=countInk(await win.webContents.capturePage(glyphRect));
      const originalHref=await evaluate(`(()=>{const use=document.querySelector('.preset-updates .is-section-action use'),href=use.getAttribute('href');use.setAttribute('href','#missing-icon-negative-control');return href})()`);
      await paint();
      report.updates.missingIconInk=countInk(await win.webContents.capturePage(glyphRect));
      await evaluate(`document.querySelector('.preset-updates .is-section-action use').setAttribute('href',${JSON.stringify(originalHref)})`);
      await paint();
      if(width===390){
        const buttonRect=await evaluate(`(()=>{const r=document.querySelector('.preset-updates .is-section-action').getBoundingClientRect();return {x:Math.floor(r.x),y:Math.floor(r.y),width:Math.ceil(r.width),height:Math.ceil(r.height)}})()`);
        writeFileSync(join(dirname(reportPath),`add-update-${theme}.png`),(await win.webContents.capturePage(buttonRect)).resize({width:288}).toPNG());
      }
      if(theme==='dark'&&width===390) { await new Promise(resolve=>setTimeout(resolve,80)); writeFileSync(join(dirname(reportPath),'updates-dark.png'),(await win.webContents.capturePage()).toPNG()); }
      await evaluate(`document.querySelector('.preset-updates .is-section-action').click()`);
      await wait(`!!document.querySelector('.preset-content-composer')`);
      report.updates.opened=true;
      if(process.argv[4]==='updates-only') { reports.push({theme,width,updates:report.updates}); continue; }
      await evaluate(`document.querySelector('[data-mode=groups]').click()`);
      await wait(`!!document.querySelector('.mobile-character-library-group-chip')`);
      report.groups = await evaluate(`(()=>{const r=e=>e.getBoundingClientRect().toJSON(),root=document.querySelector('.mobile-preset-library'),bar=root.querySelector('.mobile-character-library-group-bar'),rows=[...root.querySelectorAll('.mobile-character-library-group-chip')];return {bar:r(bar),buttons:rows.map(r),rows:rows.map(r),name:r(rows[1]),overflow:root.scrollWidth>innerWidth}})()`);
      if(theme==='dark'&&width===390) { await new Promise(resolve=>setTimeout(resolve,80)); writeFileSync(join(dirname(reportPath),'preset-groups-dark.png'),(await win.webContents.capturePage()).toPNG()); }
      await evaluate(`document.querySelector('[data-mode=editor]').click()`);
      await wait(`!!document.querySelector('.model-capabilities')`);
      reports.push({ theme, width, mode, ...report });
      if (theme === 'light' && width === 390) {
        await evaluate(`document.querySelector('${mode === 'editor' ? '.mobile-model-config-detail' : '.mobile-chat-models'} .model-capabilities').scrollIntoView({ block: 'center' })`);
        await new Promise(resolve => setTimeout(resolve, 80));
        writeFileSync(join(dirname(reportPath), `${mode}.png`), (await win.webContents.capturePage()).toPNG());
      }
    }
    writeFileSync(reportPath, JSON.stringify(reports, null, 2));
    win.destroy(); app.exit(0);
  } catch (error) { console.error(error); win.destroy(); app.exit(1); }
});
