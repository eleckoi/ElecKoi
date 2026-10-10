import type { CompatibilityValue } from './types.js'

export type PresetObject = { [key: string]: CompatibilityValue }
export const PRESET_SYSTEMS = new Set(['main', 'nsfw', 'jailbreak', 'enhanceDefinitions'])
export const PRESET_PLACEHOLDERS = new Set(['worldInfoBefore', 'personaDescription', 'charDescription', 'charPersonality', 'scenario', 'worldInfoAfter', 'dialogueExamples', 'chatHistory'])
const KEYS: Record<string, string> = {
  max_context: 'openai_max_context', max_completion_tokens: 'openai_max_tokens', reply_count: 'n', should_stream: 'stream_openai',
  temperature: 'temperature', frequency_penalty: 'frequency_penalty', presence_penalty: 'presence_penalty',
  top_p: 'top_p', repetition_penalty: 'repetition_penalty', min_p: 'min_p', top_k: 'top_k', top_a: 'top_a', seed: 'seed',
  squash_system_messages: 'squash_system_messages', reasoning_effort: 'reasoning_effort', request_thoughts: 'show_thoughts',
  request_images: 'request_images', enable_function_calling: 'function_calling', enable_web_search: 'enable_web_search',
  allow_sending_videos: 'video_inlining', wrap_user_messages_in_quotes: 'wrap_in_quotes'
}
export function presetDefaults(): PresetObject {
  return { settings: { max_context: 2000000, max_completion_tokens: 300, reply_count: 1, should_stream: false,
    temperature: 1, frequency_penalty: 0, presence_penalty: 0, repetition_penalty: 1, top_p: 1,
    min_p: 0, top_k: 0, top_a: 0, seed: -1, squash_system_messages: false, reasoning_effort: 'auto',
    request_thoughts: false, request_images: false, enable_function_calling: false, enable_web_search: false,
    allow_sending_images: 'disabled', allow_sending_videos: false, character_name_prefix: 'none', wrap_user_messages_in_quotes: false },
    prompts: [...PRESET_PLACEHOLDERS].map(id => ({ id, name: id, enabled: true, role: 'system', position: { type: 'relative' } })),
    prompts_unused: [], extensions: {} }
}
export function presetObject(value: CompatibilityValue | undefined): PresetObject {
  if (value == null) return {}
  if (typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Expected preset object')
  return value
}
export function presetPrompts(value: PresetObject, key: string): PresetObject[] {
  const items = value[key] ?? []
  if (!Array.isArray(items)) throw new TypeError(`${key} must be an array`)
  return items.map(presetObject)
}
export function validatePreset(input: PresetObject): PresetObject {
  const defaults = presetDefaults()
  const result = { ...defaults, ...structuredClone(input), settings: { ...presetObject(defaults.settings), ...presetObject(input.settings) }, extensions: presetObject(input.extensions) }
  const ids = new Set<string>()
  for (const prompt of [...presetPrompts(result, 'prompts'), ...presetPrompts(result, 'prompts_unused')]) {
    if (typeof prompt.id !== 'string' || !prompt.id || ids.has(prompt.id)) throw new TypeError('Preset prompts need unique nonempty ids')
    ids.add(prompt.id)
    if (!['system', 'user', 'assistant'].includes(String(prompt.role))) throw new TypeError(`Invalid prompt role: ${prompt.role}`)
    if (typeof prompt.enabled !== 'boolean') throw new TypeError('Prompt enabled must be boolean')
    const position = presetObject(prompt.position)
    if (position.type === 'in_chat' && (!Number.isInteger(position.depth) || Number(position.depth) < 0 || !Number.isInteger(position.order))) throw new TypeError('In-chat prompts need a nonnegative depth and integer order')
  }
  return result
}

/** Port of the old Android lossless codec: typed edits only replace the corresponding raw fields. */
export function decodeTavernPreset(raw: PresetObject): PresetObject {
  if (raw.settings && typeof raw.settings === 'object' && !Array.isArray(raw.settings)) return validatePreset(raw)
  const settings = presetObject(presetDefaults().settings)
  for (const [key, fallback] of Object.entries(settings)) {
    let original = raw[KEYS[key]!]
    if (typeof original === 'string' && typeof fallback === 'boolean') {
      if (!['true', 'false'].includes(original)) throw new TypeError(`Preset setting ${key} is not boolean`)
      original = original === 'true'
    } else if (typeof original === 'string' && typeof fallback === 'number') {
      if (!original.trim() || !Number.isFinite(Number(original))) throw new TypeError(`Preset setting ${key} is not numeric`)
      original = Number(original)
    }
    settings[key] = original ?? fallback
  }
  settings.allow_sending_images = raw.image_inlining === true ? raw.inline_image_quality ?? 'auto' : 'disabled'
  settings.character_name_prefix = ({ 0: 'default', 1: 'completion', 2: 'content' } as Record<string, string>)[String(raw.names_behavior)] ?? 'none'
  const orders = presetPrompts(raw, 'prompt_order')
  const order = presetPrompts(orders.find(item => String(item.character_id) === '100001') ?? {}, 'order')
  const source = presetPrompts(raw, 'prompts')
  const convert = (prompt: PresetObject, enabled?: CompatibilityValue): PresetObject => {
    const id = String(prompt.identifier ?? '')
    return { id, name: prompt.name ?? id, role: prompt.role ?? 'system', enabled: enabled ?? prompt.enabled ?? true,
      content: prompt.content ?? '', extra: prompt.extra ?? {},
      ...(!PRESET_SYSTEMS.has(id) ? { position: prompt.injection_position === 1 && !['chatHistory', 'dialogueExamples'].includes(id)
        ? { type: 'in_chat', depth: prompt.injection_depth ?? 4, order: prompt.injection_order ?? 100 }
        : { type: 'relative' } } : {}) }
  }
  const usedIds = new Set(order.map(item => item.identifier))
  return validatePreset({ settings, prompts: order.map(item => {
    const prompt = source.find(candidate => candidate.identifier === item.identifier)
    if (!prompt) throw new Error(`Preset order references missing prompt: ${item.identifier}`)
    return convert(prompt, item.enabled)
  }), prompts_unused: source.filter(item => !usedIds.has(item.identifier)).map(item => convert(item)),
  extensions: raw.extensions ?? {}, eleckoi_raw_source: structuredClone(raw) })
}

export function encodeTavernPreset(value: PresetObject): PresetObject {
  const source = presetObject(value.eleckoi_raw_source), settings = presetObject(value.settings)
  const raw = structuredClone(source)
  for (const [key, item] of Object.entries(value)) if (!['settings', 'prompts', 'prompts_unused', 'extensions', 'eleckoi_raw_source'].includes(key)) raw[key] = item
  for (const [key, target] of Object.entries(KEYS)) if (settings[key] !== undefined) raw[target] = settings[key]!
  raw.image_inlining = settings.allow_sending_images !== 'disabled'
  raw.inline_image_quality = raw.image_inlining ? settings.allow_sending_images ?? 'auto' : 'auto'
  raw.names_behavior = ({ default: 0, completion: 1, content: 2 } as Record<string, number>)[String(settings.character_name_prefix)] ?? -1
  const oldPrompts = presetPrompts(source, 'prompts')
  raw.prompts = [...presetPrompts(value, 'prompts'), ...presetPrompts(value, 'prompts_unused')].map(prompt => {
    const original = oldPrompts.find(item => item.identifier === prompt.id) ?? {}, position = presetObject(prompt.position)
    return { ...original, identifier: prompt.id!, name: prompt.name!, role: prompt.role!, enabled: prompt.enabled!,
      content: prompt.content ?? original.content ?? '', system_prompt: original.system_prompt ?? (PRESET_SYSTEMS.has(String(prompt.id)) || PRESET_PLACEHOLDERS.has(String(prompt.id))),
      marker: original.marker ?? PRESET_PLACEHOLDERS.has(String(prompt.id)),
      ...(prompt.position === undefined ? {} : { injection_position: position.type === 'in_chat' ? 1 : 0,
        injection_depth: position.depth ?? 4, injection_order: position.order ?? 100 }), ...(prompt.extra === undefined ? {} : { extra: prompt.extra }) }
  })
  const orders = presetPrompts(source, 'prompt_order'), previous = orders.find(item => String(item.character_id) === '100001') ?? {}
  const items = presetPrompts(previous, 'order')
  raw.prompt_order = [...orders.filter(item => String(item.character_id) !== '100001'), { ...previous, character_id: 100001,
    order: presetPrompts(value, 'prompts').map(prompt => ({ ...items.find(item => item.identifier === prompt.id), identifier: prompt.id!, enabled: prompt.enabled! })) }]
  raw.extensions = value.extensions ?? {}
  return raw
}

/** Merge real native changes into a mutable draft without discarding unrelated edits. */
export function rebasePresetDraft(draft: PresetObject, before: PresetObject, after: PresetObject): PresetObject {
  const all = (value: PresetObject) => [...presetPrompts(value, 'prompts'), ...presetPrompts(value, 'prompts_unused')]
  const old = new Map(all(before).map(item => [item.id, item])), next = new Map(all(after).map(item => [item.id, item]))
  const oldActive = presetPrompts(before, 'prompts').map(item => item.id), newActive = presetPrompts(after, 'prompts').map(item => item.id)
  const active: PresetObject[] = [], unused: PresetObject[] = [], seen = new Set<CompatibilityValue>()
  for (const key of ['prompts', 'prompts_unused']) for (const prompt of presetPrompts(draft, key)) {
    const previous = old.get(prompt.id), updated = next.get(prompt.id)
    if (previous && !updated) continue
    const merged = previous && updated ? changedFields(prompt, previous, updated) : prompt
    seen.add(prompt.id!)
    const moved = previous && updated && oldActive.includes(prompt.id) !== newActive.includes(prompt.id)
    ;((moved ? newActive.includes(prompt.id) : key === 'prompts') ? active : unused).push(merged)
  }
  for (const [id, item] of next) if (!old.has(id) && !seen.has(id!)) (newActive.includes(id) ? active : unused).push(item)
  if (JSON.stringify(oldActive) !== JSON.stringify(newActive)) {
    const ordered = active.filter(item => newActive.includes(item.id)).sort((a, b) => newActive.indexOf(a.id) - newActive.indexOf(b.id))
    let index = 0
    for (let slot = 0; slot < active.length; slot++) if (newActive.includes(active[slot]!.id)) active[slot] = ordered[index++]!
  }
  return { ...draft, prompts: active, prompts_unused: unused, extensions: changedFields(presetObject(draft.extensions), presetObject(before.extensions), presetObject(after.extensions)) }
}
function changedFields(current: PresetObject, before: PresetObject, after: PresetObject): PresetObject {
  const result = structuredClone(current)
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (JSON.stringify(before[key]) === JSON.stringify(after[key])) continue
    if (after[key] === undefined) delete result[key]
    else if ([after[key], before[key], current[key]].every(item => item && typeof item === 'object' && !Array.isArray(item))) result[key] = changedFields(presetObject(current[key]), presetObject(before[key]), presetObject(after[key]))
    else result[key] = structuredClone(after[key]!)
  }
  return result
}
