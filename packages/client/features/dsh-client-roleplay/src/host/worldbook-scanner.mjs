import { createHash } from 'node:crypto'

const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {}
const integer = (value, fallback = 0) => Number.isFinite(Number(value)) ? Math.max(0, Math.trunc(Number(value))) : fallback
const inherit = (value, fallback) => value == null || value === 'same_as_global' ? fallback : value
const anchors = {
  before_character_definition: 'beforeCharacterDefinition', after_character_definition: 'afterCharacterDefinition',
  before_example_messages: 'beforeExamples', after_example_messages: 'afterExamples',
  before_examples: 'beforeExamples', after_examples: 'afterExamples',
  before_history: 'beforeHistory', after_history: 'afterHistory',
  before_latest_user_input: 'beforeLatestUserInput', after_latest_user_input: 'afterLatestUserInput',
  before_base_instructions: 'beforeBaseInstructions', top_of_an: 'beforeHistory', bottom_of_an: 'beforeHistory'
}

/** Public worldbook data is evaluated against the native library, never a second body store. */
export function isManagedWorldbookEntry(entry) {
  const value = object(entry.sillyTavern)
  return entry.kind === 'normal' && !value.presetPrompt && (
    value.strategy || value.recursion || value.effect || value.uid != null || value.probability != null
    || value.key || value.constant != null || value.position && typeof value.position === 'object')
}

export function worldbookRandom(seed) {
  let index = 0
  return () => createHash('sha256').update(`${seed}:${index++}`).digest().readUInt32BE(0) / 0x100000000
}

/** Group native vector entries by the same scan sources used by keyword evaluation. */
export function worldbookVectorInputs(context, { history = [], scanText = [], settings = {} } = {}) {
  const groups = new Map()
  for (const entry of (context?.settingLibrary?.entries ?? []).filter(isManagedWorldbookEntry)
    .filter(entry => entry.enabled && String(entry.content ?? '').trim() && entry.dynamicMode !== 'ejs_reference')
    .map(entry => normalize(entry, settings)).filter(entry => entry.type === 'vectorized')) {
    const query = entryScanText(context, entry, history, scanText).trim()
    const group = groups.get(query) ?? { entries: [], query }
    group.entries.push({ id: entry.id, content: entry.content })
    groups.set(query, group)
  }
  return [...groups.values()]
}

/** Pure evaluation and the async native preparation drive the same scan state machine. */
export function evaluateWorldbook(context, options = {}) {
  const machine = worldbookScan(context, options)
  let step = machine.next()
  while (!step.done) {
    const value = step.value.kind === 'tokens' ? options.tokenCount(step.value.content) : undefined
    if (value && typeof value.then === 'function') throw new TypeError('异步 tokenizer 需要使用 evaluateWorldbookWithEvents。')
    step = machine.next(value)
  }
  return step.value
}

/** Listeners participate in the actual scan; the result is frozen by native turn preparation. */
export async function evaluateWorldbookWithEvents(context, options = {}) {
  const machine = worldbookScan(context, options)
  let step = machine.next()
  while (!step.done) {
    options.signal?.throwIfAborted()
    const stage = step.value
    const accepted = stage.kind === 'tokens' ? await options.tokenCount(stage.content)
      : stage.kind === 'vectors' ? await options.resolveVectors?.(stage.entries)
      : await options.onEvent?.(stage.name, stage.payload, stage.key)
    options.signal?.throwIfAborted()
    step = machine.next(accepted)
  }
  return step.value
}

const entryKey = entry => `${entry.world}.${entry.uid}`
const runtimeId = entry => entry.eleckoiRuntimeId ?? entry.id ?? `plugin-world:${encodeURIComponent(entry.world ?? '')}:${entry.uid}`
const positionNames = { 0: 'before_character_definition', 1: 'after_character_definition', 2: 'top_of_an',
  3: 'bottom_of_an', 4: 'at_depth', 5: 'before_example_messages', 6: 'after_example_messages', 7: 'outlet' }

function scanEntryView(entry) {
  const raw = object(entry.raw ?? entry.sillyTavern)
  const { raw: _raw, sillyTavern: _sillyTavern, ...native } = entry
  return { ...native, ...raw, id: entry.id, eleckoiRuntimeId: entry.id,
    world: entry.world ?? raw.world ?? '', uid: raw.uid ?? entry.uid ?? entry.id,
    content: entry.content, enabled: entry.enabled, disable: !entry.enabled,
    key: raw.strategy?.keys ?? raw.key ?? entry.keywords ?? [],
    keysecondary: raw.strategy?.keys_secondary?.keys ?? raw.keysecondary ?? entry.conditionKeywords ?? [],
    strategy: raw.strategy, position: raw.position ?? entry.position,
    effect: raw.effect, recursion: raw.recursion }
}

/** Changes are request-local native entry projections, never a second persistent worldbook. */
function scanEntryFromView(value) {
  const previous = object(value.sillyTavern), strategy = object(value.strategy ?? previous.strategy)
  const secondary = object(strategy.keys_secondary), position = typeof value.position === 'number'
    ? { ...object(previous.position), type: positionNames[value.position], role: ({ 0: 'system', 1: 'user', 2: 'assistant' })[value.role] ?? 'system',
      depth: value.depth ?? 0, order: value.order ?? 100 } : typeof value.position === 'string'
      ? Object.keys(object(previous.position)).length ? object(previous.position) : { type: value.position } : object(value.position ?? previous.position)
  const recursion = object(value.recursion ?? previous.recursion), effect = object(value.effect ?? previous.effect)
  const { raw: _raw, sillyTavern: _sillyTavern, ...fields } = value
  const raw = { ...previous, ...fields, uid: value.uid,
    strategy: { ...strategy, type: value.constant === true ? 'constant' : value.vectorized === true ? 'vectorized'
      : value.constant === false && strategy.type === 'constant' || value.vectorized === false && strategy.type === 'vectorized' ? 'selective'
      : strategy.type ?? 'selective',
      keys: value.key ?? strategy.keys ?? value.keywords ?? [],
      keys_secondary: { ...secondary, keys: value.keysecondary ?? secondary.keys ?? value.conditionKeywords ?? [],
        logic: ({ 0: 'and_any', 1: 'not_all', 2: 'not_any', 3: 'and_all' })[value.selectiveLogic] ?? secondary.logic ?? 'and_any' },
      scan_depth: value.scanDepth ?? strategy.scan_depth }, position,
    recursion: { ...recursion, prevent_incoming: value.excludeRecursion ?? recursion.prevent_incoming,
      prevent_outgoing: value.preventRecursion ?? recursion.prevent_outgoing,
      delay_until: value.delayUntilRecursion ?? recursion.delay_until },
    effect: { ...effect, sticky: value.sticky ?? effect.sticky, cooldown: value.cooldown ?? effect.cooldown, delay: value.delay ?? effect.delay },
    case_sensitive: value.caseSensitive ?? value.case_sensitive,
    match_whole_words: value.matchWholeWords ?? value.match_whole_words,
    use_group_scoring: value.useGroupScoring ?? value.use_group_scoring,
    group_prioritized: value.groupOverride ?? value.group_prioritized,
    group_weight: value.groupWeight ?? value.group_weight,
    use_probability: value.useProbability ?? value.use_probability }
  return { ...value, id: runtimeId(value), world: value.world, kind: 'normal',
    title: value.comment ?? value.name ?? value.title ?? '', content: String(value.content ?? ''),
    enabled: value.disable === undefined ? value.enabled !== false : value.disable !== true,
    sillyTavern: raw, triggerMode: raw.strategy.type === 'constant' ? 'always' : null }
}

function* worldbookScan(context, { history = [], turn = history.length, state = {}, settings = {},
  scanText = [], random = Math.random, tokenCount, vectorMatches, eventSources, preview = false } = {}) {
  const library = context?.settingLibrary ?? {}
  const originalManaged = (library.entries ?? []).filter(isManagedWorldbookEntry)
  const sourceGroups = eventSources ?? { globalLore: [], characterLore: originalManaged.map((entry, index) => ({ ...entry,
    eleckoiRuntimeId: entry.id, world: library.name ?? '', uid: entry.sillyTavern?.uid ?? index })), chatLore: [], personaLore: [] }
  const originalIds = new Set(originalManaged.map(entry => entry.id))
  const sources = Object.fromEntries(['globalLore', 'characterLore', 'chatLore', 'personaLore']
    .map(scope => [scope, (sourceGroups[scope] ?? []).filter(entry => originalIds.has(runtimeId(entry)))]))
  const loaded = yield { name: 'worldinfo_entries_loaded', key: 'entries', payload: sources }
  const acceptedSources = loaded ?? sources
  const external = new Map((acceptedSources.forcedActivations ?? []).map(value => [entryKey(value), value]))
  const managed = [...new Map(['globalLore', 'characterLore', 'chatLore', 'personaLore']
    .flatMap(scope => acceptedSources[scope] ?? []).map(value => {
      const entry = loaded ? scanEntryFromView(value) : value, override = external.get(entryKey(value))
      // External versions replace this request's public fields while retaining the real native entry identity.
      const accepted = override ? scanEntryFromView({ ...scanEntryView(entry), ...override,
        id: entry.id, eleckoiRuntimeId: entry.id, world: value.world, uid: value.uid }) : entry
      return [runtimeId(accepted), accepted]
    })).values()]
  const managedIds = new Set([...originalManaged, ...managed].map(entry => entry.id))
  const forced = new Set(external.keys())
  const vectors = yield { kind: 'vectors', entries: managed }
  if (vectors !== undefined) vectorMatches = vectors
  const diagnostics = [], timers = structuredClone(object(state.entries))
  let candidates = managed.filter(entry => entry.enabled && String(entry.content ?? '').trim()
    && entry.dynamicMode !== 'ejs_reference').map(entry => normalize(entry, settings))
  const active = new Map(), rejected = new Set(), probability = new Map()
  let tokenBudget = budgetOf(settings), tokens = 0, budgetOverflowed = false
  if (candidates.length && Number.isFinite(tokenBudget) && !tokenCount) throw new Error('世界书预算需要实际 tokenizer 计数服务。')
  const count = function* (content) {
    // Unbounded scans need no vocabulary load or remote token request.
    if (!Number.isFinite(tokenBudget)) return 0
    if (!tokenCount) throw new Error('世界书预算需要实际 tokenizer 计数服务。')
    const value = yield { kind: 'tokens', content }
    if (!Number.isSafeInteger(value) || value < 0) throw new TypeError('Tokenizer 必须返回非负整数 token 数量。')
    return value
  }
  const recount = function* (entries) {
    let total = 0
    for (const entry of entries) if (!entry.ignoreBudget) total += yield* count(entry.content)
    return total
  }
  const score = (entry, text) => entry.keys.filter(key => contains(text, key, entry)).length
  const canActivate = (entry, wave) => {
    const timer = object(timers[entry.id])
    if (forced.has(entryKey(scanEntryView(entry)))) return true
    if (timer.delayUntilTurn > turn || turn < entry.delay) return false
    if (timer.stickyUntil > turn) return true
    if (timer.cooldownUntil > turn) return false
    if (wave < entry.delayUntil || wave > 0 && entry.preventIncoming) return false
    if (!probability.has(entry.id)) probability.set(entry.id, entry.probability >= 100 || random() * 100 < entry.probability)
    if (!probability.get(entry.id)) { rejected.add(entry.id); diagnostics.push({ id: entry.id, reason: 'probability' }); return false }
    return true
  }
  const matches = (entry, text) => {
    if (forced.has(entryKey(scanEntryView(entry))) || entry.type === 'constant' || object(timers[entry.id]).stickyUntil > turn) return true
    if (entry.type === 'vectorized') {
      if (!vectorMatches) throw new Error(`设定「${entry.title}」启用了向量触发，但没有配置向量检索服务。`)
      return vectorMatches instanceof Set ? vectorMatches.has(entry.id) : Boolean(vectorMatches[entry.id])
    }
    if (!entry.keys.some(key => contains(text, key, entry))) return false
    if (!entry.secondary.length) return true
    const found = entry.secondary.map(key => contains(text, key, entry))
    return entry.logic === 'and_all' ? found.every(Boolean) : entry.logic === 'not_any' ? !found.some(Boolean)
      : entry.logic === 'not_all' ? !found.every(Boolean) : found.some(Boolean)
  }
  const choose = eligible => {
    const chosen = [], groups = new Map()
    for (const item of eligible) {
      if (!item.entry.group.length) chosen.push(item)
      else for (const name of item.entry.group) { const group = groups.get(name) ?? []; group.push(item); groups.set(name, group) }
    }
    for (const [name, group] of groups) {
      if ([...active.values()].some(entry => entry.group.includes(name))) continue
      const overrides = group.filter(item => item.entry.groupPrioritized)
      let pool = overrides.length ? overrides.sort(compare).slice(0, 1) : group
      if (!overrides.length && pool.some(item => item.entry.groupScoring)) {
        const best = Math.max(...pool.map(item => item.score)); pool = pool.filter(item => item.score === best)
      }
      const total = pool.reduce((sum, item) => sum + item.entry.groupWeight, 0)
      if (total <= 0) continue
      let draw = random() * total, selected = pool.at(-1)
      for (const item of pool) { draw -= item.entry.groupWeight; if (draw < 0) { selected = item; break } }
      if (selected && !chosen.some(item => item.entry.id === selected.entry.id)) chosen.push(selected)
    }
    return chosen.sort(compare)
  }
  const add = function* (eligible) {
    const added = []
    for (const { entry } of choose(eligible)) {
      if (entry.group.some(name => [...active.values()].some(item => item.group.includes(name)))) continue
      const cost = entry.ignoreBudget ? 0 : yield* count(entry.content)
      if (!entry.ignoreBudget && tokens + cost > tokenBudget) {
        budgetOverflowed = true; diagnostics.push({ id: entry.id, reason: 'budget', tokens: cost }); continue
      }
      active.set(entry.id, entry); added.push(entry)
      if (!entry.ignoreBudget) tokens += cost
    }
    return added
  }
  const scan = (wave, recursiveText = '') => candidates.filter(entry => !active.has(entry.id) && !rejected.has(entry.id))
    .flatMap(entry => {
      const text = `${entryScanText(context, entry, history, scanText)}\n${recursiveText}`
      return matches(entry, text) && canActivate(entry, wave) ? [{ entry, score: score(entry, text) }] : []
    })
  const recursive = settings.recursive !== false && settings.recursive_scan !== false
  const maxRecursion = integer(settings.max_recursion_steps ?? settings.maxRecursionSteps)
    || candidates.length + Math.max(0, ...candidates.map(entry => entry.delayUntil))
  const minActivations = integer(settings.min_activations ?? settings.minActivations)
  const maxDepth = integer(settings.min_activations_depth_max ?? settings.minActivationsDepthMax, history.length)
  let current = 1, wave = 0, loopCount = 0, depth = integer(settings.scan_depth ?? settings.scanDepth, 2)
  let activatedText = '', recursionLevel = 0
  while (current !== 0) {
    loopCount++
    if (current === 2) wave++
    if (current === 3) { depth++; for (const entry of candidates) entry.scanDepth = Math.max(entry.scanDepth, depth) }
    const eligible = scan(current === 3 ? 0 : Math.max(wave, recursionLevel), current === 2 ? activatedText : '')
    const added = yield* add(eligible)
    let next = current !== 3 && recursive && wave < maxRecursion && (added.some(entry => !entry.preventOutgoing)
      || [...active.values()].some(entry => !entry.preventOutgoing) && candidates.some(entry => !active.has(entry.id) && entry.delayUntil > wave)) ? 2
      : active.size < minActivations && depth < maxDepth ? 3 : 0
    activatedText = [...active.values()].filter(entry => !entry.preventOutgoing).map(entry => entry.content).join('\n')
    const payload = { state: { current, next, loopCount }, new: { all: eligible.map(item => scanEntryView(item.entry)), successful: added.map(scanEntryView) },
      activated: { entries: [...active.values()].map(entry => [entryKey(scanEntryView(entry)), scanEntryView(entry)]), text: activatedText },
      sortedEntries: candidates.map(scanEntryView), recursionDelay: {
        availableLevels: [...new Set(candidates.map(entry => entry.delayUntil).filter(level => level > Math.max(wave, recursionLevel)))].sort((a, b) => a - b),
        currentLevel: Math.max(wave, recursionLevel) }, budget: { current: Number.isFinite(tokenBudget) ? tokenBudget : null, overflowed: budgetOverflowed },
      timedEffects: { turn, entries: structuredClone(timers), preview } }
    const accepted = yield { name: 'worldinfo_scan_done', key: `scan:${loopCount}`, payload }
    if (accepted) {
      candidates = accepted.sortedEntries.map(value => normalize(scanEntryFromView(value), settings))
      active.clear()
      for (const [, value] of accepted.activated.entries) {
        const entry = normalize(scanEntryFromView(value), settings); active.set(entry.id, entry); managedIds.add(entry.id)
      }
      for (const entry of candidates) managedIds.add(entry.id)
      activatedText = String(accepted.activated.text ?? '')
      next = Number(accepted.state.next)
      if (![0, 1, 2, 3].includes(next)) throw new RangeError('世界书监听器返回了无效的后续扫描状态。')
      tokenBudget = accepted.budget.current === null ? Infinity : Number(accepted.budget.current)
      budgetOverflowed = accepted.budget.overflowed === true
      recursionLevel = Number(accepted.recursionDelay.currentLevel)
      for (const id of Object.keys(timers)) delete timers[id]
      Object.assign(timers, accepted.timedEffects.entries)
      tokens = yield* recount(active.values())
    }
    current = next
  }
  let ordered = [...active.values()].sort((a, b) => b.order - a.order || a.id.localeCompare(b.id))
  if (!preview && ordered.length) {
    const activated = yield { name: 'world_info_activated', key: 'activated', payload: ordered.map(scanEntryView) }
    if (activated) ordered = activated.map(value => normalize(scanEntryFromView(value), settings))
  }
  tokens = yield* recount(ordered)
  for (const entry of ordered) managedIds.add(entry.id)
  const nextEntries = Object.fromEntries(Object.entries(timers).filter(([id, value]) => managedIds.has(id)
    && Math.max(object(value).stickyUntil ?? 0, object(value).cooldownUntil ?? 0, object(value).delayUntilTurn ?? 0) > turn))
  for (const entry of ordered) {
    const previous = object(timers[entry.id])
    if (previous.stickyUntil > turn) { nextEntries[entry.id] = previous; continue }
    if (entry.sticky || entry.cooldown) nextEntries[entry.id] = { ...previous, activatedAt: turn,
      stickyUntil: turn + entry.sticky, cooldownUntil: turn + entry.sticky + entry.cooldown }
  }
  const fragments = ordered.map(fragment), note = context?.authorNote
  const outlets = Object.create(null)
  for (const item of fragments) {
    if (item.worldbookPosition !== 'outlet') continue
    const name = String(item.outlet ?? '').trim()
    if (name) (outlets[name] ??= []).push(item.content)
  }
  const frequency = note?.frequency === undefined ? 1 : integer(note.frequency)
  const noteEnabled = frequency > 0 && history.filter(message => message.role === 'user').length % frequency === 0
  const noteEntries = fragments.filter(item => ['top_of_an', 'bottom_of_an'].includes(item.worldbookPosition))
  const authorNote = note || noteEntries.length ? { content: noteEnabled ? note?.content ?? '' : '',
    role: note?.role ?? 'system', depth: integer(note?.depth), order: Number(note?.order ?? 0), position: note?.position ?? 'at_depth' } : undefined
  return { activatedEntries: ordered.map(scanEntryView), round: { version: 1, fragments, examples: [], outlets, ...(authorNote ? { authorNote } : {}),
    managedEntryIds: [...managedIds], activatedEntryIds: ordered.map(entry => entry.id), diagnostics, tokens,
    tokenizer: tokenCount?.name || null }, nextState: { version: 1, entries: nextEntries } }
}

function normalize(entry, settings) {
  const raw = object(entry.sillyTavern), strategy = object(raw.strategy), secondary = object(strategy.keys_secondary)
  const recursion = object(raw.recursion), effect = object(raw.effect)
  const position = object(raw.position), type = strategy.type ?? (raw.constant ? 'constant' : 'selective')
  return { ...entry, raw, content: String(entry.content), type,
    keys: strategy.keys ?? raw.keys ?? raw.key ?? entry.keywords ?? [],
    secondary: secondary.keys ?? raw.filters ?? raw.keysecondary ?? entry.conditionKeywords ?? [],
    logic: secondary.logic ?? raw.logic ?? ({ all: 'and_all', not_any: 'not_any', not_all: 'not_all' })[entry.keywordCondition] ?? 'and_any',
    scanDepth: Math.max(1, integer(inherit(strategy.scan_depth ?? raw.scan_depth, settings.scan_depth ?? settings.scanDepth ?? entry.keywordScanDepth), 2)),
    caseSensitive: Boolean(inherit(raw.case_sensitive, settings.case_sensitive ?? entry.keywordIgnoreCase === false)),
    wholeWord: Boolean(inherit(raw.match_whole_words, settings.match_whole_words ?? entry.keywordWholeWord)),
    probability: raw.useProbability === false || raw.use_probability === false ? 100 : Number(raw.probability ?? 100),
    preventIncoming: Boolean(recursion.prevent_incoming ?? raw.exclude_recursion ?? raw.excludeRecursion),
    preventOutgoing: Boolean(recursion.prevent_outgoing ?? raw.prevent_recursion ?? raw.preventRecursion),
    delayUntil: integer(recursion.delay_until ?? raw.delay_until_recursion ?? raw.delayUntilRecursion),
    sticky: integer(effect.sticky ?? raw.sticky), cooldown: integer(effect.cooldown ?? raw.cooldown), delay: integer(effect.delay ?? raw.delay),
    group: String(raw.group ?? '').split(',').map(value => value.trim()).filter(Boolean),
    groupWeight: Math.max(0, Number(raw.group_weight ?? raw.groupWeight ?? 100)),
    groupPrioritized: Boolean(raw.group_prioritized ?? raw.group_override ?? raw.groupOverride),
    groupScoring: Boolean(inherit(raw.use_group_scoring ?? raw.useGroupScoring, settings.use_group_scoring ?? settings.useGroupScoring)),
    ignoreBudget: Boolean(raw.ignore_budget ?? raw.ignoreBudget),
    order: Number(position.order ?? raw.order ?? entry.order ?? 100) }
}
function compare(a, b) { return b.entry.order - a.entry.order || a.entry.id.localeCompare(b.entry.id) }
function fragment(entry) {
  const position = object(entry.raw.position)
  const numeric = { 0: 'before_character_definition', 1: 'after_character_definition', 2: 'top_of_an', 3: 'bottom_of_an', 4: 'at_depth', 5: 'before_example_messages', 6: 'after_example_messages', 7: 'outlet' }
  const type = position.type ?? (typeof entry.raw.position === 'number' ? numeric[entry.raw.position] : typeof entry.raw.position === 'string' ? entry.raw.position : null)
  const depthRole = /^at_depth_as_(system|user|assistant)$/.exec(type ?? '')
  const native = ['instructions', 'insert_point_1', 'insert_point_2', 'insert_point_3', 'insert_point_4', 'insert_point_5'].includes(type)
  const roleValue = position.role ?? entry.raw.role ?? entry.insertRole ?? 'system'
  const role = depthRole?.[1] ?? ({ 0: 'system', 1: 'user', 2: 'assistant' })[roleValue] ?? roleValue
  if (!['system', 'user', 'assistant'].includes(role)) throw new Error(`设定「${entry.title}」的插入角色无效：${role}`)
  const atDepth = type === 'at_depth' || depthRole
  return { id: entry.id, sourceEntryId: entry.id, title: entry.title, content: entry.content, role,
    anchor: atDepth ? 'chatDepth' : anchors[type] ?? 'beforeCharacterDefinition',
    worldbookPosition: atDepth ? 'at_depth' : type ?? 'before_character_definition',
    depth: integer(position.depth ?? entry.raw.depth), order: entry.order,
    ...(native ? { nativePlacement: { position: type, promptPositionId: entry.promptPositionId } } : {}),
    ...(type === 'outlet' ? { outlet: String(entry.raw.outlet_name ?? entry.raw.outletName ?? '') } : {}) }
}
function budgetOf(settings) {
  const fixed = Number(settings.budget_cap ?? settings.budgetCap ?? settings.token_budget)
  const percent = Number(settings.budget_percent ?? settings.budgetPercent ?? settings.budget)
  const context = Number(settings.max_context ?? settings.context_size)
  const proportion = percent > 0 && context > 0 ? Math.floor(context * percent / 100) : Infinity
  return fixed > 0 ? Math.min(fixed, proportion) : proportion
}
function contentText(value) {
  return typeof value === 'string' ? value : Array.isArray(value) ? value.filter(block => block.type === 'text').map(block => block.text ?? '').join('\n') : ''
}
function contains(text, key, entry) {
  const wire = key && typeof key === 'object' ? key.__eleckoiKeywordRegex : null
  if (wire) return new RegExp(wire.source, wire.flags).test(text)
  if (key instanceof RegExp) { key.lastIndex = 0; return key.test(text) }
  const value = String(key ?? '').trim()
  if (!value) return false
  const literal = /^\/(.*)\/([dgimsuvy]*)$/s.exec(value)
  if (literal || entry.keywordUseRegex) {
    try { return new RegExp(literal ? literal[1] : value, literal ? literal[2] : entry.caseSensitive ? '' : 'i').test(text) }
    catch (cause) { throw new Error(`设定「${entry.title}」的关键词正则无效：${value}`, { cause }) }
  }
  const haystack = entry.caseSensitive ? text : text.toLocaleLowerCase(), needle = entry.caseSensitive ? value : value.toLocaleLowerCase()
  if (!entry.wholeWord || /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(needle)) return haystack.includes(needle)
  return new RegExp(`(?<![\\p{L}\\p{N}_])${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}_])`, 'u').test(haystack)
}

function entryScanText(context, entry, history, scanText) {
  const sources = history.filter(message => ['user', 'assistant'].includes(message.role))
    .slice(-entry.scanDepth).map(message => contentText(message.content))
  if (entry.raw.scan_persona_description || entry.raw.matchPersonaDescription) sources.push(String(context.personaDescription ?? ''))
  if (entry.raw.scan_character_description || entry.raw.matchCharacterDescription) sources.push(String(context.characterDescription ?? ''))
  if (entry.raw.scan_character_personality || entry.raw.matchCharacterPersonality) sources.push(String(context.characterPersonality ?? ''))
  if (entry.raw.scan_character_depth_prompt || entry.raw.matchCharacterDepthPrompt) sources.push(String(context.characterDepthPrompt ?? ''))
  if (entry.raw.scan_scenario || entry.raw.matchScenario) sources.push(String(context.scenario ?? ''))
  if (entry.raw.scan_creator_notes || entry.raw.matchCreatorNotes) sources.push(String(context.creatorNotes ?? ''))
  return [...sources, ...scanText].join('\n')
}
