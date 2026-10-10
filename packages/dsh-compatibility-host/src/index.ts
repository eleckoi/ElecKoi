import type { Context, Plugin } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import type {} from '@eleckoi/dsh-product-api'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { AuthorCapabilities, AuthorChange, AuthorCommand, AuthorValue } from './types.js'
import { AuthorPluginOperations, AUTHOR_METHODS } from './author-operations.js'
import { AuthorChangeFeed } from './change-feed.js'
import { ASSETS_BASE_URL, createAuthorAssetHandler } from './assets.js'
import { WebCallbackBroker } from './callback-broker.js'
import { CompatibilityCallbacks } from './web-callbacks.js'
import { CompatibilityGeneration, GENERATION_METHODS } from './generation-operations.js'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-settings'
import { fileHandleText, offloadedImageText } from '@deepseek-ai/dsh-llm'
import { ExtensionOperations, EXTENSION_METHODS } from './extension-operations.js'
import { MediaOperations, MEDIA_METHODS } from './media-operations.js'
import { ImageGenerationOperations, IMAGE_METHODS } from './image-generation-operations.js'
import { BasicAuthorOperations, BASIC_AUTHOR_METHODS, authorGenerationState } from './basic-author-operations.js'
import { MainAgentGeneration, MAIN_GENERATION_METHODS } from './main-generation.js'
import { SessionGenerationEvents } from './session-generation-events.js'
import { readAuthorMediaResource } from './author-media-resources.js'
import { AUTHOR_NATIVE_EVENT_NAMES } from './native-event-catalog.js'
import { randomUUID } from 'node:crypto'
import { resolveConfiguredConnectionModel } from './connection-model.js'
import { configuredConnectionEndpoint } from './connection-endpoint.js'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
export type { AuthorCapabilities, AuthorChange, AuthorCommand, AuthorValue } from './types.js'

declare module '@deepseek-ai/cordis' { interface Context { eleckoiAuthorPluginsApi: ElecKoiAuthorPluginsApi; eleckoiCompatibilityCallbacks: CompatibilityCallbacks; eleckoiCompatibilityGeneration: CompatibilityGeneration; eleckoiImageGeneration: ImageGenerationOperations } }
const CALLBACK_METHODS = ['callbacks.attach', 'callbacks.detach', 'callbacks.respond', 'plugins.hookResult']

/**
 * 作者插件的 Host 兼容入口，提供能力发现、命令调用和实时变更订阅。
 * 通过 `ctx.eleckoiAuthorPluginsApi` 使用，并在 `eleckoiAuthorPlugins` Remote 命名空间公开。
 */
export class ElecKoiAuthorPluginsApi extends TypertRemoteService {
  static inject = ['typert', 'webServer', 'eleckoiProductData', 'eleckoiCompatibilityApi', 'eleckoiConversationModelsApi', 'eleckoiConversationsApi', 'eleckoiSessionEditor', 'sessionController', 'llm', 'settings', 'credentials']
  private readonly feed = new AuthorChangeFeed()
  private readonly operations: AuthorPluginOperations
  private readonly callbacks: WebCallbackBroker
  private readonly generation: CompatibilityGeneration
  private readonly extensions: ExtensionOperations
  private readonly media: MediaOperations
  private readonly images: ImageGenerationOperations
  private readonly basic: BasicAuthorOperations
  private readonly mainGeneration: MainAgentGeneration
  private readonly sessionEvents: SessionGenerationEvents
  constructor(ctx: Context) {
    super(ctx, 'eleckoiAuthorPluginsApi', { namespace: 'eleckoiAuthorPlugins' })
    this.callbacks = new WebCallbackBroker((change: AuthorChange) => this.feed.publish(change))
    const callbackService = new CompatibilityCallbacks(this.callbacks)
    ctx.provide('eleckoiCompatibilityCallbacks', callbackService)
    const compatibility = ctx.get('eleckoiCompatibilityApi') as { invoke(command: AuthorCommand): AuthorValue | Promise<AuthorValue> }
    this.generation = new CompatibilityGeneration({ data: ctx.eleckoiProductData,
      compatibility: (command: AuthorCommand) => compatibility.invoke(command),
      readModel: (id: string) => ctx.eleckoiConversationModelsApi.current(id),
      readConnection: (id: string, model?: string) => readConnection(ctx, id, model), llm: ctx.llm, callbacks: callbackService,
      hasWebCallbacks: () => this.callbacks.clients.size > 0,
      isOwnerActive: (id: string) => ['frontend', '__shared_host'].includes(id) || this.operations.lookupManifest(id)?.enabled !== false && this.operations.lookupManifest(id) !== null,
      publish: (change: AuthorChange) => this.feed.publish(change), worldbooks: () => ctx.get('eleckoiWorldbookRounds'),
      projectBlock: async (block: { type: string; attachment?: unknown; offloaded?: boolean }, signal?: AbortSignal) => {
        const attachments = ctx.get('attachments') as { readImage(ref: unknown, signal?: AbortSignal): Promise<{ data: Uint8Array; ref: { mediaType: string } }>; fileHostPath(ref: unknown): string | undefined } | undefined
        const fs = ctx.get('fs') as { processPathFromHostPath(path: string): string | undefined } | undefined
        if (!attachments) throw new Error('Native attachment service is not mounted')
        if (block.type === 'image') {
          if (block.offloaded) return { type: 'text', text: offloadedImageText(block.attachment as Parameters<typeof offloadedImageText>[0]) }
          const image = await attachments.readImage(block.attachment, signal)
          return { type: 'image_url', image_url: { url: `data:${image.ref.mediaType};base64,${Buffer.from(image.data).toString('base64')}` } }
        }
        if (block.type === 'file') {
          const hostPath = attachments.fileHostPath(block.attachment), path = hostPath ? fs?.processPathFromHostPath(hostPath) : undefined
          return { type: 'text', text: fileHandleText(block.attachment as Parameters<typeof fileHandleText>[0], path) }
        }
        throw new Error(`Unsupported native block in compatibility provider projection: ${block.type}`)
      } })
    ctx.provide('eleckoiCompatibilityGeneration', this.generation)
    this.mainGeneration = new MainAgentGeneration({ ctx, generation: this.generation, callbacks: callbackService,
      publish: (change: AuthorChange) => this.feed.publish(change) })
    ctx.provide('eleckoiMainAgentGeneration', this.mainGeneration)
    this.sessionEvents = new SessionGenerationEvents({ ctx,
      publish: (change: AuthorChange) => this.feed.publish(change),
      claimManagedTurn: (session, event) => this.mainGeneration.claimNativeTurn(session, event) })
    this.operations = new AuthorPluginOperations({ data: ctx.eleckoiProductData,
      compatibility: (command: AuthorCommand) => compatibility.invoke(command),
      publish: (change: AuthorChange) => this.feed.publish(change),
      readModel: (id: string) => ctx.eleckoiConversationModelsApi.current(id) })
    this.extensions = new ExtensionOperations({ author: this.operations })
    this.media = new MediaOperations({ store: ctx.eleckoiProductData.compatibilityStore(), callbacks: callbackService,
      publish: (change: AuthorChange) => this.feed.publish(change), readConnection: (id: string, model: string) => readConnection(ctx, id, model) })
    this.operations.media = this.media
    this.images = new ImageGenerationOperations({ data: ctx.eleckoiProductData,
      compatibility: (command: AuthorCommand) => compatibility.invoke(command),
      readConnection: (id: string, model: string) => readConnection(ctx, id, model),
      attachments: () => { const service = ctx.get('attachments', false); if (!service) throw new Error('Native attachment service is not mounted'); return service },
      inspect: (id: string) => ctx.sessionController.inspect(id as Parameters<typeof ctx.sessionController.inspect>[0]),
      publish: (change: AuthorChange) => this.feed.publish(change) })
    ctx.provide('eleckoiImageGeneration', this.images)
    this.basic = new BasicAuthorOperations({ data: ctx.eleckoiProductData, compatibility: (command: AuthorCommand) => compatibility.invoke(command),
      conversations: ctx.eleckoiConversationsApi, models: ctx.eleckoiConversationModelsApi,
      methods: () => [...MAIN_GENERATION_METHODS, ...BASIC_AUTHOR_METHODS, ...AUTHOR_METHODS, ...CALLBACK_METHODS, ...GENERATION_METHODS, ...EXTENSION_METHODS, ...MEDIA_METHODS, ...IMAGE_METHODS],
      events: () => ({ items: [...AUTHOR_NATIVE_EVENT_NAMES] }),
      trajectory: (id: string, options: { beforeIndex?: number; limit?: number }) => {
        const editor = ctx.get('eleckoiSessionEditor') as unknown as { readTrajectory(sessionId: string, options: { beforeIndex?: number; limit?: number }): unknown }
        if (!editor.readTrajectory) throw new Error('Native Session trajectory service is not mounted')
        return editor.readTrajectory(ctx.eleckoiProductData.runtimeSessionId(id), options)
      },
      generationState: async (id: string, presentation?: { conversationId?: string; messages?: Array<{ id?: string; role?: string; content?: string }>; isGenerating?: boolean }) => {
        const sessionId = ctx.eleckoiProductData.runtimeSessionId(id)
        const agents = ctx.get('agents', false) as { get(id: string): { status: string } | undefined } | undefined
        const agent = agents?.get(sessionId), active = agent?.status === 'running'
        return authorGenerationState(id, sessionId, active, presentation)
      },
      mediaResource: (resource: unknown) => {
        const mappings = ctx.eleckoiProductData.compatibilityStore().get('migration:android:media', 'path-mappings')
        return readAuthorMediaResource(resource, ctx.get('attachments'), Array.isArray(mappings) ? mappings : [])
      },
      ui: (method: string, payload: AuthorValue, id: string) => callbackService.callback('__ElecKoiAuthorUi', { method, params: payload }, { conversationId: id }),
      send: async (id: string, params: Record<string, AuthorValue>) => {
        const content: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'; name?: string }> = []
        const value = typeof params.text === 'string' ? params.text : ''
        if (value.trim()) content.push({ type: 'text', text: value })
        const images = params.images ?? params.attachments ?? []
        if (!Array.isArray(images)) throw new TypeError('chat.send images must be an array')
        for (const input of images) {
          if (!input || typeof input !== 'object' || Array.isArray(input) || typeof input.data !== 'string' || !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(String(input.mediaType))) throw new TypeError('chat.send image requires base64 data and mediaType')
          content.push({ type: 'image', data: input.data, mediaType: input.mediaType as 'image/png', ...(typeof input.name === 'string' ? { name: input.name } : {}) })
        }
        if (!content.length) throw new Error('chat.send requires text or an image')
        const signal = new AbortController().signal
        const prepared = await ctx.eleckoiConversationsApi.preparePrompt(id, value, signal)
        const controller = ctx.sessionController
        let receipt
        try {
          receipt = await controller.prompt({ requestId: randomUUID() as Parameters<typeof controller.prompt>[0]['requestId'],
            sessionId: prepared.runtimeSessionId as Parameters<typeof controller.prompt>[0]['sessionId'], mode: 'queue', content }, signal)
        } catch (error) {
          // A rejected admission cannot produce the turn that settles this preparation.
          ctx.eleckoiConversationLifecycle.forget(id)
          throw error
        }
        const resolved = await controller.resolveAgent(prepared.runtimeSessionId as Parameters<typeof controller.resolveAgent>[0])
        if ('error' in resolved) throw resolved.error
        await resolved.agent.whenIdle()
        await ctx.eleckoiConversationsApi.waitForGeneration(id, prepared.operationId)
        return { ...receipt }
      },
      stop: async (id: string) => {
        const sessionId = ctx.eleckoiProductData.runtimeSessionId(id), agents = ctx.get('agents', false) as { get(id: string): { status: string } | undefined } | undefined
        if (agents?.get(sessionId)?.status !== 'running') return { cancelled: false }
        const controller = ctx.sessionController
        await controller.cancel({ sessionId: sessionId as Parameters<typeof controller.cancel>[0]['sessionId'] }); return { cancelled: true }
      } })
    ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: '/eleckoi/compat/media', handler: this.media.serve.bind(this.media) }), 'eleckoi: real shared TTS audio files')
    ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: '/eleckoi/compat/images', handler: this.images.serve.bind(this.images) }), 'eleckoi: original AttachmentStore generated images')
    ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: ASSETS_BASE_URL.slice(0, -1), handler: createAuthorAssetHandler(this.operations, undefined) }), 'eleckoi: same-origin compatibility resources')
    ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: '/eleckoi/frontends', handler: (request, response) => {
      if (!['GET', 'HEAD'].includes(request.method ?? '')) { response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return }
      let parts: string[]
      try { parts = new URL(request.url ?? '/', 'http://localhost').pathname.slice('/eleckoi/frontends/'.length).split('/').map(decodeURIComponent) }
      catch { response.writeHead(400); response.end(); return }
      const id = parts.shift() ?? '', path = parts.join('/')
      const frontends = ctx.get('eleckoiCompatibilityFrontends', false)
      if (!frontends) { response.writeHead(503); response.end(); return }
      try {
        const asset = frontends.readAsset(id, path)
        response.writeHead(200, { 'Content-Type': asset.mimeType, 'Cache-Control': 'no-store' })
        response.end(request.method === 'HEAD' ? undefined : asset.body)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT' || !frontends.hasAsset(id, path)) {
          response.writeHead(404); response.end(); return
        }
        throw error
      }
    } }), 'eleckoi: authored frontend resources')
    ctx.on('webserver/index-inject', table => { table.push({ kind: 'global', name: '__ELECKOI_COMPATIBILITY_ASSETS__', value: { baseUrl: ASSETS_BASE_URL } }) })
    ctx.effect(() => async () => { this.sessionEvents.close(); await this.mainGeneration.close(); await this.images.close(); this.media.close(); this.generation.close(); this.callbacks.close(); this.feed.close() })
  }
  /**
   * 读取当前 Host 支持的作者插件命令和同源资源入口。
   * @returns 命令名称列表、协议版本（当前为 1）及作者插件资源的基础 URL。
   */
  @Remote
  capabilities(): AuthorCapabilities { return { methods: [...MAIN_GENERATION_METHODS, ...BASIC_AUTHOR_METHODS, ...AUTHOR_METHODS, ...CALLBACK_METHODS, ...GENERATION_METHODS, ...EXTENSION_METHODS, ...MEDIA_METHODS, ...IMAGE_METHODS], version: 1, assetsBaseUrl: ASSETS_BASE_URL } }
  /**
   * 按命令名称调用作者插件、聊天生成、Web 回调、扩展或媒体操作。
   * @param command 要执行的命令；`method` 为能力列表中的命令名称，`params` 为该命令的 JSON 参数对象。
   * @returns 对应操作完成后的 JSON 值；回调接入和移除返回 null，回调应答返回是否匹配到待处理请求。
   */
  @Remote
  async invoke(command: AuthorCommand): Promise<AuthorValue> {
    const p = command.params
    switch (command.method) {
      case 'chat.generateFromHistory': return await this.mainGeneration.invoke(command) as AuthorValue
      case 'callbacks.attach': return this.callbacks.attach(String(p.clientId || ''), String(p.conversationId || ''))
      case 'callbacks.detach': return this.callbacks.detach(String(p.clientId || ''))
      case 'callbacks.respond': return this.callbacks.respond(p as unknown as Parameters<WebCallbackBroker['respond']>[0])
      case 'plugins.hookResult': return this.callbacks.respond({ id: p.token, clientId: p.clientId, value: p.result ?? null, error: p.error } as unknown as Parameters<WebCallbackBroker['respond']>[0])
      default: return IMAGE_METHODS.includes(command.method) ? await this.images.invoke(command) as AuthorValue : BASIC_AUTHOR_METHODS.includes(command.method) ? await this.basic.invoke(command) as AuthorValue : MEDIA_METHODS.includes(command.method) ? await this.media.invoke(command) as AuthorValue : GENERATION_METHODS.includes(command.method) ? await this.generation.invoke(command) as AuthorValue
        : EXTENSION_METHODS.includes(command.method) ? await this.extensions.invoke(command) as AuthorValue : await this.operations.invoke(command)
    }
  }
  /**
   * 订阅作者插件、生成过程和 Web 回调发布的实时变更。
   * @param signal 订阅的取消信号；触发取消后结束此订阅并移除订阅者。
   * @returns 异步变更流；活动订阅先收到 payload 为 null 的 `plugins.snapshot` 重载标记，随后收到实时事件，直到取消订阅或 Host 关闭。
   */
  @Remote({ mode: 'stream' })
  changes(signal: AbortSignal): AsyncIterable<AuthorChange> { return this.feed.stream(signal) as AsyncIterable<AuthorChange> }
}
const plugin: Plugin = { name: 'eleckoi-compatibility-host', inject: ElecKoiAuthorPluginsApi.inject,
  async apply(ctx: Context) { await ctx.plugin(ElecKoiAuthorPluginsApi) } }
export default plugin

/** Read the original selected provider and credential; never mutate global model settings. */
async function readConnection(ctx: Context, id: string, model?: string) {
  const table = ctx.settings.describe()
  const options = table.find(row => row.ns === 'llm-pi-ai')?.value as { providers?: Record<string, { baseURL?: string; api?: string; apiKeyEnv?: string; headers?: Record<string, string>; models?: { id: string }[] }> } | undefined
  const dedicated = id === 'deepseek-official' ? table.find(row => row.ns === 'llm-deepseek')?.value as { baseURL?: string; apiKeyEnv?: string } | undefined : undefined
  const entry = (table.find(row => row.ns === 'eleckoi-client-models')?.value as { entries?: Record<string, { credentialRef?: string; model?: string }> } | undefined)?.entries?.[id]
  const profile = options?.providers?.[id]
  const ref = entry?.credentialRef || profile?.apiKeyEnv || dedicated?.apiKeyEnv || (id === 'deepseek-official' ? 'DEEPSEEK_API_KEY' : `${id.toUpperCase().replace(/[^A-Z0-9_]/g, '_')}_API_KEY`)
  const credential = await ctx.credentials.resolve(credentialRef(ref))
  return { configId: id, model: await resolveConfiguredConnectionModel(table, id, model,
    (provider: string) => ctx.llm.listModels(provider), () => ctx.get('agentDefaultModel', false)?.currentSelection()), provider: id,
    ...configuredConnectionEndpoint(table, id, launchEnvironmentOf(ctx)), apiKey: credential?.value || '' }
}
