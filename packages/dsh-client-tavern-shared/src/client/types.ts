import type { Context } from '@deepseek-ai/cordis'
import type { CompatibilityValue } from '@eleckoi/dsh-product-api/types'
import type { ConversationClientMessage } from '@eleckoi/dsh-client-conversations/client'

export interface TavernSharedSnapshot {
  status: 'starting' | 'waiting-for-chat' | 'ready' | 'ready-global' | 'error'
  error: string
  methods: string[]
  uiEntries: Array<{ pluginId: string; [key: string]: CompatibilityValue }>
}

export interface TavernSharedPresentation {
  conversationId: string
  messages: ConversationClientMessage[]
  isGenerating: boolean
  generation?: { runId: string; messageId: string; content: string; sequence: number }
}

export type TavernSharedChatHandlers = Record<string, (params: Record<string, unknown>) => unknown | Promise<unknown>>

/** 应用持有的共享酒馆环境，连接插件面板、聊天控制器与正式消息投影。 */
export interface ElecKoiTavernShared {
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
}

declare module '@deepseek-ai/cordis' {
  interface Context { eleckoiTavernShared: ElecKoiTavernShared }
}

/** Client 插件入口，加载共同 SDK 后提供应用共享运行时。 */
export declare function apply(ctx: Context): Promise<void>
export declare const inject: string[]
