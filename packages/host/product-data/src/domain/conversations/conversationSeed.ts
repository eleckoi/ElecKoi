import type { OpeningMessageOption } from '@shared/contracts/entities/chat'
import type { ElecKoiDatabase } from '@product-data/storage/sqlite/SqliteDatabase'
import type { CharacterOpenings } from '@shared/contracts/characterOpenings/schemas'
import type { VariableConfig } from '@shared/contracts/variables/schemas'
import { createVariableIdentities } from '@shared/foundation/variables/identity'

interface ConversationOpeningReader {
  get(characterId: string, database: ElecKoiDatabase): CharacterOpenings
}

interface ConversationVariableConfigReader {
  get(characterId: string, database: ElecKoiDatabase): VariableConfig
}

export interface ConversationSeed {
  variableVersionId?: string
  initialVariableStateJson: string
  initialVariableIdentityJson?: string
  openingText: string
  openingOptions: OpeningMessageOption[]
  selectedOpeningId: string
}

export function resolveConversationSeed(
  characterId: string,
  database: ElecKoiDatabase,
  openings: ConversationOpeningReader,
  variables: ConversationVariableConfigReader
): ConversationSeed {
  const entry = openings.get(characterId, database)
  const messages = entry.openingMessages.filter(message => message.content.trim())
  const opening = messages.find(candidate => candidate.id === entry.defaultOpeningMessageId)

  const config = messages.some(candidate => candidate.variableVersionId) ? variables.get(characterId, database) : undefined
  const openingOptions = messages.map((candidate) => {
    const versionId = candidate.variableVersionId || ''
    const version = versionId ? config?.versions.find((item) => item.id === versionId) : undefined
    return {
      id: candidate.id, title: candidate.title, content: candidate.content,
      variableVersionId: versionId,
      initialVariableStateJson: version?.initialStateJson || '{}',
      initialVariableIdentityJson: JSON.stringify(createVariableIdentities(JSON.parse(version?.initialStateJson || '{}'),
        { versionId, objects: version?.objects || [], variables: version?.variables || [] }, 'runtime'))
    }
  })
  const selected = openingOptions.find((candidate) => candidate.id === opening?.id)
  return {
    variableVersionId: selected?.variableVersionId || '',
    initialVariableStateJson: selected?.initialVariableStateJson || '{}',
    initialVariableIdentityJson: selected?.initialVariableIdentityJson || '{}',
    openingText: opening?.content.trim() || '',
    openingOptions,
    selectedOpeningId: opening?.id ?? ''
  }
}
