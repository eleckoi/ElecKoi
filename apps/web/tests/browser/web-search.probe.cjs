const { app, BrowserWindow } = require('electron');
const { mkdirSync, writeFileSync } = require('node:fs');
const { dirname, join } = require('node:path');
const { pathToFileURL } = require('node:url');
const [html, report, artifacts] = process.argv.slice(2);
app.setPath('userData', join(dirname(html), 'browser-profile'));
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 390, height: 1000, webPreferences: { sandbox: true, backgroundThrottling: false } });
  const run = source => win.webContents.executeJavaScript(source);
  const waitFor = async source => {
    for (let i = 0; i < 100; i++) {
      if (await run(source)) return;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error('UI condition did not settle: ' + source);
  };
  const choose = async name => {
    await run(`[...document.querySelectorAll('.web-search-mode button')].find(n=>n.querySelector('strong')?.textContent===${JSON.stringify(name)}).click()`);
    await waitFor(`document.querySelector('.web-search-config')?.getAttribute('aria-busy')==='false'`);
  };
  const configure = () => run(`[...document.querySelectorAll('button')].find(n=>n.textContent==='前往官方插件配置').click()`);
  const selection = () => run(`({mode:window.webSearchFixture.getSnapshot().mode,fetchMode:window.webSearchFixture.getSnapshot().fetchMode,selected:document.querySelector('.web-search-mode [aria-pressed="true"] strong')?.textContent})`);
  try {
    await win.loadURL(pathToFileURL(html).href);
    for (let i = 0; i < 100 && !await run('!!document.querySelector(".web-search-config")'); i++) await new Promise(resolve => setTimeout(resolve, 20));
    const layouts = [];
    for (const theme of ['light', 'dark']) for (const width of [320, 390, 1000]) {
      win.setContentSize(width, 1100);
      await run(`document.documentElement.dataset.theme='${theme}';document.querySelector('main').classList.toggle('mobile-agent-tools',${width < 600})`);
      layouts.push(await run(`({theme:'${theme}', width:${width}, documentWidth:document.documentElement.scrollWidth, viewport:innerWidth, controls:[...document.querySelectorAll('input,button')].map(n=>({left:n.getBoundingClientRect().left,right:n.getBoundingClientRect().right,label:n.getAttribute('aria-label')||n.textContent}))})`));
      if (artifacts && ((theme === 'light' && width === 320) || (theme === 'dark' && width === 1000))) {
        mkdirSync(artifacts, { recursive: true });
        writeFileSync(join(artifacts, `${theme}-${width}.png`), (await win.webContents.capturePage()).toPNG());
      }
    }
    const officialOnly = await run(`({inputs:document.querySelectorAll('input').length,search:[...document.querySelectorAll('[aria-label="搜索方式"] strong')].map(n=>n.textContent),buttons:document.querySelectorAll('.web-search-config button').length,fetch:document.querySelectorAll('[aria-label="网页抓取方式"]').length})`);
    await choose('Tavily');
    await waitFor(`!!document.querySelector('[aria-label="Tavily API Key"]')`);
    await run('window.webSearchFixture.setAllowNavigation(false)');
    await choose('DeepSeek');
    await waitFor(`document.querySelector('.web-search-mode [aria-pressed="true"] strong')?.textContent==='DeepSeek'`);
    const selected = { ...await selection(), navigationCalls: await run('window.webSearchFixture.calls.filter(call=>call.open||call.closed||call.guard).length') };
    await run('window.webSearchFixture.reopen()');
    await waitFor(`!![...document.querySelectorAll('button')].find(n=>n.textContent==='前往官方插件配置')`);
    const reopened = await selection();
    await configure();
    const blockedNavigation = await run('window.webSearchFixture.calls.filter(call=>call.open).length');
    await run('window.webSearchFixture.setAllowNavigation(true)');
    await configure();
    const configured = { ...await selection(), opens: await run('window.webSearchFixture.calls.filter(call=>call.open).length') };
    await run(`window.webSearchFixture.publish({mode:'deepseek_search_api',fetchMode:'deepseek_fetch_api'})`);
    await waitFor(`document.querySelector('.web-search-mode button span')?.textContent==='Web 搜索 API'`);
    const updatesBefore = await run('window.webSearchFixture.calls.filter(call=>call.mode).length');
    await choose('DeepSeek');
    const existingApi = { ...await selection(), extraUpdates: await run('window.webSearchFixture.calls.filter(call=>call.mode).length') - updatesBefore };
    await choose('Tavily');
    await waitFor(`!!document.querySelector('[aria-label="Tavily API Key"]')`);
    await run('window.webSearchFixture.failNextUpdate()');
    await choose('DeepSeek');
    await waitFor(`document.querySelector('[role="alert"]')?.textContent==='合成保存失败'`);
    const failed = { ...await selection(), error: await run(`document.querySelector('[role="alert"]').textContent`) };
    await run('window.webSearchFixture.publish({writable:false})');
    await waitFor(`document.querySelector('.web-search-mode button').disabled`);
    const readOnly = await run(`[...document.querySelectorAll('.web-search-mode button')].every(n=>n.disabled)`);
    await run('window.webSearchFixture.publish({writable:true})');
    await waitFor(`!document.querySelector('.web-search-mode button').disabled`);
    await run(`(() => { const n=document.querySelector('[aria-label="返回结果数量"]');n.focus();n.select(); })()`);
    await win.webContents.insertText('2');
    await new Promise(resolve => setTimeout(resolve, 30));
    await win.webContents.insertText('0');
    await new Promise(resolve => setTimeout(resolve, 30));
    const countSnapshot = await run(`({value:document.querySelector('[aria-label="返回结果数量"]').value})`);
    // This hidden test window has no OS focus; emit the field's focusout explicitly.
    await run(`(() => { const n=document.querySelector('[aria-label="返回结果数量"]');n.blur();n.dispatchEvent(new FocusEvent('focusout',{bubbles:true})); })()`);
    await new Promise(resolve => setTimeout(resolve, 30));
    await run(`const n=document.querySelector('[aria-label="Tavily API Key"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,'synthetic-key');n.dispatchEvent(new Event('input',{bubbles:true}));`);
    await new Promise(resolve => setTimeout(resolve, 30));
    await run(`[...document.querySelectorAll('button')].find(n=>n.textContent==='保存并测试').click()`);
    await new Promise(resolve => setTimeout(resolve, 50));
    writeFileSync(report, JSON.stringify({ layouts, officialOnly, selected, reopened, blockedNavigation, configured, existingApi, failed, readOnly, countSnapshot, calls: await run('window.webSearchFixture.calls'), message: await run('document.body.textContent'), cleared: await run(`document.querySelector('[aria-label="Tavily API Key"]').value===''`) }));
    win.destroy(); app.exit(0);
  } catch (error) { console.error(error); app.exit(1); }
});
