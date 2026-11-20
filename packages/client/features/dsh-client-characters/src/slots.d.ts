import type { MouseEvent, ReactNode } from 'react'
import type { CharacterRecord } from '@eleckoi/dsh-product-api/types'

export type CharacterEditorSection = 'card' | 'openings' | 'lore' | 'variables' | 'regex' | 'scripts' | 'frontend' | 'assets' | 'dynamic'
export type CharacterLibrarySurface = 'pc-sidebar' | 'pc-manager' | 'android'
export type CharacterLibrarySort = 'default' | 'newest' | 'oldest' | 'edited' | 'name'

export interface CharacterEditorAssetsOwner {
  fallback: ReactNode
  characterId: string
}

export interface CharacterEditorNavigationOwner {
  fallback: ReactNode
  characterId: string | null
  section: CharacterEditorSection
  sections: readonly { id: CharacterEditorSection; label: string }[]
  compact: boolean
  collapsed: boolean
  busy: boolean
  onSelect(section: CharacterEditorSection): void
  onToggle(): void
}

export interface CharacterEditorToolbarOwner {
  fallback: ReactNode
  characterId: string | null
  section: CharacterEditorSection
  compact: boolean
  dirty: boolean
  saving: boolean
  onSave(): Promise<boolean>
  onClose(): void
}

export interface CharacterLibraryListOwner {
  fallback: ReactNode
  surface: 'android'
  characters: readonly Readonly<CharacterRecord>[]
  onSelect(characterId: string): void
}

export interface CharacterLibraryItemOwner {
  fallback: ReactNode
  surface: CharacterLibrarySurface
  character: Readonly<CharacterRecord>
  selected: boolean
  selecting: boolean
  onSelect(): void
  onOpenConversation?(): void
  onOpenMenu?(event: MouseEvent<HTMLElement>): void
}

export type CharacterLibrarySearchOwner = { fallback: ReactNode } & (
  | { surface: 'pc-sidebar' | 'pc-manager'; value: string; onChange(value: string): void }
  | { surface: 'android'; onOpen(): void }
)

export interface CharacterLibrarySortOwner {
  fallback: ReactNode
  surface: 'pc-manager' | 'android'
  value: CharacterLibrarySort
  disabled?: boolean
  onChange(value: CharacterLibrarySort): void | Promise<unknown>
}

export interface CharacterLibraryGroupsOwner {
  fallback: ReactNode
  surface: CharacterLibrarySurface
  groups: readonly string[]
  allGroup: string
  selectedGroup: string
  onSelectGroup(group: string): void | Promise<unknown>
  destination?: boolean
  collapsedGroups?: Readonly<Record<string, boolean>>
  onToggleGroup?(group: string): void
}

export interface CharacterLibrarySelectionOwner {
  fallback: ReactNode
  surface: 'pc-manager' | 'android'
  mode: 'export' | 'delete' | 'move' | 'duplicate'
  selectedIds: readonly string[]
  busy: boolean
  onCancel(): void
  onConfirm(): void | Promise<unknown>
  onSelectAll?(): void
}

export interface CharacterLibraryMenuOwner {
  surface: CharacterLibrarySurface
  menu: 'create' | 'bulk' | 'sort'
  busy: boolean
  onDismiss(): void
}

export interface CharacterLibraryItemMenuOwner {
  surface: CharacterLibrarySurface
  character: Readonly<CharacterRecord>
  busy: boolean
  onDismiss(): void
}

export interface CharacterLibraryGroupMenuOwner {
  surface: 'pc-sidebar' | 'pc-manager'
  group: string | null
  onDismiss(): void
}

export interface CharacterEditorCardOwner {
  fallback: ReactNode
  characterId: string
  character: {
    id: string
    name?: string
    persona?: Record<string, unknown>
    [key: string]: unknown
  }
  dirty: boolean
  saving: boolean
  error: string
  saveNotice: string
  onChange(patch: Record<string, unknown>): void
  onCancel(): void
  onSave(character?: CharacterEditorCardOwner['character']): Promise<boolean>
}

export interface CharacterEditorConfigurationController {
  save?(): boolean | Promise<boolean>
  discard?(): void
}

export interface CharacterEditorConfigurationOwner {
  fallback: ReactNode
  characterId: string
  dirty: boolean
  saving: boolean
  configuration: unknown
  onDirtyChange(dirty: boolean): void
  setController(controller: CharacterEditorConfigurationController | null): void
}

export interface CharacterListOwner {
  fallback: ReactNode
  characters: Record<string, unknown>
  activeCharacterId: string
  artworkMode: string
  onSelectCharacter(characterId: string): void
  onOpenCharacterChat(characterId: string): void
  onSaveCharacterGroups(...args: unknown[]): unknown
  onImportPreparedCharacters(...args: unknown[]): unknown
  onCreateCharacter(...args: unknown[]): unknown
  onDeleteCharacters(characterIds: string[]): unknown
  onExportCharacters(characterIds: string[], format: 'png' | 'zip'): Promise<unknown>
}

export interface CharacterProfileOwner {
  fallback: ReactNode
  characters: Record<string, unknown>
  selectedCharacterId: string
  onSelectCharacter(characterId: string): void
  onStartConversation(characterId: string): void
  onEditCharacter(characterId: string): unknown
  onCreateFirstCharacter(): unknown
}

export interface CharacterManagerOwner {
  fallback: ReactNode
  characters: Record<string, unknown>
  persona: Record<string, unknown>
  onRefresh(): Promise<unknown>
  onSaveGroups(...args: unknown[]): Promise<unknown>
  onDeleteCharacters(characterIds: string[]): Promise<unknown>
  onImportCharacters(token: string): Promise<unknown>
  onExportCharacters(...args: unknown[]): Promise<unknown>
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'eleckoi.character.editor.assets': {
      kind: 'chain'
      scope: 'root'
      owner: CharacterEditorAssetsOwner
    }
    'eleckoi.character.editor.navigation': {
      kind: 'chain'
      scope: 'root'
      owner: CharacterEditorNavigationOwner
    }
    'eleckoi.character.editor.toolbar': {
      kind: 'chain'
      scope: 'root'
      owner: CharacterEditorToolbarOwner
    }
    'eleckoi.character.library.list': {
      kind: 'chain'
      scope: 'root'
      owner: CharacterLibraryListOwner
    }
    'eleckoi.character.library.item': {
      kind: 'chain'
      scope: 'root'
      owner: CharacterLibraryItemOwner
    }
    'eleckoi.character.library.search': {
      kind: 'chain'
      scope: 'root'
      owner: CharacterLibrarySearchOwner
    }
    'eleckoi.character.library.sort': {
      kind: 'chain'
      scope: 'root'
      owner: CharacterLibrarySortOwner
    }
    'eleckoi.character.library.groups': {
      kind: 'chain'
      scope: 'root'
      owner: CharacterLibraryGroupsOwner
    }
    'eleckoi.character.library.selection': {
      kind: 'chain'
      scope: 'root'
      owner: CharacterLibrarySelectionOwner
    }
    'eleckoi.character.library.menu.actions': {
      kind: 'list'
      scope: 'root'
      owner: CharacterLibraryMenuOwner
    }
    'eleckoi.character.library.item.menu.actions': {
      kind: 'list'
      scope: 'root'
      owner: CharacterLibraryItemMenuOwner
    }
    'eleckoi.character.library.group.menu.actions': {
      kind: 'list'
      scope: 'root'
      owner: CharacterLibraryGroupMenuOwner
    }
    'eleckoi.character.page.list': {
      kind: 'chain'
      scope: 'root'
      owner: CharacterListOwner
    }
    'eleckoi.character.page.profile': {
      kind: 'chain'
      scope: 'root'
      owner: CharacterProfileOwner
    }
    'eleckoi.character.editor.card': {
      kind: 'chain'
      scope: 'root'
      owner: CharacterEditorCardOwner
    }
    'eleckoi.character.editor.openings': {
      kind: 'chain'
      scope: 'root'
      owner: CharacterEditorConfigurationOwner
    }
    'eleckoi.character.editor.lore': {
      kind: 'chain'
      scope: 'root'
      owner: CharacterEditorConfigurationOwner
    }
    'eleckoi.character.editor.variables': {
      kind: 'chain'
      scope: 'root'
      owner: CharacterEditorConfigurationOwner
    }
    'eleckoi.character.editor.regex': {
      kind: 'chain'
      scope: 'root'
      owner: CharacterEditorConfigurationOwner
    }
    'eleckoi.character.editor.scripts': {
      kind: 'chain'
      scope: 'root'
      owner: CharacterEditorConfigurationOwner
    }
    'eleckoi.character.editor.dynamic': {
      kind: 'chain'
      scope: 'root'
      owner: CharacterEditorConfigurationOwner
    }
    'eleckoi.character.editor.frontend': {
      kind: 'chain'
      scope: 'root'
      owner: Omit<CharacterEditorConfigurationOwner, 'configuration'>
    }
    'eleckoi.character.manager': {
      kind: 'chain'
      scope: 'root'
      owner: CharacterManagerOwner
    }
  }
}
