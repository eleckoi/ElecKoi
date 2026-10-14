import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-settings'
import type { DataBankRepository, DataBankDocument } from '@eleckoi/dsh-product-data'
import { createHash, randomUUID } from 'node:crypto'
import { readModelApiKey } from './modelConnection.js'

type Value = Record<string, unknown>
type Settings = { enabled: boolean; threshold: number; count: number; chunkSize: number; overlap: number; configId: string; model: string; dimensions?: number
  query: number; template: string; depth: number; role: 'system' | 'user' | 'assistant'; position: 'in_chat' | 'in_prompt' | 'before_prompt' | 'none'; order: number }
export type DataBankPromptContribution = { id: string; content: string; role: Settings['role']; anchor: 'chat_depth' | 'insert_point_2' | 'instructions'; depth?: number; order: number; title: string; source: string }
type Connection = { configId: string; model: string; endpoint: URL; headers: Record<string, string>; key: string; modelKey: string; dimensions?: number }
const object = (value: unknown): Value => value && typeof value === 'object' && !Array.isArray(value) ? value as Value : {}
const text = (value: unknown, fallback = ''): string => typeof value === 'string' ? value : fallback
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : []
const namespace = 'eleckoi-product-api'
const defaults: Settings = { enabled: true, threshold: 0.25, count: 3, chunkSize: 1000, overlap: 100, configId: '', model: '',
  query: 2, template: 'Related information:\n{{text}}', depth: 4, role: 'system', position: 'in_chat', order: 0 }
const methods = new Set(['databank.list', 'databank.get', 'databank.read', 'databank.put', 'databank.delete', 'databank.setEnabled',
  'databank.importFile', 'databank.settings', 'databank.configure', 'databank.ingest', 'databank.purge', 'databank.search', 'databank.embed', 'databank.matchRecords', 'databank.cancel'])

export function dataBankChunks(value: string, size: number, overlap: number): Array<{ index: number; offset: number; text: string }> {
  const chunks: Array<{ index: number; offset: number; text: string }> = []
  let start = 0
  while (start < value.length) {
    let end = Math.min(start + size, value.length)
    if (end < value.length) {
      const natural = Math.max(value.lastIndexOf('\n\n', end), value.lastIndexOf('\n', end), value.lastIndexOf(' ', end))
      if (natural > start + size / 2) end = natural
      if (end > start && /[\uD800-\uDBFF]/.test(value[end - 1]!)) end--
    }
    const content = value.slice(start, end)
    if (content.trim()) chunks.push({ index: chunks.length, offset: start, text: content })
    if (end === value.length) break
    start = Math.max(start + 1, end - overlap)
    if (/[\uDC00-\uDFFF]/.test(value[start]!)) start++
  }
  return chunks
}

export function dataBankCosine(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) throw new Error('Embedding 向量维度与现有索引不同，请重新建立索引。')
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) { dot += a[i]! * b[i]!; normA += a[i]! ** 2; normB += b[i]! ** 2 }
  return normA && normB ? dot / Math.sqrt(normA * normB) : 0
}

/** Actual document/vector operations over the native product repository and saved model connection. */
export class NativeTavernDataBankOperations {
  private readonly lifetime = new AbortController()
  private readonly jobs = new Map<string, { conversationId: string; controller: AbortController }>()
  private settingsTail: Promise<unknown> = Promise.resolve()
  constructor(private readonly owner: Context) {
    owner.effect(() => () => {
      this.lifetime.abort(new Error('ElecKoi Host 已卸载。'))
      for (const job of this.jobs.values()) job.controller.abort(this.lifetime.signal.reason)
      this.jobs.clear()
    })
  }
  has(method: string): boolean { return methods.has(method) }
  concurrent(method: string): boolean { return ['databank.ingest', 'databank.search', 'databank.embed', 'databank.matchRecords', 'databank.cancel'].includes(method) }
  private repository(): DataBankRepository { return this.owner.eleckoiProductData.dataBank() }
  private descriptor() {
    const descriptor = this.owner.settings.describe().find(row => row.ns === namespace)
    if (!descriptor) throw new Error('原生兼容配置尚未注册。')
    return descriptor
  }
  private options(params: Value, index = 0): Value {
    return { ...(text(params.conversationId) ? { conversationId: params.conversationId } : {}), ...object(Array.isArray(params.args) ? params.args[index] : params.options ?? params) }
  }
  private vectorSettings(vectors: Value, native: Settings): Value {
    const projected: Value = {}, fields: Record<string, string> = {
      enabled_files: 'enabled', query: 'query', score_threshold: 'threshold', chunk_count_db: 'count', chunk_size_db: 'chunkSize',
      file_template_db: 'template', file_depth_db: 'depth'
    }
    for (const [field, key] of Object.entries(fields)) if (vectors[field] !== undefined) projected[key] = vectors[field]
    if (vectors.overlap_percent_db !== undefined) projected.overlap = Math.round(Number(projected.chunkSize ?? native.chunkSize) * Number(vectors.overlap_percent_db) / 100)
    if (vectors.file_position_db !== undefined) projected.position = ({ '-1': 'none', '0': 'in_prompt', '1': 'in_chat', '2': 'before_prompt' } as Record<string, string>)[String(vectors.file_position_db)]
    if (vectors.file_depth_role_db !== undefined) projected.role = ({ '0': 'system', '1': 'user', '2': 'assistant' } as Record<string, string>)[String(vectors.file_depth_role_db)]
    return projected
  }
  private settings(value: Value = {}): Settings {
    const stored = object(this.descriptor().value), native = { ...defaults, ...object(stored.databank) } as Settings
    const vectors = object(object(object(stored.state).extensionSettings).vectors)
    const settings = { ...native, ...this.vectorSettings(vectors, native), ...value } as Settings
    if (!Number.isFinite(settings.threshold) || settings.threshold < -1 || settings.threshold > 1) throw new TypeError('检索阈值需要在 -1 到 1 之间。')
    if (!Number.isInteger(settings.count) || settings.count < 1) throw new TypeError('检索条数需要是正整数。')
    if (!Number.isInteger(settings.chunkSize) || settings.chunkSize < 1 || !Number.isInteger(settings.overlap) || settings.overlap < 0 || settings.overlap >= settings.chunkSize) throw new TypeError('分块大小需要是正整数，重叠大小需要非负且小于分块大小。')
    if (settings.dimensions !== undefined && (!Number.isInteger(settings.dimensions) || settings.dimensions < 1)) throw new TypeError('Embedding dimensions 需要是正整数。')
    if (typeof settings.enabled !== 'boolean' || typeof settings.template !== 'string') throw new TypeError('资料检索开关需要布尔值，模板需要文本。')
    if (!Number.isFinite(settings.query) || settings.query <= 0) throw new TypeError('资料检索 query 需要大于零。')
    if (!Number.isInteger(settings.depth) || settings.depth < 0 || !Number.isInteger(settings.order)) throw new TypeError('资料注入深度需要非负整数，顺序需要整数。')
    if (!['system', 'user', 'assistant'].includes(settings.role) || !['in_chat', 'in_prompt', 'before_prompt', 'none'].includes(settings.position)) throw new TypeError('资料注入角色或位置不正确。')
    return settings
  }
  private configure(patch: Value): Promise<Settings> {
    const action = async () => {
      const settings = this.settings(patch)
      const changes = [{ op: 'set' as const, path: ['databank'], value: settings as unknown }]
      const extensions = object(object(object(this.descriptor().value).state).extensionSettings)
      // The public object and native Slash settings update one effective configuration atomically.
      if (extensions.vectors !== undefined) {
        const fields: Record<string, string> = { enabled: 'enabled_files', query: 'query', threshold: 'score_threshold', count: 'chunk_count_db',
          chunkSize: 'chunk_size_db', template: 'file_template_db', depth: 'file_depth_db' }
        for (const [key, field] of Object.entries(fields)) if (patch[key] !== undefined) changes.push({ op: 'set',
          path: ['state', 'extensionSettings', 'vectors', field], value: (settings as unknown as Value)[key] })
        if (patch.position !== undefined) changes.push({ op: 'set', path: ['state', 'extensionSettings', 'vectors', 'file_position_db'],
          value: ({ none: -1, in_prompt: 0, in_chat: 1, before_prompt: 2 } as Record<string, number>)[settings.position] })
        if (patch.role !== undefined) changes.push({ op: 'set', path: ['state', 'extensionSettings', 'vectors', 'file_depth_role_db'],
          value: ({ system: 0, user: 1, assistant: 2 } as Record<string, number>)[settings.role] })
        if (patch.chunkSize !== undefined || patch.overlap !== undefined) changes.push({ op: 'set', path: ['state', 'extensionSettings', 'vectors', 'overlap_percent_db'],
          value: settings.overlap * 100 / settings.chunkSize })
      }
      await this.owner.settings.mutate(namespace, changes)
      return settings
    }
    const promise = this.settingsTail.then(action, action); this.settingsTail = promise.catch(() => {})
    return promise
  }
  private characterId(options: Value): string {
    if (text(options.characterId)) return text(options.characterId)
    const conversationId = text(options.conversationId)
    return conversationId ? text(this.owner.eleckoiProductData.readConversationDetails(conversationId, undefined, 1).metadata.characterId)
      : this.owner.eleckoiProductData.readCharacters().active_character_id
  }
  private scopes(options: Value): string[] {
    const source = text(options.source, text(options.scope)), conversationId = text(options.conversationId), characterId = this.characterId(options)
    if (!source || source === 'all') return ['global', ...(characterId ? [`character:${characterId}`] : []), ...(conversationId ? [`chat:${conversationId}`] : [])]
    if (source === 'global') return ['global']
    if (source === 'character') { if (!characterId) throw new Error('角色资料库需要明确角色。'); return [`character:${characterId}`] }
    if (source === 'chat') { if (!conversationId) throw new Error('会话资料库需要明确会话。'); return [`chat:${conversationId}`] }
    if (/^(character|chat):.+/.test(source)) return [source]
    throw new TypeError(`未知资料库作用域：${source}`)
  }
  private id(value: unknown): string {
    const id = text(value)
    if (id.startsWith('eleckoi-databank://document/')) return decodeURIComponent(id.slice('eleckoi-databank://document/'.length))
    if (!id) throw new TypeError('资料操作需要文档 id。')
    return id
  }
  private put(value: Value): DataBankDocument {
    for (const field of ['name', 'text']) if (value[field] !== undefined && typeof value[field] !== 'string') throw new TypeError(`资料文档 ${field} 需要文本。`)
    if (value.enabled !== undefined && typeof value.enabled !== 'boolean') throw new TypeError('资料文档 enabled 需要布尔值。')
    const previous = value.id ? this.repository().get(this.id(value.id)) : undefined
    const explicit = text(value.source, text(value.scope))
    const scopes = this.scopes({ ...value, source: explicit || previous?.scope || 'chat' })
    if (scopes.length !== 1) throw new TypeError('新增资料需要明确一个作用域。')
    return this.repository().put({ ...(previous ? { id: previous.id } : {}), scope: scopes[0]!,
      ...(value.name === undefined ? {} : { name: text(value.name) }), ...(value.text === undefined ? {} : { text: text(value.text) }),
      ...(value.enabled === undefined ? {} : { enabled: value.enabled === true }) })
  }
  private async connection(settings: Settings): Promise<Connection> {
    const configId = text(settings.configId)
    if (!configId) throw new Error('资料检索尚未选择 Embedding 模型配置，请先设置 configId 与 model。')
    const descriptors = this.owner.settings.describe(), catalog = object(descriptors.find(row => row.ns === 'eleckoi-client-models')?.value)
    const entry = object(object(catalog.entries)[configId]), profiles = object(descriptors.find(row => row.ns === 'llm-pi-ai')?.value)
    const profile = object(object(profiles.providers)[configId]), model = text(settings.model).trim() || text(entry.model).trim()
    if (!Object.keys(entry).length) throw new Error(`Embedding 模型配置不存在：${configId}`)
    if (!model) throw new Error('Embedding 配置需要明确模型名称。')
    if (text(entry.provider) === 'novelai_image') throw new Error('图片模型不能用于 Embedding。')
    if (text(entry.proxy_url).trim()) throw new Error('当前原生连接使用系统代理；请在系统代理中配置网络。')
    const base = text(entry.base_url, text(profile.baseURL)).trim()
    if (!base) throw new Error('Embedding 连接没有 API 地址。')
    const endpoint = new URL(base)
    if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new TypeError('Embedding API 地址不正确。')
    const pathname = endpoint.pathname.replace(/\/+$/, ''); endpoint.pathname = pathname.endsWith('/embeddings') ? pathname : `${pathname}/embeddings`
    const key = await readModelApiKey(this.owner, configId)
    const modelKey = createHash('sha256').update(JSON.stringify([configId, endpoint.href, model, settings.dimensions ?? null, settings.chunkSize, settings.overlap])).digest('hex')
    const headers = Object.fromEntries(Object.entries({ ...object(profile.headers), ...object(entry.custom_headers) }).map(([key, value]) => [key, String(value)]))
    return { configId, endpoint, model, key, modelKey, headers, ...(settings.dimensions === undefined ? {} : { dimensions: settings.dimensions }) }
  }
  private async embed(connection: Connection, inputs: string[], signal: AbortSignal): Promise<number[][]> {
    if (!inputs.length) return []
    signal.throwIfAborted()
    // Uses the Host's existing fetch/OS proxy environment and the native credential owned by this connection.
    const response = await fetch(connection.endpoint, { method: 'POST', redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(180000)]),
      headers: { ...connection.headers, Authorization: `Bearer ${connection.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: connection.model, input: inputs, encoding_format: 'float', ...(connection.dimensions === undefined ? {} : { dimensions: connection.dimensions }) }) })
    const body = await response.text()
    if (!response.ok) throw new Error(`Embedding 请求失败（HTTP ${response.status}）：${body.replaceAll(connection.key, '[已隐藏]').slice(0, 600)}`)
    let result: Value
    try { result = object(JSON.parse(body)) } catch { throw new Error('Embedding 返回的响应不是合法 JSON。') }
    const vectors: number[][] = [], indexes = new Set<number>()
    for (const item of array(result.data)) {
      const row = object(item), index = Number(row.index), vector = row.embedding
      if (!Number.isInteger(index) || index < 0 || index >= inputs.length || indexes.has(index) || !Array.isArray(vector) || !vector.length || vector.some(value => typeof value !== 'number' || !Number.isFinite(value))) throw new Error('Embedding 响应缺少正确的 index 或有限浮点向量。')
      indexes.add(index); vectors[index] = vector as number[]
    }
    if (indexes.size !== inputs.length || vectors.some(value => value.length !== vectors[0]!.length)) throw new Error('Embedding 没有返回每个输入的同维度向量。')
    signal.throwIfAborted(); return vectors
  }
  private async ingest(options: Value, settings: Settings, connection: Connection, signal: AbortSignal): Promise<Value> {
    const scopes = this.scopes(options), repository = this.repository(), documents = repository.list(scopes).filter(row => row.enabled)
    const cached = repository.chunks(scopes, connection.modelKey), indexed: string[] = []
    let chunkCount = 0, skipped = 0
    for (const summary of documents) {
      signal.throwIfAborted()
      if (options.force !== true && cached.some(chunk => chunk.documentId === summary.id && chunk.revision === summary.revision)) { skipped++; continue }
      const document = repository.get(summary.id, scopes), chunks = dataBankChunks(document.text!, settings.chunkSize, settings.overlap)
      const vectors = await this.embed(connection, chunks.map(chunk => chunk.text), signal)
      signal.throwIfAborted()
      chunkCount += repository.replaceChunks(document.id, document.revision, connection.modelKey, chunks.map((chunk, index) => ({ ...chunk, vector: vectors[index]! })))
      indexed.push(document.id)
    }
    return { indexed, skipped, chunks: chunkCount, model: connection.model, modelKey: connection.modelKey }
  }
  private async search(query: string, options: Value, signal: AbortSignal): Promise<Value[]> {
    if (!query.trim()) throw new TypeError('资料检索需要非空 query。')
    const settings = this.settings(options), connection = await this.connection(settings)
    if (options.ingest === true) await this.ingest(options, settings, connection, signal)
    const [vector] = await this.embed(connection, [query], signal), scopes = this.scopes(options), repository = this.repository()
    const documents = new Map(repository.list(scopes).filter(row => row.enabled).map(row => [row.id, row]))
    return repository.chunks(scopes, connection.modelKey).map(chunk => ({ chunk, score: dataBankCosine(vector!, chunk.vector) }))
      .filter(row => row.score >= settings.threshold).sort((a, b) => b.score - a.score || a.chunk.documentId.localeCompare(b.chunk.documentId) || a.chunk.index - b.chunk.index)
      .slice(0, settings.count).map(({ chunk, score }) => ({ ...documents.get(chunk.documentId), documentId: chunk.documentId, index: chunk.index,
        offset: chunk.offset, text: chunk.text, score, similarity: score, model: connection.model }))
  }
  private async run<T>(options: Value, action: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const id = text(options.requestId, text(options.generationId, randomUUID()))
    if (this.jobs.has(id)) throw new Error(`资料任务编号正在使用：${id}`)
    const controller = new AbortController(), signal = AbortSignal.any([controller.signal, this.lifetime.signal])
    this.jobs.set(id, { conversationId: text(options.conversationId), controller })
    try { return await action(signal) } finally { this.jobs.delete(id) }
  }

  async matchWorldbookEntries(conversationId: string, entries: Array<{ id: string; content: string }>, query: string, options: Value = {}, callerSignal?: AbortSignal): Promise<string[]> {
    if (!entries.length) return []
    if (!query.trim()) return []
    return this.run({ ...options, conversationId }, async ownSignal => {
      const signal = callerSignal ? AbortSignal.any([callerSignal, ownSignal]) : ownSignal
      const settings = this.settings(options), connection = await this.connection(settings), repository = this.repository()
      const prepared = entries.map(entry => ({ id: entry.id, hash: createHash('sha256').update(entry.content).digest('hex'),
        chunks: dataBankChunks(entry.content, settings.chunkSize, settings.overlap) }))
      const cached = repository.entryVectors(entries.map(entry => entry.id), connection.modelKey), vectors = new Map<string, number[][]>()
      const missing: typeof prepared = []
      for (const entry of prepared) {
        const found = cached.filter(row => row.entryId === entry.id && row.contentHash === entry.hash).sort((a, b) => a.index - b.index)
        if (found.length === entry.chunks.length) { vectors.set(entry.id, found.map(row => row.vector)); continue }
        missing.push(entry)
      }
      const generated = await this.embed(connection, missing.flatMap(entry => entry.chunks.map(chunk => chunk.text)), signal)
      let offset = 0
      for (const entry of missing) {
        const result = generated.slice(offset, offset + entry.chunks.length); offset += entry.chunks.length
        signal.throwIfAborted(); repository.replaceEntryVectors(entry.id, entry.hash, connection.modelKey, result); vectors.set(entry.id, result)
      }
      const [queryVector] = await this.embed(connection, [query], signal)
      return prepared.map(entry => ({ id: entry.id, score: Math.max(-1, ...(vectors.get(entry.id) ?? []).map(vector => dataBankCosine(queryVector!, vector))) }))
        .filter(entry => entry.score >= settings.threshold).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, settings.count).map(entry => entry.id)
    })
  }
  /** A native contribution shared by the main Agent turn and auxiliary generation. */
  async collectDataBankPrompt(conversationId: string, history: Array<{ role: string; content: string; hidden?: boolean; is_system?: boolean }>, callerSignal?: AbortSignal): Promise<DataBankPromptContribution | null> {
    const settings = this.settings(), options = { ...settings, conversationId }
    if (!settings.enabled || settings.position === 'none') return null
    if (!this.repository().list(this.scopes(options)).some(document => document.enabled)) return null
    const query = history.filter(item => !item.hidden && !item.is_system && ['user', 'assistant'].includes(item.role))
      .map(item => item.content.trim()).filter(Boolean).reverse().slice(0, settings.query).join('\n')
    if (!query) return null
    return this.run(options, async ownSignal => {
      const signal = callerSignal ? AbortSignal.any([callerSignal, ownSignal]) : ownSignal
      const matches = await this.search(query, { ...options, ingest: true }, signal)
      if (!matches.length) return null
      const documentOrder = new Map<string, number>()
      for (const match of matches) if (!documentOrder.has(text(match.documentId))) documentOrder.set(text(match.documentId), documentOrder.size)
      const ordered = [...matches].sort((a, b) => documentOrder.get(text(a.documentId))! - documentOrder.get(text(b.documentId))! || Number(a.index) - Number(b.index))
      const contents = [...new Set(ordered.map(match => text(match.text)).filter(Boolean))].join('\n\n')
      const content = settings.template.replace(/\{\{(text|query)\}\}/g, (_match, name: string) => name === 'text' ? contents : query)
      if (!content.trim()) return null
      return { id: 'databank', title: '资料检索', source: 'databank', content, role: settings.role,
        anchor: settings.position === 'in_chat' ? 'chat_depth' : settings.position === 'before_prompt' ? 'instructions' : 'insert_point_2',
        ...(settings.position === 'in_chat' ? { depth: settings.depth } : {}), order: settings.order }
    })
  }

  private cancel(options: Value): Value {
    const requestId = text(options.requestId, text(options.id)), conversationId = text(options.conversationId)
    let cancelled = 0
    for (const [id, job] of this.jobs) {
      if (requestId ? id !== requestId : conversationId && conversationId !== job.conversationId) continue
      job.controller.abort(new Error('资料检索任务已取消。')); cancelled++
    }
    return { cancelled, requestId }
  }
  async invoke(method: string, params: Value): Promise<unknown> {
    const args = Array.isArray(params.args) ? params.args : [], first = args[0]
    const options = this.options(params), repository = () => this.repository()
    if (method === 'databank.settings') return this.settings()
    if (method === 'databank.configure') return this.configure(options)
    if (method === 'databank.list') return repository().list(this.scopes(options))
    if (method === 'databank.put') return this.put(options)
    if (method === 'databank.get' || method === 'databank.read') {
      const document = repository().get(this.id(first ?? params.id ?? params.url), this.scopes(this.options(params, 1)))
      return method === 'databank.read' ? document.text! : document
    }
    if (method === 'databank.delete') return repository().delete(this.id(first ?? params.id), this.scopes(this.options(params, 1)))
    if (method === 'databank.setEnabled') {
      const enabled = args.length ? args[1] : params.enabled
      if (typeof enabled !== 'boolean') throw new TypeError('资料 enabled 需要布尔值。')
      return repository().setEnabled(this.id(first ?? params.id), enabled, this.scopes(this.options(params, 2)))
    }
    if (method === 'databank.importFile') {
      const file = object(first ?? params.file), target = this.options(params, 1)
      if (typeof file.text !== 'string') throw new Error('资料导入需要已解析的文本；此格式尚未提供原生解析器。')
      return this.put({ ...target, name: text(file.name, 'Imported document'), text: file.text })
    }
    if (method === 'databank.purge') return { deleted: repository().purge(this.scopes(options)) }
    if (method === 'databank.cancel') return this.cancel(options)
    if (method === 'databank.ingest') return this.run(options, async signal => { const settings = this.settings(options); return this.ingest(options, settings, await this.connection(settings), signal) })
    if (method === 'databank.search') {
      const query = text(first, text(params.query, text(params.text))), target = args.length ? this.options(params, 1) : options
      return this.run(target, signal => this.search(query, target, signal))
    }
    if (method === 'databank.embed') return this.run(options, async signal => {
      const settings = this.settings(options), connection = await this.connection(settings), value = options.texts ?? options.input
      const inputs = (typeof value === 'string' ? [value] : array(value)).map(value => text(value))
      if (!inputs.length || inputs.some(value => !value)) throw new TypeError('Embedding 输入需要非空文本。')
      return { vectors: await this.embed(connection, inputs, signal), model: connection.model, modelKey: connection.modelKey }
    })
    if (method === 'databank.matchRecords') return { ids: await this.matchWorldbookEntries(text(options.conversationId), array(options.records).map(value => {
      const record = object(value); return { id: text(record.id), content: text(record.content, text(record.text)) }
    }), text(options.query), options) }
    throw new Error(`未知资料检索操作：${method}`)
  }
}
