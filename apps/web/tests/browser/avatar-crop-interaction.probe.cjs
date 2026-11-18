const { app, BrowserWindow } = require('electron');
const { createServer } = require('node:http');
const { readFileSync, writeFileSync } = require('node:fs');
const { resolve, sep } = require('node:path');
const directory = resolve(process.argv[2]);
app.setPath('userData', resolve(directory, 'profile')); app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const server = createServer((request, response) => {
    const file = resolve(directory, request.url.slice(1) || 'index.html');
    if (!file.startsWith(directory + sep)) { response.writeHead(404); response.end(); return; }
    try {
      response.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
      response.end(readFileSync(file));
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const win = new BrowserWindow({ show: false, width: 390, height: 844, useContentSize: true, webPreferences: { sandbox: true, backgroundThrottling: false } });
  const run = code => win.webContents.executeJavaScript(code), layouts = [], errors = [];
  win.webContents.on('console-message', event => { if (event.level === 'error') errors.push(event.message); });
  const wait = async code => { for (let i = 0; i < 150; i++) { if (await run(code)) return; await new Promise(done => setTimeout(done, 20)); } throw Error(code); };
  try {
    await win.loadURL(`http://127.0.0.1:${server.address().port}/`);
    await win.webContents.insertCSS('*,*::before,*::after{animation:none!important;transition:none!important}');
    for (const theme of ['light', 'dark']) for (const width of [320, 390, 800, 1200]) for (const portrait of [false, true]) {
      win.setContentSize(width, 844); await wait(`innerWidth===${width}`);
      await run(`document.documentElement.dataset.eleckoiMobile='${width < 1000}';document.body.toggleAttribute('data-ds-dark-theme',${theme === 'dark'});window.renderCrop(${portrait})`);
      await wait('document.querySelector(".avatar-crop-stage img")?.naturalWidth===600');
      layouts.push(await run(`(()=>{
        const controls=document.querySelector('.avatar-crop-controls'),buttons=[...controls.querySelectorAll('button')],slider=controls.querySelector('input'),stage=document.querySelector('.avatar-crop-stage');
        const r=node=>node.getBoundingClientRect(),s=r(slider),c=r(controls),image=r(stage),hint=r(document.querySelector('.avatar-crop-hint'));
        return {theme:${JSON.stringify(theme)},width:${width},portrait:${portrait},buttonWidths:buttons.map(button=>r(button).width),buttonHeights:buttons.map(button=>r(button).height),
          icons:buttons.map(button=>{const b=r(button),icon=r(button.querySelector('svg'));return {size:icon.width,drift:Math.abs(b.x+b.width/2-icon.x-icon.width/2)+Math.abs(b.y+b.height/2-icon.y-icon.height/2)}}),
          sliderHeight:s.height,gap:c.top-image.bottom,hintGap:hint.top-c.bottom,overlap:s.left<r(buttons[0]).right||s.right>r(buttons[1]).left,
          overflow:document.documentElement.scrollWidth>innerWidth,track:getComputedStyle(slider,'::-webkit-slider-runnable-track').backgroundColor};
      })()`));
    }
    win.setContentSize(390, 844);
    await wait('innerWidth===390');
    await run(`document.documentElement.dataset.eleckoiMobile='true';document.body.removeAttribute('data-ds-dark-theme');window.renderCrop(true)`);
    await wait('document.querySelector(".avatar-crop-stage img")?.naturalWidth===600');
    await win.webContents.capturePage();
    win.webContents.debugger.attach('1.3');
    const center = await run(`(()=>{const r=document.querySelector('.avatar-crop-stage').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    const touch = async (type, points) => win.webContents.debugger.sendCommand('Input.dispatchTouchEvent', { type, touchPoints: points.map(([id, x, y]) => ({ id, x, y, radiusX: 1, radiusY: 1, force: 1 })) });
    await touch('touchStart', [[1, center.x - 40, center.y], [2, center.x + 40, center.y]]);
    await touch('touchMove', [[1, center.x - 80, center.y], [2, center.x + 80, center.y]]);
    await wait('Math.abs(Number(document.querySelector(".avatar-crop-zoom").value)-2)<.01');
    const enlarged = await run('Number(document.querySelector(".avatar-crop-zoom").value)');
    await touch('touchMove', [[1, center.x - 20, center.y], [2, center.x + 20, center.y]]);
    await wait('Number(document.querySelector(".avatar-crop-zoom").value)===1');
    const reduced = await run('Number(document.querySelector(".avatar-crop-zoom").value)');
    await touch('touchEnd', []);
    await run(`document.querySelector('[aria-label="向右旋转 90°"]').click()`);
    const rotation = await run('document.querySelector(".avatar-crop-image-transform").style.transform');
    await run(`[...document.querySelectorAll('button')].find(button=>button.textContent==='保存').click()`);
    await wait('!!window.savedCrop');
    const saved = await run('window.savedCrop');
    writeFileSync(resolve(directory, 'report.json'), JSON.stringify({ layouts, enlarged, reduced, rotation, saved, errors }, null, 2));
    if (process.env.ELECKOI_CROP_SCREENSHOT) writeFileSync(process.env.ELECKOI_CROP_SCREENSHOT, (await win.webContents.capturePage()).toPNG());
  } catch (error) { writeFileSync(resolve(directory, 'report.json'), JSON.stringify({ failure: error.stack, errors, layouts,
    state: await run(`(()=>{const s=document.querySelector('.avatar-crop-stage');return{viewport:innerWidth,stage:s?.getBoundingClientRect().toJSON(),zoom:document.querySelector('.avatar-crop-zoom')?.value}})()`)
  }, null, 2)); }
  finally { win.destroy(); await new Promise(done => server.close(done)); app.quit(); }
});
