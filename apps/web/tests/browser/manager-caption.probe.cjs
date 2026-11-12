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
            return { theme: ${JSON.stringify(next)}, expected: 'rgba('+r+', '+g+', '+b+', '+a/255+')',
              native: window.nativeCaptionColors.at(-1),
              customControls: document.querySelectorAll('.window-control-button').length };
          })()`));
        }
        reports.push({ view, initial, states });
      }
    }
    writeFileSync(reportPath, JSON.stringify({ reports, errors }, null, 2));
    win.destroy(); app.exit(0);
  } catch (error) { console.error(error); win.destroy(); app.exit(1); }
});
