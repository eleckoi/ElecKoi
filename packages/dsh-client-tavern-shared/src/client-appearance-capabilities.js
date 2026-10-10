export const CLIENT_APPEARANCE_METHODS = ['files.saveText', 'ui.chatPanels', 'appearance.backgrounds',
  'appearance.selectBackground', 'appearance.lockBackground', 'appearance.forceBackground',
  'appearance.theme', 'appearance.palette', 'appearance.messageStyle'];
const DEFAULT = 'eleckoi://chat-background/app-default', GLOBAL = 'eleckoi://chat-background/global';
const artwork = card => card.persona?.assistant_cover || card.coverImage || card.persona?.assistant_square
  || card.squareImage || card.persona?.assistant_avatar || card.avatar;

/** Browser-only operations delegate persistence to existing product services. */
export function installClientAppearanceBindings(runtime, bindings) {
  const { window, remote, sdk } = runtime;
  const bootstrap = bindings['plugins.bootstrap'];
  if (bootstrap) bindings['plugins.bootstrap'] = async (params, options) => {
    const value = await bootstrap(params, options), service = runtime.displayPreferences;
    if (!service) return value;
    if (service.getSnapshot().status !== 'ready') await service.refresh();
    const style = service.getSnapshot().ui.compatibility_message_style;
    return style ? { ...value, messageStyle: style } : value;
  };
  const invoke = (method, params) => bindings[method](params, { signal: runtime.abort.signal });
  const context = p => {
    const snapshot = runtime.conversations.getDetailsSnapshot();
    const conversationId = p.conversationId || runtime.capturePresentation().conversationId;
    const characterId = p.characterId || (snapshot.id === conversationId && snapshot.details?.metadata?.characterId);
    if (!characterId) throw new Error('Background operation requires a character');
    return { ...p, conversationId, characterId };
  };
  const character = async p => {
    const collection = sdk.unwrapRemote(await remote.eleckoiCharacters.list());
    const result = collection.items.find(item => item.id === p.characterId);
    if (!result) throw new Error(`Character does not exist: ${p.characterId}`);
    return result;
  };
  const preferences = () => {
    const service = runtime.displayPreferences;
    if (!service || service.getSnapshot().status !== 'ready') throw new Error('Display preferences are not ready');
    return service;
  };
  const metadata = p => invoke('messages.metadata', { conversationId: p.conversationId });
  const persist = async (p, value) => {
    await invoke('messages.metadata', { conversationId: p.conversationId, value });
    if (runtime.conversations.getDetailsSnapshot().id === p.conversationId) await runtime.conversations.refreshDetails();
    return value;
  };
  const backgrounds = async p => {
    const card = await character(p), ui = preferences().getSnapshot().ui, lock = (await metadata(p)).eleckoi_background;
    const candidates = new Map([['default', DEFAULT]]);
    if (artwork(card)) candidates.set('character', '');
    if (ui.global_chat_wallpaper?.image) candidates.set('global', GLOBAL);
    if (card.chatBackground && ![DEFAULT, GLOBAL].includes(card.chatBackground)) candidates.set(card.chatBackground.split('/').at(-1), card.chatBackground);
    if (lock) candidates.set(lock.name, lock.path);
    const current = lock?.name ?? [...candidates].find(([, value]) => value === (card.chatBackground || ''))?.[0] ?? 'default';
    return { current, items: [...candidates].map(([name, path]) => ({ name, path })) };
  };
  bindings['files.saveText'] = async p => {
    if (typeof p.name !== 'string' || !p.name.trim()) throw new TypeError('Filename is required');
    if (typeof p.text !== 'string') throw new TypeError('text must be a string');
    const mime = p.mimeType || 'text/plain', bytes = new TextEncoder().encode(p.text).length;
    if (!mime.includes('/')) throw new TypeError('Invalid MIME type');
    if (window.ElecKoiPlatform?.saveText) {
      const result = await window.ElecKoiPlatform.saveText(p.name, p.text, mime);
      return result.cancelled ? { saved: false, cancelled: true } : { saved: true, name: p.name, uri: result.result, bytes };
    }
    if (window.dshDesktop?.files?.saveText) {
      return window.dshDesktop.files.saveText({ name: p.name, text: p.text, mimeType: mime });
    }
    if (window.showSaveFilePicker) {
      let handle;
      try { handle = await window.showSaveFilePicker({ suggestedName: p.name }); }
      catch (error) { if (error.name === 'AbortError') return { saved: false, cancelled: true }; throw error; }
      const stream = await handle.createWritable(); await stream.write(p.text); await stream.close();
      return { saved: true, name: handle.name, uri: '', bytes };
    }
    // Browser download cannot observe whether a user actually saved the document.
    const url = window.URL.createObjectURL(new window.Blob([p.text], { type: mime }));
    try { const anchor = window.document.createElement('a'); anchor.href = url; anchor.download = p.name; anchor.click(); }
    finally { window.setTimeout(() => window.URL.revokeObjectURL(url), 1000); }
    return { saved: false, downloadStarted: true, name: p.name, bytes };
  };
  bindings['ui.chatPanels'] = p => runtime.requestChatUi('ui.chatPanels', p);
  bindings['appearance.backgrounds'] = p => backgrounds(context(p));
  bindings['appearance.selectBackground'] = async p => {
    p = context(p);
    const item = (await backgrounds(p)).items.find(item => item.name.toLowerCase() === String(p.name).toLowerCase());
    if (!item) throw new Error(`Background does not exist: ${p.name}`);
    const state = await metadata(p);
    if (state.eleckoi_background) await persist(p, { ...state, eleckoi_background: item, custom_background: item.path });
    else { const card = await character(p); sdk.unwrapRemote(await remote.eleckoiCharacters.update({ ...card, chatBackground: item.path })); }
    const result = await backgrounds(p);
    await runtime.adapter.publish('appearance.changed', result);
    return result;
  };
  bindings['appearance.lockBackground'] = async p => {
    p = context(p);
    if (typeof p.locked !== 'boolean') throw new TypeError('locked must be a boolean');
    const state = await metadata(p);
    if (p.locked) { const values = await backgrounds(p); const item = values.items.find(item => item.name === values.current);
      await persist(p, { ...state, eleckoi_background: item, custom_background: item.path }); }
    else { delete state.eleckoi_background; delete state.custom_background; await persist(p, state); }
    const result = await backgrounds(p);
    await runtime.adapter.publish('appearance.changed', { ...result, conversationId: p.conversationId });
    return result;
  };
  bindings['appearance.forceBackground'] = async p => {
    p = context(p);
    if (typeof p.image !== 'string' || !p.image) throw new TypeError('Background image is required');
    const uploaded = await invoke('media.importBackground', { ...p, image: p.image });
    const reference = typeof uploaded === 'string' ? uploaded : uploaded.reference || uploaded.path || uploaded.url;
    if (!reference) throw new Error('Media upload did not return a background reference');
    const state = await metadata(p), item = { name: p.path || reference.split('/').at(-1), path: reference };
    const value = await persist(p, { ...state, eleckoi_background: item, custom_background: p.url || reference,
      chat_backgrounds: [...(state.chat_backgrounds || []), p.path || ''] });
    await runtime.adapter.publish('appearance.changed', { conversationId: p.conversationId, metadata: value });
    return value;
  };
  bindings['appearance.theme'] = async p => {
    const service = preferences(), ui = service.getSnapshot().ui;
    const modeName = mode => mode[0].toUpperCase() + mode.slice(1);
    if (!p.name) {
      const active = ui.compatibility_theme_active, palette = ui.compatibility_palettes?.[active];
      if (palette && JSON.stringify(palette) === JSON.stringify(ui.appearance_theme)) return active;
      return modeName(ui.appearance_mode || 'light');
    }
    const mode = String(p.name).toLowerCase(), native = ['light', 'dark', 'system'].includes(mode);
    const saved = Object.entries(ui.compatibility_palettes || {}).find(([name]) => name.toLowerCase() === mode);
    if (!native && !saved) throw new Error(`Theme does not exist: ${p.name}`);
    const selected = native ? modeName(mode) : saved[0];
    await service.updateUi({ appearance_mode: native ? mode : saved[1].mode === 'deep' ? 'dark' : 'light',
      appearance_theme: native ? null : saved[1], compatibility_theme_active: selected });
    return selected;
  };
  bindings['appearance.palette'] = async p => {
    p = context(p);
    const list = await backgrounds(p), reference = p.background || list.current, item = list.items.find(item => item.name.toLowerCase() === reference.toLowerCase());
    if (!item) throw new Error(`Background does not exist: ${reference}`);
    const name = p.name || `bgcol - ${reference}`, service = preferences(), ui = service.getSnapshot().ui;
    if (p.force || !ui.compatibility_palettes?.[name]) {
      const card = await character(p), image = item.path === GLOBAL ? ui.global_chat_wallpaper.image : item.path === ''
        ? artwork(card) : item.path;
      const theme = await runtime.requestChatUi('appearance.createPalette', { ...p, image, name });
      await service.updateUi(current => ({ ...current, compatibility_palettes: { ...current.compatibility_palettes, [name]: theme } }));
    }
    return bindings['appearance.theme']({ name });
  };
  bindings['appearance.messageStyle'] = async p => {
    if (!['single', 'bubble', 'flat'].includes(p.style)) throw new TypeError(`Unknown message style: ${p.style}`);
    const service = preferences(), state = service.getSnapshot(), layout = p.style === 'bubble' ? 'social' : 'roleplay';
    await service.setChatDisplay({ ...state.chatDisplay, layout, profiles: { ...state.chatDisplay.profiles,
      [layout]: { ...state.chatDisplay.profiles[layout], assistant_bubble_enabled: p.style === 'bubble' } } });
    await service.updateUi({ compatibility_message_style: p.style });
    await runtime.adapter.publish('appearance.changed', { messageStyle: p.style });
    return p.style;
  };
}
