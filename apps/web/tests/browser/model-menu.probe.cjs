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
  const layouts=[];
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
   await run(`document.querySelector('.model-menu-actions button').click()`);await wait();
   await run(`${trigger}.click()`);await wait();
  }
  await run(`${trigger}.click()`);await wait();
  await run(`[...document.querySelectorAll('[role=menuitem]')].find(button=>button.textContent.startsWith('模型')).click()`);await wait();
  const providerIcons = await run(`({headings:document.querySelectorAll('.model-provider-label .model-provider-identity').length,models:document.querySelectorAll('[role=menuitemradio] img,[role=menuitemradio] .model-identity-fallback').length})`);
  writeFileSync(join(dirname(report),'providers.png'),(await win.webContents.capturePage()).toPNG());
  await run(`document.querySelectorAll('[role=menuitemradio]')[24].click()`);await wait();
  await run(`${trigger}.click()`);await wait();
  await run(`[...document.querySelectorAll('[role=menuitem]')].find(button=>button.textContent==='参数').click()`);await wait();
  await run(`(()=>{const input=document.querySelector('[data-parameter=temperature] input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'0.72');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);await wait();
  await run(`${trigger}.click()`);await wait();
  const writesAfterClose=await run(`window.modelMenuFixture.calls.filter(call=>call.parameters).length`);
  await run(`${trigger}.click()`);await wait();
  await run(`[...document.querySelectorAll('[role=menuitem]')].find(button=>button.textContent==='参数').click()`);await wait();
  const restoredDraft=await run(`document.querySelector('[data-parameter=temperature] input').value`);
  await run(`document.querySelector('.model-menu-actions button:last-child').click()`);await wait();
  await run(`[...document.querySelectorAll('[role=menuitem]')].find(button=>button.textContent==='参数').click()`);await wait();
  const savedValue=await run(`document.querySelector('[data-parameter=temperature] input').value`);
  await run(`document.querySelector('.chat-model-capabilities summary').click();document.querySelector('.model-menu-actions').scrollIntoView({block:'nearest'})`);await wait();
  const expandedActionsVisible=await run(`(()=>{const panel=document.querySelector('[data-menu-material]').getBoundingClientRect();return [...document.querySelectorAll('.model-menu-actions button')].every(button=>{const box=button.getBoundingClientRect();return box.top>=panel.top&&box.bottom<=panel.bottom})})()`);
  writeFileSync(report,JSON.stringify({layouts,triggers,providerIcons,errors,writesAfterClose,restoredDraft,savedValue,expandedActionsVisible,calls:await run('window.modelMenuFixture.calls')}));win.destroy();app.exit(0);
 }catch(error){console.error(error);win.destroy();app.exit(1);}
});
