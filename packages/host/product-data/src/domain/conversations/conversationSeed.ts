import type { OpeningMessageOption } from '@shared/contracts/entities/chat'
import type { ElecKoiDatabase } from '@product-data/storage/sqlite/SqliteDatabase'
import type { CharacterOpenings } from '@shared/contracts/characterOpenings/schemas'
import type { VariableConfig } from '@shared/contracts/variables/schemas'
import { createVariableIdentities } from '@shared/foundation/variables/identity'
import { eq } from 'drizzle-orm'
import { characterCastMembers } from '@product-data/storage/sqlite/schema/common'
import { requireCharacter } from '@product-data/domain/personas'
import { characterAssetBaseUrl } from '@shared/foundation/characterAssetReference'
import { characterCastCropSchema } from '@shared/contracts/characters/cast'
import type { OpeningSceneSegment, OpeningSegment } from '@shared/contracts/characterOpenings/schemas'

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
  const messages = entry.openingMessages
  const opening = messages.find(candidate => candidate.id === entry.defaultOpeningMessageId)
  const resolveSegment = messages.some(candidate => candidate.segments) ? openingSceneResolver(characterId, database) : undefined

  const config = messages.some(candidate => candidate.variableVersionId) ? variables.get(characterId, database) : undefined
  const openingOptions = messages.map((candidate) => {
    const versionId = candidate.variableVersionId || ''
    const version = versionId ? config?.versions.find((item) => item.id === versionId) : undefined
    return {
      id: candidate.id, title: candidate.title, content: candidate.content,
      ...(candidate.segments && resolveSegment ? { segments: candidate.segments.map(resolveSegment) } : {}),
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

function openingSceneResolver(characterId: string, database: ElecKoiDatabase): (segment: OpeningSegment) => OpeningSceneSegment {
  const card = requireCharacter(database, characterId)
  const rows = database.select().from(characterCastMembers).where(eq(characterCastMembers.characterId, characterId)).all()
  const cast = new Map(rows.map(member => [member.id, member]))
  const baseUrl = characterAssetBaseUrl(characterId)
  return segment => {
    if (segment.kind === 'cover') return { ...segment, speakerName: card.name, speakerAvatar: card.coverImage || card.avatar }
    const speaker = cast.get(segment.speakerId)
    if (!speaker) return segment
    const avatar = speaker.circleAssetId ?? speaker.portraitAssetId
    const crop = !speaker.circleAssetId && speaker.portraitAssetId ? characterCastCropSchema.nullable().parse(JSON.parse(speaker.cropJson)) : null
    return { ...segment, speakerName: speaker.name,
      ...(avatar ? { speakerAvatar: baseUrl + avatar } : {}), ...(crop ? { speakerCrop: crop } : {}) }
  }
}
