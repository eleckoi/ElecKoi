const { app, BrowserWindow } = require('electron');
const { writeFileSync } = require('node:fs');
const { dirname } = require('node:path');
const [html, report] = process.argv.slice(2);
app.setPath('userData', dirname(html) + '/profile');
app.disableHardwareAcceleration();
let window;
app.whenReady().then(async () => {
  const rows = [], errors = [];
  window = new BrowserWindow({ show: false, webPreferences: { sandbox: true, backgroundThrottling: false } });
  window.webContents.on('console-message', details => { if (details.level === 'error') errors.push(details.message); });
  const run = source => window.webContents.executeJavaScript(source);
  const pause = () => new Promise(resolve => setTimeout(resolve, 30));
  const settle = async () => { await window.webContents.capturePage(); await pause(); };
  const measure = () => run(`(() => {
    const bar = document.querySelector('[data-plugin-bar]'), head = bar.querySelector('header'), toolbar = bar.querySelector('[data-plugin-header-part="toolbar"]');
    const bound = element => { const r = element.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
    return { width: innerWidth, head: bound(head), toolbar: bound(toolbar), overflow: document.documentElement.scrollWidth > innerWidth,
      buttons: [...toolbar.querySelectorAll('button')].map(button => { const rect = bound(button), hit = document.elementFromPoint((rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2); return { label: button.getAttribute('aria-label'), ...rect, clickable: !!hit && button.contains(hit) }; }) };
  })()`);
  try {
    for (const width of [1000, 1360, 1920]) for (const zoom of [0.8, 1, 1.25]) for (const dark of [false, true]) {
      window.setContentSize(width, 900); await window.webContents.setZoomFactor(zoom);
      await window.loadFile(html, { query: { desktop: '1' } });
      for (let i = 0; i < 100; i++) { if (await run('!!document.querySelector("[data-plugin-bar][data-natural]")')) break; await pause(); }
      await run(`document.body.toggleAttribute('data-ds-dark-theme', ${dark})`); await settle();
      const record = async phase => rows.push({ phase, viewportWidth: width, zoom, dark, ...await measure() });
      await record('initial');
      if (width === 1360 && zoom === 1 && !dark) writeFileSync(dirname(report) + '/desktop-fixed.png', (await window.webContents.capturePage()).toPNG());
      await run('document.querySelector("[data-plugin-body]").scrollTop=200'); await settle(); await record('scrolled');
      await run('window.pluginHeaderFixture.setVisible(false);window.pluginHeaderFixture.remount()'); await settle();
      await run('window.pluginHeaderFixture.setVisible(true)'); await settle(); await record('reentered');
    }
    writeFileSync(report, JSON.stringify({ rows, errors }, null, 2));
  } catch (error) { writeFileSync(report, JSON.stringify({ rows, errors, failure: String(error) }, null, 2)); throw error; }
}).catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { window?.destroy(); app.exit(process.exitCode ?? 0); });
