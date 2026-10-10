export function installTavernCompatibility(global) {
  'use strict';
  if (global.ElecKoi?.compatibility?.version === '0.1.0') return;
  const base = global.ElecKoi;
  const st = global.__ElecKoiSt;
  if (!base) throw new Error('ElecKoi SDK must load before tavern-compat.js');
  const contract = global.__ElecKoiTavernContract;
  if (!contract) throw new Error('tavern-contract.js must load before tavern-compat.js');
  const pluginId = global.__ElecKoiPluginId || 'frontend';
  const ownerKey = global.__ElecKoiFrameId || pluginId;
  const shared = global.__ElecKoiShared || (global.__ElecKoiShared = {
    listeners: new Map(), globals: new Map(), waiters: new Map(), nativeGroups: new Map(),
    variableBuckets: new Map(), variableCommits: new WeakMap(), writes: { queue: Promise.resolve(), errors: [] },
  });
  const pendingGenerationContexts = new Set();
  const generationPreparationMethods = new Set(['generation.invoke', 'generation.preview', 'generation.start',
    'chat.send', 'chat.generateFromHistory', 'messages.regenerate', 'messages.editAndRegenerate']);
  const trackGenerationCall = (method, params, invoke) => {
    if (!generationPreparationMethods.has(method) || !callbackConversationId) return invoke();
    const captured = { method, id: params.id, parentConversationId: callbackConversationId,
      conversationId: params.conversationId || callbackConversationId };
    pendingGenerationContexts.add(captured);
    try {
      return Promise.resolve(invoke()).then(value => {
        // Background admission returns before its preparation hook. That hook
        // releases this causal reservation after restoring its parent context.
        if (method !== 'generation.start') pendingGenerationContexts.delete(captured);
        return value;
      }, error => { pendingGenerationContexts.delete(captured); throw error; });
    } catch (error) { pendingGenerationContexts.delete(captured); throw error; }
  };
  const call = (method, params = {}) => trackGenerationCall(method, params,
    () => shared.request ? shared.request(method, { pluginId, ...params }) : base.call(method, { pluginId, ...params }));
  const publicCall = (method, params = {}) => {
    // Keep the original Author transport: it captures omitted frame context,
    // tracks pending presentation work and cancels operations on page teardown.
    const scoped = { ...(callbackConversationId !== undefined ? { conversationId: callbackConversationId } : {}), ...params };
    return trackGenerationCall(method, scoped, () => base.call(method, scoped));
  };
  const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  const listeners = shared.listeners;
  shared.lifecycleEvents ||= new Map();
  const cleanups = new Set();
  shared.promptInjections ||= new Map();
  if (!shared.promptInjections.has(pluginId)) shared.promptInjections.set(pluginId, new Map());
  const injections = shared.promptInjections.get(pluginId);
  const macros = new Map();
  const macroLikes = new Map();
  const commands = new Map();
  const variableCommits = shared.variableCommits;
  shared.variableVersions ||= new Map();
  shared.variableSchemas ||= new Map();
  shared.chatStates ||= new Map();
  shared.chatSaves ||= new Map();
  shared.characterState ||= [];
  shared.personaState ||= [];
  shared.presetState ||= { list: [], draft: null, id: null, name: '', revision: 0, committed: null };
  shared.displaySurfaces ||= new Map();
  shared.displayNotifications ||= new Map();
  shared.displayRevisions ||= new WeakMap();
  shared.messageDisplayHolds ||= new Map();
  shared.messageTimelineHolds ||= new Map();
  shared.scriptTrees ||= new Map();
  shared.audioState ||= { settings: { channels: {} }, states: {} };
  const activeGenerations = new Set();
  const helperGenerations = shared.helperGenerations ||= new Map();
  let state = null;
  let refreshHydration = Promise.resolve();
  const writes = shared.writes;
  const writeErrors = writes.errors;
  const extensionSettings = shared.extensionSettings ||= {};
  shared.lastExtensionSettings ||= {};
  let hookQueue = Promise.resolve();
  let callbackQueue = Promise.resolve();
  let callbackConversationId;
  let disposed = false;
  const lifetime = new AbortController();
  shared.deletedConversations ||= new Set();
  function unavailableContext(conversationId) {
    if (!conversationId || !shared.deletedConversations.has(conversationId)) return;
    return Object.assign(new Error(`Conversation context was deleted: ${conversationId}`), {
      code: 'CONTEXT_UNAVAILABLE', conversationId, owner: ownerKey, deletedConversation: true,
    });
  }
  const isDeletedContext = error => error?.code === 'CONTEXT_UNAVAILABLE' && error.deletedConversation === true;

  // A callback runs in its registering realm, with the caller's chat fixed across awaits.
  // Native refreshes may arrive while it runs; refresh() keeps that same chat until completion.
  function inConversation(conversationId, callback, causalParent) {
    if (callbackConversationId === conversationId) return Promise.resolve().then(callback);
    if (causalParent && callbackConversationId === causalParent) {
      // This owner's outer callback awaits the generation whose preparation is
      // calling it back. Queueing behind that callback would form a wait cycle.
      return (async () => {
        callbackConversationId = conversationId;
        try { await refresh(conversationId, false); return await callback(); }
        finally { callbackConversationId = causalParent; if (!disposed) await refresh(causalParent, false); }
      })();
    }
    const run = async () => {
      if (disposed) throw new Error(`Plugin callback owner has closed: ${ownerKey}`);
      await readyPromise;
      callbackConversationId = conversationId;
      try { await refresh(conversationId, false); return await callback(); }
      finally { callbackConversationId = undefined; if (!disposed) await refresh(undefined, false); }
    };
    const result = callbackQueue.then(run, run);
    callbackQueue = result.then(() => {}, () => {});
    return result;
  }

  function report(error) {
    // Page teardown is an explicit terminal state, not a plugin startup failure.
    // The original ready/call Promise still rejects for its caller.
    if (disposed && ['FRAME_CLOSED', 'HOST_CLOSED'].includes(error.code)) return;
    console.error('[ElecKoi plugin]', error);
    global.dispatchEvent(new CustomEvent('eleckoi:plugin-error', { detail: { pluginId, error } }));
  }
  function requireState() {
    if (!state) throw new Error('Context is not ready; await ElecKoi.ready() before using synchronous Tavern APIs');
    const unavailable = unavailableContext(callbackConversationId !== undefined ? callbackConversationId
      : shared.frames?.get(ownerKey)?.authorContext?.conversationId || state.conversationId);
    if (unavailable) throw unavailable;
    if (!state.conversationId) return new Proxy(state, { get(target, property) {
      if (['messages', 'metadata'].includes(property)) throw Object.assign(new Error('当前页面尚未选定聊天会话'), { code: 'CHAT_NOT_READY' });
      return target[property];
    } });
    return state;
  }
  function captured() {
    const s = requireState();
    return { conversationId: s.conversationId, characterId: s.characterId, presetId: shared.presetState.id || s.presetId };
  }
  function enqueue(task, rollback) {
    const result = writes.queue.then(task, task);
    writes.queue = result;
    result.catch(error => {
      if (rollback) rollback();
      writeErrors.push(error);
      report(error);
    });
    return result;
  }
  async function flush() {
    // Proxied compound edits enqueue a save after the current JS call has settled.
    await Promise.resolve();
    let pending;
    do {
      pending = writes.queue;
      try { await pending; } catch (error) { if (!writeErrors.includes(error)) writeErrors.push(error); }
    } while (pending !== writes.queue);
    if (writeErrors.length) throw new AggregateError(writeErrors.splice(0), 'Plugin persistence failed');
  }

  const helperMessageIdEvents = new Set(['message_swiped', 'message_sent', 'message_received', 'message_edited',
    'message_updated', 'user_message_rendered', 'character_message_rendered']);
  function eventOn(event, fn, position = 'last', once = false, normalizeMessageId = true) {
    if (typeof fn !== 'function') throw new TypeError('Event listener must be a function');
    const entries = listeners.get(event) || [];
    const existing = entries.find(entry => entry.fn === fn && entry.owner === ownerKey && entry.normalizeMessageId === normalizeMessageId);
    if (existing) return existing.handle;
    const invoke = (...args) => {
      if (normalizeMessageId && helperMessageIdEvents.has(event)) {
        args[0] = parseInt(args[0]);
        if (Number.isNaN(args[0])) return;
      }
      return fn(...args);
    };
    const entry = { fn, invoke, once, normalizeMessageId, owner: ownerKey, plugin: pluginId,
      invokeInConversation: (id,args) => inConversation(id,()=>invoke(...args)),
      invokeInOwnerContext: args => {
        const id = callbackConversationId !== undefined ? callbackConversationId
          : shared.frames?.get(ownerKey)?.authorContext?.conversationId
            || (shared.captureAuthorContext ? shared.captureAuthorContext()?.conversationId ?? null : state?.conversationId);
        const unavailable = unavailableContext(id);
        if (unavailable) return Promise.reject(unavailable);
        return id !== undefined ? inConversation(id, () => invoke(...args)) : invoke(...args);
      },
      handle: { stop: () => eventRemoveListener(event, fn, normalizeMessageId) } };
    if (position === 'first') entries.unshift(entry); else entries.push(entry);
    listeners.set(event, entries);
    if (shared.lifecycleEvents.has(event) && ['app_initialized', 'app_ready'].includes(event)) {
      if (once) entry.handle.stop();
      Promise.resolve().then(() => invoke(...shared.lifecycleEvents.get(event))).catch(report);
    }
    return entry.handle;
  }
  function eventRemoveListener(event, fn, normalizeMessageId = true) {
    const entries = listeners.get(event);
    if (!entries) return;
    const remaining = entries.filter(entry => entry.fn !== fn || entry.owner !== ownerKey || entry.normalizeMessageId !== normalizeMessageId);
    if (remaining.length) listeners.set(event, remaining); else listeners.delete(event);
  }
  // Built-in event actions run once in the shared host, even with multiple frames.
  // Each live frame supplies an implementation so closing its document cannot
  // leave the shared action pointing at a disposed JavaScript realm.
  function hostEvent(event, action) {
    const groups = shared.hostEvents ||= new Map();
    let group = groups.get(event);
    if (!group) {
      group = { handlers: new Map() };
      const invoke = (args, conversationId) => {
        const handler = group.handlers.values().next().value;
        return handler ? conversationId ? handler.inConversation(conversationId, () => handler.action(...args)) : handler.action(...args) : undefined;
      };
      const entry = { owner: '__eleckoi_builtin', plugin: '__eleckoi_builtin',
        fn: (...args) => invoke(args), invokeInConversation: (id, args) => invoke(args, id) };
      group.entry = entry;
      listeners.set(event, [entry, ...(listeners.get(event) || [])]);
      groups.set(event, group);
    }
    group.handlers.set(ownerKey, { action, inConversation });
    cleanups.add(() => {
      group.handlers.delete(ownerKey);
      if (group.handlers.size) return;
      const remaining = (listeners.get(event) || []).filter(entry => entry !== group.entry);
      if (remaining.length) listeners.set(event, remaining); else listeners.delete(event);
      groups.delete(event);
    });
  }
  async function emitEntries(event, args, owner, plugin, conversationId, ownerContext = false) {
    const errors = [];
    for (const entry of [...(listeners.get(event) || [])]) {
      if (owner !== undefined && entry.owner !== owner) continue;
      if (plugin !== undefined && entry.plugin !== plugin) continue;
      if (entry.once) entry.handle.stop();
      try {
        if (ownerContext && entry.invokeInOwnerContext) await entry.invokeInOwnerContext(args);
        else if (conversationId !== undefined) await entry.invokeInConversation(conversationId,args);
        else await (entry.invoke || entry.fn)(...args);
      } catch (error) {
        // A deleted message owner is explicitly unavailable. It must not prevent
        // a live owner from observing an unrelated native resource lifecycle.
        if (!isDeletedContext(error)) errors.push(error);
      }
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length) throw new AggregateError(errors, `Tavern event listener failed: ${event}`);
  }
  const eventEmit = (event, ...args) => {
    if (['app_initialized', 'app_ready'].includes(event)) shared.lifecycleEvents.set(event,args);
    return emitEntries(event, args, undefined, undefined, state?.conversationId);
  };
  // Global resource notifications do not transfer the emitter realm's chat to
  // every listener. A listener awaiting them inside a captured callback must
  // reenter that same owner context, even after native UI navigation.
  const eventEmitLifecycle = (event, ...args) => emitEntries(event, args, undefined, undefined, undefined, true);
  function eventEmitAndWait(event, ...args) {
    if (['app_initialized', 'app_ready'].includes(event)) shared.lifecycleEvents.set(event,args);
    // The pinned EventEmitter method is synchronous and does not await promises.
    for (const entry of [...(listeners.get(event) || [])]) {
      if (entry.once) entry.handle.stop();
      try {
        const result = (entry.invoke || entry.fn)(...args);
        if (result && typeof result.then === 'function') Promise.resolve(result).catch(report);
      } catch (error) { report(error); }
    }
  }
  const eventEmitOwned = (event, ...args) => emitEntries(event, args, ownerKey);
  function eventClearEvent(event, normalizeMessageId = true) {
    const remaining = (listeners.get(event) || []).filter(entry => entry.owner !== ownerKey ||
      (normalizeMessageId !== null && entry.normalizeMessageId !== normalizeMessageId));
    if (remaining.length) listeners.set(event, remaining); else listeners.delete(event);
  }
  function eventClearAll(normalizeMessageId = true) { for (const event of [...listeners.keys()]) eventClearEvent(event, normalizeMessageId); }
  function eventClearListener(fn) { for (const event of [...listeners.keys()]) eventRemoveListener(event, fn); }
  function moveListener(event, fn, first, normalizeMessageId = true) {
    const entries = listeners.get(event) || [];
    const entry = entries.find(value => value.fn === fn && value.owner === ownerKey && value.normalizeMessageId === normalizeMessageId);
    if (!entry) return eventOn(event, fn, first ? 'first' : 'last', false, normalizeMessageId);
    entries.splice(entries.indexOf(entry), 1);
    if (first) entries.unshift(entry); else entries.push(entry);
    return entry.handle;
  }
  function initializeGlobal(name, value) {
    shared.globals.set(name, value);
    Object.defineProperty(global, name, { get: () => shared.globals.get(name), configurable: true });
    for (const resolve of shared.waiters.get(name) || []) resolve();
    shared.waiters.delete(name);
    eventEmit(`global_${name}_initialized`).catch(report);
  }
  async function waitGlobalInitialized(name) {
    if (!shared.globals.has(name)) await new Promise((resolve, reject) => {
      const waiters = shared.waiters.get(name) || new Set();
      const cleanup = () => {
        waiters.delete(done);
        if (!waiters.size && shared.waiters.get(name) === waiters) shared.waiters.delete(name);
        cleanups.delete(stop);
      };
      const done = () => { cleanup(); resolve(); };
      const stop = () => { cleanup(); reject(new Error(`Document closed while waiting for global: ${name}`)); };
      waiters.add(done); shared.waiters.set(name, waiters); cleanups.add(stop);
    });
    Object.defineProperty(global, name, { get: () => shared.globals.get(name), configurable: true });
    return shared.globals.get(name);
  }

  const tavern_events = Object.freeze({ ...contract.events });
  const iframe_events = Object.freeze({ ...contract.iframeEvents });

  function indexOf(value, messages = requireState().messages) {
    if (typeof value === 'string' && !/^-?\d+$/.test(value)) {
      const index = messages.findIndex(message => message.id === value);
      if (index < 0) throw new RangeError(`Message does not exist: ${value}`);
      return index;
    }
    const number = Number(value);
    const index = number < 0 ? messages.length + number : number;
    if (!Number.isInteger(index) || index < 0 || index >= messages.length) throw new RangeError(`Message index out of range: ${value}`);
    return index;
  }
  function indices(range = '0-{{lastMessageId}}', messages = requireState().messages) {
    if (!messages.length && range === '0-{{lastMessageId}}') return [];
    if (Array.isArray(range)) return [...new Set(range.map(value => indexOf(value, messages)))];
    const text = String(range).replace('{{lastMessageId}}', String(messages.length - 1));
    const match = /^(-?\d+)-(-?\d+)$/.exec(text);
    if (!match) return [indexOf(text, messages)];
    const start = indexOf(match[1], messages), end = indexOf(match[2], messages);
    return Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index);
  }
  function displaySurface() {
    const surfaces = [...shared.displaySurfaces.values()].filter(surface => surface.conversationId === requireState().conversationId);
    return surfaces.at(-1);
  }
  function waitForDisplayedMessage(surface, id, conversationId) {
    return new Promise((resolve, reject) => {
      const view = surface.root.ownerDocument.defaultView;
      const finish = (error, node) => {
        observer.disconnect(); view.clearTimeout(timeout); cleanups.delete(closed);
        if (error) reject(error); else resolve(node);
      };
      const closed = () => finish(new Error('Message document closed before rendering'));
      const inspect = () => {
        if (surface.conversationId !== conversationId) return finish(new Error('Chat changed before the message was rendered'));
        try {
          const result = surface.retrieve(id), node = result?.nodeType ? result : result?.[0];
          if (node?.isConnected && surface.root.contains(node)) finish(null, node);
        } catch (error) { finish(error); }
      };
      const observer = new view.MutationObserver(inspect);
      const timeout = view.setTimeout(() => finish(new Error(`Message did not mount: ${id}`)), 30_000);
      cleanups.add(closed); observer.observe(surface.root, { childList: true, subtree: true }); inspect();
    });
  }
  function renderToolInvocations(node, invocations, message) {
    let details = node.querySelector('[data-eleckoi-tool-invocations]');
    if (!details && message?.metadata?.extra?.isSmallSys && message?.metadata?.is_system) {
      details = node.querySelector('details:has(code.language-json)');
    }
    if (!details) {
      const doc = node.ownerDocument;
      details = doc.createElement('details'); details.className = 'tool-invocations';
      details.dataset.eleckoiToolInvocations = '';
      const summary = doc.createElement('summary'), pre = doc.createElement('pre'), code = doc.createElement('code');
      code.className = 'language-json'; pre.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere';
      pre.append(code); details.append(summary, pre);
      (node.querySelector('.mes_text') || node).append(details);
    }
    const summary = details.querySelector('summary'), code = details.querySelector('code');
    const label = 'Tool calls: ' + invocations.map(value => value.displayName || value.name).join(', ');
    const content = JSON.stringify(invocations, null, 2);
    if (summary && summary.textContent !== label) summary.textContent = label;
    if (code && code.textContent !== content) code.textContent = content;
    node.classList.add('toolCall');
    return details;
  }
  const messageRenderRevision = (conversationId, message) => JSON.stringify([
    conversationId, message.role, message.content, message.reasoning, message.swipe_id,
  ]);
  const surfaceMessageRevision = (conversationId, messages) => JSON.stringify(messages.map(message => [
    message.id, messageRenderRevision(conversationId, message), message.pending, message.metadata?.extra?.tool_invocations,
  ]));
  function registerMessageSurface({ root, retrieve, format, refresh, syncMetadata, conversationId, renderTools = renderToolInvocations }) {
    requireState();
    if (root?.nodeType !== 1) throw new TypeError('Message surface root must be a real DOM element');
    for (const [name, fn] of Object.entries({ retrieve, format, refresh })) if (typeof fn !== 'function') {
      throw new TypeError(`Message surface requires a ${name} callback`);
    }
    if (typeof renderTools !== 'function') throw new TypeError('Message surface renderTools must be a callback');
    if (!conversationId && !state.conversationId) throw Object.assign(new Error('当前页面尚未选定聊天会话'), { code: 'CHAT_NOT_READY' });
    // Native DOM can mount before its SDK hydration completes. Bind that surface
    // to its real owner and leave it inactive until the matching chat is hydrated.
    const surface = { root, retrieve, format, refresh, syncMetadata, renderTools, get conversationId() { return conversationId || state?.conversationId; } };
    const view = root.ownerDocument.defaultView;
    let frame = 0;
    const scheduleRendered = () => {
      if (frame) return;
      frame = view.requestAnimationFrame(() => {
        frame = 0;
        if (shared.displaySurfaces.get(ownerKey) !== surface || !state?.conversationId || surface.conversationId !== state.conversationId) return;
        const ids = requireState().messages.filter(message => !message.pending && ['user', 'assistant'].includes(message.role)).map(message => message.id);
        shared.notifyMessageRendered(surface.conversationId, ids).catch(report);
      });
    };
    surface.scheduleRendered = scheduleRendered;
    const observer = new global.MutationObserver(scheduleRendered);
    observer.observe(root, { subtree: true, childList: true, characterData: true });
    const dispose = () => {
      observer.disconnect(); view.cancelAnimationFrame(frame);
      if (shared.displaySurfaces.get(ownerKey) === surface) shared.displaySurfaces.delete(ownerKey);
      cleanups.delete(dispose);
    };
    shared.displaySurfaces.set(ownerKey, surface); cleanups.add(dispose);
    applyMessageStyle(surface.root.ownerDocument, requireState().messageStyle);
    if (state.conversationId && surface.conversationId === state.conversationId) {
      surface.hydratedRevision = surfaceMessageRevision(state.conversationId, state.messages);
      st.restorePresentation(context,global.ElecKoi);
      syncMetadata?.(presentationMessages(state.conversationId, state.messages).map(tavernMessage));
      scheduleRendered();
      if (extensionSettings.expressions?.last && Object.keys(extensionSettings.expressions.last).length) {
        st.restoreMediaPresentation(context, global.ElecKoi).catch(report);
      }
    }
    return dispose;
  }

  shared.displayNotifications.set(ownerKey, { conversation: () => state?.conversationId, publish: async (conversationId, ids, type) => {
    await readyPromise;
    if (state.conversationId !== conversationId) return;
    const surface = [...shared.displaySurfaces.values()].filter(value => value.conversationId === conversationId).at(-1);
    if (!surface?.root?.isConnected) return;
    await refresh(conversationId, false);
    if (surface.conversationId !== conversationId || state.conversationId !== conversationId) return;
    let revisions = shared.displayRevisions.get(surface);
    if (!revisions) { revisions = new Map(); shared.displayRevisions.set(surface, revisions); }
    const savedIds = new Set(state.messages.map(message => message.id));
    for (const id of revisions.keys()) if (!savedIds.has(id)) revisions.delete(id);
    for (const id of ids) {
      const index = state.messages.findIndex(message => message.id === id), message = state.messages[index];
      if (!message || message.pending || !['user','assistant'].includes(message.role)) continue;
      const result = surface.retrieve(id), node = result?.nodeType ? result : result?.[0];
      if (!node?.isConnected || !surface.root.contains(node)) continue;
      const invocations = message.metadata?.extra?.tool_invocations;
      if (Array.isArray(invocations) && invocations.length) {
        const tools = await (surface.renderTools || renderToolInvocations)(node, clone(invocations), clone(message));
        if (!tools?.isConnected || !node.contains(tools)) throw new Error('Tool renderer must return the mounted tool DOM');
        shared.renderedTools ||= new Map();
        const key = conversationId + ':' + id;
        const prior = shared.renderedTools.get(key) || new Set();
        const added = invocations.filter(value => !prior.has(JSON.stringify(value)));
        shared.renderedTools.set(key, new Set(invocations.map(value => JSON.stringify(value))));
        if (added.length) await eventEmit(tavern_events.TOOL_CALLS_RENDERED, clone(added));
      } else {
        node.querySelector('[data-eleckoi-tool-invocations]')?.remove();
        node.classList.remove('toolCall');
        shared.renderedTools?.delete(conversationId + ':' + id);
      }
      const revision = messageRenderRevision(conversationId, message);
      if (revisions.get(id) === revision) continue;
      revisions.set(id, revision);
      if (message.role === 'user') await eventEmit(tavern_events.USER_MESSAGE_RENDERED, index);
      else await eventEmit(tavern_events.CHARACTER_MESSAGE_RENDERED, index, type);
    }
  } });
  shared.notifyMessageRendered ||= (conversationId, ids, type = 'normal') => {
    const handlers = [...shared.displayNotifications.values()];
    const handler = handlers.find(value => value.conversation() === conversationId) || handlers.find(value => !value.conversation());
    return handler ? handler.publish(conversationId, ids, type) : Promise.resolve();
  };
  cleanups.add(() => shared.displayNotifications.delete(ownerKey));
  function displayedMessageIndex(value = 'last') {
    const messages = requireState().messages;
    if (value === 'last') return indexOf(-1);
    if (value === 'last_user' || value === 'last_char') {
      const role = value === 'last_user' ? 'user' : 'assistant';
      const found = messages.findLastIndex(message => message.role === role);
      if (found < 0) throw new Error(`No ${role} message is available`);
      return found;
    }
    return indexOf(value);
  }
  const regexSources = { user_input: 'UserInput', ai_output: 'AiOutput', slash_command: 'SlashCommand', world_info: 'SettingContent', reasoning: 'Reasoning' };
  const regexPlacements = { user_input: 1, ai_output: 2, slash_command: 3, world_info: 5, reasoning: 6 };
  function asTavernRegex(rule) {
    const displayOnly = rule.display_only ?? rule.markdownOnly ?? false, promptOnly = rule.prompt_only ?? rule.promptOnly ?? false;
    return { ...clone(rule), id: rule.id || st.uuidv4(), script_name: rule.script_name ?? rule.name ?? rule.scriptName ?? '', enabled: rule.enabled ?? !rule.disabled,
      find_regex: rule.find_regex ?? rule.pattern ?? rule.findRegex ?? '', replace_string: rule.replace_string ?? rule.replacement ?? rule.replaceString ?? '',
      trim_strings: rule.trim_strings ?? rule.trimStrings ?? [], source: rule.source || Object.fromEntries(Object.entries(regexSources).map(([name, target]) =>
        [name, rule.targets ? rule.targets.includes(target) : rule.placement ? rule.placement.includes(regexPlacements[name]) : name === 'ai_output'])),
      destination: rule.destination || { display: displayOnly || !promptOnly, prompt: promptOnly || !displayOnly },
      run_on_edit: rule.run_on_edit ?? rule.runOnEdit ?? false, min_depth: rule.min_depth ?? rule.minDepth ?? null, max_depth: rule.max_depth ?? rule.maxDepth ?? null };
  }
  function asNativeRegex(value, order) {
    const rule = asTavernRegex(value);
    const extensions = clone(value);
    for (const key of ['script_name', 'scriptName', 'find_regex', 'findRegex', 'replace_string', 'replaceString', 'source', 'destination', 'disabled', 'placement', 'markdownOnly', 'promptOnly', 'runOnEdit', 'trimStrings', 'minDepth', 'maxDepth']) delete extensions[key];
    return { ...extensions, id: rule.id, name: rule.script_name, pattern: rule.find_regex, replacement: rule.replace_string,
      enabled: rule.enabled, targets: Object.entries(rule.source).filter(([, enabled]) => enabled).map(([name]) => regexSources[name]),
      display_only: rule.destination.display && !rule.destination.prompt, prompt_only: rule.destination.prompt && !rule.destination.display,
      run_on_edit: rule.run_on_edit, trim_strings: rule.trim_strings, min_depth: rule.min_depth, max_depth: rule.max_depth, order };
  }
  function asRawRegex(value) {
    const rule = asTavernRegex(value);
    return { ...clone(value), scriptName: rule.script_name, findRegex: rule.find_regex, replaceString: rule.replace_string, disabled: !rule.enabled,
      placement: Object.entries(rule.source).filter(([, enabled]) => enabled).map(([name]) => regexPlacements[name]), trimStrings: rule.trim_strings,
      markdownOnly: rule.destination.display && !rule.destination.prompt, promptOnly: rule.destination.prompt && !rule.destination.display,
      runOnEdit: rule.run_on_edit, minDepth: rule.min_depth, maxDepth: rule.max_depth, substituteRegex: rule.substituteRegex ?? 0 };
  }
  function regexLocation(options) {
    const type = options?.type || options?.scope;
    const s = requireState();
    if (!type || type === 'all') return { rules: [...(s.regex?.global_rules || []), ...(s.regex?.prompt_preset_rules || []), ...(s.regex?.character_rules || [])] };
    if (type === 'global') return { type, rules: s.regex?.global_rules || [], scope: captured() };
    if (type === 'character') {
      const name = options?.name || 'current', character = RawCharacter.find({ name });
      if (!character) throw new Error(`Character does not exist: ${name}`);
      return { type, rules: s.characterRegexes?.[character.native_id] || (character.native_id === s.characterId ? s.regex?.character_rules : character.data?.extensions?.regex_scripts) || [],
        scope: { ...captured(), characterId: character.native_id } };
    }
    if (type === 'preset') { const name = options?.name || 'in_use'; return { type, name, rules: getPreset(name).extensions?.regex_scripts || [] }; }
    throw new Error(`Unknown regex scope: ${type}`);
  }
  function getTavernRegexes(options) {
    return regexLocation(options).rules.map(value => {
      const rule = asTavernRegex(value); if (options?.scope) rule.scope = options.scope;
      return rule;
    });
  }
  async function replaceTavernRegexes(rules, options = { type: 'character' }) {
    await readyPromise; const location = regexLocation(options);
    if (!location.type) throw new Error('replaceTavernRegexes requires a concrete scope');
    const normalized = rules.map(asNativeRegex);
    for (const rule of normalized) {
      if (!st.regexFromString(rule.pattern)) throw new Error(`Invalid regex ${rule.name}: ${rule.pattern}`);
    }
    if (location.type === 'preset') {
      const preset = getPreset(location.name); preset.extensions.regex_scripts = normalized;
      await helpers.replacePreset(location.name, preset);
    } else await call('regex.replaceScope', { ...location.scope, type: location.type, rules: normalized });
    await refresh(); await eventEmit(tavern_events.CHAT_CHANGED, requireState().conversationId);
  }
  function formatWithRegex(text, rules, source, destination, { depth, character_name, is_edit = false, isolated = false } = {}) {
    if (destination === 'display' && !isolated) {
      st.sync(); return st.withReadOnlyEvaluation(() => formatWithRegex(text, rules, source, destination, { depth, character_name, is_edit, isolated: true }));
    }
    if (!Object.hasOwn(regexSources, source)) throw new Error(`Unknown regex source: ${source}`);
    if (!['display', 'prompt'].includes(destination)) throw new Error(`Unknown regex destination: ${destination}`);
    st.sync();
    for (const value of rules) {
      const rule = asTavernRegex(value);
      if (!rule.enabled || !rule.source[source] || !rule.destination[destination] || (is_edit && !rule.run_on_edit)) continue;
      if (typeof depth === 'number' && ((rule.min_depth !== null && rule.min_depth >= -1 && depth < rule.min_depth) ||
        (rule.max_depth !== null && rule.max_depth >= 0 && depth > rule.max_depth))) continue;
      const raw = asRawRegex(rule);
      if (!st.regexFromString(raw.findRegex)) throw new Error(`Invalid regex ${rule.script_name}: ${raw.findRegex}`);
      text = st.runRegexScript(raw, text, { characterOverride: character_name });
    }
    return text;
  }
  function audioChannel(type) {
    if (!['bgm', 'ambient'].includes(type)) throw new Error(`Unknown audio channel: ${type}`);
    requireState(); return shared.audioState.states[type] ||= { channel: type, playlist: [], currentIndex: -1, currentTrack: null, status: 'idle', currentTime: 0, duration: null };
  }
  function audioItem(value) {
    if (!value || typeof value.url !== 'string' || !value.url) throw new Error('Audio requires a URL');
    return { title: value.title || value.url.split('/').at(-1)?.split('.').at(0) || value.url, url: value.url };
  }
  function audioNativeItem(value) { return { name: value.title, url: value.url }; }
  function getAudioList(type) { return audioChannel(type).playlist.map(value => ({ title: value.title ?? value.name, url: value.url })); }
  function getAudioSettings(type) {
    audioChannel(type); const settings = shared.audioState.settings.channels[type] || {};
    return { enabled: settings.enabled ?? true, mode: settings.mode ?? 'play_one_and_stop', muted: settings.muted ?? false, volume: (settings.volume ?? 1) * 100 };
  }
  function setAudioSettings(type, patch) {
    const previous = getAudioSettings(type), next = { ...previous, ...clone(patch) };
    if (!['repeat_one', 'repeat_all', 'shuffle', 'play_one_and_stop'].includes(next.mode)) throw new Error(`Unknown audio mode: ${next.mode}`);
    next.volume=st.libs.lodash.clamp(next.volume,0,100);
    const channels = shared.audioState.settings.channels, original = channels[type];
    const update = { ...next, volume: next.volume / 100 }; channels[type] = update;
    enqueue(async () => { await call('audio.setSettings', { settings: { channels: { [type]: update } } }); }, () => { if (channels[type] === update) channels[type] = original; });
  }
  function replaceAudioList(type, values) {
    const channel = audioChannel(type), previous = channel.playlist, items = values.map(audioItem);
    channel.playlist = items; channel.currentIndex = items.findIndex(item=>item.url===channel.currentTrack?.url);
    const scope = captured();
    enqueue(async () => { const result = await call('audio.setPlaylist', { ...scope, channel: type, items: items.map(audioNativeItem),preservePlayback:true });
      if (channel.playlist === items && result) Object.assign(channel, result);
    }, () => { if (channel.playlist === items) channel.playlist = previous; });
  }
  function appendAudioList(type, values) {
    const items = getAudioList(type);
    items.push(...values.map(audioItem));
    replaceAudioList(type, items);
  }
  function playAudio(type, value) {
    const channel = audioChannel(type), item = audioItem(value), list = getAudioList(type), scope = captured();
    value.title=item.title;
    const existing=list.findIndex(value=>value.url===item.url || value.title===item.title);
    if(existing<0)list.push(item);else list[existing]=item;
    replaceAudioList(type,list);
    channel.currentIndex = list.findIndex(value => value.url === item.url); channel.currentTrack = item;
    channel.status = 'loading';
    enqueue(async () => { const result = await call('audio.play', { ...scope, channel: type, track: audioNativeItem(item), preservePlaylist: true });
      if (result) Object.assign(channel, result);
    });
  }
  function pauseAudio(type) {
    const channel = audioChannel(type); channel.status = 'paused';
    enqueue(async () => { const result = await call('audio.pause', { channel: type }); if (result) Object.assign(channel, result); });
  }
  function getCurrentAudio(type) {
    const channel = audioChannel(type), track = channel.currentTrack;
    const listed=channel.playlist.find(value=>value.url===track?.url);
    return { src: track?.url || '', title: listed?.title ?? listed?.name ?? '', playing: ['loading','playing'].includes(channel.status),
      progress: channel.duration > 0 ? Math.max(0, Math.min(100, channel.currentTime / channel.duration * 100)) : 0 };
  }
  const compatibilityComponentId = 'eleckoi-tavern-compat';
  function extensionManifest(id) {
    const s = requireState(), entries = { ...s.components, ...s.plugins };
    const key = Object.keys(entries).find(key => key.endsWith(String(id)));
    return key === undefined ? undefined : entries[key];
  }
  async function extensionAction(method, params) {
    await readyPromise; await flush();
    if (method !== 'extensions.install' && !extensionManifest(params.id)) {
      return new global.Response(JSON.stringify({ message: '扩展不存在' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }
    const manifest = method === 'extensions.install' ? undefined : extensionManifest(params.id);
    const result = await call(method, manifest ? { ...params, id: manifest.id || params.id } : params); await refresh();
    if (method === 'extensions.remove' && result === false) {
      return new global.Response(JSON.stringify({ message: '扩展不存在' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }
    return new global.Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  function importRawTavernRegex(filename, content) {
    const input = JSON.parse(content), rules = Array.isArray(input) ? input : Array.isArray(input.regex_scripts) ? input.regex_scripts : [input];
    const normalized = rules.map((value, index) => asNativeRegex(value, index));
    for (const rule of normalized) if (!rule.pattern || !st.regexFromString(rule.pattern)) throw new Error(`Invalid regex in ${filename}: ${rule.pattern}`);
    const s = requireState(), scope = captured(), previous = s.regex?.global_rules || [], combined = [...previous, ...normalized];
    s.regex ||= {}; s.regex.global_rules = combined;
    enqueue(() => call('regex.replaceScope', { ...scope, type: 'global', rules: combined }), () => { if (s.regex.global_rules === combined) s.regex.global_rules = previous; });
    return true;
  }
  function formatAsDisplayedMessage(text, { message_id = 'last' } = {}) {
    const index = displayedMessageIndex(message_id), message = requireState().messages[index];
    const regex = requireState().regex || {}, rules = [...(regex.global_rules || []), ...(regex.prompt_preset_rules || []), ...(regex.character_rules || [])];
    const formatted = formatWithRegex(substituteMacros(text, { readOnly: true }), rules, message.role === 'user' ? 'user_input' : 'ai_output', 'display');
    const surface = displaySurface();
    if (surface) return surface.format(formatted);
    if (!global.showdown?.Converter) throw new Error('Message formatter is unavailable in this document');
    return new global.showdown.Converter().makeHtml(formatted);
  }
  function retrieveDisplayedMessage(messageId) {
    if (typeof global.jQuery !== 'function') throw new Error('retrieveDisplayedMessage requires JQuery');
    const message = requireState().messages[messageId], surface = displaySurface();
    const nodes = global.jQuery(message && surface && !surface.root.hidden ? surface.retrieve(message.id) : []);
    return nodes.filter('div.mes_text').add(nodes.find('div.mes_text'));
  }
  async function refreshOneMessage(messageId, target) {
    await readyPromise;
    if (target && !target.length) return;
    const message = requireState().messages[displayedMessageIndex(messageId)], surface = displaySurface();
    await releaseMessagePresentation(captured(), [message.id]);
    if (!surface) return;
    await surface.refresh(message.id, formatAsDisplayedMessage(message.content, { message_id: messageId }), target?.[0]);
  }
  function presentationMessages(conversationId, messages) {
    const timeline = shared.messageTimelineHolds.get(conversationId);
    if (timeline) {
      const live = messages.filter(message => !timeline.owners.has(message.id));
      const liveIds = new Set(live.map(message => message.id)), leading = [], following = new Map();
      let previous = null;
      for (const message of timeline.messages) {
        if (timeline.owners.has(message.id)) {
          if (previous === null) leading.push(message);
          else { if (!following.has(previous)) following.set(previous, []); following.get(previous).push(message); }
        } else if (liveIds.has(message.id)) previous = message.id;
      }
      messages = [...leading];
      for (const message of live) { messages.push(message); messages.push(...(following.get(message.id) || [])); }
    }
    const held = shared.messageDisplayHolds.get(conversationId);
    return messages.map(message => held?.get(message.id)?.message || message);
  }
  function clearMessagePresentation(conversationId, ids) {
    const held = shared.messageDisplayHolds.get(conversationId), timeline = shared.messageTimelineHolds.get(conversationId);
    if (ids) { ids.forEach(id => held?.delete(id)); ids.forEach(id => timeline?.owners.delete(id)); }
    else { held?.clear(); timeline?.owners.clear(); }
    if (!held?.size) shared.messageDisplayHolds.delete(conversationId);
    if (!timeline?.owners.size) shared.messageTimelineHolds.delete(conversationId);
  }
  function stageMessageTimeline(scope, snapshot, ids, mode) {
    const previous = shared.messageTimelineHolds.get(scope.conversationId);
    const previousContent = new Map(shared.messageDisplayHolds.get(scope.conversationId) || []);
    if (mode === 'none' && ids.length) {
      const owners = new Map([...(previous?.owners || [])].map(([id, values]) => [id, new Set(values)]));
      for (const id of ids) { if (!owners.has(id)) owners.set(id, new Set()); owners.get(id).add(ownerKey); }
      shared.messageTimelineHolds.set(scope.conversationId, { messages: clone(presentationMessages(scope.conversationId, snapshot)), owners });
    } else if (mode !== 'none') {
      if (previous) shared.messageTimelineHolds.set(scope.conversationId, { messages: previous.messages, owners: new Map(previous.owners) });
      clearMessagePresentation(scope.conversationId, mode === 'all' ? undefined : ids);
    }
    return () => {
      if (previous) shared.messageTimelineHolds.set(scope.conversationId, previous); else shared.messageTimelineHolds.delete(scope.conversationId);
      if (previousContent.size) shared.messageDisplayHolds.set(scope.conversationId, previousContent); else shared.messageDisplayHolds.delete(scope.conversationId);
    };
  }
  async function releaseMessagePresentation(scope, ids) {
    const rollback = stageMessageTimeline(scope, state?.messages || [], ids || [], ids ? 'affected' : 'all');
    clearMessagePresentation(scope.conversationId, ids);
    try { await call('messages.refresh', { ...scope, ...(ids ? { ids } : {}), presentationOwner: ownerKey }); }
    catch (error) { rollback(); throw error; }
    if (state?.conversationId === scope.conversationId) updateContextChat();
  }
  async function refreshChatPresentation() {
    await readyPromise;
    const scope = captured();
    await releaseMessagePresentation(scope);
    await refresh(scope.conversationId);
    const surface = displaySurface();
    if (surface) for (let index = 0; index < state.messages.length; index++) {
      const message = state.messages[index];
      await surface.refresh(message.id, formatAsDisplayedMessage(message.content, { message_id: index }));
    }
  }
  function tavernMessage(message, index) {
    const extra = message.metadata || {};
    const speakerAvatar = message.speakerId ? state.rawCharacters?.find(card => card.native_id === message.speakerId)?.avatar : null;
    return { ...clone(extra), message_id: index, name: message.name || extra.name || (message.role === 'user' ? state.userName : state.characterName),
      ...(speakerAvatar ? { original_avatar: speakerAvatar } : {}),
      role: message.role, is_user: message.role === 'user', is_system: !!extra.is_hidden,
      is_hidden: !!extra.is_hidden,
      message: message.content, mes: message.content, data: clone(message.variables?.[message.swipe_id || 0] || extra.data || {}),
      extra: clone(message.swipes_info?.[message.swipe_id || 0]?.extra ?? message.swipes_info?.[message.swipe_id || 0] ?? extra.extra ?? {}),
      swipes_data: clone(message.variables || extra.swipes_data || []), swipes_info: clone(message.swipes_info || extra.swipes_info || []),
      native_id: message.id, swipe_id: message.swipe_id || 0, swipes: clone(message.swipes || [message.content]), reasoning: message.reasoning || '' };
  }
  const messageKeys = new Set(['message_id', 'native_id', 'role', 'name', 'is_user', 'is_system', 'message', 'mes', 'swipe_id', 'swipes', 'reasoning']);
  function messageMetadata(value) {
    return Object.fromEntries(Object.entries(value).filter(([key]) => !messageKeys.has(key)));
  }
  function getChatMessages(range, options = {}) {
    const messages = requireState().messages;
    let selected;
    if (Array.isArray(range)) selected = indices(range, messages);
    else {
      const text = substituteMacros(String(range ?? '0-{{lastMessageId}}'));
      const single = /^(-?\d+)$/.exec(text), pair = /^(-?\d+)-(-?\d+)$/.exec(text);
      if (!single && !pair) return [];
      const clamp = value => Math.min(messages.length - 1, Math.max(0, Number(value) < 0 ? messages.length + Number(value) : Number(value)));
      const [start, end] = (single ? [clamp(single[1]), clamp(single[1])] : [clamp(pair[1]), clamp(pair[2])]).sort((a, b) => a - b);
      selected = Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index);
    }
    return selected.filter(index => messages[index]).map(index => {
      const native = messages[index], message = tavernMessage(native, index);
      const swipes = Array.from({ length: message.swipes.length }, (_, index) => message.swipes[index] ?? '');
      const variables = native.variables || native.metadata?.swipes_data || [];
      const infos = native.swipes_info || native.metadata?.swipes_info || [native.metadata?.extra || {}];
      const swipes_data = swipes.map((_, index) => variables[index] ?? {});
      const swipes_info = swipes.map((_, index) => infos[index] ?? {});
      // TavernHelper exposes the entire selected swipe_info record as extra.
      // Native IDs and stored extension fields remain available as ElecKoi additions.
      return { ...message, swipes, swipes_data, swipes_info,
        data: swipes_data[message.swipe_id], extra: swipes_info[message.swipe_id],
        role: message.extra?.type === 'narrator' ? message.is_user ? 'unknown' : 'system' : message.role };
    })
      .filter(message => !options.role || options.role === 'all' || message.role === options.role)
      .filter(message => !options.hide_state || options.hide_state === 'all' || (options.hide_state === 'hidden' ? message.is_hidden : !message.is_hidden))
      .map(message => {
        if (options.include_swipes) return clone(message);
        const { swipes_info, ...selected } = message;
        return clone(selected);
      });
  }
  async function setChatMessages(updates, options = {}) {
    await readyPromise;
    const scope = captured();
    const snapshot = state.messages;
    const grouped = new Map();
    for (const value of updates) {
      const index = value.native_id === undefined ? Number(value.message_id) < 0 ? snapshot.length + Number(value.message_id) : Number(value.message_id) : indexOf(value.native_id, snapshot);
      if (!Number.isInteger(index) || !snapshot[index]) continue;
      grouped.set(index, { ...grouped.get(index), ...value });
    }
    const messages = [];
    for (const [index, value] of [...grouped].sort(([left], [right]) => left - right)) {
      const original = snapshot[index];
      const normal = Object.hasOwn(value, 'message') || Object.hasOwn(value, 'data') || Object.hasOwn(value, 'mes');
      const candidate = {};
      const incomingMetadata = messageMetadata(value);
      // Non-swipe reads carry compatibility swipe fields. The pinned setter
      // ignores those fields when updating the selected message/data overload.
      delete incomingMetadata.swipes_data; delete incomingMetadata.swipes_info;
      if (normal) {
        if (value.extra !== undefined) {
          const infos = Array.from({ length: original.swipes?.length || 1 }, (_, index) => clone(original.swipes_info?.[index] || {}));
          infos[original.swipe_id || 0] = clone(value.extra);
          candidate.swipes_info = infos;
          // Native candidate records already own their extra object; wrapping
          // a complete TH swipe_info in metadata.extra would nest it twice.
          delete incomingMetadata.extra;
        }
      } else if (value.swipe_id !== undefined || value.swipes || value.swipes_data || value.swipes_info) {
        const supplied = [value.swipes?.length, value.swipes_data?.length, value.swipes_info?.length].filter(length => length !== undefined);
        const length = supplied.length ? Math.max(...supplied) : original.swipes?.length || 1;
        candidate.swipe_id = Math.min(length - 1, Math.max(0, value.swipe_id ?? original.swipe_id ?? 0));
        candidate.swipes = Array.from({ length }, (_, index) => (value.swipes || original.swipes || [original.content])[index] ?? '');
        candidate.swipes_data = Array.from({ length }, (_, index) => clone((value.swipes_data || original.variables || [{}])[index] ?? {}));
        candidate.swipes_info = Array.from({ length }, (_, index) => clone((value.swipes_info || original.swipes_info || [{}])[index] ?? {}));
        delete incomingMetadata.extra;
      }
      const metadata = { ...(original.metadata || {}), ...incomingMetadata };
      if (candidate.swipes_info) delete metadata.extra;
      if (value.data === undefined) delete metadata.data;
      const content = normal ? value.message ?? value.mes : undefined;
      messages.push({ id: original.id, metadata, ...candidate, ...(content === undefined ? {} : { content, expectedContent: original.content }),
        ...(value.role === undefined ? {} : { role: value.role }), ...(value.name === undefined ? {} : { name: value.name }),
        ...(value.reasoning === undefined ? {} : { reasoning: value.reasoning }) });
    }
    await flush();
    if (!messages.length) return;
    const mode = options.refresh ?? 'affected', ids = messages.map(message => message.id);
    if (!['none','affected','all'].includes(mode)) throw new Error(`Unknown message refresh mode: ${mode}`);
    let held = shared.messageDisplayHolds.get(scope.conversationId);
    const previousHolds = new Map(held || []);
    const restoreTimeline = mode === 'none' ? null : stageMessageTimeline(scope, snapshot, ids, mode);
    if (mode === 'none') {
      if (!held) { held = new Map(); shared.messageDisplayHolds.set(scope.conversationId, held); }
      for (const id of ids) if (!held.has(id)) held.set(id, { owner: ownerKey, message: clone(snapshot.find(message => message.id === id)) });
    } else if (mode === 'all') held?.clear();
    else ids.forEach(id => held?.delete(id));
    let updated;
    try { updated = await call('messages.update', { ...scope, messages, refresh: mode, presentationOwner: ownerKey }); }
    catch (error) {
      restoreTimeline?.();
      if (previousHolds.size) shared.messageDisplayHolds.set(scope.conversationId, previousHolds);
      else shared.messageDisplayHolds.delete(scope.conversationId);
      throw error;
    }
    if (state.conversationId !== scope.conversationId) return;
    state.messages = updated; updateContextChat(); await refresh(scope.conversationId);
    if (mode !== 'none') {
      const surface = displaySurface();
      if (surface) for (let index = 0; index < state.messages.length; index++) {
        const message = state.messages[index];
        if (mode === 'all' || ids.includes(message.id)) await surface.refresh(message.id, formatAsDisplayedMessage(message.content, { message_id: index }));
      }
    }
  }
  async function createChatMessages(messages, options = {}) {
    await readyPromise;
    const scope = captured(), count = state.messages.length, mode = options.refresh ?? 'affected';
    if (!['none','affected','all'].includes(mode)) throw new Error(`Unknown message refresh mode: ${mode}`);
    const before = options.insert_at ?? options.insert_before ?? 'end';
    const position = before === 'end' ? count : st.libs.lodash.clamp(before, -count, count);
    const index = position < 0 ? count + position : position;
    const inserted = messages.map(value => ({ id: st.uuidv4(),
      role: value.role || (value.is_user ? 'user' : value.is_system ? 'system' : 'assistant'), content: value.message ?? value.mes ?? '',
      name: value.name, reasoning: value.reasoning, metadata: messageMetadata(value) }));
    const rollback = stageMessageTimeline(scope, state.messages, inserted.map(message => message.id), mode);
    let updated;
    try { updated = await call('messages.insert', { ...scope, index, refresh: mode, presentationOwner: ownerKey, messages: inserted }); }
    catch (error) { rollback(); throw error; }
    if (state.conversationId === scope.conversationId) { state.messages = updated; updateContextChat(); }
  }
  async function deleteChatMessages(range, options = {}) {
    await readyPromise;
    const scope = captured(), mode = options.refresh ?? 'affected';
    if (!['none','affected','all'].includes(mode)) throw new Error(`Unknown message refresh mode: ${mode}`);
    const selected = Array.isArray(range) ? [...new Set(range.filter(value => Number.isInteger(value) && value >= -state.messages.length && value < state.messages.length)
      .map(value => value < 0 ? state.messages.length + value : value))] : indices(range);
    if (!selected.length) return;
    const ids = selected.map(index => state.messages[index].id);
    const rollback = stageMessageTimeline(scope, state.messages, ids, mode);
    let updated;
    try { updated = await call('messages.delete', { ...scope, ids, refresh: mode, presentationOwner: ownerKey }); }
    catch (error) { rollback(); throw error; }
    if (state.conversationId === scope.conversationId) { state.messages = updated; updateContextChat(); }
  }
  async function rotateChatMessages(begin, middle, end, options = {}) {
    await readyPromise;
    const scope = captured(), count = state.messages.length, mode = options.refresh ?? 'affected';
    if (!['none','affected','all'].includes(mode)) throw new Error(`Unknown message refresh mode: ${mode}`);
    const normalize = value => value < 0 ? count + value : value;
    begin = st.libs.lodash.clamp(normalize(begin), 0, count); end = st.libs.lodash.clamp(normalize(end), 0, count);
    middle = st.libs.lodash.clamp(normalize(middle), begin, end);
    if (end < begin) return;
    const changed = begin !== middle && middle !== end;
    const rollback = stageMessageTimeline(scope, state.messages, changed ? state.messages.slice(begin, end).map(message => message.id) : [], mode);
    let updated;
    try { updated = await call('messages.rotate', { ...scope, begin, middle, end, refresh: mode, presentationOwner: ownerKey }); }
    catch (error) { rollback(); throw error; }
    if (state.conversationId === scope.conversationId) { state.messages = updated; updateContextChat(); }
  }

  function variableLocation(options = {}) {
    const s = requireState(), type = options.type || options.scope || 'chat';
    const scope = type === 'script' || type === 'extension' ? type : type === 'plugin' ? 'plugin' : type;
    if (!['chat', 'message', 'character', 'preset', 'global', 'script', 'extension', 'plugin'].includes(scope)) throw new Error(`Unknown variable scope: ${scope}`);
    if (s.variables[scope] === null) throw Object.assign(new Error(`当前页面没有 ${scope} 变量作用域`), { code: 'CHAT_NOT_READY' });
    const messageId = scope === 'message' ? s.messages[indexOf(options.message_id === 'latest' ? -1 : options.message_id ?? -1)].id : undefined;
    const message = scope === 'message' ? s.messages.find(value => value.id === messageId) : undefined;
    const swipeId = message?.swipe_id || 0;
    const variableOwner = scope === 'script' ? options.script_id || pluginId : scope === 'extension' ? options.extension_id || pluginId : pluginId;
    const key = [scope, ['script', 'extension', 'plugin'].includes(scope) ? variableOwner : '',
      scope === 'character' ? s.characterId : scope === 'preset' ? s.presetId : ['chat', 'message'].includes(scope) ? s.conversationId : '', messageId || '', scope === 'message' ? swipeId : ''].join(':');
    const local = scope === 'message' ? message?.variables?.[swipeId] || (s.variables.message[messageId] ||= {}) : ['script', 'extension', 'plugin'].includes(scope)
      ? s.variableOwners?.[scope]?.[variableOwner] || (variableOwner === pluginId ? (s.variables[scope] ||= {}) : {}) : (s.variables[scope] ||= {});
    const bucket = shared.variableBuckets.get(key) || local;
    shared.variableBuckets.set(key, bucket);
    return { bucket, scope, messageId, swipeId, variableOwner, key, context: captured() };
  }
  function getVariables(options = {}) { return st.libs.lodash.cloneDeep(variableLocation(options).bucket); }
  function getAllVariables() {
    const messageFrame = global.__ElecKoiCurrentMessageId !== undefined;
    const value = Object.assign({}, getVariables({ type: 'global' }), getVariables({ type: 'character' }),
      messageFrame ? {} : getVariables({ type: 'script' }), getVariables({ type: 'chat' }));
    if (messageFrame) {
      const last = indexOf(global.__ElecKoiCurrentMessageId);
      for (let i = 0; i <= last; i++) Object.assign(value, getVariables({ type: 'message', message_id: i }));
    }
    return clone(value);
  }
  function registerVariableSchema(schema, { type }) {
    if (!['global', 'preset', 'character', 'chat', 'message'].includes(type)) throw new Error(`Unknown schema scope: ${type}`);
    shared.variableSchemas.set(type, schema);
  }
  async function editVariables(options = {}) {
    await readyPromise;
    const location = variableLocation(options), schema = shared.variableSchemas.get(options.type || 'chat');
    const document = documentForUi(), root = document.createElement('div');
    const heading = document.createElement('strong'); heading.textContent = `${options.type || 'chat'} 变量`;
    const form = document.createElement('div'), text = document.createElement('textarea'), errors = document.createElement('pre');
    root.style.cssText = 'display:grid;gap:10px;text-align:left'; form.style.cssText = 'display:grid;gap:8px';
    text.style.cssText = 'width:100%;box-sizing:border-box;min-height:22vh;max-height:55vh;resize:vertical;font-family:monospace';
    text.value = JSON.stringify(getVariables(options), null, 2); errors.style.cssText = 'white-space:pre-wrap;color:var(--SmartThemeQuoteColor,#b33)';
    function inspect() {
      try { const value = JSON.parse(text.value); const result = schema?.safeParse?.(value);
        errors.textContent = result && !result.success ? result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('\n') : '';
        return { value, valid: !result || result.success };
      } catch (error) { errors.textContent = String(error.message); return { valid: false }; }
    }
    const shape = schema?.shape;
    if (shape && typeof shape === 'object') for (const [name, field] of Object.entries(shape)) {
      const label = document.createElement('label'), title = document.createElement('span'); title.textContent = name;
      label.style.cssText = 'display:grid;grid-template-columns:minmax(90px,1fr) 2fr;gap:8px;align-items:center';
      let inner = field; while (typeof inner?.unwrap === 'function') { const next = inner.unwrap(); if (next === inner) break; inner = next; }
      const definition = inner?._def || inner?.def || {}, kind = definition.typeName || definition.type || '';
      const input = document.createElement(/Boolean|boolean/.test(kind) ? 'input' : /Number|number|String|string/.test(kind) ? 'input' : 'textarea');
      input.name = name; input.dataset.variableField = name;
      if (/Boolean|boolean/.test(kind)) input.type = 'checkbox'; else if (/Number|number/.test(kind)) { input.type = 'number'; input.step = 'any'; }
      else if (input.tagName === 'INPUT') input.type = 'text';
      if (field.description) label.title = field.description;
      const initial = location.bucket[name];
      if (input.type === 'checkbox') input.checked = !!initial; else input.value = input.tagName === 'TEXTAREA' ? JSON.stringify(initial ?? null, null, 2) : initial ?? '';
      input.addEventListener('input', () => { try {
        const current = JSON.parse(text.value);
        current[name] = input.type === 'checkbox' ? input.checked : input.type === 'number' ? Number(input.value) : input.tagName === 'TEXTAREA' ? JSON.parse(input.value) : input.value;
        text.value = JSON.stringify(current, null, 2); inspect();
      } catch (error) { errors.textContent = String(error.message); } });
      label.append(title, input); form.append(label);
    }
    text.addEventListener('input', inspect); root.append(heading, form, text, errors); inspect();
    while (true) {
      const popup = new st.Popup(root, st.POPUP_TYPE.CONFIRM, '', { okButton: '保存', cancelButton: '取消', wide: true });
      if (await popup.show() !== st.POPUP_RESULT.AFFIRMATIVE) return false;
      const checked = inspect(); if (!checked.valid) continue;
      replaceLocation(checked.value, location); await flush(); return true;
    }
  }
  function replaceLocation(value, location) {
    shared.variableVersions.set(location.key, (shared.variableVersions.get(location.key) || 0) + 1);
    const record = variableCommits.get(location.bucket) || { committed: clone(location.bucket), revision: 0 };
    variableCommits.set(location.bucket, record);
    const revision = ++record.revision;
    Object.keys(location.bucket).forEach(key => delete location.bucket[key]); Object.assign(location.bucket, st.libs.lodash.cloneDeep(value));
    const payload = clone(location.bucket);
    enqueue(async () => {
      await call('variables.writeScope', { ...location.context, scope: location.scope, messageId: location.messageId,
        variableOwner: location.variableOwner, swipeId: location.swipeId, value: payload });
      record.committed = payload;
    }, () => {
      if (record.revision !== revision) return;
      Object.keys(location.bucket).forEach(key => delete location.bucket[key]); Object.assign(location.bucket, record.committed);
    });
    return undefined;
  }
  function replaceVariables(value, options = {}) { return replaceLocation(value, variableLocation(options)); }
  function updateVariablesWith(updater, options = {}) {
    const location = variableLocation(options), updated = updater(st.libs.lodash.cloneDeep(location.bucket));
    if (updated?.then) return updated.then(value => { replaceLocation(value, location); return flush().then(() => value); });
    replaceLocation(updated, location); return updated;
  }
  function insertOrAssignVariables(value, options) {
    return updateVariablesWith(previous=>st.libs.lodash.mergeWith(previous,value,(_left,right)=>Array.isArray(right) ? right : undefined),options);
  }
  function insertVariables(value, options) {
    return updateVariablesWith(previous=>st.libs.lodash.mergeWith({},value,previous,(_left,right)=>Array.isArray(right) ? right : undefined),options);
  }
  function deleteVariable(path, options) {
    let delete_occurred;
    const variables=updateVariablesWith(previous=>{delete_occurred=st.libs.lodash.unset(previous,path);return previous;},options);
    return {variables,delete_occurred};
  }
  function stVariableService(type) {
    const options = { type };
    const normalize = value => value?.trim?.() === '' || Number.isNaN(Number(value)) ? value || '' : Number(value);
    const convert = (value, as) => {
      if (typeof as !== 'string') return value;
      switch (as.trim().toLowerCase()) {
        case 'string': case 'str': return String(value);
        case 'null': return null;
        case 'undefined': case 'none': return undefined;
        case 'number': return Number(value);
        case 'int': return parseInt(value, 10);
        case 'float': return parseFloat(value);
        case 'boolean': case 'bool': return ['on', 'true', '1'].includes(value?.trim()?.toLowerCase());
        case 'list': case 'array': {
          try { const parsed = JSON.parse(value); if (Array.isArray(parsed)) return parsed; }
          catch (error) { console.warn('ST variable array conversion failed', error); }
          return [];
        }
        case 'object': case 'dict': case 'dictionary': {
          try { const parsed = JSON.parse(value); if (typeof parsed === 'object') return parsed; }
          catch (error) { console.warn('ST variable object conversion failed', error); }
          return {};
        }
        default: return value;
      }
    };
    const service = {
      get(name, args = {}) {
        let value = variableLocation(options).bucket[args.key ?? name];
        if (args.index !== undefined) {
          try {
            const key = Number.isNaN(Number(args.index)) ? args.index : Number(args.index);
            value = JSON.parse(value)[key];
            if (typeof value === 'object') value = JSON.stringify(value);
          } catch (error) { console.warn(`ST variable ${type}.${name} index lookup failed`, error); }
        }
        return normalize(value);
      },
      set(name, value, args = {}) {
        if (!name) throw new Error('Variable name cannot be empty or undefined.');
        const variables = getVariables(options);
        if (args.index !== undefined) {
          try {
            const number = Number(args.index), key = Number.isNaN(number) ? args.index : number;
            const indexed = JSON.parse(variables[name] ?? 'null') ?? (typeof key === 'string' ? {} : []);
            indexed[key] = convert(value, args.as);
            variables[name] = JSON.stringify(indexed);
          } catch (error) { console.warn(`ST variable ${type}.${name} index write failed`, error); }
        } else variables[name] = value;
        replaceVariables(variables, options);
        return value;
      },
      has: name => variableLocation(options).bucket[name] !== undefined,
      del(name) {
        if (!service.has(name)) { console.warn(`The ${type} variable "${name}" does not exist.`); return ''; }
        const variables = getVariables(options); delete variables[name]; replaceVariables(variables, options); return '';
      },
      add(name, value) {
        const current = service.get(name) || 0;
        if (typeof current === 'string' && current.trimStart().startsWith('[')) {
          try { const parsed = JSON.parse(current); if (Array.isArray(parsed)) { parsed.push(value); service.set(name, JSON.stringify(parsed)); return parsed; } }
          catch (error) { console.warn(`ST variable ${type}.${name} array append failed`, error); }
        }
        const result = Number.isNaN(Number(value)) || Number.isNaN(Number(current)) ? String(current || '') + value : Number(current) + Number(value);
        service.set(name, result); return result;
      },
      inc: name => service.add(name, 1), dec: name => service.add(name, -1),
    };
    return service;
  }

  async function persistInjections() {
    const entries = [...injections.values()];
    const allowed = [];
    for (const entry of entries) {
      const { filter, ...plain } = entry;
      if (!filter || await filter()) allowed.push(plain);
    }
    await call('prompts.set', { entries: allowed });
  }
  function injectPrompts(entries, options = {}) {
    const scope = captured();
    for (const entry of entries) {
      if (entry.depth !== undefined && (!Number.isInteger(entry.depth) || entry.depth < 0)) throw new RangeError('Prompt depth must be a non-negative integer');
      injections.set(entry.id, { ...scope, ...entry, once: !!options.once });
    }
    enqueue(persistInjections);
    return { uninject: () => uninjectPrompts(entries.map(entry => entry.id)) };
  }
  function uninjectPrompts(ids) { ids.forEach(id => injections.delete(id)); enqueue(persistInjections); }
  function setExtensionPrompt(id, content, position = 1, depth = 0, scan = false, role = 0, filter = null) {
    const roles = ['system', 'user', 'assistant'];
    const anchors = { '-1': 'beforeLatestUserInput', 0: 'afterToolContext', 1: 'beforeLatestUserInput', 2: 'beforeToolContext' };
    if (!(position in anchors)) throw new Error(`Extension prompt position is not supported: ${position}`);
    if (!content) { uninjectPrompts([id]); return; }
    injectPrompts([{ id, content, anchor: anchors[position], position: position === -1 ? 'none' : 'in_chat', filter,
      role: typeof role === 'string' ? role : roles[role], ...(position === 1 ? { depth } : {}), should_scan: scan }]);
  }

  function generationAbortBinding(options) {
    const signal = options.signal || options.abortController?.signal;
    // ST's Slash controller dispatches events itself; the browser controller uses its signal.
    const target = typeof signal?.addEventListener === 'function' ? signal : options.abortController;
    if (signal && typeof target?.addEventListener !== 'function') throw new TypeError('Generation cancellation requires an AbortSignal or SlashCommandAbortController');
    return { signal, target };
  }
  async function generateRequest(options = {}, raw) {
    await readyPromise;
    const scope = { ...captured(), ...(options.conversationId ? {conversationId:options.conversationId} : {}), ...(options.characterId ? {characterId:options.characterId} : {}) };
    return inConversation(scope.conversationId, () => generateRequestInConversation(options, raw, scope), callbackConversationId);
  }
  async function generateRequestInConversation(options, raw, scope) {
    const selectedConnection = clone(requireState().connection || {});
    await flush();
    const id = options.generation_id || `generation-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const dryRun = options.dryRun === true;
    const { signal, target: abortTarget } = generationAbortBinding(options);
    let cancelled;
    const throwIfAborted = () => {
      if (cancelled) throw cancelled;
      if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new Error(signal.reason || 'Generation cancelled');
    };
    const abort = () => call('generation.cancel', { id }).catch(report);
    const controller = { owner: ownerKey, cancel() {
      cancelled = new Error(`Generation ID '${id}' has stopped`);
      activeGenerations.delete(id);
      abort();
    } };
    const closed = () => { if (helperGenerations.get(id) === controller) stopGenerationById(id); };
    if (!dryRun) { activeGenerations.add(id); helperGenerations.set(id, controller); cleanups.add(closed); }
    abortTarget?.addEventListener('abort', abort, { once: true });
    let full = '', fullReasoning = '', streamQueue = Promise.resolve(), streamError;
    const stop = dryRun ? () => {} : base.events.on('generation.delta', packet => {
      if (packet.id !== id) return;
      full += packet.delta || ''; fullReasoning += packet.reasoning || '';
      const text = full, reasoning = fullReasoning;
      streamQueue = streamQueue.then(async () => {
        if (packet.delta) {
          await eventEmit(iframe_events.STREAM_TOKEN_RECEIVED_INCREMENTALLY, packet.delta, id);
          await eventEmit(iframe_events.STREAM_TOKEN_RECEIVED_FULLY, text, id);
        }
        if (packet.reasoning) {
          await eventEmit(iframe_events.REASONING_TOKEN_RECEIVED_INCREMENTALLY, packet.reasoning, id);
          await eventEmit(iframe_events.REASONING_TOKEN_RECEIVED_FULLY, reasoning, id);
        }
      });
      streamQueue.catch(error => { streamError ||= error; abort(); });
    });
    try {
      throwIfAborted();
      await eventEmit(iframe_events.GENERATION_REQUESTED, id, raw ? 'generateRaw' : 'generate', options);
      throwIfAborted();
      if (!dryRun) await eventEmit(iframe_events.GENERATION_STARTED, id);
      const custom = options.custom_api || {};
      const resolvedCustom = { ...custom };
      const proxy = (extensionSettings.eleckoi_proxy_presets || []).find(value => value.name === custom.proxy_preset?.trim());
      if (proxy) Object.assign(resolvedCustom, { apiurl: proxy.url ?? proxy.apiurl ?? '', key: proxy.password ?? proxy.key ?? '' });
      const readImage = async value => {
        if (typeof value === 'string') return /^(data:|https?:|blob:)/.test(value) ? value : `data:image/png;base64,${value}`;
        if (typeof value?.arrayBuffer !== 'function') throw new TypeError('Image must be a File or string');
        const bytes = new Uint8Array(await value.arrayBuffer());
        let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
        return `data:${value.type || 'image/png'};base64,${global.btoa(binary)}`;
      };
      const withImages = async message => {
        if (!message.image) return message;
        const images = Array.isArray(message.image) ? message.image : [message.image];
        return { ...message, image: undefined, content: [ ...(Array.isArray(message.content) ? message.content : [{ type: 'text', text: message.content || '' }]),
          ...await Promise.all(images.map(async value => ({ type: 'image_url', image_url: { url: await readImage(value) } }))) ] };
      };
      const messages = options.messages, ordered = options.ordered_prompts;
      const userMessage = await withImages({ role: 'user', content: options.user_input ?? options.prompt ?? '', image: options.image });
      throwIfAborted();
      const request = { ...scope, id, raw, dryRun, tavernRequest: true, prompt: options.user_input ?? options.prompt ?? '', userContent: userMessage.content,
        ...(messages ? { messages: await Promise.all(messages.map(withImages)) } : {}),
        ...(ordered ? { ordered_prompts: await Promise.all(ordered.map(value => typeof value === 'string' ? value : withImages(value))) } : {}),
        custom_api: resolvedCustom, preset_name: options.preset_name, overrides: options.overrides, injects: options.injects, max_chat_history: options.max_chat_history,
        quietGenerate:options.quietGenerate, quietName:options.quietName, skipWIAN:options.skipWIAN, quietToLoud:options.quietToLoud,
        tools: options.tools, tool_choice: options.tool_choice, json_schema: options.json_schema,
        purpose: options.purpose || 'plugin', stream: options.should_stream ?? options.stream ?? false,
        configId: options.configId || custom.configId || selectedConnection.configId, model: options.model || custom.model || selectedConnection.model,
        ...(typeof options.responseLength === 'number' && options.responseLength > 0 ? {maxTokens:options.responseLength} : {}),
        responseFormat: options.responseFormat, parameters: options.parameters || {} };
      throwIfAborted();
      const result = await call(dryRun ? 'generation.preview' : 'generation.invoke', request);
      if (dryRun) return result;
      await streamQueue; if (streamError) throw streamError; throwIfAborted();
      await eventEmit(iframe_events.GENERATION_ENDED, result.content, id, result.reasoning);
      if (options.__eleckoiReturnEnvelope) return result;
      return options.should_return_reasoning || options.tools?.length || result.tool_calls?.length ? {
        content: result.content, reasoning: result.reasoning || '', tool_calls: result.tool_calls || [], signatures: result.signatures || [], ...(result.reasoning_signature ? { reasoning_signature: result.reasoning_signature } : {}),
      } : options.return_reasoning ? { text: result.content, reasoning: result.reasoning } : result.content;
    } finally {
      stop(); abortTarget?.removeEventListener('abort', abort); activeGenerations.delete(id); cleanups.delete(closed);
      if (helperGenerations.get(id) === controller) helperGenerations.delete(id);
    }
  }

  function stopGenerationById(id) {
    const controller = helperGenerations.get(id);
    if (!controller) return false;
    helperGenerations.delete(id);
    controller.cancel();
    eventEmit(tavern_events.GENERATION_STOPPED, id).catch(report);
    return true;
  }
  function stopAllGeneration() {
    for (const id of [...helperGenerations.keys()]) stopGenerationById(id);
    return true;
  }

  async function getWorldbook(name) {
    const document = await call('worldbooks.get', { name });
    const entries = Array.isArray(document.entries) ? document.entries : Object.values(document.entries || {});
    return normalizeWorldbook(entries).map(entry => ({ ...entry, strategy: { ...entry.strategy,
      keys: entry.strategy.keys.map(restoreRegex), keys_secondary: { ...entry.strategy.keys_secondary, keys: entry.strategy.keys_secondary.keys.map(restoreRegex) } } }));
  }
  const worldbookPositions = ['before_character_definition', 'after_character_definition', 'before_author_note', 'after_author_note', 'at_depth', 'before_example_messages', 'after_example_messages', 'outlet'];
  const worldbookRoles = ['system', 'user', 'assistant'];
  const worldbookLogic = ['and_any', 'not_all', 'not_any', 'and_all'];
  function serializeRegex(value) { return Object.prototype.toString.call(value) === '[object RegExp]' ? value.toString() : String(value); }
  function restoreRegex(value) { const match = /^\/([\s\S]*)\/([a-z]*)$/.exec(value); return match ? new global.RegExp(match[1], match[2]) : value; }
  function normalizeWorldbook(entries) {
    const used = new Set(); let next = 0;
    return entries.map((source, index) => {
      let uid = source.uid;
      if (!Number.isInteger(uid) || used.has(uid)) { while (used.has(next)) next++; uid = next++; }
      used.add(uid);
      const strategy = source.strategy || {}, secondary = strategy.keys_secondary || {};
      const position = typeof source.position === 'object' ? source.position : {};
      const raw = ['constant', 'vectorized', 'key', 'keys', 'trigger_mode'].some(key => Object.hasOwn(source, key));
      const type = strategy.type || (raw ? source.constant || source.trigger_mode === 'always' ? 'constant' : source.vectorized ? 'vectorized' : 'selective' : 'constant');
      return { ...source, uid, name: source.name ?? source.comment ?? source.title ?? '', enabled: source.enabled ?? !source.disable,
        strategy: { ...strategy, type, keys: (strategy.keys || source.key || source.keys || source.keywords || []).map(serializeRegex),
          keys_secondary: { ...secondary, logic: secondary.logic || worldbookLogic[source.selectiveLogic || 0],
            keys: (secondary.keys || source.keysecondary || source.condition_keywords || []).map(serializeRegex) },
          scan_depth: strategy.scan_depth ?? source.scanDepth ?? source.keyword_scan_depth ?? 'same_as_global' },
        position: { ...position, type: position.type || worldbookPositions[source.position] || 'at_depth', role: position.role || source.insert_role || worldbookRoles[source.role || 0] || 'system',
          depth: position.depth ?? source.depth ?? 4, order: position.order ?? source.order ?? 100 },
        content: source.content || '', probability: source.useProbability === false ? 100 : source.probability ?? 100,
        recursion: { prevent_incoming: source.excludeRecursion || false, prevent_outgoing: source.preventRecursion || false,
          delay_until: source.delayUntilRecursion === true ? 1 : typeof source.delayUntilRecursion === 'number' && source.delayUntilRecursion > 0 ? source.delayUntilRecursion : null, ...source.recursion },
        effect: { sticky: source.sticky || null, cooldown: source.cooldown || null, delay: source.delay || null, ...source.effect },
      };
    });
  }
  function rawWorldbookEntry(source,world) {
    const entry=normalizeWorldbook([source])[0],strategy=entry.strategy,position=entry.position;
    const raw={...entry,world,comment:entry.name,disable:!entry.enabled,constant:strategy.type==='constant',vectorized:strategy.type==='vectorized',
      key:strategy.keys,keysecondary:strategy.keys_secondary.keys,selectiveLogic:worldbookLogic.indexOf(strategy.keys_secondary.logic),
      scanDepth:strategy.scan_depth==='same_as_global'?null:strategy.scan_depth,
      position:worldbookPositions.indexOf(position.type),role:worldbookRoles.indexOf(position.role),depth:position.depth,order:position.order,
      excludeRecursion:entry.recursion.prevent_incoming,preventRecursion:entry.recursion.prevent_outgoing,delayUntilRecursion:entry.recursion.delay_until,
      sticky:entry.effect.sticky,cooldown:entry.effect.cooldown,delay:entry.effect.delay};
    for(const key of ['strategy','recursion','effect','name','enabled'])delete raw[key];
    return raw;
  }
  shared.forcedWorldbookEntries ||= new Map();
  shared.worldbookScanContexts ||= new Map();
  eventOn(tavern_events.WORLDINFO_FORCE_ACTIVATE,entries=>{
    if(!Array.isArray(entries))throw new TypeError('WORLDINFO_FORCE_ACTIVATE requires an entry array');
    for(const entry of entries){
      if(typeof entry.world!=='string' || !Number.isInteger(entry.uid))throw new TypeError('Forced worldbook entries require world and integer uid');
      shared.forcedWorldbookEntries.set(`${entry.world}:${entry.uid}`,{entry:clone(entry),revision:shared.forcedWorldbookRevision=(shared.forcedWorldbookRevision || 0)+1});
    }
  });
  global.__ElecKoiPrepareWorldbooks = async payload => {
    try {
      const result=await inConversation(payload.conversationId,async()=>{
        const groups={};
        for(const [scope,names]of Object.entries(payload.scopes))groups[scope]=names.flatMap(name=>{
          const book=payload.books[name];return book ? normalizeWorldbook(Array.isArray(book.entries)?book.entries:Object.values(book.entries || {})).map(entry=>rawWorldbookEntry(entry,name)) : [];
        });
        await emitEntries(tavern_events.WORLDINFO_ENTRIES_LOADED,[groups],undefined,undefined,payload.conversationId);
        const sort=entries=>[...entries].sort((a,b)=>(b.order ?? 100)-(a.order ?? 100));
        const strategy=requireState().worldbooks?.settings?.insertion_strategy || 'character_first';
        const sharedLore=strategy==='character_first' ? [...sort(groups.characterLore || []),...sort(groups.globalLore || [])]
          : strategy==='global_first' ? [...sort(groups.globalLore || []),...sort(groups.characterLore || [])]
          : sort([...(groups.globalLore || []),...(groups.characterLore || [])]);
        const orderedKeys=[...sort(groups.chatLore || []),...sort(groups.personaLore || []),...sharedLore].map(entry=>`${entry.world}:${entry.uid}`);
        const books={...clone(payload.books)};
        for(const name of Object.keys(books))books[name].entries=[];
        const seen=new Set();
        for(const entries of Object.values(groups))for(const raw of entries){
          if(typeof raw.world!=='string')throw new TypeError('Worldbook entries require their source world name');
          if(!Object.hasOwn(books,raw.world))books[raw.world]={name:raw.world,entries:[]};
          const key=`${raw.world}:${raw.uid}`;if(seen.has(key))continue;seen.add(key);
          books[raw.world].entries.push(raw);
        }
        for(const book of Object.values(books))book.entries=normalizeWorldbook(book.entries);
        const forced=Object.fromEntries([...shared.forcedWorldbookEntries].map(([key,value])=>[key,value.entry]));
        const forceVersions=Object.fromEntries([...shared.forcedWorldbookEntries].map(([key,value])=>[key,value.revision]));
        await flush();return {books,forced,forceVersions,orderedKeys};
      });
      await call('plugins.hookResult',{token:payload.token,result});
    } catch(error){report(error);await call('plugins.hookResult',{token:payload.token,error:String(error)});}
  };
  global.__ElecKoiCompleteWorldbookScan = async payload=>{
    try {
      const scan=shared.worldbookScanContexts.get(payload.scanId);
      if(scan){scan.timedEffects.cleanUp();shared.worldbookScanContexts.delete(payload.scanId);}
      if(payload.completed!==false && (!payload.dryRun || payload.consumeForcedOnDryRun))for(const [key,revision]of Object.entries(payload.forceVersions))
        if(shared.forcedWorldbookEntries.get(key)?.revision===revision)shared.forcedWorldbookEntries.delete(key);
      if(payload.completed!==false && !payload.dryRun && payload.activatedEntries?.length)
        await emitEntries(tavern_events.WORLD_INFO_ACTIVATED,[payload.activatedEntries.map(entry=>rawWorldbookEntry(entry,entry.world))],undefined,undefined,payload.conversationId);
      await call('plugins.hookResult',{token:payload.token});
    }catch(error){report(error);await call('plugins.hookResult',{token:payload.token,error:String(error)});}
  };
  global.__ElecKoiWorldbookScanLoop = async payload=>{
    try {
      const result=await inConversation(payload.conversationId,async()=>{
        let scan=shared.worldbookScanContexts.get(payload.scanId);
        const references=scan?.references || new Map();
        const raw=entry=>{
          const value=rawWorldbookEntry(entry,entry.world),key=`${entry.world}.${entry.uid}:${entry.hash || ''}`;
          const previous=references.get(key);
          if(previous){Object.assign(previous,value);return previous;}
          references.set(key,value);return value;
        };
        const sortedEntries=payload.sortedEntries.map(raw);
        const metadata={sticky:{},cooldown:{},delay:{}};
        for(const entry of sortedEntries){
          const timing=payload.timedState[`${entry.world}:${entry.uid}`];
          for(const type of ['sticky','cooldown','delay'])if(timing?.[type])metadata[type][`${entry.world}.${entry.uid}`]={...timing[type],hash:timing[type].hash ?? timing.hash};
        }
        if(!scan){
          const entries=sortedEntries;
          const timedEffects=st.createWorldbookTimedEffects(Array(payload.messageCount).fill(''),entries,payload.dryRun,metadata);
          timedEffects.checkTimedEffects();scan={entries,metadata,timedEffects,references};shared.worldbookScanContexts.set(payload.scanId,scan);
        }else{
          scan.entries.splice(0,scan.entries.length,...sortedEntries);
          reconcileSharedObject(scan.metadata,clone(scan.metadata),metadata,'worldbookTimedEffects');
        }
        const args={state:clone(payload.state),new:{all:payload.new.all.map(raw),successful:payload.new.successful.map(raw)},
          activated:{entries:new Map(payload.activated.entries.map(([key,entry])=>[key,raw(entry)])),text:payload.activated.text},
          sortedEntries:scan.entries,recursionDelay:clone(payload.recursionDelay),budget:clone(payload.budget),timedEffects:scan.timedEffects};
        await emitEntries(tavern_events.WORLDINFO_SCAN_DONE,[args],undefined,undefined,payload.conversationId);
        if(Object.prototype.toString.call(args.activated.entries)!=='[object Map]')throw new TypeError('WORLDINFO_SCAN_DONE activated.entries must remain a Map');
        const timedState={...payload.timedState};
        for(const entry of args.sortedEntries){
          const key=`${entry.world}:${entry.uid}`,entryKey=`${entry.world}.${entry.uid}`;
          const timing={...(timedState[key] || {}),hash:entry.hash};
          for(const type of ['sticky','cooldown','delay']){
            if(scan.metadata[type]?.[entryKey])timing[type]=scan.metadata[type][entryKey];else delete timing[type];
          }
          if(Object.keys(timing).length>1)timedState[key]=timing;else delete timedState[key];
        }
        await flush();return {state:args.state,new:args.new,activated:{entries:[...args.activated.entries],text:args.activated.text},
          sortedEntries:args.sortedEntries,recursionDelay:args.recursionDelay,budget:args.budget,timedState};
      });
      await call('plugins.hookResult',{token:payload.token,result});
    }catch(error){report(error);await call('plugins.hookResult',{token:payload.token,error:String(error)});}
  };
  global.__ElecKoiMatchWorldbookEntries = async payload=>{
    try {
      const result=await inConversation(payload.conversationId,async()=>{
        const matcher=st.createWorldbookMatcher(payload.settings);
        const evaluate=()=>payload.entries.map(row=>{
          const entry=rawWorldbookEntry(row.entry,row.entry.world);
          const scoreEntry=rawWorldbookEntry(row.scoreEntry,row.entry.world);
          const match=key=>{
            const expanded=substituteMacros(key);
            if(!expanded)return false;
            if(entry.keyword_use_regex)return new RegExp(expanded.trim(),entry.keyword_ignore_case===false?'':'i').test(row.text);
            return matcher.matchKeys(row.text,expanded.trim(),entry);
          };
          let matched=row.immediate;
          if(!matched && entry.key.some(match)) {
            const secondary=entry.keysecondary;
            matched=entry.selective===false || !secondary.length || (entry.selectiveLogic===3 ? secondary.every(match)
              : entry.selectiveLogic===1 ? secondary.some(key=>!match(key)) : entry.selectiveLogic===2 ? !secondary.some(match) : secondary.some(match));
          }
          return {key:row.key,matched,score:matcher.score(row.text,scoreEntry)};
        });
        st.sync();const matches=payload.dryRun ? st.withReadOnlyEvaluation(evaluate) : evaluate();
        await flush();return matches;
      });
      await call('plugins.hookResult',{token:payload.token,result});
    }catch(error){report(error);await call('plugins.hookResult',{token:payload.token,error:String(error)});}
  };
  global.__ElecKoiFormatWorldbookEntries = async payload=>{
    try {
      const result=await inConversation(payload.conversationId,async()=>{
        const evaluate=()=>payload.entries.map(row=>{
          const entry=rawWorldbookEntry(row.entry,row.entry.world);
          return {key:row.key,content:st.getRegexedString(entry.content,st.regex_placement.WORLD_INFO,
            {depth:entry.position===4 ? entry.depth ?? 4 : null,isMarkdown:false,isPrompt:true})};
        });
        st.sync();const entries=payload.dryRun ? st.withReadOnlyEvaluation(evaluate) : evaluate();
        await flush();return entries;
      });
      await call('plugins.hookResult',{token:payload.token,result});
    }catch(error){report(error);await call('plugins.hookResult',{token:payload.token,error:String(error)});}
  };
  async function replaceWorldbook(name, entries) {
    const previous = await call('worldbooks.get', { name });
    await call('worldbooks.put', { name, book: { ...previous, entries: normalizeWorldbook(entries) } });
    await refresh();
    await eventEmit(tavern_events.WORLDINFO_UPDATED, name, await getWorldbook(name));
  }
  async function createWorldbook(name, entries = []) {
    // Upstream runtime returns false without replacing an existing book.
    if (helpers.getWorldbookNames().includes(name)) return false;
    return createOrReplaceWorldbook(name, entries);
  }
  async function createOrReplaceWorldbook(name, entries = []) {
    const created = !helpers.getWorldbookNames().includes(name);
    const previous = created ? {} : await call('worldbooks.get', { name });
    await call('worldbooks.put', { name, book: { ...previous, name, entries: normalizeWorldbook(entries) } });
    await refresh();
    return created;
  }
  async function updateWorldbookWith(name, updater) { const entries = await updater(await getWorldbook(name)); await replaceWorldbook(name, entries); return getWorldbook(name); }
  async function createWorldbookEntries(name, entries) {
    const old = await getWorldbook(name), combined = normalizeWorldbook([...old, ...entries]);
    await replaceWorldbook(name, combined);
    const worldbook = await getWorldbook(name);
    return { worldbook, new_entries: worldbook.slice(old.length) };
  }
  async function deleteWorldbookEntries(name, predicate) {
    const old = await getWorldbook(name), removed = old.filter(predicate);
    const ids = new Set(removed.map(entry => entry.uid));
    await replaceWorldbook(name, old.filter(entry => !ids.has(entry.uid)));
    return { worldbook: await getWorldbook(name), deleted_entries: removed };
  }
  function toLorebook(entry, index) {
    const position = entry.position.type === 'at_depth' ? `at_depth_as_${entry.position.role}` : entry.position.type;
    return { ...entry, comment: entry.name, display_index: entry.displayIndex ?? index, type: entry.strategy.type, position,
      depth: entry.position.type === 'at_depth' ? entry.position.depth : null, order: entry.position.order, keys: entry.strategy.keys.map(serializeRegex),
      key: entry.strategy.keys.map(serializeRegex), logic: entry.strategy.keys_secondary.logic, filters: entry.strategy.keys_secondary.keys.map(serializeRegex),
      filter: entry.strategy.keys_secondary.keys.map(serializeRegex), scan_depth: entry.strategy.scan_depth,
      case_sensitive: entry.caseSensitive ?? 'same_as_global', match_whole_words: entry.matchWholeWords ?? 'same_as_global',
      use_group_scoring: entry.useGroupScoring ?? 'same_as_global', automation_id: entry.automationId || null,
      exclude_recursion: entry.recursion.prevent_incoming, prevent_recursion: entry.recursion.prevent_outgoing,
      delay_until_recursion: entry.recursion.delay_until ?? 0, group: entry.group || entry.extra?.group || '',
      group_prioritized: entry.groupOverride ?? entry.extra?.groupOverride ?? false, group_weight: entry.groupWeight ?? entry.extra?.groupWeight ?? 100,
      sticky: entry.effect.sticky, cooldown: entry.effect.cooldown, delay: entry.effect.delay };
  }
  function fromLorebook(entry) {
    const defaultPosition = entry.position || 'before_character_definition';
    const atDepth = typeof defaultPosition === 'string' && defaultPosition.startsWith('at_depth_as_');
    const resolveGlobal = value => value === 'same_as_global' || value === undefined ? null : value;
    return { ...entry, name: entry.comment || '', strategy: { type: entry.type || 'selective', keys: entry.keys || entry.key || [],
      keys_secondary: { logic: entry.logic || 'and_any', keys: entry.filters || entry.filter || [] }, scan_depth: entry.scan_depth ?? 'same_as_global' },
      position: { type: atDepth ? 'at_depth' : defaultPosition, role: atDepth ? defaultPosition.slice('at_depth_as_'.length) : 'system', depth: entry.depth ?? 4, order: entry.order ?? 100 },
      recursion: { prevent_incoming: entry.exclude_recursion || false, prevent_outgoing: entry.prevent_recursion || false,
        delay_until: typeof entry.delay_until_recursion === 'number' ? entry.delay_until_recursion : entry.delay_until_recursion ? 1 : null },
      effect: { sticky: entry.sticky || null, cooldown: entry.cooldown || null, delay: entry.delay || null },
      caseSensitive: resolveGlobal(entry.case_sensitive), matchWholeWords: resolveGlobal(entry.match_whole_words), useGroupScoring: resolveGlobal(entry.use_group_scoring),
      group: entry.group || '', groupOverride: entry.group_prioritized || false, groupWeight: entry.group_weight ?? 100,
      displayIndex: entry.display_index, automationId: entry.automation_id || '' };
  }
  async function getLorebookEntries(name, { filter = 'none' } = {}) {
    const entries = (await getWorldbook(name)).map(toLorebook);
    return filter === 'none' ? entries : entries.filter(entry => Object.entries(filter).every(([field, expected]) => {
      const value = entry[field];
      if (Array.isArray(value)) return expected.every(item => value.includes(item));
      if (typeof value === 'string') return value.includes(expected);
      return value === expected;
    }));
  }
  async function replaceLorebookEntries(name, entries) { await replaceWorldbook(name, entries.map(fromLorebook)); }
  async function updateLorebookEntriesWith(name, updater) { await replaceLorebookEntries(name, await updater(await getLorebookEntries(name))); return getLorebookEntries(name); }
  async function setLorebookEntries(name, patches) {
    return updateLorebookEntriesWith(name, entries => entries.map(entry => ({ ...entry, ...patches.find(patch => patch.uid === entry.uid) })));
  }
  async function createLorebookEntries(name, entries) {
    const result = await createWorldbookEntries(name, entries.map(entry => { const value = fromLorebook(entry); delete value.uid; return value; }));
    return { entries: result.worldbook.map(toLorebook), new_uids: result.new_entries.map(entry => entry.uid) };
  }
  async function deleteLorebookEntries(name, uids) {
    const result = await deleteWorldbookEntries(name, entry => uids.includes(entry.uid));
    return { entries: result.worldbook.map(toLorebook), delete_occurred: result.deleted_entries.length > 0 };
  }

  function substituteMacros(text, options = {}) {
    requireState();
    if (!st) throw new Error('Tavern runtime is not loaded');
    return st.substitute(text, options);
  }
  const tokenizerIds = Object.freeze({ NONE: 0, GPT2: 1, OPENAI: 2, LLAMA: 3, NERD: 4, NERD2: 5, API_CURRENT: 6, MISTRAL: 7, YI: 8,
    API_TEXTGENERATIONWEBUI: 9, API_KOBOLD: 10, CLAUDE: 11, LLAMA3: 12, GEMMA: 13, JAMBA: 14, QWEN2: 15, COMMAND_R: 16, NEMO: 17, DEEPSEEK: 18, COMMAND_A: 19, BEST_MATCH: 99 });
  function tokenizerRuntime() {
    const runtime = global.__ElecKoiTokenizers;
    if (!runtime) throw new Error('Tokenizer runtime is not loaded');
    return runtime;
  }
  function tokenizerSelection() {
    const snapshot = requireState(), settings = context.__eleckoiCompletionSettings(context.mainApi);
    const capability = name => {
      const session = global.sessionStorage?.getItem(name);
      // ST's live session observations override the durable API-owned capability.
      // A fresh shared host has no observation yet and must retain saved settings.
      return session == null ? !!settings[name] : !!session;
    };
    return {mainApi:context.mainApi,chatCompletionSettings:st.oai_settings,textCompletionSettings:{...settings,openrouter_model:settings.openrouter_model || snapshot.model},
      novelSettings:{model_novel:settings.model_novel || snapshot.model || ''},textModel:snapshot.model || '',onlineStatus:context.onlineStatus,
      modelList:snapshot.connection?.models || [],textModels:extensionSettings.eleckoi_text_models || snapshot.connection?.models || [],
      dreamGenModels:extensionSettings.eleckoi_dreamgen_models || [],
      tokenizerWarning:capability('tokenizationWarningShown'),tokenizerSupported:capability('tokenizationSupported'),
      koboldCanTokenize:!!settings.can_use_tokenization};
  }
  function tokenizerEncoding(type = extensionSettings.power_user?.tokenizer ?? (context.mainApi === 'openai' ? tokenizerIds.OPENAI : tokenizerIds.BEST_MATCH)) {
    if (type === tokenizerIds.BEST_MATCH && context.mainApi !== 'openai') type = st.resolveTokenizerType(tokenizerSelection());
    if (type === tokenizerIds.API_CURRENT) type = context.mainApi === 'kobold' ? tokenizerIds.API_KOBOLD
      : context.mainApi === 'textgenerationwebui' ? tokenizerIds.API_TEXTGENERATIONWEBUI : tokenizerIds.NONE;
    if (typeof type === 'string') return type;
    if (type === tokenizerIds.NONE || type === tokenizerIds.API_CURRENT) return 'estimate';
    if (type === tokenizerIds.API_TEXTGENERATIONWEBUI) return 'remote-textgenerationwebui';
    if (type === tokenizerIds.API_KOBOLD) return 'remote-kobold';
    if (type === tokenizerIds.GPT2) return 'r50k_base';
    const models = { [tokenizerIds.LLAMA]:'llama', [tokenizerIds.NERD]:'nerdstash', [tokenizerIds.NERD2]:'nerdstash_v2',
      [tokenizerIds.MISTRAL]:'mistral', [tokenizerIds.YI]:'yi', [tokenizerIds.CLAUDE]:'claude', [tokenizerIds.LLAMA3]:'llama3',
      [tokenizerIds.GEMMA]:'gemma', [tokenizerIds.JAMBA]:'jamba', [tokenizerIds.QWEN2]:'qwen2', [tokenizerIds.COMMAND_R]:'command-r',
      [tokenizerIds.COMMAND_A]:'command-a', [tokenizerIds.NEMO]:'nemo', [tokenizerIds.DEEPSEEK]:'deepseek' };
    if (models[type]) return models[type];
    if ([tokenizerIds.OPENAI, tokenizerIds.BEST_MATCH].includes(type)) return tokenizerRuntime().encodingForModel(context.getTokenizerModel());
    throw new Error(`Tokenizer ${type} requires its own vocabulary or provider endpoint`);
  }
  function remoteTokenizerOptions(text, encoding) {
    const snapshot = requireState();
    return { text, type: encoding === 'remote-kobold' ? 'kobold' : context.__eleckoiCompletionSettings(context.mainApi).type || 'ooba',
      configId: snapshot.connection?.configId || snapshot.connection?.id || snapshot.configId, model: snapshot.model };
  }
  function remoteTokenize(text, encoding) {
    const adapter = global.__ElecKoiHostAdapter;
    if (!adapter?.tokenizeSync) throw new Error('Synchronous provider tokenizer adapter is unavailable');
    return adapter.tokenizeSync(remoteTokenizerOptions(text, encoding));
  }
  function countTokens(text, encoding) {
    return encoding.startsWith('remote-') ? text ? remoteTokenize(text, encoding).count : 0 : tokenizerRuntime().count(text, encoding);
  }
  function tavernTokenCountRequest(text, padding) {
    if (typeof text !== 'string' || !text.length) return null;
    if (context.mainApi === 'openai') {
      if (padding === (extensionSettings.power_user?.token_padding ?? 64)) return { encoding: 'estimate', padding, overhead: 0 };
      const model = context.getTokenizerModel(), encoding = tokenizerRuntime().encodingForModel(model);
      // ST counts a single {content:text} message with full=true, including the chat envelope.
      const overhead = /_base$|_edit$/.test(encoding) ? String(model).includes('gpt-3.5-turbo-0301') ? 16 : 6 : 0;
      return { encoding, padding: 0, overhead };
    }
    return { encoding: tokenizerEncoding(), padding: padding ?? 0, overhead: 0 };
  }
  function tokenChunks(ids, encoding) {
    if (!['claude','llama3','command-r','command-a','qwen2','nemo','deepseek'].includes(encoding)) return ids.map(id => tokenizerRuntime().decode([id], encoding));
    const chunks = [];
    for (let i = 0, processed = 0; i < ids.length; i++) {
      const text = tokenizerRuntime().decode(ids.slice(processed, i + 1), encoding);
      if (text === '\ufffd') continue;
      chunks.push(text); processed = i + 1;
    }
    return chunks;
  }
  function registerMacro(name, value) {
    macros.set(name, value);
    st.macros.registry.registerMacro(name, { handler: () => typeof value === 'function' ? value(st.uuidv4()) : value });
    enqueue(() => call('macros.register', { name, value: typeof value === 'function' ? String(value()) : String(value) }));
    return () => { macros.delete(name); st.macros.registry.unregisterMacro(name); enqueue(() => call('macros.unregister', { name })); };
  }
  function unregisterMacroLike(regex) {
    const key = regex.source, registration = shared.macroLikeRegistrations?.get(key);
    if (registration) {
      st.macros.engine.removePreProcessor(registration.handler);
      const bus = shared.stRegistrations;
      if (bus) bus.operations = bus.operations.filter(operation =>
        !(['addPreProcessor', 'removePreProcessor'].includes(operation.method) && operation.args[0] === registration.handler));
      shared.macroLikeRegistrations.delete(key);
    }
    macroLikes.delete(key);
  }
  function registerMacroLike(regex, replace) {
    if (!regex || typeof regex.source !== 'string' || typeof replace !== 'function') throw new TypeError('registerMacroLike requires a RegExp and callback');
    shared.macroLikeRegistrations ||= new Map();
    const key = regex.source;
    const unregister = () => unregisterMacroLike(regex);
    cleanups.add(unregister);
    if (shared.macroLikeRegistrations.has(key)) return { unregister };
    const handler = text => {
      const messageId = global.__ElecKoiCurrentMessageId;
      const index = messageId === undefined ? undefined : indexOf(messageId);
      const context = { message_id: index, role: index === undefined ? undefined : requireState().messages[index].role };
      return text.replace(new RegExp(regex.source, regex.flags), (...args) => replace(context, ...args));
    };
    macroLikes.set(key, handler);
    shared.macroLikeRegistrations.set(key, { handler });
    st.macros.engine.addPreProcessor(handler, { source: `plugin:${pluginId}` });
    return { unregister };
  }
  function connectSharedRegistrations() {
    const registry = st.macros.registry, engine = st.macros.engine, parser = st.SlashCommandParser, tools = st.ToolManager;
    const bus = shared.stRegistrations ||= { realms: new Map(), operations: [] };
    bus.toolVersions ||= new Map();
    if (bus.realms.has(ownerKey)) return;
    const builtinMacros = registry.getAllMacros({ excludeAliases: true });
    const builtinCommands = { ...parser.commands };
    const methods = {
      registerMacro: registry.registerMacro.bind(registry), registerMacroAlias: registry.registerMacroAlias.bind(registry),
      unregisterMacro: registry.unregisterMacro.bind(registry),
      addPreProcessor: engine.addPreProcessor.bind(engine), removePreProcessor: engine.removePreProcessor.bind(engine),
      addPostProcessor: engine.addPostProcessor.bind(engine), removePostProcessor: engine.removePostProcessor.bind(engine),
      addCommandObject: parser.addCommandObject.bind(parser), addCommandObjectUnsafe: parser.addCommandObjectUnsafe.bind(parser),
      registerFunctionTool: tools.registerFunctionTool.bind(tools), unregisterFunctionTool: tools.unregisterFunctionTool.bind(tools),
      addFormattingHook: st.MessageFormatter.addHook.bind(st.MessageFormatter),
    };
    let commandApplicationDepth = 0;
    function apply(operation) {
      const { method, args } = operation;
      if (method === 'addCommandObject' || method === 'addCommandObjectUnsafe') {
        commandApplicationDepth++;
        try { return methods[method](operation.owner === ownerKey ? args[0] : st.SlashCommand.fromProps(args[0])); }
        finally { commandApplicationDepth--; }
      }
      if (method === 'removeCommand') {
        for (const name of args[0]) if (parser.commands[name]?.callback === args[1]) delete parser.commands[name];
        return;
      }
      return methods[method](...args);
    }
    const receiver = { apply, reset: operations => {
      for (const operation of operations) {
        if (operation.method === 'registerMacro' || operation.method === 'unregisterMacro') methods.unregisterMacro(operation.args[0]);
        if (operation.method === 'registerMacroAlias') methods.unregisterMacro(operation.args[1]);
        if (operation.method === 'registerFunctionTool') methods.unregisterFunctionTool(operation.args[0].name);
        if (operation.method === 'addPreProcessor') methods.removePreProcessor(operation.args[0]);
        if (operation.method === 'addPostProcessor') methods.removePostProcessor(operation.args[0]);
        if (operation.method === 'addFormattingHook') st.MessageFormatter.removeHook(operation.args[0]);
      }
      for (const definition of registry.getAllMacros()) methods.unregisterMacro(definition.name);
      for (const definition of builtinMacros) methods.registerMacro(definition.name, { ...definition, unnamedArgs: definition.unnamedArgDefs, list: definition.list ? { min: definition.list.min, ...(definition.list.max === null ? {} : { max: definition.list.max }) } : false });
      for (const name of Object.keys(parser.commands)) if (!Object.hasOwn(builtinCommands, name)) delete parser.commands[name];
      Object.assign(parser.commands, builtinCommands);
    }, dispose: () => {
      const previous = bus.operations;
      bus.operations = previous.filter(value => value.owner !== ownerKey); bus.realms.delete(ownerKey);
      for (const [id, value] of bus.toolVersions) if (value.owner === ownerKey) bus.toolVersions.delete(id);
      for (const realm of bus.realms.values()) { realm.reset(previous); for (const operation of bus.operations) realm.apply(operation); }
    } };
    bus.realms.set(ownerKey, receiver);
    for (const operation of bus.operations) apply(operation);
    function broadcast(method, args) {
      const operation = { method, args, owner: ownerKey }, result = apply(operation);
      if ((method === 'registerMacro' && result === null) || (method === 'registerMacroAlias' && result === false)) return result;
      bus.operations.push(operation);
      for (const [owner, realm] of bus.realms) if (owner !== ownerKey) realm.apply(operation);
      return result;
    }
    for (const method of ['registerMacro', 'registerMacroAlias', 'unregisterMacro']) registry[method] = (...args) => broadcast(method, args);
    for (const method of ['addPreProcessor', 'removePreProcessor', 'addPostProcessor', 'removePostProcessor']) engine[method] = (...args) => broadcast(method, args);
    parser.addCommandObject = command => broadcast('addCommandObject', [command]);
    parser.addCommandObjectUnsafe = command => commandApplicationDepth
      ? methods.addCommandObjectUnsafe(command) : broadcast('addCommandObjectUnsafe', [command]);
    parser.removeCommandObject = command => broadcast('removeCommand', [[command.name, ...(command.aliases || [])], command.callback]);
    tools.registerFunctionTool = (...args) => {
      const definition = typeof args[0] === 'object' ? args[0] : { name: args[0], description: args[1], parameters: args[2], action: args[3] };
      const id = st.uuidv4();
      const version = { id, owner: ownerKey, name: definition.name,
        eligible: conversationId => inConversation(conversationId, () => typeof definition.shouldRegister === 'function' ? definition.shouldRegister() : true),
        invokeRaw: (conversationId, parameters, signal) => inConversation(conversationId, async () => {
          const result = await definition.action(parameters, { conversationId, signal });
          await flush(); return result;
        }),
        invoke: async (conversationId, parameters, signal) => {
          try {
            const input = parameters === '' ? {} : typeof parameters === 'string' ? JSON.parse(parameters) : parameters;
            const result = await version.invokeRaw(conversationId, input, signal);
            return typeof result === 'string' ? result : JSON.stringify(result);
          } catch (error) {
            report(error);
            if (error instanceof Error) { error.cause = definition.name; return error; }
            return new Error('Unknown error occurred while invoking the tool.', { cause: definition.name });
          }
        } };
      bus.toolVersions.set(id, version);
      broadcast('registerFunctionTool', [{ ...definition, __eleckoiVersion: id,
        action: parameters => version.invokeRaw(captured().conversationId, parameters) }]);
    };
    tools.unregisterFunctionTool = name => broadcast('unregisterFunctionTool', [name]);
    const originalInvokeTool = tools.invokeFunctionTool.bind(tools);
    tools.invokeFunctionTool = (name, parameters) => {
      const latest = bus.operations.findLast(value => ['registerFunctionTool', 'unregisterFunctionTool'].includes(value.method)
        && (value.method === 'registerFunctionTool' ? value.args[0].name : value.args[0]) === name);
      const version = latest?.method === 'registerFunctionTool' && bus.toolVersions.get(latest.args[0].__eleckoiVersion);
      return version ? version.invoke(captured().conversationId, parameters) : originalInvokeTool(name, parameters);
    };
    st.MessageFormatter.addHook = (...args) => broadcast('addFormattingHook', args);
    context.macros.register = registry.registerMacro.bind(registry); context.macros.registerAlias = registry.registerMacroAlias.bind(registry);
    cleanups.add(receiver.dispose);
  }
  function errorCatched(fn) {
    if (typeof fn !== 'function') throw new TypeError('errorCatched requires a function');
    const fail = error => { report(error); global.toastr?.error(String(error.message || error), error.name || 'Plugin error'); throw error; };
    return function (...args) {
      try { const result = fn.apply(this, args); return result?.then ? result.catch(fail) : result; }
      catch (error) { return fail(error); }
    };
  }
  function scriptLocation({ type } = {}) {
    if (!['global', 'preset', 'character'].includes(type)) throw new Error(`Unknown script tree scope: ${type}`);
    const scope = captured(), key = type === 'global' ? type : `${type}:${type === 'preset' ? scope.presetId : scope.characterId}`;
    let record = shared.scriptTrees.get(key);
    if (!record) { record = { trees: clone(requireState().scripts?.[type] || []), committed: clone(requireState().scripts?.[type] || []) }; shared.scriptTrees.set(key, record); }
    return { record, type, scope };
  }
  function getScriptTrees(options) { return clone(scriptLocation(options).record.trees); }
  function normalizeScriptTree(value) {
    const tree = { type: 'script', id: st.uuidv4(), enabled: true, name: '', ...clone(value) };
    if (tree.type === 'folder') return { icon: '', color: '', ...tree, scripts: (tree.scripts || []).map(normalizeScriptTree) };
    if (tree.type !== 'script') throw new Error(`Unknown script tree type: ${tree.type}`);
    return { content: '', info: '', data: {}, export_with: { data: true, button: true }, ...tree,
      button: { enabled: true, ...tree.button, buttons: (tree.button?.buttons || []).map(value => ({ visible: true, ...value })) } };
  }
  function replaceScriptTrees(trees, options) {
    const { record, type, scope } = scriptLocation(options), previous = record.trees;
    record.trees = trees.map(normalizeScriptTree); const value = clone(record.trees);
    enqueue(async () => { record.committed = await call('scripts.replace', { ...scope, type, trees: value }); }, () => { if (sameValue(record.trees, value)) record.trees = previous; });
  }
  function updateScriptTreesWith(updater, options) {
    const apply = value => { replaceScriptTrees(value, options); return getScriptTrees(options); };
    const result = updater(getScriptTrees(options)); return result?.then ? result.then(apply) : apply(result);
  }
  function scriptRecords() {
    return ['global', 'preset', 'character'].flatMap(type => getScriptTrees({ type }).flatMap(tree => tree.type === 'folder'
      ? tree.scripts.map(script => ({ type, script, enabled: tree.enabled && script.enabled })) : [{ type, script: tree, enabled: tree.enabled }]));
  }
  function ownScript() {
    const entry = scriptRecords().find(value => value.script.id === pluginId);
    if (entry) return entry;
    const manifest = requireState().plugins?.[pluginId];
    if (!manifest) throw new Error(`Script is not registered: ${pluginId}`);
    return { script: manifest, enabled: manifest.enabled !== false };
  }
  function ownScriptTarget() {
    const record = ownScript();
    return { ...record, location:record.type ? scriptLocation({type:record.type}) : undefined };
  }
  function patchOwnScript(patch, record = ownScriptTarget()) {
    if (record.type) {
      const {record:location,type,scope} = record.location;
      const previous = location.trees;
      location.trees = previous.map(tree => tree.type === 'folder' ? { ...tree, scripts: tree.scripts.map(script => script.id === pluginId ? { ...script, ...clone(patch) } : script) }
        : tree.id === pluginId ? { ...tree, ...clone(patch) } : tree);
      const value = clone(location.trees);
      enqueue(async()=>{location.committed=await call('scripts.replace',{...scope,type,trees:value});},()=>{if(sameValue(location.trees,value))location.trees=previous;});
    } else { Object.assign(record.script, clone(patch)); enqueue(() => call('plugins.patch', { id: pluginId, patch })); }
  }
  function getScriptButtons() { return clone(ownScript().script.button?.buttons || []); }
  function replaceScriptButtons(param1, param2) {
    const buttons = typeof param1 === 'string' ? param2 : param1;
    patchOwnScript({ button: { ...(ownScript().script.button || {}), buttons: clone(buttons) } });
  }
  function updateScriptButtonsWith(updater) {
    const target=ownScriptTarget(),result=updater(clone(target.script.button?.buttons || []));
    const apply=value=>{patchOwnScript({button:{...(target.script.button || {}),buttons:clone(value)}},target);return value;};
    return result?.then ? result.then(apply) : apply(result);
  }
  function getIframeName() {
    const element=global.frameElement;
    if (element?.id) { global.__TH_IFRAME_ID=element.id; return element.id; }
    const cached=global.__TH_IFRAME_ID;
    const owner=global.__ElecKoiCurrentMessageId ?? pluginId;
    if(cached && global.__ElecKoiIframeOwner===owner)return cached;
    const name=global.__ElecKoiCurrentMessageId !== undefined ? `TH-message--${indexOf(global.__ElecKoiCurrentMessageId)}--0`
      :global.name?.startsWith('TH-') ? global.name : `TH-script--${ownScript().script.name}--${pluginId}`;
    if(!name)throw new TypeError('frameElement is null while resolving iframe id');
    global.__TH_IFRAME_ID=name;
    global.__ElecKoiIframeOwner=owner;
    if(element)element.id=name;
    return name;
  }
  function getScriptId() {
    const name=getIframeName();
    if(!name.startsWith('TH-script--'))throw new Error('getScriptId requires a script iframe');
    return name.replace(/TH-script--.+--/,'');
  }
  function getAllEnabledScriptButtons() {
    const result = {};
    const records = [...scriptRecords(), ...Object.entries(requireState().plugins || {}).map(([id, script]) => ({ script: { ...script, id }, enabled: script.enabled !== false }))];
    for (const { script, enabled } of records) if (enabled && script.button?.enabled !== false) {
      result[script.id] = (script.button?.buttons || []).filter(value => value.visible).map(value => ({ button_id: `plugin:${script.id}:button:${value.name}`, button_name: value.name }));
    }
    return result;
  }
  async function executeSlashCommandsWithOptions(text, options = {}) {
    await readyPromise;
    if (!st) throw new Error('Tavern runtime is not loaded');
    return st.execute(text, options);
  }
  async function triggerSlash(text) { return (await executeSlashCommandsWithOptions(text)).pipe; }

  const context = {
    variables: { local: stVariableService('chat'), global: stVariableService('global') },
    chat: [], chatMetadata: {}, characters: [], characterId: undefined, groupId: null, user_avatar: null, name1: '', name2: '', extensionSettings, eventSource: {
      on: (event, fn) => eventOn(event, fn, 'last', false, false), once: (event, fn) => eventOn(event, fn, 'last', true, false),
      removeListener: (event, fn) => eventRemoveListener(event, fn, false), emit: eventEmit, emitAndWait: eventEmitAndWait,
      makeFirst: (event, fn) => moveListener(event, fn, true, false), makeLast: (event, fn) => moveListener(event, fn, false, false),
    }, eventTypes: tavern_events,
    getCurrentChatId: () => requireState().conversationId,
    getChatTitle: () => requireState().title ?? requireState().conversationId,
    addOneMessage: async (message, options = {}) => {
      const surface = displaySurface(); if (!surface) throw new Error('No visible message surface is registered');
      const index = options.insertAfter === undefined ? context.chat.indexOf(message) : Number(options.insertAfter) + 1;
      if (index < 0) throw new Error('Message must be in context.chat before it can be displayed');
      const conversationId = requireState().conversationId;
      await context.saveChat();
      if (requireState().conversationId !== conversationId) throw new Error('Chat changed before the message was displayed');
      const native = message.native_id || requireState().messages[index]?.id;
      if (!native) throw new Error('Saved message has no native ID');
      await waitForDisplayedMessage(surface, native, conversationId);
      await surface.refresh(native, messageFormatting(message.mes, message.name, message.is_system, message.is_user, index));
      await shared.notifyMessageRendered(conversationId, [native]);
    },
    getRequestHeaders: () => ({ 'Content-Type': 'application/json' }),
    saveChat: async () => {
      const s = requireState(), scope = captured();
      const prior = shared.chatSaves.get(scope.conversationId);
      let release;
      const saving = new Promise(resolve => { release = resolve; });
      shared.chatSaves.set(scope.conversationId, saving);
      await prior;
      const settled = () => { if (shared.chatSaves.get(scope.conversationId) === saving) shared.chatSaves.delete(scope.conversationId); release(); };
      try {
      const references = context.chat.slice();
      const messages = context.chat.map(value => ({ id: value.native_id || '', content: value.mes ?? value.message ?? '',
        role: value.is_user ? 'user' : value.role === 'system' || value.extra?.type === 'narrator' ? 'system' : 'assistant',
        name: value.name, reasoning: value.reasoning,
        metadata: { ...messageMetadata(value), is_hidden: !!value.is_system }, swipes: value.swipes, swipe_id: value.swipe_id }));
      const structural = messages.length !== s.messages.length || messages.some((value, index) => value.id !== s.messages[index]?.id);
      const metadata = clone(context.chatMetadata);
      await flush();
      let committed;
      if (structural) committed = await call('messages.replace', { ...scope, messages, expected: s.messages.map(({ id, content }) => ({ id, content })) });
      else {
        const updates = messages.map((value, index) => ({ ...value, expectedContent: s.messages[index].content }));
        committed = await call('messages.update', { ...scope, messages: updates });
      }
      await call('messages.metadata', { ...scope, value: metadata });
      const common = shared.chatStates.get(scope.conversationId);
      if (common) {
        const persisted = committed.map(tavernMessage);
        references.forEach((value, index) => {
          for (const key of Object.keys(value)) if (!Object.hasOwn(persisted[index], key)) delete value[key];
          Object.assign(value, persisted[index]);
        });
        common.chat.splice(0, common.chat.length, ...references);
        common.lastChat = clone(persisted); common.lastMetadata = clone(metadata);
      }
      } finally { settled(); }
      await refresh();
    },
    saveMetadata: () => call('messages.metadata', { ...captured(), value: clone(context.chatMetadata) }),
    saveMetadataDebounced: () => { const scope = captured(), value = clone(context.chatMetadata); enqueue(() => call('messages.metadata', { ...scope, value })); },
    updateChatMetadata: (value, reset = false) => {
      if (reset) Object.keys(context.chatMetadata).forEach(key => delete context.chatMetadata[key]);
      Object.assign(context.chatMetadata, value);
    },
    renameChat: (oldName, newName) => call('chats.rename', { ...captured(), conversationId: newName === undefined ? requireState().conversationId : String(oldName).replace(/\.jsonl$/, ''), name: newName ?? oldName }),
    openCharacterChat: async name => { await call('chats.open', { id: String(name).replace(/\.jsonl$/, '') }); await refresh(); },
    selectCharacterById: async id => {
      const raw = requireState().rawCharacters?.[Number(id)];
      if (!raw) throw new Error(`Character index out of range: ${id}`);
      const history = await getChatHistoryBrief(raw.avatar);
      const conversationId = history?.length ? history[0].conversationId || history[0].file_name.replace(/\.jsonl$/, '')
        : await call('chats.create', { characterId: raw.native_id });
      await call('chats.open', { id: conversationId }); await refresh();
    },
    getCharacters: async () => { await refresh(); },
    getOneCharacter: async avatar => { await refresh(); return RawCharacter.find({ name: avatar }); },
    unshallowCharacter: async avatar => { await refresh(); return RawCharacter.find({ name: avatar }); },
    getCharacterCardFields: ({ chid } = {}) => {
      const raw = requireState().rawCharacters[chid ?? rawCharacterIndex('current')], data = raw?.data || {}, metadata = context.chatMetadata;
      const expand = value => substituteMacros(String(value || '').trim());
      return { system: expand(metadata.system_prompt || data.system_prompt), mesExamples: expand(metadata.mes_example || raw?.mes_example || data.mes_example),
        description: expand(raw?.description || data.description), personality: expand(raw?.personality || data.personality),
        persona: expand(personaReference('current', false)?.description), scenario: expand(metadata.scenario || raw?.scenario || data.scenario),
        jailbreak: expand(data.post_history_instructions), version: data.character_version || '', charDepthPrompt: expand(data.extensions?.depth_prompt?.prompt),
        creatorNotes: expand(data.creator_notes), firstMessage: expand(raw?.first_mes || data.first_mes), alternateGreetings: (data.alternate_greetings || []).map(expand) };
    },
    writeExtensionField: async (characterId, key, value) => {
      const raw = requireState().rawCharacters[characterId] || RawCharacter.find({ name: characterId });
      if (!raw) throw new Error(`Character does not exist: ${characterId}`);
      const extensions = clone(raw.data?.extensions || {});
      if (value === context.constants.unset) st.libs.lodash.unset(extensions, key);
      else st.libs.lodash.set(extensions, key, value);
      const character = clone(raw);
      character.data = { ...character.data, extensions };
      // Full-card replacement uses the original native character projection and permits explicit deletion.
      await call('characters.put', { ...captured(), id: raw.native_id, name: raw.name, character, raw: true });
      await refresh();
    },
    saveSettingsDebounced: () => {
      shared.settingsRevision = (shared.settingsRevision || 0) + 1;
      extensionSettings.eleckoi_chat_completion ||= {};
      extensionSettings.eleckoi_chat_completion.custom_prompt_post_processing = st.oai_settings.custom_prompt_post_processing;
      replaceVariables(getVariables({ type: 'global' }), { type: 'global' });
      const value = clone(extensionSettings); delete value.variables?.global;
      enqueue(async () => { await call('settings.set', { value, shared: true }); shared.lastExtensionSettings = clone(value); });
    },
    setExtensionPrompt, substituteParams: substituteMacros, substituteParamsExtended: substituteMacros,
    generateQuietPrompt,
    executeSlashCommands: executeSlashCommandsWithOptions, executeSlashCommandsWithOptions,
    registerMacro, unregisterMacro: name => { macros.delete(name); st.macros.registry.unregisterMacro(name); enqueue(() => call('macros.unregister', { name })); },
    tokenizers: tokenizerIds,
    getTokenizerModel: () => st.resolveTokenizerModel({mainApi:context.mainApi, chatCompletionSettings:st.oai_settings,
      textCompletionSettings:context.__eleckoiCompletionSettings(context.mainApi), modelList:requireState().connection?.models || [],
      textModels:extensionSettings.eleckoi_text_models || []}),
    getTokenCount: (text, padding = undefined) => {
      const request = tavernTokenCountRequest(text, padding);
      return request ? countTokens(text, request.encoding) + request.padding + request.overhead : 0;
    },
    getTokenCountAsync: async (text, padding = undefined) => {
      const request = tavernTokenCountRequest(text, padding);
      if (!request) return 0;
      const { encoding } = request;
      return (encoding.startsWith('remote-') ? (await call('tokens.remote', remoteTokenizerOptions(text, encoding))).count : countTokens(text, encoding)) + request.padding + request.overhead;
    },
    getTextTokens: (type, text) => {
      const encoding = tokenizerEncoding(type);
      if (encoding === 'estimate') { console.warn('The estimate tokenizer has no token IDs'); return []; }
      if (encoding.startsWith('remote-')) return remoteTokenize(text, encoding).ids;
      const ids = tokenizerRuntime().encode(text, encoding);
      Object.defineProperty(ids, 'chunks', { value: tokenChunks(ids, encoding) }); return ids;
    },
    decodeTextTokens: (type, ids) => { const encoding = tokenizerEncoding(type);
      if (encoding === 'estimate' || encoding.startsWith('remote-')) { console.warn('This tokenizer has no decoding endpoint'); return { text: '', chunks: [] }; }
      return { text: tokenizerRuntime().decode(ids, encoding), chunks: tokenChunks(ids, encoding) }; },
  };
  if (st) {
    for (const [name, value] of Object.entries(st)) if (/^SlashCommand|^Macro[A-Z]|^SimpleMutex$|^AbstractEventTarget$|^ActionLoaderHandle$|^PopupUtils$|^ARGUMENT_TYPE$|^PARSER_FLAG$|^enumTypes$/.test(name)) context[name] = value;
    Object.assign(context, { ToolManager: st.ToolManager, macros: st.macros, Popup: st.Popup, POPUP_TYPE: st.POPUP_TYPE, POPUP_RESULT: st.POPUP_RESULT,
      callGenericPopup: st.callGenericPopup, accountStorage: st.accountStorage, t: st.t, getCurrentLocale: st.getCurrentLocale,
      uuidv4: st.uuidv4, delay: st.delay, isTrueBoolean: st.isTrueBoolean, isFalseBoolean: st.isFalseBoolean,
      slashCommandReturnHelper: st.slashCommandReturnHelper, commonEnumProviders: st.commonEnumProviders });
  }
  function updateContextChat() {
    if (state.conversationId) {
    const messages = state.messages.map((message, index) => tavernMessage(message, index));
    const metadata = clone(state.metadata || {});
    let common = shared.chatStates.get(state.conversationId);
    if (!common) { common = { messages: [], chat: [], metadata: {}, lastChat: [], lastMetadata: {} }; shared.chatStates.set(state.conversationId, common); }
    if (state.messages !== common.messages) common.messages.splice(0, common.messages.length, ...state.messages);
    reconcileSharedChat(common, messages);
    reconcileSharedObject(common.metadata, common.lastMetadata, metadata, 'chatMetadata');
    common.lastChat = clone(messages); common.lastMetadata = clone(metadata);
    state.messages = common.messages; state.metadata = common.metadata;
    context.chat = common.chat; context.chatMetadata = common.metadata;
    const localVariables = variableLocation({ type: 'chat' });
    Object.defineProperty(common.metadata, 'variables', { configurable: true, enumerable: true,
      get: () => localVariables.bucket, set: value => replaceLocation(value, localVariables) });
    } else {
      context.chat = null; context.chatMetadata = null;
    }
    context.name1 = state.userName; context.name2 = state.characterName;
    if (state.rawCharacters !== shared.characterState) shared.characterState.splice(0, shared.characterState.length, ...(state.rawCharacters || []));
    if (state.personas !== shared.personaState) shared.personaState.splice(0, shared.personaState.length, ...(state.personas || []));
    state.rawCharacters = shared.characterState; state.personas = shared.personaState;
    context.characters = shared.characterState; context.characterId = rawCharacterIndex('current');
    context.groups = state.groups || []; context.groupId = state.groupId || null;
    if (context.characterId === -1) context.characterId = undefined;
    context.user_avatar = state.personaId;
    for (const surface of shared.displaySurfaces.values()) if (state.conversationId && surface.conversationId === state.conversationId) {
      surface.syncMetadata?.(presentationMessages(state.conversationId, state.messages).map(tavernMessage)); applyMessageStyle(surface.root.ownerDocument, state.messageStyle);
      st.restorePresentation(context,global.ElecKoi);
      // Render notifications hydrate too. Only a changed projection can request
      // another render; identical hydration must not schedule itself every frame.
      const revision = surfaceMessageRevision(state.conversationId, state.messages);
      if (surface.hydratedRevision !== revision) {
        surface.hydratedRevision = revision;
        surface.scheduleRendered?.();
      }
      if (extensionSettings.expressions?.last && Object.keys(extensionSettings.expressions.last).length) st.restoreMediaPresentation(context, global.ElecKoi).catch(report);
    }
  }
  const sameValue = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  function reconcileSharedObject(target, previous, incoming, path) {
    const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
    for (const key of new Set([...Object.keys(previous), ...Object.keys(incoming)])) {
      if (path === 'chatMetadata' && key === 'variables') continue; // Hydrated by the shared variable service.
      if (path === 'extensionSettings.variables' && key === 'global') continue;
      if (path === 'extensionSettings' && key === 'variables') {
        target.variables ||= {}; reconcileSharedObject(target.variables, previous.variables || {}, incoming.variables || {}, 'extensionSettings.variables'); continue;
      }
      if (key === 'message_id' && path.startsWith('chat[')) { target[key] = incoming[key]; continue; }
      if (record(target[key]) && record(incoming[key]) && (record(previous[key]) || previous[key] === undefined)) {
        reconcileSharedObject(target[key], previous[key] || {}, incoming[key], `${path}.${key}`);
        continue;
      }
      if (sameValue(target[key], previous[key]) || sameValue(target[key], incoming[key])) {
        if (Array.isArray(target[key]) && Array.isArray(incoming[key])) target[key].splice(0, target[key].length, ...clone(incoming[key]));
        else if (Object.hasOwn(incoming, key)) target[key] = clone(incoming[key]); else delete target[key];
      } else if (!sameValue(previous[key], incoming[key])) {
        throw new Error(`Unsaved context conflicts with a native update: ${path}.${key}; save or reload the context`);
      }
    }
  }
  function reconcileSharedChat(common, incoming) {
    const ids = list => list.map(value => value.native_id);
    const localStructure = !sameValue(ids(common.chat), ids(common.lastChat));
    const nativeStructure = !sameValue(ids(incoming), ids(common.lastChat));
    if (localStructure && nativeStructure && !sameValue(ids(common.chat), ids(incoming)))
      throw new Error('Unsaved chat insertion/deletion conflicts with a native timeline change; save or reload the context');
    const previous = new Map(common.lastChat.map(value => [value.native_id, value]));
    const targets = new Map(common.chat.filter(value => value.native_id).map(value => [value.native_id, value]));
    const next = new Map(incoming.map(value => [value.native_id, value]));
    for (const [id, target] of targets) if (previous.has(id) && next.has(id))
      reconcileSharedObject(target, previous.get(id), next.get(id), `chat[${id}]`);
    if (!localStructure || sameValue(ids(common.chat), ids(incoming))) common.chat.splice(0, common.chat.length,
      ...incoming.map(value => targets.get(value.native_id) || clone(value)));
  }
  function characterReference(reference = 'current') {
    const s = requireState();
    if (reference === 'current') return s.characterId;
    const found = s.characters?.find(value => value.id === reference || value.name === reference || value.card?.name === reference || value.avatar === reference)
      || s.rawCharacters?.find(value => value.native_id === reference || value.name === reference || value.avatar === reference);
    if (!found) throw new Error(`Character does not exist: ${reference}`);
    return found.native_id || found.id;
  }
  function rawCharacterIndex(reference = 'current') {
    const s = requireState(), list = s.rawCharacters || [];
    if (reference === 'current') return list.findIndex(value => value.native_id === s.characterId);
    const lowered = String(reference).toLowerCase();
    return list.findIndex(value => value.name.toLowerCase() === lowered || value.avatar.toLowerCase() === lowered || value.native_id === reference);
  }
  class RawCharacter {
    constructor(data) { this.character_data = data; }
    static find({ name = 'current' } = {}) { return requireState().rawCharacters?.[rawCharacterIndex(name)] || null; }
    static findIndex(name) { return rawCharacterIndex(name); }
    static getChatsFromFiles(data, isGroupChat = false) { return getChatHistoryDetail(data, isGroupChat); }
    getCardData() { return this.character_data; }
    getAvatarId() { return this.character_data.avatar || ''; }
    getRegexScripts() { return this.character_data.data?.extensions?.regex_scripts || []; }
    getCharacterBook() { return this.character_data.data?.character_book || null; }
    getWorldName() { return this.character_data.data?.extensions?.world || ''; }
  }
  function personaReference(reference = 'current', required = true) {
    const s = requireState(), list = s.personas || [];
    const id = !reference || reference === 'current' ? s.personaId : reference;
    const direct = list.find(value => value.avatar_id === id);
    if (direct) return direct;
    const matches = !reference || reference === 'current' ? [] : list.filter(value => value.name.toLowerCase() === String(reference).toLowerCase());
    if (matches.length !== 1) {
      if (required) throw new Error(`Persona does not exist or its name is ambiguous: ${reference}`);
      return null;
    }
    return matches[0];
  }
  function personaValue(value) {
    const { avatar_path, ...persona } = value;
    return clone({ ...persona, avatar: persona.avatar_id });
  }
  async function serializeAvatar(value) {
    if (['[object Blob]','[object File]'].includes(Object.prototype.toString.call(value.avatar))) {
      const bytes = new Uint8Array(await value.avatar.arrayBuffer());
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
      return { ...value, avatar: { data: global.btoa(binary), mimeType: value.avatar.type || 'image/png' } };
    }
    return value;
  }
  async function writePersona(reference, value = {}, createOnly = false) {
    await readyPromise;
    if (createOnly && (reference === 'current' || (requireState().personas || []).some(persona => persona.name.toLowerCase() === String(reference).toLowerCase()))) return false;
    const existing = personaReference(reference, false);
    if (!existing && !createOnly && (requireState().personas || []).filter(persona => persona.name.toLowerCase() === String(reference).toLowerCase()).length > 1) {
      throw new Error(`Persona does not exist or its name is ambiguous: ${reference}`);
    }
    const id = existing?.avatar_id || value.avatar_id || `persona-${Date.now()}-${Math.random().toString(36).slice(2)}.png`;
    if (createOnly && (existing || (requireState().personas || []).some(persona => persona.avatar_id === id))) return false;
    const name = existing ? value.name ?? existing.name : reference;
    const result = await call('personas.upsert', { ...captured(), reference: existing?.avatar_id || reference, id, name,
      persona: await serializeAvatar(existing ? value : { depth: 2, ...value }), createOnly });
    await refresh();
    return result.created;
  }
  async function replacePersona(reference, value) {
    const existing = personaReference(reference);
    await writePersona(existing.avatar_id, value);
  }
  async function getCharacter(reference = 'current') {
    await readyPromise;
    const raw = RawCharacter.find({ name: reference });
    if (!raw) throw new Error(`Character does not exist: ${reference}`);
    const data = raw.data || {};
    const extensions = clone(data.extensions || {});
    if (extensions.regex_scripts !== undefined) extensions.regex_scripts = extensions.regex_scripts.map(value => {
      const rule = asTavernRegex(value);
      if (value.placement) rule.destination = { display: !!value.markdownOnly, prompt: !!value.promptOnly };
      return Object.fromEntries(['id','script_name','enabled','find_regex','trim_strings','replace_string','source','destination','run_on_edit','min_depth','max_depth']
        .map(key => [key, rule[key]]));
    });
    if (Array.isArray(extensions.tavern_helper)) extensions.tavern_helper = Object.fromEntries(extensions.tavern_helper);
    for (const key of ['TavernHelper_scripts','TavernHelper_characterScriptVariables','fav','talkativeness','world','depth_prompt',
      'pygmalion_id','github_repo','source_url','chub','risuai','sd_character_prompt']) delete extensions[key];
    return clone({ avatar: raw.avatar, version: data.character_version || '', creator: data.creator || '',
      creator_notes: raw.creatorcomment ?? data.creator_notes ?? '', description: raw.description ?? data.description ?? '',
      first_messages: [raw.first_mes ?? data.first_mes ?? '', ...(data.alternate_greetings || [])],
      worldbook: requireState().worldbooks.characters[raw.native_id]?.primary ?? data.extensions?.world ?? null,
      extensions });
  }
  async function writeCharacter(reference, value = {}, createOnly = false) {
    await readyPromise;
    if (reference === 'current' && createOnly) return false;
    const raw = RawCharacter.find({ name: reference });
    if (createOnly && raw) return false;
    const name = raw?.name || reference.replace(/\.png$/, '');
    const result = await call('characters.upsert', { ...captured(), reference: raw?.avatar || reference, id: raw?.native_id || '', name,
      character: await serializeAvatar(value), createOnly });
    await refresh();
    return result.created;
  }
  async function replaceCharacter(reference, value) {
    if (!RawCharacter.find({ name: reference })) throw new Error(`Character does not exist: ${reference}`);
    await writeCharacter(reference, value);
  }
  async function getChatHistoryBrief(reference = 'current') {
    const raw = RawCharacter.find({ name: reference });
    return raw ? call('characters.history', { characterId: raw.native_id }) : null;
  }
  async function getChatHistoryDetail(data, isGroupChat = false) {
    const values = await call('chats.history', { files: data, isGroupChat });
    return Object.fromEntries(Object.entries(values).map(([name, messages]) => [name, messages.map((message, index) => tavernMessage(message, index))]));
  }
  async function importRawCharacter(filename, content) {
    const serialized = await serializeAvatar({ avatar: content });
    if (!serialized.avatar?.data) throw new TypeError('importRawCharacter requires a Blob');
    const value = await call('characters.import', { ...captured(), filename, data: serialized.avatar.data });
    await refresh();
    return new global.Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  async function importRawChat(filename, content) {
    const result = await call('chats.import', { ...captured(), filename, content });
    return new global.Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  function chatReference(reference = 'current') { return reference === 'current' ? requireState().conversationId : reference; }
  function presetReference(reference = 'in_use') {
    const s = requireState();
    if (reference === 'in_use' || reference === undefined) return s.presetId;
    const found = s.presets?.find(value => value.id === reference || value.name === reference);
    if (!found) throw new Error(`Preset does not exist: ${reference}`);
    return found.id;
  }

  const presetSystemIds = ['main', 'nsfw', 'jailbreak', 'enhanceDefinitions'];
  const presetPlaceholderIds = ['worldInfoBefore', 'personaDescription', 'charDescription', 'charPersonality', 'scenario', 'worldInfoAfter', 'dialogueExamples', 'chatHistory'];
  const defaultPreset = {
    settings: { max_context: 2000000, max_completion_tokens: 300, reply_count: 1, should_stream: false,
      temperature: 1, frequency_penalty: 0, presence_penalty: 0, repetition_penalty: 1, top_p: 1, min_p: 0, top_k: 0, top_a: 0,
      seed: -1, squash_system_messages: false, reasoning_effort: 'auto', request_thoughts: false, request_images: false,
      enable_function_calling: false, enable_web_search: false, allow_sending_images: 'disabled', allow_sending_videos: false,
      character_name_prefix: 'none', wrap_user_messages_in_quotes: false },
    prompts: presetPlaceholderIds.map(id => ({ id, name: id, enabled: true, role: 'system', position: { type: 'relative' } })),
    prompts_unused: [], extensions: {},
  };
  function presetRecord(reference) {
    requireState();
    const matches = shared.presetState.list.filter(value => value.id === reference || value.name === reference);
    if (matches.length > 1) throw new Error(`Preset name is ambiguous: ${reference}`);
    return matches[0];
  }
  function getPreset(reference = 'in_use') {
    requireState();
    const value = reference === 'in_use' ? shared.presetState.draft : presetRecord(reference)?.preset;
    if (!value) throw new Error(`Preset does not exist: ${reference}`);
    return clone(value);
  }
  function presetSelection() { const value = shared.presetState; return clone({ id: value.id, name: value.name, draft: value.draft }); }
  function loadPreset(reference, compatibilityEvents = true) {
    if (reference === 'in_use') return false;
    const preset = presetRecord(reference);
    if (!preset) return false;
    const common = shared.presetState, version = ++common.revision;
    Object.assign(common, { id: preset.id, name: preset.name, draft: clone(preset.preset) });
    const requested = presetSelection();
    enqueue(async () => {
      if (!await call('tavernPresets.load', { id: preset.id, compatibilityEvents })) throw new Error(`Preset could not be loaded: ${preset.name}`);
      common.committed = requested;
    }, () => { if (version === common.revision && common.committed) Object.assign(common, clone(common.committed)); });
    return true;
  }
  function validatePreset(value) {
    const preset = { ...clone(defaultPreset), ...clone(value), settings: { ...defaultPreset.settings, ...value.settings } };
    const unique = new Set();
    for (const prompt of [...preset.prompts, ...preset.prompts_unused]) {
      if (!prompt.id) throw new Error('Preset prompt requires an id');
      if (presetSystemIds.includes(prompt.id) || presetPlaceholderIds.includes(prompt.id)) {
        if (unique.has(prompt.id)) throw new Error(`Duplicate system/placeholder prompt: ${prompt.id}`);
        unique.add(prompt.id);
      }
      if (!['system', 'user', 'assistant'].includes(prompt.role)) throw new Error(`Invalid prompt role: ${prompt.role}`);
      if (prompt.position && !['relative', 'in_chat'].includes(prompt.position.type)) throw new Error(`Invalid prompt position: ${prompt.position.type}`);
      if (prompt.position?.type === 'in_chat' && (!Number.isInteger(prompt.position.depth) || !Number.isInteger(prompt.position.order)))
        throw new Error('In-chat prompts require integer depth and order');
    }
    return preset;
  }
  async function putPreset(reference, value = defaultPreset, createOnly = false, requireExisting = false, expectedPresetId) {
    await readyPromise;
    if (reference === 'in_use') expectedPresetId ||= shared.presetState.id;
    if (createOnly && (reference === 'in_use' || presetRecord(reference))) return false;
    if (requireExisting) getPreset(reference);
    const preset = validatePreset(value);
    await flush();
    const result = await call('tavernPresets.put', { reference, preset, createOnly, requireExisting, ...(expectedPresetId ? { expectedPresetId } : {}) });
    await refresh(); return result.created;
  }
  function mergePreset(previous, patch) {
    const next = clone(previous);
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) continue;
      next[key] = value && typeof value === 'object' && !Array.isArray(value) ? mergePreset(previous[key] || {}, value) : clone(value);
    }
    return next;
  }
  async function refresh(conversationId, emitChatChanged = true, followApplicationContext = false) {
    const requestedConversation = conversationId;
    const selectContext = () => callbackConversationId !== undefined ? callbackConversationId
      : shared.frames?.get(ownerKey)?.authorContext?.conversationId || (followApplicationContext && shared.captureAuthorContext
        ? shared.captureAuthorContext()?.conversationId
        : requestedConversation || shared.captureAuthorContext?.()?.conversationId);
    const ownerConversation = shared.frames?.get(ownerKey)?.authorContext?.conversationId;
    conversationId = selectContext();
    const unavailable = unavailableContext(ownerConversation || conversationId);
    if (unavailable) throw unavailable;
    // A native projection can arrive while saveChat is assigning new identities.
    // Observe that atomic commit after its returned rows normalize shared objects.
    await shared.chatSaves.get(conversationId || state?.conversationId);
    // Serialize hydration, not event callbacks. A mutation awaiting refresh must see
    // its persisted state even when another native event starts a refresh meanwhile.
    const predecessor = refreshHydration;
    let release;
    refreshHydration = new Promise(resolve => { release = resolve; });
    await predecessor;
    let next, previous;
    try {
    await flush();
    // Automatic notifications can wait behind persistence/hydration while native
    // navigation closes their old chat. Persistent script realms follow the
    // actual application now; explicit callbacks and fixed documents stay bound.
    if (followApplicationContext) {
      conversationId = selectContext();
      const closedContext = unavailableContext(conversationId);
      if (closedContext) throw closedContext;
    }
    const versions = new Map(shared.variableVersions);
    const settingsRevision = shared.settingsRevision || 0;
    const settingsCommitted = clone(shared.lastExtensionSettings);
    if (lifetime.signal.aborted) throw lifetime.signal.reason;
    const bootstrapParams = { pluginId, ...(conversationId !== undefined ? { conversationId } : {}) };
    try {
      next = await (global.__ElecKoiHostAdapter
        ? global.__ElecKoiHostAdapter.request('plugins.bootstrap', bootstrapParams, { signal: lifetime.signal })
        : call('plugins.bootstrap', bootstrapParams));
    } catch (error) {
      if (isDeletedContext(error) && error.conversationId) {
        shared.deletedConversations.add(error.conversationId);
        error.owner ||= ownerKey;
      }
      throw error;
    }
    previous = state && { ...state, messages: clone(state.messages), metadata: clone(state.metadata) };
    state = next;
    if (next.audio) {
      Object.assign(shared.audioState.settings, clone(next.audio.settings));
      for (const [channel, value] of Object.entries(next.audio.states || {})) Object.assign(shared.audioState.states[channel] ||= {}, clone(value));
    }
    const locations = ['chat', 'character', 'preset', 'global', 'script', 'extension', 'plugin']
      .filter(type => next.variables[type] !== null).map(type => ({ type }));
    for (const type of ['script', 'extension', 'plugin']) for (const owner of Object.keys(next.variableOwners?.[type] || {}))
      locations.push({ type, script_id: owner, extension_id: owner });
    next.messages?.forEach((_, message_id) => locations.push({ type: 'message', message_id }));
    for (const options of locations) {
      const location = variableLocation(options);
      if ((shared.variableVersions.get(location.key) || 0) !== (versions.get(location.key) || 0)) continue;
      const value = location.scope === 'message' ? next.messages.find(message => message.id === location.messageId)?.variables?.[location.swipeId]
        || next.variables.message[location.messageId] || {}
        : ['script', 'extension', 'plugin'].includes(location.scope) ? next.variableOwners?.[location.scope]?.[location.variableOwner]
          || (location.variableOwner === pluginId ? next.variables[location.scope] || {} : {}) : next.variables[location.scope] || {};
      const hydrated = clone(value);
      const committed = variableCommits.get(location.bucket)?.committed || clone(location.bucket);
      reconcileSharedObject(location.bucket, committed, hydrated, `variables.${location.scope}`);
      variableCommits.set(location.bucket, { committed: clone(hydrated), revision: 0 });
    }
    const incomingSettings = next.extensionSettings || next.settings || {};
    if (settingsRevision === (shared.settingsRevision || 0)) {
      reconcileSharedObject(extensionSettings, settingsCommitted, incomingSettings, 'extensionSettings');
      shared.lastExtensionSettings = clone(incomingSettings);
    }
    if (next.connection && extensionSettings.eleckoi_api_sources?.[next.connection.configId]) next.connection.source = extensionSettings.eleckoi_api_sources[next.connection.configId];
    const tokenSource = next.connection?.source || 'custom';
    st.oai_settings.chat_completion_source = tokenSource;
    st.oai_settings[tokenSource + '_model'] = next.model || '';
    extensionSettings.variables ||= {};
    const globalLocation = variableLocation({ type: 'global' });
    Object.defineProperty(extensionSettings.variables, 'global', { enumerable: true, configurable: true,
      get: () => globalLocation.bucket, set: value => replaceLocation(value, globalLocation) });
    const presetState = shared.presetState;
    presetState.list.splice(0, presetState.list.length, ...(next.tavernPresets || (next.presets || []).map(value => ({ id: value.id, name: value.name, preset: value }))));
    const activePreset = next.tavernPresetState || presetState.list.find(value => value.id === next.presetId);
    if (activePreset) Object.assign(presetState, { id: activePreset.id, name: activePreset.name, draft: clone(activePreset.preset) });
    presetState.committed = presetSelection();
    updateContextChat();
    for (const type of ['global', 'preset', 'character']) {
      if (type === 'character' && !next.characterId || type === 'preset' && !next.presetId) continue;
      const { record } = scriptLocation({ type }), incoming = clone(next.scripts?.[type] || []);
      if (sameValue(record.trees, record.committed)) record.trees = incoming;
      else if (!sameValue(record.committed, incoming) && !sameValue(record.trees, incoming)) throw new Error(`Unsaved script trees conflict with native changes: ${type}`);
      record.committed = incoming;
    }
    if (st) {
      st.installPopupDocument(global.document);
      st.initialize(context, global.ElecKoi, { personas: () => requireState().personas || [], preset: () => getPreset('in_use'),
        presetName: () => shared.presetState.name, regex: type => getTavernRegexes({ type }).map(asRawRegex),
        worldbooks: () => requireState().worldbooks?.names || [], extensions: () => Object.values(requireState().plugins || {}), generate: generateRequest });
      connectSharedRegistrations();
    }
    shared.connectionEventState ||= connectionEventState();
    } finally { release(); }
    if (previous && previous.conversationId !== next.conversationId) {
      if (emitChatChanged) {
        // A temporary callback context switch must not erase the prompt snapshot
        // just acknowledged to the Host for the captured generation.
        injections.clear(); if (next.conversationId) await persistInjections();
        await loadCurrentItemizedHistory(next.conversationId);
        await eventEmitOwned(tavern_events.CHAT_CHANGED, next.conversationId);
      }
    }
    if (next.conversationId && (!previous || previous.conversationId !== next.conversationId)) st?.processChatSlashCommands();
    return previous;
  }
  const initialConversationId = shared.captureAuthorContext?.()?.conversationId;
  const readyPromise = Promise.resolve(global.__ElecKoiTokenizers?.initialize?.()).then(() => refresh(initialConversationId));
  readyPromise.catch(report);
  function ready() { return readyPromise; }
  ready.then = readyPromise.then.bind(readyPromise);
  ready.catch = readyPromise.catch.bind(readyPromise);

  const helpers = {
    getChatMessages, setChatMessages, createChatMessages, deleteChatMessages, rotateChatMessages,
    RawCharacter, getCharacterNames: () => (requireState().rawCharacters || []).map(value => value.name),
    getCharacterIds: () => (requireState().rawCharacters || []).map(value => value.avatar),
    getCurrentCharacterName: () => RawCharacter.find()?.name || null,
    getCurrentCharacterId: () => RawCharacter.find()?.avatar || null,
    createCharacter: (name, value) => writeCharacter(name, value, true), createOrReplaceCharacter: writeCharacter,
    getCharacter, replaceCharacter,
    updateCharacterWith: async (reference, updater) => {
      const character = RawCharacter.find({ name: reference });
      if (!character) throw new Error(`Character does not exist: ${reference}`);
      const value = await updater(await getCharacter(character.native_id));
      await replaceCharacter(character.native_id, value); return value;
    },
    deleteCharacter: async (reference) => {
      const raw = RawCharacter.find({ name: reference }); if (!raw) return false;
      const deleted = await call('characters.delete', { id: raw.native_id }); await refresh(); return deleted;
    },
    getChatHistoryBrief, getChatHistoryDetail, importRawCharacter, importRawChat, importRawTavernRegex,
    isAdmin: () => true,
    getTavernHelperExtensionId: () => compatibilityComponentId,
    getTavernHelperVersion: () => `4.11.2-eleckoi.${requireState().components?.[compatibilityComponentId]?.version || '0.2.0'}`,
    updateTavernHelper: async () => {
      const result=await call('extensions.updateComponent',{open:true});
      if(result.requiresAppUpdate){global.toastr?.info(`Compatibility is bundled in the app. Install ${result.latestVersion} from the opened release page.`);return false;}
      return result.ok;
    },
    getTavernVersion: () => '1.19.0-eleckoi.0.2.0',
    getExtensionType: id => { const manifest = extensionManifest(id); return manifest ? manifest.type || 'local' : null; },
    isInstalledExtension: id => !!extensionManifest(id),
    getExtensionInstallationInfo: id => call('extensions.info', { id: extensionManifest(id)?.id || id }),
    installExtension: (url, type = 'local') => extensionAction('extensions.install', { url, type }),
    uninstallExtension: id => extensionAction('extensions.remove', { id }),
    reinstallExtension: async id => {
      await readyPromise; await flush();
      return extensionAction('extensions.reinstall', { id });
    },
    updateExtension: id => extensionAction('extensions.update', { id }),
    getProxyPresetNames: () => (extensionSettings.eleckoi_proxy_presets || []).map(value => value.name),
    getPersonaNames: () => (requireState().personas || []).map(value => value.name),
    getPersonaIds: () => (requireState().personas || []).map(value => value.avatar_id),
    getCurrentPersonaName: () => personaReference('current', false)?.name || null,
    getCurrentPersonaId: () => personaReference('current', false)?.avatar_id || null,
    getPersonaAvatarPath: (reference = 'current') => personaReference(reference, false)?.avatar_path || null,
    getPersona: reference => personaValue(personaReference(reference)),
    createPersona: (name, value) => writePersona(name, value, true), createOrReplacePersona: writePersona, replacePersona,
    updatePersonaWith: async (reference, updater) => {
      const persona = personaReference(reference), value = await updater(personaValue(persona));
      await replacePersona(persona.avatar_id, value); return value;
    },
    deletePersona: async reference => { const value = personaReference(reference, false); if (!value) return false;
      const deleted = await call('personas.delete', { ...captured(), id: value.avatar_id }); await refresh(); return deleted; },
    getLastMessageId: () => requireState().messages.length - 1,
    getCurrentMessageId: () => { const id = global.__ElecKoiCurrentMessageId; if (id === undefined) throw new Error('getCurrentMessageId requires a message iframe'); return indexOf(id); },
    getVariables, getAllVariables, registerVariableSchema, replaceVariables, updateVariablesWith, insertOrAssignVariables, insertVariables, deleteVariable,
    retrieveDisplayedMessage, formatAsDisplayedMessage, refreshOneMessage,
    eventOn, eventOnce: (event, fn) => eventOn(event, fn, 'last', true),
    eventMakeFirst: (event, fn) => moveListener(event, fn, true), eventMakeLast: (event, fn) => moveListener(event, fn, false),
    eventRemoveListener, eventClearEvent, eventClearAll, eventClearListener, eventEmit, eventEmitAndWait,
    eventOnButton: (name, listener) => { eventOn(`plugin:${pluginId}:button:${name}`, listener); }, initializeGlobal, waitGlobalInitialized,
    generate: options => generateRequest(options, false), generateRaw: options => generateRequest(options, true),
    placeholder_prompt_default_order: ['world_info_before', 'persona_description', 'char_description', 'char_personality', 'scenario', 'world_info_after', 'dialogue_examples', 'chat_history', 'user_input'],
    getModelList: async customApi => {
      if (customApi?.apiurl) {
        const response = await call('network.request', { url: customApi.apiurl.replace(/\/$/, '') + '/models', headers: customApi.key ? { Authorization: `Bearer ${customApi.key}` } : {} });
        if (!response.ok) throw new Error(`Model list HTTP ${response.status}: ${response.body}`);
        return [...new Set(JSON.parse(response.body).data.map(value => String(value.id || value.name)))].sort();
      }
      const configs = (await base.chat.getModels()).items || [];
      return [...new Set(configs.flatMap(config => config.models?.map(model => model.id) || [config.defaultModel]))].filter(Boolean).sort();
    },
    stopGenerationById, stopAllGeneration,
    injectPrompts, uninjectPrompts,
    getWorldbookNames: () => [...requireState().worldbooks.names], getWorldbook, replaceWorldbook, updateWorldbookWith, createWorldbook,
    getLorebooks: () => helpers.getWorldbookNames(), createLorebook: name => createWorldbook(name), deleteLorebook: name => helpers.deleteWorldbook(name),
    getLorebookEntries, replaceLorebookEntries, updateLorebookEntriesWith, setLorebookEntries, createLorebookEntries, deleteLorebookEntries,
    createLorebookEntry: async (name, value) => (await createLorebookEntries(name, [value])).new_uids[0],
    deleteLorebookEntry: async (name, uid) => (await deleteLorebookEntries(name, [uid])).delete_occurred,
    getCharLorebooks: ({ name = 'current' } = {}) => helpers.getCharWorldbookNames(name),
    getCurrentCharPrimaryLorebook: () => helpers.getCharWorldbookNames('current').primary,
    setCurrentCharLorebooks: value => helpers.rebindCharWorldbooks('current', { ...helpers.getCharWorldbookNames('current'), ...value }),
    getChatLorebook: () => helpers.getChatWorldbookName('current'), setChatLorebook: name => helpers.rebindChatWorldbook('current', name),
    getOrCreateChatLorebook: name => helpers.getOrCreateChatWorldbook('current', name),
    importRawWorldbook: async (filename, content) => {
      const document = JSON.parse(content), name = filename.replace(/\.json$/i, '');
      const entries = Array.isArray(document.entries) ? document.entries : Object.values(document.entries || {});
      await call('worldbooks.put', { name, book: { ...document, name, entries: normalizeWorldbook(entries) } });
      await refresh(); return new global.Response(JSON.stringify({ name }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
    getLorebookSettings: () => clone({ ...requireState().worldbooks.settings, selected_global_lorebooks: requireState().worldbooks.global }),
    setLorebookSettings: settings => {
      const books = requireState().worldbooks, previous = clone(books.settings || {}), previousGlobal = [...books.global];
      const missing = settings.selected_global_lorebooks?.filter(name => !books.names.includes(name));
      if (missing?.length) throw new Error(`Worldbooks do not exist: ${missing.join(', ')}`);
      books.settings = { ...previous, ...Object.fromEntries(Object.entries(settings).filter(([,value]) => value !== undefined)) };
      if (settings.selected_global_lorebooks) books.global = [...settings.selected_global_lorebooks];
      const next = clone(books.settings);
      enqueue(() => call('worldbooks.settings', { value: next }), () => { books.settings = previous; books.global = previousGlobal; });
    },
    createOrReplaceWorldbook,
    deleteWorldbook: async name => { const removed = await call('worldbooks.delete', { name }); if (removed) await refresh(); return removed; },
    createWorldbookEntries, deleteWorldbookEntries,
    getChatWorldbookName: (chat = 'current') => {
      const conversationId = chatReference(chat), books = requireState().worldbooks;
      if (!conversationId) throw new Error('No chat is open; cannot read its worldbook');
      const name = books.chats[conversationId];
      if (name && books.names.includes(name)) return name;
      delete books.chats[conversationId]; return null;
    },
    rebindChatWorldbook: async (chat, name) => {
      if (name === undefined) { name = chat; chat = 'current'; }
      const conversationId = chatReference(chat);
      if (!conversationId) throw new Error('No chat is open; cannot bind its worldbook');
      if (name && !helpers.getWorldbookNames().includes(name)) throw new Error(`Worldbook does not exist: ${name}`);
      await call('worldbooks.bind', { conversationId, scope: 'chat', names: name ? [name] : [] });
      requireState().worldbooks.chats[conversationId] = name || null;
    },
    getOrCreateChatWorldbook: async (chat = 'current', name) => {
      const existing = helpers.getChatWorldbookName(chat);
      if (existing) return existing;
      if (name && helpers.getWorldbookNames().includes(name)) throw new Error(`Worldbook already exists: ${name}`);
      name ||= `Chat Book ${chatReference(chat)}`.replace(/[^a-z0-9]/gi, '_').replace(/_{2,}/g, '_').substring(0, 64);
      await createWorldbook(name); await helpers.rebindChatWorldbook(chat, name); return name;
    },
    getGlobalWorldbookNames: () => [...requireState().worldbooks.global],
    rebindGlobalWorldbooks: async names => {
      await call('worldbooks.bind', { scope: 'global', names }); requireState().worldbooks.global = [...names];
    },
    getCharWorldbookNames: (character = 'current') => {
      const s = requireState(), id = characterReference(character);
      return clone(s.worldbooks.characters[id] || { primary: null, additional: [] });
    },
    rebindCharWorldbooks: async (character, value) => {
      if (value === undefined) { value = character; character = 'current'; }
      const characterId = characterReference(character);
      await call('worldbooks.bind', { characterId, scope: 'character', names: value.additional, primary: value.primary });
      requireState().worldbooks.characters[characterId] = clone(value);
    },
    getCharData: (reference = 'current') => RawCharacter.find({ name: typeof reference === 'object' ? reference.name || 'current' : reference }),
    getCharAvatarPath: (reference = 'current') => RawCharacter.find({ name: typeof reference === 'object' ? reference.name || 'current' : reference })?.avatar_path || null,
    default_preset: clone(defaultPreset),
    isPresetSystemPrompt: prompt => presetSystemIds.includes(prompt.id),
    isPresetPlaceholderPrompt: prompt => presetPlaceholderIds.includes(prompt.id),
    isPresetNormalPrompt: prompt => !presetSystemIds.includes(prompt.id) && !presetPlaceholderIds.includes(prompt.id),
    getPresetNames: () => { requireState(); return shared.presetState.list.map(item => item.name); },
    getLoadedPresetName: () => { requireState(); return shared.presetState.name; },
    getPreset, loadPreset,
    createPreset: (name, preset) => putPreset(name, preset, true),
    createOrReplacePreset: (name, preset) => putPreset(name, preset),
    replacePreset: async (name, preset) => { await putPreset(name, preset, false, true); },
    updatePresetWith: async (name, updater) => {
      const reference = name === 'in_use' ? name : presetRecord(name)?.id || name, presetId = shared.presetState.id;
      const value = await updater(getPreset(name));
      await putPreset(reference, value, false, true, name === 'in_use' ? presetId : undefined); return value;
    },
    setPreset: async (name, patch) => { await putPreset(name, mergePreset(getPreset(name), patch), false, true); return getPreset(name); },
    deletePreset: async name => { await readyPromise; await flush(); const result = await call('tavernPresets.delete', { reference: name }); await refresh(); return result; },
    renamePreset: async (name, newName) => {
      await readyPromise; await flush();
      const previous = presetRecord(name);
      if (previous) await eventEmit(tavern_events.PRESET_RENAMED_BEFORE,{apiId:'openai',oldName:previous.name,newName});
      const result = await call('tavernPresets.rename', { reference: name, name: newName }); await refresh(); return result;
    },
    importRawPreset: async (name, content) => {
      try {
        await readyPromise; await flush();
        const event = {data:JSON.parse(content),presetName:name};
        await eventEmit(tavern_events.OAI_PRESET_IMPORT_READY,event);
        const imported = await call('tavernPresets.import', { name:event.presetName, content:JSON.stringify(event.data) }); await refresh(); return imported;
      }
      catch (error) { report(error); return false; }
    },
    getTavernRegexes, replaceTavernRegexes,
    updateTavernRegexesWith: async (updater, options) => { const rules = await updater(getTavernRegexes(options)); await replaceTavernRegexes(rules, options); return getTavernRegexes(options); },
    isCharacterTavernRegexesEnabled: () => { const character = RawCharacter.find(); return !!character &&
      (!extensionSettings.character_allowed_regex || extensionSettings.character_allowed_regex.includes(character.avatar)); },
    formatAsTavernRegexedString: (text, source = 'ai_output', destination = 'display', options) => formatWithRegex(text, regexLocation().rules, source, destination, options),
    substituteMacros, substitudeMacros: substituteMacros, errorCatched,
    getMessageId: name => {
      const match = /^TH-message--(\d+)--\d+(?:_\d+)?$/.exec(name);
      if (!match) throw new Error(`Not a message iframe: ${name}`);
      return Number(match[1]);
    },
    registerMacroLike, unregisterMacroLike, triggerSlash, triggerSlashWithResult: triggerSlash,
    registerSlashCommand: (name, callback) => {
      st.SlashCommandParser.addCommand(name, callback, []);
      const command = st.SlashCommandParser.commands[name]; commands.set(name, command);
      return { stop: () => { st.SlashCommandParser.removeCommandObject(command); commands.delete(name); } };
    },
    getScriptId, getIframeName,
    reloadIframe: () => global.location.reload(),
    getScriptTrees, replaceScriptTrees, updateScriptTreesWith, getAllEnabledScriptButtons,
    getScriptName: () => ownScript().script.name, getScriptInfo: () => ownScript().script.info || '', replaceScriptInfo: info => patchOwnScript({ info }),
    getScriptButtons, replaceScriptButtons, updateScriptButtonsWith,
    appendInexistentScriptButtons: (param1,param2) => {const buttons=typeof param1 === 'string' ? param2 : param1;return updateScriptButtonsWith(existing => [...existing, ...buttons.filter(value => !existing.some(button => button.name === value.name))]);},
    getButtonEvent: name => `plugin:${pluginId}:button:${name}`,
    updateAudio: settings => base.audio.setSettings(settings),
    playAudio, pauseAudio, getAudioList, replaceAudioList, appendAudioList, getAudioSettings, setAudioSettings, getCurrentAudio,
    getAudioPlaylist: channel => base.audio.getPlaylist(channel), replaceAudioPlaylist: (channel, items) => base.audio.setPlaylist(channel, items),
  };
  helpers.getLorebookNames = helpers.getWorldbookNames;
  helpers.builtin_prompt_default_order = helpers.placeholder_prompt_default_order;

  const mainGenerations = shared.mainGenerations ||= new Map();
  function mainGenerationFor(payload) {
    const request = mainGenerations.get(payload.conversationId || state.conversationId);
    return request && (!request.runId || !payload.runId || request.runId === payload.runId) ? request : undefined;
  }
  async function ownsNativeGeneration(payload) {
    const request = mainGenerations.get(payload.conversationId || state.conversationId);
    if (!request) return true;
    await request.acknowledgement;
    return request.acknowledged && (!request.runId || !payload.runId || request.runId === payload.runId);
  }
  function settleMainGeneration(payload, error, request) {
    if (!request) return;
    if (error) request.reject(error);
    else request.resolve(payload.message?.content ?? nativeStreams.get(request.conversationId)?.text ?? '');
    request.cleanup();
  }
  function mainGenerationEventOptions(options = {}) {
    return Object.fromEntries(['automatic_trigger', 'force_name2', 'quiet_prompt', 'quietToLoud', 'skipWIAN', 'force_chid', 'signal', 'quietImage']
      .map(name => [name, options[name]]));
  }
  function nativeEvent(name, action, updateState = true) {
    let group = shared.nativeGroups.get(name);
    if (!group) {
      group = { handlers: new Map(), queue: Promise.resolve() };
      const subscribe = shared.onNative ? shared.onNative.bind(shared) : base.events.on.bind(base.events);
      group.stop = subscribe(name, payload => {
        // Record durable deletion before any realm can start a refresh. Do not
        // infer deletion from arbitrary Host errors or substitute another chat.
        if (name === 'chats.deleted') shared.deletedConversations.add(payload.id);
        if (name === 'chats.created') shared.deletedConversations.delete(payload.id);
        const handle = async () => {
          if (name.startsWith('agent.')) {
            const current = mainGenerationFor(payload);
            if (current && ['agent.run.finished','agent.run.failed'].includes(name)) await current.acknowledgement;
            const key = payload.conversationId || state.conversationId;
            shared.nativeMainCompletions ||= new Map();
            if (name === 'agent.state.changed' && payload.state === 'starting' && !current) shared.nativeMainCompletions.delete(key);
            if (['agent.run.finished','agent.run.failed'].includes(name)) {
              const terminal = shared.nativeMainCompletions.get(key);
              if (!payload.nativeMain && (current?.nativeMain || terminal && terminal.runId === payload.runId)) return;
              if (payload.nativeMain) shared.nativeMainCompletions.set(key, { runId:payload.runId });
            }
          }
          const handlers = [...group.handlers.values()];
          const refreshed = await Promise.allSettled(handlers.map(handler => handler.refresh(payload.conversationId)));
          const errors = refreshed.filter(value => value.status === 'rejected' && !isDeletedContext(value.reason)).map(value => value.reason);
          const index = refreshed.findIndex(value => value.status === 'fulfilled');
          if (index >= 0) {
            try { await handlers[index].action(payload, refreshed[index].value); }
            catch (error) { if (!isDeletedContext(error)) errors.push(error); }
          }
          // Successful owners receive the event even if another live owner has
          // a genuine refresh failure. Preserve that failure on the event queue.
          if (errors.length === 1) throw errors[0];
          if (errors.length) throw new AggregateError(errors, `Native event refresh failed: ${name}`);
        };
        // A listener can await a new generation. Its packets must not wait behind that
        // listener, while packets belonging to the same run must stay ordered.
        const request = name.startsWith('agent.') && mainGenerationFor(payload);
        const queueOwner = request || (name.startsWith('agent.') ? shared.nativeAgentEvents ||= {} : group);
        if (name === 'plugin.event') {
          // Independently named plugin events share this Host carrier. A listener
          // can await an echo carried by its next packet; keep invocation order
          // without queuing that echo behind the first listener's completion.
          group.queue = Promise.resolve().then(handle);
          group.queue.catch(report);
          return;
        }
        queueOwner.nativeEventQueue ||= Promise.resolve();
        group.queue = queueOwner.nativeEventQueue = queueOwner.nativeEventQueue.then(handle, handle);
        group.queue.catch(report);
      });
      shared.nativeGroups.set(name, group);
    }
    group.handlers.set(ownerKey, { refresh: async conversationId => {
      await readyPromise;
      if (updateState) return refresh(conversationId, false, true);
      const unavailable = unavailableContext(callbackConversationId || shared.frames?.get(ownerKey)?.authorContext?.conversationId || state?.conversationId);
      if (unavailable) throw unavailable;
      return state;
    }, action });
    cleanups.add(() => {
      group.handlers.delete(ownerKey);
      if (!group.handlers.size) { group.stop(); shared.nativeGroups.delete(name); }
    });
  }
  nativeEvent('messages.changed', async (payload, previous) => {
    if (payload.refresh && payload.refresh !== 'none') {
      clearMessagePresentation(payload.conversationId, payload.refresh === 'all' ? undefined : payload.ids);
      updateContextChat();
    }
    if (payload.conversationId && payload.conversationId !== state.conversationId) return;
    if (previous.conversationId !== state.conversationId) return;
    const before = new Map(previous.messages.map(message => [message.id, message]));
    // Native presentation subscribers can hydrate first. The Host's committed
    // before-images retain the actual edit even when the cache is already new.
    for (const message of payload.beforeMessages || []) before.set(message.id, message);
    for (let index = 0; index < state.messages.length; index++) {
      const message = state.messages[index], old = before.get(message.id);
      if (old && (old.swipe_id || 0) !== (message.swipe_id || 0)) await eventEmit(tavern_events.MESSAGE_SWIPED, index);
      if (!old && message.role === 'user') await eventEmit(tavern_events.MESSAGE_SENT, index);
      if (old && message.content !== old.content && !message.pending) await eventEmit(tavern_events.MESSAGE_EDITED, index);
      if (old && message.reasoning !== old.reasoning && !message.pending) {
        await eventEmit(message.reasoning ? tavern_events.MESSAGE_REASONING_EDITED : tavern_events.MESSAGE_REASONING_DELETED, index);
      }
      if (old && !message.pending && (!sameValue(old.metadata, message.metadata) || old.content !== message.content || old.reasoning !== message.reasoning)) {
        await eventEmit(tavern_events.MESSAGE_UPDATED, index);
      }
      if (old && (old.swipes?.length || 1) > (message.swipes?.length || 1)) {
        const removed = old.swipes.findIndex((value, swipe) => value !== message.swipes?.[swipe]);
        await eventEmit(tavern_events.MESSAGE_SWIPE_DELETED, { messageId:index, swipeId:removed < 0 ? message.swipes.length : removed, newSwipeId:message.swipe_id || 0 });
      }
      const extra = message.metadata?.extra || {}, oldExtra = old?.metadata?.extra || {};
      const files = extra.files || (extra.file ? [extra.file] : []), oldFiles = oldExtra.files || (oldExtra.file ? [oldExtra.file] : []);
      if (files.some(file => !oldFiles.some(previous => previous.url === file.url))) await eventEmit(tavern_events.MESSAGE_FILE_EMBEDDED,index);
      for (const file of oldFiles) if (!files.some(current => current.url === file.url)) await eventEmit(tavern_events.FILE_ATTACHMENT_DELETED,file.url);
      for (const media of oldExtra.media || []) if (!(extra.media || []).some(current => current.url === media.url)) await eventEmit(tavern_events.MEDIA_ATTACHMENT_DELETED,media.url);
    }
    if (previous.messages.some(message => !state.messages.some(current => current.id === message.id))) await eventEmit(tavern_events.MESSAGE_DELETED, state.messages.length);
  });
  nativeEvent('agent.run.finished', async (payload) => {
    if (!await ownsNativeGeneration(payload)) return;
    const messageId = payload.message?.id || payload.messageId;
    const conversationId = payload.conversationId || state.conversationId;
    const request = mainGenerationFor(payload);
    if (!mainGenerations.has(conversationId) || request) shared.mainGenerationOptions?.delete(conversationId);
    const index = conversationId === state.conversationId ? (messageId ? state.messages.findIndex(message => message.id === messageId)
      : state.messages.findLastIndex(message => message.role === 'assistant' && !message.pending)) : -1;
    updateNativeStream(conversationId, { finished: true, ...(index >= 0 ? { text: state.messages[index].content,
      reasoning: state.messages[index].reasoning || '', messageId: state.messages[index].id } : {}) });
    request?.release();
    try {
      if (index >= 0) await finishNativeReasoning(conversationId,index);
      if (index >= 0) await eventEmit(tavern_events.MESSAGE_RECEIVED, index);
      if (messageId || index >= 0) await eventEmit('message.committed', { messageId: messageId || state.messages[index].id, conversationId });
      await eventEmit(tavern_events.GENERATION_ENDED, conversationId === state.conversationId ? state.messages.length : payload.messageCount);
      settleMainGeneration(payload, undefined, request);
    } catch (error) { settleMainGeneration(payload, error, request); throw error; }
  });
  nativeEvent('agent.state.changed', async payload => {
    if (!await ownsNativeGeneration(payload)) return;
    const chat = payload.conversationId || state.conversationId;
    const request = mainGenerationFor(payload);
    if (payload.detail === 'stopped' && (!mainGenerations.has(chat) || request)) shared.mainGenerationOptions?.delete(chat);
    if (payload.state === 'starting') startNativeStream(chat);
    if (payload.detail === 'stopped') updateNativeStream(chat, { stopped: true, finished: true });
    if (payload.state === 'starting' && !request?.started) await eventEmit(tavern_events.GENERATION_STARTED,
      payload.type || 'normal', mainGenerationEventOptions(shared.mainGenerationOptions?.get(chat)), false);
    if (payload.detail === 'stopped') {
      request?.release();
      try {
        await eventEmit(tavern_events.GENERATION_STOPPED);
        await eventEmit(tavern_events.GENERATION_ENDED, chat === state.conversationId ? state.messages.length : payload.messageCount);
        settleMainGeneration(payload, undefined, request);
      } catch (error) { settleMainGeneration(payload, error, request); throw error; }
    }
  });
  nativeEvent('agent.run.failed', async payload => { const chat = payload.conversationId || state.conversationId;
    if (!await ownsNativeGeneration(payload)) return;
    const request = mainGenerationFor(payload);
    if (!mainGenerations.has(chat) || mainGenerationFor(payload)) shared.mainGenerationOptions?.delete(chat);
    updateNativeStream(payload.conversationId || state.conversationId, { stopped: true, finished: true, error: payload.message });
    const error = new Error(payload.message || 'Agent generation failed');
    request?.release();
    try {
      await eventEmit(tavern_events.GENERATION_STOPPED);
      await eventEmit(tavern_events.GENERATION_ENDED, chat === state.conversationId ? state.messages.length : payload.messageCount);
    } finally { settleMainGeneration(payload, error, request); }
  });
  nativeEvent('chat.changed', async payload => {
    shared.messageDisplayHolds.clear();
    shared.messageTimelineHolds.clear();
    if(Object.hasOwn(payload,'conversationId') && !payload.conversationId){await refresh(undefined,false,true);
      await eventEmit(tavern_events.CHAT_CHANGED,null);return;}
    await refresh(payload.conversationId,false,true);
    await eventEmit(tavern_events.CHAT_LOADED,{detail:{id:context.characterId,character:context.characters[context.characterId]}});
    await eventEmit(tavern_events.CHAT_CHANGED,requireState().conversationId);
  },false);
  nativeEvent('groups.changed', payload => eventEmitLifecycle(tavern_events.GROUP_UPDATED, payload.id));
  nativeEvent('personas.changed', async payload => {
    const id = payload.avatarId, value = payload.persona, previous = payload.previous;
    if (payload.operation === 'select') return eventEmitLifecycle(tavern_events.PERSONA_CHANGED, id);
    if (payload.operation === 'delete') return eventEmitLifecycle(tavern_events.PERSONA_DELETED, { avatarId: id, name: previous.name });
    if (payload.operation === 'create') return eventEmitLifecycle(tavern_events.PERSONA_CREATED, { avatarId: id, name: value.name, description: value.description || '', title: value.title || '' });
    if (previous.name !== value.name) await eventEmitLifecycle(tavern_events.PERSONA_RENAMED, { avatarId: id, oldName: previous.name, newName: value.name });
    await eventEmitLifecycle(tavern_events.PERSONA_UPDATED, id);
  });
  nativeEvent('characters.changed', async payload => {
    const character = payload.character, previous = payload.previous;
    if (payload.operation === 'delete') return eventEmitLifecycle(tavern_events.CHARACTER_DELETED, { id: payload.index, character: clone(previous) });
    if (payload.operation !== 'update') return;
    if (previous.name !== character.name) await eventEmitLifecycle(tavern_events.CHARACTER_RENAMED, previous.avatar, character.avatar);
    await eventEmitLifecycle(tavern_events.CHARACTER_EDITED, { detail: { id: rawCharacterIndex(payload.characterId), character: RawCharacter.find({ name: payload.characterId }) || clone(character) } });
  });
  nativeEvent('characters.pageLoaded', () => eventEmit(tavern_events.CHARACTER_PAGE_LOADED));
  nativeEvent('characters.historyRenamed', payload => eventEmit(tavern_events.CHARACTER_RENAMED_IN_PAST_CHAT,
    payload.messages.map(tavernMessage), payload.oldAvatar, payload.newAvatar), false);
  nativeEvent('characters.selectionModeChanging', payload => eventEmit(tavern_events.CHARACTER_GROUP_OVERLAY_STATE_CHANGE_BEFORE, Number(payload.state)), false);
  nativeEvent('characters.selectionModeChanged', payload => eventEmit(tavern_events.CHARACTER_GROUP_OVERLAY_STATE_CHANGE_AFTER, Number(payload.state)), false);
  nativeEvent('characters.managementOptionSelected', payload => eventEmit(tavern_events.CHARACTER_MANAGEMENT_DROPDOWN, String(payload.optionId)), false);
  hostEvent(tavern_events.OPEN_CHARACTER_LIBRARY, async forceDefault => {
    shared.pendingCharacterLibraryOpen = (shared.pendingCharacterLibraryOpen || 0) + 1;
    try {
      const opened=await call('characters.openLibrary', {forceDefault: !!forceDefault});
      if(!opened)shared.pendingCharacterLibraryOpen=Math.max(0,shared.pendingCharacterLibraryOpen-1);
    }catch(error){shared.pendingCharacterLibraryOpen=Math.max(0,shared.pendingCharacterLibraryOpen-1);throw error;}
  });
  nativeEvent('characters.libraryOpened', payload => {
    if(shared.pendingCharacterLibraryOpen){shared.pendingCharacterLibraryOpen--;return;}
    return eventEmit(tavern_events.OPEN_CHARACTER_LIBRARY, !!payload.forceDefault);
  }, false);
  nativeEvent('characters.editorOpened', payload => eventEmit(tavern_events.CHARACTER_EDITOR_OPENED, rawCharacterIndex(payload.characterId)));
  nativeEvent('chats.created', payload => eventEmitLifecycle(payload.groupId ? tavern_events.GROUP_CHAT_CREATED : tavern_events.CHAT_CREATED), false);
  nativeEvent('chats.deleted', payload => {
    for (const key of shared.renderedTools?.keys() || []) if (key.startsWith(payload.id + ':')) shared.renderedTools.delete(key);
    shared.itemizedPromptHistory.delete(payload.id);
    return eventEmitLifecycle(tavern_events.ITEMIZED_PROMPTS_DELETED,{chatId:payload.id,all:false}).then(() =>
      eventEmitLifecycle(payload.groupId ? tavern_events.GROUP_CHAT_DELETED : tavern_events.CHAT_DELETED, payload.id));
  }, false);
  nativeEvent('chats.renamed', payload => eventEmitLifecycle(tavern_events.CHAT_RENAMED, {
    avatarId: payload.avatarId, groupId: payload.groupId || undefined, oldFileName: payload.id, newFileName: payload.id,
    oldTitle: payload.oldTitle, newTitle: payload.newTitle,
  }), false);
  nativeEvent('groups.roundStarted', payload => eventEmit(tavern_events.GROUP_WRAPPER_STARTED, payload.groupId));
  nativeEvent('groups.roundFinished', payload => eventEmit(tavern_events.GROUP_WRAPPER_FINISHED, payload.groupId));
  nativeEvent('groups.speakerChanged', payload => eventEmit(tavern_events.GROUP_MEMBER_DRAFTED, rawCharacterIndex(payload.characterId)));
  nativeEvent('scripts.changed', () => eventEmit('eleckoi:scripts-changed'));
  nativeEvent('settings.changed', async payload => {
    if (payload.shared) await eventEmit(tavern_events.SETTINGS_UPDATED);
    else await eventEmit('eleckoi:plugin-settings-changed',payload.pluginId);
  });
  nativeEvent('presets.changed', async payload => {
    if (payload.compatibilityEvents === false) return;
    if (payload.action === 'selected') {
      await eventEmit(tavern_events.OAI_PRESET_CHANGED_AFTER);
      await eventEmit(tavern_events.PRESET_CHANGED,{apiId:payload.apiId,name:payload.name});
    } else if (payload.action === 'deleted') await eventEmit(tavern_events.PRESET_DELETED,{apiId:payload.apiId,name:payload.oldName});
    else if (payload.action === 'renamed') await eventEmit(tavern_events.PRESET_RENAMED,{apiId:payload.apiId,oldName:payload.oldName,newName:payload.name});
  });
  nativeEvent('scripts.error', payload => { throw new Error(`Script synchronization failed: ${payload.message}`); }, false);
  nativeEvent('regex.changed', () => eventEmit(tavern_events.CHAT_CHANGED, requireState().conversationId));
  nativeEvent('extensions.changed', async payload => {
    if (payload.action === 'installed' || payload.action === 'updated') await eventEmitLifecycle(tavern_events.EXTENSION_SETTINGS_LOADED,requireState().plugins?.[payload.id]);
    await eventEmitLifecycle('eleckoi:extensions-changed',payload);
  });
  function connectionEventState() {return {mainApi:context.mainApi,source:requireState().connection?.source || 'custom',model:requireState().model || '',onlineStatus:context.onlineStatus};}
  async function publishConnectionChange() {
    const previous=shared.connectionEventState,next=connectionEventState();shared.connectionEventState=next;
    if (!previous) return;
    if (previous.mainApi !== next.mainApi) await eventEmit(tavern_events.MAIN_API_CHANGED,{apiId:next.mainApi});
    if (next.mainApi === 'openai' && previous.source !== next.source) await eventEmit(tavern_events.CHATCOMPLETION_SOURCE_CHANGED,next.source);
    if (next.mainApi === 'openai' && previous.model !== next.model) await eventEmit(tavern_events.CHATCOMPLETION_MODEL_CHANGED,next.model);
    if (previous.onlineStatus !== next.onlineStatus) await eventEmit(tavern_events.ONLINE_STATUS_CHANGED,next.onlineStatus);
  }
  nativeEvent('models.selectionChanged', async payload => {
    if (!payload.conversationId || payload.conversationId === state.conversationId) await publishConnectionChange();
  });
  nativeEvent('models.connectionStatusChanged', async () => { await publishConnectionChange(); });
  nativeEvent('models.changed', async payload => {
    await eventEmit('eleckoi:models-changed', payload);
    if (payload.action === 'selected') await publishConnectionChange();
  });
  nativeEvent('messages.loaded',async payload=>{
    if(payload.conversationId === state.conversationId) await eventEmit(tavern_events.MORE_MESSAGES_LOADED);
  });
  nativeEvent('ui.panelsReset',()=>eventEmit(tavern_events.MOVABLE_PANELS_RESET),false);
  nativeEvent('audio.state.changed', payload => {
    const value = payload.state; if (value?.channel) Object.assign(shared.audioState.states[value.channel] ||= {}, clone(value));
  }, false);
  nativeEvent('audio.time.updated', payload => {
    const value = payload.state; if (value?.channel) Object.assign(shared.audioState.states[value.channel] ||= {}, clone(value));
  }, false);
  nativeEvent('agent.output.delta', payload => {
    const chat = payload.conversationId || state.conversationId, old = nativeStreams.get(chat) || startNativeStream(chat);
    // New hosts send cumulative snapshots first; legacy hosts only send deltas.
    const text = typeof payload.text === 'string' ? payload.text : old.snapshotOutput && old.messageId === payload.messageId ? old.text
      : (old.messageId && old.messageId !== payload.messageId ? '' : old.text) + (payload.delta || '');
    updateNativeStream(chat, { messageId: payload.messageId, text, firstTokenAt: old.firstTokenAt ?? Date.now() });
    return eventEmit(tavern_events.STREAM_TOKEN_RECEIVED, text);
  }, false);
  nativeEvent('agent.stream.updated', payload => {
    const chat = payload.conversationId || state.conversationId;
    const old = nativeStreams.get(chat) || startNativeStream(chat);
    updateNativeStream(chat, { messageId: payload.messageId, runId: payload.runId, text: payload.text || '',
      reasoning: payload.reasoning || '', toolCalls: clone(payload.toolCalls || []), process: clone(payload.process || []),
      images: clone(payload.images || []), snapshotOutput: true,
      firstTokenAt: old.firstTokenAt ?? (payload.text ? Date.now() : null) });
  }, false);
  nativeEvent('tts.started', payload => eventEmit(tavern_events.TTS_JOB_STARTED, clone(payload)), false);
  nativeEvent('agent.tools.performed', async payload => {
    await eventEmit(tavern_events.TOOL_CALLS_PERFORMED, clone(payload.invocations));
    if (payload.conversationId === state.conversationId) {
      await refresh(payload.conversationId, false);
      await shared.notifyMessageRendered(payload.conversationId, [payload.messageId]);
    }
  }, false);
  nativeEvent('tts.audioReady', payload => eventEmit(tavern_events.TTS_AUDIO_READY, clone(payload)), false);
  nativeEvent('tts.completed', payload => eventEmit(tavern_events.TTS_JOB_COMPLETE, clone(payload)), false);
  nativeEvent('plugin.event', payload => emitEntries(payload.event, [payload.payload], undefined, payload.pluginId,
    Object.hasOwn(payload, 'conversationId') ? payload.conversationId
      : shared.captureAuthorContext ? shared.captureAuthorContext()?.conversationId ?? null : state?.conversationId), false);
  nativeEvent('worldbooks.activated', async payload => {
    if(!payload.compatNotified && payload.activatedEntries?.length)await eventEmit(tavern_events.WORLD_INFO_ACTIVATED,payload.activatedEntries.map(entry=>rawWorldbookEntry(entry,entry.world)));
  }, false);
  nativeEvent('worldbooks.settingsChanged', payload => eventEmit(tavern_events.WORLDINFO_SETTINGS_UPDATED, clone(payload)));
  nativeEvent('appearance.changed', () => {});

  async function beforeGeneration(payload) {
    try {
      await readyPromise; await refresh(payload.conversationId);
      if (['chat','normal','continue','regenerate','swipe'].includes(payload.purpose)) {
        const options = shared.mainGenerationOptions?.get(payload.conversationId) || {};
        await eventEmitOwned(tavern_events.GENERATION_AFTER_COMMANDS, payload.purpose === 'chat' ? 'normal' : payload.purpose,
          mainGenerationEventOptions({ automatic_trigger:false, ...options }), payload.dryRun === true);
      }
      await eventEmitOwned('generation.before', payload);
      for (const [name, value] of macros) if (typeof value === 'function') await call('macros.register', { name, value: String(value()) });
      await persistInjections(); await flush();
      await call('plugins.hookResult', { token: payload.token });
      if (!payload.dryRun && payload.consumeOnce !== false) for (const [id, injection] of injections) if (injection.once) injections.delete(id);
    } catch (error) {
      report(error); await call('plugins.hookResult', { token: payload.token, error: String(error) });
    } finally {
      await refresh();
    }
  }
  global.__ElecKoiBeforeGeneration = payload => {
    const run = async () => {
      const causal = [...pendingGenerationContexts].find(request => request.conversationId === payload.conversationId
        && request.parentConversationId === callbackConversationId && (!payload.id || !request.id || payload.id === request.id));
      try { return await inConversation(payload.conversationId, () => beforeGeneration(payload), causal?.parentConversationId); }
      finally { if (causal?.method === 'generation.start') pendingGenerationContexts.delete(causal); }
    };
    hookQueue = hookQueue.then(run, run);
    hookQueue.catch(report);
    return hookQueue;
  };
  global.__ElecKoiFlush = async token => {
    try { await flush(); await call('plugins.hookResult', { token }); }
    catch (error) { report(error); await call('plugins.hookResult', { token, error: String(error) }); }
  };
  global.__ElecKoiToolSnapshot = async payload => {
    try {
      await readyPromise; await refresh(payload.conversationId, false);
      const bus = shared.stRegistrations, result = [];
      for (const tool of st.ToolManager.tools) {
        const descriptor = tool.toFunctionOpenAI(), name = descriptor.function.name;
        const operation = bus.operations.findLast(value => value.method === 'registerFunctionTool' && value.args[0].name === name);
        const version = operation && bus.toolVersions.get(operation.args[0].__eleckoiVersion);
        if (version ? await version.eligible(payload.conversationId) : await tool.shouldRegister()) {
          result.push({ ...descriptor, function: { ...descriptor.function, description: descriptor.function.description ?? '' }, __eleckoiVersion: version?.id,
            __eleckoiDisplayName: st.ToolManager.getDisplayName(name) || name, __eleckoiStealth: tool.stealth === true });
        }
      }
      await flush(); await call('plugins.hookResult', { token: payload.token, result });
    } catch (error) { report(error); await call('plugins.hookResult', { token: payload.token, error: String(error) }); }
  };
  global.__ElecKoiInvokeTool = async payload => {
    try {
      await readyPromise; await refresh(payload.conversationId, false);
      const version = payload.version && shared.stRegistrations.toolVersions.get(payload.version);
      if (payload.version && !version) throw new Error(`Tool callback owner has closed: ${payload.name}`);
      const result = version ? await version.invoke(payload.conversationId, payload.arguments, payload.signal)
        : await st.ToolManager.invokeFunctionTool(payload.name, payload.arguments);
      const failed = result instanceof Error || Object.prototype.toString.call(result) === '[object Error]';
      await flush(); await call('plugins.hookResult', { token: payload.token, result: { content: failed ? String(result) : result ?? '', success: !failed } });
    } catch (error) { report(error); await call('plugins.hookResult', { token: payload.token, error: String(error) }); }
  };
  global.__ElecKoiResolveMacros = payload => {
    const evaluate = async () => {
      try {
        await readyPromise; await refresh(payload.conversationId, false);
        const evaluateTexts = () => payload.texts.map(text => substituteMacros(text));
        st.sync();
        const result = payload.readOnly ? st.withReadOnlyEvaluation(evaluateTexts) : evaluateTexts();
        await flush(); await call('plugins.hookResult', { token: payload.token, result });
      } catch (error) { report(error); await call('plugins.hookResult', { token: payload.token, error: String(error) }); }
    };
    hookQueue = hookQueue.then(evaluate, evaluate); return hookQueue;
  };
  global.__ElecKoiGroupOpening = async payload => {
    try {
      await readyPromise;
      const character = clone(payload.character), greetings = [character.first_mes, ...(character.data?.alternate_greetings || [])].filter(Boolean);
      const event = { input: greetings.length ? greetings[Math.floor(Math.random() * greetings.length)] : '', output: '', character };
      const result = await inConversation(payload.conversationId, async () => {
        await emitEntries(tavern_events.CHARACTER_FIRST_MESSAGE_SELECTED, [event], undefined, undefined, payload.conversationId);
        st.sync();
        const content = event.output || event.input;
        return content ? substituteMacros(content.trim(), { name2Override: character.name }) : '';
      });
      await flush(); await call('plugins.hookResult', { token: payload.token, result });
    } catch (error) { report(error); await call('plugins.hookResult', { token: payload.token, error: String(error) }); }
  };
  global.__ElecKoiGroupRound = async payload => {
    try {
      await readyPromise; await refresh(payload.conversationId, false); st.sync();
      const group = context.groups.find(value => value.id === context.groupId);
      if (!group) throw new Error(`Group does not exist: ${context.groupId}`);
      const members = group.members.filter(avatar => !group.disabled_members?.includes(avatar));
      let selected;
      switch (Number(group.activation_strategy || 0)) {
        case 0: selected = st.activateNaturalOrder(members, payload.input, context.chat.at(-1), group.allow_self_responses, true); break;
        case 1: selected = st.activateListOrder(members); break;
        case 2: selected = []; break;
        case 3: selected = st.activatePooledOrder(members, context.chat.at(-1), true); break;
        default: throw new Error(`Unknown group activation strategy: ${group.activation_strategy}`);
      }
      await call('plugins.hookResult', { token: payload.token, result: selected.map(index => context.characters[index].native_id) });
    } catch (error) { report(error); await call('plugins.hookResult', { token: payload.token, error: String(error) }); }
  };
  global.__ElecKoiGroupPrompts = async payload => {
    try {
      await readyPromise; await refresh(payload.conversationId, false); st.sync();
      const card = st.getGroupCharacterCards(context.groupId, context.characterId);
      const depthPrompts = st.getGroupDepthPrompts(context.groupId, context.characterId);
      await flush(); await call('plugins.hookResult', { token: payload.token, result: { card, depthPrompts } });
    } catch (error) { report(error); await call('plugins.hookResult', { token: payload.token, error: String(error) }); }
  };

  global.__ElecKoiRenderContext = async payload => {
    try {
      await readyPromise; await refresh(payload.conversationId,false); st.sync();
      const content=st.renderStoryString(payload.fields,{customContextSettings:payload.settings});
      await flush();await call('plugins.hookResult',{token:payload.token,result:content});
    }catch(error){report(error);await call('plugins.hookResult',{token:payload.token,error:String(error)});}
  };
  global.__ElecKoiProcessImagePrompt = async payload => {
    try {
      await readyPromise;
      const parameters=clone(payload.parameters),event={prompt:parameters.prompt || '',generationType:parameters.generationType ?? 6,
        message:parameters.message ?? '',trigger:parameters.trigger ?? parameters.prompt ?? ''};
      await inConversation(payload.conversationId,()=>emitEntries(tavern_events.SD_PROMPT_PROCESSING,[event],undefined,undefined,payload.conversationId));
      await flush();
      await call('plugins.hookResult',{token:payload.token,result:{...parameters,prompt:event.prompt}});
    }catch(error){report(error);await call('plugins.hookResult',{token:payload.token,error:String(error)});}
  };
  async function beforeProviderRequest(conversationId, format, body, promptReady = true, dryRun = false) {
      await readyPromise;
      const request = clone(body);
      const info = {conversationId,format,request};
      await emitEntries('generation.provider.before',[info],undefined,undefined,conversationId);
      if (promptReady && format === 'ChatCompletions') {
        const event = {chat:info.request.messages,dryRun,conversationId};
        await emitEntries(tavern_events.CHAT_COMPLETION_PROMPT_READY,[event],undefined,undefined,conversationId);
        info.request.messages = event.chat;
      }
      await emitEntries(tavern_events.GENERATE_AFTER_DATA,[info.request,dryRun],undefined,undefined,conversationId);
      await flush();
      return info.request;
  }
  global.__ElecKoiBeforeProviderRequest = async payload => {
    try {
      const result = await beforeProviderRequest(payload.conversationId,payload.format,payload.request,true,payload.dryRun === true);
      if (!payload.dryRun) await recordItemizedRequest(payload.conversationId,payload.format,result);
      await call('plugins.hookResult',{token:payload.token,result});
    } catch(error) { report(error); await call('plugins.hookResult',{token:payload.token,error:String(error)}); }
  };
  global.__ElecKoiFreezeControlSettings = async payload => {
    try {
      const result = await inConversation(payload.conversationId,async()=>{
        const controls = clone(payload.controls), selection = controls.textCompletion;
        if (!selection) return controls;
        const named = selection.instruct ? context.__eleckoiPresetManager('instruct').getCompletionPresetByName(selection.instruct) : null;
        if (selection.instruct && !named) throw new Error(`Instruct preset does not exist: ${selection.instruct}`);
        const instruct = {...named,...selection.instructSettings};
        const freeze = () => {
          if (instruct.macro) for (const [key,value] of Object.entries(instruct)) if (typeof value === 'string') {
            const nameMarker = '__ELECKOI_INSTRUCT_NAME__';
            instruct[key] = substituteMacros(value.replace(/{{name}}/gi,nameMarker)).replaceAll(nameMarker,'{{name}}');
          }
          for (const [key,value] of Object.entries(selection.settings || {})) if (typeof value === 'string' && value.includes('{{')) selection.settings[key] = substituteMacros(value);
        };
        st.sync(); if (payload.readOnly) st.withReadOnlyEvaluation(freeze); else freeze();
        selection.instruct = ''; selection.instructSettings = instruct; selection.frozen = true;
        await flush(); return controls;
      });
      await call('plugins.hookResult',{token:payload.token,result});
    } catch(error) { report(error); await call('plugins.hookResult',{token:payload.token,error:String(error)}); }
  };
  global.__ElecKoiPrepareTextProviderRequest = async payload => {
    try {
      const result = await inConversation(payload.conversationId, async () => {
        const controls = payload.controls, selection = controls.textCompletion;
        const wire = clone(payload.request), tools = wire.tools || [], images = [];
        for (const message of wire.messages) for (const part of Array.isArray(message.content) ? message.content : []) {
          if (part.type !== 'image_url') continue;
          if (!['ollama','openrouter'].includes(selection.type)) throw new Error(`Text backend ${selection.type} does not accept image inputs; select a vision-capable chat protocol`);
          let url = part.image_url.url;
          if (selection.type === 'ollama' && !/^data:/i.test(url)) {
            if (!/^https?:/i.test(url) || url.startsWith('https://eleckoi-media.invalid/')) url = await call('media.read',{url});
            else {
              const response = await call('network.request',{url,responseType:'base64'});
              if (!response.ok) throw new Error(`Image download HTTP ${response.status}`);
              url = `data:${response.headers['Content-Type'] || response.headers['content-type'] || 'image/png'};base64,${response.body}`;
            }
          }
          images.push(url);
        }
        let imageIndex = 0;
        const messages = wire.messages.map(message => {
          const content = typeof message.content === 'string' ? message.content : Array.isArray(message.content)
            ? message.content.map(part=>part.text ?? (part.image_url ? `[Image ${++imageIndex}]` : JSON.stringify(part))).join('\n') : '';
          if (message.role === 'tool') return {role:'system',content:`Tool result (${message.tool_call_id}):\n${content}`};
          if (message.tool_calls?.length) return {role:'assistant',content:(content ? content+'\n' : '')+JSON.stringify({eleckoi_tool_calls:message.tool_calls.map(call=>({name:call.function.name,arguments:JSON.parse(call.function.arguments || '{}'),id:call.id}))})};
          return {...message,content};
        });
        if (tools.length) messages.unshift({role:'system',content:
          'You are running in the ElecKoi Agent. Available function tools:\n'+JSON.stringify(tools)+
          '\nTo call tools, output only {"eleckoi_tool_calls":[{"name":"tool_name","arguments":{}}]}. Do not claim that a tool ran before its result is supplied. Otherwise reply normally.'});
        const instruct = selection.type === 'novel' ? {} : typeof selection.instruct === 'string' && selection.instruct
          ? {...context.__eleckoiPresetManager('instruct').getCompletionPresetByName(selection.instruct),...selection.instructSettings}
          : {...selection.instructSettings};
        const promptBias = messages.at(-1)?.role === 'assistant' ? messages.pop().content : '';
        const names = controls.names || {user_name:context.name1,char_name:context.name2};
        const formatted=messages.map(message=>({message:st.formatInstructModeChat(message.name ?? message.role,message.content,
          message.role === 'user',message.role === 'system','',names.user_name,names.char_name,false,instruct),extensionPrompts:[],injected:message.role==='system'}));
        const generatedPromptCache=st.formatInstructModePrompt(controls.impersonate ? names.user_name : names.char_name,!!controls.impersonate,
            promptBias,names.user_name,names.char_name,true,!!controls.quietToLoud,instruct);
        const snapshot=requireState(),rawCard=[...(snapshot.rawCharacters || []),...(snapshot.characters || []),...context.characters].find(card=>
          card.data && [card.native_id,card.id].includes(snapshot.characterId))?.data || {},persona=snapshot.personas?.find(value=>value.avatar_id===snapshot.personaId);
        const worldbookScan=controls.skipChatHooks ? {} : await call('worldbooks.lastScan',{conversationId:payload.conversationId}) || {};
        const worldText=position=>(worldbookScan.entries || []).filter(entry=>entry.worldbookPosition===position).map(entry=>entry.content).join('\n');
        const components={api:selection.mainApi || context.mainApi,combinedPrompt:null,
          description:rawCard.description || '',personality:rawCard.personality || '',persona:persona?.description || '',scenario:rawCard.scenario || '',
          char:names.char_name,user:names.user_name,worldInfoBefore:worldText('before_character_definition'),worldInfoAfter:worldText('after_character_definition'),
          beforeScenarioAnchor:'',afterScenarioAnchor:'',storyString:'',mesExmString:rawCard.mes_example || '',mesSendString:formatted.map(value=>value.message).join(''),
          finalMesSend:formatted,generatedPromptCache,main:messages.filter(message=>message.role==='system').map(message=>message.content).join('\n'),
          jailbreak:'',naiPreamble:selection.settings?.preamble || ''};
        if(!controls.skipChatHooks)await emitEntries(tavern_events.GENERATE_BEFORE_COMBINE_PROMPTS,[components],undefined,undefined,payload.conversationId);
        const prompt=components.combinedPrompt || formatted.map(value=>value.extensionPrompts.join('')+value.message).join('')+generatedPromptCache;
        const event = {prompt,dryRun:!!payload.controls.dryRun};
        if (!controls.skipChatHooks) await emitEntries(tavern_events.GENERATE_AFTER_COMBINE_PROMPTS,[event],undefined,undefined,payload.conversationId);
        const frozenSettings = {...Object.fromEntries(Object.keys(context.textCompletionSettings).map(key=>[key,undefined])),...selection.settings};
        const options = context.TextCompletionService.presetToGeneratePayload(frozenSettings, {}, {
          prompt:event.prompt, model:wire.model, stream:controls.stream ?? true, api_type:selection.type, api_server:selection.connection?.baseUrl,
          max_tokens:controls.responseLength || wire.max_tokens || wire.max_completion_tokens || selection.settings?.genamt || 1024,
          ...(controls.stop?.length ? {stop:controls.stop} : {}),
          ...(wire.response_format?.json_schema ? {json_schema:wire.response_format.json_schema} : {}),
          ...(images.length ? {images:images.map(url=>{
            if (selection.type !== 'ollama') return url;
            const match = /^data:([^,]*),(.*)$/s.exec(url);
            if (!match) throw new Error('Ollama requires image bytes; the image URL was not resolved');
            if (/;base64/i.test(match[1])) return match[2];
            return global.btoa(String.fromCharCode(...new TextEncoder().encode(decodeURIComponent(match[2]))));
          })} : {}),
        });
        const plan = await context.__eleckoiPrepareRequest('textgenerationwebui',options,null,{scope:captured(),connection:selection.connection,dryRun:!!controls.dryRun || !!controls.skipChatHooks});
        if (!controls.dryRun && !controls.skipChatHooks) await recordItemizedRequest(payload.conversationId,'textgenerationwebui',plan.body,components);
        return {...plan,toolNames:tools.map(tool=>tool.function?.name).filter(Boolean)};
      });
      await call('plugins.hookResult',{token:payload.token,result});
    } catch(error) { report(error); await call('plugins.hookResult',{token:payload.token,error:String(error)}); }
  };
  global.__ElecKoiPostProcessRequest = async payload => {
    try {
      await readyPromise;
      const controls = payload.controls || {};
      const result = st.postProcessPrompt(clone(payload.messages), controls.promptPostProcessing || '', st.getPromptNames({body:controls.names || {}}));
      await call('plugins.hookResult', {token:payload.token,result});
    } catch (error) { report(error); await call('plugins.hookResult', {token:payload.token,error:String(error)}); }
  };

  async function invokeModel(options = {}) {
    await readyPromise; await flush();
    const id = options.id || `model-${Date.now()}-${Math.random()}`;
    activeGenerations.add(id);
    try { return await call('generation.invoke', { ...captured(), ...options, id }); }
    finally { activeGenerations.delete(id); }
  }
  async function hostFetch(url, options = {}) {
    const { signal, ...request } = options;
    if (signal?.aborted) throw signal.reason || new Error('Network request aborted');
    const id = request.id || `network-${Date.now()}-${Math.random()}`;
    const abort = () => call('network.cancel', { id }).catch(report);
    signal?.addEventListener('abort', abort, { once: true });
    try {
      const result = await call('network.request', { url, ...request, id });
      return { ...result, text: async () => result.body, json: async () => JSON.parse(result.body) };
    } finally { signal?.removeEventListener('abort', abort); }
  }
  const isNativeEvent = event => event !== 'generation.before' && (/^(agent\.|generation\.|audio\.|tts\.|worldbooks\.|groups\.|scripts\.|extensions\.|models\.)/.test(event) || ['messages.changed', 'chat.changed', 'plugin.event'].includes(event));

  global.ElecKoi = Object.freeze({ ...base, call: publicCall, ready, flush,
    appearance: {},
    media: { ...base.media,
      imageSettings: value => call('media.imageSettings', value === undefined ? {} : { value }),
      generate: options => call('media.generate', { ...captured(), ...options }),
      gallery: options => call('media.gallery', { ...captured(), ...options }),
      read: url => call('media.read', { url }),
      expressions: options => call('media.expressions', { ...captured(), ...options }),
      uploadExpression: options => call('media.uploadExpression', { ...captured(), ...options }),
    },
    connections: st.createConnectionApi(context, {call,flush,capture:captured,emit:eventEmit,
      notifySelection:publishConnectionChange,
      connection: () => requireState().connection || {}, presetName: () => shared.presetState.name, loadPreset,
      updateConnection: value => { requireState().connection = value; requireState().model = value.model; } }),
    models: {list: () => call('models.list'), put: config => call('models.put',{config}), delete: id => call('models.delete',{id}),
      refresh: id => call('models.refresh',{id}), select: async (id,model) => {
        const value = await call('models.select',{...captured(),id,model}); requireState().connection = {configId:value.id,baseUrl:value.baseUrl,model:value.model,models:value.models || [],apiFormat:value.apiFormat,provider:value.provider,
          source:extensionSettings.eleckoi_api_sources?.[value.id] || (value.apiFormat === 'anthropic_messages' ? 'claude' : value.apiFormat === 'google_gemini' ? 'makersuite' : 'custom')}; requireState().model=value.model;
        await publishConnectionChange();return value;
      } },
    quickReplies: st.createQuickReplyApi(context, { shared, owner: ownerKey, cleanup: cleanups, ready, on: eventOn, flush, report,
      installUi: () => call('ui.register', { pluginId: 'eleckoi-compat', descriptor: {
        id: 'quick-replies', label: '快捷回复', kind: 'panel', html: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:16px;color:var(--SmartThemeBodyColor);background:var(--SmartThemeBlurTintColor)}button{font:inherit;padding:8px;margin:4px}#replies{display:flex;flex-wrap:wrap;gap:6px}</style></head><body><div id="replies"></div><button id="manage">管理快捷回复</button><button id="refresh">刷新</button><p id="error"></p><script>ElecKoi.ready().then(()=>{const api=ElecKoi.quickReplies;const render=()=>api.renderInto(document.getElementById('replies'));render();document.getElementById('refresh').onclick=render;document.getElementById('manage').onclick=async()=>{try{await api.openManager();render()}catch(error){document.getElementById('error').textContent=String(error)}}}).catch(error=>document.getElementById('error').textContent=String(error));<\/script></body></html>`
      } }),
      document: () => documentForUi(), input: value => base.input.set(value), send: () => base.input.send() }),
    tts: makeSpeechApi(),
    notes: Object.freeze({
      get: () => ({ content: context.chatMetadata.note_prompt ?? extensionSettings.note?.default ?? '',
        depth: context.chatMetadata.note_depth ?? extensionSettings.note?.defaultDepth ?? 4,
        frequency: context.chatMetadata.note_interval ?? extensionSettings.note?.defaultInterval ?? 1,
        position: context.chatMetadata.note_position ?? extensionSettings.note?.defaultPosition ?? 1,
        role: context.chatMetadata.note_role ?? extensionSettings.note?.defaultRole ?? 0 }),
      set: async patch => {
        const keys = { content: 'note_prompt', depth: 'note_depth', frequency: 'note_interval', position: 'note_position', role: 'note_role' };
        for (const [key, value] of Object.entries(patch)) {
          if (!keys[key]) throw new Error(`Unknown Author's Note field: ${key}`);
          if (key !== 'content' && (!Number.isInteger(value) || value < 0)) throw new TypeError(`Author's Note ${key} must be a nonnegative integer`);
          if (['position', 'role'].includes(key) && value > 2) throw new RangeError(`Author's Note ${key} must be 0, 1 or 2`);
          context.chatMetadata[keys[key]] = key === 'content' ? String(value) : value;
        }
        context.saveMetadataDebounced(); await flush();
      },
    }),
    tokens: Object.freeze({ count: (text, options = {}) => countTokens(text, options.encoding || tokenizerEncoding()),
      encode: (text, options = {}) => { const encoding = options.encoding || tokenizerEncoding(); return encoding.startsWith('remote-') ? remoteTokenize(text, encoding).ids : tokenizerRuntime().encode(text, encoding); },
      decode: (ids, options = {}) => tokenizerRuntime().decode(ids, options.encoding || tokenizerEncoding()),
      info: () => { const encoding = tokenizerEncoding(); return { encoding, model: requireState().model || '',
        implementation: /_base$|_edit$/.test(encoding) ? 'js-tiktoken-1.0.21' : encoding === 'estimate' ? 'utf8-estimate-3.35' : 'web-tokenizers-0.1.6-pre3' }; },
      select: async type => {
        const names = tokenizerIds;
        const selection = names[String(type).toUpperCase()] ?? type;
        const encoding = tokenizerEncoding(selection);
        if (!encoding.startsWith('remote-')) countTokens('', encoding); // Reject missing vocabularies before changing persisted settings.
        (extensionSettings.power_user ||= {}).tokenizer = selection;
        context.saveSettingsDebounced(); await flush(); return encoding;
      } }),
    compatibility: Object.freeze({ version: '0.1.0', target: 'TavernHelper 4.11.2 / SillyTavern 1.19.0', helpers: Object.keys(helpers) }),
    plugins: Object.freeze({ list: () => call('plugins.list'), install: (id, manifest) => call('plugins.install', { id, manifest }),
      openManager: () => call('plugins.openManager'), remove: id => call('plugins.remove', { id }), setEnabled: (id, enabled) => call('plugins.setEnabled', { id, enabled }) }),
    secrets: Object.freeze({ read: id => call('secrets.read', {id}),
      write: options => call('secrets.write', options), rename: (id,label) => call('secrets.rename', {id,label}),
      delete: id => call('secrets.delete', {id}) }),
    scripts: { getTrees: getScriptTrees, replaceTrees: replaceScriptTrees, updateTrees: updateScriptTreesWith, buttons: getScriptButtons,
      replaceButtons: replaceScriptButtons, updateButtons: updateScriptButtonsWith },
    extensions: { installed: () => clone({ ...requireState().components, ...requireState().plugins }), info: id => call('extensions.info', { id }),
      install: (url, type = 'local') => call('extensions.install', { url, type }), update: id => call('extensions.update', { id }), remove: id => call('extensions.remove', { id }) },
    storage: Object.freeze({ kv: { get: key => call('storage.get', { key }), set: (key, value) => call('storage.set', { key, value }),
      delete: key => call('storage.delete', { key }), list: () => call('storage.list') }, sqlite: { open: async database => ({
        execute: async (sql, params = []) => (await call('storage.sql', { database, statements: [{ sql, params }] }))[0],
        query: async (sql, params = []) => (await call('storage.sql', { database, statements: [{ sql, params }] }))[0].rows,
        transaction: statements => call('storage.transaction', { database, statements }),
      }) } }),
    settings: { get: () => call('settings.get'), set: value => call('settings.set', { value }) },
    files: { saveText: options => call('files.saveText', options) },
    generation: { invoke: invokeModel,
      preview: async options => { await readyPromise; await flush(); return call('generation.preview', { ...captured(), ...options }); },
      request: (data, options = {}) => context.ChatCompletionService.sendRequest(data, options.extractData ?? true, options.signal),
      invokeRaw: options => invokeModel({ ...options, raw: true }),
      start: async options => { await readyPromise; await flush(); return call('generation.start', { ...captured(), ...options }); },
      get: id => call('generation.get', { id }), cancel: id => call('generation.cancel', { id }) },
    prompt: { inject: injectPrompts, remove: uninjectPrompts, preview: () => clone([...injections.values()].map(({ filter, ...entry }) => entry)),
      beforeGeneration: listener => eventOn('generation.before', listener),
      beforeProviderRequest: listener => eventOn('generation.provider.before',listener) },
    net: { fetch: hostFetch, cancel: id => call('network.cancel', { id }) },
    extras: {
      get modules(){return [...(shared.extrasModules || [])];},
      get connected(){return shared.extrasConnected === true;},
      fetch: (url,options={})=>hostFetch(url,{...options,headers:{...(extensionSettings.apiKey ? {Authorization:`Bearer ${extensionSettings.apiKey}`} : {}),...options.headers}}),
      connect: async (url=extensionSettings.apiUrl,key=extensionSettings.apiKey)=>{
        if(!url)throw new Error('Extras API URL is required');
        const endpoint=new URL(url);endpoint.pathname='/api/modules';endpoint.search='';endpoint.hash='';
        try {
          const response=await hostFetch(endpoint.toString(),{headers:key ? {Authorization:`Bearer ${key}`} : {}});
          if(!response.ok)throw new Error(`Extras HTTP ${response.status}: ${await response.text()}`);
          const data=await response.json();
          if(!Array.isArray(data.modules) || data.modules.some(value=>typeof value!=='string'))throw new TypeError('Extras /api/modules must return a string modules array');
          extensionSettings.apiUrl=String(url);extensionSettings.apiKey=key || '';shared.extrasModules=[...data.modules];shared.extrasConnected=true;
          await context.saveSettingsDebounced();await flush();await eventEmit(tavern_events.EXTRAS_CONNECTED,[...data.modules]);
          return [...data.modules];
        }catch(error){shared.extrasConnected=false;shared.extrasModules=[];throw error;}
      },
      disconnect:()=>{shared.extrasConnected=false;shared.extrasModules=[];},
    },
    variables: { ...base.variables, edit: editVariables,
      readScope: options => call('variables.readScope', { ...captured(), ...options }),
      writeScope: (value, options) => call('variables.writeScope', { ...captured(), ...options, value }) },
    worldbooks: { list: () => call('worldbooks.list'), get: name => call('worldbooks.get', { name }),
      scan: async options => {await readyPromise;await flush();return call('worldbooks.scan',{...captured(),...options});},
      settings: () => call('worldbooks.settings'), setSettings: value => call('worldbooks.settings', { value }), lastScan: options => call('worldbooks.lastScan', { ...captured(), ...options }),
      put: (name, book) => call('worldbooks.put', { name, book }), delete: name => call('worldbooks.delete', { name }),
      bind: (scope, names, options) => call('worldbooks.bind', { ...captured(), ...options, scope, names }),
      bindings: (scope, options) => call('worldbooks.bindings', { ...captured(), ...options, scope }),
      timedEffect: (name, uid, effect, value) => call('worldbooks.timedEffect', { ...captured(), name, uid, effect, ...(value === undefined ? {} : { state: value }) }) },
    databank: { settings: () => call('databank.settings'), configure: value => call('databank.settings', { value }),
      list: options => call('databank.list', { ...captured(), ...options }), get: (id, options) => call('databank.get', { ...captured(), ...options, id }),
      put: document => call('databank.put', { ...captured(), ...document }), delete: (id, options) => call('databank.delete', { ...captured(), ...options, id }),
      setEnabled: (id, enabled, options) => call('databank.setEnabled', { ...captured(), ...options, id, enabled }),
      ingest: options => call('databank.ingest', { ...captured(), ...options }), purge: options => call('databank.purge', { ...captured(), ...options }),
      search: (query, options) => call('databank.search', { ...captured(), ...options, query }), embed: input => call('databank.embed', { input: Array.isArray(input) ? input : [input] }) },
    characters: { list: () => call('characters.list'), read: options => call('characters.read', { ...captured(), ...options }),
      rename: async (id,name,options = {}) => { const result = await call('characters.rename', {...captured(),...options,characterId:id,name}); await refresh(); return result; },
      write: (character, options) => call('characters.write', { ...captured(), ...options, character }),
      raw: reference => helpers.getCharData(reference), get: getCharacter, create: helpers.createCharacter,
      replace: replaceCharacter, delete: helpers.deleteCharacter, import: importRawCharacter,
      openLibrary: options => call('characters.openLibrary',{...options}) },
    chat: { ...base.chat, createStored: options => call('chats.create', { ...captured(), ...options }),
      close: async () => { await flush(); return call('chats.close'); },
      temporary: async () => { await flush(); const id=await call('chats.temporary'); await call('chats.open',{id}); await refresh(id); return id; },
      openHistory: () => call('chats.openHistory', captured()),
      branch: async (index, options = {}) => { const target = captured(); await flush();
        const value = await call('chats.branch', { ...target, ...options, index }); await refresh(); return value; },
      generateFromHistory: (type = 'normal', options = {}) => context.generate(type, options),
      import: importRawChat, export: options => call('chats.export', { ...captured(), ...options }),
      rename: (name, options) => call('chats.rename', { ...captured(), ...options, name }) },
    groups: { list: () => call('groups.list'), get: id => call('groups.get', { id }),
      put: async group => { const result = await call('groups.put', { group }); await refresh(); return result; },
      delete: async id => { const result = await call('groups.delete', { id }); await refresh(); return result; },
      createChat: async (id, title) => { const chat = await call('groups.createChat', { id, title }); await refresh(); return chat; },
      bind: async id => { await call('groups.bind', { ...captured(), id }); await refresh(); } },
    personas: { list: () => call('personas.list'), get: id => call('personas.get', { ...captured(), id }),
      binding: async (scope = 'chat', id) => {
        const value = await call('personas.binding', { ...captured(), scope, ...(id === undefined ? {} : { id }) });
        if (id !== undefined) await refresh(); return value;
      },
      set: persona => call('personas.set', { ...captured(), persona }),
      select: async (id, options = {}) => { await call('personas.select', { ...captured(), ...options, id }); await refresh(); },
      put: (id, name, persona) => call('personas.put', { ...captured(), id, name, persona }),
      delete: id => call('personas.delete', { ...captured(), id }) },
    presets: { list: () => call('presets.list'), get: id => call('presets.get', { id: id || requireState().presetId }),
      select: id => call('presets.select', { id }), update: (id, preset) => call('presets.update', { id, preset }),
      exportTavern: async reference => {
        await readyPromise; await flush();
        const raw = await call('tavernPresets.export', { reference: reference || 'in_use' });
        const preset = typeof raw === 'string' ? JSON.parse(raw) : raw;
        await eventEmit(tavern_events.OAI_PRESET_EXPORT_READY,preset);
        return preset;
      } },
    regex: { get: options => call('regex.get', { ...captured(), ...options }),
      set: (rules, options) => call('regex.set', { ...captured(), ...options, rules }) },
    slash: { execute: executeSlashCommandsWithOptions, register: (descriptor) => {
      const command = st.SlashCommand.fromProps(descriptor); st.SlashCommandParser.addCommandObject(command); commands.set(command.name, command);
      return () => { st.SlashCommandParser.removeCommandObject(command); commands.delete(command.name); };
    }, list: () => Object.values(st.SlashCommandParser.commands).filter((value, index, list) => list.indexOf(value) === index) },
    macros: { register: registerMacro, substitute: substituteMacros, registry: st?.macros.registry, engine: st?.macros.engine,
      unregister: context.unregisterMacro },
    ui: { registerMessageSurface, notifyMessageRendered: (ids, type = 'normal') => shared.notifyMessageRendered(requireState().conversationId, Array.isArray(ids) ? ids : [ids], type), register: descriptor => {
      const { onClick, ...value } = descriptor;
      if (onClick) eventOn(`plugin:${pluginId}:button:${descriptor.id}`, onClick);
      return call('ui.register', { descriptor: value });
    }, unregister: id => { eventClearEvent(`plugin:${pluginId}:button:${id}`); return call('ui.unregister', { id }); },
      open: id => call('ui.open', { id }), close: () => call('ui.close'), list: () => call('ui.list'),
      emit: (event, payload) => {
        const conversationId = callbackConversationId !== undefined ? callbackConversationId
          : shared.frames?.get(ownerKey)?.authorContext?.conversationId
            || (shared.captureAuthorContext ? shared.captureAuthorContext()?.conversationId ?? null : state?.conversationId ?? null);
        return publicCall('plugins.emitEvent', { conversationId, event, payload });
      } },
    messages: { ...base.messages, read: options => call('messages.read', { ...captured(), ...options }),
      update: (messages, options) => call('messages.update', { ...captured(), messages, ...options }),
      insert: (messages, options) => call('messages.insert', { ...captured(), messages, ...options }),
      delete: (ids, options) => call('messages.delete', { ...captured(), ids, ...options }),
      swipes: (id, value, options) => call('messages.swipes', { ...captured(), ...options, ...value, id }),
      metadata: (id, value, options) => call('messages.metadata', { ...captured(), id, value, ...options }) },
    events: { ...base.events, on: (event, listener) => isNativeEvent(event) ? base.events.on(event, listener) : eventOn(event, listener, 'last', false, false).stop,
      off: (event, listener) => isNativeEvent(event) ? base.events.off(event, listener) : eventRemoveListener(event, listener, false),
      once: (event, listener) => {
        if (!isNativeEvent(event)) return eventOn(event, listener, 'last', true, false).stop;
        const stop = base.events.on(event, payload => { stop(); Promise.resolve().then(() => listener(payload)).catch(report); });
        return stop;
      }, emit: eventEmit },
  });
  const localeData = shared.localeData ||= new Map();
  const translate = (text, key = text) => localeData.get(st.getCurrentLocale())?.[key] ?? localeData.get(st.getCurrentLocale().split('-')[0])?.[key] ?? text;
  const markdownConverter = new st.libs.showdown.Converter({ tables: true, strikethrough: true, simpleLineBreaks: true });
  function messageFormatting(text, name = context.name2, isSystem = false, isUser = false, messageId, sanitizer = {}, isReasoning = false) {
    const formatter = st.MessageFormatter, meta = { characterName: name, isSystem, isUser, messageId, isReasoning };
    let result = formatter.runStage(formatter.stage.BEFORE_REGEX, String(text || ''), meta);
    const source = isReasoning ? 'reasoning' : isUser ? 'user_input' : 'ai_output';
    const depth = typeof messageId === 'number' ? context.chat.length - messageId - 1 : undefined;
    result = formatWithRegex(result, regexLocation().rules, source, 'display', { depth, character_name: name });
    result = formatter.runStage(formatter.stage.AFTER_REGEX, result, meta);
    result = formatter.runStage(formatter.stage.AFTER_MARKDOWN, markdownConverter.makeHtml(result), meta);
    return st.libs.DOMPurify.sanitize(result, sanitizer);
  }
  async function deleteMessage(id, swipeIndex, confirm = false, deleteToolCalls = true) {
    await readyPromise;
    const index = indexOf(id), message = context.chat[index];
    if (confirm && !await st.Popup.show.confirm('Delete message', 'Delete this message?')) return;
    if (swipeIndex !== undefined && swipeIndex !== null) {
      if (!Number.isInteger(swipeIndex) || swipeIndex < 0 || swipeIndex >= message.swipes.length) throw new RangeError('Swipe index out of range');
      const swipes = message.swipes.filter((_, index) => index !== swipeIndex);
      if (!swipes.length) return deleteChatMessages(index);
      return setChatMessages([{ message_id: index, swipes, swipe_id: Math.min(message.swipe_id, swipes.length - 1),
        swipes_data: message.swipes_data.filter((_, index) => index !== swipeIndex), swipes_info: message.swipes_info.filter((_, index) => index !== swipeIndex) }]);
    }
    let begin = index;
    if (deleteToolCalls && !message.is_user && !message.is_system) while (begin > 0 && context.chat[begin - 1].is_system && Array.isArray(context.chat[begin - 1].extra?.tool_invocations)) begin--;
    return deleteChatMessages(Array.from({ length: index - begin + 1 }, (_, offset) => begin + offset));
  }
  async function saveReply({ type = 'normal', getMessage = '', title = '', reasoning = '', imageUrls = [], reasoningSignature = null } = {}) {
    await readyPromise;
    const last = context.chat.at(-1), extra = { api: context.mainApi, model: context.getChatCompletionModel(), reasoning, reasoning_signature: reasoningSignature,
      ...(imageUrls.length ? { media: imageUrls.map(url => ({ url, type: 'image' })) } : {}) };
    if (last && !last.is_user && ['swipe', 'append', 'continue', 'appendFinal'].includes(type)) {
      const index = context.chat.length - 1;
      if (type === 'swipe') {
        const swipes = [...last.swipes, getMessage], info = [...(last.swipes_info || []), { extra }];
        await setChatMessages([{ message_id: index, swipes, swipe_id: swipes.length - 1, swipes_info: info, reasoning }]);
      } else await setChatMessages([{ message_id: index, message: type === 'appendFinal' ? getMessage : last.mes + getMessage, reasoning, title, extra: { ...last.extra, ...extra } }]);
    } else await createChatMessages([{ role: 'assistant', name: context.name2, message: getMessage, reasoning, title, extra }]);
    return { getMessage, reasoning };
  }
  function requireDisplaySurface() { const surface = displaySurface(); if (!surface) throw new Error('No visible message surface is registered'); return surface; }
  function updateMessageBlock(id, message = context.chat[indexOf(id)], { rerenderMessage = true } = {}) {
    const index = indexOf(id), native = requireState().messages[index].id, surface = requireDisplaySurface();
    const elements = surface.retrieve(native), element = elements?.nodeType ? elements : elements?.[0];
    if (rerenderMessage) surface.refresh(native, messageFormatting(message.extra?.display_text ?? message.mes, message.name, message.is_system, message.is_user, index), element);
    if (element) context.updateReasoningUI(global.$(element.closest('.mes') || element));
  }
  function scrollChatToBottom({ waitForFrame = false } = {}) {
    const document = requireDisplaySurface().root.ownerDocument;
    const scroll = () => document.defaultView.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'auto' });
    return waitForFrame ? new Promise(resolve => document.defaultView.requestAnimationFrame(() => { scroll(); resolve(); })) : scroll();
  }
  async function renderExtensionTemplateAsync(extension, template, data = {}, sanitize = true, localize = true) {
    const response = await global.fetch(new URL(`/plugin/${encodeURIComponent(extension)}/${template}.html`, global.location.href));
    if (!response.ok) throw new Error(`Template ${extension}/${template}: HTTP ${response.status}`);
    let html = st.libs.Handlebars.compile(await response.text())(data);
    if (sanitize) html = st.libs.DOMPurify.sanitize(html);
    if (localize) { const fragment = global.document.createElement('template'); fragment.innerHTML = html;
      for (const element of fragment.content.querySelectorAll('[data-i18n]')) element.textContent = translate(element.textContent, element.dataset.i18n);
      html = fragment.innerHTML;
    }
    return html;
  }
  function appendMediaToMessage(message, element, scrollBehavior = 'adjust') {
    st.ensureMessageMediaIsArray(message);
    const root = element?.jquery ? element[0] : element;
    if (root?.nodeType !== 1) throw new TypeError('appendMediaToMessage requires a real displayed message element');
    const document = root.ownerDocument, window = document.defaultView;
    const offset = window.scrollY, before = document.documentElement.scrollHeight;
    let media = root.querySelector('.mes_media_wrapper'), files = root.querySelector('.mes_file_wrapper');
    if (!media) { media = document.createElement('div'); media.className = 'mes_media_wrapper'; root.appendChild(media); }
    if (!files) { files = document.createElement('div'); files.className = 'mes_file_wrapper'; root.appendChild(files); }
    media.replaceChildren(); files.replaceChildren();
    const display = st.getMediaDisplay(message); root.dataset.mediaDisplay = display;
    root.querySelector('.mes_text')?.classList.toggle('inline_media', message.extra?.inline_image === false);
    const attachments = message.extra?.media || [], selected = Number(st.getMediaIndex(message));
    const adjust = () => { if (scrollBehavior === 'keep') window.scrollTo(0, offset);
      else if (scrollBehavior === 'adjust') window.scrollTo(0, offset + document.documentElement.scrollHeight - before); };
    attachments.forEach((attachment, index) => {
      const tag = attachment.type === 'video' ? 'video' : attachment.type === 'audio' ? 'audio' : 'img';
      const wrapper = document.createElement('div'); wrapper.className = 'mes_img_container'; wrapper.dataset.index = String(index);
      wrapper.hidden = display === 'gallery' && index !== selected;
      const item = document.createElement(tag); item.className = tag === 'img' ? 'mes_img' : `mes_${tag}`;
      item.title = attachment.title || message.extra?.title || ''; item.style.maxWidth = '100%';
      if (tag !== 'img') item.controls = true; else item.alt = item.title;
      item.addEventListener(tag === 'img' ? 'load' : 'loadedmetadata', adjust, { once: true });
      item.addEventListener('error', () => { item.classList.add('error'); report(new Error(`Message media failed to load: ${attachment.url}`)); }, { once: true });
      item.src = attachment.url; wrapper.append(item); media.append(wrapper);
    });
    if (display === 'gallery' && attachments.length > 1) for (const direction of [-1, 1]) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = direction < 0 ? '‹' : '›';
      button.addEventListener('click', () => { Promise.resolve().then(async () => {
        await eventEmit(tavern_events.IMAGE_SWIPED,{message,element:global.$(root),direction:direction < 0 ? 'left' : 'right'});
        message.extra.media_index = (Number(st.getMediaIndex(message)) + direction + attachments.length) % attachments.length;
        appendMediaToMessage(message, element, 'keep'); await context.saveChat();
      }).catch(report); }); media.append(button);
    }
    for (const file of message.extra?.files || []) { const link = document.createElement('a'); link.href = file.url; link.textContent = file.name || file.url; link.download = file.name || ''; files.append(link); }
    return element;
  }
  const scrapers = shared.dataBankScrapers ||= new Map();
  const documentParsers = shared.documentParsers ||= new Map();
  function registerDocumentParser(parser) {
    if (!parser?.id || typeof parser.accepts !== 'function' || typeof parser.parse !== 'function') throw new TypeError('Document parser requires id, accepts(file) and parse(file)');
    if (documentParsers.has(parser.id)) throw new Error(`Document parser already registered: ${parser.id}`);
    const registration = { parser, owner: ownerKey, invoke: (scope, file, options) => inConversation(scope.conversationId, () => parser.parse(file, options)) };
    documentParsers.set(parser.id, registration);
    const dispose = () => { if (documentParsers.get(parser.id) === registration) documentParsers.delete(parser.id); cleanups.delete(dispose); };
    cleanups.add(dispose); return dispose;
  }
  async function registerDataBankScraper(scraper) {
    if (!scraper?.id || typeof scraper.scrape !== 'function' || typeof scraper.isAvailable !== 'function') throw new TypeError('Scraper requires id, scrape() and isAvailable()');
    if (scrapers.has(scraper.id)) { console.warn(`Scraper with ID ${scraper.id} already registered`); return; }
    await scraper.init?.(); scrapers.set(scraper.id, { scraper, owner: ownerKey });
    cleanups.add(() => { if (scrapers.get(scraper.id)?.owner === ownerKey) scrapers.delete(scraper.id); });
  }
  async function importDataFile(file, options = {}) {
    const scope = captured();
    if (!file || typeof file.arrayBuffer !== 'function') throw new TypeError('Document import requires a File or Blob');
    for (const registration of [...documentParsers.values()].reverse()) if (await registration.parser.accepts(file)) {
      const text = await registration.invoke(scope, file, options);
      if (typeof text !== 'string') throw new TypeError(`Document parser ${registration.parser.id} must return text`);
      return call('databank.put', { ...scope, ...options, text, name: options.name || file.name || 'Document' });
    }
    const host = global.parent?.__ElecKoiShared ? global.parent : global;
    if (!host.__ElecKoiDocuments) {
      host.__ElecKoiDocumentLoading ||= new Promise((resolve, reject) => {
        const script = host.document.createElement('script'); script.src = '/eleckoi-runtime/author-libraries/document-parsers.global.js';
        script.onload = () => resolve(host.__ElecKoiDocuments);
        script.onerror = () => reject(new Error('Failed to load document parsers'));
        host.document.head.append(script);
      });
      try { await host.__ElecKoiDocumentLoading; }
      catch (error) { delete host.__ElecKoiDocumentLoading; throw error; }
    }
    let text = await host.__ElecKoiDocuments.extractDocumentText(file, options);
    if (file.type === 'text/html' || /\.html?$/i.test(file.name || '')) {
      const document = new global.DOMParser().parseFromString(text, 'text/html');
      document.querySelectorAll('script,style').forEach(element => element.remove());
      const article = new st.libs.Readability(document.cloneNode(true)).parse(); text = article?.textContent || document.body.textContent;
    }
    return call('databank.put', { ...scope, ...options, name: options.name || file.name, text });
  }
  Object.assign(global.ElecKoi.databank, {
    importFile: importDataFile,
    registerParser: registerDocumentParser,
    parsers: () => [...documentParsers.values()].map(({ parser }) => ({ id: parser.id, name: parser.name || parser.id })),
    scrapers: () => [...scrapers.values()].map(({ scraper }) => ({ id: scraper.id, name: scraper.name, description: scraper.description, iconClass: scraper.iconClass, iconAvailable: scraper.iconAvailable })),
    runScraper: async (id, options = {}) => { const scope = captured(), registration = scrapers.get(id); if (!registration) throw new Error(`Data Bank scraper does not exist: ${id}`);
      const scraper = registration.scraper; if (!await scraper.isAvailable()) throw new Error(`Data Bank scraper is unavailable: ${id}`);
      const files = await scraper.scrape(); return Promise.all((files || []).map(file => importDataFile(file, { ...scope, ...options }))); },
  });
  const debugFunctions = shared.debugFunctions ||= new Map();
  const ttsProviders = shared.ttsProviders ||= new Map();
  const ttsRequests = new Map();
  async function synthesizeSpeech(text, options = {}) {
    const id = options.id || `tts-${st.uuidv4()}`;
    const eventScope = { messageId: options.messageId ?? null, characterName: options.characterName ?? requireState().characterName ?? '' };
    const voiceId = options.voiceId ?? options.voice ?? null;
    const provider = ttsProviders.get(options.provider);
    if (!provider) return call('tts.synthesize', { ...eventScope, ...options, id, text: String(text) });
    const controller = new AbortController(); ttsRequests.set(id, controller);
    await eventEmit(tavern_events.TTS_JOB_STARTED, { id, ...eventScope, text: String(text), voiceId, provider: options.provider });
    try {
      const value = await provider.synthesize(String(text), { ...options, id, signal: controller.signal });
      if (controller.signal.aborted) throw controller.signal.reason || new Error('TTS cancelled');
      if (!value || typeof value.url !== 'string') throw new TypeError('TTS provider must return an audio URL');
      const result = { ...value, id, ...eventScope, text: String(text), voiceId, audio: value.url, status: 'completed' };
      await eventEmit(tavern_events.TTS_AUDIO_READY, result); await eventEmit(tavern_events.TTS_JOB_COMPLETE, result); return result;
    } finally { ttsRequests.delete(id); }
  }
  function makeSpeechApi() { return {
    settings: () => call('tts.settings'), configure: settings => call('tts.configure', { settings }),
    voices: options => ttsProviders.has(options?.provider) ? ttsProviders.get(options.provider).voices(options) : call('tts.voices', options || {}),
    synthesize: synthesizeSpeech,
    speak: async (text, options = {}) => { const result = await synthesizeSpeech(text, options);
      await base.audio.play({ channel: 'voice', track: { url: result.url, name: options.title || String(text), mimeType: result.mimeType || 'audio/wav' } }); return result; },
    stop: async id => { if (id && ttsRequests.has(id)) { ttsRequests.get(id).abort(new Error('TTS cancelled')); return true; }
      const cancelled = id ? await call('tts.cancel', { id }) : false; await base.audio.stop('voice'); return cancelled; },
    state: id => call('tts.state', { id }),
    providers: () => [{ id: 'system', name: 'Android System TTS' }, { id: 'openai', name: 'OpenAI compatible TTS' },
      ...[...ttsProviders].map(([id, value]) => ({ id, name: value.name || id }))],
    registerProvider: definition => {
      if (!definition?.id || typeof definition.voices !== 'function' || typeof definition.synthesize !== 'function') throw new TypeError('TTS provider requires id, voices() and synthesize()');
      if (['system', 'openai'].includes(definition.id) || ttsProviders.has(definition.id)) throw new Error(`TTS provider already registered: ${definition.id}`);
      ttsProviders.set(definition.id, { ...definition, owner: ownerKey });
      const remove = () => { if (ttsProviders.get(definition.id)?.owner === ownerKey) ttsProviders.delete(definition.id); };
      cleanups.add(remove); return remove;
    },
  }; }
  cleanups.add(() => { for (const controller of ttsRequests.values()) controller.abort(new Error('TTS document closed')); });
  const nativeStreams = shared.nativeStreams ||= new Map();
  const streamSubscribers = shared.streamSubscribers ||= new Map();
  const localProcessors = new Map();
  function startNativeStream(chat) {
    const record = { text: '', reasoning: '', toolCalls: [], process: [], images: [], messageId: '', startedAt: Date.now(), firstTokenAt: null, finished: false, stopped: false };
    nativeStreams.set(chat, record); localProcessors.delete(chat); return record;
  }
  function updateNativeStream(chat, value) {
    let record = nativeStreams.get(chat); if (!record) record = startNativeStream(chat);
    if (value.reasoning && !record.reasoningStartedAt) record.reasoningStartedAt = Date.now();
    if (value.text && record.reasoningStartedAt && !record.reasoningEndedAt) record.reasoningEndedAt = Date.now();
    Object.assign(record, value);
    for (const listener of streamSubscribers.get(chat) || []) listener(record);
  }
  async function finishNativeReasoning(chat,index) {
    const record = nativeStreams.get(chat);
    if (!record?.reasoning || record.reasoningDone) return;
    record.reasoningDone = true;
    record.reasoningEndedAt ||= Date.now();
    await eventEmit(tavern_events.STREAM_REASONING_DONE,record.reasoning,
      record.reasoningStartedAt ? record.reasoningEndedAt - record.reasoningStartedAt : 0,index,'done');
  }
  async function* nativeStream(chat, signal) {
    const queue = [], listeners = streamSubscribers.get(chat) || new Set(); streamSubscribers.set(chat, listeners);
    let wake;
    const push = record => { queue.push({ ...record }); wake?.(); wake = null; };
    const abort = () => { wake?.(); wake = null; };
    listeners.add(push); signal.addEventListener('abort', abort);
    const initial = nativeStreams.get(chat); if (initial) push(initial);
    try {
      while (!signal.aborted) {
        if (!queue.length) await new Promise(resolve => { wake = resolve; });
        if (signal.aborted) break;
        const record = queue.shift();
        if (record.error) throw new Error(record.error);
        yield { text: record.text, swipes: [], toolCalls: record.toolCalls || [], state: { reasoning: record.reasoning || '', images: record.images || [], signature: record.signature || '' } };
        if (record.finished) return;
      }
    } finally { listeners.delete(push); signal.removeEventListener('abort', abort); if (!listeners.size) streamSubscribers.delete(chat); }
  }
  Object.defineProperty(context, 'streamingProcessor', { enumerable: true, get: () => {
    const chat = requireState().conversationId;
    const record = nativeStreams.get(chat);
    if (!record) return undefined;
    let processor = localProcessors.get(chat);
    if (!processor || processor.timeStarted.getTime() !== record.startedAt) {
      processor = st.createStreamingProcessor(context, {
        document: documentForUi, retrieve: index => { const surface = displaySurface(), message = requireState().messages[index];
          if (!surface || !message) return null; const target = surface.retrieve(message.id), node = target?.nodeType ? target : target?.[0]; return node?.closest('.mes') || node; },
        stream: nativeStream, stop: id => { if (id !== requireState().conversationId) throw new Error('The running chat is no longer active in this document'); return base.chat.stopGeneration(); },
      }, { native: true, conversationId: chat });
      localProcessors.set(chat, processor);
    }
    processor.observe(record); return processor;
  } });
  cleanups.add(() => { for (const processor of localProcessors.values()) processor.abortController.abort(new Error('Streaming document closed')); });
  if (!extensionSettings.tags) {
    extensionSettings.tags = [];
    shared.lastExtensionSettings.tags = [];
  }
  extensionSettings.tagMap ||= {};
  function importTags(value, characterId) {
    const tags = extensionSettings.tags, tagMap = extensionSettings.tagMap;
    const character = typeof characterId === 'number' ? context.characters[characterId] : RawCharacter.find({ name: characterId || 'current' });
    if (!character) throw new Error(`Character does not exist: ${characterId}`);
    const names = Array.isArray(value) ? value : String(value || '').split(',').map(value => value.trim()).filter(Boolean);
    const assigned = tagMap[character.avatar] ||= [];
    for (const name of names) { let tag = tags.find(value => value.name === name);
      if (!tag) { tag = { id: st.uuidv4(), name, color: '', color2: '' }; tags.push(tag); }
      if (!assigned.includes(tag.id)) assigned.push(tag.id);
    }
    context.saveSettingsDebounced(); return assigned;
  }
  let swipeState = 'none', swipesHidden = false;
  const documentForUi = () => displaySurface()?.root?.ownerDocument || global.document;
  shared.itemizedPromptHistory ||= new Map();
  async function loadCurrentItemizedHistory(conversationId) {
    if (shared.itemizedCurrentChat === conversationId) return loadItemizedHistory(conversationId);
    shared.itemizedCurrentChat = conversationId;
    shared.itemizedPromptHistory.delete(conversationId);
    return loadItemizedHistory(conversationId);
  }
  async function loadItemizedHistory(conversationId) {
    if (!conversationId) return [];
    if (shared.itemizedPromptHistory.has(conversationId)) return shared.itemizedPromptHistory.get(conversationId);
    const data = await call('prompts.history', {conversationId});
    const value = Array.isArray(data) ? data : [];
    if (!shared.itemizedPromptHistory.has(conversationId)) {
      shared.itemizedPromptHistory.set(conversationId, value);
      await eventEmit(tavern_events.ITEMIZED_PROMPTS_LOADED, {chatId:conversationId});
    }
    return shared.itemizedPromptHistory.get(conversationId);
  }
  async function recordItemizedRequest(conversationId, format, request, components) {
    return inConversation(conversationId, async () => {
      const pending = state.messages.findLastIndex(message => message.pending && message.role === 'assistant');
      const mesId = pending >= 0 ? pending : context.chat.length;
      const entry = {mesId,rawPrompt:format === 'textgenerationwebui' ? request.prompt : JSON.stringify(request),
        main_api:context.mainApi,model:request.model || state.model,presetName:shared.presetState.name,
        messagesCount:request.messages?.length ?? context.chat.length,format,request:clone(request),
        ...(components ? {components:clone(components)} : {})};
      const value = await call('prompts.history', {conversationId,operation:'save',entry});
      shared.itemizedPromptHistory.set(conversationId,Array.isArray(value) ? value : [entry]);
      await eventEmit(tavern_events.ITEMIZED_PROMPTS_SAVED,{chatId:conversationId});
    });
  }
  Object.assign(global.ElecKoi.prompt, {
    history: (options = {}) => loadItemizedHistory(options.conversationId || captured().conversationId).then(clone),
    clearHistory: async (options = {}) => {
      const scope = {...captured(),...options};
      await call('prompts.history',{...scope,operation:options.all ? 'clear' : 'delete'});
      if (options.all) shared.itemizedPromptHistory.clear(); else shared.itemizedPromptHistory.delete(scope.conversationId);
      await eventEmit(tavern_events.ITEMIZED_PROMPTS_DELETED,options.all ? {all:true} : {chatId:scope.conversationId,all:false});
    },
  });
  function applyMessageStyle(document, style) {
    if (!style) return;
    let sheet = document.getElementById('eleckoi-message-style');
    if (!sheet) { sheet = document.createElement('style'); sheet.id = 'eleckoi-message-style'; document.head.append(sheet); }
    sheet.textContent = style === 'single' ? '#chat .portrait-lane,#chat .author-line,#chat .ch_name,#chat .avatar{display:none}#chat .turn{grid-template-columns:minmax(0,1fr)}' :
      style === 'bubble' ? '#chat .mes_text{border-radius:12px;padding:12px;background:var(--SmartThemeChatTintColor,rgba(127,127,127,.12))}' : '';
    document.documentElement.dataset.eleckoiMessageStyle = style;
  }
  Object.assign(global.ElecKoi.ui, {
    getChatDocument: () => {
      const surface = displaySurface(); if (!surface) throw new Error('No visible message surface is registered');
      return surface.root.ownerDocument;
    },
    chatPanels: action => call('ui.chatPanels', { action }),
    setCssVariable(target, name, value) {
      if (typeof name !== 'string' || !name.startsWith('--')) throw new TypeError('CSS variable names must start with --');
      const selector = { chat:'#chat', background:'#bg1', gallery:'#gallery', zoomedAvatar:'div.zoomed_avatar' }[target];
      if (!selector) throw new Error(`Invalid CSS target: ${target}`);
      const surface = displaySurface(); if (!surface) throw new Error('No visible message surface is registered');
      const elements = surface.root.ownerDocument.querySelectorAll(selector);
      if (!elements.length) throw new Error(`CSS target is not displayed: ${target} (${selector})`);
      const nativeAliases = { '--SmartThemeBodyColor':['--body-text','--text'], '--SmartThemeQuoteColor':['--quote-text'],
        '--SmartThemeEmColor':['--italic-text'], '--SmartThemeBorderColor':['--line'], '--SmartThemeBlurTintColor':['--panel'] };
      for (const element of elements) {
        element.style.setProperty(name, value);
        for (const alias of nativeAliases[name] || []) element.style.setProperty(alias, value);
      }
    },
    reloadChat() {
      const surface = displaySurface(); if (!surface) throw new Error('No visible message surface is registered');
      releaseMessagePresentation(captured()).then(() => surface.root.ownerDocument.defaultView.location.reload()).catch(report);
    },
  });
  Object.assign(global.ElecKoi.appearance, {
    backgrounds: options => call('appearance.backgrounds', { ...captured(), ...options }),
    selectBackground: (name, options) => call('appearance.selectBackground', { ...captured(), ...options, name }),
    setBackground: async (value, options = {}) => {
      if (!value || typeof value.url !== 'string' || typeof value.path !== 'string') throw new TypeError('Background requires url and path strings');
      const scope = { ...captured(), ...options };
      // ST passes a CSS background-image value; the native repository needs image bytes.
      const match = /^url\(\s*(['"]?)(.*?)\1\s*\)$/is.exec(value.url);
      const metadata = await call('appearance.forceBackground', { ...scope, url: value.url, path: value.path, image: match ? match[2] : value.url });
      if (requireState().conversationId === scope.conversationId) {
        Object.assign(context.chatMetadata, metadata);
        documentForUi()?.querySelector('#bg1')?.style.setProperty('background-image', value.url);
      }
      return metadata;
    },
    lockBackground: (locked, options) => call('appearance.lockBackground', { ...captured(), ...options, locked }),
    theme: name => call('appearance.theme', { name: name || '' }),
    palette: options => call('appearance.palette', { ...captured(), ...options }),
    messageStyle: async style => {
      const result = await call('appearance.messageStyle', { style });
      for (const surface of shared.displaySurfaces.values()) applyMessageStyle(surface.root.ownerDocument, result);
      requireState().messageStyle = result; return result;
    },
  });
  function setSwipeVisibility(hidden) {
    swipesHidden = hidden;
    for (const element of documentForUi().querySelectorAll('.swipe_left,.swipe_right,.swipes-counter,[data-action="swipe-left"],[data-action="swipe-right"]')) element.hidden = hidden;
  }
  async function swipeMessage(event, direction, options = {}) {
    const index = options.forceMesId ?? (options.message ? context.chat.indexOf(options.message) : Number(event?.currentTarget?.closest('.mes')?.getAttribute('mesid') ?? context.chat.length - 1));
    const message = context.chat[index];
    if (!message) throw new RangeError(`Message index out of range: ${index}`);
    if (message.is_user || requireState().isGenerating || swipeState !== 'none') throw new Error('This message cannot be swiped now');
    let next = options.forceSwipeId ?? ((message.swipe_id || 0) + (direction === 'left' ? -1 : direction === 'right' ? 1 : 0));
    if (next < 0) next = direction === 'left' ? Math.max(0,(message.swipes?.length || 1)-1) : 0;
    if (next >= (message.swipes?.length || 1)) { await context.generate('swipe'); return; }
    swipeState = 'swiping';
    try { await setChatMessages([{ message_id: index, swipe_id: next }]); }
    finally { swipeState = 'none'; }
  }
  async function generateQuietPrompt(parameters = {}, ...positional) {
    if (typeof parameters !== 'object' || parameters === null) {
      const [quietToLoud, skipWIAN, quietImage, quietName, responseLength, forceChId, jsonSchema] = positional;
      parameters = { quietPrompt:parameters, quietToLoud, skipWIAN, quietImage, quietName, responseLength, forceChId, jsonSchema };
    }
    const { quietPrompt = '', quietToLoud = false, skipWIAN = false, quietImage = null, quietName = null,
      responseLength = null, forceChId = null, jsonSchema = null, removeReasoning = true, trimToSentence = false } = parameters;
    let result = await context.generate('quiet', { ...parameters, quiet_prompt:quietPrompt ?? '', quietToLoud:quietToLoud ?? false,
      skipWIAN:skipWIAN ?? false, force_name2:true, quietImage, quietName, responseLength, force_chid:forceChId, jsonSchema });
    if (trimToSentence) result = st.trimToEndSentence(result);
    if (removeReasoning) { st.sync(); result = st.removeReasoningFromString(result); }
    return result;
  }
  async function generateRawData(parameters = {}) {
    await readyPromise;
    const conversationId = requireState().conversationId;
    return inConversation(conversationId, () => generateRawDataInConversation(parameters));
  }
  async function generateRawDataInConversation({ prompt = '', api = null, instructOverride = false, quietToLoud = false, systemPrompt = '', responseLength = null, prefill = '', jsonSchema = null, __eleckoiStop } = {}) {
    const controller = new AbortController(), stop = () => controller.abort(new Error('Cancelled by stop event'));
    const remove = eventOn(tavern_events.GENERATION_STOPPED, stop);
    const type = api || context.mainApi;
    // Event listeners may switch connections while awaiting. Freeze the selected API
    // samplers together with the initiating request instead of reading them afterward.
    const textSettings=clone(context.__eleckoiCompletionSettings(type));
    const requestScope=captured(),requestConnection=clone(requireState().connection || {model:requireState().model});
    const chatPreset=type === 'openai' ? clone(requireState().presetId ? helpers.getPreset('in_use').settings : context.chatCompletionSettings) : null;
    try {
      st.sync();
      const input = st.createRawPrompt(clone(prompt), type, instructOverride, quietToLoud, systemPrompt, prefill);
      if (type === 'openai') {
        let messages = input;
        const event = { chat: messages, dryRun: false }; await eventEmit(tavern_events.CHAT_COMPLETION_PROMPT_READY, event); messages = event.chat;
        controller.signal.throwIfAborted();
        const payload = await context.ChatCompletionService.presetToGeneratePayload(chatPreset, {}, {
          messages, model:requestConnection.model, chat_completion_source:requestConnection.source,
          custom_url:requestConnection.baseUrl, configId:requestConnection.configId,
          ...(__eleckoiStop ? {stop:__eleckoiStop} : {}),
          ...(typeof responseLength === 'number' && responseLength > 0 ? { max_tokens: responseLength } : {}),
          ...(jsonSchema ? {json_schema:{...jsonSchema, schema:jsonSchema.value ?? jsonSchema.schema}} : {}),
        });
        const data = await context.__eleckoiSendRequest('openai',payload,false,controller.signal,
          {scope:requestScope,connection:requestConnection});
        return jsonSchema ? st.extractJsonFromData(data, { mainApi: type, chatCompletionSource: payload.chat_completion_source, returnInvalidJson: jsonSchema.returnInvalid }) : data;
      }
      if (!['textgenerationwebui','kobold','novel','koboldhorde'].includes(type)) throw new Error(`No host transport for API: ${type}`);
      const event = { prompt: input, dryRun: false }; await eventEmit(tavern_events.GENERATE_AFTER_COMBINE_PROMPTS, event);
      controller.signal.throwIfAborted();
      const samplers={...Object.fromEntries(Object.keys(context.textCompletionSettings).map(key=>[key,undefined])),...textSettings};
      const payload = context.TextCompletionService.presetToGeneratePayload(samplers, {}, { prompt:event.prompt,
        ...(__eleckoiStop ? {stop:__eleckoiStop} : {}),
        model:requestConnection.model,api_server:requestConnection.baseUrl,
        max_tokens:typeof responseLength === 'number' && responseLength > 0 ? responseLength : textSettings.max_tokens ?? textSettings.genamt ?? 1024,
        api_type:type === 'koboldhorde' ? 'horde' : ['novel','kobold'].includes(type) ? type : textSettings.type });
      const data = await context.__eleckoiSendRequest('textgenerationwebui',payload,false,controller.signal,
        {scope:requestScope,connection:requestConnection});
      if (jsonSchema) return st.extractJsonFromData(data, { mainApi:type, returnInvalidJson:jsonSchema.returnInvalid });
      if (type === 'textgenerationwebui' && !data.choices && data.results?.[0]?.text !== undefined)
        return { ...data, choices:[{text:data.results[0].text}] };
      return data;
    } finally { remove.stop(); }
  }
  async function generateRaw(parameters = {}, ...positional) {
    if (typeof parameters !== 'object' || parameters === null || Array.isArray(parameters)) {
      const [api, instructOverride, quietToLoud, systemPrompt, responseLength, trimNames, prefill, jsonSchema] = positional;
      parameters = { prompt:parameters, api, instructOverride, quietToLoud, systemPrompt, responseLength, trimNames, prefill, jsonSchema };
    }
    const data = await generateRawData(parameters);
    if (parameters.jsonSchema) return data;
    st.sync();
    const message = st.cleanUpGeneratedMessage({ getMessage:st.extractMessageFromData(data, parameters.api || context.mainApi),
      isImpersonate:false, isContinue:false, displayIncompleteSentences:true, includeUserPromptBias:false,
      trimNames:parameters.trimNames ?? true, trimWrongNames:parameters.trimNames ?? true });
    if (!message) throw new Error('No message generated');
    return message;
  }
  Object.assign(context, {
    reloadCurrentChat: refreshChatPresentation, deleteMessage, deleteLastMessage: () => deleteChatMessages(-1), saveReply,
    swipe: { left: (event, options) => swipeMessage(event, 'left', options), right: (event, options) => swipeMessage(event, 'right', options), to: swipeMessage,
      show: () => setSwipeVisibility(false), hide: () => setSwipeVisibility(true), refresh: () => setSwipeVisibility(swipesHidden),
      isAllowed: () => !!context.chat.length && !swipesHidden && !requireState().isGenerating && swipeState === 'none', state: () => swipeState },
    activateSendButtons: () => { const document = documentForUi(); delete document.body.dataset.generating; setSwipeVisibility(false);
      document.querySelectorAll('#send_but,[data-action="send"]').forEach(element => { element.disabled = false; }); },
    deactivateSendButtons: () => { const document = documentForUi(); document.body.dataset.generating = 'true'; setSwipeVisibility(true);
      document.querySelectorAll('#send_but,[data-action="send"]').forEach(element => { element.disabled = true; }); },
    createCharacterData: { name: '', description: '', creator_notes: '', post_history_instructions: '', character_version: '', system_prompt: '',
      tags: '', creator: '', personality: '', first_message: '', avatar: null, scenario: '', mes_example: '', world: '', talkativeness: 0.5,
      alternate_greetings: [], depth_prompt_prompt: '', depth_prompt_depth: 4, depth_prompt_role: 'system', extensions: {}, extra_books: [] },
    importFromExternalUrl: async (url, options = {}) => {
      const imported = await call('characters.importUrl', { url, ...options }); await refresh();
      return imported.avatar;
    },
    generateRawData,
    sendGenerationRequest: async (type, data, options = {}) => {
      if (context.mainApi === 'openai') return context.ChatCompletionService.sendRequest(await context.ChatCompletionService.presetToGeneratePayload(helpers.getPreset('in_use').settings, {}, {
        messages: data.prompt, model: requireState().model, ...options, json_schema: options.jsonSchema }), false, options.signal);
      return context.TextCompletionService.sendRequest(data, false, options.signal);
    },
    sendStreamingRequest: async (type, data, options = {}) => {
      if (context.mainApi === 'openai') return context.ChatCompletionService.sendRequest(await context.ChatCompletionService.presetToGeneratePayload(helpers.getPreset('in_use').settings, {}, {
        messages: data.prompt, model: requireState().model, ...options, stream: true }), true, options.signal);
      return context.TextCompletionService.sendRequest({ ...data, stream: true }, true, options.signal);
    },
    openGroupChat: async (groupId, chatId) => {
      const group = await call('groups.get', { id: String(groupId) });
      const id = chatId || group.chat_id || await call('groups.createChat', { id: group.id });
      if (!group.chats.includes(id) && id !== group.chat_id) await call('groups.bind', { conversationId: id, id: group.id });
      await call('chats.open', { id }); await refresh();
    },
    unshallowGroupMembers: async groupId => { await refresh(); const group = context.groups.find(value => value.id === groupId);
      if (group) await Promise.all(group.members.map(avatar => context.unshallowCharacter(avatar))); },
    generate: async (type = 'normal', options = {}, dryRun = false) => {
      if (dryRun) {
        await readyPromise; await flush();
        const target = { ...captured(), ...(options.conversationId ? {conversationId:options.conversationId} : {}) };
        if (mainGenerations.has(target.conversationId)) throw new Error('Agent generation is already running in this chat');
        const character = options.force_chid == null ? undefined : RawCharacter.find({name:options.force_chid}) || context.characters[Number(options.force_chid)];
        if (options.force_chid != null && !character) throw new Error(`Character does not exist: ${options.force_chid}`);
        const { signal } = generationAbortBinding(options);
        const checkAbort = () => { if (signal?.aborted) throw signal.reason || new Error('Generation preview cancelled'); };
        checkAbort();
        shared.mainGenerationOptions ||= new Map();
        shared.mainGenerationOptions.set(target.conversationId, { ...options, signal, dryRun:true });
        try {
          await eventEmit(tavern_events.GENERATION_STARTED, type, mainGenerationEventOptions(options), true);
          checkAbort();
          if (['normal','continue','regenerate','swipe'].includes(type)) {
            const preview = await call('chat.generateFromHistory', { ...target, type, speakerId:character?.native_id || '',
              options:{ ...Object.fromEntries(['quiet_prompt','quietToLoud','skipWIAN','force_name2','quietName','jsonSchema','responseLength']
                .filter(name => options[name] !== undefined).map(name => [name, options[name]])), dryRun:true } });
            checkAbort();
            await eventEmit(tavern_events.GENERATE_AFTER_DATA, { eleckoiAgent:preview }, true);
          } else if (['quiet','impersonate'].includes(type)) {
            await eventEmit(tavern_events.GENERATION_AFTER_COMMANDS, type, mainGenerationEventOptions(options), true);
            const preview = await generateRequest({ ...options, ...target, dryRun:true, raw:false, quietGenerate:true,
              user_input:type === 'impersonate' ? `Write the next message as ${context.name1}. Return only their message, without speaker labels or explanation.` : options.quiet_prompt || '',
              ...(character ? { characterId:character.native_id } : {}), image:options.quietImage,
              json_schema:options.jsonSchema ? {...options.jsonSchema,schema:options.jsonSchema.value ?? options.jsonSchema.schema} : undefined }, false);
            checkAbort();
            await eventEmit(tavern_events.CHAT_COMPLETION_PROMPT_READY, { chat:preview.messages, dryRun:true });
            await eventEmit(tavern_events.GENERATE_AFTER_DATA, preview.request, true);
          } else throw new Error(`Agent chat generation mode is not implemented: ${type}`);
          return undefined;
        } finally { shared.mainGenerationOptions.delete(target.conversationId); }
      }

      if (type === 'impersonate') {
        await readyPromise;
        const target = { ...captured(), ...(options.conversationId ? {conversationId:options.conversationId} : {}) };
        if (requireState().conversationId !== target.conversationId) throw new Error('Open the target chat before impersonating into its composer');
        const character = options.force_chid == null ? undefined : RawCharacter.find({name:options.force_chid}) || context.characters[Number(options.force_chid)];
        if (options.force_chid != null && !character) throw new Error(`Character does not exist: ${options.force_chid}`);
        const { signal } = generationAbortBinding(options);
        const run = async () => {
          if(signal?.aborted)throw signal.reason || new Error('Impersonation aborted');
          await eventEmit(tavern_events.GENERATION_STARTED, type, mainGenerationEventOptions(options), false);
          await eventEmit(tavern_events.GENERATION_AFTER_COMMANDS, type, mainGenerationEventOptions(options), false);
          try {
            if(requireState().conversationId !== target.conversationId)throw new Error('The impersonation chat was closed before its composer could be cleared');
            await base.input.clear();
            const result = await generateRequest({...options,...target,purpose:'impersonation',quietGenerate:true,
              ...(character ? {characterId:character.native_id} : {}), image:options.quietImage,
              should_return_reasoning:false,return_reasoning:false,
              json_schema:options.jsonSchema ? {...options.jsonSchema,schema:options.jsonSchema.value ?? options.jsonSchema.schema} : undefined,
              user_input:`Write the next message as ${context.name1}. Return only their message, without speaker labels or explanation.${options.quiet_prompt ? '\nAdditional instruction: '+options.quiet_prompt : ''}`}, false);
            const text = typeof result === 'string' ? result : result.content;
            if(signal?.aborted)throw signal.reason || new Error('Impersonation aborted');
            if(requireState().conversationId !== target.conversationId)throw new Error('The impersonation finished after its chat was closed; the composer was not changed');
            await base.input.set(text);
            await eventEmit(tavern_events.IMPERSONATE_READY, text);
            return text;
          } finally { await eventEmit(tavern_events.GENERATION_ENDED, context.chat.length); }
        };
        if(options.await === false){run().catch(report);return '';}
        return run();
      }
      if (type === 'quiet') {
        await readyPromise;
        const target = { ...captured(), ...(options.conversationId ? {conversationId:options.conversationId} : {}) };
        const mainApi=context.mainApi,source=requireState().connection?.source || 'custom';
        const character = options.force_chid == null ? undefined : RawCharacter.find({name:options.force_chid})
          || context.characters[Number(options.force_chid)];
        if (options.force_chid != null && !character) throw new Error(`Character does not exist: ${options.force_chid}`);
        await eventEmit(tavern_events.GENERATION_STARTED, type, mainGenerationEventOptions(options), false);
        await eventEmit(tavern_events.GENERATION_AFTER_COMMANDS, type, mainGenerationEventOptions(options), false);
        try {
          const result = await generateRequest({ ...options, ...target, user_input:options.quiet_prompt || '', quietGenerate:true,
            __eleckoiReturnEnvelope:!!options.jsonSchema,
            ...(character ? {characterId:character.native_id} : {}), image:options.quietImage,
            json_schema:options.jsonSchema ? {...options.jsonSchema,schema:options.jsonSchema.value ?? options.jsonSchema.schema} : undefined,
            parameters:options.parameters }, false);
          if (!options.jsonSchema) return result;
          const content=[{type:'text',text:result.content}];
          for(const call of result.tool_calls || []) {
            const args=call.function?.arguments;
            if(args !== undefined)content.push({type:'tool_use',input:typeof args === 'string' ? JSON.parse(args) : args});
          }
          st.sync();
          return st.extractJsonFromData({text:result.content,content,choices:[{message:{content:result.content}}]},
            {mainApi,chatCompletionSource:source,returnInvalidJson:options.jsonSchema.returnInvalid ?? false});
        } finally { await eventEmit(tavern_events.GENERATION_ENDED, context.chat.length); }
      }
      if (['normal', 'continue', 'regenerate', 'swipe'].includes(type)) {
        const target = { ...captured(), ...(options.conversationId ? {conversationId:options.conversationId} : {}) }; await flush();
        if (mainGenerations.has(target.conversationId)) throw new Error('Agent generation is already running in this chat');
        const speakerId = options.force_chid == null ? '' : RawCharacter.find({ name: options.force_chid })?.native_id
          || context.characters[Number(options.force_chid)]?.native_id;
        if (options.force_chid != null && !speakerId) throw new Error(`Character does not exist: ${options.force_chid}`);
        shared.mainGenerationOptions ||= new Map();
        const { signal, target: abortTarget } = generationAbortBinding(options);
        shared.mainGenerationOptions.set(target.conversationId, { ...options, signal });
        let acknowledge;
        const request = { conversationId:target.conversationId, runId:'', acknowledged:false, started:true,
          acknowledgement:new Promise(resolve => { acknowledge = resolve; }) };
        const completion = new Promise((resolve, reject) => { request.resolve = resolve; request.reject = reject; });
        const closed = () => { request.reject(new Error('Generation document closed')); request.cleanup(); };
        const abort = () => {
          request.reject(signal.reason instanceof Error ? signal.reason : new Error(signal.reason || 'Generation cancelled'));
          if (requireState().conversationId === target.conversationId) Promise.resolve(base.chat.stopGeneration()).catch(report);
          request.cleanup();
        };
        request.release = () => {
          if (mainGenerations.get(target.conversationId) === request) {
            mainGenerations.delete(target.conversationId); shared.mainGenerationOptions.delete(target.conversationId);
          }
        };
        request.cleanup = () => {
          request.release();
          cleanups.delete(closed); abortTarget?.removeEventListener('abort', abort);
          acknowledge();
        };
        mainGenerations.set(target.conversationId, request); cleanups.add(closed);
        abortTarget?.addEventListener('abort', abort, {once:true});
        // Rejections can precede the native acknowledgement, including non-awaited calls.
        completion.catch(error => { if (options.await === false) report(error); });
        try {
          if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new Error(signal.reason || 'Generation cancelled');
          await eventEmit(tavern_events.GENERATION_STARTED, type, mainGenerationEventOptions({ ...options, signal }), false);
          const nativeOptions = Object.fromEntries(['quiet_prompt', 'quietToLoud', 'skipWIAN', 'force_name2', 'quietImage', 'quietName', 'jsonSchema', 'responseLength']
            .filter(name => options[name] !== undefined).map(name => [name, options[name]]));
          const accepted = await call('chat.generateFromHistory', { ...target, type, speakerId, options:nativeOptions });
          if (accepted?.accepted === false) throw new Error(accepted.message || 'Agent generation was rejected');
          if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new Error(signal.reason || 'Generation cancelled');
          request.runId = accepted?.runId || ''; request.nativeMain = accepted?.nativeMain === true; request.acknowledged = true; acknowledge();
          return options.await === false ? accepted : await completion;
        } catch (error) { request.reject(error); request.cleanup(); throw error; }
        finally { acknowledge(); }
      }
      throw new Error(`Agent chat generation mode is not implemented: ${type}`);
    },
    stopGeneration: () => { const running = !!requireState().isGenerating || activeGenerations.size > 0;
      for (const id of activeGenerations) if (!stopGenerationById(id)) call('generation.cancel', { id }).catch(report);
      if (requireState().isGenerating) Promise.resolve(base.chat.stopGeneration()).catch(report); return running; },
    generateRaw,
    sendSystemMessage: async (type, text, extra = {}) => createChatMessages([{ role: 'system', name: 'System', message: text, extra: { ...extra, type } }]),
    timestampToMoment: st.timestampToMoment,
    registerHelper: (name, callback) => st.libs.Handlebars.registerHelper(name, callback), registerSlashCommand: helpers.registerSlashCommand,
    registerDataBankScraper, registerDebugFunction: (name, callback) => { if (typeof callback !== 'function') throw new TypeError('Debug callback must be a function');
      debugFunctions.set(name, callback); global[name] = callback; cleanups.add(() => { if (debugFunctions.get(name) === callback) debugFunctions.delete(name); if (global[name] === callback) delete global[name]; }); },
    ensureMessageMediaIsArray: st.ensureMessageMediaIsArray, getMediaDisplay: st.getMediaDisplay, getMediaIndex: st.getMediaIndex, appendMediaToMessage,
    extractMessageFromData: st.extractMessageFromData, constants: { ...st.constants, unset: '__@@UNSET@@__' },
    getTextGenServer: () => requireState().connection?.baseUrl || "", textCompletionSettings: extensionSettings.eleckoi_text_completion ||= {},
    importTags,
    getThumbnailUrl: (type, filename) => {
      if (type === 'avatar') { const card = RawCharacter.find({ name: filename }); return card?.avatar_path || card?.avatar || filename; }
      if (type === 'persona') return personaReference(filename)?.avatar_path || filename;
      return new URL(filename, global.location.href).href;
    },
    registerFunctionTool: (...args) => st.ToolManager.registerFunctionTool(...args), unregisterFunctionTool: (...args) => st.ToolManager.unregisterFunctionTool(...args),
    isToolCallingSupported: (...args) => st.ToolManager.isToolCallingSupported(...args), canPerformToolCalls: (...args) => st.ToolManager.canPerformToolCalls(...args),
    renderExtensionTemplateAsync,
    renderExtensionTemplate: (extension, template, data = {}, sanitize = true) => {
      const xhr = new global.XMLHttpRequest(); xhr.open('GET', `/plugin/${encodeURIComponent(extension)}/${template}.html`, false); xhr.send();
      if (xhr.status < 200 || xhr.status >= 300) throw new Error(`Template ${extension}/${template}: HTTP ${xhr.status}`);
      const html = st.libs.Handlebars.compile(xhr.responseText)(data); return sanitize ? st.libs.DOMPurify.sanitize(html) : html;
    },
    callPopup: (text, type = 'text', input = '', options = {}) => st.callGenericPopup(text, { text: st.POPUP_TYPE.TEXT, input: st.POPUP_TYPE.INPUT, confirm: st.POPUP_TYPE.CONFIRM }[type] ?? type, input, options),
    ModuleWorkerWrapper: st.ModuleWorkerWrapper, loader: st.loader,
    showLoader: () => { shared.legacyLoader?.hide(); shared.legacyLoader = st.loader.show({ blocking: true, toastMode: st.loader.ToastMode.NONE }); },
    hideLoader: async () => { if (shared.legacyLoader) { await shared.legacyLoader.hide(); shared.legacyLoader = null; } },
    writeExtensionFieldBulk: async (characterId, values) => { for (const [key, value] of Object.entries(values)) await context.writeExtensionField(characterId, key, value); },
    messageFormatting, messageFormatter: st.MessageFormatter,
    shouldSendOnEnter: () => !extensionSettings.power_user?.send_on_enter || extensionSettings.power_user.send_on_enter === 'always',
    isMobile: () => /Android|iPhone|Mobile/i.test(global.navigator.userAgent), translate,
    addLocaleData: (language, values) => { localeData.set(language, { ...localeData.get(language), ...values }); },
    event_types: tavern_events, powerUserSettings: extensionSettings.power_user ||= {}, chatCompletionSettings: st.oai_settings,
    getCharacterSource: (id = context.characterId) => { const extra = context.characters[id]?.data?.extensions || {};
      return extra.chub?.full_path ? `https://chub.ai/characters/${extra.chub.full_path}` : extra.pygmalion_id ? `https://pygmalion.chat/${extra.pygmalion_id}` : extra.github_repo ? `https://github.com/${extra.github_repo}` : extra.source_url || '';
    },
    humanizedDateTime: () => st.libs.moment().format('LLL'), updateMessageBlock, scrollChatToBottom,
    scrollOnMediaLoad: element => { const image = element?.jquery ? element[0] : element; if (!image) throw new TypeError('Expected a media element'); image.addEventListener('load', () => scrollChatToBottom(), { once: true }); },
    getWorldInfoNames: () => helpers.getWorldbookNames(), loadWorldInfo: name => call('worldbooks.get', { name }),
    convertCharacterBook: st.convertCharacterBook,
    getWorldInfoPrompt: async (chat, maxContext, isDryRun, globalScanData) => {
      const result = await call('worldbooks.scan', { ...captured(), messages: chat.slice().reverse(), maxContext, dryRun: isDryRun, globalScanData,consumeForcedOnDryRun:true });
      const byPosition = position => result.entries.filter(entry => entry.worldbookPosition === position).slice().reverse();
      const text = position => byPosition(position).map(entry => entry.content).join('\n');
      const before = text('before_character_definition'), after = text('after_character_definition');
      const grouped = new Map();
      for (const entry of result.entries.filter(entry => entry.worldbookPosition === 'at_depth')) { const key = `${entry.depth}:${entry.role}`, group = grouped.get(key) || { depth: entry.depth, role: { system: 0, user: 1, assistant: 2 }[entry.role], entries: [] };
        group.entries.unshift(entry.content); grouped.set(key, group); }
      return { worldInfoString: before + after, worldInfoBefore: before, worldInfoAfter: after,
        worldInfoExamples: result.entries.filter(entry=>['before_example_messages','after_example_messages'].includes(entry.worldbookPosition)).slice().reverse()
          .map(entry=>({position:entry.worldbookPosition==='before_example_messages'?0:1,content:entry.content})),
        worldInfoDepth: [...grouped.values()], anBefore: byPosition('before_author_note').map(entry => entry.content), anAfter: byPosition('after_author_note').map(entry => entry.content),
        outletEntries: result.outletEntries || Object.fromEntries(Object.entries(result.outlets || {}).map(([name,value])=>[name,Array.isArray(value)?value:[value]])) };
    },
    saveWorldInfo: async (name, data) => { await call('worldbooks.put', { name, book: data }); await refresh(); await eventEmit(tavern_events.WORLDINFO_UPDATED, name, data); },
    updateWorldInfoList: () => refresh(), getPresetManager: st.getPresetManager, getChatCompletionModel: () => requireState().model || '',
    printMessages: () => { const surface = requireDisplaySurface(); if (surface.print) surface.print(); else surface.root.hidden = false;
      for (let index = 0; index < context.chat.length; index++) updateMessageBlock(index); return surface.root; },
    clearChat: async ({ clearData = false } = {}) => { const surface = requireDisplaySurface(); if (surface.clear) surface.clear(); else surface.root.hidden = true;
      if (clearData) { context.chat.length = 0; await context.saveChat(); } },
    parseReasoningFromString: (...args) => { st.sync(); return st.parseReasoningFromString(...args); },
    getReasoningTemplateByName: name => { const template = context.__eleckoiPresetManagers('reasoning').getCompletionPresetByName(name); if (!template) throw new Error(`Unknown reasoning template: ${name}`); return clone(template); },
    updateReasoningUI: element => { const target = element?.jquery ? element[0] : element; if (!target) throw new TypeError('Expected a message element');
      const index = Number(target.getAttribute('mesid')), message = context.chat[index]; if (!message) throw new RangeError(`Message index out of range: ${index}`);
      let details = target.querySelector('.mes_reasoning'); const reasoning = message.extra?.reasoning || message.reasoning || '';
      if (!reasoning) { details?.remove(); return; }
      if (!details) { details = target.ownerDocument.createElement('details'); details.className = 'mes_reasoning'; details.innerHTML = '<summary>Thinking</summary><div class="mes_reasoning_content"></div>'; target.append(details); }
      details.querySelector('.mes_reasoning_content').innerHTML = messageFormatting(reasoning, message.name, false, false, index, {}, true);
    },
    getExtensionManifest: () => clone(requireState().plugins || {}), symbols: { ignore: st.IGNORE_SYMBOL },
    openThirdPartyExtensionMenu: () => global.ElecKoi.plugins.openManager(),
  });
  Object.defineProperties(context, {
    tags: { enumerable: true, get: () => extensionSettings.tags ||= [] },
    tagMap: { enumerable: true, get: () => extensionSettings.tagMap ||= {} },
    textCompletionSettings: { enumerable:true, get:() => extensionSettings.eleckoi_text_completion ||= {} },
    chatId: { enumerable: true, get: () => requireState().conversationId }, mainApi: { enumerable: true, get: () => extensionSettings.eleckoi_api_kinds?.[requireState().connection?.configId]?.mainApi || 'openai' },
    menuType: { enumerable: true, get: () => documentForUi().body.dataset.eleckoiMenuType || 'characters' },
    maxContext: { enumerable: true, get: () => Number(shared.presetState.draft?.settings?.max_context ?? requireState().maxContext ?? 8192) },
    onlineStatus: { enumerable: true, get: () => requireState().onlineStatus || requireState().connection?.onlineStatus || 'no_connection' },
    extensionPrompts: { enumerable: true, get: () => new Proxy(Object.fromEntries([...injections].map(([id, value]) => [id, { ...value, value: value.content }])), {
      deleteProperty: (_target, id) => { uninjectPrompts([id]); return true; },
    }) },
  });
  Object.assign(context, st.installRequestServices(context, {
    call, ready: () => readyPromise, flush, capture: captured,
    connection: () => requireState().connection || { model: requireState().model || '' },
    preset: name => helpers.getPreset(name), on: base.events.on, report, cleanup: cleanups, running: activeGenerations,
    beforeRequest: (conversationId, format, body) => beforeProviderRequest(conversationId, format, body, false),
  }));
  st.installPresetManagers(context, {
    rawRegex: asRawRegex,
    reconcile: reconcileSharedObject,
    names: helpers.getPresetNames, name: helpers.getLoadedPresetName, preset: helpers.getPreset, reference: () => shared.presetState.draft,
    load: reference => loadPreset(reference,false), delete: helpers.deletePreset, rename: helpers.renamePreset, flush, report, cleanup:cleanups,
    applyRaw: async raw => {
      const draft = getPreset('in_use'), converted = st.typedPromptSettings(draft,{...raw,prompts:raw.prompts || [],prompt_order:raw.prompt_order || []});
      const aliases = {openai_max_context:'max_context',openai_max_tokens:'max_completion_tokens',n:'reply_count',stream_openai:'should_stream',show_thoughts:'request_thoughts',function_calling:'enable_function_calling',video_inlining:'allow_sending_videos',wrap_in_quotes:'wrap_user_messages_in_quotes'};
      for (const [key,value] of Object.entries(raw)) { const target = aliases[key] || key; if (Object.hasOwn(converted.settings,target)) converted.settings[target] = clone(value); }
      if (raw.image_inlining !== undefined) converted.settings.allow_sending_images = raw.image_inlining ? raw.inline_image_quality || 'auto' : 'disabled';
      if (raw.names_behavior !== undefined) converted.settings.character_name_prefix = {0:'default',1:'completion',2:'content'}[raw.names_behavior] || 'none';
      await putPreset('in_use',{...converted,extensions:clone(raw.extensions || {})},false,true,shared.presetState.id);
    },
    importRaw: async (name, raw) => {
      await readyPromise; await flush();
      await call('tavernPresets.import', {name,content:JSON.stringify(raw)}); await refresh();
    },
    updateExtensions: async extensions => {
      const presetId = shared.presetState.id;
      const draft = getPreset('in_use'); draft.extensions = clone(extensions);
      await putPreset('in_use',draft,false,true,presetId);
    },
    updateList: (name,raw) => {
      const previousList=clone(shared.presetState.list),previousSelection={id:shared.presetState.id,name:shared.presetState.name,
        draft:clone(shared.presetState.draft),committed:clone(shared.presetState.committed)};
      let previous = presetRecord(name);
      if (!previous) { previous = {id:name,name,preset:getPreset('in_use')}; shared.presetState.list.push(previous); }
      const converted = st.typedPromptSettings(previous.preset,{...raw,prompts:raw.prompts || [],prompt_order:raw.prompt_order || []});
      const aliases = {openai_max_context:'max_context',openai_max_tokens:'max_completion_tokens',n:'reply_count',stream_openai:'should_stream',show_thoughts:'request_thoughts',function_calling:'enable_function_calling',video_inlining:'allow_sending_videos',wrap_in_quotes:'wrap_user_messages_in_quotes'};
      const settings = {...converted.settings};
      for (const [key,value] of Object.entries(raw)) { const target = aliases[key] || key; if (Object.hasOwn(settings,target)) settings[target] = clone(value); }
      if (raw.image_inlining !== undefined) settings.allow_sending_images = raw.image_inlining ? raw.inline_image_quality || 'auto' : 'disabled';
      if (raw.names_behavior !== undefined) settings.character_name_prefix = {0:'default',1:'completion',2:'content'}[raw.names_behavior] || 'none';
      previous.preset = validatePreset({...converted,extensions:clone(raw.extensions || {}),settings});
      Object.assign(shared.presetState,{id:previous.id,name:previous.name,draft:clone(previous.preset)});
      const capturedRaw = clone(raw), requestedName = name, conversationId = state.conversationId;
      const version = ++shared.presetState.revision;
      enqueue(async () => {
        await call('tavernPresets.import',{name:requestedName,content:JSON.stringify(capturedRaw)});
        // Resolve the repository-assigned ID after creating a previously unknown list entry.
        // Do not enter refresh(): it drains this very queue before hydrating unrelated state.
        const imported = await call('plugins.bootstrap',{conversationId});
        const stored = imported.tavernPresets.find(item=>item.name === requestedName);
        if (!stored || !await call('tavernPresets.load',{id:stored.id})) throw new Error(`Preset list update could not be applied: ${requestedName}`);
        const applied = await call('plugins.bootstrap',{conversationId});
        if (version === shared.presetState.revision) {
          shared.presetState.list.splice(0,shared.presetState.list.length,...applied.tavernPresets);
          const active = applied.tavernPresetState;
          Object.assign(shared.presetState,{id:active.id,name:active.name,draft:clone(active.preset)});
          shared.presetState.committed = presetSelection();
        }
      }, () => {
        if(version!==shared.presetState.revision)return;
        shared.presetState.list.splice(0,shared.presetState.list.length,...previousList);
        Object.assign(shared.presetState,previousSelection);shared.presetState.revision++;
        context.__eleckoiPresetManagers?.('openai')?.syncSelect();
      });
    },
  });
  hostEvent(tavern_events.FORCE_SET_BACKGROUND, value => global.ElecKoi.appearance.setBackground(value));
  const editors = new Map();
  async function editJsonDocument(key, title, read, save) {
    const active = editors.get(key);
    if (active) { active.text.value = JSON.stringify(await read(), null, 2); active.text.focus(); return; }
    const root = global.document.createElement('section'), heading = global.document.createElement('h3'), text = global.document.createElement('textarea');
    heading.textContent = title; text.value = JSON.stringify(await read(), null, 2); text.spellcheck = false;
    text.style.cssText = 'display:block;width:100%;box-sizing:border-box;min-height:45vh;resize:vertical;font-family:monospace';
    root.append(heading, text); editors.set(key, { text, read });
    try {
      const popup = new st.Popup(root, st.POPUP_TYPE.CONFIRM, '', { okButton: '保存', cancelButton: '取消', wide: true });
      if (await popup.show() === st.POPUP_RESULT.AFFIRMATIVE) await save(JSON.parse(text.value));
    } finally { editors.delete(key); }
  }
  const promptManager = st.createPromptManager(context, {
    document:documentForUi, cleanup:cleanups,
    export:(data,name)=>call('files.saveText',{name,mimeType:'application/json',text:JSON.stringify(data,null,2)}),
    shared, preset: () => getPreset('in_use'), presetReference: () => shared.presetState.draft, presetId: () => shared.presetState.id,
    update: preset => { shared.presetState.draft = validatePreset(preset); },
    persist: (preset, presetId) => {
      const value = clone(preset);
      return enqueue(() => call('tavernPresets.put', { reference: 'in_use', expectedPresetId: presetId, preset: value, requireExisting: true }));
    },
    flush: async () => { await Promise.resolve(); await flush(); }, report,
    persistenceError: error => { writeErrors.push(error); report(error); },
    render: () => editJsonDocument('prompts', '预设 Prompt', () => helpers.getPreset('in_use'), value => helpers.replacePreset('in_use', value)),
    renderDebounced: st.libs.lodash.debounce(() => promptManager.render(), 150),
  });
  promptManager.tryGenerate = () => context.generate('normal', {}, true);
  Object.assign(context, { Prompt: st.Prompt, PromptCollection: st.PromptCollection, TokenHandler: st.TokenHandler });
  context.reloadWorldInfoEditor = async (name, loadIfNotSelected = false) => {
    const editor = editors.get(`worldbook:${name}`);
    if (editor) { editor.text.value = JSON.stringify(await helpers.getWorldbook(name), null, 2); return; }
    if (loadIfNotSelected) return editJsonDocument(`worldbook:${name}`, name, () => helpers.getWorldbook(name), value => helpers.replaceWorldbook(name, value));
  };
  const renderMarkdown = markdown => new st.libs.showdown.Converter().makeHtml(String(markdown));
  const builtin = {
    addOneMessage: context.addOneMessage,
    copyText: async text => { await global.navigator.clipboard.writeText(String(text)); },
    duringGenerating: () => !!requireState().isGenerating,
    getImageTokenCost: async (dataUrl, quality) => {
      if (quality === 'low') return 85;
      const { width, height } = await new Promise((resolve, reject) => {
        const image = new global.Image(); image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
        image.onerror = () => reject(new Error('Image token cost: image could not be decoded')); image.src = dataUrl;
      });
      if (quality === 'auto' && width <= 512 && height <= 512) return 85;
      const scale = 768 / Math.min(width, height);
      return 85 + 170 * Math.ceil(Math.round(width * scale) / 512) * Math.ceil(Math.round(height * scale) / 512);
    },
    // TH 4.11.2 exposes a conservative estimate here, not a provider tokenizer.
    getVideoTokenCost: async () => 1000,
    parseRegexFromString: st.regexFromString, promptManager,
    reloadAndRenderChatWithoutEvents: async () => { await refresh(); return context.printMessages(); },
    reloadChatWithoutEvents: refreshChatPresentation,
    reloadEditor: context.reloadWorldInfoEditor,
    reloadEditorDebounced: st.libs.lodash.debounce((...args) => context.reloadWorldInfoEditor(...args).catch(report), 1000),
    renderMarkdown, renderPromptManager: () => { promptManager.render(); promptManager.showPopup(); }, renderPromptManagerDebounced: promptManager.renderDebounced,
    saveSettings: async () => { context.saveSettingsDebounced(); await flush(); }, uuidv4: st.uuidv4,
  };
  Object.assign(helpers, {
    builtin, getExtensionStatus: helpers.getExtensionInstallationInfo, getFrontendVersion: helpers.getTavernHelperVersion,
    updateFrontendVersion: helpers.updateTavernHelper,
    audioEnable: () => '', // Retained upstream deprecated no-op.
    audioMode: ({ type, mode }) => { setAudioSettings(type, { mode: { single: 'repeat_one', repeat: 'repeat_all', random: 'shuffle', stop: 'play_one_and_stop' }[mode] }); return ''; },
    audioPlay: ({ type, play }) => { if (Boolean(play ?? 'true')) { const track = audioChannel(type).currentTrack || getAudioList(type)[0]; if (track) playAudio(type, track); } else pauseAudio(type); return ''; },
    audioSelect: ({ type }, url) => { playAudio(type, { url, title: decodeURIComponent(url.split('/').pop().split('?')[0]) }); return ''; },
    audioImport: ({ type, play }, urls) => {
      const list = [...new Set(String(urls).split(',').map(url => url.trim()).filter(Boolean))].filter(url => !getAudioList(type).some(item => item.url === url))
        .map(url => ({ url, title: decodeURIComponent(url.split('/').pop().split('?')[0]) }));
      appendAudioList(type, list); if (Boolean(play ?? 'true') && list.length) playAudio(type, list[0]); return '';
    },
  });
  Object.assign(helpers, { tavern_events, iframe_events, setChatMessage: (messageId, message, options) => setChatMessages([{ message_id: messageId, message }], options) });
  for (const [name, value] of Object.entries(helpers)) Object.defineProperty(global, name, { value, configurable: true, enumerable: true, writable: true });
  Object.defineProperty(global, 'TavernHelper', { value: Object.freeze(helpers), configurable: true, writable: true });
  const sillyTavern = { getContext: () => { requireState(); return context; }, libs: st?.libs };
  for (const name of Object.keys(context)) Object.defineProperty(sillyTavern, name, {
    get: () => { requireState(); return context[name]; }, enumerable: true,
  });
  Object.defineProperty(global, 'SillyTavern', { value: Object.freeze(sillyTavern), configurable: true, writable: true });
  global.tavern_events = tavern_events; global.iframe_events = iframe_events;
  readyPromise.then(async () => {
    if (!shared.lifecyclePromise) shared.lifecyclePromise = (async () => {
      await loadCurrentItemizedHistory(requireState().conversationId);
      const settings = {extension_settings:extensionSettings,power_user:context.powerUserSettings,oai_settings:context.chatCompletionSettings};
      await eventEmit(tavern_events.SETTINGS_LOADED_BEFORE,settings);
      if (settings.extension_settings !== extensionSettings) Object.assign(extensionSettings,settings.extension_settings);
      if (settings.power_user !== context.powerUserSettings) Object.assign(context.powerUserSettings,settings.power_user);
      if (settings.oai_settings !== context.chatCompletionSettings) Object.assign(context.chatCompletionSettings,settings.oai_settings);
      await eventEmit(tavern_events.SETTINGS_LOADED_AFTER,settings);
      await eventEmit(tavern_events.EXTENSION_SETTINGS_LOADED);
      await eventEmit(tavern_events.SETTINGS_LOADED);
      await eventEmit(tavern_events.EXTENSIONS_FIRST_LOAD);
      await eventEmit(tavern_events.APP_INITIALIZED);
      await eventEmit(tavern_events.APP_READY);
    })();
    await shared.lifecyclePromise;
  }).catch(report);
  global.addEventListener('pagehide', () => {
    disposed = true;
    lifetime.abort(Object.assign(new Error('Plugin page has closed'), { code: 'FRAME_CLOSED' }));
    const released = new Map();
    const releaseIds = (conversationId, ids) => {
      if (!released.has(conversationId)) released.set(conversationId, new Set());
      ids.forEach(id => released.get(conversationId).add(id));
    };
    for (const [conversationId, held] of shared.messageDisplayHolds) {
      const ids = [...held].filter(([, entry]) => entry.owner === ownerKey).map(([id]) => id);
      if (!ids.length) continue;
      ids.forEach(id => held.delete(id));
      if (!held.size) shared.messageDisplayHolds.delete(conversationId);
      releaseIds(conversationId, ids);
    }
    for (const [conversationId, timeline] of shared.messageTimelineHolds) {
      const ids = [];
      for (const [id, owners] of timeline.owners) {
        if (!owners.delete(ownerKey)) continue;
        if (!owners.size) { timeline.owners.delete(id); ids.push(id); }
      }
      if (!timeline.owners.size) shared.messageTimelineHolds.delete(conversationId);
      releaseIds(conversationId, ids);
    }
    for (const [conversationId, ids] of released) {
      if (ids.size) shared.request('messages.refresh', { pluginId, conversationId, ids: [...ids], presentationOwner: ownerKey }).catch(report);
    }
    for (const handler of macroLikes.values()) st.macros.engine.removePreProcessor(handler);
    if (st) for (const [name, command] of commands) if (st.SlashCommandParser.commands[name] === command) delete st.SlashCommandParser.commands[name];
    cleanups.forEach(stop => stop()); eventClearAll(null);
  });
}
