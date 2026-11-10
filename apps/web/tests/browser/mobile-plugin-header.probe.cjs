const {app,BrowserWindow}=require('electron');
const {writeFileSync}=require('node:fs');
const {dirname}=require('node:path');
const [html,report]=process.argv.slice(2);
app.setPath('userData',dirname(html)+'/profile');app.disableHardwareAcceleration();
app.whenReady().then(async()=>{
 const window=new BrowserWindow({show:false,webPreferences:{sandbox:true,backgroundThrottling:false}}),rows=[],scrolling=[],errors=[];
 window.webContents.on('console-message',details=>{if(details.level==='error'||details.level===3)errors.push(details.message)});
 const run=source=>window.webContents.executeJavaScript(source),pause=()=>new Promise(resolve=>setTimeout(resolve,80));
 const settleScroll=async offset=>{await run(`document.querySelector('[data-plugin-body]').scrollTop=${offset}`);await window.webContents.capturePage();await pause();await window.webContents.capturePage();await pause()};
 const wait=async source=>{for(let i=0;i<100;i++){if(await run(source))return;await pause()}throw Error('Plugin fixture not ready: '+source)};
 const measure=()=>run(`(()=>{const p=document.querySelector('[data-plugin-panel]'),b=p.querySelector('[data-plugin-bar]'),body=p.querySelector('[data-plugin-body]'),h=document.querySelector('.mobile-header'),title=b.querySelector('[data-plugin-header-part=title]'),intro=b.querySelector('[data-plugin-header-part=intro]'),toolbar=b.querySelector('[data-plugin-header-part=toolbar]'),rect=e=>e.getBoundingClientRect();const group=p.querySelector('[data-plugin-group]');return {width:innerWidth,outer:h?.getBoundingClientRect().height??0,titleVisible:!!title.getClientRects().length,barHeight:rect(b).height,barTop:rect(b).top,firstTop:rect(group).top,left:rect(intro).left,toolbarRight:rect(toolbar).right,overlap:rect(intro).right>rect(toolbar).left&&Math.min(rect(intro).bottom,rect(toolbar).bottom)>Math.max(rect(intro).top,rect(toolbar).top),overflow:document.documentElement.scrollWidth>innerWidth+1,enabled:document.querySelector('[role=switch]').getAttribute('aria-checked'),rest:Number.parseFloat(b.style.getPropertyValue('--plugin-header-rest-height'))}})()`);
 const measureIntro=()=>run(`(()=>{const b=document.querySelector('[data-plugin-bar]'),intro=b.querySelector('[data-plugin-header-part=intro]'),head=b.querySelector('header'),body=b.parentElement,style=getComputedStyle(intro),box=intro.getBoundingClientRect(),headBox=head.getBoundingClientRect(),bodyBox=body.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(intro.firstElementChild);const text=range.getBoundingClientRect(),clip=Number.parseFloat(style.clipPath.match(/^inset\\(([\\d.]+)%/)?.[1]??'0'),top=Math.max(headBox.top,bodyBox.top,box.top+box.height*clip/100),bottom=Math.min(headBox.bottom,bodyBox.bottom,box.bottom),visible=style.visibility!=='hidden'&&style.display!=='none'&&Number(style.opacity)>0&&bottom-top>0.5;return {scrollTop:body.scrollTop,visible,partiallyClipped:visible&&(top>text.top+0.75||bottom<text.bottom-0.75),textTop:text.top,textBottom:text.bottom,paintTop:top,paintBottom:bottom,clip,visibility:style.visibility}})()`);
 try {
  for(const dark of [false,true])for(const width of [320,390,768])for(const tabs of [false,true]){
   window.setContentSize(width,844);await window.loadFile(html,{query:tabs?{tabs:'1'}:{}});
   await run(`document.documentElement.dataset.theme='${dark?'dark':'light'}';document.body.toggleAttribute('data-ds-dark-theme',${dark})`);
   await wait(`!!document.querySelector('[data-plugin-bar][data-natural]') && !!document.querySelector('[role=switch]')`);await pause();
   rows.push({...await measure(),phase:'initial',dark,tabs});
   await run(`document.querySelector('[role=switch]').click()`);await pause();
   rows.push({...await measure(),phase:'enabled',dark,tabs});
   await run('window.pluginHeaderFixture.refreshStyles();window.pluginHeaderFixture.remount()');await pause();
   rows.push({...await measure(),phase:'remounted',dark,tabs});
   for(const offset of [0,1,4,8,12,20,28]){
    await settleScroll(offset);
    scrolling.push({...await measureIntro(),width,dark,tabs});
    if(width===390&&!tabs&&offset===12)writeFileSync(dirname(report)+'/scroll-'+(dark?'dark':'light')+'-390.png',(await window.webContents.capturePage()).toPNG());
   }
   await settleScroll(0);
   scrolling.push({...await measureIntro(),width,dark,tabs,restored:true});
   await run(`document.querySelector('[data-plugin-body]').scrollTop=140`);await window.webContents.capturePage();await pause();
   const scroll=await run(`(()=>{const b=document.querySelector('[data-plugin-bar]');const body=b.parentElement;return {scrollTop:body.scrollTop,clientHeight:body.clientHeight,scrollHeight:body.scrollHeight,compact:b.hasAttribute('data-compact'),introInert:b.querySelector('[data-plugin-header-part=intro]').inert,top:b.getBoundingClientRect().top}})()`);
   rows.push({...scroll,phase:'scrolled',width,dark,tabs});
  }
  window.setContentSize(1000,844);await window.loadFile(html,{query:{desktop:'1'}});await wait(`!!document.querySelector('[data-plugin-bar][data-natural]')`);await pause();
  const desktop=await measure();writeFileSync(report,JSON.stringify({rows,scrolling,desktop,errors},null,2));window.destroy();app.quit();
 }catch(error){console.error(error);writeFileSync(report,JSON.stringify({rows,scrolling,errors,failure:String(error)},null,2));app.exit(1)}
});
