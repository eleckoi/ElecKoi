import type { Context } from '@deepseek-ai/cordis'

export interface ClientModelOption {
  id: string; name: string; description?: string; inputModalities?: readonly ('text' | 'image')[];
  contextWindowTokens?: number; maxOutputTokens?: number; supportsImageInput?: boolean;
  overrideFields?: string[]; capabilitiesOverride?: boolean; catalogDefaults?: ClientModelOption;
  reasoningEfforts?: false | Record<string, string | null>; reasoningEffort?: string;
  temperature?: number; topP?: number; autoCompactTokenLimit?: number; isUserAdded?: boolean;
}
export interface ClientModelConfig {
  id: string; name?: string; provider?: string; model?: string; model_options?: ClientModelOption[];
  enabled?: boolean; base_url?: string; api_format?: string; api_key?: string;
  custom_headers?: Record<string, string>; proxy_url?: string; credentialRef?: string;
  credentialConfigured?: boolean; clearCredential?: boolean; settingsNs?: string; settingsPath?: string[];
  builtin?: boolean; useBuiltinModels?: boolean; draftKey?: string;
  clearConfiguration?: boolean; image_settings?: Record<string, import('@eleckoi/dsh-product-api/types').VariableJsonValue>;
}
export interface ClientModelProvider { provider: string; displayName?: string; settingsNs: string; settingsPath: string[]; declared?: boolean }
export interface ClientModelParameterPatch {
  contextWindowTokens?: number | null; maxOutputTokens?: number | null;
  temperature?: number | null; topP?: number | null; autoCompactTokenLimit?: number | null;
  capabilitiesOverride?: boolean; inputModalities?: readonly ('text' | 'image')[];
  supportsImageInput?: boolean; overrideFields?: string[];
  reasoningEfforts?: false | Record<string, string | null>; reasoningEffort?: string | null;
}
export interface ModelCatalogSnapshot { status: 'loading' | 'ready' | 'error'; configs: ClientModelConfig[]; providers: ClientModelProvider[]; error: string }

/** 通过官方模型目录、Settings 和 Credentials 管理模型配置。 */
export interface ElecKoiModels {
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
   * 在写入队列中合并指定模型的参数，不覆盖其他模型或提供商字段。
   * @param configId - 当前提供商配置编号。
   * @param modelId - 当前提供商下的准确模型编号。
   * @param patch - 本次编辑的模型参数与能力。
   * @returns 更新后的配置；异步失败保留原始错误。
   */
  saveModelParameters(configId: string, modelId: string, patch: ClientModelParameterPatch): Promise<ClientModelConfig | undefined>
  /**
   * 当前会话的官方参数投影；随 Session 释放。
   * @param sessionId - 官方会话编号。
   * @returns 官方投影的读取与订阅面。
   */
  sessionParameters(sessionId: string): { getSnapshot(): import('@eleckoi/dsh-product-api/types').SessionModelParameterState | undefined; subscribe(listener: () => void): () => void }
  /**
   * 读取会话生成参数，不修改模型连接配置。
   * @param sessionId - 官方会话编号。
   * @returns 会话参数与修订号。
   */
  readSessionModelParameters(sessionId: string): Promise<import('@eleckoi/dsh-product-api/types').SessionModelParameterState>
  /**
   * 保存会话参数补丁，使用官方日志投影修订号检查冲突。
   * @param sessionId - 官方会话编号。
   * @param provider - 提供商路由编号。
   * @param model - 模型编号。
   * @param patch - 本次生成参数变更。
   * @param revision - 编辑时读取的会话参数修订号。
   * @returns 已保存的会话参数投影。
   */
  saveSessionModelParameters(sessionId: string, provider: string, model: string, patch: import('@eleckoi/dsh-product-api/types').SessionModelParameterPatch, revision: number): Promise<import('@eleckoi/dsh-product-api/types').SessionModelParameterState>
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
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    eleckoiModels: ElecKoiModels
  }
}

/** Client 插件入口。 */
export declare function apply(ctx: Context): void
export declare const inject: string[]
