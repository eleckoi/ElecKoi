import { randomUUID } from 'node:crypto'
import type { CompatibilityChange, CompatibilityValue, ElecKoiProductDataStore, RegexRule, RegexRuleCollection, RegexRuleTarget } from './types.js'
import type { CompatibilityHandler } from './compatibility-catalog.js'

type Document = { [key: string]: CompatibilityValue }
const json = (value: unknown): CompatibilityValue => JSON.parse(JSON.stringify(value)) as CompatibilityValue
const object = (value: unknown): Document => {
  if (value == null) return {}
  if (typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Expected a regex object')
  return value as Document
}
const placements: Record<string, RegexRuleTarget> = { '1': 'UserInput', '2': 'AiOutput', '3': 'SlashCommand', '5': 'SettingContent', '6': 'Reasoning' }
const sources: Record<string, RegexRuleTarget> = { user_input: 'UserInput', ai_output: 'AiOutput', slash_command: 'SlashCommand', world_info: 'SettingContent', reasoning: 'Reasoning' }
export const REGEX_COMPATIBILITY_METHODS = ['regex.get', 'regex.set', 'regex.replaceScope'] as const

/** Translate data fields only. All execution stays in the common native regex service. */
export function decodeCompatibilityRegexRules(value: CompatibilityValue | undefined): RegexRule[] {
  if (value == null) return []
  if (!Array.isArray(value)) throw new TypeError('Regex rules must be an array')
  return value.map((item, index) => {
    const raw = object(item), source = object(raw.source), destination = object(raw.destination)
    let targets: RegexRuleTarget[]
    if (Array.isArray(raw.targets)) targets = raw.targets as RegexRuleTarget[]
    else if (Object.keys(source).length) targets = Object.entries(source).filter(([, enabled]) => enabled).map(([name]) => sources[name]!)
    else targets = Array.isArray(raw.placement) ? raw.placement.map(value => placements[String(value)]!) : ['AiOutput']
    if (targets.some(target => !Object.values(sources).includes(target))) throw new TypeError('Unknown regex target')
    return {
      id: String(raw.id || randomUUID()), name: String(raw.name ?? raw.script_name ?? raw.scriptName ?? ''),
      pattern: String(raw.pattern ?? raw.find_regex ?? raw.findRegex ?? ''), replacement: String(raw.replacement ?? raw.replace_string ?? raw.replaceString ?? ''),
      targets: [...new Set(targets)], enabled: Boolean(raw.enabled ?? !raw.disabled),
      displayOnly: Boolean(raw.displayOnly ?? raw.display_only ?? raw.markdownOnly ?? (destination.display === true && destination.prompt === false)),
      promptOnly: Boolean(raw.promptOnly ?? raw.prompt_only ?? (destination.prompt === true && destination.display === false)),
      runOnEdit: Boolean(raw.runOnEdit ?? raw.run_on_edit ?? false), order: index,
      trimStrings: (raw.trimStrings ?? raw.trim_strings ?? []) as string[],
      minDepth: (raw.minDepth ?? raw.min_depth ?? null) as number | null, maxDepth: (raw.maxDepth ?? raw.max_depth ?? null) as number | null,
      substituteRegex: Number(raw.substituteRegex ?? 0) as 0 | 1 | 2
    }
  })
}

export function mergeCompatibilityRegexRules(rules: RegexRule[], previous: CompatibilityValue | undefined): Document[] {
  const old = Array.isArray(previous) ? previous.map(object) : []
  return rules.map(rule => ({ ...old.find(item => item.id === rule.id), ...object(json(rule)),
    display_only: rule.displayOnly, prompt_only: rule.promptOnly, run_on_edit: rule.runOnEdit,
    trim_strings: rule.trimStrings ?? [], min_depth: rule.minDepth ?? null, max_depth: rule.maxDepth ?? null,
    ...(old.some(item => item.id === rule.id && 'findRegex' in item) ? { scriptName: rule.name, findRegex: rule.pattern,
      replaceString: rule.replacement, placement: Object.keys(placements).filter(id => rule.targets.includes(placements[id]!)).map(Number),
      disabled: !rule.enabled, markdownOnly: rule.displayOnly, promptOnly: rule.promptOnly } : {}) }))
}

/** A companion retains arbitrary extension fields while native repositories own editable rules. */
export class CompatibilityRegexOperations {
  readonly handlers: ReadonlyMap<string, CompatibilityHandler>
  constructor(private readonly data: ElecKoiProductDataStore, private readonly publish: (change: CompatibilityChange) => void) {
    this.handlers = new Map(REGEX_COMPATIBILITY_METHODS.map(method => [method, p => this.invoke(method, p)]))
  }
  private character(p: Document): string {
    const id = String(p.characterId || (p.conversationId ? this.data.readConversationDetails(String(p.conversationId)).metadata.characterId : this.data.readCharacters().active_character_id))
    if (!id) throw new Error('Regex operation requires a character')
    return id
  }
  private key(scope: string, id: string, presetId: string) { return scope === 'global' ? 'global' : `${scope}:${scope === 'preset' ? presetId : id}` }
  private scopeRules(collection: RegexRuleCollection, scope: string) {
    if (scope === 'global') return collection.globalRules
    if (scope === 'preset') return collection.agentPresetRules
    if (scope === 'character') return collection.characterRules
    throw new TypeError(`Unknown regex scope: ${scope}`)
  }
  read(id: string): Document {
    const collection = this.data.readRegexRules(id), store = this.data.compatibilityStore()
    const rules = (scope: string) => mergeCompatibilityRegexRules(this.scopeRules(collection, scope), store.get('regex-native-companions', this.key(scope, id, collection.agentPresetId)))
    return { format: 'eleckoi.regex-backup', version: 1, character_id: id,
      global_rules: rules('global'), prompt_preset_rules: rules('preset'), character_rules: rules('character'),
      versions: collection.versions.map(version => ({ id: version.id, name: version.name, global_enabled_ids: version.globalEnabledIds,
        prompt_preset_enabled_ids: version.agentPresetEnabledIds, character_enabled_ids: version.characterEnabledIds })),
      active_version_id: collection.activeVersionId, revision: collection.revision }
  }
  invoke(method: string, p: Document): CompatibilityValue {
    const id = this.character(p), scope = String(p.type ?? p.scope ?? 'all')
    if (method === 'regex.get') {
      const backup = this.read(id)
      if (scope === 'all') return backup
      const key = { global: 'global_rules', preset: 'prompt_preset_rules', character: 'character_rules' }[scope]
      if (!key) throw new TypeError(`Unknown regex scope: ${scope}`)
      return backup[key]!
    }
    const current = this.data.readRegexRules(id), backup = this.read(id)
    const incoming = Array.isArray(p.rules) ? undefined : object(p.rules ?? p.backup)
    const updates: Array<[string, CompatibilityValue]> = incoming
      ? [['global', incoming.global_rules!], ['preset', incoming.prompt_preset_rules!], ['character', incoming.character_rules!]].filter(([, value]) => value !== undefined) as Array<[string, CompatibilityValue]>
      : [[scope === 'all' ? 'character' : scope, p.rules!]]
    const next = { ...current }
    const rawScopes: Array<[string, Document[]]> = []
    for (const [target, raw] of updates) {
      const rules = decodeCompatibilityRegexRules(raw)
      if (target === 'global') next.globalRules = rules
      else if (target === 'preset') next.agentPresetRules = rules
      else if (target === 'character') next.characterRules = rules
      else throw new TypeError(`Unknown regex scope: ${target}`)
      rawScopes.push([this.key(target, id, current.agentPresetId), mergeCompatibilityRegexRules(rules, raw)])
      const versionKey = { global: 'globalEnabledIds', preset: 'agentPresetEnabledIds', character: 'characterEnabledIds' }[target] as 'globalEnabledIds' | 'agentPresetEnabledIds' | 'characterEnabledIds'
      next.versions = next.versions.map(version => version.id === next.activeVersionId ? { ...version, [versionKey]: rules.filter(rule => rule.enabled).map(rule => rule.id) } : version)
    }
    if (incoming?.versions !== undefined) {
      if (!Array.isArray(incoming.versions)) throw new TypeError('Regex versions must be an array')
      next.versions = incoming.versions.map(value => { const version = object(value); return { id: String(version.id), name: String(version.name ?? ''),
        globalEnabledIds: (version.global_enabled_ids ?? version.globalEnabledIds ?? []) as string[],
        agentPresetEnabledIds: (version.prompt_preset_enabled_ids ?? version.agentPresetEnabledIds ?? []) as string[],
        characterEnabledIds: (version.character_enabled_ids ?? version.characterEnabledIds ?? []) as string[] } })
    }
    if (incoming?.active_version_id !== undefined) next.activeVersionId = String(incoming.active_version_id)
    this.data.compatibilityStore().atomic(() => {
      this.data.saveRegexRules(id, next, typeof p.expectedRevision === 'number' ? p.expectedRevision : current.revision)
      for (const [key, rules] of rawScopes) this.data.compatibilityStore().put('regex-native-companions', key, rules)
    })
    const saved = this.read(id)
    this.publish({ event: 'regex.changed', payload: { characterId: id, backup: saved, previousRevision: backup.revision! } })
    return saved
  }
}
