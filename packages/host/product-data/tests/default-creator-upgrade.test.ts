import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SqliteDatabase } from '../../../../tests/helpers/SqliteDatabase'
import { AgentPresetRepository } from '../src/domain/agentPresets'
import { DEFAULT_CREATOR_INSTRUCTIONS, DEFAULT_CREATOR_HISTORY_COMPACTION_CONTENT } from '../../../shared/src/contracts/presets/builtIns'

const roots: string[] = [], stores: SqliteDatabase[] = []
afterEach(() => {
  for (const store of stores.splice(0)) store.close()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'eleckoi-default-creator-')); roots.push(root)
  const store = new SqliteDatabase(join(root, 'product.sqlite')); stores.push(store); store.open()
  return { store, repository: new AgentPresetRepository(store) }
}
const expectedTools = ['builtin:workflow', 'builtin:creator', 'builtin:collaboration', 'builtin:plugin-discovery', 'builtin:workspace', 'builtin:web']
function expectCurrentDefault(preset: ReturnType<AgentPresetRepository['get']>) {
  expect(preset.toolGroups.filter(group => group.included && group.enabled).map(group => group.id)).toEqual(expectedTools)
  expect(preset.entries.map(entry => entry.content)).toEqual([DEFAULT_CREATOR_HISTORY_COMPACTION_CONTENT, DEFAULT_CREATOR_INSTRUCTIONS])
  expect(preset.groups).toEqual([])
  expect(preset.promptPositions).toEqual([])
  expect(preset.regexRules).toEqual([])
  expect(preset.profile.usageInstructions).toBe('')
}

describe('one-time default Creator replacement', () => {
  it('replaces the already-upgraded default and every saved version even after the user edited it', () => {
    const { store, repository } = fixture()
    const original = repository.active('creator')
    repository.save({ ...original, name: 'User edited default',
      profile: { ...original.profile, usageInstructions: 'Old default instructions' },
      entries: original.entries.map(entry => ({ ...entry, content: `User edited ${entry.id}` })),
      toolGroups: original.toolGroups.map(group => ({ ...group, included: ['builtin:creator', 'builtin:web'].includes(group.id), enabled: ['builtin:creator', 'builtin:web'].includes(group.id) })),
    })
    repository.save({ ...repository.get(original.id), activeVersionId: 'synthetic-old-version', activeVersionNumber: 2 })
    const group = { id: 'synthetic-old-group', name: 'Old folder', parentId: '', order: 1, treeViewOrder: 1, createdAt: '', updatedAt: '' }
    store.native.prepare('INSERT INTO agent_preset_groups VALUES (?,?,?,?)').run(original.id, group.id, 0, JSON.stringify(group))
    store.native.prepare('INSERT INTO agent_preset_version_groups VALUES (?,?,?,?,?)').run(original.id, original.activeVersionId, group.id, 0, JSON.stringify(group))
    store.native.prepare("INSERT INTO script_libraries VALUES ('preset',?,NULL,?,1,1,?,?)").run(original.id, original.id, JSON.stringify({ version: 1, items: [] }), '{}')
    store.native.prepare("INSERT INTO editor_library_versions VALUES ('scripts','preset',?,NULL,?,1,?)").run(original.id, original.id, '{}')
    store.native.prepare("INSERT INTO editor_library_versions VALUES ('regex','preset',?,NULL,?,1,?)").run(original.id, original.id, '{}')
    store.native.prepare("INSERT INTO regex_libraries VALUES ('preset',?,NULL,?,0)").run(original.id, original.id)
    const custom = repository.create('默认创作预设', '', 'creator')
    repository.save({ ...custom, entries: custom.entries.map(entry => ({ ...entry, content: 'Keep independent custom preset' })) })
    repository.setActive(custom.id)
    const customBefore = repository.export(custom.id, 'json'), roleBefore = repository.export(repository.active('roleplay').id, 'json')
    store.native.prepare("DELETE FROM agent_preset_contents WHERE presetId=? AND kind='builtin_creator_workspace_upgrade'").run(original.id)
    store.close(); store.open()
    const reopened = new AgentPresetRepository(store)
    expectCurrentDefault(reopened.get(original.id))
    expect(reopened.get(original.id).name).toBe('默认创作预设')
    expect(reopened.get(original.id).activeVersionId).toBe('synthetic-old-version')
    const exported = JSON.parse(Buffer.from(reopened.export(original.id, 'json').base64, 'base64').toString('utf8'))
    expect(exported.preset.versions).toHaveLength(2)
    for (const version of exported.preset.versions) {
      expect(version.entries.map((entry: { content: string }) => entry.content)).toEqual([DEFAULT_CREATOR_HISTORY_COMPACTION_CONTENT, DEFAULT_CREATOR_INSTRUCTIONS])
      expect(version.groups).toEqual([])
    }
    for (const table of ['script_libraries', 'editor_library_versions', 'regex_libraries']) {
      expect(store.native.prepare(`SELECT * FROM ${table} WHERE presetId=?`).all(original.id)).toEqual([])
    }
    expect(reopened.export(custom.id, 'json')).toEqual(customBefore)
    expect(reopened.export(reopened.active('roleplay').id, 'json')).toEqual(roleBefore)
    expect(reopened.active('creator').id).toBe(custom.id)
    const changed = reopened.save({ ...reopened.get(original.id), entries: reopened.get(original.id).entries.map(entry => ({ ...entry, content: 'Edited after this upgrade' })) })
    store.close(); store.open()
    expect(new AgentPresetRepository(store).get(original.id)).toEqual(changed)
    expect(store.native.pragma('foreign_key_check')).toEqual([])
    expect(store.native.pragma('integrity_check', { simple: true })).toBe('ok')
  }, 30_000)

  it.each([{ included: [] }, { included: ['builtin:workspace'] }, { included: ['builtin:creator', 'builtin:web'] }])('fully replaces arbitrary old tool selections $included without matching their text', ({ included }) => {
    const { store, repository } = fixture(), original = repository.active('creator')
    repository.save({ ...original, entries: [], toolGroups: original.toolGroups.map(group => ({ ...group, included: included.includes(group.id), enabled: false })) })
    store.native.prepare("DELETE FROM agent_preset_contents WHERE presetId=? AND kind='builtin_creator_workspace_upgrade'").run(original.id)
    expectCurrentDefault(new AgentPresetRepository(store).get(original.id))
  })

  it('rolls back the replacement and completion marker together, then retries successfully', () => {
    const { store, repository } = fixture(), original = repository.active('creator')
    repository.save({ ...original, entries: original.entries.map(entry => ({ ...entry, content: 'Old edited default' })) })
    store.native.prepare("DELETE FROM agent_preset_contents WHERE presetId=? AND kind='builtin_creator_workspace_upgrade'").run(original.id)
    const tables = ['agent_presets', 'agent_preset_contents', 'agent_preset_entries', 'agent_preset_versions', 'agent_preset_version_contents', 'agent_preset_version_entries']
    const snapshot = () => tables.map(table => store.native.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all())
    const before = snapshot()
    store.native.exec(`CREATE TRIGGER synthetic_creator_write_failure BEFORE INSERT ON agent_preset_version_entries
      WHEN NEW.presetId='${original.id}' BEGIN SELECT RAISE(ABORT, 'synthetic replacement write failed'); END`)
    expect(() => new AgentPresetRepository(store).get(original.id)).toThrow('synthetic replacement write failed')
    expect(snapshot()).toEqual(before)
    store.native.exec('DROP TRIGGER synthetic_creator_write_failure')
    expectCurrentDefault(new AgentPresetRepository(store).get(original.id))
  }, 30_000)
})
