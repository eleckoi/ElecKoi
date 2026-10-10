import { createHash, randomUUID } from 'node:crypto'
import { normalizeWorldbook, type Document } from '@eleckoi/dsh-worldbook-compat'
import type { CompatibilityCommand, CompatibilityChange, CompatibilityValue, ElecKoiProductDataStore } from './types.js'
import { object, requiredText, text, type CompatibilityHandler } from './compatibility-catalog.js'

type ObjectValue = { [key: string]: CompatibilityValue }
export const COMPATIBILITY_DATABANK_METHODS = ['databank.settings', 'databank.list', 'databank.get', 'databank.put',
  'databank.delete', 'databank.setEnabled', 'databank.ingest', 'databank.purge', 'databank.search', 'databank.embed'] as const
const DEFAULTS: ObjectValue = { enabled: false, chunkSize: 1200, overlap: 120, threshold: .25, count: 5, query: 2 }

export interface CompatibilityDataBankServices {
  fetch?: typeof globalThis.fetch
}
export interface DataBankBudgetServices {
  /** The selected model's real tokenizer; the service must retain token identity for decode. */
  tokens(text: string): readonly number[] | Promise<readonly number[]>
  decode(tokens: readonly number[]): string | Promise<string>
}
/** Shared document/vector domain: existing product SQLite; native Node network transport. */
export class CompatibilityDataBankOperations {
  readonly handlers: ReadonlyMap<string, CompatibilityHandler>
  private readonly request: typeof globalThis.fetch
  constructor(private readonly data: ElecKoiProductDataStore, services: CompatibilityDataBankServices = {},
    private readonly publish: (change: CompatibilityChange) => void = () => {}) {
    this.request = services.fetch ?? globalThis.fetch
    this.handlers = new Map(COMPATIBILITY_DATABANK_METHODS.map(method => [method, params => this.invoke({ method, params })]))
  }
  private get store() { return this.data.compatibilityStore() }
  settings(): ObjectValue { return { ...DEFAULTS, ...object(this.store.get('databank-settings', 'state')) } }
  configure(value: ObjectValue): ObjectValue {
    const config = { ...this.settings(), ...value }
    if (config.embedding === null) delete config.embedding
    chunkDocument('', integer(config.chunkSize), integer(config.overlap))
    positive(config.count, 'count'); positive(config.query, 'query'); threshold(config.threshold)
    if (config.tokenBudget !== undefined && (integer(config.tokenBudget) < 0)) throw new RangeError('tokenBudget must not be negative')
    if (typeof config.enabled !== 'boolean') throw new TypeError('enabled must be boolean')
    this.store.put('databank-settings', 'state', config)
    this.publish({ event: 'databank.changed', payload: { operation: 'settings' } })
    return config
  }
  private scopes(p: ObjectValue): Set<string> {
    const source = text(p.source) || 'all', chat = text(p.conversationId)
    let character = text(p.characterId)
    if (chat) { const details = this.data.readConversationDetails(chat); character ||= details.metadata.characterId }
    if (character && !this.data.readCharacters().items.some(item => item.id === character)) throw new Error(`Character does not exist: ${character}`)
    switch (source) {
      case 'all': return new Set(['global', ...chat ? [`chat:${chat}`] : [], ...character ? [`character:${character}`] : []])
      case 'global': return new Set(['global'])
      case 'chat': if (!chat) throw new Error('Chat documents require conversationId'); return new Set([`chat:${chat}`])
      case 'character': if (!character) throw new Error('Character documents require characterId'); return new Set([`character:${character}`])
      default: throw new Error(`Unknown databank source: ${source}`)
    }
  }
  list(p: ObjectValue): ObjectValue[] {
    const scopes = this.scopes(p)
    return Object.values(this.store.list('databank-documents')).map(object).filter(document => scopes.has(text(document.scope)))
  }
  get(p: ObjectValue): ObjectValue {
    const reference = text(p.id) || text(p.url) || text(p.name)
    if (!reference) throw new Error('Document lookup requires id, url or name')
    const matches = this.list(p).filter(document => [document.id, document.url, document.name].includes(reference))
    if (matches.length !== 1) throw new Error(matches.length ? `Ambiguous databank document: ${reference}` : `Databank document does not exist: ${reference}`)
    return matches[0]!
  }
  put(p: ObjectValue): ObjectValue {
    if (typeof p.text !== 'string') throw new TypeError('Document text must be a string')
    const previous = text(p.id) || text(p.url) ? this.get(p) : undefined
    const scope = text(previous?.scope) || [...this.scopes({ ...p, source: text(p.source) || 'chat' })].join('')
    if (!previous && (text(p.source) === 'all')) throw new Error('A document must have one source')
    const id = text(previous?.id) || randomUUID(), enabled = p.enabled ?? previous?.enabled ?? true
    if (typeof enabled !== 'boolean') throw new TypeError('Document enabled must be boolean')
    const document: ObjectValue = { ...previous, id, url: `eleckoi://databank/${id}`, scope,
      name: text(p.name) || text(previous?.name) || `${id}.txt`, text: p.text, size: Buffer.byteLength(p.text, 'utf8'), enabled,
      updatedAt: Date.now(), revision: Number(previous?.revision ?? 0) + 1, metadata: p.metadata ?? previous?.metadata ?? {} }
    delete document.indexedRevision; delete document.indexedChunks; delete document.indexedPolicy
    this.store.atomic(() => { this.store.put('databank-documents', id, document); this.store.deleteScope(`databank-index:${id}`) })
    this.changed('put', [id]); return document
  }
  private changed(operation: string, ids: string[]): void { this.publish({ event: 'databank.changed', payload: { operation, ids } }) }
  private identity(config: ObjectValue): ObjectValue | null {
    if (config.embedding === undefined) return null
    const { apiKey: _apiKey, headers: _headers, ...provider } = object(config.embedding)
    return provider
  }
  private policy(config: ObjectValue): ObjectValue {
    return { provider: this.identity(config), chunkSize: config.chunkSize!, overlap: config.overlap! }
  }
  async embed(input: string[], config = this.settings(), signal?: AbortSignal): Promise<number[][]> {
    if (input.some(value => typeof value !== 'string')) throw new TypeError('Embedding input must be a string array')
    if (!input.length) return []
    const provider = object(config.embedding)
    const model = requiredText(provider, 'model'), url = requiredText(provider, 'url').replace(/\/+$/, '')
    const headers = new Headers({ 'Content-Type': 'application/json' })
    if (text(provider.apiKey)) headers.set('Authorization', `Bearer ${text(provider.apiKey)}`)
    for (const [key, value] of Object.entries(object(provider.headers))) headers.set(key, text(value))
    const response = await this.request(url.endsWith('/embeddings') ? url : `${url}/embeddings`, {
      method: 'POST', headers, body: JSON.stringify({ model, input }), ...(signal ? { signal } : {}) })
    const body = await response.text()
    if (!response.ok) throw new Error(`Embedding HTTP ${response.status}: ${body}`)
    const data = array(object(JSON.parse(body) as CompatibilityValue).data).map(object).sort((a, b) => Number(a.index) - Number(b.index))
    if (data.length !== input.length || data.some((row, index) => row.index !== index)) throw new Error('Embedding response has invalid indices or count')
    const vectors = data.map(row => vector(row.embedding))
    if (vectors.some(row => row.length !== vectors[0]!.length)) throw new Error('Embedding response dimensions disagree')
    return vectors
  }
  private documents(p: ObjectValue, enabledOnly: boolean): ObjectValue[] {
    const selected = text(p.id) || text(p.url) || text(p.name) ? [this.get(p)] : this.list(p)
    return enabledOnly ? selected.filter(document => document.enabled !== false) : selected
  }
  async ingest(p: ObjectValue, signal?: AbortSignal): Promise<ObjectValue[]> {
    const config = this.settings(), policy = this.policy(config), result: ObjectValue[] = []
    for (const document of this.documents(p, !(text(p.id) || text(p.url) || text(p.name)))) {
      signal?.throwIfAborted()
      const id = text(document.id), chunks = chunkDocument(text(document.text), integer(config.chunkSize), integer(config.overlap))
      if (document.indexedRevision === document.revision && stable(document.indexedPolicy) === stable(policy)) {
        result.push({ id, chunks: chunks.length, reused: true }); continue
      }
      const vectors = await this.embed(chunks.map(chunk => chunk.text), config, signal)
      signal?.throwIfAborted()
      this.store.atomic(() => {
        if (stable(this.store.get('databank-documents', id)) !== stable(document)) throw new Error(`Document changed while indexing: ${text(document.name)}`)
        this.store.deleteScope(`databank-index:${id}`)
        chunks.forEach((chunk, index) => this.store.put(`databank-index:${id}`, String(index), { ...chunk, vector: vectors[index]!, provider: policy.provider! }))
        this.store.put('databank-documents', id, { ...document, indexedRevision: document.revision!, indexedChunks: chunks.length, indexedPolicy: policy })
      })
      result.push({ id, chunks: chunks.length })
    }
    this.changed('ingest', result.map(row => text(row.id))); return result
  }
  purge(p: ObjectValue): number {
    const docs = this.documents(p, false)
    const count = this.store.atomic(() => docs.reduce((sum, document) => {
      const id = text(document.id), { indexedRevision: _revision, indexedChunks: _chunks, indexedPolicy: _policy, ...remaining } = document
      const removed = this.store.deleteScope(`databank-index:${id}`)
      this.store.put('databank-documents', id, remaining); return sum + removed
    }, 0))
    this.changed('purge', docs.map(document => text(document.id))); return count
  }
  async search(p: ObjectValue, signal?: AbortSignal): Promise<ObjectValue[]> {
    const config = this.settings(), query = requiredText(p, 'query'), minimum = threshold(p.threshold ?? config.threshold)
    const count = positive(p.count ?? config.count, 'count'), policy = this.policy(config)
    const docs = this.documents(p, true)
    const indexed = docs.flatMap(document => Object.values(this.store.list(`databank-index:${text(document.id)}`)).map(raw => {
      if (document.indexedRevision !== document.revision || stable(document.indexedPolicy) !== stable(policy)) throw new Error(`Databank index is stale; re-index ${text(document.name)}`)
      return { document, chunk: object(raw) }
    }))
    if (!indexed.length) return []
    const queryVector = (await this.embed([query], config, signal))[0]!
    return indexed.map(({ document, chunk }) => {
      const { vector: values, provider: _provider, ...fields } = chunk
      return { ...fields, documentId: document.id!, url: document.url!, name: document.name!, score: vectorSimilarity(queryVector, vector(values)) } as ObjectValue & { score: number }
    }).filter(row => row.score >= minimum).sort((a, b) => b.score - a.score || text(a.documentId).localeCompare(text(b.documentId)) || Number(a.index) - Number(b.index)).slice(0, count)
  }
  /** Reused by vector-triggered worldbooks and old-chat retrieval. */
  async searchTexts(entries: ReadonlyMap<string, string> | Record<string, string>, query: string, minimum?: number, signal?: AbortSignal): Promise<ObjectValue[]> {
    const records = entries instanceof Map ? [...entries] : Object.entries(entries)
    if (!records.length || !query.trim()) return []
    const config = this.settings(), identity = this.identity(config)
    if (!identity) throw new Error('Vector retrieval requires a configured embedding provider')
    const key = (content: string) => createHash('sha256').update(`${stable(identity)}\n${content}`).digest('hex')
    const missing = [...new Set(records.map(([, content]) => content))].filter(content => this.store.get('worldbook-vector-cache', key(content)) === null)
    const vectors = await this.embed(missing, config, signal)
    signal?.throwIfAborted()
    this.store.atomic(() => missing.forEach((content, index) => this.store.put('worldbook-vector-cache', key(content), vectors[index]!)))
    const queryVector = (await this.embed([query], config, signal))[0]!, limit = threshold(minimum ?? config.threshold)
    return records.map(([id, content]) => ({ id, text: content, score: vectorSimilarity(queryVector, vector(this.store.get('worldbook-vector-cache', key(content)))) }))
      .filter(row => row.score >= limit).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
  }
  async retrieveWorldbookVectors(request: { conversationId: string; books: Record<string, Document>; messages: string[]; scanText: string }, signal?: AbortSignal): Promise<{ matches: Document[]; maximumPerBook: number }> {
    this.data.readConversationDetails(request.conversationId)
    const settings = object(object(this.store.get('settings', '__tavern_shared')).vectors)
    const maximumPerBook = integer(settings.max_entries ?? 5), queryCount = integer(settings.query ?? 2)
    if (maximumPerBook < 0 || queryCount < 0) throw new RangeError('Vector query/max_entries must be nonnegative')
    if (settings.enabled_world_info !== true || maximumPerBook === 0 || queryCount === 0) return { matches: [], maximumPerBook }
    const entries = Object.fromEntries(Object.entries(request.books).flatMap(([name, book]) => normalizeWorldbook(book).entries
      .filter((entry: Document) => entry.enabled !== false && text(entry.content) && (entry.strategy.type === 'vectorized' || settings.enabled_for_all === true))
      .map((entry: Document) => [`${name}:${entry.uid}`, text(entry.content)])))
    const query = [...request.messages, request.scanText].filter(content => content.trim()).slice(-queryCount).join('\n')
    const matches = await this.searchTexts(entries, query, settings.score_threshold === undefined ? undefined : threshold(settings.score_threshold), signal)
    return { matches, maximumPerBook }
  }
  /** Call once at round start, then freeze these rows with the model request. */
  async recall(p: ObjectValue, history: string[], inputs: string[], budgetServices?: DataBankBudgetServices, signal?: AbortSignal): Promise<ObjectValue[]> {
    const config = this.settings()
    if (config.enabled !== true || !this.documents(p, true).length) return []
    const query = [...history, ...inputs].filter(value => value.trim()).slice(-positive(config.query, 'query')).join('\n')
    if (!query) return []
    await this.ingest(p, signal)
    const matches = await this.search({ ...p, query }, signal)
    if (config.tokenBudget === undefined) return matches
    if (!budgetServices) throw new Error('Databank tokenBudget requires the selected model tokenizer and decoder')
    let remaining = integer(config.tokenBudget)
    const recalled: ObjectValue[] = []
    for (const match of matches) {
      if (remaining === 0) break
      const heading = `[${text(match.name)}]\n`, content = text(match.text), full = await budgetServices.tokens(heading + content)
      if (full.length <= remaining) { recalled.push(match); remaining -= full.length; continue }
      const headingCount = (await budgetServices.tokens(heading)).length
      if (remaining <= headingCount) break
      let tokens = (await budgetServices.tokens(content)).slice(0, remaining - headingCount), truncated = await budgetServices.decode(tokens)
      while (tokens.length && (truncated.endsWith('\uFFFD') || (await budgetServices.tokens(heading + truncated)).length > remaining)) {
        tokens = tokens.slice(0, -1); truncated = await budgetServices.decode(tokens)
      }
      if (truncated) recalled.push({ ...match, text: truncated, truncated: true })
      break
    }
    return recalled
  }
  async invoke({ method, params: p }: CompatibilityCommand): Promise<CompatibilityValue> {
    switch (method) {
      case 'databank.settings': return p.value === undefined ? this.settings() : this.configure(object(p.value))
      case 'databank.list': return this.list(p)
      case 'databank.get': return this.get(p)
      case 'databank.put': return this.put(p)
      case 'databank.setEnabled': {
        const document = this.get(p)
        if (typeof p.enabled !== 'boolean') throw new TypeError('Document enabled must be boolean')
        const value = { ...document, enabled: p.enabled }; this.store.put('databank-documents', text(document.id), value)
        this.changed('enable', [text(document.id)]); return value
      }
      case 'databank.delete': {
        const document = this.get(p), id = text(document.id)
        const removed = this.store.atomic(() => { this.store.deleteScope(`databank-index:${id}`); return this.store.delete('databank-documents', id) > 0 })
        this.changed('delete', [id]); return removed
      }
      case 'databank.ingest': return this.ingest(p)
      case 'databank.purge': return this.purge(p)
      case 'databank.search': return this.search(p)
      case 'databank.embed': return this.embed(array(p.input).map(value => { if (typeof value !== 'string') throw new TypeError('Embedding input must be a string array'); return value }))
      default: throw new Error(`Unknown databank compatibility method: ${method}`)
    }
  }
}

export function chunkDocument(content: string, size = 1200, overlap = 120): Array<{ index: number; start: number; end: number; text: string }> {
  if (!Number.isSafeInteger(size) || !Number.isSafeInteger(overlap) || size <= 0 || overlap < 0 || overlap >= size) throw new RangeError('chunkSize must be positive and overlap smaller than chunkSize')
  const result: Array<{ index: number; start: number; end: number; text: string }> = []
  let start = 0
  while (start < content.length) {
    let end = Math.min(start + size, content.length)
    if (end < content.length && highSurrogate(content.charCodeAt(end - 1))) end--
    if (end <= start) end = Math.min(start + 2, content.length)
    const value = content.slice(start, end)
    if (value.trim()) result.push({ index: result.length, start, end, text: value })
    if (end === content.length) break
    const next = Math.max(start + 1, end - overlap)
    start = lowSurrogate(content.charCodeAt(next)) ? next + 1 : next
  }
  return result
}
export function vectorSimilarity(a: readonly number[], b: readonly number[]): number {
  if (!a.length || a.length !== b.length || [...a, ...b].some(value => !Number.isFinite(value))) throw new Error(`Invalid vector dimensions or values: ${a.length}/${b.length}`)
  const scaleA = a.reduce((max, value) => Math.max(max, Math.abs(value)), 0), scaleB = b.reduce((max, value) => Math.max(max, Math.abs(value)), 0)
  if (!scaleA || !scaleB) return 0
  let dot = 0, lengthA = 0, lengthB = 0
  a.forEach((value, index) => { const x = value / scaleA, y = b[index]! / scaleB; dot += x * y; lengthA += x * x; lengthB += y * y })
  return Math.max(-1, Math.min(1, dot / Math.sqrt(lengthA * lengthB)))
}
function stable(value: CompatibilityValue | undefined): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`
  return JSON.stringify(value) ?? 'undefined'
}
function array(value: CompatibilityValue | undefined): CompatibilityValue[] { if (!Array.isArray(value)) throw new TypeError('Expected an array'); return value }
function vector(value: CompatibilityValue | undefined): number[] {
  const values = array(value)
  if (!values.length || values.some(number => typeof number !== 'number' || !Number.isFinite(number))) throw new Error('Embedding vector must contain finite numbers')
  return values as number[]
}
function integer(value: CompatibilityValue | undefined): number { if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new TypeError('Expected an integer'); return value }
function positive(value: CompatibilityValue | undefined, name: string): number { const number = integer(value); if (number <= 0) throw new RangeError(`${name} must be positive`); return number }
function threshold(value: CompatibilityValue | undefined): number { if (typeof value !== 'number' || !Number.isFinite(value) || value < -1 || value > 1) throw new RangeError('threshold must be between -1 and 1'); return value }
function highSurrogate(code: number): boolean { return code >= 0xD800 && code <= 0xDBFF }
function lowSurrogate(code: number): boolean { return code >= 0xDC00 && code <= 0xDFFF }
