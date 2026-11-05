<!-- 由 pnpm generate:plugin-docs 使用锁定的 DSH 官方生成器生成，请勿手工修改。 -->

# Client 完整服务参考

DSH 基准：`0.2.1-rc.3`，提交 `1f81c047fc48fa190a683e469daa699857e9afe8`。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

由公开源码和 JSDoc 生成。用 `pnpm generate:plugin-docs` 更新，用 `pnpm check:plugin-docs` 核对。Cordis 生命周期和依赖用法见 [服务接口](services.md)。

<a id="ctxeleckoiauthorruntime--eleckoiauthorruntime"></a>

### `ctx.eleckoiAuthorRuntime` — `ElecKoiAuthorRuntime`

正式原生作者页面与脚本运行服务。

```ts cordis-catalog
/** 读取当前运行状态。
 * @returns 当前聊天与各脚本的运行状态。
 */
getSnapshot(): NativeAuthorRuntimeSnapshot

/** 订阅运行状态。
 * @param listener - 状态变化回调。
 * @returns 取消订阅函数。
 */
subscribe(listener: () => void): () => void

/** 读取当前脚本按钮与作者面板。
 * @returns 仅包含当前程序代际的界面注册。
 */
getUiSnapshot(): NativeAuthorUiSnapshot

/** 订阅按钮与作者面板变化。
 * @param listener - 界面变化回调。
 * @returns 取消订阅函数。
 */
subscribeUi(listener: () => void): () => void

/** 执行明确编号的脚本按钮，重复点击或失效按钮会报错。
 * @param key - 界面快照中的完整按钮编号。
 * @returns 作者回调完成后结束，失败时拒绝。
 */
invokeButton(key: string): Promise<void>

/** 关闭仍与编号对应的面板，不影响后来打开的面板。
 * @param key - 界面快照中的面板编号。
 * @returns 是否关闭该面板。
 */
dismissPanel(key: string): boolean

/** 在作者面板安装所属脚本的 SDK 和设置接口。
 * @param target - 同源面板窗口。
 * @param key - 界面快照中的面板编号。
 * @returns 撤回本页面 SDK 的函数。
 */
mountScriptPanelDocument(target: Window, key: string): () => void

/** 注册指定聊天的输入框操作。
 * @param conversationId - 聊天编号。
 * @param handlers - 页面实际实现的操作。
 * @returns 撤回本次注册的函数。
 */
registerChatUi(conversationId: string, handlers: NativeAuthorChatHandlers): () => void

/** 在作者页面安装固定聊天作用域的 SDK。
 * @param target - 同源作者页面窗口。
 * @param conversationId - 所属聊天编号。
 * @param messageId - 所属消息编号；聊天页面传空字符串。
 * @returns 关闭该页面 SDK 的函数。
 */
mountDocument(target: Window, conversationId: string, messageId: string): () => void

/** 在项目页面安装 SDK；应用项目跟随选择，角色项目只操作明确所属角色的聊天。
 * @param target - 同源项目页面窗口。
 * @param project - 明确项目编号、入口、窗口及所属角色；聊天页面还须提供所属聊天。
 * @returns 关闭该页面 SDK 的函数。
 */
mountProjectDocument(target: Window, project: NativeAuthorProjectContext): () => void
```

Types: [NativeAuthorChatHandlers](types-client.md#nativeauthorchathandlers) · [NativeAuthorProjectContext](types-client.md#nativeauthorprojectcontext) · [NativeAuthorRuntimeSnapshot](types-client.md#nativeauthorruntimesnapshot) · [NativeAuthorUiSnapshot](types-client.md#nativeauthoruisnapshot)

Source: [`packages/client/features/dsh-client-author/src/client/types.ts`](../../packages/client/features/dsh-client-author/src/client/types.ts)

<a id="ctxeleckoicharacteropenings--eleckoicharacteropenings"></a>

### `ctx.eleckoiCharacterOpenings` — `ElecKoiCharacterOpenings`

角色独立开场白的读取、保存与变更订阅服务。

```ts cordis-catalog
/**
 * 读取角色开场白在页面中的当前状态。
 * @param characterId - 所属角色编号。
 * @returns 当前页面保存的配置状态。
 */
getSnapshot(characterId: string): ConfigurationSnapshot<CharacterOpenings>

/**
 * 订阅独立开场白配置变化。
 * @param listener - 接收角色编号和新状态的回调。
 * @returns 取消订阅函数。
 */
subscribe(listener: (kind: 'configuration', characterId: string, snapshot: ConfigurationSnapshot<CharacterOpenings>) => void): () => void

/**
 * 读取全部开场白并更新页面状态。
 * @param characterId - 所属角色编号。
 * @returns 完整的角色开场白配置。
 */
read(characterId: string): Promise<CharacterOpenings>

/**
 * 保存角色开场白及变量绑定，不修改设定库。
 * @param characterId - 所属角色编号。
 * @param value - 完整开场白配置。
 * @returns 实际保存后的角色开场白配置。
 */
save(characterId: string, value: CharacterOpenings): Promise<CharacterOpenings>
```

Types: [ConfigurationSnapshot](types-client.md#configurationsnapshot)

Source: [`packages/client/features/dsh-client-character-configuration/src/client/types.ts`](../../packages/client/features/dsh-client-character-configuration/src/client/types.ts)

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
 * 复制角色及其专属配置、资源，创建独立副本并刷新目录。
 * @param characterId - 原角色编号。
 * @returns 新角色编号和更新后的目录；异步失败会拒绝 Promise。
 */
duplicate(characterId: string): Promise<{ characterId: string; collection: CharacterCollection }>

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
 * 逐个保存角色卡，分别报告成功、取消和失败；Android 等待系统保存完成。
 * @param characterIds - 角色编号列表。
 * @param format - 支持的导出格式。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
exportCharacters(characterIds: string[], format: CharacterExportFormat): Promise<CharacterDownloadResult>
```

Types: [CharacterCatalogSnapshot](types-client.md#charactercatalogsnapshot) · [CharacterDownloadResult](types-client.md#characterdownloadresult)

Source: [`packages/client/features/dsh-client-characters/src/client/types.ts`](../../packages/client/features/dsh-client-characters/src/client/types.ts)

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
 * 读取当前聊天已经就绪的正式 Session 引用，生命周期由聊天服务持有，调用者不得释放。
 * @param runtimeSessionId - 必须与当前聊天一致的正式 Session 编号。
 * @returns 已就绪的借用引用；尚未就绪或身份不一致时返回 null。
 */
getSessionReference(runtimeSessionId: string): SessionReference | null

/**
 * 订阅当前聊天的消息变化。
 * @param listener - 状态变化回调。
 * @returns 取消本次订阅的函数。
 */
subscribeDetails(listener: () => void): () => void

/**
 * 读取当前聊天的统计显示快照。
 * @returns 来自 DSH 投影、在重新生成期间保持连续的统计。
 */
getStatsSnapshot(): ConversationStatsSnapshot

/**
 * 订阅当前聊天的统计显示变化。
 * @param listener - 状态变化回调。
 * @returns 取消本次订阅的函数。
 */
subscribeStats(listener: () => void): () => void

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
 * 读取同一 Session 的正式图片资源，复用官方图片所有者。
 * @param conversationId - ElecKoi 聊天编号。
 * @param attachment - 正式图片引用。
 * @returns 浏览器可加载的资源 URL。
 */
readImage(conversationId: string, attachment: ImageAttachmentRef | ConversationGeneratedImage): Promise<string>

/**
 * 用原始 AI 回复中的提示词重新生成选中的一张图片。
 * @param conversationId - ElecKoi 聊天编号。
 * @param image - 明确的批次和图片编号。
 * @returns 图片替换和聊天投影刷新完成。
 */
regenerateImage(conversationId: string, image: ConversationGeneratedImage): Promise<void>

/**
 * 订阅当前回复的流式输出。
 * @param listener - 状态变化回调。
 * @returns 取消本次订阅的函数。
 */
subscribeStream(listener: () => void): () => void

/**
 * 订阅当前正式 Session 的生成边界；基线只用于同步正在观察的轮次，不代表新生成。
 * @param listener - 接收当前绑定身份、实时事件或重建基线。
 * @returns 取消本次订阅的函数。
 */
subscribeGeneration(listener: (change: ConversationGenerationChange) => void): () => void

/**
 * 按正式生成身份读取结算后的显示消息；空消息只在明确关闭节点确认后返回。
 * @param runtimeSessionId - 当前绑定的正式 Session。
 * @param turn - 已结束的正式轮次。
 * @param eventSeq - 对应 assistant/message 的正式事件位置。
 * @returns 投影等待、唯一结算消息或明确不可用原因。
 */
getGenerationReply(runtimeSessionId: string, turn: number, eventSeq: number): ConversationGenerationReply

/**
 * 重新读取聊天目录。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
refresh(): Promise<ConversationSummary[]>

/**
 * 读取当前聊天官方输入框的实际草稿，不读取页面内部状态。
 * @param conversationId - 当前聊天编号。
 * @returns 官方输入框的文本投影；未就绪或不属于当前聊天时抛出错误。
 */
readInputDraft(conversationId: string): string

/**
 * 通过官方输入框写入草稿，保留其编辑与引用处理规则。
 * @param conversationId - 当前聊天编号。
 * @param text - 要写入的完整文本。
 * @returns 官方输入框接受的实际文本。
 */
writeInputDraft(conversationId: string, text: string): string

/**
 * 请求官方输入框提交当前草稿及其附件，不等待生成完成。
 * @param conversationId - 当前聊天编号。
 * @returns 是否请求了提交；空输入或正在裁决、提交时返回 false。
 */
submitInput(conversationId: string): boolean

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
 * 停止当前打开聊天的生成，包括由官方输入框提交的请求。
 * @param conversationId - 当前 ElecKoi 聊天编号。
 * @returns 匹配正在执行的请求或 Session 时返回 true；不取消其他聊天。
 */
cancelGeneration(conversationId: string): Promise<boolean>

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
deleteMessagesFrom(conversationId: string, eventSeq: number, role: 'user' | 'assistant'): Promise<{ details: ConversationClientDetails | null deletedMessageCount: number remainingMessageCount: number }>

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

Types: [ConversationCatalogSnapshot](types-client.md#conversationcatalogsnapshot) · [ConversationChatSnapshot](types-client.md#conversationchatsnapshot) · [ConversationClientDetails](types-client.md#conversationclientdetails) · [ConversationDetailsSnapshot](types-client.md#conversationdetailssnapshot) · [ConversationGeneratedImage](types-client.md#conversationgeneratedimage) · [ConversationGenerationChange](types-client.md#conversationgenerationchange) · [ConversationGenerationReply](types-client.md#conversationgenerationreply) · [ConversationRegenerateInput](types-client.md#conversationregenerateinput) · [ConversationRunResult](types-client.md#conversationrunresult) · [ConversationSelection](types-client.md#conversationselection) · [ConversationSendInput](types-client.md#conversationsendinput) · [ConversationStatsSnapshot](types-client.md#conversationstatssnapshot) · [ConversationStreamSnapshot](types-client.md#conversationstreamsnapshot) · [ConversationTimelineSnapshot](types-client.md#conversationtimelinesnapshot) · [ConversationUploadedFile](types-client.md#conversationuploadedfile)

Source: [`packages/client/features/dsh-client-conversations/src/client/types.ts`](../../packages/client/features/dsh-client-conversations/src/client/types.ts)

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

Source: [`packages/client/features/dsh-client-creator-studio/src/client/types.ts`](../../packages/client/features/dsh-client-creator-studio/src/client/types.ts)

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

Source: [`packages/client/features/dsh-client-display-preferences/src/client/types.ts`](../../packages/client/features/dsh-client-display-preferences/src/client/types.ts)

<a id="ctxeleckoifrontendprojects--nativefrontendclient"></a>

### `ctx.eleckoiFrontendProjects` — `NativeFrontendClient`

Native file projects use the generated Remote, independently of chat/script readiness.

```ts cordis-catalog
/** 订阅明确工作区的最新状态，串行重读并释放旧连接。
 * @param owner - 应用或明确角色的工作区。
 * @param listener - 最新状态回调。
 * @param onError - 未取消的读取或连接错误。
 * @returns 取消订阅函数。
 */
watch(owner: FrontendOwner, listener: (workspace: FrontendWorkspace) => void, onError: (error: unknown) => void): () => void
```

Source: [`packages/client/features/dsh-client-author/src/frontends.ts`](../../packages/client/features/dsh-client-author/src/frontends.ts)

<a id="ctxeleckoiglobalsettinglibraries--eleckoiglobalsettinglibraries"></a>

### `ctx.eleckoiGlobalSettingLibraries` — `ElecKoiGlobalSettingLibraries`

独立于角色版本的全局设定库集合。

```ts cordis-catalog
/**
 * 取得全局设定库的页面状态。
 * @returns 当前缓存及读取状态。
 */
getSnapshot(): ConfigurationSnapshot<GlobalSettingLibraryCollection>

/**
 * 订阅全局库变更。
 * @param listener - 接收新状态的回调。
 * @returns 取消订阅函数。
 */
subscribe(listener: (kind: 'configuration', address: string, snapshot: ConfigurationSnapshot<GlobalSettingLibraryCollection>) => void): () => void

/**
 * 读取所有全局设定库。
 * @returns 全局库及并发修改标识。
 */
read(): Promise<GlobalSettingLibraryCollection>

/**
 * 保存全局库内容、启停与删除。
 * @param value - 草稿及读取时的修改标识。
 * @returns 实际保存后的集合。
 */
save(value: GlobalSettingLibraryCollection): Promise<GlobalSettingLibraryCollection>
```

Types: [ConfigurationSnapshot](types-client.md#configurationsnapshot)

Source: [`packages/client/features/dsh-client-character-configuration/src/client/types.ts`](../../packages/client/features/dsh-client-character-configuration/src/client/types.ts)

<a id="ctxeleckoihtmlresources--eleckoihtmlresources"></a>

### `ctx.eleckoiHtmlResources` — `ElecKoiHtmlResources`

Imported HTML presentation resources; no author or script execution API.

```ts cordis-catalog
/**
 * Read presentation resource availability.
 * @returns The resource readiness state and its error text.
 */
getSnapshot(): { status: 'ready'; error: string }

/**
 * Subscribe to resource availability changes.
 * @param listener - Called when the resource state changes.
 * @returns Stops this subscription.
 */
subscribe(listener: () => void): () => void
```

Source: [`packages/client/features/dsh-client-html-resources/src/client/types.ts`](../../packages/client/features/dsh-client-html-resources/src/client/types.ts)

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
 * 读取模型列表并合并当前配置明确声明的参数。
 * @param config - 模型配置和明确声明的模型能力。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
discover(config: ClientModelConfig): Promise<ClientModelOption[]>

/**
 * 按配置编号读取密钥，供用户主动查看。
 * @param configId - 模型配置编号。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
revealApiKey(configId: string): Promise<string>
```

Types: [ClientModelConfig](types-client.md#clientmodelconfig) · [ClientModelOption](types-client.md#clientmodeloption) · [ModelCatalogSnapshot](types-client.md#modelcatalogsnapshot)

Source: [`packages/client/features/dsh-client-models/src/client/types.ts`](../../packages/client/features/dsh-client-models/src/client/types.ts)

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

Source: [`packages/client/features/dsh-client-persona/src/client/types.ts`](../../packages/client/features/dsh-client-persona/src/client/types.ts)

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
 * @param purpose - 目标分类；省略时为角色扮演预设。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
create(name: string, libraryGroupId?: string, purpose?: AgentPresetPurpose): Promise<AgentPreset>

/**
 * 导入预设文件。
 * @param source - 支持的导入格式。
 * @param document - 待导入的文件内容。
 * @param purpose - 目标预设分类。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
import(source: AgentPresetImportSource, document: AgentPresetImportDocument, purpose?: AgentPresetPurpose): Promise<AgentPresetImportResult>

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
 * @param purpose - 所属预设分类。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
createGroup(name: string, purpose?: AgentPresetPurpose): Promise<AgentPresetCatalog>

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

Source: [`packages/client/features/dsh-client-presets/src/client/types.ts`](../../packages/client/features/dsh-client-presets/src/client/types.ts)

<a id="ctxeleckoiregexrules--eleckoiregexrules"></a>

### `ctx.eleckoiRegexRules` — `ElecKoiRegexRules`

读取和保存角色配置，保留完整字段、触发方式和提示词插入位置。

```ts cordis-catalog
/**
 * 获取仅编辑全局和明确归属的独立编辑器；运行时完整配置不受编辑入口影响。
 * @param scope - 角色或预设归属。
 * @param ownerId - 明确的所属编号，不使用当前启用预设代替。
 * @returns 同归属可订阅的正则编辑服务。
 */
editor(scope: 'character' | 'preset', ownerId: string): ElecKoiRegexEditor

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
 * @param options - 测试范围、变量快照 JSON、深度与编辑场景。
 * @param signal - 关闭编辑器或取消测试时结束计算。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
test(text: string, rule: RegexRule, target: RegexRuleTarget, options?: { surface?: 'Display' | 'Prompt' | 'Stored'; variablesJson?: string; depth?: number; isEdit?: boolean }, signal?: AbortSignal): Promise<RegexRuleTestResult>
```

Types: [ConfigurationSnapshot](types-client.md#configurationsnapshot) · [ElecKoiRegexEditor](types-client.md#eleckoiregexeditor)

Source: [`packages/client/features/dsh-client-character-configuration/src/client/types.ts`](../../packages/client/features/dsh-client-character-configuration/src/client/types.ts)

<a id="ctxeleckoiscriptlibraries--eleckoiscriptlibraries"></a>

### `ctx.eleckoiScriptLibraries` — `ElecKoiScriptLibraries`

按正式归属读取、保存和订阅全局、角色与预设脚本库。

```ts cordis-catalog
/**
 * 在 Host 桌面打开指定脚本库的源码目录，不保存当前界面草稿。
 * @param scope - 全局、角色或预设作用域。
 * @param ownerId - 所属编号；全局使用空字符串。
 * @returns 本机目录打开后完成；失败抛出错误。
 */
openDirectory(scope: ScriptLibraryScope, ownerId: string): Promise<void>

/**
 * 读取已加载的脚本库状态。
 * @param scope - 脚本库作用域。
 * @param ownerId - 所属编号；全局为一个空字符串。
 * @returns 当前状态与仍有效的已加载内容。
 */
getSnapshot(scope: ScriptLibraryScope, ownerId: string): ConfigurationSnapshot<ScriptLibrary>

/**
 * 读取并刷新脚本库。
 * @param scope - 脚本库作用域。
 * @param ownerId - 所属编号；全局为一个空字符串。
 * @returns 当前正式脚本库。
 */
read(scope: ScriptLibraryScope, ownerId: string): Promise<ScriptLibrary>

/**
 * 保存完整脚本库并检查修改版本。
 * @param library - 保留读取版本的完整待保存配置。
 * @returns 保存后的配置与新修改版本。
 */
save(library: ScriptLibrary): Promise<ScriptLibrary>

/**
 * 原子保存多个脚本库；任一版本冲突时不修改其他库。
 * @param libraries - 修改过的库及其读取版本。
 * @returns 保存后的完整配置。
 */
saveAll(libraries: ScriptLibrary[]): Promise<ScriptLibrary[]>

/**
 * 订阅已加载库的状态变化。
 * @param listener - 含作用域、所属编号与状态的回调。
 * @returns 取消订阅函数。
 */
subscribe(listener: (scope: ScriptLibraryScope, ownerId: string, snapshot: ConfigurationSnapshot<ScriptLibrary>) => void): () => void

/**
 * 订阅脚本配置及当前预设变更。
 * @param listener - 刷新当前作用域和运行上下文的回调。
 * @returns 取消订阅函数。
 */
subscribeChanges(listener: () => void): () => void

/**
 * 读取当前明确选择的 Agent 预设。
 * @returns 当前预设的编号与名称；选择无效时拒绝。
 */
activePreset(): Promise<{ id: string; name: string }>
```

Types: [ConfigurationSnapshot](types-client.md#configurationsnapshot)

Source: [`packages/client/features/dsh-client-character-configuration/src/client/types.ts`](../../packages/client/features/dsh-client-character-configuration/src/client/types.ts)

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

Source: [`packages/client/features/dsh-client-character-configuration/src/client/types.ts`](../../packages/client/features/dsh-client-character-configuration/src/client/types.ts)

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

Source: [`packages/client/features/dsh-client-character-configuration/src/client/types.ts`](../../packages/client/features/dsh-client-character-configuration/src/client/types.ts)

<a id="ctxeleckoiwebsearch--eleckoiwebsearch"></a>

### `ctx.eleckoiWebSearch` — `ElecKoiWebSearch`

管理搜索、网页抓取和官方 Credentials 中的密钥。

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
 * 修改搜索与抓取方式及 Tavily 返回条数。
 * @param patch - 要修改的配置字段。
 * @returns 操作结果，字段见返回类型；异步失败会拒绝 Promise。
 */
update(patch: WebSearchSettingsPatch): Promise<WebSearchSnapshot>

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

/** 打开「插件 → 网页搜索」官方设置页；不可用时抛出错误。 */
openPluginSettings(): void
```

Types: [WebSearchSettingsPatch](types-client.md#websearchsettingspatch) · [WebSearchSnapshot](types-client.md#websearchsnapshot)

Source: [`packages/client/features/dsh-client-web-search/src/client/types.ts`](../../packages/client/features/dsh-client-web-search/src/client/types.ts)
<!-- END GENERATED cordis-surface -->

## 官方布局服务

`ctx.layout` 直接复用 [官方 ILayout 合同](https://github.com/deepseek-ai/deepseek-harness/blob/1f81c047fc48fa190a683e469daa699857e9afe8/packages/client/ui-layout/src/client/service.ts)，类型从 `@eleckoi/dsh-client-shell/client` 或 `@deepseek-ai/dsh-client-ui-layout/client` 导入。官方 Client 的 `Service` Inspect provider 已提供 `api({ key: "layout" })`，无需重复注册。桌面当前的 `toggleSidebar` 为空操作。
