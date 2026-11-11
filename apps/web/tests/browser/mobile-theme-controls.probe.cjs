const {app,BrowserWindow}=require('electron');
const {writeFileSync}=require('node:fs');
const {dirname}=require('node:path');
const [html,report]=process.argv.slice(2);
app.setPath('userData',dirname(html)+'/profile');app.disableHardwareAcceleration();
app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:false,width:390,height:844,webPreferences:{sandbox:true,backgroundThrottling:false}}),rows=[],errors=[];
 win.webContents.on('console-message',details=>{if(details.level==='error'||details.level===3)errors.push(details.message)});
 const run=code=>win.webContents.executeJavaScript(code),pause=()=>new Promise(r=>setTimeout(r,60));
 const wait=async code=>{for(let i=0;i<100;i++){if(await run(code))return;await pause()}throw Error('Missing control '+code)};
 try{
  for(const dark of [false,true])for(const drawer of [false,true]){
   await win.loadFile(html,{query:drawer?{drawer:'1'}:{}});
   await run(`document.documentElement.dataset.theme='${dark?'dark':'light'}';document.body.toggleAttribute('data-ds-dark-theme',${dark})`);
   if(drawer){
    await wait(`!!document.querySelector('.rail-user-trigger img')`);
    for(const active of [false,true]){
     await run(`document.querySelector('.rail-user-trigger').classList.toggle('active',${active})`);await pause();
     rows.push(await run(`(()=>{const e=document.querySelector('.rail-user-trigger'),s=getComputedStyle(e),r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {dark:${dark},drawer:true,active:${active},background:s.backgroundColor,image:s.backgroundImage,shadow:s.boxShadow,color:s.color,border:s.borderWidth,clickable:!!hit&&e.contains(hit),avatarRadius:getComputedStyle(e.querySelector('.avatar')).borderRadius}})()`));
    }
    await run(`document.querySelector('.rail-user-trigger').click()`);
    if(!await run('window.profileOpened'))throw Error('Profile click failed');
   }else{
    await wait(`!!document.querySelector('.history-item-delete')`);await run(`document.querySelector('.history-item-delete').click()`);
    await wait(`!!document.querySelector('.history-confirm button.danger')`);await pause();
    rows.push(await run(`(()=>{const e=document.querySelector('.history-confirm button.danger'),s=getComputedStyle(e);return {dark:${dark},drawer:false,color:s.color,background:s.backgroundColor}})()`));
    await win.webContents.capturePage();await pause();writeFileSync(dirname(report)+'/history-'+(dark?'dark':'light')+'.png',(await win.webContents.capturePage()).toPNG());
    await run(`document.querySelector('.history-confirm button.danger').click()`);
    if(!await run('window.historyDeleted'))throw Error('History delete failed');
   }
   if(drawer){await win.webContents.capturePage();await pause();writeFileSync(dirname(report)+'/drawer-'+(dark?'dark':'light')+'.png',(await win.webContents.capturePage()).toPNG());}
  }
  writeFileSync(report,JSON.stringify({rows,errors},null,2));win.destroy();app.quit();
 }catch(error){console.error(error);app.exit(1)}
});
