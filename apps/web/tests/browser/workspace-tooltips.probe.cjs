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
  let pinning, placement;
  win.webContents.on('console-message', event => { if(event.level==='error') errors.push(event.message); });
  try {
    for(const width of [1440,900,700]) for(const dark of [false,true]) {
      win.setContentSize(width,720); await win.loadURL(pathToFileURL(html).href);
      for(let n=0;n<60&&!await run('Boolean(document.querySelector("[aria-label=视图选项]"))');n++) await pause(30);
      await run(`document.documentElement.dataset.theme=${JSON.stringify(dark?'dark':'light')};document.body.toggleAttribute('data-ds-dark-theme',${dark})`);
      await pause(60);
      const point=await run(`(() => {const r=document.querySelector('[aria-label=视图选项]').getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()`);
      win.webContents.sendInputEvent({type:'mouseMove',...point}); await pause(700);
      for(let n=0;n<20&&!await run('Boolean(document.querySelector("[role=tooltip]"))');n++) await pause(30);
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
      if (width === 900 && !dark) {
        const unpin = 'button[aria-label="从侧边栏取消固定合成插件"]';
        const fixed = 'button[aria-label="从侧边栏取消固定自动化任务"]';
        const before = await run(`({fixedButton: !!document.querySelector(${JSON.stringify(fixed)}), nativeMore: !!document.querySelector('.native-workspace-sidebar button[aria-label="更多"]')})`);
        await run(`document.querySelector(${JSON.stringify(unpin)}).click()`);
        await pause(50);
        const hidden = await run(`!document.querySelector(${JSON.stringify(unpin)})`);
        const more = '.native-workspace-sidebar button[aria-label="更多"]';
        const focused = await run(`document.activeElement === document.querySelector(${JSON.stringify(more)})`);
        await run(`document.querySelector(${JSON.stringify(more)}).click()`);
        const menuRow = `Array.from(document.querySelectorAll('[role=menuitem]')).find(row => row.textContent.trim() === '固定合成插件')`;
        for (let n=0;n<20&&!await run(`Boolean(${menuRow})`);n++) await pause(30);
        await run(`(${menuRow}).click()`);
        await pause(50);
        const visible = await run(`!!document.querySelector(${JSON.stringify(unpin)})`);
        pinning = { ...before, hidden, focused, visible };
        placement = await run(`(() => {
          const rail = document.querySelector('.qq-rail').getBoundingClientRect();
          const railButton = document.querySelector('[data-navigation-id=presets]');
          const box = railButton.getBoundingClientRect();
          const footer = document.querySelector('[data-synthetic-footer]');
          const footerArea = footer.parentElement;
          return {
            railWidth: rail.width,
            railButtonVisible: railButton.contains(document.elementFromPoint(box.x+box.width/2, box.y+box.height/2)),
            workspaceEntries: [...document.querySelectorAll('.native-workspace-sidebar nav button')].map(button => button.textContent.trim()).filter(Boolean),
            footerCount: document.querySelectorAll('[data-synthetic-footer]').length,
            wide: footer.dataset.wide,
            footerScrollable: footerArea.scrollHeight > footerArea.clientHeight && getComputedStyle(footerArea).overflowY === 'auto',
          };
        })()`);
        await run('document.querySelector("[data-navigation-id=presets]").click()'); await pause(50);
        placement.productPage = await run(`({
          showList: !!document.querySelector('.official-product-sidebar-target'),
          showMore: !!document.querySelector('button[aria-label="更多"]'),
          footerCount: document.querySelectorAll('[data-synthetic-footer]').length
        })`);
        await run('document.querySelector(".qq-rail [data-navigation-id=plugins]").click()'); await pause(50);
        placement.pluginPage = await run(`({
          active: document.querySelector('.qq-rail [data-navigation-id=plugins]').getAttribute('aria-current') === 'page',
          showList: !!document.querySelector('.official-product-sidebar-target'),
          footerCount: document.querySelectorAll('[data-synthetic-footer]').length
        })`);
      }
    }
    writeFileSync(report,JSON.stringify({rows,errors,pinning,placement})); win.destroy();app.exit(0);
  }catch(error){console.error(error,errors);win.destroy();app.exit(1);}
});
