const { app, BrowserWindow } = require('electron');
const { writeFileSync } = require('node:fs');
const { dirname, resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
app.disableHardwareAcceleration();
app.setPath('userData', resolve(dirname(process.argv[3]), 'mobile-profile'));
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 390, height: 844, webPreferences: { sandbox: true, offscreen: true, backgroundThrottling: false } });
  const report = { layouts: [], actions: {}, errors: [], screenshots: 'Not captured per user instruction' };
  win.webContents.on('console-message', ({ level, message }) => { if (level === 'error') report.errors.push(message); });
  const run = code => win.webContents.executeJavaScript(code);
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const settle = async () => { await pause(100); };
  const check = (value, message) => { if (!value) throw Error(message); };
  const wait = async (code, message) => { for (let i = 0; i < 60; i++) { if (await run(code).catch(() => false)) return; await pause(70); } throw Error(message); };
  const click = async selector => { await wait(`!!document.querySelector(${JSON.stringify(selector)})`, 'Missing control '+selector); await run(`document.querySelector(${JSON.stringify(selector)}).click()`); await settle(); };
  const textClick = async (selector, label) => { await wait(`Array.from(document.querySelectorAll(${JSON.stringify(selector)})).some(e=>e.textContent.trim()===${JSON.stringify(label)})`, 'Missing control '+label+' '+selector); await run(`Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(e=>e.textContent.trim()===${JSON.stringify(label)}).click()`); await settle(); };
  const category = (label) => textClick('.character-editor-navigation button', label);
  const save = () => textClick('.mobile-header-actions button', '保存');
  const back = () => click('.mobile-header [aria-label="返回"]');
  const edit = () => textClick('.mobile-editor-actions [role=toolbar] button', '编辑');
  const layout = () => run(`(()=>{const r=e=>e?.getBoundingClientRect().toJSON(),root=document.querySelector('.mobile-editor-document'),head=document.querySelector('.mobile-header'),save=Array.from(head.querySelectorAll('button')).find(e=>e.textContent==='保存'),scrollers=[...document.querySelectorAll('.cm-scroller')];return{width:innerWidth,height:innerHeight,root:r(root),header:r(head),save:r(save),overflow:document.documentElement.scrollWidth>innerWidth,detailOverflow:root&&root.scrollWidth>root.clientWidth,titleFont:root&&getComputedStyle(root.querySelector('.setting-document-title input,.setting-document-title h2')).fontSize,editors:document.querySelectorAll('.cm-editor').length,lineNodes:document.querySelectorAll('.cm-line').length,scrollers:scrollers.map(e=>({client:e.clientHeight,scroll:e.scrollHeight,overflow:getComputedStyle(e).overflowY}))}})()`);
  const checkDocument = async label => {
    const data = await layout();
    check(data.root && data.root.left >= 0 && data.root.right <= data.width + 1 && data.root.width >= data.width - 18 && !data.overflow && !data.detailOverflow && data.save.height >= 44 && data.save.right <= data.width, label + ': ' + JSON.stringify(data));
    return data;
  };
  try {
    for (const character of [false, true]) for (const [width, height, theme] of [[390,844,'light'],[320,568,'dark'],[768,1024,'light']]) {
      win.setContentSize(width,height);
      await win.loadURL(pathToFileURL(process.argv[2]).href + `?view=mobile-editor&mobile=1&reset=1&theme=${theme}${character?'&character=1':''}`);
      await wait("!!document.querySelector('.mobile-header')", 'Mobile header');
      check(await run("(()=>{const h=document.querySelector('.mobile-header h1').getBoundingClientRect(),a=document.querySelector('.mobile-header-actions').getBoundingClientRect();return h.right<=a.left+1})()"),'Header title overlaps save');
      await category(character?'设定库':'预设提示词', character);
      await wait("!!document.querySelector('.setting-library-tree-row')", 'Prompt list');
      check(await run("Array.from(document.querySelectorAll('.mobile-editor-actions [role=toolbar] button')).map(e=>e.textContent).join(',')==='新建,编辑,移动,删除,更多'"), 'Touch actions missing');
      await click('.setting-library-tree-row'); await edit();
      const data = await checkDocument('Prompt document');
      check(data.titleFont==='18px', 'Mobile title font');
      await click('.setting-glyph');
      check(await run("(()=>{const e=document.querySelector('.setting-entry-icons'),r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&Array.from(e.querySelectorAll('button')).every(b=>b.getBoundingClientRect().height>=44)})()"),'Icon picker exceeds viewport or touch size');
      await click('.setting-icon-close');
      await textClick('.setting-view-switch button','设置');
      await checkDocument('Prompt settings');
      await textClick('.setting-reading-settings button','提示词常驻');
      const placement = await run("(()=>{const e=document.querySelector('.setting-library-placement-rail'),p=e.parentElement,s=getComputedStyle(p);return{rect:e.getBoundingClientRect().toJSON(),client:e.clientWidth,scroll:e.scrollWidth,viewport:innerWidth,card:p.getBoundingClientRect().toJSON(),columns:s.gridTemplateColumns,column:getComputedStyle(e).gridColumn}})()");
      check(placement.rect.right<=placement.viewport&&placement.scroll<=placement.client, 'Placement controls overflow: '+JSON.stringify(placement));
      await save(); await back();
      check(await run("!document.querySelector('.editor-page-list').hidden"), 'List did not restore');
      if (character) {
        await category('变量',true); await wait("document.querySelectorAll('.variable-tree-row').length>1",'Variables');
        await run("Array.from(document.querySelectorAll('.variable-tree-row')).find(e=>e.textContent.includes('合成变量 1')).click()"); await edit();
        await checkDocument('Variable document');
        check(await run("document.querySelectorAll('.vv-long-input .cm-editor').length===2"),'Variable writing boards');
        await back();
        await category('开场白',true); await wait("!!document.querySelector('.opening-list-main')",'Openings');
        await click('.opening-list-main'); await edit(); await checkDocument('Opening document');
        check(await run("!document.querySelector('.opening-writing .rs-writing-heading')&&document.querySelector('.opening-body-label').textContent==='开场白正文'"),'Opening label inside input');
        await back();
      }
      for (const [section, row, tab] of [['正则','.regex-rule-row',null],['脚本','.script-list-name','设置']]) {
        await category(section,character); await wait(`!!document.querySelector('${row}')`,section+' list'); await click(row); await edit();
        await checkDocument(section);
        if (tab) { await textClick('.rs-script-tabs button',tab); await checkDocument(section+' settings'); check(await run("!Array.from(document.querySelectorAll('.rs-script-tabs button')).some(e=>e.textContent==='按钮')&&!!document.querySelector('.rs-buttons')"),'Script buttons were separated'); }
        await back();
      }
      data.character=character; data.theme=theme; report.layouts.push(data);
    }
    for (const character of [false,true]) {
      win.setContentSize(390,844);
      await win.loadURL(pathToFileURL(process.argv[2]).href+`?view=mobile-editor&mobile=1&reset=1&long=1${character?'&character=1':''}`); await settle();
      await category(character?'设定库':'预设提示词',character); await wait("!!document.querySelector('.setting-library-tree-row')",'Long list'); await click('.setting-library-tree-row'); await edit();
      await wait("!!window.editorView()",'Viewport editor');
      check(await run("document.querySelectorAll('.cm-line').length<100&&window.editorView().state.doc.lines===100001"),'Long text was rendered entirely');
      await run("(()=>{const v=window.editorView();v.dispatch({changes:{from:v.state.doc.length,insert:'手机末尾修改'}})})()"); await settle();
      await click('.setting-immersive-host button');
      check(await run("getComputedStyle(document.querySelector('.immersive-markdown-editor .cm-scroller')).scrollbarWidth==='none'"),'Mobile immersion retained desktop scrollbar');
      check(await run("document.querySelectorAll('.cm-editor').length===1&&window.editorView().state.doc.toString().endsWith('手机末尾修改')"),'Immersion duplicated/lost text');
      await run('window.mobileBack()'); await settle();
      check(await run("!document.querySelector('.immersive-markdown-editor')&&!!document.querySelector('.mobile-editor-document')"),'Android back left the entry instead of immersion');
      win.setContentSize(390,320); await settle(); await checkDocument('Keyboard-height document');
      await save(); await back();
      check(await run(character?"window.savedMobileRecords.settings().entries[0].content.endsWith('手机末尾修改')":"window.savedPreset().entries[0].content.endsWith('手机末尾修改')"),'Long save lost tail');
      if(character) {
        await category('变量',true); await wait("document.querySelectorAll('.variable-tree-row').length>1",'Long variables');
        await run("Array.from(document.querySelectorAll('.variable-tree-row')).find(e=>e.textContent.includes('合成变量 1')).click()"); await edit();
        check(await run("window.editorViewFor('说明').state.doc.lines===100001&&window.editorViewFor('更新规则').state.doc.lines===100001&&document.querySelectorAll('.cm-line').length<180"),'Long variable boards');
        await back(); await category('开场白',true); await click('.opening-list-main'); await edit();
        check(await run("window.editorViewFor('开场白正文').state.doc.lines===100001&&document.querySelectorAll('.cm-line').length<100"),'Long opening board');
      }
      report.actions[character?'characterLongText':'presetLongText']=true;
    }
    for(const kind of ['regex','scripts','profile']) {
      win.setContentSize(390,844);
      await win.loadURL(pathToFileURL(process.argv[2]).href+`?view=mobile-editor&mobile=1&reset=1&large=${kind}`);
      await wait("!!document.querySelector('#preset-editor-navigation')",'Preset category');
      if(kind==='profile') {
        await wait("!!window.editorViewFor('使用说明')",'Long readable instructions');
        check(await run("window.editorViewFor('使用说明').state.doc.lines===100001&&document.querySelectorAll('.cm-line').length<180"),'Readonly mobile usage did not use a viewport');
        await click('.preset-usage-section .is-section-action');
        check(await run("document.querySelector('.preset-content-composer .cm-content').getAttribute('aria-readonly')==='false'"),'Usage composer not editable');
      } else {
        await category(kind==='regex'?'正则':'脚本',false);
        await click(kind==='regex'?'.regex-rule-row':'.script-list-name'); await edit();
        const label=kind==='regex'?'替换内容':'脚本源码';
        check(await run(`window.editorViewFor('${label}').state.doc.lines===100001&&document.querySelectorAll('.cm-line').length<180`),'Long '+kind+' not viewport-rendered');
        await run(`(()=>{const v=window.editorViewFor('${label}');v.dispatch({changes:{from:v.state.doc.length,insert:'完整手机尾部'}})})()`); await settle();
        await save();
        check(await run(kind==='regex'?"window.savedRegex().agentPresetRules[0].replacement.endsWith('完整手机尾部')":"window.savedScripts().trees[0].content.endsWith('完整手机尾部')"),'Long '+kind+' lost saved tail');
      }
      report.actions['mobileLong'+kind]=true;
    }
    check(report.errors.length===0, report.errors.join('\n'));
    report.actions.phoneNavigation=true; report.actions.topSave=true; report.actions.touchBar=true; report.actions.narrowLayout=true;
    report.passed=true;
  } catch(error) { report.failure=error.stack||String(error); report.passed=false; }
  writeFileSync(process.argv[3],JSON.stringify(report,null,2)); win.destroy(); app.exit(report.passed?0:1);
});
