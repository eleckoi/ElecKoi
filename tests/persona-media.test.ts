import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ConversationRepository } from '../src/main/modules/conversations/ConversationRepository'
import { MessageRepository } from '../src/main/modules/conversations/MessageRepository'
import { CharacterRepository } from '../src/main/modules/personas/CharacterRepository'
import { PersonaRepository } from '../src/main/modules/personas/PersonaRepository'
import { LocalMediaStore } from '../src/main/platform/filesystem/LocalMediaStore'
import { SqliteDatabase } from '../src/main/platform/sqlite/SqliteDatabase'

const directories: string[] = []
const databases: SqliteDatabase[] = []

afterEach(() => {
  for (const database of databases.splice(0)) database.close()
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function image(value: string) {
  return `data:image/png;base64,${Buffer.from(value).toString('base64')}`
}

type TestPersona = Record<string, unknown> & {
  assistant_avatar: string
  assistant_square: string
  assistant_cover: string
}

function harness() {
  const directory = mkdtempSync(join(tmpdir(), 'eleckoi-persona-media-test-'))
  directories.push(directory)
  const database = new SqliteDatabase(join(directory, 'common.sqlite3'))
  database.open()
  databases.push(database)
  const media = new LocalMediaStore(join(directory, 'media'))
  const conversations = new ConversationRepository(database)
  return {
    database,
    media,
    conversations,
    messages: new MessageRepository(database),
    characters: new CharacterRepository(database, conversations, media),
    personas: new PersonaRepository(database, conversations, media)
  }
}

describe('persona media persistence and cleanup', () => {
  it('externalizes user and character images and replaces every live snapshot reference', () => {
    const { database, media, conversations, messages, characters, personas } = harness()
    const oldUser = image('old-user')
    const oldAvatar = image('old-avatar')
    const oldPortrait = image('old-portrait')
    personas.save({
      assistant_name: '', assistant_avatar: '', assistant_square: '', assistant_cover: '', opening: '', show_opening: false,
      user_name: '你', user_avatar: oldUser, user_square: oldUser, user_portrait: oldUser, user_cover: ''
    })
    characters.create({
      id: 'character-a', name: '角色 A', avatar: oldAvatar, group: '',
      persona: {
        assistant_name: '角色 A', assistant_avatar: oldAvatar, assistant_square: oldAvatar, assistant_cover: oldPortrait,
        image_prompt: '', opening: '', show_opening: false,
        user_name: '', user_avatar: '', user_square: '', user_portrait: ''
      }
    })
    const character = characters.get().items[0]!
    const characterPersona = character.persona as TestPersona
    const characterName = String(character.name)
    const conversation = conversations.create({ metadata: {
      characterId: character.id,
      characterName,
      characterAvatar: characterPersona.assistant_avatar,
      characterPersona
    } }).conversation
    const turn = messages.create(conversation.id, 'user', '你好', 'complete')
    messages.createResponse(conversation.id, turn.turnId!, '你好', 'complete', {
      id: character.id,
      name: characterName,
      avatar: characterPersona.assistant_avatar,
      kind: 'card_character'
    })

    const oldUserPath = media.pathForReference(personas.get().user_avatar)!
    const oldAvatarPath = media.pathForReference(characterPersona.assistant_avatar)!
    const oldPortraitPath = media.pathForReference(characterPersona.assistant_cover)!
    expect(existsSync(oldUserPath)).toBe(true)
    expect(existsSync(oldAvatarPath)).toBe(true)
    expect(existsSync(oldPortraitPath)).toBe(true)

    personas.save({ ...personas.get(), user_avatar: image('new-user'), user_square: image('new-user-square'), user_portrait: image('new-user-portrait') })
    characters.update({
      ...character,
      persona: {
        ...characterPersona,
        assistant_avatar: image('new-avatar'),
        assistant_square: image('new-square'),
        assistant_cover: image('new-portrait')
      }
    })

    expect(existsSync(oldUserPath)).toBe(false)
    expect(existsSync(oldAvatarPath)).toBe(false)
    expect(existsSync(oldPortraitPath)).toBe(false)
    const serialized = JSON.stringify({
      characters: database.native.prepare('SELECT avatar,assistantAvatar,squareImage,coverImage FROM characters').all(),
      user: database.native.prepare('SELECT userAvatar,userSquare,userPortrait FROM user_profile').all(),
      sessions: database.native.prepare('SELECT characterAvatar FROM chat_sessions').all(),
      speakers: database.native.prepare('SELECT avatarAssetId FROM conversation_speakers').all(),
      snapshots: database.native.prepare('SELECT personaJson FROM chat_session_character_snapshots').all()
    })
    expect(serialized).not.toContain('data:image/')
    expect(serialized).not.toContain(Buffer.from('old-user').toString('base64'))
    expect(serialized).not.toContain(Buffer.from('old-avatar').toString('base64'))
    expect(serialized).not.toContain(Buffer.from('old-portrait').toString('base64'))
  })
})
