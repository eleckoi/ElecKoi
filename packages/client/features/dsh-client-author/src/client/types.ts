import type { NativeVariableEditorScope } from '../variable-editor.js'
import type { EditingVariableTarget, EditingVariableSchemaDescription } from '@eleckoi/tavern-native'
import type { AuthorScriptStatus, AuthorScriptPanel } from '@eleckoi/author-sdk'
import type { NativeFrontendClient } from '../frontends.js'

export interface NativeAuthorRuntimeSnapshot {
  status: 'idle' | 'starting' | 'ready' | 'error' | 'closed'
  conversationId: string
  error: string
  scriptStatuses: Record<string, AuthorScriptStatus & { scope: string; ownerId: string; source: string }>
  auxiliaryGenerating?: boolean
}

export interface NativeAuthorPanel extends AuthorScriptPanel {
  key: string; conversationId: string; scriptKey: string; baseUrl: string
}
export interface NativeAuthorUiSnapshot {
  buttons: Array<{ key: string; id: string; label: string; scriptKey: string; scriptName: string;
    scope: string; conversationId: string; busy: boolean; error: string }>
  panel: NativeAuthorPanel | null
}

export type NativeAuthorChatHandlers = Record<string, (params: Record<string, unknown>) => unknown | Promise<unknown>>
export type NativeAuthorDocumentRelease = (() => void) & { ready: Promise<void> }
export type NativeAuthorProjectContext = { projectId: string; entryFile: string; view: string } & (
  | { scope: 'application' }
  | { scope: 'character'; characterId: string; conversationId?: string }
)

/** 正式原生作者页面与脚本运行服务。 */
export interface ElecKoiAuthorRuntime {
  /** Manual variable editing shares native scopes, live schema objects and ordered persistence. */
  getVariableSchemaRevision(): number
  subscribeVariableSchemas(listener: () => void): () => void
  listVariableEditorScopes(conversationId: string): Promise<NativeVariableEditorScope[]>
  readVariableEditorScope(conversationId: string, target: EditingVariableTarget): Promise<Record<string, unknown>>
  describeVariableEditorSchema(target: EditingVariableTarget, variables: Record<string, unknown>): Promise<EditingVariableSchemaDescription>
  saveVariableEditorScope(conversationId: string, target: EditingVariableTarget, variables: Record<string, unknown>): Promise<Record<string, unknown>>
  /** 读取当前运行状态。
   * @returns 当前聊天与各脚本的运行状态。
   */
  getSnapshot(): NativeAuthorRuntimeSnapshot
  /** 订阅运行状态。
   * @param listener - 状态变化回调。
   * @returns 取消订阅函数。
   */
  subscribe(listener: () => void): () => void
  /** Stop non-silent auxiliary requests attached to the current chat's stop button. */
  stopAuxiliaryGenerations(conversationId: string): Promise<boolean>
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
  mountScriptPanelDocument(target: Window, key: string): NativeAuthorDocumentRelease
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
  mountDocument(target: Window, conversationId: string, messageId: string): NativeAuthorDocumentRelease
  /** 在项目页面安装 SDK；应用项目跟随选择，角色项目只操作明确所属角色的聊天。
   * @param target - 同源项目页面窗口。
   * @param project - 明确项目编号、入口、窗口及所属角色；聊天页面还须提供所属聊天。
   * @returns 关闭该页面 SDK 的函数。
   */
  mountProjectDocument(target: Window, project: NativeAuthorProjectContext): NativeAuthorDocumentRelease
}

declare module '@deepseek-ai/cordis' {
  interface Context { eleckoiAuthorRuntime: ElecKoiAuthorRuntime; eleckoiFrontendProjects: NativeFrontendClient }
}
