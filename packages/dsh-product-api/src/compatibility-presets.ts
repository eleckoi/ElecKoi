import type { AgentPreset, SettingLibraryEntry } from './types.js'
import { decodeCompatibilityRegexRules, mergeCompatibilityRegexRules } from './compatibility-regex.js'
import type { CompatibilityCommand, CompatibilityChange, CompatibilityValue, ElecKoiProductDataStore } from './types.js'
import { decodeTavernPreset, encodeTavernPreset, PRESET_PLACEHOLDERS, presetDefaults, presetObject, presetPrompts,
  rebasePresetDraft, validatePreset, type PresetObject } from './compatibility-preset-codec.js'

export const PRESET_COMPATIBILITY_METHODS = ['presets.list', 'presets.get', 'presets.select', 'presets.update',
  'tavernPresets.list', 'tavernPresets.state', 'tavernPresets.load', 'tavernPresets.put', 'tavernPresets.delete',
  'tavernPresets.rename', 'tavernPresets.import', 'tavernPresets.export'] as const
const json = (value: unknown): CompatibilityValue => JSON.parse(JSON.stringify(value)) as CompatibilityValue
const linkedId = (prompt: PresetObject): string => String(presetObject(prompt.extra).eleckoi_entry_id ?? '')
export const usesNativePresetPlacement = (prompt: PresetObject): boolean => presetObject(prompt.extra).eleckoi_native_semantics === true
function nativeEntry(base: AgentPreset, prompt: PresetObject, index: number): SettingLibraryEntry | undefined {
  return base.entries.find(entry => entry.kind === 'normal' && (entry.id === (linkedId(prompt) || prompt.id) || entry.id === `compat:${prompt.id}:${index}`))
}
function projectEntry(entry: SettingLibraryEntry, previous: PresetObject = {}, unused = false): PresetObject {
  const extra = presetObject(previous.extra)
  const moved = extra.eleckoi_position !== undefined && extra.eleckoi_position !== (entry.position ?? '')
  return { ...previous, id: previous.id ?? entry.id, name: entry.title, content: entry.content, role: entry.insertRole,
    enabled: unused && (extra.eleckoi_enabled === undefined || extra.eleckoi_enabled === entry.enabled) ? previous.enabled ?? entry.enabled : entry.enabled,
    position: moved ? { type: 'relative' } : previous.position ?? { type: 'relative' },
    extra: { ...extra, ...(Object.keys(previous).length ? {} : { eleckoi_native_semantics: true }),
      eleckoi_entry_id: entry.id, eleckoi_position: entry.position ?? '', eleckoi_group: entry.groupId, eleckoi_order: entry.order,
      eleckoi_prompt_position_id: entry.promptPositionId, eleckoi_enabled: entry.enabled } }
}
export function nativePresetDocument(base: AgentPreset): PresetObject {
  return { ...presetDefaults(), eleckoi_native_projection: true,
    prompts: base.entries.filter(entry => entry.kind === 'normal').sort((a, b) => a.order - b.order).map(entry => projectEntry(entry)),
    extensions: { regex_scripts: mergeCompatibilityRegexRules(base.regexRules, undefined) } }
}
export function refreshPresetDocument(previous: PresetObject, base: AgentPreset): PresetObject {
  const active: PresetObject[] = [], unused: PresetObject[] = [], referenced = new Set<string>()
  const oldActive = presetPrompts(previous, 'prompts'), oldUnused = presetPrompts(previous, 'prompts_unused')
  let reordered = false
  for (const [index, prompt] of [...oldActive, ...oldUnused].entries()) {
    const entry = nativeEntry(base, prompt, index)
    if (!entry && linkedId(prompt)) continue
    if (entry) {
      referenced.add(entry.id)
      const order = presetObject(prompt.extra).eleckoi_order
      if (order !== undefined && order !== entry.order) reordered = true
    }
    const next = entry ? projectEntry(entry, prompt, index >= oldActive.length) : prompt
    ;(index >= oldActive.length && entry?.enabled !== true ? unused : active).push(next)
  }
  for (const entry of base.entries.filter(item => item.kind === 'normal' && !referenced.has(item.id)).sort((a, b) => a.order - b.order)) active.push(projectEntry(entry))
  if (reordered) {
    const ordered = active.filter(item => linkedId(item)).sort((a, b) => Number(presetObject(a.extra).eleckoi_order) - Number(presetObject(b.extra).eleckoi_order))
    let index = 0
    for (let slot = 0; slot < active.length; slot++) if (linkedId(active[slot]!)) active[slot] = ordered[index++]!
  }
  return { ...previous, prompts: active, prompts_unused: unused, extensions: { ...presetObject(previous.extensions),
    regex_scripts: mergeCompatibilityRegexRules(base.regexRules, presetObject(previous.extensions).regex_scripts) } }
}

export function projectTavernPreset(base: AgentPreset, value: PresetObject): AgentPreset {
  const active = presetPrompts(value, 'prompts'), prompts = [...active, ...presetPrompts(value, 'prompts_unused')]
  const positions = structuredClone(base.promptPositions), now = new Date().toISOString()
  const nativeIds = prompts.filter(usesNativePresetPlacement).map((prompt, index) => nativeEntry(base, prompt, index)?.id).filter(Boolean)
  const nativeReordered = JSON.stringify(nativeIds) !== JSON.stringify(base.entries.filter(item => nativeIds.includes(item.id)).sort((a, b) => a.order - b.order).map(item => item.id))
  const entries = prompts.flatMap((prompt, index): SettingLibraryEntry[] => {
    if (PRESET_PLACEHOLDERS.has(String(prompt.id))) return []
    const previous = nativeEntry(base, prompt, index)
    const beforeHistory = !prompts.slice(0, index).some(item => item.id === 'chatHistory')
    const position = previous?.position ?? (prompt.id === 'main' ? 'instructions' : beforeHistory ? 'insert_point_2' : 'insert_point_5')
    let promptPositionId = previous?.promptPositionId ?? ''
    if ((!previous || previous.triggerMode === 'always') && position !== 'instructions' && !positions.some(item => item.id === promptPositionId)) {
      promptPositionId = `compat:${base.id}:placement:${position}`
      if (!positions.some(item => item.id === promptPositionId)) positions.push({ id: promptPositionId, name: position,
        anchor: position, side: 'before_setting_position', order: positions.length + 1, createdAt: now, updatedAt: now })
    }
    return [{ ...previous, id: previous?.id ?? `compat:${prompt.id}:${index}`, title: String(prompt.name ?? prompt.id),
      iconId: previous?.iconId ?? '', kind: 'normal', groupId: previous?.groupId ?? '', content: String(prompt.content ?? ''),
      openingMessages: previous?.openingMessages ?? [], defaultOpeningMessageId: previous?.defaultOpeningMessageId ?? '',
      agentSelectionHint: previous?.agentSelectionHint ?? '', agentReadStrategy: previous?.agentReadStrategy ?? 'normal',
      dynamicMode: previous?.dynamicMode ?? 'standard', contentMode: previous?.contentMode ?? 'plain_text', keywords: previous?.keywords ?? [],
      keywordScanDepth: previous?.keywordScanDepth ?? 0, conditionKeywords: previous?.conditionKeywords ?? [], keywordCondition: previous?.keywordCondition ?? 'none',
      keywordUseRegex: previous?.keywordUseRegex ?? false, keywordIgnoreCase: previous?.keywordIgnoreCase ?? true,
      keywordWholeWord: previous?.keywordWholeWord ?? false, keywordRecursionDepth: previous?.keywordRecursionDepth ?? 0,
      triggerMode: previous?.triggerMode ?? 'always', enabled: index < active.length && prompt.enabled !== false,
      position, promptPositionId, insertRole: String(prompt.role) as SettingLibraryEntry['insertRole'],
      order: previous && usesNativePresetPlacement(prompt) && !nativeReordered ? previous.order : index + 1,
      viewOrder: previous?.viewOrder ?? index, groupViewOrder: previous?.groupViewOrder ?? index, treeViewOrder: previous?.treeViewOrder ?? index,
      createdAt: previous?.createdAt ?? now, updatedAt: now }]
  })
  return { ...base, entries: [...base.entries.filter(entry => entry.kind !== 'normal'), ...entries], promptPositions: positions,
    regexRules: decodeCompatibilityRegexRules(presetObject(value.extensions).regex_scripts) }
}

/** Preset IDs and editable fields remain owned by the original product repository. */
export class CompatibilityPresetOperations {
  constructor(private readonly data: ElecKoiProductDataStore, private readonly publish: (change: CompatibilityChange) => void) {}
  private get store() { return this.data.compatibilityStore() }
  private find(reference: string) {
    return this.data.readAgentPresetCatalog().presets.find(item => item.id === reference || item.name === reference)
  }
  document(base: AgentPreset): PresetObject {
    const companion = this.store.get('tavern-presets', base.id)
    const value = companion === null ? nativePresetDocument(base) : refreshPresetDocument(presetObject(companion), base)
    const before = this.store.get('tavern-preset-native-bases', base.id) ?? companion
    if (companion !== null && JSON.stringify(companion) !== JSON.stringify(value)) this.store.put('tavern-presets', base.id, value)
    if (before !== null && JSON.stringify(before) !== JSON.stringify(value)) {
      const draft = this.store.get('tavern-preset-drafts', base.id)
      if (draft !== null) this.store.put('tavern-preset-drafts', base.id, rebasePresetDraft(presetObject(draft), presetObject(before), value))
      const runtime = this.store.get('tavern-preset-runtime', 'draft')
      if (runtime !== null && presetObject(runtime).id === base.id) this.store.put('tavern-preset-runtime', 'draft', { ...presetObject(runtime), preset: rebasePresetDraft(presetObject(presetObject(runtime).preset), presetObject(before), value) })
    }
    if (JSON.stringify(before) !== JSON.stringify(value)) this.store.put('tavern-preset-native-bases', base.id, value)
    return value
  }
  list(): PresetObject[] {
    return this.data.readAgentPresetCatalog().presets.map(item => ({ id: item.id, name: item.name, preset: this.document(this.data.readAgentPreset(item.id)) }))
  }
  state(): PresetObject {
    const base = this.data.readAgentPreset(this.data.readAgentPresetCatalog().activePresetId), saved = this.document(base)
    const runtime = this.store.get('tavern-preset-runtime', 'draft')
    if (runtime !== null && presetObject(runtime).id === base.id) return { ...presetObject(runtime), name: base.name }
    const next = { id: base.id, name: base.name, preset: this.store.get('tavern-preset-drafts', base.id) ?? saved }
    this.store.put('tavern-preset-runtime', 'draft', next)
    return next
  }
  private put(reference: string, input: PresetObject, createOnly = false, requireExisting = false, expectedPresetId = ''): PresetObject {
    const value = validatePreset(input)
    if (reference === 'in_use') {
      if (createOnly) return { created: false, changed: false }
      const state = this.state(), id = expectedPresetId || String(state.id)
      this.data.readAgentPreset(id)
      this.store.put('tavern-preset-drafts', id, value)
      if (state.id === id) this.store.put('tavern-preset-runtime', 'draft', { ...state, preset: value })
      return { created: false, changed: true }
    }
    if (!reference.trim()) throw new TypeError('Preset reference is required')
    const existing = this.find(reference)
    if (existing && createOnly) return { created: false, changed: false }
    if (!existing && requireExisting) throw new Error(`Preset does not exist: ${reference}`)
    const base = existing ? this.data.readAgentPreset(existing.id) : this.data.createAgentPreset(reference, '')
    try {
      this.document(base)
      const saved = this.data.saveAgentPreset(projectTavernPreset(base, value), base.regexRules)
      this.store.put('tavern-presets', base.id, value)
      this.document(saved)
    } catch (error) {
      if (!existing) this.data.deleteAgentPreset(base.id)
      throw error
    }
    return { created: !existing, changed: true }
  }
  invoke({ method, params: p }: CompatibilityCommand): CompatibilityValue {
    const reference = String(p.reference ?? ''), id = String(p.id ?? '')
    const changed = (result: CompatibilityValue): CompatibilityValue => {
      this.publish({ event: 'presets.changed', payload: { ...p, action: method, state: this.state(), presets: this.list() } })
      return result
    }
    switch (method) {
      case 'presets.list': return json(this.data.readAgentPresetCatalog().presets.map(item => this.data.readAgentPreset(item.id)))
      case 'presets.get': return json(this.data.readAgentPreset(id))
      case 'presets.select': this.data.setActiveAgentPreset(id); return changed(json(this.data.readAgentPreset(id)))
      case 'presets.update': {
        const base = this.data.readAgentPreset(id), next = presetObject(p.preset)
        return changed(json(this.data.saveAgentPreset({ ...base, ...next, id } as AgentPreset, base.regexRules)))
      }
      case 'tavernPresets.list': return this.list()
      case 'tavernPresets.state': return this.state()
      case 'tavernPresets.load': {
        const selected = this.find(id)
        if (!selected) return false
        this.data.setActiveAgentPreset(selected.id)
        const base = this.data.readAgentPreset(selected.id), saved = this.document(base)
        this.store.put('tavern-preset-drafts', base.id, saved)
        this.store.put('tavern-preset-runtime', 'draft', { id: base.id, name: base.name, preset: saved })
        return changed(true)
      }
      case 'tavernPresets.put': return changed(this.put(reference, presetObject(p.preset), p.createOnly === true, p.requireExisting === true, String(p.expectedPresetId ?? '')))
      case 'tavernPresets.import': {
        const raw = JSON.parse(String(p.content)) as PresetObject
        this.put(String(p.name), decodeTavernPreset(raw)); return changed(true)
      }
      case 'tavernPresets.export': {
        if (!reference || reference === 'in_use') return encodeTavernPreset(presetObject(this.state().preset))
        const selected = this.find(reference)
        if (!selected) throw new Error(`Preset does not exist: ${reference}`)
        return encodeTavernPreset(this.document(this.data.readAgentPreset(selected.id)))
      }
      case 'tavernPresets.delete': {
        const selected = this.find(reference)
        if (!selected || reference === 'in_use' || selected.id === 'agent-preset-standard') return false
        this.data.deleteAgentPreset(selected.id)
        for (const scope of ['tavern-presets', 'tavern-preset-drafts', 'tavern-preset-native-bases']) this.store.delete(scope, selected.id)
        if (presetObject(this.store.get('tavern-preset-runtime', 'draft')).id === selected.id) this.store.deleteScope('tavern-preset-runtime')
        return changed(true)
      }
      case 'tavernPresets.rename': {
        const selected = this.find(reference), name = String(p.name ?? '')
        if (!selected || reference === 'in_use' || name === 'in_use' || this.data.readAgentPresetCatalog().presets.some(item => item.id !== selected.id && item.name === name)) return false
        const base = this.data.readAgentPreset(selected.id)
        this.data.saveAgentPreset({ ...base, name }, base.regexRules); return changed(true)
      }
      default: throw new Error(`Unknown preset method: ${method}`)
    }
  }
  runtime(base: AgentPreset): AgentPreset {
    const state = this.state(), document = presetObject(state.preset)
    if (base.id !== state.id) return base
    if (this.store.get('tavern-presets', base.id) === null && JSON.stringify(document) === JSON.stringify(this.document(base))) return base
    const projected = projectTavernPreset(base, document)
    const nativeIds = [...presetPrompts(document, 'prompts'), ...presetPrompts(document, 'prompts_unused')].flatMap((prompt, index) => {
      const entry = nativeEntry(projected, prompt, index)
      return entry && (usesNativePresetPlacement(prompt) || entry.triggerMode === 'agent_tool') ? [entry.id] : []
    })
    return { ...projected, entries: projected.entries.filter(entry => entry.kind !== 'normal' || nativeIds.includes(entry.id)) }
  }
}
