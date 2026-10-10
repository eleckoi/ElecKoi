export const PLACEHOLDER_ORDER = ['world_info_before', 'persona_description', 'char_description', 'char_personality',
  'scenario', 'world_info_after', 'dialogue_examples', 'chat_history', 'user_input'];
const aliases = { worldInfoBefore: 'world_info_before', personaDescription: 'persona_description', charDescription: 'char_description',
  charPersonality: 'char_personality', scenario: 'scenario', worldInfoAfter: 'world_info_after', dialogueExamples: 'dialogue_examples', chatHistory: 'chat_history' };
const text = value => typeof value === 'string' ? value : '';
const single = (content, role = 'system') => content ? [{ role, content }] : [];

/** Compose auxiliary SDK prompts without changing the selected preset or character. */
export function composeGenerationPrompts(params, preset, card, persona, history, worldbooks = [], injections = []) {
  const data = card?.data || card || {}, overrides = params.overrides || {}, historyOptions = overrides.chat_history || {};
  const maximum = params.max_chat_history;
  if (maximum !== undefined && maximum !== 'all' && (!Number.isInteger(maximum) || maximum < 0)) throw new TypeError('max_chat_history must be all or a nonnegative integer');
  const sourceHistory = historyOptions.prompts || history;
  const limited = typeof maximum === 'number' ? maximum === 0 ? [] : sourceHistory.slice(-maximum) : sourceHistory;
  const selectedBooks = params.skipWIAN ? [] : worldbooks;
  const at = position => selectedBooks.filter(entry => entry.worldbookPosition === position).map(entry => entry.content).join('\n');
  const defaults = { world_info_before: at('before_character_definition'), world_info_after: at('after_character_definition'),
    persona_description: text(persona?.description), char_description: text(data.description), char_personality: text(data.personality),
    scenario: text(data.scenario), dialogue_examples: [at('before_example_messages'), text(data.mes_example), at('after_example_messages')].filter(Boolean).join('\n') };
  const builtin = (name, role = 'system') => {
    if (name === 'chat_history') return limited;
    if (name === 'user_input') {
      const role = params.quietGenerate ? 'system' : 'user', content = params.userContent ?? params.user_input ?? params.prompt ?? '';
      const messages = Array.isArray(content) ? [{ role, content }] : single(content, role);
      return messages.map(message => params.quietName ? { ...message, name: params.quietName } : message);
    }
    if (!(name in defaults)) throw new Error(`Unknown builtin prompt: ${name}`);
    return single(Object.hasOwn(overrides, name) ? text(overrides[name]) : defaults[name], role);
  };
  const validate = message => {
    if (!message || !['system', 'user', 'assistant', 'tool'].includes(message.role)) throw new TypeError(`Invalid prompt role: ${message?.role}`);
    return { ...message };
  };
  const result = [], depths = [];
  if (params.ordered_prompts) for (const prompt of params.ordered_prompts) result.push(...(typeof prompt === 'string' ? builtin(prompt) : [validate(prompt)]));
  else if (params.raw) {
    if (params.messages) result.push(...params.messages.map(validate));
    else for (const placeholder of PLACEHOLDER_ORDER) result.push(...builtin(placeholder));
  } else {
    for (const prompt of preset.prompts || []) if (prompt.enabled !== false) {
      const messages = aliases[prompt.id] ? builtin(aliases[prompt.id], prompt.role || 'system') : single(text(prompt.content), prompt.role || 'system');
      if (prompt.position?.type === 'in_chat') depths.push(...messages.map(message => ({ ...message, depth: prompt.position.depth ?? 0, order: prompt.position.order ?? 0 })));
      else result.push(...messages);
    }
    if (!preset.prompts?.length) result.push(...limited);
    result.push(...builtin('user_input'));
  }
  if (historyOptions.with_depth_entries !== false) depths.push(...selectedBooks.filter(entry => entry.worldbookPosition === 'at_depth'));
  depths.push(...injections.filter(entry => !(Object.hasOwn(historyOptions, 'author_note') && entry.traceSource?.startsWith('plugin:authors-note:'))), ...(params.injects || []));
  if (Object.hasOwn(historyOptions, 'author_note')) depths.push({ role: 'system', content: text(historyOptions.author_note), depth: 0, order: 0 });
  const slots = new Map();
  for (const entry of depths.filter(entry => entry.position !== 'none' && entry.content).sort((a, b) => (a.order || 0) - (b.order || 0))) {
    if (entry.depth !== undefined && (!Number.isInteger(entry.depth) || entry.depth < 0)) throw new TypeError('Injection depth must be a nonnegative integer');
    const cacheIndex = result.findIndex(message => message.role !== 'system');
    let index = entry.worldbookPosition === 'at_depth' && !entry.nativePlacement ? (cacheIndex < 0 ? result.length : cacheIndex)
      : entry.depth !== undefined ? Math.max(0, result.length - entry.depth)
      : ['afterHistory', 'afterToolContext'].includes(entry.anchor) ? result.length
        : ['beforeLatestUserInput', 'beforeToolContext'].includes(entry.anchor) ? result.findLastIndex(message => message.role === 'user') : 0;
    if (index < 0) index = result.length;
    if (!slots.has(index)) slots.set(index, []);
    slots.get(index).push(validate({ role: entry.role || 'system', content: entry.content }));
  }
  return Array.from({ length: result.length + 1 }, (_, index) => [...(slots.get(index) || []), ...(index < result.length ? [validate(result[index])] : [])]).flat();
}
