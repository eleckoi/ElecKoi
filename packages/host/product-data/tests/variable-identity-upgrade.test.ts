import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqliteDatabase } from '../../../../tests/helpers/SqliteDatabase'
import { installSchema } from '../src/storage/sqlite/installSchema'
import { ConversationRepository } from '../src/domain/conversations/ConversationRepository'
import { ConversationStateRepository } from '../src/domain/conversations/ConversationStateRepository'
import { ConversationArchiveRepository } from '../src/domain/conversations/ConversationArchiveRepository'
import { CharacterRepository } from '../src/domain/personas/CharacterRepository'
import { VariableConfigRepository } from '../src/domain/variables/VariableConfigRepository'
import { VariableStateRepository } from '../src/domain/variables/VariableStateRepository'
import { CharacterOpeningRepository } from '../src/domain/characterOpenings'
import { resolveConversationSeed } from '../src/domain/conversations/conversationSeed'
import { LocalMediaStore } from '../src/storage/media/LocalMediaStore'
import { parseVariableIdentities, projectVariableState } from '../../../shared/src/foundation/variables/identity'

const roots: string[] = [], stores: SqliteDatabase[] = []
afterEach(() => { for (const store of stores.splice(0)) store.close(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'eleckoi-variable-identity-')); roots.push(root)
  const path = join(root, 'store.sqlite'), store = new SqliteDatabase(path); stores.push(store); store.open()
  const variables = new VariableConfigRepository(store), openings = new CharacterOpeningRepository(store)
  const conversations = new ConversationRepository(store, (characterId, db) => resolveConversationSeed(characterId, db, openings, variables))
  new CharacterRepository(store, conversations, new LocalMediaStore(join(root, 'media'))).replaceAll({ active_character_id: 'synthetic', groups: [], items: [{ id: 'synthetic', name: '合成角色', group: '', persona: {} }] })
  const blank = variables.get('synthetic')
  variables.save('synthetic', { ...blank, variables: [{ id: 'score', title: 'score', objectId: '', enabled: true, type: 'number', defaultValue: '0', description: '', updateRule: '', readMode: 'required', order: 1, treeViewOrder: 1, createdAt: '', updatedAt: '' }] })
  const opening = openings.get('synthetic')
  openings.save('synthetic', { ...opening, openingMessages: opening.openingMessages.map(item => ({ ...item, content: '合成开场', variableVersionId: blank.activeVersionId })) })
  const id = conversations.create({ metadata: { characterId: 'synthetic' } }).conversation.id
  const states = new VariableStateRepository(store, variables)
  states.replaceCurrent(id, '{"score":7,"unknown":{"note":"retained"}}')
  new ConversationStateRepository(store).recordTurn(id, id, 1, 'after', { variableStateJson: states.viewerStates(id).currentStateJson, variableIdentityJson: states.identities(id), settingLibraryStateJson: '[]' })
  return { root, path, store, variables, states, id }
}
function downgrade(path: string) {
  const db = new Database(path)
  db.exec('ALTER TABLE chat_session_variable_states DROP COLUMN identityJson; ALTER TABLE conversation_state_snapshots DROP COLUMN variableIdentityJson; PRAGMA user_version=16;')
  return db
}
describe('variable identity storage evolution', () => {
  it('atomically upgrades v16, preserves every value and snapshot, and keeps legacy runtime fields usable after reopening', () => {
    const f = fixture(), before = f.states.viewerStates(f.id)
    const snapshots = f.store.native.prepare('SELECT variableStateJson FROM conversation_state_snapshots').all()
    f.store.close(); const old = downgrade(f.path); old.close(); f.store.open()
    expect(f.store.native.pragma('user_version', { simple: true })).toBe(17)
    expect(f.states.viewerStates(f.id)).toEqual(before)
    expect(f.store.native.prepare('SELECT variableStateJson FROM conversation_state_snapshots').all()).toEqual(snapshots)
    const metadata = JSON.parse(f.states.identities(f.id))
    expect(metadata['/score']).toMatchObject({ origin: 'definition', definitionId: 'score' })
    expect(metadata['/unknown']).toMatchObject({ origin: 'runtime' })
    expect(metadata['/unknown/note']).toMatchObject({ origin: 'runtime' })
    const context = f.states.runtimeContext(f.id, { characterId: 'synthetic' })!
    expect(projectVariableState(JSON.parse(context.stateJson), parseVariableIdentities(context.identityJson), context).state)
      .toEqual({ score: 7, unknown: { note: 'retained' } })
    const identityJson = f.states.identities(f.id)
    f.store.close(); f.store.open()
    expect(f.states.identities(f.id)).toBe(identityJson)
    const option = JSON.parse((f.store.native.prepare('SELECT payloadJson FROM agent_openings').get() as { payloadJson: string }).payloadJson).options[0]
    expect(JSON.parse(option.initialVariableIdentityJson)['/score']).toMatchObject({ origin: 'definition', definitionId: 'score' })
    expect(f.store.native.pragma('foreign_key_check')).toEqual([])
    expect(f.store.native.pragma('integrity_check', { simple: true })).toBe('ok')
  }, 20000)
  it('uses the version saved in the conversation instead of the editor selection and keeps disabled fields owned by their definitions', () => {
    const f = fixture(), source = f.variables.get('synthetic'), a = source.versions[0]!
    const disabled = { ...a.variables[0]!, id: 'disabled-score', title: 'disabled', enabled: false }
    const b = { ...a, id: 'variant-b', name: '编辑中的版本', variables: [{ ...a.variables[0]!, id: 'other-score', title: 'other' }] }
    f.variables.save('synthetic', { ...source, ...b, activeVersionId: b.id, versions: [{ ...a, variables: [...a.variables, disabled] }, b] })
    f.states.replaceCurrent(f.id, '{"score":7,"disabled":9,"runtime":3}')
    const before = f.states.viewerStates(f.id)
    f.store.close(); const old = downgrade(f.path); old.close(); f.store.open()
    const identities = JSON.parse(f.states.identities(f.id))
    expect(identities['/score']).toMatchObject({ origin: 'definition', definitionId: 'score', versionId: a.id })
    expect(identities['/disabled']).toMatchObject({ origin: 'definition', definitionId: disabled.id })
    expect(identities['/runtime']).toMatchObject({ origin: 'runtime' })
    const context = f.states.runtimeContext(f.id, { characterId: 'synthetic' })!
    expect(context.versionId).toBe(a.id)
    expect(projectVariableState(JSON.parse(context.stateJson), parseVariableIdentities(context.identityJson), context).state).toEqual({ score: 7, runtime: 3 })
    expect(f.states.viewerStates(f.id)).toEqual(before)
  }, 20000)
  it('rolls back structure and data together if an old variable document is invalid', () => {
    const f = fixture(); f.store.close(); const old = downgrade(f.path)
    try {
      old.prepare("UPDATE chat_session_variable_states SET stateJson='broken' WHERE kind='current'").run()
      const before = old.prepare('SELECT * FROM chat_session_variable_states').all()
      expect(() => installSchema(old)).toThrow()
      expect(old.pragma('user_version', { simple: true })).toBe(16)
      expect((old.pragma('table_info(chat_session_variable_states)') as Array<{ name: string }>).map(item => item.name)).not.toContain('identityJson')
      expect(old.prepare('SELECT * FROM chat_session_variable_states').all()).toEqual(before)
    } finally { old.close() }
  }, 20000)
  it('round-trips v3 origins and converts old v2 archives only at import boundaries', () => {
    const f = fixture(), archive = new ConversationArchiveRepository(f.store, { read: () => '[]', restore() {} })
    const snapshot = archive.export(f.id)
    expect(snapshot.version).toBe(3)
    const parsed = archive.parse(JSON.parse(JSON.stringify(snapshot)))
    expect(parsed).toEqual(snapshot)
    const imported = archive.import(parsed, 'synthetic', new Map())
    expect(f.states.identities(imported)).toBe(f.states.identities(f.id))
    const legacy = JSON.parse(JSON.stringify(snapshot)); legacy.version = 2
    for (const row of legacy.tables.chat_session_variable_states) delete row.identityJson
    for (const row of legacy.tables.conversation_state_snapshots) delete row.variableIdentityJson
    const converted = archive.parse(legacy)
    expect(JSON.parse(converted.tables.chat_session_variable_states.find(row => row.kind === 'current')!.identityJson as string)['/unknown'].origin).toBe('runtime')
    expect(converted.version).toBe(3)
    expect(f.states.viewerStates(f.id)).toEqual(f.states.viewerStates(imported))
  }, 20000)
})
