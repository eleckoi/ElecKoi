import { SharedAudioRuntime, invokePlatformSpeech } from './media-runtime.js';
import { installClientAppearanceBindings } from './client-appearance-capabilities.js';
import { installClientApiBindings } from './client-api-handlers.js';
import { readBackgroundPresentation } from './background-presentation.js';
import { createApplicationApi } from './application-api.js';
/** Application-owned state. Screens only mount/unmount their own documents. */
export class TavernSharedClient {
  constructor({ window, remote, conversations, sdk, report, displayPreferences, layout, slots, services }) {
    this.window = window; this.remote = remote; this.conversations = conversations; this.sdk = sdk;
    this.displayPreferences = displayPreferences;
    this.layout = layout; this.slots = slots;
    this.report = report || (error => console.error('ElecKoi 共享兼容运行时失败', error));
    this.listeners = new Set(); this.frames = new Map(); this.stops = [];
    this.state = { status: 'starting', error: '', methods: [], uiEntries: [] }; this.closed = false;
    this.eventQueue = Promise.resolve(); this.syncQueue = Promise.resolve(); this.abort = new AbortController();
    this.lastConversationId = ''; this.realm = null; this.adapter = null; this.initialized = null;
    this.clientId = window.crypto?.randomUUID?.() || `realm-${Date.now()}-${Math.random()}`;
    this.callbackTasks = new Map(); this.presentations = new Map(); this.legacyCallbackResults = new Map();
    this.chatUi = new Map();
    this.applicationBridge = createApplicationApi(this, services);
    this.application = this.applicationBridge.application; this.navigation = this.applicationBridge.navigation;
    this.environment = this.applicationBridge.environment; this.platform = this.applicationBridge.platform;
    this.audioRuntime = new SharedAudioRuntime(window, (event, state) => {
      this.remote.eleckoiAuthorPlugins.invoke({ method: 'audio.report', params: { event, state } })
        .then(this.sdk.unwrapRemote).catch(error => this.fail(error));
    });
  }
  getSnapshot = () => this.state;
  subscribe = listener => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  publish(patch) {
    this.state = { ...this.state, ...patch }; for (const listener of this.listeners) listener();
    if (this.window.CustomEvent) this.window.dispatchEvent(new this.window.CustomEvent('eleckoi:shared-runtime', { detail: this }));
  }
  fail(error) { if (this.closed) return; this.publish({ status: 'error', error: error.message || String(error) }); this.report(error); }
  async start() {
    const pagehide = () => { void this.dispose({ pagehide: true }).catch(error => this.report(error)); };
    this.window.addEventListener?.('pagehide', pagehide, { once: true });
    this.stops.push(() => this.window.removeEventListener?.('pagehide', pagehide));
    const [compatibility, author] = await Promise.all([
      this.remote.eleckoiCompatibility.capabilities().then(this.sdk.unwrapRemote),
      this.remote.eleckoiAuthorPlugins.capabilities().then(this.sdk.unwrapRemote)
    ]);
    if (this.closed) throw new Error('Shared Client has closed');
    this.assetsBaseUrl = author.assetsBaseUrl;
    const bindings = {};
    for (const [methods, remote] of [[compatibility.methods, this.remote.eleckoiCompatibility], [author.methods, this.remote.eleckoiAuthorPlugins]]) {
      for (const method of methods) {
        if (bindings[method]) throw new Error(`Ambiguous shared Host capability: ${method}`);
        bindings[method] = async (params, { signal }) => {
          if (signal.aborted) throw signal.reason;
          let captured = params;
          if (!params.conversationId && !this.conversations.getDetailsSnapshot().id
            && ((/^(messages\.|context\.|openings\.|generation\.|chat\.)/.test(method) && !['chat.list', 'chat.create'].includes(method))
              || method.startsWith('variables.') && ['chat', 'message'].includes(params.scope || 'chat'))) {
            throw Object.assign(new Error('当前页面尚未选定聊天会话'), { code: 'CHAT_NOT_READY' });
          }
          if (method === 'plugins.bootstrap') {
            const id = Object.hasOwn(params, 'conversationId') ? params.conversationId : this.conversations.getDetailsSnapshot().id;
            if (id) {
              const presentation = await this.resolvePresentation(id, { signal });
              captured = { ...params, conversationId: presentation.conversationId, presentation };
            } else captured = { ...params, conversationId: null };
          } else if (method === 'scripts.synchronize') {
            captured = { ...params, conversationId: params.conversationId || this.conversations.getDetailsSnapshot().id || null };
          } else if (method === 'chat.getGenerationState') {
            const presentation = await this.resolvePresentation(params.conversationId, { signal });
            captured = { ...params, presentation };
          } else if (method === 'plugins.hookResult') {
            const local = this.legacyCallbackResults.get(params.token);
            if (local) { local.reply = params; return true; }
            captured = { ...params, clientId: this.clientId };
          } else if (method === 'groups.createChat') {
            // A newly created group has no active-chat attachment. Its opening
            // callback belongs to this application realm, not another WebView.
            captured = { ...params, clientId: this.clientId };
          }
          const invoke = async () => {
            if (signal.aborted) throw signal.reason;
            if (this.abort.signal.aborted) throw this.abort.signal.reason;
            return this.sdk.unwrapRemote(await remote.invoke({ method, params: captured }));
          };
          let updatesNativeBody = false;
          if (method === 'messages.update' && captured.messages.some(message => message.id !== 'opening')) {
            // Metadata-only updates do not retire the Host Session; match its selected candidate before detaching ours.
            const current = this.sdk.unwrapRemote(await remote.invoke({ method: 'messages.read', params: { conversationId: captured.conversationId } }));
            updatesNativeBody = captured.messages.some(message => {
              if (message.id === 'opening') return false;
              const previous = current.find(item => item.id === message.id);
              if (!previous) return false;
              const selected = message.swipe_id ?? previous.swipe_id ?? 0;
              const content = message.content ?? (message.swipes ?? previous.swipes ?? [previous.content])[selected];
              const info = (message.swipes_info ?? message.metadata?.swipes_info ?? [])[selected]
                ?? previous.swipes_info?.[selected] ?? { extra: { reasoning: selected === (previous.swipe_id ?? 0) ? previous.reasoning || '' : '' } };
              const reasoning = message.reasoning ?? message.metadata?.extra?.reasoning ?? info?.extra?.reasoning ?? '';
              return content !== previous.content || (message.role ?? previous.role) !== previous.role || reasoning !== (previous.reasoning || '');
            });
          }
          const timelineMutation = ['messages.deleteFrom', 'messages.regenerate', 'messages.editAndRegenerate'].includes(method)
            // These main modes rewind the same native Session as message
            // regeneration. Own its retirement/rebind before hydrating hooks.
            || method === 'chat.generateFromHistory' && ['regenerate', 'swipe'].includes(captured.type)
              && captured.options?.dryRun !== true
            || updatesNativeBody
            || ['messages.insert', 'messages.replace'].includes(method)
              && captured.messages.some(message => message.id !== 'opening');
          const result = timelineMutation
            ? await this.conversations.mutateCompatibilityTimeline(captured.conversationId, invoke) : await invoke();
          if (signal.aborted) throw signal.reason;
          if (method === 'scripts.synchronize' && (this.conversations.getDetailsSnapshot().id || null) === captured.conversationId
            && this.conversations.getDetailsSnapshot().status !== 'loading') await this.mountScripts(result);
          if (method === 'extensions.updateComponent' && result.open && result.updateUrl) {
            const opened = this.window.open(result.updateUrl, '_blank');
            if (!opened) throw new Error(`Release page could not be opened: ${result.updateUrl}`);
          }
          return result;
        };
      }
    }
    for (const method of ['input.get', 'input.set', 'input.append', 'input.clear', 'input.send', 'presentation.current',
      'ui.openBackground', 'ui.openHistory', 'ui.editMessage', 'ui.showProcess']) {
      bindings[method] = params => this.requestChatUi(method, params);
    }
    for (const [method, pageId] of [['ui.openSettings', 'settings'], ['ui.openModels', 'model']]) bindings[method] = params => {
      const id = params.conversationId || this.conversations.getDetailsSnapshot().id;
      return this.chatUi.get(id)?.handlers[method] ? this.requestChatUi(method, params) : this.navigation.open(pageId);
    };
    bindings['ui.createChat'] = params => this.createApplicationChat(params);
    bindings['chats.open'] = async params => { await this.navigation.open({ conversationId: params.id || params.conversationId || params.sessionId }); return { accepted: true }; };
    bindings['chats.close'] = () => { this.conversations.activate(''); return { accepted: true }; };
    bindings['chats.openHistory'] = params => this.requestChatUi('chats.openHistory', params);
    installClientAppearanceBindings(this, bindings);
    installClientApiBindings(this, bindings);
    this.adapter = this.sdk.createHostAdapter(bindings, { tokenizeSync: params => {
      if (!author.methods.includes('tokens.remote')) throw new Error('Provider tokenizer Host capability is not connected');
      // The upstream synchronous interface uses the existing same-origin generated
      // HTTP carrier; it does not introduce a native bridge or another wire format.
      const xhr = new this.window.XMLHttpRequest(), endpoint = 'eleckoiAuthorPlugins/invoke', rpcId = this.window.crypto?.randomUUID?.() || String(Date.now());
      xhr.open('POST', '/api/' + endpoint, false); xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.send(JSON.stringify({ type: 'client-request', rpcId, method: endpoint,
        payload: { args: { command: { method: 'tokens.remote', params } } } }));
      if (xhr.status !== 200) throw new Error(`Provider tokenizer carrier HTTP ${xhr.status}: ${xhr.responseText}`);
      const reply = JSON.parse(xhr.responseText);
      if (reply.type !== 'server-response' || reply.rpcId !== rpcId) throw new Error('Provider tokenizer carrier returned a mismatched response');
      return this.sdk.unwrapRemote(reply.result);
    } });
    this.createContainers();
    this.realm = this.sdk.createSharedRealm(this.window, this.adapter);
    this.realm.captureAuthorContext = () => {
      const snapshot = this.conversations.getDetailsSnapshot();
      return snapshot.id ? { conversationId: snapshot.id } : undefined;
    };
    this.window.__ElecKoiClientCompatibility = this;
    this.publish({ methods: this.adapter.methods() });
    this.stops.push(this.conversations.subscribeDetails(() => this.schedule(() => this.contextChanged())));
    this.stops.push(this.conversations.subscribeModelSelection(() => this.schedule(() => this.refreshState())));
    this.changeTasks = [this.consume(this.remote.eleckoiCompatibility), this.consume(this.remote.eleckoiAuthorPlugins)];
    for (const task of this.changeTasks) task.catch(error => { if (!this.abort.signal.aborted) this.fail(error); });
    await this.contextChanged();
    return this;
  }
  createContainers() {
    this.ownedContainers = [];
    for (const id of ['scripts', 'panels']) {
      if (this.window.document.getElementById(id)) continue;
      const container = this.window.document.createElement('div'); container.id = id;
      container.style.cssText = id === 'scripts' ? 'display:none' : 'position:fixed;inset:0;pointer-events:none;z-index:1000';
      this.window.document.body.appendChild(container); this.ownedContainers.push(container);
    }
  }
  capturePresentation(conversationId) {
    const snapshot = this.conversations.getDetailsSnapshot();
    const stream = this.conversations.getStreamSnapshot?.();
    const generation = stream?.id === snapshot.id && stream.status === 'running' ? { runId: stream.runId,
      messageId: stream.messageId, content: stream.content, sequence: stream.sequence } : undefined;
    if (snapshot.status === 'ready' && snapshot.id && snapshot.details && Array.isArray(snapshot.details.messages)) {
      this.presentations.set(snapshot.id, { conversationId: snapshot.id, messages: snapshot.details.messages.filter(message => message.kind !== 'turn-error'),
        isGenerating: snapshot.details.messages.some(message => message.status === 'streaming'), ...(generation ? { generation } : {}) });
    }
    if (conversationId && this.presentations.has(conversationId)) return this.presentations.get(conversationId);
    if (snapshot.status !== 'ready' || !snapshot.id || !snapshot.details || !Array.isArray(snapshot.details.messages)) {
      throw Object.assign(new Error(snapshot.error || '聊天的正式 DSH 投影尚未就绪'), { code: 'CHAT_NOT_READY' });
    }
    if (conversationId && conversationId !== snapshot.id) {
      throw Object.assign(new Error(`请求的会话没有已绑定的正式投影：${conversationId}`), { code: 'PRESENTATION_NOT_READY' });
    }
    return { conversationId: snapshot.id, messages: snapshot.details.messages.filter(message => message.kind !== 'turn-error'),
      isGenerating: snapshot.details.messages.some(message => message.status === 'streaming'), ...(generation ? { generation } : {}) };
  }
  async resolvePresentation(conversationId, { signal = this.abort.signal } = {}) {
    if (signal.aborted) throw signal.reason;
    if (this.abort.signal.aborted) throw this.abort.signal.reason;
    const snapshot = this.conversations.getDetailsSnapshot();
    let id = conversationId || snapshot.id;
    if (conversationId && snapshot.id !== conversationId) {
      const presentation = await readBackgroundPresentation(this.remote, this.sdk.unwrapRemote, conversationId, { signal });
      this.presentations.set(conversationId, presentation);
      return presentation;
    }
    if (snapshot.status === 'error' && snapshot.id === id) {
      throw Object.assign(new Error(snapshot.error || '聊天的正式 DSH 投影加载失败'), { code: 'PRESENTATION_FAILED' });
    }
    if (snapshot.status === 'ready' && id) return this.capturePresentation(id);
    // Startup and native navigation can expose idle before a Session is selected.
    // Bind the first real id, then wait for its official projection, never an empty
    // bootstrap or a later chat's data. Native edits also invalidate this projection.
    await new Promise((resolve, reject) => {
      let stop = () => {};
      let finished = false;
      const signals = [...new Set([signal, this.abort.signal])];
      const finish = error => {
        if (finished) return; finished = true; stop();
        signals.forEach(value => value.removeEventListener('abort', aborted));
        error ? reject(error) : resolve();
      };
      const aborted = () => finish(signals.find(value => value.aborted)?.reason || new Error('Shared Client disposed'));
      const changed = () => {
        const next = this.conversations.getDetailsSnapshot();
        if (!id && next.id) id = next.id;
        if ((!id || next.id === id) && next.status === 'error') {
          finish(Object.assign(new Error(next.error || '聊天的正式 DSH 投影加载失败'), { code: 'PRESENTATION_FAILED' }));
        } else if (id && (next.id !== id || next.status === 'ready')) {
          // A switched chat can use only its already captured presentation; never
          // redirect a request that began in one chat to the newly visible chat.
          try { this.capturePresentation(id); finish(); } catch (error) { finish(error); }
        }
      };
      stop = this.conversations.subscribeDetails(changed);
      signals.forEach(value => value.addEventListener('abort', aborted, { once: true }));
      if (signals.some(value => value.aborted)) aborted(); else changed();
    });
    return this.capturePresentation(id);
  }
  schedule(action) {
    const next = this.eventQueue.then(() => { if (!this.closed) return action(); });
    this.eventQueue = next.catch(error => this.fail(error));
    return next;
  }
  async contextChanged() {
    if (this.closed) return;
    const snapshot = this.conversations.getDetailsSnapshot();
    if (snapshot.status === 'error') throw new Error(snapshot.error || '当前会话投影加载失败');
    if (snapshot.status === 'loading') {
      this.publish({ status: 'waiting-for-chat', error: '' });
      return;
    }
    if (snapshot.id) this.capturePresentation(snapshot.id);
    const conversationId = snapshot.id || null;
    const current = () => !this.closed && this.conversations.getDetailsSnapshot().status === snapshot.status
      && (this.conversations.getDetailsSnapshot().id || null) === conversationId;
    if (!this.initialized) {
      this.initialized = this.sdk.installTavernShared(this.window, { adapter: this.adapter, pluginId: 'frontend',
        runtimeUrl: this.assetsBaseUrl + 'assets/tavern-runtime.global.js', libraryBaseUrl: this.assetsBaseUrl + 'assets/assets/', signal: this.abort.signal })
        .then(value => { if (!this.closed) this.installPresentationApi(this.window); return value; });
      await this.initialized;
    } else {
      await this.initialized;
      if (!current()) return;
      await this.adapter.publish(this.lastConversationId !== conversationId ? 'chat.changed' : conversationId ? 'messages.changed' : 'settings.changed', { conversationId });
    }
    if (!current()) return;
    if (this.adapter.has?.('callbacks.attach') || this.adapter.methods().includes('callbacks.attach')) {
      await this.adapter.request('callbacks.attach', { clientId: this.clientId, conversationId });
    }
    if (!current()) return;
    this.lastConversationId = conversationId;
    await this.synchronize(conversationId);
    if (current()) this.publish({ status: conversationId ? 'ready' : 'ready-global', error: '' });
  }
  async refreshState() {
    if (!this.initialized) return;
    await this.initialized;
    const snapshot = this.conversations.getDetailsSnapshot();
    if (this.closed || ['loading', 'error'].includes(snapshot.status)) return;
    await this.adapter.publish('settings.changed', { conversationId: snapshot.id || null });
  }
  synchronize(conversationId = this.conversations.getDetailsSnapshot().id) {
    if (this.closed) return Promise.resolve();
    const next = this.syncQueue.then(() => {
      if (!this.closed) return this.adapter.request('scripts.synchronize', { pluginId: '__shared_host', conversationId: conversationId || null });
    });
    this.syncQueue = next.catch(error => this.fail(error));
    return next;
  }
  async mountScripts(manifests) {
    if (!manifests || typeof manifests !== 'object' || Array.isArray(manifests)) throw new TypeError('Script synchronization returned invalid manifests');
    await this.window.ElecKoi?.flush();
    if (this.closed) return;
    for (const [id] of this.frames) if (!Object.hasOwn(manifests, id)) this.stopScript(id);
    for (const [id, manifest] of Object.entries(manifests)) {
      const existing = this.frames.get(id);
      if (existing?.fingerprint === manifest.fingerprint) { existing.manifest = manifest; continue; }
      this.stopScript(id);
      this.realm.mount('script:' + id, id, manifest.runtimeUrl, false, manifest.name || id);
      this.frames.set(id, { fingerprint: manifest.fingerprint, manifest });
    }
    await this.refreshUiEntries();
  }
  async refreshUiEntries() {
    if (this.closed) return;
    const entries = await Promise.all([...this.frames.keys()].map(async pluginId => {
      const descriptors = await this.adapter.request('ui.list', { pluginId });
      if (!Array.isArray(descriptors)) throw new TypeError(`Plugin UI list is not an array: ${pluginId}`);
      return descriptors.map(descriptor => ({ ...descriptor, pluginId }));
    }));
    if (!this.closed) this.publish({ uiEntries: entries.flat() });
  }
  stopScript(id) {
    this.realm.unmount('script:' + id); this.frames.delete(id);
    for (const [frameId, frame] of this.realm.frames) if (frame.owner === id) this.realm.unmount(frameId);
  }
  prepareFrame(window) {
    if (this.closed || !this.realm) throw new Error('The persistent shared realm is not available');
    const frameId = window.frameElement?.dataset.eleckoiFrameId || window.name;
    this.realm.connect(frameId, window);
    window.__ElecKoiTokenizers = this.realm.tokenizerRuntime || this.window.__ElecKoiTokenizers;
    this.sdk.installElecKoiAuthorApi(window); this.sdk.installTavernContract(window); this.sdk.installTavernCompatibility(window);
    this.installPresentationApi(window);
    return window.ElecKoi.ready();
  }
  /** Source documents use the same shared realm, not a per-message Author router. */
  prepareDocument(window, { pluginId = 'frontend', frameId, messageId, conversationId } = {}) {
    if (this.closed || !this.realm) throw new Error('The persistent shared realm is not available');
    const id = this.realm.adopt(window, pluginId);
    // adopt/connect installs the actual realm map key. The frontend's channel
    // identifies postMessage traffic, not SDK ownership or authorContext lookup.
    window.__ElecKoiFrameId = id;
    if (messageId !== undefined) {
      window.__ElecKoiCurrentMessageId = messageId;
      const frame = this.realm.frames.get(id);
      if (frame) frame.authorContext = { conversationId: conversationId || this.capturePresentation().conversationId, messageId };
    }
    window.__ElecKoiCompatibilityDocumentId = id;
    window.__ElecKoiTokenizers = this.realm.tokenizerRuntime || this.window.__ElecKoiTokenizers;
    this.sdk.installElecKoiAuthorApi(window); this.sdk.installTavernContract(window); this.sdk.installTavernCompatibility(window);
    this.installPresentationApi(window);
    return window.ElecKoi.ready();
  }
  installPresentationApi(window) {
    if (!window.ElecKoi) return;
    this.applicationBridge.registerDocument(window);
    const registerMessageSurface = window.ElecKoi.ui?.registerMessageSurface;
    const call = (method, params) => window.ElecKoi.call(method, params);
    const resolveAsset = this.window.__ElecKoiResolveAsset || (reference => {
      if (typeof reference !== 'string') return '';
      if (/^https?:$/.test(this.window.location?.protocol || '')) {
        if (reference.startsWith('eleckoi-media://')) return '/eleckoi/media/asset?reference=' + encodeURIComponent(reference);
        if (reference.startsWith('file://') || /^\/data\/(?:data|user)\//.test(reference)) return '/eleckoi/media/migrated?reference=' + encodeURIComponent(reference);
      }
      return reference;
    });
    window.__ElecKoiResolveAsset = resolveAsset;
    window.ElecKoi = Object.freeze({ ...window.ElecKoi,
      application: this.application, navigation: this.navigation, platform: this.platform,
      assets: Object.freeze({ ...window.ElecKoi.assets, resolve: resolveAsset }),
      ui: Object.freeze({ ...window.ElecKoi.ui, openSettings: () => call('ui.openSettings'), openModels: () => call('ui.openModels'),
        openBackground: () => call('ui.openBackground'), openHistory: () => call('ui.openHistory'),
        createChat: options => call('ui.createChat', options), editMessage: id => call('ui.editMessage', { id }), showProcess: id => call('ui.showProcess', { id }),
        renderMessageContent: (container, options) => {
          if (!this.renderMessageContent) throw new Error('Rich message renderer is not connected');
          const renderer = this.renderMessageContent(window, container, options);
          const dispose = this.applicationBridge.trackDocument(window, renderer.dispose);
          return Object.freeze({ update: renderer.update, dispose });
        },
        registerMessageSurface: surface => {
          if (!registerMessageSurface) throw new Error('Message surface service is not connected');
          return this.applicationBridge.trackDocument(window, registerMessageSurface(surface));
        },
        registerChatController: (conversationId, handlers) => this.applicationBridge.trackDocument(window, this.registerChatUi(conversationId, handlers)) }),
      presentation: Object.freeze({ current: () => call('presentation.current') }) });
  }
  registerChatUi(conversationId, handlers) {
    const binding = { handlers }; this.chatUi.set(conversationId, binding);
    return () => { if (this.chatUi.get(conversationId) === binding) this.chatUi.delete(conversationId); };
  }
  async requestChatUi(method, params = {}) {
    const id = params.conversationId || this.conversations.getDetailsSnapshot().id;
    const handler = this.chatUi.get(id)?.handlers[method];
    if (!handler) throw Object.assign(new Error(`当前对话界面尚未提供 ${method}：${id}`), { code: 'CHAT_UI_NOT_READY' });
    return await handler(params);
  }
  installDocument(window, { pluginId = 'frontend', frameId } = {}) {
    if (!this.realm) throw new Error('Shared Client has not initialized');
    return this.sdk.installTavernShared(window, { adapter: this.adapter, shared: this.realm, pluginId, frameId,
      runtimeUrl: this.assetsBaseUrl + 'assets/tavern-runtime.global.js', libraryBaseUrl: this.assetsBaseUrl + 'assets/assets/' })
      .then(value => { this.installPresentationApi(window); return window.ElecKoi; });
  }
  setEnvironment(patch) { this.applicationBridge.setEnvironment(patch); }
  registerFrontendTargets(targets) { this.applicationBridge.registerFrontendTargets(targets); }
  connectNavigation(services) { this.applicationBridge.connectNavigation(services); }
  registerConversationNavigation(open) {
    if (typeof open !== 'function') throw new TypeError('Conversation navigation requires the product open service');
    this.conversationNavigation = open;
    return () => { if (this.conversationNavigation === open) this.conversationNavigation = null; };
  }
  async openApplicationConversation(id) {
    const open = this.conversationNavigation;
    if (open) return await open(id);
    // Custom application roots may supply the same controller contract while
    // the native conversation hook is absent.
    const current = this.conversations.getDetailsSnapshot().id;
    const handler = this.chatUi.get(current)?.handlers['chats.open'];
    if (handler) {
      await handler({ id, conversationId: current });
      const snapshot = this.conversations.getDetailsSnapshot();
      return snapshot.id === id ? snapshot.details : null;
    }
    return await this.conversations.open(id);
  }
  async requestApplicationUi(method, params = {}) {
    if (method === 'chats.open') { await this.navigation.open({ conversationId: params.id || params.sessionId || params.conversationId }); return { accepted: true }; }
    if (method === 'ui.createChat') return await this.createApplicationChat(params);
    if (method === 'ui.openSettings' || method === 'ui.openModels') {
      const id = params.conversationId || this.conversations.getDetailsSnapshot().id;
      if (!this.chatUi.get(id)?.handlers[method]) return await this.navigation.open(method === 'ui.openSettings' ? 'settings' : 'model');
    }
    return await this.requestChatUi(method, params);
  }
  async createApplicationChat(options = {}) {
    const characterId = options.characterId || options.metadata?.characterId || this.application.getSnapshot('characters').collection.active_character_id;
    if (!characterId) throw Object.assign(new Error('请先选择角色，再创建聊天。'), { code: 'APPLICATION_OWNER_REQUIRED' });
    const input = { ...options }; delete input.characterId;
    const details = await this.application.actions.conversations.create({ ...input, metadata: { ...options.metadata, characterId } });
    const id = details.conversation.id;
    await this.navigation.open({ conversationId: id });
    return { accepted: true, conversationId: id };
  }
  mountChat(id, url) { return this.realm.mount(id, 'frontend', url, 'chat'); }
  async openPanel(owner, id) {
    const panels = await this.adapter.request('ui.list', { pluginId: owner });
    const descriptor = panels.find(value => value.id === id);
    if (!descriptor) throw new Error(`Plugin UI does not exist: ${owner}/${id}`);
    if (descriptor.kind === 'script-button') {
      await this.adapter.publish('plugin.event', { pluginId: owner, event: descriptor.event || `plugin:${owner}:button:${id}`, payload: {} }); return;
    }
    if (typeof descriptor.html !== 'string') throw new Error(`Plugin UI is not an HTML panel: ${owner}/${id}`);
    this.realm.mount('panel:' + owner + ':' + id, owner,
      this.assetsBaseUrl + 'panel/' + encodeURIComponent(owner) + '/' + encodeURIComponent(id) + '/index.html', true);
  }
  async consume(remote) {
    const signal = this.abort.signal;
    const stream = remote.changes.$stream ? await remote.changes.$stream(signal) : remote.changes(signal);
    for await (const change of stream) {
      if (signal.aborted) break;
      // A callback can itself issue RPCs and publish changes. Never await it on eventQueue.
      if (change.event === 'callback.request' && change.payload.clientId === this.clientId) {
        this.runCallback(change.payload); continue;
      }
      if (change.event === 'callback.cancel' && change.payload.clientId === this.clientId) {
        this.callbackTasks.get(change.payload.id)?.abort.abort(new Error('Host callback cancelled')); continue;
      }
      await this.schedule(async () => {
        if (change.event === 'ui.open') await this.openPanel(change.payload.pluginId, change.payload.id);
        else if (change.event === 'ui.close') {
          for (const [id, frame] of this.realm.frames) if (id.startsWith('panel:') && (!change.payload.pluginId || frame.owner === change.payload.pluginId)
            && (!change.payload.id || id === 'panel:' + frame.owner + ':' + change.payload.id)) this.realm.unmount(id);
        } else if (['plugins.changed', 'scripts.changed', 'plugins.snapshot'].includes(change.event)) {
          if (this.initialized) await this.synchronize();
        } else if (['ui.registered', 'ui.unregistered'].includes(change.event)) await this.refreshUiEntries();
        // Apply Host-side UI/synchronization work in arrival order, then start its
        // listeners. An async plugin listener may await a later Host packet, so
        // its completion must not block the changes stream from delivering it.
        if (!this.closed) this.adapter.publish(change.event, change.payload).catch(error => this.fail(error));
      });
    }
    if (!signal.aborted && !this.closed) throw new Error('Shared Host changes stream ended unexpectedly');
  }
  runCallback(request) {
    if (this.callbackTasks.has(request.id)) throw new Error(`Duplicate Web callback: ${request.id}`);
    const abort = new AbortController();
    const promise = this.invokeCallback(request, abort.signal).catch(error => this.fail(error))
      .finally(() => this.callbackTasks.delete(request.id));
    this.callbackTasks.set(request.id, { abort, promise });
  }
  async invokeCallback(request, signal) {
    const respond = params => this.remote.eleckoiAuthorPlugins.invoke({ method: 'callbacks.respond',
      params: { id: request.id, clientId: this.clientId, ...params } }).then(this.sdk.unwrapRemote);
    try {
      await this.initialized;
      if (signal.aborted) throw signal.reason;
      if (request.method === '__ElecKoiAuthorUi') {
        const value = await this.requestApplicationUi(request.payload.method, request.payload.params);
        if (!signal.aborted) await respond({ value });
      } else if (request.method === 'media.audio' || request.method === 'platform.tts') {
        const value = request.method === 'media.audio' ? await this.audioRuntime.invoke(request.payload)
          : await invokePlatformSpeech(this.window, request.payload, signal, (method, params) => this.remote.eleckoiAuthorPlugins.invoke({ method, params }).then(this.sdk.unwrapRemote));
        if (!signal.aborted || request.drainOnAbort) await respond({ value });
      } else if (request.method.startsWith('tokens.')) {
        const tokenizer = this.realm.tokenizerRuntime || this.window.__ElecKoiTokenizers;
        if (!tokenizer) throw new Error('Real tokenizer runtime is not initialized');
        await tokenizer.initialize();
        const p = request.payload, encoding = p.encoding || (p.modelSnapshot
          ? tokenizer.encodingForModel(p.model || '')
          : this.window.ElecKoi.tokens?.info().encoding || tokenizer.encodingForModel(p.model || ''));
        const operation = request.method.slice(7);
        const value = operation === 'model' ? encoding : operation === 'info' ? { model: p.model || '', encoding,
          implementation: /^([or]\d+k_base|cl100k_base|p50k_(base|edit)|gpt2)$/.test(encoding) ? 'tiktoken-1.0.21' : 'web-tokenizers-0.1.6-pre3' } : operation === 'encode' ? tokenizer.encode(p.text || '', encoding)
          : operation === 'count' ? tokenizer.count(p.text || '', encoding) : operation === 'decode' ? tokenizer.decode(p.ids, encoding) : undefined;
        if (value === undefined) throw new Error(`Unknown tokenizer callback: ${request.method}`);
        if (!signal.aborted) await respond({ value });
      } else {
        // Each realm owns its listeners and prompt filters, so run lifecycle hooks in
        // every connected realm while all pure batch hooks use the parent registry.
        const targets = request.method === '__ElecKoiBeforeGeneration' || request.method === '__ElecKoiFlush'
          ? [...new Set([this.window, ...[...this.realm.frames.values()].map(frame => frame.window).filter(Boolean)])] : [this.window];
        let value = null;
        for (const [index, target] of targets.entries()) {
          if (signal.aborted) throw signal.reason;
          const callback = target[request.method];
          if (typeof callback !== 'function') throw new Error(`Shared Web callback is not installed: ${request.method}`);
          const token = request.id + ':' + index, local = {}; this.legacyCallbackResults.set(token, local);
          try {
            await callback({ ...request.payload, token,
              ...(request.method === '__ElecKoiBeforeGeneration' ? { consumeOnce: false } : {}),
              ...(request.method === '__ElecKoiInvokeTool' ? { signal } : {}) });
            if (!local.reply) throw new Error(`Shared Web callback returned without a result: ${request.method}`);
            if (local.reply.error) throw new Error(local.reply.error);
            value = local.reply.result ?? null;
          } finally { this.legacyCallbackResults.delete(token); }
        }
        if (request.method === '__ElecKoiBeforeGeneration' && !request.payload.dryRun && !signal.aborted) {
          // Script and panel realms of one owner share this Map. Consuming once
          // entries earlier lets a later realm overwrite the Host snapshot with
          // an empty list. Keep the persisted snapshot for this generation and
          // consume only local entries after every realm has prepared it.
          for (const injections of this.realm.promptInjections?.values() || []) {
            for (const [id, injection] of injections) if (injection.once) injections.delete(id);
          }
        }
        if (!signal.aborted || request.drainOnAbort) await respond({ value });
      }
    } catch (error) {
      if (!signal.aborted || request.drainOnAbort) await respond({ error: { message: error.message || String(error),
        ...(error.code ? { code: error.code } : {}), ...(error.stack ? { stack: error.stack } : {}) } });
    }
  }
  async restore() { await this.contextChanged(); }
  async dispose({ pagehide = false } = {}) {
    if (this.closed) return;
    this.closed = true;
    this.abort.abort(Object.assign(new Error('Shared Client has closed'), { code: 'HOST_CLOSED' }));
    this.adapter?.dispose(); this.stops.splice(0).forEach(stop => stop());
    this.applicationBridge.dispose();
    for (const task of this.callbackTasks.values()) task.abort.abort(new Error('Shared Client disposed'));
    let failure;
    try {
      if (!pagehide && this.adapter?.methods().includes('callbacks.detach')) await this.remote.eleckoiAuthorPlugins.invoke({ method: 'callbacks.detach', params: { clientId: this.clientId } }).then(this.sdk.unwrapRemote);
    } catch (error) { failure = error; }
    try { await this.realm?.dispose(); } catch (error) { failure = error; }
    this.audioRuntime.dispose(); this.adapter?.dispose(); this.ownedContainers?.forEach(container => container.remove()); this.frames.clear(); this.chatUi.clear(); this.conversationNavigation = null; this.listeners.clear();
    if (this.window.__ElecKoiClientCompatibility === this) delete this.window.__ElecKoiClientCompatibility;
    if (failure) throw failure;
  }
}
