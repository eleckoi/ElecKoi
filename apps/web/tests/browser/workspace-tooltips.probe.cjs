const { app, BrowserWindow } = require('electron');
const { writeFileSync } = require('node:fs');
const { dirname, join } = require('node:path');
const { pathToFileURL } = require('node:url');
const [html, report, screenshots] = process.argv.slice(2);
app.setPath('userData', dirname(html)); app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({show:false,webPreferences:{sandbox:true,offscreen:true,backgroundThrottling:false}});
  const run = source => win.webContents.executeJavaScript(source);
  const pause = ms => new Promise(resolve => setTimeout(resolve,ms));
  const rows=[], errors=[];
  win.webContents.on('console-message', event => { if(event.level==='error') errors.push(event.message); });
  try {
    for(const width of [1440,900,700]) for(const dark of [false,true]) {
      win.setContentSize(width,720); await win.loadURL(pathToFileURL(html).href);
      for(let n=0;n<60&&!await run('Boolean(document.querySelector("[aria-label=视图选项]"))');n++) await pause(30);
      await run(`document.documentElement.dataset.theme=${JSON.stringify(dark?'dark':'light')};document.body.toggleAttribute('data-ds-dark-theme',${dark})`);
      await pause(60);
      const point=await run(`(() => {const r=document.querySelector('[aria-label=视图选项]').getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()`);
      win.webContents.sendInputEvent({type:'mouseMove',...point}); await pause(700);
      const before=await run(`(() => {
        const tip=document.querySelector('[role=tooltip]'),r=tip?.getBoundingClientRect();
        const button=document.querySelector('[aria-label=视图选项]').getBoundingClientRect(),panel=document.querySelector('.native-workspace-sidebar').getBoundingClientRect();
        const toggle=document.querySelector('.native-workspace-body [data-window-drag] >button:last-of-type').getBoundingClientRect();
        const pointer=tip?.style.pointerEvents;if(tip)tip.style.pointerEvents='auto';
        const rightHit=!!r&&document.elementFromPoint(r.right-2,r.top+r.height/2)?.closest('[role=tooltip]')===tip;
        if(tip)tip.style.pointerEvents=pointer;
        return {tip:r?.toJSON(),button:button.toJSON(),panel:panel.toJSON(),toggle:toggle.toJSON(),visible:!!tip&&getComputedStyle(tip).visibility==='visible',
          rightHit};
      })()`);
      const clippedBefore=await run(`(() => {
        const panel=document.querySelector('.native-workspace-sidebar'),body=document.querySelector('.native-workspace-body'),tip=document.querySelector('[role=tooltip]');
        panel.style.contain='layout paint';panel.style.overflow='hidden';body.style.overflow='hidden';tip.style.pointerEvents='auto';
        const r=tip.getBoundingClientRect(),hit=document.elementFromPoint(r.right-2,r.top+r.height/2)?.closest('[role=tooltip]')===tip;
        panel.style.contain='';panel.style.overflow='';body.style.overflow='';tip.style.pointerEvents='';return !hit;
      })()`);
      if(screenshots&&width===900) writeFileSync(join(screenshots,`workspace-tooltip-${dark?'dark':'light'}.png`),(await win.webContents.capturePage()).toPNG());
      await run('document.querySelector(".native-workspace-body [data-window-drag] >button:last-of-type").click()'); await pause(240);
      const collapsed=await run(`({open:!!document.querySelector('[aria-label=展开侧边栏]'),panelWidth:document.querySelector('.native-workspace-sidebar').getBoundingClientRect().width})`);
      await run('document.querySelector("[aria-label=展开侧边栏]").click()'); await pause(240);
      const restored=await run('document.querySelector(".native-workspace-sidebar").getBoundingClientRect().width');
      rows.push({width,dark,before,clippedBefore,collapsed,restored});
    }
    writeFileSync(report,JSON.stringify({rows,errors})); win.destroy();app.exit(0);
  }catch(error){console.error(error,errors);win.destroy();app.exit(1);}
});
