async (page) => {
  const errors = [], unexpected = [];
  const error = message => { if (message.type() === 'error') errors.push(message.text()); };
  page.on('console', error);
  await page.route('https://native-author.test/**', route => {
    unexpected.push({ url: route.request().url(), type: route.request().resourceType(), frame: route.request().frame().url() });
    return route.fulfill({ status: 404, body: 'Unknown synthetic URL' });
  });
  await page.route('https://native-author.test/', route => route.fulfill({ path: 'apps/web/tests/fixtures/native-author-browser.html', contentType: 'text/html' }));
  await page.route('https://native-author.test/eleckoi/scripts/**', async route => {
    const body = await page.evaluate(file => window.__syntheticScriptAsset(file), new URL(route.request().url()).pathname.split('/').slice(6).join('/'));
    return route.fulfill({ status: body === null ? 404 : 200, body: body ?? 'Missing synthetic module', contentType: 'text/javascript' });
  });
  const source = `const api=await window.ElecKoiReady;
if(globalThis.TavernHelper||globalThis.Mvu||globalThis.SillyTavern)throw new Error('Unexpected compatibility runtime');
window.audioEvents=[];api.events.on('audio.state.changed',event=>window.audioEvents.push(event));
api.events.on('audio.time.updated',event=>window.audioEvents.push(event));
document.querySelector('#play-audio').onclick=async()=>{try{
  const state=await api.audio.play({track:{id:'synthetic-first',url:'../assets/synthetic.wav'},startAt:1,volume:0.5});
  document.querySelector('#audio-result').textContent=JSON.stringify(state);
}catch(error){document.querySelector('#audio-result').textContent=error.message}};
const result=document.querySelector('#result');
document.querySelector('#confirm').onclick=async()=>{try{
  const accepted=await api.variables.merge({score:Number(document.querySelector('#score').value)});
  const receipt=await api.chat.send('Synthetic score '+accepted.score);
  result.textContent=JSON.stringify({accepted,receipt,context:await api.context.current()});
}catch(error){result.textContent=error.message}};result.textContent='ready';`;
  const assets = [];
  const samples = 8000 * 12, wav = Buffer.alloc(44 + samples * 2);
  wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVE', 8); wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24);
  wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(samples * 2, 40);
  await page.route('https://native-author.test/eleckoi/frontends/synthetic-project/**', route => {
    const path = new URL(route.request().url()).pathname;
    assets.push(path);
    if (path === '/eleckoi/frontends/synthetic-project/pages/app.js') return route.fulfill({ body: source, contentType: 'text/javascript' });
    if (path === '/eleckoi/frontends/synthetic-project/shared.css') return route.fulfill({ body: 'body{font:16px system-ui;margin:16px;color:#202020;background:white}input,button{font:inherit;padding:8px;max-width:100%;box-sizing:border-box}label{display:block}output{display:block;overflow-wrap:anywhere;margin-top:12px}', contentType: 'text/css' });
    if (path === '/eleckoi/frontends/synthetic-project/assets/synthetic.png') return route.fulfill({ body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6n8AAAAASUVORK5CYII=', 'base64'), contentType: 'image/png' });
    if (path === '/eleckoi/frontends/synthetic-project/assets/synthetic.wav') {
      const range = /^bytes=(\d+)-(\d*)$/.exec(route.request().headers().range ?? '');
      const start = range ? Number(range[1]) : 0, end = range?.[2] ? Math.min(Number(range[2]), wav.length - 1) : wav.length - 1;
      if (start >= wav.length || start > end) return route.fulfill({ status: 416, headers: { 'Content-Range': `bytes */${wav.length}` } });
      const body = wav.subarray(start, end + 1);
      return route.fulfill({ status: range ? 206 : 200, body, contentType: 'audio/wav', headers: {
        'Accept-Ranges': 'bytes', 'Content-Length': String(body.length), ...(range ? { 'Content-Range': `bytes ${start}-${end}/${wav.length}` } : {}),
      } });
    }
    return route.fulfill({ status: 404, body: 'Unknown synthetic asset' });
  });
  const results = [];
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport); await page.goto('https://native-author.test/');
    await page.addScriptTag({ path: 'packages/client/features/dsh-client-author/lib/client.js' });
    await page.addStyleTag({ path: 'output/playwright/native-project/fixture.css' });
    await page.addScriptTag({ path: 'output/playwright/native-project/fixture.js' });
    await page.evaluate(() => window.prepareNativeFixture());
    await page.waitForFunction(() => window.nativeRuntime.getSnapshot().status === 'ready' && document.querySelector('#author-root iframe')?.contentDocument.querySelector('#result')?.textContent === 'ready');
    const commands = await page.evaluate(async () => {
      const api = document.querySelector('#author-root iframe').contentWindow.ElecKoi;
      const library = await api.settingLibrary.current();
      const saved = await api.settingLibrary.replace({ ...library, groups: [{ id: 'synthetic-group', name: 'Synthetic group',
        parentId: '', order: 1, treeViewOrder: 1, createdAt: '', updatedAt: '' }] });
      const trajectory = await api.chat.getAgentTrajectory();
      return { current: await api.chat.current(), character: await api.character.current(), chats: await api.chat.list(),
        created: await api.chat.create({ title: 'Synthetic created title' }), models: await api.chat.getModels(),
        selected: await api.chat.selectModel({ configId: 'synthetic-config', model: 'synthetic-model' }),
        generation: await api.chat.getGenerationState(), context: await api.context.current(),
        trajectory, trajectoryLocation: trajectory.snapshot.locations.get(5),
        library, saved, librarySummary: await api.settingLibrary.getSummary(),
        capabilities: (await api.app.getCapabilities()).map(item => item.method) };
    });
    if (commands.current.id !== 'synthetic-chat' || commands.character.id !== 'synthetic-character'
      || commands.chats.items.length !== 1 || commands.created.chat.id !== 'synthetic-created-chat'
      || commands.context.conversationId !== 'synthetic-chat' || commands.selected.configId !== 'synthetic-config'
      || commands.models.current.model !== 'synthetic-model' || commands.generation.active || commands.generation.stats !== null
      || commands.capabilities.length !== 55 || JSON.stringify(commands.models).includes('synthetic-private')
      || commands.library.groups.length !== 0 || commands.saved.groups.length !== 1 || commands.librarySummary.groupCount !== 1
      || commands.librarySummary.activeVersionId !== 'synthetic-library-version' || Object.hasOwn(commands.library, 'versions')
      || commands.trajectory.runtimeSessionId !== 'synthetic-session' || commands.trajectory.snapshot.events[0].blocks[0].text !== 'Synthetic recorded reasoning'
      || commands.trajectoryLocation.step !== 1 || commands.trajectory.snapshot.requests[0].resultSeq !== 5) throw new Error(JSON.stringify(commands));
    const author = page.frameLocator('#author-root iframe');
    await author.getByRole('button', { name: 'Play audio' }).click();
    await page.waitForFunction(() => document.querySelector('#author-root iframe').contentDocument.querySelector('#audio-result').textContent.includes('"status":"playing"'));
    const audio = await page.evaluate(async () => {
      const frame = document.querySelector('#author-root iframe'), api = frame.contentWindow.ElecKoi;
      const paused = await api.audio.pause(), sought = await api.audio.seek(2);
      const settings = await api.audio.setSettings({ masterVolume: 0.5, channels: { bgm: { volume: 0.4 } } });
      await api.audio.appendPlaylist('bgm', [{ id: 'synthetic-next', url: '../assets/synthetic.wav' }]);
      const playlist = await api.audio.getPlaylist(), resumed = await api.audio.resume();
      await api.audio.seek(11.95);
      return { paused, sought, settings, playlist, resumed };
    });
    if (audio.paused.status !== 'paused' || audio.sought.currentTime !== 2 || audio.sought.duration !== 12
      || audio.settings.channels.bgm.volume !== 0.4 || audio.playlist.items.length !== 2 || audio.resumed.status !== 'playing'
      || audio.playlist.items[0].url !== 'https://native-author.test/eleckoi/frontends/synthetic-project/assets/synthetic.wav') throw new Error(JSON.stringify(audio));
    await page.waitForFunction(() => document.querySelector('#author-root iframe').contentWindow.audioEvents.some(event => event.state.currentTrack?.id === 'synthetic-next' && event.state.status === 'playing'));
    const audioEvents = await page.evaluate(async () => {
      const frame = document.querySelector('#author-root iframe'); await frame.contentWindow.ElecKoi.audio.pause();
      return { audioState: await frame.contentWindow.ElecKoi.audio.getState(), events: frame.contentWindow.audioEvents,
        ...window.nativeFixture.snapshot() };
    });
    if (audioEvents.audioState.status !== 'paused' || audioEvents.audioState.currentTrack.id !== 'synthetic-next' || audioEvents.liveAudio !== 1
      || !audioEvents.events.some(event => event.state.status === 'playing')
      || !audioEvents.events.some(event => event.state.currentTime >= 2)) throw new Error(JSON.stringify(audioEvents));
    await author.locator('#score').fill('-1'); await author.getByRole('button', { name: 'Confirm' }).click();
    await page.waitForFunction(() => document.querySelector('#author-root iframe').contentDocument.querySelector('#result').textContent.includes('Synthetic score must not be negative'));
    const rejected = await page.evaluate(() => window.nativeFixture.snapshot());
    if (rejected.state.score !== 1 || rejected.pending !== 0) throw new Error(JSON.stringify(rejected));
    await author.locator('#score').fill('7'); await author.getByRole('button', { name: 'Confirm' }).click();
    await page.waitForFunction(() => document.querySelector('#author-root iframe').contentDocument.querySelector('#result').textContent.includes('synthetic-input'));
    const result = await page.evaluate(() => {
      const frame = document.querySelector('#author-root iframe'), doc = frame.contentDocument;
      return { ...window.nativeFixture.snapshot(), result: JSON.parse(doc.querySelector('#result').textContent),
        draft: document.querySelector('#composer').value, messages: document.querySelector('#messages').textContent,
        loadedImage: doc.querySelector('img').complete && doc.querySelector('img').naturalWidth === 1,
        overflow: doc.documentElement.scrollWidth > frame.clientWidth,
        color: frame.contentWindow.getComputedStyle(doc.body).color };
    });
    if (result.state.score !== 7 || result.state.derived !== 14 || result.pending || !result.loadedImage || result.overflow
      || result.color !== 'rgb(32, 32, 32)' || result.messages !== 'Synthetic score 7' || result.draft !== 'Synthetic draft'
      || result.result.context.surface !== 'application-frontend' || result.result.context.scope !== 'application'
      || result.result.context.projectId !== 'synthetic-project' || result.result.context.entryFile !== 'pages/main.html') throw new Error(JSON.stringify(result));
    await page.screenshot({ path: `output/playwright/native-project-${viewport.width}.png` });
    const detached = await page.evaluate(async () => {
      const frame = document.querySelector('#author-root iframe'), api = frame.contentWindow.ElecKoi;
      window.nativeFixture.selectChat(false);
      const context = await api.context.current(); let error;
      try { await api.variables.getState(); } catch (reason) { error = reason.message; }
      return { context, error, retained: frame === document.querySelector('#author-root iframe'), ...window.nativeFixture.snapshot() };
    });
    if (detached.context.conversationId !== '' || !detached.retained || !detached.error.includes('先选择一个聊天') || detached.liveAudio || !detached.audioPaused) throw new Error(JSON.stringify(detached));
    await page.evaluate(() => window.nativeFixture.selectChat(true));
    await page.waitForFunction(() => window.nativeRuntime.getSnapshot().status === 'ready');
    await page.evaluate(() => window.nativeFixture.dispose());
    const closed = await page.evaluate(async () => {
      let late;
      try { await document.querySelector('#author-root iframe').contentWindow.ElecKoi.context.current(); } catch (error) { late = error.code; }
      return { ...window.nativeFixture.snapshot(), late };
    });
    if (closed.frameCount || closed.objectUrls || closed.pending || closed.detailsSubscriptions || closed.librarySubscriptions || closed.liveAudio || !closed.audioPaused
      || closed.late !== 'FRAME_CLOSED') throw new Error(JSON.stringify(closed));
    await page.evaluate(() => window.nativeFixture.unmount());
    if (await page.locator('iframe,[data-eleckoi-frontend-recovery],[data-eleckoi-application-style]').count()) throw new Error('Native project resources were not released');
    results.push({ viewport, nativeProject: true, resourcesLoaded: true, nativeChatAndModels: true, nativeAudio: true,
      capabilities: commands.capabilities.length, score: result.state.score, derived: result.state.derived, released: true });
  }
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport); await page.goto('https://native-author.test/');
    await page.addScriptTag({ path: 'packages/client/features/dsh-client-author/lib/client.js' });
    await page.addStyleTag({ path: 'output/playwright/native-project/fixture.css' });
    await page.addScriptTag({ path: 'output/playwright/native-project/fixture.js' });
    await page.evaluate(async () => {
      await window.prepareNativeFixture(); window.nativeFixture.unmount();
      window.closeSyntheticRoleFixture = window.mountNativeCharacterFixture(window.nativeRuntime);
    });
    await page.getByRole('navigation', { name: '角色编辑器功能' }).getByRole('button', { name: '前端', exact: true }).click();
    await page.getByRole('region', { name: '角色前端工作台' }).waitFor();
    if (await page.getByRole('button', { name: '前端', exact: true }).getAttribute('aria-current') !== 'page') throw new Error('Role frontend entry was not selected');
    await page.getByRole('button', { name: '启用', exact: true }).click();
    await page.getByRole('button', { name: 'Show chat' }).click();
    await page.waitForFunction(() => document.querySelector('#author-root iframe')?.contentDocument.querySelector('#result')?.textContent === 'ready');
    const role = page.frameLocator('#author-root iframe');
    await role.locator('#score').fill('6'); await role.getByRole('button', { name: 'Confirm' }).click();
    await page.waitForFunction(() => document.querySelector('#author-root iframe').contentDocument.querySelector('#result').textContent.includes('synthetic-input'));
    const accepted = await page.evaluate(() => {
      const frame = document.querySelector('#author-root iframe'); window.oldSyntheticRoleApi = frame.contentWindow.ElecKoi;
      return { ...window.nativeFixture.snapshot(), result: JSON.parse(frame.contentDocument.querySelector('#result').textContent),
        draft: document.querySelector('#composer').value, loadedImage: frame.contentDocument.querySelector('img').naturalWidth === 1 };
    });
    if (accepted.state.score !== 6 || accepted.state.derived !== 12 || accepted.draft !== 'Synthetic draft' || !accepted.loadedImage
      || accepted.result.context.scope !== 'current-character' || accepted.result.context.surface !== 'character-frontend'
      || accepted.result.context.characterId !== 'synthetic-character' || accepted.result.context.conversationId !== 'synthetic-chat') throw new Error(JSON.stringify(accepted));
    await page.screenshot({ path: `output/playwright/native-character-chat-${viewport.width}.png` });
    if (await page.getByRole('button', { name: '恢复默认对话界面' }).count()) throw new Error('Chat must not reserve a restore toolbar');
    await page.getByRole('button', { name: 'Show editor' }).click();
    await page.getByRole('button', { name: '恢复默认对话界面' }).click();
    await page.getByRole('button', { name: 'Show chat' }).click();
    await page.getByText('Default transcript', { exact: true }).waitFor();
    const withdrawn = await page.evaluate(async () => { try { await window.oldSyntheticRoleApi.variables.getState(); } catch (error) { return error.code; } });
    if (withdrawn !== 'FRAME_CLOSED') throw new Error(`Role page remained active: ${withdrawn}`);
    await page.getByRole('button', { name: 'Show editor' }).click();
    await page.getByRole('navigation', { name: '角色编辑器功能' }).getByRole('button', { name: '前端', exact: true }).click();
    const imported = '<!doctype html><meta name="eleckoi-author-api" content="0.1.0"><title>Synthetic import</title><output id="context"></output><script type="module">const api=await window.ElecKoiReady;document.querySelector("#context").textContent=JSON.stringify(await api.context.current());</script>';
    await page.locator('input[type=file][accept=".html,.htm,.zip"]').setInputFiles({ name: 'synthetic-page.html', mimeType: 'text/html', buffer: Buffer.from(imported) });
    await page.getByRole('button', { name: 'index.html', exact: true }).click();
    const editor = page.getByRole('textbox', { name: '编辑 index.html' });
    await editor.fill(imported.replace('Synthetic import', 'Synthetic edited'));
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await page.getByText('已保存', { exact: true }).waitFor();
    const overflowing = await page.getByRole('region', { name: '角色前端工作台' }).evaluate(element => {
      const rect = element.getBoundingClientRect();
      return [...element.querySelectorAll('button,textarea')].filter(node => node.offsetWidth && node.getBoundingClientRect().right > rect.right + 1).map(node => node.textContent);
    });
    if (overflowing.length) throw new Error(JSON.stringify({ viewport, overflowing }));
    await page.screenshot({ path: `output/playwright/native-character-editor-${viewport.width}.png` });
    await page.getByRole('button', { name: '预览', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.character-frontend-editor').shadowRoot.querySelector('iframe')?.contentDocument.querySelector('#context')?.textContent.includes('character-frontend'));
    const preview = await page.evaluate(() => JSON.parse(document.querySelector('.character-frontend-editor').shadowRoot.querySelector('iframe').contentDocument.querySelector('#context').textContent));
    if (preview.characterId !== 'synthetic-character' || preview.entryFile !== 'index.html' || preview.scope !== 'current-character') throw new Error(JSON.stringify(preview));
    await page.getByRole('button', { name: '返回文件' }).click();
    await page.getByRole('button', { name: '启用', exact: true }).click();
    await page.getByRole('button', { name: 'Show chat' }).click();
    await page.waitForFunction(() => document.querySelector('#author-root iframe')?.contentDocument.querySelector('#context')?.textContent.includes('character-frontend'));
    await page.evaluate(async () => { await window.nativeFixture.dispose(); window.closeSyntheticRoleFixture(); });
    const released = await page.evaluate(() => ({ ...window.nativeFixture.snapshot(), visibleFrames: document.querySelectorAll('iframe').length }));
    if (released.visibleFrames || released.detailsSubscriptions || released.librarySubscriptions || released.objectUrls || released.pending) throw new Error(JSON.stringify(released));
    results.push({ viewport, nativeRoleProject: true, characterConfigurationEntry: true, importedAndEdited: true, previewedAndSelected: true, directSend: true, restored: true, released: true });
  }
  page.off('console', error);
  if (errors.length || unexpected.length) throw new Error(JSON.stringify({ errors, unexpected }));
  return { results, assets: [...new Set(assets)], errors, unexpected };
}
