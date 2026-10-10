/** 由 pnpm generate:plugin-docs 生成。公开服务的只读目录，与完整参考使用同一份源码分析结果。 */

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
        description: '逐个下载角色卡，分别报告成功和失败。',
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
        signature: 'subscribeDetails(listener: () => void): () => void',
        description: '订阅当前聊天的消息变化。',
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
        signature: 'subscribeStream(listener: () => void): () => void',
        description: '订阅当前回复的流式输出。',
        parameters: [{ name: 'listener', description: '状态变化回调。' }],
        returns: '取消本次订阅的函数。',
      },
      {
        signature: 'refresh(): Promise<ConversationSummary[]>',
        description: '重新读取聊天目录。',
        parameters: [],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
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
        signature: 'deleteMessagesFrom(conversationId: string, eventSeq: number, role: \'user\' | \'assistant\'): Promise<ConversationClientDetails | null>',
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
        signature: 'deleteProvider(provider: string, preferredId?: string): Promise<ClientModelConfig | undefined>',
        description: '删除指定提供商的配置，返回剩余的首选配置。',
        parameters: [{ name: 'provider', description: '提供商编号。' }, { name: 'preferredId', description: '删除后优先选择的剩余配置编号。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'discover(config: ClientModelConfig): Promise<ClientModelOption[]>',
        description: '读取模型列表并合并当前配置明确声明的参数。',
        parameters: [{ name: 'config', description: '模型配置和明确声明的模型能力。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'testConnection(config: ClientModelConfig): Promise<{ supported: true }>',
        description: '使用官方适配器发起一次工具调用测试。',
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
        signature: 'create(name: string, libraryGroupId?: string): Promise<AgentPreset>',
        description: '创建预设并可指定分组。',
        parameters: [{ name: 'name', description: '保存的名称。' }, { name: 'libraryGroupId', description: '预设分组编号；省略时不分组。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
      },
      {
        signature: 'import(source: AgentPresetImportSource, document: AgentPresetImportDocument): Promise<AgentPresetImportResult>',
        description: '导入预设文件。',
        parameters: [{ name: 'source', description: '支持的导入格式。' }, { name: 'document', description: '待导入的文件内容。' }],
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
        signature: 'createGroup(name: string): Promise<AgentPresetCatalog>',
        description: '创建预设分组。',
        parameters: [{ name: 'name', description: '保存的名称。' }],
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
        signature: 'test(text: string, rule: RegexRule, target: RegexRuleTarget): Promise<RegexRuleTestResult>',
        description: '在指定文本上测试规则，不保存规则。',
        parameters: [{ name: 'text', description: '待处理文本。' }, { name: 'rule', description: '待测试的正则规则。' }, { name: 'target', description: '正则规则作用的内容类别。' }],
        returns: '操作结果，字段见返回类型；异步失败会拒绝 Promise。',
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
    key: 'eleckoiTavernShared',
    summary: '应用持有的共享酒馆环境，连接插件面板、聊天控制器与正式消息投影。',
    description: '应用持有的共享酒馆环境，连接插件面板、聊天控制器与正式消息投影。',
    methods: [
      {
        signature: 'getSnapshot(): TavernSharedSnapshot',
        description: '读取共享运行时的连接状态、实际宿主命令和插件 UI 列表。',
        parameters: [],
        returns: '当前运行时保存的状态对象。',
      },
      {
        signature: 'subscribe(listener: () => void): () => void',
        description: '订阅共享运行时状态变化。',
        parameters: [{ name: 'listener', description: '每次状态发布时执行的回调。' }],
        returns: '取消本次订阅的函数。',
      },
      {
        signature: 'openPanel(owner: string, id: string): Promise<void>',
        description: '打开插件已登记的 HTML 面板，或执行已登记脚本按钮的事件。',
        parameters: [{ name: 'owner', description: '面板所属的插件编号。' }, { name: 'id', description: '该插件登记的 UI 项目编号。' }],
        returns: '面板挂载或按钮事件发布完成；UI 不存在或不是 HTML 面板时拒绝 Promise。',
      },
      {
        signature: 'registerChatUi(conversationId: string, handlers: TavernSharedChatHandlers): () => void',
        description: '将当前聊天的编辑、设置等控制器接入共享运行时。',
        parameters: [{ name: 'conversationId', description: '控制器所属的 ElecKoi 聊天编号。' }, { name: 'handlers', description: '按 UI 命令名称索引的处理函数，参数与结果保留原命令结构。' }],
        returns: '移除本次控制器的函数；不会移除同会话随后注册的新控制器。',
      },
      {
        signature: 'capturePresentation(conversationId?: string): TavernSharedPresentation',
        description: '读取指定聊天已绑定的正式消息投影；省略编号时读取当前聊天。',
        parameters: [{ name: 'conversationId', description: '可选 ElecKoi 聊天编号。' }],
        returns: '过滤错误占位消息后的消息列表、生成状态及当前流式正文；投影未就绪时抛出错误。',
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
    summary: '管理联网搜索方式、Tavily 配置和官方 Credentials 中的密钥。',
    description: '管理联网搜索方式、Tavily 配置和官方 Credentials 中的密钥。',
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
        signature: 'update(patch: { mode?: WebSearchMode; maxResults?: number }): Promise<WebSearchSnapshot>',
        description: '修改搜索方式和返回条数，条数必须在 1 至 8 之间。',
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
    declaration: 'export interface CharacterDownloadResult {\n    canceled: false;\n    directory: string;\n    written: {\n        characterId: string;\n        fileName: string;\n    }[];\n    failures: {\n        characterId: string;\n        message: string;\n    }[];\n}',
  },
  {
    name: 'ClientDisplayPreferencesSnapshot',
    declaration: 'export interface ClientDisplayPreferencesSnapshot {\n    status: \'loading\' | \'ready\' | \'error\';\n    ui: Readonly<Record<string, DisplayPreferenceValue>>;\n    chatDisplay: Readonly<Record<string, DisplayPreferenceValue>>;\n    writable: boolean;\n    revision?: number;\n    error: string;\n}',
  },
  {
    name: 'ClientModelConfig',
    declaration: 'export interface ClientModelConfig {\n    id: string;\n    name?: string;\n    provider?: string;\n    model?: string;\n    model_options?: ClientModelOption[];\n    enabled?: boolean;\n    base_url?: string;\n    api_format?: string;\n    api_key?: string;\n    custom_headers?: Record<string, string>;\n    proxy_url?: string;\n    credentialRef?: string;\n    credentialConfigured?: boolean;\n    clearCredential?: boolean;\n    settingsNs?: string;\n    settingsPath?: string[];\n    clearConfiguration?: boolean;\n    image_settings?: Record<string, import(\'@eleckoi/dsh-product-api/types\').VariableJsonValue>;\n}',
  },
  {
    name: 'ClientModelOption',
    declaration: 'export interface ClientModelOption {\n    id: string;\n    name: string;\n    description?: string;\n    inputModalities?: readonly (\'text\' | \'image\')[];\n    contextWindowTokens?: number;\n    maxOutputTokens?: number;\n    supportsImageInput?: boolean;\n    reasoningEfforts?: false | Record<string, string | null>;\n    reasoningEffort?: string;\n    temperature?: number;\n    topP?: number;\n    autoCompactTokenLimit?: number;\n    isUserAdded?: boolean;\n}',
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
    declaration: 'export interface ConversationClientMessage extends Omit<ConversationMessageMetadata, \'dshTurn\'> {\n    content?: string;\n    displayContent?: string;\n    status: \'complete\' | \'streaming\' | \'error\' | \'cancelled\';\n    sequence?: number;\n    productSequence?: number;\n    sessionEventSeq?: number;\n    dshTurn?: number | null;\n    requestId?: string;\n    process?: ConversationProcessItem[];\n    dshMessageId?: string;\n    runtimeSessionId?: string;\n    renderKey?: string;\n    dshNodeKey?: string;\n    turnUsage?: TurnTailChatData[\'tokenUsage\'];\n    inputImageAttachments?: (ImageAttachmentRef | ConversationPendingImage)[];\n    inputFileAttachments?: (FileAttachmentRef | ConversationPendingFile)[];\n}',
  },
  {
    name: 'ConversationDetailsSnapshot',
    declaration: 'export interface ConversationDetailsSnapshot {\n    id: string;\n    status: \'idle\' | \'loading\' | \'ready\' | \'error\';\n    details: ConversationClientDetails | null;\n    runtimeSessionId?: string;\n    error: string;\n}',
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
    declaration: 'export interface ConversationProcessItem {\n    id: string;\n    kind: \'tool\' | \'command\' | \'file_change\' | \'compaction\' | \'subagent\' | \'action\' | \'narrative\' | \'reasoning\';\n    status: \'running\' | \'complete\' | \'error\' | \'cancelled\';\n    toolName: string;\n    arguments: string;\n    summary: string;\n    detail: string;\n    startedAtMillis: number;\n    completedAtMillis?: number;\n    parentId?: string;\n    delegatedModel?: string;\n}',
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
    name: 'ConversationStreamSnapshot',
    declaration: 'export interface ConversationStreamSnapshot {\n    id: string;\n    status: \'idle\' | \'running\' | \'complete\' | \'error\';\n    runId: string;\n    requestId: string;\n    messageId: string;\n    nodeKey: string;\n    sequence: number;\n    content: string;\n    process: ConversationProcessItem[];\n    error: string;\n}',
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
    name: 'ModelCatalogSnapshot',
    declaration: 'export interface ModelCatalogSnapshot {\n    status: \'loading\' | \'ready\' | \'error\';\n    configs: ClientModelConfig[];\n    error: string;\n}',
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
    name: 'TavernSharedChatHandlers',
    declaration: 'export type TavernSharedChatHandlers = Record<string, (params: Record<string, unknown>) => unknown | Promise<unknown>>;',
  },
  {
    name: 'TavernSharedPresentation',
    declaration: 'export interface TavernSharedPresentation {\n    conversationId: string;\n    messages: ConversationClientMessage[];\n    isGenerating: boolean;\n    generation?: {\n        runId: string;\n        messageId: string;\n        content: string;\n        sequence: number;\n    };\n}',
  },
  {
    name: 'TavernSharedSnapshot',
    declaration: 'export interface TavernSharedSnapshot {\n    status: \'starting\' | \'waiting-for-chat\' | \'ready\' | \'ready-global\' | \'error\';\n    error: string;\n    methods: string[];\n    uiEntries: Array<{\n        pluginId: string;\n        [key: string]: CompatibilityValue;\n    }>;\n}',
  },
  {
    name: 'WebSearchSnapshot',
    declaration: 'export interface WebSearchSnapshot {\n    status: \'loading\' | \'ready\' | \'error\';\n    mode: WebSearchMode;\n    maxResults: number;\n    apiKeyConfigured: boolean;\n    apiKeyRef: string;\n    apiKeyWritable: boolean;\n    writable: boolean;\n    tavilyAvailable: boolean;\n    revision?: number;\n    error: string;\n}',
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
  if (service === undefined) throw new Error(`no catalogued Service named "${key}"`)
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
  if (event === undefined) throw new Error(`no catalogued Event named "${name}"`)
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
