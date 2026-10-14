import { SharedEventHub } from './helper-runtime.js';
import { projectCatalogEvents } from './catalog-events.js';
import { initializePromptCollection, registerPromptRuntime } from './main-prompts.js';

export const COMPATIBILITY_VERSION = '0.1.0';

/** Application state is owned by the persistent client, rather than any message iframe. */
export function createCompatibilitySharedState() {
  const shared = { conversations: new Map(), eventHub: new SharedEventHub(), globals: new Map(),
    globalInitializations: new Map(), globalWaiters: new Map(), ttsProviders: new Map(), stages: [], writeTail: Promise.resolve() };
  initializePromptCollection(shared); return shared;
}

export function createCompatibilityRuntime(view, options) {
  const shared = options.shared ?? createCompatibilitySharedState();
  shared.conversations ??= new Map();
  shared.eventHub ??= new SharedEventHub();
  shared.stages ??= [];
  shared.writeTail ??= Promise.resolve();
  const fixed = { ...options.context };
  const conversationId = fixed.conversationId ?? '';
  let record = shared.conversations.get(conversationId);
  if (!record) {
    record = { snapshot: undefined, members: new Set(), refreshing: null };
    shared.conversations.set(conversationId, record);
  }
  const localEvents = new SharedEventHub();
  const pending = new Set();
  const failures = [];
  const cleanups = new Set();
  let closed = false;
  const runtime = {
    window: view, shared, snapshot: undefined, native: options.native,
    version: COMPATIBILITY_VERSION, extensionId: '@eleckoi/tavern-native',
    scriptId: fixed.scriptId, scopeVariables: new Map(), tokens: options.tokens,
    addCleanup: cleanup => { cleanups.add(cleanup); return () => cleanups.delete(cleanup); },
    on(event, listener) {
      const hub = event === 'snapshot.updated' ? localEvents : shared.eventHub;
      const stop = hub.on(event, listener);
      cleanups.add(stop);
      return () => { stop(); cleanups.delete(stop); };
    },
    off: (event, listener) => (event === 'snapshot.updated' ? localEvents : shared.eventHub).remove(event, listener),
    emit: (event, ...args) => (event === 'snapshot.updated' ? localEvents : shared.eventHub).emit(event, ...args),
    emitAndWait: (event, ...args) => (event === 'snapshot.updated' ? localEvents : shared.eventHub).emitAndWait(event, ...args),
    moveListener: (event, listener, first) => (event === 'snapshot.updated' ? localEvents : shared.eventHub).move(event, listener, first),
    track(task) {
      const operation = Promise.resolve(task);
      if (pending.has(operation)) return operation;
      pending.add(operation);
      operation.then(() => pending.delete(operation), error => {
        pending.delete(operation); failures.push(error); options.report?.(error);
      });
      return operation;
    },
    async flush() {
      while (pending.size) await Promise.allSettled([...pending]);
      if (failures.length) throw new AggregateError(failures.splice(0), 'One or more native compatibility operations failed.');
    },
    request(method, params = {}) {
      if (closed) return Promise.reject(new Error('The author page has closed.'));
      return options.bridge.invoke(method, params);
    },
    async *generate(params, signal) {
      if (closed) throw new Error('The author page has closed.');
      if (options.bridge.generate) yield* options.bridge.generate(params, signal);
      else yield { kind: 'finished', ...await options.bridge.invoke('generation.auxiliary', params) };
    },
    commit(method, params = {}) {
      if (closed) return Promise.reject(new Error('The author page has closed.'));
      const input = structuredClone(params);
      const operation = shared.writeTail.then(async () => {
        const accepted = await options.bridge.invoke(method, input);
        // A snapshot started before this write cannot acknowledge the accepted mutation.
        if (record.refreshing) await record.refreshing;
        await refresh();
        return accepted;
      });
      shared.writeTail = operation.then(() => undefined, () => undefined);
      return runtime.track(operation);
    },
    refresh,
    stage(method, params, patch) {
      if (closed) throw new Error('The author page has closed.');
      const input = structuredClone(params);
      const global = method === 'variables.setScope' && input.scope !== 'message'
        || /^(?:preset\.|persona\.|character\.|worldbook\.|scripts\.)/.test(method);
      const stage = { patch, conversationId, global };
      shared.stages.push(stage);
      publishSnapshots();
      const remove = () => { shared.stages = shared.stages.filter(item => item !== stage); };
      const operation = shared.writeTail.then(async () => {
        try {
          const accepted = await options.bridge.invoke(method, input);
          if (record.refreshing) await record.refreshing;
          await refresh();
          // Publish a newly accepted base before withdrawing its optimistic patch.
          if (global) for (const [id, other] of shared.conversations) {
            if (id === conversationId || !other.snapshot) continue;
            patch(other.snapshot);
          }
          remove(); publishSnapshots();
          return accepted;
        } catch (error) { remove(); publishSnapshots(); throw error; }
      });
      shared.writeTail = operation.then(() => undefined, () => undefined);
      return runtime.track(operation);
    },
    mediaSrc: reference => options.ui?.mediaSrc ? options.ui.mediaSrc(reference) : reference,
    generationState: (id, running, shouldSilence) => options.ui?.generationState?.({ id, running, shouldSilence, conversationId }),
    formatMessage: (text, settings) => {
      if (!options.ui?.formatMessage) throw new Error('The native message formatter is not connected.');
      return options.ui.formatMessage(text, settings);
    },
    refreshMessage: (messageId, settings) => {
      if (!options.ui?.refreshMessage) throw new Error('The native message renderer is not connected.');
      return options.ui.refreshMessage(messageId, settings);
    },
    dispose() {
      if (closed) return;
      closed = true;
      record.members.delete(acceptSnapshot);
      for (const cleanup of cleanups) cleanup();
      cleanups.clear(); localEvents.clearAll();
    },
  };

  function acceptSnapshot(snapshot) {
    if (closed) return;
    runtime.snapshot = { ...snapshot, context: { ...snapshot.context, ...fixed, conversationId } };
    runtime.scopeVariables.clear();
    for (const [scope, owners] of Object.entries(snapshot.variableScopes ?? {})) {
      for (const [owner, variables] of Object.entries(owners)) runtime.scopeVariables.set(`${scope}:${owner}`, structuredClone(variables));
    }
    // These native scopes exist before first use, including an empty global collection.
    for (const [scope, owner] of [['global', ''], ['preset', runtime.snapshot.context.presetId], ['character', runtime.snapshot.context.characterId], ['script', fixed.scriptId]]) {
      if (owner === undefined || scope !== 'global' && !owner) continue;
      if (!runtime.scopeVariables.has(`${scope}:${owner}`)) runtime.scopeVariables.set(`${scope}:${owner}`, {});
    }
    for (const message of snapshot.messages ?? []) {
      if (message.variableState !== undefined) runtime.scopeVariables.set(`message:${message.id}`, structuredClone(message.variableState));
    }
    localEvents.emit('snapshot.updated', runtime.snapshot);
  }

  async function refresh() {
    if (closed) throw new Error('The author page has closed.');
    if (!record.refreshing) {
      const operation = Promise.resolve(options.bridge.snapshot()).then(async snapshot => {
        record.snapshot = snapshot;
        if (snapshot.audio) shared.audio = structuredClone(snapshot.audio);
        publishSnapshot();
        await projectCatalogEvents(shared, snapshot, options.report,
          name => runtime.request('worldbook.get', { name }));
        return snapshot;
      });
      record.refreshing = operation;
      const release = () => { if (record.refreshing === operation) record.refreshing = null; };
      operation.then(release, release);
    }
    await record.refreshing;
    return runtime.snapshot;
  }

  runtime.addCleanup(registerPromptRuntime(shared, runtime));
  record.members.add(acceptSnapshot);
  if (record.snapshot) publishSnapshot();
  const pagehide = () => runtime.dispose();
  view.addEventListener('pagehide', pagehide, { once: true });
  runtime.addCleanup(() => view.removeEventListener('pagehide', pagehide));
  runtime.ready = refresh().then(() => undefined);
  return runtime;

  function publishSnapshot() {
    if (!record.snapshot) return;
    const snapshot = structuredClone(record.snapshot);
    for (const stage of shared.stages) if (stage.global || stage.conversationId === conversationId) stage.patch(snapshot);
    for (const member of record.members) member(snapshot);
  }

  function publishSnapshots() {
    for (const [id, selected] of shared.conversations) {
      if (!selected.snapshot) continue;
      const snapshot = structuredClone(selected.snapshot);
      for (const stage of shared.stages) if (stage.global || stage.conversationId === id) stage.patch(snapshot);
      for (const member of selected.members) member(snapshot);
    }
  }
}
