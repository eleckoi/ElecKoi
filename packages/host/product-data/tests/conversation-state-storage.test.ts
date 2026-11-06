import { CURRENT_SCHEMA_VERSION } from '../src/storage/sqlite/schemaVersion'
import { createCharacterOpenings } from '../../../shared/src/contracts/characterOpenings/schemas'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SqliteDatabase } from '../../../../tests/helpers/SqliteDatabase'
import { installSchema } from '../src/storage/sqlite/installSchema'
import { ConversationRepository } from '../src/domain/conversations/ConversationRepository'
import { ConversationStateRepository } from '../src/domain/conversations/ConversationStateRepository'
import { ConversationArchiveRepository } from '../src/domain/conversations/ConversationArchiveRepository'
import { SettingLibraryRepository } from '../src/domain/settingLibraries/SettingLibraryRepository'
import { VariableConfigRepository } from '../src/domain/variables/VariableConfigRepository'
import { VariableStateRepository } from '../src/domain/variables/VariableStateRepository'
import { restoreLegacyConversationStorage, insertLegacyReply } from './helpers/conversationStorageV11'
import { ELECKOI_FAILURE_CODES } from '../../../shared/src/contracts/errors/codes'

const cleanups: Array<() => void> = []
afterEach(() => { for (const fn of cleanups.splice(0).reverse()) fn() })
const state = (score: number, settings = '[]') => ({ variableStateJson: JSON.stringify({ score }), settingLibraryStateJson: settings })
const setting = (id: string) => JSON.stringify([{ targetType: 'entry', targetId: id, operation: 'delete', payloadJson: '{}', updatedAt: '2026-10-01' }])
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'eleckoi-state-storage-'))
  cleanups.push(() => rmSync(root, { recursive: true, force: true }))
  const db = new SqliteDatabase(join(root, 'product.sqlite3'))
  db.open(); cleanups.push(() => db.close())
  const conversations = new ConversationRepository(db)
  const id = conversations.create({ title: 'Synthetic conversation' }).conversation.id
  const history = new ConversationStateRepository(db)
  const variables = new VariableStateRepository(db, new VariableConfigRepository(db))
  const settings = new SettingLibraryRepository(db)
  return { root, db, id, history, variables, settings }
}

describe('conversation state database', () => {
  it('keeps before, completed and current variables distinct and requires explicit rewind to replace completed state', () => {
    const f = fixture()
    f.history.recordTurn(f.id, f.id, 1, 'before', state(1))
    f.history.recordTurn(f.id, f.id, 1, 'after', state(2))
    f.variables.replaceCurrent(f.id, '{"score":99}')
    expect(f.history.read(f.id, f.id, 1, 'before')).toEqual(state(1))
    expect(f.history.variablesByTurn(f.id, f.id)).toEqual({ 1: '{"score":2}' })
    expect(() => f.history.recordTurn(f.id, f.id, 1, 'after', state(99))).toThrow('不能覆盖')
    expect(() => f.history.read(f.id, f.id, 2, 'before')).toThrow('缺少')
    f.history.trim(f.id, f.id, 1)
    f.history.recordTurn(f.id, f.id, 1, 'after', state(3))
    expect(f.history.read(f.id, f.id, 1, 'after')).toEqual(state(3))
  })

  it('atomically restores variables, conversation settings and all history after a failed rewind', () => {
    const f = fixture()
    const previous = state(30, setting('accepted-task'))
    f.variables.replaceCurrent(f.id, previous.variableStateJson)
    f.settings.restoreConversationRuntimeState(f.id, previous.settingLibraryStateJson)
    for (const [turn, phase, score] of [[1, 'after', 10], [2, 'before', 20], [2, 'after', 30], [3, 'before', 40]] as const) {
      f.history.recordTurn(f.id, f.id, turn, phase, state(score))
    }
    const captured = f.history.list(f.id)
    expect(() => f.db.withWriteTx(() => {
      f.variables.replaceCurrent(f.id, '{"score":20}')
      f.settings.restoreConversationRuntimeState(f.id, '[]')
      f.history.trim(f.id, f.id, 2)
      throw new Error('Synthetic rewind failure')
    })).toThrow('rewind failure')
    expect(f.history.list(f.id)).toEqual(captured)
    expect(JSON.parse(f.variables.viewerStates(f.id).currentStateJson)).toEqual({ score: 30 })
    expect(f.settings.snapshotConversationRuntimeState(f.id)).toBe(previous.settingLibraryStateJson)
  })

  it.each([11, 12, 13, 14])('converts known development v%s into the single v12 schema and preserves bound states across reopen', version => {
    const f = fixture()
    restoreLegacyConversationStorage(f.db.native)
    insertLegacyReply(f.db.native, f.id, { userId: 'input', replyId: 'reply', before: '{"score":1}', after: '{"score":2}', turn: 1 })
    f.db.native.prepare(`INSERT INTO global_regex_rules
      (id,name,pattern,replacement,targetsJson,enabled,displayOnly,promptOnly,runOnEdit,sortIndex,optionsJson)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
      'synthetic-rule', 'Synthetic rule', 'x', 'y', '["SlashCommand","AiOutput"]', 1, 1, 0, 0, 0, '{}')
    f.db.native.prepare("INSERT INTO agent_setting_snapshots VALUES (?,'response','reply',?)").run(f.id, setting('accepted-task'))
    if (version === 11) f.db.native.exec('DROP TABLE editor_library_versions; DROP TABLE IF EXISTS display_template_libraries')
    f.db.native.pragma(`user_version=${version}`)
    installSchema(f.db.native)
    f.db.close(); f.db.open()
    expect(f.db.native.pragma('user_version', { simple: true })).toBe(CURRENT_SCHEMA_VERSION)
    expect(f.db.native.prepare('SELECT targetsJson FROM global_regex_rules').get()).toEqual({ targetsJson: '["AiOutput"]' })
    expect(f.history.read(f.id, f.id, 1, 'before')).toEqual(state(1))
    expect(f.history.read(f.id, f.id, 1, 'after')).toEqual(state(2, setting('accepted-task')))
    expect((f.db.native.pragma('table_info(agent_responses)') as { name: string }[]).map(row => row.name))
      .not.toEqual(expect.arrayContaining(['variableStateJson', 'storedRegexRulesJson']))
    expect(f.db.native.prepare("SELECT 1 FROM sqlite_master WHERE name='agent_setting_snapshots'").get()).toBeUndefined()
    expect(f.db.native.pragma('foreign_key_check')).toEqual([])
    expect(f.db.native.pragma('integrity_check', { simple: true })).toBe('ok')
  }, 30_000)

  it('discards ambiguous legacy history while retaining message records and precise input state', () => {
    const f = fixture()
    restoreLegacyConversationStorage(f.db.native)
    for (const [index, score] of [[0, 2], [1, 3]] as const) insertLegacyReply(f.db.native, f.id, {
      userId: 'input', replyId: `reply-${index}`, responseIndex: index, before: '{"score":1}', after: JSON.stringify({ score }), turn: 1
    })
    installSchema(f.db.native)
    expect(f.history.variableHistory(f.id, f.id)).toHaveLength(0)
    expect(f.db.native.prepare('SELECT COUNT(*) AS n FROM agent_responses').get()).toEqual({ n: 2 })
    expect(() => f.history.read(f.id, f.id, 1, 'after')).toThrow('缺少')
    expect(f.history.read(f.id, f.id, 1, 'before', 'input')).toEqual(state(1))
    expect(() => f.history.read(f.id, 'different-session', 1, 'before')).toThrow('缺少')
  })

  it('keeps absent imported variables and settings explicitly missing', () => {
    const f = fixture()
    f.history.recordTurn(f.id, f.id, 1, 'after', { variableStateJson: null, settingLibraryStateJson: null })
    expect(f.history.variablesByTurn(f.id, f.id)).toEqual({})
    expect(() => f.history.read(f.id, f.id, 1, 'after')).toThrow('缺少')
    f.history.recordInput(f.id, f.id, 'unanswered', state(8))
    expect(f.history.read(f.id, f.id, 4, 'before', 'unanswered')).toEqual(state(8))
    f.history.recordInput(f.id, f.id, 'removed-input', state(99))
    f.history.trim(f.id, f.id, 1, ['unanswered'])
    expect(f.history.list(f.id).some(row => row.boundaryId === 'removed-input')).toBe(false)
    expect(f.history.read(f.id, f.id, 4, 'before', 'unanswered')).toEqual(state(8))
  })

  it('rolls back the whole schema conversion when a legacy state is invalid', () => {
    const f = fixture()
    restoreLegacyConversationStorage(f.db.native)
    insertLegacyReply(f.db.native, f.id, { userId: 'input', replyId: 'reply', before: '{}', after: 'invalid', turn: 1 })
    f.db.native.pragma('user_version=11')
    f.db.native.exec('DROP TABLE editor_library_versions; DROP TABLE IF EXISTS display_template_libraries')
    const schema = f.db.native.prepare("SELECT name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all()
    expect(() => installSchema(f.db.native)).toThrow()
    expect(f.db.native.pragma('user_version', { simple: true })).toBe(11)
    expect(f.db.native.prepare("SELECT name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all()).toEqual(schema)
    expect(f.db.native.prepare('SELECT variableStateJson FROM agent_responses').get()).toEqual({ variableStateJson: 'invalid' })
  }, 30_000)
})

it('exports current settings and every state in one archive and remaps Session identities on import', () => {
  const f = fixture()
  f.db.native.prepare(`INSERT INTO characters(id,name,avatar,squareImage,coverImage,groupName,orderIndex,groupViewOrder,folder,
    frontendBeautyEnabled,assistantName,assistantAvatar,profileAge,profileSex,profileHeight,profileBirthday,profileLike,
    chatBackground,chatBackgroundOpacity,chatBackgroundBlur,chatBackgroundScrim)
    VALUES ('synthetic-card','Synthetic','','','','',0,0,'',0,'Synthetic','','','','','','','',1,0,0)`).run()
  f.db.native.prepare('INSERT INTO character_openings VALUES (?, ?)').run('synthetic-card', JSON.stringify(createCharacterOpenings('synthetic-card')))
  f.db.native.prepare("UPDATE chat_sessions SET characterId='synthetic-card' WHERE id=?").run(f.id)
  f.db.native.prepare("UPDATE agent_conversations SET variableVersionId='variable-config-default' WHERE id=?").run(f.id)
  f.history.recordTurn(f.id, f.id, 1, 'before', state(1))
  f.history.recordTurn(f.id, f.id, 1, 'after', state(2, setting('accepted-task')))
  f.history.recordInput(f.id, f.id, 'session-input-id', state(1))
  f.settings.restoreConversationRuntimeState(f.id, setting('current-task'))
  const archive = new ConversationArchiveRepository(f.db, {
    read: id => f.settings.snapshotConversationRuntimeState(id), restore: (id, raw) => f.settings.restoreConversationRuntimeState(id, raw)
  })
  const snapshot = archive.parse(JSON.parse(JSON.stringify(archive.export(f.id))))
  expect(archive.requiredRuntimeThreadIds(snapshot)).toEqual([f.id])
  const imported = archive.import(snapshot, 'synthetic-card', new Map([[f.id, 'imported-session']]))
  expect(f.history.read(imported, 'imported-session', 1, 'after')).toEqual(state(2, setting('accepted-task')))
  expect(f.history.read(imported, 'imported-session', 1, 'before', 'session-input-id')).toEqual(state(1))
  expect(f.settings.snapshotConversationRuntimeState(imported)).toBe(setting('current-task'))
  expect(f.db.native.prepare('SELECT COUNT(*) AS n FROM agent_responses WHERE conversationId=?').get(imported)).toEqual({ n: 0 })
})

it('rejects an imported variable snapshot whose stored initial state is not valid JSON', () => {
  const f = fixture()
  f.db.native.prepare(`INSERT INTO characters(id,name,avatar,squareImage,coverImage,groupName,orderIndex,groupViewOrder,folder,
    frontendBeautyEnabled,assistantName,assistantAvatar,profileAge,profileSex,profileHeight,profileBirthday,profileLike,
    chatBackground,chatBackgroundOpacity,chatBackgroundBlur,chatBackgroundScrim)
    VALUES ('synthetic-card','Synthetic','','','','',0,0,'',0,'Synthetic','','','','','','','',1,0,0)`).run()
  f.db.native.prepare('INSERT INTO character_openings VALUES (?, ?)').run('synthetic-card', JSON.stringify(createCharacterOpenings('synthetic-card')))
  const configs = new VariableConfigRepository(f.db)
  const current = configs.get('synthetic-card')
  const active = current.versions.find(version => version.id === current.activeVersionId)!
  const broken = { ...current, initialStateJson: '{not json',
    versions: [{ ...active, initialStateJson: '{not json' }] }
  let failure: { code?: string; details?: Record<string, unknown> } | undefined
  try { f.db.withWriteTx(db => configs.restoreInTransaction('synthetic-card', broken, db)) }
  catch (error) { failure = error as typeof failure }
  expect(failure).toMatchObject({
    code: ELECKOI_FAILURE_CODES.dataShapeInvalid,
    details: { what: '变量备份的初始状态', path: 'initialStateJson' }
  })
  expect(f.db.native.prepare('SELECT COUNT(*) AS count FROM variable_configs').get()).toEqual({ count: 0 })
})
