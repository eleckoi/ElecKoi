import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, isAbsolute } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { CharacterRepository } from '../src/domain/personas/CharacterRepository'
import { SqliteDatabase } from '../../../../tests/helpers/SqliteDatabase'
import { LocalMediaStore } from '../src/storage/media/LocalMediaStore'
import { APP_DEFAULT_CHAT_BACKGROUND, GLOBAL_CHAT_BACKGROUND, type CustomChatBackground } from '@shared/contracts/characters/chatBackground'

const cleanups: Array<() => void> = []
afterEach(() => cleanups.splice(0).reverse().forEach(cleanup => cleanup()))
const image = (content: string) => `data:image/png;base64,${Buffer.from(content).toString('base64')}`
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'eleckoi-background-'))
  cleanups.push(() => {
    const child = relative(tmpdir(), directory)
    if (!child || child.startsWith('..') || isAbsolute(child)) throw Error('Invalid fixture directory')
    rmSync(directory, { recursive: true, force: true })
  })
  const db = new SqliteDatabase(join(directory, 'test.sqlite')); db.open(); cleanups.push(() => db.close())
  const media = new LocalMediaStore(join(directory, 'media'))
  const characters = new CharacterRepository(db, { deleteForCharacter() {}, refreshCharacterIdentity() {} }, media)
  characters.create({ id: 'synthetic-background', name: '合成角色', chatBackground: image('first'),
    chatBackgroundOpacity: .87, chatBackgroundBlur: 7, chatBackgroundScrim: .23 })
  return { db, media, characters, current: () => characters.get().items[0]! }
}

it('retains one owned custom image and its settings across saved mode switches and reopening the database', () => {
  const f = fixture(), original = f.current(), reference = String(original.chatBackground)
  const path = f.media.pathForReference(reference)!
  // Reproduce old cards without the new backup field or stored content.
  f.db.native.prepare("DELETE FROM character_text_contents WHERE kind='chat-background-custom'").run()
  const { chatBackgroundCustom: _backup, ...legacy } = original
  f.characters.update({ ...legacy, chatBackground: APP_DEFAULT_CHAT_BACKGROUND })
  expect(f.current().chatBackground).toBe(APP_DEFAULT_CHAT_BACKGROUND)
  expect(f.current().chatBackgroundCustom).toEqual({ image: reference, opacity: .87, blur: 7, scrim: .23 })
  expect(existsSync(path)).toBe(true)
  f.db.close(); f.db.open()
  for (const mode of ['', GLOBAL_CHAT_BACKGROUND, APP_DEFAULT_CHAT_BACKGROUND]) {
    f.characters.update({ ...f.current(), chatBackground: mode, chatBackgroundOpacity: .4, chatBackgroundBlur: 1, chatBackgroundScrim: .1 })
    expect(f.current().chatBackgroundCustom).toEqual({ image: reference, opacity: .87, blur: 7, scrim: .23 })
  }
  const custom = f.current().chatBackgroundCustom as CustomChatBackground
  f.characters.update({ ...f.current(), chatBackground: custom.image, chatBackgroundOpacity: custom.opacity,
    chatBackgroundBlur: custom.blur, chatBackgroundScrim: custom.scrim })
  expect(f.current().chatBackground).toBe(reference)
  expect(readdirSync(dirname(path))).toHaveLength(1)
  f.characters.delete([original.id])
  expect(existsSync(path)).toBe(false)
  expect(f.db.native.prepare("SELECT * FROM character_text_contents WHERE characterId=?").all(original.id)).toEqual([])
}, 30_000)

it('cleans replaced or explicitly removed custom images and rolls back a failed save', () => {
  const f = fixture(), original = f.current(), firstPath = f.media.pathForReference(String(original.chatBackground))!
  f.characters.update({ ...original, chatBackground: APP_DEFAULT_CHAT_BACKGROUND,
    chatBackgroundCustom: { image: image('second'), opacity: .91, blur: 3, scrim: .12 } })
  const second = f.current(), secondPath = f.media.pathForReference((second.chatBackgroundCustom as CustomChatBackground).image)!
  expect(existsSync(firstPath)).toBe(false)
  expect(existsSync(secondPath)).toBe(true)
  expect(readdirSync(dirname(secondPath))).toHaveLength(1)
  f.db.native.exec("CREATE TEMP TRIGGER reject_background BEFORE UPDATE ON character_text_contents BEGIN SELECT RAISE(ABORT,'synthetic-save-failure'); END")
  expect(() => f.characters.update({ ...second, chatBackgroundCustom: { image: image('failed-third') } })).toThrow('synthetic-save-failure')
  expect(f.current()).toEqual(second)
  expect(readdirSync(dirname(secondPath))).toHaveLength(1)
  f.db.native.exec('DROP TRIGGER reject_background')
  f.characters.update({ ...f.current(), chatBackgroundCustom: { image: '' } })
  expect(existsSync(secondPath)).toBe(false)
  expect(f.db.native.prepare("SELECT * FROM character_text_contents WHERE kind='chat-background-custom'").all()).toEqual([])
}, 30_000)
