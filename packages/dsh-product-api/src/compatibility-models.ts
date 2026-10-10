import { randomUUID } from 'node:crypto'
import type { CompatibilityValue, CompatibilityChange } from './types.js'
import { object, text, type CompatibilityHandler } from './compatibility-catalog.js'

type Document = { [key: string]: CompatibilityValue }
const protocols: Record<string, string> = { responses: 'openai-responses', chat_completions: 'openai-completions',
  anthropic_messages: 'anthropic-messages', google_gemini: 'google-generative-ai',
  OpenAiResponses: 'openai-responses', OpenAiChatCompletions: 'openai-completions',
  AnthropicMessages: 'anthropic-messages', GoogleGemini: 'google-generative-ai' }
const formats = Object.fromEntries(Object.entries(protocols).slice(0, 4).map(([format, api]) => [api, format]))
const json = (value: unknown): CompatibilityValue => JSON.parse(JSON.stringify(value)) as CompatibilityValue
export const COMPATIBILITY_MODEL_METHODS = ['models.list', 'models.put', 'models.delete', 'models.refresh',
  'secrets.read', 'secrets.write', 'secrets.rename', 'secrets.delete'] as const
export interface CompatibilityModelServices {
  describe(): Array<{ ns: string; value: unknown; revision: number }>
  mutate(ns: string, ops: Array<{ op: 'set'; path: string[]; value: unknown } | { op: 'unset'; path: string[] }>, revision: number): Promise<void>
  readSecret(ref: string): Promise<string>
  writeSecret(ref: string, value: string | null): Promise<void>
  discover(config: Document): Promise<CompatibilityValue[]>
}

/** The same DSH settings/credential/provider records used by the native product model page. */
export class CompatibilityModelOperations {
  readonly handlers: ReadonlyMap<string, CompatibilityHandler>
  constructor(private readonly services: CompatibilityModelServices, private readonly publish: (change: CompatibilityChange) => void) {
    this.handlers = new Map(COMPATIBILITY_MODEL_METHODS.map(method => [method, p => this.invoke(method, p)]))
  }
  private descriptor(ns: string) {
    const found = this.services.describe().find(row => row.ns === ns)
    if (!found) throw new Error(`Model settings namespace is not mounted: ${ns}`)
    return found
  }
  private async change(ns: string, ops: Parameters<CompatibilityModelServices['mutate']>[1]) {
    await this.services.mutate(ns, ops, this.descriptor(ns).revision)
  }
  list(): Document[] {
    const descriptors = this.services.describe(), section = (ns: string) => object(json(descriptors.find(row => row.ns === ns)?.value ?? {}))
    const entries = object(section('eleckoi-client-models').entries), profiles = object(section('llm-pi-ai').providers)
    const dedicated = section('llm-deepseek'), ids = new Set([...Object.keys(profiles), ...Object.keys(entries), ...Object.keys(dedicated).length ? ['deepseek-official'] : []])
    return [...ids].map(id => {
      const extra = object(entries[id]), profile = id === 'deepseek-official' ? dedicated : object(profiles[id])
      const key = text(extra.credentialRef) || text(profile.apiKeyEnv) || (id === 'deepseek-official' ? 'DEEPSEEK_API_KEY' : `${id.toUpperCase().replace(/[^A-Z0-9_]/g, '_')}_API_KEY`)
      return { ...extra, id, name: text(extra.name) || text(profile.displayName) || id, provider: text(extra.provider) || (id === 'deepseek-official' ? 'deepseek' : 'custom'),
        model: extra.model ?? (Array.isArray(profile.models) ? object(profile.models[0]).id : '') ?? '',
        baseUrl: profile.baseURL ?? extra.base_url ?? '', proxyUrl: extra.proxy_url ?? '',
        apiFormat: id === 'deepseek-official' ? 'deepseek_messages' : formats[text(profile.api)] ?? extra.api_format ?? 'chat_completions',
        customHeaders: profile.headers ?? extra.custom_headers ?? {}, credentialRef: key, models: profile.models ?? extra.model_options ?? [] }
    })
  }
  private get(id: string): Document {
    const value = this.list().find(item => item.id === id)
    if (!value) throw new Error(`Model configuration does not exist: ${id}`)
    return value
  }
  async put(value: Document): Promise<Document> {
    const id = text(value.id) || `model-${randomUUID()}`, previous = this.list().find(item => item.id === id) ?? {}
    const field = (canonical: string, alias?: string) => value[canonical] ?? (alias ? value[alias] : undefined) ?? previous[canonical]
    const name = text(field('name')) || id, format = text(field('apiFormat', 'api_format')) || 'chat_completions'
    const ref = text(previous.credentialRef) || `${id.toUpperCase().replace(/[^A-Z0-9_]/g, '_')}_API_KEY`
    const options = field('models', 'model_options') ?? [], model = text(field('model'))
    const models = (Array.isArray(options) ? options : []).map(item => {
      const option = object(item)
      return { ...option, id: text(option.id), name: text(option.name) || text(option.id),
        ...(option.contextWindowTokens !== undefined ? { contextWindow: option.contextWindowTokens } : {}),
        ...(option.maxOutputTokens !== undefined ? { maxTokens: option.maxOutputTokens } : {}) }
    })
    if (model && !models.some(item => item.id === model)) models.push({ id: model, name: model })
    const namespace = format === 'deepseek_messages' ? 'llm-deepseek' : 'llm-pi-ai'
    if (namespace === 'llm-deepseek' && id !== 'deepseek-official') throw new Error('The dedicated DeepSeek adapter uses the deepseek-official connection')
    const baseURL = text(field('baseUrl', 'base_url')), headers = object(field('customHeaders', 'custom_headers'))
    if (namespace === 'llm-deepseek') {
      await this.change(namespace, [{ op: 'set', path: ['baseURL'], value: baseURL }, { op: 'set', path: ['models'], value: models }])
    } else {
      const api = protocols[format]
      if (!api) throw new Error(`The DSH provider cannot execute this API format: ${format}`)
      const row = object(object(json(this.descriptor(namespace).value)).providers), old = object(row[id])
      await this.change(namespace, [{ op: 'set', path: ['providers', id], value: { ...old, api, apiKeyEnv: ref, displayName: name, baseURL, models, headers } }])
    }
    const metadata: Document = { ...object(object(object(json(this.descriptor('eleckoi-client-models').value)).entries)[id]),
      ...value, name, provider: field('provider') ?? 'custom', model, credentialRef: ref,
      proxy_url: field('proxyUrl', 'proxy_url') ?? '', compatibility_api_format: format }
    delete metadata.apiKey; delete metadata.api_key
    await this.change('eleckoi-client-models', [{ op: 'set', path: ['entries', id], value: metadata }])
    const suppliedSecret = value.apiKey ?? value.api_key
    if (suppliedSecret !== undefined) await this.services.writeSecret(ref, text(suppliedSecret) || null)
    else if (value.credentialConfigId) await this.services.writeSecret(ref, await this.services.readSecret(text(this.get(text(value.credentialConfigId)).credentialRef)))
    this.publish({ event: 'models.changed', payload: { id, operation: 'saved' } })
    return this.get(id)
  }
  async invoke(method: string, p: Document): Promise<CompatibilityValue> {
    switch (method) {
      case 'models.list': {
        return Promise.all(this.list().map(async item => ({ ...item, hasKey: !!await this.services.readSecret(text(item.credentialRef)) })))
      }
      case 'models.put': return this.put(object(p.config))
      case 'models.refresh': {
        const current = this.get(text(p.id)), models = await this.services.discover(current)
        return this.put({ ...current, models })
      }
      case 'models.delete': {
        const id = text(p.id), item = this.list().find(item => item.id === id)
        if (!item) return false
        if (id === 'deepseek-official') await this.change('llm-deepseek', [{ op: 'unset', path: ['baseURL'] }, { op: 'unset', path: ['models'] }])
        else await this.change('llm-pi-ai', [{ op: 'unset', path: ['providers', id] }])
        await this.change('eleckoi-client-models', [{ op: 'unset', path: ['entries', id] }])
        if (!this.list().some(other => other.credentialRef === item.credentialRef)) await this.services.writeSecret(text(item.credentialRef), null)
        this.publish({ event: 'models.changed', payload: { id, operation: 'deleted' } }); return true
      }
      case 'secrets.read': return this.services.readSecret(text(this.get(text(p.id)).credentialRef))
      case 'secrets.write': {
        if (!text(p.value) && p.allowEmpty !== true) throw new Error('Secret must not be empty')
        const original = this.get(text(p.baseId)), next = await this.put({ ...original, id: '', name: p.label ?? original.name ?? '', apiKey: p.value ?? '' })
        return next.id!
      }
      case 'secrets.rename': {
        if (!text(p.label)) throw new Error('Secret label must not be empty')
        await this.put({ ...this.get(text(p.id)), name: p.label! }); return p.id!
      }
      case 'secrets.delete': await this.services.writeSecret(text(this.get(text(p.id)).credentialRef), null); return p.id!
      default: throw new Error(`Unknown model method: ${method}`)
    }
  }
}
