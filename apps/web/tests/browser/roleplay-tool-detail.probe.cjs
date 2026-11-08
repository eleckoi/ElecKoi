const { app, BrowserWindow } = require('electron');
const { writeFileSync } = require('node:fs');
const { dirname } = require('node:path');
const { pathToFileURL } = require('node:url');
const [html, report] = process.argv.slice(2);
app.setPath('userData', dirname(html));
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true, sandbox: true, backgroundThrottling: false } });
  const run = source => win.webContents.executeJavaScript(source), pause = () => new Promise(resolve => setTimeout(resolve, 40));
  const rows = [], errors = [];
  win.webContents.on('console-message', details => { if (details.level === 'error' || details.level === 3) errors.push(details.message); });
  async function waitFor(source) {
    for (let n = 0; n < 100; n++) { if (await run(source)) return; await pause(); }
    throw new Error('Fixture did not reach: ' + source);
  }
  const sample = () => run(`new Promise(resolve => {const samples=[];let n=0;function frame(){
    const scroll=document.querySelector('.roleplay-result-detail-scroll'),space=scroll.firstElementChild;
    samples.push(JSON.stringify({width:scroll.clientWidth,height:space.style.height,scrollTop:scroll.scrollTop,
      parts:[...space.children].map(e=>[e.dataset.index,e.style.transform,e.getBoundingClientRect().height])}));
    if(++n<60)requestAnimationFrame(frame);else resolve([...new Set(samples)]);
  }requestAnimationFrame(frame)})`);
  try {
    for (const [domain, width] of [['variables', 390], ['variables', 1000], ['settings', 390]]) for (const dark of [false, true]) {
      win.setContentSize(width, 844);
      const url = pathToFileURL(html); url.searchParams.set('domain', domain); await win.loadURL(url.href);
      await run(`document.documentElement.dataset.eleckoiMobile=${JSON.stringify(width < 600 ? 'true' : 'false')};document.documentElement.dataset.theme=${JSON.stringify(dark ? 'dark' : 'light')};document.body.toggleAttribute('data-ds-dark-theme',${dark})`);
      await waitFor('Boolean(document.querySelector("[data-disclosure-row]"))');
      await run('document.querySelector("[data-disclosure-row]").click()');
      await waitFor('document.querySelectorAll(".roleplay-result-row").length > 2');
      await run('document.querySelectorAll(".roleplay-result-row")[2].click()');
      await run('document.fonts.ready');
      await new Promise(resolve => setTimeout(resolve, 350));
      const frameStates = await sample();
      const layout = await run(`(() => {const scroll=document.querySelector('.roleplay-result-detail-scroll'),parts=[...scroll.querySelectorAll('.roleplay-result-part')],rects=parts.map(e=>e.getBoundingClientRect());
        return {count:Number(document.querySelector('[data-result-count]').dataset.resultCount),falseValuePreserved:scroll.textContent.includes('false'),
          overlapping:rects.some((r,i)=>i>0&&r.top<rects[i-1].bottom-.5),horizontalOverflow:scroll.scrollWidth>scroll.clientWidth};})()`);
      let resizedFrameStates;
      if (domain === 'variables' && width === 390) {
        win.setContentSize(600, 700); await pause(); await pause(); resizedFrameStates = await sample();
        win.setContentSize(width, 844); await pause(); await pause();
      }
      await run(`(() => {const input=document.querySelector('.roleplay-result-toolbar input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(domain === 'variables' ? '字段127' : '设定85')});input.dispatchEvent(new Event('input',{bubbles:true}))})()`);
      await waitFor('document.querySelectorAll(".roleplay-result-row").length===1');
      await run('document.querySelector(".roleplay-result-row").click()');
      const tail = domain === 'variables' ? 'VARIABLE_TAIL_127' : 'SETTING_TAIL_085';
      let tailVisible = false;
      for (let n = 0; n < 30; n++) {
        tailVisible = await run(`document.querySelector('.roleplay-result-detail-scroll').textContent.includes(${JSON.stringify(tail)})`);
        if (tailVisible) break;
        await run(`{const scroll=document.querySelector('.roleplay-result-detail-scroll');scroll.scrollTop=scroll.scrollHeight;scroll.dispatchEvent(new Event('scroll'))}`); await pause();
      }
      const mountedParts = await run('document.querySelectorAll(".roleplay-result-part").length');
      await run('document.querySelector(".roleplay-result-back").click()');
      await waitFor('!document.querySelector(".roleplay-result-browser").hasAttribute("data-reading")');
      rows.push({domain,width,dark,frameStates,...layout,resizedFrameStates,tailVisible,mountedParts,returnedToDirectory:true});
    }
    writeFileSync(report, JSON.stringify({ rows, errors })); win.destroy(); app.exit(0);
  } catch (error) { console.error(error, errors); win.destroy(); app.exit(1); }
});
