import type { Context } from '@deepseek-ai/cordis'
import type { WebSearchMode, WebFetchMode, TavilyConnection } from '@eleckoi/dsh-product-api/types'

export interface WebSearchSnapshot { status: 'loading' | 'ready' | 'error'; mode: WebSearchMode; fetchMode: WebFetchMode; officialDeepSeekAvailable: boolean; maxResults: number; apiKeyConfigured: boolean; apiKeyRef: string; apiKeyWritable: boolean; writable: boolean; tavilyAvailable: boolean; revision?: number; error: string }
export interface WebSearchSettingsPatch { mode?: WebSearchMode; fetchMode?: WebFetchMode; maxResults?: number }

/** 管理搜索、网页抓取和官方 Credentials 中的密钥。 */
export interface ElecKoiWebSearch {
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
  /**
   * 打开「插件 → 网页搜索」官方设置页；独立桌面窗口等待主窗口回执，不可用时抛出或拒绝。
   * @returns 当前窗口立即完成；独立桌面窗口返回等待主窗口导航完成的 Promise。
   */
  openPluginSettings(): void | Promise<void>
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    eleckoiWebSearch: ElecKoiWebSearch
  }
}

/** Client 插件入口。 */
export declare function apply(ctx: Context): void
export declare const inject: string[]
