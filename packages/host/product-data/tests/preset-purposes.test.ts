import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { SqliteDatabase } from '../../../../tests/helpers/SqliteDatabase'
import { AgentPresetRepository } from '../src/domain/agentPresets'
import { CURRENT_SCHEMA_VERSION } from '../src/storage/sqlite/schemaVersion'
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
