import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import { SessionId } from '@deepseek-ai/dsh-session'
import { AUTO_ILLUSTRATION_TOOL_GROUP, NOVELAI_IMAGE_PROVIDER, normalizeNovelAiImageSettings } from '@eleckoi/dsh-product-data'
import { LocalMediaStore, type PreparedLocalMedia } from '@eleckoi/dsh-product-data/media'
import { createHash, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { NativeTavernWorkflowOperations } from './tavern-workflow-operations.js'

type Value = Record<string, unknown>
type ImageSettings = ReturnType<typeof normalizeNovelAiImageSettings>
type ImageAttachmentRef = Parameters<Context['attachments']['readImage']>[0]
interface GeneratedFrame { id: number; seed: number; attachment: ImageAttachmentRef }
interface ImageGenerator {
  generate(entry: Value, settings: ImageSettings, frames: Array<{ id: number; prompt: string; negative_prompt: string; seed?: number }>, signal: AbortSignal): Promise<{ status: string; frames: GeneratedFrame[]; error?: string }>
}
const object = (value: unknown): Value => value && typeof value === 'object' && !Array.isArray(value) ? value as Value : {}
const text = (value: unknown, fallback = ''): string => typeof value === 'string' ? value : fallback
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : []
const namespace = 'eleckoi-product-api'
const modelsNamespace = 'eleckoi-client-models'
const sources = new Set(['novel', 'novelai', 'novelai_image'])
const methods = new Set(['media.imageSettings', 'media.generate', 'media.cancel', 'media.read', 'media.gallery', 'media.expressions', 'media.uploadExpression', 'media.video', 'media.providerSettings', 'media.importImage', 'media.importVideo'])

/** ST presentation contracts over native image settings, generation, attachments and media. */
export class NativeTavernMediaOperations {
  private readonly lifetime = new AbortController()
  private readonly running = new Map<string, { conversationId: string; controller: AbortController }>()
  private persistence: Promise<unknown> = Promise.resolve()
  private mediaStore?: LocalMediaStore
  private readonly workflows: NativeTavernWorkflowOperations

  constructor(private readonly owner: Context) {
    this.workflows = new NativeTavernWorkflowOperations(owner, { state: () => this.state(), mutateState: update => this.mutateState(update),
      store: () => this.store(), characterId: params => this.characterId(params) })
    owner.effect(() => () => {
      this.lifetime.abort(new Error('ElecKoi Host 已卸载。'))
      for (const job of this.running.values()) job.controller.abort(this.lifetime.signal.reason)
      this.running.clear()
    })
  }

  has(method: string): boolean { return methods.has(method) }
  concurrent(method: string): boolean { return method === 'media.generate' || method === 'media.cancel' || method === 'media.importImage' || method === 'media.importVideo' }

  private descriptor(ns: string) {
    const descriptor = this.owner.settings.describe({ redactSecrets: true }).find(row => row.ns === ns)
    if (!descriptor) throw new Error(`原生配置命名空间不存在：${ns}`)
    return descriptor
  }

  private state(): Value { return structuredClone(object(object(this.descriptor(namespace).value).media)) }

  private mutateState(update: (state: Value) => void): Promise<void> {
    const action = async () => {
      const descriptor = this.descriptor(namespace), state = structuredClone(object(object(descriptor.value).media))
      update(state)
      await this.owner.settings.mutate(namespace, [{ op: 'set', path: ['media'], value: state }])
    }
    const next = this.persistence.then(action, action)
    this.persistence = next.catch(() => {})
    return next
  }

  private store(): LocalMediaStore {
    if (this.mediaStore) return this.mediaStore
    const root = process.env.ELECKOI_MEDIA_ROOT?.trim()
    if (!root) throw new Error('原生媒体目录 ELECKOI_MEDIA_ROOT 尚未配置。')
    return this.mediaStore = new LocalMediaStore(root)
  }

  private input(params: Value): Value {
    return { ...(text(params.conversationId) ? { conversationId: params.conversationId } : {}), ...object(Array.isArray(params.args) ? params.args[0] : params) }
  }

  private resolveConfiguration(params: Value): { id: string; entry: Value; settings: ImageSettings } {
    const source = text(params.source)
    if (source && !sources.has(source)) throw new Error(`原生图片服务尚不支持 ${source}；当前支持 NovelAI。`)
    const state = this.state(), entries = object(object(this.descriptor(modelsNamespace).value).entries)
    const conversationId = text(params.conversationId)
    const bound = conversationId ? text(object(this.owner.eleckoiProductData.prepareConversationRuntime(conversationId, '').agentPreset.toolModelConfigIds)[AUTO_ILLUSTRATION_TOOL_GROUP]) : ''
    const requested = text(params.configId, text(params.modelConfigId))
    const candidates = [requested, text(state.configId), bound, ...Object.keys(entries)]
    const id = candidates.find(id => id && object(entries[id]).provider === NOVELAI_IMAGE_PROVIDER)
    if (requested && id !== requested) throw new Error(`NovelAI 图片配置不存在：${requested}`)
    if (!id) throw new Error('尚未配置 NovelAI 图片模型，请先保存图片模型配置。')
    const entry = object(entries[id])
    return { id, entry, settings: normalizeNovelAiImageSettings(entry.image_settings) }
  }

  private async imageSettings(params: Value): Promise<Value> {
    if (this.workflows.selected(params)) return this.workflows.settings(params)
    const selected = this.resolveConfiguration(params), nativePatch: Value = {}
    const aliases: Record<string, string> = { prefix: 'promptPrefix', negative: 'negativePrompt', cfg: 'scale' }
    for (const key of ['width', 'height', 'steps', 'scale', 'sampler', 'promptPrefix', 'negativePrompt', ...Object.keys(aliases)]) {
      if (params[key] !== undefined) nativePatch[aliases[key] ?? key] = params[key]
    }
    const settings = normalizeNovelAiImageSettings({ ...selected.settings, ...nativePatch })
    if (Object.keys(nativePatch).length) {
      const descriptor = this.descriptor(modelsNamespace)
      await this.owner.settings.mutate(modelsNamespace, [{ op: 'set', path: ['entries', selected.id, 'image_settings'], value: settings }], descriptor.revision)
    }
    if (params.configId !== undefined || params.modelConfigId !== undefined || params.source !== undefined || params.style !== undefined) {
      await this.mutateState(state => {
        state.configId = selected.id
        if (params.source !== undefined) state.source = NOVELAI_IMAGE_PROVIDER
        if (params.style !== undefined) state.style = text(params.style)
      })
    }
    return { ...settings, configId: selected.id, source: NOVELAI_IMAGE_PROVIDER, model: selected.entry.model,
      style: text(this.state().style), prefix: settings.promptPrefix, negative: settings.negativePrompt }
  }

  private characterId(params: Value): string {
    const explicit = text(params.characterId)
    if (explicit) return explicit
    const conversationId = text(params.conversationId)
    return conversationId ? text(this.owner.eleckoiProductData.readConversationDetails(conversationId, undefined, 1).metadata.characterId) : ''
  }

  private async generate(params: Value): Promise<Value> {
    if (this.workflows.selected(params)) return this.workflows.generate(params)
    const service = this.owner.get('eleckoiImageGeneration') as unknown as ImageGenerator | undefined
    if (!service) throw new Error('原生图片生成服务尚未启动。')
    const generator = this.resolveConfiguration(params), prompt = text(params.prompt).trim()
    if (!prompt) throw new TypeError('图片生成需要非空 prompt。')
    const conversationId = text(params.conversationId), characterId = this.characterId(params)
    const generationId = text(params.generationId, text(params.requestId, randomUUID()))
    if (this.running.has(generationId)) throw new Error(`图片生成编号正在使用：${generationId}`)
    const controller = new AbortController(), signal = AbortSignal.any([controller.signal, this.lifetime.signal])
    const override: Value = {}
    for (const key of ['width', 'height', 'steps', 'scale', 'sampler']) if (params[key] !== undefined) override[key] = params[key]
    if (params.cfg !== undefined) override.scale = params.cfg
    if (params.prefix !== undefined) override.promptPrefix = params.prefix
    const settings = normalizeNovelAiImageSettings({ ...generator.settings, ...override })
    // /imagine passes the effective negative prompt; do not append the native default a second time.
    const negative = text(params.negative, text(params.negative_prompt))
    if (params.negative !== undefined || params.negative_prompt !== undefined) settings.negativePrompt = ''
    const seed = params.seed === undefined || Number(params.seed) < 0 ? undefined : Number(params.seed)
    if (seed !== undefined && (!Number.isInteger(seed) || seed > 4294967295)) throw new TypeError('图片 seed 必须是 0 到 4294967295 的整数，或 -1 表示随机。')
    this.running.set(generationId, { conversationId, controller })
    let prepared: PreparedLocalMedia | undefined, attachments: ImageAttachmentRef[] = []
    try {
      const generated = await service.generate(generator.entry, settings, [{ id: 1, prompt, negative_prompt: negative, ...(seed === undefined ? {} : { seed }) }], signal)
      attachments = generated.frames.map(frame => frame.attachment)
      signal.throwIfAborted()
      const frame = generated.frames[0]
      if (!frame || generated.status !== 'complete') throw new Error(generated.error || '原生图片服务没有完成本次图片生成。')
      const stored = await this.owner.attachments.readImage(frame.attachment, signal)
      signal.throwIfAborted()
      const owner = `tavern-image:${conversationId || characterId || 'global'}`
      prepared = this.store().prepareImage(owner, `image-${randomUUID()}`, `data:${stored.ref.mediaType};base64,${Buffer.from(stored.data).toString('base64')}`)
      const row: Value = { id: generationId, generationId, conversationId, characterId, url: prepared.reference, reference: prepared.reference,
        prompt, negative: negative || settings.negativePrompt, seed: frame.seed, width: settings.width, height: settings.height, createdAt: Date.now(),
        configId: generator.id, model: generator.entry.model, gallery: params.gallery !== false, source: 'standalone' }
      await this.mutateState(state => {
        signal.throwIfAborted()
        state.images = [...array(state.images), row]
      })
      // Once the catalogue is durable, commit atomically rather than losing a saved entry on a late cancel.
      prepared.commit()
      return row
    } catch (error) {
      prepared?.rollback()
      throw error
    } finally {
      this.running.delete(generationId)
      if (attachments.length) await this.owner.eleckoiSessionEditor.discardGeneratedImages(attachments)
    }
  }

  private cancel(params: Value): Value {
    const generationId = text(params.generationId, text(params.requestId, text(params.id))), conversationId = text(params.conversationId)
    let cancelled = 0
    for (const [id, job] of this.running) {
      if (generationId ? id !== generationId : conversationId && job.conversationId !== conversationId) continue
      job.controller.abort(new Error('图片生成已取消。')); cancelled++
    }
    return { cancelled: cancelled + Number(this.workflows.cancel(params).cancelled || 0), generationId }
  }

  private reference(value: string): string {
    if (value.startsWith('eleckoi-media://')) return value
    let url: URL
    try { url = new URL(value, 'https://eleckoi.invalid') } catch { throw new TypeError('媒体引用不是合法 URL。') }
    if (url.pathname === '/eleckoi/media/asset') return url.searchParams.get('reference') || ''
    return value
  }

  private async read(value: string): Promise<string> {
    if (value.startsWith('data:image/') || value.startsWith('data:video/')) return value
    const reference = this.reference(value), path = this.store().pathForReference(reference)
    if (!path) throw new Error('仅能读取原生媒体库中的图片；远程 URL 请交给已有网络或模型接口。')
    const bytes = await readFile(path)
    const extension = path.split('.').at(-1)?.toLowerCase(), mediaType = ({ jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', ogv: 'video/ogg' } as Record<string, string>)[extension || '']
    if (!mediaType) throw new Error('本地媒体类型无效。')
    return `data:${mediaType};base64,${bytes.toString('base64')}`
  }

  private async sessionImages(conversationId: string): Promise<Value[]> {
    if (!conversationId) return []
    const sessionId = this.owner.eleckoiProductData.runtimeSessionId(conversationId)
    if (!sessionId) return []
    const inspection = await this.owner.sessionController.inspect(SessionId(sessionId), this.lifetime.signal)
    const batches = new Map<string, Value>()
    for (const original of inspection.events) {
      const event = original as { type: string; data: unknown; time: number }
      if (event.type !== 'eleckoi/illustration') continue
      const data = object(event.data)
      batches.set(text(data.batchId), { ...data, createdAt: event.time })
    }
    const existing = array(this.state().images).map(object), rows: Value[] = []
    for (const batch of batches.values()) for (const item of array(batch.frames)) {
      const frame = object(item)
      if (frame.status !== 'ready' || !frame.attachment) continue
      const ref = frame.attachment as ImageAttachmentRef
      const id = `session:${sessionId}:${text(batch.batchId)}:${String(frame.id)}:${ref.attachmentId}`
      const cached = existing.find(row => row.id === id)
      if (cached) { rows.push(cached); continue }
      const image = await this.owner.attachments.readImage(ref, this.lifetime.signal)
      const slot = `session-${createHash('sha256').update(id).digest('hex').slice(0, 40)}`
      const prepared = this.store().prepareImage(`tavern-image:${conversationId}`, slot, `data:${ref.mediaType};base64,${Buffer.from(image.data).toString('base64')}`)
      const row: Value = Object.fromEntries(Object.entries({ id, conversationId, characterId: this.characterId({ conversationId }), batchId: batch.batchId, frameId: frame.id,
        url: prepared.reference, reference: prepared.reference, prompt: text(frame.prompt), seed: frame.seed,
        width: frame.width, height: frame.height, createdAt: typeof batch.createdAt === 'number' ? batch.createdAt : Date.now(), source: 'session', gallery: true }).filter(([, value]) => value !== undefined))
      try {
        await this.mutateState(state => { state.images = [...array(state.images).filter(value => object(value).id !== id), row] })
        prepared.commit(); rows.push(row)
      } catch (error) { prepared.rollback(); throw error }
    }
    return rows
  }

  private async gallery(params: Value): Promise<Value[]> {
    const conversationId = text(params.conversationId), characterId = text(params.characterId)
    const session = await this.sessionImages(conversationId), state = array(this.state().images).map(object)
    const rows = state.filter(row => row.source !== 'session' && row.gallery !== false)
    rows.push(...array(this.state().media).map(object).filter(row => row.gallery !== false))
    // Current Session events decide which historical Agent images still exist after rollback.
    rows.push(...session)
    return rows.filter(row => (!conversationId || row.conversationId === conversationId) && (!characterId || row.characterId === characterId))
      .sort((a, b) => Number(a.createdAt) - Number(b.createdAt)).map(row => structuredClone(row))
  }

  private character(params: Value) {
    const collection = this.owner.eleckoiProductData.readCharacters()
    const id = this.characterId(params) || collection.active_character_id
    const card = collection.items.find(item => item.id === id)
    if (!card) throw new Error(`找不到表情立绘所属角色：${id}`)
    return card
  }

  private expressions(params: Value): Value[] {
    const card = this.character(params), folder = text(params.folder).replaceAll('\\', '/')
    const rows = (card.expressions ?? []).filter(row => row.folder === folder).map(row => ({ ...row, reference: row.url }))
    if (!folder && !rows.some(row => row.label === 'neutral')) {
      const persona = object(card.persona), url = text(persona.assistant_cover) || text(card.avatar)
      if (url) rows.push({ name: 'neutral', label: 'neutral', folder: '', url, reference: url })
    }
    return rows
  }

  private async uploadExpression(params: Value): Promise<Value> {
    const cardId = this.character(params).id, label = text(params.label).trim()
    const name = text(params.spriteName, label).trim(), folder = text(params.folder).replaceAll('\\', '/')
    if (!label || !name) throw new TypeError('表情上传需要非空 label；spriteName 默认为 label。')
    const source = text(params.url).trim()
    if (!source) throw new TypeError('表情上传需要图片 URL。')
    let image = this.reference(source)
    if (/^https?:/.test(image)) {
      const response = await fetch(image, { signal: this.lifetime.signal })
      if (!response.ok) throw new Error(`表情图片下载失败：HTTP ${response.status}`)
      const mediaType = response.headers.get('content-type')?.split(';')[0]?.trim() || 'image/png'
      image = `data:${mediaType};base64,${Buffer.from(await response.arrayBuffer()).toString('base64')}`
    }
    if (!image.startsWith('data:image/') && !this.store().pathForReference(image)) throw new TypeError('表情图片必须是图片数据、原生媒体引用或 HTTP(S) URL。')
    // Re-read after downloading so concurrent uploads and ordinary card edits retain one another.
    const card = this.character({ characterId: cardId }), row = { name, label, folder, url: image }
    const expressions = [...(card.expressions ?? []).filter(item => item.name !== name || item.folder !== folder), row]
    const saved = this.owner.eleckoiProductData.updateCharacter({ ...card, expressions }).items.find(item => item.id === cardId)!
    const result = saved.expressions!.find(item => item.name === name && item.folder === folder)!
    this.owner.eleckoiProductRecordChanges.publish({ kind: 'records', domain: 'characters', ids: [cardId] })
    return { ...result, reference: result.url }
  }

  async invoke(method: string, params: Value): Promise<unknown> {
    const input = this.input(params)
    if (method === 'media.providerSettings') return this.workflows.providerSettings(input)
    if (method === 'media.importImage') return this.workflows.importImage(input)
    if (method === 'media.importVideo') return this.workflows.importVideo(input)
    if (method === 'media.imageSettings') return this.imageSettings(input)
    if (method === 'media.generate') return this.generate(input)
    if (method === 'media.cancel') return this.cancel(input)
    if (method === 'media.gallery') return this.gallery(input)
    if (method === 'media.read') return this.read(text(Array.isArray(params.args) ? params.args[0] : params.url, text(input.reference, text(input.url))))
    if (method === 'media.expressions') return this.expressions(input)
    if (method === 'media.uploadExpression') return this.uploadExpression(input)
    if (method === 'media.video') throw new Error('尚未配置视频生成 provider；请通过 context.media.registerProvider 注册真实视频服务。')
    throw new Error(`未知媒体操作：${method}`)
  }
}
