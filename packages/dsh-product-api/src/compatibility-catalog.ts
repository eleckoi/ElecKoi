import { randomUUID } from 'node:crypto'
import { isPng, readPngText } from '@eleckoi/dsh-product-data/media'
import type { CharacterCollection, CharacterRecord, CompatibilityCommand, CompatibilityChange, CompatibilityValue,
  ElecKoiProductDataStore, PersonaProfile, SettingLibraryEntry } from './types.js'

type ObjectValue = { [key: string]: CompatibilityValue }
export type CompatibilityHandler = (params: ObjectValue) => CompatibilityValue | Promise<CompatibilityValue>
export interface CompatibilityCatalogServices {
  characters: {
    list(): CharacterCollection
    create(character: CharacterRecord): CharacterCollection
    update(character: CharacterRecord): CharacterCollection
    select(id: string): CharacterCollection
    delete(ids: string[]): Promise<CharacterCollection>
    prepareImport: ElecKoiProductDataStore['prepareCharacterImports']
    commitImport: ElecKoiProductDataStore['commitCharacterImports']
  }
  persona: { read(): PersonaProfile; save(profile: PersonaProfile): PersonaProfile }
  readMessageCount?(conversationId: string): number | Promise<number>
}

export const COMPATIBILITY_CATALOG_METHODS = [
  'characters.list', 'characters.read', 'characters.write', 'characters.rawList', 'characters.raw',
  'characters.put', 'characters.upsert', 'characters.import', 'characters.importUrl', 'characters.delete', 'characters.history',
  'characters.rename', 'personas.list', 'personas.get', 'personas.set', 'personas.put', 'personas.upsert',
  'personas.delete', 'personas.select', 'personas.binding'
] as const

/** Missing card fields and Persona collections complement the native repositories. */
export class CompatibilityCatalogOperations {
  readonly handlers: ReadonlyMap<string, CompatibilityHandler>
  constructor(private readonly data: ElecKoiProductDataStore, private readonly services: CompatibilityCatalogServices,
    private readonly publish: (change: CompatibilityChange) => void) {
    this.handlers = new Map(COMPATIBILITY_CATALOG_METHODS.map(method => [method, params => this.invoke({ method, params })]))
  }
  private get store() { return this.data.compatibilityStore() }
  private change(event: string, payload: CompatibilityValue): void { this.publish({ event, payload }) }
  private character(reference: string): CharacterRecord {
    const collection = this.services.characters.list()
    const selected = !reference || reference === 'current' ? collection.active_character_id : reference
    const matches = collection.items.filter(item => item.id === selected || item.name === selected
      || (text(this.rawCardMetadata(item.id).avatar) || `${item.id}.png`) === selected)
    if (matches.length !== 1) throw new Error(matches.length ? `Ambiguous character: ${reference}` : `Character does not exist: ${reference}`)
    return matches[0]!
  }
  private rawCardMetadata(id: string): ObjectValue { return object(this.store.get('character-cards', id)) }
  raw(reference: string): ObjectValue {
    const native = this.character(reference), previous = this.rawCardMetadata(native.id)
    const description = this.data.readSettingLibrary(native.id).entries.find(entry => entry.id === `compat-character:${native.id}:description`)
    const defaults: ObjectValue = { name: text(native.name), description: '', personality: '', scenario: '', first_mes: '',
      mes_example: '', creator: '', creator_notes: '', character_version: '', alternate_greetings: [], extensions: {} }
    const cardData: ObjectValue = { ...defaults, ...object(previous.data), name: text(native.name), first_mes: native.persona?.opening ?? '' }
    if (description) cardData.description = description.content
    return { spec: 'chara_card_v2', spec_version: '2.0', ...previous, ...cardData, data: cardData, native_id: native.id,
      name: text(native.name), avatar: text(previous.avatar) || `${native.id}.png`, avatar_path: text(native.avatar),
      first_mes: cardData.first_mes ?? '', description: cardData.description ?? '', creatorcomment: cardData.creator_notes ?? '' }
  }
  private nativeDocument(reference: string): ObjectValue {
    const native = this.character(reference)
    const extra = object(this.store.get('character-native-extra', native.id))
    return { ...extra, ...json(native) as ObjectValue, persona: { ...object(extra.persona), ...object(json(native.persona ?? {})) } }
  }
  private putCard(p: ObjectValue): ObjectValue {
    const input = object(requiredValue(p, 'character')), reference = text(p.id)
    const native = reference ? this.character(reference) : undefined
    const previous = native ? this.raw(native.id) : {}
    const oldData = object(previous.data)
    const supplied = p.raw === true ? object(input.data ?? input) : input
    const name = text(p.name) || text(supplied.name) || text(native?.name) || 'Unnamed character'
    const cardData = { ...oldData, ...supplied, name,
      extensions: { ...object(oldData.extensions), ...object(supplied.extensions) } } as ObjectValue
    if (p.raw !== true) {
      delete cardData.first_messages
      if (Array.isArray(input.first_messages)) {
        cardData.first_mes = input.first_messages[0] ?? ''; cardData.alternate_greetings = input.first_messages.slice(1)
      }
      if (input.version !== undefined) cardData.character_version = input.version
      if (input.worldbook !== undefined) cardData.extensions = { ...object(cardData.extensions), world: input.worldbook }
    }
    const id = native?.id ?? randomUUID()
    const avatarInput = input.avatar
    let avatar = native?.avatar ?? ''
    if (avatarInput && typeof avatarInput === 'object' && !Array.isArray(avatarInput)) {
      avatar = `data:${text(avatarInput.mimeType) || 'image/png'};base64,${requiredText(avatarInput, 'data')}`
    } else if (typeof avatarInput === 'string' && avatarInput !== previous.avatar) avatar = avatarInput
    const record: CharacterRecord = { ...(native ?? { id }), id, name, avatar,
      persona: { ...(native?.persona ?? { assistant_square: '', assistant_cover: '' }), assistant_name: name,
        assistant_avatar: avatar, opening: text(cardData.first_mes), show_opening: !!text(cardData.first_mes) } }
    if (native) this.services.characters.update(record); else this.services.characters.create(record)
    const fields = ['description', 'personality', 'scenario', 'mes_example', 'system_prompt', 'post_history_instructions']
    const library = this.data.readSettingLibrary(id)
    const now = new Date().toISOString()
    const entries = fields.filter(field => cardData[field] !== undefined).map(field => {
      const entryId = `compat-character:${id}:${field}`, old = library.entries.find(entry => entry.id === entryId)
      return { ...entryDefaults(entryId, now), ...old, title: field, content: text(cardData[field]), enabled: !!text(cardData[field]),
        order: fields.indexOf(field), updatedAt: now }
    })
    const oldOpening = library.entries.find(entry => entry.kind === 'opening')
    if (oldOpening && (cardData.first_mes !== undefined || cardData.alternate_greetings !== undefined)) {
      const greetings = [text(cardData.first_mes), ...(Array.isArray(cardData.alternate_greetings) ? cardData.alternate_greetings.map(text) : [])]
      const openingMessages = greetings.map((content, index) => ({ id: oldOpening.openingMessages[index]?.id ?? `compat-greeting-${index}`,
        title: index === 0 ? '默认开场' : `开场 ${index + 1}`, content,
        initialVariableStateJson: oldOpening.openingMessages[index]?.initialVariableStateJson ?? '' }))
      entries.push({ ...oldOpening, content: greetings[0]!, openingMessages, defaultOpeningMessageId: openingMessages[0]!.id, updatedAt: now })
    }
    const next = [...library.entries.filter(entry => !entries.some(update => update.id === entry.id)), ...entries]
    this.data.saveSettingLibrary(id, { ...library, entries: next, versions: library.versions.map(version =>
      version.id === library.activeVersionId ? { ...version, entries: next, updatedAt: now } : version) })
    this.store.put('character-cards', id, { ...previous, ...(p.raw === true ? input : {}), data: cardData,
      avatar: typeof input.avatar === 'string' && !input.avatar.includes('/') ? input.avatar : text(previous.avatar) || `${id}.png` })
    const extensions = object(cardData.extensions), helper = object(extensions.tavern_helper)
    if (helper.variables !== undefined) this.store.put(`variables:character:${id}`, 'state', helper.variables)
    if (extensions.world !== undefined) this.store.put('worldbook-primaries', id, { primary: extensions.world || null })
    const character = this.raw(id)
    this.change('characters.changed', { id, characterId: id, operation: native ? 'update' : 'create',
      index: this.services.characters.list().items.findIndex(item => item.id === id), character, previous })
    return character
  }
  private personaDefaults(id: string, name: string): ObjectValue {
    return { avatar_id: id, avatar: '', name, title: '', description: '', position: 0, depth: 4, role: 0,
      lorebook: '', connections: [], is_default: false }
  }
  personas(): ObjectValue[] {
    if (this.store.get('persona-selection', 'initialized') === null) {
      const native = this.services.persona.read()
      this.store.atomic(() => {
        this.store.put('personas', 'default.png', { ...this.personaDefaults('default.png', native.user_name), avatar: native.user_avatar,
          square: native.user_square, portrait: native.user_portrait, is_default: true })
        this.store.put('persona-selection', 'global', 'default.png'); this.store.put('persona-selection', 'applied', 'default.png')
        this.store.put('persona-selection', 'initialized', true)
      })
    }
    const applied = text(this.store.get('persona-selection', 'applied'))
    if (applied && this.store.get('personas', applied) !== null) {
      const profile = this.services.persona.read(), old = object(this.store.get('personas', applied))
      this.store.put('personas', applied, { ...old, name: profile.user_name, avatar: profile.user_avatar,
        square: profile.user_square, portrait: profile.user_portrait })
    }
    return Object.values(this.store.list('personas')).map(value => { const entry = object(value); return { ...entry, avatar_path: text(entry.avatar) } })
  }
  currentPersona(p: ObjectValue): string {
    this.personas()
    const chat = text(p.conversationId), character = text(p.characterId) || (chat ? this.data.readConversationDetails(chat).metadata.characterId : '')
    const scopes = [...chat ? [`chat:${chat}`] : [], ...character ? [`character:${character}`] : [],
      ...chat ? [`active:${chat}`] : [], 'default', 'global']
    return scopes.map(scope => text(this.store.get('persona-selection', scope))).find(id => id && this.store.get('personas', id) !== null) ?? ''
  }
  private resolvePersona(reference: string, p: ObjectValue): ObjectValue | undefined {
    const wanted = !reference || reference === 'current' ? this.currentPersona(p) : reference
    const matches = this.personas().filter(item => item.avatar_id === wanted || item.name === wanted)
    if (matches.length > 1) throw new Error(`Ambiguous Persona: ${reference}`)
    return matches[0]
  }
  private applyPersona(id: string): ObjectValue {
    const stored = this.store.get('personas', id)
    if (stored === null) throw new Error(`Persona does not exist: ${id}`)
    const value = object(stored)
    const profile = this.services.persona.read()
    this.services.persona.save({ ...profile, user_name: text(value.name), user_avatar: text(value.avatar),
      user_square: text(value.square), user_portrait: text(value.portrait) })
    this.store.put('persona-selection', 'applied', id)
    this.change('personas.changed', { id, avatarId: id, operation: 'select', persona: value })
    return value
  }
  private putPersona(p: ObjectValue): ObjectValue {
    this.personas()
    const input = object(requiredValue(p, 'persona')), id = text(p.id) || text(input.avatar_id) || `persona-${randomUUID()}.png`
    const previous = this.store.get('personas', id)
    const saved: ObjectValue = { ...this.personaDefaults(id, text(p.name)), ...object(previous), ...input,
      avatar_id: id, name: text(p.name) || text(input.name) || text(object(this.store.get('personas', id)).name) }
    if (saved.avatar && typeof saved.avatar === 'object' && !Array.isArray(saved.avatar)) {
      saved.avatar = `data:${text(saved.avatar.mimeType) || 'image/png'};base64,${requiredText(saved.avatar, 'data')}`
    }
    this.store.atomic(() => {
      if (saved.is_default === true) {
        for (const entry of this.personas()) if (entry.avatar_id !== id) this.store.put('personas', text(entry.avatar_id), { ...entry, is_default: false })
      }
      this.store.put('personas', id, saved)
    })
    if (this.store.get('persona-selection', 'applied') === id) this.applyPersona(id)
    this.change('personas.changed', { id, avatarId: id, operation: previous === null ? 'create' : 'update',
      persona: saved, previous: object(previous) })
    return saved
  }
  async invoke({ method, params: p }: CompatibilityCommand): Promise<CompatibilityValue> {
    switch (method) {
      case 'characters.list': return this.services.characters.list().items.map(item => this.nativeDocument(item.id))
      case 'characters.read': return this.nativeDocument(text(p.characterId) || text(p.id) || 'current')
      case 'characters.raw': return this.raw(text(p.characterId) || text(p.id) || 'current')
      case 'characters.rawList': return this.services.characters.list().items.map(item => this.raw(item.id))
      case 'characters.write': {
        const native = this.character(text(p.characterId) || text(p.id) || 'current'), input = object(requiredValue(p, 'character'))
        const previous = this.raw(native.id)
        this.services.characters.update({ ...native, ...input, id: native.id } as CharacterRecord)
        this.store.put('character-native-extra', native.id, input)
        this.change('characters.changed', { id: native.id, characterId: native.id, operation: 'update',
          index: this.services.characters.list().items.findIndex(item => item.id === native.id), character: this.raw(native.id), previous })
        return this.nativeDocument(native.id)
      }
      case 'characters.put': return this.putCard(p)
      case 'characters.upsert': {
        let native: CharacterRecord | undefined
        const reference = text(p.reference)
        if (reference) {
          const matches = this.services.characters.list().items.filter(item => item.id === reference || item.name === reference || this.raw(item.id).avatar === reference)
          if (matches.length > 1) throw new Error(`Ambiguous character: ${reference}`)
          native = reference === 'current' ? this.character(reference) : matches[0]
        }
        if (!native && text(p.id)) native = this.services.characters.list().items.find(item => item.id === p.id)
        if (native && p.createOnly === true) return { created: false, changed: false }
        return { created: !native, changed: true, character: this.putCard({ ...p, id: native?.id ?? '' }) }
      }
      case 'characters.rename': {
        const native = this.character(text(p.characterId) || text(p.id) || 'current'), name = requiredText(p, 'name')
        const previous = this.raw(native.id)
        this.services.characters.update({ ...native, name, persona: { ...native.persona!, assistant_name: name } })
        const character = this.raw(native.id)
        this.change('characters.changed', { id: native.id, characterId: native.id, operation: 'update',
          index: this.services.characters.list().items.findIndex(item => item.id === native.id), character, previous })
        return character
      }
      case 'characters.importUrl': {
        const url = requiredText(p, 'url'), response = await fetch(url)
        if (!response.ok) throw new Error(`下载角色卡失败：HTTP ${response.status}`)
        const bytes = Buffer.from(await response.arrayBuffer()), png = isPng(bytes)
        const encoded = png ? readPngText(bytes).get('ccv3') ?? readPngText(bytes).get('chara') : undefined
        const source = encoded ? Buffer.from(encoded, 'base64').toString('utf8') : !png ? bytes.toString('utf8') : ''
        if (!source) throw new Error('PNG does not contain a Tavern character card')
        const card = object(JSON.parse(source) as CompatibilityValue), name = text(object(card.data ?? card).name)
        const requested = text(p.preserveFileName).replace(/\.json$/, '') || name
        const matches = this.services.characters.list().items.filter(item => item.name === requested || this.raw(item.id).avatar === requested)
        if (matches.length > 1) throw new Error(`Ambiguous character: ${requested}`)
        if (!matches[0]) return this.invoke({ method: 'characters.import', params: { data: bytes.toString('base64'), filename: png ? 'character.png' : 'character.json' } })
        // Validate through the native importer before updating the original character.
        // Updating through putCard retains the native identity and existing chats.
        const preview = this.services.characters.prepareImport([{ displayName: png ? 'character.png' : 'character.json', mimeType: png ? 'image/png' : 'application/json', base64: bytes.toString('base64') }], 'sillytavern')
        this.data.discardCharacterImports(preview.token)
        const errors = preview.items.filter(item => !item.importable)
        if (errors.length) throw new Error(errors.map(item => item.errorMessage).join('\n'))
        return this.putCard({ id: matches[0].id, raw: true, name, character: { ...card,
          ...(png ? { avatar: { mimeType: 'image/png', data: bytes.toString('base64') } } : {}) } })
      }
      case 'characters.import': {
        const filename = text(p.filename) || 'character.json', bytes = Buffer.from(requiredText(p, 'data'), 'base64')
        const preview = this.services.characters.prepareImport([{ displayName: filename, mimeType: filename.endsWith('.png') ? 'image/png' : 'application/json', base64: bytes.toString('base64') }], 'sillytavern')
        const errors = preview.items.filter(item => !item.importable)
        if (errors.length) throw new Error(errors.map(item => item.errorMessage).join('\n'))
        const result = this.services.characters.commitImport(preview.token), id = result.importedCharacterIds[0]
        if (!id) throw new Error('Character import returned no native character')
        const encoded = isPng(bytes) ? readPngText(bytes).get('ccv3') ?? readPngText(bytes).get('chara') : undefined
        const source = encoded ? Buffer.from(encoded, 'base64').toString('utf8') : !isPng(bytes) ? bytes.toString('utf8') : ''
        if (source) this.store.put('character-cards', id, JSON.parse(source) as CompatibilityValue)
        const character = this.raw(id)
        this.change('characters.changed', { id, characterId: id, operation: 'create',
          index: this.services.characters.list().items.findIndex(item => item.id === id), character, previous: {} })
        return character
      }
      case 'characters.delete': {
        const reference = requiredText(p, 'id'), known = this.services.characters.list().items.find(item => item.id === reference)
        if (!known) return false
        const previous = this.raw(reference), index = this.services.characters.list().items.findIndex(item => item.id === reference)
        await this.services.characters.delete([reference])
        for (const scope of ['character-cards', 'character-native-extra', 'character-projections', 'worldbook-primaries']) this.store.delete(scope, reference)
        this.store.delete('bindings', `character:${reference}`)
        this.change('characters.changed', { id: reference, characterId: reference, operation: 'delete', index, previous }); return true
      }
      case 'characters.history': {
        const native = this.character(text(p.characterId) || text(p.id) || 'current')
        if (!this.services.readMessageCount) throw new Error('Character history requires the native DSH message projection')
        return Promise.all(this.data.readConversationCatalog().filter(item => item.metadata.characterId === native.id).map(async item => ({
          file_name: `${item.id}.jsonl`, conversationId: item.id, ch_name: text(native.name), avatar_url: this.raw(native.id).avatar!,
          last_mes: item.updatedAt, preview: item.preview, chat_items: await this.services.readMessageCount!(item.id) })))
      }
      case 'personas.list': return this.personas()
      case 'personas.get': return this.resolvePersona(text(p.id), p) ?? null
      case 'personas.put': return this.putPersona(p)
      case 'personas.set': return this.putPersona({ ...p, id: this.currentPersona(p) })
      case 'personas.upsert': {
        const reference = text(p.reference), found = reference ? this.resolvePersona(reference, p) : this.resolvePersona(text(p.id), p)
        if (found && p.createOnly === true) return { created: false, changed: false }
        return { created: !found, changed: true, persona: this.putPersona({ ...p, id: found ? text(found.avatar_id) : text(p.id) }) }
      }
      case 'personas.delete': {
        this.personas(); const id = requiredText(p, 'id')
        if (this.store.get('personas', id) === null) return false
        const previous = object(this.store.get('personas', id))
        this.store.atomic(() => {
          this.store.delete('personas', id)
          const fallback = Object.keys(this.store.list('personas'))[0]
          for (const [scope, value] of Object.entries(this.store.list('persona-selection'))) if (value === id) {
            if (scope === 'global' && fallback) this.store.put('persona-selection', scope, fallback)
            else this.store.delete('persona-selection', scope)
          }
        })
        const next = this.currentPersona(p); if (next) this.applyPersona(next)
        this.change('personas.changed', { id, avatarId: id, operation: 'delete', previous }); return true
      }
      case 'personas.select': case 'personas.binding': {
        this.personas(); const scope = text(p.scope) || (method === 'personas.select' ? 'global' : 'chat')
        const key = scope === 'chat' ? `chat:${requiredText(p, 'conversationId')}` : scope === 'character' ? `character:${this.character(text(p.characterId) || 'current').id}` : scope
        if (!['global', 'default', 'chat', 'character'].includes(scope)) throw new Error(`Unknown Persona scope: ${scope}`)
        if (p.id !== undefined) {
          const active = this.currentPersona(p)
          if (p.id === null) {
            if (active && text(p.conversationId)) this.store.put('persona-selection', `active:${text(p.conversationId)}`, active)
            this.store.delete('persona-selection', key)
          } else {
            const entry = this.resolvePersona(requiredText(p, 'id'), p)
            if (!entry) throw new Error(`Persona does not exist: ${text(p.id)}`)
            this.store.put('persona-selection', key, entry.avatar_id!)
            if (scope === 'global' && text(p.conversationId)) this.store.put('persona-selection', `active:${text(p.conversationId)}`, entry.avatar_id!)
          }
          if (scope === 'default') for (const entry of this.personas()) this.store.put('personas', text(entry.avatar_id), { ...entry, is_default: entry.avatar_id === p.id })
          const next = this.currentPersona(p); if (next) this.applyPersona(next)
        }
        const selected = this.store.get('persona-selection', key)
        return method === 'personas.binding' ? selected : this.resolvePersona(text(selected), p) ?? null
      }
      default: throw new Error(`Unknown catalog compatibility method: ${method}`)
    }
  }
}

function entryDefaults(id: string, now: string): SettingLibraryEntry {
  return { id, title: '', iconId: '', kind: 'normal', groupId: '', content: '', openingMessages: [], defaultOpeningMessageId: '',
    agentSelectionHint: '', agentReadStrategy: 'required', dynamicMode: 'standard', contentMode: 'plain_text', keywords: [],
    keywordScanDepth: 2, conditionKeywords: [], keywordCondition: 'none', keywordUseRegex: false, keywordIgnoreCase: true,
    keywordWholeWord: false, keywordRecursionDepth: 0, triggerMode: 'always', enabled: true, position: 'instructions',
    promptPositionId: '', insertRole: 'system', order: 0, viewOrder: 0, groupViewOrder: 0, treeViewOrder: 0, createdAt: now, updatedAt: now }
}
export function text(value: unknown): string { return typeof value === 'string' ? value : '' }
export function object(value: unknown): ObjectValue {
  if (value === null || value === undefined) return {}
  if (typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Expected a compatibility object')
  return { ...value } as ObjectValue
}
export function json(value: unknown): CompatibilityValue { return JSON.parse(JSON.stringify(value)) as CompatibilityValue }
export function requiredText(value: ObjectValue, key: string): string { const result = text(value[key]); if (!result) throw new TypeError(`Missing compatibility field: ${key}`); return result }
export function requiredValue(value: ObjectValue, key: string): CompatibilityValue { if (value[key] === undefined) throw new TypeError(`Missing compatibility field: ${key}`); return value[key]! }
