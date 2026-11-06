import { runtimeContextsFor } from '../helpers/runtime-contexts.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SqliteDatabase } from '../helpers/SqliteDatabase'
import { ConversationRepository } from '../../packages/host/product-data/src/domain/conversations/ConversationRepository'
import { CharacterRepository } from '../../packages/host/product-data/src/domain/personas/CharacterRepository'
import { LocalMediaStore } from '@eleckoi/dsh-product-data/media'
import { SettingLibraryRepository } from '../../packages/host/product-data/src/domain/settingLibraries/SettingLibraryRepository'
import { emptyEntry } from '../../packages/host/product-data/src/domain/settingLibraries/settingLibraryNormalization'
import { apply as applySettingLibraryTools } from '../../apps/desktop/resources/dsh/setting-library-tools.mjs'

const directories = []
const connections = []
afterEach(() => {
  for (const connection of connections.splice(0)) connection.close()
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})
function harness() {
  const directory = mkdtempSync(join(tmpdir(), 'eleckoi-branch-persistence-'))
  directories.push(directory)
  const database = new SqliteDatabase(join(directory, 'product.sqlite3'))
  database.open()
  connections.push(database)
  const conversations = new ConversationRepository(database)
  const media = new LocalMediaStore(join(directory, 'media'))
  return { database, conversations, characters: new CharacterRepository(database, conversations, media) }
}
function card() {
  return { id: 'card-a', name: '合成角色', group: '', persona: {
    assistant_name: '合成角色', assistant_avatar: '', assistant_cover: '', opening: '合成开场', show_opening: true
  } }
}
describe('persisted tool-created branch settings', () => {
  it('creates branches only after real tool persistence, isolates chats and removes reverted same-turn changes', async () => {
    const { characters, conversations, database } = harness()
    characters.replaceAll({ active_character_id: 'card-a', groups: [], items: [card()] })
    const repository = new SettingLibraryRepository(database)
    const initial = repository.get('card-a')
    repository.save('card-a', { ...initial, entries: [...initial.entries,
      ...Array.from({ length: 50 }, (_, index) => ({ ...emptyEntry(`synthetic-entry-${index}`),
        title: `合成设定 ${index}`, content: `合成正文 ${index}`, treeViewOrder: index + 1 }))] })
    const master = repository.get('card-a')
    const chat = conversations.create({ metadata: { characterId: 'card-a' } }).conversation.id
    const other = conversations.create({ metadata: { characterId: 'card-a' } }).conversation.id
    const source = repository.runtimeContext(chat, { characterId: 'card-a' })
    const baseline = { source, projected: structuredClone(source) }
    const directory = mkdtempSync(join(tmpdir(), 'eleckoi-setting-commit-'))
    directories.push(directory)
    const contexts = runtimeContextsFor('synthetic-session', { conversationId: chat,
      settings: { enabled: true, library: source, frozenLibrary: source, history: [] }, settingLibraryBaseline: baseline })
    let patch
    let glob
    let read
    let notifications = 0
    applySettingLibraryTools({
      eleckoiRuntimeContexts: contexts,
      tools: { register(tool) {
        if (tool.name === 'eleckoi_apply_setting_patch') patch = tool
        if (tool.name === 'eleckoi_glob_setting_files') glob = tool
        if (tool.name === 'eleckoi_read_setting_files') read = tool
        return () => {}
      } },
      eleckoiProductData: { commitConversationRuntime(id, _variables, raw, initial) {
        database.withWriteTx(db => repository.replaceConversationRuntimeState(id, raw, { characterId: 'card-a' }, initial, db))
      } },
      eleckoiCharacterConfigurationChanges: { publish() { notifications++ } }
    })
    const exec = { agent: { session: { id: 'synthetic-session' } } }
    try {
      expect(repository.conversationLibrary('card-a', chat)).toBeUndefined()
      await glob.execute({}, exec)
      expect(repository.conversationLibrary('card-a', chat)).toBeUndefined()
      const result = await patch.execute({ operation: 'write_file', path: '偏好', content: '喜欢温热的茶。' }, exec)
      expect(result).toMatchObject({ status: 'ok', changed: true })
      expect(notifications).toBe(1)
      const branch = repository.conversationLibrary('card-a', chat)
      const created = branch.entries.find(entry => entry.title === '偏好')
      expect(created.contentMode).toBe('plain_text')
      expect(database.native.prepare('SELECT COUNT(*) AS n FROM conversation_setting_changes WHERE sessionId=?').get(chat))
        .toEqual({ n: 1 })
      expect(repository.conversationLibrary('card-a', other)).toBeUndefined()
      expect(repository.get('card-a')).toEqual(master)
      expect((await glob.execute({}, exec)).files.some((file) => file.path === '偏好')).toBe(true)
      expect((await read.execute({ paths: ['偏好'] }, exec)).files[0].content).toBe('喜欢温热的茶。')
      // Reopen the actual database before continuing the same tool turn.
      database.close()
      database.open()
      expect(repository.conversationLibrary('card-a', chat)?.entries.find(entry => entry.id === created.id)?.content)
        .toBe('喜欢温热的茶。')
      const saved = repository.snapshotConversationRuntimeState(chat)
      await patch.execute({ operation: 'delete_file', path: '偏好' }, exec)
      expect(repository.conversationLibrary('card-a', chat)).toBeUndefined()
      repository.restoreConversationRuntimeState(chat, saved)
      expect(repository.conversationLibrary('card-a', chat)?.entries.find(entry => entry.id === created.id)?.content)
        .toBe('喜欢温热的茶。')
      repository.restoreConversationRuntimeState(chat, '[]')
      expect(repository.conversationLibrary('card-a', chat)).toBeUndefined()
    } finally {
      contexts.close()
    }
  }, 30_000)


})
