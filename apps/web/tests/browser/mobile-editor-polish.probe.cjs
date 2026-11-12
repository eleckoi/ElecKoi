const { app, BrowserWindow } = require('electron');
const { writeFileSync } = require('node:fs');
const { dirname, resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
app.disableHardwareAcceleration();
app.setPath('userData', resolve(dirname(process.argv[3]), 'polish-profile'));
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 390, height: 844, webPreferences: { sandbox: true, offscreen: true, backgroundThrottling: false } });
  const report = { layouts: [], screenshots: false };
  const run = code => win.webContents.executeJavaScript(code);
  const settle = () => new Promise(resolve => setTimeout(resolve, 100));
  const check = (value, message) => { if (!value) throw Error(message); };
  const clickText = async (selector, text) => {
    for (let i = 0; i < 60; i++) {
      if (await run(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.textContent.trim()===${JSON.stringify(text)});if(!e)return false;e.click();return true})()`)) { await settle(); return; }
      await settle();
    }
    throw Error('Missing '+text);
  };
  try {
    for (const character of [false,true]) for (const [width,height,theme] of [[390,844,'light'],[320,568,'dark'],[768,1024,'light']]) {
    win.setContentSize(width,height);
    await win.loadURL(pathToFileURL(process.argv[2]).href+`?view=mobile-editor&mobile=1&reset=1&theme=${theme}${character?'&character=1':''}`);
    await clickText('.character-editor-navigation button',character?'设定库':'预设提示词');
    const collections=character?['设定库','变量','正则','脚本','开场白']:['预设提示词','工具','正则','脚本'];
    const headers=[];
    for(const title of collections) {
      await clickText('.character-editor-navigation button',title);
      const data=await run(`(()=>{const h=document.querySelector('.is-mobile-collection'),search=h.querySelector('input'),top=h.querySelector('.editor-collection-topline'),r=e=>e.getBoundingClientRect().toJSON(),buttons=[...top.querySelectorAll('button')];return {title:${JSON.stringify(title)},header:r(h),search:r(search),searchBox:r(h.querySelector('.editor-collection-search')),divider:getComputedStyle(h).borderBottomWidth,top:r(top),buttons:buttons.map(r),bottom:document.querySelector('.mobile-editor-actions')?.getBoundingClientRect().bottom,overflow:document.documentElement.scrollWidth>innerWidth,oldToolbar:!!document.querySelector('.editor-collection-action'),topNewCount:h.querySelectorAll('[aria-label=新建]').length}})()`);
      check(data.divider==='0px'&&data.searchBox.height>=44&&Math.abs(data.searchBox.width-data.top.width)<1&&data.topNewCount===0&&!data.overflow&&!data.oldToolbar&&data.search.top>=data.top.bottom+8&&data.buttons.every(b=>b.height>=40&&b.left>=data.header.left&&b.right<=data.header.right), 'Collection header: '+JSON.stringify(data));
      if(data.bottom)check(Math.abs(height-data.bottom)<=2,'Touch toolbar does not reach the phone bottom: '+JSON.stringify(data));
      headers.push(data);
      if(!['工具','开场白'].includes(title)) {
        await run("document.querySelector('.editor-collection-more').click()");await settle();
        await clickText('[role=menu] [role=menuitem]','多选');
        const cancel=await run(`(()=>{const bar=document.querySelector('.editor-selection-bar'),button=bar.querySelector('.editor-selection-cancel'),r=e=>e.getBoundingClientRect().toJSON();return{bar:r(bar),button:r(button),all:r(bar.querySelector('label')),disabled:button.disabled,buttons:[...bar.querySelectorAll('button')].map(r)}})()`);
        check(!cancel.disabled&&cancel.button.top>=cancel.all.bottom&&cancel.buttons.every(b=>b.height>=44&&b.left>=cancel.bar.left&&b.right<=cancel.bar.right),'Missing or overflowing cancel under select-all: '+JSON.stringify(cancel));
        await clickText('.editor-selection-bar button','取消');
        check(await run("!document.querySelector('.editor-selection-bar')&&!!document.querySelector('.mobile-editor-actions')"),'Zero-selection cancel did not restore touch actions');
        await run("document.querySelector('.editor-collection-more').click()");await settle();
        await clickText('[role=menu] [role=menuitem]','多选');
        await run("document.querySelector('.editor-selection-bar input').click()");await settle();
        await clickText('.editor-selection-bar button','取消');
        check(await run("!document.querySelector('.editor-selection-bar')&&!document.querySelector('.editor-selection-checkbox')"),'Cancel retained multi-selection checkboxes');
        data.selectionCancel=cancel;
      }
    }
    const rail=await run(`(()=>{const e=document.querySelector('.character-editor-side-panel');return e.getBoundingClientRect().width})()`);
    await run("document.querySelector('.character-editor-sidebar-toggle').click()");await settle();
    const collapsed=await run("document.querySelector('.character-editor-side-panel').getBoundingClientRect().width");
    check(collapsed<rail,'Rail did not collapse');
    await run("document.querySelector('.character-editor-sidebar-toggle').click()");await settle();
    await clickText('.character-editor-navigation button',character?'设定库':'预设提示词');
    await run("document.querySelector('.setting-library-tree-row').click()");
    await clickText('.mobile-editor-actions button','编辑');
    check(await run("document.querySelector('.character-editor-side-panel').getBoundingClientRect().width===0"),'Rail stayed visible on detail');
    await clickText('.setting-view-switch button','设置');
    await clickText('.setting-reading-settings button','Agent 读取');
    await clickText('.setting-reading-settings button','选读');
    await run("document.querySelector('.setting-reading-settings [role=switch]').click()");await settle();
    for(const keyword of ['书店','雨巷','打烊']) {
      await run(`(()=>{const input=document.querySelector('.setting-keywords-inline > .setting-library-keyword-field input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(keyword)});input.dispatchEvent(new Event('input',{bubbles:true}))})()`);await settle();
      await run("document.querySelector('.setting-keywords-inline > .setting-library-keyword-field input').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))");await settle();
    }
    await run("document.querySelector('.setting-keyword-details').open=true");await settle();
    await run("document.querySelector('.setting-keyword-details [role=switch]').click()");await settle();
    const geometry=await run(`(()=>{const card=document.querySelector('.setting-settings-board'),doc=document.querySelector('.mobile-editor-document'),r=e=>e.getBoundingClientRect(),c=r(card),fields=[...card.querySelectorAll('input,select,button[role=switch]')].filter(e=>r(e).height),last=Math.max(...fields.map(e=>r(e).bottom));return {cardHeight:c.height,maxHeight:getComputedStyle(card).maxHeight,contentBottom:last,cardBottom:c.bottom,overflow:last>c.bottom,keywordColumns:getComputedStyle(card.querySelector('.setting-library-keyword-field')).gridTemplateColumns,switches:[...card.querySelectorAll('.setting-property-row:has(> button[role=switch])')].map(row=>({row:r(row).toJSON(),control:r(row.querySelector('button')).toJSON()})),documentBottom:r(doc).bottom,width:innerWidth,scrollOverflow:doc.scrollWidth>doc.clientWidth}})()`);
    check(!geometry.overflow&&!geometry.scrollOverflow&&Math.abs(height-geometry.documentBottom)<=2&&geometry.switches.every(s=>s.control.top>=s.row.top&&s.control.bottom<=s.row.bottom),'Expanded form: '+JSON.stringify(geometry));
    await run("document.querySelector('.mobile-editor-document').scrollTop=1e6");await settle();
    check(await run("(()=>{const d=document.querySelector('.mobile-editor-document'),b=document.querySelector('.setting-settings-board');return b.getBoundingClientRect().bottom<=d.getBoundingClientRect().bottom-12})()"),'Expanded form has no end padding');
    await clickText('.mobile-header-actions button','保存');
    check(await run(`(()=>{const e=(${character?'window.savedMobileRecords.settings()':'window.savedPreset()'}).entries.find(e=>e.id==='entry-0');return e.agentReadStrategy==='keyword'&&e.keywordRecursionDepth===1&&['书店','雨巷','打烊'].every(k=>e.keywords.includes(k))})()`),'Expanded keyword/recursive draft did not save');
    await run("document.querySelector('.mobile-header [aria-label=返回]').click()");await settle();
    check(await run("document.querySelector('.character-editor-side-panel').getBoundingClientRect().width>0&&!document.querySelector('.editor-page-list').hidden"),'List/rail did not restore');
    report.layouts.push({character,width,height,theme,headers,rail,collapsed,geometry});
    }
    report.passed=true;
  } catch(error) { report.failure=error.stack||String(error); report.passed=false; }
  writeFileSync(process.argv[3],JSON.stringify(report,null,2));win.destroy();app.exit(report.passed?0:1);
});
