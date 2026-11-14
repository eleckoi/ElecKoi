import { characterCatalogActivity } from '@product-data/storage/sqlite/schema/common'
import type { ElecKoiDatabase } from '@product-data/storage/sqlite/SqliteDatabase'

/** Zero means the installation has no historical timestamp for this card. */
export function recordCharacterEdit(db: ElecKoiDatabase, characterId: string): void {
  const editedAtEpochMs = Date.now()
  db.insert(characterCatalogActivity).values({ characterId, addedAtEpochMs: 0, editedAtEpochMs })
    .onConflictDoUpdate({ target: characterCatalogActivity.characterId, set: { editedAtEpochMs } }).run()
}

export function recordCharacterAdded(db: ElecKoiDatabase, characterId: string): void {
  const timestamp = Date.now()
  db.insert(characterCatalogActivity).values({ characterId, addedAtEpochMs: timestamp, editedAtEpochMs: timestamp }).run()
}

export function readCharacterActivity(db: ElecKoiDatabase) {
  return new Map(db.select().from(characterCatalogActivity).all().map(row => [row.characterId, row]))
}
