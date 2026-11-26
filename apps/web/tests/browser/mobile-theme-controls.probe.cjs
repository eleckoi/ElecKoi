const {app,BrowserWindow}=require('electron');
const {writeFileSync}=require('node:fs');
const {dirname}=require('node:path');
const [html,report]=process.argv.slice(2);
app.setPath('userData',dirname(html)+'/profile');app.disableHardwareAcceleration();
app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:false,width:390,height:844,webPreferences:{sandbox:true,backgroundThrottling:false}}),rows=[],history=[],errors=[];
 win.webContents.on('console-message',details=>{if(details.level==='error'||details.level===3)errors.push(details.message)});
 const run=code=>win.webContents.executeJavaScript(code),pause=()=>new Promise(r=>setTimeout(r,60));
 const wait=async code=>{for(let i=0;i<100;i++){if(await run(code))return;await pause()}throw Error('Missing control '+code)};
 const measureHistory = () => run(`(() => {
   const toolbar = document.querySelector('.history-toolbar');
   const field = toolbar.querySelector('.history-search');
   const search = field.getBoundingClientRect();
   const button = toolbar.querySelector('.history-import');
   const bounds = button.getBoundingClientRect();
   const toolbarBounds = toolbar.getBoundingClientRect();
   const toolbarStyle = getComputedStyle(toolbar);
   const fieldStyle = getComputedStyle(field);
   const borderChannels = fieldStyle.borderTopColor.match(/[0-9]+/g)?.slice(0, 3);
   return { summaries: [...document.querySelectorAll('.history-item-main > div:last-child > span')].map(item => item.textContent),
     choices: toolbar.querySelectorAll('[role="radio"], [role="tab"], [aria-pressed], [aria-haspopup]').length,
     buttons: [...toolbar.querySelectorAll('button')].map(item => item.textContent), official: button.hasAttribute('data-dsh-control'),
     aligned: Math.abs(search.top - bounds.top) < 1 && Math.abs(search.height - bounds.height) < 1 && search.right < bounds.left,
     buttonHeight: bounds.height,
     dividerAligned: toolbarStyle.borderBottomStyle === 'solid' && parseFloat(toolbarStyle.borderBottomWidth) > 0
       && Math.abs(search.left - toolbarBounds.left) < 1 && Math.abs(bounds.right - toolbarBounds.right) < 1,
     searchFocused: document.activeElement === field.querySelector('input'),
     searchShadow: fieldStyle.boxShadow,
     neutralBorder: borderChannels?.length === 3 && new Set(borderChannels).size === 1,
   };
 })()`);
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
    await wait(`!!document.querySelector('.history-item-delete')`);
    history.push({ dark, mobile: true, character: 'a', ...await measureHistory() });
    await run(`document.querySelector('.history-item-delete').click()`);
    await wait(`!!document.querySelector('[role="dialog"][aria-label="删除历史对话"] .product-dialog-actions button:last-child')`);await pause();
    rows.push(await run(`(()=>{const e=document.querySelector('[role="dialog"][aria-label="删除历史对话"] .product-dialog-actions button:last-child'),s=getComputedStyle(e),r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {dark:${dark},drawer:false,color:s.color,background:s.backgroundColor,clickable:!!hit&&e.contains(hit),focused:!!document.activeElement.closest('[role="dialog"][aria-label="删除历史对话"]')}})()`));
    await win.webContents.capturePage();await pause();writeFileSync(dirname(report)+'/history-'+(dark?'dark':'light')+'.png',(await win.webContents.capturePage()).toPNG());
    await run(`document.querySelector('[role="dialog"][aria-label="删除历史对话"] .product-dialog-actions button:last-child').click()`);
    if(!await run('window.historyDeleted'))throw Error('History delete failed');
   }
   if(drawer){await win.webContents.capturePage();await pause();writeFileSync(dirname(report)+'/drawer-'+(dark?'dark':'light')+'.png',(await win.webContents.capturePage()).toPNG());}
  }
  win.setContentSize(1100, 760);
  for (const dark of [false, true]) {
    await win.loadFile(html, { query: { desktop: '1' } });
    await run(`document.documentElement.dataset.theme='${dark?'dark':'light'}';document.body.toggleAttribute('data-ds-dark-theme',${dark})`);
    await wait(`!!document.querySelector('.history-modal .history-item')`);
    history.push({ dark, mobile: false, character: 'a', ...await measureHistory() });
    await run(`document.querySelector('.history-import').click()`);
    if (!await run('window.historyChooserOpened')) throw Error('History import did not open the file input');
    await run(`(() => {
      const files = new DataTransfer();
      files.items.add(new File(['{}'], 'chat.json', { type: 'application/json' }));
      const input = document.querySelector('.history-toolbar input[type=file]');
      input.files = files.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await wait(`!document.querySelector('.history-modal')`);
    if (!await run(`window.historyImport.id === 'a' && window.historyImport.json === '{}' && window.historyLoaded === 'imported-session' && !window.historyDeleted`)) {
      throw Error('History import did not retain the original character and load the imported record');
    }
    await run(`document.querySelector('#open-other-history').click()`);
    await wait(`!!document.querySelector('.history-modal .history-item')`);
    history.push({ dark, mobile: false, character: 'b', ...await measureHistory() });
  }
  writeFileSync(report,JSON.stringify({rows,history,errors},null,2));win.destroy();app.quit();
 }catch(error){console.error(error);app.exit(1)}
});
