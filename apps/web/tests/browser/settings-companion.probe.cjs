const { app, BrowserWindow } = require('electron');
const { writeFileSync, mkdirSync } = require('node:fs');
const { join, dirname } = require('node:path');
const [html, report, screenshots] = process.argv.slice(2);
app.setPath('userData', join(dirname(html), 'companion-profile')); app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, width: 1056, height: 900, webPreferences: { sandbox: true, backgroundThrottling: false } });
  const run = async script => { try { return await window.webContents.executeJavaScript(script); } catch(error) { console.error('Failed browser step:',script.slice(0,700)); throw error; } };
  window.webContents.on('console-message', event => { if(event.level==='error') console.error(event.message); });
  const settle = () => new Promise(resolve => setTimeout(resolve, 150));
  const capture = async name => {
    if (!screenshots) return;
    mkdirSync(screenshots, { recursive: true });
    await window.webContents.capturePage(); await settle();
    writeFileSync(join(screenshots, `${name}.png`), (await window.webContents.capturePage()).toPNG());
  };
  try {
    const layouts = [];
    for (const theme of ['light', 'dark']) for (const width of [1056, 768, 390, 320]) for (const page of ['theme', 'profile']) {
      window.setContentSize(width, 900);
      await window.loadFile(html, { search: `page=${page}` }); await settle();
      await run(`document.documentElement.dataset.theme='${theme}';document.body.toggleAttribute('data-ds-dark-theme','${theme}'==='dark')`);
      await settle();
      layouts.push(await run(`(()=>{const panel=document.querySelector('.settings-design'),box=panel.getBoundingClientRect(),input=panel.querySelector('.sd-name-field input'),save=panel.querySelector('.sd-save'),circle=panel.querySelector('.sd-avatar-circle>.avatar');return {theme:'${theme}',page:'${page}',width:innerWidth,scrollWidth:document.documentElement.scrollWidth,left:box.left,right:box.right,hasSave:!!save,hasPreview:!!panel.querySelector('.sd-profile-preview'),avatarAboveName:!input||panel.querySelector('.sd-profile-avatar').getBoundingClientRect().bottom<input.getBoundingClientRect().top,inputShadow:input?getComputedStyle(input).boxShadow:null,manageEntries:panel.querySelectorAll('[aria-label="管理头像"]').length,avatarSizes:[...panel.querySelectorAll('.sd-profile-avatar>.avatar')].map(a=>({width:a.getBoundingClientRect().width,height:a.getBoundingClientRect().height})),circle:circle?{clip:getComputedStyle(circle).clipPath,shape:getComputedStyle(circle).getPropertyValue('corner-shape')}:null,choices:[...panel.querySelectorAll('.sd-visual-choice')].map(e=>({w:e.getBoundingClientRect().width,overflow:e.scrollWidth>e.clientWidth+1})),inventory:panel.querySelector('.sd-avatar-inventory')?getComputedStyle(panel.querySelector('.sd-avatar-inventory')).backgroundColor:null,colorSurface:panel.querySelector('.sd-color-section')?getComputedStyle(panel.querySelector('.sd-color-section')).backgroundColor:null}})()`));
      if (width === 1056 || width === 320) await capture(`${page}-${theme}-${width}`);
    }
    window.setContentSize(1056, 900);
    await window.loadFile(html, { search: 'page=profile' }); await settle();
    await run(`(()=>{const input=document.querySelector('[aria-label="名字"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'新名字');input.dispatchEvent(new Event('input',{bubbles:true}));})()`); await settle();
    const before = await run(`({stored:window.settingsCompanionFixture.persona.user_name,name:document.querySelector('[aria-label="名字"]').value})`);
    await run(`(()=>{const button=document.querySelector('[aria-label="管理头像"]');button.focus();button.click()})()`); await settle();
    const initial = await run(`({name:document.querySelector('[aria-label="名字"]').value,tab:document.querySelector('.sd-avatar-tabs [aria-selected="true"]').textContent.trim(),returns:[...document.querySelector('.profile-avatar-dialog').querySelectorAll('button')].some(b=>b.textContent.includes('返回')),material:document.querySelector('.profile-avatar-dialog').dataset.menuMaterial})`);
    await run(`(()=>{window.pickerClicks=0;document.querySelector('input[type=file]').addEventListener('click',event=>{event.preventDefault();window.pickerClicks++})})()`);
    for (const label of ['圆形', '正方形', '竖图']) {
      await run(`[...document.querySelectorAll('.sd-avatar-tabs [role=tab]')].find(b=>b.textContent.trim()==='${label}').click()`); await settle();
      await run(`document.querySelector('[aria-label="更换${label}头像"]').click()`); await settle();
    }
    await capture('profile-avatar-dialog');
    const pickerClicks = await run('window.pickerClicks');
    await run(`(async()=>{const canvas=document.createElement('canvas');canvas.width=80;canvas.height=120;const ctx=canvas.getContext('2d');ctx.fillStyle='#4176e6';ctx.fillRect(0,0,80,120);ctx.fillStyle='#fff';ctx.fillRect(10,20,35,50);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));const transfer=new DataTransfer();transfer.items.add(new File([blob],'synthetic-avatar.png',{type:'image/png'}));const input=document.querySelector('input[type=file]');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    for (let index = 0; index < 50; index++) {
      await settle();
      if (await run(`!document.querySelector('.profile-avatar-dialog').hasAttribute('aria-busy')`)) break;
    }
    const draft = await run(`({source:document.querySelector('.sd-profile-avatar img').getAttribute('src'),portrait:window.settingsCompanionFixture.saves.at(-1).avatars.portrait,saves:window.settingsCompanionFixture.saves.length,stored:window.settingsCompanionFixture.persona.user_name,error:document.querySelector('.profile-avatar-dialog [role=alert]')?.textContent||''})`);
    await run(`document.querySelector('.sd-crop-action').click()`); await settle();
    const cropping = await run(`document.querySelectorAll('[role=dialog]').length`);
    await run(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`); await settle();
    const afterCropEscape = await run(`({dialogs:document.querySelectorAll('[role=dialog]').length,manager:!!document.querySelector('.profile-avatar-dialog')})`);
    await run(`document.querySelector('[aria-label="关闭头像管理"]').click()`); await settle();
    const afterClose = await run(`({name:document.querySelector('[aria-label="名字"]').value,saves:window.settingsCompanionFixture.saves.length,source:document.querySelector('.sd-profile-avatar img').getAttribute('src'),focus:document.activeElement.getAttribute('aria-label')})`);
    await run(`(()=>{window.settingsCompanionFixture.failSave=true;const input=document.querySelector('[aria-label="名字"]');input.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'重试名字');input.dispatchEvent(new Event('input',{bubbles:true}));})()`); await settle();
    await run(`document.querySelector('[aria-label="名字"]').blur()`); await new Promise(resolve=>setTimeout(resolve,450));
    const failure = await run(`({error:document.querySelector('.sd-profile-page [role=alert]')?.textContent||'',name:document.querySelector('[aria-label="名字"]').value,disabled:document.querySelector('[aria-label="名字"]').disabled})`);
    await run(`window.settingsCompanionFixture.failSave=false;document.querySelector('.sd-error button').click()`); await settle();
    const saved = await run(`({persona:window.settingsCompanionFixture.persona,payload:window.settingsCompanionFixture.saves.at(-1),hasError:!!document.querySelector('.sd-profile-page [role=alert]')})`);
    await window.loadFile(html, { search: 'page=theme' }); await settle();
    await run(`document.querySelector('.sd-appearance-choices button:nth-child(2)').click();document.querySelector('.sd-artwork-choices button:nth-child(2)').click()`); await settle();
    const themeChanged = await run(`({appearance:window.settingsCompanionFixture.appearance,artwork:window.settingsCompanionFixture.artwork})`);
    const margins=[];
    for (const theme of ['light', 'dark']) for (const page of ['profile', 'theme','chat','dsh:plugins']) {
      window.setContentSize(1560, 1000); await window.loadFile(html, { search: `shell&page=${page}` }); await settle();
      await window.webContents.insertCSS('*{transition:none!important}');
      await run(`document.documentElement.dataset.theme='${theme}';document.body.toggleAttribute('data-ds-dark-theme','${theme}'==='dark')`); await settle();
      margins.push(await run(`(()=>{const c=document.querySelector('.app-settings-content'),p=c.firstElementChild,r=c.getBoundingClientRect();return {theme:'${theme}',page:'${page}',left:p.getBoundingClientRect().left-r.left,top:p.getBoundingClientRect().top-r.top}})()`));
      await capture(`settings-${page.replace(':','-')}-${theme}`);
    }
    writeFileSync(report, JSON.stringify({ layouts, before, initial, pickerClicks, draft, cropping, afterCropEscape, afterClose, failure, saved, themeChanged, margins }));
    window.destroy(); app.exit(0);
  } catch (error) { console.error(error); app.exit(1); }
});
