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
    const widthDrags = [];
    win.webContents.debugger.attach('1.3');
    const widthState = side => run(`(()=>{const body=document.querySelector('[data-conversation-content]'),handle=body.querySelector('[data-width-handle="${side}"]'),r=handle.getBoundingClientRect(),y=r.top+Math.min(160,r.height/2),x=r.left+r.width/2;return {x,y,hit:document.elementFromPoint(x,y)?.closest('[data-width-handle]')===handle,width:getComputedStyle(body).getPropertyValue('--dsh-chat-content-width'),stored:localStorage.getItem('dsh.conversation.contentWidth'),backdrop:parseFloat(getComputedStyle(body,'::before').width)}})()`);
    for (const theme of ['light', 'dark']) for (const backdrop of [false, true]) {
      await run(`document.documentElement.dataset.theme='${theme}';document.body.toggleAttribute('data-ds-dark-theme',${theme === 'dark'})`);
      await style({ backdrop_enabled: backdrop });
      for (const side of ['left', 'right']) {
        const before = await widthState(side), x = Math.round(before.x), y = Math.round(before.y), dx = -40;
        await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});
        await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',buttons:1,clickCount:1});
        await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseMoved',x:x+dx,y,button:'left',buttons:1});await settle();
        await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseReleased',x:x+dx,y,button:'left',buttons:0,clickCount:1});await settle();
        widthDrags.push({ theme, backdrop, side, before, after: await widthState(side) });
      }
    }
    win.webContents.debugger.detach();
    await run(`localStorage.removeItem('dsh.conversation.contentWidth')`);
    win.setContentSize(1441,900);await settle();win.setContentSize(1440,900);await settle();
    await style({backdrop_enabled:true});
    const layouts = [];
    for (const theme of ['light', 'dark']) for (const [width,mobile] of [[1440,false],[900,false],[780,false],[768,true],[600,true],[599,true],[390,true],[320,true]]) {
      win.setContentSize(width, 900);
      await run(`document.documentElement.dataset.theme='${theme}';document.body.toggleAttribute('data-ds-dark-theme',${theme === 'dark'})`);
      await run(`roleplayStyleFixture.setMobileChat(${mobile})`);
      await settle();
      for (const bubbles of [false, true]) {
        await style({ bubbles_enabled: bubbles });
        await run('document.querySelector(".message-area").scrollTop=0'); await settle();
        layouts.push(await run(`(()=>{
          const panel=document.querySelector('.chat-panel'), body=panel.querySelector('[data-conversation-content]'), area=panel.querySelector('.message-area');
          const base=getComputedStyle(body,'::before'),bodyBox=body.getBoundingClientRect(),baseLeft=bodyBox.left+(bodyBox.width-parseFloat(base.width))/2,baseRight=baseLeft+parseFloat(base.width);
          const rows=[...panel.querySelectorAll('.message-roleplay')].map(row=>{
            const avatar=row.querySelector(':scope>.avatar').getBoundingClientRect(),floor=row.querySelector('.message-floor').getBoundingClientRect(),box=row.getBoundingClientRect(),content=row.querySelector('.message-content').getBoundingClientRect();
            return {avatarTopInset:avatar.top-box.top,floorInside:floor.bottom<=box.bottom,portrait:avatar.height>avatar.width,aligned:content.left>=avatar.right,insideBackdrop:box.left>=baseLeft&&box.right<=baseRight,overflow:row.scrollWidth>row.clientWidth+1,
              bubble:getComputedStyle(row,'::before').content,fill:getComputedStyle(row,'::before').backgroundColor};
          });
          area.scrollTop=area.scrollHeight;
          return {theme:'${theme}',width:innerWidth,mobile:${mobile},panelWidth:panel.clientWidth,backdropSideInset:(bodyBox.width-parseFloat(base.width))/2,bubbles:${bubbles},rows,firstMessageTopGap:panel.querySelector('.message-roleplay').getBoundingClientRect().top-area.getBoundingClientRect().top+area.scrollTop,
            firstMessagePaddingTop:getComputedStyle(panel.querySelector('.message-roleplay')).paddingTop,base:{top:base.top,bottom:base.bottom,radius:base.borderRadius,border:base.borderWidth,blur:base.backdropFilter,fill:base.backgroundColor},
            headerFill:getComputedStyle(panel.querySelector('.chat-header')).backgroundColor,headerBottom:panel.querySelector('.chat-header').getBoundingClientRect().bottom,wallpaperTop:document.querySelector('.chat-shell-backdrop').getBoundingClientRect().top,gradient:getComputedStyle(panel.querySelector('.chat-composer-region')).backgroundImage,
            gaps:[...panel.querySelectorAll('.message-roleplay')].slice(1).map((row,index)=>row.getBoundingClientRect().top-panel.querySelectorAll('.message-roleplay')[index].getBoundingClientRect().bottom),
            bodyBottom:body.getBoundingClientRect().bottom,panelBottom:panel.getBoundingClientRect().bottom,overflow:document.documentElement.scrollWidth>innerWidth,
            scrollable:area.scrollHeight>area.clientHeight,atTail:Math.abs(area.scrollTop+area.clientHeight-area.scrollHeight)<2,composers:panel.querySelectorAll('textarea').length};
        })()`));
        if (bubbles && width === 1440) { await run('document.querySelector(".message-area").scrollTop=0'); await settle(); await capture(`chat-${theme}`); }
        if (bubbles && width === 320) { await run('document.querySelector(".message-area").scrollTop=0'); await settle(); await capture(`chat-mobile-${theme}`); }
        if (bubbles && width === 768) { await run('document.querySelector(".message-area").scrollTop=0'); await settle(); await capture(`chat-tablet-${theme}`); }
      }
    }
    const plainBubbleContrast = [];
    await run(`window.originalStyleWallpaper=roleplayStyleFixture.wallpaper;roleplayStyleFixture.setWallpaper({image:''})`);
    for (const theme of ['light', 'dark']) for (const [width, mobile] of [[1440, false], [390, true]]) for (const backdrop of [false, true]) {
      win.setContentSize(width, 900);
      await run(`document.documentElement.dataset.theme='${theme}';document.body.toggleAttribute('data-ds-dark-theme',${theme === 'dark'});roleplayStyleFixture.setMobileChat(${mobile})`);
      await style({ bubbles_enabled: true, backdrop_enabled: backdrop });
      await run('document.querySelector(".message-area").scrollTop=0'); await settle();
      const points = await run(`(()=>{const row=document.querySelector('.message-roleplay'),r=row.getBoundingClientRect(),next=document.querySelectorAll('.message-roleplay')[1].getBoundingClientRect();return {bubble:{x:r.right-2,y:r.top+r.height/2},gap:{x:r.right-2,y:(r.bottom+next.top)/2}}})()`);
      const pixels = {};
      for (const [name, point] of Object.entries(points)) {
        const bytes = (await win.webContents.capturePage({ x: Math.round(point.x), y: Math.round(point.y), width: 1, height: 1 })).toBitmap();
        pixels[name] = [bytes[2], bytes[1], bytes[0]];
      }
      plainBubbleContrast.push({ theme, width, mobile, backdrop, ...pixels });
      if (mobile && !backdrop) await capture(`chat-plain-mobile-${theme}`);
    }
    await run(`roleplayStyleFixture.setWallpaper(originalStyleWallpaper)`); await style({ backdrop_enabled: true });
    const tintInputs = [];
    await run(`roleplayStyleFixture.setView('settings')`); await settle();
    for (const theme of ['light','dark']) {
      await run(`document.documentElement.dataset.theme='${theme}';document.body.toggleAttribute('data-ds-dark-theme',${theme==='dark'})`); await settle();
      tintInputs.push(await run(`(()=>{const css=getComputedStyle(document.body),context=document.createElement('canvas').getContext('2d'),hex=token=>{context.fillStyle=css.getPropertyValue(token);return context.fillStyle};return {theme:'${theme}',backdrop:document.querySelector('[aria-label="底板色调"]').value,user:document.querySelector('[aria-label="用户气泡色调"]').value,assistant:document.querySelector('[aria-label="AI 气泡色调"]').value,officialBackdrop:hex('--dsw-alias-bg-module-platform'),officialBubble:hex('${theme === 'light' ? '--dsw-static-neutral-50' : '--dsw-alias-bg-layer-1'}')}})()`));
    }
    await run(`roleplayStyleFixture.setView('chat')`); await settle();
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
        const body=document.querySelector('[data-conversation-content]'),box=body.getBoundingClientRect(),base=getComputedStyle(body,'::before'),row=document.querySelector('.message-roleplay').getBoundingClientRect(),refBox=ref.querySelector('.design-reading-deck').getBoundingClientRect();
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
    const disabled = await run(`({content:getComputedStyle(document.querySelector('[data-conversation-content]'),'::before').content,prefs:roleplayStyleFixture.preferences.roleplay_style})`);
    await style({ backdrop_enabled: true, bubbles_enabled: true });
    const restored = await run('structuredClone(roleplayStyleFixture.preferences.roleplay_style)');
    await run(`roleplayStyleFixture.updateProfile({turn_spacing:24})`); await settle();
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
    writeFileSync(report, JSON.stringify({ initial, widthDrags, layouts, plainBubbleContrast, tintInputs, materials, authoredWallpaper, custom, customGap, gallery, agent, disabled, restored, settings, mobile, errors }, null, 2));
    win.destroy(); app.quit();
  } catch (error) { console.error(error); win.destroy(); app.exit(1); }
});
