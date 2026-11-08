const { app, BrowserWindow } = require('electron');
const { writeFileSync } = require('node:fs');
const { dirname } = require('node:path');
const { pathToFileURL } = require('node:url');
const [html, report] = process.argv.slice(2);
app.setPath('userData', dirname(html));
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, offscreen: true, backgroundThrottling: false } });
  const run = source => win.webContents.executeJavaScript(source);
  const pause = () => new Promise(resolve => setTimeout(resolve, 30));
  const rows = [], errors = [];
  win.webContents.on('console-message', details => { if (details.level === 'error' || details.level === 3) errors.push(details.message); });
  try {
    for (const zoom of [1, 1.25, 1.5, 1.75, 2]) for (const kind of ['messages', 'characters', 'presets', 'models']) for (const dark of [false, true]) {
      win.setContentSize(Math.round(328 * zoom), Math.round(640 * zoom));
      const url = pathToFileURL(html); url.searchParams.set('kind', kind); url.searchParams.set('short', '1');
      await win.loadURL(url.href);
      win.webContents.setZoomFactor(zoom);
      for (let n = 0; n < 80 && !await run(`Math.abs(devicePixelRatio-${zoom})<.001`); n++) await pause();
      for (let n = 0; n < 80 && !await run('Boolean(document.querySelector(".sidebar-create-button use"))'); n++) await pause();
      const marker = rows.length + 20;
      // Match the surrounding surface to the button so corner pixels cannot
      // mistake the panel background for the control's painted border.
      await run(`document.documentElement.dataset.theme=${JSON.stringify(dark ? 'dark' : 'light')};document.body.toggleAttribute('data-ds-dark-theme',${dark});
        {const marker=document.createElement('div');marker.style.cssText='position:fixed;z-index:2147483647;left:0;top:0;width:3px;height:3px;background:rgb(${marker},40,100)';document.body.append(marker)}
        {const button=document.querySelector('.sidebar-create-button'),background=getComputedStyle(button).backgroundColor;
          for(let node=button.parentElement;node;node=node.parentElement)node.style.backgroundColor=background}`);
      const data = await run(`(() => {const button=document.querySelector('.sidebar-create-button');return {button:button.getBoundingClientRect().toJSON(),width:innerWidth,dpr:devicePixelRatio,
        officialArtwork:button.querySelector('use')?.getAttribute('href')==='#dsw-icon-plus-outline-regular'}})()`);
      // A paint marker excludes stale frames without relying on capturePage timing.
      const image = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { win.webContents.off('paint', paint); reject(new Error('Current frame did not paint')); }, 5000);
        function paint(_event, _dirty, image) {
          const size = image.getSize(), buffer = image.toBitmap(), i = (size.width + 1) * 4;
          if (Math.abs(size.width - data.width * data.dpr) > 2 || buffer[i + 1] !== 40 || buffer[i] !== 100 || buffer[i + 2] !== marker) { win.webContents.invalidate(); return; }
          clearTimeout(timer); win.webContents.off('paint', paint); resolve(image);
        }
        win.webContents.on('paint', paint); win.webContents.invalidate();
      });
      const bytes = image.toBitmap(), width = image.getSize().width, r = data.button, scale = data.dpr;
      const luminance = (x, y) => { const i = (y * width + x) * 4; return (bytes[i] + bytes[i + 1] + bytes[i + 2]) / 3; };
      const bg = luminance(Math.round((r.x + 4) * scale), Math.round((r.y + 4) * scale));
      let mass = 0, wx = 0, wy = 0;
      const bounds = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
      for (let y = Math.floor(r.top * scale); y < Math.ceil(r.bottom * scale); y++) for (let x = Math.floor(r.left * scale); x < Math.ceil(r.right * scale); x++) {
        const weight = Math.abs(bg - luminance(x, y));
        if (weight < 15) continue;
        bounds.left = Math.min(bounds.left, x); bounds.right = Math.max(bounds.right, x);
        bounds.top = Math.min(bounds.top, y); bounds.bottom = Math.max(bounds.bottom, y);
        if (x > (r.left + 5) * scale && x < (r.right - 5) * scale && y > (r.top + 5) * scale && y < (r.bottom - 5) * scale && weight > 15) {
          mass += weight; wx += (x + .5) * weight; wy += (y + .5) * weight;
        }
      }
      rows.push({ kind, zoom, dark, ...data, mass, bounds, offset: { x: wx / mass - (bounds.left + bounds.right + 1) / 2, y: wy / mass - (bounds.top + bounds.bottom + 1) / 2 } });
    }
    writeFileSync(report, JSON.stringify({ rows, errors })); win.destroy(); app.exit(0);
  } catch (error) { console.error(error, errors); win.destroy(); app.exit(1); }
});
