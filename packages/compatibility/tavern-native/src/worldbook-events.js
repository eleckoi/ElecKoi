import { worldbookEventData } from './catalog-events.js';
import { serializeWorldbookEntries, hydrateWorldbookEntries } from './worldbook-values.js';

const copy = value => value === undefined ? undefined : structuredClone(value);
const identity = entry => entry.eleckoiRuntimeId ?? entry.id ?? `${entry.world}.${entry.uid}`;
const effectTypes = ['sticky', 'cooldown', 'delay'];

/** Functions remain in the browser. Only their actual timer mutations return to the native scan. */
function timedEffects(data, entries) {
  const state = data.entries ??= {}, turn = data.turn, buffers = new Map();
  const field = { sticky: 'stickyUntil', cooldown: 'cooldownUntil', delay: 'delayUntilTurn' };
  const valid = type => typeof type === 'string' && effectTypes.includes(type.trim().toLowerCase());
  const typeOf = type => String(type).trim().toLowerCase();
  const active = (type, entry) => {
    if (!valid(type)) return false;
    type = typeOf(type);
    const timer = state[identity(entry)] ?? {};
    if (buffers.has(type)) return buffers.get(type).has(identity(entry));
    if (type === 'delay') return turn < Number(entry.delay ?? 0) || Number(timer.delayUntilTurn ?? 0) > turn;
    return Number(timer[field[type]] ?? 0) > turn && (type !== 'cooldown' || Number(timer.stickyUntil ?? 0) <= turn);
  };
  return {
    isValidEffectType: valid,
    getEffectMetadata(type, entry) {
      if (!valid(type)) return null;
      type = typeOf(type);
      const timer = state[identity(entry)], end = timer?.[field[type]];
      if (end === undefined) return undefined;
      return { hash: entry.hash, start: timer.activatedAt ?? turn, end, protected: timer.protected === true };
    },
    isEffectActive: active,
    checkTimedEffects() {
      buffers.clear();
      for (const type of effectTypes) buffers.set(type, new Set(entries.filter(entry => active(type, entry)).map(identity)));
    },
    setTimedEffect(type, entry, value) {
      if (!valid(type)) return;
      type = typeOf(type);
      if (data.preview && type !== 'delay') return;
      const id = identity(entry), timer = state[id] ??= {}, duration = Number(entry[type] ?? 0);
      if (value) { timer.activatedAt = turn; timer[field[type]] = turn + duration; }
      else delete timer[field[type]];
      buffers.delete(type);
    },
    setTimedEffects(activated) {
      if (data.preview) return;
      for (const entry of activated) for (const type of ['sticky', 'cooldown']) if (Number(entry[type]) > 0)
        this.setTimedEffect(type, entry, true);
    },
    cleanUp() { for (const type of effectTypes) buffers.set(type, new Set()); },
  };
}

function eventArguments(name, wire) {
  const pool = new Map();
  const entry = source => {
    const id = identity(source);
    if (pool.has(id)) return pool.get(id);
    const value = worldbookEventData(hydrateWorldbookEntries([source])).entries[String(source.uid)];
    value.eleckoiRuntimeId = id;
    value.world = source.world;
    if (value.hash === undefined) {
      let hash = 0;
      for (const character of String(id)) hash = (hash * 31 + character.charCodeAt(0)) | 0;
      value.hash = hash;
    }
    pool.set(id, value); return value;
  };
  if (name === 'worldinfo_entries_loaded') {
    const args = Object.fromEntries(['globalLore', 'characterLore', 'chatLore', 'personaLore']
      .map(scope => [scope, (wire[scope] ?? []).map(entry)]));
    return { args, wire: () => ({ ...Object.fromEntries(Object.entries(args).map(([scope, values]) => [scope, serializeWorldbookEntries(values)])),
      forcedActivations: wire.forcedActivations ?? [] }) };
  }
  if (name === 'world_info_activated') {
    const args = wire.map(entry);
    return { args, wire: () => serializeWorldbookEntries(args) };
  }
  if (name !== 'worldinfo_scan_done') throw new Error(`Unsupported native worldbook event: ${name}`);
  const sortedEntries = wire.sortedEntries.map(entry);
  const args = { ...copy(wire), sortedEntries,
    new: { all: wire.new.all.map(entry), successful: wire.new.successful.map(entry) },
    activated: { entries: new Map(wire.activated.entries.map(([key, value]) => [key, entry(value)])), text: wire.activated.text } };
  if (args.budget.current === null) args.budget.current = Infinity;
  const timers = copy(wire.timedEffects);
  args.timedEffects = timedEffects(timers, sortedEntries);
  return { args, wire: () => ({ ...args,
    budget: { ...args.budget, current: Number.isFinite(args.budget.current) ? args.budget.current : null },
    sortedEntries: serializeWorldbookEntries(args.sortedEntries),
    new: { all: serializeWorldbookEntries(args.new.all), successful: serializeWorldbookEntries(args.new.successful) },
    activated: { entries: [...args.activated.entries].map(([key, value]) => [key, serializeWorldbookEntries([value])[0]]),
      text: args.activated.text }, timedEffects: timers }) };
}

/** One prepared request owns one listener pass per scan stage, including dry-run previews. */
export function initializeWorldbookEvents(shared) {
  if (shared.dispatchWorldbookEvent) return;
  const frozen = shared.worldbookEventResults ??= new Map();
  const forced = shared.worldbookForcedActivations ??= new Map();
  shared.eventHub.on('worldinfo_force_activate', entries => {
    for (const entry of entries) {
      if (entry.world === undefined || entry.uid === undefined) throw new TypeError('Forced worldbook entries require world and uid.');
      forced.set(`${entry.world}.${entry.uid}`, copy(entry));
    }
  });
  shared.dispatchWorldbookEvent = options => {
    if (!options.requestId) throw new TypeError('Worldbook scan events require the prepared requestId.');
    const key = JSON.stringify([options.conversationId, options.requestId, options.preview === true, options.eventKey]);
    if (!frozen.has(key)) {
      const operation = Promise.resolve().then(async () => {
        options.signal?.throwIfAborted();
        const event = eventArguments(options.eventName, copy(options.payload));
        await shared.eventHub.emitAndWait(options.eventName, event.args);
        options.signal?.throwIfAborted();
        // Event listeners may write variables from any owning realm; acknowledge every actual write.
        await Promise.all([...(shared.promptRuntimes ?? new Map()).keys()].map(runtime => runtime.flush()));
        const result = event.wire();
        if (options.eventName === 'worldinfo_entries_loaded') {
          result.forcedActivations = serializeWorldbookEntries([...forced.values()]);
          if (!options.preview) forced.clear();
        }
        options.signal?.throwIfAborted();
        return result;
      });
      frozen.set(key, operation);
    }
    return frozen.get(key).then(copy);
  };
  shared.releaseWorldbookEvents = (conversationId, requestId) => {
    for (const key of frozen.keys()) {
      const [chat, request] = JSON.parse(key);
      if (chat === conversationId && request === requestId) frozen.delete(key);
    }
  };
}
