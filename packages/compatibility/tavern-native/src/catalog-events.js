const copy = value => value === undefined ? undefined : structuredClone(value);
const items = value => Array.isArray(value) ? value : value?.items ?? [];
const stamp = value => JSON.stringify(value);
const characterView = character => {
  const raw = character.character ?? character.cardData ?? character;
  const data = raw.data ?? character.data ?? { ...character };
  return { ...copy(raw), ...copy(data), native_id: character.id,
    avatar: character.avatar_id ?? raw.avatar_id ?? character.avatar ?? character.id,
    avatar_path: character.avatar_path ?? character.avatar, name: character.name, data: copy(data) };
};

/** ST event consumers receive its wire shape, backed by the actual native entries. */
export function worldbookEventData(entries) {
  const positions = { before_character_definition: 0, after_character_definition: 1, top_of_an: 2,
    bottom_of_an: 3, at_depth: 4, before_example_messages: 5, before_examples: 5,
    after_example_messages: 6, after_examples: 6, outlet: 7 };
  const logic = { and_any: 0, not_all: 1, not_any: 2, and_all: 3 };
  return { entries: Object.fromEntries(entries.map(entry => {
    const strategy = entry.strategy ?? {}, secondary = strategy.keys_secondary ?? {},
      position = entry.position ?? {}, recursion = entry.recursion ?? {}, effect = entry.effect ?? {};
    const result = { ...copy(entry), uid: entry.uid,
      key: copy(entry.key ?? strategy.keys ?? []), keysecondary: copy(entry.keysecondary ?? secondary.keys ?? []),
      comment: entry.comment ?? entry.name ?? '', disable: entry.disable ?? entry.enabled === false,
      constant: strategy.type === 'constant' || entry.constant === true,
      vectorized: strategy.type === 'vectorized' || entry.vectorized === true,
      selective: (entry.keysecondary ?? secondary.keys ?? []).length > 0,
      selectiveLogic: logic[secondary.logic] ?? entry.selectiveLogic ?? 0,
      position: typeof position === 'number' ? position : typeof position.type === 'number' ? position.type : positions[position.type] ?? 0,
      depth: position.depth ?? entry.depth ?? 0,
      role: ({ system: 0, user: 1, assistant: 2 })[position.role] ?? entry.role ?? 0,
      order: position.order ?? entry.order ?? 100,
      scanDepth: strategy.scan_depth === 'same_as_global' ? null : strategy.scan_depth ?? entry.scanDepth ?? null,
      excludeRecursion: recursion.prevent_incoming ?? entry.excludeRecursion ?? false,
      preventRecursion: recursion.prevent_outgoing ?? entry.preventRecursion ?? false,
      delayUntilRecursion: recursion.delay_until ?? entry.delayUntilRecursion ?? false,
      sticky: effect.sticky ?? entry.sticky ?? null, cooldown: effect.cooldown ?? entry.cooldown ?? null,
      delay: effect.delay ?? entry.delay ?? null,
      caseSensitive: entry.case_sensitive === 'same_as_global' ? null : entry.case_sensitive ?? entry.caseSensitive ?? null,
      matchWholeWords: entry.match_whole_words === 'same_as_global' ? null : entry.match_whole_words ?? entry.matchWholeWords ?? null,
      useGroupScoring: entry.use_group_scoring === 'same_as_global' ? null : entry.use_group_scoring ?? entry.useGroupScoring ?? null,
      groupOverride: entry.group_prioritized ?? entry.groupOverride ?? false,
      groupWeight: entry.group_weight ?? entry.groupWeight ?? 100,
      useProbability: entry.use_probability ?? entry.useProbability ?? true,
      automationId: entry.automation_id ?? entry.automationId ?? '' };
    return [String(entry.uid), result];
  })) };
}

/** Accepted native catalog changes are published once, across all browser realms. */
export async function projectCatalogEvents(shared, snapshot, report = error => console.error('[ElecKoi events]', error), loadWorldbook) {
  const previous = shared.acceptedCatalog;
  const next = copy({ characters: snapshot.characters, personas: snapshot.personas, presets: snapshot.presets,
    groups: snapshot.groups, conversations: snapshot.conversations, worldbooks: snapshot.worldbooks,
    extensionSettings: snapshot.extensionSettings, lorebookSettings: snapshot.lorebookSettings });
  shared.acceptedCatalog = next;
  if (!previous) return;
  const emit = (event, ...args) => {
    for (const entry of shared.eventHub.listeners(event)) {
      if (!shared.eventHub.listeners(event).includes(entry)) continue;
      if (entry.once) shared.eventHub.remove(event, entry.listener);
      try { Promise.resolve(entry.listener(...args)).catch(report); } catch (error) { report(error); }
    }
  };
  for (const kind of ['characters', 'personas', 'presets']) {
    const before = new Map(items(previous[kind]).map(value => [value.id, value]));
    const after = new Map(items(next[kind]).map(value => [value.id, value]));
    for (const [id, old] of before) {
      const value = after.get(id);
      if (!value) {
        if (kind === 'characters') emit('characterDeleted', { id: items(previous.characters).findIndex(item => item.id === id), character: characterView(old) });
        else if (kind === 'personas') emit('persona_deleted', { avatarId: id, name: old.name });
        else emit('preset_deleted', { apiId: 'openai', name: old.name });
        continue;
      }
      if (stamp(old) === stamp(value)) continue;
      if (kind === 'characters') {
        if (old.name !== value.name) emit('character_renamed', characterView(old).avatar, characterView(value).avatar);
        emit('character_edited', { detail: { id: items(next.characters).findIndex(item => item.id === id), character: characterView(value) } });
      } else if (kind === 'personas') {
        if (old.name !== value.name) emit('persona_renamed', { avatarId: id, oldName: old.name, newName: value.name });
        emit('persona_updated', id);
      } else if (old.name !== value.name) emit('preset_renamed', { apiId: 'openai', oldName: old.name, newName: value.name });
    }
    if (kind === 'personas') for (const [id, value] of after) if (!before.has(id)) emit('persona_created', { avatarId: id, name: value.name, description: value.description ?? '', title: value.title ?? '' });
    if (previous[kind]?.activeId !== next[kind]?.activeId) {
      if (kind === 'characters') emit('character_page_loaded');
      else if (kind === 'personas') emit('persona_changed', next[kind]?.activeId);
      else emit('preset_changed', { apiId: 'openai', name: after.get(next[kind]?.activeId)?.name ?? '' });
    }
  }
  if (previous.conversations && next.conversations) {
    const before = new Map(items(previous.conversations).map(value => [value.id, value]));
    const after = new Map(items(next.conversations).map(value => [value.id, value]));
    for (const [id, old] of before) {
      const value = after.get(id);
      if (!value) emit(old.groupId ? 'group_chat_deleted' : 'chat_deleted', old.title);
      else if (old.title !== value.title) {
        const character = items(next.characters).find(item => item.id === value.characterId);
        emit('chat_renamed', { avatarId: character ? characterView(character).avatar : undefined,
          groupId: value.groupId ?? null, oldFileName: old.title, newFileName: value.title });
      }
    }
    for (const [id, value] of after) if (!before.has(id)) emit(value.groupId ? 'group_chat_created' : 'chat_created');
  }
  if (stamp(previous.extensionSettings) !== stamp(next.extensionSettings)) emit('settings_updated');
  if (stamp(previous.lorebookSettings) !== stamp(next.lorebookSettings)
    || stamp(previous.worldbooks?.bindings) !== stamp(next.worldbooks?.bindings)) emit('worldinfo_settings_updated');
  if (stamp(previous.groups) !== stamp(next.groups)) emit('group_updated');
  if (!shared.eventHub.listeners('worldinfo_updated').length) return;
  const before = new Map(items(previous.worldbooks).map(value => [value.id, value]));
  for (const value of items(next.worldbooks)) {
    const old = before.get(value.id);
    if (old && old.revision === value.revision) continue;
    if (typeof loadWorldbook !== 'function') throw new Error('Native worldbook event source is not connected.');
    emit('worldinfo_updated', value.name, worldbookEventData(await loadWorldbook(value.name)));
  }
}
