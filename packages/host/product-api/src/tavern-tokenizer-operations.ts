import { createTokenizerRegistry, remoteTokenizerRequest, type NativeTokenizerRegistry } from '@eleckoi/tavern-native/tokenizers'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const resourceRoot = dirname(require.resolve('@eleckoi/tavern-native/package.json'))
type Value = Record<string, unknown>
type TokenizerTransport = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal; requestId?: string; conversationId?: string; timeout?: number }) => Promise<Response>

/** The Host uses the same vocabulary and engine as synchronous browser scripts. */
export class NativeTavernTokenizers {
  constructor(private readonly transport: TokenizerTransport = (url, init) => { const { requestId: _requestId, conversationId: _conversationId, timeout: _timeout, ...request } = init; return fetch(url, request) }) {}
  private readonly registry: NativeTokenizerRegistry = createTokenizerRegistry((_name, descriptor) =>
    readFile(join(resourceRoot, 'src', 'tokenizer-models', descriptor.filename)))
  names(): readonly string[] { return this.registry.names }
  async prepare(model = '', encoding?: string | number): Promise<string> { return this.registry.prepare(model, encoding) }
  count(text: string, model = '', encoding?: string | number): number { return this.registry.forModel(model, encoding).count(text) }
  registryFor(encoding: string) { return this.registry.forModel('', encoding) }
  captureCounter(model = '', encoding?: string | number) { return this.registry.forModel(model, encoding) }
  async remote(method: string, params: Value): Promise<number | number[]> {
    const encoding = typeof params.encoding === 'string' ? params.encoding : typeof params.type === 'number' ? ({ 9: 'remote-textgenerationwebui', 10: 'remote-kobold' } as Record<number, string>)[params.type] : undefined
    if (encoding !== 'remote-textgenerationwebui' && encoding !== 'remote-kobold') throw new Error('未知远端 tokenizer。')
    const operation = method === 'tokens.count' ? 'count' : method === 'tokens.encode' ? 'encode' : 'decode'
    return remoteTokenizerRequest(encoding, { ...params, url: String(params.url ?? ''), operation: operation as 'count' | 'encode' | 'decode' }, (url, init) => this.transport(url, { ...init,
      ...(typeof params.requestId === 'string' ? { requestId: params.requestId } : {}),
      ...(typeof params.conversationId === 'string' ? { conversationId: params.conversationId } : {}),
      ...(typeof params.timeout === 'number' ? { timeout: params.timeout } : {}) }))
  }
  dispose(): void { this.registry.dispose() }
  async invoke(method: string, params: Value): Promise<string | number | number[]> {
    if (typeof params.encoding === 'string' && params.encoding.startsWith('remote-') || typeof params.type === 'number' && [9, 10].includes(params.type)) return this.remote(method, params)
    if (method === 'tokens.register') {
      if (typeof params.name !== 'string' || typeof params.base64 !== 'string' || !['json','sentencepiece'].includes(String(params.kind)))
        throw new TypeError('注册tokenizer需要name、kind与实际base64词表。')
      return this.registry.registerVocabulary(params.name, { kind: params.kind as 'json' | 'sentencepiece', data: Buffer.from(params.base64, 'base64'),
        ...(typeof params.source === 'string' ? { source: params.source } : {}),
        ...(typeof params.license === 'string' ? { license: params.license } : {}) })
    }
    if (method === 'tokens.unregister') return Number(this.registry.unregisterVocabulary(String(params.name)))
    if (typeof params.model !== 'string' && typeof params.encoding !== 'string' && typeof params.type !== 'number')
      throw new Error('token 编解码需要明确 model、encoding 或 ST type。')
    const model = typeof params.model === 'string' ? params.model : ''
    const requested = typeof params.encoding === 'string' ? params.encoding : typeof params.type === 'number' ? params.type : undefined
    await this.registry.prepare(model, requested)
    const codec = this.registry.forModel(model, requested)
    if (method === 'tokens.decode') {
      const ids = params.tokens ?? params.ids
      if (!Array.isArray(ids) || ids.some(value => typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0))
        throw new TypeError('token 解码输入必须是非负整数数组。')
      return codec.decode(ids)
    }
    if (typeof params.text !== 'string') throw new TypeError('token 编码输入必须是文本。')
    if (method === 'tokens.count' && codec.encoding === 'estimate') return codec.count(params.text)
    const special = (value: unknown): string[] | 'all' => value === 'all' ? 'all' : Array.isArray(value) ? value.map(String) : []
    const ids = codec.encode(params.text, undefined, special(params.allowedSpecial), special(params.disallowedSpecial))
    return method === 'tokens.count' ? ids.length : ids
  }
}
