import {
  NativeWorldbookAdapter, defaultWorldbookSettings, normalizeWorldbook, worldbookScanSettings,
  worldbookOrderedKeys, worldbookVectorMatches, worldbookTimedEffect, freezeWorldbookRound,
  projectWorldbookAnchors, projectFrozenWorldbookMessages, type Document, type ScanRequest, type ScanResult
} from '@eleckoi/dsh-worldbook-compat'
import type { CompatibilityChange, CompatibilityValue, ConversationRuntimePreparation, ElecKoiProductDataStore } from './types.js'
import { randomUUID } from 'node:crypto'

export const WORLDBOOK_ROUND_METHODS = ['worldbooks.scan', 'worldbooks.timedEffect'] as const

export interface WorldbookRoundServices {
  /** Real tokenizer and macro service for the model/config selected for this request. */
  tokenCount(text: string): number | Promise<number>
  expand(text: string): string | Promise<string>
  messageCount(conversationId: string): number | Promise<number>
  retrieveVectors?: (request: { conversationId: string; books: Record<string, Document>; messages: string[]; scanText: string }) => Promise<{ matches: Document[]; maximumPerBook: number }>
  onScanLoop?: ScanRequest['onScanLoop']
  matchEntries?: ScanRequest['matchEntries']
  formatEntries?: ScanRequest['formatEntries']
  prepareBooks?: (request: { conversationId: string; books: Record<string, Document>; scopes: WorldbookRoundCapture['scopes']; dryRun: boolean }) => Promise<{
    books: Record<string, Document>; forced: Record<string, Document>; forceVersions: Record<string, number>; orderedKeys: string[]
  }>
  completeScan?: (request: { conversationId: string; scanId: string; forceVersions: Record<string, number>; dryRun: boolean;
    consumeForcedOnDryRun: boolean; completed: boolean; activatedEntries: Document[] }) => Promise<void>
  random?: () => number
}
export interface WorldbookRoundInput {
  conversationId: string
  messages: readonly string[]
  scanText?: string
  contextWindow: number
  characterId?: string
  personaId?: string
  scanContext?: Document
  dryRun?: boolean
  consumeForcedOnDryRun?: boolean
  authorNote?: Document
  examples?: string
}
export interface WorldbookRoundCapture {
  conversationId: string
  characterId: string
  books: Record<string, Document>
  scopes: { chatLore: string[]; personaLore: string[]; characterLore: string[]; globalLore: string[] }
  settings: Document
  orderedKeys: string[]
  messages: string[]
  scanText: string
  contextWindow: number
  scanContext: Document
  dryRun: boolean
  authorNote: Document
  examples: string
  nativeStaticExclusions: string[]
}
export interface WorldbookAgentRound {
  capture: WorldbookRoundCapture
  scan: Readonly<ScanResult>
  fragments: Document[]
  authorNote: Document
  examples: Document[]
  outlets: Record<string, string>
  nativeStaticExclusions: string[]
}

/** Insert frozen fragments into the actual DSH request; the host supplies its real anchor graph. */
export function projectWorldbookRequestMessages<T>(messages: readonly T[], round: WorldbookAgentRound, options: {
  anchorIndexes: Readonly<Record<string, number>>
  isHistoryMessage(message: T): boolean
  createMessage(fragment: Document): T
}): T[] {
  return projectFrozenWorldbookMessages(messages, round.fragments, options)
}

/** Business adapter for durable product bindings and one captured Agent round. */
export class CompatibilityWorldbookRounds {
  readonly native: NativeWorldbookAdapter
  private readonly scans = new Map<string, CompatibilityValue>()
  lastScan(conversationId: string): CompatibilityValue { return this.scans.get(conversationId) ?? null }
  forget(conversationId: string): void { this.scans.delete(conversationId) }
  dispose(): void { this.scans.clear() }
  constructor(private readonly data: ElecKoiProductDataStore, private readonly publish: (change: CompatibilityChange) => void) {
    this.native = new NativeWorldbookAdapter({
      readNative: id => data.readSettingLibrary(id),
      saveNative: (id, library) => data.saveSettingLibrary(id, library as ReturnType<ElecKoiProductDataStore['readSettingLibrary']>),
      readCompanion: id => data.compatibilityStore().get('worldbook-native-companions', id) as Document | null,
      saveCompanion: (id, companion) => data.compatibilityStore().put('worldbook-native-companions', id, json(companion)),
      atomic: operation => data.compatibilityStore().atomic(operation)
    })
  }

  capture(input: WorldbookRoundInput): WorldbookRoundCapture {
    const store = this.data.compatibilityStore()
    return store.atomic(() => {
      const details = this.data.readConversationDetails(required(input.conversationId, 'conversationId'))
      const characterId = input.characterId ?? details.metadata.characterId
      const primary = record(store.get('worldbook-primaries', characterId)).primary
      const settings = { ...defaultWorldbookSettings(), ...record(store.get('worldbook-settings', 'global')) }
      const names = (key: string) => stringArray(store.get('bindings', key) ?? [], `bindings/${key}`)
      const scopes = {
        chatLore: names(`chat:${input.conversationId}`), personaLore: input.personaId ? names(`persona:${input.personaId}`) : [],
        characterLore: [...new Set([...(characterId ? [`character:${characterId}`] : []), ...(typeof primary === 'string' ? [primary] : []), ...(characterId ? names(`character:${characterId}`) : [])])],
        globalLore: names('global')
      }
      const books: Record<string, Document> = {}
      for (const name of new Set(Object.values(scopes).flat())) books[name] = name.startsWith('character:')
        ? this.native.scanBook(name.slice(10)) : normalizeWorldbook(this.getBook(name))
      return {
        conversationId: input.conversationId, characterId, books, scopes, settings,
        orderedKeys: worldbookOrderedKeys(books, scopes, String(settings.insertion_strategy)),
        messages: [...input.messages], scanText: input.scanText ?? '', contextWindow: input.contextWindow,
        scanContext: structuredClone(input.scanContext ?? {}), dryRun: input.dryRun ?? false,
        authorNote: structuredClone(input.authorNote ?? { position: 'none', content: '' }), examples: input.examples ?? '',
        nativeStaticExclusions: characterId ? this.native.compatibilityEntryIds(characterId) : []
      }
    })
  }

  async prepare(input: WorldbookRoundInput, services: WorldbookRoundServices): Promise<WorldbookAgentRound> {
    requireServices(services)
    const captured = this.capture(input)
    const scanId = randomUUID()
    const prepared = services.prepareBooks ? await services.prepareBooks({ conversationId: captured.conversationId,
      books: structuredClone(captured.books), scopes: structuredClone(captured.scopes), dryRun: captured.dryRun }) : undefined
    const books = prepared?.books ?? captured.books
    let completed = false
    let activatedEntries: Document[] = []
    try {
      const messageCount = await services.messageCount(captured.conversationId)
      if (!Number.isInteger(messageCount) || messageCount < 0) throw new TypeError('Worldbook messageCount service returned an invalid count')
      let vectorMatches: Set<string> | undefined
      if (Object.values(books).some(book => book.entries.some((entry: Document) => entry.strategy.type === 'vectorized'))) {
        if (!services.retrieveVectors) throw Object.assign(new Error('Bound vector worldbooks require a real embedding retrieval service'), { code: 'VECTOR_RETRIEVAL_NOT_AVAILABLE' })
        const result = await services.retrieveVectors({ conversationId: captured.conversationId, books: structuredClone(books), messages: [...captured.messages], scanText: captured.scanText })
        vectorMatches = worldbookVectorMatches(books, result.matches, result.maximumPerBook)
      }
      const store = this.data.compatibilityStore()
      const scan = await freezeWorldbookRound({
        readTiming: id => record(store.get('worldbook-timing', id)),
        saveTiming: (id, value) => store.put('worldbook-timing', id, json(value)),
        saveLastScan: (id, value) => this.scans.set(id, json(value)),
        atomic: operation => store.atomic(operation)
      }, {
        books, messages: captured.messages, scanText: captured.scanText, conversationId: captured.conversationId,
        settings: { ...worldbookScanSettings(captured.settings, captured.contextWindow), orderedKeys: prepared?.orderedKeys ?? captured.orderedKeys },
        ...(prepared ? { forcedEntries: prepared.forced } : {}),
        messageCount, dryRun: captured.dryRun, scanContext: captured.scanContext,
        ...(vectorMatches ? { vectorMatches } : {}),
        tokenCount: text => services.tokenCount(text), expand: text => services.expand(text),
        ...(services.onScanLoop ? { onScanLoop: payload => services.onScanLoop!({ ...payload, scanId }) } : {}),
        ...(services.matchEntries ? { matchEntries: services.matchEntries } : {}),
        ...(services.formatEntries ? { formatEntries: services.formatEntries } : {}),
        ...(services.random ? { random: services.random } : {})
      })
      const anchored = projectWorldbookAnchors(scan.entries, captured.authorNote, captured.examples, captured.conversationId)
      const result = deepFreeze({ capture: captured, scan, fragments: anchored.entries, authorNote: anchored.note,
        examples: anchored.examples, outlets: scan.outlets, nativeStaticExclusions: captured.nativeStaticExclusions })
      activatedEntries = [...scan.activatedEntries]
      completed = true
      if (!captured.dryRun) this.publish({ event: 'worldbooks.activated', payload: json({ conversationId: captured.conversationId,
        entries: scan.entries, activatedEntries, trace: scan.trace, compatNotified: !!services.completeScan }) })
      return result
    } finally {
      if (services.completeScan) await services.completeScan({ conversationId: captured.conversationId, scanId,
        forceVersions: prepared?.forceVersions ?? {}, dryRun: captured.dryRun,
        consumeForcedOnDryRun: input.consumeForcedOnDryRun === true, completed, activatedEntries })
    }
  }

  async timedEffect(params: Record<string, CompatibilityValue>, services: Pick<WorldbookRoundServices, 'messageCount'>): Promise<CompatibilityValue> {
    if (typeof services?.messageCount !== 'function') throw Object.assign(new Error('Timed effects require the actual DSH conversation message count service'), { code: 'MESSAGE_COUNT_NOT_AVAILABLE' })
    const conversationId = required(params.conversationId, 'conversationId'), name = required(params.name, 'name')
    const uid = params.uid, effect = required(params.effect, 'effect')
    if (typeof uid !== 'number' && typeof uid !== 'string') throw new TypeError('Worldbook timed effects require uid')
    this.data.readConversationDetails(conversationId)
    const messageCount = await services.messageCount(conversationId), store = this.data.compatibilityStore()
    const result = store.atomic(() => {
      const updated = worldbookTimedEffect({ book: this.getBook(name), name, uid,
        effect, messageCount, timedState: record(store.get('worldbook-timing', conversationId)),
        ...(params.state !== undefined ? { state: params.state as boolean | string } : {}) })
      if (params.state !== undefined) {
        store.put('worldbook-timing', conversationId, json(updated.timedState))
      }
      return json(updated.result)
    })
    if (params.state !== undefined) this.publish({ event: 'worldbooks.timingChanged', payload: { conversationId, name, uid, effect, ...result as Record<string, CompatibilityValue> } })
    return result
  }

  /** Adds no shadow conversation. Caller maps fragments onto the existing request projection graph. */
  nativeStaticLibrary(preparation: ConversationRuntimePreparation, round: WorldbookAgentRound) {
    const library = preparation.conversationContext.settingLibrary
    if (!library) return undefined
    const excluded = new Set(round.nativeStaticExclusions)
    // The real card examples now have their own before/after-example graph.
    // Keep the native entry available to tools without injecting it twice.
    if (round.capture.examples) excluded.add(`compat-character:${round.capture.characterId}:mes_example`)
    return { ...library, entries: library.entries.map(entry => excluded.has(entry.id)
      ? { ...entry, triggerMode: 'agent_tool' as const, agentReadStrategy: 'normal' as const } : entry) }
  }

  private getBook(name: string): Document {
    if (name.startsWith('character:')) return this.native.read(name.slice(10))
    const value = this.data.compatibilityStore().get('worldbooks', name)
    if (value === null) throw new Error(`Worldbook does not exist: ${name}`)
    return record(value)
  }
}
function requireServices(services: WorldbookRoundServices) {
  for (const name of ['tokenCount', 'expand', 'messageCount'] as const) if (typeof services?.[name] !== 'function')
    throw Object.assign(new Error(`Worldbook round requires the actual ${name} service`), { code: 'WORLDBOOK_SERVICE_NOT_AVAILABLE' })
}
function required(value: unknown, key: string): string { if (typeof value !== 'string' || !value) throw new TypeError(`Missing worldbook field: ${key}`); return value }
function record(value: unknown): Document { if (value === null || value === undefined) return {}; if (typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Expected a worldbook object'); return structuredClone(value) }
function stringArray(value: unknown, key: string): string[] { if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) throw new TypeError(`Worldbook ${key} must be names`); return [...value] }
function json(value: unknown): CompatibilityValue { return JSON.parse(JSON.stringify(value)) as CompatibilityValue }
function deepFreeze<T>(value: T): T { if (value && typeof value === 'object') { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child) } return value }
