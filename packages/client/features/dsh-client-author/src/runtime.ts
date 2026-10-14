import { AuthorScriptSession, authorApiDefinitions, AUTHOR_EVENT_NAMES, type AuthorEventName, type AuthorEventMap } from '@eleckoi/author-sdk'
import { createAuthorVariableBindings, installElecKoiAuthorApi, type AuthorHostAdapter } from '@eleckoi/author-sdk/browser'
import type { Context } from '@deepseek-ai/cordis'
import type { ElecKoiConversations } from '@eleckoi/dsh-client-conversations/client'
import type { ElecKoiScriptLibraries } from '@eleckoi/dsh-client-character-configuration/client'
import type { ElecKoiModels } from '@eleckoi/dsh-client-models/client'
import type { NativeAuthorScriptCatalog, NativeAuthorRuleTask, NativeAuthorScriptIdentity } from '@eleckoi/dsh-product-api/types'
import type {} from '@eleckoi/dsh-product-api/remote'
import { createAuthorScriptFrame, type AuthorBrowserWindow } from './frame.js'
import type { NativeAuthorRuntimeSnapshot, NativeAuthorChatHandlers, NativeAuthorProjectContext, NativeAuthorDocumentRelease } from './client/types.js'
import { NativeVariableEditor } from './variable-editor.js'
import type { EditingVariableTarget } from '@eleckoi/tavern-native'
import { createCompatibilitySharedState } from '@eleckoi/tavern-native'
import { createNativeMessageBindings } from './messages.js'
import { createNativeChatBindings } from './chats.js'
import { createNativeSettingLibraryBindings, createNativePresetBindings } from './settings.js'
import { createNativeScriptSettingsBindings } from './script-settings.js'
import { NativeAudioRuntime, nativeAudioMethods } from './audio.js'
import { NativeGenerationEvents } from './generation.js'
import { NativeTavernClient } from './tavern-client.js'
import { NativeTavernEvents, observeMessageIframe } from './tavern-events.js'
import { NativeFunctionToolRuntime } from './function-tools.js'
import { NativeScriptUi, type NativeScriptUiOwner } from './script-ui.js'
import { mountTavernDocument, type TavernDocumentContext, type TavernDocumentMount, type TavernRemote } from './tavern.js'

export interface NativeAuthorRuntimeOptions {
  window: AuthorBrowserWindow
  remote: Pick<Context['remote'], 'eleckoiAuthorScripts' | 'eleckoiAuthorVariables' | 'eleckoiConversations' | 'eleckoiCharacters' | 'eleckoiCharacterConfiguration' | 'eleckoiAgentPresets'> & { eleckoiTavernCompatibility?: TavernRemote }
  conversations: ElecKoiConversations
  libraries: ElecKoiScriptLibraries
  models: ElecKoiModels
  catalogSources?: ReadonlyArray<{ subscribe(listener: () => void): () => void }>
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
  private readonly tavernShared = createCompatibilitySharedState()
  private readonly variableEditor: NativeVariableEditor
  private readonly tavernDocuments = new Map<Window, TavernDocumentMount>()
  private readonly tavernReadyErrors = new Set<unknown>()
  private readonly auxiliaryGenerations = new Map<string, { conversationId: string; shouldSilence: boolean }>()
  private tavernSelectedChat = ''
  private readonly tavernEvents: NativeTavernEvents
  private tavernEventTail = Promise.resolve()
  private readonly tavernClient: NativeTavernClient
  private readonly audio: NativeAudioRuntime
  private readonly generation: NativeGenerationEvents
  private readonly scriptUi: NativeScriptUi
  private readonly functionTools: NativeFunctionToolRuntime | undefined
  private current: { catalog: NativeAuthorScriptCatalog; revision: number; session: AuthorScriptSession; abort: AbortController; stream?: ReturnType<Context['remote']['eleckoiAuthorScripts']['connect']> } | undefined
  private queue = Promise.resolve()
  private revision = 0
  private configurationReadRevision = 0
  private settingsSnapshotRevision = 0
  private closed = false
  private readonly lifetime = new AbortController()

  constructor(private readonly options: NativeAuthorRuntimeOptions) {
    this.variableEditor = new NativeVariableEditor({ shared: this.tavernShared, remote: () => options.remote.eleckoiTavernCompatibility,
      available: id => this.assertChat(id), refresh: () => this.refreshTavernCatalog() })
    this.tavernClient = new NativeTavernClient({ window: options.window, conversations: options.conversations, remote: options.remote,
      audio: () => this.audio, speechProviders: this.tavernShared.ttsProviders, report: options.report,
      invokeHost: async (conversationId, method, params) => {
        const remote = options.remote.eleckoiTavernCompatibility
        if (!remote) throw new Error('原生语音服务没有连接。')
        const result = await remote.invoke(conversationId, method, params)
        if (!result.ok) throw new Error(result.error?.message || '语音服务请求失败。')
        return result.value
      },
      createId: () => options.window.crypto.randomUUID(), ui: (conversationId, method, params) => {
        const handler = this.ui.get(conversationId)?.[method]
        if (!handler) throw new Error(`Native chat UI is not mounted: ${method}`)
        return handler(params)
      } })
    this.tavernEvents = new NativeTavernEvents((event, ...args) => this.emitTavern(event, ...args))
    const toolRemote = options.remote.eleckoiTavernCompatibility
    this.functionTools = toolRemote?.connectTools ? new NativeFunctionToolRuntime({ connectTools: toolRemote.connectTools.bind(toolRemote) },
      this.tavernShared, () => options.window.crypto.randomUUID(), error => this.reportTavernReadyError(error)) : undefined
    this.scriptUi = new NativeScriptUi({ window: options.window, report: options.report, available: owner => {
      this.assertChat(owner.conversationId)
      if (this.current?.catalog.version !== owner.version) throw new Error('原生脚本已被替换')
    } })
    this.audio = new NativeAudioRuntime({ createAudio: options.createAudio ?? (() => options.window.document.createElement('audio')),
      emit: event => this.emitAuthorEvent(event.name, event.payload), report: options.report })
    this.generation = new NativeGenerationEvents(options.conversations, () => options.window.crypto.randomUUID(),
      (name, payload) => this.emitAuthorEvent(name, payload), options.report)
    this.stops.push(options.conversations.subscribeGroupGeneration(async change => {
      if (this.closed || change.conversationId !== this.tavernSelectedChat) return
      if (change.phase === 'member') {
        if (!this.tavernShared.eventHub.listeners('group_member_drafted').length) return
        const characters = this.tavernShared.acceptedCatalog?.characters?.items ?? []
        const index = characters.findIndex((item: { id: string }) => item.id === change.characterId)
        if (index < 0) throw new Error(`Group speaker is absent from the native character catalog: ${change.characterId}`)
        await this.tavernShared.eventHub.emitAndWait('group_member_drafted', index)
      } else await this.tavernShared.eventHub.emitAndWait(change.phase === 'started' ? 'group_wrapper_started' : 'group_wrapper_finished',
        { selected_group: change.groupId, type: 'normal' })
    }))
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
  getVariableSchemaRevision = () => this.variableEditor.getRevision()
  subscribeVariableSchemas = (listener: () => void) => this.variableEditor.subscribe(listener)
  listVariableEditorScopes = (conversationId: string) => this.variableEditor.listScopes(conversationId)
  readVariableEditorScope = (conversationId: string, target: EditingVariableTarget) => this.variableEditor.read(conversationId, target)
  describeVariableEditorSchema = (target: EditingVariableTarget, variables: Record<string, unknown>) => this.variableEditor.describe(target, variables)
  saveVariableEditorScope = (conversationId: string, target: EditingVariableTarget, variables: Record<string, unknown>) => this.variableEditor.save(conversationId, target, variables)
  getUiSnapshot = () => this.scriptUi.getSnapshot()
  subscribeUi = (listener: () => void) => this.scriptUi.subscribe(listener)
  invokeButton = (key: string): Promise<void> => this.snapshot.status !== 'ready'
    ? Promise.reject(new Error('原生脚本尚未就绪')) : this.scriptUi.invokeButton(key)
  dismissPanel = (key: string) => this.scriptUi.dismissPanel(key)

  async stopAuxiliaryGenerations(conversationId: string): Promise<boolean> {
    const active = [...this.auxiliaryGenerations].filter(([, task]) => task.conversationId === conversationId && !task.shouldSilence)
    for (const [id] of active) this.tavernShared.helperGenerations?.get(id)?.abort(new Error('Generation stopped.'))
    const remote = this.options.remote.eleckoiTavernCompatibility
    if (remote) for (const [id] of active) {
      const result = await remote.invoke(conversationId, 'generation.cancel', { generationId: id })
      if (!result.ok) throw new Error(result.error?.message || 'Auxiliary generation cancellation failed.')
    }
    return active.length > 0
  }

  /** Observe owner initialization failures once; callers still receive the rejected ready Promise. */
  private reportTavernReadyError(error: unknown): void {
    if (this.closed || this.tavernReadyErrors.has(error)) return
    this.tavernReadyErrors.add(error)
    this.options.report(error)
  }

  private mountTavern(page: AuthorBrowserWindow, context: TavernDocumentContext, adapter: AuthorHostAdapter,
    available: () => void = () => this.assertChat(context.conversationId)): TavernDocumentMount {
    const remote = this.options.remote.eleckoiTavernCompatibility
    if (!remote) throw new Error('Tavern compatibility host is not connected')
    this.tavernDocuments.get(page)?.dispose()
    const ui = (method: string, params: Record<string, unknown>) => {
      available()
      const handler = this.ui.get(context.conversationId)?.[method]
      if (!handler) throw new Error('The chat message renderer is not mounted')
      return handler(params)
    }
    let active = true
    const markClosed = () => { active = false }
    // Register before installation so a closed page is never reported as a startup failure.
    page.addEventListener('pagehide', markClosed, { once: true })
    const reportReadyError = (error: unknown) => { if (active) this.reportTavernReadyError(error) }
    const toolOwner = this.functionTools?.acquire(context.conversationId)
    const controller = mountTavernDocument(page, { remote, shared: this.tavernShared, context, adapter, available,
      report: reportReadyError, invokeNative: (method, params, request) => this.tavernClient.invoke(context.conversationId, method, params, request), ui: {
        mediaSrc: reference => {
          const result = ui('compatibility.mediaSrc', { reference })
          if (typeof result !== 'string') throw new Error('The native media resolver returned no URL')
          return result
        },
        formatMessage: (text, options = {}) => {
          const result = ui('compatibility.formatMessage', { text, options })
          if (typeof result !== 'string') throw new Error('The chat formatter returned no HTML')
          return result
        },
        refreshMessage: async (index, options = {}) => { await ui('compatibility.refreshMessage', { index, options }) },
        generationState: state => {
          if (state.running) this.auxiliaryGenerations.set(state.id, { conversationId: state.conversationId, shouldSilence: state.shouldSilence })
          else this.auxiliaryGenerations.delete(state.id)
          if (!this.closed) this.publish(this.snapshot)
        },
      } })
    const mounted = { ...controller,
      ready: Promise.all([controller.ready, toolOwner?.ready]).then(() => undefined),
      dispose: () => {
        markClosed(); page.removeEventListener('pagehide', markClosed)
        controller.dispose(); toolOwner?.release()
      },
    }
    // Promise.all(...).then(...) creates its own rejection even when each input is observed.
    // This observer does not replace ready, so awaiting consumers retain the original failure.
    void mounted.ready.catch(reportReadyError)
    page.addEventListener('pagehide', () => toolOwner?.release(), { once: true })
    this.tavernDocuments.set(page, mounted)
    page.addEventListener('pagehide', () => this.tavernDocuments.delete(page), { once: true })
    if (context.messageId) observeMessageIframe(page, mounted.ready,
      (event, ...args) => this.emitTavern(event, ...args), reportReadyError)
    return mounted
  }

  mountScriptPanelDocument(target: Window, key: string): NativeAuthorDocumentRelease {
    let ready!: Promise<void>
    const release = this.scriptUi.mountPanel(key, owner => {
      const page = target as AuthorBrowserWindow
      const adapter = this.adapter(owner.conversationId, '', { version: owner.version, identity: owner.identity }, owner)
      installElecKoiAuthorApi(page, adapter)
      const compatibility = this.mountTavern(page, { conversationId: owner.conversationId, scriptId: owner.identity.scriptId }, adapter)
      ready = compatibility.ready
      const entry = { conversationId: owner.conversationId, close: () => {
        if (!this.documents.delete(entry)) return
        page.dispatchEvent(new page.Event('pagehide'))
      } }
      this.documents.add(entry)
      page.addEventListener('pagehide', () => this.documents.delete(entry), { once: true })
      return Object.assign(entry.close, { ready: compatibility.ready })
    })
    return Object.assign(release, { ready })
  }
  /** 绑定当前聊天的输入框操作，卸载时撤回该绑定。
   * @param conversationId - 聊天编号。
   * @param handlers - 页面实际实现的输入操作。
   * @returns 只撤回本次绑定的函数。
   */
  registerChatUi(conversationId: string, handlers: NativeAuthorChatHandlers): () => void {
    if (this.closed) throw new Error('Native author runtime is closed')
    if (this.ui.has(conversationId)) throw new Error('This chat already has an input owner')
    this.ui.set(conversationId, handlers)
    return () => { if (this.ui.get(conversationId) === handlers) this.ui.delete(conversationId) }
  }
  /** 在同源作者页面安装原生 SDK；切换聊天后撤回，禁止转发到新聊天。
   * @param target - 作者页面窗口。
   * @param conversationId - 固定所属聊天编号。
   * @param messageId - 所属消息编号；聊天页面传空字符串。
   * @returns 关闭页面 SDK 的函数。
   */
  mountDocument(target: Window, conversationId: string, messageId: string): NativeAuthorDocumentRelease {
    this.assertChat(conversationId)
    const page = target as AuthorBrowserWindow
    const adapter = this.adapter(conversationId, messageId)
    installElecKoiAuthorApi(page, adapter)
    const compatibility = this.mountTavern(page, { conversationId, messageId }, adapter)
    const entry = { conversationId, close: () => {
      if (!this.documents.delete(entry)) return
      page.dispatchEvent(new page.Event('pagehide'))
    } }
    this.documents.add(entry)
    page.addEventListener('pagehide', () => this.documents.delete(entry), { once: true })
    return Object.assign(entry.close, { ready: compatibility.ready })
  }

  /** 在项目页面安装独立 SDK，明确区分应用和角色归属。
   * @param target - 同源作者项目页面。
   * @param project - 明确项目、入口、窗口及角色页面的所属角色和聊天。
   * @returns 撤回 SDK 与订阅的函数。
   */
  mountProjectDocument(target: Window, project: NativeAuthorProjectContext): NativeAuthorDocumentRelease {
    if (this.closed) throw new Error('Native author runtime is closed')
    if (!project.projectId || !project.entryFile || !project.view) throw new Error('Author project identity is required')
    if (project.scope !== 'application' && project.scope !== 'character') throw new Error('Author project scope is required')
    if (project.scope === 'character' && !project.characterId) throw new Error('Author project character is required')
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
    const available = () => { if (!active || this.closed) throw new Error('Author project page is closed') }
    const context = () => {
      const selected = this.options.conversations.getDetailsSnapshot(), details = matches(selected) ? selected.details : null
      return { projectId: fixed.projectId, entryFile: fixed.entryFile, view: fixed.view, messageId: '',
        surface: fixed.scope === 'application' ? 'application-frontend' : 'character-frontend',
        scope: fixed.scope === 'application' ? 'application' : 'current-character',
        conversationId: details ? selected.id : '', conversationTitle: details?.conversation.title || '',
        characterId: fixed.scope === 'character' ? fixed.characterId : details?.metadata.characterId || '' }
    }
    const adapter: AuthorHostAdapter = {
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
        if (!matches(selected)) throw new Error(fixed.scope === 'character' ? '请先打开这个角色的聊天，再调用聊天功能' : '请先选择一个聊天，再调用聊天功能')
        const call = { conversationId: selected.id, abort: new AbortController(), contextCommitted: false }; calls.add(call)
        const cancel = () => call.abort.abort(options.signal.reason)
        options.signal.addEventListener('abort', cancel, { once: true })
        try {
          const signal = call.abort.signal
          const result = await this.adapter(call.conversationId, '').request(method, params, { signal,
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
        if (!AUTHOR_EVENT_NAMES.some(name => name === event)) throw new Error(`Native project event is not connected: ${event}`)
        const listeners = this.projectEvents.get(event) ?? new Set()
        listeners.add(listener); this.projectEvents.set(event, listeners)
        return () => { listeners.delete(listener); if (!listeners.size) this.projectEvents.delete(event) }
      },
      isEventCurrent: (_event, payload) => {
        const selected = this.options.conversations.getDetailsSnapshot()
        return active && !this.closed && matches(selected) && !!payload && typeof payload === 'object'
          && (payload as { conversationId?: unknown }).conversationId === selected.id
      },
    }
    installElecKoiAuthorApi(page, adapter)
    const projectContext = context()
    const fixedCompatibilityContext = () => {
      available()
      if (projectContext.conversationId) this.assertChat(projectContext.conversationId)
      else if (this.isActive(this.options.conversations.getDetailsSnapshot())) throw new Error('This author compatibility page has no chat context; reload it after selecting a chat')
    }
    const compatibility = this.mountTavern(page, {
      conversationId: projectContext.conversationId, characterId: projectContext.characterId,
    }, { ...adapter, request: (method, params, options) => {
      fixedCompatibilityContext(); return adapter.request(method, params, options)
    } }, fixedCompatibilityContext)
    const entry = { close: () => {
      if (!this.documents.delete(entry)) return
      active = false; stop()
      for (const call of calls) if (!call.contextCommitted) call.abort.abort(new Error('Author project page closed'))
      page.dispatchEvent(new page.Event('pagehide'))
    } }
    close = entry.close
    this.documents.add(entry)
    page.addEventListener('pagehide', entry.close, { once: true })
    return Object.assign(entry.close, { ready: compatibility.ready })
  }

  /** @internal */
  async start(): Promise<void> {
    this.generation.start()
    this.observeTavernChat()
    this.stops.push(this.options.conversations.subscribeDetails(() => {
      this.observeTavernChat()
      void this.refresh().catch(() => {})
    }))
    const rendered = (event: Event) => {
      const detail = (event as CustomEvent<{ conversationId: string; messageId: string; role: string }>).detail
      if (detail.conversationId !== this.tavernSelectedChat) return
      const index = this.options.conversations.getDetailsSnapshot().details?.messages.findIndex(message => message.id === detail.messageId) ?? -1
      if (index >= 0) this.emitTavern(detail.role === 'user' ? 'user_message_rendered' : 'character_message_rendered', index)
    }
    this.options.window.addEventListener('eleckoi:message-rendered', rendered)
    this.stops.push(() => this.options.window.removeEventListener('eleckoi:message-rendered', rendered))
    this.stops.push(this.options.libraries.subscribeChanges(() => {
      void this.refreshConfiguration().catch(error => this.fail(error))
      this.refreshTavernCatalog()
    }))
    for (const source of [this.options.models, ...(this.options.catalogSources ?? [])])
      this.stops.push(source.subscribe(() => this.refreshTavernCatalog()))
    void this.consumeChanges().catch(error => { if (!this.closed) this.fail(error) })
    // Author errors remain editable without removing the management service.
    await this.refresh().catch(() => {})
  }

  private async refreshConfiguration(): Promise<void> {
    const current = this.current
    if (!current) { await this.refresh().catch(() => {}); return }
    const readRevision = ++this.configurationReadRevision
    const settingsRevision = this.settingsSnapshotRevision
    const stillCurrent = () => !this.closed && this.current === current && readRevision === this.configurationReadRevision
      && (!current.abort.signal.aborted || this.snapshot.status === 'error')
    let result: Awaited<ReturnType<NativeAuthorRuntimeOptions['remote']['eleckoiAuthorScripts']['read']>>
    try { result = await this.options.remote.eleckoiAuthorScripts.read(current.catalog.conversationId) }
    catch (error) { if (!stillCurrent()) return; throw error }
    if (this.closed || this.current !== current || readRevision !== this.configurationReadRevision
      || current.abort.signal.aborted && this.snapshot.status !== 'error') return
    if (!result.ok) throw Object.assign(new Error(result.error.message), result.error)
    // A real version change also cancels startup; duplicate file notifications do not restart it.
    if (result.value.version !== current.catalog.version) await this.refresh(true).catch(() => {})
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
    this.queue = next.catch(() => {})
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
    if (!result.ok) throw Object.assign(new Error(result.error.message), result.error)
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
    const scriptAdapters = new Map<string, AuthorHostAdapter>()
    const session = new AuthorScriptSession({ conversationId: selected.id, scripts: catalog.scripts,
      createFrame: script => {
        const frame = (this.options.createFrame || createAuthorScriptFrame)(this.options.window,
          catalog.scripts.find(item => item.key === script.key)!.entryUrl)
        const load = frame.load.bind(frame)
        return { ...frame, load: async (source, signal) => {
          signal.throwIfAborted()
          const compatibility = this.mountTavern(frame.window as AuthorBrowserWindow, {
            conversationId: selected.id, scriptId: script.id,
          }, scriptAdapters.get(script.key)!)
          await compatibility.ready
          signal.throwIfAborted()
          return load(source, signal)
        } }
      },
      adapter: script => {
        const owner = this.scriptUi.createOwner(selected.id, catalog.version, catalog.scripts.find(item => item.key === script.key)!)
        const adapter = { ...this.adapter(selected.id, '', { version: catalog.version, identity: owner.identity }, owner),
          registerButton: owner.registerButton, dispose: owner.dispose }
        scriptAdapters.set(script.key, adapter)
        return adapter
      },
      status: status => {
        const script = catalog.scripts.find(item => item.key === status.key)!
        this.publish({ ...this.snapshot, scriptStatuses: { ...this.snapshot.scriptStatuses,
          [status.key]: { ...status, scope: script.scope, ownerId: script.ownerId, source: script.source } } })
      } })
    const current = { catalog, revision, session, abort: new AbortController(), stream: undefined as ReturnType<Context['remote']['eleckoiAuthorScripts']['connect']> | undefined }
    this.current = current
    try {
      await session.start()
      if (this.closed || revision !== this.revision || current.abort.signal.aborted) return
      current.stream = this.options.remote.eleckoiAuthorScripts.connect(catalog.conversationId, catalog.version, current.abort.signal)
      const iterator = current.stream[Symbol.asyncIterator]()
      const first = await iterator.next()
      if (first.done || first.value.kind !== 'ready' || first.value.version !== catalog.version) throw new Error('Native author stream did not acknowledge its catalog')
      if (this.closed || revision !== this.revision) return
      this.publish({ ...this.snapshot, status: 'ready' })
      void this.consume(current, iterator).catch(error => {
        if (this.current === current && !this.closed && !current.abort.signal.aborted) this.fail(error)
      })
    } catch (error) {
      if (!this.closed && revision === this.revision) throw error
    }
  }

  private async consume(current: NonNullable<NativeAuthorClient['current']>, iterator: AsyncIterator<NativeAuthorRuleTask>): Promise<void> {
    while (!current.abort.signal.aborted) {
      const result = await iterator.next()
      if (result.done) throw new Error('Native author rule stream ended')
      const task = result.value
      if (task.kind === 'cancel') current.session.cancel(task.runId)
      else if (task.kind === 'process') {
        // Delivery stays live while an asynchronous author rule is awaiting work.
        void (async () => {
          try {
            if (task.scriptSettings) {
              // Settings cannot supersede this snapshot; changed code still needs a reload.
              this.settingsSnapshotRevision++
              current.session.updateSettings(task.scriptSettings)
            }
            const stateJson = await current.session.apply(task.runId, task.stage, task.stateJson, task.beforeJson)
            if (!current.abort.signal.aborted) await current.stream!.send({ id: task.id, ok: true, stateJson })
          } catch (error) {
            if (!current.abort.signal.aborted) await current.stream!.send({ id: task.id, ok: false, message: error instanceof Error ? error.message : String(error) })
          }
        })().catch(error => { if (!current.abort.signal.aborted) this.fail(error) })
      } else throw new Error('Duplicate native author stream acknowledgement')
    }
  }

  private adapter(conversationId: string, messageId: string,
    script?: { version: string; identity: NativeAuthorScriptIdentity }, uiOwner?: NativeScriptUiOwner): AuthorHostAdapter {
    const bindings = createAuthorVariableBindings(this.options.remote.eleckoiAuthorVariables, () => conversationId)
    const messages = createNativeMessageBindings(this.options.conversations, conversationId, messageId,
      () => this.assertChat(conversationId), () => this.options.window.crypto.randomUUID())
    const chats = createNativeChatBindings(this.options.conversations, this.options.models, this.options.remote,
      conversationId, () => this.assertChat(conversationId), () => this.generation.identity())
    const settings = createNativeSettingLibraryBindings(this.options.remote.eleckoiCharacterConfiguration,
      this.options.conversations.getDetailsSnapshot().details!.metadata.characterId, () => this.assertChat(conversationId))
    const presets = createNativePresetBindings(this.options.remote.eleckoiAgentPresets, () => this.assertChat(conversationId))
    const scriptSettings = script ? createNativeScriptSettingsBindings(this.options.remote.eleckoiAuthorScripts,
      conversationId, script.version, script.identity, () => this.refreshConfiguration()) : {}
    return {
      request: async (method, params, options) => {
        this.assertChat(conversationId); options.signal.throwIfAborted()
        if (params.conversationId !== undefined && params.conversationId !== conversationId) throw new Error('An author page cannot redirect its chat')
        if (method === 'ui.openPanel' || method === 'ui.closePanel') {
          if (!uiOwner) throw new Error('只有所属脚本可以打开或关闭作者面板')
          return uiOwner.request(method, params)
        }
        if (method === 'variables.getState' && params.messageId !== undefined) return messages[method]!(params, options)
        const variable = Object.hasOwn(bindings, method) ? bindings[method as keyof typeof bindings] : undefined
        if (variable) return variable(params, options)
        if (Object.hasOwn(messages, method)) return messages[method]!(params, options)
        if (Object.hasOwn(chats, method)) return chats[method]!(params, options)
        if (Object.hasOwn(settings, method)) return settings[method]!(params, options)
        if (Object.hasOwn(presets, method)) return presets[method]!(params, options)
        if (Object.hasOwn(scriptSettings, method)) return scriptSettings[method]!(params, options)
        if (nativeAudioMethods.includes(method as typeof nativeAudioMethods[number])) return this.audio.invoke(conversationId, method, params, options.signal)
        const details = this.options.conversations.getDetailsSnapshot().details!
        const opening = details.messages.find(message => message.id === 'opening')
        const openings = () => (opening?.openingOptions || []).map(item => ({ ...item, initialVariableState: JSON.parse(item.initialVariableStateJson) }))
        switch (method) {
          case 'app.getInfo': return { name: 'ElecKoi', apiVersion: '0.1.0', stage: 'preview' }
          case 'app.getCapabilities': return authorApiDefinitions.filter(item => Object.hasOwn(bindings, item.method) || Object.hasOwn(messages, item.method) || Object.hasOwn(chats, item.method) || Object.hasOwn(settings, item.method) || Object.hasOwn(presets, item.method) || Object.hasOwn(scriptSettings, item.method) || !!uiOwner && ['ui.openPanel', 'ui.closePanel'].includes(item.method) || nativeAudioMethods.includes(item.method as typeof nativeAudioMethods[number]) || ['app.getInfo', 'app.getCapabilities', 'context.current', 'openings.list', 'openings.current', 'openings.select', 'chat.send', 'chat.stopGeneration', 'input.get', 'input.set', 'input.append', 'input.clear', 'input.send', 'events.list'].includes(item.method))
          case 'context.current': return { surface: messageId ? 'message-renderer' : 'chat-ui', scope: 'current-character', conversationId,
            messageId, characterId: details.metadata.characterId, conversationTitle: details.conversation.title }
          case 'openings.list': return { items: openings() }
          case 'openings.current': return openings().find(item => item.id === opening?.selectedOpeningId) || null
          case 'openings.select': {
            if (typeof params.id !== 'string' || !params.id) throw new Error('Opening id is required')
            await this.options.conversations.selectOpening(conversationId, params.id); return { selectedId: params.id }
          }
          case 'chat.send': {
            if (typeof params.text !== 'string') throw new Error('Message text must be a string')
            const images = params.attachments as Parameters<ElecKoiConversations['send']>[0]['images']
            if (!Array.isArray(images) || images.some(image => !image || typeof image.data !== 'string' || !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(image.mediaType))) throw new Error('Invalid message images')
            if (!params.text.trim() && !images.length) throw new Error('A user message cannot be empty')
            const requestId = this.options.window.crypto.randomUUID()
            const result = await this.options.conversations.send({ conversationId, requestId, text: params.text, images, signal: options.signal })
            if (result.cancelled) throw new Error('Message generation was cancelled')
            const inputs = result.details?.messages.filter(message => message.role === 'user' && message.requestId === requestId) || []
            if (inputs.length !== 1 || !inputs[0]!.id || !result.details?.runtimeSessionId) throw new Error('Completed message request has no unique formal identity')
            return { accepted: true, conversationId, runId: result.details.runtimeSessionId, messageId: inputs[0]!.id }
          }
          case 'chat.stopGeneration': {
            return { cancelled: await this.options.conversations.cancelGeneration(conversationId) }
          }
          case 'events.list': return { items: AUTHOR_EVENT_NAMES }
          default: {
            if (!['input.get', 'input.set', 'input.append', 'input.clear', 'input.send'].includes(method)) throw new Error(`Native author method is not connected: ${method}`)
            if (['input.set', 'input.append'].includes(method) && typeof params.text !== 'string') throw new Error('Input text must be a string')
            const handler = this.ui.get(conversationId)?.[method]
            if (!handler) throw new Error('Current chat input is not mounted')
            return handler(params)
          }
        }
      },
      on: (event, listener) => {
        this.assertChat(conversationId)
        if (!AUTHOR_EVENT_NAMES.some(name => name === event)) throw new Error(`Native author event is not connected: ${event}`)
        const key = JSON.stringify([conversationId, event]), listeners = this.events.get(key) || new Set()
        listeners.add(listener); this.events.set(key, listeners)
        return () => { listeners.delete(listener); if (!listeners.size) this.events.delete(key) }
      }
    }
  }

  private async consumeChanges(): Promise<void> {
    const stream = this.options.remote.eleckoiConversations.changes(this.lifetime.signal)
    try {
      for await (const change of stream) {
        if (change.kind === 'catalog') { this.refreshTavernCatalog(); continue }
        if (change.kind !== 'messages') continue
        const { conversationId, reason, messageIds } = change
        this.emitAuthorEvent('messages.changed', { conversationId, reason, messageIds })
      }
      if (!this.closed) throw new Error('Native author conversation changes stream ended')
    } finally { await stream.dispose() }
  }
  private emitAuthorEvent<TName extends AuthorEventName>(event: TName, payload: AuthorEventMap[TName]): void {
    for (const listener of this.events.get(JSON.stringify([payload.conversationId, event])) ?? []) listener(structuredClone(payload))
    const selected = this.options.conversations.getDetailsSnapshot()
    if (this.isActive(selected) && selected.id === payload.conversationId) {
      for (const listener of this.projectEvents.get(event) ?? []) listener(structuredClone(payload))
    }
    void this.bridgeTavernEvent(event, payload).catch(error => { if (!this.closed) this.options.report(error) })
  }
  private emitTavern(event: string, ...args: unknown[]): void {
    for (const result of this.tavernShared.eventHub.emit(event, ...args)) {
      if (result && (typeof result === 'object' || typeof result === 'function') && 'then' in result && typeof result.then === 'function') {
        void Promise.resolve(result).catch(error => this.options.report(error))
      }
    }
  }
  private queueTavern(task: () => Promise<void>): void {
    this.tavernEventTail = this.tavernEventTail.then(task).catch(error => { if (!this.closed) this.options.report(error) })
  }
  private refreshTavernCatalog(): void {
    this.queueTavern(async () => {
      if (this.closed) return
      const mounted = [...this.tavernDocuments.values()].find(document => document.conversationId === this.tavernSelectedChat)
      if (mounted) await mounted.refresh()
    })
  }
  private observeTavernChat(): void {
    const selected = this.options.conversations.getDetailsSnapshot()
    if (!this.isActive(selected)) return
    const changed = selected.id !== this.tavernSelectedChat
    this.tavernSelectedChat = selected.id
    const id = selected.id, messages = structuredClone(selected.details!.messages)
    this.queueTavern(async () => {
      if (this.closed || this.tavernSelectedChat !== id) return
      if (changed) {
        const mounted = [...this.tavernDocuments.values()].find(document => document.conversationId === id)
        if (mounted) await mounted.refresh()
      }
      if (!this.closed && this.tavernSelectedChat === id) this.tavernEvents.observe(id, messages)
    })
  }
  private bridgeTavernEvent<TName extends AuthorEventName>(event: TName, payload: AuthorEventMap[TName]): Promise<void> {
    this.queueTavern(async () => {
      if (this.closed || payload.conversationId !== this.tavernSelectedChat) return
      if (event === 'messages.changed' || event === 'agent.run.finished') {
        const mounted = [...this.tavernDocuments.values()].find(document => document.conversationId === payload.conversationId)
        if (mounted) await mounted.refresh()
        if (this.closed || payload.conversationId !== this.tavernSelectedChat) return
      }
      const record = this.tavernShared.conversations.get(payload.conversationId)?.snapshot
      const messages = record?.messages ?? this.options.conversations.getDetailsSnapshot().details?.messages ?? []
      this.tavernEvents.accept(event, payload, messages)
    })
    return this.tavernEventTail
  }
  private assertChat(id: string): void {
    const selected = this.options.conversations.getDetailsSnapshot()
    if (this.closed || selected.id !== id || !this.isActive(selected)) throw new Error('Author page chat is closed or no longer active')
  }
  private isActive(selected: ReturnType<ElecKoiConversations['getDetailsSnapshot']>): boolean {
    return !!selected.id && !!selected.details && (selected.status === 'ready' || selected.status === 'loading')
  }
  private publish(snapshot: NativeAuthorRuntimeSnapshot): void {
    this.snapshot = { ...snapshot, auxiliaryGenerating: [...this.auxiliaryGenerations.values()].some(task => task.conversationId === snapshot.conversationId && !task.shouldSilence) }
    for (const listener of this.listeners) listener()
  }
  private fail(error: unknown): void {
    if (this.closed) return
    this.scriptUi.close()
    this.current?.abort.abort(error)
    void this.current?.session.close().catch(cleanupError => this.options.report(cleanupError))
    this.publish({ ...this.snapshot, status: 'error', error: error instanceof Error ? error.message : String(error) }); this.reportTavernReadyError(error)
  }
  private async stopCurrent(): Promise<void> {
    this.scriptUi.close()
    const current = this.current; this.current = undefined
    if (!current) return
    current.abort.abort(new Error('Native author generation closed'))
    try { await current.stream?.dispose() } finally { await current.session.close() }
  }
  /** @internal */
  async dispose(): Promise<void> {
    if (this.closed) return
    this.closed = true; this.revision++
    this.lifetime.abort(new Error('Native author runtime closed'))
    this.stops.splice(0).forEach(stop => stop())
    for (const page of this.documents) page.close()
    for (const document of this.tavernDocuments.values()) document.dispose()
    this.tavernDocuments.clear()
    this.functionTools?.dispose()
    this.tavernReadyErrors.clear()
    await this.tavernClient.dispose()
    this.generation.dispose(); this.audio.dispose(); this.ui.clear(); this.events.clear(); this.projectEvents.clear()
    try { await this.stopCurrent() }
    finally { this.scriptUi.dispose(); this.publish({ ...this.snapshot, status: 'closed' }); this.listeners.clear() }
  }
}
