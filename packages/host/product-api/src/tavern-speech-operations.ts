import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-settings'
import { randomUUID } from 'node:crypto'
import { readModelApiKey } from './modelConnection.js'

type Value = Record<string, unknown>
type SpeechSettings = { provider: string; configId: string; model: string; voice: string; speed: number; responseFormat: string; instructions: string }
const object = (value: unknown): Value => value && typeof value === 'object' && !Array.isArray(value) ? value as Value : {}
const text = (value: unknown, fallback = ''): string => typeof value === 'string' ? value : fallback
const namespace = 'eleckoi-product-api'
const defaults: SpeechSettings = { provider: 'system', configId: '', model: 'gpt-4o-mini-tts', voice: '', speed: 1, responseFormat: 'mp3', instructions: '' }
const formats: Record<string, string> = { mp3: 'audio/mpeg', opus: 'audio/ogg', aac: 'audio/aac', flac: 'audio/flac', wav: 'audio/wav', pcm: 'audio/pcm' }
const methods = new Set(['tts.settings', 'tts.configure', 'tts.synthesize', 'tts.cancel'])

/** Optional speech provider over the product's saved connections and credential service. */
export class NativeTavernSpeechOperations {
  private readonly lifetime = new AbortController()
  private readonly jobs = new Map<string, { conversationId: string; controller: AbortController }>()
  private tail: Promise<unknown> = Promise.resolve()
  constructor(private readonly owner: Context) {
    owner.effect(() => () => {
      this.lifetime.abort(new Error('ElecKoi Host 已卸载。'))
      for (const job of this.jobs.values()) job.controller.abort(this.lifetime.signal.reason)
      this.jobs.clear()
    })
  }
  has(method: string): boolean { return methods.has(method) }
  concurrent(method: string): boolean { return method === 'tts.synthesize' || method === 'tts.cancel' }
  private settings(patch: Value = {}): SpeechSettings {
    const descriptor = this.owner.settings.describe().find(row => row.ns === namespace)
    if (!descriptor) throw new Error('原生兼容配置尚未注册。')
    const settings = { ...defaults, ...object(object(descriptor.value).tts), ...patch } as SpeechSettings
    for (const key of ['provider', 'configId', 'model', 'voice', 'instructions'] as const) if (typeof settings[key] !== 'string') throw new TypeError(`语音 ${key} 需要文本。`)
    if (!settings.provider.trim()) throw new TypeError('语音需要 provider。')
    if (!Number.isFinite(settings.speed) || settings.speed < 0.25 || settings.speed > 4) throw new TypeError('OpenAI 语音速度需要在 0.25 到 4 之间。')
    if (!Object.hasOwn(formats, settings.responseFormat)) throw new TypeError(`未知语音格式：${settings.responseFormat}`)
    return settings
  }
  private async synthesize(params: Value): Promise<Value> {
    const settings = this.settings({ ...object(params.settings), ...params }), input = text(params.text, text(params.input)), voice = settings.voice.trim() || 'alloy'
    if (!input.trim()) throw new TypeError('语音合成需要非空正文。')
    if (settings.provider !== 'openai') throw new Error('此接口负责 OpenAI 兼容语音；系统和插件 provider 在 Client 中执行。')
    if (!settings.configId.trim() || !settings.model.trim()) throw new Error('请先选择语音使用的原生模型配置及 TTS 模型。')
    const descriptors = this.owner.settings.describe(), catalog = object(descriptors.find(row => row.ns === 'eleckoi-client-models')?.value)
    const entry = object(object(catalog.entries)[settings.configId]), profiles = object(descriptors.find(row => row.ns === 'llm-pi-ai')?.value)
    const profile = object(object(profiles.providers)[settings.configId])
    if (!Object.keys(entry).length) throw new Error(`语音模型配置不存在：${settings.configId}`)
    if (text(entry.proxy_url).trim()) throw new Error('当前原生连接使用系统代理；请在系统代理中配置网络。')
    const base = text(entry.base_url, text(profile.baseURL)).trim()
    if (!base) throw new Error('语音模型配置没有 API 地址。')
    const endpoint = new URL(base)
    if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new TypeError('语音 API 地址不正确。')
    const pathname = endpoint.pathname.replace(/\/+$/, '')
    endpoint.pathname = pathname.endsWith('/audio/speech') ? pathname : `${pathname}/audio/speech`
    const headers = Object.fromEntries(Object.entries({ ...object(profile.headers), ...object(entry.custom_headers) }).map(([key, value]) => [key, String(value)]))
    const requestId = text(params.requestId, randomUUID()), conversationId = text(params.conversationId)
    if (this.jobs.has(requestId)) throw new Error(`语音请求编号正在使用：${requestId}`)
    const controller = new AbortController(), signal = AbortSignal.any([controller.signal, this.lifetime.signal, AbortSignal.timeout(180000)])
    this.jobs.set(requestId, { conversationId, controller })
    try {
      const key = await readModelApiKey(this.owner, settings.configId)
      signal.throwIfAborted()
      const response = await fetch(endpoint, { method: 'POST', redirect: 'error', signal,
        headers: { ...headers, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: settings.model, input, voice, speed: settings.speed, response_format: settings.responseFormat,
          ...(settings.instructions ? { instructions: settings.instructions } : {}) }) })
      if (!response.ok) {
        const detail = await response.text()
        throw new Error(`语音请求失败（HTTP ${response.status}）：${(key ? detail.replaceAll(key, '[已隐藏]') : detail).slice(0, 600)}`)
      }
      const data = Buffer.from(await response.arrayBuffer())
      if (!data.length) throw new Error('语音服务返回了空音频。')
      signal.throwIfAborted()
      const mediaType = (response.headers.get('content-type')?.split(';')[0]?.trim() || formats[settings.responseFormat]!)
      if (!mediaType.startsWith('audio/') && mediaType !== 'application/octet-stream') throw new Error(`语音服务返回的内容不是音频：${mediaType}`)
      // PCM is 24kHz mono signed 16-bit; a WAV envelope makes it playable by the same browser audio channel.
      let playable = data, playableType = mediaType === 'application/octet-stream' ? formats[settings.responseFormat]! : mediaType
      if (settings.responseFormat === 'pcm') {
        const header = Buffer.alloc(44)
        header.write('RIFF', 0); header.writeUInt32LE(data.length + 36, 4); header.write('WAVEfmt ', 8); header.writeUInt32LE(16, 16)
        header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(24000, 24); header.writeUInt32LE(48000, 28)
        header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(data.length, 40)
        playable = Buffer.concat([header, data]); playableType = 'audio/wav'
      }
      return { requestId, provider: 'openai', model: settings.model, voice, mediaType: playableType,
        url: `data:${playableType};base64,${playable.toString('base64')}` }
    } finally { this.jobs.delete(requestId) }
  }
  async invoke(method: string, params: Value): Promise<unknown> {
    if (method === 'tts.settings') return this.settings()
    if (method === 'tts.configure') {
      const action = async () => {
        const patch = object(params.settings ?? params.patch ?? params), previous = this.settings(), accepted: Value = {}
        for (const key of Object.keys(defaults)) if (patch[key] !== undefined) accepted[key] = patch[key]
        const settings = this.settings({ ...previous, ...accepted })
        await this.owner.settings.mutate(namespace, [{ op: 'set', path: ['tts'], value: settings }])
        return settings
      }
      const promise = this.tail.then(action, action); this.tail = promise.catch(() => {}); return promise
    }
    if (method === 'tts.synthesize') return this.synthesize(params)
    if (method === 'tts.cancel') {
      const requestId = text(params.requestId), conversationId = text(params.conversationId)
      let cancelled = 0
      for (const [id, job] of this.jobs) {
        if (requestId ? id !== requestId : conversationId && job.conversationId !== conversationId) continue
        job.controller.abort(new Error('语音合成已取消。')); cancelled++
      }
      return { cancelled }
    }
    throw new Error(`未知语音操作：${method}`)
  }
}
