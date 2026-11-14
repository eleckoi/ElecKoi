import type { ReactNode } from 'react'

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
