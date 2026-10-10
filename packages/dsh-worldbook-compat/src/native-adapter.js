import { randomUUID } from 'node:crypto';
import { normalizeWorldbook, nativeAnchors, clone, object } from './codec.js';

const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const normal = entry => (entry.kind ?? 'normal') === 'normal';
const conditions = { none: 'and_any', any: 'and_any', all: 'and_all', not_any: 'not_any' };
const fields = ['title', 'content', 'enabled', 'keywords', 'conditionKeywords', 'keywordCondition', 'keywordScanDepth', 'keywordUseRegex', 'keywordIgnoreCase', 'keywordWholeWord', 'triggerMode', 'insertRole', 'order', 'position'];
const baseline = entry => Object.fromEntries(fields.map(key => [key, clone(entry[key])]));
function mergeNative(previous, current) {
  if (Array.isArray(current)) return current.map((item, index) => mergeNative(item && typeof item === 'object' && item.id ? previous?.find?.(old => old.id === item.id) : previous?.[index], item));
  if (current && typeof current === 'object') return { ...clone(object(previous)), ...Object.fromEntries(Object.entries(current).map(([key, value]) => [key, mergeNative(previous?.[key], value)])) };
  return current;
}
function fromNative(entry, uid) {
  return normalizeWorldbook({ entries: [{ ...clone(entry), uid, name: entry.title, enabled: entry.enabled, content: entry.content,
    strategy: { type: entry.triggerMode === 'always' ? 'constant' : 'selective', keys: entry.keywords ?? [],
      keys_secondary: { keys: entry.conditionKeywords ?? [], logic: conditions[entry.keywordCondition] ?? 'and_any' }, scan_depth: entry.keywordScanDepth ?? 1 },
    position: { type: 'at_depth', role: entry.insertRole ?? 'system', depth: 4, order: entry.order ?? 1 },
    nativePlacement: { position: entry.position, promptPositionId: entry.promptPositionId ?? '' },
    keyword_use_regex: entry.keywordUseRegex ?? false, caseSensitive: !(entry.keywordIgnoreCase ?? true), matchWholeWords: entry.keywordWholeWord ?? false,
    ...(nativeAnchors[entry.position] ? { anchor: nativeAnchors[entry.position] } : {}) }] }).entries[0];
}
function overlayNative(source, entry, previous) {
  const result = clone(source), changed = key => !equal(entry[key], previous[key]);
  if (changed('title')) result.name = entry.title;
  if (changed('content')) result.content = entry.content;
  if (changed('enabled')) { result.enabled = entry.enabled; if (Object.hasOwn(result, 'disable')) result.disable = !entry.enabled; }
  if (changed('keywords')) result.strategy.keys = clone(entry.keywords);
  if (changed('conditionKeywords')) result.strategy.keys_secondary.keys = clone(entry.conditionKeywords);
  if (changed('keywordCondition')) result.strategy.keys_secondary.logic = conditions[entry.keywordCondition] ?? 'and_any';
  if (changed('keywordScanDepth')) result.strategy.scan_depth = entry.keywordScanDepth;
  if (changed('keywordUseRegex')) result.keyword_use_regex = entry.keywordUseRegex;
  if (changed('keywordIgnoreCase')) result.caseSensitive = !entry.keywordIgnoreCase;
  if (changed('keywordWholeWord')) result.matchWholeWords = entry.keywordWholeWord;
  if (changed('triggerMode')) result.strategy.type = entry.triggerMode === 'always' ? 'constant' : 'selective';
  if (changed('insertRole')) result.position.role = entry.insertRole;
  if (changed('order')) result.position.order = entry.order;
  if (changed('position')) { if (nativeAnchors[entry.position]) result.anchor = nativeAnchors[entry.position]; else delete result.anchor; }
  if (result.nativePlacement) result.nativePlacement = { position: entry.position, promptPositionId: entry.promptPositionId ?? '' };
  return result;
}
function emptyNative(id, timestamp) {
  return { id, title: '', iconId: '', kind: 'normal', groupId: '', content: '', openingMessages: [], defaultOpeningMessageId: '',
    agentSelectionHint: '', agentReadStrategy: 'normal', dynamicMode: 'standard', contentMode: 'plain_text', keywords: [], keywordScanDepth: 1,
    conditionKeywords: [], keywordCondition: 'none', keywordUseRegex: false, keywordIgnoreCase: true, keywordWholeWord: false, keywordRecursionDepth: 0,
    triggerMode: 'agent_tool', enabled: true, position: null, promptPositionId: '', insertRole: 'system', order: 1,
    viewOrder: 0, groupViewOrder: 0, treeViewOrder: 0, createdAt: timestamp, updatedAt: timestamp };
}
function toNative(entry, existing, timestamp) {
  const source = { ...emptyNative(existing?.id ?? randomUUID(), timestamp), ...clone(existing ?? {}) };
  return { ...source, title: String(entry.name || `条目 ${entry.uid}`).slice(0, 120), content: entry.content, enabled: entry.enabled,
    keywords: clone(entry.strategy.keys), conditionKeywords: clone(entry.strategy.keys_secondary.keys),
    keywordCondition: { and_all: 'all', not_any: 'not_any', and_any: 'any' }[entry.strategy.keys_secondary.logic] ?? 'none',
    keywordScanDepth: Number.isInteger(entry.strategy.scan_depth) ? entry.strategy.scan_depth : source.keywordScanDepth,
    keywordUseRegex: entry.keyword_use_regex ?? source.keywordUseRegex,
    keywordIgnoreCase: entry.caseSensitive !== undefined ? !entry.caseSensitive : source.keywordIgnoreCase,
    keywordWholeWord: entry.matchWholeWords ?? source.keywordWholeWord,
    triggerMode: entry.strategy.type === 'constant' ? 'always' : 'agent_tool',
    agentReadStrategy: entry.strategy.type === 'selective' && entry.strategy.keys.length ? 'keyword' : source.agentReadStrategy,
    position: entry.nativePlacement ? entry.nativePlacement.position : source.position,
    promptPositionId: entry.nativePlacement ? entry.nativePlacement.promptPositionId : source.promptPositionId,
    insertRole: entry.position.role, order: Math.max(1, entry.position.order), updatedAt: timestamp };
}
function rawWithNativeChanges(source, current) {
  const normalized = normalizeWorldbook({ entries: [source] }).entries[0];
  const result = clone(source);
  if (!equal(current.name, normalized.name)) result[Object.hasOwn(source, 'comment') ? 'comment' : Object.hasOwn(source, 'title') ? 'title' : 'name'] = current.name;
  if (!equal(current.content, normalized.content)) result.content = current.content;
  if (!equal(current.enabled, normalized.enabled)) { if (Object.hasOwn(source, 'disable')) result.disable = !current.enabled; else result.enabled = current.enabled; }
  if (!equal(current.strategy, normalized.strategy)) {
    if (source.strategy && typeof source.strategy === 'object') result.strategy = clone(current.strategy);
    else { result.constant = current.strategy.type === 'constant'; result.vectorized = current.strategy.type === 'vectorized'; result.key = clone(current.strategy.keys);
      result.keysecondary = clone(current.strategy.keys_secondary.keys); result.selectiveLogic = ['and_any', 'not_all', 'not_any', 'and_all'].indexOf(current.strategy.keys_secondary.logic);
      result.scanDepth = current.strategy.scan_depth === 'same_as_global' ? null : current.strategy.scan_depth; }
  }
  if (!equal(current.position, normalized.position)) {
    if (source.position && typeof source.position === 'object') result.position = clone(current.position);
    else { result.position = ['before_character_definition', 'after_character_definition', 'before_author_note', 'after_author_note', 'at_depth', 'before_example_messages', 'after_example_messages', 'outlet'].indexOf(current.position.type);
      result.role = ['system', 'user', 'assistant'].indexOf(current.position.role); result.depth = current.position.depth; result.order = current.position.order; }
  }
  for (const field of ['anchor', 'caseSensitive', 'matchWholeWords', 'keyword_use_regex']) if (!equal(current[field], normalized[field])) result[field] = current[field];
  return result;
}

/** Adapters project compatibility fields onto the native repository and companion storage. */
export class NativeWorldbookAdapter {
  constructor(adapter) {
    for (const name of ['readNative', 'saveNative', 'readCompanion', 'saveCompanion', 'atomic']) if (typeof adapter[name] !== 'function') throw new TypeError(`Native worldbook adapter requires ${name}`);
    this.adapter = adapter;
  }
  read(characterId) {
    return this.adapter.atomic(() => this.readCurrent(characterId));
  }
  readCurrent(characterId) {
      const native = clone(this.adapter.readNative(characterId));
      let companion = this.adapter.readCompanion(characterId);
      if (!companion) companion = { schemaVersion: 1, book: { name: native.name, entries: [] }, rawBook: { name: native.name, entries: [] }, nativeIds: {}, baseline: {}, compatibilityEntryIds: [], nativeSource: clone(native) };
      else companion = clone(companion);
      const stored = normalizeWorldbook(companion.book), byUid = new Map(stored.entries.map(entry => [String(entry.uid), entry]));
      const reverse = new Map(Object.entries(companion.nativeIds).map(([uid, id]) => [id, Number(uid)]));
      const used = new Set(stored.entries.map(entry => entry.uid)); let next = 0;
      const entries = [];
      for (const entry of native.entries.filter(normal)) {
        let uid = reverse.get(entry.id);
        if (uid === undefined) { while (used.has(next)) next++; uid = next++; used.add(uid); companion.nativeIds[uid] = entry.id; }
        const source = byUid.get(String(uid));
        entries.push(source ? overlayNative(source, entry, companion.baseline[entry.id] ?? baseline(entry)) : fromNative(entry, uid));
        companion.baseline[entry.id] = baseline(entry);
      }
      // Refresh companion data only; product rows, versions and native Agent rules stay owned by the repository.
      companion.nativeSource = mergeNative(companion.nativeSource, native);
      companion.book = { ...stored, name: stored.name ?? native.name, entries };
      this.adapter.saveCompanion(characterId, companion);
      return clone(companion.book);
  }
  put(characterId, book) {
    return this.adapter.atomic(() => {
      const previous = this.readCurrent(characterId), currentNative = clone(this.adapter.readNative(characterId));
      const companion = clone(this.adapter.readCompanion(characterId));
      const normalized = normalizeWorldbook(book), prior = new Map(previous.entries.map(entry => [entry.uid, entry]));
      const existing = new Map(currentNative.entries.map(entry => [entry.id, entry])), owned = new Set(companion.compatibilityEntryIds);
      const timestamp = new Date().toISOString(), nativeIds = {}, names = new Set();
      const entries = normalized.entries.map(entry => {
        const oldId = companion.nativeIds[entry.uid], base = existing.get(oldId);
        const previousEntry = prior.get(entry.uid);
        if (previousEntry?.nativePlacement && equal(entry.position, previousEntry.position) && equal(entry.anchor, previousEntry.anchor)) {
          entry.nativePlacement = clone(previousEntry.nativePlacement);
        } else delete entry.nativePlacement;
        const projected = toNative(entry, base, timestamp);
        const extraFields = value => Object.fromEntries(Object.entries(value ?? {}).filter(([key]) => ![
          ...fields, 'uid', 'name', 'strategy', 'caseSensitive', 'matchWholeWords', 'keyword_use_regex', 'anchor', 'nativePlacement'
        ].includes(key)));
        if (owned.has(projected.id) || !previousEntry || !entry.nativePlacement
          || !equal(entry.strategy, previousEntry.strategy)
          || !equal(extraFields(entry), extraFields(previousEntry))) owned.add(projected.id);
        const duplicate = `${projected.groupId}\0${projected.title.toLocaleLowerCase()}`;
        if (names.has(duplicate)) projected.title = `${projected.title.slice(0, 100)} [${entry.uid}]`;
        names.add(`${projected.groupId}\0${projected.title.toLocaleLowerCase()}`);
        nativeIds[entry.uid] = projected.id;
        return projected;
      });
      const protectedEntries = currentNative.entries.filter(entry => !normal(entry));
      const nextNative = { ...currentNative, entries: [...protectedEntries, ...entries] };
      // The active native version is rewritten by its existing repository. Other versions/folders are untouched.
      this.adapter.saveNative(characterId, nextNative);
      const saved = clone(this.adapter.readNative(characterId));
      this.adapter.saveCompanion(characterId, {
        ...companion, rawBook: clone(book), book: normalized, nativeIds, baseline: Object.fromEntries(saved.entries.filter(normal).map(entry => [entry.id, baseline(entry)])),
        compatibilityEntryIds: entries.filter(entry => owned.has(entry.id)).map(entry => entry.id), nativeSource: mergeNative(companion.nativeSource, saved)
      });
      return this.readCurrent(characterId);
    });
  }
  putNative(characterId, source) {
    return this.adapter.atomic(() => {
      this.readCurrent(characterId);
      const companion = clone(this.adapter.readCompanion(characterId));
      this.adapter.saveNative(characterId, clone(source));
      companion.nativeSource = clone(source);
      this.adapter.saveCompanion(characterId, companion);
      return this.readCurrent(characterId);
    });
  }
  exportRaw(characterId) {
    const current = this.read(characterId), companion = this.adapter.readCompanion(characterId), book = clone(companion.rawBook ?? companion.book);
    const original = book.entries ?? [], rawEntries = Array.isArray(original) ? original : Object.values(original);
    const normalized = normalizeWorldbook({ entries: rawEntries }).entries;
    const mapping = new Map(normalized.map((entry, index) => [entry.uid, rawEntries[index]]));
    const updated = current.entries.map(entry => mapping.has(entry.uid) ? rawWithNativeChanges(mapping.get(entry.uid), entry) : clone(entry));
    if (!Array.isArray(original)) {
      const keys = Object.keys(original), ids = new Map(normalized.map((entry, index) => [entry.uid, keys[index]]));
      book.entries = Object.fromEntries(updated.map((entry, index) => [ids.get(current.entries[index].uid) ?? String(current.entries[index].uid), entry]));
    } else book.entries = updated;
    return book;
  }
  compatibilityEntryIds(characterId) { this.read(characterId); return [...this.adapter.readCompanion(characterId).compatibilityEntryIds]; }
  scanBook(characterId) {
    const book = this.read(characterId), companion = this.adapter.readCompanion(characterId), owned = new Set(companion.compatibilityEntryIds);
    return { ...book, entries: book.entries.filter(entry => owned.has(companion.nativeIds[entry.uid])) };
  }
  exportNativeRaw(characterId) { this.read(characterId); return clone(this.adapter.readCompanion(characterId).nativeSource); }
}
