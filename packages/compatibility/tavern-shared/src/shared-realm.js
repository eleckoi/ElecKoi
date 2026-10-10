/** Application-owned state and callable references shared by same-origin pages. */
export function createSharedRealm(global, adapter) {
  if (global.__ElecKoiShared) {
    if (global.__ElecKoiShared.adapter !== adapter) throw new Error('A different compatibility adapter already owns this Web realm');
    return global.__ElecKoiShared;
  }
  const frames = new Map();
  let sequence = 0;
  const report = error => {
    global.console.error('[ElecKoi shared Host]', error);
    global.dispatchEvent(new global.CustomEvent('eleckoi:plugin-error', { detail: { error } }));
  };
  const request = async (method, params = {}, options) => {
    const result = await adapter.request(method, params, options);
    if (['scripts.replace', 'presets.select', 'tavernPresets.load', 'extensions.install', 'extensions.update',
      'extensions.remove', 'plugins.install', 'plugins.setEnabled', 'plugins.remove'].includes(method) && adapter.has('scripts.synchronize')) {
      // Source replacement waits for the durable queue before disposing its caller.
      Promise.resolve().then(() => shared.writes.queue)
        .then(() => adapter.request('scripts.synchronize', { pluginId: '__shared_host' })).catch(report);
    }
    return result;
  };
  const shared = {
    adapter, frames,
    listeners: new Map(), globals: new Map(), waiters: new Map(), nativeGroups: new Map(),
    variableBuckets: new Map(), variableCommits: new WeakMap(), writes: { queue: Promise.resolve(), errors: [] },
    request,
    onNative: (name, listener) => adapter.on(name, listener),
    async tokenize(payload) {
      const runtime = global.__ElecKoiTokenizers;
      if (!runtime) throw new Error('A real tokenizer runtime must be loaded before tokenize');
      await runtime.initialize();
      if (payload.operation === 'resolveEncoding') return runtime.encodingForSelection(payload.selection);
      if (payload.operation === 'decode') return runtime.decode(payload.tokens, payload.encoding);
      if (payload.operation === 'encode') return runtime.encode(payload.text, payload.encoding);
      throw new Error(`Unknown tokenizer operation: ${payload.operation}`);
    },
    connect(id, window) {
      const frame = frames.get(id);
      if (!frame) throw new Error(`Unknown shared frame: ${id}`);
      frame.window = window;
      window.__ElecKoiPluginId = frame.owner;
      window.__ElecKoiFrameId = id;
      window.__ElecKoiShared = shared;
      window.__ElecKoiHostAdapter = Object.freeze({
        has: method => adapter.has(method),
        methods: () => adapter.methods(),
        tokenizeSync: payload => adapter.tokenizeSync(payload),
        request(method, params = {}, options) {
          if (frames.get(id)?.window !== window) return Promise.reject(Object.assign(new Error(`Shared frame has closed: ${id}`), { code: 'FRAME_CLOSED' }));
          // Original Author calls have no explicit chat argument. Capture the real
          // page context before starting the asynchronous operation. Message pages
          // retain their owner; persistent script pages use the current native chat.
          const context = frame.authorContext || shared.captureAuthorContext?.() || {};
          const scoped = { ...(context.conversationId ? { conversationId: context.conversationId } : {}), ...params, pluginId: frame.owner };
          if (method === 'plugins.bootstrap' && shared.deletedConversations?.has(context.conversationId || scoped.conversationId)) {
            const conversationId = context.conversationId || scoped.conversationId;
            return Promise.reject(Object.assign(new Error(`Conversation context was deleted: ${conversationId}`), {
              code: 'CONTEXT_UNAVAILABLE', conversationId, owner: id, deletedConversation: true,
            }));
          }
          if (context.messageId !== undefined) {
            if (method === 'messages.current' && scoped.id === undefined) scoped.id = context.messageId;
            else if (['context.current', 'variables.getState', 'media.getMessageAttachments'].includes(method) && scoped.messageId === undefined) scoped.messageId = context.messageId;
          }
          return request(method, scoped, options);
        },
        on: (name, listener) => adapter.on(name, listener),
      });
      return window.__ElecKoiHostAdapter;
    },
    adopt(window, owner = 'frontend') {
      const id = `document:${++sequence}`;
      frames.set(id, { owner, window, parentId: window.parent?.__ElecKoiFrameId });
      shared.connect(id, window);
      window.addEventListener('pagehide', () => shared.release(id), { once: true });
      return id;
    },
    mount(id, owner, url, visible = false, displayName = owner) {
      shared.unmount(id);
      const element = global.document.createElement('iframe');
      element.name = id; element.dataset.eleckoiFrameId = id;
      if (id.startsWith('script:')) element.id = `TH-script--${displayName}--${owner}`;
      element.style.cssText = visible ? 'position:absolute;inset:0;width:100%;height:100%;border:0;background:transparent;pointer-events:auto' : 'display:none';
      let container = element;
      if (visible && visible !== 'chat') {
        container = global.document.createElement('section');
        container.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;pointer-events:auto;background:Canvas;color:CanvasText;color-scheme:light dark';
        const close = global.document.createElement('button'); close.type = 'button'; close.textContent = '关闭';
        close.style.cssText = 'align-self:flex-end;flex:none;margin:4px 12px;padding:8px 14px;border:0;border-radius:8px;background:transparent;color:inherit';
        close.addEventListener('click', () => request('ui.close', { pluginId: owner }).catch(report));
        container.appendChild(close);
        element.style.cssText = 'width:100%;height:0;min-height:0;flex:1;border:0;pointer-events:auto';
        container.appendChild(element);
      }
      frames.set(id, { owner, element, container, window: null });
      if (visible === 'chat' && adapter.has('plugins.runtimeReady')) element.addEventListener('load', () => {
        if (frames.has(id)) request('plugins.runtimeReady', { pluginId: '__shared_host', frameId: id }).catch(report);
      });
      const target = global.document.getElementById(visible === 'chat' ? 'chat' : visible ? 'panels' : 'scripts');
      if (!target) throw new Error(`Shared runtime mount container is missing for ${id}`);
      element.src = url; target.appendChild(container);
      return element;
    },
    unmount(id) {
      const frame = frames.get(id);
      if (!frame) return;
      shared.release(id); frame.container?.remove();
    },
    release(id) {
      const frame = frames.get(id);
      if (!frame) return;
      frames.delete(id);
      for (const [childId, child] of [...frames]) if (child.parentId === id) shared.release(childId);
      frame.window?.dispatchEvent(new frame.window.Event('pagehide'));
    },
    run(id, method, payload) {
      const target = frames.get(id)?.window;
      if (!target || typeof target[method] !== 'function') throw new Error(`Shared frame is not ready: ${id}.${method}`);
      return target[method](payload);
    },
    evaluate(id, source) {
      const target = frames.get(id)?.window;
      if (!target) throw new Error(`Shared frame is not ready: ${id}`);
      return target.eval(source);
    },
    async dispose() {
      let failure;
      try { await shared.writes.queue; } catch (error) { failure = error; }
      if (shared.writes.errors.length) failure = new AggregateError(shared.writes.errors.splice(0), 'Plugin persistence failed');
      for (const id of [...frames.keys()]) shared.unmount(id);
      if (failure) throw failure;
    },
  };
  global.__ElecKoiHostAdapter = adapter;
  global.__ElecKoiShared = shared;
  return shared;
}
