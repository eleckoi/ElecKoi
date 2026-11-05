import type { Context } from '@deepseek-ai/cordis'
import type { CreatorProjectCollection, CreateCreatorProjectInput } from '@eleckoi/dsh-product-api/types'
import type { CreatorStudioSession, CreatorStudioSessionSummary, CreatorStudioMessage, ConversationModelSelection } from '@eleckoi/dsh-product-api/types'
import type { ComponentType } from 'react'
import type { ModelLabelOwner } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type { EmptyWorkspaceOwnerProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SessionReference } from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'

declare module '@deepseek-ai/dsh-api-session-controller/client' {
  interface SessionReferenceSourceMap { eleckoiCreatorStudio: unknown }
}

export interface CreatorStudioConversationSnapshot {
  status: 'idle' | 'loading' | 'ready' | 'error'
  active: CreatorStudioSession | null
  reference: SessionReference | null
  items: CreatorStudioSessionSummary[]
  error: string
  editingSessionId: string
}
export interface CreatorStudioSessions {
  getSnapshot(): CreatorStudioConversationSnapshot
  subscribe(listener: () => void): () => void
  refresh(): Promise<CreatorStudioSessionSummary[]>
  create(characterId?: string, workspaceId?: string): Promise<CreatorStudioSession | undefined>
  startWorkspace(workspaceId?: string, options?: { prompt?: string; whenDraftExists?: 'append' | 'keep' | 'replace' }): Promise<void>
  open(sessionId: string): Promise<CreatorStudioSession | undefined>
  restoreRecent(): Promise<CreatorStudioSession | undefined>
  rename(sessionId: string, title: string): Promise<void>
  pin(sessionId: string, pinned: boolean): Promise<void>
  delete(sessionId: string): Promise<void>
  search(query: string, signal: AbortSignal): Promise<{ items: import('@deepseek-ai/dsh-api-session-controller/client').SessionSearchResultItem[]; hasMore: boolean }>
  readDefaultModel(): Promise<ConversationModelSelection>
  selectModel(selection: ConversationModelSelection): Promise<ConversationModelSelection>
  messages(): Promise<CreatorStudioMessage[]>
  regenerate(): Promise<void>
  deleteMessagesFrom(eventSeq: number, role: 'user' | 'assistant'): Promise<void>
  selectCharacter(characterId: string): Promise<CreatorStudioSession>
  release(): void
}
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'eleckoi.creator-studio.hero.workspace': { kind: 'single'; scope: 'root'; owner: EmptyWorkspaceOwnerProps }
    'eleckoi.creator-studio.model.label': { kind: 'single'; scope: 'session'; inline: true; owner: ModelLabelOwner }
    'eleckoi.creator-studio.conversation': { kind: 'single'; scope: 'root'; owner: { reference: SessionReference; component: ComponentType<any>; props: Record<string, unknown> } }
    'eleckoi.creator-studio.session': { kind: 'single'; scope: 'session'; owner: { component: ComponentType<any>; props: Record<string, unknown> } }
  }
}

export interface CreatorStudioSnapshot { status: 'loading' | 'ready' | 'error'; collection: CreatorProjectCollection; error: string }

/** 管理创作项目并使用官方目录选择器。 */
export interface ElecKoiCreatorStudio {
  readonly sessions: CreatorStudioSessions
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
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    eleckoiCreatorStudio: ElecKoiCreatorStudio
  }
}

/** Client 插件入口。 */
export declare function apply(ctx: Context): void
export declare const inject: string[]
