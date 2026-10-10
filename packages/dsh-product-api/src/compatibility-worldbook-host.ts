import { CompatibilityWorldbookRounds, type WorldbookAgentRound, type WorldbookRoundInput, type WorldbookRoundServices } from './compatibility-worldbook-round.js'
import type { CompatibilityCatalogOperations, CompatibilityHandler } from './compatibility-catalog.js'
import type { CompatibilityMessageOperations } from './compatibility-messages.js'
import type { CompatibilityChange, CompatibilityValue, ConversationRuntimePreparation, ElecKoiProductDataStore } from './types.js'

interface GenerationServices { tokenCount(text: string, options: { conversationId: string; modelSnapshot: unknown }): number | Promise<number> }
interface CallbackServices {
  hasClients?(): boolean
  expand(text: string, options: { conversationId: string; modelSnapshot: unknown; readOnly?: boolean }): string | Promise<string>
  worldbookScanLoop?(payload: Record<string, unknown>, conversationId: string): Record<string, unknown> | Promise<Record<string, unknown>>
  worldbookMatchEntries?(payload: Record<string, unknown>, conversationId: string): Record<string, unknown>[] | Promise<Record<string, unknown>[]>
  worldbookFormatEntries?(payload: Record<string, unknown>, conversationId: string): Record<string, unknown>[] | Promise<Record<string, unknown>[]>
  worldbookPrepareBooks?: NonNullable<WorldbookRoundServices['prepareBooks']>
  worldbookCompleteScan?: NonNullable<WorldbookRoundServices['completeScan']>
}
interface ProviderLookup { get(name: string): unknown }
interface ModelSelection { provider: string; model: string }
interface ModelServices { current(conversationId: string): Promise<ModelSelection> }
interface LlmServices { resolveModelInfo(provider: string, model: string): Promise<{ context?: { contextWindow?: number } }> }
export interface WorldbookHostRoundRequest {
  conversationId: string
  runtimePreparation: ConversationRuntimePreparation
  modelSnapshot: unknown
  messages?: string[]
  messageCount?: number
  currentPromptText: string
  contextWindow?: number
  dryRun?: boolean
  scanContext?: Record<string, unknown>
  examples?: string
}

/** Links common services without making a second Agent or depending on an Android bridge. */
export class CompatibilityWorldbookHost {
  readonly rounds: CompatibilityWorldbookRounds
  private readonly active = new Map<string, WorldbookAgentRound>()
  activate(sessionId: string, round: WorldbookAgentRound): void { this.active.set(sessionId, round) }
  current(sessionId: string): WorldbookAgentRound | undefined { return this.active.get(sessionId) }
  release(sessionId: string, conversationId?: string): void {
    this.active.delete(sessionId)
    if (conversationId) this.rounds.forget(conversationId)
  }
  dispose(): void { this.active.clear(); this.rounds.dispose() }
  readonly handlers: ReadonlyMap<string, CompatibilityHandler>
  constructor(private readonly data: ElecKoiProductDataStore, private readonly providers: ProviderLookup,
    private readonly catalog: CompatibilityCatalogOperations, private readonly messages: CompatibilityMessageOperations,
    publish: (change: CompatibilityChange) => void) {
    this.rounds = new CompatibilityWorldbookRounds(data, publish)
    this.handlers = new Map<string, CompatibilityHandler>([
      ['worldbooks.lastScan', p => this.rounds.lastScan(requiredId(p.conversationId))],
      ['worldbooks.scan', async p => {
        if (!Array.isArray(p.messages) || p.messages.some(item => typeof item !== 'string')) throw new TypeError('worldbooks.scan requires actual message text history')
        const conversationId = requiredId(p.conversationId)
        const modelSnapshot = p.modelSnapshot ?? await (this.providers.get('eleckoiConversationModelsApi') as ModelServices).current(conversationId)
        const model = modelSnapshot as unknown as ModelSelection
        const contextWindow = p.contextWindow ?? p.maxContext ?? (await (this.providers.get('llm') as LlmServices).resolveModelInfo(model.provider, model.model)).context?.contextWindow
        const dryRun = p.dryRun !== false
        const input: WorldbookRoundInput = { conversationId, messages: p.messages as string[], scanText: String(p.scanText ?? ''),
          contextWindow: requiredContextWindow(contextWindow), dryRun, consumeForcedOnDryRun: p.consumeForcedOnDryRun === true,
          ...(p.globalScanData && typeof p.globalScanData === 'object' && !Array.isArray(p.globalScanData) ? { scanContext: p.globalScanData } : {}),
          personaId: this.catalog.currentPersona({ conversationId }),
          ...(p.authorNote && typeof p.authorNote === 'object' && !Array.isArray(p.authorNote) ? { authorNote: p.authorNote } : {}),
          ...(typeof p.examples === 'string' ? { examples: p.examples } : {}) }
        const round = await this.rounds.prepare(input, this.services(conversationId, modelSnapshot, undefined, dryRun))
        return json({ ...round.scan, ...round, dryRun })
      }],
      ['worldbooks.timedEffect', p => this.rounds.timedEffect(p, { messageCount: async id => (await this.messages.read(id)).length })]
    ])
  }
  hasManagedBindings(conversationId: string): boolean {
    const note = this.data.compatibilityStore().get('authors-note', conversationId)
    if (note && typeof note === 'object' && !Array.isArray(note) && typeof note.content === 'string' && note.content.trim()) return true
    const details = this.data.readConversationDetails(conversationId)
    if (details.metadata.characterId) {
      const raw = this.catalog.raw(details.metadata.characterId), card = raw.data
      if (card && typeof card === 'object' && !Array.isArray(card) && typeof card.mes_example === 'string' && card.mes_example.trim()) return true
    }
    const captured = this.rounds.capture({ conversationId, personaId: this.catalog.currentPersona({ conversationId }), messages: [], contextWindow: 1 })
    return Object.values(captured.books).some(book => book.entries.length > 0)
  }
  async prepareRound(request: WorldbookHostRoundRequest) {
    const personaId = this.catalog.currentPersona({ conversationId: request.conversationId })
    const details = this.data.readConversationDetails(request.conversationId)
    const raw = details.metadata.characterId ? this.catalog.raw(details.metadata.characterId) : {}
    const card = raw.data && typeof raw.data === 'object' && !Array.isArray(raw.data) ? raw.data : {}
    const personaValue = await this.catalog.invoke({ method: 'personas.get', params: { conversationId: request.conversationId } })
    const persona = personaValue && typeof personaValue === 'object' && !Array.isArray(personaValue) ? personaValue : {}
    const note = this.data.compatibilityStore().get('authors-note', request.conversationId)
    const history = request.messages === undefined || request.messageCount === undefined ? await this.messages.read(request.conversationId) : []
    const model = request.modelSnapshot && typeof request.modelSnapshot === 'object' ? request.modelSnapshot as Record<string, unknown> : {}
    const services = this.services(request.conversationId, request.modelSnapshot, request.messageCount ?? history.length, request.dryRun ?? false)
    const frozenExample = request.runtimePreparation.conversationContext.settingLibrary?.entries
      .find(entry => entry.id === `compat-character:${request.runtimePreparation.conversationContext.characterId || details.metadata.characterId}:mes_example`)
    let examples = request.examples ?? frozenExample?.content ?? String(card.mes_example ?? '')
    // Native card entries already went through the round's ordered macro batch.
    // Re-reading the raw card would leak macros or repeat variable side effects.
    if (request.examples === undefined && !frozenExample && examples.includes('{{')) examples = await services.expand(examples)
    const messages = request.messages ?? history.filter(message => {
      const metadata = message.metadata && typeof message.metadata === 'object' && !Array.isArray(message.metadata) ? message.metadata : {}
      return metadata.is_hidden !== true
    }).map(message => String(message.content ?? ''))
    const input: WorldbookRoundInput = { conversationId: request.conversationId, personaId,
      messages, scanText: request.currentPromptText, contextWindow: requiredContextWindow(request.contextWindow ?? model.contextWindow),
      dryRun: request.dryRun ?? false, examples,
      scanContext: { characterName: String(card.name ?? details.metadata.characterName), characterDescription: String(card.description ?? ''),
        characterPersonality: String(card.personality ?? ''), scenario: String(card.scenario ?? ''), creatorNotes: String(card.creator_notes ?? ''),
        characterFilename: String(raw.avatar ?? ''), characterDepthPrompt: String(card.depth_prompt ?? ''),
        characterTagIds: Array.isArray(raw.tags) ? raw.tags : Array.isArray(card.tags) ? card.tags : [],
        personaDescription: String(persona.description ?? ''), userName: String(persona.name ?? ''), ...request.scanContext },
      ...(note && typeof note === 'object' && !Array.isArray(note) ? { authorNote: note } : {}) }
    return this.rounds.prepare(input, services)
  }
  nativeStaticLibrary(preparation: ConversationRuntimePreparation, round: Parameters<CompatibilityWorldbookRounds['nativeStaticLibrary']>[1]) {
    return this.rounds.nativeStaticLibrary(preparation, round)
  }
  private services(conversationId: string, modelSnapshot: unknown, capturedCount?: number, readOnly = false): WorldbookRoundServices {
    const generation = this.providers.get('eleckoiCompatibilityGeneration') as GenerationServices | undefined
    const callbacks = this.providers.get('eleckoiCompatibilityCallbacks') as CallbackServices | undefined
    const webCallbacks = callbacks?.hasClients?.() !== false
    const vectors = this.providers.get('eleckoiCompatibilityVectors') as { retrieve: WorldbookRoundServices['retrieveVectors'] } | undefined
    return {
      tokenCount: text => {
        if (!generation?.tokenCount) throw Object.assign(new Error('Worldbook request tokenizer service is not mounted'), { code: 'TOKENIZER_NOT_AVAILABLE' })
        return generation.tokenCount(text, { conversationId, modelSnapshot })
      },
      expand: text => {
        if (!text.includes('{{')) return text
        if (!callbacks?.expand) throw Object.assign(new Error('Worldbook macro callback runtime is not mounted'), { code: 'MACRO_RUNTIME_NOT_AVAILABLE' })
        return callbacks.expand(text, { conversationId, modelSnapshot, readOnly })
      },
      messageCount: async id => capturedCount ?? (await this.messages.read(id)).length,
      ...(vectors?.retrieve ? { retrieveVectors: request => vectors.retrieve!(request) } : {}),
      ...(webCallbacks && callbacks?.worldbookScanLoop ? { onScanLoop: payload => callbacks.worldbookScanLoop!(payload, conversationId) } : {}),
      ...(webCallbacks && callbacks?.worldbookMatchEntries ? { matchEntries: payload => callbacks.worldbookMatchEntries!(payload, conversationId) } : {}),
      ...(webCallbacks && callbacks?.worldbookFormatEntries ? { formatEntries: payload => callbacks.worldbookFormatEntries!(payload, conversationId) } : {}),
      ...(webCallbacks && callbacks?.worldbookPrepareBooks ? { prepareBooks: payload => callbacks.worldbookPrepareBooks!(payload) } : {}),
      ...(webCallbacks && callbacks?.worldbookCompleteScan ? { completeScan: payload => callbacks.worldbookCompleteScan!(payload) } : {})
    }
  }
}
function requiredId(value: unknown): string { if (typeof value !== 'string' || !value) throw new TypeError('conversationId is required'); return value }
function requiredContextWindow(value: unknown): number { if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new TypeError('Actual model contextWindow is required'); return value }
function json(value: unknown): CompatibilityValue { return JSON.parse(JSON.stringify(value)) as CompatibilityValue }
