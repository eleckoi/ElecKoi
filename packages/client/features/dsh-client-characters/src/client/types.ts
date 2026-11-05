import type { Context } from '@deepseek-ai/cordis'
import type { CharacterCollection, CharacterRecord, CharacterGroupAssignment, CharacterImportSource, CharacterImportFile, CharacterImportPreview, CharacterImportResult, CharacterExportFormat } from '@eleckoi/dsh-product-api/types'

export interface CharacterCatalogSnapshot { status: 'loading' | 'ready' | 'error'; collection: CharacterCollection; error: string }
export interface CharacterDownloadResult { canceled: boolean; directory: string; written: { characterId: string; fileName: string }[]; failures: { characterId: string; message: string }[] }

/** 管理角色、分组、角色卡导入和浏览器下载。 */
export interface ElecKoiCharacters {
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
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    eleckoiCharacters: ElecKoiCharacters
  }
}

/** Client 插件入口。 */
export declare function apply(ctx: Context): void
export declare const inject: string[]
