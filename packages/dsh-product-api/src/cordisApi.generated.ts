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
    key: 'eleckoiAgentPresetsApi',
    summary: '管理 Agent 预设、分组和预设文件，通过官方 Typert Remote 公开跨端调用。',
    description: '管理 Agent 预设、分组和预设文件，通过官方 Typert Remote 公开跨端调用。',
    methods: [
      {
        signature: '@Remote catalog(): AgentPresetCatalog',
        description: '读取预设目录和当前预设。',
        parameters: [],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
      {
        signature: '@Remote read(presetId: string): AgentPreset',
        description: '读取完整保存数据。',
        parameters: [{ name: 'presetId', description: '预设编号。' }],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
      {
        signature: '@Remote save(preset: AgentPreset, expectedRegexRules: RegexRule[]): AgentPreset',
        description: '保存完整数据并通知相关页面刷新。',
        parameters: [{ name: 'preset', description: '完整预设数据。' }, { name: 'expectedRegexRules', description: '要求仍有效的正则配置。' }],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
      {
        signature: '@Remote create(name: string, libraryGroupId: string): AgentPreset',
        description: '创建预设并返回完整预设数据。',
        parameters: [{ name: 'name', description: '保存的名称或附件文件名。' }, { name: 'libraryGroupId', description: '预设分组编号。' }],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
      {
        signature: '@Remote import(source: AgentPresetImportSource, document: AgentPresetImportDocument): AgentPresetImportResult',
        description: '导入文件并保存完整数据。',
        parameters: [{ name: 'source', description: '支持的导入格式。' }, { name: 'document', description: '待导入文件内容。' }],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
      {
        signature: '@Remote export(presetId: string, format: AgentPresetExportFormat): AgentPresetExportResult',
        description: '返回导出文件名、格式和文件内容。',
        parameters: [{ name: 'presetId', description: '预设编号。' }, { name: 'format', description: '支持的导出格式。' }],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
      {
        signature: '@Remote setActive(presetId: string): AgentPresetCatalog',
        description: '设置当前使用的 Agent 预设。',
        parameters: [{ name: 'presetId', description: '预设编号。' }],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
      {
        signature: '@Remote createGroup(name: string): AgentPresetCatalog',
        description: '创建预设分组。',
        parameters: [{ name: 'name', description: '保存的名称或附件文件名。' }],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
      {
        signature: '@Remote renameGroup(groupId: string, name: string): AgentPresetCatalog',
        description: '重命名预设分组。',
        parameters: [{ name: 'groupId', description: '预设分组编号。' }, { name: 'name', description: '保存的名称或附件文件名。' }],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
      {
        signature: '@Remote assignGroup(presetId: string, groupId: string): AgentPresetCatalog',
        description: '设置预设所属分组。',
        parameters: [{ name: 'presetId', description: '预设编号。' }, { name: 'groupId', description: '预设分组编号。' }],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
      {
        signature: '@Remote deleteGroup(groupId: string): AgentPresetCatalog',
        description: '删除预设分组。',
        parameters: [{ name: 'groupId', description: '预设分组编号。' }],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
      {
        signature: '@Remote delete(presetId: string): AgentPresetCatalog',
        description: '删除指定预设并返回更新后的预设目录。',
        parameters: [{ name: 'presetId', description: '预设编号。' }],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
    ],
  },
  {
    key: 'eleckoiAuthorPluginsApi',
    summary: '作者插件的 Host 兼容入口，提供能力发现、命令调用和实时变更订阅。 通过 `ctx.eleckoiAuthorPluginsApi` 使用，并在 `eleckoiAuthorPlugins` Remote 命名空间公开。',
    description: '作者插件的 Host 兼容入口，提供能力发现、命令调用和实时变更订阅。 通过 `ctx.eleckoiAuthorPluginsApi` 使用，并在 `eleckoiAuthorPlugins` Remote 命名空间公开。',
    methods: [
      {
        signature: '@Remote capabilities(): AuthorCapabilities',
        description: '读取当前 Host 支持的作者插件命令和同源资源入口。',
        parameters: [],
        returns: '命令名称列表、协议版本（当前为 1）及作者插件资源的基础 URL。',
      },
      {
        signature: '@Remote async invoke(command: AuthorCommand): Promise<AuthorValue>',
        description: '按命令名称调用作者插件、聊天生成、Web 回调、扩展或媒体操作。',
        parameters: [{ name: 'command', description: '要执行的命令；`method` 为能力列表中的命令名称，`params` 为该命令的 JSON 参数对象。' }],
        returns: '对应操作完成后的 JSON 值；回调接入和移除返回 null，回调应答返回是否匹配到待处理请求。',
      },
      {
        signature: '@Remote({ mode: \'stream\' }) changes(signal: AbortSignal): AsyncIterable<AuthorChange>',
        description: '订阅作者插件、生成过程和 Web 回调发布的实时变更。',
        parameters: [{ name: 'signal', description: '订阅的取消信号；触发取消后结束此订阅并移除订阅者。' }],
        returns: '异步变更流；活动订阅先收到 payload 为 null 的 `plugins.snapshot` 重载标记，随后收到实时事件，直到取消订阅或 Host 关闭。',
      },
    ],
  },
  {
    key: 'eleckoiCharacterConfigurationApi',
    summary: '管理完整设定库、变量定义和正则配置，通过官方 Typert Remote 公开跨端调用。',
    description: '管理完整设定库、变量定义和正则配置，通过官方 Typert Remote 公开跨端调用。',
    methods: [
      {
        signature: '@Remote({ mode: \'stream\' }) changes(signal: AbortSignal): AsyncIterable<CharacterConfigurationChange>',
        description: '订阅变更通知；连接后首先收到刷新标记，取消信号结束此异步流。',
        parameters: [{ name: 'signal', description: '取消调用或结束订阅流的信号。' }],
        returns: '按发生顺序返回变更通知的异步流。',
      },
      {
        signature: '@Remote readSettingLibrary(characterId: string): SettingLibrary',
        description: '读取完整角色设定库，包含必读、选读、触发方式和插入位置。',
        parameters: [{ name: 'characterId', description: '角色编号。' }],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
      {
        signature: '@Remote saveSettingLibrary(characterId: string, library: SettingLibrary): SettingLibrary',
        description: '保存完整角色设定库。',
        parameters: [{ name: 'characterId', description: '角色编号。' }, { name: 'library', description: '完整设定库，包含触发条件和插入位置。' }],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
      {
        signature: '@Remote saveSettingLibraryViewState(characterId: string, expandedGroupIds: string[]): string[]',
        description: '保存已展开设定分组的编号。',
        parameters: [{ name: 'characterId', description: '角色编号。' }, { name: 'expandedGroupIds', description: '已展开分组编号。' }],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
      {
        signature: '@Remote readConversationSettingLibraries(characterId: string): SettingLibraryConversation[]',
        description: '读取角色各聊天的完整设定库。',
        parameters: [{ name: 'characterId', description: '角色编号。' }],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
      {
        signature: '@Remote saveConversationSettingLibrary( characterId: string, conversationId: string, library: SettingLibrary ): SettingLibrary',
        description: '保存指定聊天的完整设定库。',
        parameters: [{ name: 'characterId', description: '角色编号。' }, { name: 'conversationId', description: 'ElecKoi 聊天编号。' }, { name: 'library', description: '完整设定库，包含触发条件和插入位置。' }],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
      {
        signature: '@Remote resetConversationSettingLibrary(characterId: string, conversationId: string): void',
        description: '将聊天设定库恢复到角色设定。',
        parameters: [{ name: 'characterId', description: '角色编号。' }, { name: 'conversationId', description: 'ElecKoi 聊天编号。' }],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
      {
        signature: '@Remote saveConversationSettingLibraryVersion( characterId: string, conversationId: string, name: string ): SettingLibrary',
        description: '保存聊天设定库的命名版本。',
        parameters: [{ name: 'characterId', description: '角色编号。' }, { name: 'conversationId', description: 'ElecKoi 聊天编号。' }, { name: 'name', description: '保存的名称或附件文件名。' }],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
      {
        signature: '@Remote readVariableConfig(characterId: string): VariableConfig',
        description: '读取变量定义和初始化配置。',
        parameters: [{ name: 'characterId', description: '角色编号。' }],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
      {
        signature: '@Remote saveVariableConfig(characterId: string, config: VariableConfig): VariableConfig',
        description: '保存变量定义和初始化配置。',
        parameters: [{ name: 'characterId', description: '角色编号。' }, { name: 'config', description: '完整配置，字段见参数类型。' }],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
      {
        signature: '@Remote saveVariableConfigViewState(characterId: string, expandedObjectIds: string[]): string[]',
        description: '保存已展开变量对象的编号。',
        parameters: [{ name: 'characterId', description: '角色编号。' }, { name: 'expandedObjectIds', description: '已展开变量对象编号。' }],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
      {
        signature: '@Remote readRegexRules(characterId: string): RegexRuleCollection',
        description: '读取完整正则配置及其 revision。',
        parameters: [{ name: 'characterId', description: '角色编号。' }],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
      {
        signature: '@Remote saveRegexRules( characterId: string, collection: RegexRuleCollection, expectedRevision: number ): RegexRuleCollection',
        description: '校验 revision 后保存完整正则配置。',
        parameters: [{ name: 'characterId', description: '角色编号。' }, { name: 'collection', description: '完整正则配置。' }, { name: 'expectedRevision', description: '要求仍有效的配置版本；不匹配时拒绝保存。' }],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
      {
        signature: '@Remote importRegexRules( characterId: string, fallbackScope: RegexRuleScope, documents: RegexRuleImportDocument[], expectedRevision: number ): RegexRuleImportResult',
        description: '校验 revision 后导入正则文件。',
        parameters: [{ name: 'characterId', description: '角色编号。' }, { name: 'fallbackScope', description: '导入文件未指定归属时使用的范围。' }, { name: 'documents', description: '待导入文件列表。' }, { name: 'expectedRevision', description: '要求仍有效的配置版本；不匹配时拒绝保存。' }],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
      {
        signature: '@Remote exportRegexRules(characterId: string, ruleIds: string[]): { fileName: string; json: string }',
        description: '导出指定规则的 JSON 文本。',
        parameters: [{ name: 'characterId', description: '角色编号。' }, { name: 'ruleIds', description: '待导出规则编号。' }],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
      {
        signature: '@Remote testRegexRule(text: string, rule: RegexRule, target: RegexRuleTarget): RegexRuleTestResult',
        description: '测试规则对文本的作用，不保存规则。',
        parameters: [{ name: 'text', description: '本次输入或待测试文本。' }, { name: 'rule', description: '待测试规则。' }, { name: 'target', description: '规则作用的内容类别。' }],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
    ],
  },
  {
    key: 'eleckoiCharactersApi',
    summary: '管理角色目录、分组和角色卡导入导出，通过官方 Typert Remote 公开跨端调用。',
    description: '管理角色目录、分组和角色卡导入导出，通过官方 Typert Remote 公开跨端调用。',
    methods: [
      {
        signature: '@Remote({ mode: \'stream\' }) changes(signal: AbortSignal): AsyncIterable<ProductRecordChange>',
        description: '订阅变更通知；连接后首先收到刷新标记，取消信号结束此异步流。',
        parameters: [{ name: 'signal', description: '取消调用或结束订阅流的信号。' }],
        returns: '按发生顺序返回变更通知的异步流。',
      },
      {
        signature: '@Remote list(): CharacterCollection',
        description: '读取目录。',
        parameters: [],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
      {
        signature: '@Remote create(character: CharacterRecord): CharacterCollection',
        description: '创建项目并返回更新后的数据。',
        parameters: [{ name: 'character', description: '完整角色数据。' }],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
      {
        signature: '@Remote update(character: CharacterRecord): CharacterCollection',
        description: '更新完整数据并通知相关页面刷新。',
        parameters: [{ name: 'character', description: '完整角色数据。' }],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
      {
        signature: '@Remote select(characterId: string): CharacterCollection',
        description: '保存当前选择。',
        parameters: [{ name: 'characterId', description: '角色编号。' }],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
      {
        signature: '@Remote saveGroups(groups: string[], assignments: CharacterGroupAssignment[]): CharacterCollection',
        description: '保存角色分组及角色所属分组。',
        parameters: [{ name: 'groups', description: '分组名称列表。' }, { name: 'assignments', description: '角色所属分组列表。' }],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
      {
        signature: '@Remote async delete(characterIds: string[]): Promise<CharacterCollection>',
        description: '删除指定角色及其关联聊天和官方 Session。',
        parameters: [{ name: 'characterIds', description: '待删除角色编号列表。' }],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
      {
        signature: '@Remote export(characterId: string, format: CharacterExportFormat): CharacterExportResult',
        description: '返回导出文件名、格式和文件内容。',
        parameters: [{ name: 'characterId', description: '角色编号。' }, { name: 'format', description: '支持的导出格式。' }],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
      {
        signature: '@Remote prepareImport(files: CharacterImportFile[], source: CharacterImportSource): CharacterImportPreview',
        description: '读取角色卡并生成等待确认的预览，不立即保存角色。',
        parameters: [{ name: 'files', description: '待导入文件的内容。' }, { name: 'source', description: '支持的导入格式。' }],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
      {
        signature: '@Remote commitImport(token: string): CharacterImportResult',
        description: '确认导入预览并保存角色。',
        parameters: [{ name: 'token', description: '导入预览编号。' }],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
      {
        signature: '@Remote discardImport(token: string): void',
        description: '取消导入预览并清理临时数据。',
        parameters: [{ name: 'token', description: '导入预览编号。' }],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
    ],
  },
  {
    key: 'eleckoiCompatibilityApi',
    summary: '将酒馆兼容命令转交已有产品服务，并向客户端发布兼容数据变更。',
    description: '将酒馆兼容命令转交已有产品服务，并向客户端发布兼容数据变更。',
    methods: [
      {
        signature: '@Remote capabilities(): { methods: string[]; version: number }',
        description: '读取当前宿主实际注册的兼容命令及协议版本。',
        parameters: [],
        returns: '去重后的方法名称列表与兼容协议版本。',
      },
      {
        signature: '@Remote async invoke(command: CompatibilityCommand): Promise<CompatibilityValue>',
        description: '调用兼容命令，复用角色、消息、预设、世界书及其他产品服务。',
        parameters: [{ name: 'command', description: '包含 method 名称与 params 参数的兼容命令。' }],
        returns: '命令的可序列化结果；未知命令或执行失败会抛出错误。',
      },
      {
        signature: '@Remote({ mode: \'stream\' }) changes(signal: AbortSignal): AsyncIterable<CompatibilityChange>',
        description: '订阅兼容数据变更，连接时先返回快照标记以便客户端重新读取状态。',
        parameters: [{ name: 'signal', description: '取消订阅的信号。' }],
        returns: '当前连接期间的变更流，不回放连接之前的历史事件。',
      },
    ],
  },
  {
    key: 'eleckoiConversationLifecycle',
    summary: '按 Cordis 插件生命周期管理聊天参与者，不管理 Agent 分工或模型路由。',
    description: '按 Cordis 插件生命周期管理聊天参与者，不管理 Agent 分工或模型路由。',
    methods: [
      {
        signature: 'register(participant: ConversationLifecycleParticipant): () => void',
        description: '注册生成准备、保存收尾和回退处理，停用插件时自动取消并等待正在执行的回调。',
        parameters: [{ name: 'participant', description: '插件编号和需要参与的处理函数。' }],
        returns: '注销当前注册项的函数；插件卸载也会自动注销。',
      },
    ],
  },
  {
    key: 'eleckoiConversationModelsApi',
    summary: '管理所有聊天下一轮共同使用的模型，通过官方 Typert Remote 公开跨端调用。',
    description: '管理所有聊天下一轮共同使用的模型，通过官方 Typert Remote 公开跨端调用。',
    methods: [
      {
        signature: '@Remote async current(conversationId: string): Promise<ConversationModelSelection>',
        description: '读取下一轮使用的全局模型。',
        parameters: [{ name: 'conversationId', description: 'ElecKoi 聊天编号。' }],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
      {
        signature: '@Remote async select(conversationId: string, selection: ConversationModelSelection): Promise<ConversationModelSelection>',
        description: '保存当前选择。',
        parameters: [{ name: 'conversationId', description: 'ElecKoi 聊天编号。' }, { name: 'selection', description: '模型提供商、模型编号和可选推理档位。' }],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
    ],
  },
  {
    key: 'eleckoiConversationsApi',
    summary: '管理聊天目录、产品资料和官方 Session 消息修改，通过官方 Typert Remote 公开跨端调用。',
    description: '管理聊天目录、产品资料和官方 Session 消息修改，通过官方 Typert Remote 公开跨端调用。',
    methods: [
      {
        signature: '@Remote({ mode: \'stream\' }) changes(signal: AbortSignal): AsyncIterable<ConversationChange>',
        description: '订阅变更通知；连接后首先收到刷新标记，取消信号结束此异步流。',
        parameters: [{ name: 'signal', description: '取消调用或结束订阅流的信号。' }],
        returns: '按发生顺序返回变更通知的异步流。',
      },
      {
        signature: '@Remote async list(signal: AbortSignal): Promise<ConversationSummary[]>',
        description: '读取目录。',
        parameters: [{ name: 'signal', description: '取消调用或结束订阅流的信号。' }],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
      {
        signature: '@Remote({ mode: \'stream\' }) requestPreviews(conversationId: string, signal: AbortSignal): AsyncIterable<ConversationRequestPreviewSummary[]>',
        description: '订阅当前运行期间实际请求的轻量目录；关闭 Host 后不恢复。',
        parameters: [{ name: 'conversationId', description: 'ElecKoi 聊天编号。' }, { name: 'signal', description: '取消订阅的信号。' }],
        returns: '仅包含轮次、请求编号和模型的目录流。',
      },
      {
        signature: '@Remote requestPreview(conversationId: string, requestId: string, signal: AbortSignal): ConversationRequestPreview',
        description: '读取当前运行期间捕获的指定请求，不读取 Session 日志或当前设定重算。',
        parameters: [{ name: 'conversationId', description: 'ElecKoi 聊天编号。' }, { name: 'requestId', description: '当前运行期间请求目录中的正式标识。' }, { name: 'signal', description: '取消本次读取的信号。' }],
        returns: '按实际发送顺序排列的可读输入；关闭后或不存在的请求抛出原因。',
      },
      {
        signature: '@Remote details(conversationId: string, beforeSequence?: number, limit?: number): ConversationDetailsMetadata',
        description: '读取聊天关联资料和消息元数据；消息正文由官方 Session 读取。',
        parameters: [{ name: 'conversationId', description: 'ElecKoi 聊天编号。' }, { name: 'beforeSequence', description: '分页消息边界，读取该事件序号之前的消息。' }, { name: 'limit', description: '分页最多读取的消息数量。' }],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
      {
        signature: '@Remote projectDisplay( conversationId: string, messages: ConversationMessageDisplayInput[] ): ConversationMessageDisplayResult[]',
        description: '根据正则和变量计算消息的显示正文。',
        parameters: [{ name: 'conversationId', description: 'ElecKoi 聊天编号。' }, { name: 'messages', description: '需要计算显示正文的消息列表。' }],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
      {
        signature: '@Remote async variableTimeline(conversationId: string): Promise<VariableViewerTimeline>',
        description: '读取各聊天楼层的变量状态。',
        parameters: [{ name: 'conversationId', description: 'ElecKoi 聊天编号。' }],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
      {
        signature: '@Remote authorState(conversationId: string): AuthorConversationState',
        description: '读取当前聊天的有效设定库、变量配置和变量状态。',
        parameters: [{ name: 'conversationId', description: 'ElecKoi 聊天编号。' }],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
      {
        signature: '@Remote replaceVariableState(conversationId: string, stateJson: string): string',
        description: '替换聊天当前变量；生成期间拒绝修改。',
        parameters: [{ name: 'conversationId', description: 'ElecKoi 聊天编号。' }, { name: 'stateJson', description: '完整变量对象的 JSON 文本。' }],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
      {
        signature: '@Remote async exportArchive(conversationId: string): Promise<string>',
        description: '导出聊天资料和官方 Session 日志的归档 JSON。',
        parameters: [{ name: 'conversationId', description: 'ElecKoi 聊天编号。' }],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
      {
        signature: '@Remote async importArchive(characterId: string, json: string): Promise<string>',
        description: '导入归档，创建新的聊天和官方 Session。',
        parameters: [{ name: 'characterId', description: '角色编号。' }, { name: 'json', description: '完整聊天归档 JSON 文本。' }],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
      {
        signature: '@Remote async revealFile( conversationId: string, attachmentId: string, name: string, signal: AbortSignal ): Promise<void>',
        description: '在文件管理器中显示官方附件。',
        parameters: [{ name: 'conversationId', description: 'ElecKoi 聊天编号。' }, { name: 'attachmentId', description: '官方附件编号。' }, { name: 'name', description: '保存的名称或附件文件名。' }, { name: 'signal', description: '取消调用或结束订阅流的信号。' }],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
      {
        signature: '@Remote async create(input: ConversationCreateInput): Promise<ConversationDetailsMetadata>',
        description: '创建项目并返回更新后的数据。',
        parameters: [{ name: 'input', description: '本次操作的输入，字段见参数类型。' }],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
      {
        signature: '@Remote async delete(conversationId: string): Promise<void>',
        description: '删除指定项目及其关联数据。',
        parameters: [{ name: 'conversationId', description: 'ElecKoi 聊天编号。' }],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
      {
        signature: '@Remote async rename(conversationId: string, title: string): Promise<ConversationDetailsMetadata>',
        description: '重命名聊天，同时保存官方 Session 与产品目录中的标题。',
        parameters: [{ name: 'conversationId', description: 'ElecKoi 聊天编号。' }, { name: 'title', description: '新的聊天标题。' }],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
      {
        signature: '@Remote async fork(conversationId: string, atSeq: number | undefined, retainedTurnIds: string[], title: string): Promise<string>',
        description: '从指定官方 Session 事件创建聊天分支，复制保留的产品轮次和历史运行状态。',
        parameters: [{ name: 'conversationId', description: '来源 ElecKoi 聊天编号。' }, { name: 'atSeq', description: '分支边界的官方事件序号；省略时创建同配置和开场白的空聊天。' }, { name: 'retainedTurnIds', description: '分支中需要保留的产品轮次编号；开场白轮次自动保留。' }, { name: 'title', description: '新聊天的标题。' }],
        returns: '新建分支的 ElecKoi 聊天编号；创建失败会清理分支并抛出错误。',
      },
      {
        signature: '@Remote async preparePrompt(conversationId: string, text: string, signal: AbortSignal): Promise<{ runtimeSessionId: string; operationId: string }>',
        description: '准备本次输入需要的产品配置和官方 Session，不直接生成回复。',
        parameters: [{ name: 'conversationId', description: 'ElecKoi 聊天编号。' }, { name: 'text', description: '本次输入或待测试文本。' }, { name: 'signal', description: '取消准备过程的信号。' }],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
      {
        signature: '@Remote async waitForGeneration(conversationId: string, operationId: string): Promise<void>',
        description: '等待当前进程本次保存及插件收尾，失败抛出错误；不查询历史或重启前结果。',
        parameters: [{ name: 'conversationId', description: 'ElecKoi 聊天编号。' }, { name: 'operationId', description: '生成准备时返回的本次操作编号。' }],
        returns: '本轮收尾完成；此方法不启动模型，也不重复执行插件。',
      },
      {
        signature: '@Remote async completeGroupRound(conversationId: string, cancelled: boolean, signal: AbortSignal): Promise<{ cancelled: boolean }>',
        description: '保存当前群聊成员的回复，并按群聊策略依次执行余下成员的 Agent 回合。',
        parameters: [{ name: 'conversationId', description: 'ElecKoi 聊天编号。' }, { name: 'cancelled', description: '当前成员是否已取消；为 true 时直接结束群聊轮次。' }, { name: 'signal', description: '取消后续成员生成的信号。' }],
        returns: '是否发生取消；无活跃群聊时返回 cancelled 为 false，生成失败抛出错误。',
      },
      {
        signature: '@Remote async editMessage( conversationId: string, eventSeq: number, role: \'user\' | \'assistant\', content: string ): Promise<ConversationDetailsMetadata>',
        description: '修改同一官方 Session 中的用户或模型消息，刷新投影并发布消息变更。',
        parameters: [{ name: 'conversationId', description: 'ElecKoi 聊天编号。' }, { name: 'eventSeq', description: '官方 Session 中待修改消息的事件序号。' }, { name: 'role', description: '消息角色，必须与指定事件中的消息一致。' }, { name: 'content', description: '保存后替换原正文的完整文本。' }],
        returns: '修改后的聊天详情与元数据；消息不存在或角色不一致时抛出错误。',
      },
      {
        signature: '@Remote async deleteMessagesFrom( conversationId: string, eventSeq: number, role: \'user\' | \'assistant\' ): Promise<{ details: ConversationDetailsMetadata deletedMessageCount: number remainingMessageCount: number }>',
        description: '在同一 Session 中从指定消息回退，恢复相应变量。',
        parameters: [{ name: 'conversationId', description: 'ElecKoi 聊天编号。' }, { name: 'eventSeq', description: '官方 Session 中消息的事件序号。' }, { name: 'role', description: '消息角色。' }],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
      {
        signature: '@Remote async regenerateMessage( conversationId: string, eventSeq: number, requestId: string, replacementMessage?: string ): Promise<{ runtimeSessionId: string; prepared: true; operationId: string }>',
        description: '准备指定用户输入的重新生成，返回待启动请求。',
        parameters: [{ name: 'conversationId', description: 'ElecKoi 聊天编号。' }, { name: 'eventSeq', description: '官方 Session 中消息的事件序号。' }, { name: 'requestId', description: '本次生成的唯一请求编号。' }, { name: 'replacementMessage', description: '可替换的用户输入；省略时保留原输入。' }],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
      {
        signature: '@Remote async startRegeneration(conversationId: string, requestId: string, cancelled: boolean): Promise<{ accepted: boolean; turn?: number }>',
        description: '从已保留的用户事件启动重新生成；取消时保留用户输入，不启动新的回复。',
        parameters: [{ name: 'conversationId', description: 'ElecKoi 聊天编号。' }, { name: 'requestId', description: '本次生成的唯一请求编号。' }, { name: 'cancelled', description: '已准备的请求是否被取消。' }],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
      {
        signature: '@Remote async selectOpening(conversationId: string, openingId: string): Promise<ConversationDetailsMetadata>',
        description: '切换开场白。',
        parameters: [{ name: 'conversationId', description: 'ElecKoi 聊天编号。' }, { name: 'openingId', description: '开场白编号。' }],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
      {
        signature: '@Remote async updateOpening(conversationId: string, content: string): Promise<ConversationDetailsMetadata>',
        description: '修改开场白文本。',
        parameters: [{ name: 'conversationId', description: 'ElecKoi 聊天编号。' }, { name: 'content', description: '要保存的完整文本。' }],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
    ],
  },
  {
    key: 'eleckoiCreatorStudioApi',
    summary: '管理创作项目目录，通过官方 Typert Remote 公开跨端调用。',
    description: '管理创作项目目录，通过官方 Typert Remote 公开跨端调用。',
    methods: [
      {
        signature: '@Remote({ mode: \'stream\' }) changes(signal: AbortSignal): AsyncIterable<ProductRecordChange>',
        description: '订阅变更通知；连接后首先收到刷新标记，取消信号结束此异步流。',
        parameters: [{ name: 'signal', description: '取消调用或结束订阅流的信号。' }],
        returns: '按发生顺序返回变更通知的异步流。',
      },
      {
        signature: '@Remote list(): CreatorProjectCollection',
        description: '读取目录。',
        parameters: [],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
      {
        signature: '@Remote create(input: CreateCreatorProjectInput): CreatorProjectCollection',
        description: '创建项目并返回更新后的数据。',
        parameters: [{ name: 'input', description: '本次操作的输入，字段见参数类型。' }],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
      {
        signature: '@Remote delete(projectId: string): CreatorProjectCollection',
        description: '删除指定项目及其关联数据。',
        parameters: [{ name: 'projectId', description: '创作项目编号。' }],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
    ],
  },
  {
    key: 'eleckoiDisplayPreferencesApi',
    summary: '管理界面和聊天显示偏好，通过官方 Typert Remote 公开跨端调用。',
    description: '管理界面和聊天显示偏好，通过官方 Typert Remote 公开跨端调用。',
    methods: [
      {
        signature: '@Remote read(): DisplayPreferencesSnapshot',
        description: '读取完整保存数据。',
        parameters: [],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
      {
        signature: '@Remote async updateUi( ui: Record<string, DisplayPreferenceValue>, expectedRevision?: number ): Promise<DisplayPreferencesSnapshot>',
        description: '保存界面偏好并处理需写入媒体库的壁纸。',
        parameters: [{ name: 'ui', description: '完整界面偏好。' }, { name: 'expectedRevision', description: '要求仍有效的配置版本；不匹配时拒绝保存。' }],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
      {
        signature: '@Remote async setChatDisplay( chatDisplay: Record<string, DisplayPreferenceValue>, expectedRevision?: number ): Promise<DisplayPreferencesSnapshot>',
        description: '保存聊天显示偏好。',
        parameters: [{ name: 'chatDisplay', description: '完整聊天显示偏好。' }, { name: 'expectedRevision', description: '要求仍有效的配置版本；不匹配时拒绝保存。' }],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
    ],
  },
  {
    key: 'eleckoiModelsApi',
    summary: '管理模型目录、连接测试和用户主动查看的密钥，通过官方 Typert Remote 公开跨端调用。',
    description: '管理模型目录、连接测试和用户主动查看的密钥，通过官方 Typert Remote 公开跨端调用。',
    methods: [
      {
        signature: '@Remote revealApiKey(configId: string): Promise<string>',
        description: '按模型配置编号读取密钥，供用户主动查看。',
        parameters: [{ name: 'configId', description: '模型配置编号。' }],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
      {
        signature: '@Remote testConnection(input: ModelConnectionInput): Promise<{ supported: true }>',
        description: '通过官方适配器测试工具调用，不创建聊天。',
        parameters: [{ name: 'input', description: '本次操作的输入，字段见参数类型。' }],
        returns: '工具调用成功时返回 supported: true；失败抛出错误。',
      },
      {
        signature: '@Remote discoverModels(input: ModelDiscoveryInput): Promise<ModelDiscoveryResult[]>',
        description: '读取模型目录，能力来自官方目录或明确配置。',
        parameters: [{ name: 'input', description: '本次操作的输入，字段见参数类型。' }],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
    ],
  },
  {
    key: 'eleckoiPersonaApi',
    summary: '管理用户名称和头像资料，通过官方 Typert Remote 公开跨端调用。',
    description: '管理用户名称和头像资料，通过官方 Typert Remote 公开跨端调用。',
    methods: [
      {
        signature: '@Remote({ mode: \'stream\' }) changes(signal: AbortSignal): AsyncIterable<ProductRecordChange>',
        description: '订阅变更通知；连接后首先收到刷新标记，取消信号结束此异步流。',
        parameters: [{ name: 'signal', description: '取消调用或结束订阅流的信号。' }],
        returns: '按发生顺序返回变更通知的异步流。',
      },
      {
        signature: '@Remote read(): PersonaProfile',
        description: '读取完整保存数据。',
        parameters: [],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
      {
        signature: '@Remote save(profile: PersonaProfile): PersonaProfile',
        description: '保存完整数据并通知相关页面刷新。',
        parameters: [{ name: 'profile', description: '完整用户资料。' }],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
    ],
  },
  {
    key: 'eleckoiRequestPreviews',
    summary: 'Host 运行期请求预览；只共用内存消息，不持久化或恢复历史请求。',
    description: 'Host 运行期请求预览；只共用内存消息，不持久化或恢复历史请求。',
    methods: [
      {
        signature: 'capture(session: Session, options: GenerateOptions, plan: readonly object[], execution: { round: number | null; turn: number; step: number }): RequestPreviewSummary',
        description: '捕获即将交给 LLM Runtime 的真实请求。',
        parameters: [{ name: 'session', description: '发送请求的正式 Session。' }, { name: 'options', description: '完成产品装配的实际模型请求。' }, { name: 'plan', description: '此次装配使用的设定位置和可读来源。' }, { name: 'execution', description: '已有输入投影的轮次和实时步骤事件中的执行身份。' }],
        returns: '仅含身份与编号的请求目录项。',
      },
      {
        signature: 'list(sessionId: string): RequestPreviewSummary[]',
        description: '列出当前运行捕获的请求，目录不包含正文。',
        parameters: [{ name: 'sessionId', description: '正式 Session ID。' }],
        returns: '发送顺序中的请求目录项。',
      },
      {
        signature: 'read(sessionId: string, requestId: string): { id: string; items: RoleplayRequestContextItem[] }',
        description: '按运行期请求身份临时生成可读上下文；不存在时失败。',
        parameters: [{ name: 'sessionId', description: '正式 Session ID。' }, { name: 'requestId', description: '本次运行捕获时分配的请求 ID。' }],
        returns: '请求身份和按实际顺序排列的上下文条目。',
      },
      {
        signature: 'stream(sessionId: string, signal: AbortSignal): AsyncIterable<RequestPreviewSummary[]>',
        description: '订阅请求目录，慢读取者合并通知，取消后释放订阅。',
        parameters: [{ name: 'sessionId', description: '正式 Session ID。' }, { name: 'signal', description: '订阅取消生命周期。' }],
        returns: '初始目录及之后的最新目录。',
      },
      {
        signature: 'forget(sessionId: string): void',
        description: '删除聊天时释放该 Session 的全部运行期请求。',
        parameters: [{ name: 'sessionId', description: '已删除的正式 Session ID。' }],
      },
      {
        signature: 'close(): void',
        description: '释放全部请求并结束订阅；用于 Host 插件卸载。',
        parameters: [],
      },
    ],
  },
  {
    key: 'eleckoiSessionEditor',
    summary: '修改同一个官方 Session 的消息和回退位置，保留 Session 编号。',
    description: '修改同一个官方 Session 的消息和回退位置，保留 Session 编号。',
    methods: [
      {
        signature: 'mutateTimeline(sessionId: string, mutation: { updates?: CompatibilityTimelineInput[]; inserts?: CompatibilityTimelineInput[] }): Promise<CompatibilityTimelineInput[]>',
        description: '在同一官方 Session 日志中批量更新或插入兼容消息，并刷新消息投影。',
        parameters: [{ name: 'sessionId', description: '待编辑的官方 Session 编号。' }, { name: 'mutation', description: 'updates 按 sessionEventSeq 更新已有消息；inserts 按给定顺序追加消息。' }],
        returns: '新插入的消息及其实际 id、sessionEventSeq；仅更新已有消息时返回空数组。',
      },
      {
        signature: 'editMessage(sessionId: string, eventSeq: number, role: \'user\' | \'assistant\', content: string): Promise<void>',
        description: '修改一条消息并刷新官方投影。',
        parameters: [{ name: 'sessionId', description: '官方 Session 编号。' }, { name: 'eventSeq', description: '消息事件序号。' }, { name: 'role', description: '消息角色。' }, { name: 'content', description: '新的完整消息文本。' }],
        returns: '消息修改和投影刷新完成。',
      },
      {
        signature: 'rewind(sessionId: string, fromTurn: number, fromEventSeq?: number, retainInput?: boolean): Promise<number | undefined>',
        description: '从指定轮次和可选事件位置回退，并刷新官方投影。',
        parameters: [{ name: 'sessionId', description: '官方 Session 编号。' }, { name: 'fromTurn', description: '首个需要撤销的轮次。' }, { name: 'fromEventSeq', description: '可选消息事件边界。' }, { name: 'retainInput', description: '保留该边界的直接用户事件并闭合其开放轮次。' }],
        returns: '移除的事件数；无法回退时返回 undefined。',
      },
    ],
  },
  {
    key: 'eleckoiSystemApi',
    summary: '管理受管 Host 的架构和协议状态，通过官方 Typert Remote 公开跨端调用。',
    description: '管理受管 Host 的架构和协议状态，通过官方 Typert Remote 公开跨端调用。',
    methods: [
      {
        signature: '@Remote status(): ElecKoiHostStatus',
        description: '读取架构和协议版本。',
        parameters: [],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
    ],
  },
  {
    key: 'eleckoiWebSearchApi',
    summary: '管理联网搜索方式和 Tavily 连接测试，通过官方 Typert Remote 公开跨端调用。',
    description: '管理联网搜索方式和 Tavily 连接测试，通过官方 Typert Remote 公开跨端调用。',
    methods: [
      {
        signature: '@Remote selection(): WebSearchMode',
        description: '读取当前搜索提供商。',
        parameters: [],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
      {
        signature: '@Remote async select(mode: WebSearchMode): Promise<WebSearchMode>',
        description: '保存当前选择。',
        parameters: [{ name: 'mode', description: '联网搜索方式。' }],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
      {
        signature: '@Remote async testTavily(apiKey?: string, signal?: AbortSignal): Promise<TavilyConnection>',
        description: '测试临时或已保存的密钥，不保存传入密钥。',
        parameters: [{ name: 'apiKey', description: '仅用于测试的密钥；省略时使用当前密钥。' }, { name: 'signal', description: '取消调用或结束订阅流的信号。' }],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
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
    name: 'AgentPreset',
    declaration: 'export interface AgentPreset {\n    id: string;\n    name: string;\n    modelFamily: AgentPresetModelFamily;\n    modelTags: AgentPresetModelTag[];\n    libraryGroupId: string;\n    activeVersionId: string;\n    activeVersionNumber: number;\n    profile: AgentPresetProfile;\n    entries: SettingLibraryEntry[];\n    groups: SettingLibraryGroup[];\n    promptPositions: SettingLibraryPromptPosition[];\n    toolGroups: AgentToolGroup[];\n    subagentModelSelection?: {\n        configId: string;\n        model: string;\n    };\n    toolModelConfigIds?: Record<string, string>;\n    roleplayPlan: {\n        steps: string[];\n    };\n    regexRules: RegexRule[];\n    expandedGroupIds: string[];\n}',
  },
  {
    name: 'AgentPresetCatalog',
    declaration: 'export interface AgentPresetCatalog {\n    activePresetId: string;\n    groups: AgentPresetLibraryGroup[];\n    presets: AgentPresetSummary[];\n}',
  },
  {
    name: 'AgentPresetExportFormat',
    declaration: 'export type AgentPresetExportFormat = \'json\' | \'png\';',
  },
  {
    name: 'AgentPresetExportResult',
    declaration: 'export interface AgentPresetExportResult {\n    fileName: string;\n    mimeType: string;\n    base64: string;\n}',
  },
  {
    name: 'AgentPresetImportDocument',
    declaration: 'export interface AgentPresetImportDocument {\n    displayName: string;\n    mimeType: string;\n    base64: string;\n}',
  },
  {
    name: 'AgentPresetImportResult',
    declaration: 'export interface AgentPresetImportResult {\n    preset: AgentPreset;\n    source: AgentPresetImportSource;\n    skippedUnsupportedEntries: number;\n    skippedDepthRegexCount: number;\n}',
  },
  {
    name: 'AgentPresetImportSource',
    declaration: 'export type AgentPresetImportSource = \'eleckoi\' | \'sillytavern\';',
  },
  {
    name: 'AgentPresetLibraryGroup',
    declaration: 'export interface AgentPresetLibraryGroup {\n    id: string;\n    name: string;\n    sortIndex: number;\n}',
  },
  {
    name: 'AgentPresetModelFamily',
    declaration: 'export type AgentPresetModelFamily = \'general\' | \'claude\' | \'openai\' | \'gemini\' | \'deepseek\' | \'other\';',
  },
  {
    name: 'AgentPresetModelTag',
    declaration: 'export interface AgentPresetModelTag {\n    id: string;\n    label: string;\n    providerId: string;\n}',
  },
  {
    name: 'AgentPresetProfile',
    declaration: 'export interface AgentPresetProfile {\n    authorName: string;\n    authorAvatarPath: string;\n    usageInstructions: string;\n    timeline: AgentPresetTimelineItem[];\n}',
  },
  {
    name: 'AgentPresetSummary',
    declaration: 'export interface AgentPresetSummary {\n    id: string;\n    name: string;\n    modelFamily: AgentPresetModelFamily;\n    modelTags: AgentPresetModelTag[];\n    libraryGroupId: string;\n    activeVersionId: string;\n    activeVersionNumber: number;\n    entryCount: number;\n    profile: AgentPresetProfile;\n}',
  },
  {
    name: 'AgentPresetTimelineItem',
    declaration: 'export interface AgentPresetTimelineItem {\n    id: string;\n    title: string;\n    dateLabel: string;\n    note: string;\n}',
  },
  {
    name: 'AgentToolGroup',
    declaration: 'export interface AgentToolGroup {\n    id: string;\n    name: string;\n    description: string;\n    source: \'built_in\' | \'mcp\' | \'extension\';\n    members: AgentToolMember[];\n    enabled: boolean;\n    included: boolean;\n}',
  },
  {
    name: 'AgentToolMember',
    declaration: 'export interface AgentToolMember {\n    name: string;\n    description: string;\n}',
  },
  {
    name: 'AuthorCapabilities',
    declaration: 'export interface AuthorCapabilities {\n    methods: string[];\n    version: number;\n    assetsBaseUrl: string;\n}',
  },
  {
    name: 'AuthorChange',
    declaration: 'export interface AuthorChange {\n    event: string;\n    payload: AuthorValue;\n}',
  },
  {
    name: 'AuthorCommand',
    declaration: 'export interface AuthorCommand {\n    method: string;\n    params: {\n        [key: string]: AuthorValue;\n    };\n}',
  },
  {
    name: 'AuthorConversationState',
    declaration: 'export interface AuthorConversationState {\n    initialVariableStateJson: string;\n    currentVariableStateJson: string;\n    variableConfig: VariableConfig | null;\n    settingLibrarySummary: {\n        characterId: string;\n        name: string;\n        activeVersionId: string;\n        entryCount: number;\n        groupCount: number;\n    } | null;\n    settingLibrary: ConversationRuntimeSettingLibrary | null;\n}',
  },
  {
    name: 'AuthorValue',
    declaration: 'export type AuthorValue = null | boolean | number | string | AuthorValue[] | {\n    [key: string]: AuthorValue;\n};',
  },
  {
    name: 'CharacterCollection',
    declaration: 'export interface CharacterCollection {\n    active_character_id: string;\n    groups: string[];\n    items: CharacterRecord[];\n}',
  },
  {
    name: 'CharacterConfigurationChange',
    declaration: 'export type CharacterConfigurationChange = {\n    kind: \'snapshot\';\n} | {\n    kind: \'configuration\';\n    domain: \'settingLibraries\' | \'variables\' | \'regexRules\' | \'agentPresets\';\n    characterId?: string;\n};',
  },
  {
    name: 'CharacterExportFormat',
    declaration: 'export type CharacterExportFormat = \'png\' | \'json\';',
  },
  {
    name: 'CharacterExportResult',
    declaration: 'export interface CharacterExportResult {\n    fileName: string;\n    mimeType: \'image/png\' | \'application/json\';\n    base64: string;\n}',
  },
  {
    name: 'CharacterGroupAssignment',
    declaration: 'export interface CharacterGroupAssignment {\n    characterId: string;\n    group: string;\n}',
  },
  {
    name: 'CharacterImportFile',
    declaration: 'export interface CharacterImportFile {\n    displayName: string;\n    mimeType: string;\n    base64: string;\n}',
  },
  {
    name: 'CharacterImportPreview',
    declaration: 'export interface CharacterImportPreview {\n    token: string;\n    items: CharacterImportPreviewItem[];\n}',
  },
  {
    name: 'CharacterImportPreviewItem',
    declaration: 'export interface CharacterImportPreviewItem {\n    id: string;\n    name: string;\n    summary: string;\n    imageAvailable: boolean;\n    errorMessage: string;\n    importable: boolean;\n}',
  },
  {
    name: 'CharacterImportResult',
    declaration: 'export interface CharacterImportResult {\n    collection: CharacterCollection;\n    importedCharacterIds: string[];\n    failedMessages: string[];\n}',
  },
  {
    name: 'CharacterImportSource',
    declaration: 'export type CharacterImportSource = \'eleckoi\' | \'sillytavern\';',
  },
  {
    name: 'CharacterPersona',
    declaration: 'export interface CharacterPersona {\n    assistant_name: string;\n    assistant_avatar: string;\n    assistant_square: string;\n    assistant_cover: string;\n    image_prompt?: string;\n    opening?: string;\n    show_opening?: boolean;\n    user_name?: string;\n    user_avatar?: string;\n    user_square?: string;\n    user_portrait?: string;\n}',
  },
  {
    name: 'CharacterRecord',
    declaration: 'export interface CharacterRecord {\n    id: string;\n    name?: string;\n    avatar?: string;\n    group?: string;\n    groupName?: string;\n    groupViewOrder?: number;\n    folder?: string;\n    frontendBeautyEnabled?: boolean | number;\n    profileAge?: string;\n    profileSex?: string;\n    profileHeight?: string;\n    profileBirthday?: string;\n    profileLike?: string;\n    showOpening?: boolean | number;\n    chatBackground?: string;\n    chatBackgroundOpacity?: number;\n    chatBackgroundBlur?: number;\n    chatBackgroundScrim?: number;\n    primaryOpening?: string;\n    persona?: CharacterPersona;\n}',
  },
  {
    name: 'CompatibilityChange',
    declaration: 'export interface CompatibilityChange {\n    event: string;\n    payload: CompatibilityValue;\n}',
  },
  {
    name: 'CompatibilityCommand',
    declaration: 'export interface CompatibilityCommand {\n    method: string;\n    params: {\n        [key: string]: CompatibilityValue;\n    };\n}',
  },
  {
    name: 'CompatibilityTimelineInput',
    declaration: 'export interface CompatibilityTimelineInput {\n    id: string;\n    role: \'user\' | \'assistant\' | \'system\';\n    content: string;\n    sessionEventSeq?: number;\n    reasoning?: string;\n}',
  },
  {
    name: 'CompatibilityValue',
    declaration: 'export type CompatibilityValue = null | boolean | number | string | CompatibilityValue[] | {\n    [key: string]: CompatibilityValue;\n};',
  },
  {
    name: 'ConversationChange',
    declaration: 'export type ConversationChange = {\n    kind: \'snapshot\';\n} | {\n    kind: \'generation\';\n    conversationId: string;\n    error: string;\n} | {\n    kind: \'catalog\';\n    conversationId: string;\n    reason: \'created\' | \'deleted\' | \'updated\';\n} | {\n    kind: \'messages\';\n    conversationId: string;\n    reason: \'edited\' | \'deleted\' | \'regenerated\';\n    messageIds: string[];\n    sessionRewritten?: boolean;\n};',
  },
  {
    name: 'ConversationCreateInput',
    declaration: 'export interface ConversationCreateInput {\n    title?: string;\n    metadata?: Partial<ConversationMetadata>;\n}',
  },
  {
    name: 'ConversationDetailsMetadata',
    declaration: 'export interface ConversationDetailsMetadata {\n    conversation: ConversationRecord;\n    metadata: ConversationMetadata;\n    runtimeSessionId: string;\n    messages: ConversationMessageMetadata[];\n    hasMore: boolean;\n    beforeSequence: number | null;\n    runtimeVariableStateByTurn?: Record<string, string>;\n    compatibilityPresentation?: {\n        groupId?: CompatibilityValue;\n        metadata: {\n            [id: string]: CompatibilityValue;\n        };\n        extensions: {\n            [id: string]: CompatibilityValue;\n        };\n        bindings: {\n            [id: string]: CompatibilityValue;\n        };\n        swipes?: {\n            [id: string]: CompatibilityValue;\n        };\n        variables?: {\n            [id: string]: CompatibilityValue;\n        };\n        timeline: CompatibilityValue;\n    };\n}',
  },
  {
    name: 'ConversationLifecycleParticipant',
    declaration: 'export interface ConversationLifecycleParticipant {\n    readonly id: string;\n    prepare?(input: ConversationPreparation, signal: AbortSignal): void | Promise<void>;\n    afterSave?(input: ConversationSave, signal: AbortSignal): void | Promise<void>;\n    prepareRestore?(input: ConversationRestore, signal: AbortSignal): ConversationRestorePlan | Promise<ConversationRestorePlan>;\n}',
  },
  {
    name: 'ConversationMessageDisplayInput',
    declaration: 'export interface ConversationMessageDisplayInput {\n    id: string;\n    role: \'user\' | \'assistant\';\n    content: string;\n    variableStateJson: string;\n    status: \'complete\' | \'streaming\' | \'error\' | \'cancelled\';\n    createdAt: string;\n}',
  },
  {
    name: 'ConversationMessageDisplayResult',
    declaration: 'export interface ConversationMessageDisplayResult {\n    id: string;\n    sourceContent: string;\n    displayContent: string;\n    variableStateJson: string;\n}',
  },
  {
    name: 'ConversationMessageMetadata',
    declaration: 'export interface ConversationMessageMetadata {\n    id: string;\n    conversationId: string;\n    role: \'user\' | \'assistant\';\n    variableStateJson: string;\n    status: \'complete\' | \'streaming\' | \'error\' | \'cancelled\';\n    createdAt: string;\n    content?: string;\n    displayContent?: string;\n    turnId?: string;\n    speakerId?: string;\n    speakerName?: string;\n    speakerAvatar?: string;\n    sequence?: number;\n    messageIndex?: number;\n    responseIndex?: number;\n    runtimeSessionId?: string;\n    dshMessageId?: string;\n    sessionEventSeq?: number;\n    dshTurn?: number;\n    openingOptions?: ConversationOpeningOption[];\n    selectedOpeningId?: string;\n    canChangeOpening?: boolean;\n}',
  },
  {
    name: 'ConversationMetadata',
    declaration: 'export interface ConversationMetadata {\n    characterId: string;\n    characterName: string;\n    characterAvatar: string;\n    characterPersona: CharacterPersona;\n}',
  },
  {
    name: 'ConversationModelSelection',
    declaration: 'export interface ConversationModelSelection {\n    provider: string;\n    model: string;\n    reasoningEffort?: string;\n}',
  },
  {
    name: 'ConversationOpeningOption',
    declaration: 'export interface ConversationOpeningOption {\n    id: string;\n    title: string;\n    content: string;\n    variableVersionId?: string;\n    displayContent?: string;\n    initialVariableStateJson: string;\n}',
  },
  {
    name: 'ConversationPreparation',
    declaration: 'export interface ConversationPreparation {\n    readonly operationId: string;\n    readonly conversationId: string;\n    readonly runtimeSessionId: string;\n    readonly turn: number;\n    readonly text: string;\n    readonly model: {\n        readonly provider: string;\n        readonly model: string;\n        readonly reasoningEffort?: string;\n    };\n    readonly runtime: Readonly<ConversationRuntimePreparation>;\n}',
  },
  {
    name: 'ConversationRecord',
    declaration: 'export interface ConversationRecord {\n    id: string;\n    title: string;\n    preview: string;\n    createdAt: string;\n    updatedAt: string;\n}',
  },
  {
    name: 'ConversationRequestPreview',
    declaration: 'export interface ConversationRequestPreview {\n    id: string;\n    items: Array<{\n        order: number;\n        messageId: string;\n        role: \'system\' | \'user\' | \'assistant\';\n        kind: \'system\' | \'prompt\' | \'history\' | \'user\' | \'assistant\' | \'tool\' | \'context\';\n        title: string;\n        source: string;\n        anchor: string;\n        content: string;\n    }>;\n}',
  },
  {
    name: 'ConversationRequestPreviewSummary',
    declaration: 'export interface ConversationRequestPreviewSummary {\n    id: string;\n    round: number | null;\n    request: number;\n    turn: number;\n    step: number;\n    provider: string;\n    model: string;\n}',
  },
  {
    name: 'ConversationRestore',
    declaration: 'export interface ConversationRestore {\n    readonly operationId: string;\n    readonly conversationId: string;\n    readonly runtimeSessionId: string;\n    readonly reason: \'delete-messages\' | \'regenerate\';\n    readonly fromTurn: number;\n    readonly fromEventSeq: number;\n    readonly state: Readonly<ConversationRuntimeStateSnapshot>;\n}',
  },
  {
    name: 'ConversationRestorePlan',
    declaration: 'export interface ConversationRestorePlan {\n    apply(): void | Promise<void>;\n    rollback(): void | Promise<void>;\n}',
  },
  {
    name: 'ConversationRuntimePreparation',
    declaration: 'export interface ConversationRuntimePreparation {\n    conversationId: string;\n    runtimeSessionId: string;\n    promptTextContext: {\n        macros?: {\n            userName: string;\n            characterName: string;\n        };\n        rules?: RegexRuleCollection;\n    };\n    variableContext?: {\n        initialStateJson: string;\n        schemaCode: string;\n        objects: VariableObjectConfig[];\n        variables: VariableItemConfig[];\n        stateJson: string;\n    };\n    conversationContext: {\n        characterId: string;\n        characterName: string;\n        persona: Record<string, unknown>;\n        history: Array<{\n            role: \'user\' | \'assistant\';\n            content: string;\n            speakerName?: string;\n        }>;\n        historyMode: \'prefix\';\n        currentPromptText: string;\n        settingLibrary?: ConversationRuntimeSettingLibrary;\n    };\n    disabledToolGroupIds: string[];\n    agentPreset: {\n        id: string;\n        versionId: string;\n        name: string;\n        roleplayPlan: {\n            steps: string[];\n        };\n        subagentModelSelection?: {\n            configId: string;\n            model: string;\n        };\n        toolModelConfigIds?: Record<string, string>;\n        historyCompactionInstructions?: string;\n    };\n    settingLibraryBaseline?: {\n        source: ConversationRuntimeSettingLibrary;\n        projected: ConversationRuntimeSettingLibrary;\n    };\n}',
  },
  {
    name: 'ConversationRuntimeSettingLibrary',
    declaration: 'export interface ConversationRuntimeSettingLibrary {\n    characterId: string;\n    name: string;\n    entries: SettingLibraryEntry[];\n    groups: SettingLibraryGroup[];\n    promptPositions: SettingLibraryPromptPosition[];\n}',
  },
  {
    name: 'ConversationRuntimeStateSnapshot',
    declaration: 'export interface ConversationRuntimeStateSnapshot {\n    variableStateJson: string;\n    settingLibraryStateJson: string;\n}',
  },
  {
    name: 'ConversationSave',
    declaration: 'export interface ConversationSave {\n    readonly operationId: string;\n    readonly conversationId: string;\n    readonly runtimeSessionId: string;\n    readonly turn: number;\n}',
  },
  {
    name: 'ConversationSummary',
    declaration: 'export interface ConversationSummary extends ConversationRecord {\n    metadata: ConversationMetadata;\n    runtimeSessionId: string;\n}',
  },
  {
    name: 'CreateCreatorProjectInput',
    declaration: 'export interface CreateCreatorProjectInput {\n    name: string;\n    mode: CreatorProjectMode;\n    parentDirectory: string;\n    sourceCharacterId?: string;\n}',
  },
  {
    name: 'CreatorProject',
    declaration: 'export interface CreatorProject {\n    id: string;\n    name: string;\n    mode: CreatorProjectMode;\n    rootPath: string;\n    sourceCharacterId: string;\n    coverImage: string;\n    createdAt: string;\n    updatedAt: string;\n}',
  },
  {
    name: 'CreatorProjectCollection',
    declaration: 'export interface CreatorProjectCollection {\n    items: CreatorProject[];\n}',
  },
  {
    name: 'CreatorProjectMode',
    declaration: 'export type CreatorProjectMode = \'blank\' | \'existing\';',
  },
  {
    name: 'DisplayPreferencesSnapshot',
    declaration: 'export interface DisplayPreferencesSnapshot {\n    ui: Record<string, DisplayPreferenceValue>;\n    chatDisplay: Record<string, DisplayPreferenceValue>;\n    writable: boolean;\n    revision: number;\n}',
  },
  {
    name: 'DisplayPreferenceValue',
    declaration: 'export type DisplayPreferenceValue = null | boolean | number | string | DisplayPreferenceValue[] | {\n    [key: string]: DisplayPreferenceValue;\n};',
  },
  {
    name: 'ElecKoiHostStatus',
    declaration: 'export interface ElecKoiHostStatus {\n    architecture: \'dsh-remote\';\n    protocolVersion: 1;\n}',
  },
  {
    name: 'ModelConnectionInput',
    declaration: 'export interface ModelConnectionInput {\n    configId: string;\n    model: string;\n    baseURL: string;\n    api: string;\n    apiKey?: string;\n    headers?: Record<string, string>;\n}',
  },
  {
    name: 'ModelDiscoveryInput',
    declaration: 'export interface ModelDiscoveryInput {\n    configId: string;\n    baseURL: string;\n    api: string;\n    apiKey?: string;\n    headers?: Record<string, string>;\n}',
  },
  {
    name: 'ModelDiscoveryResult',
    declaration: 'export interface ModelDiscoveryResult {\n    id: string;\n    name?: string;\n    contextWindow?: number;\n    maxTokens?: number;\n    inputModalities?: readonly (\'text\' | \'image\')[];\n    reasoningEfforts?: Record<string, string | null>;\n    reasoningEffort?: string;\n}',
  },
  {
    name: 'PersonaProfile',
    declaration: 'export interface PersonaProfile {\n    assistant_name: string;\n    assistant_avatar: string;\n    assistant_square: string;\n    assistant_cover: string;\n    opening: string;\n    show_opening: boolean;\n    user_name: string;\n    user_avatar: string;\n    user_square: string;\n    user_portrait: string;\n}',
  },
  {
    name: 'ProductRecordChange',
    declaration: 'export type ProductRecordChange = {\n    kind: \'snapshot\';\n} | {\n    kind: \'records\';\n    domain: \'characters\' | \'persona\' | \'creatorProjects\';\n    ids?: string[];\n};',
  },
  {
    name: 'RegexRule',
    declaration: 'export interface RegexRule {\n    id: string;\n    name: string;\n    pattern: string;\n    replacement: string;\n    targets: RegexRuleTarget[];\n    enabled: boolean;\n    displayOnly: boolean;\n    promptOnly: boolean;\n    runOnEdit: boolean;\n    order: number;\n    trimStrings?: string[];\n    minDepth?: number | null;\n    maxDepth?: number | null;\n    substituteRegex?: 0 | 1 | 2;\n}',
  },
  {
    name: 'RegexRuleCollection',
    declaration: 'export interface RegexRuleCollection {\n    characterId: string;\n    agentPresetId: string;\n    agentPresetName: string;\n    agentPresetRegexRevision: string;\n    globalRules: RegexRule[];\n    agentPresetRules: RegexRule[];\n    characterRules: RegexRule[];\n    versions: RegexRuleVersion[];\n    activeVersionId: string;\n    revision: number;\n}',
  },
  {
    name: 'RegexRuleImportDocument',
    declaration: 'export interface RegexRuleImportDocument {\n    displayName: string;\n    json: string;\n}',
  },
  {
    name: 'RegexRuleImportResult',
    declaration: 'export interface RegexRuleImportResult {\n    collection: RegexRuleCollection;\n    importedFileCount: number;\n    importedRuleCount: number;\n    failedFileNames: string[];\n}',
  },
  {
    name: 'RegexRuleScope',
    declaration: 'export type RegexRuleScope = \'Global\' | \'AgentPreset\' | \'Character\';',
  },
  {
    name: 'RegexRuleTarget',
    declaration: 'export type RegexRuleTarget = \'UserInput\' | \'AiOutput\' | \'SlashCommand\' | \'SettingContent\' | \'Reasoning\';',
  },
  {
    name: 'RegexRuleTestResult',
    declaration: 'export interface RegexRuleTestResult {\n    output: string;\n    validationMessage: string | null;\n}',
  },
  {
    name: 'RegexRuleVersion',
    declaration: 'export interface RegexRuleVersion {\n    id: string;\n    name: string;\n    globalEnabledIds: string[];\n    agentPresetEnabledIds: string[];\n    characterEnabledIds: string[];\n}',
  },
  {
    name: 'RoleplayRequestContextItem',
    declaration: 'export interface RoleplayRequestContextItem {\n    order: number;\n    messageId: string;\n    role: \'system\' | \'user\' | \'assistant\';\n    kind: \'system\' | \'prompt\' | \'history\' | \'user\' | \'assistant\' | \'tool\' | \'context\';\n    title: string;\n    source: string;\n    anchor: string;\n    content: string;\n}',
  },
  {
    name: 'SettingLibrary',
    declaration: 'export interface SettingLibrary {\n    characterId: string;\n    name: string;\n    entries: SettingLibraryEntry[];\n    groups: SettingLibraryGroup[];\n    promptPositions: SettingLibraryPromptPosition[];\n    activeVersionId: string;\n    versions: SettingLibraryVersion[];\n    listAllExpanded: boolean;\n    expandedGroupIds: string[];\n}',
  },
  {
    name: 'SettingLibraryConversation',
    declaration: 'export interface SettingLibraryConversation {\n    sessionId: string;\n    title: string;\n    characterName: string;\n    characterAvatar: string;\n    summary: string;\n    updatedAt: string;\n    library: SettingLibrary;\n}',
  },
  {
    name: 'SettingLibraryEntry',
    declaration: 'export interface SettingLibraryEntry {\n    id: string;\n    title: string;\n    iconId: string;\n    kind: \'normal\' | \'opening\' | \'history_compaction\' | \'hidden_tool_timeline\';\n    groupId: string;\n    content: string;\n    openingMessages: SettingLibraryOpeningMessage[];\n    defaultOpeningMessageId: string;\n    agentSelectionHint: string;\n    agentReadStrategy: \'required\' | \'keyword\' | \'normal\';\n    dynamicMode: \'standard\' | \'ejs_reference\';\n    contentMode: \'plain_text\' | \'ejs\';\n    keywords: string[];\n    keywordScanDepth: number;\n    conditionKeywords: string[];\n    keywordCondition: \'none\' | \'any\' | \'all\' | \'not_any\';\n    keywordUseRegex: boolean;\n    keywordIgnoreCase: boolean;\n    keywordWholeWord: boolean;\n    keywordRecursionDepth: number;\n    triggerMode: \'always\' | \'agent_tool\' | null;\n    enabled: boolean;\n    position: SettingLibraryPosition | null;\n    promptPositionId: string;\n    insertRole: \'system\' | \'user\' | \'assistant\';\n    order: number;\n    viewOrder: number;\n    groupViewOrder: number;\n    treeViewOrder: number;\n    createdAt: string;\n    updatedAt: string;\n}',
  },
  {
    name: 'SettingLibraryGroup',
    declaration: 'export interface SettingLibraryGroup {\n    id: string;\n    name: string;\n    parentId: string;\n    order: number;\n    treeViewOrder: number;\n    createdAt: string;\n    updatedAt: string;\n}',
  },
  {
    name: 'SettingLibraryOpeningMessage',
    declaration: 'export interface SettingLibraryOpeningMessage {\n    id: string;\n    title: string;\n    content: string;\n    variableVersionId?: string;\n    initialVariableStateJson: string;\n}',
  },
  {
    name: 'SettingLibraryPosition',
    declaration: 'export type SettingLibraryPosition = \'instructions\' | \'insert_point_1\' | \'insert_point_2\' | \'insert_point_3\' | \'insert_point_4\' | \'insert_point_5\';',
  },
  {
    name: 'SettingLibraryPromptPosition',
    declaration: 'export interface SettingLibraryPromptPosition {\n    id: string;\n    name: string;\n    anchor: SettingLibraryPosition;\n    side: \'before_setting_position\' | \'after_setting_position\';\n    order: number;\n    createdAt: string;\n    updatedAt: string;\n}',
  },
  {
    name: 'SettingLibraryVersion',
    declaration: 'export interface SettingLibraryVersion {\n    id: string;\n    name: string;\n    entries: SettingLibraryEntry[];\n    groups: SettingLibraryGroup[];\n    promptPositions: SettingLibraryPromptPosition[];\n    listAllExpanded: boolean;\n    expandedGroupIds: string[];\n    createdAt: string;\n    updatedAt: string;\n}',
  },
  {
    name: 'TavilyConnection',
    declaration: 'export interface TavilyConnection {\n    ok: true;\n    plan: string;\n    used: number;\n    limit: number;\n}',
  },
  {
    name: 'VariableConfig',
    declaration: 'export interface VariableConfig {\n    characterId: string;\n    name: string;\n    initialStateJson: string;\n    schemaCode: string;\n    objects: VariableObjectConfig[];\n    variables: VariableItemConfig[];\n    expandedObjectIds: string[];\n    activeVersionId: string;\n    versions: VariableConfigVersion[];\n}',
  },
  {
    name: 'VariableConfigVersion',
    declaration: 'export interface VariableConfigVersion {\n    id: string;\n    name: string;\n    initialStateJson: string;\n    schemaCode: string;\n    objects: VariableObjectConfig[];\n    variables: VariableItemConfig[];\n    expandedObjectIds: string[];\n    createdAt: string;\n    updatedAt: string;\n}',
  },
  {
    name: 'VariableFloorSnapshot',
    declaration: 'export interface VariableFloorSnapshot {\n    id: string;\n    label: string;\n    messagePreview: string;\n    createdAt: string;\n    state: VariableStateDocument;\n    changedValueCount: number;\n    changedPaths: string[];\n}',
  },
  {
    name: 'VariableItemConfig',
    declaration: 'export interface VariableItemConfig {\n    id: string;\n    title: string;\n    objectId: string;\n    enabled: boolean;\n    type: \'\' | \'number\' | \'string\' | \'boolean\' | \'array\';\n    defaultValue: string;\n    description: string;\n    updateRule: string;\n    readMode: \'required\' | \'on_demand\';\n    order: number;\n    treeViewOrder: number;\n    createdAt: string;\n    updatedAt: string;\n}',
  },
  {
    name: 'VariableJsonValue',
    declaration: 'export type VariableJsonValue = null | boolean | number | string | VariableJsonValue[] | {\n    [key: string]: VariableJsonValue;\n};',
  },
  {
    name: 'VariableObjectConfig',
    declaration: 'export interface VariableObjectConfig {\n    id: string;\n    name: string;\n    parentId: string;\n    enabled: boolean;\n    description: string;\n    updateRule: string;\n    dynamicKey: boolean;\n    order: number;\n    treeViewOrder: number;\n    createdAt: string;\n    updatedAt: string;\n}',
  },
  {
    name: 'VariableStateDocument',
    declaration: 'export interface VariableStateDocument {\n    rawJson: string;\n    root: {\n        [key: string]: VariableJsonValue;\n    } | null;\n    errorMessage: string;\n    topLevelCount: number;\n    valueCount: number;\n}',
  },
  {
    name: 'VariableViewerTimeline',
    declaration: 'export interface VariableViewerTimeline {\n    current: VariableStateDocument;\n    floors: VariableFloorSnapshot[];\n}',
  },
  {
    name: 'WebSearchMode',
    declaration: 'export type WebSearchMode = \'provider_native\' | \'tavily\';',
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
