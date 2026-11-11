const {app,BrowserWindow}=require('electron');
const {writeFileSync}=require('node:fs');
const {dirname}=require('node:path');
const [html,report]=process.argv.slice(2);
app.setPath('userData',dirname(html)+'/profile');app.disableHardwareAcceleration();
app.whenReady().then(async()=>{
 const window=new BrowserWindow({show:false,webPreferences:{sandbox:true,backgroundThrottling:false}}),rows=[],scrolling=[],errors=[];
 window.webContents.on('console-message',details=>{if(details.level==='error'||details.level===3)errors.push(details.message)});
 const run=source=>window.webContents.executeJavaScript(source),pause=()=>new Promise(resolve=>setTimeout(resolve,40));
 const settle=async()=>{await window.webContents.capturePage();await pause();await window.webContents.capturePage();await pause()};
 const wait=async source=>{for(let i=0;i<100;i++){if(await run(source))return;await pause()}throw Error('Plugin fixture not ready: '+source)};
 const measure=()=>run(`(()=>{
  const p=document.querySelector('[data-plugin-panel]'),b=p.querySelector('[data-plugin-bar]'),body=b.parentElement,
   head=b.querySelector('header'),intro=b.querySelector('[data-plugin-header-part=intro]'),toolbar=b.querySelector('[data-plugin-header-part=toolbar]'),
   title=b.querySelector('[data-plugin-header-part=title]'),rect=e=>e.getBoundingClientRect(),box=rect(intro),bar=rect(b),headBox=rect(head),bodyBox=rect(body),style=getComputedStyle(intro),range=document.createRange();
  range.selectNodeContents(intro.firstElementChild);const text=range.getBoundingClientRect(),clip=Number.parseFloat(style.clipPath.match(/^inset\\(([\\d.]+)%/)?.[1]??'0'),
   top=Math.max(headBox.top,bodyBox.top,box.top+box.height*clip/100),bottom=Math.min(headBox.bottom,bodyBox.bottom,box.bottom),
   visible=style.visibility!=='hidden'&&style.display!=='none'&&Number(style.opacity)>0&&bottom-top>0.5,
   contains=(outer,inner)=>inner.left>=outer.left-0.75&&inner.right<=outer.right+0.75&&inner.top>=outer.top-0.75&&inner.bottom<=outer.bottom+0.75;
  const buttons=[...toolbar.querySelectorAll('button')].map(e=>{const r=rect(e),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {label:e.getAttribute('aria-label'),visible:r.width>0&&r.height>0&&contains(bodyBox,r)&&contains(bar,r),clickable:!e.closest('[inert]')&&!!hit&&e.contains(hit)}});
  return {width:innerWidth,outer:!!document.querySelector('.mobile-header'),titleVisible:!!title.getClientRects().length,
   barTop:bar.top,barHeight:bar.height,headHeight:headBox.height,firstTop:rect(p.querySelector('[data-plugin-group]')).top,
   left:box.left,toolbarRight:rect(toolbar).right,overlap:box.right>rect(toolbar).left&&Math.min(box.bottom,rect(toolbar).bottom)>Math.max(box.top,rect(toolbar).top),
   overflow:document.documentElement.scrollWidth>innerWidth+1,enabled:document.querySelector('[role=switch]').getAttribute('aria-checked'),
   scrollTop:body.scrollTop,visible,fullyVisible:visible&&top<=text.top+0.75&&bottom>=text.bottom-0.75&&text.left>=bodyBox.left&&text.right<=box.right+0.75,
   introInert:intro.inert,buttons,textTop:text.top,textBottom:text.bottom,clip,compact:b.hasAttribute('data-compact'),rest:Number.parseFloat(b.style.getPropertyValue('--plugin-header-rest-height'))};
 })()`);
 const snapshot=async meta=>({...await measure(),...meta});
 try {
  // Compare the product composition to the same official component without plugin-page overrides.
  for(const reference of [true,false])for(const dark of [false,true])for(const width of [320,390,768])for(const tabs of [false,true]){
   window.setContentSize(width,844);await window.loadFile(html,{query:{...(reference?{reference:'1'}:{}),...(tabs?{tabs:'1'}:{})}});
   await run(`document.documentElement.dataset.theme='${dark?'dark':'light'}';document.body.toggleAttribute('data-ds-dark-theme',${dark})`);
   await wait(`!!document.querySelector('[data-plugin-bar][data-natural]') && !!document.querySelector('[role=switch]')`);await settle();
   const meta={reference,dark,width,tabs},record=async phase=>rows.push(await snapshot({...meta,phase}));
   await record('initial');
   await run(`document.querySelector('.mobile-plugin-back').click()`);
   if(await run('window.pluginBackClicks')!==1)throw Error('Mobile Back failed');
   await run(`document.querySelector('[role=switch]').click()`);await settle();await record('enabled');
   await run('window.pluginHeaderFixture.setVisible(false)');await settle();
   await run('window.pluginHeaderFixture.remount()');await settle();
   await run('window.pluginHeaderFixture.setVisible(true)');await settle();await record('reentered');
   await run('window.pluginHeaderFixture.setStylesReady(false);window.pluginHeaderFixture.remount()');await settle();
   await run('window.pluginHeaderFixture.setStylesReady(true)');await settle();await record('late-styles');
   await run('window.pluginHeaderFixture.refreshStyles()');await settle();await record('refreshed');
   await run('window.pluginHeaderFixture.setScale(.95)');await settle();
   await run('window.pluginHeaderFixture.remount()');await settle();
   await run('window.pluginHeaderFixture.setScale(1)');await settle();await record('after-drawer-scale');
   for(const offset of [0,1,4,8,12,20,28,140,320,0]){
    await run(`document.querySelector('[data-plugin-body]').scrollTop=${offset}`);await settle();
    scrolling.push(await snapshot(meta));
    if(!reference&&width===390&&!tabs&&(offset===0||offset===140))writeFileSync(dirname(report)+'/'+(offset===0?'rest-':'scroll-')+(dark?'dark':'light')+'-390.png',(await window.webContents.capturePage()).toPNG());
   }
   await run('window.pluginHeaderFixture.setVisible(false)');await settle();await run('window.pluginHeaderFixture.setVisible(true)');await settle();await record('returned');
  }
  window.setContentSize(1000,844);await window.loadFile(html,{query:{desktop:'1'}});await wait(`!!document.querySelector('[data-plugin-bar][data-natural]')`);await settle();
  const desktop=await measure();await run(`document.querySelector('[data-plugin-body]').scrollTop=200`);await settle();
  const desktopScrolled=await measure();
  writeFileSync(report,JSON.stringify({rows,scrolling,desktop,desktopScrolled,errors},null,2));window.destroy();app.quit();
 }catch(error){console.error(error);writeFileSync(report,JSON.stringify({rows,scrolling,errors,failure:String(error)},null,2));app.exit(1)}
});
