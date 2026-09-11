import { and, asc, eq } from 'drizzle-orm'
import type { CharacterCollection, CharacterRecord } from '@shared/contracts/entities/persona'
import { isRecord, parseJsonArray } from '@shared/foundation/json'
import { type ElecKoiDatabase, SqliteDatabase } from '@main/platform/sqlite/SqliteDatabase'
import { characterMeta, characters, characterTextContents, userProfile } from '@main/platform/sqlite/schema/common'
import { type LocalMediaStore, type PreparedLocalMedia } from '@main/platform/filesystem/LocalMediaStore'

const string = (value: unknown, fallback = ''): string => typeof value === 'string' ? value : fallback
const number = (value: unknown, fallback = 0): number => typeof value === 'number' && Number.isFinite(value) ? value : fallback
const flag = (value: unknown): number => value ? 1 : 0
const ALL_CHARACTERS_GROUP = '全部角色'

function normalizedGroup(value: unknown): string {
  const group = string(value).trim()
  return group === ALL_CHARACTERS_GROUP ? '' : group
}

function normalizedGroups(values: unknown[]): string[] {
  return [...new Set(values.map(normalizedGroup).filter(Boolean))]
}

export interface CharacterConversationCleanup {
  deleteForCharacter(characterId: string): void
  flushCleanup(): void
  refreshCharacterIdentity(characterId: string, identity: {
    name: string
    avatar: string
    square: string
    portrait: string
  }, db: ElecKoiDatabase): void
}

export class CharacterRepository {
  private pendingMedia: PreparedLocalMedia[] = []
  private pendingRemovedOwners = new Set<string>()

  constructor(
    private readonly store: SqliteDatabase,
    private readonly conversationCleanup: CharacterConversationCleanup,
    private readonly mediaAssets: LocalMediaStore,
    private readonly defaultChatBackground: () => string = () => ''
  ) {}

  get(db: ElecKoiDatabase = this.store.db): CharacterCollection {
    const rows = db.select().from(characters).orderBy(asc(characters.orderIndex), asc(characters.id)).all()
    const state = db.select().from(characterMeta).where(eq(characterMeta.id, 'default')).get()
    const profile = db.select().from(userProfile).where(eq(userProfile.id, 'default')).get()
    const texts = db.select().from(characterTextContents).all()
    return {
      active_character_id: rows.some((row) => row.id === state?.activeCharacterId) ? state!.activeCharacterId : rows[0]?.id ?? '',
      groups: state ? normalizedGroups(parseJsonArray<string>(state.groupsJson)) : [],
      items: rows.map((row) => {
        const content = Object.fromEntries(texts.filter((item) => item.characterId === row.id).map((item) => [item.kind, item.content]))
        return {
          ...row, group: normalizedGroup(row.groupName),
          persona: {
            assistant_name: row.assistantName, assistant_avatar: row.assistantAvatar,
            assistant_square: row.squareImage, assistant_cover: row.coverImage,
            image_prompt: content.image_prompt ?? '', opening: content.opening ?? '', show_opening: !!row.showOpening,
            user_name: profile?.userName ?? '你', user_avatar: profile?.userAvatar ?? '',
            user_square: profile?.userSquare ?? '', user_portrait: profile?.userPortrait ?? ''
          }
        }
      })
    }
  }

  create(character: CharacterRecord): CharacterCollection {
    try {
      this.store.withWriteTx((database) => this.createInTransaction(character, database))
      this.commitMediaChanges()
    } catch (error) {
      this.rollbackMediaChanges()
      throw error
    }
    return this.get()
  }

  createInTransaction(character: CharacterRecord, database: ElecKoiDatabase): void {
    if (!character.id.trim()) throw new Error('角色编号不能为空。')
    if (database.select({ id: characters.id }).from(characters).where(eq(characters.id, character.id)).get()) {
      throw new Error('角色编号已经存在。')
    }
    const state = database.select().from(characterMeta).where(eq(characterMeta.id, 'default')).get()
    const existing = database.select({ id: characters.id }).from(characters).all()
    const nextCharacter = string(character.chatBackground)
      ? character
      : { ...character, chatBackground: string(this.defaultChatBackground()) }
    this.saveCard(nextCharacter, existing.length, database)
    const group = normalizedGroup(string(character.group, string(character.groupName)))
    const groups = normalizedGroups([...(state ? parseJsonArray<string>(state.groupsJson) : []), group])
    database.insert(characterMeta).values({
      id: 'default', activeCharacterId: state?.activeCharacterId || character.id,
      groupsJson: JSON.stringify(groups), listAllExpanded: state?.listAllExpanded ?? 1,
      expandedGroupNamesJson: state?.expandedGroupNamesJson ?? '[]'
    }).onConflictDoUpdate({ target: characterMeta.id, set: {
      activeCharacterId: state?.activeCharacterId || character.id,
      groupsJson: JSON.stringify(groups)
    } }).run()
  }

  update(character: CharacterRecord): CharacterCollection {
    try {
      this.store.withWriteTx((database) => {
        const previous = database.select().from(characters).where(eq(characters.id, character.id)).get()
        if (!previous) throw new Error('找不到对应的角色卡。')
        this.saveCard(character, previous.orderIndex, database)
        const state = database.select().from(characterMeta).where(eq(characterMeta.id, 'default')).get()
        const group = normalizedGroup(string(character.group, string(character.groupName, previous.groupName)))
        const groups = normalizedGroups([...(state ? parseJsonArray<string>(state.groupsJson) : []), group])
        if (state && JSON.stringify(groups) !== state.groupsJson) {
          database.update(characterMeta).set({ groupsJson: JSON.stringify(groups) }).where(eq(characterMeta.id, 'default')).run()
        }
      })
      this.commitMediaChanges()
    } catch (error) {
      this.rollbackMediaChanges()
      throw error
    }
    return this.get()
  }

  saveGroups(groups: string[], assignments: Array<{ characterId: string; group: string }>): CharacterCollection {
    const savedGroups = normalizedGroups(groups)
    const allowed = new Set(savedGroups)
    this.store.withWriteTx((database) => {
      for (const assignment of assignments) {
        const group = normalizedGroup(assignment.group)
        if (group && !allowed.has(group)) throw new Error('角色所属分组必须存在。')
        const previous = database.select({ groupName: characters.groupName }).from(characters).where(eq(characters.id, assignment.characterId)).get()
        if (!previous) throw new Error('找不到对应的角色卡。')
        if (previous.groupName !== group) database.update(characters).set({ groupName: group }).where(eq(characters.id, assignment.characterId)).run()
      }
      const state = database.select().from(characterMeta).where(eq(characterMeta.id, 'default')).get()
      const groupsJson = JSON.stringify(savedGroups)
      if (!state) {
        database.insert(characterMeta).values({ id: 'default', activeCharacterId: '', groupsJson, listAllExpanded: 1, expandedGroupNamesJson: '[]' }).run()
      } else if (state.groupsJson !== groupsJson) {
        database.update(characterMeta).set({ groupsJson }).where(eq(characterMeta.id, 'default')).run()
      }
    })
    return this.get()
  }

  select(characterId: string): CharacterCollection {
    this.store.withWriteTx((database) => {
      if (!database.select({ id: characters.id }).from(characters).where(eq(characters.id, characterId)).get()) return
      const state = database.select().from(characterMeta).where(eq(characterMeta.id, 'default')).get()
      if (state) database.update(characterMeta).set({ activeCharacterId: characterId }).where(eq(characterMeta.id, 'default')).run()
      else database.insert(characterMeta).values({
        id: 'default', activeCharacterId: characterId, groupsJson: '[]',
        listAllExpanded: 1, expandedGroupNamesJson: '[]'
      }).run()
    })
    return this.get()
  }

  replaceAll(collection: CharacterCollection, db?: ElecKoiDatabase): CharacterCollection {
    const ids = new Set(collection.items.map((item) => item.id))
    if (ids.size !== collection.items.length || collection.items.some((item) => !item.id.trim())) throw new Error('角色编号不能为空或重复。')
    const persist = (database: ElecKoiDatabase) => {
      const existing = database.select().from(characters).all()
      for (const row of existing) {
        if (ids.has(row.id)) continue
        this.conversationCleanup.deleteForCharacter(row.id)
        this.pendingRemovedOwners.add(`character/${row.id}`)
        // Public common FKs delete card-owned configuration. Workspace relationships
        // that represent independent use are detached by the conversation cleanup.
        database.delete(characters).where(eq(characters.id, row.id)).run()
      }
      for (const [index, character] of collection.items.entries()) this.saveCard(character, index, database)
      const previous = database.select().from(characterMeta).where(eq(characterMeta.id, 'default')).get()
      const state = {
        id: 'default', activeCharacterId: ids.has(collection.active_character_id) ? collection.active_character_id : collection.items[0]?.id ?? '',
        groupsJson: JSON.stringify(normalizedGroups(collection.groups)),
        listAllExpanded: previous?.listAllExpanded ?? 1, expandedGroupNamesJson: previous?.expandedGroupNamesJson ?? '[]'
      }
      if (JSON.stringify(previous) !== JSON.stringify(state)) database.insert(characterMeta).values(state).onConflictDoUpdate({ target: characterMeta.id, set: state }).run()
    }
    if (db) persist(db)
    else {
      try {
        this.store.withWriteTx(persist)
        this.commitMediaChanges()
      } catch (error) {
        this.rollbackMediaChanges()
        throw error
      }
    }
    this.conversationCleanup.flushCleanup()
    return this.get(db)
  }

  private saveCard(input: CharacterRecord, index: number, db: ElecKoiDatabase): void {
    const prepared = this.prepareCardMedia(input)
    input = prepared
    const previous = db.select().from(characters).where(eq(characters.id, input.id)).get()
    const persona = isRecord(input.persona) ? input.persona : {}
    const mode = string(input.characterMode, previous?.characterMode ?? 'story')
    if (mode !== 'story' && mode !== 'agent') throw new Error('角色模式只允许 story 或 agent。')
    const row: typeof characters.$inferInsert = {
      id: input.id, name: string(input.name, '未命名角色'), avatar: string(input.avatar),
      squareImage: string(persona.assistant_square), coverImage: string(persona.assistant_cover),
      groupName: normalizedGroup(string(input.group, string(input.groupName, previous?.groupName))), orderIndex: index,
      groupViewOrder: number(input.groupViewOrder, previous?.groupViewOrder), folder: string(input.folder), characterMode: mode,
      frontendBeautyEnabled: flag(input.frontendBeautyEnabled ?? previous?.frontendBeautyEnabled),
      assistantName: string(persona.assistant_name, string(input.name)), assistantAvatar: string(persona.assistant_avatar, string(input.avatar)),
      profileAge: string(input.profileAge, previous?.profileAge), profileSex: string(input.profileSex, previous?.profileSex),
      profileHeight: string(input.profileHeight, previous?.profileHeight), profileBirthday: string(input.profileBirthday, previous?.profileBirthday), profileLike: string(input.profileLike, previous?.profileLike),
      showOpening: flag(persona.show_opening ?? input.showOpening ?? previous?.showOpening),
      chatBackground: string(input.chatBackground, previous?.chatBackground),
      chatBackgroundOpacity: number(input.chatBackgroundOpacity, previous?.chatBackgroundOpacity ?? 0.72),
      chatBackgroundBlur: number(input.chatBackgroundBlur, previous?.chatBackgroundBlur ?? 2), chatBackgroundScrim: number(input.chatBackgroundScrim, previous?.chatBackgroundScrim ?? 0.5)
    }
    if (JSON.stringify(previous) !== JSON.stringify(row)) db.insert(characters).values(row).onConflictDoUpdate({ target: characters.id, set: row }).run()
    this.conversationCleanup.refreshCharacterIdentity(input.id, {
      name: row.assistantName,
      avatar: row.assistantAvatar,
      square: row.squareImage,
      portrait: row.coverImage
    }, db)
    for (const kind of ['image_prompt', 'opening']) {
      const current = db.select().from(characterTextContents).where(and(eq(characterTextContents.characterId, input.id), eq(characterTextContents.kind, kind))).get()
      const content = string(persona[kind], current?.content)
      if (current?.content === content) continue
      db.insert(characterTextContents).values({ characterId: input.id, kind, content }).onConflictDoUpdate({ target: [characterTextContents.characterId, characterTextContents.kind], set: { content } }).run()
    }
  }

  delete(characterIds: string[]): CharacterCollection {
    const current = this.get()
    const removed = new Set(characterIds)
    return this.replaceAll({ ...current, items: current.items.filter((item) => !removed.has(item.id)) })
  }

  commitMediaChanges(): void {
    const media = this.pendingMedia.splice(0)
    const owners = [...this.pendingRemovedOwners]
    this.pendingRemovedOwners.clear()
    for (const prepared of media) prepared.commit()
    for (const owner of owners) this.mediaAssets.removeOwner(owner)
  }

  rollbackMediaChanges(): void {
    const media = this.pendingMedia.splice(0)
    this.pendingRemovedOwners.clear()
    for (const prepared of media) prepared.rollback()
  }

  private prepareCardMedia(input: CharacterRecord): CharacterRecord {
    const persona = isRecord(input.persona) ? input.persona : {}
    const mediaAssets = this.mediaAssets
    const owner = `character/${input.id}`
    const prepare = (slot: string, value: unknown): string => {
      const media = mediaAssets.prepareImage(owner, slot, string(value))
      this.pendingMedia.push(media)
      return media.reference
    }
    const avatar = prepare('avatar', string(persona.assistant_avatar, string(input.avatar)))
    const square = prepare('square', persona.assistant_square)
    const portrait = prepare('portrait', persona.assistant_cover)
    const background = prepare('chat-background', input.chatBackground)
    return {
      ...input,
      avatar,
      chatBackground: background,
      persona: {
        ...persona,
        assistant_avatar: avatar,
        assistant_square: square,
        assistant_cover: portrait
      }
    } as CharacterRecord
  }
}
