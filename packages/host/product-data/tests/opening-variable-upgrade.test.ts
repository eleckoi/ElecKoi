import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, expect, it } from 'vitest'
import { SqliteDatabase } from '../src/storage/sqlite/SqliteDatabase'
import { CURRENT_SCHEMA_VERSION } from '../src/storage/sqlite/schemaVersion'
import { CharacterRepository } from '../src/domain/personas/CharacterRepository'
import { LocalMediaStore } from '../src/storage/media/LocalMediaStore'
import { CharacterOpeningRepository } from '../src/domain/characterOpenings'
import { ConversationRepository } from '../src/domain/conversations/ConversationRepository'
import { resolveConversationSeed } from '../src/domain/conversations/conversationSeed'
import { VariableConfigRepository } from '../src/domain/variables/VariableConfigRepository'
import { VariableStateRepository } from '../src/domain/variables/VariableStateRepository'

const cleanups: (() => void)[] = []
afterEach(() => cleanups.splice(0).reverse().forEach(cleanup => cleanup()))

function legacyFixture() {
  const directory = mkdtempSync(join(tmpdir(), 'eleckoi-variable-upgrade-'))
  const path = join(directory, 'product.sqlite3')
  const database = new SqliteDatabase(path)
  cleanups.push(() => rmSync(directory, { recursive: true, force: true }), () => database.close())
  database.open()
  const characterId = 'synthetic-character'
  const variables = new VariableConfigRepository(database)
  const openings = new CharacterOpeningRepository(database)
  const conversations = new ConversationRepository(database, (id, db) => resolveConversationSeed(id, db, openings, variables))
  new CharacterRepository(database, conversations, new LocalMediaStore(join(directory, 'media')))
    .create({ id: characterId, name: 'Synthetic', persona: { opening: 'Synthetic opening' } })
  const blank = variables.get(characterId)
  const stamp = '2026-01-01T00:00:00.000Z'
  const version = { ...blank.versions[0]!,
    objects: [{ id: 'world', name: 'world', parentId: '', dynamicKey: false, enabled: true, description: '', updateRule: '', order: 1, treeViewOrder: 1, createdAt: stamp, updatedAt: stamp },
      { id: 'members', name: 'members', parentId: '', dynamicKey: true, enabled: true, description: '', updateRule: '', order: 2, treeViewOrder: 2, createdAt: stamp, updatedAt: stamp }],
    variables: [{ id: 'date', title: 'date', objectId: 'world', type: 'string' as const, defaultValue: '第一日', enabled: true, description: '', updateRule: '', readMode: 'on_demand' as const, order: 1, treeViewOrder: 1, createdAt: stamp, updatedAt: stamp }],
    initialStateJson: '{"world":{"date":"第一日"},"members":{"alpha":{"score":8,"note":null}}}' }
  variables.save(characterId, { ...blank, ...version, versions: [version] })
  const opening = openings.get(characterId)
  openings.save(characterId, { ...opening, openingMessages: opening.openingMessages.map(item => ({ ...item, variableVersionId: version.id })) })
  const oldChat = conversations.create({ metadata: { characterId } }).conversation.id
  const oldState = new VariableStateRepository(database, variables).viewerStates(oldChat)
  // Exact v14 defect: the definition was committed, but the separate seed stayed old.
  database.native.prepare("UPDATE variable_config_variables SET payloadJson=json_set(payloadJson,'$.defaultValue','第一天') WHERE variableId='date'").run()
  const raw = JSON.parse((database.native.prepare('SELECT configurationJson FROM character_openings').get() as { configurationJson: string }).configurationJson)
  raw.openingMessages[0].initialVariableStateJson = '{"discarded":true}'
  raw.openingMessages.push({ id: 'unbound', title: 'Unbound', content: 'Unbound opening', variableVersionId: '', initialVariableStateJson: '{"discarded":true}' })
  database.native.prepare('UPDATE character_openings SET configurationJson=?').run(JSON.stringify(raw))
  database.native.pragma('user_version=14')
  const stable = () => Object.fromEntries(['chat_sessions', 'agent_conversations', 'agent_turns', 'chat_session_variable_states', 'conversation_state_snapshots',
    'variable_config_versions', 'variable_config_objects', 'variable_config_variables'].map(table => [table, database.native.prepare(`SELECT * FROM ${table}`).all()]))
  return { database, path, characterId, variables, openings, conversations, oldChat, oldState, stable }
}

it('upgrades v14 once, removes retired fields and repairs seeds without changing existing chats or version identities', () => {
  const f = legacyFixture(), before = f.stable()
  f.database.close(); f.database.open()
  expect(f.database.native.pragma('user_version', { simple: true })).toBe(CURRENT_SCHEMA_VERSION)
  expect(f.stable()).toEqual(before)
  const opening = f.openings.get(f.characterId)
  expect(JSON.stringify(opening)).not.toContain('initialVariableStateJson')
  expect((f.database.native.prepare('SELECT configurationJson FROM character_openings').get() as { configurationJson: string }).configurationJson)
    .not.toContain('initialVariableStateJson')
  expect(opening.openingMessages.map(item => item.variableVersionId)).toEqual(['variable-config-default', ''])
  const states = new VariableStateRepository(f.database, f.variables)
  expect(states.viewerStates(f.oldChat)).toEqual(f.oldState)
  const next = f.conversations.create({ metadata: { characterId: f.characterId } }).conversation.id
  expect(JSON.parse(states.viewerStates(next).currentStateJson))
    .toEqual({ world: { date: '第一天' }, members: { alpha: { score: 8, note: null } } })
  f.conversations.selectOpening(next, 'unbound')
  expect(f.variables.forConversation(next, f.characterId)).toBeNull()
  expect(JSON.parse(states.viewerStates(next).currentStateJson)).toEqual({})
  const saved = f.variables.get(f.characterId)
  const revision = f.database.native.prepare('SELECT revision FROM variable_configs').get()
  f.database.native.exec("CREATE TRIGGER no_repeated_opening_upgrade BEFORE UPDATE ON character_openings BEGIN SELECT RAISE(ABORT,'upgrade repeated'); END")
  f.database.close(); f.database.open()
  expect(f.variables.get(f.characterId)).toEqual(saved)
  expect(f.database.native.prepare('SELECT revision FROM variable_configs').get()).toEqual(revision)
  expect(f.database.native.pragma('foreign_key_check')).toEqual([])
  expect(f.database.native.pragma('integrity_check', { simple: true })).toBe('ok')
}, 30_000)

it('rolls back retired-field removal and the schema version if any variable configuration cannot be upgraded', () => {
  const f = legacyFixture()
  f.database.native.prepare("UPDATE variable_config_variables SET payloadJson='{}' WHERE variableId='date'").run()
  const before = f.database.native.prepare('SELECT configurationJson FROM character_openings').get()
  f.database.close()
  expect(() => f.database.open()).toThrow()
  // Inspect the failed file with the raw driver; do not attempt another migration.
  const raw = new Database(f.path)
  try {
    expect(raw.pragma('user_version', { simple: true })).toBe(14)
    expect(raw.prepare('SELECT configurationJson FROM character_openings').get()).toEqual(before)
  } finally { raw.close() }
}, 30_000)
