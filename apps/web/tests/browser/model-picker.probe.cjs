const {app,BrowserWindow}=require('electron');
const {writeFileSync}=require('node:fs');
const {join,dirname}=require('node:path');
const [html,report]=process.argv.slice(2);
app.setPath('userData',join(dirname(html),'browser-profile'));
app.disableHardwareAcceleration();
app.whenReady().then(async()=>{
  const window=new BrowserWindow({show:false,width:1000,height:800,webPreferences:{sandbox:true,backgroundThrottling:false}});
  const run=source=>window.webContents.executeJavaScript(source);
  const settle=()=>new Promise(resolve=>setTimeout(resolve,70));
  try{
    await window.loadFile(html);
    for(let i=0;i<100&&!await run('!!document.querySelector(".chat-model-trigger")');i++)await settle();
    const layouts=[];
    for(const theme of ['light','dark'])for(const [width,height]of [[1000,800],[600,500],[350,350]]){
      await run(`document.documentElement.dataset.theme='${theme}';document.body.toggleAttribute('data-ds-dark-theme','${theme}'==='dark')`);window.setContentSize(width,height);await settle();
      await run(`document.querySelector('.chat-model-trigger').click()`);await settle();
      for(const tab of ['models','parameters']){
        if(tab==='parameters')await run(`document.querySelectorAll('.chat-model-tabs button')[1].click()`);
        if(tab==='parameters')await run(`document.querySelector('.chat-model-capabilities').open=true`);
        await window.webContents.capturePage();
        await settle();
        layouts.push(await run(`(()=>{
          const panel=document.querySelector('.chat-model-panel'),p=panel.getBoundingClientRect(),anchor=document.querySelector('.chat-model-picker').getBoundingClientRect(),css=getComputedStyle(panel),material=panel.querySelector('[aria-hidden="true"]'),scroll=panel.querySelector('.chat-model-list,.chat-model-parameters'),footer=panel.querySelector('footer');
          return {theme:'${theme}',width:innerWidth,height:innerHeight,tab:'${tab}',left:p.left,right:p.right,top:p.top,bottom:p.bottom,
            panelWidth:p.width,panelHeight:p.height,radius:css.borderRadius,surface:css.backgroundColor,
            material:panel.dataset.menuMaterial,materialFill:getComputedStyle(material).backgroundColor,materialFilter:getComputedStyle(material).backdropFilter,
            scrollWidth:getComputedStyle(scroll,'::-webkit-scrollbar').width,scrollRadius:getComputedStyle(scroll,'::-webkit-scrollbar-thumb').borderRadius,standardScrollWidth:getComputedStyle(scroll).scrollbarWidth,
            footerGap:footer.querySelector('button').getBoundingClientRect().top-scroll.getBoundingClientRect().bottom,
            duplicateCapabilityTitle:panel.textContent.includes('模型能力声明'),
            checkboxFill:panel.querySelector('.chat-model-capability-box')?getComputedStyle(panel.querySelector('.chat-model-capability-box')).backgroundColor:null,
            checkboxInk:panel.querySelector('.chat-model-capability-box')?getComputedStyle(panel.querySelector('.chat-model-capability-box')).color:null,
            fieldSurface:panel.querySelector('[data-parameter] input')?getComputedStyle(panel.querySelector('[data-parameter] input')).backgroundColor:null,
            anchorRight:anchor.right,anchorTop:anchor.top,backdrops:document.querySelectorAll('.chat-model-backdrop').length,
            groupIcons:panel.querySelectorAll('h3 img').length,rowIcons:panel.querySelectorAll('.chat-model-row img').length,
            fieldOrder:[...panel.querySelectorAll('[data-parameter]')].map(node=>node.dataset.parameter),
            fieldBorders:[...panel.querySelectorAll('[data-parameter]')].map(node=>getComputedStyle(node).borderBottomWidth),
            checkboxRadius:panel.querySelector('.chat-model-capability-box')?getComputedStyle(panel.querySelector('.chat-model-capability-box')).borderRadius:null};
        })()`));
      }
      await run(`document.querySelector('.chat-model-close').click()`);await settle();
    }
    window.setContentSize(1000,800);await settle();
    await run(`document.querySelector('.chat-model-trigger').click()`);await settle();
    await run(`document.querySelectorAll('.chat-model-row')[1].click();document.querySelectorAll('.chat-model-tabs button')[1].click()`);await settle();
    // `insertText` 走键盘输入那条路，窗口不是焦点窗口时（`show:false` 在 Windows 上就是）
    // 没有接收者，文字进不去，温度读回来是 undefined。按 settings-companion.probe.cjs 的做法
    // 直接设值再派发 input 事件：不依赖窗口焦点，两个平台一致。
    await run(`(()=>{const input=document.querySelector('[data-parameter="temperature"] input');
      const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
      input.focus();input.select();setter.call(input,'0.72');
      input.dispatchEvent(new Event('input',{bubbles:true}));})()`);await settle();
    await run(`document.querySelector('.chat-model-close').click()`);await settle();
    const guarded=await run(`!!document.querySelector('[role="alertdialog"]')`);
    await run(`[...document.querySelectorAll('[role="alertdialog"] button')].find(button=>button.textContent==='取消').click()`);await settle();
    await run(`document.querySelector('.chat-model-save').click()`);await settle();
    writeFileSync(report,JSON.stringify({layouts,guarded,calls:await run('window.modelPickerFixture.calls')}));
    window.destroy();app.exit(0);
  }catch(error){console.error(error);app.exit(1)}
});
