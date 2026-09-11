import { eq } from 'drizzle-orm'
import type { ElecKoiDatabase } from '@main/platform/sqlite/SqliteDatabase'
import { characters } from '@main/platform/sqlite/schema/common'

export function requireCharacter(db: ElecKoiDatabase, id: string) {
  const row = db.select().from(characters).where(eq(characters.id, id)).get()
  if (!row) throw new Error('找不到对应的角色卡。')
  return row
}
