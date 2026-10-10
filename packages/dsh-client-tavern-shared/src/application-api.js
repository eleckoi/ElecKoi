/** Stable application facade over the application's existing Client models. */
const MODEL_ACTIONS = {
  characters: ['refresh', 'create', 'update', 'select', 'delete', 'saveGroups', 'prepareImport', 'commitImport', 'discardImport', 'exportCharacters'],
  conversations: ['refresh', 'create', 'delete', 'activate', 'open', 'openTimeline', 'closeTimeline', 'pageOlder', 'refreshDetails', 'refreshTimeline', 'selectOpening', 'updateOpening', 'editMessage', 'deleteMessagesFrom', 'readModelSelection', 'selectModel', 'readAuthorState', 'replaceAuthorVariableState', 'readTrajectory', 'exportArchive', 'importArchive', 'uploadFile', 'readImage', 'revealFile', 'cancelRequest'],
  presets: ['refresh', 'read', 'save', 'create', 'import', 'export', 'setActive', 'createGroup', 'renameGroup', 'assignGroup', 'deleteGroup', 'delete'],
  models: ['refresh', 'save', 'deleteConfig', 'deleteProvider', 'discover', 'testConnection', 'revealApiKey'],
  settingLibraries: ['read', 'readUntracked', 'save', 'saveViewState', 'listCharacters', 'readConversations', 'saveConversation', 'resetConversation', 'saveConversationVersion'],
  variables: ['read', 'readUntracked', 'save', 'saveViewState'],
  regexRules: ['read', 'readUntracked', 'save', 'import', 'export', 'test'],
  persona: ['refresh', 'save'], appearance: ['refresh', 'updateUi', 'setChatDisplay'],
  webSearch: ['refresh', 'update', 'saveAndTest', 'test', 'removeKey'],
  creator: ['refresh', 'create', 'delete', 'selectDirectory', 'finishDirectory', 'enterProject', 'createAssistantConversation', 'openAssistantConversation', 'sendAssistant', 'cancelAssistant'],
};
const DOMAINS = {
  characters: ['characters'], conversations: ['conversations'], presets: ['presets'], models: ['models'],
  persona: ['persona'], appearance: ['appearance'], webSearch: ['webSearch'], creator: ['creator'],
  conversationDetails: ['conversations', 'getDetailsSnapshot', 'subscribeDetails', 'conversation'],
  timeline: ['conversations', 'getTimelineSnapshot', 'subscribeTimeline', 'conversation'],
  stream: ['conversations', 'getStreamSnapshot', 'subscribeStream', 'conversation'],
  modelSelection: ['conversations', 'getModelSelectionSnapshot', 'subscribeModelSelection'],
  stats: ['conversations', 'getStatsSnapshot', 'subscribeStats', 'conversation'],
  presetDetail: ['presets', 'getDetailSnapshot', 'subscribeDetail', 'preset'],
  settingLibraries: ['settingLibraries', 'getSnapshot', 'subscribe', 'character'],
  conversationSettingLibraries: ['settingLibraries', 'getConversationSnapshot', 'subscribe', 'character-conversations'],
  variables: ['variables', 'getSnapshot', 'subscribe', 'character'], regexRules: ['regexRules', 'getSnapshot', 'subscribe', 'character'],
  creatorDirectory: ['creator', 'getDirectorySnapshot', 'subscribeDirectory'],
  creatorAssistant: ['creator', 'getAssistantSnapshot', 'subscribeAssistant', 'project'],
};
function unavailable(message, code = 'APPLICATION_SERVICE_NOT_READY') { return Object.assign(new Error(message), { code }); }
function requiredOwner(owner, domain) {
  if (typeof owner !== 'string' || !owner) throw unavailable(`${domain} requires an explicit owner id`, 'APPLICATION_OWNER_REQUIRED');
  return owner;
}
function store(snapshot) {
  let value = snapshot; const listeners = new Set();
  return { getSnapshot: () => value, subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    publish(next) { value = next; for (const listener of listeners) listener(); }, dispose() { listeners.clear(); } };
}
export function createApplicationApi(runtime, services = {}) {
  const models = { ...services, conversations: runtime.conversations, appearance: runtime.displayPreferences };
  const documents = new Map();
  const navigationStore = store({ pageId: runtime.layout?.panelInfo?.getSnapshot?.()?.activePanelId ?? 'messages',
    conversationId: runtime.conversations.getDetailsSnapshot().id || null, characterId: null,
    view: new URL(runtime.window.location?.href || 'http://localhost/').searchParams.get('view') || 'main' });
  const environmentStore = store({ view: navigationStore.getSnapshot().view, viewport: { width: runtime.window.innerWidth || 0, height: runtime.window.innerHeight || 0 },
    container: null, safeArea: null, theme: runtime.window.document?.documentElement?.dataset?.theme || null,
    platform: runtime.window.ElecKoiPlatform ? 'android' : runtime.window.dshDesktop ? 'desktop' : 'browser' });
  const targetsStore = store([]);
  // Functions authored in adopted same-origin documents identify their own realm.
  // This preserves one shared facade and releases each document's subscriptions.
  const track = (listener, dispose) => {
    let owner;
    for (const [window, stops] of documents) if (window !== runtime.window && window.Function && listener instanceof window.Function) { owner = stops; break; }
    if (!owner) owner = documents.get(runtime.window);
    let active = true;
    const stop = () => { if (!active) return; active = false; owner?.delete(stop); dispose(); };
    owner?.add(stop); return stop;
  };
  const subscribeStore = value => listener => track(listener, value.subscribe(listener));
  const model = name => {
    const value = models[name]; if (!value) throw unavailable(`Application service is not connected: ${name}`); return value;
  };
  const invoke = (name, method, args) => {
    const value = model(name);
    if (typeof value[method] !== 'function') throw unavailable(`Application action is not connected: ${name}.${method}`);
    return value[method](...args);
  };
  const actions = {};
  for (const [name, methods] of Object.entries(MODEL_ACTIONS)) {
    actions[name] = {};
    for (const method of methods) if (typeof models[name]?.[method] === 'function') actions[name][method] = (...args) => invoke(name, method, args);
  }
  if (typeof models.conversations?.open === 'function') actions.conversations.open = id => runtime.openApplicationConversation(requiredOwner(id, 'conversations'));
  const conversationId = id => requiredOwner(id || runtime.conversations.getDetailsSnapshot().id, 'conversations');
  const generationRequests = new Map();
  for (const method of ['send', 'regenerate']) if (typeof runtime.conversations[method] === 'function') actions.conversations[method] = (input = {}) => {
    const captured = { ...input, conversationId: conversationId(input.conversationId),
      requestId: input.requestId || runtime.window.crypto?.randomUUID?.() || `frontend-${Date.now()}-${Math.random()}` };
    // Official stream projections intentionally do not expose requestId. Retain
    // only this SDK call's receipt identity until the original Agent settles.
    if (!generationRequests.has(captured.conversationId)) generationRequests.set(captured.conversationId, captured.requestId);
    const release = () => { if (generationRequests.get(captured.conversationId) === captured.requestId) generationRequests.delete(captured.conversationId); };
    try { return Promise.resolve(invoke('conversations', method, [captured])).finally(release); }
    catch (error) { release(); throw error; }
  };
  actions.conversations.cancel = (id, requestId) => {
    const captured = conversationId(id), stream = runtime.conversations.getStreamSnapshot();
    const request = requestId || generationRequests.get(captured) || (stream.id === captured ? stream.requestId : null);
    if (request) return invoke('conversations', 'cancelRequest', [captured, request]);
    if (runtime.conversations.getDetailsSnapshot().id === captured && stream.id === captured && stream.status === 'running' && stream.runId) {
      return invoke('conversations', 'cancelStream', [stream.runId]);
    }
    throw unavailable(`No active request is available for conversation: ${captured}`, 'GENERATION_NOT_RUNNING');
  };
  let pluginEntry, pluginFace, pluginStops = [], pluginSnapshot = null;
  const pluginListeners = new Set();
  const bindPlugins = () => {
    const entry = runtime.slots?.entriesOfSlot('main').find(item => item.options.key === 'plugins');
    if (entry === pluginEntry) return;
    pluginStops.splice(0).forEach(stop => stop()); pluginEntry = entry; pluginFace = entry?.inject?.();
    const publish = () => { pluginSnapshot = pluginFace ? { manager: pluginFace.hooks.pluginManager.getSnapshot(),
      configuration: pluginFace.hooks.configLedger.getSnapshot() } : null; for (const listener of pluginListeners) listener(); };
    if (pluginFace) pluginStops.push(pluginFace.hooks.pluginManager.subscribe(publish), pluginFace.hooks.configLedger.subscribe(publish));
    publish();
  };
  const plugin = () => { bindPlugins(); if (!pluginFace) throw unavailable('The DSH plugin manager is not connected'); return pluginFace; };
  actions.plugins = {};
  for (const method of ['ensure', 'refresh', 'setEnabled', 'setRowEnabled', 'openInstall', 'closeInstall', 'editInstallSpec', 'runInstall', 'uninstall', 'confirm', 'cancelConfirm', 'chooseRegistry', 'cancelInstall', 'configForm']) actions.plugins[method] = (...args) => {
    const face = plugin(); if (typeof face[method] !== 'function') throw unavailable(`Plugin manager action is not connected: ${method}`); return face[method](...args);
  };
  actions.pluginUi = { refresh: () => runtime.refreshUiEntries(), open: (pluginId, id) => runtime.openPanel(pluginId, id) };
  const getSnapshot = (domain, owner) => {
    if (domain === 'plugins') { plugin(); return pluginSnapshot; }
    if (domain === 'pluginUi') return runtime.getSnapshot().uiEntries;
    if (domain === 'slots') return targetsStore.getSnapshot();
    const spec = DOMAINS[domain]; if (!spec) throw unavailable(`Unknown application domain: ${domain}`, 'APPLICATION_DOMAIN_UNKNOWN');
    const [name, get = 'getSnapshot', , kind] = spec;
    if (kind?.startsWith('character') || kind === 'preset') requiredOwner(owner, domain);
    const value = model(name)[get](...(kind?.startsWith('character') || kind === 'preset' ? [owner] : []));
    if (owner && (kind === 'conversation' && value.id !== owner || kind === 'project' && value.projectId !== owner)) {
      throw unavailable(`The active ${domain} projection belongs to another owner: ${owner}`, 'APPLICATION_OWNER_NOT_ACTIVE');
    }
    return value;
  };
  const subscribe = (domain, owner, listener) => {
    if (typeof owner === 'function') { listener = owner; owner = undefined; }
    if (typeof listener !== 'function') throw new TypeError('Application subscription requires a listener');
    if (domain === 'slots') return track(listener, targetsStore.subscribe(listener));
    if (domain === 'pluginUi') return track(listener, runtime.subscribe(listener));
    if (domain === 'plugins') { bindPlugins(); pluginListeners.add(listener); return track(listener, () => pluginListeners.delete(listener)); }
    const spec = DOMAINS[domain]; if (!spec) throw unavailable(`Unknown application domain: ${domain}`, 'APPLICATION_DOMAIN_UNKNOWN');
    const [name, , sub = 'subscribe', kind] = spec, value = model(name);
    if (kind?.startsWith('character') || kind === 'preset') requiredOwner(owner, domain);
    const notify = kind?.startsWith('character') ? (changeKind, id) => { if (id === owner && changeKind === (kind === 'character-conversations' ? 'conversations' : 'configuration')) listener(); }
      : kind === 'conversation' && owner ? () => { if (runtime.conversations.getDetailsSnapshot().id === owner) listener(); }
        : kind === 'project' && owner ? () => { if (value.getAssistantSnapshot().projectId === owner) listener(); } : listener;
    return track(listener, kind === 'preset' ? value[sub](owner, notify) : value[sub](notify));
  };
  const read = (domain, owner) => {
    if (['settingLibraries', 'variables', 'regexRules'].includes(domain)) return invoke(domain, 'read', [requiredOwner(owner, domain)]);
    if (domain === 'conversationSettingLibraries') return invoke('settingLibraries', 'readConversations', [requiredOwner(owner, domain)]);
    if (domain === 'presetDetail') return invoke('presets', 'read', [requiredOwner(owner, domain)]);
    if (domain === 'conversationDetails') return actions.conversations.open(conversationId(owner));
    if (domain === 'timeline') return invoke('conversations', 'openTimeline', [conversationId(owner)]);
    if (domain === 'modelSelection') return invoke('conversations', 'readModelSelection', [conversationId(owner)]);
    if (domain === 'creatorAssistant') return invoke('creator', 'enterProject', [requiredOwner(owner, domain)]);
    if (domain === 'plugins') return actions.plugins.ensure();
    if (domain === 'pluginUi') return runtime.refreshUiEntries();
    if (domain === 'slots') return targetsStore.getSnapshot();
    if (!Object.hasOwn(DOMAINS, domain)) throw unavailable(`Unknown application domain: ${domain}`, 'APPLICATION_DOMAIN_UNKNOWN');
    if (['characters', 'conversations', 'presets', 'models', 'persona', 'appearance', 'webSearch', 'creator'].includes(domain)) return invoke(DOMAINS[domain][0], 'refresh', []);
    return getSnapshot(domain, owner);
  };
  const navPublish = () => navigationStore.publish({ ...navigationStore.getSnapshot(),
    pageId: runtime.layout?.panelInfo?.getSnapshot?.()?.activePanelId ?? 'messages',
    conversationId: runtime.conversations.getDetailsSnapshot().id || null });
  const navigation = Object.freeze({ getSnapshot: navigationStore.getSnapshot, subscribe: subscribeStore(navigationStore),
    async open(target) {
      if (typeof target === 'string') target = { pageId: target };
      const captured = { ...target };
      if (captured.characterId) await invoke('characters', 'select', [captured.characterId]);
      if (captured.conversationId) {
        const details = await actions.conversations.open(captured.conversationId);
        if (!details) throw unavailable('The requested conversation was superseded while opening', 'APPLICATION_OWNER_NOT_ACTIVE');
      }
      if (captured.view && captured.view !== navigationStore.getSnapshot().view) {
        if (!windowNavigation) throw unavailable('Product window navigation is not connected');
        await windowNavigation(captured); return navigationStore.getSnapshot();
      }
      const pageId = captured.pageId || (captured.conversationId ? 'messages' : null);
      if (pageId) {
        if (!runtime.slots?.entriesOfSlot('main').some(entry => entry.options.key === pageId)) throw unavailable(`Application page does not exist: ${pageId}`, 'APPLICATION_PAGE_UNKNOWN');
        runtime.layout.selectPanel(pageId);
      }
      navigationStore.publish({ ...navigationStore.getSnapshot(), ...captured, ...(pageId ? { pageId } : {}) });
      return navigationStore.getSnapshot();
    }, registerBackHandler(handler, priority = 100) {
      if (!backRegistration) throw unavailable('Platform Back service is not connected');
      return track(handler, backRegistration(handler, runtime.window, priority));
    }, back() { if (!backAction) throw unavailable('Platform Back service is not connected'); return backAction(); } });
  let windowNavigation, backRegistration, backAction;
  const environment = Object.freeze({ getSnapshot: environmentStore.getSnapshot, subscribe: subscribeStore(environmentStore) });
  const platform = Object.freeze({ environment, get native() { return runtime.window.ElecKoiPlatform || null; },
    get desktop() { return runtime.window.dshDesktop || null; } });
  for (const methods of Object.values(actions)) Object.freeze(methods);
  const capabilities = Object.freeze({ version: '1.0.0', domains: Object.freeze(Object.keys(DOMAINS).filter(domain => Boolean(models[DOMAINS[domain][0]])).concat(['plugins', 'pluginUi', 'slots'])),
    actions: Object.freeze(Object.fromEntries(Object.entries(actions).map(([name, value]) => [name, Object.freeze(Object.keys(value))]))),
    get slots() { return targetsStore.getSnapshot(); }, pluginUiKinds: Object.freeze(['panel', 'script-button']) });
  // Advanced authors can use exactly the same generated Remote as default UI.
  // Keep its native Result envelope and stream contracts rather than inventing RPCs.
  const application = Object.freeze({ version: '1.0.0', capabilities, getSnapshot, subscribe, read, actions: Object.freeze(actions), remote: runtime.remote });
  const stopLayout = runtime.layout?.panelInfo?.subscribe(navPublish), stopConversations = runtime.subscribe(navPublish);
  const stopSlots = runtime.slots?.subscribe('main', bindPlugins); bindPlugins();
  return { application, navigation, platform, environment,
    registerDocument(window) {
      if (documents.has(window)) return;
      const stops = new Set(); documents.set(window, stops);
      const release = () => { for (const stop of [...stops]) stop(); documents.delete(window); window.removeEventListener?.('pagehide', release); };
      stops.add(() => window.removeEventListener?.('pagehide', release)); window.addEventListener?.('pagehide', release, { once: true });
    }, trackDocument(window, stop) { const stops = documents.get(window); let active = true; const dispose = () => { if (!active) return; active = false; stops?.delete(dispose); stop(); }; stops?.add(dispose); return dispose; },
    releaseDocument(window) { const stops = documents.get(window); if (!stops) return; for (const stop of [...stops]) stop(); documents.delete(window); },
    setEnvironment(patch) { environmentStore.publish({ ...environmentStore.getSnapshot(), ...patch }); },
    registerFrontendTargets(targets) { targetsStore.publish(targets); },
    connectNavigation(services) { windowNavigation = services.openWindow; backRegistration = services.registerBackHandler; backAction = services.back; },
    dispose() { stopLayout?.(); stopConversations(); stopSlots?.(); pluginStops.splice(0).forEach(stop => stop());
      for (const window of [...documents.keys()]) this.releaseDocument(window); pluginListeners.clear(); navigationStore.dispose(); environmentStore.dispose(); targetsStore.dispose(); }
  };
}
