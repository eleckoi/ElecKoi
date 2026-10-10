<!-- 由 pnpm generate:plugin-docs 使用锁定的 DSH 官方生成器生成，请勿手工修改。 -->

# Host 完整服务参考

DSH 基准：`0.2.0-rc.2`，提交 `c1b47e41fcd54d20a0f061df28683bfc29ee24e5`。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

由公开源码和 JSDoc 生成。用 `pnpm generate:plugin-docs` 更新，用 `pnpm check:plugin-docs` 核对。Cordis 生命周期和依赖用法见 [服务接口](services.md)。

<a id="ctxeleckoiagentpresetsapi--eleckoiagentpresetsapi"></a>

### `ctx.eleckoiAgentPresetsApi` — `ElecKoiAgentPresetsApi`

管理 Agent 预设、分组和预设文件，通过官方 Typert Remote 公开跨端调用。

```ts cordis-catalog
/**
 * 读取预设目录和当前预设。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote catalog(): AgentPresetCatalog

/**
 * 读取完整保存数据。
 * @param presetId - 预设编号。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote read(presetId: string): AgentPreset

/**
 * 保存完整数据并通知相关页面刷新。
 * @param preset - 完整预设数据。
 * @param expectedRegexRules - 要求仍有效的正则配置。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote save(preset: AgentPreset, expectedRegexRules: RegexRule[]): AgentPreset

/**
 * 创建预设并返回完整预设数据。
 * @param name - 保存的名称或附件文件名。
 * @param libraryGroupId - 预设分组编号。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote create(name: string, libraryGroupId: string): AgentPreset

/**
 * 导入文件并保存完整数据。
 * @param source - 支持的导入格式。
 * @param document - 待导入文件内容。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote import(source: AgentPresetImportSource, document: AgentPresetImportDocument): AgentPresetImportResult

/**
 * 返回导出文件名、格式和文件内容。
 * @param presetId - 预设编号。
 * @param format - 支持的导出格式。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote export(presetId: string, format: AgentPresetExportFormat): AgentPresetExportResult

/**
 * 设置当前使用的 Agent 预设。
 * @param presetId - 预设编号。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote setActive(presetId: string): AgentPresetCatalog

/**
 * 创建预设分组。
 * @param name - 保存的名称或附件文件名。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote createGroup(name: string): AgentPresetCatalog

/**
 * 重命名预设分组。
 * @param groupId - 预设分组编号。
 * @param name - 保存的名称或附件文件名。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote renameGroup(groupId: string, name: string): AgentPresetCatalog

/**
 * 设置预设所属分组。
 * @param presetId - 预设编号。
 * @param groupId - 预设分组编号。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote assignGroup(presetId: string, groupId: string): AgentPresetCatalog

/**
 * 删除预设分组。
 * @param groupId - 预设分组编号。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote deleteGroup(groupId: string): AgentPresetCatalog

/**
 * 删除指定预设并返回更新后的预设目录。
 * @param presetId - 预设编号。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote delete(presetId: string): AgentPresetCatalog
```

Types: [AgentPreset](types-host.md#agentpreset) · [AgentPresetCatalog](types-host.md#agentpresetcatalog) · [AgentPresetExportFormat](types-host.md#agentpresetexportformat) · [AgentPresetExportResult](types-host.md#agentpresetexportresult) · [AgentPresetImportDocument](types-host.md#agentpresetimportdocument) · [AgentPresetImportResult](types-host.md#agentpresetimportresult) · [AgentPresetImportSource](types-host.md#agentpresetimportsource) · [RegexRule](types-host.md#regexrule)

Source: [`packages/dsh-product-api/src/index.ts`](../../packages/dsh-product-api/src/index.ts)

<a id="ctxeleckoiauthorpluginsapi--eleckoiauthorpluginsapi"></a>

### `ctx.eleckoiAuthorPluginsApi` — `ElecKoiAuthorPluginsApi`

作者插件的 Host 兼容入口，提供能力发现、命令调用和实时变更订阅。 通过 `ctx.eleckoiAuthorPluginsApi` 使用，并在 `eleckoiAuthorPlugins` Remote 命名空间公开。

```ts cordis-catalog
/**
 * 读取当前 Host 支持的作者插件命令和同源资源入口。
 * @returns 命令名称列表、协议版本（当前为 1）及作者插件资源的基础 URL。
 */
@Remote capabilities(): AuthorCapabilities

/**
 * 按命令名称调用作者插件、聊天生成、Web 回调、扩展或媒体操作。
 * @param command 要执行的命令；`method` 为能力列表中的命令名称，`params` 为该命令的 JSON 参数对象。
 * @returns 对应操作完成后的 JSON 值；回调接入和移除返回 null，回调应答返回是否匹配到待处理请求。
 */
@Remote async invoke(command: AuthorCommand): Promise<AuthorValue>

/**
 * 订阅作者插件、生成过程和 Web 回调发布的实时变更。
 * @param signal 订阅的取消信号；触发取消后结束此订阅并移除订阅者。
 * @returns 异步变更流；活动订阅先收到 payload 为 null 的 `plugins.snapshot` 重载标记，随后收到实时事件，直到取消订阅或 Host 关闭。
 */
@Remote({ mode: 'stream' }) changes(signal: AbortSignal): AsyncIterable<AuthorChange>
```

Types: [AuthorCapabilities](types-host.md#authorcapabilities) · [AuthorChange](types-host.md#authorchange) · [AuthorCommand](types-host.md#authorcommand) · [AuthorValue](types-host.md#authorvalue)

Source: [`packages/dsh-compatibility-host/src/index.ts`](../../packages/dsh-compatibility-host/src/index.ts)

<a id="ctxeleckoicharacterconfigurationapi--eleckoicharacterconfigurationapi"></a>

### `ctx.eleckoiCharacterConfigurationApi` — `ElecKoiCharacterConfigurationApi`

管理完整设定库、变量定义和正则配置，通过官方 Typert Remote 公开跨端调用。

```ts cordis-catalog
/**
 * 订阅变更通知；连接后首先收到刷新标记，取消信号结束此异步流。
 * @param signal - 取消调用或结束订阅流的信号。
 * @returns 按发生顺序返回变更通知的异步流。
 */
@Remote({ mode: 'stream' }) changes(signal: AbortSignal): AsyncIterable<CharacterConfigurationChange>

/**
 * 读取完整角色设定库，包含必读、选读、触发方式和插入位置。
 * @param characterId - 角色编号。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote readSettingLibrary(characterId: string): SettingLibrary

/**
 * 保存完整角色设定库。
 * @param characterId - 角色编号。
 * @param library - 完整设定库，包含触发条件和插入位置。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote saveSettingLibrary(characterId: string, library: SettingLibrary): SettingLibrary

/**
 * 保存已展开设定分组的编号。
 * @param characterId - 角色编号。
 * @param expandedGroupIds - 已展开分组编号。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote saveSettingLibraryViewState(characterId: string, expandedGroupIds: string[]): string[]

/**
 * 读取角色各聊天的完整设定库。
 * @param characterId - 角色编号。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote readConversationSettingLibraries(characterId: string): SettingLibraryConversation[]

/**
 * 保存指定聊天的完整设定库。
 * @param characterId - 角色编号。
 * @param conversationId - ElecKoi 聊天编号。
 * @param library - 完整设定库，包含触发条件和插入位置。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote saveConversationSettingLibrary( characterId: string, conversationId: string, library: SettingLibrary ): SettingLibrary

/**
 * 将聊天设定库恢复到角色设定。
 * @param characterId - 角色编号。
 * @param conversationId - ElecKoi 聊天编号。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote resetConversationSettingLibrary(characterId: string, conversationId: string): void

/**
 * 保存聊天设定库的命名版本。
 * @param characterId - 角色编号。
 * @param conversationId - ElecKoi 聊天编号。
 * @param name - 保存的名称或附件文件名。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote saveConversationSettingLibraryVersion( characterId: string, conversationId: string, name: string ): SettingLibrary

/**
 * 读取变量定义和初始化配置。
 * @param characterId - 角色编号。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote readVariableConfig(characterId: string): VariableConfig

/**
 * 保存变量定义和初始化配置。
 * @param characterId - 角色编号。
 * @param config - 完整配置，字段见参数类型。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote saveVariableConfig(characterId: string, config: VariableConfig): VariableConfig

/**
 * 保存已展开变量对象的编号。
 * @param characterId - 角色编号。
 * @param expandedObjectIds - 已展开变量对象编号。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote saveVariableConfigViewState(characterId: string, expandedObjectIds: string[]): string[]

/**
 * 读取完整正则配置及其 revision。
 * @param characterId - 角色编号。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote readRegexRules(characterId: string): RegexRuleCollection

/**
 * 校验 revision 后保存完整正则配置。
 * @param characterId - 角色编号。
 * @param collection - 完整正则配置。
 * @param expectedRevision - 要求仍有效的配置版本；不匹配时拒绝保存。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote saveRegexRules( characterId: string, collection: RegexRuleCollection, expectedRevision: number ): RegexRuleCollection

/**
 * 校验 revision 后导入正则文件。
 * @param characterId - 角色编号。
 * @param fallbackScope - 导入文件未指定归属时使用的范围。
 * @param documents - 待导入文件列表。
 * @param expectedRevision - 要求仍有效的配置版本；不匹配时拒绝保存。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote importRegexRules( characterId: string, fallbackScope: RegexRuleScope, documents: RegexRuleImportDocument[], expectedRevision: number ): RegexRuleImportResult

/**
 * 导出指定规则的 JSON 文本。
 * @param characterId - 角色编号。
 * @param ruleIds - 待导出规则编号。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote exportRegexRules(characterId: string, ruleIds: string[]): { fileName: string; json: string }

/**
 * 测试规则对文本的作用，不保存规则。
 * @param text - 本次输入或待测试文本。
 * @param rule - 待测试规则。
 * @param target - 规则作用的内容类别。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote testRegexRule(text: string, rule: RegexRule, target: RegexRuleTarget): RegexRuleTestResult
```

Types: [CharacterConfigurationChange](types-host.md#characterconfigurationchange) · [RegexRule](types-host.md#regexrule) · [RegexRuleCollection](types-host.md#regexrulecollection) · [RegexRuleImportDocument](types-host.md#regexruleimportdocument) · [RegexRuleImportResult](types-host.md#regexruleimportresult) · [RegexRuleScope](types-host.md#regexrulescope) · [RegexRuleTarget](types-host.md#regexruletarget) · [RegexRuleTestResult](types-host.md#regexruletestresult) · [SettingLibrary](types-host.md#settinglibrary) · [SettingLibraryConversation](types-host.md#settinglibraryconversation) · [VariableConfig](types-host.md#variableconfig)

Source: [`packages/dsh-product-api/src/index.ts`](../../packages/dsh-product-api/src/index.ts)

<a id="ctxeleckoicharactersapi--eleckoicharactersapi"></a>

### `ctx.eleckoiCharactersApi` — `ElecKoiCharactersApi`

管理角色目录、分组和角色卡导入导出，通过官方 Typert Remote 公开跨端调用。

```ts cordis-catalog
/**
 * 订阅变更通知；连接后首先收到刷新标记，取消信号结束此异步流。
 * @param signal - 取消调用或结束订阅流的信号。
 * @returns 按发生顺序返回变更通知的异步流。
 */
@Remote({ mode: 'stream' }) changes(signal: AbortSignal): AsyncIterable<ProductRecordChange>

/**
 * 读取目录。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote list(): CharacterCollection

/**
 * 创建项目并返回更新后的数据。
 * @param character - 完整角色数据。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote create(character: CharacterRecord): CharacterCollection

/**
 * 更新完整数据并通知相关页面刷新。
 * @param character - 完整角色数据。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote update(character: CharacterRecord): CharacterCollection

/**
 * 保存当前选择。
 * @param characterId - 角色编号。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote select(characterId: string): CharacterCollection

/**
 * 保存角色分组及角色所属分组。
 * @param groups - 分组名称列表。
 * @param assignments - 角色所属分组列表。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote saveGroups(groups: string[], assignments: CharacterGroupAssignment[]): CharacterCollection

/**
 * 删除指定角色及其关联聊天和官方 Session。
 * @param characterIds - 待删除角色编号列表。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote async delete(characterIds: string[]): Promise<CharacterCollection>

/**
 * 返回导出文件名、格式和文件内容。
 * @param characterId - 角色编号。
 * @param format - 支持的导出格式。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote export(characterId: string, format: CharacterExportFormat): CharacterExportResult

/**
 * 读取角色卡并生成等待确认的预览，不立即保存角色。
 * @param files - 待导入文件的内容。
 * @param source - 支持的导入格式。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote prepareImport(files: CharacterImportFile[], source: CharacterImportSource): CharacterImportPreview

/**
 * 确认导入预览并保存角色。
 * @param token - 导入预览编号。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote commitImport(token: string): CharacterImportResult

/**
 * 取消导入预览并清理临时数据。
 * @param token - 导入预览编号。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote discardImport(token: string): void
```

Types: [CharacterCollection](types-host.md#charactercollection) · [CharacterExportFormat](types-host.md#characterexportformat) · [CharacterExportResult](types-host.md#characterexportresult) · [CharacterGroupAssignment](types-host.md#charactergroupassignment) · [CharacterImportFile](types-host.md#characterimportfile) · [CharacterImportPreview](types-host.md#characterimportpreview) · [CharacterImportResult](types-host.md#characterimportresult) · [CharacterImportSource](types-host.md#characterimportsource) · [CharacterRecord](types-host.md#characterrecord) · [ProductRecordChange](types-host.md#productrecordchange)

Source: [`packages/dsh-product-api/src/index.ts`](../../packages/dsh-product-api/src/index.ts)

<a id="ctxeleckoicompatibilityapi--eleckoicompatibilityapi"></a>

### `ctx.eleckoiCompatibilityApi` — `ElecKoiCompatibilityApi`

将酒馆兼容命令转交已有产品服务，并向客户端发布兼容数据变更。

```ts cordis-catalog
/**
 * 读取当前宿主实际注册的兼容命令及协议版本。
 * @returns 去重后的方法名称列表与兼容协议版本。
 */
@Remote capabilities(): { methods: string[]; version: number }

/**
 * 调用兼容命令，复用角色、消息、预设、世界书及其他产品服务。
 * @param command - 包含 method 名称与 params 参数的兼容命令。
 * @returns 命令的可序列化结果；未知命令或执行失败会抛出错误。
 */
@Remote async invoke(command: CompatibilityCommand): Promise<CompatibilityValue>

/**
 * 订阅兼容数据变更，连接时先返回快照标记以便客户端重新读取状态。
 * @param signal - 取消订阅的信号。
 * @returns 当前连接期间的变更流，不回放连接之前的历史事件。
 */
@Remote({ mode: 'stream' }) changes(signal: AbortSignal): AsyncIterable<CompatibilityChange>
```

Types: [CompatibilityChange](types-host.md#compatibilitychange) · [CompatibilityCommand](types-host.md#compatibilitycommand) · [CompatibilityValue](types-host.md#compatibilityvalue)

Source: [`packages/dsh-product-api/src/index.ts`](../../packages/dsh-product-api/src/index.ts)

<a id="ctxeleckoiconversationlifecycle--eleckoiconversationlifecycle"></a>

### `ctx.eleckoiConversationLifecycle` — `ElecKoiConversationLifecycle`

按 Cordis 插件生命周期管理聊天参与者，不管理 Agent 分工或模型路由。

```ts cordis-catalog
/**
 * 注册生成准备、保存收尾和回退处理，停用插件时自动取消并等待正在执行的回调。
 * @param participant - 插件编号和需要参与的处理函数。
 * @returns 注销当前注册项的函数；插件卸载也会自动注销。
 */
register(participant: ConversationLifecycleParticipant): () => void
```

Types: [ConversationLifecycleParticipant](types-host.md#conversationlifecycleparticipant)

Source: [`packages/dsh-product-api/src/conversationLifecycle.ts`](../../packages/dsh-product-api/src/conversationLifecycle.ts)

<a id="ctxeleckoiconversationmodelsapi--eleckoiconversationmodelsapi"></a>

### `ctx.eleckoiConversationModelsApi` — `ElecKoiConversationModelsApi`

管理所有聊天下一轮共同使用的模型，通过官方 Typert Remote 公开跨端调用。

```ts cordis-catalog
/**
 * 读取下一轮使用的全局模型。
 * @param conversationId - ElecKoi 聊天编号。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote async current(conversationId: string): Promise<ConversationModelSelection>

/**
 * 保存当前选择。
 * @param conversationId - ElecKoi 聊天编号。
 * @param selection - 模型提供商、模型编号和可选推理档位。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote async select(conversationId: string, selection: ConversationModelSelection): Promise<ConversationModelSelection>
```

Types: [ConversationModelSelection](types-host.md#conversationmodelselection)

Source: [`packages/dsh-product-api/src/index.ts`](../../packages/dsh-product-api/src/index.ts)

<a id="ctxeleckoiconversationsapi--eleckoiconversationsapi"></a>

### `ctx.eleckoiConversationsApi` — `ElecKoiConversationsApi`

管理聊天目录、产品资料和官方 Session 消息修改，通过官方 Typert Remote 公开跨端调用。

```ts cordis-catalog
/**
 * 订阅变更通知；连接后首先收到刷新标记，取消信号结束此异步流。
 * @param signal - 取消调用或结束订阅流的信号。
 * @returns 按发生顺序返回变更通知的异步流。
 */
@Remote({ mode: 'stream' }) changes(signal: AbortSignal): AsyncIterable<ConversationChange>

/**
 * 读取目录。
 * @param signal - 取消调用或结束订阅流的信号。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote async list(signal: AbortSignal): Promise<ConversationSummary[]>

/**
 * 订阅当前运行期间实际请求的轻量目录；关闭 Host 后不恢复。
 * @param conversationId - ElecKoi 聊天编号。
 * @param signal - 取消订阅的信号。
 * @returns 仅包含轮次、请求编号和模型的目录流。
 */
@Remote({ mode: 'stream' }) requestPreviews(conversationId: string, signal: AbortSignal): AsyncIterable<ConversationRequestPreviewSummary[]>

/**
 * 读取当前运行期间捕获的指定请求，不读取 Session 日志或当前设定重算。
 * @param conversationId - ElecKoi 聊天编号。
 * @param requestId - 当前运行期间请求目录中的正式标识。
 * @param signal - 取消本次读取的信号。
 * @returns 按实际发送顺序排列的可读输入；关闭后或不存在的请求抛出原因。
 */
@Remote requestPreview(conversationId: string, requestId: string, signal: AbortSignal): ConversationRequestPreview

/**
 * 读取聊天关联资料和消息元数据；消息正文由官方 Session 读取。
 * @param conversationId - ElecKoi 聊天编号。
 * @param beforeSequence - 分页消息边界，读取该事件序号之前的消息。
 * @param limit - 分页最多读取的消息数量。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote details(conversationId: string, beforeSequence?: number, limit?: number): ConversationDetailsMetadata

/**
 * 根据正则和变量计算消息的显示正文。
 * @param conversationId - ElecKoi 聊天编号。
 * @param messages - 需要计算显示正文的消息列表。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote projectDisplay( conversationId: string, messages: ConversationMessageDisplayInput[] ): ConversationMessageDisplayResult[]

/**
 * 读取各聊天楼层的变量状态。
 * @param conversationId - ElecKoi 聊天编号。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote async variableTimeline(conversationId: string): Promise<VariableViewerTimeline>

/**
 * 读取当前聊天的有效设定库、变量配置和变量状态。
 * @param conversationId - ElecKoi 聊天编号。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote authorState(conversationId: string): AuthorConversationState

/**
 * 替换聊天当前变量；生成期间拒绝修改。
 * @param conversationId - ElecKoi 聊天编号。
 * @param stateJson - 完整变量对象的 JSON 文本。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote replaceVariableState(conversationId: string, stateJson: string): string

/**
 * 导出聊天资料和官方 Session 日志的归档 JSON。
 * @param conversationId - ElecKoi 聊天编号。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote async exportArchive(conversationId: string): Promise<string>

/**
 * 导入归档，创建新的聊天和官方 Session。
 * @param characterId - 角色编号。
 * @param json - 完整聊天归档 JSON 文本。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote async importArchive(characterId: string, json: string): Promise<string>

/**
 * 在文件管理器中显示官方附件。
 * @param conversationId - ElecKoi 聊天编号。
 * @param attachmentId - 官方附件编号。
 * @param name - 保存的名称或附件文件名。
 * @param signal - 取消调用或结束订阅流的信号。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote async revealFile( conversationId: string, attachmentId: string, name: string, signal: AbortSignal ): Promise<void>

/**
 * 创建项目并返回更新后的数据。
 * @param input - 本次操作的输入，字段见参数类型。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote async create(input: ConversationCreateInput): Promise<ConversationDetailsMetadata>

/**
 * 删除指定项目及其关联数据。
 * @param conversationId - ElecKoi 聊天编号。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote async delete(conversationId: string): Promise<void>

/**
 * 重命名聊天，同时保存官方 Session 与产品目录中的标题。
 * @param conversationId - ElecKoi 聊天编号。
 * @param title - 新的聊天标题。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote async rename(conversationId: string, title: string): Promise<ConversationDetailsMetadata>

/**
 * 从指定官方 Session 事件创建聊天分支，复制保留的产品轮次和历史运行状态。
 * @param conversationId - 来源 ElecKoi 聊天编号。
 * @param atSeq - 分支边界的官方事件序号；省略时创建同配置和开场白的空聊天。
 * @param retainedTurnIds - 分支中需要保留的产品轮次编号；开场白轮次自动保留。
 * @param title - 新聊天的标题。
 * @returns 新建分支的 ElecKoi 聊天编号；创建失败会清理分支并抛出错误。
 */
@Remote async fork(conversationId: string, atSeq: number | undefined, retainedTurnIds: string[], title: string): Promise<string>

/**
 * 准备本次输入需要的产品配置和官方 Session，不直接生成回复。
 * @param conversationId - ElecKoi 聊天编号。
 * @param text - 本次输入或待测试文本。
 * @param signal - 取消准备过程的信号。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote async preparePrompt(conversationId: string, text: string, signal: AbortSignal): Promise<{ runtimeSessionId: string; operationId: string }>

/**
 * 等待当前进程本次保存及插件收尾，失败抛出错误；不查询历史或重启前结果。
 * @param conversationId - ElecKoi 聊天编号。
 * @param operationId - 生成准备时返回的本次操作编号。
 * @returns 本轮收尾完成；此方法不启动模型，也不重复执行插件。
 */
@Remote async waitForGeneration(conversationId: string, operationId: string): Promise<void>

/**
 * 保存当前群聊成员的回复，并按群聊策略依次执行余下成员的 Agent 回合。
 * @param conversationId - ElecKoi 聊天编号。
 * @param cancelled - 当前成员是否已取消；为 true 时直接结束群聊轮次。
 * @param signal - 取消后续成员生成的信号。
 * @returns 是否发生取消；无活跃群聊时返回 cancelled 为 false，生成失败抛出错误。
 */
@Remote async completeGroupRound(conversationId: string, cancelled: boolean, signal: AbortSignal): Promise<{ cancelled: boolean }>

/**
 * 修改同一官方 Session 中的用户或模型消息，刷新投影并发布消息变更。
 * @param conversationId - ElecKoi 聊天编号。
 * @param eventSeq - 官方 Session 中待修改消息的事件序号。
 * @param role - 消息角色，必须与指定事件中的消息一致。
 * @param content - 保存后替换原正文的完整文本。
 * @returns 修改后的聊天详情与元数据；消息不存在或角色不一致时抛出错误。
 */
@Remote async editMessage( conversationId: string, eventSeq: number, role: 'user' | 'assistant', content: string ): Promise<ConversationDetailsMetadata>

/**
 * 在同一 Session 中从指定消息回退，恢复相应变量。
 * @param conversationId - ElecKoi 聊天编号。
 * @param eventSeq - 官方 Session 中消息的事件序号。
 * @param role - 消息角色。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote async deleteMessagesFrom( conversationId: string, eventSeq: number, role: 'user' | 'assistant' ): Promise<{ details: ConversationDetailsMetadata deletedMessageCount: number remainingMessageCount: number }>

/**
 * 准备指定用户输入的重新生成，返回待启动请求。
 * @param conversationId - ElecKoi 聊天编号。
 * @param eventSeq - 官方 Session 中消息的事件序号。
 * @param requestId - 本次生成的唯一请求编号。
 * @param replacementMessage - 可替换的用户输入；省略时保留原输入。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote async regenerateMessage( conversationId: string, eventSeq: number, requestId: string, replacementMessage?: string ): Promise<{ runtimeSessionId: string; prepared: true; operationId: string }>

/**
 * 从已保留的用户事件启动重新生成；取消时保留用户输入，不启动新的回复。
 * @param conversationId - ElecKoi 聊天编号。
 * @param requestId - 本次生成的唯一请求编号。
 * @param cancelled - 已准备的请求是否被取消。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote async startRegeneration(conversationId: string, requestId: string, cancelled: boolean): Promise<{ accepted: boolean; turn?: number }>

/**
 * 切换开场白。
 * @param conversationId - ElecKoi 聊天编号。
 * @param openingId - 开场白编号。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote async selectOpening(conversationId: string, openingId: string): Promise<ConversationDetailsMetadata>

/**
 * 修改开场白文本。
 * @param conversationId - ElecKoi 聊天编号。
 * @param content - 要保存的完整文本。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote async updateOpening(conversationId: string, content: string): Promise<ConversationDetailsMetadata>
```

Types: [AuthorConversationState](types-host.md#authorconversationstate) · [ConversationChange](types-host.md#conversationchange) · [ConversationCreateInput](types-host.md#conversationcreateinput) · [ConversationDetailsMetadata](types-host.md#conversationdetailsmetadata) · [ConversationMessageDisplayInput](types-host.md#conversationmessagedisplayinput) · [ConversationMessageDisplayResult](types-host.md#conversationmessagedisplayresult) · [ConversationRequestPreview](types-host.md#conversationrequestpreview) · [ConversationRequestPreviewSummary](types-host.md#conversationrequestpreviewsummary) · [ConversationSummary](types-host.md#conversationsummary) · [VariableViewerTimeline](types-host.md#variableviewertimeline)

Source: [`packages/dsh-product-api/src/index.ts`](../../packages/dsh-product-api/src/index.ts)

<a id="ctxeleckoicreatorstudioapi--eleckoicreatorstudioapi"></a>

### `ctx.eleckoiCreatorStudioApi` — `ElecKoiCreatorStudioApi`

管理创作项目目录，通过官方 Typert Remote 公开跨端调用。

```ts cordis-catalog
/**
 * 订阅变更通知；连接后首先收到刷新标记，取消信号结束此异步流。
 * @param signal - 取消调用或结束订阅流的信号。
 * @returns 按发生顺序返回变更通知的异步流。
 */
@Remote({ mode: 'stream' }) changes(signal: AbortSignal): AsyncIterable<ProductRecordChange>

/**
 * 读取目录。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote list(): CreatorProjectCollection

/**
 * 创建项目并返回更新后的数据。
 * @param input - 本次操作的输入，字段见参数类型。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote create(input: CreateCreatorProjectInput): CreatorProjectCollection

/**
 * 删除指定项目及其关联数据。
 * @param projectId - 创作项目编号。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote delete(projectId: string): CreatorProjectCollection
```

Types: [CreateCreatorProjectInput](types-host.md#createcreatorprojectinput) · [CreatorProjectCollection](types-host.md#creatorprojectcollection) · [ProductRecordChange](types-host.md#productrecordchange)

Source: [`packages/dsh-product-api/src/index.ts`](../../packages/dsh-product-api/src/index.ts)

<a id="ctxeleckoidisplaypreferencesapi--eleckoidisplaypreferencesapi"></a>

### `ctx.eleckoiDisplayPreferencesApi` — `ElecKoiDisplayPreferencesApi`

管理界面和聊天显示偏好，通过官方 Typert Remote 公开跨端调用。

```ts cordis-catalog
/**
 * 读取完整保存数据。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote read(): DisplayPreferencesSnapshot

/**
 * 保存界面偏好并处理需写入媒体库的壁纸。
 * @param ui - 完整界面偏好。
 * @param expectedRevision - 要求仍有效的配置版本；不匹配时拒绝保存。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote async updateUi( ui: Record<string, DisplayPreferenceValue>, expectedRevision?: number ): Promise<DisplayPreferencesSnapshot>

/**
 * 保存聊天显示偏好。
 * @param chatDisplay - 完整聊天显示偏好。
 * @param expectedRevision - 要求仍有效的配置版本；不匹配时拒绝保存。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote async setChatDisplay( chatDisplay: Record<string, DisplayPreferenceValue>, expectedRevision?: number ): Promise<DisplayPreferencesSnapshot>
```

Types: [DisplayPreferenceValue](types-host.md#displaypreferencevalue) · [DisplayPreferencesSnapshot](types-host.md#displaypreferencessnapshot)

Source: [`packages/dsh-product-api/src/index.ts`](../../packages/dsh-product-api/src/index.ts)

<a id="ctxeleckoimodelsapi--eleckoimodelsapi"></a>

### `ctx.eleckoiModelsApi` — `ElecKoiModelsApi`

管理模型目录、连接测试和用户主动查看的密钥，通过官方 Typert Remote 公开跨端调用。

```ts cordis-catalog
/**
 * 按模型配置编号读取密钥，供用户主动查看。
 * @param configId - 模型配置编号。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote revealApiKey(configId: string): Promise<string>

/**
 * 通过官方适配器测试工具调用，不创建聊天。
 * @param input - 本次操作的输入，字段见参数类型。
 * @returns 工具调用成功时返回 supported: true；失败抛出错误。
 */
@Remote testConnection(input: ModelConnectionInput): Promise<{ supported: true }>

/**
 * 读取模型目录，能力来自官方目录或明确配置。
 * @param input - 本次操作的输入，字段见参数类型。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote discoverModels(input: ModelDiscoveryInput): Promise<ModelDiscoveryResult[]>
```

Types: [ModelConnectionInput](types-host.md#modelconnectioninput) · [ModelDiscoveryInput](types-host.md#modeldiscoveryinput) · [ModelDiscoveryResult](types-host.md#modeldiscoveryresult)

Source: [`packages/dsh-product-api/src/index.ts`](../../packages/dsh-product-api/src/index.ts)

<a id="ctxeleckoipersonaapi--eleckoipersonaapi"></a>

### `ctx.eleckoiPersonaApi` — `ElecKoiPersonaApi`

管理用户名称和头像资料，通过官方 Typert Remote 公开跨端调用。

```ts cordis-catalog
/**
 * 订阅变更通知；连接后首先收到刷新标记，取消信号结束此异步流。
 * @param signal - 取消调用或结束订阅流的信号。
 * @returns 按发生顺序返回变更通知的异步流。
 */
@Remote({ mode: 'stream' }) changes(signal: AbortSignal): AsyncIterable<ProductRecordChange>

/**
 * 读取完整保存数据。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote read(): PersonaProfile

/**
 * 保存完整数据并通知相关页面刷新。
 * @param profile - 完整用户资料。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote save(profile: PersonaProfile): PersonaProfile
```

Types: [PersonaProfile](types-host.md#personaprofile) · [ProductRecordChange](types-host.md#productrecordchange)

Source: [`packages/dsh-product-api/src/index.ts`](../../packages/dsh-product-api/src/index.ts)

<a id="ctxeleckoirequestpreviews--requestpreviewstore"></a>

### `ctx.eleckoiRequestPreviews` — `RequestPreviewStore`

Host 运行期请求预览；只共用内存消息，不持久化或恢复历史请求。

```ts cordis-catalog
/**
 * 捕获即将交给 LLM Runtime 的真实请求。
 * @param session - 发送请求的正式 Session。
 * @param options - 完成产品装配的实际模型请求。
 * @param plan - 此次装配使用的设定位置和可读来源。
 * @param execution - 已有输入投影的轮次和实时步骤事件中的执行身份。
 * @returns 仅含身份与编号的请求目录项。
 */
capture(session: Session, options: GenerateOptions, plan: readonly object[], execution: { round: number | null; turn: number; step: number }): RequestPreviewSummary

/**
 * 列出当前运行捕获的请求，目录不包含正文。
 * @param sessionId - 正式 Session ID。
 * @returns 发送顺序中的请求目录项。
 */
list(sessionId: string): RequestPreviewSummary[]

/**
 * 按运行期请求身份临时生成可读上下文；不存在时失败。
 * @param sessionId - 正式 Session ID。
 * @param requestId - 本次运行捕获时分配的请求 ID。
 * @returns 请求身份和按实际顺序排列的上下文条目。
 */
read(sessionId: string, requestId: string): { id: string; items: RoleplayRequestContextItem[] }

/**
 * 订阅请求目录，慢读取者合并通知，取消后释放订阅。
 * @param sessionId - 正式 Session ID。
 * @param signal - 订阅取消生命周期。
 * @returns 初始目录及之后的最新目录。
 */
stream(sessionId: string, signal: AbortSignal): AsyncIterable<RequestPreviewSummary[]>

/**
 * 删除聊天时释放该 Session 的全部运行期请求。
 * @param sessionId - 已删除的正式 Session ID。
 */
forget(sessionId: string): void

/** 释放全部请求并结束订阅；用于 Host 插件卸载。 */
close(): void
```

Types: [RequestPreviewSummary](types-host.md#requestpreviewsummary) · [RoleplayRequestContextItem](types-host.md#roleplayrequestcontextitem)

Source: [`packages/dsh-client-roleplay/src/host/request-preview.d.mts`](../../packages/dsh-client-roleplay/src/host/request-preview.d.mts)

<a id="ctxeleckoisessioneditor--eleckoisessioneditor"></a>

### `ctx.eleckoiSessionEditor` — `ElecKoiSessionEditor`

修改同一个官方 Session 的消息和回退位置，保留 Session 编号。

```ts cordis-catalog
/**
 * 在同一官方 Session 日志中批量更新或插入兼容消息，并刷新消息投影。
 * @param sessionId - 待编辑的官方 Session 编号。
 * @param mutation - updates 按 sessionEventSeq 更新已有消息；inserts 按给定顺序追加消息。
 * @returns 新插入的消息及其实际 id、sessionEventSeq；仅更新已有消息时返回空数组。
 */
mutateTimeline(sessionId: string, mutation: { updates?: CompatibilityTimelineInput[]; inserts?: CompatibilityTimelineInput[] }): Promise<CompatibilityTimelineInput[]>

/**
 * 修改一条消息并刷新官方投影。
 * @param sessionId - 官方 Session 编号。
 * @param eventSeq - 消息事件序号。
 * @param role - 消息角色。
 * @param content - 新的完整消息文本。
 * @returns 消息修改和投影刷新完成。
 */
editMessage(sessionId: string, eventSeq: number, role: 'user' | 'assistant', content: string): Promise<void>

/**
 * 从指定轮次和可选事件位置回退，并刷新官方投影。
 * @param sessionId - 官方 Session 编号。
 * @param fromTurn - 首个需要撤销的轮次。
 * @param fromEventSeq - 可选消息事件边界。
 * @param retainInput - 保留该边界的直接用户事件并闭合其开放轮次。
 * @returns 移除的事件数；无法回退时返回 undefined。
 */
rewind(sessionId: string, fromTurn: number, fromEventSeq?: number, retainInput?: boolean): Promise<number | undefined>
```

Types: [CompatibilityTimelineInput](types-host.md#compatibilitytimelineinput)

Source: [`packages/dsh-product-api/src/sessionEditor.ts`](../../packages/dsh-product-api/src/sessionEditor.ts)

<a id="ctxeleckoisystemapi--eleckoisystemapi"></a>

### `ctx.eleckoiSystemApi` — `ElecKoiSystemApi`

管理受管 Host 的架构和协议状态，通过官方 Typert Remote 公开跨端调用。

```ts cordis-catalog
/**
 * 读取架构和协议版本。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote status(): ElecKoiHostStatus
```

Types: [ElecKoiHostStatus](types-host.md#eleckoihoststatus)

Source: [`packages/dsh-product-api/src/index.ts`](../../packages/dsh-product-api/src/index.ts)

<a id="ctxeleckoiwebsearchapi--eleckoiwebsearchapi"></a>

### `ctx.eleckoiWebSearchApi` — `ElecKoiWebSearchApi`

管理联网搜索方式和 Tavily 连接测试，通过官方 Typert Remote 公开跨端调用。

```ts cordis-catalog
/**
 * 读取当前搜索提供商。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote selection(): WebSearchMode

/**
 * 保存当前选择。
 * @param mode - 联网搜索方式。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote async select(mode: WebSearchMode): Promise<WebSearchMode>

/**
 * 测试临时或已保存的密钥，不保存传入密钥。
 * @param apiKey - 仅用于测试的密钥；省略时使用当前密钥。
 * @param signal - 取消调用或结束订阅流的信号。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote async testTavily(apiKey?: string, signal?: AbortSignal): Promise<TavilyConnection>
```

Types: [TavilyConnection](types-host.md#tavilyconnection) · [WebSearchMode](types-host.md#websearchmode)

Source: [`packages/dsh-product-api/src/index.ts`](../../packages/dsh-product-api/src/index.ts)
<!-- END GENERATED cordis-surface -->
