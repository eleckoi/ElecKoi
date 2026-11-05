const { app, BrowserWindow } = require('electron');
const { writeFileSync, mkdirSync, readFileSync } = require('node:fs');
const { join, dirname } = require('node:path');
const [html, report, screenshots] = process.argv.slice(2);
app.setPath('userData', join(dirname(html), 'profile'));
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1440, height: 900, webPreferences: { sandbox: true, backgroundThrottling: false } });
  const run = async source => {
    const result = await win.webContents.executeJavaScript(`(async()=>{try{return {value:await (0,eval)(${JSON.stringify(source)})}}catch(error){return {failure:error.stack}}})()`);
    if (result.failure) throw Error(`${result.failure}\nDuring: ${source.slice(0, 300)}`);
    return result.value;
  };
  const settle = async () => { await run('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))'); await win.webContents.capturePage(); };
  const change = async patch => { await run(`roleplayStyleFixture.update({...roleplayStyleFixture.preferences,...${JSON.stringify(patch)}})`); await settle(); };
  const style = async patch => { await run(`roleplayStyleFixture.update({...roleplayStyleFixture.preferences,roleplay_style:{...roleplayStyleFixture.preferences.roleplay_style,...${JSON.stringify(patch)}}})`); await settle(); };
  const capture = async name => { if (!screenshots) return; mkdirSync(screenshots, { recursive: true }); writeFileSync(join(screenshots, `${name}.png`), (await win.webContents.capturePage()).toPNG()); };
  try {
    const errors = [];
    win.webContents.on('console-message', event => { if (event.level === 'error') errors.push(event.message); });
    await win.loadFile(html);
    for (let index = 0; index < 100 && !await run('!!document.querySelector(".chat-panel")'); index++) await new Promise(r => setTimeout(r, 50));
    if (!await run('!!document.querySelector(".chat-panel")')) throw Error(JSON.stringify({ errors, body: await run('document.body.innerText') }));
    const initial=await run(`({backdrop:document.querySelector('.chat-panel').hasAttribute('data-roleplay-backdrop'),bubbles:document.querySelector('.chat-panel').hasAttribute('data-roleplay-bubbles')})`);
    await style({backdrop_enabled:true});
    const layouts = [];
    for (const theme of ['light', 'dark']) for (const width of [1440, 900, 390, 320]) {
      win.setContentSize(width, 900);
      await run(`document.documentElement.dataset.theme='${theme}';document.body.toggleAttribute('data-ds-dark-theme',${theme === 'dark'})`);
      await run(`roleplayStyleFixture.setMobileChat(${width < 600})`);
      await settle();
      for (const bubbles of [false, true]) {
        await style({ bubbles_enabled: bubbles });
        layouts.push(await run(`(()=>{
          const panel=document.querySelector('.chat-panel'), body=panel.querySelector('.chat-conversation-body'), area=panel.querySelector('.message-area');
          const base=getComputedStyle(body,'::before'),bodyBox=body.getBoundingClientRect(),baseLeft=bodyBox.left+(bodyBox.width-parseFloat(base.width))/2,baseRight=baseLeft+parseFloat(base.width);
          const rows=[...panel.querySelectorAll('.message-roleplay')].map(row=>{
            const avatar=row.querySelector(':scope>.avatar').getBoundingClientRect(),floor=row.querySelector('.message-floor').getBoundingClientRect(),box=row.getBoundingClientRect(),content=row.querySelector('.message-content').getBoundingClientRect();
            return {floorInside:floor.bottom<=box.bottom,portrait:avatar.height>avatar.width,aligned:content.left>=avatar.right,insideBackdrop:box.left>=baseLeft&&box.right<=baseRight,overflow:row.scrollWidth>row.clientWidth+1,
              bubble:getComputedStyle(row,'::before').content,fill:getComputedStyle(row,'::before').backgroundColor};
          });
          area.scrollTop=area.scrollHeight;
          return {theme:'${theme}',width:innerWidth,bubbles:${bubbles},rows,base:{top:base.top,bottom:base.bottom,radius:base.borderRadius,border:base.borderWidth,blur:base.backdropFilter,fill:base.backgroundColor},
            headerFill:getComputedStyle(panel.querySelector('.chat-header')).backgroundColor,headerBottom:panel.querySelector('.chat-header').getBoundingClientRect().bottom,wallpaperTop:document.querySelector('.chat-shell-backdrop').getBoundingClientRect().top,gradient:getComputedStyle(panel.querySelector('.chat-composer-region')).backgroundImage,
            gaps:[...panel.querySelectorAll('.message-roleplay')].slice(1).map((row,index)=>row.getBoundingClientRect().top-panel.querySelectorAll('.message-roleplay')[index].getBoundingClientRect().bottom),
            bodyBottom:body.getBoundingClientRect().bottom,panelBottom:panel.getBoundingClientRect().bottom,overflow:document.documentElement.scrollWidth>innerWidth,
            scrollable:area.scrollHeight>area.clientHeight,atTail:Math.abs(area.scrollTop+area.clientHeight-area.scrollHeight)<2,composers:panel.querySelectorAll('textarea').length};
        })()`));
        if (bubbles && width === 1440) { await run('document.querySelector(".message-area").scrollTop=0'); await settle(); await capture(`chat-${theme}`); }
        if (bubbles && width === 320) { await run('document.querySelector(".message-area").scrollTop=0'); await settle(); await capture(`chat-mobile-${theme}`); }
      }
    }
    // Compare painted pixels against the approved CSS with identical source art.
    // This catches stacked wallpaper washes that computed deck colors alone miss.
    win.setContentSize(1760, 1090);
    await run('roleplayStyleFixture.setMobileChat(false)'); await settle();
    const approvedCss = readFileSync(join(__dirname, 'fixtures/roleplay-material.css'), 'utf8');
    const materials = [];
    const pixel = async point => {
      const bytes = (await win.webContents.capturePage({ x: Math.round(point.x), y: Math.round(point.y), width: 1, height: 1 })).toBitmap();
      return [bytes[2], bytes[1], bytes[0]];
    };
    for (const theme of ['light', 'dark']) {
      await run(`document.documentElement.dataset.theme='${theme}';document.body.toggleAttribute('data-ds-dark-theme',${theme === 'dark'});document.querySelector('.message-area').scrollTop=0`);
      await settle();
      const points = await run(`(()=>{
        const sheet=document.createElement('style');sheet.id='approved-material-css';sheet.textContent=${JSON.stringify(approvedCss)};document.head.append(sheet);
        const ref=document.createElement('div');ref.className='design-app';ref.dataset.fit='flush';ref.dataset.bubbles='true';ref.id='approved-material';ref.style.cssText='position:fixed;right:0;bottom:0;width:480px;height:360px!important;z-index:1000';
        ref.innerHTML='<div class="design-scene" style="height:100%;background:#283c50"><div class="design-scene-tint"></div><section class="design-reading-deck"><div class="message-roleplay" style="position:absolute;top:70px;left:20px;right:20px;height:150px"></div></section></div>';document.body.append(ref);
        const body=document.querySelector('.chat-conversation-body'),box=body.getBoundingClientRect(),base=getComputedStyle(body,'::before'),row=document.querySelector('.message-roleplay').getBoundingClientRect(),refBox=ref.querySelector('.design-reading-deck').getBoundingClientRect();
        return {actualBase:{x:box.x+(box.width-parseFloat(base.width))/2+10,y:row.top+60},actualBubble:{x:row.right-40,y:row.top+60},referenceBase:{x:refBox.x+refBox.width/2,y:refBox.top+290},referenceBubble:{x:refBox.x+refBox.width/2,y:refBox.top+140}};
      })()`);
      await settle();
      materials.push({theme, actualBase:await pixel(points.actualBase), actualBubble:await pixel(points.actualBubble), referenceBase:await pixel(points.referenceBase), referenceBubble:await pixel(points.referenceBubble)});
      await run(`document.querySelector('#approved-material').remove();document.querySelector('#approved-material-css').remove()`);
    }
    await run(`roleplayStyleFixture.setWallpaper({...roleplayStyleFixture.wallpaper,opacity:.42,blur:7,scrim:.3})`); await settle();
    const authoredWallpaper=await run(`({opacity:getComputedStyle(document.querySelector('.chat-shell-backdrop img')).opacity,blur:getComputedStyle(document.querySelector('.chat-shell-backdrop img')).filter,wash:getComputedStyle(document.querySelector('.chat-shell-backdrop>i')).backgroundColor})`);
    await style({ user_bubble_tint: '#987654', user_bubble_opacity: 35, assistant_bubble_tint: '#123456', assistant_bubble_opacity: 65, backdrop_blur: 40, bubble_blur: 8 });
    const custom = await run(`({prefs:roleplayStyleFixture.preferences.roleplay_style,user:getComputedStyle(document.querySelector('.message.mine'),'::before').backgroundColor,ai:getComputedStyle(document.querySelector('.message.theirs'),'::before').backgroundColor,blur:getComputedStyle(document.querySelector('.message.mine'),'::before').backdropFilter})`);
    await run('roleplayStyleFixture.selectView("gallery")'); await settle();
    const gallery = await run(`document.querySelector('.chat-panel').hasAttribute('data-roleplay-backdrop')`);
    await run('roleplayStyleFixture.selectView("chat")'); await change({ layout: 'agent' });
    const agent = await run(`({backdrop:document.querySelector('.chat-panel').hasAttribute('data-roleplay-backdrop'),bubbles:document.querySelector('.chat-panel').hasAttribute('data-roleplay-bubbles'),tint:document.querySelector('.chat-panel').style.getPropertyValue('--rp-user-tint')})`);
    await change({ layout: 'roleplay' }); await style({ backdrop_enabled: false, bubbles_enabled: false });
    const disabled = await run(`({content:getComputedStyle(document.querySelector('.chat-conversation-body'),'::before').content,prefs:roleplayStyleFixture.preferences.roleplay_style})`);
    await style({ backdrop_enabled: true, bubbles_enabled: true });
    const restored = await run('structuredClone(roleplayStyleFixture.preferences.roleplay_style)');
    await run(`roleplayStyleFixture.update({...roleplayStyleFixture.preferences,profiles:{...roleplayStyleFixture.preferences.profiles,roleplay:{...roleplayStyleFixture.preferences.profiles.roleplay,turn_spacing:24}}})`); await settle();
    const customGap=await run(`(()=>{const rows=document.querySelectorAll('.message-roleplay');return rows[1].getBoundingClientRect().top-rows[0].getBoundingClientRect().bottom})()`);
    await run(`roleplayStyleFixture.setView('settings')`); await settle();
    const settings = [];
    for (const theme of ['light', 'dark']) for (const width of [1440, 900, 390, 320]) {
      win.setContentSize(width, 900);
      await run(`document.documentElement.dataset.theme='${theme}';document.body.toggleAttribute('data-ds-dark-theme',${theme === 'dark'});document.querySelector('[data-group="layout-style"]').open=true`); await settle();
      settings.push(await run(`({theme:'${theme}',width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,rows:[...document.querySelectorAll('[data-group="layout-style"] .ec-field,[data-group="layout-style"] .ec-style-tint-row')].filter(n=>n.scrollWidth>n.clientWidth+1).map(n=>n.textContent)})`));
      if (width === 1440) await capture(`settings-${theme}`);
    }
    await run(`roleplayStyleFixture.setView('mobile')`); await settle();
    const mobile = [];
    for (const theme of ['light', 'dark']) for (const width of [600, 390, 320]) {
      win.setContentSize(width, 900);
      await run(`document.documentElement.dataset.theme='${theme}';document.body.toggleAttribute('data-ds-dark-theme',${theme === 'dark'})`); await settle();
      mobile.push(await run(`({theme:'${theme}',width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,rows:[...document.querySelectorAll('.ec-field,.ec-style-tint-row')].filter(n=>n.scrollWidth>n.clientWidth+1).map(n=>n.textContent)})`));
      if (width === 320) await capture(`mobile-${theme}`);
    }
    writeFileSync(report, JSON.stringify({ initial, layouts, materials, authoredWallpaper, custom, customGap, gallery, agent, disabled, restored, settings, mobile, errors }, null, 2));
    win.destroy(); app.quit();
  } catch (error) { console.error(error); win.destroy(); app.exit(1); }
});
