const {app,BrowserWindow}=require('electron');
const {writeFileSync}=require('node:fs');
const {join,dirname}=require('node:path');
const [html,report]=process.argv.slice(2);
app.setPath('userData',join(dirname(html),'browser-profile'));app.disableHardwareAcceleration();
app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:false,width:1000,height:850,webPreferences:{sandbox:true,backgroundThrottling:false}}),errors=[];
 win.webContents.on('console-message',event=>{if(event.level==='error')errors.push(event.message);});
 const run=source=>win.webContents.executeJavaScript(source),wait=()=>new Promise(resolve=>setTimeout(resolve,90));
 const trigger=`document.querySelector('main button')`, menu=`document.querySelector('[aria-label="模型与推理等级"]')`;
 try {
  await win.loadFile(html);for(let i=0;i<60&&!await run(`Boolean(${trigger})`);i++)await wait();
  win.webContents.debugger.attach('1.3');
  const layouts=[],capabilities=[],scrollbars=[];
  const triggers=[];
  for(const theme of ['light','dark'])for(const width of [320,390,1000]){
   win.setContentSize(width,850);await run(`document.documentElement.dataset.theme='${theme}';document.body.toggleAttribute('data-ds-dark-theme','${theme}'==='dark')`);await wait();
   await run(`document.querySelector('main').classList.toggle('mobile-shell',${width}<768)`);
   await win.webContents.debugger.sendCommand('Emulation.setTouchEmulationEnabled',{enabled:width<768});await wait();
   triggers.push(await run(`(()=>{const button=${trigger},icon=button.querySelector('.model-trigger-identity');return {theme:'${theme}',width:innerWidth,icons:button.querySelectorAll('.model-trigger-identity').length,iconWidth:icon.getBoundingClientRect().width,iconHeight:icon.getBoundingClientRect().height,buttonHeight:button.getBoundingClientRect().height,overflow:button.scrollWidth>button.clientWidth}})()`));
   if(width<768){
    await run(`${trigger}.parentElement.style.setProperty('--dsh-composer-model-text-display','none');${trigger}.parentElement.style.setProperty('--dsh-composer-model-icon-display','block')`);
    triggers.at(-1).condensed=await run(`({brandWidth:${trigger}.querySelector('.model-trigger-identity').getBoundingClientRect().width,nativeIconWidth:${trigger}.querySelector('svg').getBoundingClientRect().width})`);
    await run(`${trigger}.parentElement.style.removeProperty('--dsh-composer-model-text-display');${trigger}.parentElement.style.removeProperty('--dsh-composer-model-icon-display')`);
   }
   await run(`${trigger}.click()`);await wait();
   await run(`[...document.querySelectorAll('[role=menuitem]')].find(button=>button.textContent==='参数').click()`);await wait();
   await run(`(()=>{const input=document.querySelector('[data-parameter=temperature] input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'0.72');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
   await new Promise(resolve=>setTimeout(resolve,450));
   await run(`document.querySelector('.model-menu-actions button').focus();document.querySelector('.model-menu-actions').scrollIntoView({block:'nearest'})`);
   await win.webContents.capturePage();await wait();
   layouts.push(await run(`(()=>{const panel=document.querySelector('[data-menu-material]'),p=panel.getBoundingClientRect();return {theme:'${theme}',width:innerWidth,height:innerHeight,left:p.left,right:p.right,top:p.top,bottom:p.bottom,panelWidth:p.width,panelHeight:p.height,coarse:matchMedia('(pointer:coarse)').matches,menuFont:getComputedStyle(panel.querySelector('[role=menuitem]')).fontSize,inputFonts:[...panel.querySelectorAll('[data-parameter] input')].map(input=>getComputedStyle(input).fontSize),inputHeights:[...panel.querySelectorAll('[data-parameter] input')].map(input=>input.getBoundingClientRect().height),clientWidth:panel.clientWidth,scrollWidth:panel.scrollWidth,fields:[...panel.querySelectorAll('[data-parameter]')].map(node=>node.dataset.parameter),footer:Boolean(panel.querySelector('footer')),actions:[...panel.querySelectorAll('.model-menu-actions button')].map(button=>({text:button.textContent,height:button.getBoundingClientRect().height,background:getComputedStyle(button).backgroundColor,color:getComputedStyle(button).color,visible:button.getBoundingClientRect().bottom<=p.bottom&&button.getBoundingClientRect().top>=p.top})),writesBeforeSave:window.modelMenuFixture.calls.filter(call=>call.parameters).length,material:panel.dataset.menuMaterial,icons:panel.querySelectorAll('img,.model-identity-fallback').length}})()`));
   if(width===390||width===1000){await win.webContents.capturePage();writeFileSync(join(dirname(report),theme+(width===1000?'-desktop':'')+'.png'),(await win.webContents.capturePage()).toPNG());}
   await run(`document.querySelector('.chat-model-capabilities').open=true;document.querySelector('.model-menu-actions').scrollIntoView({block:'nearest'})`);await win.webContents.capturePage();await wait();
   capabilities.push(await run(`(()=>{const panel=document.querySelector('[data-menu-material]'),fields=panel.querySelector('.model-menu-parameters'),legend=panel.querySelector('.model-reasoning-profile legend'),buttons=[...panel.querySelectorAll('.model-reasoning-efforts button')],p=panel.getBoundingClientRect();return {theme:'${theme}',width:innerWidth,panel:{left:p.left,right:p.right},fieldsLeft:fields.getBoundingClientRect().left+parseFloat(getComputedStyle(fields).paddingLeft),legendLeft:legend.getBoundingClientRect().left,scrollWidth:panel.scrollWidth,clientWidth:panel.clientWidth,backgrounds:[...panel.querySelectorAll('.model-menu-draft,.model-form-section,.model-parameter-grid,[data-parameter],.model-reasoning-profile')].map(e=>({class:e.className,background:getComputedStyle(e).backgroundColor,shadow:getComputedStyle(e).boxShadow})),buttons:buttons.map(e=>{const r=e.getBoundingClientRect();return {text:e.textContent,left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,scrollWidth:e.scrollWidth,clientWidth:e.clientWidth}})}})()`));
   if(width===390||width===1000){await win.webContents.capturePage();await wait();writeFileSync(join(dirname(report),'capabilities-'+theme+(width===1000?'-desktop':'')+'.png'),(await win.webContents.capturePage()).toPNG());}
   const viewport=`document.querySelector('.model-menu-parameters').closest('.scrollable')`;
   await new Promise(resolve=>setTimeout(resolve,650));
   const idle=await run(`getComputedStyle(${viewport}).getPropertyValue('--dsh-scrollbar-thumb').trim()`);
   if(width<768){
    const x=Math.round(width-80);
    await win.webContents.debugger.sendCommand('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y:580}]});
    for(let step=1;step<=5;step++){
      await win.webContents.debugger.sendCommand('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:580+step*20}]});
      await win.webContents.capturePage();await new Promise(resolve=>setTimeout(resolve,35));
    }
    await win.webContents.debugger.sendCommand('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   }else await run(`${viewport}.scrollTop=0`);
   const moving=await run(`({thumb:getComputedStyle(${viewport}).getPropertyValue('--dsh-scrollbar-thumb').trim(),top:${viewport}.scrollTop,active:${viewport}.hasAttribute('data-parameters-scrolling')})`);
   await run(`${viewport}.scrollTop=${viewport}.scrollHeight`);
   await new Promise(resolve=>setTimeout(resolve,680));
   scrollbars.push({theme,width,idle,moving,after:await run(`({thumb:getComputedStyle(${viewport}).getPropertyValue('--dsh-scrollbar-thumb').trim(),atEnd:${viewport}.scrollTop+${viewport}.clientHeight>=${viewport}.scrollHeight-1})`)});
   if(width===390){await win.webContents.capturePage();writeFileSync(join(dirname(report),'capabilities-'+theme+'.png'),(await win.webContents.capturePage()).toPNG());}
   await run(`document.querySelector('.model-menu-actions button').click()`);await wait();
   await run(`${trigger}.click()`);await wait();
  }
  await run(`${trigger}.click()`);await wait();
  await run(`[...document.querySelectorAll('[role=menuitem]')].find(button=>button.textContent.startsWith('模型')).click()`);await wait();
  const providerIcons = await run(`({headings:document.querySelectorAll('.model-provider-label .model-provider-identity').length,models:document.querySelectorAll('[role=menuitemradio] img,[role=menuitemradio] .model-identity-fallback').length})`);
  writeFileSync(join(dirname(report),'providers.png'),(await win.webContents.capturePage()).toPNG());
  const materials=[];
  for(const theme of ['light','dark'])for(const width of [390,1000])for(const backdrop of ['#ffffff','#273244']){
   win.setContentSize(width,850);
   await run(`document.documentElement.dataset.theme='${theme}';document.body.toggleAttribute('data-ds-dark-theme','${theme}'==='dark');document.body.style.background='${backdrop}'`);
   await win.webContents.capturePage();await wait();
   const viewport=`document.querySelector('[data-menu-group]').parentElement`;
   for(const scroll of [0,60]){
    await run(`${viewport}.scrollTop=${scroll}`);await wait();
    await win.webContents.capturePage();await wait();
    const layout=await run(`(()=>{const panel=${menu},heading=panel.querySelector('[data-menu-group-heading]'),p=panel.getBoundingClientRect(),h=heading.getBoundingClientRect();return {theme:'${theme}',width:innerWidth,backdrop:'${backdrop}',stuck:heading.hasAttribute('data-stuck'),scroll:${viewport}.scrollTop,position:getComputedStyle(heading).position,heading:{x:Math.floor(h.right-12),y:Math.floor(h.top+h.height/2)},surface:{x:Math.floor(h.right-12),y:Math.floor(p.top+6)}}})()`);
    const capture=await win.webContents.capturePage(),bitmap=capture.toBitmap(),size=capture.getSize();
    const scale=size.width/layout.width;
    const pixel=({x,y})=>{const offset=(Math.floor(y*scale)*size.width+Math.floor(x*scale))*4;return [...bitmap.subarray(offset,offset+3)];};
    materials.push({...layout,headingPixel:pixel(layout.heading),surfacePixel:pixel(layout.surface)});
    if(scroll&&width===1000&&backdrop==='#273244')writeFileSync(join(dirname(report),'material-'+theme+'.png'),capture.toPNG());
   }
  }
  await run(`document.querySelectorAll('[role=menuitemradio]')[24].click()`);await wait();
  await run(`${trigger}.click()`);await wait();
  await run(`[...document.querySelectorAll('[role=menuitem]')].find(button=>button.textContent==='参数').click()`);await wait();
  await run(`(()=>{const input=document.querySelector('[data-parameter=temperature] input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'0.72');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);await wait();
  await run(`${trigger}.click()`);await wait();
  const writesAfterClose=await run(`window.modelMenuFixture.calls.filter(call=>call.parameters).length`);
  const leaveConfirmation=await run(`!!document.querySelector('[role=alertdialog]')`);
  await run(`[...document.querySelectorAll('[role=alertdialog] button')].find(e=>e.textContent==='取消').click()`);await wait();
  const restoredDraft=await run(`document.querySelector('[data-parameter=temperature] input').value`);
  await run(`document.querySelector('.model-menu-actions button:last-child').click()`);await wait();
  await run(`[...document.querySelectorAll('[role=menuitem]')].find(button=>button.textContent==='参数').click()`);await wait();
  const savedValue=await run(`document.querySelector('[data-parameter=temperature] input').value`);
  await run(`document.querySelector('.chat-model-capabilities summary').click();document.querySelector('.model-menu-actions').scrollIntoView({block:'nearest'})`);await wait();
  const expandedActionsVisible=await run(`(()=>{const panel=document.querySelector('[data-menu-material]').getBoundingClientRect();return [...document.querySelectorAll('.model-menu-actions button')].every(button=>{const box=button.getBoundingClientRect();return box.top>=panel.top&&box.bottom<=panel.bottom})})()`);
  writeFileSync(report,JSON.stringify({layouts,triggers,providerIcons,materials,capabilities,scrollbars,errors,leaveConfirmation,writesAfterClose,restoredDraft,savedValue,expandedActionsVisible,calls:await run('window.modelMenuFixture.calls')}));win.destroy();app.exit(0);
 }catch(error){console.error(error);win.destroy();app.exit(1);}
});
