<!-- 由 pnpm generate:plugin-docs 使用锁定的 DSH 官方生成器生成，请勿手工修改。 -->

# Client 完整服务参考

DSH 基准：`0.2.0-rc.2`，提交 `c1b47e41fcd54d20a0f061df28683bfc29ee24e5`。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

由公开源码和 JSDoc 生成。用 `pnpm generate:plugin-docs` 更新，用 `pnpm check:plugin-docs` 核对。Cordis 生命周期和依赖用法见 [服务接口](services.md)。

<a id="ctxeleckoicharacters--eleckoicharacters"></a>

### `ctx.eleckoiCharacters` — `ElecKoiCharacters`

管理角色、分组、角色卡导入和浏览器下载。

```ts cordis-catalog
/**
 * 读取当前页面的角色目录状态。
 * @returns 当前页面保存的状态对象。
 */
getSnapshot(): CharacterCatalogSnapshot

/**
 * 订阅角色目录变化。
 * @param listener - 状态变化回调；返回的函数用于取消订阅。
 * @returns 取消本次订阅的函数。
 */
subscribe(listener: () => void): () => void

/**
 * 重新读取角色目录。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
refresh(): Promise<CharacterCollection>

/**
 * 创建角色并更新目录。
 * @param character - 完整角色数据。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
create(character: CharacterRecord): Promise<CharacterCollection>

/**
 * 保存角色并更新目录。
 * @param character - 完整角色数据。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
update(character: CharacterRecord): Promise<CharacterCollection>

/**
 * 选择当前角色。
 * @param characterId - 角色编号。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
select(characterId: string): Promise<CharacterCollection>

/**
 * 保存分组和角色所属分组。
 * @param groups - 分组名称列表。
 * @param assignments - 角色所属分组列表。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
saveGroups(groups: string[], assignments?: CharacterGroupAssignment[]): Promise<CharacterCollection>

/**
 * 删除指定角色。
 * @param characterIds - 角色编号列表。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
delete(characterIds: string[]): Promise<CharacterCollection>

/**
 * 读取角色卡，生成待确认的导入预览。
 * @param source - 支持的导入格式。
 * @param files - 待导入文件的内容。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
prepareImport(source: CharacterImportSource, files: CharacterImportFile[]): Promise<CharacterImportPreview>

/**
 * 确认并保存一次预览中的角色卡。
 * @param token - prepareImport 返回的预览编号。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
commitImport(token: string): Promise<CharacterImportResult>

/**
 * 取消并清理一次导入预览。
 * @param token - prepareImport 返回的预览编号。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
discardImport(token: string): Promise<void>

/**
 * 逐个下载角色卡，分别报告成功和失败。
 * @param characterIds - 角色编号列表。
 * @param format - 支持的导出格式。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
exportCharacters(characterIds: string[], format: CharacterExportFormat): Promise<CharacterDownloadResult>
```

Types: [CharacterCatalogSnapshot](types-client.md#charactercatalogsnapshot) · [CharacterDownloadResult](types-client.md#characterdownloadresult)

Source: [`packages/dsh-client-characters/src/client/types.ts`](../../packages/dsh-client-characters/src/client/types.ts)

<a id="ctxeleckoiconversations--eleckoiconversations"></a>

### `ctx.eleckoiConversations` — `ElecKoiConversations`

管理聊天目录、官方 Session 的消息显示、提交、停止、回退和角色资料。

```ts cordis-catalog
/**
 * 订阅当前运行期间实际发起的请求目录；取消时释放订阅。
 * @param id - 聊天编号。
 * @param onChange - 接收不含正文的请求目录。
 * @param signal - 关闭弹窗或切换聊天时取消订阅。
 * @returns 订阅结束后完成；失败会拒绝 Promise。
 */
observeRequestPreviews(id: string, onChange: (requests: ConversationRequestPreviewSummary[]) => void, signal: AbortSignal): Promise<void>

/**
 * 读取当前运行期间某次实际请求的正文；不提供关闭后的恢复。
 * @param id - 聊天编号。
 * @param requestId - 请求目录中的标识。
 * @param signal - 切换请求时取消读取。
 * @returns 实际发送顺序与可读正文。
 */
readRequestPreview(id: string, requestId: string, signal: AbortSignal): Promise<ConversationRequestPreview>

/**
 * 读取聊天目录的页面状态。
 * @returns 当前页面保存的状态对象。
 */
getSnapshot(): ConversationCatalogSnapshot

/**
 * 订阅聊天目录变化。
 * @param listener - 状态变化回调。
 * @returns 取消本次订阅的函数。
 */
subscribe(listener: () => void): () => void

/**
 * 读取当前打开聊天的消息和加载状态。
 * @returns 当前页面保存的状态对象。
 */
getDetailsSnapshot(): ConversationDetailsSnapshot

/**
 * 订阅当前聊天的消息变化。
 * @param listener - 状态变化回调。
 * @returns 取消本次订阅的函数。
 */
subscribeDetails(listener: () => void): () => void

/**
 * 同时读取当前聊天的消息和生成状态。
 * @returns 当前页面保存的状态对象。
 */
getChatSnapshot(): ConversationChatSnapshot

/**
 * 订阅聊天消息或生成状态变化。
 * @param listener - 状态变化回调。
 * @returns 取消本次订阅的函数。
 */
subscribeChat(listener: () => void): () => void

/**
 * 读取当前变量时间线的状态。
 * @returns 当前页面保存的状态对象。
 */
getTimelineSnapshot(): ConversationTimelineSnapshot

/**
 * 订阅变量时间线变化。
 * @param listener - 状态变化回调。
 * @returns 取消本次订阅的函数。
 */
subscribeTimeline(listener: () => void): () => void

/**
 * 读取当前回复的流式正文和处理过程。
 * @returns 当前页面保存的状态对象。
 */
getStreamSnapshot(): ConversationStreamSnapshot

/**
 * 订阅当前回复的流式输出。
 * @param listener - 状态变化回调。
 * @returns 取消本次订阅的函数。
 */
subscribeStream(listener: () => void): () => void

/**
 * 重新读取聊天目录。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
refresh(): Promise<ConversationSummary[]>

/**
 * 创建聊天并返回关联的官方 Session 编号和产品消息元数据。
 * @param input - 本次创建、提交或重新生成所需数据。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
create(input: ConversationCreateInput): Promise<ConversationClientDetails>

/**
 * 打开聊天；切换到其他聊天后，过期请求返回 null。
 * @param id - 要打开或读取的聊天编号。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
open(id: string): Promise<ConversationClientDetails | null>

/**
 * 读取更早消息；当前聊天或分页位置已改变时返回 null。
 * @param expectedId - 发起分页时的聊天编号。
 * @param expectedBeforeSequence - 发起分页时的上一页边界。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
pageOlder(expectedId: string, expectedBeforeSequence: number): Promise<ConversationClientDetails | null>

/**
 * 打开指定聊天的变量时间线。
 * @param id - 要打开或读取的聊天编号。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
openTimeline(id: string): Promise<VariableViewerTimeline | null>

/**
 * 关闭指定聊天的变量时间线订阅。
 * @param id - 要打开或读取的聊天编号。
 * @returns 操作完成。
 */
closeTimeline(id: string): void

/**
 * 通过官方文件上传服务上传附件，返回可提交的附件编号。
 * @param conversationId - ElecKoi 聊天编号。
 * @param file - 浏览器 File 对象。
 * @param options - 上传取消信号和进度回调。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
uploadFile(conversationId: string, file: File, options?: { signal?: AbortSignal; onProgress?: (progress: FileUploadProgress) => void }): Promise<ConversationUploadedFile>

/**
 * 准备官方输入框即将提交的文本，校验当前聊天与 Session 一致。
 * @param input - 本次创建、提交或重新生成所需数据。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
prepareNativeInput(input: { sessionId: string; text?: string; signal?: AbortSignal }): Promise<{ kind: 'success' } | { kind: 'error'; text: string }>

/**
 * 通过官方 Session 提交用户输入，并等待本次请求结束。
 * @param input - 本次创建、提交或重新生成所需数据。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
send(input: ConversationSendInput): Promise<ConversationRunResult>

/**
 * 在同一聊天和 Session 中回退并重新生成指定用户输入。
 * @param input - 本次创建、提交或重新生成所需数据。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
regenerate(input: ConversationRegenerateInput): Promise<ConversationRunResult>

/**
 * 停止指定请求；未匹配当前运行请求时返回 false。
 * @param conversationId - ElecKoi 聊天编号。
 * @param requestId - 本次提交的唯一请求编号。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
cancelRequest(conversationId: string, requestId: string): Promise<boolean>

/**
 * 读取当前聊天及各角色首选聊天。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
readSelection(): Promise<ConversationSelection>

/**
 * 保存当前聊天及各角色首选聊天。
 * @param value - 完整待保存的聊天选择。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
saveSelection(value: ConversationSelection): Promise<ConversationSelection>

/**
 * 读取该聊天下一轮使用的全局模型。
 * @param conversationId - ElecKoi 聊天编号。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
readModelSelection(conversationId: string): Promise<ConversationModelSelection>

/**
 * 读取官方轨迹投影，必要时先打开目标聊天。
 * @param conversationId - ElecKoi 聊天编号。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
readTrajectory(conversationId: string): Promise<TrajectorySnapshot>

/**
 * 导出聊天资料和官方 Session 轨迹的归档 JSON。
 * @param conversationId - ElecKoi 聊天编号。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
exportArchive(conversationId: string): Promise<string>

/**
 * 导入归档到指定角色，返回新聊天编号。
 * @param characterId - 角色编号。
 * @param json - 聊天归档 JSON 文本。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
importArchive(characterId: string, json: string): Promise<string>

/**
 * 在文件管理器中显示聊天附件。
 * @param conversationId - ElecKoi 聊天编号。
 * @param attachmentId - 官方附件编号。
 * @param name - 附件文件名。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
revealFile(conversationId: string, attachmentId: string, name: string): Promise<void>

/**
 * 保存下一轮的全局模型选择。
 * @param conversationId - ElecKoi 聊天编号。
 * @param selection - 模型提供商、模型编号和可选推理档位。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
selectModel(conversationId: string, selection: ConversationModelSelection): Promise<ConversationModelSelection>

/**
 * 切换聊天开场白并刷新消息。
 * @param conversationId - ElecKoi 聊天编号。
 * @param openingId - 开场白编号。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
selectOpening(conversationId: string, openingId: string): Promise<ConversationClientDetails | null>

/**
 * 修改聊天开场白并刷新消息。
 * @param conversationId - ElecKoi 聊天编号。
 * @param content - 要保存的消息文本。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
updateOpening(conversationId: string, content: string): Promise<ConversationClientDetails | null>

/**
 * 在当前页面记住一个角色的首选聊天。
 * @param characterId - 角色编号。
 * @param sessionId - 目标聊天编号。
 * @returns 操作完成。
 */
rememberSession(characterId: string, sessionId: string): void

/**
 * 读取当前页面记住的角色首选聊天。
 * @param characterId - 角色编号。
 * @returns 当前页面记住的聊天编号；未选择时为空字符串。
 */
preferredSession(characterId: string): string

/**
 * 清除页面中匹配的首选聊天。
 * @param characterId - 角色编号。
 * @param sessionId - 目标聊天编号。
 * @returns 操作完成。
 */
forgetSession(characterId: string, sessionId: string): void

/**
 * 读取当前聊天的有效设定库、变量配置和变量状态，保留完整设定字段。
 * @param conversationId - ElecKoi 聊天编号。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
readAuthorState(conversationId: string): Promise<AuthorConversationState>

/**
 * 替换当前聊天变量；正在生成时由 Host 拒绝修改。
 * @param conversationId - ElecKoi 聊天编号。
 * @param state - 完整的新变量对象。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
replaceAuthorVariableState(conversationId: string, state: Record<string, VariableJsonValue>): Promise<Record<string, VariableJsonValue>>

/**
 * 修改官方 Session 中的一条消息并刷新聊天显示。
 * @param conversationId - ElecKoi 聊天编号。
 * @param eventSeq - 官方 Session 中消息的事件序号。
 * @param role - 要修改或回退的消息角色。
 * @param content - 要保存的消息文本。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
editMessage(conversationId: string, eventSeq: number, role: 'user' | 'assistant', content: string): Promise<ConversationClientDetails | null>

/**
 * 从指定消息起回退聊天并刷新显示。
 * @param conversationId - ElecKoi 聊天编号。
 * @param eventSeq - 官方 Session 中消息的事件序号。
 * @param role - 要修改或回退的消息角色。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
deleteMessagesFrom(conversationId: string, eventSeq: number, role: 'user' | 'assistant'): Promise<ConversationClientDetails | null>

/**
 * 删除聊天及对应 Session，刷新目录。
 * @param conversationId - ElecKoi 聊天编号。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
delete(conversationId: string): Promise<void>

/**
 * 读取页面中的模型选择。
 * @returns 当前页面保存的状态对象。
 */
getModelSelectionSnapshot(): ConversationModelSelection

/**
 * 订阅模型选择变化。
 * @param listener - 状态变化回调。
 * @returns 取消本次订阅的函数。
 */
subscribeModelSelection(listener: () => void): () => void
```

Types: [ConversationCatalogSnapshot](types-client.md#conversationcatalogsnapshot) · [ConversationChatSnapshot](types-client.md#conversationchatsnapshot) · [ConversationClientDetails](types-client.md#conversationclientdetails) · [ConversationDetailsSnapshot](types-client.md#conversationdetailssnapshot) · [ConversationRegenerateInput](types-client.md#conversationregenerateinput) · [ConversationRunResult](types-client.md#conversationrunresult) · [ConversationSelection](types-client.md#conversationselection) · [ConversationSendInput](types-client.md#conversationsendinput) · [ConversationStreamSnapshot](types-client.md#conversationstreamsnapshot) · [ConversationTimelineSnapshot](types-client.md#conversationtimelinesnapshot) · [ConversationUploadedFile](types-client.md#conversationuploadedfile)

Source: [`packages/dsh-client-conversations/src/client/types.ts`](../../packages/dsh-client-conversations/src/client/types.ts)

<a id="ctxeleckoicreatorstudio--eleckoicreatorstudio"></a>

### `ctx.eleckoiCreatorStudio` — `ElecKoiCreatorStudio`

管理创作项目并使用官方目录选择器。

```ts cordis-catalog
/**
 * 读取项目目录状态。
 * @returns 当前页面保存的状态对象。
 */
getSnapshot(): CreatorStudioSnapshot

/**
 * 订阅项目目录变化。
 * @param listener - 状态变化回调；返回的函数用于取消订阅。
 * @returns 取消本次订阅的函数。
 */
subscribe(listener: () => void): () => void

/**
 * 重新读取项目目录。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
refresh(): Promise<CreatorProjectCollection>

/**
 * 创建项目并更新目录。
 * @param input - 创建项目所需数据。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
create(input: CreateCreatorProjectInput): Promise<CreatorProjectCollection>

/**
 * 删除项目目录中的指定项目。
 * @param projectId - 创作项目编号。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
delete(projectId: string): Promise<CreatorProjectCollection>

/**
 * 打开官方目录选择器；取消选择时返回 null。
 * @param signal - 取消本次操作的信号。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
selectDirectory(signal?: AbortSignal): Promise<string | null>
```

Types: [CreatorStudioSnapshot](types-client.md#creatorstudiosnapshot)

Source: [`packages/dsh-client-creator-studio/src/client/types.ts`](../../packages/dsh-client-creator-studio/src/client/types.ts)

<a id="ctxeleckoidisplaypreferences--eleckoidisplaypreferences"></a>

### `ctx.eleckoiDisplayPreferences` — `ElecKoiDisplayPreferences`

读取和保存显示偏好；保存请求在当前页面中依次执行。

```ts cordis-catalog
/**
 * 读取显示偏好的页面状态。
 * @returns 当前页面保存的状态对象。
 */
getSnapshot(): ClientDisplayPreferencesSnapshot

/**
 * 订阅显示偏好变化。
 * @param listener - 状态变化回调；返回的函数用于取消订阅。
 * @returns 取消本次订阅的函数。
 */
subscribe(listener: () => void): () => void

/**
 * 重新读取显示偏好。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
refresh(): Promise<ClientDisplayPreferencesSnapshot>

/**
 * 更新界面偏好，可根据队列执行时的当前值生成更新。
 * @param update - 新配置或根据当前配置计算新配置的函数。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
updateUi(update: Record<string, DisplayPreferenceValue> | ((current: Readonly<Record<string, DisplayPreferenceValue>>) => Record<string, DisplayPreferenceValue>)): Promise<ClientDisplayPreferencesSnapshot>

/**
 * 保存聊天显示配置。
 * @param value - 完整待保存配置。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
setChatDisplay(value: Record<string, DisplayPreferenceValue>): Promise<ClientDisplayPreferencesSnapshot>
```

Types: [ClientDisplayPreferencesSnapshot](types-client.md#clientdisplaypreferencessnapshot)

Source: [`packages/dsh-client-display-preferences/src/client/types.ts`](../../packages/dsh-client-display-preferences/src/client/types.ts)

<a id="ctxeleckoimodels--eleckoimodels"></a>

### `ctx.eleckoiModels` — `ElecKoiModels`

通过官方模型目录、Settings 和 Credentials 管理模型配置。

```ts cordis-catalog
/**
 * 读取模型目录的页面状态。
 * @returns 当前页面保存的状态对象。
 */
getSnapshot(): ModelCatalogSnapshot

/**
 * 订阅模型目录变化。
 * @param listener - 状态变化回调；返回的函数用于取消订阅。
 * @returns 取消本次订阅的函数。
 */
subscribe(listener: () => void): () => void

/**
 * 重新读取官方模型目录和已保存配置。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
refresh(): Promise<ClientModelConfig[]>

/**
 * 保存模型配置和明确声明的能力，不根据模型名称猜测能力。
 * @param config - 模型配置和明确声明的模型能力。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
save(config: ClientModelConfig): Promise<ClientModelConfig | undefined>

/**
 * 删除一个配置，返回剩余目录的第一个配置。
 * @param id - 要读取或修改的项目编号。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
deleteConfig(id: string): Promise<ClientModelConfig | undefined>

/**
 * 删除指定提供商的配置，返回剩余的首选配置。
 * @param provider - 提供商编号。
 * @param preferredId - 删除后优先选择的剩余配置编号。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
deleteProvider(provider: string, preferredId?: string): Promise<ClientModelConfig | undefined>

/**
 * 读取模型列表并合并当前配置明确声明的参数。
 * @param config - 模型配置和明确声明的模型能力。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
discover(config: ClientModelConfig): Promise<ClientModelOption[]>

/**
 * 使用官方适配器发起一次工具调用测试。
 * @param config - 模型配置和明确声明的模型能力。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
testConnection(config: ClientModelConfig): Promise<{ supported: true }>

/**
 * 按配置编号读取密钥，供用户主动查看。
 * @param configId - 模型配置编号。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
revealApiKey(configId: string): Promise<string>
```

Types: [ClientModelConfig](types-client.md#clientmodelconfig) · [ClientModelOption](types-client.md#clientmodeloption) · [ModelCatalogSnapshot](types-client.md#modelcatalogsnapshot)

Source: [`packages/dsh-client-models/src/client/types.ts`](../../packages/dsh-client-models/src/client/types.ts)

<a id="ctxeleckoipersona--eleckoipersona"></a>

### `ctx.eleckoiPersona` — `ElecKoiPersona`

读取、保存用户资料并订阅当前页面的资料变化。

```ts cordis-catalog
/**
 * 读取当前页面的用户资料状态。
 * @returns 当前页面保存的状态对象。
 */
getSnapshot(): PersonaSnapshot

/**
 * 订阅资料状态变化。
 * @param listener - 状态变化回调；返回的函数用于取消订阅。
 * @returns 取消本次订阅的函数。
 */
subscribe(listener: () => void): () => void

/**
 * 重新读取 Host 保存的用户资料。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
refresh(): Promise<PersonaProfile>

/**
 * 保存用户资料并更新页面状态。
 * @param profile - 完整用户资料。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
save(profile: PersonaProfile): Promise<PersonaProfile>
```

Types: [PersonaSnapshot](types-client.md#personasnapshot)

Source: [`packages/dsh-client-persona/src/client/types.ts`](../../packages/dsh-client-persona/src/client/types.ts)

<a id="ctxeleckoipresets--eleckoipresets"></a>

### `ctx.eleckoiPresets` — `ElecKoiPresets`

管理 Agent 预设、预设分组、导入导出和页面状态。

```ts cordis-catalog
/**
 * 读取预设目录状态。
 * @returns 当前页面保存的状态对象。
 */
getSnapshot(): PresetCatalogSnapshot

/**
 * 订阅预设目录变化。
 * @param listener - 状态变化回调；返回的函数用于取消订阅。
 * @returns 取消本次订阅的函数。
 */
subscribe(listener: () => void): () => void

/**
 * 读取一个已加载预设的状态。
 * @param id - 要读取或修改的项目编号。
 * @returns 当前页面保存的状态对象。
 */
getDetailSnapshot(id: string): PresetDetailSnapshot

/**
 * 订阅一个预设的状态变化。
 * @param id - 要读取或修改的项目编号。
 * @param listener - 状态变化回调；返回的函数用于取消订阅。
 * @returns 取消本次订阅的函数。
 */
subscribeDetail(id: string, listener: () => void): () => void

/**
 * 读取完整预设。
 * @param id - 要读取或修改的项目编号。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
read(id: string): Promise<AgentPreset>

/**
 * 保存完整预设；同时校验预期的正则规则列表。
 * @param preset - 完整预设数据。
 * @param expectedRegexRules - 保存前要求仍有效的正则配置。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
save(preset: AgentPreset, expectedRegexRules: RegexRule[]): Promise<AgentPreset>

/**
 * 创建预设并可指定分组。
 * @param name - 保存的名称。
 * @param libraryGroupId - 预设分组编号；省略时不分组。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
create(name: string, libraryGroupId?: string): Promise<AgentPreset>

/**
 * 导入预设文件。
 * @param source - 支持的导入格式。
 * @param document - 待导入的文件内容。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
import(source: AgentPresetImportSource, document: AgentPresetImportDocument): Promise<AgentPresetImportResult>

/**
 * 导出预设文件内容。
 * @param presetId - 预设编号。
 * @param format - 支持的导出格式。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
export(presetId: string, format: AgentPresetExportFormat): Promise<AgentPresetExportResult>

/**
 * 设置当前使用的预设。
 * @param presetId - 预设编号。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
setActive(presetId: string): Promise<AgentPresetCatalog>

/**
 * 创建预设分组。
 * @param name - 保存的名称。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
createGroup(name: string): Promise<AgentPresetCatalog>

/**
 * 重命名预设分组。
 * @param groupId - 分组编号。
 * @param name - 保存的名称。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
renameGroup(groupId: string, name: string): Promise<AgentPresetCatalog>

/**
 * 调整预设所属分组。
 * @param presetId - 预设编号。
 * @param groupId - 分组编号。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
assignGroup(presetId: string, groupId: string): Promise<AgentPresetCatalog>

/**
 * 删除预设分组。
 * @param groupId - 分组编号。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
deleteGroup(groupId: string): Promise<AgentPresetCatalog>

/**
 * 删除预设。
 * @param presetId - 预设编号。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
delete(presetId: string): Promise<AgentPresetCatalog>

/**
 * 重新读取预设目录。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
refresh(): Promise<AgentPresetCatalog>
```

Types: [PresetCatalogSnapshot](types-client.md#presetcatalogsnapshot) · [PresetDetailSnapshot](types-client.md#presetdetailsnapshot)

Source: [`packages/dsh-client-presets/src/client/types.ts`](../../packages/dsh-client-presets/src/client/types.ts)

<a id="ctxeleckoiregexrules--eleckoiregexrules"></a>

### `ctx.eleckoiRegexRules` — `ElecKoiRegexRules`

读取和保存角色配置，保留完整字段、触发方式和提示词插入位置。

```ts cordis-catalog
/**
 * 读取指定角色在页面中的配置状态。
 * @param characterId - 角色编号。
 * @returns 当前页面保存的状态对象。
 */
getSnapshot(characterId: string): ConfigurationSnapshot<RegexRuleCollection>

/**
 * 订阅配置变化，通知中包含角色编号和变化后的值。
 * @param listener - 状态变化回调；返回的函数用于取消订阅。
 * @returns 取消本次订阅的函数。
 */
subscribe(listener: (kind: 'configuration' | 'conversations', characterId: string, snapshot: ConfigurationSnapshot<RegexRuleCollection>) => void): () => void

/**
 * 读取完整配置并更新页面状态。
 * @param characterId - 角色编号。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
read(characterId: string): Promise<RegexRuleCollection>

/**
 * 读取完整配置，不更新页面中的已加载状态。
 * @param characterId - 角色编号。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
readUntracked(characterId: string): Promise<RegexRuleCollection>

/**
 * 保存完整配置；正则配置使用其 revision 检查是否发生并发修改。
 * @param characterId - 角色编号。
 * @param collection - 完整正则配置，包含当前 revision。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
save(characterId: string, collection: RegexRuleCollection): Promise<RegexRuleCollection>

/**
 * 校验当前 revision 后导入正则文件。
 * @param characterId - 角色编号。
 * @param collection - 完整正则配置，包含当前 revision。
 * @param fallbackScope - 导入文件未指定归属时使用的范围。
 * @param documents - 待导入的正则文件。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
import(characterId: string, collection: RegexRuleCollection, fallbackScope: RegexRuleScope, documents: RegexRuleImportDocument[]): Promise<RegexRuleImportResult>

/**
 * 导出指定正则规则的 JSON 文本。
 * @param characterId - 角色编号。
 * @param ruleIds - 待导出的正则编号。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
export(characterId: string, ruleIds: string[]): Promise<{ fileName: string; json: string }>

/**
 * 在指定文本上测试规则，不保存规则。
 * @param text - 待处理文本。
 * @param rule - 待测试的正则规则。
 * @param target - 正则规则作用的内容类别。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
test(text: string, rule: RegexRule, target: RegexRuleTarget): Promise<RegexRuleTestResult>
```

Types: [ConfigurationSnapshot](types-client.md#configurationsnapshot)

Source: [`packages/dsh-client-character-configuration/src/client/types.ts`](../../packages/dsh-client-character-configuration/src/client/types.ts)

<a id="ctxeleckoisettinglibraries--eleckoisettinglibraries"></a>

### `ctx.eleckoiSettingLibraries` — `ElecKoiSettingLibraries`

读取和保存角色配置，保留完整字段、触发方式和提示词插入位置。

```ts cordis-catalog
/**
 * 读取指定角色在页面中的配置状态。
 * @param characterId - 角色编号。
 * @returns 当前页面保存的状态对象。
 */
getSnapshot(characterId: string): ConfigurationSnapshot<SettingLibrary>

/**
 * 订阅配置变化，通知中包含角色编号和变化后的值。
 * @param listener - 状态变化回调；返回的函数用于取消订阅。
 * @returns 取消本次订阅的函数。
 */
subscribe(listener: (kind: 'configuration' | 'conversations', characterId: string, snapshot: ConfigurationSnapshot<SettingLibrary | SettingLibraryConversation[]>) => void): () => void

/**
 * 读取完整配置并更新页面状态。
 * @param characterId - 角色编号。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
read(characterId: string): Promise<SettingLibrary>

/**
 * 读取完整配置，不更新页面中的已加载状态。
 * @param characterId - 角色编号。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
readUntracked(characterId: string): Promise<SettingLibrary>

/**
 * 保存完整配置；正则配置使用其 revision 检查是否发生并发修改。
 * @param characterId - 角色编号。
 * @param value - 完整待保存配置。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
save(characterId: string, value: SettingLibrary): Promise<SettingLibrary>

/**
 * 保存配置页面中已展开项目的编号。
 * @param characterId - 角色编号。
 * @param expandedIds - 页面中已展开项目的编号。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
saveViewState(characterId: string, expandedIds: string[]): Promise<string[]>

/**
 * 读取此角色各聊天设定库的页面状态。
 * @param characterId - 角色编号。
 * @returns 当前页面保存的状态对象。
 */
getConversationSnapshot(characterId: string): ConfigurationSnapshot<SettingLibraryConversation[]>

/**
 * 读取此角色各聊天的完整设定库。
 * @param characterId - 角色编号。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
readConversations(characterId: string): Promise<SettingLibraryConversation[]>

/**
 * 保存指定聊天的设定库。
 * @param characterId - 角色编号。
 * @param sessionId - 目标聊天编号。
 * @param library - 完整设定库，包含触发条件和插入位置。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
saveConversation(characterId: string, sessionId: string, library: SettingLibrary): Promise<SettingLibrary>

/**
 * 恢复指定聊天的设定库。
 * @param characterId - 角色编号。
 * @param sessionId - 目标聊天编号。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
resetConversation(characterId: string, sessionId: string): Promise<void>

/**
 * 为指定聊天的设定库保存命名版本。
 * @param characterId - 角色编号。
 * @param sessionId - 目标聊天编号。
 * @param name - 保存的名称。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
saveConversationVersion(characterId: string, sessionId: string, name: string): Promise<SettingLibrary>
```

Types: [ConfigurationSnapshot](types-client.md#configurationsnapshot)

Source: [`packages/dsh-client-character-configuration/src/client/types.ts`](../../packages/dsh-client-character-configuration/src/client/types.ts)

<a id="ctxeleckoitavernshared--eleckoitavernshared"></a>

### `ctx.eleckoiTavernShared` — `ElecKoiTavernShared`

应用持有的共享酒馆环境，连接插件面板、聊天控制器与正式消息投影。

```ts cordis-catalog
/**
 * 读取共享运行时的连接状态、实际宿主命令和插件 UI 列表。
 * @returns 当前运行时保存的状态对象。
 */
getSnapshot(): TavernSharedSnapshot

/**
 * 订阅共享运行时状态变化。
 * @param listener - 每次状态发布时执行的回调。
 * @returns 取消本次订阅的函数。
 */
subscribe(listener: () => void): () => void

/**
 * 打开插件已登记的 HTML 面板，或执行已登记脚本按钮的事件。
 * @param owner - 面板所属的插件编号。
 * @param id - 该插件登记的 UI 项目编号。
 * @returns 面板挂载或按钮事件发布完成；UI 不存在或不是 HTML 面板时拒绝 Promise。
 */
openPanel(owner: string, id: string): Promise<void>

/**
 * 将当前聊天的编辑、设置等控制器接入共享运行时。
 * @param conversationId - 控制器所属的 ElecKoi 聊天编号。
 * @param handlers - 按 UI 命令名称索引的处理函数，参数与结果保留原命令结构。
 * @returns 移除本次控制器的函数；不会移除同会话随后注册的新控制器。
 */
registerChatUi(conversationId: string, handlers: TavernSharedChatHandlers): () => void

/**
 * 读取指定聊天已绑定的正式消息投影；省略编号时读取当前聊天。
 * @param conversationId - 可选 ElecKoi 聊天编号。
 * @returns 过滤错误占位消息后的消息列表、生成状态及当前流式正文；投影未就绪时抛出错误。
 */
capturePresentation(conversationId?: string): TavernSharedPresentation
```

Types: [TavernSharedChatHandlers](types-client.md#tavernsharedchathandlers) · [TavernSharedPresentation](types-client.md#tavernsharedpresentation) · [TavernSharedSnapshot](types-client.md#tavernsharedsnapshot)

Source: [`packages/dsh-client-tavern-shared/src/client/types.ts`](../../packages/dsh-client-tavern-shared/src/client/types.ts)

<a id="ctxeleckoivariables--eleckoivariables"></a>

### `ctx.eleckoiVariables` — `ElecKoiVariables`

读取和保存角色配置，保留完整字段、触发方式和提示词插入位置。

```ts cordis-catalog
/**
 * 读取指定角色在页面中的配置状态。
 * @param characterId - 角色编号。
 * @returns 当前页面保存的状态对象。
 */
getSnapshot(characterId: string): ConfigurationSnapshot<VariableConfig>

/**
 * 订阅配置变化，通知中包含角色编号和变化后的值。
 * @param listener - 状态变化回调；返回的函数用于取消订阅。
 * @returns 取消本次订阅的函数。
 */
subscribe(listener: (kind: 'configuration' | 'conversations', characterId: string, snapshot: ConfigurationSnapshot<VariableConfig>) => void): () => void

/**
 * 读取完整配置并更新页面状态。
 * @param characterId - 角色编号。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
read(characterId: string): Promise<VariableConfig>

/**
 * 读取完整配置，不更新页面中的已加载状态。
 * @param characterId - 角色编号。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
readUntracked(characterId: string): Promise<VariableConfig>

/**
 * 保存完整配置；正则配置使用其 revision 检查是否发生并发修改。
 * @param characterId - 角色编号。
 * @param value - 完整待保存配置。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
save(characterId: string, value: VariableConfig): Promise<VariableConfig>

/**
 * 保存配置页面中已展开项目的编号。
 * @param characterId - 角色编号。
 * @param expandedIds - 页面中已展开项目的编号。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
saveViewState(characterId: string, expandedIds: string[]): Promise<string[]>
```

Types: [ConfigurationSnapshot](types-client.md#configurationsnapshot)

Source: [`packages/dsh-client-character-configuration/src/client/types.ts`](../../packages/dsh-client-character-configuration/src/client/types.ts)

<a id="ctxeleckoiwebsearch--eleckoiwebsearch"></a>

### `ctx.eleckoiWebSearch` — `ElecKoiWebSearch`

管理联网搜索方式、Tavily 配置和官方 Credentials 中的密钥。

```ts cordis-catalog
/**
 * 读取搜索配置的页面状态。
 * @returns 当前页面保存的状态对象。
 */
getSnapshot(): WebSearchSnapshot

/**
 * 订阅搜索配置变化。
 * @param listener - 状态变化回调；返回的函数用于取消订阅。
 * @returns 取消本次订阅的函数。
 */
subscribe(listener: () => void): () => void

/**
 * 重新读取搜索配置和密钥是否已设置。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
refresh(): Promise<WebSearchSnapshot>

/**
 * 修改搜索方式和返回条数，条数必须在 1 至 8 之间。
 * @param patch - 要修改的配置字段。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
update(patch: { mode?: WebSearchMode; maxResults?: number }): Promise<WebSearchSnapshot>

/**
 * 测试密钥，通过后保存至官方 Credentials 并刷新页面状态。
 * @param apiKey - 待测试或保存的密钥。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
saveAndTest(apiKey: string): Promise<{ settings: WebSearchSnapshot; connection: TavilyConnection }>

/**
 * 测试临时密钥；未传密钥时测试当前已保存密钥。
 * @param apiKey - 待测试或保存的密钥。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
test(apiKey?: string): Promise<{ connection: TavilyConnection }>

/**
 * 移除已保存的搜索密钥。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
removeKey(): Promise<WebSearchSnapshot>
```

Types: [WebSearchSnapshot](types-client.md#websearchsnapshot)

Source: [`packages/dsh-client-web-search/src/client/types.ts`](../../packages/dsh-client-web-search/src/client/types.ts)
<!-- END GENERATED cordis-surface -->

## 官方布局服务

`ctx.layout` 直接复用 [官方 ILayout 合同](https://github.com/deepseek-ai/deepseek-harness/blob/c1b47e41fcd54d20a0f061df28683bfc29ee24e5/packages/client/ui-layout/src/client/service.ts)，类型从 `@eleckoi/dsh-client-shell/client` 或 `@deepseek-ai/dsh-client-ui-layout/client` 导入。官方 Client 的 `Service` Inspect provider 已提供 `api({ key: "layout" })`，无需重复注册。桌面当前的 `toggleSidebar` 为空操作。
