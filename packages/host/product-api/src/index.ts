import type { Context, Plugin } from '@deepseek-ai/cordis'
import type { EditorLibraryAddress, EditorLibraryVersions, EditorLibrarySaveRequest, EditorLibrarySaveResult } from './types.js'
import { ElecKoiConversationLifecycle } from './conversationLifecycle.js'
import { parseChatImport } from './chatImport.js'
import { productFailure } from './productFailure.js'
import { ELECKOI_FAILURE_CODES } from './errorCodes.generated.js'
import { registerHostApiInspect } from './hostInspect.js'
import { readSessionInspection } from './sessionInspection.js'
export { readSessionInspection } from './sessionInspection.js'
import { randomUUID } from 'node:crypto'
import { RemoteChangeFeed } from './remote-change-feed.js'
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
import type {} from '@deepseek-ai/dsh-tools'
import { withPluginTools } from '@eleckoi/dsh-client-roleplay/host/tool-policy.mjs'
import { toolPluginSources } from './tool-provenance.js'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import { SessionLogOffset, type SessionEvent, type SessionHeader, type SessionId } from '@deepseek-ai/dsh-session'

declare module '@deepseek-ai/dsh-session' {
  interface SessionEventMap {
    'eleckoi/input-continuation': { turn: number; inputMessageId: string; inputEventSeq: number }
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
  RegexEditorTarget,
  RegexRuleEditorCollection,
  RegexRuleEditorImportResult,
  RegexRuleImportDocument,
  RegexRuleImportResult,
  RegexRuleScope,
  RegexRuleTarget,
  RegexRuleTestResult,
  CharacterOpenings,
  GlobalSettingLibraryCollection,
  CharacterOpeningMessage,
  SettingLibrary,
  SettingLibraryContent,
  SettingLibraryConversation,
  SettingLibraryEntry,
  SettingLibraryEntryUpdate,
  ScriptLibrary,
  ScriptLibraryScope,
  ScriptWorkspace,
  TavilyConnection,
  WebSearchMode,
  WebFetchMode,
  VariableConfig,
  VariableViewerTimeline
} from './types.js'
import { testTavilyConnection } from './tavily.js'
import { ElecKoiVariableProcessing } from './variable-processing.js'
import { ElecKoiAuthorVariablesApi } from './author-variables.js'
import { ElecKoiAuthorScriptsApi, eleckoiScriptAssetsPlugin } from './author-scripts.js'
export { ElecKoiAuthorVariablesApi } from './author-variables.js'
export { ElecKoiAuthorScriptsApi, eleckoiScriptAssetsPlugin } from './author-scripts.js'
export { productFailure, PRODUCT_FAILURE_DETAIL_KEYS, FALLBACK_FAILURE_CODE } from './productFailure.js'
export type { ProductFailure, ProductFailureDetails, ProductFailureIssue } from './productFailure.js'
export { ELECKOI_FAILURE_CODES } from './errorCodes.generated.js'
export type { ClientFailureCode } from './errorCodes.generated.js'
export type { NativeAuthorScriptCatalog, NativeAuthorRuleTask, NativeAuthorRuleReply, ScriptWorkspace } from './types.js'
export { ElecKoiVariableProcessing } from './variable-processing.js'
export type { VariableRuleProvider, VariableRuleRun, VariableRuleContext } from './variable-processing.js'
export type { ScriptLibrary, ScriptLibraryScope, ScriptTree } from './types.js'
import type { ElecKoiSessionEditor } from './sessionEditor.js'
export type { ElecKoiSessionEditor } from './sessionEditor.js'
import { discoverDraftModels, readModelApiKey } from './modelDiscovery.js'
export { discoverDraftModels, readModelApiKey } from './modelDiscovery.js'
import type { ModelDiscoveryInput, ModelDiscoveryResult } from './types.js'

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
  WebFetchMode,
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
  CharacterOpenings,
  CharacterOpeningMessage,
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
      /** @internal 当前正式角色会话的根配置；非角色会话返回 undefined。 */
      configuration(sessionId: string): { autoIllustration?: { enabled: boolean; modelConfigId: string }; inheritedFromSessionId?: string } | undefined
      readGeneratedImage(conversationId: string, batchId: string, frameId: number, attachmentId: string, signal: AbortSignal): Promise<{ mediaType: string; data: string }>
      regenerateImage(conversationId: string, batchId: string, frameId: number, signal: AbortSignal): Promise<import('@eleckoi/dsh-product-data').GeneratedImageFrame>
      create(conversationId: string): Promise<string>
      adoptFork(conversationId: string, sourceConversationId: string, sourceTurn: number, afterTurn: boolean): Promise<string>
      prepareSessionAccess(conversationId: string): Promise<string>
      preparePrompt(conversationId: string, text: string, signal?: AbortSignal, retainedInputMessageId?: string): Promise<string>
      currentOperation(conversationId: string): string
      prepareRegeneration(conversationId: string, text: string): Promise<{
        rollback(): void
      }>
      variableStatesByTurn(conversationId: string): Record<string, string>
      prepareRestoreBeforeTurn(conversationId: string, sessionId: string, fromTurn: number, beforeMessageId?: string): {
        state: import('./types.js').ConversationRuntimeStateSnapshot
        apply(retainedInputIds: readonly string[]): void
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

// 「确实不处理」的具名声明：语义见 packages/shared/src/foundation/swallowedFailure.ts。
const bestEffort = (): void => {}


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
    if (!descriptor) throw productFailure(ELECKOI_FAILURE_CODES.lifecycleNotReady, 'DSH 显示偏好配置尚未加载。', { what: 'DSH 显示偏好配置' })
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
  private readonly pendingRegenerations = new Map<string, { requestId: string; inputMessageId: string; inputEventSeq: number }>()
  static inject = [
    'typert',
    'agents',
    'sessionController', 'sessionQuery',
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
    if (!batchId || !Number.isSafeInteger(frameId) || frameId < 1) throw productFailure(ELECKOI_FAILURE_CODES.inputInvalid, '图片重新生成参数不正确。', { field: 'batchId/frameId' })
    await this.ownerContext.eleckoiConversationLifecycle.exclusive(conversationId, async () => {
      const result = await this.ownerContext.eleckoiRoleplaySessions.regenerateImage(conversationId, batchId, frameId, signal)
      this.changeFeed.publish({ kind: 'generation', conversationId, error: result.error || '' })
      if (result.error) throw productFailure(ELECKOI_FAILURE_CODES.mediaInvalid, result.error, { what: '重新生成的图片' })
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
    const sessions = new Map(listed.items.map(item => [String(item.sessionId), item]))
    return records.map(summary => {
      const session = sessions.get(summary.runtimeSessionId)
      const updatedAt = Math.max(session?.updatedAt ?? 0, session?.projections?.values.eleckoiConversationActivity ?? 0)
      return {
        ...summary,
        updatedAt: updatedAt > Date.parse(summary.updatedAt)
          ? new Date(updatedAt).toISOString() : summary.updatedAt,
        preview: session?.projections?.values.eleckoiConversationPreview || summary.preview
      }
    }).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
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
      runtimeVariableStateByTurn: this.ownerContext.eleckoiRoleplaySessions.variableStatesByTurn(conversationId)
    }
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
    if (!Array.isArray(messages)) throw productFailure(ELECKOI_FAILURE_CODES.dataShapeInvalid, '待显示的消息数量无效。', { what: '待显示的消息' })
    for (const message of messages) {
      if (!message || typeof message.id !== 'string' || !message.id
        || (message.role !== 'user' && message.role !== 'assistant')
        || typeof message.content !== 'string'
        || typeof message.variableStateJson !== 'string'
        || !['complete', 'streaming', 'error', 'cancelled'].includes(message.status)
        || typeof message.createdAt !== 'string') {
        throw productFailure(ELECKOI_FAILURE_CODES.dataShapeInvalid, '待显示的消息格式无效。', { what: '待显示的消息' })
      }
      if (message.reasoning !== undefined) {
        if (message.role !== 'assistant' || !Array.isArray(message.reasoning)) throw productFailure(ELECKOI_FAILURE_CODES.dataShapeInvalid, '待显示的推理格式无效。', { what: '待显示的推理' })
        const ids = new Set<string>()
        for (const item of message.reasoning) {
          if (!item || typeof item.id !== 'string' || !item.id || typeof item.text !== 'string' || ids.has(item.id)) {
            throw productFailure(ELECKOI_FAILURE_CODES.dataShapeInvalid, '待显示的推理格式无效。', { what: '待显示的推理' })
          }
          ids.add(item.id)
        }
      }
    }
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
    const inspection = await readSessionInspection(this.ownerContext, runtimeSessionId as SessionId)
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
        throw productFailure(ELECKOI_FAILURE_CODES.statePrecondition, '请先等待当前回复结束，再导出聊天记录。', { what: '等待当前回复结束' })
      }
      try {
        const inspection = await readSessionInspection(this.ownerContext, runtimeSessionId as SessionId)
        sessionLogs.push({
          header: inspection.meta,
          inheritedEventCount: inspection.inheritedEventCount,
          events: [...inspection.events]
        })
      } catch {
        if (requiredIds.has(runtimeSessionId)) throw productFailure(ELECKOI_FAILURE_CODES.lookupNotFound, '聊天记录缺少对应的 DSH 会话日志，无法完整导出。', { what: '聊天记录对应的 DSH 会话日志' })
      }
    }
    const archivedIds = new Set(sessionLogs.map((item) => item.header.id as string))
    if ([...requiredIds].some((id) => !archivedIds.has(id))) {
      throw productFailure(ELECKOI_FAILURE_CODES.lookupNotFound, '聊天记录缺少对应的 DSH 会话日志，无法完整导出。', { what: '聊天记录对应的 DSH 会话日志' })
    }
    return JSON.stringify({
      format: 'eleckoi.desktop-chat-history',
      version: 2,
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
    const first = json.split(/\r?\n/).find(line => line.trim())
    let tavernHeader = false
    try {
      const header: unknown = first ? JSON.parse(first) : undefined
      tavernHeader = !!header && typeof header === 'object' && !Array.isArray(header) && Object.hasOwn(header, 'chat_metadata')
    } catch {
      // A multiline native archive is parsed below.
      // 探测酒馆头失败只说明首行不是 JSON 头，不属于要报告的失败。
      bestEffort()
    }
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
    try { value = JSON.parse(json) } catch { throw productFailure(ELECKOI_FAILURE_CODES.dataShapeInvalid, '聊天记录不是有效的 JSON 文件。', { what: '聊天记录文件' }) }
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw productFailure(ELECKOI_FAILURE_CODES.dataShapeInvalid, '聊天记录文件格式不正确。', { what: '聊天记录文件' })
    const archive = value as Record<string, unknown>
    if (archive.format !== 'eleckoi.desktop-chat-history' || (archive.version !== 1 && archive.version !== 2)
      || !Array.isArray(archive.sessionLogs)) throw productFailure(ELECKOI_FAILURE_CODES.inputUnsupported, '不支持此聊天记录文件。', { what: '聊天记录文件的格式或版本' })
    const snapshot = this.productData.parseConversationArchive(archive.snapshot)
    if (snapshot.characterId !== characterId) throw productFailure(ELECKOI_FAILURE_CODES.stateMismatch, '聊天记录与当前角色不匹配。', { what: '聊天记录与角色' })
    const expectedIds = new Set(this.productData.conversationArchiveRuntimeSessionIds(snapshot))
    const logs = parseDshSessionArchives(archive.sessionLogs, expectedIds)
    const archivedIds = new Set(logs.map((item) => item.header.id as string))
    if (this.productData.requiredConversationArchiveRuntimeSessionIds(snapshot).some((id) => !archivedIds.has(id))) {
      throw productFailure(ELECKOI_FAILURE_CODES.dataShapeInvalid, '聊天记录缺少对应的 DSH 会话日志。', { what: '聊天记录里的 DSH 会话日志' })
    }
    const conversationId = randomUUID()
    const ids = new Map([...expectedIds].map((id) => [id, id === snapshot.conversationId ? conversationId : randomUUID()]))
    const createdIds: string[] = []
    let importedId: string | undefined
    try {
      for (const log of logs) {
        const id = ids.get(log.header.id as string)
        if (!id) throw productFailure(ELECKOI_FAILURE_CODES.dataShapeInvalid, '聊天记录缺少 DSH 会话映射。', { what: '聊天记录里的 DSH 会话映射' })
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
    const inspection = await readSessionInspection(this.ownerContext, runtimeSessionId as SessionId, signal)
    if (!sessionContainsFile(inspection.events, attachmentId, name)) {
      throw productFailure(ELECKOI_FAILURE_CODES.lookupNotFound, '文件不在当前聊天记录中。', { what: '当前聊天记录中的文件' })
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
    const source = this.productData.runtimeSessionId(conversationId), inspection = await readSessionInspection(this.ownerContext, source as SessionId)
    const targetIndex = inspection.events.findIndex(event => Number(event.seq) === atSeq)
    if (targetIndex < 0) throw productFailure(ELECKOI_FAILURE_CODES.lookupNotFound, `Branch event does not exist: ${atSeq}`, { what: '分支边界的聊天消息' })
    const sourceTurn = sessionMessageTurn(inspection.events, targetIndex), target = inspection.events[targetIndex]!
    if (!visibleSessionMessages(inspection.events).some(message => message.seq === atSeq)
      || (target.type === 'assistant/message' && !settledSessionReplyText(jsonRecord(target)).trim())) {
      throw productFailure(ELECKOI_FAILURE_CODES.statePrecondition, '只能从正式显示的聊天消息创建分支，不能把中间工具步骤当成完整回复状态。', { what: '选择一条正式显示的聊天消息' })
    }
    const fork = await this.ownerContext.sessionController.fork({ sessionId: source as SessionId, atSeq })
    let id: string | undefined
    try {
      const snapshot = this.productData.exportConversationArchive(conversationId), retained = new Set(retainedTurnIds)
      for (const row of snapshot.tables.agent_openings ?? []) retained.add(String(row.turnId))
      snapshot.tables.agent_turns = (snapshot.tables.agent_turns ?? []).filter(row => retained.has(String(row.id)))
      snapshot.tables.agent_responses = (snapshot.tables.agent_responses ?? []).filter(row => retained.has(String(row.turnId))
        && (row.runtimeThreadId !== source || row.dshTurn === null || Number(row.dshTurn) <= sourceTurn))
      snapshot.tables.agent_branch_turns = (snapshot.tables.agent_branch_turns ?? []).filter(row => retained.has(String(row.turnId)))
      const inputs = new Set(inspection.events.slice(0, targetIndex + 1).filter(event => event.type === 'user/message')
        .map(event => String(jsonRecord(event.data).id ?? '')))
      const stateHistory = snapshot.tables.conversation_state_snapshots
      const retainedReplies = snapshot.tables.agent_responses
      if (!stateHistory || !retainedReplies) throw productFailure(ELECKOI_FAILURE_CODES.dataShapeInvalid, '聊天归档缺少正式状态历史或消息关系。', { what: '聊天归档的状态历史或消息关系' })
      snapshot.tables.conversation_state_snapshots = stateHistory.filter(row => {
        if (row.runtimeSessionId !== source) return row.boundaryType === 'reply'
          ? retainedReplies.some(reply => reply.id === row.boundaryId) : inputs.has(String(row.boundaryId))
        if (row.turn === null) return row.boundaryType === 'opening' || inputs.has(String(row.boundaryId))
        return Number(row.turn) < sourceTurn || (Number(row.turn) === sourceTurn
          && (row.phase === 'before' || target.type === 'assistant/message'))
      })
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
      await readSessionInspection(this.ownerContext, runtimeSessionId as SessionId),
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
      const inspection = await readSessionInspection(this.ownerContext, runtimeSessionId as SessionId)
      const target = requireSessionMessage(inspection, eventSeq, role)
      const fromTurn = sessionMessageTurn(inspection.events, target.index)
      const visible = visibleSessionMessages(inspection.events)
      const selectedVisibleIndex = visible.findIndex(item => item.seq === eventSeq)
      if (selectedVisibleIndex < 0) throw productFailure(ELECKOI_FAILURE_CODES.lookupNotFound, '找不到要删除的 DSH 消息。', { what: '要删除的 DSH 消息' })
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
          if (rewound === undefined) throw productFailure(ELECKOI_FAILURE_CODES.stateMismatch, '当前 DSH Session 不能安全回退。', { what: '当前 DSH 会话的回退状态' })
          const retained = await readSessionInspection(this.ownerContext, runtimeSessionId as SessionId)
          restoreRuntime.apply(retainedInputMessageIds(retained.events))
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
      if (!requestId.trim()) throw productFailure(ELECKOI_FAILURE_CODES.dataShapeInvalid, '重新生成请求缺少有效标识。', { what: '重新生成请求标识' })
      const runtimeSessionId = this.productData.runtimeSessionId(conversationId)
      await this.ownerContext.eleckoiRoleplaySessions.prepareSessionAccess(conversationId)
      const inspection = await readSessionInspection(this.ownerContext, runtimeSessionId as SessionId)
      const target = requireSessionMessage(inspection, eventSeq, 'user')
      const fromTurn = sessionMessageTurn(inspection.events, target.index)
      const inputMessageId = String(jsonRecord(target.event.data).id ?? '')
      if (!inputMessageId) throw productFailure(ELECKOI_FAILURE_CODES.dataShapeInvalid, '重新生成的用户事件缺少消息标识。', { what: '用户事件的消息标识' })
      const promptText = replacementMessage ?? sessionMessageText(target.event)
      if (replacementMessage !== undefined && !replacementMessage.trim()) throw productFailure(ELECKOI_FAILURE_CODES.inputInvalid, '重新生成的用户输入不能为空。', { field: 'replacementMessage' })
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
          const rewound = await this.ownerContext.eleckoiSessionEditor.rewind(runtimeSessionId, fromTurn, eventSeq, true)
          if (rewound === undefined) throw productFailure(ELECKOI_FAILURE_CODES.stateMismatch, '当前 DSH Session 不能安全回退。', { what: '当前 DSH 会话的回退状态' })
          const retained = await readSessionInspection(this.ownerContext, runtimeSessionId as SessionId)
          restoreRuntime.apply(retainedInputMessageIds(retained.events))
          await this.ownerContext.eleckoiRoleplaySessions.preparePrompt(conversationId, promptText, undefined, inputMessageId)
        })
      } catch (error) {
        restoreRuntime.rollback()
        preparation.rollback()
        this.changeFeed.publish({ kind: 'messages', conversationId, reason: 'edited', messageIds: [String(eventSeq)], sessionRewritten: true })
        throw error
      }
      this.pendingRegenerations.set(conversationId, { requestId, inputMessageId, inputEventSeq: eventSeq })
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
    if (!pending || pending.requestId !== requestId) throw productFailure(ELECKOI_FAILURE_CODES.stateMismatch, '重新生成请求已失效。', { what: '重新生成请求' })
    this.pendingRegenerations.delete(conversationId)
    if (cancelled) return { accepted: false }
    const runtimeSessionId = this.productData.runtimeSessionId(conversationId)
    const resolved = await this.ownerContext.sessionController.resolveAgent(runtimeSessionId as SessionId)
    if ('error' in resolved) throw resolved.error
    const agent = resolved.agent as typeof resolved.agent & { continueFromInput?: (messageId: string) => number }
    if (typeof agent.continueFromInput !== 'function') throw productFailure(ELECKOI_FAILURE_CODES.inputUnsupported, '当前 DSH 运行时不支持复用已有用户事件。', { what: '当前 DSH 运行时的用户事件复用能力' })
    const turn = agent.continueFromInput(pending.inputMessageId)
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
    const inspection = await readSessionInspection(this.ownerContext, sessionId)
    // Cold reads must also account for accepted input still waiting in the inbox.
    const projections = await this.ownerContext.sessionController.projections({ sessionId }, new AbortController().signal)
    if (!projections) throw productFailure(ELECKOI_FAILURE_CODES.lifecycleNotReady, '无法读取聊天状态，不能修改开场白。', { what: '聊天状态投影' })
    const inbox = projections.values.inbox
    if (!inbox) throw productFailure(ELECKOI_FAILURE_CODES.lifecycleNotReady, '无法读取输入队列，不能修改开场白。', { what: '输入队列投影' })
    const agent = this.ownerContext.agents.get(sessionId)
    // Recheck the attached writer after the asynchronous reads, then commit
    // synchronously so prompt admission cannot interleave with the mutation.
    const events = agent?.session.snapshotEvents() ?? inspection.events
    if (events.some(event => event.type === 'user/message' && event.data.source.kind === 'user')
      || agent?.status === 'running' || agent?.inbox.nextTurn.length || agent?.inbox.nextStep.length
      || inbox?.['next-turn'].length || inbox?.['next-step'].length
      || this.pendingRegenerations.has(conversationId)) {
      throw productFailure(ELECKOI_FAILURE_CODES.statePrecondition, '对话开始后不能再切换或修改开场白。', { what: '在对话开始前修改开场白' })
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
      throw productFailure(ELECKOI_FAILURE_CODES.inputInvalid, '聊天记录中的 DSH 会话数据无效。', { field: 'sessionLogs' })
    }
    const archive = item as Partial<DshSessionArchive>
    const id = archive.header?.id as string | undefined
    if (!id || !expectedIds.has(id) || archivedIds.has(id)
      || !Array.isArray(archive.events)
      || !Number.isSafeInteger(archive.inheritedEventCount)
      || (archive.inheritedEventCount ?? -1) < 0) {
      throw productFailure(ELECKOI_FAILURE_CODES.inputInvalid, '聊天记录中的 DSH 会话数据无效。', { field: 'sessionLogs' })
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
    throw productFailure(ELECKOI_FAILURE_CODES.inputInvalid, '文件附件引用无效。', { field: 'attachmentId' })
  }
  const home = process.env.DSH_HOME
  if (!home) throw productFailure(ELECKOI_FAILURE_CODES.lifecycleNotReady, 'DSH 附件目录尚未就绪。', { what: 'DSH 附件目录' })
  return join(home, 'attachments', 'v1', 'files', match[1].slice(0, 2), match[1], name)
}

export function requireSessionMessage(
  inspection: { events: readonly unknown[] },
  eventSeq: number,
  role: 'user' | 'assistant'
): { event: Record<string, unknown>; index: number } {
  if (!Number.isSafeInteger(eventSeq) || eventSeq < 0) throw productFailure(ELECKOI_FAILURE_CODES.inputInvalid, 'DSH 消息事件序号不正确。', { field: 'eventSeq' })
  const expectedType = role === 'user' ? 'user/message' : 'assistant/message'
  const index = inspection.events.findIndex((candidate) => {
    const event = jsonRecord(candidate)
    if (event.seq !== eventSeq || event.type !== expectedType || event.surfaceOp !== 'append') return false
    if (role !== 'user') return true
    return jsonRecord(jsonRecord(event.data).source).kind === 'user'
  })
  if (index < 0) throw productFailure(ELECKOI_FAILURE_CODES.lookupNotFound, '找不到要修改的 DSH 消息。', { what: '要修改的 DSH 消息' })
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
  throw productFailure(ELECKOI_FAILURE_CODES.lookupNotFound, '找不到这条消息所属的 DSH 轮次。', { what: '这条消息所属的 DSH 轮次' })
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

function retainedInputMessageIds(events: readonly unknown[]): string[] {
  return events.flatMap(candidate => {
    const event = jsonRecord(candidate), id = jsonRecord(event.data).id
    return event.type === 'user/message' && typeof id === 'string' && id ? [id] : []
  })
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
  variableSnapshotAvailable: boolean
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
    const content = settledSessionReplyText(event)
    if (!content.trim()) continue
    const turn = sessionMessageTurn(events, index)
    finalByTurn.set(turn, { event, index, content, turn })
  }
  return [...finalByTurn.values()].sort((left, right) => Number(left.event.seq) - Number(right.event.seq)).flatMap(({ event, content, turn }) => {
    let state = variableStateByTurn[String(turn)]
    if (typeof state !== 'string') {
      const rows = historicalByTurn.get(turn) ?? []
      state = rows.length === 1 ? rows[0]?.variableStateJson : undefined
    }
    const available = typeof state === 'string' && !!state.trim()
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
      variableStateJson: available ? state! : '',
      variableSnapshotAvailable: available,
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

function settledSessionReplyText(event: Record<string, unknown>): string {
  const message = jsonRecord(jsonRecord(event.data).message)
  const source = jsonRecord(message.source)
  // Transcript import declares complete source replies; their original text has
  // no generated-final delimiter and must remain unchanged in the Session log.
  return source.provider === 'eleckoi-import' && source.model === 'transcript'
    ? sessionMessageText(event) : officialFinalReplyText(sessionMessageText(event))
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

/** 管理模型目录和用户主动查看的密钥，通过官方 Typert Remote 公开跨端调用。 */
export class ElecKoiModelsApi extends TypertRemoteService {
  static inject = ['typert', 'settings', 'credentials', 'llm']
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
   * 读取模型目录，能力来自官方目录或明确配置。
   * @param input - 本次操作的输入，字段见参数类型。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  discoverModels(input: ModelDiscoveryInput): Promise<ModelDiscoveryResult[]> {
    return discoverDraftModels(this.ownerContext, input)
  }
}

/** 管理搜索、网页抓取和连接测试，通过官方 Typert Remote 公开跨端调用。 */
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
    if (provider === 'deepseek-search-api') return 'deepseek_search_api'
    if (provider === TAVILY_WEB_PROVIDER) return 'tavily'
    if (provider === DEEPSEEK_WEB_PROVIDER) return 'provider_native'
    throw productFailure(ELECKOI_FAILURE_CODES.stateMismatch, '当前搜索提供器未由 ElecKoi 设置页面管理。', { what: '当前搜索提供器' })
  }

  /**
   * 保存当前选择。
   * @param mode - 联网搜索方式。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  async select(mode: WebSearchMode): Promise<WebSearchMode> {
    if (mode !== 'provider_native' && mode !== 'tavily' && mode !== 'deepseek_search_api') throw productFailure(ELECKOI_FAILURE_CODES.inputUnsupported, '不支持的联网搜索方式。', { what: '联网搜索方式', expected: 'provider_native、tavily、deepseek_search_api' })
    if (mode === 'tavily' && !this.ownerContext.settings.describe().some(item => item.ns === 'web-search-tavily')) {
      throw productFailure(ELECKOI_FAILURE_CODES.modelConfigInvalid, 'Tavily 搜索插件当前未启用。', { field: 'Tavily 搜索插件', what: '联网搜索插件配置' })
    }
    if (mode === 'deepseek_search_api') {
      if (!this.ownerContext.settings.describe().some(item => item.ns === 'web-deepseek-api')) throw productFailure(ELECKOI_FAILURE_CODES.lifecycleNotReady, 'DSH 官方 DeepSeek 联网 API 插件当前未启用。', { what: 'DSH 官方 DeepSeek 联网 API 插件' })
    }
    const row = this.webRow()
    const provider = mode === 'deepseek_search_api' ? 'deepseek-search-api' : mode === 'tavily' ? TAVILY_WEB_PROVIDER : DEEPSEEK_WEB_PROVIDER
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
    if (!tavily) throw productFailure(ELECKOI_FAILURE_CODES.modelConfigInvalid, 'Tavily 搜索插件当前未启用。', { field: 'Tavily 搜索插件', what: '联网搜索插件配置' })
    const config = tavily.value as Record<string, unknown> | undefined
    const ref = typeof config?.apiKeyEnv === 'string' ? config.apiKeyEnv : TAVILY_API_KEY_REF
    const candidate = apiKey?.trim() || (await this.ownerContext.credentials.resolve(
      credentialRef(ref)
    ))?.value?.trim() || ''
    return testTavilyConnection(candidate, signal)
  }

  /**
   * 读取网页抓取方式。
   * @returns 当前网页抓取提供商。
   */
  @Remote
  fetchSelection(): WebFetchMode {
    const provider = this.webConfiguration().fetchProvider
    if (provider === 'deepseek-fetch-api') return 'deepseek_fetch_api'
    if (provider === 'http') return 'http'
    throw productFailure(ELECKOI_FAILURE_CODES.stateMismatch, '当前抓取提供器未由 ElecKoi 设置页面管理。', { what: '当前抓取提供器' })
  }

  /**
   * 保存网页抓取方式，不改变搜索方式。
   * @param mode - 网页抓取方式。
   * @returns 已保存的网页抓取提供商。
   */
  @Remote
  async selectFetch(mode: WebFetchMode): Promise<WebFetchMode> {
    if (mode !== 'http' && mode !== 'deepseek_fetch_api') throw productFailure(ELECKOI_FAILURE_CODES.inputUnsupported, '不支持的网页抓取方式。', { what: '网页抓取方式', expected: 'http、deepseek_fetch_api' })
    if (mode === 'deepseek_fetch_api') {
      if (!this.ownerContext.settings.describe().some(item => item.ns === 'web-deepseek-api')) throw productFailure(ELECKOI_FAILURE_CODES.lifecycleNotReady, 'DSH 官方 DeepSeek 联网 API 插件当前未启用。', { what: 'DSH 官方 DeepSeek 联网 API 插件' })
    }
    await this.ownerContext.configEditor.edit(this.webRow(), current => ({ ...current, fetchProvider: mode === 'deepseek_fetch_api' ? 'deepseek-fetch-api' : 'http' }))
    return mode
  }

  private webRow(): ReturnType<Context['configEditor']['entries']>[number] {
    const row = this.ownerContext.configEditor.entries().find(entry => entry.options.id === WEB_ENTRY_ID)
    if (!row) throw productFailure(ELECKOI_FAILURE_CODES.lifecycleNotReady, 'DSH 联网搜索配置当前不可用。', { what: 'DSH 联网搜索配置' })
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
   * 复制角色卡及其专属配置和资源，保留原卡并创建独立副本。
   * @param characterId - 原角色编号。
   * @returns 新角色编号和更新后的目录；失败抛出错误。
   */
  @Remote
  duplicate(characterId: string): { characterId: string; collection: CharacterCollection } {
    const result = this.productData.duplicateCharacter(characterId)
    this.publishChange([result.characterId])
    this.ownerContext.eleckoiCharacterConfigurationChanges.publish({ kind: 'snapshot' })
    return result
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
   * 删除指定角色及其前端项目、关联聊天和官方 Session。
   * @param characterIds - 待删除角色编号列表。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  async delete(characterIds: string[]): Promise<CharacterCollection> {
    const deleting = new Set(characterIds)
    const conversations = this.productData.readConversationCatalog()
      .filter(item => deleting.has(item.metadata.characterId))
    for (const conversation of conversations) {
      await this.ownerContext.eleckoiSessionEditor.deleteSession(conversation.runtimeSessionId)
      await this.ownerContext.eleckoiRoleplaySessions.removeArtifacts(conversation.id, conversation.runtimeSessionId)
    }
    const collection = this.productData.deleteCharacters(characterIds)
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
  static inject = ['typert', 'eleckoiProductData', 'eleckoiCharacterConfigurationChanges', 'eleckoiProductRecordChanges']

  private readonly productData: ElecKoiProductDataStore
  private readonly changeFeed: CharacterConfigurationChangeFeed
  private readonly recordChanges: ProductRecordChangeFeed

  constructor(ctx: Context) {
    super(ctx, 'eleckoiCharacterConfigurationApi', { namespace: 'eleckoiCharacterConfiguration' })
    this.productData = ctx.eleckoiProductData
    this.changeFeed = ctx.eleckoiCharacterConfigurationChanges
    this.recordChanges = ctx.eleckoiProductRecordChanges
  }


  /**
   * 读取明确归属的命名配置版本，脚本归档只在需要编辑版本时读取。
   * @param address - 类型、作用域与所属编号；全局使用空所属编号。
   * @returns 当前版本、命名版本正文和并发修改标识。
   */
  @Remote
  readEditorLibraryVersions(address: EditorLibraryAddress): EditorLibraryVersions {
    return this.productData.readEditorLibraryVersions(address)
  }

  /**
   * 原子保存配置草稿及其命名版本，源码资源在同一操作中保持完整。
   * @param request - 明确类型的配置文档、版本草稿与读取时的修改标识。
   * @returns 保存后的配置文档和版本；冲突时保留原数据。
   */
  @Remote
  saveEditorLibraries(request: EditorLibrarySaveRequest): EditorLibrarySaveResult {
    const result = this.productData.saveEditorLibraries(request)
    this.publish(request.kind === 'regex' ? 'regexRules' : request.kind)
    return result
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
   * 读取独立于设定库的角色开场白。
   * @param characterId - 所属角色编号。
   * @returns 当前开场白、备用开场白及变量绑定。
   */
  @Remote
  readCharacterOpenings(characterId: string): CharacterOpenings {
    return this.productData.readCharacterOpenings(characterId)
  }

  /**
   * 保存角色独立开场白，不修改任何设定库版本。
   * @param characterId - 所属角色编号。
   * @param value - 完整开场白草稿。
   * @returns 实际保存后的角色开场白配置。
   */
  @Remote
  saveCharacterOpenings(characterId: string, value: CharacterOpenings): CharacterOpenings {
    const saved = this.productData.saveCharacterOpenings(characterId, value)
    this.publish('openings', characterId)
    this.recordChanges.publish({ kind: 'records', domain: 'characters', ids: [characterId] })
    return saved
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
   * 读取独立的全局设定库集合，不属于任何角色版本。
   * @returns 全局库及并发修改标识。
   */
  @Remote
  readGlobalSettingLibraries(): GlobalSettingLibraryCollection {
    return this.productData.readGlobalSettingLibraries()
  }

  /**
   * 原子保存全局库的内容、启停和删除；冲突时保留原数据。
   * @param value - 全局库草稿及读取时的修改标识。
   * @returns 已保存的全局库集合。
   */
  @Remote
  saveGlobalSettingLibraries(value: GlobalSettingLibraryCollection): GlobalSettingLibraryCollection {
    const saved = this.productData.saveGlobalSettingLibraries(value)
    this.publish('globalSettingLibraries')
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
   * 原子导入设定库，旧文件中的开场白追加为备用开场白并保持当前开场白不变。
   * @param characterId - 所属角色编号。
   * @param library - 已并入导入版本的设定库草稿。
   * @param openingImports - 旧文件明确携带的开场白条目；不包含时传空数组。
   * @returns 实际保存后的设定库；变量绑定无效时整次导入回滚。
   */
  // RETIRE WHEN: 停止支持含开场白的 v3 设定库文件后，删除本方法、Store 导入方法及 Client 分流。
  @Remote
  importSettingLibrary(characterId: string, library: SettingLibrary, openingImports: CharacterOpeningMessage[]): SettingLibrary {
    const saved = this.productData.importSettingLibrary(characterId, library, openingImports)
    this.publish('settingLibraries', characterId)
    if (openingImports.length) this.publish('openings', characterId)
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
   * 读取全局及明确归属的正则，不依赖当前启用预设或角色。
   * @param target - 编辑归属，必须提供明确的角色或预设编号。
   * @returns 仅含允许范围的规则及版本成员。
   */
  @Remote
  readRegexEditor(target: RegexEditorTarget): RegexRuleEditorCollection {
    return this.productData.readRegexEditor(target)
  }

  /**
   * 原子保存全局及编辑归属的正则，保留其他归属的规则与版本成员。
   * @param collection - 携带全局及归属版本校验的编辑草稿。
   * @returns 保存后的编辑配置；过期草稿拒绝保存。
   */
  @Remote
  saveRegexEditor(collection: RegexRuleEditorCollection): RegexRuleEditorCollection {
    const saved = this.productData.saveRegexEditor(collection)
    this.publish('regexRules')
    if (collection.target.scope === 'preset') this.publish('agentPresets')
    return saved
  }

  /**
   * 导入全局及指定归属的规则，拒绝跨归属文件。
   * @param collection - 导入前的编辑配置与版本。
   * @param fallbackScope - 文件没有归属字段时使用的允许范围。
   * @param documents - 正则 JSON 文件。
   * @returns 导入结果；归属冲突时不写入。
   */
  @Remote
  importRegexEditor(collection: RegexRuleEditorCollection, fallbackScope: RegexRuleScope, documents: RegexRuleImportDocument[]): RegexRuleEditorImportResult {
    const result = this.productData.importRegexEditor(collection, fallbackScope, documents)
    this.publish('regexRules')
    if (collection.target.scope === 'preset') this.publish('agentPresets')
    return result
  }

  /**
   * 导出当前编辑归属内选中的规则。
   * @param target - 明确的编辑归属。
   * @param ruleIds - 仅限当前编辑器中的规则编号。
   * @returns 可下载的 JSON 文件名与内容。
   */
  @Remote
  exportRegexEditor(target: RegexEditorTarget, ruleIds: string[]): { fileName: string; json: string } {
    return this.productData.exportRegexEditor(target, ruleIds)
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
   * @param options - 测试范围、变量快照 JSON、深度与编辑场景。
   * @param signal - 关闭编辑器或取消测试时结束计算。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  testRegexRule(text: string, rule: RegexRule, target: RegexRuleTarget, options?: { surface?: 'Display' | 'Prompt' | 'Stored'; variablesJson?: string; depth?: number; isEdit?: boolean }, signal?: AbortSignal): Promise<RegexRuleTestResult> {
    return this.productData.testRegexRule(text, rule, target, options, signal)
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
    ctx.inject(['tools'], owner => {
      let previous = JSON.stringify(owner.tools.schemas())
      owner.on('tools/change', () => {
        const current = JSON.stringify(owner.tools.schemas())
        if (current === previous) return
        previous = current
        this.publishChange()
      })
    })
  }

  private async resolveToolReferences(preset: AgentPreset): Promise<AgentPreset> {
    const declarations = this.ctx.get('tools')?.schemas() ?? []
    const sources = await toolPluginSources(this.ctx, declarations.map(tool => tool.name))
    return withPluginTools(preset, declarations, sources)
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
  read(presetId: string): Promise<AgentPreset> {
    return this.resolveToolReferences(this.productData.readAgentPreset(presetId))
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
  save(preset: AgentPreset, expectedRegexRules: RegexRule[]): Promise<AgentPreset> {
    const saved = this.productData.saveAgentPreset(preset, expectedRegexRules)
    this.publishChange()
    return this.resolveToolReferences(saved)
  }

  /**
   * 创建预设并返回完整预设数据。
   * @param name - 保存的名称或附件文件名。
   * @param libraryGroupId - 预设分组编号。
   * @param purpose - 角色扮演或创作预设分类。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  create(name: string, libraryGroupId: string, purpose: AgentPresetPurpose): Promise<AgentPreset> {
    const created = this.productData.createAgentPreset(name, libraryGroupId, purpose)
    this.publishChange()
    return this.resolveToolReferences(created)
  }

  /**
   * 导入文件并保存完整数据。
   * @param source - 支持的导入格式。
   * @param document - 待导入文件内容。
   * @param purpose - 目标预设分类。
   * @returns 操作结果，结构见返回类型；失败抛出错误。
   */
  @Remote
  async import(source: AgentPresetImportSource, document: AgentPresetImportDocument, purpose: AgentPresetPurpose): Promise<AgentPresetImportResult> {
    const imported = this.productData.importAgentPreset(source, document, purpose)
    this.publishChange()
    return { ...imported, preset: await this.resolveToolReferences(imported.preset) }
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
   * @param workspaceId - 官方工作区编号；省略时沿用默认工作目录。
   * @returns 创建的会话及其编辑目标。
   */
  @Remote
  create(characterId: string, workspaceId?: string): Promise<CreatorStudioSession> { return this.runtime.create(characterId, workspaceId) }
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


const eleckoiProductApiPlugin = {
  name: 'eleckoi-product-api',
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
