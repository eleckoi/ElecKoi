const { app, BrowserWindow } = require('electron');
const { writeFileSync } = require('node:fs');
const { join, dirname } = require('node:path');
const [html, report] = process.argv.slice(2);
app.setPath('userData', join(dirname(html), 'browser-profile'));
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1000, height: 850, webPreferences: { sandbox: true, backgroundThrottling: false } });
  const errors = [], layouts = [], tools = [];
  win.webContents.on('console-message', event => { if (event.level === 'error') errors.push(event.message); });
  const run = source => win.webContents.executeJavaScript(source);
  const pause = () => new Promise(resolve => setTimeout(resolve, 150));
  try {
    await win.loadFile(html);
    for (let i = 0; i < 50 && !await run(`Boolean(document.querySelector('[data-variant="think"]'))`); i++) await pause();
    for (const theme of ['light', 'dark']) for (const width of [390, 1000]) for (const backdrop of ['#ffffff', '#273244']) {
      win.setContentSize(width, 850);
      await run(`document.documentElement.dataset.theme='${theme}';document.documentElement.dataset.eleckoiMobile='${width<768}';document.body.toggleAttribute('data-ds-dark-theme','${theme}'==='dark');document.body.style.background='${backdrop}';document.querySelector('.roleplay-process-scroll').scrollTop=0`);
      await win.webContents.capturePage(); await pause(); await pause();
      const measure = () => run(`(()=>{const scroll=document.querySelector('.roleplay-process-scroll'),head=document.querySelector('[data-variant="think"] [data-disclosure-header]'),h=head.getBoundingClientRect(),s=scroll.getBoundingClientRect();return {theme:'${theme}',width:innerWidth,backdrop:'${backdrop}',headerTop:h.top,scrollTop:s.top,paddingTop:parseFloat(getComputedStyle(scroll).paddingTop),position:getComputedStyle(head).position,header:{x:Math.floor(h.right-12),y:Math.floor(h.top+h.height/2)},surface:{x:Math.floor(h.right-12),y:Math.floor(s.top+10)},overflow:scroll.scrollWidth>scroll.clientWidth}})()`);
      for (const stuck of [false, true]) {
        if (stuck) await run(`document.querySelector('.roleplay-process-scroll').scrollTop=150`);
        await win.webContents.capturePage(); await pause();
        const layout = await measure(), capture = await win.webContents.capturePage(), size = capture.getSize(), pixels = capture.toBitmap();
        const scale = size.width / layout.width;
        const pixel = ({ x, y }) => { const offset = (Math.floor(y * scale) * size.width + Math.floor(x * scale)) * 4; return [...pixels.subarray(offset, offset + 3)]; };
        // A body blank outside the pinned row shares its material even while text scrolls beneath it.
        if (stuck) layout.surface.x += 8;
        layouts.push({ ...layout, stuck, headerPixel: pixel(layout.header), surfacePixel: pixel(layout.surface) });
        if (stuck && backdrop === '#273244') writeFileSync(join(dirname(report), `${theme}-${width}.png`), capture.toPNG());
      }
      await run(`(()=>{const scroll=document.querySelector('.roleplay-process-scroll'),tool=document.querySelector('[data-tool="synthetic_tool"]');scroll.scrollTop+=tool.getBoundingClientRect().top-scroll.getBoundingClientRect().top-parseFloat(getComputedStyle(scroll).paddingTop)})()`);
      await win.webContents.capturePage(); await pause();
      const positions = await run(`(()=>{const scroll=document.querySelector('.roleplay-process-scroll').getBoundingClientRect();return ['[data-tool="synthetic_tool"]','.roleplay-tool-call'].map(selector=>{const h=document.querySelector(selector+' [data-disclosure-header]').getBoundingClientRect();return {selector,x:Math.floor(h.right-12),y:Math.floor(h.top+h.height/2),surfaceX:Math.floor(scroll.left+10)}})})()`);
      const capture = await win.webContents.capturePage(), size = capture.getSize(), pixels = capture.toBitmap(), scale = size.width / width;
      const pixel = (x, y) => { const offset = (Math.floor(y * scale) * size.width + Math.floor(x * scale)) * 4; return [...pixels.subarray(offset, offset + 3)]; };
      tools.push({ theme, width, backdrop, rows: positions.map(p => ({ selector: p.selector, header: pixel(p.x, p.y), surface: pixel(p.surfaceX, p.y) })) });
      if (backdrop === '#273244') writeFileSync(join(dirname(report), `tools-${theme}-${width}.png`), capture.toPNG());
    }
    await run(`document.querySelector('.roleplay-process-scroll').scrollTop=document.querySelector('.roleplay-process-scroll').scrollHeight;document.querySelector('[data-tool="synthetic_tool"] [data-disclosure-row]').click()`);
    await pause();
    const actions = await run(`({nativeCollapsed:!document.querySelector('[data-tool="synthetic_tool"] [data-open]'),readable:!!document.querySelector('.roleplay-tool-call'),body:document.querySelector('.roleplay-process-content').textContent.includes('合成字段')})`);
    writeFileSync(report, JSON.stringify({ layouts, tools, actions, errors }));
    win.destroy(); app.exit(0);
  } catch (error) { console.error(error, errors); win.destroy(); app.exit(1); }
});
