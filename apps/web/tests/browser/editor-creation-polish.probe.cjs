const { app, BrowserWindow } = require('electron');
const { writeFileSync } = require('node:fs');
const { dirname, join } = require('node:path');
const { pathToFileURL } = require('node:url');
const [html, reportPath] = process.argv.slice(2);
app.setPath('userData', join(dirname(html), 'profile')); app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, offscreen: true, backgroundThrottling: false } });
  const run = code => win.webContents.executeJavaScript(code), report = { chrome: process.versions.chrome, cases: [], assetMenus: [], assetItemMenus: [], errors: [] };
  win.webContents.on('console-message', (event, level, message) => {
    if (event.level === 'error' || level === 3) report.errors.push(event.message ?? message);
  });
  const wait = async code => { for (let i=0; i<120; i++) { if (await run(code)) return; await new Promise(resolve => setTimeout(resolve, 20)); } throw Error(code); };
  const textClick = async (selector, text) => {
    const code = `[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.textContent.trim()===${JSON.stringify(text)})`;
    await wait(`!!(${code})`); await run(`(${code}).click()`);
  };
  try {
    const cdp = win.webContents.debugger;
    cdp.attach('1.3');
    cdp.on('message', (_event, method, { requestId }) => {
      if (method === 'Fetch.requestPaused') void cdp.sendCommand('Fetch.fulfillRequest', {
        requestId, responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'image/svg+xml' }],
        body: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#89abc2"/></svg>').toString('base64'),
      }).catch(error => report.errors.push(error.message));
    });
    await cdp.sendCommand('Fetch.enable', { patterns: [{ urlPattern: '*/eleckoi/character-assets/*' }] });
    await win.loadURL(pathToFileURL(html).href);
    await win.webContents.insertCSS('*,*::before,*::after{transition:none!important;animation:none!important}');
    report.anchorSupport = await run('CSS.supports("top", "max(8px, calc(anchor(bottom) + 7px))")');
    for (const theme of ['light','dark']) for (const width of [320,390,1200]) for (const kind of ['settings','variables','prompts']) {
      const compact = width < 600, key = `${kind}:character:${compact}`;
      win.setContentSize(width, 844);
      await run(`document.documentElement.dataset.theme='${theme}';document.body.toggleAttribute('data-ds-dark-theme',${theme==='dark'});document.documentElement.dataset.eleckoiMobile='${compact}';document.querySelector('[data-editor="${key}"]').click()`);
      const createSelector = compact ? '.mobile-editor-actions [role=toolbar] button' : kind==='prompts' ? '.setting-library-add-wrap button' : '.setting-toolbar-create';
      await wait(`document.querySelector('main').dataset.current==='${key}'&&!!document.querySelector('${createSelector}')`);
      await textClick(createSelector, '新建');
      const item = kind === 'variables' ? '变量' : kind === 'prompts' ? '提示词' : '设定';
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
        await textClick(compact ? '.mobile-editor-actions [role=toolbar] button' : '.setting-toolbar-create', '新建');
        await textClick('[role=menu] [role=menuitem]', '变量组');
        await wait('!!document.querySelector("[aria-label=当前变量名称]")');
        if (compact) { await run('document.querySelector("[data-fixture-back]").click()'); await wait('!document.querySelector(".editor-page-detail")'); }
        alignment.group = await run(`(()=>{const row=[...document.querySelectorAll('.variable-tree-row')].find(r=>r.textContent.includes('新建变量组'));return {icon:row.querySelector('.variable-tree-icon').getBoundingClientRect().left,title:row.querySelector('.variable-tree-label').getBoundingClientRect().left}})()`);
        if (theme==='dark' && [390,1200].includes(width)) { await new Promise(resolve => setTimeout(resolve, 80)); writeFileSync(join(dirname(html),`variables-${width}.png`),(await win.webContents.capturePage()).toPNG()); }
      }
      const rowLayout = compact ? await run(`(()=>{const row=document.querySelector(${JSON.stringify(kind==='variables'?'.variable-tree-row':'.setting-library-tree-row-content')}), icon=row.querySelector(${JSON.stringify(kind==='variables'?'.variable-tree-icon':'.setting-library-tree-entry-icon')}), label=row.querySelector(${JSON.stringify(kind==='variables'?'.variable-tree-label':'.setting-library-tree-label')});const r=row.getBoundingClientRect(),s=document.querySelector('.editor-collection-search').getBoundingClientRect();return {icon:icon.getBoundingClientRect().left-r.left,title:label.getBoundingClientRect().left-r.left,searchGap:r.top-s.bottom,height:r.height}})()`) : null;
      report.cases.push({ theme, width, kind, selection, shadow, alignment, rowLayout });
    }
    for (const theme of ['light', 'dark']) for (const width of [320, 390, 1200]) {
      const compact = width < 600, key = `assets:character:${compact}`;
      win.setContentSize(width, 844);
      await run(`document.documentElement.dataset.theme='${theme}';document.body.toggleAttribute('data-ds-dark-theme',${theme === 'dark'});document.documentElement.dataset.eleckoiMobile='${compact}';document.querySelector('[data-editor="${key}"]').click()`);
      await wait(`document.querySelector('main').dataset.current==='${key}'`);
      for (const label of ['筛选', '排序', '展示尺寸']) {
        await run(`document.querySelector('[aria-label="${label}"]').click()`); await wait('!!document.querySelector(".asset-menu-layer .popover")');
        report.assetMenus.push(await run(`(()=>{
          const anchor=document.querySelector('[aria-label="${label}"]'),menu=document.querySelector('.asset-menu-layer .popover'),a=anchor.getBoundingClientRect(),p=menu.getBoundingClientRect();
          return {theme:'${theme}',width:${width},label:'${label}',sameRoot:anchor.getRootNode()===menu.getRootNode(),
            gap:Math.min(Math.abs(p.top-a.bottom-7),Math.abs(a.top-p.bottom-7)),visible:p.left>=0&&p.top>=0&&p.right<=innerWidth&&p.bottom<=innerHeight};
        })()`));
        await run('document.querySelector(".asset-menu-layer .menu-dismiss").click()'); await wait('!document.querySelector(".asset-menu-layer")');
      }
    }
    await cdp.sendCommand('Emulation.setDeviceMetricsOverride', { width: 390, height: 460, deviceScaleFactor: 1, mobile: true });
    await cdp.sendCommand('Emulation.setTouchEmulationEnabled', { enabled: true });
    const tap = async selector => {
      const point = await run(`(() => {
        const button = document.querySelector(${JSON.stringify(selector)});
        const rect = button.getBoundingClientRect();
        const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
        if (!button.contains(document.elementFromPoint(x, y))) throw Error('Tap target is covered: ' + button.getAttribute('aria-label'));
        return { x, y };
      })()`);
      await cdp.sendCommand('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
      await cdp.sendCommand('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    await run(`document.documentElement.dataset.eleckoiMobile='true';document.querySelector('[data-editor="asset-items:character:true"]').click()`);
    await wait(`document.querySelector('main').dataset.current==='asset-items:character:true'&&document.querySelector('.asset-thumb img')?.naturalWidth>0`);
    for (const view of ['grid', 'list']) {
      if (view === 'list') {
        await cdp.sendCommand('Emulation.setDeviceMetricsOverride', { width: 390, height: 760, deviceScaleFactor: 1, mobile: true });
        await wait('innerHeight===760');
        await tap('.view-switch [aria-label="列表视图"]');
      }
      await wait(`!!document.querySelector('.asset-content.${view}')`);
      for (const id of ['fixture-folder', 'fixture-image']) {
        const selector = `[data-asset-id="${id}"] .card-more`;
        await tap(selector);
        await wait('!!document.querySelector(".asset-menu-layer .popover")');
        const menu = await run(`(() => {
          const button = document.querySelector(${JSON.stringify(selector)}), panel = document.querySelector('.asset-menu-layer .popover');
          const a = button.getBoundingClientRect(), p = panel.getBoundingClientRect();
          return {top:p.top, anchorBottom:a.bottom,
            fitsNearAnchor:p.height<=Math.max(innerHeight-a.bottom,a.top)-15,
            side:p.bottom<a.top?'above':p.top>a.bottom?'below':'overlap',
            gap:Math.min(Math.abs(p.top-a.bottom-7),Math.abs(a.top-p.bottom-7)),
            visible:p.left>=0&&p.top>=0&&p.right<=innerWidth&&p.bottom<=innerHeight};
        })()`);
        report.assetItemMenus.push({ id, view, ...menu });
        if (menu.visible) {
          await tap('.asset-menu-layer [role=menuitem]:first-child');
          if (id === 'fixture-folder') {
            await wait('!!document.querySelector(".asset-breadcrumbs")');
            await tap('.asset-breadcrumbs button');
          } else {
            await wait('!!document.querySelector(".asset-preview-dialog")');
            await tap('.asset-preview-dialog [aria-label="关闭弹窗"]');
          }
        } else {
          await run('document.querySelector(".asset-menu-layer .menu-dismiss").click()');
        }
        await wait('!document.querySelector(".asset-menu-layer, .asset-preview-dialog, .asset-breadcrumbs")');
      }
    }
    report.passed = true;
  } catch(error) { report.failure = error.stack || String(error); report.passed = false; }
  writeFileSync(reportPath, JSON.stringify(report,null,2)); win.destroy(); app.exit(report.passed ? 0 : 1);
});
