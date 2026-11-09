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
  for(const theme of ['light','dark'])for(const width of [320,390,1000]){
   win.setContentSize(width,850);await run(`document.documentElement.dataset.theme='${theme}';document.body.toggleAttribute('data-ds-dark-theme','${theme}'==='dark')`);await wait();
   await run(`document.querySelector('main').classList.toggle('mobile-shell',${width}<768)`);
   await win.webContents.debugger.sendCommand('Emulation.setTouchEmulationEnabled',{enabled:width<768});await wait();
   await run(`${trigger}.click()`);await wait();
   await run(`[...document.querySelectorAll('[role=menuitem]')].find(button=>button.textContent==='参数').click()`);await wait();
   await win.webContents.capturePage();await wait();
   layouts.push(await run(`(()=>{const panel=document.querySelector('[data-menu-material]'),p=panel.getBoundingClientRect();return {theme:'${theme}',width:innerWidth,height:innerHeight,left:p.left,right:p.right,top:p.top,bottom:p.bottom,panelWidth:p.width,panelHeight:p.height,coarse:matchMedia('(pointer:coarse)').matches,menuFont:getComputedStyle(panel.querySelector('[role=menuitem]')).fontSize,inputFonts:[...panel.querySelectorAll('[data-parameter] input')].map(input=>getComputedStyle(input).fontSize),inputHeights:[...panel.querySelectorAll('[data-parameter] input')].map(input=>input.getBoundingClientRect().height),clientWidth:panel.clientWidth,scrollWidth:panel.scrollWidth,fields:[...panel.querySelectorAll('[data-parameter]')].map(node=>node.dataset.parameter),footer:Boolean(panel.querySelector('footer')),material:panel.dataset.menuMaterial,icons:panel.querySelectorAll('img,.model-identity-fallback').length}})()`));
   if(width===390){await win.webContents.capturePage();writeFileSync(join(dirname(report),theme+'.png'),(await win.webContents.capturePage()).toPNG());}
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
  writeFileSync(report,JSON.stringify({layouts,providerIcons,errors,calls:await run('window.modelMenuFixture.calls')}));win.destroy();app.exit(0);
 }catch(error){console.error(error);win.destroy();app.exit(1);}
});
