import { createHash, randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { and, eq } from 'drizzle-orm'
import { characterAssetFormat, type CharacterAsset, type PortableCharacterAsset } from '@shared/contracts/characterAssets'
import type { CharacterCastMember } from '@shared/contracts/characters/cast'
import type { CharacterAssetRepository } from '@product-data/domain/characterAssets'
import { decodeImageDataUrl, type LocalMediaStore } from '@product-data/storage/media/LocalMediaStore'
import type { ElecKoiSqliteStore } from '@product-data/storage/sqlite/SqliteDatabase'
import { characterCastMembers, characters } from '@product-data/storage/sqlite/schema/common'

type LegacyImages = { portrait: string; circle: string; square: string }

// RETIRE WHEN: no supported database upgrade or character-card import can produce
// legacy avatar slots. Remove the database and import callers and their regressions.
export function prepareLegacyCast(
  name: string, images: LegacyImages, media?: LocalMediaStore, existing: CharacterAsset[] = []
): { member: CharacterCastMember; additions: PortableCharacterAsset[] } {
  const additions: PortableCharacterAsset[] = []
  function importImage(reference: string, name: string): string | null {
    if (!reference) return null
    const path = media?.pathForReference(reference)
    const data = reference.startsWith('data:') ? decodeImageDataUrl(reference) : undefined
    if (!data && (!path || !existsSync(path))) {
      // Older cards may contain remote URLs or a reference to a removed file.
      // Keep that legacy value intact and only import bytes held by the app.
      console.warn('Legacy character avatar has no locally available image to copy')
      return null
    }
    const fileName = data ? `${name}.${data.extension}` : `${name}.${basename(path!).split('.').at(-1)}`
    const format = characterAssetFormat(fileName)!
    const bytes = data?.bytes ?? readFileSync(path!)
    const hash = createHash('sha256').update(bytes).digest('hex')
    const found = [...existing, ...additions].find(asset => asset.hash === hash && asset.mimeType === format.mimeType)
    if (found) return found.id
    const id = randomUUID()
    additions.push({ id, name: fileName, ...format, size: bytes.length, hash, data: bytes.toString('base64'), createdAt: new Date().toISOString() })
    return id
  }
  const portrait = importImage(images.portrait, '角色竖版头像')
  const circle = images.circle === images.portrait ? portrait : importImage(images.circle, '角色圆形头像')
  const square = images.square === images.circle ? circle
    : images.square === images.portrait ? portrait : importImage(images.square, '角色方形头像')
  const original = portrait ?? circle ?? square
  return { additions, member: {
    id: 'primary', name: name.trim() || '未命名角色', portraitAssetId: original,
    circleAssetId: circle === original ? null : circle,
    squareAssetId: square === original ? null : square, crop: null
  } }
}

// RETIRE WHEN: upgrades from v19 and earlier are unsupported and all supported
// v20+ databases have pendingLegacyMedia = 0. Runs on open and can resume after
// interruption by matching blob digests. Remove the open hook, flags and v19 media test.
export function migrateLegacyCastMedia(store: ElecKoiSqliteStore, media: LocalMediaStore, assets: CharacterAssetRepository): void {
  const pending = store.db.select({
    member: characterCastMembers, portrait: characters.coverImage,
    circle: characters.assistantAvatar, avatar: characters.avatar, square: characters.squareImage
  }).from(characterCastMembers)
    .innerJoin(characters, eq(characters.id, characterCastMembers.characterId))
    .where(eq(characterCastMembers.pendingLegacyMedia, 1)).all()
  for (const { member, portrait, circle, avatar, square } of pending) {
    const { characterId, id, name } = member
    const prepared = prepareLegacyCast(name, { portrait, circle: circle || avatar, square }, media, assets.list(characterId).items)
    const { portraitAssetId, circleAssetId, squareAssetId } = prepared.member
    assets.withMergedAssets(characterId, prepared.additions, () => {
      store.withWriteTx(db => db.update(characterCastMembers)
        .set({ portraitAssetId, circleAssetId, squareAssetId, pendingLegacyMedia: 0 })
        .where(and(eq(characterCastMembers.characterId, characterId), eq(characterCastMembers.id, id))).run())
    }, [], false)
  }
}
