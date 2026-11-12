const { app, BrowserWindow } = require('electron');
const { writeFileSync } = require('node:fs');
const { dirname } = require('node:path');
const { pathToFileURL } = require('node:url');
const [htmlPath, reportPath] = process.argv.slice(2);
app.setPath('userData', dirname(htmlPath)); app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show:false,width:1480,height:970,webPreferences:{sandbox:true,offscreen:true,backgroundThrottling:false} });
  const report = { measurements:[], actions:{}, errors:[], expectedDiagnostics:[] };
  win.webContents.on('console-message', ({level,message}) => {
    if(level!=='error') return;
    let action; try { if(message.startsWith('eleckoi-action ')) action=JSON.parse(message.slice(15)); } catch {}
    if(action?.action==='preset.save' && action.phase==='failure' && action.message==='合成保存失败') report.expectedDiagnostics.push(message);
    else report.errors.push(message);
  });
  const run = code => win.webContents.executeJavaScript(code), pause = ms => new Promise(resolve=>setTimeout(resolve,ms));
  const check = (value,message) => { if(!value) throw Error(message); };
  const settle = async () => { await run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))'); await pause(100); };
  const wait = async (code,message) => { for(let i=0;i<80;i++){if(await run(code))return;await pause(40);}throw Error(message); };
  const click = async selector => { await run(`document.querySelector(${JSON.stringify(selector)}).click()`); await settle(); };
  const scroll = async selector => { await run(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'})`); await settle(); };
  const load = async query => { await win.loadURL(pathToFileURL(htmlPath).href+query); await settle(); };
  const measure = async (label,kind) => {
    const data = await run(`(()=>{const v=window.editorViewFor(${JSON.stringify(label)}),h=v.dom;
      return {kind:${JSON.stringify(kind)},length:v.state.doc.length,lines:v.state.doc.lines,domLines:h.querySelectorAll('.cm-line').length,
        domText:h.textContent.length,instances:[...document.querySelectorAll('.cm-content')].filter(e=>e.getAttribute('aria-label')===${JSON.stringify(label)}).length,
        ending:v.state.doc.sliceString(Math.max(0,v.state.doc.length-50)),height:h.getBoundingClientRect().height};})()`);
    check(data.length>=500000 && data.domLines<100 && data.instances===1 && data.height>50, 'Viewport failed: '+JSON.stringify(data));
    check(data.domText<100000, 'Full long line expanded in DOM: '+JSON.stringify(data));
    report.measurements.push(data);
  };
  const append = async (label,marker) => { await run(`(()=>{const v=window.editorViewFor(${JSON.stringify(label)});v.dispatch({changes:{from:v.state.doc.length,insert:${JSON.stringify(marker)}}});})()`); await settle(); };
  const immersive = async label => {
    const selector = `.preset-composer-writing .setting-immersive-host button`;
    await click(selector);
    check(await run(`document.querySelectorAll('.immersive-markdown-editor .cm-content[aria-label="${label}"]').length===1 && [...document.querySelectorAll('.cm-content')].filter(e=>e.getAttribute('aria-label')===${JSON.stringify(label)}).length===1`),'Duplicate immersive '+label);
    await click('.immersive-markdown-exit');
  };
  try {
    await load('?large=profile&many=1&reset=1&blockDetail=1');
    await wait("!!document.querySelector('.preset-usage-copy .cm-editor')",'Read-only instructions');
    await measure('使用说明','usage-reading');
    await scroll('.preset-updates-expand'); await click('.preset-updates-expand');
    check(await run("!document.querySelector('.preset-update-note.preset-long-reading .cm-editor')&&window.presetReadCalls===0"),'Offscreen update mounted or display read full preset');
    await scroll('.preset-update-note.preset-long-reading'); await wait("!!document.querySelector('.preset-update-note .cm-editor')",'Read-only timeline');
    await measure('更新内容','timeline-reading'); report.actions.lazyReading=true;
    for(const single of [false,true]) {
      win.setContentSize(single?900:1480,single?650:970);
      await load('?view=preset-editor&preset=synthetic-preset&section=profile&large=profile&reset=1'+(single?'&single=1&theme=dark':''));
      await wait("!!document.querySelector('.preset-usage-section .preset-content-section-heading button')",'Profile editor');
      await click('.preset-usage-section .preset-content-section-heading button');
      await measure('使用说明',single?'usage-single-line':'usage-edit');
      await append('使用说明','说明末尾修改'); await immersive('使用说明');
      if(!single) {
        await run('window.saveFails=true'); await click('.preset-content-composer button[type=submit]');
        check(await run("(()=>{const d=window.editorViewFor('使用说明').state.doc;return d.sliceString(Math.max(0,d.length-30)).includes('说明末尾修改');})()"),'Failed save lost instructions');
        await run('window.saveFails=false');
      }
      await click('.preset-content-composer button[type=submit]');
      check(await run("window.savedPreset().profile.usageInstructions.endsWith('说明末尾修改')"),'Instructions truncated');
      if(!single) {
        await scroll('.preset-usage-section'); await click('.preset-usage-section .preset-content-section-heading button');
        await append('使用说明','应丢弃的草稿'); await click('.preset-content-composer .preset-content-actions button[type=button]');
        check(await run("!document.querySelector('.preset-content-composer')&&window.savedPreset().profile.usageInstructions.endsWith('说明末尾修改')"),'Cancel changed saved instructions');report.actions.cancelPreserved=true;
      }
      await scroll('.preset-update-edit'); await click('.preset-update-edit');
      await measure('更新内容',single?'timeline-single-line':'timeline-edit');
      await append('更新内容','更新末尾修改'); await immersive('更新内容'); await click('.preset-content-composer button[type=submit]');
      check(await run("window.savedPreset().profile.timeline[0].note.endsWith('更新末尾修改')&&window.savedPreset().profile.timeline[0].id==='update-1'&&window.savedPreset().profile.timeline[0].dateLabel==='2026-11-12'"),'Timeline body or identity changed');
      report.actions[single?'singleLineComplete':'multilineComplete']=true;
    }
    win.setContentSize(1480,970);
    await load('?view=preset-editor&preset=synthetic-preset&section=regex&large=regex&reset=1');
    await wait("!!document.querySelector('.regex-rule-row')",'Preset regex list'); await click('.regex-rule-row .rs-row-main');
    await measure('替换内容','preset-regex'); await append('替换内容','正则末尾修改');
    await click('.setting-directory .setting-library-save-button');
    check(await run("window.savedRegex().agentPresetRules[0].replacement.endsWith('正则末尾修改')&&!window.savedRegex().globalRules[0].replacement.includes('正则末尾修改')"),'Preset regex save scope or content');report.actions.presetRegex=true;
    await load('?view=preset-editor&preset=synthetic-preset&section=scripts&large=scripts&reset=1');
    await wait("!!document.querySelector('.script-list-name')",'Preset script list'); await click('.script-list-name');
    await measure('脚本源码','preset-script-source'); await append('脚本源码','脚本末尾修改');
    await run("[...document.querySelectorAll('.rs-script-tabs [role=tab]')].find(e=>e.textContent==='信息').click()"); await settle();
    check(await run("!document.querySelector('.cm-content[aria-label=脚本源码]')"),'Hidden source retained editor');
    await measure('脚本信息','preset-script-info'); await append('脚本信息','信息末尾修改');
    await run("[...document.querySelectorAll('.rs-script-tabs [role=tab]')].find(e=>e.textContent==='设置').click()"); await settle();
    await measure('脚本设置','preset-script-settings');
    await run("(()=>{const v=window.editorViewFor('脚本设置'),value=JSON.parse(v.state.doc.toString());value.complete=true;v.dispatch({changes:{from:0,to:v.state.doc.length,insert:JSON.stringify(value)}});})()"); await settle();
    await click('.setting-directory .setting-library-save-button');
    check(await run("(()=>{const s=window.savedScripts().trees[0];return s.content.endsWith('脚本末尾修改')&&s.info.endsWith('信息末尾修改')&&s.data.long.endsWith('完整原始末尾')&&s.data.complete===true;})()"),'Preset script fields truncated');report.actions.presetScripts=true;
    check(report.errors.length===0,'Browser errors: '+report.errors.join('\n')); report.passed=true;
  } catch(error) { report.passed=false; report.failure=error.stack; }
  writeFileSync(reportPath,JSON.stringify(report,null,2)); console.log(JSON.stringify(report)); win.destroy(); app.exit(report.passed?0:1);
});
