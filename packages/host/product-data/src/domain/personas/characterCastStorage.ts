import { asc, eq } from 'drizzle-orm'
import { characterCastAssetIds, characterCastSchema, type CharacterCastMember } from '@shared/contracts/characters/cast'
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes'
import { DesktopError } from '@shared/foundation/DesktopError'
import { characterCastMembers } from '@product-data/storage/sqlite/schema/common'
import type { ElecKoiDatabase } from '@product-data/storage/sqlite/SqliteDatabase'
import type { CharacterAssetRepository } from '@product-data/domain/characterAssets'

function castMember({ id, name, portraitAssetId, circleAssetId, squareAssetId, cropJson }: typeof characterCastMembers.$inferSelect): CharacterCastMember {
  return { id, name, portraitAssetId, circleAssetId, squareAssetId, crop: JSON.parse(cropJson) }
}

export function readCharacterCastForCharacter(db: ElecKoiDatabase, characterId: string): CharacterCastMember[] {
  return db.select().from(characterCastMembers).where(eq(characterCastMembers.characterId, characterId))
    .orderBy(asc(characterCastMembers.sortIndex)).all().map(castMember)
}

export function readCharacterCast(db: ElecKoiDatabase): Map<string, CharacterCastMember[]> {
  const casts = new Map<string, CharacterCastMember[]>()
  const rows = db.select().from(characterCastMembers).orderBy(asc(characterCastMembers.sortIndex)).all()
  for (const row of rows) {
    const cast = casts.get(row.characterId) ?? []
    cast.push(castMember(row))
    casts.set(row.characterId, cast)
  }
  return casts
}

export function writeCharacterCast(db: ElecKoiDatabase, characterId: string, value: unknown, assets?: CharacterAssetRepository): boolean {
  const parsed = characterCastSchema.safeParse(value)
  if (!parsed.success) throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, '请检查登场角色的名称、图片和取景。', { field: 'cast' })
  const cast = parsed.data
  const previous = db.select().from(characterCastMembers).where(eq(characterCastMembers.characterId, characterId))
    .orderBy(asc(characterCastMembers.sortIndex)).all()
  const rows = cast.map(({ crop, ...member }, sortIndex) => ({
    characterId, ...member, sortIndex, cropJson: JSON.stringify(crop), pendingLegacyMedia: 0
  }))
  if (rows.length === previous.length && rows.every((row, index) => {
    const old = previous[index]!
    return Object.entries(row).every(([key, value]) => old[key as keyof typeof old] === value)
  })) return false
  const assetIds = new Set(cast.flatMap(characterCastAssetIds))
  for (const assetId of assetIds) {
    if (assets?.readAsset(characterId, assetId).asset.type !== 'image') {
      throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, '角色头像必须是本角色卡资产库里的图片。', { field: 'cast' })
    }
  }
  db.delete(characterCastMembers).where(eq(characterCastMembers.characterId, characterId)).run()
  for (const row of rows) db.insert(characterCastMembers).values(row).run()
  return true
}

export function canDeleteCastAssets(db: ElecKoiDatabase, characterId: string, ids: Set<string>): boolean {
  return db.select().from(characterCastMembers).where(eq(characterCastMembers.characterId, characterId)).all()
    .every(row => [row.portraitAssetId, row.circleAssetId, row.squareAssetId].every(id => !id || !ids.has(id)))
}
