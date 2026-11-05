import { CharacterOpeningRepository } from '../../packages/host/product-data/src/domain/characterOpenings'
import { runtimeContextsFor } from '../helpers/runtime-contexts.js'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { restoreV10PresetFixture } from '../../packages/host/product-data/tests/helpers/presetSchemaV10'
import { CURRENT_SCHEMA_VERSION } from '../../packages/host/product-data/src/storage/sqlite/schemaVersion'
import { afterEach, describe, expect, it } from 'vitest'
import { SqliteDatabase } from '../../packages/host/product-data/src/storage/sqlite/SqliteDatabase'
import { ConversationRepository } from '../../packages/host/product-data/src/domain/conversations/ConversationRepository'
import { CharacterRepository } from '../../packages/host/product-data/src/domain/personas/CharacterRepository'
import { SettingLibraryRepository } from '../../packages/host/product-data/src/domain/settingLibraries'
import { VariableConfigRepository } from '../../packages/host/product-data/src/domain/variables/VariableConfigRepository'
import { VariableStateRepository } from '../../packages/host/product-data/src/domain/variables/VariableStateRepository'
import { ElecKoiVariableProcessing } from '@eleckoi/dsh-product-api'
import { resolveConversationSeed } from '../../packages/host/product-data/src/domain/conversations/conversationSeed'
import { LocalMediaStore } from '@eleckoi/dsh-product-data/media'
import { encodeSettingLibrarySnapshot, decodeSettingLibrarySnapshot, encodeVariableConfigSnapshot, decodeVariableConfigSnapshot } from '../../packages/host/product-data/src/domain/characterTransfer/portableSnapshots'
// @ts-expect-error 工具插件为无声明文件的 JavaScript 入口。
import { apply as applyVariableTools } from '../../apps/desktop/resources/dsh/variable-tools.mjs'
import type { VariableConfigVersion } from '../../packages/shared/src/contracts/variables/schemas'

const fixtures: Array<{ database: SqliteDatabase; directory: string }> = []
afterEach(() => {
  delete process.env.ELECKOI_SESSION_SNAPSHOT_ROOT
  for (const fixture of fixtures.splice(0)) {
    fixture.database.close()
    rmSync(fixture.directory, { recursive: true, force: true })
  }
})

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'eleckoi-opening-version-'))
  const path = join(directory, 'product.sqlite3')
  const database = new SqliteDatabase(path)
  database.open()
  fixtures.push({ database, directory })
  const characters = new CharacterRepository(database, new ConversationRepository(database), new LocalMediaStore(join(directory, 'media')))
  characters.replaceAll({ active_character_id: 'synthetic-character', groups: [], items: [{
    id: 'synthetic-character', name: '合成角色', group: '', persona: {},
  }] })
  const variables = new VariableConfigRepository(database)
  const libraries = new SettingLibraryRepository(database)
  const blank = variables.get('synthetic-character')
  const variant = (id: string, limit: number, value: number): VariableConfigVersion => ({
    ...blank.versions[0]!, id, name: id,
    schemaCode: `const Schema = z.object({ status: z.object({ energy: z.number().max(${limit}) }) })`,
    objects: [{ id: 'status', name: 'status', parentId: '', enabled: true, dynamicKey: false,
      description: '', updateRule: id, order: 1, treeViewOrder: 1, createdAt: '', updatedAt: '' }],
    variables: [{ id: 'energy', title: 'energy', objectId: 'status', type: 'number', defaultValue: String(value),
      enabled: true, description: id, updateRule: `rule-${id}`, readMode: 'required',
      order: 1, treeViewOrder: 1, createdAt: '', updatedAt: '' }],
  })
  const a = variant('variant-a', 10, 2)
  const b = variant('variant-b', 100, 20)
  variables.save('synthetic-character', { ...blank, ...a, activeVersionId: a.id, versions: [a, b] })
  const openings = new CharacterOpeningRepository(database)
  openings.save('synthetic-character', { ...openings.get('synthetic-character'), openingMessages: [
    { id: 'opening-a', title: '开场 A', content: '合成开场 A', variableVersionId: a.id },
    { id: 'opening-b', title: '开场 B', content: '合成开场 B', variableVersionId: b.id },
  ], defaultOpeningMessageId: 'opening-a' })
  const conversations = new ConversationRepository(database, (characterId, db) => resolveConversationSeed(characterId, db, new CharacterOpeningRepository(database), variables))
  const states = new VariableStateRepository(database, variables)
  return { database, path, directory, variables, libraries, openings, conversations, states }
}

describe('opening variable version bindings', () => {
  it('uses edited static defaults in new chats while preserving populated dynamic groups and existing chats', () => {
    const f = fixture(), characterId = 'synthetic-character'
    const base = f.variables.get(characterId)
    const original = base.versions[0]!
    const version: VariableConfigVersion = {
      ...original, schemaCode: '',
      objects: [...original.objects, { ...original.objects[1]!, id: 'members', name: 'members', dynamicKey: true, parentId: '' }],
      variables: [...original.variables, { ...original.variables[0]!, id: 'date', title: 'date', type: 'string', defaultValue: '第一日' }],
      initialStateJson: JSON.stringify({ status: { energy: 2, date: '第一日' }, members: { alpha: { energy: 8, note: null } } }),
    }
    f.variables.save(characterId, { ...base, ...version, activeVersionId: version.id, versions: [version, base.versions[1]!] })
    const oldChat = f.conversations.create({ metadata: { characterId } }).conversation.id
    const oldState = f.states.viewerStates(oldChat)
    const loaded = f.variables.get(characterId)
    const edited = { ...loaded, variables: loaded.variables.map(item => item.id === 'date' ? { ...item, defaultValue: '第一天' } : item) }
    const saved = f.variables.save(characterId, edited)
    f.database.close(); f.database.open()
    const newChat = f.conversations.create({ metadata: { characterId } }).conversation.id
    expect(JSON.parse(saved.initialStateJson)).toEqual({ status: { energy: 2, date: '第一天' }, members: { alpha: { energy: 8, note: null } } })
    expect(f.variables.forConversation(newChat, characterId)!.activeVersionId).toBe(version.id)
    expect(JSON.parse(f.states.viewerStates(newChat).currentStateJson)).toEqual(JSON.parse(saved.initialStateJson))
    expect(JSON.parse(f.states.runtimeContext(newChat, { characterId })!.stateJson).status.date).toBe('第一天')
    expect(f.states.viewerStates(oldChat)).toEqual(oldState)
    expect(f.variables.get(characterId).versions.map(item => item.id)).toEqual(['variant-a', 'variant-b'])
  }, 20_000)

  it('keeps unbound openings inactive through creation, switching, editor changes and disk reopen', () => {
    const f = fixture(), characterId = 'synthetic-character'
    const value = f.openings.get(characterId)
    const unbound = { id: 'unbound-opening', title: '合成未绑定开场', content: '合成未绑定正文',
      variableVersionId: '' }
    f.openings.save(characterId, { ...value, openingMessages: [...value.openingMessages, unbound], defaultOpeningMessageId: unbound.id })
    const chat = f.conversations.create({ metadata: { characterId } }).conversation.id
    const binding = () => f.database.native.prepare('SELECT variableVersionId FROM agent_conversations WHERE id=?').get(chat)
    expect(binding()).toEqual({ variableVersionId: '' })
    expect(f.variables.forConversation(chat, characterId)).toBeNull()
    expect(f.states.runtimeContext(chat, { characterId })).toBeUndefined()
    expect(JSON.parse(f.states.viewerStates(chat).initialStateJson)).toEqual({})
    f.conversations.selectOpening(chat, 'opening-b')
    expect(binding()).toEqual({ variableVersionId: 'variant-b' })
    expect(JSON.parse(f.states.runtimeContext(chat, { characterId })!.stateJson)).toEqual({ status: { energy: 20 } })
    f.conversations.selectOpening(chat, unbound.id)
    expect(binding()).toEqual({ variableVersionId: '' })
    expect(f.states.runtimeContext(chat, { characterId })).toBeUndefined()
    expect(JSON.parse(f.states.viewerStates(chat).currentStateJson)).toEqual({})
    const config = f.variables.get(characterId)
    f.variables.save(characterId, { ...config, ...config.versions[1]!, activeVersionId: 'variant-b' })
    f.database.close(); f.database.open()
    expect(binding()).toEqual({ variableVersionId: '' })
    expect(f.variables.forConversation(chat, characterId)).toBeNull()
    expect(f.states.runtimeContext(chat, { characterId })).toBeUndefined()
    const second = f.conversations.create({ metadata: { characterId } }).conversation.id
    expect(f.variables.forConversation(second, characterId)).toBeNull()
    f.openings.save(characterId, { ...value, openingMessages: value.openingMessages.map(message => ({ ...message, content: '' })) })
    const blank = f.conversations.create({ metadata: { characterId } }).conversation.id
    expect(f.variables.forConversation(blank, characterId)).toBeNull()
    expect(f.conversations.openingText(blank)).toBe('')
  }, 20_000)
  it('loads the complete selected configuration and keeps it across active-version changes and reopening', async () => {
    const f = fixture()
    const id = f.conversations.create({ metadata: { characterId: 'synthetic-character' } }).conversation.id
    const context = () => f.states.runtimeContext(id, { characterId: 'synthetic-character' })!
    expect(JSON.parse(context().stateJson)).toEqual({ status: { energy: 2 } })
    expect(context().schemaCode).toContain('.max(10)')
    expect(context().variables[0]?.updateRule).toBe('rule-variant-a')

    f.conversations.selectOpening(id, 'opening-b')
    expect(JSON.parse(context().initialStateJson)).toEqual({ status: { energy: 20 } })
    expect(context().schemaCode).toContain('.max(100)')
    expect(context().objects.find((object) => object.id === 'status')?.updateRule).toBe('variant-b')
    expect(context().variables[0]?.updateRule).toBe('rule-variant-b')
    const config = f.variables.get('synthetic-character')
    f.variables.save('synthetic-character', { ...config, ...config.versions[0]!, activeVersionId: 'variant-a' })
    expect(context().schemaCode).toContain('.max(100)')

    const snapshotRoot = join(f.directory, 'snapshots')
    mkdirSync(snapshotRoot)
    process.env.ELECKOI_SESSION_SNAPSHOT_ROOT = snapshotRoot
    const selected = context()
    const variableState = { enabled: true, config: {
      initialState: JSON.parse(selected.initialStateJson), schemaCode: selected.schemaCode,
      objects: selected.objects, variables: selected.variables,
    }, state: JSON.parse(selected.stateJson) }
    const contexts = runtimeContextsFor(id, { variables: variableState })
    const tools = new Map<string, { execute(args: unknown, execution: unknown): Promise<any> }>()
    applyVariableTools({ eleckoiRuntimeContexts: contexts, eleckoiVariableProcessing: new ElecKoiVariableProcessing({} as any),
      tools: { register(definition: any) { tools.set(definition.name, definition); return () => {} } } })
    const execution = { agent: { session: { id } } }
    const patch = tools.get('eleckoi_apply_variable_patch')!
    expect(await patch.execute({ operations: [{ op: 'replace', path: '/status/energy', value: 50 }] }, execution)).toMatchObject({ status: 'ok' })
    expect(await patch.execute({ operations: [{ op: 'replace', path: '/status/energy', value: 101 }] }, execution)).toMatchObject({ status: 'validation_error' })

    f.states.replaceCurrent(id, '{"status":{"energy":50}}')
    f.database.close(); f.database.open()
    expect(JSON.parse(context().stateJson)).toEqual({ status: { energy: 50 } })
    expect(context().schemaCode).toContain('.max(100)')
    f.conversations.updateOpening(id, '修改合成开场')
    expect(f.variables.forConversation(id, 'synthetic-character')!.activeVersionId).toBe('variant-b')
  }, 20000)

  it('round-trips bindings and refuses missing versions or deletion of referenced versions atomically', () => {
    const f = fixture()
    const library = f.libraries.get('synthetic-character')
    const exported = decodeSettingLibrarySnapshot(encodeSettingLibrarySnapshot(library), 'synthetic-character')
    const config = decodeVariableConfigSnapshot(encodeVariableConfigSnapshot(f.variables.get('synthetic-character')), 'synthetic-character')
    expect(exported.entries).toEqual([])
    expect(JSON.parse(JSON.stringify(f.openings.get('synthetic-character'))).openingMessages.map((opening: any) => opening.variableVersionId)).toEqual(['variant-a', 'variant-b'])
    expect(config.versions.map((version) => version.id)).toEqual(['variant-a', 'variant-b'])
    expect(() => f.variables.save('synthetic-character', { ...config, versions: config.versions.slice(0, 1) })).toThrow('绑定开场白')
    const openings = f.openings.get('synthetic-character')
    expect(() => f.openings.save('synthetic-character', { ...openings, openingMessages: openings.openingMessages.map(opening => ({ ...opening, variableVersionId: 'missing-version' })) })).toThrow('变量版本不存在')
    const id = f.conversations.create({ metadata: { characterId: 'synthetic-character' } }).conversation.id
    expect(() => f.variables.save('synthetic-character', { ...config, ...config.versions[1]!, activeVersionId: 'variant-b', versions: [config.versions[1]!] })).toThrow('聊天使用')
    expect(f.variables.forConversation(id, 'synthetic-character')!.activeVersionId).toBe('variant-a')
    expect(f.variables.get('synthetic-character').versions).toHaveLength(2)
  }, 20000)

  it('preserves a development v10 chat binding even when the character now selects another variable version', () => {
    const f = fixture()
    const id = f.conversations.create({ metadata: { characterId: 'synthetic-character' } }).conversation.id
    f.states.replaceCurrent(id, '{"status":{"energy":7}}')
    const before = f.states.viewerStates(id)
    const config = f.variables.get('synthetic-character')
    f.variables.save('synthetic-character', { ...config, ...config.versions[1]!, activeVersionId: 'variant-b' })
    f.database.close()
    const legacy = new Database(f.path)
    restoreV10PresetFixture(legacy)
    legacy.exec('DROP TABLE script_libraries; CREATE TABLE IF NOT EXISTS `conversation_generation_results` (`operationId` TEXT NOT NULL, `conversationId` TEXT NOT NULL, `resultJson` TEXT NOT NULL, PRIMARY KEY(`operationId`), FOREIGN KEY(`conversationId`) REFERENCES `chat_sessions`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE ); PRAGMA user_version=10;')
    legacy.close()
    f.database.open()
    expect(f.database.native.pragma('user_version', { simple: true })).toBe(CURRENT_SCHEMA_VERSION)
    expect(f.variables.get('synthetic-character').activeVersionId).toBe('variant-b')
    expect(f.variables.forConversation(id, 'synthetic-character')!.activeVersionId).toBe('variant-a')
    expect(f.states.viewerStates(id)).toEqual(before)
    expect(f.database.native.pragma('foreign_key_check')).toEqual([])
    expect(f.database.native.pragma('integrity_check', { simple: true })).toBe('ok')
  }, 20000)

  it('migrates a real v8 chat with current values intact and fixes its version before later editor changes', () => {
    const f = fixture()
    const id = f.conversations.create({ metadata: { characterId: 'synthetic-character' } }).conversation.id
    f.states.replaceCurrent(id, '{"status":{"energy":7}}')
    f.database.close()
    const legacy = new Database(f.path)
    restoreV10PresetFixture(legacy)
    legacy.exec('DROP TABLE script_libraries; ALTER TABLE agent_conversations DROP COLUMN variableVersionId; PRAGMA user_version=8;')
    legacy.close()
    f.database.open()
    expect(f.database.native.pragma('user_version', { simple: true })).toBe(CURRENT_SCHEMA_VERSION)
    const config = f.variables.get('synthetic-character')
    f.variables.save('synthetic-character', { ...config, ...config.versions[1]!, activeVersionId: 'variant-b' })
    expect(f.variables.forConversation(id, 'synthetic-character')!.activeVersionId).toBe('variant-a')
    expect(f.states.viewerStates(id)).toMatchObject({ currentStateJson: '{\n  "status": {\n    "energy": 7\n  }\n}' })
    expect(f.database.native.pragma('foreign_key_check')).toEqual([])
    expect(f.database.native.pragma('integrity_check', { simple: true })).toBe('ok')
  }, 20000)
})
