import type { Context } from '@deepseek-ai/cordis'
import type { AgentPreset, AgentPresetCatalog, RegexRule, AgentPresetPurpose, AgentPresetImportSource, AgentPresetImportDocument, AgentPresetImportResult, AgentPresetExportFormat, AgentPresetExportResult } from '@eleckoi/dsh-product-api/types'

export interface PresetCatalogSnapshot { status: 'loading' | 'ready' | 'error'; catalog: AgentPresetCatalog | null; error: string }
export interface PresetDetailSnapshot { status: 'idle' | 'ready' | 'error'; preset: AgentPreset | null; error: string }

/** 管理 Agent 预设、预设分组、导入导出和页面状态。 */
export interface ElecKoiPresets {
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
   * 保存同一用途内全部分组的显示顺序，保留预设归属。
   * @param groupIds - 该用途的全部分组编号，按显示顺序排列。
   * @param purpose - 所属预设分类。
   * @returns 更新后的预设目录；目录已变化时拒绝保存。
   */
  reorderGroups(groupIds: string[], purpose?: AgentPresetPurpose): Promise<AgentPresetCatalog>
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
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    eleckoiPresets: ElecKoiPresets
  }
}

/** Client 插件入口。 */
export declare function apply(ctx: Context): void
export declare const inject: string[]
