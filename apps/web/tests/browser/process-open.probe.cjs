const { app, BrowserWindow } = require("electron");
const fs = require("fs"), path = require("path");
const [html, report] = process.argv.slice(2);
app.setPath("userData", path.join(path.dirname(html), "profile"));
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 390, height: 844, webPreferences: { sandbox: true, backgroundThrottling: false, offscreen: true } }), errors = [], layouts = [];
  win.webContents.on("console-message", (e) => {
    if (e.level === "error") errors.push(e.message);
  });
  const run = (s) => win.webContents.executeJavaScript(s), pause = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    for (const theme of ["light", "dark"]) {
      await win.loadFile(html, { query: { interactive: "1" } });
      await run(`document.documentElement.dataset.eleckoiMobile='true';document.documentElement.dataset.theme='${theme}';document.body.toggleAttribute('data-ds-dark-theme','${theme}'==='dark')`);
      for (let i = 0; i < 40 && !await run(`!!document.querySelector('[aria-label=\u66F4\u591A]')`); i++) await pause(60);
      await run(`document.querySelector('[aria-label=\u66F4\u591A]').click()`);
      await pause(180);
      await run(`document.querySelector('[aria-label=\u67E5\u770B\u8FC7\u7A0B]').click()`);
      await pause(350);
      const result = await run(`(()=>{const d=document.querySelector('.roleplay-process-dialog'),s=getComputedStyle(d);return{theme:'${theme}',opaque:s.backgroundColor,backings:document.querySelectorAll('[data-menu-backing]').length,material:!!d.querySelector(':scope > [aria-hidden=true]'),prepared:!d.hasAttribute('data-sheet-preparing'),animation:s.animationName,toolbarSwapping:!!document.querySelector('.message-tools.swapping'),rows:!!d.querySelector('[data-variant=think]'),fullText:d.textContent.includes('\u5408\u6210\u5B57\u6BB5'),blur:[d,...d.querySelectorAll('*')].some(n=>getComputedStyle(n).backdropFilter!=='none')}})()`);
      if (result.backings || result.material || !result.prepared || result.toolbarSwapping || !result.rows || !result.fullText || result.blur || result.animation !== "mobile-sheet-in") throw Error(JSON.stringify(result));
      layouts.push(result);
      await run(`document.querySelector('.roleplay-process-close').click()`);
      await pause(260);
      if (await run(`!!document.querySelector('.roleplay-process-dialog')`)) throw Error("Sheet did not close");
      await run(`document.querySelector('[aria-label=\u66F4\u591A]').click()`);
      await pause(180);
      await run(`document.querySelector('[aria-label=\u67E5\u770B\u8FC7\u7A0B]').click()`);
      await pause(300);
      if (!await run(`!!document.querySelector('.roleplay-process-dialog [data-tool=synthetic_tool]')`)) throw Error("Original tool was lost on reopen");
    }
    fs.writeFileSync(report, JSON.stringify({ passed: true, layouts, errors, screenshots: false }, null, 2));
    win.destroy();
    app.exit(0);
  } catch (e) {
    fs.writeFileSync(report, JSON.stringify({ passed: false, error: String(e), layouts, errors, screenshots: false }));
    win.destroy();
    app.exit(1);
  }
});
