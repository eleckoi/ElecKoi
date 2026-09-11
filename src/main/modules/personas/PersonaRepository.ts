import { eq } from 'drizzle-orm'
import type { Persona } from '@shared/contracts/entities/persona'
import { type ElecKoiDatabase, SqliteDatabase } from '@main/platform/sqlite/SqliteDatabase'
import { characterMeta, characters, characterTextContents, userProfile } from '@main/platform/sqlite/schema/common'
import { type LocalMediaStore, type PreparedLocalMedia } from '@main/platform/filesystem/LocalMediaStore'

export interface PersonaConversationSync {
  refreshUserIdentity(identity: {
    name: string
    avatar: string
    square: string
    portrait: string
  }, db: ElecKoiDatabase): void
}

/** View for the current UI. User identity is stored only in user_profile. */
export class PersonaRepository {
  constructor(
    private readonly store: SqliteDatabase,
    private readonly conversations: PersonaConversationSync,
    private readonly mediaAssets: LocalMediaStore
  ) {}

  get(db: ElecKoiDatabase = this.store.db): Persona {
    const profile = db.select().from(userProfile).where(eq(userProfile.id, 'default')).get()
    const state = db.select().from(characterMeta).where(eq(characterMeta.id, 'default')).get()
    const card = state?.activeCharacterId ? db.select().from(characters).where(eq(characters.id, state.activeCharacterId)).get() : undefined
    const contents = card ? db.select().from(characterTextContents).where(eq(characterTextContents.characterId, card.id)).all() : []
    const text = (kind: string) => contents.find((row) => row.kind === kind)?.content ?? ''
    return {
      assistant_name: card?.assistantName ?? '', assistant_avatar: card?.assistantAvatar ?? '', assistant_square: card?.squareImage ?? '', assistant_cover: card?.coverImage ?? '',
      opening: text('opening'), show_opening: !!card?.showOpening,
      user_name: profile?.userName ?? '你', user_avatar: profile?.userAvatar ?? '',
      user_square: profile?.userSquare ?? '', user_portrait: profile?.userPortrait ?? '', user_cover: profile?.userCover ?? ''
    }
  }

  save(input: Persona, db: ElecKoiDatabase = this.store.db): Persona {
    const mediaAssets = this.mediaAssets
    const pending: PreparedLocalMedia[] = []
    const prepare = (slot: string, value: string): string => {
      const media = mediaAssets.prepareImage('user/default', slot, value)
      pending.push(media)
      return media.reference
    }
    const previous = db.select().from(userProfile).where(eq(userProfile.id, 'default')).get()
    const text = (key: string, fallback = '') => typeof input[key] === 'string' ? input[key] as string : fallback
    const row = { id: 'default', userName: input.user_name, userAvatar: prepare('avatar', input.user_avatar),
      userSquare: prepare('square', text('user_square', previous?.userSquare)),
      userPortrait: prepare('portrait', text('user_portrait', previous?.userPortrait)),
      userCover: prepare('cover', text('user_cover', previous?.userCover)) }
    try {
      const persist = (database: ElecKoiDatabase) => {
        const before = database.select().from(userProfile).where(eq(userProfile.id, 'default')).get()
        if (JSON.stringify(row) !== JSON.stringify(before)) database.insert(userProfile).values(row).onConflictDoUpdate({ target: userProfile.id, set: row }).run()
        this.conversations.refreshUserIdentity({
          name: row.userName,
          avatar: row.userAvatar,
          square: row.userSquare,
          portrait: row.userPortrait
        }, database)
      }
      if (db === this.store.db) this.store.withWriteTx(persist)
      else persist(db)
      for (const media of pending) media.commit()
    } catch (error) {
      for (const media of pending) media.rollback()
      throw error
    }
    return this.get(db)
  }

}
