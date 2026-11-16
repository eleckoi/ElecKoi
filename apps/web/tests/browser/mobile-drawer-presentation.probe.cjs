const {app,BrowserWindow}=require('electron');
const {writeFileSync}=require('node:fs');
const {dirname,join}=require('node:path');
const {pathToFileURL}=require('node:url');
const [html,reportPath]=process.argv.slice(2);
app.disableHardwareAcceleration();app.setPath('userData',join(dirname(html),'profile'));
app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:false,webPreferences:{sandbox:true,offscreen:true,backgroundThrottling:false}}),report={cases:[],errors:[]};
 const run=s=>win.webContents.executeJavaScript(s),pause=ms=>new Promise(r=>setTimeout(r,ms));
 const wait=async s=>{for(let i=0;i<120;i++){if(await run(s))return;await pause(20);}throw Error(s);};
 win.webContents.on('console-message',e=>{if(e.level==='error')report.errors.push(e.message);});
 const sample=()=>run(`(()=>{const frame=document.querySelector('[data-sidebar-drawer]'),side=document.querySelector('.official-mobile-sidebar').parentElement,front=side.nextElementSibling,nav=document.querySelector('.mobile-bottom-nav'),mask=frame?.querySelector('[data-sidebar-mask]'),r=e=>e?.getBoundingClientRect().toJSON();return {width:innerWidth,height:innerHeight,drawer:!!frame,closed:frame?.hasAttribute('data-sidebar-collapsed'),side:r(side),front:r(front),nav:r(nav),mask:r(mask),sideVisibility:getComputedStyle(side).visibility,frontTransform:getComputedStyle(front).transform,frontRadius:getComputedStyle(front).borderTopLeftRadius,navTransform:getComputedStyle(nav).transform,centerInert:front.hasAttribute('inert'),maskHit:mask&&document.elementFromPoint(Math.min(innerWidth-4,mask.getBoundingClientRect().left+12),innerHeight/2)===mask,footer:!!document.querySelector('[data-footer-action]'),draftSame:document.querySelector('[data-draft]')===window.originalDraft,pageSame:document.querySelector('[data-retained-page]')===window.originalPage,draft:document.querySelector('[data-draft]').value,scroll:document.querySelector('[data-retained-page]').scrollTop}})()`);
 try{
  for(const theme of ['light','dark'])for(const width of [320,390,600,768]){
   win.setContentSize(width,844);await win.loadURL(pathToFileURL(html).href);await wait('!!window.drawerFixture&&!!document.querySelector(".official-mobile-sidebar")');
   await run(`document.documentElement.dataset.theme='${theme}';document.body.toggleAttribute('data-ds-dark-theme',${theme==='dark'});window.originalDraft=document.querySelector('[data-draft]');window.originalPage=document.querySelector('[data-retained-page]');originalDraft.value='原草稿追加';originalPage.scrollTop=90;`);
   await pause(80);
   const data={theme,width,initial:await sample()};
   if(width<768){
    await run('window.drawerFixture.layout.actions.toggleSidebar()');await pause(70);data.entering=await sample();await pause(350);data.open=await sample();
    if(theme==='dark'&&width===390)writeFileSync(join(dirname(html),'drawer-open-dark.png'),(await win.webContents.capturePage()).toPNG());
    const dismissPoint={x:Math.min(data.open.width-4,data.open.nav.left+12),y:data.open.nav.top+data.open.nav.height/2};
    data.bottomMaskHit=await run(`document.elementFromPoint(${dismissPoint.x},${dismissPoint.y})===document.querySelector('[data-sidebar-mask]')`);
    win.webContents.debugger.attach('1.3');
    await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mousePressed',...dismissPoint,button:'left',clickCount:1});
    await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseReleased',...dismissPoint,button:'left',clickCount:1});
    win.webContents.debugger.detach();await pause(70);data.exiting=await sample();await pause(350);data.closed=await sample();
    await run('window.drawerFixture.layout.actions.toggleSidebar()');await pause(60);await run('window.drawerFixture.layout.actions.toggleSidebar()');await pause(40);await run('window.drawerFixture.layout.actions.toggleSidebar()');await pause(350);data.reversed=await sample();
    await run('document.querySelector("[data-sidebar-mask]").click()');await pause(350);
   }
   report.cases.push(data);
  }
  await win.webContents.debugger.attach('1.3');await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});win.setContentSize(390,844);await pause(50);await run('window.drawerFixture.layout.actions.toggleSidebar()');await pause(40);report.reduced=await sample();win.webContents.debugger.detach();
  report.passed=true;
 }catch(e){report.passed=false;report.failure=e.stack||String(e);}
 writeFileSync(reportPath,JSON.stringify(report,null,2));win.destroy();app.exit(report.passed?0:1);
});
