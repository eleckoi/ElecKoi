const { app, BrowserWindow } = require('electron');
const { writeFileSync } = require('node:fs');
const { dirname, join } = require('node:path');
const { pathToFileURL } = require('node:url');
const [htmlPath, reportPath] = process.argv.slice(2);
process.on('uncaughtException', error => {console.error(error);app.exit(1)});
app.setPath('userData', dirname(htmlPath));
app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const win = new BrowserWindow({show:false,titleBarStyle:'hidden',titleBarOverlay:{height:40},webPreferences:{backgroundThrottling:false,sandbox:true,offscreen:true}});
  const reports = [];
  try {
    for (const theme of ['light', 'dark']) for (const width of [1440, 900, 700]) {
      const rightbar = width === 900;
      const query = `?theme=${theme}${rightbar ? '&rightbar' : ''}`;
      win.setContentSize(width, 640);
      await new Promise(resolve => setTimeout(resolve, 120));
      await win.loadURL(pathToFileURL(htmlPath).href + query);
      let ready = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        ready = await win.webContents.executeJavaScript('Boolean(document.querySelector(".side-panel-brand .eleckoi-wordmark")) && Boolean(document.querySelector("[data-windows-menu]")?.shadowRoot.querySelector("button")) && Math.abs(innerWidth - ' + width + ') <= 1');
        if (ready) break;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      if (!ready) {
        const state = await win.webContents.executeJavaScript('JSON.stringify({width:innerWidth,html:document.body.innerHTML.slice(0,1000)})');
        throw new Error('Caption fixture did not render at width ' + width + ': ' + state);
      }
      await win.webContents.executeJavaScript('document.fonts.ready');
      await win.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
      reports.push(await win.webContents.executeJavaScript(`(() => {
        const shell=document.querySelector('.main-window-shell').getBoundingClientRect();
        const rect=selector=>document.querySelector(selector).getBoundingClientRect();
        const center=box=>box.top+box.height/2-shell.top;
        const mark=rect('.rail-brand-seat');
        const navCenters=Array.from(document.querySelectorAll('.rail-nav-group .rail-nav-button'),node=>center(node.getBoundingClientRect()));
        const brand=rect('.side-panel-brand');
        const toggle=rect('.side-panel-collapse-button');
        const menu=document.querySelector('[data-windows-menu]').shadowRoot.querySelector('button').getBoundingClientRect();
        const list=rect('.side-panel-content');
        const wordmark=rect('.side-panel-brand .eleckoi-wordmark');
        const search=rect('.sidebar-section-controls');
        const windowCenters=Array.from(document.querySelectorAll('.window-control-button span'), node=>center(node.getBoundingClientRect()));
        const header=rect('.client-titlebar');
        const main=rect('.main-panel-content');
        const rightbar=rect('.dsh-rightbar-column');
        const resize=rect('.rightbar-resizer');
        const strip=getComputedStyle(document.querySelector('.dsh-rightbar-column'),'::before');
        window.captionMenuHost=document.querySelector('[data-windows-menu]');
        return {viewport:innerWidth,theme:${JSON.stringify(theme)},rightbar:${rightbar},
          markCenter:center(mark),toggleCenter:center(toggle),menuCenter:center(menu),windowCenters,
          nativeControls:document.documentElement.hasAttribute('data-native-window-controls'),
          navCenters,navStep:Number.parseFloat(getComputedStyle(document.querySelector('.qq-rail')).getPropertyValue('--rail-item-size'))
            + Number.parseFloat(getComputedStyle(document.querySelector('.qq-rail')).getPropertyValue('--rail-item-gap')),
          brandTop:brand.top,brandBottom:brand.bottom,listTop:list.top,menuLeft:menu.left,toggleRight:toggle.right,
          searchGap:search.top-wordmark.bottom,
          menuCount:document.querySelectorAll('[data-windows-menu]').length,extraBrandImages:document.querySelectorAll('.side-panel-shell img').length,
          markTop:mark.top-shell.top,markLeft:mark.left-shell.left,captionHeight:header.height,
          mainTop:main.top-shell.top,rightbarTop:rightbar.top-shell.top,resizeTop:resize.top-shell.top,
          stripTop:Number.parseFloat(strip.top),stripHeight:Number.parseFloat(strip.height)};
      })()`));
      if (process.env.ELECKOI_CAPTION_SCREENSHOT) {
        await new Promise(resolve => setTimeout(resolve, 180));
        const image = await win.webContents.capturePage({x:0,y:0,width,height:600});
        writeFileSync(join(process.env.ELECKOI_CAPTION_SCREENSHOT, `${theme}-${width}.png`), image.toPNG());
      }
      if (width === 900) {
        const transitions = [];
        const targets = ['character','presets','plugins','creatorStudio','community','model','settings','more'];
        for (const target of targets) {
          const selector = target === 'settings' ? '.rail-settings-trigger' : target === 'more'
            ? '[data-plugin-entry-more="sidebar"]' : '[data-navigation-id="' + target + '"]';
          await win.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(selector)}).click()`);
          await win.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
          const mid = await win.webContents.executeJavaScript(`(() => {
            const button=document.querySelector(${JSON.stringify(selector)}), layer=button.querySelector('.active-fill');
            return {opacity:Number(getComputedStyle(layer).opacity),durations:layer.getAnimations().map(animation=>animation.effect.getTiming().duration)};
          })()`);
          await new Promise(resolve => setTimeout(resolve, 180));
          const end = await win.webContents.executeJavaScript(`(() => {
            const button=document.querySelector(${JSON.stringify(selector)}), layer=button.querySelector('.active-fill');
            return {active:button.classList.contains('active'),opacity:Number(getComputedStyle(layer).opacity),baseOpacity:Number(getComputedStyle(button.querySelector('.base')).opacity),
              fills:[...layer.querySelectorAll('path,circle,rect')].filter(shape=>getComputedStyle(shape).fill!=='none').length,
              mask:getComputedStyle(layer.querySelector('svg')).maskImage};
          })()`);
          transitions.push({target,mid,end});
        }
        await win.webContents.executeJavaScript(`document.querySelector('[role="menu"] button').click()`);
        await win.webContents.executeJavaScript(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
        await win.webContents.executeJavaScript(`Promise.all(document.querySelector('[data-plugin-entry-more="sidebar"] .active-fill').getAnimations().map(animation=>animation.finished.catch(()=>{})))`);
        reports.at(-1).moreClosed = await win.webContents.executeJavaScript(`document.querySelector('[data-plugin-entry-more="sidebar"]').getAttribute('aria-expanded')==='false'
          && getComputedStyle(document.querySelector('[data-plugin-entry-more="sidebar"] .active-fill')).opacity==='0'`);
        reports.at(-1).transitions = transitions;
        if (process.env.ELECKOI_CAPTION_SCREENSHOT) {
          await win.webContents.executeJavaScript(`document.querySelectorAll('.rail-nav-button,.rail-settings-trigger').forEach(button=>button.classList.add('active'))`);
          await new Promise(resolve => setTimeout(resolve, 180));
          writeFileSync(join(process.env.ELECKOI_CAPTION_SCREENSHOT, `${theme}-filled.png`), (await win.webContents.capturePage({x:0,y:0,width,height:640})).toPNG());
        }
      }
      await win.webContents.executeJavaScript(`document.querySelector('.side-panel-collapse-button').click()`);
      await win.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
      const folded = await win.webContents.executeJavaScript(`(() => {
        const panel=document.querySelector('.side-panel-shell'), toggle=document.querySelector('.side-panel-expand-button');
        const menu=document.querySelector('[data-windows-menu]');
        return { width:panel.getBoundingClientRect().width,inert:panel.inert,toggleRight:toggle.getBoundingClientRect().right,
          menuLeft:menu.getBoundingClientRect().left,sameHost:menu === window.captionMenuHost,count:document.querySelectorAll('[data-windows-menu]').length };
      })()`);
      await win.webContents.executeJavaScript(`document.querySelector('.side-panel-expand-button').click()`);
      await win.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
      reports.at(-1).folded = folded;
      reports.at(-1).roundtrip = folded.width === 0 && folded.inert && folded.toggleRight <= folded.menuLeft && folded.sameHost && folded.count === 1 && await win.webContents.executeJavaScript(`document.querySelector('.side-panel-shell').getBoundingClientRect().width === 328
        && document.querySelector('.side-panel-header [data-windows-menu]') === window.captionMenuHost
        && !document.querySelector('.side-panel-shell').inert`);
      reports.at(-1).settings = await win.webContents.executeJavaScript(`(() => {
        document.querySelector('.main-window-shell').classList.add('section-settings');
        return {brandHidden:getComputedStyle(document.querySelector('.side-panel-brand')).display === 'none',
          listTop:document.querySelector('.side-panel-content').getBoundingClientRect().top,
          menuCount:document.querySelectorAll('[data-windows-menu]').length};
      })()`);
    }
    writeFileSync(reportPath, JSON.stringify(reports, null, 2));
    win.destroy();app.exit(0);
  } catch (error) {console.error(error);win.destroy();app.exit(1)}
});
