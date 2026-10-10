import { createHash } from 'node:crypto';
import { normalizeWorldbook, object, text, integer, flag, strings, clone } from './codec.js';

export const worldbookEntryHash = entry => createHash('sha256').update(JSON.stringify(entry)).digest('hex');
const interval = (start, duration, protectedEffect, hash) => ({ start, end: start + duration, protected: protectedEffect, hash });
function decorators(content) {
  if (!content.startsWith('@@')) return { decorators: [], content };
  const lines = content.split('\n'), result = []; let fallback = false;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (!line.startsWith('@@')) return { decorators: result, content: lines.slice(index).join('\n') };
    if (line.startsWith('@@@') && !fallback) continue;
    const decorator = line.startsWith('@@@') ? line.slice(1) : line;
    if (['@@activate', '@@dont_activate'].some(value => decorator.startsWith(value))) { result.push(decorator); fallback = false; }
    else fallback = true;
  }
  return { decorators: result, content };
}
class Entry {
  constructor(book, value, fixedHash) {
    this.book = book; this.value = value; this.uid = value.uid; this.key = `${book}:${value.uid}`;
    this.hash = fixedHash ?? worldbookEntryHash(value);
    const parsed = decorators(text(value.content));
    this.decorators = value.decorators ?? parsed.decorators; this.content = parsed.content;
    this.enabled = value.enabled !== false && value.disable !== true;
    const strategy = object(value.strategy), recursion = object(value.recursion), position = object(value.position), extra = object(value.extra);
    this.type = strategy.type ?? 'selective'; this.primary = strings(strategy.keys); this.secondary = strings(object(strategy.keys_secondary).keys);
    this.selective = value.selective !== false; this.logic = object(strategy.keys_secondary).logic ?? 'and_any';
    this.scanDepth = integer(strategy.scan_depth) ?? integer(value.scanDepth) ?? integer(value.keyword_scan_depth);
    this.order = integer(position.order) ?? integer(value.order) ?? 0;
    this.probability = value.useProbability === false ? 100 : value.probability ?? 100;
    this.preventIncoming = recursion.prevent_incoming ?? value.excludeRecursion ?? false;
    this.preventOutgoing = recursion.prevent_outgoing ?? value.preventRecursion ?? false;
    this.recursionDelay = integer(recursion.delay_until) ?? integer(value.delayUntilRecursion) ?? 0;
    this.groups = (text(extra.group) || text(value.group)).split(',').map(value => value.trim()).filter(Boolean);
    this.groupOverride = extra.groupOverride ?? value.groupOverride ?? false; this.groupWeight = extra.groupWeight ?? value.groupWeight ?? 100;
    this.groupScoring = extra.useGroupScoring ?? value.useGroupScoring; this.ignoreBudget = extra.ignoreBudget ?? value.ignoreBudget ?? false;
    this.positionType = position.type ?? 'at_depth'; this.outlet = text(extra.outletName) || text(value.outletName);
  }
  document(content = this.content) { return { ...clone(this.value), world: this.book, uid: this.uid, content, hash: this.hash, decorators: [...this.decorators] }; }
  effect(name) { return integer(object(this.value.effect)[name]) ?? integer(this.value[name]) ?? 0; }
  filterReason(context) {
    const triggers = strings(this.value.triggers);
    if (triggers.length && !triggers.includes(context.trigger ?? 'normal')) return 'generation-trigger';
    const filter = object(this.value.characterFilter ?? this.value.character_filter), exclude = filter.isExclude === true;
    const names = strings(filter.names), tags = strings(filter.tags);
    if (names.length && names.includes(context.characterFilename ?? '') === exclude) return 'character-filter';
    if (tags.length && context.characterTagIds !== undefined && [...context.characterTagIds].some(tag => tags.includes(tag)) === exclude) return 'tag-filter';
    return null;
  }
  additionalText(context) {
    return ['PersonaDescription', 'CharacterDescription', 'CharacterPersonality', 'CharacterDepthPrompt', 'Scenario', 'CreatorNotes']
      .filter(key => this.value[`match${key}`] === true || object(this.value.extra)[`match${key}`] === true)
      .map(key => context[`${key[0].toLowerCase()}${key.slice(1)}`] ?? '');
  }
  matches(scanText, key, settings) {
    // ST interprets invalid slash-style regex keys as literal strings.
    const parsed = /^\/([\s\S]+?)\/([gimsuy]*)$/.exec(key);
    if (parsed && new Set(parsed[2]).size === parsed[2].length && !/(^|[^\\])\//.test(parsed[1])) {
      try { return new RegExp(parsed[1].replace('\\/', '/'), parsed[2]).test(scanText); }
      catch (error) { if (!(error instanceof SyntaxError)) throw error; }
    }
    if (this.value.keyword_use_regex === true) return new RegExp(key, this.value.keyword_ignore_case !== false ? 'i' : '').test(scanText);
    const sensitive = flag(this.value.caseSensitive) ?? (flag(this.value.keyword_ignore_case) === undefined ? settings.caseSensitive : !this.value.keyword_ignore_case);
    const whole = flag(this.value.matchWholeWords) ?? flag(this.value.keyword_whole_word) ?? settings.matchWholeWords;
    if (!whole || /\s/.test(key)) return sensitive ? scanText.includes(key) : scanText.toLowerCase().includes(key.toLowerCase());
    return new RegExp(`(?:^|[^a-zA-Z0-9_])(${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?:$|[^a-zA-Z0-9_])`, sensitive ? '' : 'i').test(scanText);
  }
  score(scanText, settings) {
    if (!this.primary.length) return 0;
    const primary = this.primary.filter(key => this.matches(scanText, key, settings)).length;
    const secondary = this.secondary.filter(key => this.matches(scanText, key, settings)).length;
    return primary + (this.logic === 'and_any' ? secondary : this.logic === 'and_all' && secondary === this.secondary.length ? secondary : 0);
  }
  injection(content, conversationId) {
    const position = object(this.value.position);
    const anchors = { before_character_definition: 'beforeCharacterDefinition', after_character_definition: 'afterCharacterDefinition', before_example_messages: 'beforeExamples', after_example_messages: 'afterExamples', before_author_note: 'beforeAuthorNote', after_author_note: 'afterAuthorNote' };
    return { id: this.key, content, conversationId, role: position.role ?? this.value.insert_role ?? 'system', order: this.order,
      worldbookPosition: this.positionType, anchor: this.value.anchor ?? anchors[this.positionType] ?? 'beforeLatestUserInput',
      ...(this.value.nativePlacement ? { nativePlacement: clone(this.value.nativePlacement) } : {}),
      ...(this.positionType === 'at_depth' ? { depth: position.depth } : {}) };
  }
}
const fromDocument = value => new Entry(text(value.world), normalizeWorldbook({ entries: [value] }).entries[0], text(value.hash) || undefined);
function requireTokenizer(budget, tokenCount) { if (budget !== null && budget !== undefined && !tokenCount) throw new Error('Worldbook budget requires the actual model tokenizer'); }
function exactRows(rows, keys, operation) {
  const found = rows.map(row => row.key);
  if (found.length !== new Set(found).size || found.length !== keys.length || keys.some(key => !found.includes(key))) throw new Error(`Worldbook ${operation} returned missing or duplicate entries`);
}

/** One request-bound async scan. Pure state input/output; caller persists timings for the captured chat. */
export async function scanWorldbooks(input) {
  const { books, messages = [], scanText = '', conversationId, timedState = {}, dryRun = false,
    tokenCount, vectorMatches, expand = value => value, random = Math.random, scanContext = {},
    forcedEntries = {}, onScanLoop, matchEntries, formatEntries } = input;
  const messageCount = input.messageCount ?? messages.length;
  const settings = { recursive: true, maxRecursionSteps: 0, caseSensitive: false, matchWholeWords: false, useGroupScoring: false,
    minActivations: 0, maxScanDepth: 0, orderedKeys: [], ...input.settings };
  requireTokenizer(settings.budgetTokens, tokenCount);
  let candidates = Object.entries(books).flatMap(([book, raw]) => normalizeWorldbook(raw).entries.map(value => new Entry(book, value)));
  const ranks = new Map(settings.orderedKeys.map((key, index) => [key, index]));
  candidates.sort((a, b) => (ranks.size ? (ranks.get(a.key) ?? Infinity) - (ranks.get(b.key) ?? Infinity) : 0) || b.order - a.order);
  const trace = [], record = (entry, reason, level) => trace.push({ id: entry.key, reason, recursionLevel: level });
  let timing = clone(timedState);
  const sticky = new Set(), cooldown = new Set(), delay = new Set();
  if (!dryRun) for (const effect of ['sticky', 'cooldown']) for (const [key, original] of Object.entries(timing)) {
    const state = { ...original }, duration = object(state[effect]);
    if (!Number.isInteger(duration.start) || !Number.isInteger(duration.end)) continue;
    const hash = duration.hash || original.hash, entry = candidates.find(entry => entry.hash === hash);
    if (messageCount <= duration.start && !duration.protected || !entry && messageCount >= duration.end || entry && entry.effect(effect) <= 0) delete state[effect];
    else if (entry && messageCount >= duration.end) {
      delete state[effect];
      if (effect === 'sticky' && entry.effect('cooldown') > 0) { state.cooldown = interval(messageCount, entry.effect('cooldown'), true, entry.hash); cooldown.add(entry.key); }
    } else if (entry) (effect === 'sticky' ? sticky : cooldown).add(entry.key);
    if (['sticky', 'cooldown', 'delay'].some(effect => Object.hasOwn(state, effect))) timing[key] = state; else delete timing[key];
  }
  for (const entry of candidates) if (entry.effect('delay') > 0 && messageCount < entry.effect('delay')) delay.add(entry.key);
  const selected = new Map(), failedProbability = new Set(), recursionText = [];
  let allActivatedText = '', level = 0, budgetExceeded = false, budget = settings.budgetTokens ?? null, scanState = 1, loopCount = 0;
  let globalDepth = settings.scanDepth ?? Math.max(messages.length, 1);
  if (!candidates.length) return { entries: [], outlets: {}, timedState: dryRun ? clone(timedState) : timing, trace, activatedEntries: [], outletEntries: {} };
  let delayed = [...new Set(candidates.map(entry => entry.recursionDelay).filter(value => value > 0))].sort((a, b) => a - b);
  let recursionDelayLevel = delayed.shift() ?? 0;
  const bufferFor = entry => {
    const depth = entry.scanDepth ?? globalDepth;
    if (depth <= 0) return '';
    const joiner = '\n\u0001';
    return '\u0001' + [...messages].reverse().slice(0, Math.min(depth, 1000)).map(value => value.trim()).join(joiner)
      + [...entry.additionalText(scanContext), scanText, ...(scanState !== 3 ? [recursionText.join(joiner)] : [])].filter(Boolean).map(value => joiner + value).join('');
  };
  for (;;) {
    if (settings.maxRecursionSteps > 0 && loopCount >= settings.maxRecursionSteps) break;
    loopCount++;
    const scanTexts = new Map();
    const pending = candidates.filter(entry => {
      if (selected.has(entry.key) || failedProbability.has(entry.key)) return false;
      const isSticky = sticky.has(entry.key);
      const reason = !entry.enabled ? 'disabled' : entry.filterReason(scanContext) ?? (delay.has(entry.key) ? 'delay'
        : cooldown.has(entry.key) && !isSticky ? 'cooldown'
        : !isSticky && entry.recursionDelay > 0 && (scanState !== 2 || entry.recursionDelay > recursionDelayLevel) ? 'recursion-delay'
        : scanState === 2 && settings.recursive && entry.preventIncoming && !isSticky ? 'recursion-incoming-disabled'
        : !entry.decorators.includes('@@activate') && entry.decorators.includes('@@dont_activate') ? 'decorator-suppressed' : null);
      if (reason) { record(entry, reason, level); return false; }
      if (entry.type === 'vectorized') {
        if (forcedEntries[entry.key] || entry.decorators.includes('@@activate') || isSticky) return true;
        if (!vectorMatches) throw new Error(`Vector worldbook requires embedding retrieval: ${entry.key}`);
        return vectorMatches.has(entry.key);
      }
      return true;
    });
    const immediate = entry => entry.decorators.includes('@@activate') || sticky.has(entry.key) || !!forcedEntries[entry.key]
      || !!vectorMatches?.has(entry.key) || ['constant', 'vectorized'].includes(entry.type);
    const scores = new Map(); let matched;
    if (matchEntries) {
      const rows = await matchEntries({ settings: { caseSensitive: settings.caseSensitive, matchWholeWords: settings.matchWholeWords }, dryRun,
        entries: pending.map(entry => ({ key: entry.key, entry: entry.document(), text: bufferFor(entry), immediate: immediate(entry), scoreEntry: forcedEntries[entry.key] ?? entry.document() })) });
      exactRows(rows, pending.map(entry => entry.key), 'matching');
      matched = new Map(rows.map(row => { scores.set(row.key, row.score); return [row.key, row.matched]; }));
    }
    let eligible = [];
    for (const entry of pending) {
      let active = matched ? matched.get(entry.key) : immediate(entry);
      if (!matched && !active) {
        const buffer = bufferFor(entry); scanTexts.set(entry.key, buffer);
        for (const key of entry.primary) { const expanded = await expand(key); if (expanded && entry.matches(buffer, expanded.trim(), settings)) { active = true; break; } }
        if (active && entry.selective && entry.secondary.length) {
          const matches = async key => { const expanded = await expand(key); return !!expanded && entry.matches(buffer, expanded.trim(), settings); };
          if (entry.logic === 'and_all') { for (const key of entry.secondary) if (!await matches(key)) { active = false; break; } }
          else if (entry.logic === 'not_all') { active = false; for (const key of entry.secondary) if (!await matches(key)) { active = true; break; } }
          else if (entry.logic === 'not_any') { for (const key of entry.secondary) if (await matches(key)) { active = false; break; } }
          else { active = false; for (const key of entry.secondary) if (await matches(key)) { active = true; break; } }
        }
      }
      if (active) eligible.push(forcedEntries[entry.key] ? new Entry(entry.book, normalizeWorldbook({ entries: [forcedEntries[entry.key]] }).entries[0]) : entry);
    }
    for (const name of new Set(eligible.flatMap(entry => entry.groups))) {
      let group = eligible.filter(entry => entry.groups.includes(name));
      const stickyGroup = group.filter(entry => sticky.has(entry.key));
      if (stickyGroup.length) { eligible = eligible.filter(entry => !group.includes(entry) || stickyGroup.includes(entry)); continue; }
      if ([...selected.values()].some(entry => entry.groups.includes(name))) { eligible = eligible.filter(entry => !group.includes(entry)); continue; }
      if (settings.useGroupScoring || group.some(entry => entry.groupScoring === true)) {
        const values = new Map(group.map(entry => [entry.key, scores.get(entry.key) ?? entry.score(scanTexts.get(entry.key) ?? bufferFor(entry), settings)]));
        const highest = Math.max(...values.values());
        const losers = group.filter(entry => (entry.groupScoring ?? settings.useGroupScoring) && values.get(entry.key) < highest);
        eligible = eligible.filter(entry => !losers.includes(entry)); group = group.filter(entry => !losers.includes(entry));
      }
      if (group.length < 2) continue;
      let winner = group.filter(entry => entry.groupOverride).sort((a, b) => b.order - a.order)[0];
      if (!winner) { const roll = random() * group.reduce((sum, entry) => sum + entry.groupWeight, 0); let cumulative = 0; winner = group.find(entry => (cumulative += entry.groupWeight) >= roll); }
      eligible = eligible.filter(entry => !group.includes(entry) || entry === winner);
    }
    const newEntries = eligible.sort((a, b) => Number(sticky.has(b.key)) - Number(sticky.has(a.key)));
    const priorTokens = budget !== null ? await tokenCount(allActivatedText) : 0;
    let newContent = '', ignoresBudget = newEntries.filter(entry => entry.ignoreBudget).length;
    for (const entry of newEntries) {
      if (entry.ignoreBudget) ignoresBudget--;
      if (budgetExceeded && !entry.ignoreBudget) { if (ignoresBudget > 0) continue; break; }
      if (!sticky.has(entry.key) && entry.probability !== 100 && random() * 100 > entry.probability) { failedProbability.add(entry.key); record(entry, 'probability', level); continue; }
      entry.content = await expand(entry.content); newContent += `${entry.content}\n`;
      if (!entry.ignoreBudget && budget !== null && priorTokens + await tokenCount(newContent) >= budget) { budgetExceeded = true; record(entry, 'budget', level); continue; }
      selected.set(entry.key, entry); record(entry, sticky.has(entry.key) ? 'sticky' : forcedEntries[entry.key] ? 'externally-activated' : 'activated', level);
    }
    const successful = newEntries.filter(entry => !failedProbability.has(entry.key)), recursiveEntries = successful.filter(entry => !entry.preventOutgoing);
    const deeperAvailable = selected.size < settings.minActivations && globalDepth <= messages.length && (settings.maxScanDepth === 0 || globalDepth <= settings.maxScanDepth);
    let nextState = 0, nextLevel = level;
    if (settings.recursive && !budgetExceeded && (recursiveEntries.length || scanState === 3 && recursionText.some(Boolean))) { nextState = 2; nextLevel = Math.max(level + 1, recursionDelayLevel); }
    if (!nextState && !budgetExceeded && deeperAvailable) { globalDepth++; nextLevel = 0; nextState = 3; }
    if (!nextState && delayed.length) { recursionDelayLevel = delayed.shift(); nextLevel = recursionDelayLevel; nextState = 2; }
    if (nextState) { const content = recursiveEntries.map(entry => entry.content).join('\n'); if (content) { recursionText.push(content); allActivatedText = `${content}\n${allActivatedText}`; } }
    if (onScanLoop) {
      const payload = { state: { current: scanState, next: nextState, loopCount }, new: { all: newEntries.map(entry => entry.document()), successful: successful.map(entry => entry.document()) },
        activated: { entries: [...selected.values()].map(entry => [`${entry.book}.${entry.uid}`, entry.document()]), text: allActivatedText },
        sortedEntries: candidates.map(entry => entry.document()), recursionDelay: { availableLevels: [...delayed], currentLevel: recursionDelayLevel },
        budget: { current: budget, overflowed: budgetExceeded }, timedState: clone(timing), messageCount, dryRun };
      const updated = await onScanLoop(payload);
      nextState = updated.state.next;
      if (!Number.isInteger(nextState) || nextState < 0 || nextState > 3) throw new TypeError(`Unknown worldbook scan state: ${nextState}`);
      recursionDelayLevel = updated.recursionDelay.currentLevel; delayed = [...updated.recursionDelay.availableLevels];
      budget = updated.budget.current;
      if (budget !== null && !Number.isFinite(budget)) throw new TypeError('Worldbook budget must be a number or null');
      requireTokenizer(budget, tokenCount); budgetExceeded = updated.budget.overflowed;
      selected.clear(); for (const [, document] of updated.activated.entries) { const entry = fromDocument(document); selected.set(entry.key, entry); }
      candidates = updated.sortedEntries.map(fromDocument); allActivatedText = updated.activated.text; timing = clone(updated.timedState);
    }
    if (!nextState) break;
    scanState = nextState; level = nextLevel;
  }
  if (!dryRun) for (const [key, entry] of selected) {
    const state = { ...object(timing[key]), hash: entry.hash };
    for (const effect of ['sticky', 'cooldown']) if (entry.effect(effect) > 0 && !Object.hasOwn(state, effect)) state[effect] = interval(messageCount, entry.effect(effect), false, entry.hash);
    if (Object.keys(state).length > 1) timing[key] = state;
  }
  const sorted = [...selected.values()].sort((a, b) => b.order - a.order);
  let formatted;
  if (formatEntries) { const rows = await formatEntries({ dryRun, entries: sorted.map(entry => ({ key: entry.key, entry: entry.document() })) }); exactRows(rows, [...selected.keys()], 'formatting'); formatted = new Map(rows.map(row => [row.key, row.content])); }
  const entries = [], outletEntries = {};
  for (const entry of sorted) {
    const content = formatted?.get(entry.key) ?? entry.content;
    if (!content) continue;
    if (entry.positionType === 'outlet') { if (entry.outlet) (outletEntries[entry.outlet] ??= []).push(content); }
    else entries.push(entry.injection(content, conversationId));
  }
  return { entries, outlets: Object.fromEntries(Object.entries(outletEntries).map(([name, values]) => [name, values.join('\n')])),
    timedState: dryRun ? clone(timedState) : timing, trace, activatedEntries: [...selected.values()].map(entry => entry.document()), outletEntries };
}
