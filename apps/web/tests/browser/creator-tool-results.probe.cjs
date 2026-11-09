const { app, BrowserWindow } = require('electron');
const { mkdirSync, writeFileSync } = require('node:fs');
const { dirname, join } = require('node:path');
const [html, report, screenshots] = process.argv.slice(2);
app.setPath('userData', dirname(html));
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true, sandbox: true, backgroundThrottling: false } });
  const run = code => win.webContents.executeJavaScript(code);
  const pause = () => new Promise(resolve => setTimeout(resolve, 70));
  const errors = [], rows = [];
  let stage = 'loading';
  win.webContents.on('console-message', details => { if (details.level === 'error' || details.level === 3) errors.push(`${stage}: ${details.message}`); });
  const call = id => `[data-tool-call-id="${id}"]`;
  async function waitFor(code) {
    for (let i = 0; i < 80; i++) { if (await run(code)) return; await pause(); }
    throw new Error('Creator presentation did not reach: ' + code);
  }
  async function open(id) { stage = `open:${id}`; await run(`document.querySelector(${JSON.stringify(call(id) + ' [data-disclosure-row]')}).click()`); await pause(); await pause(); }
  async function tail(selector, marker) {
    stage = `tail:${marker}`;
    for (let i = 0; i < 35; i++) {
      await run(`{const element=document.querySelector(${JSON.stringify(selector)});element.scrollTop=element.scrollHeight;element.dispatchEvent(new Event('scroll'));}`);
      await pause();
      if (await run(`document.querySelector(${JSON.stringify(selector)}).textContent.includes(${JSON.stringify(marker)})`)) return true;
    }
    return false;
  }
  async function search(value) {
    stage = `search:${value}`;
    await run(`{const input=document.querySelector('${call('prompts')} input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));}`);
    await pause(); await pause();
  }
  try {
    for (const width of [390, 1000]) for (const dark of [false, true]) {
      win.setContentSize(width, 1000); await win.loadFile(html);
      await run(`document.documentElement.dataset.theme=${JSON.stringify(dark ? 'dark' : 'light')};document.body.toggleAttribute('data-ds-dark-theme',${dark})`);
      await waitFor('document.querySelectorAll(".creator-tool-call").length===9');
      const typography=[];
      for(const size of [14,20]){
        await run(`document.body.style.fontSize='${size}px';document.body.style.setProperty('--dsh-content-font-size-secondary','${size===14?13:18}px');document.body.style.setProperty('--dsh-content-font-delta','${size-14}px')`);
        typography.push(await run(`(()=>{const sample=n=>{const c=getComputedStyle(n);return {size:c.fontSize,weight:c.fontWeight,height:c.lineHeight}};return {reference:sample(document.querySelector('.official-tool-reference-title')),summaries:[...document.querySelectorAll('.creator-tool-call .roleplay-tool-summary')].map(sample)}})()`));
      }
      await run(`document.body.style.fontSize='14px';document.body.style.setProperty('--dsh-content-font-size-secondary','13px');document.body.style.setProperty('--dsh-content-font-delta','0px')`);
      const operationIcon = await run(`document.querySelector('${call('edit')} use')?.getAttribute('href')||''`);
      for (const id of ['variables', 'edit', 'failed', 'cancelled', 'page', 'preview', 'prompts']) await open(id);
      const writeTail = await tail(call('edit') + ' .roleplay-mutation-body', 'CREATOR_NEW_TAIL');
      const pageTail = await tail(call('page') + ' .roleplay-mutation-body', 'CREATOR_PAGE_TAIL');
      await run(`{const e=document.querySelector('${call('prompts')} .roleplay-result-directory');e.scrollTop=48*1002;e.dispatchEvent(new Event('scroll'));}`); await pause(); await pause();
      const finalDirectoryEntry = await run(`Boolean(document.querySelector('${call('prompts')} [data-result-index="1002"]'))`);
      await search('CREATOR_PROMPT_TAIL');
      await run(`document.querySelector('${call('prompts')} .roleplay-result-row').click()`); await pause();
      const readTail = await tail(call('prompts') + ' .roleplay-result-detail-scroll', 'CREATOR_PROMPT_TAIL');
      await run(`document.querySelector('${call('prompts')} .roleplay-result-back').click()`); await search('本轮前置正文已提供');
      await run(`document.querySelector('${call('prompts')} .roleplay-result-row').click()`); await pause();
      await run(`document.querySelector('${call('edit')} .roleplay-tool-inspect').click()`);
      const state = await run(`(() => {
        const node=id=>document.querySelector('[data-tool-call-id="'+id+'"]');
        const rectangles=[...document.querySelectorAll('.roleplay-mutation-body')].map(body=>[...body.querySelectorAll('.roleplay-mutation-part')].map(part=>part.getBoundingClientRect()));
        return {
          readable:node('variables').textContent.includes('默认值')&&node('variables').textContent.includes('否')&&node('variables').textContent.includes('0'),
          operationArtwork:Boolean(document.querySelector('#dsw-icon-edit-outline-regular path')),
          receipt:node('prompts').textContent.includes('本轮前置正文已提供。'),
          required:node('prompts').querySelector('.roleplay-result-row .roleplay-reading-badge')?.textContent,
          failed:node('failed').dataset.creatorState,cancelled:node('cancelled').dataset.creatorState,
          preview:node('preview').textContent.includes('尚未保存'),
          inspected:document.body.dataset.inspected,
          fallback:document.querySelector('[data-native-fallback]')?.dataset.nativeFallback,
          noOverlap:rectangles.every(parts=>parts.every((part,index)=>!index||part.top>=parts[index-1].bottom-.6)),
          horizontalOverflow:document.documentElement.scrollWidth>innerWidth+1,
          mountedText:node('edit').querySelectorAll('.roleplay-mutation-part').length,
          mountedEntries:node('prompts').querySelectorAll('.roleplay-result-row').length
        };
      })()`);
      rows.push({ width, dark, typography, finalDirectoryEntry, writeTail, pageTail, readTail, operationIcon, ...state });
      if (screenshots) {
        mkdirSync(screenshots, { recursive: true });
        await run('scrollTo(0,0)');
        writeFileSync(join(screenshots, `creator-${width}-${dark ? 'dark' : 'light'}.png`), (await win.webContents.capturePage()).toPNG());
      }
    }
    writeFileSync(report, JSON.stringify({ rows, errors }, null, 2)); win.destroy(); app.quit();
  } catch (error) { console.error(error); win.destroy(); app.exit(1); }
});
