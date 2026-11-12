const { app, BrowserWindow } = require('electron');
const { writeFileSync } = require('node:fs');
const { dirname, resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
app.disableHardwareAcceleration();
app.setPath('userData',resolve(dirname(process.argv[3]),'keyboard-profile'));
app.whenReady().then(async()=>{
  const win=new BrowserWindow({show:false,width:390,height:844,webPreferences:{sandbox:true,offscreen:true,backgroundThrottling:false}});
  const report={layouts:[],screenshots:false};
  const run=code=>win.webContents.executeJavaScript(code);
  const settle=()=>new Promise(resolve=>setTimeout(resolve,120));
  const check=(value,message)=>{if(!value)throw Error(message);};
  const category=async name=>{await run(`Array.from(document.querySelectorAll('.character-editor-navigation button')).find(e=>e.textContent===${JSON.stringify(name)}).click()`);await settle();};
  try {
    for(const [width,height,theme] of [[390,844,'light'],[390,420,'light'],[320,300,'dark']]) {
      win.setContentSize(width,height);
      await win.loadURL(pathToFileURL(process.argv[2]).href+`?view=mobile-editor&mobile=1&reset=1&theme=${theme}`);
      for(let i=0;i<50&&!await run("!!document.querySelector('.preset-basic-card input')");i++)await settle();
      await run("document.querySelectorAll('.preset-basic-card input')[1].focus()");await settle();
      const data=await run(`(()=>{const main=document.querySelector('.preset-workspace-body'),scroll=document.querySelector('.preset-basic-scroll'),nav=document.querySelector('.character-editor-navigation'),r=e=>e.getBoundingClientRect().toJSON(),hidden=e=>getComputedStyle(e).scrollbarWidth==='none'&&getComputedStyle(e,'::-webkit-scrollbar').display==='none',scrolls=[...main.querySelectorAll('*')].filter(e=>e.clientHeight>0&&e.scrollHeight>e.clientHeight+1&&['auto','scroll'].includes(getComputedStyle(e).overflowY));return{width:innerWidth,height:innerHeight,main:r(main),mainPadding:getComputedStyle(main).padding,frameRadius:getComputedStyle(document.querySelector('.preset-basic-document')).borderRadius,actions:!!document.querySelector('.preset-basic-card .preset-profile-editor-actions'),navHidden:hidden(nav),formHidden:hidden(scroll),mainScrolls:scrolls.map(e=>e.className),headerBottom:document.querySelector('.mobile-header').getBoundingClientRect().bottom}})()`);
      await run("document.querySelector('.preset-basic-scroll').scrollTop=1e6;document.querySelector('.character-editor-navigation').scrollTop=24");await settle();
      data.scroll=await run("({form:document.querySelector('.preset-basic-scroll').scrollTop,nav:document.querySelector('.character-editor-navigation').scrollTop})");
      await category('工具');
      data.icons=await run("[...document.querySelectorAll('.preset-tool-row .preset-tool-icon')].map(e=>({background:getComputedStyle(e).backgroundColor,color:getComputedStyle(e).color}))");
      report.layouts.push(data);
    }
    for(const data of report.layouts){
      check(!data.actions,'Mobile metadata still renders save/cancel actions');
      check(data.navHidden&&data.formHidden,'Idle/focused native scrollbars remain visible: '+JSON.stringify(data));
      check(data.mainPadding==='0px'&&data.frameRadius==='0px'&&Math.abs(data.main.bottom-data.height)<2,'Workspace is not edge-to-edge: '+JSON.stringify(data));
      check(data.mainScrolls.length===1&&data.mainScrolls[0]==='preset-basic-scroll'&&data.scroll.form>0,'Profile needs one working page scroller: '+JSON.stringify(data));
      if(data.height<500)check(data.scroll.nav>0,'Short-window rail no longer scrolls');
      check(data.icons.length>0&&data.icons.every(icon=>icon.background==='rgba(0, 0, 0, 0)'),'Tool icon backgrounds remain: '+JSON.stringify(data.icons));
    }
    report.passed=true;
  }catch(error){report.passed=false;report.failure=error.stack||String(error);}
  writeFileSync(process.argv[3],JSON.stringify(report,null,2));win.destroy();app.exit(report.passed?0:1);
});
