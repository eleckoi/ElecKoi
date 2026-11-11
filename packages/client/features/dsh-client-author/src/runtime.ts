import { AuthorApiError, AuthorScriptSession, authorApiDefinitions, AUTHOR_EVENT_NAMES, type AuthorEventName, type AuthorEventMap, type AuthorScriptCaller } from '@eleckoi/author-sdk'
import { createAuthorVariableBindings, installElecKoiAuthorApi, type AuthorHostAdapter } from '@eleckoi/author-sdk/browser'
import type { Context } from '@deepseek-ai/cordis'
import type { ElecKoiConversations } from '@eleckoi/dsh-client-conversations/client'
import type { ElecKoiScriptLibraries } from '@eleckoi/dsh-client-character-configuration/client'
import type { ElecKoiModels } from '@eleckoi/dsh-client-models/client'
import type { NativeAuthorScriptCatalog, NativeAuthorScriptIdentity } from '@eleckoi/dsh-product-api/types'
import { productFailure, ELECKOI_FAILURE_CODES } from '@eleckoi/dsh-product-api'
import type {} from '@eleckoi/dsh-product-api/remote'
import { createAuthorScriptFrame, type AuthorBrowserWindow } from './frame.js'
import type { NativeAuthorRuntimeSnapshot, NativeAuthorChatHandlers, NativeAuthorProjectContext } from './client/types.js'
import { createNativeMessageBindings } from './messages.js'
import { createNativeChatBindings } from './chats.js'
import { createNativeSettingLibraryBindings, createNativePresetBindings } from './settings.js'
import { createNativeScriptSettingsBindings } from './script-settings.js'
import { createNativeEditorVersionBindings } from './editor-versions.js'
import { NativeAudioRuntime, nativeAudioMethods } from './audio.js'
import { NativeGenerationEvents } from './generation.js'
import { NativeScriptUi, type NativeScriptUiOwner } from './script-ui.js'
import { NativeScriptRequests } from './script-requests.js'
import { authorRuleStream, type AuthorRuleDelivery } from './rule-stream.js'

// 两个「确实不处理」的具名声明：语义见 packages/shared/src/foundation/swallowedFailure.ts。
// 本文件是独立 bundle 的源，运行时取不到那个包，所以就地定义（同名同义，空函数）。
const failureAlreadyPublished = (): void => {}
const rejectionIsAwaitedElsewhere = (): void => {}

/**
 * 抛出值的诊断文案。
 *
 * 带码失败是普通对象、不是 `Error` 实例（它要能过结构化克隆），所以不能只认
 * `instanceof Error`——那样日志与 `snapshot.error` 会拿到 `"[object Object]"`。
 */
const failureMessage = (error: unknown): string => error instanceof Error
  || (typeof error === 'object' && error !== null && typeof (error as { message?: unknown }).message === 'string')
  ? (error as { message: string }).message
  : String(error)

export interface NativeAuthorRuntimeOptions {
  window: AuthorBrowserWindow
  remote: Pick<Context['remote'], '$stream' | 'eleckoiAuthorScripts' | 'eleckoiAuthorVariables' | 'eleckoiConversations' | 'eleckoiCharacters' | 'eleckoiCharacterConfiguration' | 'eleckoiAgentPresets'>
  conversations: ElecKoiConversations
  libraries: ElecKoiScriptLibraries
  models: ElecKoiModels
  report(error: unknown): void
  createFrame?: typeof createAuthorScriptFrame
  createAudio?: () => HTMLAudioElement
}
/** Client-owned native realms; source and accepted variable state stay in product-data. */
export class NativeAuthorClient {
  private snapshot: NativeAuthorRuntimeSnapshot = { status: 'idle', conversationId: '', error: '', scriptStatuses: {} }
  private readonly listeners = new Set<() => void>()
  private readonly ui = new Map<string, NativeAuthorChatHandlers>()
  private readonly documents = new Set<{ conversationId?: string; close(): void }>()
  private readonly stops: Array<() => void> = []
  private readonly events = new Map<string, Set<(value: unknown) => void>>()
  private readonly projectEvents = new Map<string, Set<(value: unknown) => void>>()
  private readonly audio: NativeAudioRuntime
  private readonly generation: NativeGenerationEvents
  private readonly scriptUi: NativeScriptUi
  private readonly scriptRequests = new NativeScriptRequests()
  private current: { catalog: NativeAuthorScriptCatalog; revision: number; session: AuthorScriptSession; abort: AbortController; stream?: ReturnType<typeof authorRuleStream> } | undefined
  private queue = Promise.resolve()
  private revision = 0
  private configurationReadRevision = 0
  private settingsSnapshotRevision = 0
  private closed = false
  private readonly lifetime = new AbortController()

  constructor(private readonly options: NativeAuthorRuntimeOptions) {
    this.scriptUi = new NativeScriptUi({ window: options.window, report: options.report, available: owner => {
      this.assertChat(owner.conversationId)
      if (this.current?.catalog.version !== owner.version) throw productFailure(ELECKOI_FAILURE_CODES.conflictStaleRevision, '原生脚本已被替换', { what: '原生脚本' })
    } })
    this.audio = new NativeAudioRuntime({ createAudio: options.createAudio ?? (() => options.window.document.createElement('audio')),
      emit: event => this.emitAuthorEvent(event.name, event.payload), report: options.report })
    this.generation = new NativeGenerationEvents(options.conversations, () => options.window.crypto.randomUUID(),
      (name, payload) => this.emitAuthorEvent(name, payload), options.report)
  }

  /** 读取当前聊天的原生脚本运行状态。
   * @returns 运行状态与按作用域编号区分的脚本状态。
   */
  getSnapshot = (): NativeAuthorRuntimeSnapshot => this.snapshot
  /** 订阅原生脚本运行状态。
   * @param listener - 状态变化回调。
   * @returns 取消订阅函数。
   */
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener) }
  getUiSnapshot = () => this.scriptUi.getSnapshot()
  subscribeUi = (listener: () => void) => this.scriptUi.subscribe(listener)
  invokeButton = (key: string): Promise<void> => this.snapshot.status !== 'ready'
    ? Promise.reject(productFailure(ELECKOI_FAILURE_CODES.statePrecondition, '原生脚本尚未就绪', { what: '等待原生脚本就绪' })) : this.scriptUi.invokeButton(key)
  dismissPanel = (key: string) => this.scriptUi.dismissPanel(key)

  mountScriptPanelDocument(target: Window, key: string): () => void {
    return this.scriptUi.mountPanel(key, owner => {
      const page = target as AuthorBrowserWindow
      installElecKoiAuthorApi(page, this.adapter(owner.conversationId, '', { version: owner.version,
        identity: owner.identity }, owner, { surface: 'script-panel' }))
      const entry = { conversationId: owner.conversationId, close: () => {
        if (!this.documents.delete(entry)) return
        page.dispatchEvent(new page.Event('pagehide'))
      } }
      this.documents.add(entry)
      page.addEventListener('pagehide', () => this.documents.delete(entry), { once: true })
      return entry.close
    })
  }
  /** 绑定当前聊天的输入框操作，卸载时撤回该绑定。
   * @param conversationId - 聊天编号。
   * @param handlers - 页面实际实现的输入操作。
   * @returns 只撤回本次绑定的函数。
   */
  registerChatUi(conversationId: string, handlers: NativeAuthorChatHandlers): () => void {
    if (this.closed) throw productFailure(ELECKOI_FAILURE_CODES.lifecycleDisposed, 'Native author runtime is closed', { what: '原生作者运行环境' })
    if (this.ui.has(conversationId)) throw productFailure(ELECKOI_FAILURE_CODES.lookupDuplicate, 'This chat already has an input owner', { what: '聊天输入区绑定' })
    this.ui.set(conversationId, handlers)
    return () => { if (this.ui.get(conversationId) === handlers) this.ui.delete(conversationId) }
  }
  /** 在同源作者页面安装原生 SDK；切换聊天后撤回，禁止转发到新聊天。
   * @param target - 作者页面窗口。
   * @param conversationId - 固定所属聊天编号。
   * @param messageId - 所属消息编号；聊天页面传空字符串。
   * @returns 关闭页面 SDK 的函数。
   */
  mountDocument(target: Window, conversationId: string, messageId: string): () => void {
    this.assertChat(conversationId)
    const page = target as AuthorBrowserWindow
    installElecKoiAuthorApi(page, this.adapter(conversationId, messageId))
    const entry = { conversationId, close: () => {
      if (!this.documents.delete(entry)) return
      page.dispatchEvent(new page.Event('pagehide'))
    } }
    this.documents.add(entry)
    page.addEventListener('pagehide', () => this.documents.delete(entry), { once: true })
    return entry.close
  }

  /** 在项目页面安装独立 SDK，明确区分应用和角色归属。
   * @param target - 同源作者项目页面。
   * @param project - 明确项目、入口、窗口及角色页面的所属角色和聊天。
   * @returns 撤回 SDK 与订阅的函数。
   */
  mountProjectDocument(target: Window, project: NativeAuthorProjectContext): () => void {
    if (this.closed) throw productFailure(ELECKOI_FAILURE_CODES.lifecycleDisposed, 'Native author runtime is closed', { what: '原生作者运行环境' })
    if (!project.projectId || !project.entryFile || !project.view) throw productFailure(ELECKOI_FAILURE_CODES.inputInvalid, 'Author project identity is required', { field: 'project' })
    if (project.scope !== 'application' && project.scope !== 'character') throw productFailure(ELECKOI_FAILURE_CODES.inputInvalid, 'Author project scope is required', { field: 'scope' })
    if (project.scope === 'character' && !project.characterId) throw productFailure(ELECKOI_FAILURE_CODES.inputInvalid, 'Author project character is required', { field: 'characterId' })
    const page = target as AuthorBrowserWindow, fixed = structuredClone(project)
    let active = true
    let close = () => {}
    const matches = (selected: ReturnType<ElecKoiConversations['getDetailsSnapshot']>) => this.isActive(selected)
      && (fixed.scope === 'application' || selected.details?.metadata.characterId === fixed.characterId
        && (!fixed.conversationId || selected.id === fixed.conversationId))
    const calls = new Set<{ conversationId: string; abort: AbortController; contextCommitted: boolean }>()
    const stop = this.options.conversations.subscribeDetails(() => {
      const selected = this.options.conversations.getDetailsSnapshot()
      for (const call of calls) if (!call.contextCommitted && (call.conversationId !== selected.id || !this.isActive(selected))) call.abort.abort(new Error('Author project chat has changed'))
      if (fixed.scope === 'character' && !matches(selected)) close()
    })
    const available = () => { if (!active || this.closed) throw productFailure(ELECKOI_FAILURE_CODES.lifecycleDisposed, 'Author project page is closed', { what: '作者项目页面' }) }
    const context = () => {
      const selected = this.options.conversations.getDetailsSnapshot(), details = matches(selected) ? selected.details : null
      return { projectId: fixed.projectId, entryFile: fixed.entryFile, view: fixed.view, messageId: '',
        surface: fixed.scope === 'application' ? 'application-frontend' : 'character-frontend',
        scope: fixed.scope === 'application' ? 'application' : 'current-character',
        conversationId: details ? selected.id : '', conversationTitle: details?.conversation.title || '',
        characterId: fixed.scope === 'character' ? fixed.characterId : details?.metadata.characterId || '' }
    }
    installElecKoiAuthorApi(page, {
      request: async (method, params, options) => {
        available(); options.signal.throwIfAborted()
        if (method === 'app.getInfo') return { name: 'ElecKoi', apiVersion: '0.1.0', stage: 'preview' }
        if (method === 'context.current') return context()
        if (method === 'events.list') return { items: AUTHOR_EVENT_NAMES }
        if (method === 'audio.getSettings' || method === 'audio.setSettings') return this.audio.invoke('', method, params, options.signal)
        const selected = this.options.conversations.getDetailsSnapshot()
        if (method === 'app.getCapabilities') {
          if (!matches(selected)) return authorApiDefinitions.filter(item => ['app.getInfo', 'app.getCapabilities', 'context.current', 'events.list', 'audio.getSettings', 'audio.setSettings'].includes(item.method))
          return this.adapter(selected.id, '').request(method, params, options)
        }
        if (!matches(selected)) throw fixed.scope === 'character'
          ? productFailure(ELECKOI_FAILURE_CODES.statePrecondition, '请先打开这个角色的聊天，再调用聊天功能', { what: '打开这个角色的聊天' })
          : productFailure(ELECKOI_FAILURE_CODES.statePrecondition, '请先选择一个聊天，再调用聊天功能', { what: '选择一个聊天' })
        const call = { conversationId: selected.id, abort: new AbortController(), contextCommitted: false }; calls.add(call)
        const cancel = () => call.abort.abort(options.signal.reason)
        options.signal.addEventListener('abort', cancel, { once: true })
        try {
          const signal = call.abort.signal
          const result = await this.adapter(call.conversationId, '', undefined, undefined, {
            surface: fixed.scope === 'application' ? 'application-frontend' : 'character-frontend',
            projectId: fixed.projectId, entryFile: fixed.entryFile, view: fixed.view
          }).request(method, params, { signal,
            commitContextChange: () => {
              signal.throwIfAborted(); options.commitContextChange?.(); call.contextCommitted = true
            } })
          signal.throwIfAborted()
          if (!call.contextCommitted) { this.assertChat(call.conversationId); available() }
          return result
        } finally { options.signal.removeEventListener('abort', cancel); calls.delete(call) }
      },
      on: (event, listener) => {
        available()
        if (!AUTHOR_EVENT_NAMES.some(name => name === event)) throw productFailure(ELECKOI_FAILURE_CODES.inputUnsupported, `Native project event is not connected: ${event}`, { what: '作者项目事件类型' })
        const listeners = this.projectEvents.get(event) ?? new Set()
        listeners.add(listener); this.projectEvents.set(event, listeners)
        return () => { listeners.delete(listener); if (!listeners.size) this.projectEvents.delete(event) }
      },
      isEventCurrent: (_event, payload) => {
        const selected = this.options.conversations.getDetailsSnapshot()
        return active && !this.closed && matches(selected) && !!payload && typeof payload === 'object'
          && (payload as { conversationId?: unknown }).conversationId === selected.id
      },
    })
    const entry = { close: () => {
      if (!this.documents.delete(entry)) return
      active = false; stop()
      for (const call of calls) if (!call.contextCommitted) call.abort.abort(new Error('Author project page closed'))
      page.dispatchEvent(new page.Event('pagehide'))
    } }
    close = entry.close
    this.documents.add(entry)
    page.addEventListener('pagehide', entry.close, { once: true })
    return entry.close
  }

  /** @internal */
  async start(): Promise<void> {
    this.generation.start()
    this.stops.push(this.options.conversations.subscribeDetails(() => {
      void this.refresh().catch(failureAlreadyPublished)
    }))
    this.stops.push(this.options.libraries.subscribeChanges(() => {
      void this.refreshConfiguration().catch(error => this.fail(error))
    }))
    void this.consumeChanges().catch(error => { if (!this.closed) this.fail(error) })
    // Author errors remain editable without removing the management service.
    await this.refresh().catch(failureAlreadyPublished)
  }

  private async refreshConfiguration(): Promise<void> {
    const current = this.current
    if (!current) { await this.refresh().catch(failureAlreadyPublished); return }
    const readRevision = ++this.configurationReadRevision
    const settingsRevision = this.settingsSnapshotRevision
    const stillCurrent = () => !this.closed && this.current === current && readRevision === this.configurationReadRevision
      && (!current.abort.signal.aborted || this.snapshot.status === 'error')
    let result: Awaited<ReturnType<NativeAuthorRuntimeOptions['remote']['eleckoiAuthorScripts']['read']>>
    try { result = await this.options.remote.eleckoiAuthorScripts.read(current.catalog.conversationId) }
    catch (error) { if (!stillCurrent()) return; throw error }
    if (this.closed || this.current !== current || readRevision !== this.configurationReadRevision
      || current.abort.signal.aborted && this.snapshot.status !== 'error') return
    if (!result.ok) throw result.error
    // A real version change also cancels startup; duplicate file notifications do not restart it.
    if (result.value.version !== current.catalog.version) await this.refresh(true).catch(failureAlreadyPublished)
    else if (this.snapshot.status !== 'error' && settingsRevision === this.settingsSnapshotRevision) {
      current.session.updateSettings(result.value.scripts); current.catalog = result.value
    }
  }

  /** @internal */
  refresh(force = false): Promise<void> {
    const selected = this.options.conversations.getDetailsSnapshot(), id = selected.id
    this.audio.activate(this.isActive(selected) ? id : '')
    if (force || this.current && (this.current.catalog.conversationId !== id || !this.isActive(selected))) {
      this.scriptUi.close()
      this.revision++; this.current?.abort.abort(new Error('Author context has changed'))
      void this.current?.session.close().catch(error => this.options.report(error))
    }
    for (const page of this.documents) if (this.closed || page.conversationId !== undefined && (page.conversationId !== id || !this.isActive(selected))) page.close()
    const revision = this.revision
    const next = this.queue.then(() => this.synchronize(revision)).catch(error => {
      if (!this.closed && revision === this.revision) this.fail(error)
      throw error
    })
    // `next` 由调用方 await（`return next`）；这里只为队列只留一条拒绝。
    this.queue = next.catch(rejectionIsAwaitedElsewhere)
    return next
  }

  private async synchronize(revision: number): Promise<void> {
    if (this.closed || revision !== this.revision) return
    const selected = this.options.conversations.getDetailsSnapshot()
    if (!this.isActive(selected)) {
      await this.stopCurrent(); this.publish({ status: 'idle', conversationId: selected.id, error: '', scriptStatuses: {} }); return
    }
    const readRevision = ++this.configurationReadRevision
    const settingsRevision = this.settingsSnapshotRevision
    const stillCurrent = () => !this.closed && revision === this.revision && readRevision === this.configurationReadRevision
      && this.options.conversations.getDetailsSnapshot().id === selected.id
      && this.isActive(this.options.conversations.getDetailsSnapshot())
    let result: Awaited<ReturnType<NativeAuthorRuntimeOptions['remote']['eleckoiAuthorScripts']['read']>>
    try { result = await this.options.remote.eleckoiAuthorScripts.read(selected.id) }
    catch (error) { if (!stillCurrent()) return; throw error }
    if (!stillCurrent()) return
    if (!result.ok) throw result.error
    const catalog = result.value
    if (this.current && this.current.catalog.version === catalog.version && this.current.revision === revision) {
      if (this.snapshot.status !== 'error' && settingsRevision === this.settingsSnapshotRevision) {
        this.current.session.updateSettings(catalog.scripts); this.current.catalog = catalog
      }
      return
    }
    await this.stopCurrent()
    if (this.closed || revision !== this.revision) return
    if (!catalog.scripts.length) {
      this.publish({ status: 'ready', conversationId: selected.id, error: '', scriptStatuses: {} })
      return
    }
    this.publish({ status: 'starting', conversationId: selected.id, error: '', scriptStatuses: {} })
    const session = new AuthorScriptSession({ conversationId: selected.id, scripts: catalog.scripts,
      createFrame: script => (this.options.createFrame || createAuthorScriptFrame)(this.options.window,
        catalog.scripts.find(item => item.key === script.key)!.entryUrl),
      adapter: script => {
        const owner = this.scriptUi.createOwner(selected.id, catalog.version, catalog.scripts.find(item => item.key === script.key)!)
        const requests = this.scriptRequests.createOwner(catalog.scripts.find(item => item.key === script.key)!)
        return { ...this.adapter(selected.id, '', { version: catalog.version, identity: owner.identity }, owner),
          registerButton: owner.registerButton, registerScriptHandler: requests.register,
          dispose: () => { requests.dispose(); owner.dispose() } }
      },
      status: status => {
        const script = catalog.scripts.find(item => item.key === status.key)!
        this.publish({ ...this.snapshot, scriptStatuses: { ...this.snapshot.scriptStatuses,
          [status.key]: { ...status, scope: script.scope, ownerId: script.ownerId, source: script.source } } })
      } })
    const current = { catalog, revision, session, abort: new AbortController(), stream: undefined as ReturnType<typeof authorRuleStream> | undefined }
    this.current = current
    try {
      await session.start()
      if (this.closed || revision !== this.revision || current.abort.signal.aborted) return
      current.stream = authorRuleStream(this.options.remote, catalog.conversationId, catalog.version, current.abort.signal, () => {
        if (this.current === current && !current.abort.signal.aborted) this.publish({ ...this.snapshot, status: 'starting', error: '' })
      })
      const iterator = current.stream[Symbol.asyncIterator]()
      const first = await iterator.next()
      if (first.done) return
      if (this.closed || revision !== this.revision) return
      this.publish({ ...this.snapshot, status: 'ready' })
      void this.consume(current, iterator).catch(error => {
        if (this.current === current && !this.closed && !current.abort.signal.aborted) this.fail(error)
      })
    } catch (error) {
      if (!this.closed && revision === this.revision) throw error
    }
  }

  private async consume(current: NonNullable<NativeAuthorClient['current']>, iterator: AsyncIterator<AuthorRuleDelivery>): Promise<void> {
    const runs = new Set<string>()
    const cancel = () => { for (const id of runs) current.session.cancel(id); runs.clear() }
    let generationSignal: AbortSignal | undefined
    try {
      while (!current.abort.signal.aborted) {
        const result = await iterator.next()
        if (result.done) throw productFailure(ELECKOI_FAILURE_CODES.internal, 'Native author rule stream ended', { what: '原生作者规则流提前结束' })
        const { task, signal, reply } = result.value
        if (generationSignal !== signal) {
          generationSignal?.removeEventListener('abort', cancel); cancel()
          generationSignal = signal; signal.addEventListener('abort', cancel, { once: true })
        }
        if (task.kind === 'ready') { this.publish({ ...this.snapshot, status: 'ready', error: '' }); continue }
        if (task.kind === 'cancel') { current.session.cancel(task.runId); runs.delete(task.runId) }
        else if (task.kind === 'process') {
          runs.add(task.runId)
          // Delivery stays live while an asynchronous author rule is awaiting work.
          void (async () => {
            try {
              if (task.scriptSettings) {
                // Settings cannot supersede this snapshot; changed code still needs a reload.
                this.settingsSnapshotRevision++
                current.session.updateSettings(task.scriptSettings)
              }
              const stateJson = await current.session.apply(task.runId, task.stage, task.stateJson, task.beforeJson)
              if (!signal.aborted && !current.abort.signal.aborted) await reply({ id: task.id, ok: true, stateJson })
            } catch (error) {
              if (!signal.aborted && !current.abort.signal.aborted) await reply({ id: task.id, ok: false, message: failureMessage(error) })
            } finally {
              if (task.stage === 'afterSchema') runs.delete(task.runId)
            }
          })().catch(error => { if (!signal.aborted && !current.abort.signal.aborted) this.fail(error) })
        }
      }
    } finally { generationSignal?.removeEventListener('abort', cancel); cancel() }
  }

  private adapter(conversationId: string, messageId: string,
    script?: { version: string; identity: NativeAuthorScriptIdentity }, uiOwner?: NativeScriptUiOwner,
    source?: Pick<AuthorScriptCaller, 'surface' | 'projectId' | 'entryFile' | 'view'>): AuthorHostAdapter {
    const bindings = createAuthorVariableBindings(this.options.remote.eleckoiAuthorVariables, () => conversationId)
    const messages = createNativeMessageBindings(this.options.conversations, conversationId, messageId,
      () => this.assertChat(conversationId), () => this.options.window.crypto.randomUUID())
    const chats = createNativeChatBindings(this.options.conversations, this.options.models, this.options.remote,
      conversationId, () => this.assertChat(conversationId), () => this.generation.identity())
    const settings = createNativeSettingLibraryBindings(this.options.remote.eleckoiCharacterConfiguration,
      this.options.conversations.getDetailsSnapshot().details!.metadata.characterId, () => this.assertChat(conversationId))
    const presets = createNativePresetBindings(this.options.remote.eleckoiAgentPresets, () => this.assertChat(conversationId))
    const editorVersions = createNativeEditorVersionBindings(this.options.remote.eleckoiCharacterConfiguration,
      this.options.remote.eleckoiAgentPresets, this.options.conversations.getDetailsSnapshot().details!.metadata.characterId,
      () => this.assertChat(conversationId))
    const scriptSettings = script ? createNativeScriptSettingsBindings(this.options.remote.eleckoiAuthorScripts,
      conversationId, script.version, script.identity, () => this.refreshConfiguration()) : {}
    return {
      request: async (method, params, options) => {
        this.assertChat(conversationId); options.signal.throwIfAborted()
        if (params.conversationId !== undefined && params.conversationId !== conversationId) throw productFailure(ELECKOI_FAILURE_CODES.securityDenied, 'An author page cannot redirect its chat', { what: '作者页面切换聊天', guard: '作者页面的聊天归属' })
        if (method === 'scripts.list' || method === 'scripts.request') {
          if (this.snapshot.status !== 'ready') throw new AuthorApiError('SCRIPTS_NOT_READY', '当前聊天的脚本尚未就绪')
          if (method === 'scripts.list') return this.scriptRequests.list()
          return this.scriptRequests.request(params.target, params.action, params.dataJson, {
            surface: messageId ? 'message-renderer' : script ? 'script' : 'chat-ui',
            ...source, conversationId, messageId, script: script ? { ...script.identity } : null
          }, options.signal)
        }
        if (method === 'ui.openPanel' || method === 'ui.closePanel') {
          if (!uiOwner) throw productFailure(ELECKOI_FAILURE_CODES.securityDenied, '只有所属脚本可以打开或关闭作者面板', { what: '作者面板开关', guard: '所属脚本' })
          return uiOwner.request(method, params)
        }
        if (method === 'variables.getState' && params.messageId !== undefined) return messages[method]!(params, options)
        const variable = Object.hasOwn(bindings, method) ? bindings[method as keyof typeof bindings] : undefined
        if (variable) return variable(params, options)
        if (Object.hasOwn(messages, method)) return messages[method]!(params, options)
        if (Object.hasOwn(chats, method)) return chats[method]!(params, options)
        if (Object.hasOwn(settings, method)) return settings[method]!(params, options)
        if (Object.hasOwn(presets, method)) return presets[method]!(params, options)
        if (Object.hasOwn(editorVersions, method)) return editorVersions[method]!(params, options)
        if (Object.hasOwn(scriptSettings, method)) return scriptSettings[method]!(params, options)
        if (nativeAudioMethods.includes(method as typeof nativeAudioMethods[number])) return this.audio.invoke(conversationId, method, params, options.signal)
        const details = this.options.conversations.getDetailsSnapshot().details!
        const opening = details.messages.find(message => message.id === 'opening')
        const openings = () => (opening?.openingOptions || []).map(item => ({ ...item, initialVariableState: JSON.parse(item.initialVariableStateJson) }))
        switch (method) {
          case 'app.getInfo': return { name: 'ElecKoi', apiVersion: '0.1.0', stage: 'preview' }
          case 'app.getCapabilities': return authorApiDefinitions.filter(item => Object.hasOwn(bindings, item.method) || Object.hasOwn(messages, item.method) || Object.hasOwn(chats, item.method) || Object.hasOwn(settings, item.method) || Object.hasOwn(presets, item.method) || Object.hasOwn(scriptSettings, item.method) || Object.hasOwn(editorVersions, item.method) || !!uiOwner && ['ui.openPanel', 'ui.closePanel'].includes(item.method) || nativeAudioMethods.includes(item.method as typeof nativeAudioMethods[number]) || ['scripts.list', 'scripts.request', 'app.getInfo', 'app.getCapabilities', 'context.current', 'openings.list', 'openings.current', 'openings.select', 'chat.send', 'chat.stopGeneration', 'input.get', 'input.set', 'input.append', 'input.clear', 'input.send', 'events.list'].includes(item.method))
          case 'context.current': return { surface: messageId ? 'message-renderer' : 'chat-ui', scope: 'current-character', conversationId,
            messageId, characterId: details.metadata.characterId, conversationTitle: details.conversation.title }
          case 'openings.list': return { items: openings() }
          case 'openings.current': return openings().find(item => item.id === opening?.selectedOpeningId) || null
          case 'openings.select': {
            if (typeof params.id !== 'string' || !params.id) throw productFailure(ELECKOI_FAILURE_CODES.inputInvalid, 'Opening id is required', { field: 'id' })
            await this.options.conversations.selectOpening(conversationId, params.id); return { selectedId: params.id }
          }
          case 'chat.send': {
            if (typeof params.text !== 'string') throw productFailure(ELECKOI_FAILURE_CODES.inputInvalid, 'Message text must be a string', { field: 'text' })
            const images = params.attachments as Parameters<ElecKoiConversations['send']>[0]['images']
            if (!Array.isArray(images) || images.some(image => !image || typeof image.data !== 'string' || !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(image.mediaType))) throw productFailure(ELECKOI_FAILURE_CODES.mediaInvalid, 'Invalid message images', { what: '消息图片', field: 'attachments' })
            if (!params.text.trim() && !images.length) throw productFailure(ELECKOI_FAILURE_CODES.inputInvalid, 'A user message cannot be empty', { field: 'text' })
            const requestId = this.options.window.crypto.randomUUID()
            const result = await this.options.conversations.send({ conversationId, requestId, text: params.text, images, signal: options.signal })
            if (result.cancelled) throw productFailure(ELECKOI_FAILURE_CODES.stateMismatch, 'Message generation was cancelled', { what: '消息生成状态' })
            const inputs = result.details?.messages.filter(message => message.role === 'user' && message.requestId === requestId) || []
            if (inputs.length !== 1 || !inputs[0]!.id || !result.details?.runtimeSessionId) throw productFailure(ELECKOI_FAILURE_CODES.dataShapeInvalid, 'Completed message request has no unique formal identity', { what: '完成消息的正式标识' })
            return { accepted: true, conversationId, runId: result.details.runtimeSessionId, messageId: inputs[0]!.id }
          }
          case 'chat.stopGeneration': {
            return { cancelled: await this.options.conversations.cancelGeneration(conversationId) }
          }
          case 'events.list': return { items: AUTHOR_EVENT_NAMES }
          default: {
            if (!['input.get', 'input.set', 'input.append', 'input.clear', 'input.send'].includes(method)) throw productFailure(ELECKOI_FAILURE_CODES.inputUnsupported, `Native author method is not connected: ${method}`, { what: '原生作者接口' })
            if (['input.set', 'input.append'].includes(method) && typeof params.text !== 'string') throw productFailure(ELECKOI_FAILURE_CODES.inputInvalid, 'Input text must be a string', { field: 'text' })
            const handler = this.ui.get(conversationId)?.[method]
            if (!handler) throw productFailure(ELECKOI_FAILURE_CODES.lookupNotFound, 'Current chat input is not mounted', { what: '当前聊天的输入区' })
            return handler(params)
          }
        }
      },
      on: (event, listener) => {
        this.assertChat(conversationId)
        if (!AUTHOR_EVENT_NAMES.some(name => name === event)) throw productFailure(ELECKOI_FAILURE_CODES.inputUnsupported, `Native author event is not connected: ${event}`, { what: '原生作者事件' })
        const key = JSON.stringify([conversationId, event]), listeners = this.events.get(key) || new Set()
        listeners.add(listener); this.events.set(key, listeners)
        return () => { listeners.delete(listener); if (!listeners.size) this.events.delete(key) }
      }
    }
  }

  private async consumeChanges(): Promise<void> {
    const stream = this.options.remote.$stream({ name: 'ElecKoi native author conversation changes',
      open: signal => this.options.remote.eleckoiConversations.changes(signal),
      ended: () => new Error('Native author conversation changes stream ended') })
    const stop = () => { void stream.dispose() }
    this.lifetime.signal.addEventListener('abort', stop, { once: true })
    try {
      for await (const packet of stream) {
        packet.accept()
        const change = packet.value
        if (change.kind !== 'messages') continue
        const { conversationId, reason, messageIds } = change
        this.emitAuthorEvent('messages.changed', { conversationId, reason, messageIds })
      }
      if (!this.closed) throw productFailure(ELECKOI_FAILURE_CODES.internal, 'Native author conversation changes stream ended', { what: '聊天变更流提前结束' })
    } finally { this.lifetime.signal.removeEventListener('abort', stop); await stream.dispose() }
  }
  private emitAuthorEvent<TName extends AuthorEventName>(event: TName, payload: AuthorEventMap[TName]): void {
    for (const listener of this.events.get(JSON.stringify([payload.conversationId, event])) ?? []) listener(structuredClone(payload))
    const selected = this.options.conversations.getDetailsSnapshot()
    if (this.isActive(selected) && selected.id === payload.conversationId) {
      for (const listener of this.projectEvents.get(event) ?? []) listener(structuredClone(payload))
    }
  }
  private assertChat(id: string): void {
    const selected = this.options.conversations.getDetailsSnapshot()
    if (this.closed || selected.id !== id || !this.isActive(selected)) throw productFailure(ELECKOI_FAILURE_CODES.stateMismatch, 'Author page chat is closed or no longer active', { what: '作者页面所在的聊天' })
  }
  private isActive(selected: ReturnType<ElecKoiConversations['getDetailsSnapshot']>): boolean {
    return !!selected.id && !!selected.details && (selected.status === 'ready' || selected.status === 'loading')
  }
  private publish(snapshot: NativeAuthorRuntimeSnapshot): void { this.snapshot = snapshot; for (const listener of this.listeners) listener() }
  private fail(error: unknown): void {
    if (this.closed) return
    this.scriptRequests.close()
    this.scriptUi.close()
    this.current?.abort.abort(error)
    void this.current?.session.close().catch(cleanupError => this.options.report(cleanupError))
    this.publish({ ...this.snapshot, status: 'error', error: failureMessage(error) }); this.options.report(error)
  }
  private async stopCurrent(): Promise<void> {
    this.scriptRequests.close()
    this.scriptUi.close()
    const current = this.current; this.current = undefined
    if (!current) return
    current.abort.abort(new Error('Native author generation closed'))
    try { await current.stream?.return() } finally { await current.session.close() }
  }
  /** @internal */
  async dispose(): Promise<void> {
    if (this.closed) return
    this.closed = true; this.revision++
    this.lifetime.abort(new Error('Native author runtime closed'))
    this.stops.splice(0).forEach(stop => stop())
    for (const page of this.documents) page.close()
    this.generation.dispose(); this.audio.dispose(); this.ui.clear(); this.events.clear(); this.projectEvents.clear()
    try { await this.stopCurrent() }
    finally { this.scriptUi.dispose(); this.publish({ ...this.snapshot, status: 'closed' }); this.listeners.clear() }
  }
}
