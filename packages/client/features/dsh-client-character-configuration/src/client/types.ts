import type { Context } from '@deepseek-ai/cordis'
import type { SettingLibrary, SettingLibraryConversation, VariableConfig, RegexRule, RegexRuleCollection, RegexRuleScope, RegexRuleImportDocument, RegexRuleImportResult, RegexRuleTestResult, RegexRuleTarget, ScriptLibrary, ScriptLibraryScope } from '@eleckoi/dsh-product-api/types'

export interface ConfigurationSnapshot<T> { status: 'idle' | 'loading' | 'ready' | 'error'; value: T | null; error: string }

/** 读取和保存角色配置，保留完整字段、触发方式和提示词插入位置。 */
export interface ElecKoiSettingLibraries {
  /** Read the global library's current client snapshot. */
  getGlobalSnapshot(): ConfigurationSnapshot<SettingLibrary>
  /** Subscribe to changes of the independently owned global library. */
  subscribeGlobal(listener: (snapshot: ConfigurationSnapshot<SettingLibrary>) => void): () => void
  /** Read the full global library and update its client snapshot. */
  readGlobal(): Promise<SettingLibrary>
  /** Save the global library with all entries, versions, and insertion settings. */
  saveGlobal(library: SettingLibrary): Promise<SettingLibrary>
  /** Save expanded folders in the global library editor. */
  saveGlobalViewState(expandedIds: string[]): Promise<string[]>
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
}

/** 读取和保存角色配置，保留完整字段、触发方式和提示词插入位置。 */
export interface ElecKoiVariables {
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
}

/** 读取和保存角色配置，保留完整字段、触发方式和提示词插入位置。 */
export interface ElecKoiRegexRules {
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
}

/** 按正式归属读取、保存和订阅全局、角色与预设脚本库。 */
export interface ElecKoiScriptLibraries {
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
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    eleckoiSettingLibraries: ElecKoiSettingLibraries
    eleckoiVariables: ElecKoiVariables
    eleckoiRegexRules: ElecKoiRegexRules
    eleckoiScriptLibraries: ElecKoiScriptLibraries
  }
}

/** Client 插件入口。 */
export declare function apply(ctx: Context): void
export declare const inject: string[]
