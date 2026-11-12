/** 由 pnpm generate:plugin-docs 生成。公开服务的只读目录，与完整参考使用同一份源码分析结果。 */

import { productFailure } from './productFailure.js'
import { ELECKOI_FAILURE_CODES } from './errorCodes.generated.js'

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
        signature: '@Remote read(presetId: string): Promise<AgentPreset>',
        description: '读取完整保存数据。',
        parameters: [{ name: 'presetId', description: '预设编号。' }],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
      {
        signature: '@Remote updateEntries(presetId: string, updates: SettingLibraryEntryUpdate[], signal: AbortSignal): SettingLibraryEntry[]',
        description: '按明确编号原子修改预设原稿的条目及当前版本，不创建聊天私有开关。',
        parameters: [{ name: 'presetId', description: '要修改的预设编号。' }, { name: 'updates', description: '条目编号与修改字段；使用该预设的后续请求共同生效。' }, { name: 'signal', description: '取消调用的信号。' }],
        returns: '按指定顺序返回保存后的条目；一项失败则整组不保存。',
      },
      {
        signature: '@Remote save(preset: AgentPreset, expectedRegexRules: RegexRule[]): Promise<AgentPreset>',
        description: '保存完整数据并通知相关页面刷新。',
        parameters: [{ name: 'preset', description: '完整预设数据。' }, { name: 'expectedRegexRules', description: '要求仍有效的正则配置。' }],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
      {
        signature: '@Remote create(name: string, libraryGroupId: string, purpose: AgentPresetPurpose): Promise<AgentPreset>',
        description: '创建预设并返回完整预设数据。',
        parameters: [{ name: 'name', description: '保存的名称或附件文件名。' }, { name: 'libraryGroupId', description: '预设分组编号。' }, { name: 'purpose', description: '角色扮演或创作预设分类。' }],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
      {
        signature: '@Remote async import(source: AgentPresetImportSource, document: AgentPresetImportDocument, purpose: AgentPresetPurpose): Promise<AgentPresetImportResult>',
        description: '导入文件并保存完整数据。',
        parameters: [{ name: 'source', description: '支持的导入格式。' }, { name: 'document', description: '待导入文件内容。' }, { name: 'purpose', description: '目标预设分类。' }],
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
        signature: '@Remote createGroup(name: string, purpose: AgentPresetPurpose): AgentPresetCatalog',
        description: '创建预设分组。',
        parameters: [{ name: 'name', description: '保存的名称或附件文件名。' }, { name: 'purpose', description: '所属预设分类。' }],
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
    key: 'eleckoiAuthorFrontendsApi',
    summary: '原生前端文件项目、明确归属、选择与资源操作的正式 Remote。',
    description: '原生前端文件项目、明确归属、选择与资源操作的正式 Remote。',
    methods: [
      {
        signature: '@Remote workspace(owner: FrontendOwner): FrontendWorkspace',
        description: '读取明确所属应用或角色的前端项目与选择。',
        parameters: [{ name: 'owner', description: '应用作用域，或带明确角色编号的角色作用域。' }],
        returns: '项目列表、选择、绑定和修改版本。',
      },
      {
        signature: '@Remote importProject(owner: FrontendOwner, input: FrontendImport): FrontendWorkspace',
        description: '导入 HTML、ZIP 或明确文件列表，保留项目额外元数据。',
        parameters: [{ name: 'owner', description: '项目所属作用域。' }, { name: 'input', description: '文件、入口与清单；普通导入创建新项目编号。' }],
        returns: '导入后的工作区。',
      },
      {
        signature: '@Remote select(owner: FrontendOwner, projectId: string | null): FrontendWorkspace',
        description: '选择同一所属对象的项目，null 撤回自定义页面。',
        parameters: [{ name: 'owner', description: '项目所属作用域。' }, { name: 'projectId', description: '明确项目编号或 null。' }],
        returns: '修改后的工作区。',
      },
      {
        signature: '@Remote delete(owner: FrontendOwner, projectId: string): FrontendWorkspace',
        description: '删除明确项目与资源，失败时保留原登记和文件。',
        parameters: [{ name: 'owner', description: '项目所属作用域。' }, { name: 'projectId', description: '明确项目编号。' }],
        returns: '删除后的工作区。',
      },
      {
        signature: '@Remote readFile(owner: FrontendOwner, projectId: string, input: FrontendFileQuery): FrontendFile',
        description: '读取登记文件；不指定路径时读取该项目的明确入口。',
        parameters: [{ name: 'owner', description: '项目所属作用域。' }, { name: 'projectId', description: '明确项目编号。' }, { name: 'input', description: '项目内路径与编码；省略路径使用入口，省略编码使用 utf8。' }],
        returns: '路径、编码后的内容与 MIME 类型。',
      },
      {
        signature: '@Remote writeFile(owner: FrontendOwner, projectId: string, file: FrontendFileInput): FrontendWorkspace',
        description: '写入明确文件，连同项目清单更新，失败时恢复原文件。',
        parameters: [{ name: 'owner', description: '项目所属作用域。' }, { name: 'projectId', description: '明确项目编号。' }, { name: 'file', description: '路径、内容和编码。' }],
        returns: '修改后的工作区。',
      },
      {
        signature: '@Remote exportProject(owner: FrontendOwner, projectId: string): FrontendExport',
        description: '导出完整资源及清单，不改变原项目。',
        parameters: [{ name: 'owner', description: '项目所属作用域。' }, { name: 'projectId', description: '明确项目编号。' }],
        returns: 'ZIP 文件名、base64 数据和项目登记。',
      },
      {
        signature: '@Remote setMessageRenderer(owner: FrontendOwner, enabled: boolean): FrontendWorkspace',
        description: '修改该工作区的消息渲染器开关。',
        parameters: [{ name: 'owner', description: '明确作用域。' }, { name: 'enabled', description: '是否启用消息渲染器。' }],
        returns: '修改后的工作区。',
      },
      {
        signature: '@Remote updateProject(owner: FrontendOwner, projectId: string, patch: FrontendJson): FrontendWorkspace',
        description: '修改项目名称、入口或清单，不改变编号、归属及文件列表。',
        parameters: [{ name: 'owner', description: '项目所属作用域。' }, { name: 'projectId', description: '明确项目编号。' }, { name: 'patch', description: '明确的项目字段补丁。' }],
        returns: '修改后的工作区。',
      },
      {
        signature: '@Remote replaceFiles(owner: FrontendOwner, projectId: string, input: FrontendReplaceFiles): FrontendWorkspace',
        description: '一次修改文件、删除路径与清单，验证引用后才提交。',
        parameters: [{ name: 'owner', description: '项目所属作用域。' }, { name: 'projectId', description: '明确项目编号。' }, { name: 'input', description: '文件修改、明确删除路径与清单。' }],
        returns: '修改后的工作区。',
      },
      {
        signature: '@Remote restoreDefault(owner: FrontendOwner): FrontendWorkspace',
        description: '撤回自定义项目的选择，保留文件供以后再次启用。',
        parameters: [{ name: 'owner', description: '明确作用域。' }],
        returns: '修改后的工作区。',
      },
      {
        signature: '@Remote({ mode: \'stream\' }) changes(owner: FrontendOwner, signal: AbortSignal): AsyncIterable<NativeFrontendChange>',
        description: '订阅该工作区的重读通知；合并待消费的通知，不回放编辑历史。',
        parameters: [{ name: 'owner', description: '明确作用域。' }, { name: 'signal', description: '取消订阅并释放等待者。' }],
        returns: '首次快照版本及后续最新修改版本，不传输源码或素材正文。',
      },
    ],
  },
  {
    key: 'eleckoiAuthorScriptsApi',
    summary: 'Native script source stays in product-data; only live callbacks cross this stream.',
    description: 'Native script source stays in product-data; only live callbacks cross this stream.',
    methods: [
      {
        signature: '@Remote read(conversationId: string): NativeAuthorScriptCatalog',
        description: '读取当前聊天的全局、活动预设与角色原生脚本，不改写未声明原生标准的源码。',
        parameters: [{ name: 'conversationId', description: 'ElecKoi 聊天编号。' }],
        returns: '按库与树顺序排列的启用脚本、所属配置和运行版本。',
      },
      {
        signature: '@Remote getSettings(conversationId: string, version: string, identity: NativeAuthorScriptIdentity, target: \'script\' | \'library\', signal: AbortSignal): NativeAuthorScriptSettings',
        description: '读取当前运行脚本或其所属库的设置与修改版本。',
        parameters: [{ name: 'conversationId', description: '固定聊天编号。' }, { name: 'version', description: '实际运行的程序版本。' }, { name: 'identity', description: '明确的脚本作用域、所有者与编号。' }, { name: 'target', description: '脚本设置或所属库共享设置。' }, { name: 'signal', description: '取消读取。' }],
        returns: 'JSON 设置及库修改版本。',
      },
      {
        signature: '@Remote setSettings(conversationId: string, version: string, identity: NativeAuthorScriptIdentity, target: \'script\' | \'library\', settingsJson: string, expectedRevision: number, signal: AbortSignal): NativeAuthorScriptSettings',
        description: '保存当前脚本或所属库设置，不替换源码、不重新启动程序。',
        parameters: [{ name: 'conversationId', description: '固定聊天编号。' }, { name: 'version', description: '实际运行的程序版本。' }, { name: 'identity', description: '明确脚本身份。' }, { name: 'target', description: '脚本设置或所属库共享设置。' }, { name: 'settingsJson', description: '完整 JSON 对象。' }, { name: 'expectedRevision', description: '最近读取的库修改版本。' }, { name: 'signal', description: '保存前取消。' }],
        returns: '已保存的设置与新修改版本。',
      },
      {
        signature: '@Remote({ mode: \'stream\' }) async *connect(conversationId: string, version: string, signal: AbortSignal): RemoteStream<NativeAuthorRuleTask, NativeAuthorRuleReply>',
        description: '在脚本启动成功后建立本聊天唯一的原生变量规则流；断开会取消未完成修改。',
        parameters: [{ name: 'conversationId', description: 'ElecKoi 聊天编号。' }, { name: 'version', description: 'read 返回并实际启动的脚本版本。' }, { name: 'signal', description: '取消连接与正在等待的规则。' }],
        returns: '就绪通知及变量候选任务；上行只接受本流任务的成功结果或明确错误。',
      },
    ],
  },
  {
    key: 'eleckoiAuthorVariablesApi',
    summary: 'Native author variables share the Agent candidate processor and product repository.',
    description: 'Native author variables share the Agent candidate processor and product repository.',
    methods: [
      {
        signature: '@Remote getState(conversationId: string): string',
        description: '读取原生聊天的当前变量，不返回历史消息或其他聊天的状态。',
        parameters: [{ name: 'conversationId', description: 'ElecKoi 聊天编号。' }],
        returns: '当前变量对象的 JSON 文本。',
      },
      {
        signature: '@Remote getConfig(conversationId: string): VariableConfig | null',
        description: '读取该聊天绑定的原生变量配置。',
        parameters: [{ name: 'conversationId', description: 'ElecKoi 聊天编号。' }],
        returns: '变量配置；未绑定角色变量配置时返回 null。',
      },
      {
        signature: '@Remote async setState(conversationId: string, stateJson: string, signal: AbortSignal): Promise<string>',
        description: '替换当前变量，等待作者规则处理后才保存。',
        parameters: [{ name: 'conversationId', description: 'ElecKoi 聊天编号。' }, { name: 'stateJson', description: '完整变量对象的 JSON 文本。' }, { name: 'signal', description: '取消处理；取消后不保存候选数据。' }],
        returns: '已接受并保存的变量对象 JSON 文本。',
      },
      {
        signature: '@Remote async merge(conversationId: string, stateJson: string, signal: AbortSignal): Promise<string>',
        description: '将对象递归合并到本次原生变量候选，数组与标量替换对应字段。',
        parameters: [{ name: 'conversationId', description: 'ElecKoi 聊天编号。' }, { name: 'stateJson', description: '合并对象的 JSON 文本。' }, { name: 'signal', description: '取消处理；取消后不保存候选数据。' }],
        returns: '已接受并保存的变量对象 JSON 文本。',
      },
      {
        signature: '@Remote async applyPatch(conversationId: string, patchJson: string, signal: AbortSignal): Promise<string>',
        description: '按原生 SDK 的 add、replace、remove 与 JSON Pointer 修改变量候选。',
        parameters: [{ name: 'conversationId', description: 'ElecKoi 聊天编号。' }, { name: 'patchJson', description: '原生变量补丁数组的 JSON 文本。' }, { name: 'signal', description: '取消处理；取消后不保存候选数据。' }],
        returns: '已接受并保存的变量对象 JSON 文本。',
      },
      {
        signature: '@Remote async reset(conversationId: string, signal: AbortSignal): Promise<string>',
        description: '用聊天绑定的初始变量发起一次原生修改，仍等待作者规则完成。',
        parameters: [{ name: 'conversationId', description: 'ElecKoi 聊天编号。' }, { name: 'signal', description: '取消处理；取消后不保存候选数据。' }],
        returns: '已接受并保存的变量对象 JSON 文本。',
      },
    ],
  },
  {
    key: 'eleckoiAutoIllustration',
    summary: '独立自动配图插件提供的本轮提示词与已有分镜重画能力。',
    description: '独立自动配图插件提供的本轮提示词与已有分镜重画能力。',
    methods: [
      {
        signature: 'instructions(snapshot: IllustrationSessionConfiguration): string',
        description: '取得根角色会话本轮启用的配图指令。',
        parameters: [{ name: 'snapshot', description: '已准备好的当前会话配置。' }],
        returns: '本轮指令；停用或未绑定模型时为空。',
      },
      {
        signature: 'regenerateImage(sessionId: string, batchId: string, frameId: number, snapshot: IllustrationSessionConfiguration, signal: AbortSignal): Promise<{ error?: string }>',
        description: '通过当前插件绑定的模型重画已有分镜，保留其他图片与正文。',
        parameters: [{ name: 'sessionId', description: '角色会话编号。' }, { name: 'batchId', description: '原配图批次编号。' }, { name: 'frameId', description: '原分镜编号。' }, { name: 'snapshot', description: '当前会话的自动配图配置。' }, { name: 'signal', description: '调用取消信号。' }],
        returns: '重画的错误状态；完整图片结果通过原会话事件发布。',
      },
    ],
  },
  {
    key: 'eleckoiCharacterConfigurationApi',
    summary: '管理完整设定库、变量定义和正则配置，通过官方 Typert Remote 公开跨端调用。',
    description: '管理完整设定库、变量定义和正则配置，通过官方 Typert Remote 公开跨端调用。',
    methods: [
      {
        signature: '@Remote readEditorLibraryVersions(address: EditorLibraryAddress): EditorLibraryVersions',
        description: '读取明确归属的命名配置版本，脚本归档只在需要编辑版本时读取。',
        parameters: [{ name: 'address', description: '类型、作用域与所属编号；全局使用空所属编号。' }],
        returns: '当前版本、命名版本正文和并发修改标识。',
      },
      {
        signature: '@Remote saveEditorLibraries(request: EditorLibrarySaveRequest): EditorLibrarySaveResult',
        description: '原子保存配置草稿及其命名版本，源码资源在同一操作中保持完整。',
        parameters: [{ name: 'request', description: '明确类型的配置文档、版本草稿与读取时的修改标识。' }],
        returns: '保存后的配置文档和版本；冲突时保留原数据。',
      },
      {
        signature: '@Remote({ mode: \'stream\' }) changes(signal: AbortSignal): AsyncIterable<CharacterConfigurationChange>',
        description: '订阅变更通知；连接后首先收到刷新标记，取消信号结束此异步流。',
        parameters: [{ name: 'signal', description: '取消调用或结束订阅流的信号。' }],
        returns: '按发生顺序返回变更通知的异步流。',
      },
      {
        signature: '@Remote readCharacterOpenings(characterId: string): CharacterOpenings',
        description: '读取独立于设定库的角色开场白。',
        parameters: [{ name: 'characterId', description: '所属角色编号。' }],
        returns: '当前开场白、备用开场白及变量绑定。',
      },
      {
        signature: '@Remote saveCharacterOpenings(characterId: string, value: CharacterOpenings): CharacterOpenings',
        description: '保存角色独立开场白，不修改任何设定库版本。',
        parameters: [{ name: 'characterId', description: '所属角色编号。' }, { name: 'value', description: '完整开场白草稿。' }],
        returns: '实际保存后的角色开场白配置。',
      },
      {
        signature: '@Remote readSettingLibrary(characterId: string): SettingLibrary',
        description: '读取完整角色设定库，包含必读、选读、触发方式和插入位置。',
        parameters: [{ name: 'characterId', description: '角色编号。' }],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
      {
        signature: '@Remote readGlobalSettingLibraries(): GlobalSettingLibraryCollection',
        description: '读取独立的全局设定库集合，不属于任何角色版本。',
        parameters: [],
        returns: '全局库及并发修改标识。',
      },
      {
        signature: '@Remote saveGlobalSettingLibraries(value: GlobalSettingLibraryCollection): GlobalSettingLibraryCollection',
        description: '原子保存全局库的内容、启停和删除；冲突时保留原数据。',
        parameters: [{ name: 'value', description: '全局库草稿及读取时的修改标识。' }],
        returns: '已保存的全局库集合。',
      },
      {
        signature: '@Remote replaceSettingLibraryContent( characterId: string, library: SettingLibraryContent, signal: AbortSignal ): SettingLibrary',
        description: '保存角色设定库的当前内容，保留其他版本与管理设置。',
        parameters: [{ name: 'characterId', description: '所属角色编号。' }, { name: 'library', description: '设定库原文、文件夹和插入位置定义。' }, { name: 'signal', description: '取消调用的信号。' }],
        returns: '实际保存后的角色设定库，仍采用现有请求规则。',
      },
      {
        signature: '@Remote updateSettingLibraryEntries( characterId: string, updates: SettingLibraryEntryUpdate[], signal: AbortSignal ): SettingLibraryEntry[]',
        description: '按明确编号原子修改角色设定库的普通条目，只保存指定字段。',
        parameters: [{ name: 'characterId', description: '所属角色编号。' }, { name: 'updates', description: '条目编号与修改字段；不得重复指定同一编号。' }, { name: 'signal', description: '取消调用的信号。' }],
        returns: '按指定顺序返回保存后的条目；一项失败则整组不保存。',
      },
      {
        signature: '@Remote readScriptLibrary(scope: ScriptLibraryScope, ownerId: string): ScriptLibrary',
        description: '读取指定作用域的正式脚本库。',
        parameters: [{ name: 'scope', description: '全局、角色或预设作用域。' }, { name: 'ownerId', description: '所属角色或预设编号；全局作用域使用空字符串。' }],
        returns: '脚本配置、库启停与修改版本。',
      },
      {
        signature: '@Remote readScriptWorkspace(scope: ScriptLibraryScope, ownerId: string): ScriptWorkspace',
        description: '读取脚本文件目录与已登记的入口文件，目录不存在时创建空目录。',
        parameters: [{ name: 'scope', description: '全局、角色或预设作用域。' }, { name: 'ownerId', description: '所属编号；全局使用空字符串。' }],
        returns: '本机目录、文件版本与按明确脚本编号登记的入口。',
      },
      {
        signature: '@Remote saveScriptLibrary(library: ScriptLibrary): ScriptLibrary',
        description: '保存脚本库，检查修改版本以防止覆盖其他窗口或 SDK 的更新。',
        parameters: [{ name: 'library', description: '完整脚本库，revision 为读取时的版本。' }],
        returns: '保存后的配置与新版本。',
      },
      {
        signature: '@Remote saveScriptLibraries(libraries: ScriptLibrary[]): ScriptLibrary[]',
        description: '在同一事务中保存多个脚本库；任一版本冲突时全部保留原值。',
        parameters: [{ name: 'libraries', description: '本页修改的脚本库及各自读取版本。' }],
        returns: '保存后的脚本库配置。',
      },
      {
        signature: '@Remote importSettingLibrary(characterId: string, library: SettingLibrary, openingImports: CharacterOpeningMessage[]): SettingLibrary',
        description: '原子导入设定库，旧文件中的开场白追加为备用开场白并保持当前开场白不变。',
        parameters: [{ name: 'characterId', description: '所属角色编号。' }, { name: 'library', description: '已并入导入版本的设定库草稿。' }, { name: 'openingImports', description: '旧文件明确携带的开场白条目；不包含时传空数组。' }],
        returns: '实际保存后的设定库；变量绑定无效时整次导入回滚。',
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
        signature: '@Remote readRegexEditor(target: RegexEditorTarget): RegexRuleEditorCollection',
        description: '读取全局及明确归属的正则，不依赖当前启用预设或角色。',
        parameters: [{ name: 'target', description: '编辑归属，必须提供明确的角色或预设编号。' }],
        returns: '仅含允许范围的规则及版本成员。',
      },
      {
        signature: '@Remote saveRegexEditor(collection: RegexRuleEditorCollection): RegexRuleEditorCollection',
        description: '原子保存全局及编辑归属的正则，保留其他归属的规则与版本成员。',
        parameters: [{ name: 'collection', description: '携带全局及归属版本校验的编辑草稿。' }],
        returns: '保存后的编辑配置；过期草稿拒绝保存。',
      },
      {
        signature: '@Remote importRegexEditor(collection: RegexRuleEditorCollection, fallbackScope: RegexRuleScope, documents: RegexRuleImportDocument[]): RegexRuleEditorImportResult',
        description: '导入全局及指定归属的规则，拒绝跨归属文件。',
        parameters: [{ name: 'collection', description: '导入前的编辑配置与版本。' }, { name: 'fallbackScope', description: '文件没有归属字段时使用的允许范围。' }, { name: 'documents', description: '正则 JSON 文件。' }],
        returns: '导入结果；归属冲突时不写入。',
      },
      {
        signature: '@Remote exportRegexEditor(target: RegexEditorTarget, ruleIds: string[]): { fileName: string; json: string }',
        description: '导出当前编辑归属内选中的规则。',
        parameters: [{ name: 'target', description: '明确的编辑归属。' }, { name: 'ruleIds', description: '仅限当前编辑器中的规则编号。' }],
        returns: '可下载的 JSON 文件名与内容。',
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
        signature: '@Remote testRegexRule(text: string, rule: RegexRule, target: RegexRuleTarget, options?: { surface?: \'Display\' | \'Prompt\' | \'Stored\'; variablesJson?: string; depth?: number; isEdit?: boolean }, signal?: AbortSignal): Promise<RegexRuleTestResult>',
        description: '测试规则对文本的作用，不保存规则。',
        parameters: [{ name: 'text', description: '本次输入或待测试文本。' }, { name: 'rule', description: '待测试规则。' }, { name: 'target', description: '规则作用的内容类别。' }, { name: 'options', description: '测试范围、变量快照 JSON、深度与编辑场景。' }, { name: 'signal', description: '关闭编辑器或取消测试时结束计算。' }],
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
        signature: '@Remote duplicate(characterId: string): { characterId: string; collection: CharacterCollection }',
        description: '复制角色卡及其专属配置和资源，保留原卡并创建独立副本。',
        parameters: [{ name: 'characterId', description: '原角色编号。' }],
        returns: '新角色编号和更新后的目录；失败抛出错误。',
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
        description: '删除指定角色及其前端项目、关联聊天和官方 Session。',
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
    key: 'eleckoiConversationModelsApi',
    summary: '沿官方 Session 管理会话模型与额外生成参数，空聊天编号仅表示新会话默认模型。',
    description: '沿官方 Session 管理会话模型与额外生成参数，空聊天编号仅表示新会话默认模型。',
    methods: [
      {
        signature: '@Remote async current(conversationId: string): Promise<ConversationModelSelection>',
        description: '读取指定聊天的官方模型选择；空编号读取新会话默认值。',
        parameters: [{ name: 'conversationId', description: 'ElecKoi 聊天编号。' }],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
      {
        signature: '@Remote async select(conversationId: string, selection: ConversationModelSelection): Promise<ConversationModelSelection>',
        description: '保存当前选择。',
        parameters: [{ name: 'conversationId', description: 'ElecKoi 聊天编号。' }, { name: 'selection', description: '模型提供商、模型编号和可选推理档位。' }],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
      {
        signature: '@Remote async parameters(sessionId: string): Promise<SessionModelParameterState>',
        description: '读取当前 Session 额外生成参数，连接配置和模型能力仍由模型目录管理。',
        parameters: [{ name: 'sessionId', description: '官方 Session 编号。' }],
        returns: '官方日志投影中的参数与修订号。',
      },
      {
        signature: '@Remote async saveParameters(sessionId: string, provider: string, model: string, patch: SessionModelParameterPatch, revision: number): Promise<SessionModelParameterState>',
        description: '原子保存一个 Session 中指定模型的生成参数；不修改其他会话或提供商配置。',
        parameters: [{ name: 'sessionId', description: '官方 Session 编号。' }, { name: 'provider', description: '提供商路由编号。' }, { name: 'model', description: '模型编号。' }, { name: 'patch', description: '本次变更的生成参数；null 表示采用上游默认。' }, { name: 'revision', description: '编辑时读取的参数修订号。' }],
        returns: '已保存的官方 Session 参数投影。',
      },
    ],
  },
  {
    key: 'eleckoiConversationsApi',
    summary: '管理聊天目录、产品资料和官方 Session 消息修改，通过官方 Typert Remote 公开跨端调用。',
    description: '管理聊天目录、产品资料和官方 Session 消息修改，通过官方 Typert Remote 公开跨端调用。',
    methods: [
      {
        signature: '@Remote readGeneratedImage(conversationId: string, batchId: string, frameId: number, attachmentId: string, signal: AbortSignal): Promise<{ mediaType: string; data: string }>',
        description: '读取本聊天生图记录引用的单张图片。',
        parameters: [{ name: 'conversationId', description: '聊天编号。' }, { name: 'batchId', description: '生图指令编号。' }, { name: 'frameId', description: '图片编号。' }, { name: 'attachmentId', description: '当前正式图片对象编号。' }, { name: 'signal', description: '取消图片读取的信号。' }],
        returns: '图片媒体类型和 Base64 数据。',
      },
      {
        signature: '@Remote async regenerateImage(conversationId: string, batchId: string, frameId: number, signal: AbortSignal): Promise<void>',
        description: '从原始 AI 回复重新解析提示词，只重画选中的单张图片。',
        parameters: [{ name: 'conversationId', description: '聊天编号。' }, { name: 'batchId', description: '本轮生图指令编号。' }, { name: 'frameId', description: '指令中的图片编号。' }, { name: 'signal', description: '取消生图请求的信号。' }],
        returns: '图片生成与记录保存完成；失败抛出可诊断错误。',
      },
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
        signature: '@Remote variableConfiguration(conversationId: string): ConversationVariableConfiguration',
        description: '读取当前会话关联的变量版本及本角色可选版本，不改变编辑器选择。',
        parameters: [{ name: 'conversationId', description: 'ElecKoi 聊天编号。' }],
        returns: '当前关联编号与版本目录；已删除的关联编号仍保留。',
      },
      {
        signature: '@Remote async selectVariableVersion(conversationId: string, versionId: string, expectedVersionId: string): Promise<ConversationVariableConfiguration>',
        description: '为当前会话选择变量配置，保留当前值、初始值和历史快照。',
        parameters: [{ name: 'conversationId', description: 'ElecKoi 聊天编号。' }, { name: 'versionId', description: '本角色变量版本编号，空字符串表示取消关联。' }, { name: 'expectedVersionId', description: '界面读取到的原关联编号，用于拒绝过期操作。' }],
        returns: '已保存的关联与版本目录。',
      },
      {
        signature: '@Remote authorState(conversationId: string): AuthorConversationState',
        description: '读取当前聊天的有效设定库、变量配置和变量状态。',
        parameters: [{ name: 'conversationId', description: 'ElecKoi 聊天编号。' }],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
      },
      {
        signature: '@Remote async replaceVariableState(conversationId: string, stateJson: string, signal: AbortSignal): Promise<string>',
        description: '按聊天绑定的变量版本执行作者规则，并保存处理结果。',
        parameters: [{ name: 'conversationId', description: 'ElecKoi 聊天编号。' }, { name: 'stateJson', description: '完整变量对象的 JSON 文本。' }, { name: 'signal', description: '取消本次变量处理；取消后不保存候选结果。' }],
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
        description: '将归档导入当前选中的角色，创建新的聊天和官方 Session。',
        parameters: [{ name: 'characterId', description: '当前选中的目标角色编号，不要求与归档角色编号相同。' }, { name: 'json', description: '完整聊天归档 JSON 文本。' }],
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
        description: '等待当前进程本次产品保存，失败抛出错误；不查询历史或重启前结果。',
        parameters: [{ name: 'conversationId', description: 'ElecKoi 聊天编号。' }, { name: 'operationId', description: '生成准备时返回的本次操作编号。' }],
        returns: '本轮产品保存完成；此方法不启动模型。',
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
    key: 'eleckoiCreatorStudioSessionsApi',
    summary: 'AI 创作工作室的 DSH 会话与永久编辑目标。',
    description: 'AI 创作工作室的 DSH 会话与永久编辑目标。',
    methods: [
      {
        signature: '@Remote list(): Promise<CreatorStudioSessionSummary[]>',
        description: '列出工作室的正式 DSH 会话。',
        parameters: [],
        returns: '工作室会话目录。',
      },
      {
        signature: '@Remote create(characterId: string, workspaceId?: string): Promise<CreatorStudioSession>',
        description: '使用当前全局创作预设创建工作室会话。',
        parameters: [{ name: 'characterId', description: '编辑目标角色编号；空字符串表示尚未选择。' }, { name: 'workspaceId', description: '官方工作区编号；省略时沿用默认工作目录。' }],
        returns: '创建的会话及其编辑目标。',
      },
      {
        signature: '@Remote open(sessionId: string): Promise<CreatorStudioSession>',
        description: '恢复一个已有工作室会话。',
        parameters: [{ name: 'sessionId', description: '正式 DSH 会话编号。' }],
        returns: '恢复的会话及其编辑目标。',
      },
      {
        signature: '@Remote selectCharacter(sessionId: string, characterId: string): Promise<CreatorStudioSession>',
        description: '在空闲会话中选择永久编辑目标。',
        parameters: [{ name: 'sessionId', description: '正式 DSH 会话编号。' }, { name: 'characterId', description: '目标角色编号；空字符串解除选择。' }],
        returns: '更新后的工作室会话。',
      },
      {
        signature: '@Remote rename(sessionId: string, title: string): Promise<void>',
        description: '修改工作室对话的正式标题。',
        parameters: [{ name: 'sessionId', description: '工作室会话编号。' }, { name: 'title', description: '新标题。' }],
        returns: '标题保存完成。',
      },
      {
        signature: '@Remote pin(sessionId: string, pinned: boolean): Promise<void>',
        description: '设置工作室对话的置顶状态。',
        parameters: [{ name: 'sessionId', description: '工作室会话编号。' }, { name: 'pinned', description: '是否置顶。' }],
        returns: '置顶状态保存完成。',
      },
      {
        signature: '@Remote delete(sessionId: string): Promise<void>',
        description: '删除工作室对话及其正式 Session 文件。',
        parameters: [{ name: 'sessionId', description: '工作室会话编号。' }],
        returns: '删除完成。',
      },
      {
        signature: '@Remote messages(sessionId: string): Promise<CreatorStudioMessage[]>',
        description: '读取工作室可操作的用户和助手消息。',
        parameters: [{ name: 'sessionId', description: '工作室会话编号。' }],
        returns: '消息正文及正式事件位置。',
      },
      {
        signature: '@Remote deleteMessagesFrom(sessionId: string, eventSeq: number, role: \'user\' | \'assistant\'): Promise<void>',
        description: '从指定消息起删除当前对话的后续消息。',
        parameters: [{ name: 'sessionId', description: '工作室会话编号。' }, { name: 'eventSeq', description: '起始消息的正式事件序号。' }, { name: 'role', description: '起始消息的角色。' }],
        returns: '删除完成。',
      },
      {
        signature: '@Remote regenerate(sessionId: string): Promise<void>',
        description: '保留最近的用户输入并重新生成回复。',
        parameters: [{ name: 'sessionId', description: '工作室会话编号。' }],
        returns: '重新生成已启动。',
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
    summary: '管理模型目录和用户主动查看的密钥，通过官方 Typert Remote 公开跨端调用。',
    description: '管理模型目录和用户主动查看的密钥，通过官方 Typert Remote 公开跨端调用。',
    methods: [
      {
        signature: '@Remote revealApiKey(configId: string): Promise<string>',
        description: '按模型配置编号读取密钥，供用户主动查看。',
        parameters: [{ name: 'configId', description: '模型配置编号。' }],
        returns: '操作结果，结构见返回类型；失败抛出错误。',
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
        signature: 'importTranscript(sessionId: string, messages: Array<{ role: \'user\' | \'assistant\'; content: string; variableStateJson?: string }>): Promise<Array<{ role: \'user\' | \'assistant\'; content: string; variableStateJson?: string; id: string; sessionEventSeq: number; turn: number | null }>>',
        description: '将导入的正文写入新建的空白官方 Session，并刷新消息投影。',
        parameters: [{ name: 'sessionId', description: '空白官方 Session 编号。' }, { name: 'messages', description: '按实际顺序排列的正文和可选变量快照。' }],
        returns: '各消息的正式事件与轮次标识。',
      },
      {
        signature: 'editMessage(sessionId: string, eventSeq: number, role: \'user\' | \'assistant\', content: string): Promise<void>',
        description: '修改一条消息并刷新官方投影。',
        parameters: [{ name: 'sessionId', description: '官方 Session 编号。' }, { name: 'eventSeq', description: '消息事件序号。' }, { name: 'role', description: '消息角色。' }, { name: 'content', description: '新的完整消息文本。' }],
        returns: '消息修改和投影刷新完成。',
      },
      {
        signature: 'deleteMessagesFrom(sessionId: string, eventSeq: number, role: \'user\' | \'assistant\'): Promise<void>',
        description: '删除指定消息及之后的事件，保留其前的完整历史并闭合开放轮次。',
        parameters: [{ name: 'sessionId', description: '官方 Session 编号。' }, { name: 'eventSeq', description: '首条需要删除的消息事件序号。' }, { name: 'role', description: '消息角色。' }],
        returns: '删除和官方投影刷新完成。',
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
    summary: '管理搜索、网页抓取和连接测试，通过官方 Typert Remote 公开跨端调用。',
    description: '管理搜索、网页抓取和连接测试，通过官方 Typert Remote 公开跨端调用。',
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
      {
        signature: '@Remote fetchSelection(): WebFetchMode',
        description: '读取网页抓取方式。',
        parameters: [],
        returns: '当前网页抓取提供商。',
      },
      {
        signature: '@Remote async selectFetch(mode: WebFetchMode): Promise<WebFetchMode>',
        description: '保存网页抓取方式，不改变搜索方式。',
        parameters: [{ name: 'mode', description: '网页抓取方式。' }],
        returns: '已保存的网页抓取提供商。',
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
    declaration: 'export interface AgentPreset {\n    id: string;\n    purpose: AgentPresetPurpose;\n    name: string;\n    modelFamily: AgentPresetModelFamily;\n    modelTags: AgentPresetModelTag[];\n    libraryGroupId: string;\n    activeVersionId: string;\n    activeVersionNumber: number;\n    profile: AgentPresetProfile;\n    entries: SettingLibraryEntry[];\n    groups: SettingLibraryGroup[];\n    promptPositions: SettingLibraryPromptPosition[];\n    toolGroups: AgentToolGroup[];\n    extraToolGroups?: AgentToolGroup[];\n    subagentModelSelection?: {\n        configId: string;\n        model: string;\n    };\n    toolModelConfigIds?: Record<string, string>;\n    autoIllustration?: {\n        enabled: boolean;\n        modelConfigId: string;\n    };\n    roleplayPlan: {\n        steps: string[];\n    };\n    regexRules: RegexRule[];\n    expandedGroupIds: string[];\n}',
  },
  {
    name: 'AgentPresetCatalog',
    declaration: 'export interface AgentPresetCatalog {\n    activePresetIds: {\n        roleplay: string;\n        creator: string;\n    };\n    groups: AgentPresetLibraryGroup[];\n    presets: AgentPresetSummary[];\n}',
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
    declaration: 'export interface AgentPresetLibraryGroup {\n    id: string;\n    purpose: AgentPresetPurpose;\n    name: string;\n    sortIndex: number;\n}',
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
    name: 'AgentPresetPurpose',
    declaration: 'export type AgentPresetPurpose = \'roleplay\' | \'creator\';',
  },
  {
    name: 'AgentPresetSummary',
    declaration: 'export interface AgentPresetSummary {\n    id: string;\n    purpose: AgentPresetPurpose;\n    name: string;\n    modelFamily: AgentPresetModelFamily;\n    modelTags: AgentPresetModelTag[];\n    libraryGroupId: string;\n    activeVersionId: string;\n    activeVersionNumber: number;\n    entryCount: number;\n    profile: AgentPresetProfile;\n}',
  },
  {
    name: 'AgentPresetTimelineItem',
    declaration: 'export interface AgentPresetTimelineItem {\n    id: string;\n    title: string;\n    dateLabel: string;\n    note: string;\n}',
  },
  {
    name: 'AgentToolGroup',
    declaration: 'export interface AgentToolGroup {\n    id: string;\n    name: string;\n    description: string;\n    source: \'built_in\' | \'mcp\' | \'extension\';\n    members: AgentToolMember[];\n    enabled: boolean;\n    included: boolean;\n    available?: boolean;\n    plugin?: {\n        id: string;\n        name: string;\n    };\n}',
  },
  {
    name: 'AgentToolMember',
    declaration: 'export interface AgentToolMember {\n    name: string;\n    description: string;\n}',
  },
  {
    name: 'AuthorConversationState',
    declaration: 'export interface AuthorConversationState {\n    variableIdentityJson: string;\n    initialVariableStateJson: string;\n    currentVariableStateJson: string;\n    variableConfig: VariableConfig | null;\n    settingLibrarySummary: {\n        characterId: string;\n        name: string;\n        activeVersionId: string;\n        entryCount: number;\n        groupCount: number;\n    } | null;\n    settingLibrary: ConversationRuntimeSettingLibrary | null;\n}',
  },
  {
    name: 'AuthorScriptJson',
    declaration: 'export type AuthorScriptJson = null | boolean | number | string | AuthorScriptJson[] | {\n    [key: string]: AuthorScriptJson;\n};',
  },
  {
    name: 'CharacterCollection',
    declaration: 'export interface CharacterCollection {\n    active_character_id: string;\n    groups: string[];\n    items: CharacterRecord[];\n}',
  },
  {
    name: 'CharacterConfigurationChange',
    declaration: 'export type CharacterConfigurationChange = {\n    kind: \'snapshot\';\n} | {\n    kind: \'configuration\';\n    domain: \'openings\' | \'settingLibraries\' | \'globalSettingLibraries\' | \'variables\' | \'regexRules\' | \'agentPresets\' | \'scripts\';\n    characterId?: string;\n};',
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
    declaration: 'export interface CharacterImportPreviewItem {\n    id: string;\n    name: string;\n    summary: string;\n    warnings: string[];\n    imageAvailable: boolean;\n    errorMessage: string;\n    importable: boolean;\n}',
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
    name: 'CharacterOpeningMessage',
    declaration: 'export interface CharacterOpeningMessage {\n    id: string;\n    title: string;\n    content: string;\n    variableVersionId?: string | undefined;\n}',
  },
  {
    name: 'CharacterOpenings',
    declaration: 'export interface CharacterOpenings {\n    characterId: string;\n    enabled: boolean;\n    openingMessages: CharacterOpeningMessage[];\n    defaultOpeningMessageId: string;\n}',
  },
  {
    name: 'CharacterPersona',
    declaration: 'export interface CharacterPersona {\n    assistant_name: string;\n    assistant_avatar: string;\n    assistant_square: string;\n    assistant_cover: string;\n    image_prompt?: string;\n    opening?: string;\n    show_opening?: boolean;\n    user_name?: string;\n    user_avatar?: string;\n    user_square?: string;\n    user_portrait?: string;\n}',
  },
  {
    name: 'CharacterRecord',
    declaration: 'export interface CharacterRecord {\n    id: string;\n    name?: string;\n    avatar?: string;\n    group?: string;\n    groupName?: string;\n    groupViewOrder?: number;\n    folder?: string;\n    frontendBeautyEnabled?: boolean | number;\n    profileAge?: string;\n    profileSex?: string;\n    profileHeight?: string;\n    profileBirthday?: string;\n    profileLike?: string;\n    showOpening?: boolean | number;\n    chatBackground?: string;\n    chatBackgroundOpacity?: number;\n    chatBackgroundBlur?: number;\n    chatBackgroundScrim?: number;\n    chatBackgroundCustom?: {\n        image: string;\n        opacity: number;\n        blur: number;\n        scrim: number;\n    };\n    primaryOpening?: string;\n    persona?: CharacterPersona;\n}',
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
    declaration: 'export interface ConversationDetailsMetadata {\n    conversation: ConversationRecord;\n    metadata: ConversationMetadata;\n    runtimeSessionId: string;\n    messages: ConversationMessageMetadata[];\n    hasMore: boolean;\n    beforeSequence: number | null;\n    runtimeVariableStateByTurn?: Record<string, string>;\n}',
  },
  {
    name: 'ConversationMessageDisplayInput',
    declaration: 'export interface ConversationMessageDisplayInput {\n    id: string;\n    role: \'user\' | \'assistant\';\n    content: string;\n    variableStateJson: string;\n    status: \'complete\' | \'streaming\' | \'error\' | \'cancelled\';\n    createdAt: string;\n    reasoning?: ConversationReasoningDisplayInput[];\n}',
  },
  {
    name: 'ConversationMessageDisplayResult',
    declaration: 'export interface ConversationMessageDisplayResult {\n    id: string;\n    sourceContent: string;\n    displayContent: string;\n    variableStateJson: string;\n    reasoning?: ConversationReasoningDisplayResult[];\n}',
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
    name: 'ConversationReasoningDisplayInput',
    declaration: 'export interface ConversationReasoningDisplayInput {\n    id: string;\n    text: string;\n}',
  },
  {
    name: 'ConversationReasoningDisplayResult',
    declaration: 'export interface ConversationReasoningDisplayResult {\n    id: string;\n    sourceText: string;\n    displayText: string;\n}',
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
    name: 'ConversationRuntimeSettingLibrary',
    declaration: 'export interface ConversationRuntimeSettingLibrary {\n    characterId: string;\n    name: string;\n    entries: SettingLibraryEntry[];\n    groups: SettingLibraryGroup[];\n    promptPositions: SettingLibraryPromptPosition[];\n}',
  },
  {
    name: 'ConversationSummary',
    declaration: 'export interface ConversationSummary extends ConversationRecord {\n    metadata: ConversationMetadata;\n    runtimeSessionId: string;\n}',
  },
  {
    name: 'ConversationVariableConfiguration',
    declaration: 'export interface ConversationVariableConfiguration {\n    versionId: string;\n    versions: Array<{\n        id: string;\n        name: string;\n    }>;\n}',
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
    name: 'CreatorStudioMessage',
    declaration: 'export interface CreatorStudioMessage {\n    eventSeq: number;\n    role: \'user\' | \'assistant\';\n    text: string;\n    turn: number;\n}',
  },
  {
    name: 'CreatorStudioSession',
    declaration: 'export interface CreatorStudioSession {\n    sessionId: string;\n    presetId: string;\n    characterId: string;\n}',
  },
  {
    name: 'CreatorStudioSessionSummary',
    declaration: 'export interface CreatorStudioSessionSummary extends CreatorStudioSession {\n    title: string;\n    updatedAt: number;\n    pinned: boolean;\n    pinIndex: number;\n}',
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
    name: 'EditorLibraryAddress',
    declaration: 'export interface EditorLibraryAddress {\n    kind: EditorLibraryKind;\n    scope: \'global\' | \'character\' | \'preset\';\n    ownerId: string;\n}',
  },
  {
    name: 'EditorLibraryKind',
    declaration: 'export type EditorLibraryKind = \'scripts\' | \'regex\';',
  },
  {
    name: 'EditorLibrarySaveRequest',
    declaration: 'export interface EditorLibrarySaveRequest {\n    kind: EditorLibraryKind;\n    documents: string[];\n    versions: EditorLibraryVersions[];\n}',
  },
  {
    name: 'EditorLibrarySaveResult',
    declaration: 'export interface EditorLibrarySaveResult {\n    documents: string[];\n    versions: EditorLibraryVersions[];\n}',
  },
  {
    name: 'EditorLibraryVersions',
    declaration: 'export interface EditorLibraryVersions extends EditorLibraryAddress {\n    revision: number;\n    resourceRevision: string;\n    activeVersionId: string;\n    versions: Array<{\n        id: string;\n        name: string;\n        content: string;\n    }>;\n}',
  },
  {
    name: 'ElecKoiHostStatus',
    declaration: 'export interface ElecKoiHostStatus {\n    architecture: \'dsh-remote\';\n    protocolVersion: 1;\n}',
  },
  {
    name: 'FrontendExport',
    declaration: 'export type FrontendExport = Omit<Native.FrontendExport, \'project\'> & {\n    project: FrontendProject;\n};',
  },
  {
    name: 'FrontendFile',
    declaration: 'export type FrontendFile = Native.FrontendFile;',
  },
  {
    name: 'FrontendFileInput',
    declaration: 'export type FrontendFileInput = Native.FrontendFileInput;',
  },
  {
    name: 'FrontendFileQuery',
    declaration: 'export type FrontendFileQuery = Native.FrontendFileQuery;',
  },
  {
    name: 'FrontendImport',
    declaration: 'export type FrontendImport = Omit<Native.FrontendImport, \'manifest\' | \'project\'> & {\n    manifest?: FrontendJson;\n    project?: FrontendJson;\n};',
  },
  {
    name: 'FrontendJson',
    declaration: 'export type FrontendJson = Record<string, FrontendValue>;',
  },
  {
    name: 'FrontendManifest',
    declaration: 'export type FrontendManifest = Omit<Native.FrontendManifest, \'config\' | \'project\'> & {\n    config?: FrontendJson;\n    project?: FrontendJson;\n};',
  },
  {
    name: 'FrontendOwner',
    declaration: 'export type FrontendOwner = Native.FrontendOwner;',
  },
  {
    name: 'FrontendProject',
    declaration: 'export type FrontendProject = Omit<Native.FrontendProject, \'manifest\'> & {\n    manifest?: FrontendManifest;\n};',
  },
  {
    name: 'FrontendReplaceFiles',
    declaration: 'export type FrontendReplaceFiles = Omit<Native.FrontendReplaceFiles, \'manifest\'> & {\n    manifest?: FrontendJson;\n};',
  },
  {
    name: 'FrontendValue',
    declaration: 'export type FrontendValue = null | boolean | number | string | FrontendValue[] | {\n    [key: string]: FrontendValue;\n};',
  },
  {
    name: 'FrontendWorkspace',
    declaration: 'export type FrontendWorkspace = Omit<Native.FrontendWorkspace, \'projects\'> & {\n    projects: FrontendProject[];\n};',
  },
  {
    name: 'GlobalSettingLibrary',
    declaration: 'export interface GlobalSettingLibrary {\n    id: string;\n    name: string;\n    enabled: boolean;\n    entries: SettingLibraryEntry[];\n    groups: SettingLibraryGroup[];\n    promptPositions: SettingLibraryPromptPosition[];\n    listAllExpanded: boolean;\n    expandedGroupIds: string[];\n    createdAt: string;\n    updatedAt: string;\n}',
  },
  {
    name: 'GlobalSettingLibraryCollection',
    declaration: 'export interface GlobalSettingLibraryCollection {\n    revision: number;\n    libraries: GlobalSettingLibrary[];\n}',
  },
  {
    name: 'IllustrationSessionConfiguration',
    declaration: 'export interface IllustrationSessionConfiguration {\n    autoIllustration?: {\n        enabled: boolean;\n        modelConfigId: string;\n    };\n    inheritedFromSessionId?: string;\n}',
  },
  {
    name: 'ModelDiscoveryInput',
    declaration: 'export interface ModelDiscoveryInput {\n    builtinProvider?: string;\n    configId: string;\n    baseURL: string;\n    api: string;\n    apiKey?: string;\n    headers?: Record<string, string>;\n}',
  },
  {
    name: 'ModelDiscoveryResult',
    declaration: 'export interface ModelDiscoveryResult {\n    id: string;\n    name?: string;\n    contextWindow?: number;\n    maxTokens?: number;\n    inputModalities?: readonly (\'text\' | \'image\')[];\n    reasoningEfforts?: Record<string, string | null>;\n    reasoningEffort?: string;\n}',
  },
  {
    name: 'NativeAuthorRuleReply',
    declaration: 'export type NativeAuthorRuleReply = {\n    id: string;\n    ok: true;\n    stateJson: string;\n} | {\n    id: string;\n    ok: false;\n    message: string;\n};',
  },
  {
    name: 'NativeAuthorRuleTask',
    declaration: 'export type NativeAuthorRuleTask = {\n    kind: \'ready\';\n    version: string;\n} | {\n    kind: \'process\';\n    id: string;\n    runId: string;\n    conversationId: string;\n    stage: \'before\' | \'after\' | \'afterSchema\';\n    stateJson: string;\n    beforeJson: string;\n    scriptSettings: NativeAuthorScriptSettingsUpdate[] | null;\n} | {\n    kind: \'cancel\';\n    runId: string;\n};',
  },
  {
    name: 'NativeAuthorScript',
    declaration: 'export interface NativeAuthorScript {\n    buttonsVisible: boolean;\n    key: string;\n    id: string;\n    name: string;\n    scope: ScriptLibraryScope;\n    ownerId: string;\n    source: string;\n    entryUrl: string;\n    settings: {\n        [key: string]: AuthorScriptJson;\n    };\n    librarySettings: {\n        [key: string]: AuthorScriptJson;\n    };\n}',
  },
  {
    name: 'NativeAuthorScriptCatalog',
    declaration: 'export interface NativeAuthorScriptCatalog {\n    conversationId: string;\n    characterId: string;\n    presetId: string;\n    version: string;\n    scripts: NativeAuthorScript[];\n}',
  },
  {
    name: 'NativeAuthorScriptIdentity',
    declaration: 'export interface NativeAuthorScriptIdentity {\n    scope: ScriptLibraryScope;\n    ownerId: string;\n    scriptId: string;\n}',
  },
  {
    name: 'NativeAuthorScriptSettings',
    declaration: 'export interface NativeAuthorScriptSettings {\n    revision: number;\n    values: {\n        [key: string]: AuthorScriptJson;\n    };\n}',
  },
  {
    name: 'NativeAuthorScriptSettingsUpdate',
    declaration: 'export interface NativeAuthorScriptSettingsUpdate {\n    key: string;\n    settings: {\n        [key: string]: AuthorScriptJson;\n    };\n    librarySettings: {\n        [key: string]: AuthorScriptJson;\n    };\n}',
  },
  {
    name: 'NativeFrontendChange',
    declaration: 'export type NativeFrontendChange = {\n    kind: \'snapshot\' | \'changed\';\n    revision: number;\n};',
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
    name: 'RegexEditorTarget',
    declaration: 'export interface RegexEditorTarget {\n    scope: \'character\' | \'preset\';\n    ownerId: string;\n}',
  },
  {
    name: 'RegexRule',
    declaration: 'export interface RegexRule {\n    id: string;\n    name: string;\n    pattern: string;\n    replacement: string;\n    targets: RegexRuleTarget[];\n    enabled: boolean;\n    displayOnly: boolean;\n    promptOnly: boolean;\n    runOnEdit: boolean;\n    order: number;\n    trimStrings?: string[];\n    minDepth?: number | null;\n    maxDepth?: number | null;\n    substituteRegex?: 0 | 1 | 2;\n}',
  },
  {
    name: 'RegexRuleCollection',
    declaration: 'export interface RegexRuleCollection {\n    characterId: string;\n    agentPresetId: string;\n    agentPresetName: string;\n    agentPresetRegexRevision: string;\n    globalEnabled?: boolean;\n    agentPresetEnabled?: boolean;\n    characterEnabled?: boolean;\n    globalRules: RegexRule[];\n    agentPresetRules: RegexRule[];\n    characterRules: RegexRule[];\n    versions: RegexRuleVersion[];\n    activeVersionId: string;\n    revision: number;\n}',
  },
  {
    name: 'RegexRuleEditorCollection',
    declaration: 'export interface RegexRuleEditorCollection {\n    target: RegexEditorTarget;\n    ownerRevision: string;\n    globalEnabled?: boolean;\n    agentPresetEnabled?: boolean;\n    characterEnabled?: boolean;\n    globalRules: RegexRule[];\n    agentPresetRules: RegexRule[];\n    characterRules: RegexRule[];\n    versions: RegexRuleVersion[];\n    activeVersionId: string;\n    revision: number;\n}',
  },
  {
    name: 'RegexRuleEditorImportResult',
    declaration: 'export interface RegexRuleEditorImportResult {\n    collection: RegexRuleEditorCollection;\n    importedFileCount: number;\n    importedRuleCount: number;\n    failedFileNames: string[];\n}',
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
    declaration: 'export type RegexRuleTarget = \'UserInput\' | \'AiOutput\' | \'SettingContent\' | \'Reasoning\';',
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
    name: 'ScriptFolder',
    declaration: 'export interface ScriptFolder {\n    [key: string]: AuthorScriptJson;\n    type: \'folder\';\n    id: string;\n    name: string;\n    enabled: boolean;\n    icon: string;\n    color: string;\n    scripts: ScriptItem[];\n}',
  },
  {
    name: 'ScriptItem',
    declaration: 'export interface ScriptItem {\n    [key: string]: AuthorScriptJson;\n    type: \'script\';\n    id: string;\n    name: string;\n    enabled: boolean;\n    content: string;\n    info: string;\n    data: {\n        [key: string]: AuthorScriptJson;\n    };\n    button: {\n        [key: string]: AuthorScriptJson;\n        enabled: boolean;\n        buttons: Array<{\n            [key: string]: AuthorScriptJson;\n            name: string;\n            visible: boolean;\n        }>;\n    };\n    export_with: {\n        [key: string]: AuthorScriptJson;\n        data: boolean;\n        button: boolean;\n    };\n}',
  },
  {
    name: 'ScriptLibrary',
    declaration: 'export interface ScriptLibrary {\n    scope: ScriptLibraryScope;\n    ownerId: string;\n    enabled: boolean;\n    revision: number;\n    trees: ScriptTree[];\n    variables: {\n        [key: string]: AuthorScriptJson;\n    };\n}',
  },
  {
    name: 'ScriptLibraryScope',
    declaration: 'export type ScriptLibraryScope = \'global\' | \'character\' | \'preset\';',
  },
  {
    name: 'ScriptTree',
    declaration: 'export type ScriptTree = ScriptItem | ScriptFolder;',
  },
  {
    name: 'ScriptWorkspace',
    declaration: 'export interface ScriptWorkspace {\n    path: string;\n    version: string;\n    entries: Array<{\n        id: string;\n        file: string;\n    }>;\n}',
  },
  {
    name: 'SessionModelParameterPatch',
    declaration: 'export interface SessionModelParameterPatch {\n    contextWindowTokens?: number | null | undefined;\n    maxOutputTokens?: number | null | undefined;\n    autoCompactTokenLimit?: number | null | undefined;\n    temperature?: number | null | undefined;\n    topP?: number | null | undefined;\n}',
  },
  {
    name: 'SessionModelParameterState',
    declaration: 'export interface SessionModelParameterState {\n    revision: number;\n    entries: Record<string, SessionModelParameterPatch>;\n}',
  },
  {
    name: 'SettingLibrary',
    declaration: 'export interface SettingLibrary {\n    characterId: string;\n    name: string;\n    entries: SettingLibraryEntry[];\n    groups: SettingLibraryGroup[];\n    promptPositions: SettingLibraryPromptPosition[];\n    activeVersionId: string;\n    versions: SettingLibraryVersion[];\n    listAllExpanded: boolean;\n    expandedGroupIds: string[];\n}',
  },
  {
    name: 'SettingLibraryContent',
    declaration: 'export type SettingLibraryContent = Pick<SettingLibrary, \'characterId\' | \'name\' | \'entries\' | \'groups\' | \'promptPositions\'>;',
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
    name: 'SettingLibraryEntryChanges',
    declaration: 'export type SettingLibraryEntryChanges = Partial<Omit<SettingLibraryEntry, \'id\' | \'kind\' | \'openingMessages\' | \'defaultOpeningMessageId\' | \'createdAt\' | \'updatedAt\'>>;',
  },
  {
    name: 'SettingLibraryEntryUpdate',
    declaration: 'export interface SettingLibraryEntryUpdate {\n    id: string;\n    changes: SettingLibraryEntryChanges;\n}',
  },
  {
    name: 'SettingLibraryGroup',
    declaration: 'export interface SettingLibraryGroup {\n    id: string;\n    name: string;\n    parentId: string;\n    order: number;\n    treeViewOrder: number;\n    createdAt: string;\n    updatedAt: string;\n}',
  },
  {
    name: 'SettingLibraryOpeningMessage',
    declaration: 'export interface SettingLibraryOpeningMessage {\n    id: string;\n    title: string;\n    content: string;\n    variableVersionId?: string;\n}',
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
    declaration: 'export interface VariableItemConfig {\n    id: string;\n    title: string;\n    objectId: string;\n    enabled: boolean;\n    type: \'\' | \'number\' | \'string\' | \'boolean\' | \'object\' | \'array\' | \'null\';\n    defaultValue: string;\n    description: string;\n    updateRule: string;\n    readMode: \'required\' | \'on_demand\';\n    order: number;\n    treeViewOrder: number;\n    createdAt: string;\n    updatedAt: string;\n}',
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
    declaration: 'export interface VariableViewerTimeline {\n    initial: VariableStateDocument;\n    current: VariableStateDocument;\n    floors: VariableFloorSnapshot[];\n}',
  },
  {
    name: 'WebFetchMode',
    declaration: 'export type WebFetchMode = \'http\' | \'deepseek_fetch_api\';',
  },
  {
    name: 'WebSearchMode',
    declaration: 'export type WebSearchMode = \'provider_native\' | \'tavily\' | \'deepseek_search_api\';',
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
