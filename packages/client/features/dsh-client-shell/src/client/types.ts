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
  reportSidebar(state: { shown: boolean; width: number; drawer: boolean }): void
  toggleSidebar(): void
  closeSidebar(): void
  setPanelGuard(guard: (commit: () => void) => void): () => void
}

/** 保留共享窗口传入的业务服务与页面呈现回调。 */
export interface ElecKoiWindowOwner {
  navigation: ElecKoiWindowNavigation
  nativeFrame: ReactNode
  fallback: ReactNode
  readonly [property: string]: unknown
}

export interface PluginListEntry {
  readonly kind: 'item' | 'package'
  readonly id: string
  readonly name: string
  readonly icon: string
  readonly group: 'official' | 'eleckoi' | 'installed'
}

export interface PluginPageListOwner {
  fallback: ReactNode
  query: string
  entries: readonly PluginListEntry[]
  selectedKey: string
  status: 'idle' | 'loading' | 'ready' | 'error' | 'unavailable'
  error: string
  onQueryChange(query: string): void
  onSelect(kind: PluginListEntry['kind'], id: string): void
  onAdd(): void
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotFactoryMap {
    /** Product display seats hosted by the actual registered native ConversationRoot. */
    'eleckoi.conversation.frame': {
      scope: 'session-maybe'
      props: {
        presentation: {
          header: null
          views: ReactNode
          composer: ReactNode
          phase?: 'active' | 'hero' | 'settling'
          variant?: 'main' | 'embedded'
          hero?: boolean
          widthControls?: false
          widthPreference?: { read(): number | null; write(width: number): void }
          onScrollElement?: (element: HTMLDivElement | null) => void
        }
      }
    }
  }
  interface SlotMap {
    'sidebar.update': { kind: 'single'; scope: 'root'; owner: Record<string, never> }
    'eleckoi.shell.window': { kind: 'chain'; scope: 'root'; owner: ElecKoiWindowOwner }
    'eleckoi.plugin.page.list': { kind: 'chain'; scope: 'root'; owner: PluginPageListOwner }
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context { layout: ILayout }
}

/** Client 插件入口。 */
export declare function apply(ctx: Context): void
export declare const inject: string[]
