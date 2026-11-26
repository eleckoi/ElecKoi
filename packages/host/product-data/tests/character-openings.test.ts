import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, expect, it } from 'vitest'
import { SqliteDatabase } from '../../../../tests/helpers/SqliteDatabase'
import { CharacterRepository } from '../src/domain/personas/CharacterRepository'
import { LocalMediaStore } from '../src/storage/media/LocalMediaStore'
import { CharacterOpeningRepository } from '../src/domain/characterOpenings'
import { SettingLibraryRepository } from '../src/domain/settingLibraries/SettingLibraryRepository'
import { emptyEntry } from '../src/domain/settingLibraries/settingLibraryNormalization'
import { VariableConfigRepository } from '../src/domain/variables/VariableConfigRepository'
import { resolveConversationSeed } from '../src/domain/conversations/conversationSeed'
import { ConversationRepository } from '../src/domain/conversations/ConversationRepository'
import { MessageRepository } from '../src/domain/conversations/MessageRepository'
import { legacyOpeningSchemaSql } from './helpers/legacyOpeningStorage'
import { restoreEditorSchemaV12 } from './helpers/editorSchemaV12'
import { CURRENT_SCHEMA_VERSION, installSchema } from '../src/storage/sqlite/installSchema'

const cleanups: Array<() => void> = []
afterEach(() => cleanups.splice(0).reverse().forEach(cleanup => cleanup()))
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'eleckoi-openings-'))
  cleanups.push(() => rmSync(directory, { recursive: true, force: true }))
  const db = new SqliteDatabase(join(directory, 'product.sqlite')); db.open(); cleanups.push(() => db.close())
  const characters = new CharacterRepository(db, { deleteForCharacter() {}, refreshCharacterIdentity() {} }, new LocalMediaStore(join(directory, 'media')))
  characters.create({ id: 'synthetic-character', name: '合成角色', persona: { opening: '合成初始开场' } })
  return { db, characters, openings: new CharacterOpeningRepository(db), settings: new SettingLibraryRepository(db), variables: new VariableConfigRepository(db) }
}

it('keeps openings independent through setting version changes, deletion, variable validation and disk reopen', () => {
  const f = fixture(), characterId = 'synthetic-character'
  const original = f.openings.get(characterId)
  const content = '合成长开场正文。'.repeat(20_001)
  const messages = [{ ...original.openingMessages[0]!, content, variableVersionId: f.variables.get(characterId).activeVersionId },
    { id: 'synthetic-backup', title: '合成备用开场', content: '合成备用正文' }]
  const saved = f.openings.save(characterId, { ...original, openingMessages: messages })
  const library = f.settings.get(characterId)
  expect(library.entries).toEqual([])
  const version = { ...library.versions[0]!, id: 'synthetic-setting-version', name: '合成设定版本', entries: [emptyEntry('synthetic-setting')] }
  f.settings.save(characterId, { ...library, ...version, activeVersionId: version.id, versions: [version] })
  expect(f.openings.get(characterId)).toEqual(saved)
  expect(resolveConversationSeed(characterId, f.db.db, f.openings, f.variables)).toMatchObject({ openingText: content, selectedOpeningId: messages[0]!.id,
    openingOptions: [{ content, variableVersionId: f.variables.get(characterId).activeVersionId }, { id: 'synthetic-backup', variableVersionId: '', initialVariableStateJson: '{}' }] })
  expect(Object.keys(saved).sort()).toEqual(['characterId', 'defaultOpeningMessageId', 'enabled', 'openingMessages'])
  expect(f.settings.get(characterId).activeVersionId).toBe(version.id)
  f.settings.save(characterId, { ...f.settings.get(characterId), entries: [] })
  f.db.close(); f.db.open()
  expect(f.openings.get(characterId).openingMessages).toEqual(messages)
  expect(f.settings.get(characterId).entries).toEqual([])
  const before = f.openings.get(characterId)
  const missing = f.openings.save(characterId, { ...before, openingMessages: [{ ...messages[0]!, variableVersionId: 'missing-variable-version' }] })
  expect(f.openings.get(characterId)).toEqual(missing)
  expect(resolveConversationSeed(characterId, f.db.db, f.openings, f.variables)).toMatchObject({
    variableVersionId: 'missing-variable-version', initialVariableStateJson: '{}', openingText: content,
  })
  f.characters.delete([characterId])
  expect(f.db.native.prepare('SELECT * FROM character_openings').all()).toEqual([])
}, 30_000)

it('leaves a single blank opening silent and uses filled content without the former enable gate', () => {
  const f = fixture(), characterId = 'synthetic-character';
  const repository = new ConversationRepository(f.db, (id, db) => resolveConversationSeed(id, db, f.openings, f.variables));
  const original = f.openings.get(characterId), primary = original.openingMessages[0]!;
  f.openings.save(characterId, { ...original, enabled: true, openingMessages: [{ ...primary, content: ' \n\t ' }] });
  const blank = repository.create({ metadata: { characterId } }).conversation.id;
  expect(repository.openingText(blank)).toBe('');
  const emptyTurns = f.db.native.prepare('SELECT * FROM agent_turns WHERE conversationId = ?').all(blank);
  expect(emptyTurns).toEqual([]);
  f.openings.save(characterId, { ...original, enabled: false, openingMessages: [{ ...primary, content: '合成开场正文' }] });
  const filled = repository.create({ metadata: { characterId } }).conversation.id;
  expect(repository.openingText(filled)).toBe('合成开场正文');
  expect(repository.openingText(blank)).toBe('');
}, 30_000)

it('keeps blank alternatives selectable, including a blank primary, after switching and disk reopen', () => {
  const f = fixture(), characterId = 'synthetic-character'
  const repository = new ConversationRepository(f.db, (id, db) => resolveConversationSeed(id, db, f.openings, f.variables))
  const messages = new MessageRepository(f.db)
  const original = f.openings.get(characterId), primary = original.openingMessages[0]!
  const variableVersionId = f.variables.get(characterId).activeVersionId
  const options = [{ ...primary, content: '合成正文' }, { id: 'blank', title: '空白开场', content: '', variableVersionId },
    { id: 'whitespace', title: '空白字符开场', content: ' \n\t ' }]
  f.openings.save(characterId, { ...original, openingMessages: options })
  const filledId = repository.create({ metadata: { characterId } }).conversation.id
  const read = (id: string) => messages.pageMetadata(id).messages[0]!
  expect(read(filledId).openingOptions?.map(option => option.id)).toEqual(options.map(option => option.id))
  repository.selectOpening(filledId, 'blank')
  expect(read(filledId)).toMatchObject({ id: 'opening', content: '', selectedOpeningId: 'blank' })
  expect(f.db.native.prepare('SELECT variableVersionId FROM agent_conversations WHERE id=?').get(filledId)).toEqual({ variableVersionId })
  f.openings.save(characterId, { ...original, defaultOpeningMessageId: 'blank', openingMessages: [options[1]!, options[0]!, options[2]!] })
  const blankId = repository.create({ metadata: { characterId } }).conversation.id
  expect(read(blankId)).toMatchObject({ id: 'opening', content: '', selectedOpeningId: 'blank' })
  f.db.close(); f.db.open()
  expect(read(filledId)).toMatchObject({ content: '', selectedOpeningId: 'blank' })
  expect(read(blankId).openingOptions).toHaveLength(3)
  repository.selectOpening(blankId, primary.id)
  expect(read(blankId)).toMatchObject({ content: '合成正文', selectedOpeningId: primary.id })
  repository.selectOpening(blankId, 'whitespace')
  expect(read(blankId)).toMatchObject({ content: ' \n\t ', selectedOpeningId: 'whitespace' })
  repository.selectOpening(blankId, 'blank')
  expect(read(blankId)).toMatchObject({ content: '', selectedOpeningId: 'blank' })
}, 30_000)

it('starts new chats with ordered opening speakers and preserves the snapshot across roster changes', () => {
  const f = fixture(), characterId = 'synthetic-character'
  const repository = new ConversationRepository(f.db, (id, db) => resolveConversationSeed(id, db, f.openings, f.variables))
  const messages = new MessageRepository(f.db)
  const original = f.openings.get(characterId)
  const cast = ['一号', '二号'].map((name, index) => ({ id: `speaker-${index}`, name,
    portraitAssetId: null, circleAssetId: null, squareAssetId: null, crop: null }))
  f.characters.update({ id: characterId, cast })
  const old = repository.create({ metadata: { characterId } }).conversation.id
  const longText = `录音机开始转动。\n\n${'第一段对白。\n\n第二段对白。'.repeat(100)}`
  const scene = f.openings.save(characterId, { ...original, openingMessages: [
    { ...original.openingMessages[0]!, segments: [
      { id: 'cover', kind: 'cover', text: '封面正文' },
      { id: 'first', kind: 'speech', speakerId: cast[0]!.id, text: longText },
      { id: 'second', kind: 'speech', speakerId: cast[1]!.id, text: '二号发言' },
    ] },
    { id: 'plain', title: '长篇开场', content: '原样长文' },
  ] })
  const created = repository.create({ metadata: { characterId } }).conversation.id
  const read = (id: string) => messages.pageMetadata(id).messages[0]!
  const initial = read(created)
  expect(initial.content).toBe(scene.openingMessages[0]!.content)
  expect(initial.openingOptions?.[0]?.segments?.map(segment => segment.speakerName)).toEqual(['合成角色', '一号', '二号'])
  expect(repository.openingText(created)).toContain(`一号：${longText}`)
  expect(() => repository.updateOpening(created, '把所有段落改成一段')).toThrow('这条开场白有多个段落')
  expect(read(created).openingOptions).toEqual(initial.openingOptions)
  expect(read(old).openingOptions?.[0]?.segments).toBeUndefined()
  expect(read(old).content).toBe('合成初始开场')
  repository.selectOpening(created, 'plain')
  expect(read(created).content).toBe('原样长文')
  repository.selectOpening(created, original.defaultOpeningMessageId)
  f.characters.update({ id: characterId, cast: [{ ...cast[0]!, name: '一号新名字' }] })
  expect(read(created).openingOptions).toEqual(initial.openingOptions)
  const next = repository.create({ metadata: { characterId } }).conversation.id
  expect(read(next).openingOptions?.[0]?.segments?.map(segment => segment.speakerName))
    .toEqual(['合成角色', '一号新名字', undefined])
  repository.restoreImportedOpening(next, { content: initial.content, options: initial.openingOptions!,
    selectedId: initial.selectedOpeningId! })
  expect(read(next).openingOptions).toEqual(initial.openingOptions)
  expect(repository.openingText(next)).toContain(`一号：${longText}`)
}, 30_000)

it('collects every legacy opening into one list and retains all settings and the default opening', () => {
  const f = fixture(); f.db.close()
  const database = new Database(':memory:'); cleanups.push(() => database.close()); database.exec(legacyOpeningSchemaSql); restoreEditorSchemaV12(database)
  database.prepare(`INSERT INTO characters VALUES (${Array.from({ length: 22 }, () => '?').join(',')})`).run(
    'synthetic-character', '合成旧角色', '', '', '', '', 0, 0, '', 0, '合成旧角色', '', '', '', '', '', '', 1, '', 1, 0, 0)
  database.prepare('INSERT INTO setting_libraries VALUES (?, ?, ?, 1, ?, ?, ?)').run('synthetic-character', '合成版本乙', 'version-b', '[]', '[]', '')
  for (const [index, id] of ['version-a', 'version-b'].entries()) {
    database.prepare('INSERT INTO setting_library_versions VALUES (?,?,?, ?,1,?,?,?,?)').run('synthetic-character', id, index, `合成版本${index}`, '[]', '[]', '', '')
    const opening = { id: 'fixed-opening-assistant', kind: 'opening', enabled: index === 1, content: `合成开场${index}`,
      opening_messages: [{ id: `opening-${index}`, title: '合成主开场', content: `合成开场${index}`, variable_version_id: 'synthetic-variable', initial_variable_state: '{"score":7}' },
        { id: `backup-${index}`, title: '合成备用开场', content: '合成备用正文', initial_variable_state: '' }], default_opening_message_id: `opening-${index}` }
    database.prepare('INSERT INTO setting_entry_contents VALUES (?,?,?,?)').run('synthetic-character', opening.id, id, JSON.stringify(opening))
    database.prepare('INSERT INTO setting_library_version_entry_links VALUES (?,?,?,?,?)').run('synthetic-character', id, opening.id, 0, id)
  }
  database.prepare('INSERT INTO setting_library_entry_links VALUES (?,?,0,?)').run('synthetic-character', 'fixed-opening-assistant', 'version-b')
  const rollback = new Database(database.serialize()); cleanups.push(() => rollback.close())
  rollback.prepare("UPDATE setting_entry_contents SET payloadJson=json_set(payloadJson, '$.default_opening_message_id', 'missing') WHERE revisionId='version-b'").run()
  expect(() => installSchema(rollback)).toThrow('主开场白编号必须存在')
  expect(rollback.pragma('user_version', { simple: true })).toBe(12)
  expect(rollback.prepare("SELECT 1 FROM sqlite_master WHERE name='character_openings'").get()).toBeUndefined()
  expect(rollback.prepare('SELECT * FROM setting_entry_contents').all()).toHaveLength(2)
  const divergent = new Database(database.serialize()); cleanups.push(() => divergent.close())
  const currentOpening = JSON.parse((divergent.prepare("SELECT payloadJson FROM setting_entry_contents WHERE revisionId='version-b'").get() as { payloadJson: string }).payloadJson)
  currentOpening.opening_messages[0].content = '合成已保存的当前正文'
  divergent.prepare('INSERT INTO setting_entry_contents VALUES (?,?,?,?)').run('synthetic-character', currentOpening.id, 'live-revision', JSON.stringify(currentOpening))
  divergent.prepare("UPDATE setting_library_entry_links SET revisionId='live-revision'").run()
  installSchema(divergent)
  const separated = JSON.parse((divergent.prepare('SELECT configurationJson FROM character_openings').get() as { configurationJson: string }).configurationJson)
  expect(separated.openingMessages[0].content).toBe('合成已保存的当前正文')
  expect(separated.openingMessages).toHaveLength(5)
  expect(separated.openingMessages.filter((message: any) => message.content === '合成开场1')).toHaveLength(1)
  expect(new Set(separated.openingMessages.map((message: any) => message.id)).size).toBe(5)
  installSchema(database)
  expect(database.pragma('user_version', { simple: true })).toBe(CURRENT_SCHEMA_VERSION)
  const value = JSON.parse((database.prepare('SELECT configurationJson FROM character_openings').get() as { configurationJson: string }).configurationJson)
  expect(value.defaultOpeningMessageId).toBe('opening-1')
  expect(value.openingMessages[0]).toMatchObject({ id: 'opening-1', content: '合成开场1', variableVersionId: 'synthetic-variable' })
  expect(value.openingMessages.map((message: any) => message.id)).toEqual(['opening-1', 'backup-1', 'opening-0', 'backup-0'])
  expect(Object.hasOwn(value, 'versions')).toBe(false)
  expect(database.prepare('SELECT * FROM setting_entry_contents').all()).toEqual([])
  expect(database.prepare('SELECT * FROM setting_library_versions').all()).toHaveLength(2)
  expect(database.pragma('foreign_key_check')).toEqual([])
  expect(database.pragma('integrity_check', { simple: true })).toBe('ok')
}, 30_000)
