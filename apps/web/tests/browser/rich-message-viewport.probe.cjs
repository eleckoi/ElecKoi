const { app, BrowserWindow } = require('electron');
const { writeFileSync } = require('node:fs');
const { dirname, join } = require('node:path');
const { pathToFileURL } = require('node:url');
const [htmlPath, reportPath] = process.argv.slice(2);
app.setPath('userData', join(dirname(htmlPath), 'profile'));
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1100, height: 800,
    webPreferences: { sandbox: true, backgroundThrottling: false } });
  const evaluate = source => win.webContents.executeJavaScript(source);
  const reports = [], errors = [];
  win.webContents.on('console-message', event => {
    if (/ResizeObserver loop/.test(event.message)) errors.push(event.message);
    if (event.level === 'error') console.error(event.message);
  });
  const inspect = () => evaluate(`(() => {
    const frame = document.querySelector('iframe'), page = frame?.contentWindow;
    const image = page?.document.querySelector('img'), block = page?.document.querySelector('#block');
    return { name:frame?.name, frame:frame?.getBoundingClientRect().height, width:frame?.clientWidth,
      hostHeight:innerHeight, image:image?.getBoundingClientRect().height, loaded:image?.complete && image?.naturalWidth === 512,
      block:block?.getBoundingClientRect().height, literal:page?.document.body?.style.getPropertyValue('--literal'),
      url:page?.document.body?.style.getPropertyValue('--image'),
      diagnostics:document.querySelector('.rich-message-diagnostics')?.textContent || '' };
  })()`);
  const waitFor = async (label, condition) => {
    const deadline = Date.now() + 5000;
    let state;
    do {
      await new Promise(resolve => setTimeout(resolve, 25));
      state = await inspect();
      if (condition(state)) { reports.push({ label, ...state }); return state; }
    } while (Date.now() < deadline);
    throw new Error(`${label}: ${JSON.stringify(state)}`);
  };
  const near = (actual, expected) => Math.abs(actual - expected) <= 1;
  try {
    await win.loadURL(pathToFileURL(htmlPath).href);
    const svg = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="768"><rect width="512" height="768" fill="#6189be"/></svg>');
    for (const native of [false, true]) {
      win.setContentSize(1100, 800);
      const source = `<!doctype html><html><head>${native ? '<meta name="eleckoi-author-api" content="0.1.0">' : ''}</head>
        <body><div style="width:100%;max-width:560px;margin:0 auto;border-radius:16px;overflow:hidden;background:#0b0f14;position:relative;line-height:0">
        <img alt="synthetic" style="display:block;width:100%;height:auto;max-height:72vh;object-fit:cover">
        <div style="position:absolute;inset:0;pointer-events:none"></div></div>
        <script>setTimeout(()=>document.querySelector('img').src=${JSON.stringify(svg)},80)</script></body></html>`;
      await evaluate(`window.renderPresentation(${JSON.stringify({ native, key: `viewport-${native}`, source })})`);
      const first = await waitFor(`delayed-image-${native}`, state => state.loaded
        && near(state.image, Math.min(Math.min(state.width, 560) * 1.5, state.hostHeight * .72)) && near(state.frame, state.image));
      await new Promise(resolve => setTimeout(resolve, 180));
      const stable = await inspect();
      if (!near(stable.frame, first.frame) || !near(stable.image, first.image)) throw new Error('Image height did not settle');
      win.setContentSize(1100, 500);
      await waitFor(`host-resize-${native}`, state => state.hostHeight === 500 && near(state.image, 360) && near(state.frame, state.image));
      await evaluate(`document.querySelector('iframe').contentDocument.querySelector('img').style.maxHeight='50vh'`);
      await waitFor(`dynamic-inline-${native}`, state => near(state.image, 250) && near(state.frame, 250));
      await evaluate(`(() => { const doc=document.querySelector('iframe').contentDocument;
        doc.querySelector('img').style.maxHeight=''; const link=doc.createElement('link');
        link.rel='stylesheet';link.href=${JSON.stringify(new URL('viewport.css', pathToFileURL(htmlPath)).href)};doc.head.append(link);
      })()`);
      await waitFor(`loaded-stylesheet-${native}`, state => near(state.image, 125) && near(state.frame, 125));
      await evaluate(`(() => {const doc=document.querySelector('iframe').contentDocument;
        doc.body.innerHTML='<div id="block" style="min-height:100vh"></div>';
        doc.body.style.setProperty('--literal','"72vh"');doc.body.style.setProperty('--image','url("/icon72vh.svg")');
      })()`);
      await waitFor(`minimum-viewport-${native}`, state => near(state.block, 500) && near(state.frame, 500));
      await evaluate(`document.querySelector('iframe').contentDocument.querySelector('#block').style.minHeight='calc(120dvh + 10px)'`);
      await waitFor(`calc-viewport-${native}`, state => near(state.block, 610) && near(state.frame, 610));
      for (const height of [160, 1200, 80]) {
        await evaluate(`document.querySelector('iframe').contentDocument.querySelector('#block').style.cssText='height:${height}px'`);
        await waitFor(`content-${height}-${native}`, state => near(state.frame, height));
      }
      win.setContentSize(400, 800);
      await evaluate(`document.querySelector('iframe').contentDocument.querySelector('#block').style.cssText='height:20vmin'`);
      const last = await waitFor(`narrow-width-${native}`, state => state.hostHeight === 800 && near(state.block, state.width * .2) && near(state.frame, state.block));
      if (last.name !== first.name || last.literal !== '"72vh"' || !last.url.includes('icon72vh.svg') || last.diagnostics) {
        throw new Error(`Document changed or CSS tokens corrupted: ${JSON.stringify(last)}`);
      }
    }
    if (errors.length) throw new Error(errors.join('\n'));
    writeFileSync(reportPath, JSON.stringify(reports));
    win.destroy(); app.exit(0);
  } catch (error) { console.error(error); win.destroy(); app.exit(1); }
});
