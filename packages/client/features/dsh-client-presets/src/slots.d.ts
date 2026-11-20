import type { MouseEvent, ReactNode } from 'react'
import type { AgentPresetLibraryGroup, AgentPresetPurpose, AgentPresetSummary } from '@eleckoi/dsh-product-api/types'

export type PresetLibrarySurface = 'pc-sidebar' | 'pc-manager' | 'android'

export interface PresetPageListOwner {
  fallback: ReactNode
  surface: 'pc-sidebar' | 'android'
  purpose: AgentPresetPurpose
  presets: readonly Readonly<AgentPresetSummary>[]
  selectedPresetId: string
  onSelect(presetId: string): void
}

export interface PresetPagePreviewOwner {
  fallback: ReactNode
  preset: Readonly<AgentPresetSummary>
  active: boolean
  activating: boolean
  error: string
  onEdit(): void
  onActivate(): Promise<void>
}

export interface PresetLibraryItemOwner {
  fallback: ReactNode
  surface: PresetLibrarySurface
  preset: Readonly<AgentPresetSummary>
  active: boolean
  selected: boolean
  selecting: boolean
  onSelect(): void
  onOpenMenu?(event: MouseEvent<HTMLElement>): void
}

export type PresetLibrarySearchOwner = { fallback: ReactNode } & (
  | { surface: 'pc-sidebar' | 'pc-manager'; value: string; onChange(value: string): void }
  | { surface: 'android'; onOpen(): void }
)

export interface PresetLibraryGroupsOwner {
  fallback: ReactNode
  surface: PresetLibrarySurface
  purpose: AgentPresetPurpose
  groups: readonly Readonly<AgentPresetLibraryGroup>[]
  allGroup: string
  selectedGroup: string
  onSelectGroup(groupId: string): void
}

export interface PresetLibrarySelectionOwner {
  fallback: ReactNode
  surface: 'pc-manager' | 'android'
  purpose: AgentPresetPurpose
  mode: 'export' | 'delete'
  selectedIds: readonly string[]
  busy: boolean
  onCancel(): void
  onConfirm(): void | Promise<unknown>
  onSelectAll?(): void
}

export interface PresetLibraryMenuOwner {
  surface: PresetLibrarySurface
  purpose: AgentPresetPurpose
  menu: 'create' | 'bulk' | 'export'
  busy: boolean
  onDismiss(): void
}

export interface PresetLibraryItemMenuOwner {
  surface: PresetLibrarySurface
  preset: Readonly<AgentPresetSummary>
  busy: boolean
  onDismiss(): void
}

export interface PresetLibraryGroupMenuOwner {
  surface: 'pc-manager'
  purpose: AgentPresetPurpose
  group: Readonly<AgentPresetLibraryGroup> | null
  onDismiss(): void
}

export interface PresetEditorOwner {
  fallback: ReactNode
  presetId: string
  preset: Record<string, unknown>
  active: boolean
  dirty: boolean
  saving: boolean
  error: string
  onChange(preset: Record<string, unknown>): void
  onSave(preset?: Record<string, unknown>): Promise<boolean>
  onDiscard(): void
  onActivate(): Promise<void>
}

export interface PresetProfileEditorOwner extends PresetEditorOwner {
  onClose(): void
}

export interface PresetManagerOwner {
  fallback: ReactNode
  catalog: Record<string, unknown> | null
  purpose: 'roleplay' | 'creator'
  onPurposeChange(purpose: 'roleplay' | 'creator'): void
  selectedGroup: string
  selectedPresetId: string
  importing: boolean
  importError: string
  onSelectGroup(groupId: string): void
  onSelectPreset(presetId: string): void
  onRefresh(preferredId?: string): Promise<unknown>
  onImport(): void
  onExport(format: string): Promise<void>
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'eleckoi.preset.page.list': {
      kind: 'chain'
      scope: 'root'
      owner: PresetPageListOwner
    }
    'eleckoi.preset.page.preview': {
      kind: 'chain'
      scope: 'root'
      owner: PresetPagePreviewOwner
    }
    'eleckoi.preset.library.item': {
      kind: 'chain'
      scope: 'root'
      owner: PresetLibraryItemOwner
    }
    'eleckoi.preset.library.search': {
      kind: 'chain'
      scope: 'root'
      owner: PresetLibrarySearchOwner
    }
    'eleckoi.preset.library.groups': {
      kind: 'chain'
      scope: 'root'
      owner: PresetLibraryGroupsOwner
    }
    'eleckoi.preset.library.selection': {
      kind: 'chain'
      scope: 'root'
      owner: PresetLibrarySelectionOwner
    }
    'eleckoi.preset.library.menu.actions': {
      kind: 'list'
      scope: 'root'
      owner: PresetLibraryMenuOwner
    }
    'eleckoi.preset.library.item.menu.actions': {
      kind: 'list'
      scope: 'root'
      owner: PresetLibraryItemMenuOwner
    }
    'eleckoi.preset.library.group.menu.actions': {
      kind: 'list'
      scope: 'root'
      owner: PresetLibraryGroupMenuOwner
    }
    'eleckoi.preset.editor.profile': {
      kind: 'chain'
      scope: 'root'
      owner: PresetProfileEditorOwner
    }
    'eleckoi.preset.editor.introduction': {
      kind: 'chain'
      scope: 'root'
      owner: PresetEditorOwner
    }
    'eleckoi.preset.editor.prompts': {
      kind: 'chain'
      scope: 'root'
      owner: PresetEditorOwner
    }
    'eleckoi.preset.editor.tools': {
      kind: 'chain'
      scope: 'root'
      owner: PresetEditorOwner
    }
    'eleckoi.preset.editor.regex': {
      kind: 'chain'
      scope: 'root'
      owner: PresetEditorOwner
    }
    'eleckoi.preset.editor.scripts': {
      kind: 'chain'
      scope: 'root'
      owner: PresetEditorOwner
    }
    'eleckoi.preset.manager': {
      kind: 'chain'
      scope: 'root'
      owner: PresetManagerOwner
    }
  }
}
