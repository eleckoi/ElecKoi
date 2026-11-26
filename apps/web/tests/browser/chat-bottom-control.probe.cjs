const { app, BrowserWindow } = require('electron');
const { writeFileSync } = require('node:fs');
const { dirname, resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
const [htmlPath, reportPath] = process.argv.slice(2);
app.setPath('userData', dirname(htmlPath));
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-renderer-backgrounding');

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, backgroundThrottling: false } });
  win.webContents.on('console-message', event => { if (event.level === 'error') console.error(event.message.slice(0, 500)); });
  const evaluate = source => win.webContents.executeJavaScript(source);
  const pause = () => new Promise(resolve => setTimeout(resolve, 60));
  async function waitFor(source) {
    for (let attempt = 0; attempt < 80; attempt++) { if (await evaluate(source)) return; await pause(); }
    throw new Error(`Timed out: ${source}; ${await evaluate('document.body.innerText.slice(0, 180)')}`);
  }
  const measure = () => evaluate(`(() => {
    const scroller = document.querySelector('[data-conversation-scroll]'), composer = document.querySelector('[data-composer-card]');
    const button = document.querySelector('[data-chat-to-bottom] button'), rect = button?.getBoundingClientRect();
    const status = document.querySelector('.chat-composer-process button'), statusRect = status?.getBoundingClientRect();
    return { composerTop: composer.getBoundingClientRect().top, buttonTop: rect?.top, buttonBottom: rect?.bottom,
      buttonHit: !!rect && button.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.bottom - 2)),
      statusBottom: statusRect?.bottom,
      statusHit: !!statusRect && status.contains(document.elementFromPoint(statusRect.left + statusRect.width / 2, statusRect.top + statusRect.height / 2)),
      scrollTop: scroller.scrollTop, floor: scroller.scrollHeight - scroller.clientHeight,
      following: Boolean(document.querySelector('[data-chat-following-tail]')) };
  })()`);
  try {
    const reports = [];
    for (const [width, height, query] of [[1200, 800, 'layout=agent'], [1200, 800, ''], [1200, 800, 'running'],
      [400, 760, 'mobile&running'], [1200, 800, 'layout=agent&running'], [400, 760, 'mobile&layout=agent&running']]) {
      win.setContentSize(width, height);
      await win.loadURL(pathToFileURL(htmlPath).href + '?' + query);
      await waitFor('Boolean(document.querySelector("[data-chat-following-tail]"))');
      await evaluate(`(() => { const element = document.querySelector('[data-conversation-scroll]'); element.scrollTop = 0; element.dispatchEvent(new Event('scroll')); element.dispatchEvent(new Event('scrollend')); })()`);
      await waitFor('Boolean(document.querySelector("[data-chat-to-bottom] button"))');
      const long = await measure();
      await evaluate('window.chatBottomFixture.setCount(2)');
      await waitFor('document.querySelectorAll(".synthetic-message").length === 2');
      await pause();
      const shortened = await measure();
      await evaluate('window.chatBottomFixture.setCount(24)');
      await waitFor('document.querySelectorAll(".synthetic-message").length === 24');
      await pause();
      const restored = await measure();
      await evaluate('document.querySelector("[data-chat-to-bottom] button").click()');
      await waitFor('Boolean(document.querySelector("[data-chat-following-tail]"))');
      const returned = await measure();
      reports.push({ width, height, query, long, shortened, restored, returned });
    }
    const alignment = [];
    for (const [width, query] of [[1600, 'reading=680'], [1600, 'reading=900&theme=dark'], [860, 'reading=680'],
      [600, 'reading=680'], [400, 'reading=680'], [1600, 'layout=agent&reading=680'], [600, 'layout=agent&reading=680'],
      [400, 'mobile&reading=680'], [400, 'mobile&reading=680&theme=dark'], [900, 'mobile&reading=680'],
      [1600, 'reading=680&avatar=96&gap=18&padding=24'], [400, 'mobile&reading=680&avatar=96&gap=18&padding=24']]) {
      win.setContentSize(width, 900);
      await win.loadURL(pathToFileURL(htmlPath).href + '?alignment&' + query);
      await waitFor('document.querySelectorAll("[data-alignment-target]").length === 3 && !!document.querySelector(".markdown-message")');
      const result = await evaluate(`(() => {
        const body = document.querySelector('.markdown-message').getBoundingClientRect();
        const scroller = document.querySelector('[data-conversation-scroll]');
        return { body: {left:body.left,right:body.right}, targets: [...document.querySelectorAll('[data-alignment-target]')].map(element => {
          const rect = element.getBoundingClientRect();return {kind:element.dataset.alignmentTarget,left:rect.left,right:rect.right};
        }), horizontalOverflow: scroller.scrollWidth-scroller.clientWidth };
      })()`);
      alignment.push({ width, query, ...result });
      if (process.env.ELECKOI_LAYOUT_EVIDENCE_DIR && (query === 'reading=680' && width === 1600 || query === 'mobile&reading=680&theme=dark')) {
        await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
        writeFileSync(resolve(process.env.ELECKOI_LAYOUT_EVIDENCE_DIR, `chat-node-alignment-${width}.png`), (await win.webContents.capturePage()).toPNG());
      }
    }
    writeFileSync(reportPath, JSON.stringify({ scroll: reports, alignment }));
    if (process.env.ELECKOI_LAYOUT_EVIDENCE_DIR) writeFileSync(resolve(process.env.ELECKOI_LAYOUT_EVIDENCE_DIR, 'chat-node-alignment-report.json'), JSON.stringify({ scroll: reports, alignment }, null, 2));
    win.destroy(); app.exit(0);
  } catch (error) { console.error(error); win.destroy(); app.exit(1); }
});
