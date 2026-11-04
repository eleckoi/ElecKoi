import type { OpeningMessageOption } from '@shared/contracts/entities/chat'
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes'
import { DesktopError } from '@shared/foundation/DesktopError'
import type { ElecKoiDatabase } from '@product-data/storage/sqlite/SqliteDatabase'
import type { CharacterOpenings } from '@shared/contracts/characterOpenings/schemas'
import type { VariableConfig } from '@shared/contracts/variables/schemas'

interface ConversationOpeningReader {
  get(characterId: string, database: ElecKoiDatabase): CharacterOpenings
}

interface ConversationVariableConfigReader {
  get(characterId: string, database: ElecKoiDatabase): VariableConfig
}

export interface ConversationSeed {
  variableVersionId?: string
  initialVariableStateJson: string
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
  const config = variables.get(characterId, database)
  const entry = openings.get(characterId, database)
  const messages = entry.openingMessages.filter(message => message.content.trim())
  const opening = messages.find(candidate => candidate.id === entry.defaultOpeningMessageId)

  const openingOptions = messages.map((candidate) => {
    const versionId = candidate.variableVersionId || config.activeVersionId
    const version = config.versions.find((item) => item.id === versionId)
    if (!version) throw new DesktopError(ELECKOI_FAILURE_CODES.lookupNotFound, `开场白“${candidate.title || '未命名开场白'}”绑定的变量版本不存在。`, { what: '变量版本' })
    return {
      id: candidate.id, title: candidate.title, content: candidate.content,
      variableVersionId: versionId,
      initialVariableStateJson: candidate.variableVersionId
        ? version.initialStateJson
        : candidate.initialVariableStateJson.trim() || version.initialStateJson
    }
  })
  const selected = openingOptions.find((candidate) => candidate.id === opening?.id)
  return {
    variableVersionId: selected?.variableVersionId || config.activeVersionId,
    initialVariableStateJson: selected?.initialVariableStateJson || config.initialStateJson,
    openingText: opening?.content.trim() || '',
    openingOptions,
    selectedOpeningId: opening?.id ?? ''
  }
}
