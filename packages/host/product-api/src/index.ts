import type { Context, Plugin } from '@deepseek-ai/cordis'
import { ElecKoiConversationLifecycle } from './conversationLifecycle.js'
import { parseChatImport } from './chatImport.js'
import { registerHostApiInspect } from './hostInspect.js'
import { randomUUID } from 'node:crypto'
import { GLOBAL_SETTING_LIBRARY_ID } from '@eleckoi/dsh-product-data'
import { RemoteChangeFeed } from './remote-change-feed.js'
import z from '@deepseek-ai/schemastery'
import { ElecKoiTavernCompatibilityApi } from './tavern-compatibility.js'
export { ElecKoiTavernCompatibilityApi } from './tavern-compatibility.js'
export type { TavernCompatibilityJson, TavernCompatibilityRecord, TavernAuxiliaryGenerationEvent, TavernAuxiliaryGenerationResult } from './types.js'
import { ElecKoiAuthorFrontendsApi, eleckoiFrontendAssetsPlugin } from './author-frontends.js'
export { ElecKoiAuthorFrontendsApi, eleckoiFrontendAssetsPlugin } from './author-frontends.js'
export type * from './frontend-project-types.js'
import { join } from 'node:path'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-config-editor'
import type {} from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import type {} from '@deepseek-ai/dsh-session-projection'
import type {} from '@eleckoi/dsh-client-roleplay/projections'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import { SessionLogOffset, type SessionEvent, type SessionHeader, type SessionId } from '@deepseek-ai/dsh-session'

declare module '@deepseek-ai/dsh-session' {
  interface SessionEventMap {
    'eleckoi/input-continuation': { turn: number; inputMessageId: string; inputEventSeq: number; mode?: 'continue'; targetAssistantMessageId?: string; requestId?: string; operationId?: string }
  }
}
import type {} from '@deepseek-ai/dsh-session-persistence'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {
  AgentPreset,
  AgentPresetCatalog,
  AgentPresetExportFormat,
  AgentPresetExportResult,
  AgentPresetImportDocument,
  AgentPresetImportResult,
  AgentPresetImportSource,
  AgentPresetPurpose,
  AuthorConversationState,
  CreateCreatorProjectInput,
  CreatorStudioRuntime,
  CreatorStudioSession,
  CreatorStudioSessionSummary,
  CreatorStudioMessage,
  CharacterCollection,
  CharacterExportFormat,
  CharacterExportResult,
  CharacterGroupAssignment,
  CharacterImportFile,
  CharacterImportPreview,
  CharacterImportResult,
  CharacterImportSource,
  CharacterRecord,
  CharacterConfigurationChange,
  ConversationChange,
  ConversationArchiveSnapshot,
  ConversationModelSelection,
  ConversationCreateInput,
  ConversationDetailsMetadata,
  ConversationRequestPreview,
  ConversationRequestPreviewSummary,
  ConversationMessageDisplayInput,
  ConversationMessageDisplayResult,
  ConversationSummary,
  CreatorProjectCollection,
  DisplayPreferencesSnapshot,
  DisplayPreferenceValue,
  ElecKoiHostStatus,
  ElecKoiProductDataStore,
  PersonaProfile,
  ProductRecordChange,
  RegexRule,
  RegexRuleCollection,
  RegexRuleImportDocument,
  RegexRuleImportResult,
  RegexRuleScope,
  RegexRuleTarget,
  RegexRuleTestResult,
  SettingLibrary,
  SettingLibraryContent,
  SettingLibraryConversation,
  SettingLibraryEntry,
  SettingLibraryEntryUpdate,
  ScriptLibrary,
  ScriptLibraryScope,
  ScriptWorkspace,
  TavilyConnection,
  TavernCompatibilityRecord,
  WebSearchMode,
  VariableConfig,
  VariableViewerTimeline
} from './types.js'
import { testTavilyConnection } from './tavily.js'
import { ElecKoiVariableProcessing } from './variable-processing.js'
import { ElecKoiAuthorVariablesApi } from './author-variables.js'
import { ElecKoiAuthorScriptsApi, eleckoiScriptAssetsPlugin } from './author-scripts.js'
export { ElecKoiAuthorVariablesApi } from './author-variables.js'
export { ElecKoiAuthorScriptsApi, eleckoiScriptAssetsPlugin } from './author-scripts.js'
export type { NativeAuthorScriptCatalog, NativeAuthorRuleTask, NativeAuthorRuleReply, ScriptWorkspace } from './types.js'
export { ElecKoiVariableProcessing } from './variable-processing.js'
export type { VariableRuleProvider, VariableRuleRun, VariableRuleContext } from './variable-processing.js'
export type { ScriptLibrary, ScriptLibraryScope, ScriptTree } from './types.js'
import type { ElecKoiSessionEditor } from './sessionEditor.js'
export type { ElecKoiSessionEditor } from './sessionEditor.js'
import { testModelConnection, discoverDraftModels, readModelApiKey } from './modelConnection.js'
export { testModelConnection, discoverDraftModels, readModelApiKey } from './modelConnection.js'
import type { ModelConnectionInput, ModelDiscoveryInput, ModelDiscoveryResult } from './types.js'

export type {
  AgentPreset,
  AgentPresetCatalog,
  AgentPresetExportFormat,
  AgentPresetExportResult,
  AgentPresetImportDocument,
  AgentPresetImportResult,
  AgentPresetImportSource,
  AgentPresetPurpose,
  AgentPresetLibraryGroup,
  AgentPresetModelFamily,
  AgentPresetModelTag,
  AgentPresetProfile,
  AgentPresetSummary,
  AgentPresetTimelineItem,
  AgentToolGroup,
  AgentToolMember,
  AuthorConversationState,
  TavilyConnection,
  WebSearchMode,
  CreateCreatorProjectInput,
  CharacterCollection,
  CharacterExportFormat,
  CharacterExportResult,
  CharacterGroupAssignment,
  CharacterImportFile,
  CharacterImportPreview,
  CharacterImportPreviewItem,
  CharacterImportResult,
  CharacterImportSource,
  CharacterPersona,
  CharacterRecord,
  CharacterConfigurationChange,
  ConversationChange,
  ConversationModelSelection,
  ConversationMetadata,
  ConversationArchiveSnapshot,
  ConversationRecord,
  ConversationCreateInput,
  ConversationRequestPreview,
  ConversationRequestPreviewSummary,
  ConversationSummary,
  CreatorProject,
  CreatorProjectCollection,
  CreatorProjectMode,
  DisplayPreferencesSnapshot,
  DisplayPreferenceValue,
  ElecKoiHostStatus,
  PersonaProfile,
  ProductRecordChange,
  RegexRule,
  RegexRuleCollection,
  RegexRuleImportDocument,
  RegexRuleImportResult,
  RegexRuleScope,
  RegexRuleTarget,
  RegexRuleTestResult,
  RegexRuleVersion,
  SettingLibrary,
  SettingLibraryContent,
  SettingLibraryConversation,
  SettingLibraryEntry,
  SettingLibraryEntryChanges,
  SettingLibraryEntryUpdate,
  SettingLibraryGroup,
  SettingLibraryPromptPosition,
  SettingLibraryVersion,
  VariableConfig,
  VariableConfigVersion,
  VariableItemConfig,
  VariableObjectConfig,
  VariableViewerTimeline
} from './types.js'

declare module '@deepseek-ai/cordis' {
  interface Context {
    eleckoiSystemApi: ElecKoiSystemApi
    eleckoiModelsApi: ElecKoiModelsApi
    eleckoiPersonaApi: ElecKoiPersonaApi
    eleckoiCharactersApi: ElecKoiCharactersApi
    eleckoiCharacterConfigurationApi: ElecKoiCharacterConfigurationApi
    eleckoiAgentPresetsApi: ElecKoiAgentPresetsApi
    eleckoiCreatorStudioApi: ElecKoiCreatorStudioApi
    eleckoiCreatorStudioSessionsApi: ElecKoiCreatorStudioSessionsApi
    eleckoiCreatorStudioRuntime: CreatorStudioRuntime
    eleckoiWebSearchApi: ElecKoiWebSearchApi
    eleckoiDisplayPreferencesApi: ElecKoiDisplayPreferencesApi
    eleckoiConversationModelsApi: ElecKoiConversationModelsApi
    eleckoiConversationsApi: ElecKoiConversationsApi
    eleckoiConversationChanges: ConversationChangeFeed
    eleckoiCharacterConfigurationChanges: CharacterConfigurationChangeFeed
    eleckoiProductRecordChanges: ProductRecordChangeFeed
    eleckoiProductData: ElecKoiProductDataStore
    /** @internal 原生变量候选处理及作者 Web 回调装配。 */
    eleckoiVariableProcessing: ElecKoiVariableProcessing
    /** @internal 聊天操作互斥和本轮产品保存等待。 */
    eleckoiConversationLifecycle: ElecKoiConversationLifecycle
    eleckoiRoleplaySessions: {
      readWorldbookState(conversationId: string): Record<string, unknown>
      worldbookTimedEffect(conversationId: string, entryId: string, kind: string, duration: number, value?: unknown): Promise<{ active: boolean; remaining: number }>
      readGeneratedImage(conversationId: string, batchId: string, frameId: number, attachmentId: string, signal: AbortSignal): Promise<{ mediaType: string; data: string }>
      regenerateImage(conversationId: string, batchId: string, frameId: number, signal: AbortSignal): Promise<import('@eleckoi/dsh-product-data').GeneratedImageFrame>
      create(conversationId: string): Promise<string>
      adoptFork(conversationId: string, sourceConversationId: string, sourceTurn: number, afterTurn: boolean): Promise<string>
      prepareSessionAccess(conversationId: string): Promise<string>
      withGenerationOptions<T>(conversationId: string, options: Record<string, unknown>, action: () => T | Promise<T>): Promise<T>
      preparePrompt(conversationId: string, text: string, signal?: AbortSignal): Promise<string>
      prepareContinuation(conversationId: string, text: string, signal?: AbortSignal): Promise<string>
      previewPrompt(conversationId: string, text: string, continuation?: boolean): Promise<{ model: Record<string, unknown>; messages: readonly import('@deepseek-ai/dsh-llm').Message[]; dryRun: boolean }>
      currentOperation(conversationId: string): string
      releasePreparation(conversationId: string, operationId: string): Promise<void>
      prepareRegeneration(conversationId: string, text: string): Promise<{
        rollback(): void
      }>
      variableStatesByTurn(conversationId: string): Record<string, string>
      rewriteMessageCheckpoints(conversationId: string, turns: Array<{ previous: number; current: number }>,
        messages: Array<{ turn: number | null; variableStateJson: string }>): { rollback(): void }
      prepareRestoreBeforeTurn(conversationId: string, sessionId: string, fromTurn: number, beforeMessageId?: string): {
        state: import('./types.js').ConversationRuntimeStateSnapshot
        apply(): void
        rollback(): void
      }
      removeArtifacts(conversationId: string, sessionId: string): Promise<void>
    }
    eleckoiSessionEditor: ElecKoiSessionEditor
  }
}

declare module '@deepseek-ai/dsh-llm/types' {
  interface MessageSourceMap {
    'eleckoi-group': { kind: 'eleckoi-group'; conversationId: string; characterId: string }
  }
}

const WEB_ENTRY_ID = 'web'
const DEEPSEEK_WEB_PROVIDER = 'deepseek-official'
const TAVILY_WEB_PROVIDER = 'tavily'
const TAVILY_API_KEY_REF = 'TAVILY_API_KEY'
const DISPLAY_PREFERENCES_NAMESPACE = 'eleckoi-display-preferences'


export class ConversationChangeFeed extends RemoteChangeFeed<ConversationChange> {
  constructor() {
    super({ kind: 'snapshot' })
  }
}

export class CharacterConfigurationChangeFeed extends RemoteChangeFeed<CharacterConfigurationChange> {
  constructor() {
    super({ kind: 'snapshot' })
  }
}

export class ProductRecordChangeFeed extends RemoteChangeFeed<ProductRecordChange> {
  constructor() {
    super({ kind: 'snapshot' })
  }
}

function productRecordChanges(
  feed: ProductRecordChangeFeed,
  signal: AbortSignal,
  domain: Exclude<ProductRecordChange, { kind: 'snapshot' }>['domain']
): AsyncIterable<ProductRecordChange> {
  return (async function* () {
    for await (const change of feed.stream(signal)) {
      if (change.kind === 'snapshot' || change.domain === domain) yield change
    }
  })()
}

/** 管理界面和聊天显示偏好，通过官方 Typert Remote 公开跨端调用。 */
export class ElecKoiDisplayPreferencesApi extends TypertRemoteService {
  static inject = ['typert', 'settings', 'eleckoiProductData']

  private readonly ownerContext: Context
  private readonly productData: ElecKoiProductDataStore

  constructor(ctx: Context) {
    super(ctx, 'eleckoiDisplayPreferencesApi', { namespace: 'eleckoiDisplayPreferences' })
    this.ownerContext = ctx
    this.productData = ctx.eleckoiProductData
  }

  /**
   * 读取完整保存数据。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  read(): DisplayPreferencesSnapshot {
    return this.snapshot()
  }

  /**
   * 保存界面偏好并处理需写入媒体库的壁纸。
   * @param ui - 完整界面偏好。
   * @param expectedRevision - 要求仍有效的配置版本；不匹配时拒绝保存。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  async updateUi(
    ui: Record<string, DisplayPreferenceValue>,
    expectedRevision?: number
  ): Promise<DisplayPreferencesSnapshot> {
    const pending = this.productData.prepareDisplayUi(ui)
    try {
      await this.ownerContext.settings.mutate(
        DISPLAY_PREFERENCES_NAMESPACE,
        [{ op: 'set', path: ['ui'], value: pending.value }],
        expectedRevision
      )
      pending.commit()
      this.productData.setDisplayPreferences(pending.value)
      return this.snapshot()
    } catch (error) {
      pending.rollback()
      throw error
    }
  }

  /**
   * 保存聊天显示偏好。
   * @param chatDisplay - 完整聊天显示偏好。
   * @param expectedRevision - 要求仍有效的配置版本；不匹配时拒绝保存。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  async setChatDisplay(
    chatDisplay: Record<string, DisplayPreferenceValue>,
    expectedRevision?: number
  ): Promise<DisplayPreferencesSnapshot> {
    await this.ownerContext.settings.mutate(
      DISPLAY_PREFERENCES_NAMESPACE,
      [{ op: 'set', path: ['chatDisplay'], value: chatDisplay }],
      expectedRevision
    )
    return this.snapshot()
  }

  private snapshot(): DisplayPreferencesSnapshot {
    const descriptor = this.ownerContext.settings.describe()
      .find(item => item.ns === DISPLAY_PREFERENCES_NAMESPACE)
    if (!descriptor) throw new Error('DSH 显示偏好配置尚未加载。')
    const value = jsonObject(descriptor.value)
    return {
      ui: jsonObject(value.ui),
      chatDisplay: jsonObject(this.productData.normalizeChatDisplaySettings(value.chatDisplay)),
      writable: this.ownerContext.settings.writable,
      revision: descriptor.revision
    }
  }
}

/** 管理所有聊天下一轮共同使用的模型，通过官方 Typert Remote 公开跨端调用。 */
export class ElecKoiConversationModelsApi extends TypertRemoteService {
  static inject = ['typert', 'llm', 'agentDefaultModel']

  private readonly ownerContext: Context

  constructor(ctx: Context) {
    super(ctx, 'eleckoiConversationModelsApi', { namespace: 'eleckoiConversationModels' })
    this.ownerContext = ctx
  }

  /**
   * 读取下一轮使用的全局模型。
   * @param conversationId - ElecKoi 聊天编号。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  async current(conversationId: string): Promise<ConversationModelSelection> {
    void conversationId
    const selected = this.ownerContext.agentDefaultModel.currentSelection()
    return {
      provider: selected.provider,
      model: selected.model,
      ...(selected.reasoningEffort === undefined ? {} : { reasoningEffort: String(selected.reasoningEffort) })
    }
  }

  /**
   * 保存当前选择。
   * @param conversationId - ElecKoi 聊天编号。
   * @param selection - 模型提供商、模型编号和可选推理档位。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  async select(conversationId: string, selection: ConversationModelSelection): Promise<ConversationModelSelection> {
    void conversationId
    const selected = await this.ownerContext.llm.resolveCallConfig({
      provider: selection.provider,
      model: selection.model,
      ...(selection.reasoningEffort === undefined
        ? {}
        : { reasoningEffort: ReasoningEffortId(selection.reasoningEffort) })
    })
    await this.ownerContext.agentDefaultModel.saveSelection(selected)
    return {
      provider: selected.provider,
      model: selected.model,
      ...(selected.reasoningEffort === undefined ? {} : { reasoningEffort: String(selected.reasoningEffort) })
    }
  }
}

/** 管理聊天目录、产品资料和官方 Session 消息修改，通过官方 Typert Remote 公开跨端调用。 */
export class ElecKoiConversationsApi extends TypertRemoteService {
  private readonly pendingRegenerations = new Map<string, { requestId: string; inputMessageId: string; inputEventSeq: number;
    groupActor?: { groupId: string; characterId: string; name: string; avatar: string }; groupContinue?: boolean }>()
  static inject = [
    'typert',
    'agents',
    'sessionController',
    'sessionPersistence',
    'eleckoiProductData',
    'eleckoiVariableProcessing',
    'eleckoiConversationLifecycle',
    'eleckoiRoleplaySessions',
    'eleckoiSessionEditor',
    'eleckoiRequestPreviews',
    'eleckoiConversationChanges'
  ]

  private readonly ownerContext: Context
  private readonly productData: ElecKoiProductDataStore
  private readonly changeFeed: ConversationChangeFeed

  /**
   * 读取本聊天生图记录引用的单张图片。
   * @param conversationId - 聊天编号。
   * @param batchId - 生图指令编号。
   * @param frameId - 图片编号。
   * @param attachmentId - 当前正式图片对象编号。
   * @param signal - 取消图片读取的信号。
   * @returns 图片媒体类型和 Base64 数据。
   */
  @Remote
  readGeneratedImage(conversationId: string, batchId: string, frameId: number, attachmentId: string, signal: AbortSignal): Promise<{ mediaType: string; data: string }> {
    return this.ownerContext.eleckoiRoleplaySessions.readGeneratedImage(conversationId, batchId, frameId, attachmentId, signal)
  }

  /**
   * 从原始 AI 回复重新解析提示词，只重画选中的单张图片。
   * @param conversationId - 聊天编号。
   * @param batchId - 本轮生图指令编号。
   * @param frameId - 指令中的图片编号。
   * @param signal - 取消生图请求的信号。
   * @returns 图片生成与记录保存完成；失败抛出可诊断错误。
   */
  @Remote
  async regenerateImage(conversationId: string, batchId: string, frameId: number, signal: AbortSignal): Promise<void> {
    if (!batchId || !Number.isSafeInteger(frameId) || frameId < 1) throw new Error('图片重新生成参数不正确。')
    await this.ownerContext.eleckoiConversationLifecycle.exclusive(conversationId, async () => {
      const result = await this.ownerContext.eleckoiRoleplaySessions.regenerateImage(conversationId, batchId, frameId, signal)
      this.changeFeed.publish({ kind: 'generation', conversationId, error: result.error || '' })
      if (result.error) throw new Error(result.error)
    })
  }

  constructor(ctx: Context) {
    super(ctx, 'eleckoiConversationsApi', { namespace: 'eleckoiConversations' })
    this.ownerContext = ctx
    this.productData = ctx.eleckoiProductData
    this.changeFeed = ctx.eleckoiConversationChanges
  }

  /**
   * 订阅变更通知；连接后首先收到刷新标记，取消信号结束此异步流。
   * @param signal - 取消调用或结束订阅流的信号。
   * @returns 按发生顺序返回变更通知的异步流。
   */
  @Remote({ mode: 'stream' })
  changes(signal: AbortSignal): AsyncIterable<ConversationChange> {
    return this.changeFeed.stream(signal)
  }

  /**
   * 读取目录。
   * @param signal - 取消调用或结束订阅流的信号。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  async list(signal: AbortSignal): Promise<ConversationSummary[]> {
    const records = this.productData.readConversationCatalog()
    const listed = await this.ownerContext.sessionController.list({}, signal)
    const previews = new Map(listed.items.map(item => [
      String(item.sessionId), item.projections?.values.eleckoiConversationPreview
    ]))
    return records.map(summary => ({
      ...summary, preview: previews.get(summary.runtimeSessionId) || summary.preview
    }))
  }

  /**
   * 订阅当前运行期间实际请求的轻量目录；关闭 Host 后不恢复。
   * @param conversationId - ElecKoi 聊天编号。
   * @param signal - 取消订阅的信号。
   * @returns 仅包含轮次、请求编号和模型的目录流。
   */
  @Remote({ mode: 'stream' })
  requestPreviews(conversationId: string, signal: AbortSignal): AsyncIterable<ConversationRequestPreviewSummary[]> {
    const sessionId = this.productData.readConversationDetails(conversationId).runtimeSessionId as SessionId
    return this.ownerContext.eleckoiRequestPreviews.stream(sessionId, signal)
  }

  /**
   * 读取当前运行期间捕获的指定请求，不读取 Session 日志或当前设定重算。
   * @param conversationId - ElecKoi 聊天编号。
   * @param requestId - 当前运行期间请求目录中的正式标识。
   * @param signal - 取消本次读取的信号。
   * @returns 按实际发送顺序排列的可读输入；关闭后或不存在的请求抛出原因。
   */
  @Remote
  requestPreview(conversationId: string, requestId: string, signal: AbortSignal): ConversationRequestPreview {
    signal.throwIfAborted()
    const sessionId = this.productData.readConversationDetails(conversationId).runtimeSessionId
    return this.ownerContext.eleckoiRequestPreviews.read(sessionId, requestId)
  }

  /**
   * 读取聊天关联资料和消息元数据；消息正文由官方 Session 读取。
   * @param conversationId - ElecKoi 聊天编号。
   * @param beforeSequence - 分页消息边界，读取该事件序号之前的消息。
   * @param limit - 分页最多读取的消息数量。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  details(conversationId: string, beforeSequence?: number, limit?: number): ConversationDetailsMetadata {
    return {
      ...this.productData.readConversationDetails(conversationId, beforeSequence, limit),
      metadata: { ...this.productData.readConversationDetails(conversationId, beforeSequence, limit).metadata,
        groupId: this.ownerContext.eleckoiTavernCompatibilityApi?.groupSnapshot(conversationId).groupId ?? null },
      runtimeVariableStateByTurn: this.ownerContext.eleckoiRoleplaySessions.variableStatesByTurn(conversationId)
    }
  }

  /** @internal Read actual Session text and join product annotations for compatibility realms. */
  async tavernSnapshot(conversationId: string): Promise<Record<string, unknown>> {
    if (!conversationId) return { messages: [] }
    const details = this.details(conversationId, undefined, 200)
    const metadata = [...details.messages]
    let page = details
    while (page.hasMore && page.beforeSequence !== null) {
      page = this.details(conversationId, page.beforeSequence, 200)
      metadata.unshift(...page.messages)
    }
    const sessionId = details.runtimeSessionId
    const inspection = await this.ownerContext.sessionController.inspect(sessionId as SessionId)
    const history = this.productData.readRuntimeVariableHistory(conversationId, sessionId)
    const historicalByTurn = new Map<number, typeof history>()
    for (const row of history) historicalByTurn.set(row.turn, [...(historicalByTurn.get(row.turn) ?? []), row])
    const assistants = sessionAssistantMessages(conversationId, sessionId, inspection.events,
      details.runtimeVariableStateByTurn ?? {}, historicalByTurn)
    const opening = metadata.filter(row => row.id === 'opening').map(row => ({ ...row,
      content: row.content ?? '', variableState: JSON.parse(row.variableStateJson),
      openingOptions: row.openingOptions?.map(option => ({ ...option, initialVariableState: JSON.parse(option.initialVariableStateJson) })) }))
    const groupModule = '@eleckoi/dsh-client-roleplay/host/native-group-chat.mjs'
    const { groupSpeakerRows } = await import(groupModule)
    const groupSpeakers = groupSpeakerRows(inspection.events)
    const rows: Array<ConversationMessageDisplayInput & Record<string, unknown>> = []
    const initialVariableStateJson = this.productData.readAuthorConversationState(conversationId).initialVariableStateJson
    for (const [index, value] of inspection.events.entries()) {
      const event = jsonRecord(value), input = jsonRecord(event.data)
      if (event.type !== 'user/message' || event.surfaceOp !== 'append' || jsonRecord(input.source).kind !== 'user') continue
      const messageId = typeof input.id === 'string' ? input.id : ''
      const source = metadata.find(row => row.role === 'user' && (row.dshMessageId === messageId || row.id === messageId || row.sessionEventSeq === event.seq))
      const rawTime = Number(event.time ?? input.time)
      rows.push({ ...source, id: source?.id ?? (messageId || `dsh-${sessionId}-${String(event.seq)}-user`), role: 'user',
        conversationId, content: sessionMessageText(event), rawContent: sessionMessageText(event),
        variableStateJson: source?.variableStateJson ?? assistants.filter(row => row.sessionEventSeq < Number(event.seq)).at(-1)?.variableStateJson ?? initialVariableStateJson,
        status: source?.status ?? 'complete', createdAt: source?.createdAt ?? new Date(Number.isFinite(rawTime) ? rawTime : 0).toISOString(),
        runtimeSessionId: sessionId, dshMessageId: messageId, sessionEventSeq: Number(event.seq), dshTurn: sessionMessageTurn(inspection.events, index) })
    }
    for (const assistant of assistants) {
      const source = metadata.find(row => row.role === 'assistant' && row.id === historicalByTurn.get(assistant.dshTurn)?.[0]?.messageId)
      const event = jsonRecord(inspection.events.find(candidate => Number(jsonRecord(candidate).seq) === assistant.sessionEventSeq))
      const messageId = jsonRecord(jsonRecord(event.data).message).id
      rows.push({ ...source, ...assistant, id: source?.id ?? (typeof messageId === 'string' ? messageId : assistant.id),
        dshMessageId: typeof messageId === 'string' ? messageId : '', rawContent: assistant.content, content: officialFinalReplyText(assistant.content),
        ...(groupSpeakers.get(messageId) ? { speakerCharacterId: groupSpeakers.get(messageId).characterId,
          speakerName: groupSpeakers.get(messageId).speakerName, speakerAvatar: groupSpeakers.get(messageId).speakerAvatar,
          groupId: groupSpeakers.get(messageId).groupId } : {}) })
    }
    rows.sort((left, right) => Number(left.sessionEventSeq) - Number(right.sessionEventSeq))
    const continuationModule = '@eleckoi/dsh-client-roleplay/host/assistant-continuation.mjs'
    const { assistantContinuationLinks, mergeAssistantContinuationRows } = await import(continuationModule)
    mergeAssistantContinuationRows(rows, assistantContinuationLinks(inspection.events))
    const displays = new Map(this.productData.projectConversationMessages(conversationId, rows).map(row => [row.id, row]))
    const systemMessages = inspection.events.flatMap(candidate => {
      const event = jsonRecord(candidate), data = jsonRecord(event.data)
      const message = event.type === 'user/message' ? data : jsonRecord(data.message)
      const authoredSystem = event.type === 'user/message' && jsonRecord(message.source).kind === 'plugin:eleckoi-author-system'
      if ((!authoredSystem && event.type !== 'system/message') || event.surfaceOp !== 'append') return []
      return [{ id: String(message.id), dshMessageId: String(message.id), role: 'system', content: Array.isArray(message.content)
        ? message.content.filter(item => jsonRecord(item).type === 'text').map(item => String(jsonRecord(item).text)).join('') : '',
        sessionEventSeq: Number(event.seq), dshTurn: authoredSystem ? sessionMessageTurn(inspection.events, inspection.events.indexOf(candidate)) : Number(data.turn) }]
    })
    return { systemMessages, messages: [...opening, ...rows.map(row => ({ ...row, displayContent: displays.get(row.id)?.displayContent ?? row.content,
      variableState: JSON.parse(displays.get(row.id)?.variableStateJson ?? row.variableStateJson),
      speakerName: row.speakerName ?? (row.role === 'user' ? details.metadata.characterPersona.user_name : details.metadata.characterName) }))]
      .map((row, messageIndex) => ({ ...row, messageIndex })) }
  }

  /**
   * 根据正则和变量计算消息的显示正文。
   * @param conversationId - ElecKoi 聊天编号。
   * @param messages - 需要计算显示正文的消息列表。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  projectDisplay(
    conversationId: string,
    messages: ConversationMessageDisplayInput[]
  ): ConversationMessageDisplayResult[] {
    if (!Array.isArray(messages) || messages.length > 200) throw new Error('待显示的消息数量无效。')
    let totalLength = 0
    for (const message of messages) {
      if (!message || typeof message.id !== 'string' || !message.id
        || (message.role !== 'user' && message.role !== 'assistant')
        || typeof message.content !== 'string'
        || typeof message.variableStateJson !== 'string'
        || !['complete', 'streaming', 'error', 'cancelled'].includes(message.status)
        || typeof message.createdAt !== 'string') {
        throw new Error('待显示的消息格式无效。')
      }
      totalLength += message.content.length + message.variableStateJson.length
    }
    if (totalLength > 4 * 1024 * 1024) throw new Error('待显示的消息内容过大。')
    return this.productData.projectConversationMessages(conversationId, messages)
  }

  /**
   * 读取各聊天楼层的变量状态。
   * @param conversationId - ElecKoi 聊天编号。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  async variableTimeline(conversationId: string): Promise<VariableViewerTimeline> {
    const runtimeSessionId = this.productData.runtimeSessionId(conversationId)
    const inspection = await this.ownerContext.sessionController.inspect(runtimeSessionId as SessionId)
    const variableStateByTurn = this.ownerContext.eleckoiRoleplaySessions.variableStatesByTurn(conversationId)
    const historical = this.productData.readRuntimeVariableHistory(conversationId, runtimeSessionId)
    const historicalByTurn = new Map<number, typeof historical>()
    for (const row of historical) {
      const rows = historicalByTurn.get(row.turn) ?? []
      rows.push(row)
      historicalByTurn.set(row.turn, rows)
    }
    const sessionMessages = sessionAssistantMessages(
      conversationId,
      runtimeSessionId,
      inspection.events,
      variableStateByTurn,
      historicalByTurn
    )
    return this.productData.readVariableTimeline(conversationId, sessionMessages)
  }

  /**
   * 读取当前聊天的有效设定库、变量配置和变量状态。
   * @param conversationId - ElecKoi 聊天编号。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  authorState(conversationId: string): AuthorConversationState {
    return this.productData.readAuthorConversationState(conversationId)
  }

  /**
   * 按聊天绑定的变量版本执行作者规则，并保存处理结果。
   * @param conversationId - ElecKoi 聊天编号。
   * @param stateJson - 完整变量对象的 JSON 文本。
   * @param signal - 取消本次变量处理；取消后不保存候选结果。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  async replaceVariableState(conversationId: string, stateJson: string, signal: AbortSignal): Promise<string> {
    const next = await this.ownerContext.eleckoiVariableProcessing.replace(conversationId, stateJson, signal)
    this.changeFeed.publish({ kind: 'messages', conversationId, reason: 'edited', messageIds: [] })
    return next
  }

  /**
   * 导出聊天资料和官方 Session 日志的归档 JSON。
   * @param conversationId - ElecKoi 聊天编号。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  async exportArchive(conversationId: string): Promise<string> {
    const snapshot = this.productData.exportConversationArchive(conversationId)
    const runtimeSessionIds = this.productData.conversationArchiveRuntimeSessionIds(snapshot)
    const requiredIds = new Set(this.productData.requiredConversationArchiveRuntimeSessionIds(snapshot))
    const sessionLogs: DshSessionArchive[] = []
    for (const runtimeSessionId of runtimeSessionIds) {
      const liveAgent = this.ownerContext.agents.get(runtimeSessionId as SessionId)
      if (liveAgent !== undefined && liveAgent.status !== 'idle') {
        throw new Error('请先等待当前回复结束，再导出聊天记录。')
      }
      try {
        const inspection = await this.ownerContext.sessionController.inspect(runtimeSessionId as SessionId)
        sessionLogs.push({
          header: inspection.meta,
          inheritedEventCount: inspection.inheritedEventCount,
          events: [...inspection.events]
        })
      } catch (error) {
        if (requiredIds.has(runtimeSessionId)) throw new Error('聊天记录缺少对应的 DSH 会话日志，无法完整导出。', { cause: error })
      }
    }
    const archivedIds = new Set(sessionLogs.map((item) => item.header.id as string))
    if ([...requiredIds].some((id) => !archivedIds.has(id))) {
      throw new Error('聊天记录缺少对应的 DSH 会话日志，无法完整导出。')
    }
    return JSON.stringify({
      format: 'eleckoi.desktop-chat-history',
      version: 1,
      exportedAt: new Date().toISOString(),
      snapshot,
      sessionLogs
    }, null, 2)
  }

  /**
   * 导入归档，创建新的聊天和官方 Session。
   * @param characterId - 角色编号。
   * @param json - 完整聊天归档 JSON 文本。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  async importArchive(characterId: string, json: string): Promise<string> {
    if (json.length > 100_000_000) throw new Error('聊天记录文件过大。')
    const first = json.split(/\r?\n/).find(line => line.trim())
    let tavernHeader = false
    try {
      const header: unknown = first ? JSON.parse(first) : undefined
      tavernHeader = !!header && typeof header === 'object' && !Array.isArray(header) && Object.hasOwn(header, 'chat_metadata')
    } catch { /* A multiline native archive is parsed below. */ }
    if (tavernHeader) {
      const imported = parseChatImport(json)
      const details = await this.create({ metadata: { characterId } })
      try {
        const messages = [...imported.messages]
        const opening = messages[0]?.role === 'assistant' ? messages.shift() : undefined
        const bindings = await this.ownerContext.eleckoiSessionEditor.importTranscript(details.runtimeSessionId, messages)
        this.productData.saveImportedTranscript(details.conversation.id, bindings, opening, imported.currentVariableStateJson)
        this.changeFeed.publish({ kind: 'catalog', conversationId: details.conversation.id, reason: 'created' })
        return details.conversation.id
      } catch (error) { await this.delete(details.conversation.id); throw error }
    }
    let value: unknown
    try { value = JSON.parse(json) } catch { throw new Error('聊天记录不是有效的 JSON 文件。') }
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('聊天记录文件格式不正确。')
    const archive = value as Record<string, unknown>
    if (archive.format !== 'eleckoi.desktop-chat-history' || archive.version !== 1
      || !Array.isArray(archive.sessionLogs)) throw new Error('不支持此聊天记录文件。')
    const snapshot = this.productData.parseConversationArchive(archive.snapshot)
    if (snapshot.characterId !== characterId) throw new Error('聊天记录与当前角色不匹配。')
    const expectedIds = new Set(this.productData.conversationArchiveRuntimeSessionIds(snapshot))
    const logs = parseDshSessionArchives(archive.sessionLogs, expectedIds)
    const archivedIds = new Set(logs.map((item) => item.header.id as string))
    if (this.productData.requiredConversationArchiveRuntimeSessionIds(snapshot).some((id) => !archivedIds.has(id))) {
      throw new Error('聊天记录缺少对应的 DSH 会话日志。')
    }
    const conversationId = randomUUID()
    const ids = new Map([...expectedIds].map((id) => [id, id === snapshot.conversationId ? conversationId : randomUUID()]))
    const createdIds: string[] = []
    let importedId: string | undefined
    try {
      for (const log of logs) {
        const id = ids.get(log.header.id as string)
        if (!id) throw new Error('聊天记录缺少 DSH 会话映射。')
        const parentSession = log.header.parentSession
        const header = {
          ...log.header,
          id,
          cwd: process.env.ELECKOI_WORKSPACE_ROOT ?? log.header.cwd,
          ...(parentSession === undefined ? {} : { parentSession: ids.get(parentSession as string) ?? parentSession })
        } as SessionHeader
        const handle = await this.ownerContext.sessionPersistence.create(header, {
          inheritedEventCount: SessionLogOffset(log.inheritedEventCount)
        })
        createdIds.push(id)
        try {
          if (log.events.length > 0) await handle.append(log.events)
          await handle.flush()
        } finally {
          await handle.close()
        }
      }
      importedId = this.productData.importConversationArchive(snapshot, characterId, ids, conversationId)
      this.changeFeed.publish({ kind: 'catalog', conversationId: importedId, reason: 'created' })
      return importedId
    } catch (error) {
      if (importedId) await this.delete(importedId)
      await Promise.allSettled(createdIds.map((id) => this.ownerContext.eleckoiSessionEditor.deleteSession(id)))
      throw error
    }
  }

  /**
   * 在文件管理器中显示官方附件。
   * @param conversationId - ElecKoi 聊天编号。
   * @param attachmentId - 官方附件编号。
   * @param name - 保存的名称或附件文件名。
   * @param signal - 取消调用或结束订阅流的信号。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  async revealFile(
    conversationId: string,
    attachmentId: string,
    name: string,
    signal: AbortSignal
  ): Promise<void> {
    const runtimeSessionId = this.productData.runtimeSessionId(conversationId)
    const inspection = await this.ownerContext.sessionController.inspect(runtimeSessionId as SessionId, signal)
    if (!sessionContainsFile(inspection.events, attachmentId, name)) {
      throw new Error('文件不在当前聊天记录中。')
    }
    const path = storedFilePath(attachmentId, name)
    await this.ownerContext.sessionController.openWorkspacePath({ path, action: 'reveal' }, signal)
  }

  /**
   * 创建项目并返回更新后的数据。
   * @param input - 本次操作的输入，字段见参数类型。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  async create(input: ConversationCreateInput): Promise<ConversationDetailsMetadata> {
    const details = this.productData.createConversation(input)
    try {
      await this.ownerContext.eleckoiRoleplaySessions.create(details.conversation.id)
      this.changeFeed.publish({ kind: 'catalog', conversationId: details.conversation.id, reason: 'created' })
      return this.productData.readConversationDetails(details.conversation.id)
    } catch (error) {
      await this.productData.deleteConversation(details.conversation.id)
      throw error
    }
  }

  /**
   * 删除指定项目及其关联数据。
   * @param conversationId - ElecKoi 聊天编号。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  async delete(conversationId: string): Promise<void> {
    const runtimeSessionId = this.productData.runtimeSessionId(conversationId)
    await this.ownerContext.eleckoiSessionEditor.deleteSession(runtimeSessionId)
    await this.ownerContext.eleckoiRoleplaySessions.removeArtifacts(conversationId, runtimeSessionId)
    await this.productData.deleteConversation(conversationId)
    this.ownerContext.eleckoiRequestPreviews.forget(runtimeSessionId)
    this.changeFeed.publish({ kind: 'catalog', conversationId, reason: 'deleted' })
  }

  /**
   * 重命名聊天，同时保存官方 Session 与产品目录中的标题。
   * @param conversationId - ElecKoi 聊天编号。
   * @param title - 新的聊天标题。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  async rename(conversationId: string, title: string): Promise<ConversationDetailsMetadata> {
    const runtimeSessionId = this.productData.runtimeSessionId(conversationId)
    await this.ownerContext.sessionController.rename({ sessionId: runtimeSessionId as SessionId, title })
    const details = this.productData.renameConversation(conversationId, title)
    this.changeFeed.publish({ kind: 'catalog', conversationId, reason: 'updated' })
    return details
  }

  /**
   * 从指定官方 Session 事件创建聊天分支，复制保留的产品轮次和历史运行状态。
   * @param conversationId - 来源 ElecKoi 聊天编号。
   * @param atSeq - 分支边界的官方事件序号；省略时创建同配置和开场白的空聊天。
   * @param retainedTurnIds - 分支中需要保留的产品轮次编号；开场白轮次自动保留。
   * @param title - 新聊天的标题。
   * @returns 新建分支的 ElecKoi 聊天编号；创建失败会清理分支并抛出错误。
   */
  @Remote
  async fork(conversationId: string, atSeq: number | undefined, retainedTurnIds: string[], title: string): Promise<string> {
    const original = this.productData.readConversationDetails(conversationId)
    if (atSeq === undefined) {
      const created = await this.create({ title, metadata: original.metadata })
      const opening = original.messages.find(message => message.id === 'opening')
      if (opening) this.productData.updateConversationOpening(created.conversation.id, opening.content ?? '')
      return created.conversation.id
    }
    const source = this.productData.runtimeSessionId(conversationId), inspection = await this.ownerContext.sessionController.inspect(source as SessionId)
    const targetIndex = inspection.events.findIndex(event => Number(event.seq) === atSeq)
    if (targetIndex < 0) throw new Error(`Branch event does not exist: ${atSeq}`)
    const sourceTurn = sessionMessageTurn(inspection.events, targetIndex), target = inspection.events[targetIndex]!
    const fork = await this.ownerContext.sessionController.fork({ sessionId: source as SessionId, atSeq })
    let id: string | undefined
    try {
      const snapshot = this.productData.exportConversationArchive(conversationId), retained = new Set(retainedTurnIds)
      for (const row of snapshot.tables.agent_openings ?? []) retained.add(String(row.turnId))
      snapshot.tables.agent_turns = (snapshot.tables.agent_turns ?? []).filter(row => retained.has(String(row.id)))
      snapshot.tables.agent_responses = (snapshot.tables.agent_responses ?? []).filter(row => retained.has(String(row.turnId))
        && (row.runtimeThreadId !== source || row.dshTurn === null || Number(row.dshTurn) <= sourceTurn))
      snapshot.tables.agent_branch_turns = (snapshot.tables.agent_branch_turns ?? []).filter(row => retained.has(String(row.turnId)))
      const mappings = new Map(this.productData.conversationArchiveRuntimeSessionIds(snapshot).map(sessionId => [sessionId, sessionId === source ? fork.sessionId as string : sessionId]))
      id = this.productData.importConversationArchive(snapshot, snapshot.characterId, mappings, randomUUID())
      this.productData.renameConversation(id, title)
      await this.ownerContext.eleckoiRoleplaySessions.adoptFork(id, conversationId, sourceTurn, target.type === 'assistant/message')
      this.changeFeed.publish({ kind: 'catalog', conversationId: id, reason: 'created' })
      return id
    } catch (error) {
      await this.ownerContext.eleckoiSessionEditor.deleteSession(fork.sessionId)
      if (id) { await this.ownerContext.eleckoiRoleplaySessions.removeArtifacts(id, fork.sessionId); await this.productData.deleteConversation(id) }
      throw error
    }
  }

  /**
   * 准备本次输入需要的产品配置和官方 Session，不直接生成回复。
   * @param conversationId - ElecKoi 聊天编号。
   * @param text - 本次输入或待测试文本。
   * @param signal - 取消准备过程的信号。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  async preparePrompt(conversationId: string, text: string, signal: AbortSignal): Promise<{ runtimeSessionId: string; operationId: string }> {
    return this.ownerContext.eleckoiConversationLifecycle.exclusive(conversationId, async () => {
      const runtimeSessionId = await this.ownerContext.eleckoiRoleplaySessions.preparePrompt(conversationId, text, signal)
      return { runtimeSessionId, operationId: this.ownerContext.eleckoiRoleplaySessions.currentOperation(conversationId) }
    })
  }

  /** Continue the last assistant with the native Agent, preserving its complete history.
   * @param conversationId - Product chat and its existing native Session.
   * @param requestId - Unique continuation admission ID.
   * @param signal - Cancellation before admission.
   * @returns Actual admitted native turn and product-save operation.
   */
  @Remote
  async continueMessage(conversationId: string, requestId: string, signal: AbortSignal): Promise<{ runtimeSessionId: string; turn: number; operationId: string }> {
    return this.ownerContext.eleckoiConversationLifecycle.exclusive(conversationId, async () => {
      if (!requestId.trim()) throw new Error('续写请求缺少有效标识。')
      signal.throwIfAborted()
      const runtimeSessionId = this.productData.runtimeSessionId(conversationId)
      await this.ownerContext.eleckoiRoleplaySessions.prepareSessionAccess(conversationId)
      const resolved = await this.ownerContext.sessionController.resolveAgent(runtimeSessionId as SessionId)
      if ('error' in resolved) throw resolved.error
      const previous = resolved.agent.session.snapshotEvents().find(event => event.type === 'eleckoi/input-continuation'
        && event.data.mode === 'continue' && event.data.requestId === requestId)
      if (previous?.type === 'eleckoi/input-continuation' && previous.data.operationId)
        return { runtimeSessionId, turn: previous.data.turn, operationId: previous.data.operationId }
      const module = '@eleckoi/dsh-client-roleplay/host/assistant-continuation.mjs'
      const { assistantContinuationTarget, startAssistantContinuation } = await import(module)
      const target = assistantContinuationTarget(resolved.agent)
      const targetEvent = resolved.agent.session.snapshotEvents().find(event => event.type === 'assistant/message'
        && event.data.message.id === target.targetAssistantMessageId)
      const targetTurn = targetEvent?.type === 'assistant/message' ? targetEvent.data.turn : undefined
      const actor = resolved.agent.session.snapshotEvents().find(event => event.type === 'eleckoi/group-response' && event.data.turn === targetTurn)
      if (actor?.type === 'eleckoi/group-response') await this.ownerContext.eleckoiRoleplaySessions.withGenerationOptions(
        conversationId,{ characterId: actor.data.characterId },()=>this.ownerContext.eleckoiRoleplaySessions.prepareContinuation(conversationId,target.text,signal))
      else await this.ownerContext.eleckoiRoleplaySessions.prepareContinuation(conversationId, target.text, signal)
      const operationId = this.ownerContext.eleckoiRoleplaySessions.currentOperation(conversationId)
      try {
        const started = startAssistantContinuation(resolved.agent, target, requestId, operationId, signal)
        return { runtimeSessionId, turn: started.turn, operationId }
      } catch (error) {
        try { await this.ownerContext.eleckoiRoleplaySessions.releasePreparation(conversationId, operationId) }
        catch (releaseError) { throw new AggregateError([error, releaseError], '续写未被接受，且释放准备失败。') }
        throw error
      }
    })
  }

  /** Admit a group member into the existing Session and real Agent.
   * @param conversationId - Native product chat bound to this group.
   * @param groupId - Persistent group configuration ID.
   * @param characterId - Actual native actor ID.
   * @param text - First member's direct user input; omitted for later members.
   * @param requestId - Unique admission identity per member.
   * @param options - Native generation overrides, frozen during preparation.
   * @param signal - Cancellation before admission.
   * @returns Admitted turn and actual product-save operation.
   */
  @Remote
  async generateGroupMember(conversationId: string, groupId: string, characterId: string, text: string | undefined,
    requestId: string, options: TavernCompatibilityRecord,
    promptContent?: import('@deepseek-ai/dsh-api-session-controller/types').PromptContentPart[], mode?: 'queue' | 'steer', signal?: AbortSignal): Promise<{ runtimeSessionId: string; turn: number; operationId: string }> {
    const admissionSignal = signal ?? new AbortController().signal
    return this.ownerContext.eleckoiConversationLifecycle.exclusive(conversationId, async () => {
      admissionSignal.throwIfAborted()
      if (!requestId.trim()) throw new Error('群聊请求缺少有效标识。')
      const actor = this.ownerContext.eleckoiTavernCompatibilityApi.groupActors(conversationId,groupId,[characterId])[0]
      const runtimeSessionId = this.productData.runtimeSessionId(conversationId)
      const resolved = await this.ownerContext.sessionController.resolveAgent(runtimeSessionId as SessionId)
      if ('error' in resolved) throw resolved.error
      const groupModule = '@eleckoi/dsh-client-roleplay/host/native-group-chat.mjs'
      const { activeGroupResponses } = await import(groupModule)
      const previous = activeGroupResponses(resolved.agent.session.snapshotEvents()).find((item: { requestId: string; turn: number; operationId: string }) => item.requestId === requestId)
      if (previous) return { runtimeSessionId, turn: previous.turn, operationId: previous.operationId }
      return this.ownerContext.eleckoiRoleplaySessions.withGenerationOptions(conversationId, { ...options, characterId }, async () => {
        const direct = resolved.agent.session.deriveMessages().findLast(message => message.role === 'user' && message.source?.kind === 'user')
        const input = text ?? (promptContent ? '' : direct?.content.filter(block => block.type === 'text').map(block => block.text).join('\n'))
        if (input === undefined) throw new Error('群聊没有真实用户输入。')
        if (text === undefined && !promptContent) await this.ownerContext.eleckoiRoleplaySessions.prepareContinuation(conversationId,input,admissionSignal)
        else await this.ownerContext.eleckoiRoleplaySessions.preparePrompt(conversationId,text ?? '',admissionSignal)
        const operationId = this.ownerContext.eleckoiRoleplaySessions.currentOperation(conversationId)
        try {
          const module = '@eleckoi/dsh-client-roleplay/host/native-group-chat.mjs'
          const { startGroupMember, recordGroupAdmission } = await import(module)
          let started
          if (promptContent) {
            started = recordGroupAdmission(resolved.agent,actor,requestId,operationId,admissionSignal)
            try {
              await this.ownerContext.sessionController.prompt({ sessionId: runtimeSessionId as SessionId,
                requestId: requestId as import('@deepseek-ai/dsh-api-session-controller/types').SessionRequestId,
                mode: mode ?? 'queue', content: promptContent },admissionSignal)
            } catch (error) {
              resolved.agent.session.append('eleckoi/group-response-cancelled', {
                requestId, turn: started.turn, error: String(error instanceof Error ? error.message : error)
              }, { ignorable: true })
              throw error
            }
          } else started = startGroupMember(resolved.agent,actor,text,requestId,operationId,admissionSignal)
          return { runtimeSessionId, turn: started.turn, operationId }
        } catch (error) {
          try { await this.ownerContext.eleckoiRoleplaySessions.releasePreparation(conversationId,operationId) }
          catch (releaseError) { throw new AggregateError([error, releaseError], '群聊未被接受，且释放准备失败。') }
          throw error
        }
      })
    })
  }


  /**
   * 等待当前进程本次产品保存，失败抛出错误；不查询历史或重启前结果。
   * @param conversationId - ElecKoi 聊天编号。
   * @param operationId - 生成准备时返回的本次操作编号。
   * @returns 本轮产品保存完成；此方法不启动模型。
   */
  @Remote
  async waitForGeneration(conversationId: string, operationId: string): Promise<void> {
    this.productData.runtimeSessionId(conversationId)
    await this.ownerContext.eleckoiConversationLifecycle.wait(conversationId, operationId)
  }

  /**
   * 修改同一官方 Session 中的用户或模型消息，刷新投影并发布消息变更。
   * @param conversationId - ElecKoi 聊天编号。
   * @param eventSeq - 官方 Session 中待修改消息的事件序号。
   * @param role - 消息角色，必须与指定事件中的消息一致。
   * @param content - 保存后替换原正文的完整文本。
   * @returns 修改后的聊天详情与元数据；消息不存在或角色不一致时抛出错误。
   */
  @Remote
  async editMessage(
    conversationId: string,
    eventSeq: number,
    role: 'user' | 'assistant',
    content: string
  ): Promise<ConversationDetailsMetadata> {
    const runtimeSessionId = this.productData.runtimeSessionId(conversationId)
    await requireSessionMessage(
      await this.ownerContext.sessionController.inspect(runtimeSessionId as SessionId),
      eventSeq,
      role
    )
    await this.ownerContext.eleckoiSessionEditor.editMessage(runtimeSessionId, eventSeq, role, content)
    this.changeFeed.publish({ kind: 'messages', conversationId, reason: 'edited', messageIds: [String(eventSeq)] })
    return this.productData.readConversationDetails(conversationId)
  }

  /**
   * 在同一 Session 中从指定消息回退，恢复相应变量。
   * @param conversationId - ElecKoi 聊天编号。
   * @param eventSeq - 官方 Session 中消息的事件序号。
   * @param role - 消息角色。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  async deleteMessagesFrom(
    conversationId: string,
    eventSeq: number,
    role: 'user' | 'assistant'
  ): Promise<{
    details: ConversationDetailsMetadata
    deletedMessageCount: number
    remainingMessageCount: number
  }> {
    return this.ownerContext.eleckoiConversationLifecycle.exclusive(conversationId, async () => {
      const runtimeSessionId = this.productData.runtimeSessionId(conversationId)
      await this.ownerContext.eleckoiRoleplaySessions.prepareSessionAccess(conversationId)
      const inspection = await this.ownerContext.sessionController.inspect(runtimeSessionId as SessionId)
      const target = requireSessionMessage(inspection, eventSeq, role)
      const fromTurn = sessionMessageTurn(inspection.events, target.index)
      const visible = visibleSessionMessages(inspection.events)
      const selectedVisibleIndex = visible.findIndex(item => item.seq === eventSeq)
      if (selectedVisibleIndex < 0) throw new Error('找不到要删除的 DSH 消息。')
      const retainedUser = role === 'assistant'
        ? directUserMessageBeforeTurn(inspection.events, target.index, fromTurn)
        : undefined
      const restoreRuntime = this.ownerContext.eleckoiRoleplaySessions.prepareRestoreBeforeTurn(
        conversationId,
        runtimeSessionId,
        fromTurn,
        historicalInputId(inspection.events, target.index)
      )
      const retainedSeq = retainedUser?.seq
      try {
        await this.ownerContext.eleckoiSessionEditor.transaction(runtimeSessionId, async () => {
          const rewound = await this.ownerContext.eleckoiSessionEditor.rewind(
            runtimeSessionId, fromTurn, retainedSeq === undefined ? eventSeq : Number(retainedSeq), retainedSeq !== undefined
          )
          if (rewound === undefined) throw new Error('当前 DSH Session 不能安全回退。')
          restoreRuntime.apply()
        })
      } catch (error) { restoreRuntime.rollback(); throw error }
      this.changeFeed.publish({
        kind: 'messages',
        conversationId,
        reason: 'deleted',
        sessionRewritten: true,
        messageIds: visible.slice(selectedVisibleIndex).map(item => String(item.seq))
      })
      return {
        details: this.productData.readConversationDetails(conversationId),
        deletedMessageCount: visible.length - selectedVisibleIndex,
        remainingMessageCount: selectedVisibleIndex
      }
    })
  }

  /**
   * 准备指定用户输入的重新生成，返回待启动请求。
   * @param conversationId - ElecKoi 聊天编号。
   * @param eventSeq - 官方 Session 中消息的事件序号。
   * @param requestId - 本次生成的唯一请求编号。
   * @param replacementMessage - 可替换的用户输入；省略时保留原输入。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  async regenerateMessage(
    conversationId: string,
    eventSeq: number,
    requestId: string,
    replacementMessage?: string
  ): Promise<{ runtimeSessionId: string; prepared: true; operationId: string }> {
    return this.ownerContext.eleckoiConversationLifecycle.exclusive(conversationId, async () => {
      if (!requestId.trim()) throw new Error('重新生成请求缺少有效标识。')
      const runtimeSessionId = this.productData.runtimeSessionId(conversationId)
      await this.ownerContext.eleckoiRoleplaySessions.prepareSessionAccess(conversationId)
      const inspection = await this.ownerContext.sessionController.inspect(runtimeSessionId as SessionId)
      const target = requireSessionMessage(inspection, eventSeq, 'user')
      const fromTurn = sessionMessageTurn(inspection.events, target.index)
      const inputMessageId = String(jsonRecord(target.event.data).id ?? '')
      if (!inputMessageId) throw new Error('重新生成的用户事件缺少消息标识。')
      const groupRecord = inspection.events.find(event => event.type === 'eleckoi/group-response' && event.data.turn === fromTurn)
      const groupActor = groupRecord?.type === 'eleckoi/group-response' ? {
        groupId: groupRecord.data.groupId, characterId: groupRecord.data.characterId,
        name: groupRecord.data.speakerName, avatar: groupRecord.data.speakerAvatar } : undefined
      const groupContinue = jsonRecord(jsonRecord(target.event.data).source).kind === 'plugin:eleckoi-group-response'
      const originalInput = groupContinue ? inspection.events.slice(0,target.index).findLast(event => event.type === 'user/message'
        && jsonRecord(jsonRecord(event.data).source).kind === 'user') : target.event
      if (!originalInput) throw new Error('群聊重新生成缺少原始用户输入。')
      if (groupContinue && replacementMessage !== undefined) throw new Error('修改群聊输入请编辑原始用户消息。')
      const promptText = replacementMessage ?? sessionMessageText(originalInput)
      if (replacementMessage !== undefined && !replacementMessage.trim()) throw new Error('重新生成的用户输入不能为空。')
      const restoreRuntime = this.ownerContext.eleckoiRoleplaySessions.prepareRestoreBeforeTurn(
        conversationId,
        runtimeSessionId,
        fromTurn,
        historicalInputId(inspection.events, target.index)
      )
      const preparation = await this.ownerContext.eleckoiRoleplaySessions.prepareRegeneration(conversationId, promptText)
      try {
        await this.ownerContext.eleckoiSessionEditor.transaction(runtimeSessionId, async () => {
          if (replacementMessage !== undefined) {
            await this.ownerContext.eleckoiSessionEditor.editMessage(runtimeSessionId, eventSeq, 'user', replacementMessage)
          }
          const rewound = await this.ownerContext.eleckoiSessionEditor.rewind(runtimeSessionId, fromTurn, eventSeq, !groupContinue)
          if (rewound === undefined) throw new Error('当前 DSH Session 不能安全回退。')
          restoreRuntime.apply()
          if (groupActor) await this.ownerContext.eleckoiRoleplaySessions.withGenerationOptions(conversationId,
            { characterId: groupActor.characterId },()=> groupContinue
              ? this.ownerContext.eleckoiRoleplaySessions.prepareContinuation(conversationId,promptText)
              : this.ownerContext.eleckoiRoleplaySessions.preparePrompt(conversationId,promptText))
          else await this.ownerContext.eleckoiRoleplaySessions.preparePrompt(conversationId, promptText)
        })
      } catch (error) {
        restoreRuntime.rollback()
        preparation.rollback()
        this.changeFeed.publish({ kind: 'messages', conversationId, reason: 'edited', messageIds: [String(eventSeq)], sessionRewritten: true })
        throw error
      }
      this.pendingRegenerations.set(conversationId, { requestId, inputMessageId, inputEventSeq: eventSeq, ...(groupActor ? { groupActor } : {}), groupContinue })
      this.changeFeed.publish({ kind: 'messages', conversationId, reason: 'regenerated', messageIds: [String(eventSeq)], sessionRewritten: true })
      return { runtimeSessionId, prepared: true, operationId: this.ownerContext.eleckoiRoleplaySessions.currentOperation(conversationId) }
    })
  }

  /**
   * 从已保留的用户事件启动重新生成；取消时保留用户输入，不启动新的回复。
   * @param conversationId - ElecKoi 聊天编号。
   * @param requestId - 本次生成的唯一请求编号。
   * @param cancelled - 已准备的请求是否被取消。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  async startRegeneration(conversationId: string, requestId: string, cancelled: boolean): Promise<{ accepted: boolean; turn?: number }> {
    const pending = this.pendingRegenerations.get(conversationId)
    if (!pending || pending.requestId !== requestId) throw new Error('重新生成请求已失效。')
    this.pendingRegenerations.delete(conversationId)
    if (cancelled) return { accepted: false }
    const runtimeSessionId = this.productData.runtimeSessionId(conversationId)
    const resolved = await this.ownerContext.sessionController.resolveAgent(runtimeSessionId as SessionId)
    if ('error' in resolved) throw resolved.error
    const agent = resolved.agent as typeof resolved.agent & { continueFromInput?: (messageId: string) => number }
    if (typeof agent.continueFromInput !== 'function') throw new Error('当前 DSH 运行时不支持复用已有用户事件。')
    let turn: number
    if (pending.groupActor && pending.groupContinue) {
      const module = '@eleckoi/dsh-client-roleplay/host/native-group-chat.mjs'
      const { startGroupMember } = await import(module)
      turn = startGroupMember(agent,pending.groupActor,undefined,requestId,
        this.ownerContext.eleckoiRoleplaySessions.currentOperation(conversationId),new AbortController().signal).turn
      return { accepted: true, turn }
    }
    turn = agent.continueFromInput(pending.inputMessageId)
    if (pending.groupActor) agent.session.append('eleckoi/group-response', {
      turn, groupId: pending.groupActor.groupId, characterId: pending.groupActor.characterId,
      speakerName: pending.groupActor.name, speakerAvatar: pending.groupActor.avatar, requestId,
      operationId: this.ownerContext.eleckoiRoleplaySessions.currentOperation(conversationId),
      inputMessageId: pending.inputMessageId, inputEventSeq: pending.inputEventSeq
    }, { ignorable: true })
    agent.session.append('eleckoi/input-continuation', {
      turn, inputMessageId: pending.inputMessageId, inputEventSeq: pending.inputEventSeq
    }, { ignorable: true })
    return { accepted: true, turn }
  }

  /**
   * 切换开场白。
   * @param conversationId - ElecKoi 聊天编号。
   * @param openingId - 开场白编号。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  async selectOpening(conversationId: string, openingId: string): Promise<ConversationDetailsMetadata> {
    return this.changeOpening(conversationId, () => this.productData.selectConversationOpening(conversationId, openingId))
  }

  /**
   * 修改开场白文本。
   * @param conversationId - ElecKoi 聊天编号。
   * @param content - 要保存的完整文本。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  async updateOpening(conversationId: string, content: string): Promise<ConversationDetailsMetadata> {
    return this.changeOpening(conversationId, () => this.productData.updateConversationOpening(conversationId, content))
  }

  private async changeOpening(conversationId: string, mutate: () => ConversationDetailsMetadata): Promise<ConversationDetailsMetadata> {
    const sessionId = this.productData.runtimeSessionId(conversationId) as SessionId
    const inspection = await this.ownerContext.sessionController.inspect(sessionId)
    // Cold reads must also account for accepted input still waiting in the inbox.
    const projections = await this.ownerContext.sessionController.projections({ sessionId }, new AbortController().signal)
    if (!projections) throw new Error('无法读取聊天状态，不能修改开场白。')
    const inbox = projections.values.inbox
    if (!inbox) throw new Error('无法读取输入队列，不能修改开场白。')
    const agent = this.ownerContext.agents.get(sessionId)
    // Recheck the attached writer after the asynchronous reads, then commit
    // synchronously so prompt admission cannot interleave with the mutation.
    const events = agent?.session.snapshotEvents() ?? inspection.events
    if (events.some(event => event.type === 'user/message' && event.data.source.kind === 'user')
      || agent?.status === 'running' || agent?.inbox.nextTurn.length || agent?.inbox.nextStep.length
      || inbox?.['next-turn'].length || inbox?.['next-step'].length
      || this.pendingRegenerations.has(conversationId)) {
      throw new Error('对话开始后不能再切换或修改开场白。')
    }
    const details = mutate()
    this.changeFeed.publish({ kind: 'messages', conversationId, reason: 'edited', messageIds: ['opening'] })
    return details
  }
}

interface DshSessionArchive {
  readonly header: SessionHeader
  readonly inheritedEventCount: number
  readonly events: SessionEvent[]
}

function parseDshSessionArchives(value: unknown[], expectedIds: ReadonlySet<string>): DshSessionArchive[] {
  const archivedIds = new Set<string>()
  return value.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error('聊天记录中的 DSH 会话数据无效。')
    }
    const archive = item as Partial<DshSessionArchive>
    const id = archive.header?.id as string | undefined
    if (!id || !expectedIds.has(id) || archivedIds.has(id)
      || !Array.isArray(archive.events)
      || !Number.isSafeInteger(archive.inheritedEventCount)
      || (archive.inheritedEventCount ?? -1) < 0) {
      throw new Error('聊天记录中的 DSH 会话数据无效。')
    }
    archivedIds.add(id)
    return archive as DshSessionArchive
  })
}

function sessionContainsFile(events: readonly SessionEvent[], attachmentId: string, name: string): boolean {
  return events.some((event) => {
    if (event.type !== 'user/message') return false
    const content = (event.data as { content?: unknown }).content
    return Array.isArray(content) && content.some((block) => {
      if (!block || typeof block !== 'object' || Array.isArray(block)) return false
      const file = block as { type?: unknown; attachment?: { attachmentId?: unknown; name?: unknown } }
      return file.type === 'file'
        && file.attachment?.attachmentId === attachmentId
        && file.attachment.name === name
    })
  })
}

function storedFilePath(attachmentId: string, name: string): string {
  const match = /^sha256:([a-f0-9]{64})$/.exec(attachmentId)
  if (!match?.[1] || !name || name !== name.trim() || name === '.' || name === '..'
    || /[/\\\u0000-\u001f\u007f<>:"|?*]/u.test(name)) {
    throw new Error('文件附件引用无效。')
  }
  const home = process.env.DSH_HOME
  if (!home) throw new Error('DSH 附件目录尚未就绪。')
  return join(home, 'attachments', 'v1', 'files', match[1].slice(0, 2), match[1], name)
}

export function requireSessionMessage(
  inspection: { events: readonly unknown[] },
  eventSeq: number,
  role: 'user' | 'assistant'
): { event: Record<string, unknown>; index: number } {
  if (!Number.isSafeInteger(eventSeq) || eventSeq < 0) throw new Error('DSH 消息事件序号不正确。')
  const expectedType = role === 'user' ? 'user/message' : 'assistant/message'
  const index = inspection.events.findIndex((candidate) => {
    const event = jsonRecord(candidate)
    if (event.seq !== eventSeq || event.type !== expectedType || event.surfaceOp !== 'append') return false
    if (role !== 'user') return true
    return jsonRecord(jsonRecord(event.data).source).kind === 'user'
  })
  if (index < 0) throw new Error('找不到要修改的 DSH 消息。')
  return { event: jsonRecord(inspection.events[index]), index }
}

function historicalInputId(events: readonly unknown[], index: number): string | undefined {
  const event = jsonRecord(events[index])
  if (event.type !== 'user/message') return undefined
  const id = jsonRecord(event.data).id
  return typeof id === 'string' ? id : undefined
}

export function sessionMessageTurn(events: readonly unknown[], index: number): number {
  // DSH normally stamps the turn on assistant events.  The user event is
  // allowed to be queued either before `turn/start` or after it, and some
  // persisted assistant events can omit the redundant stamp.  Resolve both
  // forms from the official surrounding turn markers instead of assuming one
  // event order or relying on a product message index.
  const stampedTurn = jsonRecord(jsonRecord(events[index]).data).turn
  if (Number.isSafeInteger(stampedTurn) && Number(stampedTurn) > 0) return Number(stampedTurn)
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const event = jsonRecord(events[cursor])
    if (event.type === 'turn/end') break
    if (event.type === 'assistant/message') {
      const turn = jsonRecord(event.data).turn
      if (Number.isSafeInteger(turn) && Number(turn) > 0) return Number(turn)
    }
    if (event.type !== 'turn/start') continue
    const turn = jsonRecord(event.data).turn
    if (Number.isSafeInteger(turn) && Number(turn) > 0) return Number(turn)
  }
  for (let cursor = index + 1; cursor < events.length; cursor += 1) {
    const event = jsonRecord(events[cursor])
    if (event.type === 'turn/end') break
    if (event.type === 'assistant/message') {
      const turn = jsonRecord(event.data).turn
      if (Number.isSafeInteger(turn) && Number(turn) > 0) return Number(turn)
    }
    if (event.type !== 'turn/start') continue
    const turn = jsonRecord(event.data).turn
    if (Number.isSafeInteger(turn) && Number(turn) > 0) return Number(turn)
  }
  // The official Session accepts a direct user message before the next
  // turn/start is written. Its rewind contract names that queued input as the
  // next turn, so keep the product command aligned with the Session instead of
  // rejecting a message which is already visible and rewindable.
  const target = jsonRecord(events[index])
  if (target.type === 'user/message' && target.surfaceOp === 'append'
    && jsonRecord(jsonRecord(target.data).source).kind === 'user') {
    let lastStartedTurn = 0
    let lastEndedTurn = 0
    for (let cursor = 0; cursor < index; cursor += 1) {
      const event = jsonRecord(events[cursor])
      const turn = jsonRecord(event.data).turn
      if (!Number.isSafeInteger(turn) || Number(turn) <= 0) continue
      if (event.type === 'turn/start') lastStartedTurn = Math.max(lastStartedTurn, Number(turn))
      if (event.type === 'turn/end') lastEndedTurn = Math.max(lastEndedTurn, Number(turn))
    }
    if (lastStartedTurn === lastEndedTurn) return lastStartedTurn + 1
  }
  throw new Error('找不到这条消息所属的 DSH 轮次。')
}

function directUserMessageBeforeTurn(
  events: readonly unknown[],
  assistantIndex: number,
  turn: number
): Record<string, unknown> | undefined {
  const turnStart = events.findIndex((candidate, index) => index < assistantIndex
    && jsonRecord(candidate).type === 'turn/start'
    && jsonRecord(jsonRecord(candidate).data).turn === turn)
  if (turnStart < 0) return undefined
  for (let index = assistantIndex - 1; index > turnStart; index -= 1) {
    const event = jsonRecord(events[index])
    if (event.type !== 'user/message' || event.surfaceOp !== 'append') continue
    const data = jsonRecord(event.data)
    if (jsonRecord(data.source).kind === 'user') return event
  }
  for (let index = turnStart - 1; index >= 0; index -= 1) {
    const event = jsonRecord(events[index])
    if (event.type === 'turn/end') break
    if (event.type !== 'user/message' || event.surfaceOp !== 'append') continue
    const data = jsonRecord(event.data)
    if (jsonRecord(data.source).kind === 'user') return event
  }
  return undefined
}

function visibleSessionMessages(events: readonly unknown[]): Array<{ seq: number; role: 'user' | 'assistant' }> {
  const messages: Array<{ seq: number; role: 'user' | 'assistant' }> = []
  for (const candidate of events) {
    const event = jsonRecord(candidate)
    if (!Number.isSafeInteger(event.seq) || event.surfaceOp !== 'append') continue
    if (event.type === 'assistant/message') {
      messages.push({ seq: Number(event.seq), role: 'assistant' })
      continue
    }
    if (event.type === 'user/message' && jsonRecord(jsonRecord(event.data).source).kind === 'user') {
      messages.push({ seq: Number(event.seq), role: 'user' })
    }
  }
  return messages
}

function sessionAssistantMessages(
  conversationId: string,
  runtimeSessionId: string,
  events: readonly unknown[],
  variableStateByTurn: Record<string, string>,
  historicalByTurn: ReadonlyMap<number, readonly { variableStateJson: string }[]> = new Map()
): Array<{
  id: string
  conversationId: string
  role: 'assistant'
  content: string
  variableStateJson: string
  status: 'complete'
  createdAt: string
  runtimeSessionId: string
  sessionEventSeq: number
  dshTurn: number
}> {
  // The Session contains several assistant/message events for one turn
  // (reasoning/tool steps plus the settled reply).  The official conversation
  // projection exposes only the settled reply after the current final-boundary
  // marker, so the variable viewer must use that same one-per-turn boundary.
  const finalByTurn = new Map<number, {
    event: Record<string, unknown>
    index: number
    content: string
    turn: number
  }>()
  for (const [index, candidate] of events.entries()) {
    const event = jsonRecord(candidate)
    if (event.type !== 'assistant/message' || event.surfaceOp !== 'append'
      || !Number.isSafeInteger(event.seq)) continue
    const content = sessionMessageText(event)
    // Authored placeholders are real chat messages, including an empty body.
    // Reasoning-only Agent events remain absent from the transcript.
    const source = jsonRecord(jsonRecord(jsonRecord(event.data).message).source)
    if (!officialFinalReplyText(content).trim() && !content.includes('<FINAL>') && source.model !== 'authored-message') continue
    const turn = sessionMessageTurn(events, index)
    finalByTurn.set(turn, { event, index, content, turn })
  }
  return [...finalByTurn.values()].sort((left, right) => Number(left.event.seq) - Number(right.event.seq)).flatMap(({ event, content, turn }) => {
    let state = variableStateByTurn[String(turn)]
    if (typeof state !== 'string') {
      const rows = historicalByTurn.get(turn) ?? []
      if (rows.length > 1) throw new Error(`第 ${turn} 轮对应多个历史变量记录，不能任意选择；现有数据未修改。`)
      state = rows[0]?.variableStateJson
    }
    if (typeof state !== 'string' || !state.trim()) {
      throw new Error(`缺少第 ${turn} 轮完成后的历史变量记录；现有数据已保留，不能用空对象或当前变量代替。`)
    }
    const rawTime = event.time ?? jsonRecord(event.data).time
    const time = Number(rawTime)
    const createdAt = Number.isFinite(time) && time > 0
      ? new Date(time).toISOString()
      : new Date().toISOString()
    return [{
      id: `dsh-${String(event.seq)}`,
      conversationId,
      role: 'assistant' as const,
      content,
      variableStateJson: state,
      status: 'complete' as const,
      createdAt,
      runtimeSessionId,
      sessionEventSeq: Number(event.seq),
      dshTurn: turn
    }]
  })
}

const FinalOpenTag = '<FINAL>'
const FinalCloseTag = '</FINAL>'

/** The current DSH assistant projection boundary; internal text before it is not a floor. */
function officialFinalReplyText(value: string): string {
  const markerIndex = value.indexOf(FinalOpenTag)
  if (markerIndex < 0) return ''
  const content = value.slice(markerIndex + FinalOpenTag.length).replace(/^(?:\r\n|\r|\n)/, '')
  return content.replaceAll(FinalCloseTag, '')
    .replace(/(?:\r\n|\r|\n)$/, '')
}

export function sessionMessageText(event: Record<string, unknown>): string {
  const message = event.type === 'assistant/message'
    ? jsonRecord(jsonRecord(event.data).message)
    : jsonRecord(event.data)
  const content = Array.isArray(message.content) ? message.content : []
  return content.flatMap((part) => {
    const block = jsonRecord(part)
    return block.type === 'text' && typeof block.text === 'string' ? [block.text] : []
  }).join('')
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function jsonObject(value: unknown): Record<string, DisplayPreferenceValue> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, DisplayPreferenceValue>
    : {}
}

/** 管理模型目录、连接测试和用户主动查看的密钥，通过官方 Typert Remote 公开跨端调用。 */
export class ElecKoiModelsApi extends TypertRemoteService {
  static inject = ['typert', 'settings', 'credentials']
  private readonly ownerContext: Context
  constructor(ctx: Context) {
    super(ctx, 'eleckoiModelsApi', { namespace: 'eleckoiModels' })
    this.ownerContext = ctx
  }
  /**
   * 按模型配置编号读取密钥，供用户主动查看。
   * @param configId - 模型配置编号。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  revealApiKey(configId: string): Promise<string> {
    return readModelApiKey(this.ownerContext, configId)
  }
  /**
   * 通过官方适配器测试工具调用，不创建聊天。
   * @param input - 本次操作的输入，字段见参数类型。
   * @returns 工具调用成功时返回 supported: true；失败抛出错误。
   */
  @Remote
  testConnection(input: ModelConnectionInput): Promise<{ supported: true }> {
    return testModelConnection(this.ownerContext, input)
  }
  /**
   * 读取模型目录，能力来自官方目录或明确配置。
   * @param input - 本次操作的输入，字段见参数类型。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  discoverModels(input: ModelDiscoveryInput): Promise<ModelDiscoveryResult[]> {
    return discoverDraftModels(this.ownerContext, input)
  }
}

/** 管理联网搜索方式和 Tavily 连接测试，通过官方 Typert Remote 公开跨端调用。 */
export class ElecKoiWebSearchApi extends TypertRemoteService {
  static inject = ['typert', 'configEditor', 'settings', 'credentials']

  private readonly ownerContext: Context

  constructor(ctx: Context) {
    super(ctx, 'eleckoiWebSearchApi', { namespace: 'eleckoiWebSearch' })
    this.ownerContext = ctx
  }

  /**
   * 读取当前搜索提供商。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  selection(): WebSearchMode {
    const provider = this.webConfiguration().searchProvider
    if (provider === TAVILY_WEB_PROVIDER) return 'tavily'
    if (provider === DEEPSEEK_WEB_PROVIDER) return 'provider_native'
    throw new Error('当前搜索提供器未由 ElecKoi 设置页面管理。')
  }

  /**
   * 保存当前选择。
   * @param mode - 联网搜索方式。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  async select(mode: WebSearchMode): Promise<WebSearchMode> {
    if (mode !== 'provider_native' && mode !== 'tavily') throw new Error('不支持的联网搜索方式。')
    if (mode === 'tavily' && !this.ownerContext.settings.describe().some(item => item.ns === 'web-search-tavily')) {
      throw new Error('Tavily 搜索插件当前未启用。')
    }
    const row = this.webRow()
    const provider = mode === 'tavily' ? TAVILY_WEB_PROVIDER : DEEPSEEK_WEB_PROVIDER
    await this.ownerContext.configEditor.edit(row, current => ({ ...current, searchProvider: provider }))
    return mode
  }

  /**
   * 测试临时或已保存的密钥，不保存传入密钥。
   * @param apiKey - 仅用于测试的密钥；省略时使用当前密钥。
   * @param signal - 取消调用或结束订阅流的信号。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  async testTavily(apiKey?: string, signal?: AbortSignal): Promise<TavilyConnection> {
    const tavily = this.ownerContext.settings.describe().find(item => item.ns === 'web-search-tavily')
    if (!tavily) throw new Error('Tavily 搜索插件当前未启用。')
    const config = tavily.value as Record<string, unknown> | undefined
    const ref = typeof config?.apiKeyEnv === 'string' ? config.apiKeyEnv : TAVILY_API_KEY_REF
    const candidate = apiKey?.trim() || (await this.ownerContext.credentials.resolve(
      credentialRef(ref)
    ))?.value?.trim() || ''
    return testTavilyConnection(candidate, signal)
  }

  private webRow(): ReturnType<Context['configEditor']['entries']>[number] {
    const row = this.ownerContext.configEditor.entries().find(entry => entry.options.id === WEB_ENTRY_ID)
    if (!row) throw new Error('DSH 联网搜索配置当前不可用。')
    return row
  }

  private webConfiguration(): Record<string, unknown> {
    return this.webRow().options.config ?? {}
  }
}

/** 管理角色目录、分组和角色卡导入导出，通过官方 Typert Remote 公开跨端调用。 */
export class ElecKoiCharactersApi extends TypertRemoteService {
  static inject = [
    'typert',
    'eleckoiProductData',
    'eleckoiProductRecordChanges',
    'eleckoiConversationChanges',
    'eleckoiCharacterConfigurationChanges',
    'eleckoiRoleplaySessions',
    'eleckoiSessionEditor'
  ]

  private readonly ownerContext: Context
  private readonly productData: ElecKoiProductDataStore
  private readonly recordChanges: ProductRecordChangeFeed

  constructor(ctx: Context) {
    super(ctx, 'eleckoiCharactersApi', { namespace: 'eleckoiCharacters' })
    this.ownerContext = ctx
    this.productData = ctx.eleckoiProductData
    this.recordChanges = ctx.eleckoiProductRecordChanges
  }

  /**
   * 订阅变更通知；连接后首先收到刷新标记，取消信号结束此异步流。
   * @param signal - 取消调用或结束订阅流的信号。
   * @returns 按发生顺序返回变更通知的异步流。
   */
  @Remote({ mode: 'stream' })
  changes(signal: AbortSignal): AsyncIterable<ProductRecordChange> {
    return productRecordChanges(this.recordChanges, signal, 'characters')
  }

  /**
   * 读取目录。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  list(): CharacterCollection {
    return this.productData.readCharacters()
  }

  /**
   * 创建项目并返回更新后的数据。
   * @param character - 完整角色数据。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  create(character: CharacterRecord): CharacterCollection {
    const collection = this.productData.createCharacter(character)
    this.publishChange([character.id])
    return collection
  }

  /**
   * 更新完整数据并通知相关页面刷新。
   * @param character - 完整角色数据。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  update(character: CharacterRecord): CharacterCollection {
    const collection = this.productData.updateCharacter(character)
    this.publishChange([character.id])
    this.ownerContext.eleckoiConversationChanges.publish({ kind: 'snapshot' })
    return collection
  }

  /**
   * 保存当前选择。
   * @param characterId - 角色编号。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  select(characterId: string): CharacterCollection {
    const collection = this.productData.selectCharacter(characterId)
    this.publishChange([characterId])
    return collection
  }

  /**
   * 保存角色分组及角色所属分组。
   * @param groups - 分组名称列表。
   * @param assignments - 角色所属分组列表。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  saveGroups(groups: string[], assignments: CharacterGroupAssignment[]): CharacterCollection {
    const collection = this.productData.saveCharacterGroups(groups, assignments)
    this.publishChange(assignments.map(item => item.characterId))
    return collection
  }

  /**
   * 删除指定角色及其前端项目；默认同时删除关联聊天和官方 Session。
   * @param characterIds - 待删除角色编号列表。
   * @param options - deleteChats 为 false 时保留关联聊天及 Session。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  async delete(characterIds: string[], options?: { deleteChats?: boolean }): Promise<CharacterCollection> {
    const deleting = new Set(characterIds)
    const conversations = options?.deleteChats === false ? [] : this.productData.readConversationCatalog()
      .filter(item => deleting.has(item.metadata.characterId))
    for (const conversation of conversations) {
      await this.ownerContext.eleckoiSessionEditor.deleteSession(conversation.runtimeSessionId)
      await this.ownerContext.eleckoiRoleplaySessions.removeArtifacts(conversation.id, conversation.runtimeSessionId)
    }
    const collection = this.productData.deleteCharacters(characterIds, options)
    this.publishChange(characterIds)
    for (const conversation of conversations) {
      this.ownerContext.eleckoiConversationChanges.publish({ kind: 'catalog', conversationId: conversation.id, reason: 'deleted' })
    }
    this.ownerContext.eleckoiCharacterConfigurationChanges.publish({ kind: 'snapshot' })
    return collection
  }

  /**
   * 返回导出文件名、格式和文件内容。
   * @param characterId - 角色编号。
   * @param format - 支持的导出格式。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  export(characterId: string, format: CharacterExportFormat): CharacterExportResult {
    return this.productData.exportCharacter(characterId, format)
  }

  /**
   * 读取角色卡并生成等待确认的预览，不立即保存角色。
   * @param files - 待导入文件的内容。
   * @param source - 支持的导入格式。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  prepareImport(files: CharacterImportFile[], source: CharacterImportSource): CharacterImportPreview {
    return this.productData.prepareCharacterImports(files, source)
  }

  /**
   * 确认导入预览并保存角色。
   * @param token - 导入预览编号。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  commitImport(token: string): CharacterImportResult {
    const result = this.productData.commitCharacterImports(token)
    this.publishChange(result.importedCharacterIds)
    this.ownerContext.eleckoiCharacterConfigurationChanges.publish({ kind: 'snapshot' })
    return result
  }

  /**
   * 取消导入预览并清理临时数据。
   * @param token - 导入预览编号。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  discardImport(token: string): void {
    this.productData.discardCharacterImports(token)
  }

  private publishChange(ids?: string[]): void {
    this.recordChanges.publish({ kind: 'records', domain: 'characters', ...(ids?.length ? { ids } : {}) })
  }
}

/** 管理受管 Host 的架构和协议状态，通过官方 Typert Remote 公开跨端调用。 */
export class ElecKoiSystemApi extends TypertRemoteService {
  static inject = ['typert']

  constructor(ctx: Context) {
    super(ctx, 'eleckoiSystemApi', { namespace: 'eleckoiSystem' })
  }

  /**
   * 读取架构和协议版本。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  status(): ElecKoiHostStatus {
    return { architecture: 'dsh-remote', protocolVersion: 1 }
  }
}

/** 管理用户名称和头像资料，通过官方 Typert Remote 公开跨端调用。 */
export class ElecKoiPersonaApi extends TypertRemoteService {
  static inject = ['typert', 'eleckoiProductData', 'eleckoiProductRecordChanges', 'eleckoiConversationChanges']

  private readonly ownerContext: Context
  private readonly productData: ElecKoiProductDataStore
  private readonly recordChanges: ProductRecordChangeFeed

  constructor(ctx: Context) {
    super(ctx, 'eleckoiPersonaApi', { namespace: 'eleckoiPersona' })
    this.ownerContext = ctx
    this.productData = ctx.eleckoiProductData
    this.recordChanges = ctx.eleckoiProductRecordChanges
  }

  /**
   * 订阅变更通知；连接后首先收到刷新标记，取消信号结束此异步流。
   * @param signal - 取消调用或结束订阅流的信号。
   * @returns 按发生顺序返回变更通知的异步流。
   */
  @Remote({ mode: 'stream' })
  changes(signal: AbortSignal): AsyncIterable<ProductRecordChange> {
    return productRecordChanges(this.recordChanges, signal, 'persona')
  }

  /**
   * 读取完整保存数据。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  read(): PersonaProfile {
    return this.productData.readPersona()
  }

  /**
   * 保存完整数据并通知相关页面刷新。
   * @param profile - 完整用户资料。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  save(profile: PersonaProfile): PersonaProfile {
    const saved = this.productData.savePersona(profile)
    this.recordChanges.publish({ kind: 'records', domain: 'persona' })
    this.ownerContext.eleckoiConversationChanges.publish({ kind: 'snapshot' })
    return saved
  }
}

/** 管理完整设定库、变量定义和正则配置，通过官方 Typert Remote 公开跨端调用。 */
export class ElecKoiCharacterConfigurationApi extends TypertRemoteService {
  static inject = ['typert', 'eleckoiProductData', 'eleckoiCharacterConfigurationChanges']

  private readonly productData: ElecKoiProductDataStore
  private readonly changeFeed: CharacterConfigurationChangeFeed

  constructor(ctx: Context) {
    super(ctx, 'eleckoiCharacterConfigurationApi', { namespace: 'eleckoiCharacterConfiguration' })
    this.productData = ctx.eleckoiProductData
    this.changeFeed = ctx.eleckoiCharacterConfigurationChanges
  }

  /**
   * 订阅变更通知；连接后首先收到刷新标记，取消信号结束此异步流。
   * @param signal - 取消调用或结束订阅流的信号。
   * @returns 按发生顺序返回变更通知的异步流。
   */
  @Remote({ mode: 'stream' })
  changes(signal: AbortSignal): AsyncIterable<CharacterConfigurationChange> {
    return this.changeFeed.stream(signal)
  }

  /**
   * 读取完整角色设定库，包含必读、选读、触发方式和插入位置。
   * @param characterId - 角色编号。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  readSettingLibrary(characterId: string): SettingLibrary {
    return this.productData.readSettingLibrary(characterId)
  }

  /**
   * 读取与角色无关的完整全局设定库。
   * @returns 全局设定的分组、条目、插入位置及版本。
   */
  @Remote
  readGlobalSettingLibrary(): SettingLibrary { return this.productData.readGlobalSettingLibrary() }

  /**
   * 保存全局设定库，通知手机及 PC 编辑页面刷新。
   * @param library - 完整全局库及全部版本。
   * @returns 实际保存后的全局设定库。
   */
  @Remote
  saveGlobalSettingLibrary(library: SettingLibrary): SettingLibrary {
    const saved = this.productData.saveGlobalSettingLibrary(library)
    this.publish('settingLibraries', GLOBAL_SETTING_LIBRARY_ID)
    return saved
  }

  /**
   * 替换全局设定库当前版本的内容，保留其他版本。
   * @param library - 全局设定的条目、分组及插入位置。
   * @param signal - 取消保存的信号。
   * @returns 实际保存后的全局库。
   */
  @Remote
  replaceGlobalSettingLibraryContent(library: SettingLibraryContent, signal: AbortSignal): SettingLibrary {
    signal.throwIfAborted()
    const saved = this.productData.replaceGlobalSettingLibraryContent(library)
    this.publish('settingLibraries', GLOBAL_SETTING_LIBRARY_ID)
    return saved
  }

  /**
   * 原子修改全局库普通条目。
   * @param updates - 条目编号和需要修改的字段。
   * @param signal - 取消保存的信号。
   * @returns 保存后的指定条目。
   */
  @Remote
  updateGlobalSettingLibraryEntries(updates: SettingLibraryEntryUpdate[], signal: AbortSignal): SettingLibraryEntry[] {
    signal.throwIfAborted()
    const saved = this.productData.updateGlobalSettingLibraryEntries(updates)
    if (saved.length) this.publish('settingLibraries', GLOBAL_SETTING_LIBRARY_ID)
    return saved
  }

  /**
   * 保存全局库已展开的分组。
   * @param expandedGroupIds - 展开的分组编号。
   * @returns 实际保存的分组编号。
   */
  @Remote
  saveGlobalSettingLibraryViewState(expandedGroupIds: string[]): string[] {
    const saved = this.productData.saveGlobalSettingLibraryViewState(expandedGroupIds)
    this.publish('settingLibraries', GLOBAL_SETTING_LIBRARY_ID)
    return saved
  }

  /**
   * 保存角色设定库的当前内容，保留其他版本与管理设置。
   * @param characterId - 所属角色编号。
   * @param library - 设定库原文、文件夹和插入位置定义。
   * @param signal - 取消调用的信号。
   * @returns 实际保存后的角色设定库，仍采用现有请求规则。
   */
  @Remote
  replaceSettingLibraryContent(
    characterId: string,
    library: SettingLibraryContent,
    signal: AbortSignal
  ): SettingLibrary {
    signal.throwIfAborted()
    const saved = this.productData.replaceSettingLibraryContent(characterId, library)
    this.publish('settingLibraries', saved.characterId)
    return saved
  }

  /**
   * 按明确编号原子修改角色设定库的普通条目，只保存指定字段。
   * @param characterId - 所属角色编号。
   * @param updates - 条目编号与修改字段；不得重复指定同一编号。
   * @param signal - 取消调用的信号。
   * @returns 按指定顺序返回保存后的条目；一项失败则整组不保存。
   */
  @Remote
  updateSettingLibraryEntries(
    characterId: string,
    updates: SettingLibraryEntryUpdate[],
    signal: AbortSignal
  ): SettingLibraryEntry[] {
    signal.throwIfAborted()
    const saved = this.productData.updateSettingLibraryEntries(characterId, updates)
    if (saved.length) this.publish('settingLibraries', characterId)
    return saved
  }

  /**
   * 读取指定作用域的正式脚本库。
   * @param scope - 全局、角色或预设作用域。
   * @param ownerId - 所属角色或预设编号；全局作用域使用空字符串。
   * @returns 脚本配置、库启停与修改版本。
   */
  @Remote
  readScriptLibrary(scope: ScriptLibraryScope, ownerId: string): ScriptLibrary {
    return this.productData.readScriptLibrary(scope, ownerId)
  }

  /**
   * 读取脚本文件目录与已登记的入口文件，目录不存在时创建空目录。
   * @param scope - 全局、角色或预设作用域。
   * @param ownerId - 所属编号；全局使用空字符串。
   * @returns 本机目录、文件版本与按明确脚本编号登记的入口。
   */
  @Remote
  readScriptWorkspace(scope: ScriptLibraryScope, ownerId: string): ScriptWorkspace {
    return this.productData.readScriptWorkspace(scope, ownerId)
  }

  /**
   * 保存脚本库，检查修改版本以防止覆盖其他窗口或 SDK 的更新。
   * @param library - 完整脚本库，revision 为读取时的版本。
   * @returns 保存后的配置与新版本。
   */
  @Remote
  saveScriptLibrary(library: ScriptLibrary): ScriptLibrary {
    const saved = this.productData.saveScriptLibrary(library)
    this.publish('scripts', saved.scope === 'character' ? saved.ownerId : undefined)
    return saved
  }

  /**
   * 在同一事务中保存多个脚本库；任一版本冲突时全部保留原值。
   * @param libraries - 本页修改的脚本库及各自读取版本。
   * @returns 保存后的脚本库配置。
   */
  @Remote
  saveScriptLibraries(libraries: ScriptLibrary[]): ScriptLibrary[] {
    const saved = this.productData.saveScriptLibraries(libraries)
    if (saved.length) this.publish('scripts')
    return saved
  }

  /**
   * 保存完整角色设定库。
   * @param characterId - 角色编号。
   * @param library - 完整设定库，包含触发条件和插入位置。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  saveSettingLibrary(characterId: string, library: SettingLibrary): SettingLibrary {
    const saved = this.productData.saveSettingLibrary(characterId, library)
    this.publish('settingLibraries', characterId)
    return saved
  }

  /**
   * 保存已展开设定分组的编号。
   * @param characterId - 角色编号。
   * @param expandedGroupIds - 已展开分组编号。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  saveSettingLibraryViewState(characterId: string, expandedGroupIds: string[]): string[] {
    const saved = this.productData.saveSettingLibraryViewState(characterId, expandedGroupIds)
    this.publish('settingLibraries', characterId)
    return saved
  }

  /**
   * 读取角色各聊天的完整设定库。
   * @param characterId - 角色编号。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  readConversationSettingLibraries(characterId: string): SettingLibraryConversation[] {
    return this.productData.readConversationSettingLibraries(characterId)
  }

  /**
   * 保存指定聊天的完整设定库。
   * @param characterId - 角色编号。
   * @param conversationId - ElecKoi 聊天编号。
   * @param library - 完整设定库，包含触发条件和插入位置。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  saveConversationSettingLibrary(
    characterId: string,
    conversationId: string,
    library: SettingLibrary
  ): SettingLibrary {
    const saved = this.productData.saveConversationSettingLibrary(characterId, conversationId, library)
    this.publish('settingLibraries', characterId)
    return saved
  }

  /**
   * 将聊天设定库恢复到角色设定。
   * @param characterId - 角色编号。
   * @param conversationId - ElecKoi 聊天编号。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  resetConversationSettingLibrary(characterId: string, conversationId: string): void {
    this.productData.resetConversationSettingLibrary(characterId, conversationId)
    this.publish('settingLibraries', characterId)
  }

  /**
   * 保存聊天设定库的命名版本。
   * @param characterId - 角色编号。
   * @param conversationId - ElecKoi 聊天编号。
   * @param name - 保存的名称或附件文件名。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  saveConversationSettingLibraryVersion(
    characterId: string,
    conversationId: string,
    name: string
  ): SettingLibrary {
    const saved = this.productData.saveConversationSettingLibraryVersion(characterId, conversationId, name)
    this.publish('settingLibraries', characterId)
    return saved
  }

  /**
   * 读取变量定义和初始化配置。
   * @param characterId - 角色编号。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  readVariableConfig(characterId: string): VariableConfig {
    return this.productData.readVariableConfig(characterId)
  }

  /**
   * 保存变量定义和初始化配置。
   * @param characterId - 角色编号。
   * @param config - 完整配置，字段见参数类型。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  saveVariableConfig(characterId: string, config: VariableConfig): VariableConfig {
    const saved = this.productData.saveVariableConfig(characterId, config)
    this.publish('variables', characterId)
    return saved
  }

  /**
   * 保存已展开变量对象的编号。
   * @param characterId - 角色编号。
   * @param expandedObjectIds - 已展开变量对象编号。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  saveVariableConfigViewState(characterId: string, expandedObjectIds: string[]): string[] {
    const saved = this.productData.saveVariableConfigViewState(characterId, expandedObjectIds)
    this.publish('variables', characterId)
    return saved
  }

  /**
   * 读取完整正则配置及其 revision。
   * @param characterId - 角色编号。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  readRegexRules(characterId: string): RegexRuleCollection {
    return this.productData.readRegexRules(characterId)
  }

  /**
   * 校验 revision 后保存完整正则配置。
   * @param characterId - 角色编号。
   * @param collection - 完整正则配置。
   * @param expectedRevision - 要求仍有效的配置版本；不匹配时拒绝保存。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  saveRegexRules(
    characterId: string,
    collection: RegexRuleCollection,
    expectedRevision: number
  ): RegexRuleCollection {
    const saved = this.productData.saveRegexRules(characterId, collection, expectedRevision)
    // The collection also owns shared rules and enablement versions.
    this.publish('regexRules')
    return saved
  }

  /**
   * 校验 revision 后导入正则文件。
   * @param characterId - 角色编号。
   * @param fallbackScope - 导入文件未指定归属时使用的范围。
   * @param documents - 待导入文件列表。
   * @param expectedRevision - 要求仍有效的配置版本；不匹配时拒绝保存。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  importRegexRules(
    characterId: string,
    fallbackScope: RegexRuleScope,
    documents: RegexRuleImportDocument[],
    expectedRevision: number
  ): RegexRuleImportResult {
    const imported = this.productData.importRegexRules(characterId, fallbackScope, documents, expectedRevision)
    this.publish('regexRules')
    return imported
  }

  /**
   * 导出指定规则的 JSON 文本。
   * @param characterId - 角色编号。
   * @param ruleIds - 待导出规则编号。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  exportRegexRules(characterId: string, ruleIds: string[]): { fileName: string; json: string } {
    return this.productData.exportRegexRules(characterId, ruleIds)
  }

  /**
   * 测试规则对文本的作用，不保存规则。
   * @param text - 本次输入或待测试文本。
   * @param rule - 待测试规则。
   * @param target - 规则作用的内容类别。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  testRegexRule(text: string, rule: RegexRule, target: RegexRuleTarget): RegexRuleTestResult {
    return this.productData.testRegexRule(text, rule, target)
  }

  private publish(
    domain: Exclude<CharacterConfigurationChange, { kind: 'snapshot' }>['domain'],
    characterId?: string
  ): void {
    this.changeFeed.publish({ kind: 'configuration', domain, ...(characterId ? { characterId } : {}) })
  }
}

/** 管理 Agent 预设、分组和预设文件，通过官方 Typert Remote 公开跨端调用。 */
export class ElecKoiAgentPresetsApi extends TypertRemoteService {
  static inject = ['typert', 'eleckoiProductData', 'eleckoiCharacterConfigurationChanges']

  private readonly productData: ElecKoiProductDataStore
  private readonly configurationChanges: CharacterConfigurationChangeFeed

  constructor(ctx: Context) {
    super(ctx, 'eleckoiAgentPresetsApi', { namespace: 'eleckoiAgentPresets' })
    this.productData = ctx.eleckoiProductData
    this.configurationChanges = ctx.eleckoiCharacterConfigurationChanges
  }

  /**
   * 读取预设目录和当前预设。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  catalog(): AgentPresetCatalog {
    return this.productData.readAgentPresetCatalog()
  }

  /**
   * 读取完整保存数据。
   * @param presetId - 预设编号。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  read(presetId: string): AgentPreset {
    return this.productData.readAgentPreset(presetId)
  }

  /**
   * 按明确编号原子修改预设原稿的条目及当前版本，不创建聊天私有开关。
   * @param presetId - 要修改的预设编号。
   * @param updates - 条目编号与修改字段；使用该预设的后续请求共同生效。
   * @param signal - 取消调用的信号。
   * @returns 按指定顺序返回保存后的条目；一项失败则整组不保存。
   */
  @Remote
  updateEntries(presetId: string, updates: SettingLibraryEntryUpdate[], signal: AbortSignal): SettingLibraryEntry[] {
    signal.throwIfAborted()
    const saved = this.productData.updateAgentPresetEntries(presetId, updates)
    if (saved.length) this.publishChange()
    return saved
  }

  /**
   * 保存完整数据并通知相关页面刷新。
   * @param preset - 完整预设数据。
   * @param expectedRegexRules - 要求仍有效的正则配置。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  save(preset: AgentPreset, expectedRegexRules: RegexRule[]): AgentPreset {
    const saved = this.productData.saveAgentPreset(preset, expectedRegexRules)
    this.publishChange()
    return saved
  }

  /**
   * 创建预设并返回完整预设数据。
   * @param name - 保存的名称或附件文件名。
   * @param libraryGroupId - 预设分组编号。
   * @param purpose - 角色扮演或创作预设分类。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  create(name: string, libraryGroupId: string, purpose: AgentPresetPurpose): AgentPreset {
    const created = this.productData.createAgentPreset(name, libraryGroupId, purpose)
    this.publishChange()
    return created
  }

  /**
   * 导入文件并保存完整数据。
   * @param source - 支持的导入格式。
   * @param document - 待导入文件内容。
   * @param purpose - 目标预设分类。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  import(source: AgentPresetImportSource, document: AgentPresetImportDocument, purpose: AgentPresetPurpose): AgentPresetImportResult {
    const imported = this.productData.importAgentPreset(source, document, purpose)
    this.publishChange()
    return imported
  }

  /**
   * 返回导出文件名、格式和文件内容。
   * @param presetId - 预设编号。
   * @param format - 支持的导出格式。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  export(presetId: string, format: AgentPresetExportFormat): AgentPresetExportResult {
    return this.productData.exportAgentPreset(presetId, format)
  }

  /**
   * 设置当前使用的 Agent 预设。
   * @param presetId - 预设编号。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  setActive(presetId: string): AgentPresetCatalog {
    const catalog = this.productData.setActiveAgentPreset(presetId)
    this.publishChange()
    return catalog
  }

  /**
   * 创建预设分组。
   * @param name - 保存的名称或附件文件名。
   * @param purpose - 所属预设分类。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  createGroup(name: string, purpose: AgentPresetPurpose): AgentPresetCatalog {
    const catalog = this.productData.createAgentPresetGroup(name, purpose)
    this.publishChange()
    return catalog
  }

  /**
   * 重命名预设分组。
   * @param groupId - 预设分组编号。
   * @param name - 保存的名称或附件文件名。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  renameGroup(groupId: string, name: string): AgentPresetCatalog {
    const catalog = this.productData.renameAgentPresetGroup(groupId, name)
    this.publishChange()
    return catalog
  }

  /**
   * 设置预设所属分组。
   * @param presetId - 预设编号。
   * @param groupId - 预设分组编号。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  assignGroup(presetId: string, groupId: string): AgentPresetCatalog {
    const catalog = this.productData.assignAgentPresetGroup(presetId, groupId)
    this.publishChange()
    return catalog
  }

  /**
   * 删除预设分组。
   * @param groupId - 预设分组编号。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  deleteGroup(groupId: string): AgentPresetCatalog {
    const catalog = this.productData.deleteAgentPresetGroup(groupId)
    this.publishChange()
    return catalog
  }

  /**
   * 删除指定预设并返回更新后的预设目录。
   * @param presetId - 预设编号。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  delete(presetId: string): AgentPresetCatalog {
    const catalog = this.productData.deleteAgentPreset(presetId)
    this.publishChange()
    return catalog
  }

  private publishChange(): void {
    this.configurationChanges.publish({ kind: 'configuration', domain: 'agentPresets' })
  }
}

/** 管理创作项目目录，通过官方 Typert Remote 公开跨端调用。 */
export class ElecKoiCreatorStudioApi extends TypertRemoteService {
  static inject = ['typert', 'eleckoiProductData', 'eleckoiProductRecordChanges']

  private readonly productData: ElecKoiProductDataStore
  private readonly recordChanges: ProductRecordChangeFeed

  constructor(ctx: Context) {
    super(ctx, 'eleckoiCreatorStudioApi', { namespace: 'eleckoiCreatorStudio' })
    this.productData = ctx.eleckoiProductData
    this.recordChanges = ctx.eleckoiProductRecordChanges
  }

  /**
   * 订阅变更通知；连接后首先收到刷新标记，取消信号结束此异步流。
   * @param signal - 取消调用或结束订阅流的信号。
   * @returns 按发生顺序返回变更通知的异步流。
   */
  @Remote({ mode: 'stream' })
  changes(signal: AbortSignal): AsyncIterable<ProductRecordChange> {
    return productRecordChanges(this.recordChanges, signal, 'creatorProjects')
  }

  /**
   * 读取目录。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  list(): CreatorProjectCollection {
    return this.productData.readCreatorProjects()
  }

  /**
   * 创建项目并返回更新后的数据。
   * @param input - 本次操作的输入，字段见参数类型。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  create(input: CreateCreatorProjectInput): CreatorProjectCollection {
    const collection = this.productData.createCreatorProject(input)
    this.recordChanges.publish({ kind: 'records', domain: 'creatorProjects', ids: collection.items.map(item => item.id) })
    return collection
  }

  /**
   * 删除指定项目及其关联数据。
   * @param projectId - 创作项目编号。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  delete(projectId: string): CreatorProjectCollection {
    const collection = this.productData.deleteCreatorProject(projectId)
    this.recordChanges.publish({ kind: 'records', domain: 'creatorProjects', ids: [projectId] })
    return collection
  }
}

/** AI 创作工作室的 DSH 会话与永久编辑目标。 */
export class ElecKoiCreatorStudioSessionsApi extends TypertRemoteService {
  static inject = ['typert', 'eleckoiCreatorStudioRuntime']
  private readonly runtime: CreatorStudioRuntime
  constructor(ctx: Context) {
    super(ctx, 'eleckoiCreatorStudioSessionsApi', { namespace: 'eleckoiCreatorStudioSessions' })
    this.runtime = ctx.eleckoiCreatorStudioRuntime
  }
  /**
   * 列出工作室的正式 DSH 会话。
   * @returns 工作室会话目录。
   */
  @Remote
  list(): Promise<CreatorStudioSessionSummary[]> { return this.runtime.list() }
  /**
   * 使用当前全局创作预设创建工作室会话。
   * @param characterId - 编辑目标角色编号；空字符串表示尚未选择。
   * @returns 创建的会话及其编辑目标。
   */
  @Remote
  create(characterId: string): Promise<CreatorStudioSession> { return this.runtime.create(characterId) }
  /**
   * 恢复一个已有工作室会话。
   * @param sessionId - 正式 DSH 会话编号。
   * @returns 恢复的会话及其编辑目标。
   */
  @Remote
  open(sessionId: string): Promise<CreatorStudioSession> { return this.runtime.open(sessionId) }
  /**
   * 在空闲会话中选择永久编辑目标。
   * @param sessionId - 正式 DSH 会话编号。
   * @param characterId - 目标角色编号；空字符串解除选择。
   * @returns 更新后的工作室会话。
   */
  @Remote
  selectCharacter(sessionId: string, characterId: string): Promise<CreatorStudioSession> { return this.runtime.selectCharacter(sessionId, characterId) }

  /**
   * 修改工作室对话的正式标题。
   * @param sessionId - 工作室会话编号。
   * @param title - 新标题。
   * @returns 标题保存完成。
   */
  @Remote
  rename(sessionId: string, title: string): Promise<void> { return this.runtime.rename(sessionId, title) }

  /**
   * 设置工作室对话的置顶状态。
   * @param sessionId - 工作室会话编号。
   * @param pinned - 是否置顶。
   * @returns 置顶状态保存完成。
   */
  @Remote
  pin(sessionId: string, pinned: boolean): Promise<void> { return this.runtime.pin(sessionId, pinned) }

  /**
   * 删除工作室对话及其正式 Session 文件。
   * @param sessionId - 工作室会话编号。
   * @returns 删除完成。
   */
  @Remote
  delete(sessionId: string): Promise<void> { return this.runtime.delete(sessionId) }

  /**
   * 读取工作室可操作的用户和助手消息。
   * @param sessionId - 工作室会话编号。
   * @returns 消息正文及正式事件位置。
   */
  @Remote
  messages(sessionId: string): Promise<CreatorStudioMessage[]> { return this.runtime.messages(sessionId) }

  /**
   * 从指定消息起删除当前对话的后续消息。
   * @param sessionId - 工作室会话编号。
   * @param eventSeq - 起始消息的正式事件序号。
   * @param role - 起始消息的角色。
   * @returns 删除完成。
   */
  @Remote
  deleteMessagesFrom(sessionId: string, eventSeq: number, role: 'user' | 'assistant'): Promise<void> { return this.runtime.deleteMessagesFrom(sessionId, eventSeq, role) }

  /**
   * 保留最近的用户输入并重新生成回复。
   * @param sessionId - 工作室会话编号。
   * @returns 重新生成已启动。
   */
  @Remote
  regenerate(sessionId: string): Promise<void> { return this.runtime.regenerate(sessionId) }
}


export const Config = z.object({ state: z.any().default({}).volatile(), media: z.any().default({}).volatile(), databank: z.any().default({}).volatile(), tts: z.any().default({}).volatile() })

const eleckoiProductApiPlugin = {
  name: 'eleckoi-product-api',
  Config,
  inject: ['typert', 'eleckoiProductData'],
  provide: ['eleckoiConversationChanges', 'eleckoiVariableProcessing', 'eleckoiCharacterConfigurationChanges', 'eleckoiProductRecordChanges'],
  async apply(ctx: Context) {
    ctx.provide('eleckoiConversationChanges', new ConversationChangeFeed())
    const variableProcessing = new ElecKoiVariableProcessing(ctx.eleckoiProductData)
    ctx.provide('eleckoiVariableProcessing', variableProcessing)
    ctx.effect(() => () => variableProcessing.close())
    ctx.provide('eleckoiCharacterConfigurationChanges', new CharacterConfigurationChangeFeed())
    ctx.provide('eleckoiProductRecordChanges', new ProductRecordChangeFeed())
    await ctx.plugin(ElecKoiConversationLifecycle)
    await ctx.plugin(ElecKoiSystemApi)
    await ctx.plugin(ElecKoiCharactersApi)
    await ctx.plugin(ElecKoiPersonaApi)
    await ctx.plugin(ElecKoiCharacterConfigurationApi)
    await ctx.plugin(ElecKoiAgentPresetsApi)
    await ctx.plugin(ElecKoiCreatorStudioApi)
    await ctx.plugin(ElecKoiCreatorStudioSessionsApi)
    await ctx.plugin(ElecKoiWebSearchApi)
    await ctx.plugin(ElecKoiModelsApi)
    await ctx.plugin(ElecKoiDisplayPreferencesApi)
    await ctx.plugin(ElecKoiConversationModelsApi)
    await ctx.plugin(ElecKoiConversationsApi)
    await ctx.plugin(ElecKoiAuthorVariablesApi)
    await ctx.plugin(ElecKoiAuthorFrontendsApi)
    await ctx.plugin(eleckoiFrontendAssetsPlugin)
    await ctx.plugin(ElecKoiAuthorScriptsApi)
    await ctx.plugin(eleckoiScriptAssetsPlugin)
    await ctx.plugin(ElecKoiTavernCompatibilityApi)
    ctx.inject(['eleckoiTavernCompatibilityApi', 'eleckoiConversationsApi'], scope => {
      scope.eleckoiTavernCompatibilityApi.setSnapshotReader(conversationId => scope.eleckoiConversationsApi.tavernSnapshot(conversationId))
    })
    ctx.inject(['eleckoiTavernCompatibilityApi', 'eleckoiRoleplaySessions'], scope => {
      scope.eleckoiTavernCompatibilityApi.registerOperation('generation.preview', (conversationId, params) =>
        scope.eleckoiRoleplaySessions.previewPrompt(conversationId, typeof params.text === 'string' ? params.text : '', params.type === 'continue'))
    })
    const inspect = registerHostApiInspect(ctx)
    return async () => {
      try { await inspect.dispose() }
      finally {
        ctx.eleckoiConversationChanges.close()
        ctx.eleckoiCharacterConfigurationChanges.close()
        ctx.eleckoiProductRecordChanges.close()
      }
    }
  }
} satisfies Plugin.Object

export default eleckoiProductApiPlugin
