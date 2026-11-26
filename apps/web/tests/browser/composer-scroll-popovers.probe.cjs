const { app, BrowserWindow, nativeTheme } = require('electron');
const { writeFileSync } = require('node:fs');
const { dirname, join } = require('node:path');
const { pathToFileURL } = require('node:url');
const [html, report] = process.argv.slice(2);
app.setPath('userData', join(dirname(html), 'profile'));
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, backgroundThrottling: false } });
  const errors = [], scenarios = [], streaming = [], roleplayStatus = [];
  win.webContents.on('console-message', (...args) => {
    const event = args[0];
    if (event.level === 'error') errors.push(event.message);
    else if (args[1] === 3) errors.push(args[2]);
  });
  const evaluate = source => win.webContents.executeJavaScript(source);
  const pause = () => new Promise(resolve => setTimeout(resolve, 35));
  const wait = async source => {
    for (let i = 0; i < 100; i++) { if (await evaluate(source)) return; await pause(); }
    throw Error(`Timed out: ${source}; ${await evaluate(`JSON.stringify([...document.querySelectorAll('.chat-panel,.native-roleplay-content,[data-phase],[data-conversation-content],[data-conversation-frame],[data-conversation-scroll],[data-chat-view],[data-chat-scroll]')].map(e=>({name:e.className,height:e.clientHeight,scrollHeight:e.scrollHeight,scrollTop:e.scrollTop,overflow:getComputedStyle(e).overflowY,display:getComputedStyle(e).display,flex:getComputedStyle(e).flex})))`)}`);
  };
  const controls = [
    ['menu', "document.querySelector('.composer-more-trigger')", 'menu', 4],
    ['permission', "[...document.querySelectorAll('[data-composer-card] button')].find(b=>b.textContent.includes('Synthetic workspace'))", 'menu', 4],
    ['activity', "document.querySelector('[data-composer-stat=activity] button')", 'dialog', 8],
    ['usage', "document.querySelector('[data-composer-stat=usage] button')", 'dialog', 8],
    ['context', "document.querySelector('[data-composer-stats] > span:last-child button')", 'dialog', 8],
  ];
  try {
    const statusGeometry = () => evaluate(`(() => {
      const scroll = document.querySelector('[data-conversation-scroll]');
      const seat = document.querySelector('[data-composer-seat]');
      const reply = document.querySelector('article.roleplay-reply-turn');
      const background = element => getComputedStyle(element, '::before').content !== 'none';
      const parts = [...reply.querySelectorAll('.message-roleplay')];
      const [first, second] = parts.map(part => part.getBoundingClientRect());
      return { replyBottom: reply.getBoundingClientRect().bottom, scrollTop: scroll.scrollTop,
        composerHeight: seat.offsetHeight, clearance: document.querySelector('[data-composer-clearance]').offsetHeight,
        inputTop: seat.querySelector('[data-composer-card]').getBoundingClientRect().top,
        turnBubble: background(reply), speakerBubbles: parts.filter(background).length,
        speakers: parts.map(part => part.querySelector('.message-author')?.textContent),
        gap: second.top - first.bottom,
        floors: parts.map(part => part.querySelector('.message-floor')?.textContent),
        timestampCount: reply.querySelectorAll('.message-timestamp').length,
        scrollBottom: scroll.scrollHeight - scroll.clientHeight };
    })()`);
    for (const [width, bubbles] of [[1200, true], [390, false]]) {
      win.setContentSize(width, 800);
      const url = pathToFileURL(html); url.search = `mobile=${width < 768}`;
      await win.loadURL(url.href);
      await wait('!!window.scrollPopoverFixture');
      await evaluate(`window.scrollPopoverFixture.setCount(24);window.scrollPopoverFixture.roleplayRunning(true,${bubbles})`);
      await wait('!!document.querySelector(".chat-composer-process") && !!document.querySelector("article.roleplay-reply-turn .roleplay-reply-followups")');
      await evaluate(`(() => { const scroll = document.querySelector('[data-conversation-scroll]');
        scroll.scrollTop = scroll.scrollHeight; scroll.dispatchEvent(new Event('scroll')); scroll.dispatchEvent(new Event('scrollend')); })()`);
      await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
      const before = await statusGeometry();
      await evaluate(`window.scrollPopoverFixture.roleplayRunning(false,${bubbles})`);
      await wait('!document.querySelector(".chat-composer-process")');
      await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
      roleplayStatus.push({ width, bubbles, before, after: await statusGeometry() });
    }
    for (const width of [320, 390, 1200]) for (const theme of ['light', 'dark']) {
      win.setContentSize(width, 800);
      const url = pathToFileURL(html); url.search = `mobile=${width < 768}`;
      await win.loadURL(url.href); await wait('!!window.scrollPopoverFixture && !!document.querySelector("[data-composer-stat=usage] button")');
      await evaluate(`window.retainedDraftElement=document.querySelector('textarea');window.retainedDraftElement.value='Synthetic edited draft';window.retainedDraftElement.dispatchEvent(new Event('input',{bubbles:true}))`);
      nativeTheme.themeSource = theme;
      await evaluate(`document.documentElement.dataset.theme='${theme}';document.body.toggleAttribute('data-ds-dark-theme','${theme}'==='dark')`);
      for (const phase of ['empty', 'long', 'tall']) {
        await evaluate(`window.scrollPopoverFixture.setTall(${phase === 'tall'});window.scrollPopoverFixture.setCount(${phase === 'empty' ? 0 : 80})`);
        await wait(`document.querySelectorAll('.synthetic-message').length===${phase === 'empty' ? 0 : 80}`); await pause();
        await evaluate(`(()=>{const s=document.querySelector('[data-conversation-scroll]');s.scrollTop=s.scrollHeight;s.dispatchEvent(new Event('scroll'));s.dispatchEvent(new Event('scrollend'));})()`); await pause();
        const initial = await evaluate(`(()=>{const s=document.querySelector('[data-conversation-scroll]'),seat=document.querySelector('[data-composer-seat]'),card=document.querySelector('[data-composer-card]'),last=document.querySelector('.synthetic-message:last-child');return{floor:s.scrollHeight-s.clientHeight,tailGap:last?card.getBoundingClientRect().top-last.getBoundingClientRect().bottom:null,composerBottom:seat.getBoundingClientRect().bottom,bodyBottom:document.querySelector('.chat-conversation-body').getBoundingClientRect().bottom,horizontalOverflow:document.documentElement.scrollWidth-innerWidth}})()`);
        if (phase !== 'empty') {
          await evaluate(`(()=>{const s=document.querySelector('[data-conversation-scroll]');s.scrollTop=0;s.dispatchEvent(new Event('scroll'));s.dispatchEvent(new Event('scrollend'));})()`);
          await wait('!!document.querySelector("[data-chat-to-bottom] button")'); await pause();
        }
        const panels = [];
        for (const [kind, selector, role, expectedGap] of controls) {
          const scrollBefore = await evaluate(`document.querySelector('[data-conversation-scroll]').scrollTop`);
          await evaluate(`(${selector}).click()`); await wait(`!!document.querySelector('[role=${role}]')`); await pause();
          panels.push({ kind, expectedGap, scrollBefore, ...await evaluate(`(()=>{const a=(${selector}).getBoundingClientRect(),p=document.querySelector('[role=${role}]').getBoundingClientRect();return{gap:a.top-p.bottom,top:p.top,bottom:p.bottom,scrollAfter:document.querySelector('[data-conversation-scroll]').scrollTop}})()`) });
          await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
          await wait(`!document.querySelector('[role=${role}]')`);
        }
        if (phase !== 'empty') {
          await evaluate('document.querySelector("[data-chat-to-bottom] button").click()');
          await wait(`(()=>{const s=document.querySelector('[data-conversation-scroll]');return Math.abs(s.scrollHeight-s.clientHeight-s.scrollTop)<1})()`);
        }
        const returnedToTail = await evaluate(`(()=>{const s=document.querySelector('[data-conversation-scroll]');return Math.abs(s.scrollHeight-s.clientHeight-s.scrollTop)<1})()`);
        const draft = await evaluate('document.querySelector("textarea").value');
        scenarios.push({ width, height: 800, theme, phase, ...initial, panels, returnedToTail, draft });
      }
    }
    for (const width of [390, 1200]) {
      win.setContentSize(width, 800);
      const url = pathToFileURL(html); url.search = `mobile=${width < 768}`;
      await win.loadURL(url.href); await wait('!!window.scrollPopoverFixture && !!document.querySelector("[data-composer-stat=usage] button")');
      for (const [kind, selector, role, expectedGap] of controls) {
        await evaluate(`window.scrollPopoverFixture.setCount(24);window.scrollPopoverFixture.live('Synthetic initial streamed text.\\n\\n')`);
        await wait('!!document.querySelector("[data-test-stream]")'); await pause();
        await evaluate(`(()=>{const s=document.querySelector('[data-conversation-scroll]');s.scrollTop=s.scrollHeight;s.dispatchEvent(new Event('scroll'));s.dispatchEvent(new Event('scrollend'));})()`); await pause();
        await evaluate(`(${selector}).click()`); await wait(`!!document.querySelector('[role=${role}]')`);
        const samples = [];
        for (let chunk = 1; chunk <= 24; chunk++) {
          await evaluate(`window.scrollPopoverFixture.live(${JSON.stringify(('Synthetic continuous response text with a stable message identity. '.repeat(4) + '\n\n').repeat(chunk))})`);
          await pause();
          samples.push(await evaluate(`(()=>{const a=(${selector}).getBoundingClientRect(),p=document.querySelector('[role=${role}]')?.getBoundingClientRect(),s=document.querySelector('[data-conversation-scroll]');return{anchorTop:a.top,panelTop:p?.top,gap:p?a.top-p.bottom:null,scrollTop:s.scrollTop,scrollHeight:s.scrollHeight,textLength:document.querySelector('[data-test-stream]').textContent.length}})()`));
        }
        streaming.push({ width, kind, expectedGap, samples });
        writeFileSync(report + '.progress.json', JSON.stringify({ chromium: process.versions.chrome, width, kind, streaming }, null, 2));
        await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));window.scrollPopoverFixture.stop()`);
        await wait(`!document.querySelector('[role=${role}]')`);
      }
    }
    await evaluate(`window.retainedDraftElement=document.querySelector('textarea');window.retainedDraftElement.value='Synthetic edited draft'`);
    await evaluate('window.scrollPopoverFixture.selectView("trajectory")');
    await wait('!!document.querySelector(".view-trajectory")'); await pause();
    await evaluate('document.querySelector(".composer-more-trigger").click()');
    await wait('!!document.querySelector(".composer-more-menu")');
    await evaluate('document.querySelector(".composer-menu-next").click()');
    await wait('!!document.querySelector(".composer-more-menu.is-more")'); await pause();
    const moreGap = await evaluate(`document.querySelector('.composer-more-trigger').getBoundingClientRect().top-document.querySelector('.composer-more-menu').getBoundingClientRect().bottom`);
    await evaluate('document.querySelector(".composer-menu-back").click()');
    await wait('!!document.querySelector(".composer-more-menu.is-main")');
    await evaluate(`[...document.querySelectorAll('.composer-more-menu button')].find(b=>b.textContent==='聊天记录').click()`);
    const historyOpened = await evaluate('window.scrollPopoverFixture.historyOpened === true');
    await evaluate('window.scrollPopoverFixture.selectView("chat")'); await wait('!!document.querySelector(".view-chat")');
    const trajectoryKeepsDraft = await evaluate('document.querySelector("textarea") === window.retainedDraftElement && window.retainedDraftElement.value === "Synthetic edited draft"');
    writeFileSync(report, JSON.stringify({ chromium: process.versions.chrome, scenarios, streaming, roleplayStatus, errors, moreGap, historyOpened, trajectoryKeepsDraft }, null, 2));
    win.destroy(); app.exit(0);
  } catch (error) { console.error(error); win.destroy(); app.exit(1); }
});
