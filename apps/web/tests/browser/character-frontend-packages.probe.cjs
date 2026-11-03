const {app,BrowserWindow}=require('electron');
const {writeFileSync}=require('node:fs');
const {dirname,join}=require('node:path');
const {pathToFileURL}=require('node:url');
const [html,report]=process.argv.slice(2);
app.setPath('userData',join(dirname(html),'browser-profile'));app.disableHardwareAcceleration();
app.whenReady().then(async()=>{
  const win=new BrowserWindow({show:false,webPreferences:{sandbox:true,backgroundThrottling:false}});
  const run=source=>win.webContents.executeJavaScript(source);
  const wait=async source=>{for(let i=0;i<200;i++){if(await run(source))return;await new Promise(resolve=>setTimeout(resolve,20));}throw Error('Timed out: '+source);};
  const paint=()=>run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  const errors=[];win.webContents.on('console-message',({level,message})=>{if(level==='error')errors.push(message);});
  try{
    await win.loadURL(pathToFileURL(html).href);const layouts=[];
    for(const theme of ['light','dark'])for(const width of [1440,900,600,390,320])for(const active of [true,false]){
      win.setContentSize(width,820);await wait(`innerWidth===${width}`);
      await run(`document.body.toggleAttribute('data-ds-dark-theme',${theme==='dark'});window.renderPackages(${active})`);
      await wait(`packageSeat.querySelector('.cf-source pre') && packageSeat.querySelector('.cf-directory-row')`);await paint();
      layouts.push(await run(`(()=>{
        const root=packageSeat,bar=root.querySelector('.cf-toolbar'),tabs=root.querySelector('[role=tablist]'),selected=tabs.querySelector('[aria-selected=true]');
        const r=node=>node.getBoundingClientRect(),indicator=r(tabs.firstElementChild),tab=r(selected),label=r(selected.firstElementChild),body=r(root.querySelector('.cf-body'));
        const controls=[...bar.children].filter(node=>getComputedStyle(node).display!=='none').map(r).filter(r=>r.width>0);
        return {theme:${JSON.stringify(theme)},width:${width},active:${active},overlap:controls.some((r,i)=>i>0&&r.left<controls[i-1].right-.5),overflow:bar.scrollWidth>bar.clientWidth||controls.some(r=>r.right>innerWidth)||document.documentElement.scrollWidth>innerWidth,
          tabHeight:r(tabs).height,importHeight:r(root.querySelector('[aria-label="导入前端包"]')).height,
          indicatorDrift:Math.abs(indicator.y+indicator.height/2-tab.y-tab.height/2),labelDrift:Math.abs(label.y+label.height/2-tab.y-tab.height/2),
          divider:parseFloat(getComputedStyle(bar).borderBottomWidth)>0,join:Math.abs(body.top-r(bar).bottom)<1,rendered:root.querySelectorAll('.cf-directory-row').length,
          copy:!!root.querySelector('[aria-label="复制"],textarea,[contenteditable=true]'),redundant:/只读|使用中/.test(root.textContent)};
      })()`));
      if(process.env.ELECKOI_PACKAGE_SCREENSHOT&&width===1440&&active){
        writeFileSync(process.env.ELECKOI_PACKAGE_SCREENSHOT.replace('.png','-'+theme+'.png'),(await win.webContents.capturePage()).toPNG());
        const bounds=await run(`(()=>{const r=packageSeat.querySelector('.cf-tabs').getBoundingClientRect();return{x:Math.floor(r.x)-6,y:Math.floor(r.y)-6,width:Math.ceil(innerWidth-r.x)-2,height:Math.ceil(r.height)+12}})()`);
        writeFileSync(process.env.ELECKOI_PACKAGE_SCREENSHOT.replace('.png','-toolbar-'+theme+'.png'),(await win.webContents.capturePage(bounds)).toPNG());
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
    await run(`window.renderPackages(false,true)`);await paint();
    const emptyImports=await run(`packageSeat.querySelectorAll('[aria-label="导入前端包"]').length`);
    if(errors.length)throw Error(errors.join('\n'));
    writeFileSync(report,JSON.stringify({layouts,lastFile,mobileReading,menu,emptyImports}));win.destroy();app.exit(0);
  }catch(error){console.error(error);win.destroy();app.exit(1);}
});
