import { normalizeWorldbook } from './codec.js';

export function worldbookOrderedKeys(books, scopes, strategy = 'character_first') {
  const scope = key => (scopes[key] ?? []).flatMap(book => books[book] ? normalizeWorldbook(books[book]).entries.map(entry => ({ book, entry })) : []);
  const sorted = entries => entries.sort((a, b) => b.entry.position.order - a.entry.position.order);
  const shared = strategy === 'global_first' ? [...sorted(scope('globalLore')), ...sorted(scope('characterLore'))]
    : strategy === 'evenly' ? sorted([...scope('globalLore'), ...scope('characterLore')])
    : [...sorted(scope('characterLore')), ...sorted(scope('globalLore'))];
  return [...new Set([...sorted(scope('chatLore')), ...sorted(scope('personaLore')), ...shared].map(({ book, entry }) => `${book}:${entry.uid}`))];
}
export function worldbookVectorMatches(books, matches, maximumPerBook) {
  if (!Number.isInteger(maximumPerBook) || maximumPerBook < 0) throw new TypeError('Vector maximumPerBook must be a nonnegative integer');
  const groups = Map.groupBy(matches, row => row.id.slice(0, row.id.lastIndexOf(':')));
  const matchedIds = new Set([...groups.values()].flatMap(rows => rows.sort((a, b) => b.score - a.score).slice(0, maximumPerBook)).map(row => row.id));
  return new Set(Object.entries(books).flatMap(([name, book]) => normalizeWorldbook(book).entries
    .map(entry => `${name}:${entry.uid}`).filter(id => matchedIds.has(id))));
}
export function worldbookFragments(entries, position) {
  return entries.filter(entry => entry.worldbookPosition === position).sort((a, b) => (b.order ?? 100) - (a.order ?? 100)).reverse().map(entry => entry.content).filter(Boolean);
}
export const worldbookExampleContent = (entries, examples) => [...worldbookFragments(entries, 'before_example_messages'), ...(examples ? [examples] : []), ...worldbookFragments(entries, 'after_example_messages')].join('\n');
export function projectWorldbookAnchors(entries, note, examples, conversationId) {
  const before = worldbookFragments(entries, 'before_author_note'), after = worldbookFragments(entries, 'after_author_note');
  const active = note.worldbook_enabled ?? note.position !== 'none';
  const content = [...before, note.content ?? '', ...after].join('\n').replace(/^\n/, '').replace(/\n$/, '');
  return {
    entries: entries.filter(entry => !['before_author_note', 'after_author_note', 'before_example_messages', 'after_example_messages'].includes(entry.worldbookPosition)),
    note: !active || !before.length && !after.length ? { ...note } : { ...note, content, position: content ? 'note' : 'none' },
    examples: [
      ...entries.filter(entry => entry.worldbookPosition === 'before_example_messages').map(entry => ({ ...entry, anchor: 'beforeExamples' })),
      ...(examples ? [{ id: 'worldbook-examples', conversationId, role: 'system', anchor: 'examples', content: examples }] : []),
      ...entries.filter(entry => entry.worldbookPosition === 'after_example_messages').map(entry => ({ ...entry, anchor: 'afterExamples' }))
    ]
  };
}

/** Native placements retain their anchors; Tavern insertion depth uses the host cache region. */
export function projectFrozenWorldbookMessages(messages, fragments, options) {
  const slots = new Map();
  for (const fragment of fragments) {
    let index;
    if (fragment.nativePlacement) {
      index = options.anchorIndexes[fragment.nativePlacement.position];
    } else if (fragment.worldbookPosition === 'at_depth') {
      index = options.anchorIndexes.cacheSettings;
    } else index = options.anchorIndexes[String(fragment.anchor)];
    if (!Number.isInteger(index) || index < 0 || index > messages.length)
      throw Object.assign(new Error(`Real Prompt anchor is unavailable: ${fragment.anchor}`), { code: 'PROMPT_ANCHOR_NOT_AVAILABLE' });
    const group = slots.get(index) ?? []; group.push(fragment); slots.set(index, group);
  }
  const projected = [];
  for (let index = 0; index <= messages.length; index++) {
    const entries = slots.get(index) ?? [];
    entries.sort((a, b) => Number(a.projectionRank ?? 0) - Number(b.projectionRank ?? 0) || Number(a.order ?? 100) - Number(b.order ?? 100));
    projected.push(...entries.map(fragment => options.createMessage(fragment)));
    if (index < messages.length) projected.push(messages[index]);
  }
  return projected;
}
