import { CURRENT_SCHEMA_VERSION } from '../src/storage/sqlite/schemaVersion'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { SqliteDatabase } from '../src/storage/sqlite/SqliteDatabase'
import { GlobalSettingLibraryRepository } from '../src/domain/globalSettingLibraries'
import { SettingLibraryRepository, emptyEntry } from '../src/domain/settingLibraries'
import { CharacterRepository } from '../src/domain/personas/CharacterRepository'
import { LocalMediaStore } from '../src/storage/media/LocalMediaStore'
import { globalSettingRuntimeId, type GlobalSettingLibrary } from '@shared/contracts/settingLibrary/global'

const cleanups: Array<() => void> = []
afterEach(() => cleanups.splice(0).reverse().forEach(cleanup => cleanup()))
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'eleckoi-global-settings-'))
  cleanups.push(() => rmSync(directory, { recursive: true, force: true }))
  const db = new SqliteDatabase(join(directory, 'product.sqlite')); db.open(); cleanups.push(() => db.close())
  const characters = new CharacterRepository(db, { deleteForCharacter() {}, refreshCharacterIdentity() {} }, new LocalMediaStore(join(directory, 'media')))
  characters.create({ id: 'synthetic-character', name: '合成角色', persona: {} })
  return { db, globals: new GlobalSettingLibraryRepository(db), roles: new SettingLibraryRepository(db) }
}
function library(id = 'synthetic-global'): GlobalSettingLibrary {
  return { id, name: `合成全局库-${id}`, enabled: true, entries: [{ ...emptyEntry('same-entry'), title: '合成全局设定', content: '合成全局正文' }],
    groups: [], promptPositions: [], listAllExpanded: false, expandedGroupIds: [], createdAt: '', updatedAt: '' }
}

it.each([101, 1001, 10001])('preserves all %i global entries, long content, final keywords, independent libraries and disk reopen', count => {
  const f = fixture(); const probes = new Set([0, Math.floor(count / 2), count - 1]); const source = library()
  source.entries = Array.from({ length: count }, (_, i) => ({ ...emptyEntry(`entry-${i}`), title: `合成设定-${i}`,
    content: `首-${i}|${probes.has(i) ? '合成长正文𠮷'.repeat(32769) : '合成正文'}|尾-${i}`,
    agentReadStrategy: i % 3 === 0 ? 'required' : i % 3 === 1 ? 'keyword' : 'normal', keywords: [`合成关键词-${i}`, '合成共同关键词'] }))
  const role = f.roles.save('synthetic-character', f.roles.get('synthetic-character')); const versionId = role.activeVersionId
  const saved = f.globals.save({ revision: 0, libraries: [source, library('another-global')] })
  const runtime = f.globals.merge({ characterId: role.characterId, name: role.name, entries: [emptyEntry('entry-0')], groups: [], promptPositions: [] })!
  expect(runtime.entries).toHaveLength(count + 2)
  expect(new Set(runtime.entries.map(item => item.id)).size).toBe(count + 2)
  for (const i of probes) {
    const entry = runtime.entries.find(item => item.id === globalSettingRuntimeId(source.id, 'entry', `entry-${i}`))!
    expect(entry.content).toBe(source.entries[i]!.content); expect(entry.keywords).toEqual(source.entries[i]!.keywords)
  }
  expect(f.roles.get(role.characterId).activeVersionId).toBe(versionId)
  expect(f.roles.get(role.characterId).entries).toEqual([])
  const renamed = f.globals.save({ ...saved, libraries: saved.libraries.map(item => item.id === source.id ? { ...item, name: '合成改名共享库' } : item) })
  const renamedLibrary = renamed.libraries.find(item => item.id === source.id)!
  expect(renamedLibrary.name).toBe('合成改名共享库')
  expect(renamedLibrary.entries).toEqual(saved.libraries[0]!.entries)
  expect(renamedLibrary.groups).toEqual(saved.libraries[0]!.groups)
  const renamedRuntime = f.globals.merge({ characterId: role.characterId, name: role.name, entries: [emptyEntry('entry-0')], groups: [], promptPositions: [] })!
  expect(renamedRuntime.entries.map(item => item.id)).toEqual(runtime.entries.map(item => item.id))
  f.roles.save(role.characterId, { ...role, entries: [emptyEntry('role-only')] })
  expect(f.globals.get()).toEqual(renamed)
  f.db.close(); f.db.open(); expect(f.globals.get()).toEqual(renamed)
  expect(f.db.native.pragma('user_version', { simple: true })).toBe(CURRENT_SCHEMA_VERSION)
  expect(f.db.native.pragma('foreign_key_check')).toEqual([])
  expect(f.db.native.pragma('integrity_check', { simple: true })).toBe('ok')
}, 120000)

it('supports simultaneous enable, disable, delete and rejects stale or invalid writes without changing saved resources', () => {
  const f = fixture(); const first = f.globals.save({ revision: 0, libraries: [library(), library('second')] })
  expect(() => f.globals.save({ revision: 0, libraries: [] })).toThrow('其他窗口')
  const disabled = f.globals.save({ ...first, libraries: first.libraries.map(item => ({ ...item, enabled: false })) })
  expect(f.globals.merge(undefined)).toBeUndefined()
  expect(() => f.globals.save({ ...disabled, libraries: [{ ...library(), entries: [{ ...emptyEntry(), kind: 'opening' }] }] })).toThrow()
  expect(() => f.globals.save({ ...disabled, libraries: [{ ...library(), entries: [{ ...emptyEntry(), groupId: 'missing' }] }] })).toThrow('文件夹不存在')
  expect(f.globals.get()).toEqual(disabled)
  expect(f.globals.save({ ...disabled, libraries: [] }).libraries).toEqual([])
  expect(f.roles.get('synthetic-character').entries).toEqual([])
})

it('keeps global runtime data out of conversation overlays and rejects writes to shared entries', () => {
  const f = fixture(); f.globals.save({ revision: 0, libraries: [library()] })
  const role = f.roles.get('synthetic-character')
  const context = f.globals.merge({ characterId: role.characterId, name: role.name, entries: [], groups: [], promptPositions: [] })!
  // A real conversation FK is unnecessary for the rejected path; unchanged globals create no rows.
  f.roles.replaceConversationRuntimeState('synthetic-chat', JSON.stringify(context), { characterId: role.characterId }, { source: context, projected: context })
  expect(f.db.native.prepare('SELECT * FROM conversation_setting_changes').all()).toEqual([])
  const changed = structuredClone(context); changed.entries[0]!.content = '合成不允许的共享修改'
  expect(() => f.roles.replaceConversationRuntimeState('synthetic-chat', JSON.stringify(changed), { characterId: role.characterId }, { source: context, projected: context })).toThrow('全局设定库编辑器')
  expect(f.globals.get().libraries[0]!.entries[0]!.content).toBe('合成全局正文')
})
