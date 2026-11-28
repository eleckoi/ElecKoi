const {app,BrowserWindow}=require('electron');
const {writeFileSync}=require('node:fs');
const {dirname,join}=require('node:path');
const {pathToFileURL}=require('node:url');
const [html,report]=process.argv.slice(2);
app.setPath('userData',join(dirname(html),'browser-profile'));app.disableHardwareAcceleration();
app.whenReady().then(async()=>{
  const win=new BrowserWindow({show:false,useContentSize:true,webPreferences:{sandbox:true,backgroundThrottling:false}});
  const run=source=>win.webContents.executeJavaScript(source);
  const wait=async source=>{for(let i=0;i<200;i++){if(await run(source))return;await new Promise(resolve=>setTimeout(resolve,20));}throw Error('Timed out: '+source);};
  const paint=()=>run('document.body.getBoundingClientRect().width');
  const errors=[];win.webContents.on('console-message',({level,message})=>{if(level==='error')errors.push(message);});
  try{
    await win.loadURL(pathToFileURL(html).href);
    await win.webContents.insertCSS('*,*::before,*::after{animation:none!important;transition:none!important}');
    const layouts=[],menus=[];
    for(const theme of ['light','dark'])for(const width of [1440,900,600,390,320])for(const active of [true,false]){
      win.setContentSize(width,820);await wait(`innerWidth===${width}`);
      await run(`document.body.toggleAttribute('data-ds-dark-theme',${theme==='dark'});window.renderPackages(${active})`);
      await wait(`packageSeat.querySelector('.cf-source pre') && packageSeat.querySelector('.cf-directory-row')`).catch(async error=>{throw Error(error.message+'\n'+await run(`JSON.stringify({html:packageSeat.outerHTML,errors:${JSON.stringify(errors)}})`));});await paint();
      layouts.push(await run(`(()=>{
        const root=packageSeat,bar=root.querySelector('.cf-toolbar'),tabs=root.querySelector('[role=tablist]'),selected=tabs.querySelector('[aria-selected=true]');
        const r=node=>node.getBoundingClientRect(),indicator=r(tabs.firstElementChild),tab=r(selected),label=r(selected.firstElementChild),body=r(root.querySelector('.cf-body'));
        const controls=[...bar.children].filter(node=>getComputedStyle(node).display!=='none').map(r).filter(r=>r.width>0);
        return {theme:${JSON.stringify(theme)},width:${width},active:${active},overlap:controls.some((r,i)=>i>0&&r.left<controls[i-1].right-.5),overflow:bar.scrollWidth>bar.clientWidth||controls.some(r=>r.right>innerWidth)||document.documentElement.scrollWidth>innerWidth,
          tabHeight:r(tabs).height,importHeight:r(root.querySelector('[aria-label="导入前端包"]')).height,
          importDrift:Math.abs(r(tabs).top+r(tabs).height/2-r(root.querySelector('[aria-label="导入前端包"]')).top-r(root.querySelector('[aria-label="导入前端包"]')).height/2),
          indicatorDrift:Math.abs(indicator.y+indicator.height/2-tab.y-tab.height/2),labelDrift:Math.abs(label.y+label.height/2-tab.y-tab.height/2),
          divider:parseFloat(getComputedStyle(bar).borderBottomWidth)>0,join:Math.abs(body.top-r(bar).bottom)<1,rendered:root.querySelectorAll('.cf-directory-row').length,
          toolbarIcons:[...bar.querySelectorAll('svg[data-icon]')].map(icon=>{const bounds=icon.getBBox();return{id:icon.dataset.icon,painted:bounds.width>0&&bounds.height>0,resolved:!!root.ownerDocument.getElementById(icon.dataset.icon)};}),
          sprites:document.querySelectorAll('svg[data-dsh-icon-sprite]').length,
          copy:!!root.querySelector('[aria-label="复制"],textarea,[contenteditable=true]'),redundant:/只读|使用中/.test(root.textContent)};
      })()`));
      if(process.env.ELECKOI_PACKAGE_SCREENSHOT&&width===1440&&active){
        writeFileSync(process.env.ELECKOI_PACKAGE_SCREENSHOT.replace('.png','-'+theme+'.png'),(await win.webContents.capturePage()).toPNG());
        const bounds=await run(`(()=>{const r=packageSeat.querySelector('.cf-tabs').getBoundingClientRect();return{x:Math.floor(r.x)-6,y:Math.floor(r.y)-6,width:Math.ceil(innerWidth-r.x)-2,height:Math.ceil(r.height)+12}})()`);
        writeFileSync(process.env.ELECKOI_PACKAGE_SCREENSHOT.replace('.png','-toolbar-'+theme+'.png'),(await win.webContents.capturePage(bounds)).toPNG());
      }
      if(layouts.at(-1).toolbarIcons.some(icon=>!icon.resolved||!icon.painted))throw Error('Toolbar icons are not rendered: '+JSON.stringify(layouts.at(-1)));
      for(const label of ['切换前端包','前端包更多操作']){
        await run(`packageSeat.querySelector('[aria-label="${label}"]').click()`);
        await wait(`!!document.querySelector('[role=menu]')`);await paint();
        menus.push(await run(`(()=>{
          const anchor=packageSeat.querySelector('[aria-label="${label}"]'),menu=document.querySelector('[role=menu]');
          const a=anchor.getBoundingClientRect(),m=menu.getBoundingClientRect();
          return {theme:${JSON.stringify(theme)},width:${width},active:${active},label:${JSON.stringify(label)},
            gap:Math.min(Math.abs(m.top-a.bottom-4),Math.abs(a.top-m.bottom-4)),
            align:Math.abs(${label==='前端包更多操作'?'m.right-a.right':'m.left-a.left'}),
            visible:m.left>=0&&m.top>=0&&m.right<=innerWidth&&m.bottom<=innerHeight,
            sameRoot:anchor.getRootNode()===menu.getRootNode(),anchor:{x:a.x,y:a.y,width:a.width,height:a.height},panel:{x:m.x,y:m.y,width:m.width,height:m.height}};
        })()`));
        await run(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
        await wait(`!document.querySelector('[role=menu]')`);
      }
    }
    await run(`packageSeat.querySelector('.cf-directory').scrollTop=100000`);
    await wait(`!!packageSeat.querySelector('[title="scripts/item-1199.js"]')`);
    await run(`packageSeat.querySelector('[title="scripts/item-1199.js"]').click()`);
    await wait(`packageSeat.querySelector('.cf-source').textContent.includes('item-1199.js')`);
    const lastFile=true;
    const mobileReading=await run(`getComputedStyle(packageSeat.querySelector('.cf-directory')).display==='none'&&getComputedStyle(packageSeat.querySelector('.cf-document')).display!=='none'`);
    await run(`packageSeat.querySelector('[aria-label="返回文件目录"]').click()`);
    await wait(`getComputedStyle(packageSeat.querySelector('.cf-directory')).display!=='none'`);
    await run(`packageSeat.querySelector('[aria-label="前端包更多操作"]').click()`);await wait(`!!document.querySelector('[role=menu]')`);
    const menu=await run(`document.querySelector('[role=menu]').getBoundingClientRect().right<=innerWidth`);
    const originalIconHeight=await run(`packageSeat.querySelector('[aria-label="前端包更多操作"] svg').getBBox().height`);
    const optionsIcon = 'dsw-icon-sliders-two-outline-regular';
    const themedIcon=await run(`(()=>{const symbol=document.getElementById('${optionsIcon}');const shape=document.createElementNS('http://www.w3.org/2000/svg','rect');shape.setAttribute('x','2');shape.setAttribute('y','2');shape.setAttribute('width','12');shape.setAttribute('height','12');symbol.replaceChildren(shape);return symbol.outerHTML;})()`);
    await wait(`document.getElementById('${optionsIcon}')?.outerHTML===${JSON.stringify(themedIcon)}`);
    await paint();
    const themeUpdate=await run(`(()=>{const box=packageSeat.querySelector('[aria-label="前端包更多操作"] svg').getBBox();return box.width>0&&box.height>${originalIconHeight};})()`);
    await run(`window.previousPackageSeat=packageSeat;const sprite=document.querySelector('[data-dsh-icon-sprite]');window.replacementSprite=sprite.cloneNode(true);sprite.remove()`);
    await wait(`!document.querySelector('svg[data-dsh-icon-sprite]')`);
    await run(`document.body.prepend(window.replacementSprite)`);
    await wait(`document.getElementById('${optionsIcon}')?.outerHTML===${JSON.stringify(themedIcon)}`);
    const sourceRemount=true;
    await run(`window.renderPackages(false,true)`);await paint();
    const emptyImports=await run(`packageSeat.querySelectorAll('[aria-label="导入前端包"]').length`);
    const unmountClosesMenu=await run(`!window.previousPackageSeat.isConnected&&!document.querySelector('[role=menu]')`);
    if(errors.length)throw Error(errors.join('\n'));
    writeFileSync(report,JSON.stringify({layouts,menus,lastFile,mobileReading,menu,emptyImports,themeUpdate,sourceRemount,unmountClosesMenu}));win.destroy();app.exit(0);
  }catch(error){console.error(error);win.destroy();app.exit(1);}
});
