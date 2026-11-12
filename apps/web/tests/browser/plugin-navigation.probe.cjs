const {app,BrowserWindow}=require('electron');
const {resolve}=require('node:path');
const {pathToFileURL}=require('node:url');
const {writeFileSync}=require('node:fs');
const directory=process.argv[2];app.disableHardwareAcceleration();app.setPath('userData',resolve(directory,'profile'));
app.whenReady().then(async()=>{
  const {installMainPluginNavigation}=require(resolve(directory,'main.cjs'));
  const options={show:false,webPreferences:{sandbox:true,contextIsolation:true,preload:resolve(directory,'preload.cjs'),backgroundThrottling:false}};
  const main=new BrowserWindow(options),child=new BrowserWindow(options),report={errors:[],activationRequests:0,screenshots:'Not captured per user instruction'};
  for(const win of [main,child])win.webContents.on('console-message',({level,message})=>{if(level==='error')report.errors.push(message);});
  const run=(win,code)=>win.webContents.executeJavaScript(code),wait=async win=>{for(let i=0;i<60;i++){if(await run(win,'!!window.ready'))return;await new Promise(r=>setTimeout(r,30));}throw Error('Synthetic renderer not ready');};
  const dispose=installMainPluginNavigation(event=>{if(![main,child].some(win=>event.sender===win.webContents&&event.senderFrame===win.webContents.mainFrame))throw Error('Untrusted fixture sender');},async()=>{report.activationRequests++;return main;});
  try{
    const url=pathToFileURL(resolve(directory,'fixture.html')).href;
    await main.loadURL(url);await child.loadURL(url+'?view=preset-editor&preset=synthetic-preset&section=tools');await wait(main);await wait(child);
    await run(child,'window.dshDesktop.plugins.openSettings("web-search")');
    await run(main,'window.failNavigation=true');
    report.retryError=await run(child,'window.dshDesktop.plugins.openSettings("web-search").then(()=>null,error=>({message:error.message,code:error.code}))');
    await run(main,'window.failNavigation=false');await run(child,'window.dshDesktop.plugins.openSettings("web-search")');
    report.mainConfig=await run(main,'document.getElementById("config").textContent');report.childConfig=await run(child,'document.getElementById("config").textContent');report.childDraft=await run(child,'document.querySelector("textarea").value');report.openCount=await run(main,'window.openCount');
  }catch(error){report.failure=error.stack;}
  finally{dispose();writeFileSync(resolve(directory,'report.json'),JSON.stringify(report,null,2));main.destroy();child.destroy();app.exit(report.failure?1:0);}
});
