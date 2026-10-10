import { CompatibilityPresetOperations, nativePresetDocument, usesNativePresetPlacement } from './compatibility-presets.js'
import { presetObject, presetPrompts, PRESET_PLACEHOLDERS, type PresetObject } from './compatibility-preset-codec.js'
import type { CompatibilityCatalogOperations } from './compatibility-catalog.js'
import type { CompatibilityChange, CompatibilityValue, ElecKoiProductDataStore } from './types.js'

/** Read one coherent selection, then prepare the original product Agent services. */
export class CompatibilityRuntimePreparation {
  private readonly presets: CompatibilityPresetOperations
  constructor(private readonly data: ElecKoiProductDataStore, private readonly catalog: CompatibilityCatalogOperations,
    publish: (change: CompatibilityChange) => void, private readonly providers?: { get(name: string): unknown }) { this.presets = new CompatibilityPresetOperations(data, publish) }

  async prepare(conversationId: string, text: string, _modelSnapshot?: unknown, options: { speakerId?: string } = {}) {
    const details = this.data.readConversationDetails(conversationId)
    const base = this.data.readAgentPreset(this.data.readAgentPresetCatalog().activePresetId)
    const state = this.presets.state(), document = structuredClone(presetObject(state.preset))
    const compatibility = this.data.compatibilityStore().get('tavern-presets', base.id) !== null
      || JSON.stringify(document) !== JSON.stringify(nativePresetDocument(base))
    const persona = presetObject(await this.catalog.invoke({ method: 'personas.get', params: { conversationId } }))
    const speaker = String(options.speakerId || presetObject(this.data.compatibilityStore().get('group-rounds', conversationId)).characterId || details.metadata.characterId || '')
    const card = speaker ? this.catalog.raw(speaker) : {}
    const runtimePreparation = this.data.prepareConversationRuntime(conversationId, text, {
      preset: this.presets.runtime(base), ...(speaker ? { characterId: speaker } : {}), persona: { user_name: persona.name ?? this.data.readPersona().user_name,
        user_avatar: persona.avatar ?? this.data.readPersona().user_avatar, user_square: persona.square ?? '', user_portrait: persona.portrait ?? '' }
    })
    // Native placements and Agent-tool entries already live in the writable native library.
    const prompts = compatibility ? presetPrompts(document, 'prompts').filter(prompt => {
      if (prompt.enabled !== true || usesNativePresetPlacement(prompt)) return false
      const id = String(presetObject(prompt.extra).eleckoi_entry_id ?? '')
      return !base.entries.some(entry => entry.id === id && entry.triggerMode === 'agent_tool')
    }).map((prompt): PresetObject & { placeholder: boolean } => ({ ...prompt, placeholder: PRESET_PLACEHOLDERS.has(String(prompt.id)) })) : []
    return { runtimePreparation, preset: { id: base.id, name: base.name, settings: presetObject(document.settings), prompts, compatibility },
      persona: structuredClone(persona), card: structuredClone(card) }
  }

  /** Called only for the real round, after the Session is idle; no rendering reevaluates this batch. */
  async freeze(prepared: Awaited<ReturnType<CompatibilityRuntimePreparation['prepare']>>, conversationId: string, options: { readOnly?: boolean } = {}) {
    const result = structuredClone(prepared), slots: Array<{ value: string; set(value: string): void }> = []
    const add = (value: CompatibilityValue | undefined, set: (value: string) => void) => {
      if (typeof value === 'string' && value.includes('{{')) slots.push({ value, set })
    }
    const card = presetObject(result.card.data), persona = result.persona
    const fields: Record<string, string> = { personaDescription: 'description', charDescription: 'description',
      charPersonality: 'personality', scenario: 'scenario', dialogueExamples: 'mes_example' }
    for (const prompt of result.preset.prompts) {
      if (prompt.placeholder) {
        const target = prompt.id === 'personaDescription' ? persona : card, field = fields[String(prompt.id)]
        if (field) add(target[field], value => { target[field] = value })
      } else add(prompt.content, value => { prompt.content = value })
    }
    for (const entry of result.runtimePreparation.conversationContext.settingLibrary?.entries ?? []) {
      if (!entry.enabled || entry.triggerMode === 'agent_tool'
        || result.preset.compatibility && /^compat-character:[^:]+:(?:description|personality|scenario|mes_example|system_prompt|post_history_instructions)$/.test(entry.id)) continue
      add(entry.content, value => { entry.content = value })
    }
    for (const message of result.runtimePreparation.conversationContext.history) add(message.content, value => { message.content = value })
    add(result.runtimePreparation.conversationContext.currentPromptText, value => { result.runtimePreparation.conversationContext.currentPromptText = value })
    if (slots.length) {
      const callbacks = this.providers?.get('eleckoiCompatibilityCallbacks') as { expandMany(texts: string[], options: { conversationId: string; readOnly: boolean }): Promise<string[]> } | undefined
      if (!callbacks?.expandMany) throw Object.assign(new Error('The shared macro runtime is not mounted'), { code: 'MACRO_RUNTIME_NOT_AVAILABLE' })
      const expanded = await callbacks.expandMany(slots.map(slot => slot.value), { conversationId, readOnly: options.readOnly ?? false })
      expanded.forEach((value, index) => slots[index]!.set(value))
    }
    return result
  }
}
