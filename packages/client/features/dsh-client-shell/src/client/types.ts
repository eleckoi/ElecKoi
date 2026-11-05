import type { Context } from '@deepseek-ai/cordis'
import type { ILayout } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { ReactNode } from 'react'
import type { HostObservable, PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
export type { ILayout, MainPanelId, PanelInfo } from '@deepseek-ai/dsh-client-ui-layout/client'

/** 窗口呈现层使用的导航面；业务调用继续使用正式 Client 服务。 */
export interface ElecKoiWindowNavigation {
  readonly selectedPanelId: string
  readonly items: ReadonlyArray<{ id: string; label: string }>
  readonly hasSidebarEntryActions: boolean
  renderSidebarEntryActions(renderSlot: PropsRenderSlots<'sidebar.panellist.actions'>['renderSlot'], onDismiss: () => void): ReactNode
  readonly sidebar: HostObservable<{ shown: boolean }>
  selectPanel(id: string): void
  renderPanel(id: string): ReactNode
  renderSidebar(renderContent: (renderSlot: unknown, workspaceSidebar?: ReactNode) => ReactNode, owner?: { workspace?: boolean; collapsed?: boolean; width?: number }): ReactNode
  toggleSidebar(): void
  closeSidebar(): void
  setPanelGuard(guard: (commit: () => void) => void): () => void
}

/** 保留共享窗口传入的业务服务与页面呈现回调。 */
export interface ElecKoiWindowOwner {
  navigation: ElecKoiWindowNavigation
  fallback: ReactNode
  readonly [property: string]: unknown
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'eleckoi.shell.window': { kind: 'chain'; scope: 'root'; owner: ElecKoiWindowOwner }
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context { layout: ILayout }
}

/** Client 插件入口。 */
export declare function apply(ctx: Context): void
export declare const inject: string[]
