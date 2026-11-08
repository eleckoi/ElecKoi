import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { SqliteDatabase } from '../../../../tests/helpers/SqliteDatabase'
import { AgentPresetRepository } from '../src/domain/agentPresets'
import { CURRENT_SCHEMA_VERSION } from '../src/storage/sqlite/schemaVersion'
import { installSchema } from '../src/storage/sqlite/installSchema'
import { emptyEntry } from '../src/domain/settingLibraries/settingLibraryNormalization'
import { schemaV10Sql } from './helpers/presetSchemaV10'
import { DEFAULT_CREATOR_HISTORY_COMPACTION_CONTENT, HISTORY_COMPACTION_ENTRY_ID } from '../../../shared/src/contracts/presets/builtIns'

const stores: SqliteDatabase[] = []
const directories: string[] = []
afterEach(() => { for (const store of stores.splice(0)) store.close(); for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }) })
function open(path?: string) {
  if (!path) { const directory = mkdtempSync(join(tmpdir(), 'eleckoi-preset-purposes-')); directories.push(directory); path = join(directory, 'test.sqlite3') }
  const store = new SqliteDatabase(path); store.open(); stores.push(store)
  return { store, repository: new AgentPresetRepository(store), path }
}

describe('preset purposes', () => {
  it('upgrades v15 creator prompts and every saved version once while preserving roleplay and directory identities', () => {
    const f = open(), creator = f.repository.active('creator'), role = f.repository.active('roleplay')
    const entries = [
      { ...emptyEntry('synthetic-keyword'), title: 'Synthetic optional', groupId: 'synthetic-group', content: 'Retained optional text', triggerMode: 'agent_tool', agentReadStrategy: 'keyword', keywords: ['synthetic'], conditionKeywords: ['condition'], keywordCondition: 'all', keywordScanDepth: 8 },
      { ...emptyEntry('synthetic-ejs'), title: 'Synthetic template', content: '<% throw new Error("must not run") %>', triggerMode: 'agent_tool', contentMode: 'ejs' },
      { ...emptyEntry('synthetic-reference'), title: 'Synthetic reference', content: 'Retained reference text', dynamicMode: 'ejs_reference', triggerMode: 'agent_tool' },
      { ...emptyEntry('synthetic-required'), title: 'Synthetic required', content: 'Retained required text', triggerMode: 'agent_tool', agentReadStrategy: 'required' },
      { ...emptyEntry('synthetic-standing'), title: 'Synthetic standing', content: 'Retained standing text', triggerMode: 'always', position: 'instructions' },
    ]
    const group = { id: 'synthetic-group', name: 'Synthetic directory', parentId: '', order: 1, treeViewOrder: 2, createdAt: 'synthetic', updatedAt: 'synthetic' }
    f.store.native.prepare('INSERT INTO agent_preset_groups VALUES (?,?,?,?)').run(creator.id, group.id, 0, JSON.stringify(group))
    f.store.native.prepare('INSERT INTO agent_preset_versions VALUES (?,?,?,?,?,?)').run(creator.id, 'synthetic-history', 2, 'Synthetic history', 123, '[]')
    for (const preset of [creator, role]) for (const entry of entries) {
      f.store.native.prepare('INSERT INTO agent_preset_entries VALUES (?,?,?,?)').run(preset.id, entry.id, 9, JSON.stringify(entry))
      for (const versionId of [preset.activeVersionId, ...(preset === creator ? ['synthetic-history'] : [])]) {
        f.store.native.prepare('INSERT INTO agent_preset_version_entries VALUES (?,?,?,?,?)').run(preset.id, versionId, entry.id, 9, JSON.stringify(entry))
      }
    }
    const roleBefore = f.store.native.prepare('SELECT * FROM agent_preset_entries WHERE presetId=?').all(role.id)
    f.store.native.pragma('user_version = 15'); f.store.close()
    const next = open(f.path)
    const current = next.repository.get(creator.id)
    expect(current.groups).toContainEqual(group)
    expect(current.entries.find(entry => entry.id === 'synthetic-keyword')).toMatchObject({ content: entries[0]!.content, enabled: true, agentReadStrategy: 'normal', keywords: [], conditionKeywords: [], keywordScanDepth: 1, groupId: group.id })
    for (const id of ['synthetic-ejs', 'synthetic-reference']) expect(current.entries.find(entry => entry.id === id)).toMatchObject({ content: entries.find(entry => entry.id === id)!.content, enabled: false, contentMode: 'plain_text', dynamicMode: 'standard' })
    expect(current.entries.find(entry => entry.id === 'synthetic-required')).toMatchObject({ enabled: true, agentReadStrategy: 'required' })
    expect(current.entries.find(entry => entry.id === 'synthetic-standing')).toMatchObject({ enabled: true, triggerMode: 'always', position: 'instructions' })
    const snapshots = next.store.native.prepare('SELECT versionId, payloadJson FROM agent_preset_version_entries WHERE presetId=? AND entryId=?').all(creator.id, 'synthetic-ejs') as { versionId: string; payloadJson: string }[]
    expect(snapshots.map(row => row.versionId).sort()).toEqual([creator.activeVersionId, 'synthetic-history'].sort())
    expect(snapshots.every(row => JSON.parse(row.payloadJson).enabled === false && JSON.parse(row.payloadJson).content === entries[1]!.content)).toBe(true)
    expect(next.store.native.prepare('SELECT * FROM agent_preset_entries WHERE presetId=?').all(role.id)).toEqual(roleBefore)
    expect(next.store.native.pragma('user_version', { simple: true })).toBe(16)
    expect(next.store.native.pragma('foreign_key_check')).toEqual([])
    expect(next.store.native.pragma('integrity_check', { simple: true })).toBe('ok')
    const before = next.store.native.prepare('SELECT * FROM agent_preset_entries').all()
    installSchema(next.store.native)
    expect(next.store.native.prepare('SELECT * FROM agent_preset_entries').all()).toEqual(before)
  }, 30_000)

  it('rolls back the whole v15 conversion if a saved creator version is malformed', () => {
    const f = open(), creator = f.repository.active('creator')
    const entry = { ...emptyEntry('synthetic-valid-old'), agentReadStrategy: 'keyword', keywords: ['retained'] }
    f.store.native.prepare('INSERT INTO agent_preset_entries VALUES (?,?,?,?)').run(creator.id, entry.id, 9, JSON.stringify(entry))
    f.store.native.prepare('INSERT INTO agent_preset_version_entries VALUES (?,?,?,?,?)').run(creator.id, creator.activeVersionId, 'synthetic-invalid', 9, '{}')
    f.store.native.pragma('user_version = 15')
    const before = f.store.native.prepare('SELECT * FROM agent_preset_entries').all()
    expect(() => installSchema(f.store.native)).toThrow()
    expect(f.store.native.pragma('user_version', { simple: true })).toBe(15)
    expect(f.store.native.prepare('SELECT * FROM agent_preset_entries').all()).toEqual(before)
  }, 30_000)

  it('converts old creator file versions, rejects unsupported current saves/imports, and preserves roleplay EJS', () => {
    const { repository } = open(), creator = repository.active('creator')
    const entry = creator.entries.find(entry => entry.kind === 'normal')!
    expect(() => repository.save({ ...creator, entries: creator.entries.map(item => item.id === entry.id ? { ...item, agentReadStrategy: 'keyword' } : item) })).toThrow()
    expect(() => repository.updateEntries(creator.id, [{ id: entry.id, changes: { contentMode: 'ejs' } }])).toThrow()
    expect(repository.get(creator.id)).toEqual(creator)
    const portable = JSON.parse(Buffer.from(repository.export(creator.id, 'json').base64, 'base64').toString('utf8'))
    const ejs = { ...portable.preset.entries.find((item: any) => item.kind === 'normal'), content: '<%= synthetic %>', content_mode: 'ejs', trigger_mode: 'agent_tool' }
    const keyword = { ...ejs, id: 'synthetic-optional-import', content: 'Retained optional', content_mode: 'plain_text', agent_read_strategy: 'keyword', keywords: ['synthetic'] }
    portable.preset.entries = [ejs, keyword]
    for (const version of portable.preset.versions) version.entries = [ejs, keyword]
    const document = () => ({ displayName: 'synthetic-preset.json', mimeType: 'application/json', base64: Buffer.from(JSON.stringify(portable)).toString('base64') })
    expect(portable.version).toBe(3)
    expect(() => repository.import(document(), 'eleckoi', 'creator')).toThrow()
    portable.version = 2
    const imported = repository.import(document(), 'eleckoi', 'creator').preset
    expect(imported.entries.find(item => item.id === ejs.id)).toMatchObject({ enabled: false, content: ejs.content, contentMode: 'plain_text' })
    expect(imported.entries.find(item => item.id === keyword.id)).toMatchObject({ enabled: true, agentReadStrategy: 'normal', keywords: [] })
    const roundtrip = JSON.parse(Buffer.from(repository.export(imported.id, 'json').base64, 'base64').toString('utf8'))
    expect(roundtrip.preset.versions.every((version: any) => version.entries.find((item: any) => item.id === ejs.id).enabled === false)).toBe(true)
    portable.preset.purpose = 'roleplay'
    expect(repository.import(document(), 'eleckoi', 'roleplay').preset.entries.find(item => item.id === ejs.id)).toMatchObject({ enabled: true, contentMode: 'ejs', content: ejs.content })
  })
  // 这条用例真的开两次 SQLite、跑完整迁移链（v13 → 当前版本）再逐表校验完整性。
  // 本地 0.4s，Windows CI 的慢盘会在默认 5s 上偶发超时——给足时间，断言不动。
  it('upgrades the original default Creator capabilities from v13 while retaining custom presets and global selection', () => {
    const f = open(), seeded = f.repository.active('creator')
    const custom = f.repository.create('Synthetic custom creation', '', 'creator')
    f.repository.save({ ...custom, entries: custom.entries.map(entry => entry.kind === 'normal' ? { ...entry, content: 'Synthetic retained author instructions' } : entry) })
    f.repository.setActive(custom.id)
    for (const table of ['agent_preset_contents', 'agent_preset_version_contents']) {
      const rows = f.store.native.prepare(`SELECT rowid, content FROM ${table} WHERE presetId = ? AND kind = 'tool_configuration'`).all(seeded.id) as { rowid: number; content: string }[]
      for (const row of rows) {
        const value = JSON.parse(row.content)
        value.includedGroupIds = ['builtin:creator']; value.enabledGroupIds = ['builtin:creator']
        f.store.native.prepare(`UPDATE ${table} SET content = ? WHERE rowid = ?`).run(JSON.stringify(value), row.rowid)
      }
    }
    const before = f.repository.get(custom.id)
    f.store.native.pragma('user_version = 13'); f.store.close()
    const next = open(f.path)
    expect(next.repository.active('creator')).toEqual(before)
    expect(next.repository.get(seeded.id).toolGroups.filter(group => group.included && group.enabled).map(group => group.id)).toContain('builtin:workspace')
    expect(next.store.native.pragma('user_version', { simple: true })).toBe(CURRENT_SCHEMA_VERSION)
    expect(next.store.native.pragma('foreign_key_check')).toEqual([])
    expect(next.store.native.pragma('integrity_check', { simple: true })).toBe('ok')
  }, 30000)
  it('keeps defaults, groups and global selections independent', () => {
    const { repository } = open()
    const original = repository.active()
    const creator = repository.active('creator')
    expect(creator.purpose).toBe('creator')
    expect(creator.entries.map(item => item.kind)).toEqual(['history_compaction', 'normal'])
    expect(creator.entries[0]).toMatchObject({ content: DEFAULT_CREATOR_HISTORY_COMPACTION_CONTENT, enabled: true, triggerMode: null, position: null })
    expect(creator.toolGroups.filter(item => item.included || item.enabled).map(item => item.id)).toEqual(['builtin:workflow', 'builtin:creator', 'builtin:collaboration', 'builtin:plugin-discovery', 'builtin:workspace', 'builtin:web'])
    const roleGroup = repository.createGroup('合成分组').groups.find(item => item.purpose === 'roleplay')!
    const creationGroup = repository.createGroup('合成分组', 'creator').groups.find(item => item.purpose === 'creator')!
    expect(creationGroup.name).toBe(roleGroup.name)
    const role = repository.create('合成预设', roleGroup.id)
    const creation = repository.create('合成预设', creationGroup.id, 'creator')
    expect(creation.name).toBe(role.name)
    repository.setActive(creation.id)
    expect(repository.active().id).toBe(original.id)
    repository.setActive(role.id)
    expect(repository.active('creator').id).toBe(creation.id)
    expect(() => repository.assignGroup(role.id, creationGroup.id)).toThrow('用途不一致')
    expect(() => repository.create('失败预设', roleGroup.id, 'creator')).toThrow('用途不一致')
    repository.deleteGroup(creationGroup.id)
    expect(repository.get(creation.id).libraryGroupId).toBe('')
    expect(repository.get(role.id).libraryGroupId).toBe(roleGroup.id)
    repository.delete(creation.id)
    expect(repository.active('creator').id).toBe(creator.id)
    expect(repository.active().id).toBe(role.id)
    expect(() => repository.delete(creator.id)).toThrow('不能删除')
  })

  it('round-trips creation prompts without adding roleplay protocol entries', () => {
    const { repository } = open()
    const original = repository.active('creator')
    const exported = repository.export(original.id, 'json')
    const document = { displayName: exported.fileName, mimeType: exported.mimeType, base64: exported.base64 }
    const imported = repository.import(document, 'eleckoi', 'creator').preset
    expect(imported.purpose).toBe('creator')
    expect(imported.entries.map(item => item.content)).toEqual(original.entries.map(item => item.content))
    expect(imported.entries.some(item => item.kind === 'hidden_tool_timeline')).toBe(false)
    expect(() => repository.import(document, 'eleckoi', 'roleplay')).toThrow('用途与当前分类不同')
  })

  it('fills the missing creator template in existing presets and saved versions while preserving edits', () => {
    const { repository, store } = open()
    const original = repository.active('creator')
    const custom = repository.create('Synthetic custom creator', '', 'creator')
    repository.save({ ...custom, entries: custom.entries.map(entry => entry.kind === 'history_compaction'
      ? { ...entry, content: 'Synthetic custom summary.', enabled: false } : entry) })
    store.native.prepare('DELETE FROM agent_preset_entries WHERE presetId = ? AND entryId = ?').run(original.id, HISTORY_COMPACTION_ENTRY_ID)
    store.native.prepare('DELETE FROM agent_preset_version_entries WHERE presetId = ? AND entryId = ?').run(original.id, HISTORY_COMPACTION_ENTRY_ID)
    store.close(); store.open()
    const reopened = new AgentPresetRepository(store)
    const restored = reopened.get(original.id)
    expect(restored.entries.find(entry => entry.kind === 'history_compaction')?.content).toBe(DEFAULT_CREATOR_HISTORY_COMPACTION_CONTENT)
    expect(restored.entries.find(entry => entry.kind === 'normal')).toEqual(original.entries.find(entry => entry.kind === 'normal'))
    const version = store.native.prepare('SELECT payloadJson FROM agent_preset_version_entries WHERE presetId = ? AND versionId = ? AND entryId = ?')
      .get(original.id, original.activeVersionId, HISTORY_COMPACTION_ENTRY_ID) as { payloadJson: string }
    expect(JSON.parse(version.payloadJson).content).toBe(DEFAULT_CREATOR_HISTORY_COMPACTION_CONTENT)
    expect(reopened.get(custom.id).entries.find(entry => entry.kind === 'history_compaction')).toMatchObject({ content: 'Synthetic custom summary.', enabled: false })
    expect(store.native.pragma('user_version', { simple: true })).toBe(CURRENT_SCHEMA_VERSION)
    expect(store.native.pragma('foreign_key_check')).toEqual([])
    expect(store.native.pragma('integrity_check', { simple: true })).toBe('ok')
  }, 30_000)

  it('migrates the v10 global selection and preset relationships without changing identities', () => {
    const directory = mkdtempSync(join(tmpdir(), 'eleckoi-preset-migration-')); directories.push(directory)
    const path = join(directory, 'test.sqlite3')
    const old = new Database(path)
    old.exec(schemaV10Sql)
    old.prepare('INSERT INTO agent_preset_library_groups VALUES (?, ?, ?)').run('synthetic-group', '合成分组', 0)
    old.prepare('INSERT INTO agent_presets (id,name,modelFamily,libraryGroupId,sortIndex,expandedGroupIdsJson) VALUES (?,?,?,?,?,?)').run('synthetic-preset', '合成预设', 'general', 'synthetic-group', 0, '[]')
    old.prepare('INSERT INTO agent_preset_state VALUES (?,?)').run(1, 'synthetic-preset')
    const content = JSON.stringify({ version: 5, includedGroupIds: [], enabledGroupIds: [], roleplayPlan: { steps: ['输出正文'] } })
    old.prepare('INSERT INTO agent_preset_contents VALUES (?,?,?)').run('synthetic-preset', 'tool_configuration', content)
    old.close()
    const { store, repository } = open(path)
    expect(store.native.pragma('user_version', { simple: true })).toBe(CURRENT_SCHEMA_VERSION)
    expect(repository.active().id).toBe('synthetic-preset')
    expect(repository.get('synthetic-preset').libraryGroupId).toBe('synthetic-group')
    expect(repository.catalog().groups).toContainEqual({ id: 'synthetic-group', name: '合成分组', sortIndex: 0, purpose: 'roleplay' })
    expect(store.native.pragma('foreign_key_check')).toEqual([])
    expect(store.native.pragma('integrity_check', { simple: true })).toBe('ok')
    store.close(); store.open()
    expect(new AgentPresetRepository(store).active().id).toBe('synthetic-preset')
  }, 30_000)
})
