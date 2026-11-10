import { eq } from 'drizzle-orm'
import { characters, characterOpenings } from '@product-data/storage/sqlite/schema/common'
import type { ElecKoiDatabase, ElecKoiSqliteStore } from '@product-data/storage/sqlite/SqliteDatabase'
import { characterOpeningsSchema, type CharacterOpenings } from '@shared/contracts/characterOpenings/schemas'
import { DesktopError } from '@shared/foundation/DesktopError'
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes'

export function readCharacterOpenings(characterId: string, db: ElecKoiDatabase): CharacterOpenings {
  const row = db.select().from(characterOpenings).where(eq(characterOpenings.characterId, characterId)).get()
  if (!row) throw new DesktopError(ELECKOI_FAILURE_CODES.storageCorrupt, '角色缺少开场白配置。', { what: '角色开场白配置' })
  const parsed = characterOpeningsSchema.parse(JSON.parse(row.configurationJson))
  if (parsed.characterId !== characterId) throw new DesktopError(ELECKOI_FAILURE_CODES.stateMismatch, '开场白配置与角色不匹配。', { what: '角色开场白配置' })
  return parsed
}

export class CharacterOpeningRepository {
  constructor(private readonly store: ElecKoiSqliteStore) {}
  private requireCharacter(characterId: string, db: ElecKoiDatabase): void {
    if (!db.select({ id: characters.id }).from(characters).where(eq(characters.id, characterId)).get()) {
      throw new DesktopError(ELECKOI_FAILURE_CODES.characterNotFound, '找不到对应的角色卡。', { what: '角色卡' })
    }
  }
  get(characterId: string, db = this.store.db): CharacterOpenings {
    this.requireCharacter(characterId, db)
    return readCharacterOpenings(characterId, db)
  }
  save(characterId: string, input: CharacterOpenings): CharacterOpenings {
    return this.store.withWriteTx(db => this.saveInTransaction(characterId, input, db))
  }
  saveInTransaction(characterId: string, input: CharacterOpenings, db: ElecKoiDatabase): CharacterOpenings {
    this.requireCharacter(characterId, db)
    if (input.characterId !== characterId) throw new DesktopError(ELECKOI_FAILURE_CODES.stateMismatch, '开场白配置与角色不匹配。', { what: '角色开场白配置' })
    const value = characterOpeningsSchema.parse(input)
    const configurationJson = JSON.stringify(value)
    db.insert(characterOpenings).values({ characterId, configurationJson })
      .onConflictDoUpdate({ target: characterOpenings.characterId, set: { configurationJson } }).run()
    return value
  }
  primaryOpening(characterId: string, db = this.store.db): string {
    const value = this.get(characterId, db)
    return value.openingMessages.find(message => message.id === value.defaultOpeningMessageId)!.content.trim()
  }
}
