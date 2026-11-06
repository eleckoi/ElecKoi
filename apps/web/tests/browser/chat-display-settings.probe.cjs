const { app, BrowserWindow, nativeImage } = require('electron');
const { writeFileSync, mkdirSync } = require('node:fs');
const { join, dirname } = require('node:path');
const [html, report, screenshots] = process.argv.slice(2);
app.setPath('userData', join(dirname(html), 'browser-profile'));
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, width: 1056, height: 900, webPreferences: { sandbox: true, backgroundThrottling: false } });
  const run = source => window.webContents.executeJavaScript(source);
  const settle = () => new Promise(resolve => setTimeout(resolve, 100));
  const capture = async name => {
    if (!screenshots) return;
    mkdirSync(screenshots, { recursive: true });
    await window.webContents.capturePage();
    await settle();
    writeFileSync(join(screenshots, `${name}.png`), (await window.webContents.capturePage()).toPNG());
  };
  try {
    await window.loadFile(html);
    for (let i = 0; i < 100 && !await run('!!document.querySelector(".ec-panel")'); i++) await settle();
    const layouts = [];
    for (const theme of ['light', 'dark']) for (const width of [1056, 768, 680, 592, 390, 320]) {
      window.setContentSize(width, 900);
      await run(`document.documentElement.dataset.theme='${theme}';document.body.toggleAttribute('data-ds-dark-theme','${theme}'==='dark')`);
      await settle();
      for (const expanded of [false, true]) {
        await run(`document.querySelectorAll('.ec-group').forEach(group=>group.open=${expanded})`);
        await window.webContents.capturePage();
        await settle();
        layouts.push(await run(`(()=>{
          const panel=document.querySelector('.ec-panel'),box=panel.getBoundingClientRect(),editor=document.querySelector('.ec-editor'),preview=document.querySelector('.ec-preview');
          const outside=[...panel.querySelectorAll('.ec-field,.ec-color-row,.ec-avatar-options,.ec-layout-options')].filter(node=>node.getBoundingClientRect().width&&node.scrollWidth>node.clientWidth+1).map(node=>node.className);
          const ranges=[...panel.querySelectorAll('.ec-tuner')].map(row=>({label:row.firstElementChild.textContent,range:!!row.querySelector('[type=range]'),number:!!row.querySelector('[type=number]'),reset:!!row.querySelector('.ec-parameter-reset')}));
          const floors=[...panel.querySelectorAll('.message-floor')].map(floor=>{const f=floor.getBoundingClientRect(),a=floor.parentElement.querySelector(':scope > .avatar').getBoundingClientRect();return {number:floor.textContent,left:f.left,width:f.width,top:f.top,avatarLeft:a.left,avatarWidth:a.width,avatarBottom:a.bottom}});
          return {theme:'${theme}',width:innerWidth,expanded:${expanded},left:box.left,right:box.right,panelWidth:box.width,
            scrollWidth:document.documentElement.scrollWidth,overflow:outside,
            frames:[...panel.querySelectorAll('.ec-group-material')].map(node=>({left:getComputedStyle(node).borderLeftWidth,right:getComputedStyle(node).borderRightWidth,edge:node.getBoundingClientRect().right})),
            scrollbarWidth:getComputedStyle(panel.closest('.app-settings-content')).getPropertyValue('--dsh-scrollbar-width').trim(),
            officialScrollbarWidth:getComputedStyle(document.body).getPropertyValue('--dsh-scrollbar-width').trim(),
            editorRight:editor.getBoundingClientRect().right,previewLeft:preview.getBoundingClientRect().left,
            previewTop:preview.getBoundingClientRect().top,editorBottom:editor.getBoundingClientRect().bottom,
            surfaces:[...panel.querySelectorAll('details[open]')].map(group=>({header:getComputedStyle(group.querySelector('summary')).backgroundColor,body:getComputedStyle(group.querySelector('.ec-group-body')).backgroundColor,separator:getComputedStyle(group.querySelector('.ec-group-body')).borderTopWidth,material:group.parentElement.dataset.menuMaterial,filter:getComputedStyle(group.parentElement.firstElementChild).backdropFilter})),samples:[...panel.querySelectorAll('.ec-group-sample')].map(node=>({content:node.textContent,children:node.querySelectorAll('img,svg,.ec-palette-samples>span,.ec-spacing-glyph>span, .ec-rich-sample>span,.ec-style-sample>span').length})),previewWidth:preview.getBoundingClientRect().width,ranges,fill:getComputedStyle(panel).backgroundImage,
            selectedText:getComputedStyle(panel.querySelector('.ec-avatar-options [aria-checked="true"]')).color,
            bodyFill:getComputedStyle(panel).getPropertyValue('--ec-paper'),ink:getComputedStyle(panel).getPropertyValue('--ec-ink'),colorScheme:getComputedStyle(panel).colorScheme,
            weightSelect:!!panel.querySelector('select[aria-label="字重"]'),
            open:[...panel.querySelectorAll('details[open]')].map(group=>group.dataset.group),floors,
            composer:!!panel.querySelector('.chat-display-preview-composer'),thumbnails:[...panel.querySelectorAll('.ec-layout-picture')].map(node=>({width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height})),
            fakeStats:panel.textContent.includes('214 tok/s'),outerShadow:getComputedStyle(panel).boxShadow,outerFill:getComputedStyle(panel).backgroundColor};
        })()`));
      }
      if (width === 1056) {
        await run(`document.querySelectorAll('.ec-group').forEach(group=>group.open=false)`);
        await capture(`settings-${theme}`);
        await run(`document.querySelector('[data-group="typography"]').open=true;document.querySelector('[data-group="spacing"]').open=true`);
        await capture(`settings-${theme}-expanded`);
      }
      if (theme === 'light' && width === 390) await capture('settings-narrow');
    }
    window.setContentSize(1056, 900);
    await run(`document.documentElement.dataset.theme='light';document.body.removeAttribute('data-ds-dark-theme');document.querySelectorAll('.ec-group').forEach(group=>group.open=true)`);
    await settle();
    const before = await run('structuredClone(window.chatSettingsFixture.preferences)');
    const setRange = async (label, value) => {
      await run(`(()=>{const input=document.querySelector('[aria-label="${label}滑杆"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'${value}');input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await settle();
    };
    await setRange('行距', 1.3);
    await setRange('字距', 3);
    await setRange('头像大小', 80);
    const modified = await run(`({preferences:structuredClone(window.chatSettingsFixture.preferences),weight:getComputedStyle(document.querySelector('.chat-display-preview .bubble')).fontWeight,letter:getComputedStyle(document.querySelector('.chat-display-preview .bubble')).letterSpacing})`);
    await run(`document.querySelector('[aria-label="恢复字距默认值"]').click()`); await settle();
    const singleReset = await run('structuredClone(window.chatSettingsFixture.preferences)');
    await run(`document.querySelector('[aria-label="生成统计"]').click()`); await settle();
    await run(`document.querySelector('[aria-label="恢复头像大小默认值"]').click()`); await settle();
    await run(`document.querySelector('[aria-label="恢复行距默认值"]').click()`); await settle();
    const reset = await run('structuredClone(window.chatSettingsFixture.preferences)');
    await run(`document.querySelector('.ec-layout-choice[role=radio]:nth-child(2)').click()`); await settle();
    const agent = await run(`({preferences:structuredClone(window.chatSettingsFixture.preferences),portraitDisabled:document.querySelector('.ec-avatar-options button:last-child').disabled,bubble:!!document.querySelector('[data-group="bubble"]'),timestamps:!!document.querySelector('[aria-label="聊天时间戳"]')})`);
    await setRange('行距', 1.2);
    await run(`document.querySelector('.ec-layout-choice[role=radio]:first-child').click()`); await settle();
    const switchedBack = await run('structuredClone(window.chatSettingsFixture.preferences)');
    // Numeric entry uses the real browser's input events and can be edited precisely.
    await run(`(()=>{const input=document.querySelector('[aria-label="字距数值"]');input.focus();input.select()})()`);
    await window.webContents.insertText('-0.5'); await settle();
    await run(`document.querySelector('[aria-label="字距数值"]').blur()`); await settle();
    const numeric = await run('structuredClone(window.chatSettingsFixture.preferences)');
    await run(`(()=>{const input=document.querySelector('[aria-label="斜体文本"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'#336699');input.dispatchEvent(new Event('change',{bubbles:true}));})()`); await settle();
    const colored = await run('structuredClone(window.chatSettingsFixture.preferences)');
    await run(`document.querySelector('[aria-label="恢复斜体文本默认值"]').click()`); await settle();
    await run(`document.querySelector('.ec-avatar-options button:first-child').click()`); await settle();
    const shaped = await run(`({preferences:structuredClone(window.chatSettingsFixture.preferences),radius:getComputedStyle(document.querySelector('.ec-chat-window .message > .avatar')).borderRadius})`);
    await run(`document.querySelector('[aria-label="恢复头像形状默认值"]').click()`); await settle();
    const shapeReset = await run('structuredClone(window.chatSettingsFixture.preferences)');
    await run(`document.querySelector('[aria-label="限制富消息运行楼层"]').click()`); await settle();
    await run(`(()=>{const input=document.querySelector('[aria-label="自动运行楼层数数值"]');input.focus();input.select()})()`);
    await window.webContents.insertText('150'); await settle();
    const rich = await run('structuredClone(window.chatSettingsFixture.preferences)');
    await capture('settings-interaction');
    window.setContentSize(1440, 900);
    await window.loadFile(html, { search: 'sidebar' }); await settle();
    const sidebar = await run(`({labels:[...document.querySelectorAll('.app-settings-sidebar nav button')].map(button=>button.textContent),panel:document.querySelector('.ec-panel').getBoundingClientRect().width,overflow:document.documentElement.scrollWidth>innerWidth})`);
    await capture('settings-desktop');
    const shells = [];
    for (const theme of ['light', 'dark']) for (const width of [1559, 1280, 1024]) {
      window.setContentSize(width, 1000);
      await window.loadFile(html, { search: 'shell' }); await settle();
      await run(`document.documentElement.dataset.theme='${theme}';document.body.toggleAttribute('data-ds-dark-theme','${theme}'==='dark')`);
      await window.webContents.capturePage(); await settle();
      shells.push(await run(`(()=>{const p=document.querySelector('.ec-panel'),content=document.querySelector('.app-settings-content'),panel=p.getBoundingClientRect(),c=content.getBoundingClientRect(),title=p.querySelector('h1').getBoundingClientRect(),side=document.querySelector('.app-settings-sidebar h2').getBoundingClientRect();const beforeWidth=content.clientWidth;document.querySelectorAll('.ec-group').forEach(group=>group.open=true);const expandedWidth=content.clientWidth,expandedPanel=p.getBoundingClientRect().width;document.querySelectorAll('.ec-group').forEach(group=>group.open=false);return {theme:'${theme}',width:innerWidth,contentLeft:c.left,panelLeft:panel.left,panelRight:panel.right,contentRight:c.right,titleTop:title.top,sideTitleTop:side.top,titleSize:getComputedStyle(p.querySelector('h1')).fontSize,titleWeight:getComputedStyle(p.querySelector('h1')).fontWeight,shadow:getComputedStyle(p).boxShadow,fill:getComputedStyle(p).backgroundColor,padding:getComputedStyle(p).padding,material:!!p.dataset.menuMaterial,overflow:document.documentElement.scrollWidth>innerWidth,beforeWidth,expandedWidth,panelWidth:panel.width,expandedPanel}})()`));
      if (width === 1559) {
        await capture(`settings-window-${theme}`);
        if (theme === 'light') {
          await run(`document.querySelector('[data-group="typography"]').open=true;document.querySelector('[data-group="spacing"]').open=true`);
          await capture('settings-window-expanded');
        }
      }
    }
    const strokes = [];
    window.setContentSize(1560, 900);
    await window.loadFile(html, { search: 'shell' }); await settle();
    await window.webContents.insertCSS('*{transition:none!important}');
    for (const zoom of [1, 1.1, 1.25]) {
      window.webContents.setZoomFactor(zoom); await settle();
      const geometry = await run(`(()=>{const n=document.querySelector('.ec-group-material'),r=n.getBoundingClientRect(),c=getComputedStyle(n,'::after');return {x:r.x,y:r.y,w:r.width,h:r.height,iw:innerWidth,layer:c.zIndex,color:c.borderRightColor}})()`);
      await window.webContents.capturePage(); await settle();
      const shot=nativeImage.createFromBuffer((await window.webContents.capturePage()).toPNG()),size=shot.getSize(),bitmap=shot.toBitmap(),scale=size.width/geometry.iw;
      const y=Math.round((geometry.y+geometry.h/2)*scale);
      const samples=x=>Array.from({length:9},(_,i)=>bitmap[(y*size.width+Math.round(x*scale)+i-4)*4]);
      strokes.push({zoom,layer:geometry.layer,left:Math.min(...samples(geometry.x)),right:Math.min(...samples(geometry.x+geometry.w))});
    }
    writeFileSync(report, JSON.stringify({ layouts, before, modified, singleReset, reset, agent, switchedBack, numeric, colored, shaped, shapeReset, rich, sidebar, shells, strokes }));
    window.destroy(); app.exit(0);
  } catch (error) { console.error(error); app.exit(1); }
});
