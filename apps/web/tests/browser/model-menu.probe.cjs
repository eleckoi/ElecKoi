const {app,BrowserWindow}=require('electron');
const {writeFileSync}=require('node:fs');const {join,dirname}=require('node:path');const [html,report]=process.argv.slice(2);
app.setPath('userData',join(dirname(report),'profile'));app.disableHardwareAcceleration();app.commandLine.appendSwitch('force-device-scale-factor','1');
app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:false,width:1000,height:850,webPreferences:{sandbox:true,offscreen:true,backgroundThrottling:false}}),errors=[],layouts=[];
 win.webContents.on('console-message',({level,message})=>{if(level==='error')errors.push(message)});
 const run=code=>win.webContents.executeJavaScript(code),wait=()=>new Promise(resolve=>setTimeout(resolve,90));
 const click=async name=>{await run('[...document.querySelectorAll("button")].find(e=>e.textContent.trim()==='+JSON.stringify(name)+').click()');await wait()};
 try{
  await win.loadFile(html);for(let i=0;i<60&&!await run('!!document.querySelector("main button")');i++)await wait();
  for(const theme of ['light','dark'])for(const width of [320,390,1000]){
   win.setContentSize(width,850);await run('document.documentElement.dataset.eleckoiMobile='+JSON.stringify(String(width<768))+';document.documentElement.dataset.theme='+JSON.stringify(theme)+';document.body.toggleAttribute("data-ds-dark-theme",'+(theme==='dark')+')');await wait();
   await run('document.querySelector("main button").click()');await wait();await click('参数');
   const geometry=await run('(()=>{const p=document.querySelector("[aria-label=模型与推理等级]").getBoundingClientRect();return {left:p.left,right:p.right,top:p.top,bottom:p.bottom,width:p.width,overflow:document.documentElement.scrollWidth>innerWidth,fields:[...document.querySelectorAll("[data-parameter]")].map(e=>e.dataset.parameter),capabilities:!!document.querySelector(".chat-model-capabilities")}})()');
   if(geometry.left<11||geometry.right>width-11||geometry.top<11||geometry.bottom>851||geometry.overflow||geometry.capabilities)throw Error('Menu layout '+JSON.stringify(geometry));
   layouts.push({theme,viewport:width,...geometry});
   await run('(()=>{const input=document.querySelector("[data-parameter=temperature] input");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(input,"0.72");input.dispatchEvent(new Event("input",{bubbles:true}));})()');await wait();
   await run('document.querySelector("main button").click()');await wait();
   if(!await run('!!document.querySelector("[role=alertdialog]")'))throw Error('Unsaved Session draft disappeared');
   await click('不保存');await run('document.querySelector("main button").click()');await wait();await click('参数');
   if(await run('document.querySelector("[data-parameter=temperature] input").value')!=='')throw Error('Discard wrote Session parameters');
   await run('document.querySelector("main button").click()');await wait();
  }
  await run('document.querySelector("main button").click()');await wait();await click('参数');
  await run('(()=>{const input=document.querySelector("[data-parameter=temperature] input");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(input,"0.63");input.dispatchEvent(new Event("input",{bubbles:true}));})()');await wait();await click('保存');await click('参数');
  if(await run('document.querySelector("[data-parameter=temperature] input").value')!=='0.63')throw Error('Session save did not survive reopen');
  if(errors.length)throw Error(errors.join(';'));
  writeFileSync(report,JSON.stringify({passed:true,layouts,calls:await run('window.modelMenuFixture.calls'),errors,screenshots:false}));win.destroy();app.exit(0);
 }catch(error){writeFileSync(report,JSON.stringify({passed:false,failure:error.stack,layouts,errors,screenshots:false}));win.destroy();app.exit(1)}
});
