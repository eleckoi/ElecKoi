export const positions = ['before_character_definition', 'after_character_definition', 'before_author_note', 'after_author_note', 'at_depth', 'before_example_messages', 'after_example_messages', 'outlet'];
export const roles = ['system', 'user', 'assistant'];
export const logics = ['and_any', 'not_all', 'not_any', 'and_all'];
export const nativeAnchors = { instructions: 'beforeBaseInstructions', insert_point_1: 'beforeHistory', insert_point_2: 'beforeHistory', insert_point_3: 'beforeLatestUserInput', insert_point_4: 'afterLatestUserInput', insert_point_5: 'afterHistory' };
export const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
export const text = value => typeof value === 'string' ? value : '';
export const integer = value => Number.isInteger(value) ? value : undefined;
export const flag = value => typeof value === 'boolean' ? value : undefined;
export const strings = value => Array.isArray(value) ? value.map(String) : [];
export const clone = value => structuredClone(value);

/** Preserve original root/entry fields while giving raw ST, TH and native inputs a common view. */
export function normalizeWorldbook(book) {
  if (!book || typeof book !== 'object' || Array.isArray(book)) throw new TypeError('Worldbook must be an object');
  const values = book.entries === undefined ? [] : Array.isArray(book.entries) ? book.entries
    : book.entries && typeof book.entries === 'object' ? Object.values(book.entries)
    : (() => { throw new TypeError('Worldbook entries must be an array or object'); })();
  const used = new Set(); let next = 0;
  return { ...clone(book), entries: values.map(raw => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new TypeError('Worldbook entry must be an object');
    const entry = clone(raw), strategy = object(entry.strategy), secondary = object(strategy.keys_secondary), position = object(entry.position);
    let uid = integer(entry.uid);
    if (uid === undefined || used.has(uid)) { while (used.has(next)) next++; uid = next++; }
    used.add(uid);
    const isRaw = ['constant', 'vectorized', 'key', 'keys', 'trigger_mode'].some(key => Object.hasOwn(entry, key));
    const type = strategy.type ?? (!isRaw || entry.constant === true || entry.trigger_mode === 'always' ? 'constant' : entry.vectorized === true ? 'vectorized' : 'selective');
    const condition = entry.keyword_condition;
    return {
      ...entry, uid, name: entry.name ?? entry.comment ?? entry.title ?? '', enabled: entry.enabled ?? entry.disable !== true,
      strategy: {
        ...strategy, type, keys: strategy.keys ?? entry.key ?? entry.keys ?? entry.keywords ?? [],
        keys_secondary: { ...secondary, logic: secondary.logic ?? (condition !== undefined
          ? ({ all: 'and_all', and_all: 'and_all', not_all: 'not_all', not_any: 'not_any' }[condition] ?? 'and_any')
          : logics[integer(entry.selectiveLogic) ?? 0] ?? 'and_any'), keys: secondary.keys ?? entry.keysecondary ?? entry.condition_keywords ?? [] },
        scan_depth: strategy.scan_depth ?? entry.scanDepth ?? entry.keyword_scan_depth ?? 'same_as_global'
      },
      position: {
        ...position, type: position.type ?? positions[integer(entry.position)] ?? 'at_depth',
        role: position.role ?? entry.insert_role ?? roles[integer(entry.role) ?? 0] ?? 'system',
        depth: position.depth ?? entry.depth ?? 4, order: position.order ?? entry.order ?? 100
      },
      content: entry.content ?? '', probability: entry.useProbability === false ? 100 : entry.probability ?? 100,
      recursion: {
        prevent_incoming: entry.excludeRecursion ?? false, prevent_outgoing: entry.preventRecursion ?? false,
        delay_until: entry.delayUntilRecursion === true ? 1 : integer(entry.delayUntilRecursion) > 0 ? entry.delayUntilRecursion : null,
        ...object(entry.recursion)
      },
      effect: { sticky: entry.sticky ?? null, cooldown: entry.cooldown ?? null, delay: entry.delay ?? null, ...object(entry.effect) },
      ...(nativeAnchors[entry.position] ? { anchor: nativeAnchors[entry.position] } : {})
    };
  }) };
}

export const defaultWorldbookSettings = () => ({ scan_depth: 2, context_percentage: 25, budget_cap: 0, min_activations: 0, max_depth: 0, max_recursion_steps: 0, insertion_strategy: 'character_first', include_names: true, recursive: false, case_sensitive: false, match_whole_words: false, use_group_scoring: false, overflow_alert: false });
export function worldbookScanSettings(value, contextWindow) {
  if (!Number.isFinite(contextWindow) || contextWindow < 0) throw new TypeError('A real model context window is required');
  const budget = Math.round(contextWindow * (value.context_percentage ?? 25) / 100) || 1;
  return { scanDepth: integer(value.scan_depth), recursive: value.recursive ?? false, maxRecursionSteps: value.max_recursion_steps ?? 0,
    caseSensitive: value.case_sensitive ?? false, matchWholeWords: value.match_whole_words ?? false, useGroupScoring: value.use_group_scoring ?? false,
    minActivations: value.min_activations ?? 0, maxScanDepth: value.max_depth ?? 0,
    budgetTokens: value.budget_cap > 0 ? Math.min(budget, value.budget_cap) : budget };
}
