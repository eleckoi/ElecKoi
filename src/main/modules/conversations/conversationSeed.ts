import type { ConversationMetadata, OpeningMessageOption } from '@shared/contracts/entities/chat'
import type { ElecKoiDatabase } from '@main/platform/sqlite/SqliteDatabase'
import type { SettingLibraryEntry } from '@shared/contracts/settingLibrary/schemas'

interface ConversationSettingLibraryReader {
  get(characterId: string, database: ElecKoiDatabase): { entries: SettingLibraryEntry[] }
}

interface ConversationVariableConfigReader {
  initialState(characterId: string, database: ElecKoiDatabase): string
}

export interface ConversationSeed {
  initialVariableStateJson: string
  openingText: string
  openingOptions: OpeningMessageOption[]
  selectedOpeningId: string
}

function personaOpening(metadata: ConversationMetadata): string {
  const persona = metadata.characterPersona
  return persona.show_opening === true && typeof persona.opening === 'string'
    ? persona.opening.trim()
    : ''
}

export function resolveConversationSeed(
  characterId: string,
  characterMode: string,
  metadata: ConversationMetadata,
  database: ElecKoiDatabase,
  settingLibraries: ConversationSettingLibraryReader,
  variables: ConversationVariableConfigReader
): ConversationSeed {
  const fallbackState = variables.initialState(characterId, database)
  if (characterMode !== 'story') {
    return { initialVariableStateJson: fallbackState, openingText: personaOpening(metadata), openingOptions: [], selectedOpeningId: '' }
  }

  const entry = settingLibraries.get(characterId, database).entries.find((candidate) => (
    candidate.enabled && (candidate.id === 'fixed-opening-assistant' || candidate.kind === 'opening')
  ))
  const opening = entry?.openingMessages.find((candidate) => candidate.id === entry.defaultOpeningMessageId)
    ?? entry?.openingMessages[0]

  return {
    initialVariableStateJson: opening?.initialVariableStateJson.trim() || fallbackState,
    openingText: opening?.content.trim() || '',
    openingOptions: (entry?.openingMessages ?? []).map((candidate) => ({
      id: candidate.id, title: candidate.title, content: candidate.content,
      initialVariableStateJson: candidate.initialVariableStateJson.trim() || fallbackState
    })),
    selectedOpeningId: opening?.id ?? ''
  }
}
