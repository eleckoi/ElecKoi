const { app, BrowserWindow }=require('electron');
const { writeFileSync }=require('node:fs');
const { dirname,join }=require('node:path');
const { pathToFileURL }=require('node:url');
const [html,reportPath]=process.argv.slice(2);
app.setPath('userData',join(dirname(html),'profile'));app.disableHardwareAcceleration();
app.whenReady().then(async()=>{
  const win=new BrowserWindow({show:false,webPreferences:{sandbox:true,offscreen:true,backgroundThrottling:false}});
  const run=s=>win.webContents.executeJavaScript(s),report={cases:[],assets:[],errors:[]};
  win.webContents.on('console-message',e=>{if(e.level==='error')report.errors.push(e.message);});
  const wait=async code=>{for(let i=0;i<120;i++){if(await run(code))return;await new Promise(r=>setTimeout(r,20));}throw Error(code);};
  const click=async(selector,text)=>{const s=`[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.textContent.trim()===${JSON.stringify(text)})`;await wait(`!!(${s})`);await run(`(${s}).click()`);};
  const choose=async key=>{await run(`document.querySelector('[data-editor="${key}"]').click()`);await wait(`document.querySelector('main').dataset.current==='${key}'`);};
  const shape=`s=>({width:s.width,height:s.height,radius:s.borderRadius,corner:s.cornerShape,color:s.backgroundColor})`;
  try{
    await win.loadURL(pathToFileURL(html).href);await win.webContents.insertCSS('*,*::before,*::after{animation:none!important;transition:none!important}');
    for(const theme of ['light','dark'])for(const width of [320,390,1200]){
      const compact=width<600;win.setContentSize(width,844);
      await run(`document.documentElement.dataset.theme='${theme}';document.body.toggleAttribute('data-ds-dark-theme',${theme==='dark'});document.documentElement.dataset.eleckoiMobile='${compact}'`);
      await choose('regex:character:true');await wait('!!document.querySelector(".editor-library-rows .regex-rule-switch input")');
      const reference={};
      for(const checked of [true,false]){
        await run(`(()=>{const e=document.querySelector('.editor-library-rows .regex-rule-switch input');if(e.checked!==${checked})e.click()})()`);
        reference[checked]=await run(`(()=>{const e=document.querySelector('.editor-library-rows .regex-rule-switch i'),shape=${shape};return {track:shape(getComputedStyle(e)),thumb:shape(getComputedStyle(e,'::after'))}})()`);
      }
      const kinds=[['settings','character'],['variables','character'],['prompts','preset'],['tools','preset'],...(!compact?[['regex','character'],['scripts','character'],['regex','preset'],['scripts','preset']]:[])];
      for(const [kind,owner]of kinds){
        await choose(`${kind}:${owner}:${compact}`);
        const selector=compact?'.mobile-editor-actions [role=toolbar] button':kind==='prompts'?'.setting-library-add-wrap button':'.setting-toolbar-create';
        if(['settings','variables'].includes(kind)){
          await click(selector,'新建');await click('[role=menu] [role=menuitem]',kind==='settings'?'新建设定':'变量');
          await wait(`!!document.querySelector('[aria-label="${kind==='settings'?'条目标题':'当前变量名称'}"]')`);
          if(compact){await run('document.querySelector("[data-fixture-back]").click()');await wait('!document.querySelector(".editor-page-detail")');}
        }
        await wait('!!document.querySelector(".editor-toggle")');
        const states={};let icons;
        for(const checked of [true,false]){
          await run(`(()=>{const e=document.querySelector('.editor-toggle');if(e.getAttribute('aria-checked')!==String(${checked}))e.click()})()`);
          await wait(`document.querySelector('.editor-toggle').getAttribute('aria-checked')==='${checked}'`);
          states[checked]=await run(`(()=>{const e=document.querySelector('.editor-toggle'),shape=${shape};return {track:shape(getComputedStyle(e)),thumb:shape(getComputedStyle(e.firstElementChild)),detailOpen:!!document.querySelector('.editor-page-detail'),checked:e.getAttribute('aria-checked')}})()`);
          if(checked)icons=await run(`(()=>{const nodes=[...document.querySelectorAll('.setting-library-tree-row:not(.is-disabled) .setting-library-tree-entry-icon,.variable-tree-row:not(.is-disabled) .variable-tree-icon,.rs-row:not(.is-disabled) .rs-row-main svg')];const ref=document.createElement('span');document.body.append(ref);ref.style.color='var(--dsw-alias-label-primary)';const primary=getComputedStyle(ref).color;ref.style.color='var(--dsw-alias-label-secondary)';const secondary=getComputedStyle(ref).color;ref.remove();return {colors:nodes.map(e=>getComputedStyle(e).color),primary,secondary}})()`);
          if(checked&&width===1200){await new Promise(r=>setTimeout(r,80));writeFileSync(join(dirname(html),`${kind}-${owner}-pc-${theme}.png`),(await win.webContents.capturePage()).toPNG());}
        }
        report.cases.push({theme,width,kind,owner,reference,states,icons});
        if(theme==='dark'&&width===390){await new Promise(r=>setTimeout(r,80));writeFileSync(join(dirname(html),`${kind}-switch.png`),(await win.webContents.capturePage()).toPNG());}
      }
      await choose(`assets:character:${compact}`);await wait('!!document.querySelector(".library-create-actions button")');
      const assets=await run(`(()=>{const ref=[...document.querySelector('[data-official-controls]').querySelectorAll('button')].find(e=>e.textContent==='操作'&&getComputedStyle(e).backgroundColor!=='rgba(0, 0, 0, 0)'),buttons=[...document.querySelectorAll('.library-create-actions button')];return {referenceColor:getComputedStyle(ref).color,buttons:buttons.map(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return {text:e.textContent,color:s.color,background:s.backgroundColor,width:r.width,height:r.height}}),overflow:document.querySelector('.character-asset-library').scrollWidth>document.querySelector('.character-asset-library').clientWidth}})()`);
      await click('.library-create-actions button','新建文件夹');const folder=await run('window.assetToolbarAction');await click('.library-create-actions button','导入文件');const upload=await run('window.assetToolbarAction');
      report.assets.push({theme,width,...assets,folder,upload});
      if(theme==='dark'&&width===390){await new Promise(r=>setTimeout(r,80));writeFileSync(join(dirname(html),'assets-toolbar-dark.png'),(await win.webContents.capturePage()).toPNG());}
    }
    report.passed=true;
  }catch(e){report.passed=false;report.failure=e.stack||String(e);}
  writeFileSync(reportPath,JSON.stringify(report,null,2));win.destroy();app.exit(report.passed?0:1);
});
