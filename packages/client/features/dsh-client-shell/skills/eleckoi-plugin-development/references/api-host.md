<!-- Generated from docs/plugins/api-host.md; run pnpm generate:plugin-docs. -->

<!-- 由 pnpm generate:plugin-docs 使用锁定的 DSH 官方生成器生成，请勿手工修改。 -->

# Host 完整服务参考

DSH 基准：`0.2.1-rc.5`，提交 `b830ec950faba0a46dda564be3e2d854afed94f1`。

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
@Remote read(presetId: string): Promise<AgentPreset>

/**
 * 按明确编号原子修改预设原稿的条目及当前版本，不创建聊天私有开关。
 * @param presetId - 要修改的预设编号。
 * @param updates - 条目编号与修改字段；使用该预设的后续请求共同生效。
 * @param signal - 取消调用的信号。
 * @returns 按指定顺序返回保存后的条目；一项失败则整组不保存。
 */
@Remote updateEntries(presetId: string, updates: SettingLibraryEntryUpdate[], signal: AbortSignal): SettingLibraryEntry[]

/**
 * 保存完整数据并通知相关页面刷新。
 * @param preset - 完整预设数据。
 * @param expectedRegexRules - 要求仍有效的正则配置。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote save(preset: AgentPreset, expectedRegexRules: RegexRule[]): Promise<AgentPreset>

/**
 * 创建预设并返回完整预设数据。
 * @param name - 保存的名称或附件文件名。
 * @param libraryGroupId - 预设分组编号。
 * @param purpose - 角色扮演或创作预设分类。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote create(name: string, libraryGroupId: string, purpose: AgentPresetPurpose): Promise<AgentPreset>

/**
 * 导入文件并保存完整数据。
 * @param source - 支持的导入格式。
 * @param document - 待导入文件内容。
 * @param purpose - 目标预设分类。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote async import(source: AgentPresetImportSource, document: AgentPresetImportDocument, purpose: AgentPresetPurpose): Promise<AgentPresetImportResult>

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
 * @param purpose - 所属预设分类。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote createGroup(name: string, purpose: AgentPresetPurpose): AgentPresetCatalog

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

Types: [AgentPreset](types-host.md#agentpreset) · [AgentPresetCatalog](types-host.md#agentpresetcatalog) · [AgentPresetExportFormat](types-host.md#agentpresetexportformat) · [AgentPresetExportResult](types-host.md#agentpresetexportresult) · [AgentPresetImportDocument](types-host.md#agentpresetimportdocument) · [AgentPresetImportResult](types-host.md#agentpresetimportresult) · [AgentPresetImportSource](types-host.md#agentpresetimportsource) · [AgentPresetPurpose](types-host.md#agentpresetpurpose) · [RegexRule](types-host.md#regexrule) · [SettingLibraryEntry](types-host.md#settinglibraryentry) · [SettingLibraryEntryUpdate](types-host.md#settinglibraryentryupdate)

Source: [`packages/host/product-api/src/index.ts`](../../packages/host/product-api/src/index.ts)

<a id="ctxeleckoiauthorfrontendsapi--eleckoiauthorfrontendsapi"></a>

### `ctx.eleckoiAuthorFrontendsApi` — `ElecKoiAuthorFrontendsApi`

原生前端文件项目、明确归属、选择与资源操作的正式 Remote。

```ts cordis-catalog
/**
 * 读取明确所属应用或角色的前端项目与选择。
 * @param owner - 应用作用域，或带明确角色编号的角色作用域。
 * @returns 项目列表、选择、绑定和修改版本。
 */
@Remote workspace(owner: FrontendOwner): FrontendWorkspace

/**
 * 导入 HTML、ZIP 或明确文件列表，保留项目额外元数据。
 * @param owner - 项目所属作用域。
 * @param input - 文件、入口与清单；普通导入创建新项目编号。
 * @returns 导入后的工作区。
 */
@Remote importProject(owner: FrontendOwner, input: FrontendImport): FrontendWorkspace

/**
 * 选择同一所属对象的项目，null 撤回自定义页面。
 * @param owner - 项目所属作用域。
 * @param projectId - 明确项目编号或 null。
 * @returns 修改后的工作区。
 */
@Remote select(owner: FrontendOwner, projectId: string | null): FrontendWorkspace

/**
 * 删除明确项目与资源，失败时保留原登记和文件。
 * @param owner - 项目所属作用域。
 * @param projectId - 明确项目编号。
 * @returns 删除后的工作区。
 */
@Remote delete(owner: FrontendOwner, projectId: string): FrontendWorkspace

/**
 * 读取登记文件；不指定路径时读取该项目的明确入口。
 * @param owner - 项目所属作用域。
 * @param projectId - 明确项目编号。
 * @param input - 项目内路径与编码；省略路径使用入口，省略编码使用 utf8。
 * @returns 路径、编码后的内容与 MIME 类型。
 */
@Remote readFile(owner: FrontendOwner, projectId: string, input: FrontendFileQuery): FrontendFile

/**
 * 写入明确文件，连同项目清单更新，失败时恢复原文件。
 * @param owner - 项目所属作用域。
 * @param projectId - 明确项目编号。
 * @param file - 路径、内容和编码。
 * @returns 修改后的工作区。
 */
@Remote writeFile(owner: FrontendOwner, projectId: string, file: FrontendFileInput): FrontendWorkspace

/**
 * 导出完整资源及清单，不改变原项目。
 * @param owner - 项目所属作用域。
 * @param projectId - 明确项目编号。
 * @returns ZIP 文件名、base64 数据和项目登记。
 */
@Remote exportProject(owner: FrontendOwner, projectId: string): FrontendExport

/**
 * 修改该工作区的消息渲染器开关。
 * @param owner - 明确作用域。
 * @param enabled - 是否启用消息渲染器。
 * @returns 修改后的工作区。
 */
@Remote setMessageRenderer(owner: FrontendOwner, enabled: boolean): FrontendWorkspace

/**
 * 修改项目名称、入口或清单，不改变编号、归属及文件列表。
 * @param owner - 项目所属作用域。
 * @param projectId - 明确项目编号。
 * @param patch - 明确的项目字段补丁。
 * @returns 修改后的工作区。
 */
@Remote updateProject(owner: FrontendOwner, projectId: string, patch: FrontendJson): FrontendWorkspace

/**
 * 一次修改文件、删除路径与清单，验证引用后才提交。
 * @param owner - 项目所属作用域。
 * @param projectId - 明确项目编号。
 * @param input - 文件修改、明确删除路径与清单。
 * @returns 修改后的工作区。
 */
@Remote replaceFiles(owner: FrontendOwner, projectId: string, input: FrontendReplaceFiles): FrontendWorkspace

/**
 * 撤回自定义项目的选择，保留文件供以后再次启用。
 * @param owner - 明确作用域。
 * @returns 修改后的工作区。
 */
@Remote restoreDefault(owner: FrontendOwner): FrontendWorkspace

/**
 * 订阅该工作区的重读通知；合并待消费的通知，不回放编辑历史。
 * @param owner - 明确作用域。
 * @param signal - 取消订阅并释放等待者。
 * @returns 首次快照版本及后续最新修改版本，不传输源码或素材正文。
 */
@Remote({ mode: 'stream' }) changes(owner: FrontendOwner, signal: AbortSignal): AsyncIterable<NativeFrontendChange>
```

Types: [FrontendExport](types-host.md#frontendexport) · [FrontendFile](types-host.md#frontendfile) · [FrontendFileInput](types-host.md#frontendfileinput) · [FrontendFileQuery](types-host.md#frontendfilequery) · [FrontendImport](types-host.md#frontendimport) · [FrontendJson](types-host.md#frontendjson) · [FrontendOwner](types-host.md#frontendowner) · [FrontendReplaceFiles](types-host.md#frontendreplacefiles) · [FrontendWorkspace](types-host.md#frontendworkspace) · [NativeFrontendChange](types-host.md#nativefrontendchange)

Source: [`packages/host/product-api/src/author-frontends.ts`](../../packages/host/product-api/src/author-frontends.ts)

<a id="ctxeleckoiauthorscriptsapi--eleckoiauthorscriptsapi"></a>

### `ctx.eleckoiAuthorScriptsApi` — `ElecKoiAuthorScriptsApi`

Native script source stays in product-data; only live callbacks cross this stream.

```ts cordis-catalog
/**
 * 读取当前聊天的全局、活动预设与角色原生脚本，不改写未声明原生标准的源码。
 * @param conversationId - ElecKoi 聊天编号。
 * @returns 按库与树顺序排列的启用脚本、所属配置和运行版本。
 */
@Remote read(conversationId: string): NativeAuthorScriptCatalog

/** 读取当前运行脚本或其所属库的设置与修改版本。
 * @param conversationId - 固定聊天编号。
 * @param version - 实际运行的程序版本。
 * @param identity - 明确的脚本作用域、所有者与编号。
 * @param target - 脚本设置或所属库共享设置。
 * @param signal - 取消读取。
 * @returns JSON 设置及库修改版本。
 */
@Remote getSettings(conversationId: string, version: string, identity: NativeAuthorScriptIdentity, target: 'script' | 'library', signal: AbortSignal): NativeAuthorScriptSettings

/** 保存当前脚本或所属库设置，不替换源码、不重新启动程序。
 * @param conversationId - 固定聊天编号。
 * @param version - 实际运行的程序版本。
 * @param identity - 明确脚本身份。
 * @param target - 脚本设置或所属库共享设置。
 * @param settingsJson - 完整 JSON 对象。
 * @param expectedRevision - 最近读取的库修改版本。
 * @param signal - 保存前取消。
 * @returns 已保存的设置与新修改版本。
 */
@Remote setSettings(conversationId: string, version: string, identity: NativeAuthorScriptIdentity, target: 'script' | 'library', settingsJson: string, expectedRevision: number, signal: AbortSignal): NativeAuthorScriptSettings

/**
 * 在脚本启动成功后建立本聊天唯一的原生变量规则流；断开会取消未完成修改。
 * @param conversationId - ElecKoi 聊天编号。
 * @param version - read 返回并实际启动的脚本版本。
 * @param signal - 取消连接与正在等待的规则。
 * @returns 就绪通知及变量候选任务；上行只接受本流任务的成功结果或明确错误。
 */
@Remote({ mode: 'stream' }) async *connect(conversationId: string, version: string, signal: AbortSignal): RemoteStream<NativeAuthorRuleTask, NativeAuthorRuleReply>
```

Types: [NativeAuthorRuleReply](types-host.md#nativeauthorrulereply) · [NativeAuthorRuleTask](types-host.md#nativeauthorruletask) · [NativeAuthorScriptCatalog](types-host.md#nativeauthorscriptcatalog) · [NativeAuthorScriptIdentity](types-host.md#nativeauthorscriptidentity) · [NativeAuthorScriptSettings](types-host.md#nativeauthorscriptsettings)

Source: [`packages/host/product-api/src/author-scripts.ts`](../../packages/host/product-api/src/author-scripts.ts)

<a id="ctxeleckoiauthorvariablesapi--eleckoiauthorvariablesapi"></a>

### `ctx.eleckoiAuthorVariablesApi` — `ElecKoiAuthorVariablesApi`

Native author variables share the Agent candidate processor and product repository.

```ts cordis-catalog
/**
 * 读取原生聊天的当前变量，不返回历史消息或其他聊天的状态。
 * @param conversationId - ElecKoi 聊天编号。
 * @returns 当前变量对象的 JSON 文本。
 */
@Remote getState(conversationId: string): string

/**
 * 读取该聊天绑定的原生变量配置。
 * @param conversationId - ElecKoi 聊天编号。
 * @returns 变量配置；未绑定角色变量配置时返回 null。
 */
@Remote getConfig(conversationId: string): VariableConfig | null

/**
 * 替换当前变量，等待作者规则处理后才保存。
 * @param conversationId - ElecKoi 聊天编号。
 * @param stateJson - 完整变量对象的 JSON 文本。
 * @param signal - 取消处理；取消后不保存候选数据。
 * @returns 已接受并保存的变量对象 JSON 文本。
 */
@Remote async setState(conversationId: string, stateJson: string, signal: AbortSignal): Promise<string>

/**
 * 将对象递归合并到本次原生变量候选，数组与标量替换对应字段。
 * @param conversationId - ElecKoi 聊天编号。
 * @param stateJson - 合并对象的 JSON 文本。
 * @param signal - 取消处理；取消后不保存候选数据。
 * @returns 已接受并保存的变量对象 JSON 文本。
 */
@Remote async merge(conversationId: string, stateJson: string, signal: AbortSignal): Promise<string>

/**
 * 按原生 SDK 的 add、replace、remove 与 JSON Pointer 修改变量候选。
 * @param conversationId - ElecKoi 聊天编号。
 * @param patchJson - 原生变量补丁数组的 JSON 文本。
 * @param signal - 取消处理；取消后不保存候选数据。
 * @returns 已接受并保存的变量对象 JSON 文本。
 */
@Remote async applyPatch(conversationId: string, patchJson: string, signal: AbortSignal): Promise<string>

/**
 * 用聊天绑定的初始变量发起一次原生修改，仍等待作者规则完成。
 * @param conversationId - ElecKoi 聊天编号。
 * @param signal - 取消处理；取消后不保存候选数据。
 * @returns 已接受并保存的变量对象 JSON 文本。
 */
@Remote async reset(conversationId: string, signal: AbortSignal): Promise<string>
```

Types: [VariableConfig](types-host.md#variableconfig)

Source: [`packages/host/product-api/src/author-variables.ts`](../../packages/host/product-api/src/author-variables.ts)

<a id="ctxeleckoiautoillustration--eleckoiautoillustration"></a>

### `ctx.eleckoiAutoIllustration` — `ElecKoiAutoIllustration`

独立自动配图插件提供的本轮提示词与已有分镜重画能力。

```ts cordis-catalog
/**
 * 取得根角色会话本轮启用的配图指令。
 * @param snapshot - 已准备好的当前会话配置。
 * @returns 本轮指令；停用或未绑定模型时为空。
 */
instructions(snapshot: IllustrationSessionConfiguration): string

/**
 * 通过当前插件绑定的模型重画已有分镜，保留其他图片与正文。
 * @param sessionId - 角色会话编号。
 * @param batchId - 原配图批次编号。
 * @param frameId - 原分镜编号。
 * @param snapshot - 当前会话的自动配图配置。
 * @param signal - 调用取消信号。
 * @returns 重画的错误状态；完整图片结果通过原会话事件发布。
 */
regenerateImage(sessionId: string, batchId: string, frameId: number, snapshot: IllustrationSessionConfiguration, signal: AbortSignal): Promise<{ error?: string }>
```

Types: [IllustrationSessionConfiguration](types-host.md#illustrationsessionconfiguration)

Source: [`packages/client/features/dsh-auto-illustration/src/index.d.ts`](../../packages/client/features/dsh-auto-illustration/src/index.d.ts)

<a id="ctxeleckoicharacterconfigurationapi--eleckoicharacterconfigurationapi"></a>

### `ctx.eleckoiCharacterConfigurationApi` — `ElecKoiCharacterConfigurationApi`

管理完整设定库、变量定义和正则配置，通过官方 Typert Remote 公开跨端调用。

```ts cordis-catalog
/**
 * 读取明确归属的命名配置版本，脚本归档只在需要编辑版本时读取。
 * @param address - 类型、作用域与所属编号；全局使用空所属编号。
 * @returns 当前版本、命名版本正文和并发修改标识。
 */
@Remote readEditorLibraryVersions(address: EditorLibraryAddress): EditorLibraryVersions

/**
 * 原子保存配置草稿及其命名版本，源码资源在同一操作中保持完整。
 * @param request - 明确类型的配置文档、版本草稿与读取时的修改标识。
 * @returns 保存后的配置文档和版本；冲突时保留原数据。
 */
@Remote saveEditorLibraries(request: EditorLibrarySaveRequest): EditorLibrarySaveResult

/**
 * 订阅变更通知；连接后首先收到刷新标记，取消信号结束此异步流。
 * @param signal - 取消调用或结束订阅流的信号。
 * @returns 按发生顺序返回变更通知的异步流。
 */
@Remote({ mode: 'stream' }) changes(signal: AbortSignal): AsyncIterable<CharacterConfigurationChange>

/**
 * 读取独立于设定库的角色开场白。
 * @param characterId - 所属角色编号。
 * @returns 当前开场白、备用开场白及变量绑定。
 */
@Remote readCharacterOpenings(characterId: string): CharacterOpenings

/**
 * 保存角色独立开场白，不修改任何设定库版本。
 * @param characterId - 所属角色编号。
 * @param value - 完整开场白草稿。
 * @returns 实际保存后的角色开场白配置。
 */
@Remote saveCharacterOpenings(characterId: string, value: CharacterOpenings): CharacterOpenings

/**
 * 读取完整角色设定库，包含必读、选读、触发方式和插入位置。
 * @param characterId - 角色编号。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote readSettingLibrary(characterId: string): SettingLibrary

/**
 * 读取独立的全局设定库集合，不属于任何角色版本。
 * @returns 全局库及并发修改标识。
 */
@Remote readGlobalSettingLibraries(): GlobalSettingLibraryCollection

/**
 * 原子保存全局库的内容、启停和删除；冲突时保留原数据。
 * @param value - 全局库草稿及读取时的修改标识。
 * @returns 已保存的全局库集合。
 */
@Remote saveGlobalSettingLibraries(value: GlobalSettingLibraryCollection): GlobalSettingLibraryCollection

/**
 * 保存角色设定库的当前内容，保留其他版本与管理设置。
 * @param characterId - 所属角色编号。
 * @param library - 设定库原文、文件夹和插入位置定义。
 * @param signal - 取消调用的信号。
 * @returns 实际保存后的角色设定库，仍采用现有请求规则。
 */
@Remote replaceSettingLibraryContent( characterId: string, library: SettingLibraryContent, signal: AbortSignal ): SettingLibrary

/**
 * 按明确编号原子修改角色设定库的普通条目，只保存指定字段。
 * @param characterId - 所属角色编号。
 * @param updates - 条目编号与修改字段；不得重复指定同一编号。
 * @param signal - 取消调用的信号。
 * @returns 按指定顺序返回保存后的条目；一项失败则整组不保存。
 */
@Remote updateSettingLibraryEntries( characterId: string, updates: SettingLibraryEntryUpdate[], signal: AbortSignal ): SettingLibraryEntry[]

/**
 * 读取指定作用域的正式脚本库。
 * @param scope - 全局、角色或预设作用域。
 * @param ownerId - 所属角色或预设编号；全局作用域使用空字符串。
 * @returns 脚本配置、库启停与修改版本。
 */
@Remote readScriptLibrary(scope: ScriptLibraryScope, ownerId: string): ScriptLibrary

/**
 * 读取脚本文件目录与已登记的入口文件，目录不存在时创建空目录。
 * @param scope - 全局、角色或预设作用域。
 * @param ownerId - 所属编号；全局使用空字符串。
 * @returns 本机目录、文件版本与按明确脚本编号登记的入口。
 */
@Remote readScriptWorkspace(scope: ScriptLibraryScope, ownerId: string): ScriptWorkspace

/**
 * 保存脚本库，检查修改版本以防止覆盖其他窗口或 SDK 的更新。
 * @param library - 完整脚本库，revision 为读取时的版本。
 * @returns 保存后的配置与新版本。
 */
@Remote saveScriptLibrary(library: ScriptLibrary): ScriptLibrary

/**
 * 在同一事务中保存多个脚本库；任一版本冲突时全部保留原值。
 * @param libraries - 本页修改的脚本库及各自读取版本。
 * @returns 保存后的脚本库配置。
 */
@Remote saveScriptLibraries(libraries: ScriptLibrary[]): ScriptLibrary[]

/**
 * 原子导入设定库，旧文件中的开场白追加为备用开场白并保持当前开场白不变。
 * @param characterId - 所属角色编号。
 * @param library - 已并入导入版本的设定库草稿。
 * @param openingImports - 旧文件明确携带的开场白条目；不包含时传空数组。
 * @returns 实际保存后的设定库；变量绑定无效时整次导入回滚。
 */
@Remote importSettingLibrary(characterId: string, library: SettingLibrary, openingImports: CharacterOpeningMessage[]): SettingLibrary

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
 * 读取全局及明确归属的正则，不依赖当前启用预设或角色。
 * @param target - 编辑归属，必须提供明确的角色或预设编号。
 * @returns 仅含允许范围的规则及版本成员。
 */
@Remote readRegexEditor(target: RegexEditorTarget): RegexRuleEditorCollection

/**
 * 原子保存全局及编辑归属的正则，保留其他归属的规则与版本成员。
 * @param collection - 携带全局及归属版本校验的编辑草稿。
 * @returns 保存后的编辑配置；过期草稿拒绝保存。
 */
@Remote saveRegexEditor(collection: RegexRuleEditorCollection): RegexRuleEditorCollection

/**
 * 导入全局及指定归属的规则，拒绝跨归属文件。
 * @param collection - 导入前的编辑配置与版本。
 * @param fallbackScope - 文件没有归属字段时使用的允许范围。
 * @param documents - 正则 JSON 文件。
 * @returns 导入结果；归属冲突时不写入。
 */
@Remote importRegexEditor(collection: RegexRuleEditorCollection, fallbackScope: RegexRuleScope, documents: RegexRuleImportDocument[]): RegexRuleEditorImportResult

/**
 * 导出当前编辑归属内选中的规则。
 * @param target - 明确的编辑归属。
 * @param ruleIds - 仅限当前编辑器中的规则编号。
 * @returns 可下载的 JSON 文件名与内容。
 */
@Remote exportRegexEditor(target: RegexEditorTarget, ruleIds: string[]): { fileName: string; json: string }

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
 * @param options - 测试范围、变量快照 JSON、深度与编辑场景。
 * @param signal - 关闭编辑器或取消测试时结束计算。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote testRegexRule(text: string, rule: RegexRule, target: RegexRuleTarget, options?: { surface?: 'Display' | 'Prompt' | 'Stored'; variablesJson?: string; depth?: number; isEdit?: boolean }, signal?: AbortSignal): Promise<RegexRuleTestResult>
```

Types: [CharacterConfigurationChange](types-host.md#characterconfigurationchange) · [CharacterOpeningMessage](types-host.md#characteropeningmessage) · [CharacterOpenings](types-host.md#characteropenings) · [EditorLibraryAddress](types-host.md#editorlibraryaddress) · [EditorLibrarySaveRequest](types-host.md#editorlibrarysaverequest) · [EditorLibrarySaveResult](types-host.md#editorlibrarysaveresult) · [EditorLibraryVersions](types-host.md#editorlibraryversions) · [GlobalSettingLibraryCollection](types-host.md#globalsettinglibrarycollection) · [RegexEditorTarget](types-host.md#regexeditortarget) · [RegexRule](types-host.md#regexrule) · [RegexRuleCollection](types-host.md#regexrulecollection) · [RegexRuleEditorCollection](types-host.md#regexruleeditorcollection) · [RegexRuleEditorImportResult](types-host.md#regexruleeditorimportresult) · [RegexRuleImportDocument](types-host.md#regexruleimportdocument) · [RegexRuleImportResult](types-host.md#regexruleimportresult) · [RegexRuleScope](types-host.md#regexrulescope) · [RegexRuleTarget](types-host.md#regexruletarget) · [RegexRuleTestResult](types-host.md#regexruletestresult) · [ScriptLibrary](types-host.md#scriptlibrary) · [ScriptLibraryScope](types-host.md#scriptlibraryscope) · [ScriptWorkspace](types-host.md#scriptworkspace) · [SettingLibrary](types-host.md#settinglibrary) · [SettingLibraryContent](types-host.md#settinglibrarycontent) · [SettingLibraryConversation](types-host.md#settinglibraryconversation) · [SettingLibraryEntry](types-host.md#settinglibraryentry) · [SettingLibraryEntryUpdate](types-host.md#settinglibraryentryupdate) · [VariableConfig](types-host.md#variableconfig)

Source: [`packages/host/product-api/src/index.ts`](../../packages/host/product-api/src/index.ts)

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
 * 复制角色卡及其专属配置和资源，保留原卡并创建独立副本。
 * @param characterId - 原角色编号。
 * @returns 新角色编号和更新后的目录；失败抛出错误。
 */
@Remote duplicate(characterId: string): { characterId: string; collection: CharacterCollection }

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
 * 删除指定角色及其前端项目、关联聊天和官方 Session。
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

Source: [`packages/host/product-api/src/index.ts`](../../packages/host/product-api/src/index.ts)

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

Source: [`packages/host/product-api/src/index.ts`](../../packages/host/product-api/src/index.ts)

<a id="ctxeleckoiconversationsapi--eleckoiconversationsapi"></a>

### `ctx.eleckoiConversationsApi` — `ElecKoiConversationsApi`

管理聊天目录、产品资料和官方 Session 消息修改，通过官方 Typert Remote 公开跨端调用。

```ts cordis-catalog
/**
 * 读取本聊天生图记录引用的单张图片。
 * @param conversationId - 聊天编号。
 * @param batchId - 生图指令编号。
 * @param frameId - 图片编号。
 * @param attachmentId - 当前正式图片对象编号。
 * @param signal - 取消图片读取的信号。
 * @returns 图片媒体类型和 Base64 数据。
 */
@Remote readGeneratedImage(conversationId: string, batchId: string, frameId: number, attachmentId: string, signal: AbortSignal): Promise<{ mediaType: string; data: string }>

/**
 * 从原始 AI 回复重新解析提示词，只重画选中的单张图片。
 * @param conversationId - 聊天编号。
 * @param batchId - 本轮生图指令编号。
 * @param frameId - 指令中的图片编号。
 * @param signal - 取消生图请求的信号。
 * @returns 图片生成与记录保存完成；失败抛出可诊断错误。
 */
@Remote async regenerateImage(conversationId: string, batchId: string, frameId: number, signal: AbortSignal): Promise<void>

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
 * 按聊天绑定的变量版本执行作者规则，并保存处理结果。
 * @param conversationId - ElecKoi 聊天编号。
 * @param stateJson - 完整变量对象的 JSON 文本。
 * @param signal - 取消本次变量处理；取消后不保存候选结果。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote async replaceVariableState(conversationId: string, stateJson: string, signal: AbortSignal): Promise<string>

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
 * 等待当前进程本次产品保存，失败抛出错误；不查询历史或重启前结果。
 * @param conversationId - ElecKoi 聊天编号。
 * @param operationId - 生成准备时返回的本次操作编号。
 * @returns 本轮产品保存完成；此方法不启动模型。
 */
@Remote async waitForGeneration(conversationId: string, operationId: string): Promise<void>

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

Source: [`packages/host/product-api/src/index.ts`](../../packages/host/product-api/src/index.ts)

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

Source: [`packages/host/product-api/src/index.ts`](../../packages/host/product-api/src/index.ts)

<a id="ctxeleckoicreatorstudiosessionsapi--eleckoicreatorstudiosessionsapi"></a>

### `ctx.eleckoiCreatorStudioSessionsApi` — `ElecKoiCreatorStudioSessionsApi`

AI 创作工作室的 DSH 会话与永久编辑目标。

```ts cordis-catalog
/**
 * 列出工作室的正式 DSH 会话。
 * @returns 工作室会话目录。
 */
@Remote list(): Promise<CreatorStudioSessionSummary[]>

/**
 * 使用当前全局创作预设创建工作室会话。
 * @param characterId - 编辑目标角色编号；空字符串表示尚未选择。
 * @returns 创建的会话及其编辑目标。
 */
@Remote create(characterId: string): Promise<CreatorStudioSession>

/**
 * 恢复一个已有工作室会话。
 * @param sessionId - 正式 DSH 会话编号。
 * @returns 恢复的会话及其编辑目标。
 */
@Remote open(sessionId: string): Promise<CreatorStudioSession>

/**
 * 在空闲会话中选择永久编辑目标。
 * @param sessionId - 正式 DSH 会话编号。
 * @param characterId - 目标角色编号；空字符串解除选择。
 * @returns 更新后的工作室会话。
 */
@Remote selectCharacter(sessionId: string, characterId: string): Promise<CreatorStudioSession>

/**
 * 修改工作室对话的正式标题。
 * @param sessionId - 工作室会话编号。
 * @param title - 新标题。
 * @returns 标题保存完成。
 */
@Remote rename(sessionId: string, title: string): Promise<void>

/**
 * 设置工作室对话的置顶状态。
 * @param sessionId - 工作室会话编号。
 * @param pinned - 是否置顶。
 * @returns 置顶状态保存完成。
 */
@Remote pin(sessionId: string, pinned: boolean): Promise<void>

/**
 * 删除工作室对话及其正式 Session 文件。
 * @param sessionId - 工作室会话编号。
 * @returns 删除完成。
 */
@Remote delete(sessionId: string): Promise<void>

/**
 * 读取工作室可操作的用户和助手消息。
 * @param sessionId - 工作室会话编号。
 * @returns 消息正文及正式事件位置。
 */
@Remote messages(sessionId: string): Promise<CreatorStudioMessage[]>

/**
 * 从指定消息起删除当前对话的后续消息。
 * @param sessionId - 工作室会话编号。
 * @param eventSeq - 起始消息的正式事件序号。
 * @param role - 起始消息的角色。
 * @returns 删除完成。
 */
@Remote deleteMessagesFrom(sessionId: string, eventSeq: number, role: 'user' | 'assistant'): Promise<void>

/**
 * 保留最近的用户输入并重新生成回复。
 * @param sessionId - 工作室会话编号。
 * @returns 重新生成已启动。
 */
@Remote regenerate(sessionId: string): Promise<void>
```

Types: [CreatorStudioMessage](types-host.md#creatorstudiomessage) · [CreatorStudioSession](types-host.md#creatorstudiosession) · [CreatorStudioSessionSummary](types-host.md#creatorstudiosessionsummary)

Source: [`packages/host/product-api/src/index.ts`](../../packages/host/product-api/src/index.ts)

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

Source: [`packages/host/product-api/src/index.ts`](../../packages/host/product-api/src/index.ts)

<a id="ctxeleckoimodelsapi--eleckoimodelsapi"></a>

### `ctx.eleckoiModelsApi` — `ElecKoiModelsApi`

管理模型目录和用户主动查看的密钥，通过官方 Typert Remote 公开跨端调用。

```ts cordis-catalog
/**
 * 按模型配置编号读取密钥，供用户主动查看。
 * @param configId - 模型配置编号。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote revealApiKey(configId: string): Promise<string>

/**
 * 读取模型目录，能力来自官方目录或明确配置。
 * @param input - 本次操作的输入，字段见参数类型。
 * @returns 操作结果，结构见返回类型；失败抛出错误。
 */
@Remote discoverModels(input: ModelDiscoveryInput): Promise<ModelDiscoveryResult[]>
```

Types: [ModelDiscoveryInput](types-host.md#modeldiscoveryinput) · [ModelDiscoveryResult](types-host.md#modeldiscoveryresult)

Source: [`packages/host/product-api/src/index.ts`](../../packages/host/product-api/src/index.ts)

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

Source: [`packages/host/product-api/src/index.ts`](../../packages/host/product-api/src/index.ts)

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

Source: [`packages/client/features/dsh-client-roleplay/src/host/request-preview.d.mts`](../../packages/client/features/dsh-client-roleplay/src/host/request-preview.d.mts)

<a id="ctxeleckoisessioneditor--eleckoisessioneditor"></a>

### `ctx.eleckoiSessionEditor` — `ElecKoiSessionEditor`

修改同一个官方 Session 的消息和回退位置，保留 Session 编号。

```ts cordis-catalog
/**
 * 将导入的正文写入新建的空白官方 Session，并刷新消息投影。
 * @param sessionId - 空白官方 Session 编号。
 * @param messages - 按实际顺序排列的正文和可选变量快照。
 * @returns 各消息的正式事件与轮次标识。
 */
importTranscript(sessionId: string, messages: Array<{ role: 'user' | 'assistant'; content: string; variableStateJson?: string }>): Promise<Array<{ role: 'user' | 'assistant'; content: string; variableStateJson?: string; id: string; sessionEventSeq: number; turn: number | null }>>

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

Source: [`packages/host/product-api/src/sessionEditor.ts`](../../packages/host/product-api/src/sessionEditor.ts)

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

Source: [`packages/host/product-api/src/index.ts`](../../packages/host/product-api/src/index.ts)

<a id="ctxeleckoiwebsearchapi--eleckoiwebsearchapi"></a>

### `ctx.eleckoiWebSearchApi` — `ElecKoiWebSearchApi`

管理搜索、网页抓取和连接测试，通过官方 Typert Remote 公开跨端调用。

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

/**
 * 读取网页抓取方式。
 * @returns 当前网页抓取提供商。
 */
@Remote fetchSelection(): WebFetchMode

/**
 * 保存网页抓取方式，不改变搜索方式。
 * @param mode - 网页抓取方式。
 * @returns 已保存的网页抓取提供商。
 */
@Remote async selectFetch(mode: WebFetchMode): Promise<WebFetchMode>
```

Types: [TavilyConnection](types-host.md#tavilyconnection) · [WebFetchMode](types-host.md#webfetchmode) · [WebSearchMode](types-host.md#websearchmode)

Source: [`packages/host/product-api/src/index.ts`](../../packages/host/product-api/src/index.ts)
<!-- END GENERATED cordis-surface -->
