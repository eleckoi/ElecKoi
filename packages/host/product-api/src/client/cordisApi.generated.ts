/** 由 pnpm generate:plugin-docs 生成。公开服务的只读目录，与完整参考使用同一份源码分析结果。 */

import { productFailure } from '../productFailure.js'
import { ELECKOI_FAILURE_CODES } from '../errorCodes.generated.js'

/* jscpd:ignore-start */
/** One named parameter in a Service method or Event listener. */
export interface ApiParameter {
  /** Parameter name from the exact signature. */
  name: string
  /** Source-owned parameter contract. */
  description: string
}

/** One public service member and its source-owned contract. */
export interface ServiceApiMethod {
  /** Public method signature with its body stripped. */
  signature: string
  /** Method purpose and behavior. */
  description: string
  /** Named parameters in signature order. */
  parameters: readonly ApiParameter[]
  /** Non-void result contract when documented. */
  returns?: string
  /** Documented failure conditions. */
  throws?: readonly string[]
}

/** One harness `ctx.<key>` service and its public methods. */
export interface ServiceApiEntry {
  /** The `ctx.<key>` name, e.g. `tools`. */
  key: string
  /** First sentence of the service class JSDoc. */
  summary: string
  /** Complete service description. */
  description: string
  /** Public methods, bodies stripped, in source order. */
  methods: readonly ServiceApiMethod[]
}

/** One harness event: its dispatch mode, exact signature, and listener contract. */
export interface EventApiEntry {
  /** The scoped event name, e.g. `agent/status`. */
  name: string
  /** The dispatch mode from the declaration's `@mode` tag. */
  mode: string
  /** The exact listener signature, whitespace-normalized. */
  signature: string
  /** First sentence of the event JSDoc. */
  summary: string
  /** Complete event description. */
  description: string
  /** Named listener parameters in signature order. */
  parameters: readonly ApiParameter[]
}

/** One inherited (cordis core + loader/hmr/timer) `ctx` member group with its summary. */
export interface InheritedApiEntry {
  /** The `ctx` member name(s), e.g. `ctx.on / ctx.once`. */
  name: string
  /** One-line summary of what the member does. */
  summary: string
}

/** One named type declaration referenced by a Service or Event signature. */
export interface TypeApiEntry {
  /** The exported type/interface name, e.g. `ShellRunResult`. */
  name: string
  /** The full declaration text, comments stripped. */
  declaration: string
}

/** Every harness `ctx.<key>` service, sorted by key. */
export const SERVICE_API: readonly ServiceApiEntry[] = [
  {
    key: 'eleckoiAuthorRuntime',
    summary: '正式原生作者页面与脚本运行服务。',
    description: '正式原生作者页面与脚本运行服务。',
    methods: [
      {
        signature: 'getSnapshot(): NativeAuthorRuntimeSnapshot',
        description: '读取当前运行状态。',
        parameters: [],
        returns: '当前聊天与各脚本的运行状态。',
      },
      {
        signature: 'subscribe(listener: () => void): () => void',
        description: '订阅运行状态。',
        parameters: [{ name: 'listener', description: '状态变化回调。' }],
        returns: '取消订阅函数。',
      },
      {
        signature: 'getUiSnapshot(): NativeAuthorUiSnapshot',
        description: '读取当前脚本按钮与作者面板。',
        parameters: [],
        returns: '仅包含当前程序代际的界面注册。',
      },
      {
        signature: 'subscribeUi(listener: () => void): () => void',
        description: '订阅按钮与作者面板变化。',
        parameters: [{ name: 'listener', description: '界面变化回调。' }],
        returns: '取消订阅函数。',
      },
      {
        signature: 'invokeButton(key: string): Promise<void>',
        description: '执行明确编号的脚本按钮，重复点击或失效按钮会报错。',
        parameters: [{ name: 'key', description: '界面快照中的完整按钮编号。' }],
        returns: '作者回调完成后结束，失败时拒绝。',
      },
      {
        signature: 'dismissPanel(key: string): boolean',
        description: '关闭仍与编号对应的面板，不影响后来打开的面板。',
        parameters: [{ name: 'key', description: '界面快照中的面板编号。' }],
        returns: '是否关闭该面板。',
      },
      {
        signature: 'mountScriptPanelDocument(target: Window, key: string): () => void',
        description: '在作者面板安装所属脚本的 SDK 和设置接口。',
        parameters: [{ name: 'target', description: '同源面板窗口。' }, { name: 'key', description: '界面快照中的面板编号。' }],
        returns: '撤回本页面 SDK 的函数。',
      },
      {
        signature: 'registerChatUi(conversationId: string, handlers: NativeAuthorChatHandlers): () => void',
        description: '注册指定聊天的输入框操作。',
        parameters: [{ name: 'conversationId', description: '聊天编号。' }, { name: 'handlers', description: '页面实际实现的操作。' }],
        returns: '撤回本次注册的函数。',
      },
      {
        signature: 'mountDocument(target: Window, conversationId: string, messageId: string): () => void',
        description: '在作者页面安装固定聊天作用域的 SDK。',
        parameters: [{ name: 'target', description: '同源作者页面窗口。' }, { name: 'conversationId', description: '所属聊天编号。' }, { name: 'messageId', description: '所属消息编号；聊天页面传空字符串。' }],
        returns: '关闭该页面 SDK 的函数。',
      },
      {
        signature: 'mountProjectDocument(target: Window, project: NativeAuthorProjectContext): () => void',
        description: '在项目页面安装 SDK；应用项目跟随选择，角色项目只操作明确所属角色的聊天。',
        parameters: [{ name: 'target', description: '同源项目页面窗口。' }, { name: 'project', description: '明确项目编号、入口、窗口及所属角色；聊天页面还须提供所属聊天。' }],
        returns: '关闭该页面 SDK 的函数。',
      },
    ],
  },
  {
    key: 'eleckoiCharacterOpenings',
    summary: '角色独立开场白的读取、保存与变更订阅服务。',
    description: '角色独立开场白的读取、保存与变更订阅服务。',
    methods: [
      {
        signature: 'getSnapshot(characterId: string): ConfigurationSnapshot<CharacterOpenings>',
        description: '读取角色开场白在页面中的当前状态。',
        parameters: [{ name: 'characterId', description: '所属角色编号。' }],
        returns: '当前页面保存的配置状态。',
      },
      {
        signature: 'subscribe(listener: (kind: \'configuration\', characterId: string, snapshot: ConfigurationSnapshot<CharacterOpenings>) => void): () => void',
        description: '订阅独立开场白配置变化。',
        parameters: [{ name: 'listener', description: '接收角色编号和新状态的回调。' }],
        returns: '取消订阅函数。',
      },
      {
        signature: 'read(characterId: string): Promise<CharacterOpenings>',
        description: '读取全部开场白并更新页面状态。',
        parameters: [{ name: 'characterId', description: '所属角色编号。' }],
        returns: '完整的角色开场白配置。',
      },
      {
        signature: 'save(characterId: string, value: CharacterOpenings): Promise<CharacterOpenings>',
        description: '保存角色开场白及变量绑定，不修改设定库。',
        parameters: [{ name: 'characterId', description: '所属角色编号。' }, { name: 'value', description: '完整开场白配置。' }],
        returns: '实际保存后的角色开场白配置。',
      },
    ],
  },
  {
    key: 'eleckoiCharacters',
    summary: '管理角色、分组、角色卡导入和浏览器下载。',
    description: '管理角色、分组、角色卡导入和浏览器下载。',
    methods: [
      {
        signature: 'getSnapshot(): CharacterCatalogSnapshot',
        description: '读取当前页面的角色目录状态。',
        parameters: [],
        returns: '当前页面保存的状态对象。',
      },
      {
        signature: 'subscribe(listener: () => void): () => void',
        description: '订阅角色目录变化。',
        parameters: [{ name: 'listener', description: '状态变化回调；返回的函数用于取消订阅。' }],
        returns: '取消本次订阅的函数。',
      },
      {
        signature: 'refresh(): Promise<CharacterCollection>',
        description: '重新读取角色目录。',
        parameters: [],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'create(character: CharacterRecord): Promise<CharacterCollection>',
        description: '创建角色并更新目录。',
        parameters: [{ name: 'character', description: '完整角色数据。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'duplicate(characterId: string): Promise<{ characterId: string; collection: CharacterCollection }>',
        description: '复制角色及其专属配置、资源，创建独立副本并刷新目录。',
        parameters: [{ name: 'characterId', description: '原角色编号。' }],
        returns: '新角色编号和更新后的目录；异步失败会拒绝 Promise。',
      },
      {
        signature: 'update(character: CharacterRecord): Promise<CharacterCollection>',
        description: '保存角色并更新目录。',
        parameters: [{ name: 'character', description: '完整角色数据。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'select(characterId: string): Promise<CharacterCollection>',
        description: '选择当前角色。',
        parameters: [{ name: 'characterId', description: '角色编号。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'saveGroups(groups: string[], assignments?: CharacterGroupAssignment[]): Promise<CharacterCollection>',
        description: '保存分组和角色所属分组。',
        parameters: [{ name: 'groups', description: '分组名称列表。' }, { name: 'assignments', description: '角色所属分组列表。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'delete(characterIds: string[]): Promise<CharacterCollection>',
        description: '删除指定角色。',
        parameters: [{ name: 'characterIds', description: '角色编号列表。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'prepareImport(source: CharacterImportSource, files: CharacterImportFile[]): Promise<CharacterImportPreview>',
        description: '读取角色卡，生成待确认的导入预览。',
        parameters: [{ name: 'source', description: '支持的导入格式。' }, { name: 'files', description: '待导入文件的内容。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'commitImport(token: string): Promise<CharacterImportResult>',
        description: '确认并保存一次预览中的角色卡。',
        parameters: [{ name: 'token', description: 'prepareImport 返回的预览编号。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'discardImport(token: string): Promise<void>',
        description: '取消并清理一次导入预览。',
        parameters: [{ name: 'token', description: 'prepareImport 返回的预览编号。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'exportCharacters(characterIds: string[], format: CharacterExportFormat): Promise<CharacterDownloadResult>',
        description: '逐个保存角色卡，分别报告成功、取消和失败；Android 等待系统保存完成。',
        parameters: [{ name: 'characterIds', description: '角色编号列表。' }, { name: 'format', description: '支持的导出格式。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
    ],
  },
  {
    key: 'eleckoiConversations',
    summary: '管理聊天目录、官方 Session 的消息显示、提交、停止、回退和角色资料。',
    description: '管理聊天目录、官方 Session 的消息显示、提交、停止、回退和角色资料。',
    methods: [
      {
        signature: 'observeRequestPreviews(id: string, onChange: (requests: ConversationRequestPreviewSummary[]) => void, signal: AbortSignal): Promise<void>',
        description: '订阅当前运行期间实际发起的请求目录；取消时释放订阅。',
        parameters: [{ name: 'id', description: '聊天编号。' }, { name: 'onChange', description: '接收不含正文的请求目录。' }, { name: 'signal', description: '关闭弹窗或切换聊天时取消订阅。' }],
        returns: '订阅结束后完成；失败会拒绝 Promise。',
      },
      {
        signature: 'readRequestPreview(id: string, requestId: string, signal: AbortSignal): Promise<ConversationRequestPreview>',
        description: '读取当前运行期间某次实际请求的正文；不提供关闭后的恢复。',
        parameters: [{ name: 'id', description: '聊天编号。' }, { name: 'requestId', description: '请求目录中的标识。' }, { name: 'signal', description: '切换请求时取消读取。' }],
        returns: '实际发送顺序与可读正文。',
      },
      {
        signature: 'getSnapshot(): ConversationCatalogSnapshot',
        description: '读取聊天目录的页面状态。',
        parameters: [],
        returns: '当前页面保存的状态对象。',
      },
      {
        signature: 'subscribe(listener: () => void): () => void',
        description: '订阅聊天目录变化。',
        parameters: [{ name: 'listener', description: '状态变化回调。' }],
        returns: '取消本次订阅的函数。',
      },
      {
        signature: 'getDetailsSnapshot(): ConversationDetailsSnapshot',
        description: '读取当前打开聊天的消息和加载状态。',
        parameters: [],
        returns: '当前页面保存的状态对象。',
      },
      {
        signature: 'getSessionReference(runtimeSessionId: string): SessionReference | null',
        description: '读取当前聊天已经就绪的正式 Session 引用，生命周期由聊天服务持有，调用者不得释放。',
        parameters: [{ name: 'runtimeSessionId', description: '必须与当前聊天一致的正式 Session 编号。' }],
        returns: '已就绪的借用引用；尚未就绪或身份不一致时返回 null。',
      },
      {
        signature: 'subscribeDetails(listener: () => void): () => void',
        description: '订阅当前聊天的消息变化。',
        parameters: [{ name: 'listener', description: '状态变化回调。' }],
        returns: '取消本次订阅的函数。',
      },
      {
        signature: 'getStatsSnapshot(): ConversationStatsSnapshot',
        description: '读取当前聊天的统计显示快照。',
        parameters: [],
        returns: '来自 DSH 投影、在重新生成期间保持连续的统计。',
      },
      {
        signature: 'subscribeStats(listener: () => void): () => void',
        description: '订阅当前聊天的统计显示变化。',
        parameters: [{ name: 'listener', description: '状态变化回调。' }],
        returns: '取消本次订阅的函数。',
      },
      {
        signature: 'getChatSnapshot(): ConversationChatSnapshot',
        description: '同时读取当前聊天的消息和生成状态。',
        parameters: [],
        returns: '当前页面保存的状态对象。',
      },
      {
        signature: 'subscribeChat(listener: () => void): () => void',
        description: '订阅聊天消息或生成状态变化。',
        parameters: [{ name: 'listener', description: '状态变化回调。' }],
        returns: '取消本次订阅的函数。',
      },
      {
        signature: 'getTimelineSnapshot(): ConversationTimelineSnapshot',
        description: '读取当前变量时间线的状态。',
        parameters: [],
        returns: '当前页面保存的状态对象。',
      },
      {
        signature: 'subscribeTimeline(listener: () => void): () => void',
        description: '订阅变量时间线变化。',
        parameters: [{ name: 'listener', description: '状态变化回调。' }],
        returns: '取消本次订阅的函数。',
      },
      {
        signature: 'getStreamSnapshot(): ConversationStreamSnapshot',
        description: '读取当前回复的流式正文和处理过程。',
        parameters: [],
        returns: '当前页面保存的状态对象。',
      },
      {
        signature: 'readImage(conversationId: string, attachment: ImageAttachmentRef | ConversationGeneratedImage): Promise<string>',
        description: '读取同一 Session 的正式图片资源，复用官方图片所有者。',
        parameters: [{ name: 'conversationId', description: 'ElecKoi 聊天编号。' }, { name: 'attachment', description: '正式图片引用。' }],
        returns: '浏览器可加载的资源 URL。',
      },
      {
        signature: 'regenerateImage(conversationId: string, image: ConversationGeneratedImage): Promise<void>',
        description: '用原始 AI 回复中的提示词重新生成选中的一张图片。',
        parameters: [{ name: 'conversationId', description: 'ElecKoi 聊天编号。' }, { name: 'image', description: '明确的批次和图片编号。' }],
        returns: '图片替换和聊天投影刷新完成。',
      },
      {
        signature: 'subscribeStream(listener: () => void): () => void',
        description: '订阅当前回复的流式输出。',
        parameters: [{ name: 'listener', description: '状态变化回调。' }],
        returns: '取消本次订阅的函数。',
      },
      {
        signature: 'subscribeGeneration(listener: (change: ConversationGenerationChange) => void): () => void',
        description: '订阅当前正式 Session 的生成边界；基线只用于同步正在观察的轮次，不代表新生成。',
        parameters: [{ name: 'listener', description: '接收当前绑定身份、实时事件或重建基线。' }],
        returns: '取消本次订阅的函数。',
      },
      {
        signature: 'getGenerationReply(runtimeSessionId: string, turn: number, eventSeq: number): ConversationGenerationReply',
        description: '按正式生成身份读取结算后的显示消息；空消息只在明确关闭节点确认后返回。',
        parameters: [{ name: 'runtimeSessionId', description: '当前绑定的正式 Session。' }, { name: 'turn', description: '已结束的正式轮次。' }, { name: 'eventSeq', description: '对应 assistant/message 的正式事件位置。' }],
        returns: '投影等待、唯一结算消息或明确不可用原因。',
      },
      {
        signature: 'refresh(): Promise<ConversationSummary[]>',
        description: '重新读取聊天目录。',
        parameters: [],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'readInputDraft(conversationId: string): string',
        description: '读取当前聊天官方输入框的实际草稿，不读取页面内部状态。',
        parameters: [{ name: 'conversationId', description: '当前聊天编号。' }],
        returns: '官方输入框的文本投影；未就绪或不属于当前聊天时抛出错误。',
      },
      {
        signature: 'writeInputDraft(conversationId: string, text: string): string',
        description: '通过官方输入框写入草稿，保留其编辑与引用处理规则。',
        parameters: [{ name: 'conversationId', description: '当前聊天编号。' }, { name: 'text', description: '要写入的完整文本。' }],
        returns: '官方输入框接受的实际文本。',
      },
      {
        signature: 'submitInput(conversationId: string): boolean',
        description: '请求官方输入框提交当前草稿及其附件，不等待生成完成。',
        parameters: [{ name: 'conversationId', description: '当前聊天编号。' }],
        returns: '是否请求了提交；空输入或正在裁决、提交时返回 false。',
      },
      {
        signature: 'create(input: ConversationCreateInput): Promise<ConversationClientDetails>',
        description: '创建聊天并返回关联的官方 Session 编号和产品消息元数据。',
        parameters: [{ name: 'input', description: '本次创建、提交或重新生成所需数据。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'open(id: string): Promise<ConversationClientDetails | null>',
        description: '打开聊天；切换到其他聊天后，过期请求返回 null。',
        parameters: [{ name: 'id', description: '要打开或读取的聊天编号。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'pageOlder(expectedId: string, expectedBeforeSequence: number): Promise<ConversationClientDetails | null>',
        description: '读取更早消息；当前聊天或分页位置已改变时返回 null。',
        parameters: [{ name: 'expectedId', description: '发起分页时的聊天编号。' }, { name: 'expectedBeforeSequence', description: '发起分页时的上一页边界。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'openTimeline(id: string): Promise<VariableViewerTimeline | null>',
        description: '打开指定聊天的变量时间线。',
        parameters: [{ name: 'id', description: '要打开或读取的聊天编号。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'closeTimeline(id: string): void',
        description: '关闭指定聊天的变量时间线订阅。',
        parameters: [{ name: 'id', description: '要打开或读取的聊天编号。' }],
        returns: '操作完成。',
      },
      {
        signature: 'uploadFile(conversationId: string, file: File, options?: { signal?: AbortSignal; onProgress?: (progress: FileUploadProgress) => void }): Promise<ConversationUploadedFile>',
        description: '通过官方文件上传服务上传附件，返回可提交的附件编号。',
        parameters: [{ name: 'conversationId', description: 'ElecKoi 聊天编号。' }, { name: 'file', description: '浏览器 File 对象。' }, { name: 'options', description: '上传取消信号和进度回调。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'prepareNativeInput(input: { sessionId: string; text?: string; signal?: AbortSignal }): Promise<{ kind: \'success\' } | { kind: \'error\'; text: string }>',
        description: '准备官方输入框即将提交的文本，校验当前聊天与 Session 一致。',
        parameters: [{ name: 'input', description: '本次创建、提交或重新生成所需数据。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'send(input: ConversationSendInput): Promise<ConversationRunResult>',
        description: '通过官方 Session 提交用户输入，并等待本次请求结束。',
        parameters: [{ name: 'input', description: '本次创建、提交或重新生成所需数据。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'regenerate(input: ConversationRegenerateInput): Promise<ConversationRunResult>',
        description: '在同一聊天和 Session 中回退并重新生成指定用户输入。',
        parameters: [{ name: 'input', description: '本次创建、提交或重新生成所需数据。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'cancelRequest(conversationId: string, requestId: string): Promise<boolean>',
        description: '停止指定请求；未匹配当前运行请求时返回 false。',
        parameters: [{ name: 'conversationId', description: 'ElecKoi 聊天编号。' }, { name: 'requestId', description: '本次提交的唯一请求编号。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'cancelGeneration(conversationId: string): Promise<boolean>',
        description: '停止当前打开聊天的生成，包括由官方输入框提交的请求。',
        parameters: [{ name: 'conversationId', description: '当前 ElecKoi 聊天编号。' }],
        returns: '匹配正在执行的请求或 Session 时返回 true；不取消其他聊天。',
      },
      {
        signature: 'readSelection(): Promise<ConversationSelection>',
        description: '读取当前聊天及各角色首选聊天。',
        parameters: [],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'saveSelection(value: ConversationSelection): Promise<ConversationSelection>',
        description: '保存当前聊天及各角色首选聊天。',
        parameters: [{ name: 'value', description: '完整待保存的聊天选择。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'readModelSelection(conversationId: string): Promise<ConversationModelSelection>',
        description: '读取该聊天下一轮使用的全局模型。',
        parameters: [{ name: 'conversationId', description: 'ElecKoi 聊天编号。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'readTrajectory(conversationId: string): Promise<TrajectorySnapshot>',
        description: '读取官方轨迹投影，必要时先打开目标聊天。',
        parameters: [{ name: 'conversationId', description: 'ElecKoi 聊天编号。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'exportArchive(conversationId: string): Promise<string>',
        description: '导出聊天资料和官方 Session 轨迹的归档 JSON。',
        parameters: [{ name: 'conversationId', description: 'ElecKoi 聊天编号。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'importArchive(characterId: string, json: string): Promise<string>',
        description: '导入归档到指定角色，返回新聊天编号。',
        parameters: [{ name: 'characterId', description: '角色编号。' }, { name: 'json', description: '聊天归档 JSON 文本。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'revealFile(conversationId: string, attachmentId: string, name: string): Promise<void>',
        description: '在文件管理器中显示聊天附件。',
        parameters: [{ name: 'conversationId', description: 'ElecKoi 聊天编号。' }, { name: 'attachmentId', description: '官方附件编号。' }, { name: 'name', description: '附件文件名。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'selectModel(conversationId: string, selection: ConversationModelSelection): Promise<ConversationModelSelection>',
        description: '保存下一轮的全局模型选择。',
        parameters: [{ name: 'conversationId', description: 'ElecKoi 聊天编号。' }, { name: 'selection', description: '模型提供商、模型编号和可选推理档位。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'selectOpening(conversationId: string, openingId: string): Promise<ConversationClientDetails | null>',
        description: '切换聊天开场白并刷新消息。',
        parameters: [{ name: 'conversationId', description: 'ElecKoi 聊天编号。' }, { name: 'openingId', description: '开场白编号。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'updateOpening(conversationId: string, content: string): Promise<ConversationClientDetails | null>',
        description: '修改聊天开场白并刷新消息。',
        parameters: [{ name: 'conversationId', description: 'ElecKoi 聊天编号。' }, { name: 'content', description: '要保存的消息文本。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'rememberSession(characterId: string, sessionId: string): void',
        description: '在当前页面记住一个角色的首选聊天。',
        parameters: [{ name: 'characterId', description: '角色编号。' }, { name: 'sessionId', description: '目标聊天编号。' }],
        returns: '操作完成。',
      },
      {
        signature: 'preferredSession(characterId: string): string',
        description: '读取当前页面记住的角色首选聊天。',
        parameters: [{ name: 'characterId', description: '角色编号。' }],
        returns: '当前页面记住的聊天编号；未选择时为空字符串。',
      },
      {
        signature: 'forgetSession(characterId: string, sessionId: string): void',
        description: '清除页面中匹配的首选聊天。',
        parameters: [{ name: 'characterId', description: '角色编号。' }, { name: 'sessionId', description: '目标聊天编号。' }],
        returns: '操作完成。',
      },
      {
        signature: 'readAuthorState(conversationId: string): Promise<AuthorConversationState>',
        description: '读取当前聊天的有效设定库、变量配置和变量状态，保留完整设定字段。',
        parameters: [{ name: 'conversationId', description: 'ElecKoi 聊天编号。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'replaceAuthorVariableState(conversationId: string, state: Record<string, VariableJsonValue>): Promise<Record<string, VariableJsonValue>>',
        description: '替换当前聊天变量；正在生成时由 Host 拒绝修改。',
        parameters: [{ name: 'conversationId', description: 'ElecKoi 聊天编号。' }, { name: 'state', description: '完整的新变量对象。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'editMessage(conversationId: string, eventSeq: number, role: \'user\' | \'assistant\', content: string): Promise<ConversationClientDetails | null>',
        description: '修改官方 Session 中的一条消息并刷新聊天显示。',
        parameters: [{ name: 'conversationId', description: 'ElecKoi 聊天编号。' }, { name: 'eventSeq', description: '官方 Session 中消息的事件序号。' }, { name: 'role', description: '要修改或回退的消息角色。' }, { name: 'content', description: '要保存的消息文本。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'deleteMessagesFrom(conversationId: string, eventSeq: number, role: \'user\' | \'assistant\'): Promise<{ details: ConversationClientDetails | null deletedMessageCount: number remainingMessageCount: number }>',
        description: '从指定消息起回退聊天并刷新显示。',
        parameters: [{ name: 'conversationId', description: 'ElecKoi 聊天编号。' }, { name: 'eventSeq', description: '官方 Session 中消息的事件序号。' }, { name: 'role', description: '要修改或回退的消息角色。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'delete(conversationId: string): Promise<void>',
        description: '删除聊天及对应 Session，刷新目录。',
        parameters: [{ name: 'conversationId', description: 'ElecKoi 聊天编号。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'getModelSelectionSnapshot(): ConversationModelSelection',
        description: '读取页面中的模型选择。',
        parameters: [],
        returns: '当前页面保存的状态对象。',
      },
      {
        signature: 'subscribeModelSelection(listener: () => void): () => void',
        description: '订阅模型选择变化。',
        parameters: [{ name: 'listener', description: '状态变化回调。' }],
        returns: '取消本次订阅的函数。',
      },
    ],
  },
  {
    key: 'eleckoiCreatorStudio',
    summary: '管理创作项目并使用官方目录选择器。',
    description: '管理创作项目并使用官方目录选择器。',
    methods: [
      {
        signature: 'getSnapshot(): CreatorStudioSnapshot',
        description: '读取项目目录状态。',
        parameters: [],
        returns: '当前页面保存的状态对象。',
      },
      {
        signature: 'subscribe(listener: () => void): () => void',
        description: '订阅项目目录变化。',
        parameters: [{ name: 'listener', description: '状态变化回调；返回的函数用于取消订阅。' }],
        returns: '取消本次订阅的函数。',
      },
      {
        signature: 'refresh(): Promise<CreatorProjectCollection>',
        description: '重新读取项目目录。',
        parameters: [],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'create(input: CreateCreatorProjectInput): Promise<CreatorProjectCollection>',
        description: '创建项目并更新目录。',
        parameters: [{ name: 'input', description: '创建项目所需数据。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'delete(projectId: string): Promise<CreatorProjectCollection>',
        description: '删除项目目录中的指定项目。',
        parameters: [{ name: 'projectId', description: '创作项目编号。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'selectDirectory(signal?: AbortSignal): Promise<string | null>',
        description: '打开官方目录选择器；取消选择时返回 null。',
        parameters: [{ name: 'signal', description: '取消本次操作的信号。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
    ],
  },
  {
    key: 'eleckoiDisplayPreferences',
    summary: '读取和保存显示偏好；保存请求在当前页面中依次执行。',
    description: '读取和保存显示偏好；保存请求在当前页面中依次执行。',
    methods: [
      {
        signature: 'getSnapshot(): ClientDisplayPreferencesSnapshot',
        description: '读取显示偏好的页面状态。',
        parameters: [],
        returns: '当前页面保存的状态对象。',
      },
      {
        signature: 'subscribe(listener: () => void): () => void',
        description: '订阅显示偏好变化。',
        parameters: [{ name: 'listener', description: '状态变化回调；返回的函数用于取消订阅。' }],
        returns: '取消本次订阅的函数。',
      },
      {
        signature: 'refresh(): Promise<ClientDisplayPreferencesSnapshot>',
        description: '重新读取显示偏好。',
        parameters: [],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'updateUi(update: Record<string, DisplayPreferenceValue> | ((current: Readonly<Record<string, DisplayPreferenceValue>>) => Record<string, DisplayPreferenceValue>)): Promise<ClientDisplayPreferencesSnapshot>',
        description: '更新界面偏好，可根据队列执行时的当前值生成更新。',
        parameters: [{ name: 'update', description: '新配置或根据当前配置计算新配置的函数。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'setChatDisplay(value: Record<string, DisplayPreferenceValue>): Promise<ClientDisplayPreferencesSnapshot>',
        description: '保存聊天显示配置。',
        parameters: [{ name: 'value', description: '完整待保存配置。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
    ],
  },
  {
    key: 'eleckoiFrontendProjects',
    summary: 'Native file projects use the generated Remote, independently of chat/script readiness.',
    description: 'Native file projects use the generated Remote, independently of chat/script readiness.',
    methods: [
      {
        signature: 'watch(owner: FrontendOwner, listener: (workspace: FrontendWorkspace) => void, onError: (error: unknown) => void): () => void',
        description: '订阅明确工作区的最新状态，串行重读并释放旧连接。',
        parameters: [{ name: 'owner', description: '应用或明确角色的工作区。' }, { name: 'listener', description: '最新状态回调。' }, { name: 'onError', description: '未取消的读取或连接错误。' }],
        returns: '取消订阅函数。',
      },
    ],
  },
  {
    key: 'eleckoiGlobalSettingLibraries',
    summary: '独立于角色版本的全局设定库集合。',
    description: '独立于角色版本的全局设定库集合。',
    methods: [
      {
        signature: 'getSnapshot(): ConfigurationSnapshot<GlobalSettingLibraryCollection>',
        description: '取得全局设定库的页面状态。',
        parameters: [],
        returns: '当前缓存及读取状态。',
      },
      {
        signature: 'subscribe(listener: (kind: \'configuration\', address: string, snapshot: ConfigurationSnapshot<GlobalSettingLibraryCollection>) => void): () => void',
        description: '订阅全局库变更。',
        parameters: [{ name: 'listener', description: '接收新状态的回调。' }],
        returns: '取消订阅函数。',
      },
      {
        signature: 'read(): Promise<GlobalSettingLibraryCollection>',
        description: '读取所有全局设定库。',
        parameters: [],
        returns: '全局库及并发修改标识。',
      },
      {
        signature: 'save(value: GlobalSettingLibraryCollection): Promise<GlobalSettingLibraryCollection>',
        description: '保存全局库内容、启停与删除。',
        parameters: [{ name: 'value', description: '草稿及读取时的修改标识。' }],
        returns: '实际保存后的集合。',
      },
    ],
  },
  {
    key: 'eleckoiHtmlResources',
    summary: 'Imported HTML presentation resources; no author or script execution API.',
    description: 'Imported HTML presentation resources; no author or script execution API.',
    methods: [
      {
        signature: 'getSnapshot(): { status: \'ready\'; error: string }',
        description: 'Read presentation resource availability.',
        parameters: [],
        returns: 'The resource readiness state and its error text.',
      },
      {
        signature: 'subscribe(listener: () => void): () => void',
        description: 'Subscribe to resource availability changes.',
        parameters: [{ name: 'listener', description: 'Called when the resource state changes.' }],
        returns: 'Stops this subscription.',
      },
    ],
  },
  {
    key: 'eleckoiModels',
    summary: '通过官方模型目录、Settings 和 Credentials 管理模型配置。',
    description: '通过官方模型目录、Settings 和 Credentials 管理模型配置。',
    methods: [
      {
        signature: 'getSnapshot(): ModelCatalogSnapshot',
        description: '读取模型目录的页面状态。',
        parameters: [],
        returns: '当前页面保存的状态对象。',
      },
      {
        signature: 'subscribe(listener: () => void): () => void',
        description: '订阅模型目录变化。',
        parameters: [{ name: 'listener', description: '状态变化回调；返回的函数用于取消订阅。' }],
        returns: '取消本次订阅的函数。',
      },
      {
        signature: 'refresh(): Promise<ClientModelConfig[]>',
        description: '重新读取官方模型目录和已保存配置。',
        parameters: [],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'save(config: ClientModelConfig): Promise<ClientModelConfig | undefined>',
        description: '保存模型配置和明确声明的能力，不根据模型名称猜测能力。',
        parameters: [{ name: 'config', description: '模型配置和明确声明的模型能力。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'deleteConfig(id: string): Promise<ClientModelConfig | undefined>',
        description: '删除一个配置，返回剩余目录的第一个配置。',
        parameters: [{ name: 'id', description: '要读取或修改的项目编号。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'discover(config: ClientModelConfig): Promise<ClientModelOption[]>',
        description: '读取模型列表并合并当前配置明确声明的参数。',
        parameters: [{ name: 'config', description: '模型配置和明确声明的模型能力。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'revealApiKey(configId: string): Promise<string>',
        description: '按配置编号读取密钥，供用户主动查看。',
        parameters: [{ name: 'configId', description: '模型配置编号。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
    ],
  },
  {
    key: 'eleckoiPersona',
    summary: '读取、保存用户资料并订阅当前页面的资料变化。',
    description: '读取、保存用户资料并订阅当前页面的资料变化。',
    methods: [
      {
        signature: 'getSnapshot(): PersonaSnapshot',
        description: '读取当前页面的用户资料状态。',
        parameters: [],
        returns: '当前页面保存的状态对象。',
      },
      {
        signature: 'subscribe(listener: () => void): () => void',
        description: '订阅资料状态变化。',
        parameters: [{ name: 'listener', description: '状态变化回调；返回的函数用于取消订阅。' }],
        returns: '取消本次订阅的函数。',
      },
      {
        signature: 'refresh(): Promise<PersonaProfile>',
        description: '重新读取 Host 保存的用户资料。',
        parameters: [],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'save(profile: PersonaProfile): Promise<PersonaProfile>',
        description: '保存用户资料并更新页面状态。',
        parameters: [{ name: 'profile', description: '完整用户资料。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
    ],
  },
  {
    key: 'eleckoiPresets',
    summary: '管理 Agent 预设、预设分组、导入导出和页面状态。',
    description: '管理 Agent 预设、预设分组、导入导出和页面状态。',
    methods: [
      {
        signature: 'getSnapshot(): PresetCatalogSnapshot',
        description: '读取预设目录状态。',
        parameters: [],
        returns: '当前页面保存的状态对象。',
      },
      {
        signature: 'subscribe(listener: () => void): () => void',
        description: '订阅预设目录变化。',
        parameters: [{ name: 'listener', description: '状态变化回调；返回的函数用于取消订阅。' }],
        returns: '取消本次订阅的函数。',
      },
      {
        signature: 'getDetailSnapshot(id: string): PresetDetailSnapshot',
        description: '读取一个已加载预设的状态。',
        parameters: [{ name: 'id', description: '要读取或修改的项目编号。' }],
        returns: '当前页面保存的状态对象。',
      },
      {
        signature: 'subscribeDetail(id: string, listener: () => void): () => void',
        description: '订阅一个预设的状态变化。',
        parameters: [{ name: 'id', description: '要读取或修改的项目编号。' }, { name: 'listener', description: '状态变化回调；返回的函数用于取消订阅。' }],
        returns: '取消本次订阅的函数。',
      },
      {
        signature: 'read(id: string): Promise<AgentPreset>',
        description: '读取完整预设。',
        parameters: [{ name: 'id', description: '要读取或修改的项目编号。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'save(preset: AgentPreset, expectedRegexRules: RegexRule[]): Promise<AgentPreset>',
        description: '保存完整预设；同时校验预期的正则规则列表。',
        parameters: [{ name: 'preset', description: '完整预设数据。' }, { name: 'expectedRegexRules', description: '保存前要求仍有效的正则配置。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'create(name: string, libraryGroupId?: string, purpose?: AgentPresetPurpose): Promise<AgentPreset>',
        description: '创建预设并可指定分组。',
        parameters: [{ name: 'name', description: '保存的名称。' }, { name: 'libraryGroupId', description: '预设分组编号；省略时不分组。' }, { name: 'purpose', description: '目标分类；省略时为角色扮演预设。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'import(source: AgentPresetImportSource, document: AgentPresetImportDocument, purpose?: AgentPresetPurpose): Promise<AgentPresetImportResult>',
        description: '导入预设文件。',
        parameters: [{ name: 'source', description: '支持的导入格式。' }, { name: 'document', description: '待导入的文件内容。' }, { name: 'purpose', description: '目标预设分类。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'export(presetId: string, format: AgentPresetExportFormat): Promise<AgentPresetExportResult>',
        description: '导出预设文件内容。',
        parameters: [{ name: 'presetId', description: '预设编号。' }, { name: 'format', description: '支持的导出格式。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'setActive(presetId: string): Promise<AgentPresetCatalog>',
        description: '设置当前使用的预设。',
        parameters: [{ name: 'presetId', description: '预设编号。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'createGroup(name: string, purpose?: AgentPresetPurpose): Promise<AgentPresetCatalog>',
        description: '创建预设分组。',
        parameters: [{ name: 'name', description: '保存的名称。' }, { name: 'purpose', description: '所属预设分类。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'renameGroup(groupId: string, name: string): Promise<AgentPresetCatalog>',
        description: '重命名预设分组。',
        parameters: [{ name: 'groupId', description: '分组编号。' }, { name: 'name', description: '保存的名称。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'assignGroup(presetId: string, groupId: string): Promise<AgentPresetCatalog>',
        description: '调整预设所属分组。',
        parameters: [{ name: 'presetId', description: '预设编号。' }, { name: 'groupId', description: '分组编号。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'deleteGroup(groupId: string): Promise<AgentPresetCatalog>',
        description: '删除预设分组。',
        parameters: [{ name: 'groupId', description: '分组编号。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'delete(presetId: string): Promise<AgentPresetCatalog>',
        description: '删除预设。',
        parameters: [{ name: 'presetId', description: '预设编号。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'refresh(): Promise<AgentPresetCatalog>',
        description: '重新读取预设目录。',
        parameters: [],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
    ],
  },
  {
    key: 'eleckoiRegexRules',
    summary: '读取和保存角色配置，保留完整字段、触发方式和提示词插入位置。',
    description: '读取和保存角色配置，保留完整字段、触发方式和提示词插入位置。',
    methods: [
      {
        signature: 'editor(scope: \'character\' | \'preset\', ownerId: string): ElecKoiRegexEditor',
        description: '获取仅编辑全局和明确归属的独立编辑器；运行时完整配置不受编辑入口影响。',
        parameters: [{ name: 'scope', description: '角色或预设归属。' }, { name: 'ownerId', description: '明确的所属编号，不使用当前启用预设代替。' }],
        returns: '同归属可订阅的正则编辑服务。',
      },
      {
        signature: 'getSnapshot(characterId: string): ConfigurationSnapshot<RegexRuleCollection>',
        description: '读取指定角色在页面中的配置状态。',
        parameters: [{ name: 'characterId', description: '角色编号。' }],
        returns: '当前页面保存的状态对象。',
      },
      {
        signature: 'subscribe(listener: (kind: \'configuration\' | \'conversations\', characterId: string, snapshot: ConfigurationSnapshot<RegexRuleCollection>) => void): () => void',
        description: '订阅配置变化，通知中包含角色编号和变化后的值。',
        parameters: [{ name: 'listener', description: '状态变化回调；返回的函数用于取消订阅。' }],
        returns: '取消本次订阅的函数。',
      },
      {
        signature: 'read(characterId: string): Promise<RegexRuleCollection>',
        description: '读取完整配置并更新页面状态。',
        parameters: [{ name: 'characterId', description: '角色编号。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'readUntracked(characterId: string): Promise<RegexRuleCollection>',
        description: '读取完整配置，不更新页面中的已加载状态。',
        parameters: [{ name: 'characterId', description: '角色编号。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'save(characterId: string, collection: RegexRuleCollection): Promise<RegexRuleCollection>',
        description: '保存完整配置；正则配置使用其 revision 检查是否发生并发修改。',
        parameters: [{ name: 'characterId', description: '角色编号。' }, { name: 'collection', description: '完整正则配置，包含当前 revision。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'import(characterId: string, collection: RegexRuleCollection, fallbackScope: RegexRuleScope, documents: RegexRuleImportDocument[]): Promise<RegexRuleImportResult>',
        description: '校验当前 revision 后导入正则文件。',
        parameters: [{ name: 'characterId', description: '角色编号。' }, { name: 'collection', description: '完整正则配置，包含当前 revision。' }, { name: 'fallbackScope', description: '导入文件未指定归属时使用的范围。' }, { name: 'documents', description: '待导入的正则文件。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'export(characterId: string, ruleIds: string[]): Promise<{ fileName: string; json: string }>',
        description: '导出指定正则规则的 JSON 文本。',
        parameters: [{ name: 'characterId', description: '角色编号。' }, { name: 'ruleIds', description: '待导出的正则编号。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'test(text: string, rule: RegexRule, target: RegexRuleTarget, options?: { surface?: \'Display\' | \'Prompt\' | \'Stored\'; variablesJson?: string; depth?: number; isEdit?: boolean }, signal?: AbortSignal): Promise<RegexRuleTestResult>',
        description: '在指定文本上测试规则，不保存规则。',
        parameters: [{ name: 'text', description: '待处理文本。' }, { name: 'rule', description: '待测试的正则规则。' }, { name: 'target', description: '正则规则作用的内容类别。' }, { name: 'options', description: '测试范围、变量快照 JSON、深度与编辑场景。' }, { name: 'signal', description: '关闭编辑器或取消测试时结束计算。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
    ],
  },
  {
    key: 'eleckoiScriptLibraries',
    summary: '按正式归属读取、保存和订阅全局、角色与预设脚本库。',
    description: '按正式归属读取、保存和订阅全局、角色与预设脚本库。',
    methods: [
      {
        signature: 'openDirectory(scope: ScriptLibraryScope, ownerId: string): Promise<void>',
        description: '在 Host 桌面打开指定脚本库的源码目录，不保存当前界面草稿。',
        parameters: [{ name: 'scope', description: '全局、角色或预设作用域。' }, { name: 'ownerId', description: '所属编号；全局使用空字符串。' }],
        returns: '本机目录打开后完成；失败抛出错误。',
      },
      {
        signature: 'getSnapshot(scope: ScriptLibraryScope, ownerId: string): ConfigurationSnapshot<ScriptLibrary>',
        description: '读取已加载的脚本库状态。',
        parameters: [{ name: 'scope', description: '脚本库作用域。' }, { name: 'ownerId', description: '所属编号；全局为一个空字符串。' }],
        returns: '当前状态与仍有效的已加载内容。',
      },
      {
        signature: 'read(scope: ScriptLibraryScope, ownerId: string): Promise<ScriptLibrary>',
        description: '读取并刷新脚本库。',
        parameters: [{ name: 'scope', description: '脚本库作用域。' }, { name: 'ownerId', description: '所属编号；全局为一个空字符串。' }],
        returns: '当前正式脚本库。',
      },
      {
        signature: 'save(library: ScriptLibrary): Promise<ScriptLibrary>',
        description: '保存完整脚本库并检查修改版本。',
        parameters: [{ name: 'library', description: '保留读取版本的完整待保存配置。' }],
        returns: '保存后的配置与新修改版本。',
      },
      {
        signature: 'saveAll(libraries: ScriptLibrary[]): Promise<ScriptLibrary[]>',
        description: '原子保存多个脚本库；任一版本冲突时不修改其他库。',
        parameters: [{ name: 'libraries', description: '修改过的库及其读取版本。' }],
        returns: '保存后的完整配置。',
      },
      {
        signature: 'subscribe(listener: (scope: ScriptLibraryScope, ownerId: string, snapshot: ConfigurationSnapshot<ScriptLibrary>) => void): () => void',
        description: '订阅已加载库的状态变化。',
        parameters: [{ name: 'listener', description: '含作用域、所属编号与状态的回调。' }],
        returns: '取消订阅函数。',
      },
      {
        signature: 'subscribeChanges(listener: () => void): () => void',
        description: '订阅脚本配置及当前预设变更。',
        parameters: [{ name: 'listener', description: '刷新当前作用域和运行上下文的回调。' }],
        returns: '取消订阅函数。',
      },
      {
        signature: 'activePreset(): Promise<{ id: string; name: string }>',
        description: '读取当前明确选择的 Agent 预设。',
        parameters: [],
        returns: '当前预设的编号与名称；选择无效时拒绝。',
      },
    ],
  },
  {
    key: 'eleckoiSettingLibraries',
    summary: '读取和保存角色配置，保留完整字段、触发方式和提示词插入位置。',
    description: '读取和保存角色配置，保留完整字段、触发方式和提示词插入位置。',
    methods: [
      {
        signature: 'getSnapshot(characterId: string): ConfigurationSnapshot<SettingLibrary>',
        description: '读取指定角色在页面中的配置状态。',
        parameters: [{ name: 'characterId', description: '角色编号。' }],
        returns: '当前页面保存的状态对象。',
      },
      {
        signature: 'subscribe(listener: (kind: \'configuration\' | \'conversations\', characterId: string, snapshot: ConfigurationSnapshot<SettingLibrary | SettingLibraryConversation[]>) => void): () => void',
        description: '订阅配置变化，通知中包含角色编号和变化后的值。',
        parameters: [{ name: 'listener', description: '状态变化回调；返回的函数用于取消订阅。' }],
        returns: '取消本次订阅的函数。',
      },
      {
        signature: 'read(characterId: string): Promise<SettingLibrary>',
        description: '读取完整配置并更新页面状态。',
        parameters: [{ name: 'characterId', description: '角色编号。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'readUntracked(characterId: string): Promise<SettingLibrary>',
        description: '读取完整配置，不更新页面中的已加载状态。',
        parameters: [{ name: 'characterId', description: '角色编号。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'save(characterId: string, value: SettingLibrary): Promise<SettingLibrary>',
        description: '保存完整配置；正则配置使用其 revision 检查是否发生并发修改。',
        parameters: [{ name: 'characterId', description: '角色编号。' }, { name: 'value', description: '完整待保存配置。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'saveViewState(characterId: string, expandedIds: string[]): Promise<string[]>',
        description: '保存配置页面中已展开项目的编号。',
        parameters: [{ name: 'characterId', description: '角色编号。' }, { name: 'expandedIds', description: '页面中已展开项目的编号。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'getConversationSnapshot(characterId: string): ConfigurationSnapshot<SettingLibraryConversation[]>',
        description: '读取此角色各聊天设定库的页面状态。',
        parameters: [{ name: 'characterId', description: '角色编号。' }],
        returns: '当前页面保存的状态对象。',
      },
      {
        signature: 'readConversations(characterId: string): Promise<SettingLibraryConversation[]>',
        description: '读取此角色各聊天的完整设定库。',
        parameters: [{ name: 'characterId', description: '角色编号。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'saveConversation(characterId: string, sessionId: string, library: SettingLibrary): Promise<SettingLibrary>',
        description: '保存指定聊天的设定库。',
        parameters: [{ name: 'characterId', description: '角色编号。' }, { name: 'sessionId', description: '目标聊天编号。' }, { name: 'library', description: '完整设定库，包含触发条件和插入位置。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'resetConversation(characterId: string, sessionId: string): Promise<void>',
        description: '恢复指定聊天的设定库。',
        parameters: [{ name: 'characterId', description: '角色编号。' }, { name: 'sessionId', description: '目标聊天编号。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'saveConversationVersion(characterId: string, sessionId: string, name: string): Promise<SettingLibrary>',
        description: '为指定聊天的设定库保存命名版本。',
        parameters: [{ name: 'characterId', description: '角色编号。' }, { name: 'sessionId', description: '目标聊天编号。' }, { name: 'name', description: '保存的名称。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
    ],
  },
  {
    key: 'eleckoiVariables',
    summary: '读取和保存角色配置，保留完整字段、触发方式和提示词插入位置。',
    description: '读取和保存角色配置，保留完整字段、触发方式和提示词插入位置。',
    methods: [
      {
        signature: 'getSnapshot(characterId: string): ConfigurationSnapshot<VariableConfig>',
        description: '读取指定角色在页面中的配置状态。',
        parameters: [{ name: 'characterId', description: '角色编号。' }],
        returns: '当前页面保存的状态对象。',
      },
      {
        signature: 'subscribe(listener: (kind: \'configuration\' | \'conversations\', characterId: string, snapshot: ConfigurationSnapshot<VariableConfig>) => void): () => void',
        description: '订阅配置变化，通知中包含角色编号和变化后的值。',
        parameters: [{ name: 'listener', description: '状态变化回调；返回的函数用于取消订阅。' }],
        returns: '取消本次订阅的函数。',
      },
      {
        signature: 'read(characterId: string): Promise<VariableConfig>',
        description: '读取完整配置并更新页面状态。',
        parameters: [{ name: 'characterId', description: '角色编号。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'readUntracked(characterId: string): Promise<VariableConfig>',
        description: '读取完整配置，不更新页面中的已加载状态。',
        parameters: [{ name: 'characterId', description: '角色编号。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'save(characterId: string, value: VariableConfig): Promise<VariableConfig>',
        description: '保存完整配置；正则配置使用其 revision 检查是否发生并发修改。',
        parameters: [{ name: 'characterId', description: '角色编号。' }, { name: 'value', description: '完整待保存配置。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'saveViewState(characterId: string, expandedIds: string[]): Promise<string[]>',
        description: '保存配置页面中已展开项目的编号。',
        parameters: [{ name: 'characterId', description: '角色编号。' }, { name: 'expandedIds', description: '页面中已展开项目的编号。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
    ],
  },
  {
    key: 'eleckoiWebSearch',
    summary: '管理搜索、网页抓取和官方 Credentials 中的密钥。',
    description: '管理搜索、网页抓取和官方 Credentials 中的密钥。',
    methods: [
      {
        signature: 'getSnapshot(): WebSearchSnapshot',
        description: '读取搜索配置的页面状态。',
        parameters: [],
        returns: '当前页面保存的状态对象。',
      },
      {
        signature: 'subscribe(listener: () => void): () => void',
        description: '订阅搜索配置变化。',
        parameters: [{ name: 'listener', description: '状态变化回调；返回的函数用于取消订阅。' }],
        returns: '取消本次订阅的函数。',
      },
      {
        signature: 'refresh(): Promise<WebSearchSnapshot>',
        description: '重新读取搜索配置和密钥是否已设置。',
        parameters: [],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'update(patch: WebSearchSettingsPatch): Promise<WebSearchSnapshot>',
        description: '修改搜索与抓取方式及 Tavily 返回条数。',
        parameters: [{ name: 'patch', description: '要修改的配置字段。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'saveAndTest(apiKey: string): Promise<{ settings: WebSearchSnapshot; connection: TavilyConnection }>',
        description: '测试密钥，通过后保存至官方 Credentials 并刷新页面状态。',
        parameters: [{ name: 'apiKey', description: '待测试或保存的密钥。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'test(apiKey?: string): Promise<{ connection: TavilyConnection }>',
        description: '测试临时密钥；未传密钥时测试当前已保存密钥。',
        parameters: [{ name: 'apiKey', description: '待测试或保存的密钥。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'removeKey(): Promise<WebSearchSnapshot>',
        description: '移除已保存的搜索密钥。',
        parameters: [],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'openPluginSettings(): void',
        description: '打开「插件 → 网页搜索」官方设置页；不可用时抛出错误。',
        parameters: [],
      },
    ],
  },
]

/** Every harness event, sorted by name. */
export const EVENT_API: readonly EventApiEntry[] = [
]

/** Shapes of every exported type the Service and Event signatures reference (transitively), sorted by name. */
export const TYPE_API: readonly TypeApiEntry[] = [
  {
    name: 'CharacterCatalogSnapshot',
    declaration: 'export interface CharacterCatalogSnapshot {\n    status: \'loading\' | \'ready\' | \'error\';\n    collection: CharacterCollection;\n    error: string;\n}',
  },
  {
    name: 'CharacterDownloadResult',
    declaration: 'export interface CharacterDownloadResult {\n    canceled: boolean;\n    directory: string;\n    written: {\n        characterId: string;\n        fileName: string;\n    }[];\n    failures: {\n        characterId: string;\n        message: string;\n    }[];\n}',
  },
  {
    name: 'ClientDisplayPreferencesSnapshot',
    declaration: 'export interface ClientDisplayPreferencesSnapshot {\n    status: \'loading\' | \'ready\' | \'error\';\n    ui: Readonly<Record<string, DisplayPreferenceValue>>;\n    chatDisplay: Readonly<Record<string, DisplayPreferenceValue>>;\n    writable: boolean;\n    revision?: number;\n    error: string;\n}',
  },
  {
    name: 'ClientModelConfig',
    declaration: 'export interface ClientModelConfig {\n    id: string;\n    name?: string;\n    provider?: string;\n    model?: string;\n    model_options?: ClientModelOption[];\n    enabled?: boolean;\n    base_url?: string;\n    api_format?: string;\n    api_key?: string;\n    custom_headers?: Record<string, string>;\n    proxy_url?: string;\n    credentialRef?: string;\n    credentialConfigured?: boolean;\n    clearCredential?: boolean;\n    settingsNs?: string;\n    settingsPath?: string[];\n    builtin?: boolean;\n    useBuiltinModels?: boolean;\n    draftKey?: string;\n    clearConfiguration?: boolean;\n    image_settings?: Record<string, import(\'@eleckoi/dsh-product-api/types\').VariableJsonValue>;\n}',
  },
  {
    name: 'ClientModelOption',
    declaration: 'export interface ClientModelOption {\n    id: string;\n    name: string;\n    description?: string;\n    inputModalities?: readonly (\'text\' | \'image\')[];\n    contextWindowTokens?: number;\n    maxOutputTokens?: number;\n    supportsImageInput?: boolean;\n    overrideFields?: string[];\n    capabilitiesOverride?: boolean;\n    catalogDefaults?: ClientModelOption;\n    reasoningEfforts?: false | Record<string, string | null>;\n    reasoningEffort?: string;\n    temperature?: number;\n    topP?: number;\n    autoCompactTokenLimit?: number;\n    isUserAdded?: boolean;\n}',
  },
  {
    name: 'ClientModelProvider',
    declaration: 'export interface ClientModelProvider {\n    provider: string;\n    displayName?: string;\n    settingsNs: string;\n    settingsPath: string[];\n    declared?: boolean;\n}',
  },
  {
    name: 'ConfigurationSnapshot',
    declaration: 'export interface ConfigurationSnapshot<T> {\n    status: \'idle\' | \'loading\' | \'ready\' | \'error\';\n    value: T | null;\n    error: string;\n}',
  },
  {
    name: 'ConversationCatalogSnapshot',
    declaration: 'export interface ConversationCatalogSnapshot {\n    status: \'loading\' | \'ready\' | \'error\';\n    items: ConversationSummary[];\n    error: string;\n}',
  },
  {
    name: 'ConversationChatSnapshot',
    declaration: 'export interface ConversationChatSnapshot {\n    details: ConversationDetailsSnapshot;\n    stream: ConversationStreamSnapshot;\n}',
  },
  {
    name: 'ConversationClientDetails',
    declaration: 'export interface ConversationClientDetails extends Omit<ConversationDetailsMetadata, \'messages\'> {\n    messages: ConversationClientMessage[];\n    replace?: boolean;\n}',
  },
  {
    name: 'ConversationClientMessage',
    declaration: 'export interface ConversationClientMessage extends Omit<ConversationMessageMetadata, \'dshTurn\'> {\n    content?: string;\n    displayContent?: string;\n    status: \'complete\' | \'streaming\' | \'error\' | \'cancelled\';\n    sequence?: number;\n    productSequence?: number;\n    sessionEventSeq?: number;\n    dshTurn?: number | null;\n    requestId?: string;\n    nativeVariableStateJson?: string;\n    variableSnapshotAvailable?: boolean;\n    inputEventSeq?: number;\n    process?: ConversationProcessItem[];\n    processTiming?: {\n        startedAtMillis?: number;\n        completedAtMillis?: number;\n    };\n    dshMessageId?: string;\n    runtimeSessionId?: string;\n    renderKey?: string;\n    dshNodeKey?: string;\n    turnUsage?: TurnTailChatData[\'tokenUsage\'];\n    inputImageAttachments?: (ImageAttachmentRef | ConversationPendingImage)[];\n    generatedImageAttachments?: ConversationGeneratedImage[];\n    inputFileAttachments?: (FileAttachmentRef | ConversationPendingFile)[];\n}',
  },
  {
    name: 'ConversationDetailsSnapshot',
    declaration: 'export interface ConversationDetailsSnapshot {\n    id: string;\n    status: \'idle\' | \'loading\' | \'ready\' | \'error\';\n    details: ConversationClientDetails | null;\n    runtimeSessionId?: string;\n    error: string;\n}',
  },
  {
    name: 'ConversationGeneratedImage',
    declaration: 'export interface ConversationGeneratedImage extends Partial<ImageAttachmentRef> {\n    id: string;\n    batchId: string;\n    frameId: number;\n    status: \'generating\' | \'ready\' | \'failed\';\n    error?: string;\n    name?: string;\n    width: number;\n    height: number;\n}',
  },
  {
    name: 'ConversationGenerationChange',
    declaration: 'export interface ConversationGenerationChange {\n    conversationId: string;\n    runtimeSessionId: string;\n    kind: \'live\' | \'baseline\' | \'released\';\n    running: boolean;\n    events: readonly ConversationGenerationEvent[];\n}',
  },
  {
    name: 'ConversationGenerationEvent',
    declaration: 'export type ConversationGenerationEvent = Extract<SessionEventLike, {\n    type: \'turn/start\' | \'turn/end\' | \'assistant/message\';\n}>;',
  },
  {
    name: 'ConversationGenerationReply',
    declaration: 'export type ConversationGenerationReply = {\n    status: \'pending\';\n} | {\n    status: \'ready\';\n    message: ConversationClientMessage | null;\n} | {\n    status: \'unavailable\';\n    reason: string;\n};',
  },
  {
    name: 'ConversationPendingFile',
    declaration: 'export interface ConversationPendingFile {\n    attachmentId: string;\n    name: string;\n    bytes: number;\n}',
  },
  {
    name: 'ConversationPendingImage',
    declaration: 'export interface ConversationPendingImage {\n    attachmentId: string;\n    name: string;\n    dataUrl: string;\n    width?: number;\n    height?: number;\n}',
  },
  {
    name: 'ConversationProcessItem',
    declaration: 'export interface ConversationProcessItem {\n    id: string;\n    kind: \'tool\' | \'command\' | \'file_change\' | \'compaction\' | \'subagent\' | \'action\' | \'narrative\' | \'reasoning\';\n    status: \'running\' | \'complete\' | \'error\' | \'cancelled\';\n    toolName: string;\n    arguments: string;\n    summary: string;\n    detail: string;\n    displayDetail?: string;\n    startedAtMillis: number;\n    completedAtMillis?: number;\n    parentId?: string;\n    delegatedModel?: string;\n}',
  },
  {
    name: 'ConversationRegenerateInput',
    declaration: 'export interface ConversationRegenerateInput {\n    conversationId: string;\n    requestId: string;\n    eventSeq: number;\n    replacementMessage?: string;\n    signal?: AbortSignal;\n}',
  },
  {
    name: 'ConversationRunResult',
    declaration: 'export interface ConversationRunResult {\n    details: ConversationClientDetails | null;\n    cancelled: boolean;\n}',
  },
  {
    name: 'ConversationSelection',
    declaration: 'export interface ConversationSelection {\n    active_conversation_id: string;\n    preferred_sessions: Record<string, string>;\n}',
  },
  {
    name: 'ConversationSendInput',
    declaration: 'export interface ConversationSendInput {\n    conversationId: string;\n    requestId: string;\n    text?: string;\n    mode?: \'steer\' | \'queue\';\n    signal?: AbortSignal;\n    images?: {\n        mediaType: \'image/png\' | \'image/jpeg\' | \'image/webp\' | \'image/gif\';\n        data: string;\n        name?: string;\n    }[];\n    files?: string[];\n}',
  },
  {
    name: 'ConversationStatsSnapshot',
    declaration: 'export interface ConversationStatsSnapshot {\n    id: string;\n    stats: {\n        sessionStats?: SessionStatsProjection;\n        tokenUsage?: TokenUsageProjection;\n        contextPressure?: ContextPressureProjection;\n        contextBreakdown?: ContextBreakdownProjection;\n    } | null;\n}',
  },
  {
    name: 'ConversationStreamSnapshot',
    declaration: 'export interface ConversationStreamSnapshot {\n    id: string;\n    status: \'idle\' | \'running\' | \'complete\' | \'error\';\n    runId: string;\n    requestId: string;\n    messageId: string;\n    nodeKey: string;\n    dshTurn?: number;\n    renderKey?: string;\n    sequence: number;\n    content: string;\n    process: ConversationProcessItem[];\n    error: string;\n}',
  },
  {
    name: 'ConversationTimelineSnapshot',
    declaration: 'export interface ConversationTimelineSnapshot {\n    id: string;\n    status: \'idle\' | \'loading\' | \'ready\' | \'error\';\n    timeline: VariableViewerTimeline | null;\n    error: string;\n}',
  },
  {
    name: 'ConversationUploadedFile',
    declaration: 'export interface ConversationUploadedFile {\n    id: string;\n    receiptId: string;\n    attachmentId: string;\n    name: string;\n    bytes: number;\n}',
  },
  {
    name: 'CreatorStudioSnapshot',
    declaration: 'export interface CreatorStudioSnapshot {\n    status: \'loading\' | \'ready\' | \'error\';\n    collection: CreatorProjectCollection;\n    error: string;\n}',
  },
  {
    name: 'EditorLibraryVersionModel',
    declaration: 'export interface EditorLibraryVersionModel<T> {\n    subscribe(listener: () => void): () => void;\n    read(scope: \'global\' | \'character\' | \'preset\', ownerId: string): Promise<EditorLibraryVersions>;\n    save(documents: T[], versions: EditorLibraryVersions[]): Promise<{\n        documents: T[];\n        versions: EditorLibraryVersions[];\n    }>;\n}',
  },
  {
    name: 'ElecKoiRegexEditor',
    declaration: 'export interface ElecKoiRegexEditor {\n    versions: EditorLibraryVersionModel<RegexRuleEditorCollection>;\n    getSnapshot(): ConfigurationSnapshot<RegexRuleEditorCollection>;\n    read(): Promise<RegexRuleEditorCollection>;\n    subscribe(listener: (snapshot: ConfigurationSnapshot<RegexRuleEditorCollection>) => void): () => void;\n    save(collection: RegexRuleEditorCollection): Promise<RegexRuleEditorCollection>;\n    import(collection: RegexRuleEditorCollection, fallbackScope: RegexRuleScope, documents: RegexRuleImportDocument[]): Promise<RegexRuleEditorImportResult>;\n    export(ruleIds: string[]): Promise<{\n        fileName: string;\n        json: string;\n    }>;\n}',
  },
  {
    name: 'ModelCatalogSnapshot',
    declaration: 'export interface ModelCatalogSnapshot {\n    status: \'loading\' | \'ready\' | \'error\';\n    configs: ClientModelConfig[];\n    providers: ClientModelProvider[];\n    error: string;\n}',
  },
  {
    name: 'NativeAuthorChatHandlers',
    declaration: 'export type NativeAuthorChatHandlers = Record<string, (params: Record<string, unknown>) => unknown | Promise<unknown>>;',
  },
  {
    name: 'NativeAuthorPanel',
    declaration: 'export interface NativeAuthorPanel extends AuthorScriptPanel {\n    key: string;\n    conversationId: string;\n    scriptKey: string;\n    baseUrl: string;\n}',
  },
  {
    name: 'NativeAuthorProjectContext',
    declaration: 'export type NativeAuthorProjectContext = {\n    projectId: string;\n    entryFile: string;\n    view: string;\n} & ({\n    scope: \'application\';\n} | {\n    scope: \'character\';\n    characterId: string;\n    conversationId?: string;\n});',
  },
  {
    name: 'NativeAuthorRuntimeSnapshot',
    declaration: 'export interface NativeAuthorRuntimeSnapshot {\n    status: \'idle\' | \'starting\' | \'ready\' | \'error\' | \'closed\';\n    conversationId: string;\n    error: string;\n    scriptStatuses: Record<string, AuthorScriptStatus & {\n        scope: string;\n        ownerId: string;\n        source: string;\n    }>;\n}',
  },
  {
    name: 'NativeAuthorUiSnapshot',
    declaration: 'export interface NativeAuthorUiSnapshot {\n    buttons: Array<{\n        key: string;\n        id: string;\n        label: string;\n        scriptKey: string;\n        scriptName: string;\n        scope: string;\n        conversationId: string;\n        busy: boolean;\n        error: string;\n    }>;\n    panel: NativeAuthorPanel | null;\n}',
  },
  {
    name: 'PersonaSnapshot',
    declaration: 'export interface PersonaSnapshot {\n    status: \'loading\' | \'ready\' | \'error\';\n    profile: PersonaProfile | null;\n    error: string;\n}',
  },
  {
    name: 'PresetCatalogSnapshot',
    declaration: 'export interface PresetCatalogSnapshot {\n    status: \'loading\' | \'ready\' | \'error\';\n    catalog: AgentPresetCatalog | null;\n    error: string;\n}',
  },
  {
    name: 'PresetDetailSnapshot',
    declaration: 'export interface PresetDetailSnapshot {\n    status: \'idle\' | \'ready\' | \'error\';\n    preset: AgentPreset | null;\n    error: string;\n}',
  },
  {
    name: 'WebSearchSettingsPatch',
    declaration: 'export interface WebSearchSettingsPatch {\n    mode?: WebSearchMode;\n    fetchMode?: WebFetchMode;\n    maxResults?: number;\n}',
  },
  {
    name: 'WebSearchSnapshot',
    declaration: 'export interface WebSearchSnapshot {\n    status: \'loading\' | \'ready\' | \'error\';\n    mode: WebSearchMode;\n    fetchMode: WebFetchMode;\n    officialDeepSeekAvailable: boolean;\n    maxResults: number;\n    apiKeyConfigured: boolean;\n    apiKeyRef: string;\n    apiKeyWritable: boolean;\n    writable: boolean;\n    tavilyAvailable: boolean;\n    revision?: number;\n    error: string;\n}',
  },
]

/** The inherited `ctx` API (cordis core + loader/hmr/timer), in curated order. */
export const INHERITED_CTX_API: readonly InheritedApiEntry[] = [
]

function referencedTypeClosure(seeds: readonly string[]): TypeApiEntry[] {
  const included = new Set<string>()
  let frontier = [...seeds]
  while (frontier.length > 0) {
    const next: string[] = []
    for (const entry of TYPE_API) {
      if (included.has(entry.name)) continue
      const pattern = new RegExp(`\\b${entry.name}\\b`)
      if (!frontier.some(text => pattern.test(text))) continue
      included.add(entry.name)
      next.push(entry.declaration)
    }
    frontier = next
  }
  return TYPE_API.filter(entry => included.has(entry.name))
}

function contextProperty(key: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(key) ? `ctx.${key}` : `ctx[${JSON.stringify(key)}]`
}

/**
 * Project the Service Catalog as a compact directory or one exact coding contract.
 * @param key - exact Service key; omit it to list all Services and method signatures.
 * @param services - platform-specific visible Service entries.
 * @returns compact navigation data or one detailed Service with its referenced type closure.
 */
export function queryServiceApi(key?: string, services: readonly ServiceApiEntry[] = SERVICE_API): object {
  if (key === undefined) {
    return {
      mode: 'catalog',
      services: services.map(service => ({
        key: service.key,
        description: service.summary,
        methods: service.methods.map(method => ({ signature: method.signature })),
      })),
    }
  }
  const service = services.find(candidate => candidate.key === key)
  if (service === undefined) throw productFailure(ELECKOI_FAILURE_CODES.lookupNotFound, `no catalogued Service named "${key}"`, { what: '公开服务' })
  return {
    mode: 'service',
    service: {
      key: service.key,
      description: service.description,
      access: {
        optional: { expression: `ctx.get(${JSON.stringify(service.key)})`, requiresUndefinedCheck: true },
        hardDependency: { inject: [service.key], expression: contextProperty(service.key) },
      },
      methods: service.methods,
    },
    referencedTypes: referencedTypeClosure(service.methods.map(method => method.signature)),
  }
}

/**
 * Project the Event Catalog as a compact directory or one exact listener contract.
 * @param name - exact Event name; omit it to list all Events and listener signatures.
 * @param events - platform-specific visible Event entries.
 * @returns compact navigation data or one detailed Event with its referenced type closure.
 */
export function queryEventApi(name?: string, events: readonly EventApiEntry[] = EVENT_API): object {
  if (name === undefined) {
    return {
      mode: 'catalog',
      events: events.map(event => ({
        name: event.name,
        description: event.summary,
        mode: event.mode,
        signature: event.signature,
      })),
    }
  }
  const event = events.find(candidate => candidate.name === name)
  if (event === undefined) throw productFailure(ELECKOI_FAILURE_CODES.lookupNotFound, `no catalogued Event named "${name}"`, { what: '公开事件' })
  return {
    mode: 'event',
    event: {
      name: event.name,
      description: event.description,
      mode: event.mode,
      signature: event.signature,
      parameters: event.parameters,
    },
    referencedTypes: referencedTypeClosure([event.signature]),
  }
}
/* jscpd:ignore-end */
