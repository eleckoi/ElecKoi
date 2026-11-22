const { app, BrowserWindow, nativeTheme } = require('electron');
const { writeFileSync } = require('node:fs');
const { dirname } = require('node:path');
const { pathToFileURL } = require('node:url');
const [htmlPath, reportPath] = process.argv.slice(2);
app.setPath('userData', dirname(htmlPath));
app.disableHardwareAcceleration();
process.on('uncaughtException', error => { console.error(error); app.exit(1); });
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, titleBarStyle: 'hidden', titleBarOverlay: { height: 40 },
    webPreferences: { backgroundThrottling: false, sandbox: true, offscreen: true } });
  const reports = [];
  const paletteChecks = [];
  const errors = [];
  win.webContents.on('console-message', (_event, level, message) => { if (level >= 3) errors.push(message); });
  try {
    for (const view of ['character-manager', 'preset-manager']) {
      for (const initial of ['light', 'dark', 'system-light', 'system-dark']) {
        nativeTheme.themeSource = initial.endsWith('dark') ? 'dark' : 'light';
        const theme = initial.startsWith('system-') ? 'system' : initial;
        await win.loadURL(`${pathToFileURL(htmlPath).href}?view=${view}&theme=${theme}`);
        for (let attempt = 0; attempt < 100; attempt++) {
          if (await win.webContents.executeJavaScript('Boolean(document.querySelector(".character-manager-main,.preset-manager-main")) && Boolean(window.nativeCaptionColors?.length)')) break;
          await new Promise(resolve => setTimeout(resolve, 30));
        }
        const states = [];
        for (const next of [theme, 'dark', 'light']) {
          await win.webContents.executeJavaScript(`window.setCaptionTheme(${JSON.stringify(next)})`);
          await win.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
          states.push(await win.webContents.executeJavaScript(`(() => {
            const main = document.querySelector('.character-manager-main,.preset-manager-main');
            const context = document.createElement('canvas').getContext('2d');
            context.fillStyle = getComputedStyle(main).backgroundColor;
            context.fillRect(0, 0, 1, 1);
            const [r,g,b,a] = context.getImageData(0,0,1,1).data;
            const ink = document.createElement('span'); ink.style.color='var(--dsw-alias-label-primary)'; document.body.append(ink);
            context.clearRect(0,0,1,1);context.fillStyle=getComputedStyle(ink).color;context.fillRect(0,0,1,1);ink.remove();
            const [ir,ig,ib,ia]=context.getImageData(0,0,1,1).data;
            return { theme: ${JSON.stringify(next)}, expected: 'rgba('+r+', '+g+', '+b+', '+a/255+')',
              expectedSymbol:'rgba('+ir+', '+ig+', '+ib+', '+ia/255+')',
              native: window.nativeCaptionColors.at(-1),
              customControls: document.querySelectorAll('.window-control-button').length };
          })()`));
        }
        reports.push({ view, initial, states });
      }
    }
    for (const theme of ['light', 'dark']) {
      await win.loadURL(`${pathToFileURL(htmlPath).href}?view=main&theme=${theme}`);
      for (let attempt = 0; attempt < 100; attempt++) {
        if (await win.webContents.executeJavaScript('!!document.querySelector("[role=dialog]") && !!window.nativeCaptionColors?.length')) break;
        await new Promise(resolve => setTimeout(resolve, 30));
      }
      await win.webContents.executeJavaScript(`(() => {
        const style = document.createElement('style');
        style.textContent = 'body[data-caption-plugin="transparent"] { --dsw-specific-sidebar-fill: transparent !important; }'
          + 'body[data-caption-plugin="translucent"] { --dsw-specific-sidebar-fill: rgba(24,26,30,.4) !important; }'
          + 'body[data-caption-plugin="transparent"] { --dsw-alias-label-primary: rgb(230,231,232) !important; }';
        document.head.append(style);
      })()`);
      for (const plugin of ['', 'translucent', 'transparent', '']) {
        await win.webContents.executeJavaScript(`document.body.dataset.captionPlugin = ${JSON.stringify(plugin)}; new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
        paletteChecks.push(await win.webContents.executeJavaScript(`(() => {
          const mask = document.querySelector('[role=dialog]').parentElement.firstElementChild;
          return { theme: ${JSON.stringify(theme)}, plugin: document.body.dataset.captionPlugin, native: window.nativeCaptionColors.at(-1),
            maskTop: mask.getBoundingClientRect().top, marker: document.documentElement.hasAttribute('data-windows-titlebar') };
        })()`));
      }
    }
    writeFileSync(reportPath, JSON.stringify({ reports, paletteChecks, errors }, null, 2));
    win.destroy(); app.exit(0);
  } catch (error) { console.error(error); win.destroy(); app.exit(1); }
});
