import { initializeWorldbookEvents } from './worldbook-events.js';
const roles = ['system', 'user', 'assistant'];
const positions = { '-1': 'none', 0: 'in_prompt', 1: 'in_chat', 2: 'before_prompt' };

/** Keep browser callbacks in their realm; only the resulting contributions cross Remote. */
export function copyPromptWithFilter(value) {
  const { filter, ...data } = value;
  return { ...structuredClone(data), ...(filter === undefined ? {} : { filter }) };
}

export function copyGenerationConfiguration(value) {
  const { injects, ...data } = value ?? {};
  return { ...structuredClone(data), ...(injects === undefined ? {} : { injects: injects.map(copyPromptWithFilter) }) };
}

export function registerPromptRuntime(shared, runtime) {
  const realms = shared.promptRuntimes ??= new Map();
  const lifetime = new AbortController();
  realms.set(runtime, lifetime);
  initializePromptCollection(shared);
  return () => { realms.delete(runtime); lifetime.abort(new Error('The prompt owner closed.')); };
}

async function callback(value, signal) {
  signal?.throwIfAborted();
  if (!signal) return value();
  let cancel;
  const aborted = new Promise((_, reject) => {
    cancel = () => reject(signal.reason);
    signal.addEventListener('abort', cancel, { once: true });
  });
  try { return await Promise.race([Promise.resolve().then(value), aborted]); }
  finally { signal.removeEventListener('abort', cancel); }
}

/** One batch evaluates filters and macros once, before worldbook scanning or model assembly. */
export async function collectPromptContributions(shared, options) {
  const { conversationId, signal, preview = false } = options;
  signal?.throwIfAborted();
  const realms = shared.promptRuntimes ?? new Map();
  const fallback = options.runtime ?? [...realms.keys()].find(runtime => runtime.snapshot?.context?.conversationId === conversationId);
  const candidates = [], consumed = [];
  const memorySettings = shared.extensionSettings?.memory ?? {};
  const memory = fallback?.snapshot?.messages?.findLast(message => !message.isHidden && typeof message.extra?.memory === 'string')?.extra?.memory;
  if (memory?.trim() && memorySettings.enabled !== false && !Object.hasOwn(shared.extensionPrompts ?? {}, '1_memory')) {
    candidates.push({ runtime: fallback, source: 'extension', sourceName: '1_memory', entry: {
      value: `${memorySettings.template ?? '{{summary}}'}`.replaceAll('{{summary}}', memory),
      position: memorySettings.position ?? 1, role: memorySettings.role ?? 0,
      depth: memorySettings.depth ?? 2, order: memorySettings.order ?? 1, scan: memorySettings.scan !== false,
    } });
  }
  for (const name of Object.keys(shared.extensionPrompts ?? {}).sort()) {
    const entry = shared.extensionPrompts[name];
    const registered = shared.extensionPromptOwners?.get(name);
    const owner = registered?.value === entry ? registered.runtime : undefined;
    if (owner?.snapshot?.context?.conversationId && owner.snapshot.context.conversationId !== conversationId) continue;
    candidates.push({ entry, runtime: owner ?? fallback, source: 'extension', sourceName: name });
  }
  for (const [id, entry] of shared.helperInjections ?? []) if ((entry.conversationId ?? entry.owner) === conversationId)
    candidates.push({ entry, runtime: entry.runtime ?? fallback, source: 'helper', sourceName: id });
  for (const entry of options.additional ?? []) candidates.push({ entry, runtime: options.runtime ?? fallback, source: 'helper', sourceName: String(entry.id ?? '') });
  const contributions = [];
  for (const candidate of candidates) {
    const { entry, runtime, source, sourceName } = candidate;
    const lifetime = runtime && realms.get(runtime);
    if (runtime && (!lifetime || lifetime.signal.aborted)) continue;
    const ownerSignal = lifetime ? signal ? AbortSignal.any([signal, lifetime.signal]) : lifetime.signal : signal;
    try {
      if (typeof entry.filter === 'function' && !await callback(() => entry.filter(), ownerSignal)) continue;
      ownerSignal?.throwIfAborted();
      const raw = source === 'extension' ? entry.value ?? '' : entry.content ?? entry.message ?? '';
      if (typeof raw !== 'string') throw new TypeError(`Prompt ${sourceName} must contain text.`);
      const content = runtime?.substitute ? runtime.substitute(raw) : raw;
      if (!content.trim()) continue;
      const position = positions[entry.position] ?? (entry.position === 'chat' ? 'in_chat' : entry.position ?? 'in_chat');
      const role = roles[entry.role] ?? entry.role ?? 'system';
      if (!roles.includes(role)) throw new TypeError(`Invalid prompt role: ${role}`);
      if (!['before_prompt', 'in_prompt', 'in_chat', 'none'].includes(position)) throw new TypeError(`Invalid prompt position: ${position}`);
      const depth = Number(entry.depth ?? 0), order = Number(entry.order ?? contributions.length);
      if (!Number.isSafeInteger(depth) || depth < 0) throw new TypeError(`Invalid prompt depth: ${entry.depth}`);
      if (!Number.isFinite(order)) throw new TypeError(`Invalid prompt order: ${entry.order}`);
      const scan = source === 'extension' ? entry.scan !== false : entry.should_scan !== false;
      contributions.push({ id: String(entry.id ?? sourceName), source, sourceName, content, role, position,
        depth, order, scan, should_scan: scan });
      if (source === 'helper' && entry.once === true && !preview) consumed.push([sourceName, entry]);
    } catch (error) {
      if (lifetime?.signal.aborted && !signal?.aborted) continue;
      throw error;
    }
  }
  signal?.throwIfAborted();
  for (const [id, entry] of consumed) if (shared.helperInjections?.get(id) === entry) shared.helperInjections.delete(id);
  return contributions;
}

export function initializePromptCollection(shared) {
  initializeWorldbookEvents(shared);
  if (shared.collectMainPromptContributions) return;
  const frozen = shared.mainPromptContributions ??= new Map();
  const frozenTexts = shared.mainPromptTexts ??= new Map();
  const key = options => JSON.stringify([options.conversationId, options.requestId, options.preview === true]);
  shared.collectMainPromptContributions = options => {
    if (!options.requestId) throw new TypeError('A main prompt freeze requires its requestId.');
    const id = key(options);
    if (!frozen.has(id)) {
      // The native Agent is now preparing its actual turn. Browser listeners may
      // register contributions before this operation freezes them for scanning.
      const operation = Promise.resolve().then(async () => {
        options.signal?.throwIfAborted();
        await callback(() => shared.eventHub.emitAndWait('GENERATION_AFTER_COMMANDS', 'normal', {
          conversationId: options.conversationId, requestId: options.requestId, signal: options.signal,
        }, options.preview === true), options.signal);
        return collectPromptContributions(shared, options);
      });
      frozen.set(id, operation);
    }
    return frozen.get(id).then(value => structuredClone(value));
  };
  // Native fields join the same prepared request after the existing listener batch.
  // Preserve each invocation's position: identical random/setvar text is not deduplicated.
  shared.resolveMainPromptTexts = options => {
    if (!options.requestId) throw new TypeError('A card macro freeze requires its requestId.');
    const id = key(options), signature = JSON.stringify(options.texts);
    let frozenBatch = frozenTexts.get(id);
    if (frozenBatch && frozenBatch.signature !== signature) throw new Error('Frozen group card fields changed within the same prepared request.');
    if (!frozenBatch) {
      const operation = Promise.resolve().then(async () => {
        options.signal?.throwIfAborted();
        const realms = shared.promptRuntimes ?? new Map();
        const runtime = [...realms.keys()].find(item => item.snapshot?.context?.conversationId === options.conversationId && typeof item.substitute === 'function');
        if (!runtime) throw new Error('The original chat has no live browser card macro runtime.');
        const lifetime = realms.get(runtime);
        const signal = options.signal ? AbortSignal.any([options.signal, lifetime.signal]) : lifetime.signal;
        const texts = [];
        for (const entry of options.texts) {
          signal.throwIfAborted();
          const text = await callback(() => runtime.substitute(entry.content, {
            name1Override: entry.userName, name2Override: entry.characterName, replaceCharacterCard: false,
          }), signal);
          if (typeof text !== 'string') throw new TypeError('A card macro must resolve to text.');
          texts.push(text);
        }
        await callback(() => runtime.flush(), signal);
        signal.throwIfAborted();
        return texts;
      });
      frozenBatch = { signature, operation };
      frozenTexts.set(id, frozenBatch);
    }
    return callback(() => frozenBatch.operation.then(texts => [...texts]), options.signal);
  };
  shared.releaseMainPromptContributions = (conversationId, requestId) => {
    shared.releaseWorldbookEvents(conversationId, requestId);
    frozen.delete(key({ conversationId, requestId, preview: false }));
    frozen.delete(key({ conversationId, requestId, preview: true }));
    frozenTexts.delete(key({ conversationId, requestId, preview: false }));
    frozenTexts.delete(key({ conversationId, requestId, preview: true }));
  };
}
