const { app, BrowserWindow } = require('electron');
const { writeFileSync } = require('node:fs');
const { dirname, join } = require('node:path');
const { pathToFileURL } = require('node:url');
const [html, reportPath] = process.argv.slice(2);
app.setPath('userData', join(dirname(html), 'profile')); app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, offscreen: true, backgroundThrottling: false } });
  const run = code => win.webContents.executeJavaScript(code), report = { cases: [], errors: [] };
  win.webContents.on('console-message', event => { if (event.level === 'error') report.errors.push(event.message); });
  const wait = async code => { for (let i=0; i<120; i++) { if (await run(code)) return; await new Promise(resolve => setTimeout(resolve, 20)); } throw Error(code); };
  const textClick = async (selector, text) => {
    const code = `[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.textContent.trim()===${JSON.stringify(text)})`;
    await wait(`!!(${code})`); await run(`(${code}).click()`);
  };
  try {
    await win.loadURL(pathToFileURL(html).href);
    await win.webContents.insertCSS('*,*::before,*::after{transition:none!important;animation:none!important}');
    for (const theme of ['light','dark']) for (const width of [320,390,1200]) for (const kind of ['settings','variables']) {
      const compact = width < 600, key = `${kind}:character:${compact}`;
      win.setContentSize(width, 844);
      await run(`document.documentElement.dataset.theme='${theme}';document.body.toggleAttribute('data-ds-dark-theme',${theme==='dark'});document.documentElement.dataset.eleckoiMobile='${compact}';document.querySelector('[data-editor="${key}"]').click()`);
      await wait(`document.querySelector('main').dataset.current==='${key}'&&!!document.querySelector('${compact ? '.mobile-editor-actions' : '.setting-create'}')`);
      await textClick(compact ? '.mobile-editor-actions [role=toolbar] button' : '.setting-create', '新建');
      const item = kind === 'variables' ? '变量' : '设定';
      await wait(`!!document.querySelector('[role=menu]')`);
      const shadow = compact ? await run(`(()=>{const e=document.querySelector('.mobile-editor-action-menu'),r=document.createElement('span');r.style.cssText='--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);box-shadow:var(--dsw-elevation-prominent)';document.body.append(r);const v={actual:getComputedStyle(e).boxShadow,official:getComputedStyle(r).boxShadow,toolbar:getComputedStyle(document.querySelector('.mobile-editor-actions [role=toolbar]')).boxShadow};r.remove();return v})()`) : null;
      if (compact && theme==='dark' && width===390 && kind==='settings') { await new Promise(resolve => setTimeout(resolve, 80)); writeFileSync(join(dirname(html),'menu-dark.png'),(await win.webContents.capturePage()).toPNG()); }
      await textClick('[role=menu] [role=menuitem]', item);
      const inputLabel = kind === 'variables' ? '当前变量名称' : '条目标题';
      await wait(`!!document.querySelector('[aria-label="${inputLabel}"]')`);
      await new Promise(resolve => setTimeout(resolve, 60));
      const selection = await run(`(()=>{const e=document.querySelector('[aria-label="${inputLabel}"]');return {value:e.value,start:e.selectionStart,end:e.selectionEnd,focused:document.activeElement===e}})()`);
      if (compact) { await run('document.querySelector("[data-fixture-back]").click()'); await wait('!document.querySelector(".editor-page-detail")'); }
      let alignment = null;
      if (kind === 'variables') {
        alignment = await run(`(()=>{const rows=[...document.querySelectorAll('.variable-tree-row')],at=r=>({icon:r.querySelector('.variable-tree-icon').getBoundingClientRect().left,title:r.querySelector('.variable-tree-label').getBoundingClientRect().left});return {fixed:at(rows.find(r=>r.dataset.reorderFixed==='true')),variable:at(rows.find(r=>r.dataset.reorderFixed!=='true'))}})()`);
        await textClick(compact ? '.mobile-editor-actions [role=toolbar] button' : '.setting-create', '新建');
        await textClick('[role=menu] [role=menuitem]', '变量组');
        await wait('!!document.querySelector("[aria-label=当前变量名称]")');
        if (compact) { await run('document.querySelector("[data-fixture-back]").click()'); await wait('!document.querySelector(".editor-page-detail")'); }
        alignment.group = await run(`(()=>{const row=[...document.querySelectorAll('.variable-tree-row')].find(r=>r.textContent.includes('新建变量组'));return {icon:row.querySelector('.variable-tree-icon').getBoundingClientRect().left,title:row.querySelector('.variable-tree-label').getBoundingClientRect().left}})()`);
        if (theme==='dark' && [390,1200].includes(width)) { await new Promise(resolve => setTimeout(resolve, 80)); writeFileSync(join(dirname(html),`variables-${width}.png`),(await win.webContents.capturePage()).toPNG()); }
      }
      report.cases.push({ theme, width, kind, selection, shadow, alignment });
    }
    report.passed = true;
  } catch(error) { report.failure = error.stack || String(error); report.passed = false; }
  writeFileSync(reportPath, JSON.stringify(report,null,2)); win.destroy(); app.exit(report.passed ? 0 : 1);
});
