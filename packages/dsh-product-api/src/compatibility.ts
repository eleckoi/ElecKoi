import type { CompatibilityCommand, CompatibilityChange, CompatibilityValue, ElecKoiProductDataStore } from './types.js'
import { CompatibilityPresetOperations, PRESET_COMPATIBILITY_METHODS } from './compatibility-presets.js'
import { NativeWorldbookAdapter } from '@eleckoi/dsh-worldbook-compat'
import type { CompatibilityHandler } from './compatibility-catalog.js'
import { EphemeralPromptHistory } from './ephemeral-prompt-history.js'

export const COMPATIBILITY_METHODS = [
  'storage.get', 'storage.set', 'storage.delete', 'storage.list', 'storage.sql', 'storage.transaction',
  'settings.get', 'settings.set', 'variables.readScope', 'variables.writeScope',
  'messages.metadata', 'prompts.history', 'worldbooks.list', 'worldbooks.get', 'worldbooks.put',
  'worldbooks.delete', 'worldbooks.bind', 'worldbooks.bindings', 'worldbooks.settings', 'worldbooks.lastScan',
  'ui.register', 'ui.unregister', 'ui.list', 'ui.open', 'ui.close', ...PRESET_COMPATIBILITY_METHODS
] as const
const WORLD_SETTINGS = { scan_depth: 2, context_percentage: 25, budget_cap: 0, min_activations: 0,
  max_depth: 0, max_recursion_steps: 0, insertion_strategy: 'character_first', include_names: true,
  recursive: false, case_sensitive: false, match_whole_words: false, use_group_scoring: false, overflow_alert: false }

/** Legacy contracts are projected onto product data, with companion storage only for missing domains. */
export class CompatibilityOperations {
  readonly presets: CompatibilityPresetOperations
  private readonly nativeWorldbooks: NativeWorldbookAdapter
  private readonly promptHistory = new EphemeralPromptHistory()
  dispose(): void { this.promptHistory.close() }
  forget(conversationId: string): void { this.promptHistory.forget(conversationId) }
  constructor(private readonly data: ElecKoiProductDataStore, private readonly publish: (change: CompatibilityChange) => void,
    private readonly handlers: ReadonlyMap<string, CompatibilityHandler> = new Map()) {
    this.presets = new CompatibilityPresetOperations(data, publish)
    this.nativeWorldbooks = new NativeWorldbookAdapter({
      readNative: id => data.readSettingLibrary(id),
      saveNative: (id, library) => data.saveSettingLibrary(id, library as ReturnType<ElecKoiProductDataStore['readSettingLibrary']>),
      readCompanion: id => data.compatibilityStore().get('worldbook-native-companions', id) as Record<string, unknown> | null,
      saveCompanion: (id, companion) => data.compatibilityStore().put('worldbook-native-companions', id, json(companion)),
      atomic: operation => data.compatibilityStore().atomic(operation)
    })
  }

  get methods(): string[] { return [...new Set([...COMPATIBILITY_METHODS, ...this.handlers.keys()])] }

  invoke({ method, params: p }: CompatibilityCommand): CompatibilityValue | Promise<CompatibilityValue> {
    const handler = this.handlers.get(method)
    if (handler) return handler(p)
    if ((PRESET_COMPATIBILITY_METHODS as readonly string[]).includes(method)) return this.presets.invoke({ method, params: p })
    const store = this.data.compatibilityStore()
    const owner = text(p.pluginId) || 'frontend'
    const conversation = () => {
      const id = required(p, 'conversationId')
      this.data.readConversationDetails(id)
      return id
    }
    const character = () => required(p, 'characterId')
    const change = (event: string, payload: CompatibilityValue) => this.publish({ event, payload })
    const getBook = (name: string): CompatibilityValue => {
      if (name.startsWith('character:')) return json(this.nativeWorldbooks.read(name.slice(10)))
      const book = store.get('worldbooks', name)
      if (book === null) throw new Error(`Worldbook does not exist: ${name}`)
      return book
    }
    const bindingScope = () => {
      switch (text(p.scope) || 'chat') {
        case 'global': return 'global'
        case 'character': return `character:${character()}`
        case 'chat': return `chat:${conversation()}`
        default: throw new Error(`Unknown worldbook binding scope: ${text(p.scope)}`)
      }
    }
    const variableLocation = (): [string, string] => {
      const scope = text(p.scope) || 'chat'
      switch (scope) {
        case 'global': return ['variables:global', 'state']
        case 'character': return [`variables:character:${character()}`, 'state']
        case 'preset': return [`variables:preset:${text(p.presetId) || required(p, 'activePresetId')}`, 'state']
        case 'script': case 'extension': case 'plugin': return [`variables:${scope}:${text(p.variableOwner) || owner}`, 'state']
        case 'message': {
          const chat = conversation(), message = required(p, 'messageId')
          const candidate = object(store.get(`swipes:${chat}`, message)).swipe_id ?? 0
          const swipe = p.swipeId ?? candidate
          if (!Number.isInteger(swipe) || Number(swipe) < 0) throw new TypeError('swipeId must be a nonnegative integer')
          return [`variables:message:${chat}:${message}`, `state:${swipe}`]
        }
        default: throw new Error(`Unknown variable scope: ${scope}`)
      }
    }
    switch (method) {
      case 'storage.get': return store.get(`kv:${owner}`, required(p, 'key'))
      case 'storage.set': store.put(`kv:${owner}`, required(p, 'key'), value(p, 'value')); return null
      case 'storage.delete': return store.delete(`kv:${owner}`, required(p, 'key'))
      case 'storage.list': return store.list(`kv:${owner}`)
      case 'storage.sql': case 'storage.transaction': {
        const statements = array(value(p, 'statements')).map(entry => {
          const item = object(entry)
          return { sql: required(item, 'sql'), ...(item.params === undefined ? {} : { params: array(item.params) }) }
        })
        return store.sql(owner, text(p.database) || 'default.db', statements, method === 'storage.transaction')
      }
      case 'settings.get': return store.get('settings', p.shared === true ? '__tavern_shared' : owner) ?? {}
      case 'settings.set': {
        const result = store.put('settings', p.shared === true ? '__tavern_shared' : owner, value(p, 'value'))
        change('settings.changed', { shared: p.shared === true, pluginId: owner }); return result
      }
      case 'variables.readScope': {
        if ((text(p.scope) || 'chat') === 'chat') return JSON.parse(this.data.readAuthorConversationState(conversation()).currentVariableStateJson) as CompatibilityValue
        const [scope, key] = variableLocation()
        return store.get(scope, key) ?? (key === 'state:0' ? store.get(scope, 'state') : null) ?? {}
      }
      case 'variables.writeScope': {
        const next = value(p, 'value'), scopeName = text(p.scope) || 'chat'
        if (scopeName === 'chat') {
          const chat = conversation()
          this.data.replaceConversationVariableState(chat, JSON.stringify(next))
          store.put(`metadata:${chat}`, 'chat', { ...object(store.get(`metadata:${chat}`, 'chat')), variables: next })
        } else { const [scope, key] = variableLocation(); store.put(scope, key, next) }
        change('variables.changed', { ...p, value: next }); return next
      }
      case 'messages.metadata': {
        const chat = conversation(), key = text(p.id) || 'chat'
        if (p.value !== undefined) {
          const next = object(p.value)
          if (key === 'chat' && next.variables !== undefined) this.data.replaceConversationVariableState(chat, JSON.stringify(next.variables))
          store.put(`metadata:${chat}`, key, next)
          change('messages.metadataChanged', { conversationId: chat, id: key, value: next })
        }
        const metadata = object(store.get(`metadata:${chat}`, key))
        if (key === 'chat') metadata.variables = JSON.parse(this.data.readAuthorConversationState(chat).currentVariableStateJson) as CompatibilityValue
        return metadata
      }
      case 'prompts.history': {
        const operation = text(p.operation) || 'read'
        if (operation === 'clear') { this.promptHistory.close(); return null }
        const chat = conversation()
        if (operation === 'delete') { this.promptHistory.forget(chat); return null }
        if (operation === 'read') return this.promptHistory.read(chat)
        if (operation !== 'save') throw new Error(`Unknown Prompt history operation: ${operation}`)
        const entry = object(value(p, 'entry')), id = value(entry, 'mesId')
        if (typeof id !== 'string' && typeof id !== 'number') throw new TypeError('Prompt history requires a message identity')
        return this.promptHistory.save(chat, entry)
      }
      case 'worldbooks.list': return [...this.data.readCharacters().items.map(item => `character:${item.id}`), ...Object.keys(store.list('worldbooks'))]
      case 'worldbooks.get': return getBook(required(p, 'name'))
      case 'worldbooks.put': {
        const name = required(p, 'name'), book = value(p, 'book')
        if (name.startsWith('character:')) {
          const native = object(book)
          if (native.characterId === name.slice(10) && Array.isArray(native.groups) && Array.isArray(native.versions)) this.nativeWorldbooks.putNative(name.slice(10), native)
          else this.nativeWorldbooks.put(name.slice(10), native)
        } else store.put('worldbooks', name, book)
        change('worldbooks.changed', { name }); return getBook(name)
      }
      case 'worldbooks.delete': {
        const name = required(p, 'name')
        if (name.startsWith('character:')) throw new Error('Clear the character SettingLibrary instead of deleting it')
        const deleted = store.deleteWorldbook(name); if (deleted) change('worldbooks.changed', { name, deleted }); return deleted
      }
      case 'worldbooks.bind': {
        const names = array(value(p, 'names'))
        names.forEach(name => { if (typeof name !== 'string') throw new TypeError('Worldbook binding names must be strings'); getBook(name) })
        store.atomic(() => {
          if (p.primary !== undefined) {
            if (p.primary !== null) getBook(required(p, 'primary'))
            store.put('worldbook-primaries', character(), { primary: p.primary })
          }
          store.put('bindings', bindingScope(), names)
        })
        change('worldbooks.bindingsChanged', { ...p, names }); return names
      }
      case 'worldbooks.bindings': return store.get('bindings', bindingScope()) ?? []
      case 'worldbooks.settings': {
        if (p.value !== undefined) {
          const patch = object(p.value)
          store.atomic(() => {
            if (patch.selected_global_lorebooks !== undefined) {
              const names = array(patch.selected_global_lorebooks)
              names.forEach(name => { if (typeof name !== 'string') throw new TypeError('Global books must be names'); getBook(name) })
              store.put('bindings', 'global', names)
            }
            store.put('worldbook-settings', 'global', { ...WORLD_SETTINGS, ...object(store.get('worldbook-settings', 'global')), ...patch })
          })
          change('worldbooks.settingsChanged', p.value)
        }
        return { ...WORLD_SETTINGS, ...object(store.get('worldbook-settings', 'global')) }
      }
      case 'worldbooks.lastScan': throw new Error('Worldbook round service is not mounted')
      case 'ui.register': {
        const descriptor = object(value(p, 'descriptor')), id = required(descriptor, 'id')
        store.put(`ui:${owner}`, id, descriptor); change('ui.registered', { pluginId: owner, descriptor }); return null
      }
      case 'ui.unregister': { const id = required(p, 'id'); store.delete(`ui:${owner}`, id); change('ui.unregistered', { pluginId: owner, id }); return null }
      case 'ui.list': return Object.entries(store.list(`ui:${owner}`)).map(([id, descriptor]) => ({ ...object(descriptor), id, pluginId: owner }))
      case 'ui.open': case 'ui.close': {
        const id = method === 'ui.open' ? required(p, 'id') : text(p.id)
        if (method === 'ui.open' && store.get(`ui:${owner}`, id) === null) throw new Error(`Plugin UI does not exist: ${owner}/${id}`)
        change(method, { pluginId: owner, id }); return null
      }
      default: throw Object.assign(new Error(`Compatibility Host method is not connected: ${method}`), { code: 'METHOD_NOT_AVAILABLE' })
    }
  }
}
function text(value: CompatibilityValue | undefined): string { return typeof value === 'string' ? value : '' }
function required(object: { [key: string]: CompatibilityValue }, key: string): string {
  const result = text(object[key]); if (!result) throw new TypeError(`Missing compatibility field: ${key}`); return result
}
function value(object: { [key: string]: CompatibilityValue }, key: string): CompatibilityValue {
  if (object[key] === undefined) throw new TypeError(`Missing compatibility field: ${key}`)
  return object[key]!
}
function object(value: CompatibilityValue): { [key: string]: CompatibilityValue } {
  if (value === null) return {}
  if (typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Expected a compatibility object')
  return { ...value }
}
function array(value: CompatibilityValue): CompatibilityValue[] { if (!Array.isArray(value)) throw new TypeError('Expected a compatibility array'); return value }
function json(value: unknown): CompatibilityValue { return JSON.parse(JSON.stringify(value)) as CompatibilityValue }
