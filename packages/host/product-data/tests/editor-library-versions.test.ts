import { CURRENT_SCHEMA_VERSION } from '../src/storage/sqlite/schemaVersion'
import { restoreEditorSchemaV12 } from './helpers/editorSchemaV12'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative } from 'node:path'
import Database from 'better-sqlite3'
import { restoreLegacyConversationStorage } from './helpers/conversationStorageV11'
import { afterEach, describe, expect, it } from 'vitest'
import { SqliteDatabase } from '../src/storage/sqlite/SqliteDatabase'
import { createScriptLibraryRepository } from './helpers/scriptLibraryOwners'
import { RegexRuleRepository } from '../src/domain/regexRules'
import { AgentPresetRepository, agentPresetExists } from '../src/domain/agentPresets'
import { EditorLibraryVersionRepository, EditorLibraryVersionsService } from '../src/domain/editorVersions'
import type { EditorLibraryVersions } from '../../../shared/src/contracts/editorVersions/schemas'

const fixtures: Array<{ directory: string; database: SqliteDatabase }> = []
afterEach(() => { for (const { directory, database } of fixtures.splice(0)) {
  database.close(); const path = relative(tmpdir(), directory)
  if (!path || path.startsWith('..') || isAbsolute(path)) throw new Error('Unexpected fixture path')
  rmSync(directory, { recursive: true, force: true })
} })
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'eleckoi-editor-versions-')), database = new SqliteDatabase(join(directory, 'product.sqlite'))
  database.open(); fixtures.push({ directory, database })
  const scripts = createScriptLibraryRepository(database), presets = new AgentPresetRepository(database, undefined, scripts)
  presets.ensureInitialized()
  const regex = new RegexRuleRepository(database, presets), archiveRoot = join(directory, 'versions')
  const make = () => new EditorLibraryVersionsService(new EditorLibraryVersionRepository(database, archiveRoot, address => {
    if (address.scope !== 'global' && !agentPresetExists(database.db, address.ownerId)) throw new Error('Synthetic owner missing')
  }), scripts, regex)
  return { directory, database, scripts, regex, archiveRoot, service: make(), make }
}
const script = (content: string) => ({ type: 'script' as const, id: 'synthetic-script', name: 'Synthetic script', content, enabled: false,
  info: '', data: {}, button: { enabled: false, buttons: [] }, export_with: { data: true, button: true } })
function setContent(state: EditorLibraryVersions, content: object) {
  return { ...state, versions: state.versions.map(version => version.id === state.activeVersionId ? { ...version, content: JSON.stringify(content) } : version) }
}
describe('complete editor configuration versions', () => {
  it('adds scope switches to the existing unreleased v12 without changing rule states or version identities', () => {
    const f = fixture(), address = { kind: 'regex' as const, scope: 'global' as const, ownerId: '' }
    const rules = [{ id: 'synthetic-regex', name: 'Synthetic disabled rule', pattern: 'x', replacement: 'y', enabled: false,
      targets: ['AiOutput' as const], displayOnly: true, promptOnly: false, runOnEdit: false, order: 0 }]
    const presetId = (f.database.native.prepare("SELECT activePresetId FROM agent_preset_state WHERE purpose='roleplay'").get() as { activePresetId: string }).activePresetId
    const state = setContent(f.service.read(address), { enabled: true, rules })
    f.service.save({ kind: 'regex', documents: [JSON.stringify({ ...f.regex.readEditor({ scope: 'preset', ownerId: presetId }), globalRules: rules })], versions: [state] })
    const stored = f.database.native.prepare("SELECT stateJson FROM editor_library_versions WHERE kind='regex'").get() as { stateJson: string }
    const oldState = JSON.parse(stored.stateJson)
    oldState.versions[0].content = JSON.stringify({ rules })
    f.database.native.prepare("UPDATE editor_library_versions SET stateJson=? WHERE kind='regex'").run(JSON.stringify(oldState))
    const beforePresets = f.database.native.prepare('SELECT * FROM agent_presets').all()
    const beforeRules = f.database.native.prepare('SELECT * FROM global_regex_rules').all()
    restoreEditorSchemaV12(f.database.native)
    f.database.native.exec('DROP TABLE regex_libraries')
    f.database.close()
    for (let attempt = 0; attempt < 2; attempt++) {
      f.database.open(); f.service = f.make()
      expect(f.database.native.pragma('user_version', { simple: true })).toBe(CURRENT_SCHEMA_VERSION)
      expect(f.database.native.prepare('SELECT * FROM agent_presets').all()).toEqual(beforePresets)
      expect(f.database.native.prepare('SELECT * FROM global_regex_rules').all()).toEqual(beforeRules)
      expect(f.database.native.prepare('SELECT * FROM regex_libraries').all()).toEqual([])
      const restored = f.database.native.prepare("SELECT stateJson FROM editor_library_versions WHERE kind='regex'").get() as { stateJson: string }
      expect(JSON.parse(restored.stateJson)).toEqual({ ...oldState, versions: oldState.versions.map((version: { content: string }) =>
        ({ ...version, content: JSON.stringify({ enabled: true, rules }) })) })
      expect(f.database.native.pragma('foreign_key_check')).toEqual([])
      expect(f.database.native.pragma('integrity_check', { simple: true })).toBe('ok')
      f.database.close()
    }
  }, 30_000)

  it('rolls back the same-v12 schema change when an existing regex version has invalid enablement', () => {
    const f = fixture(), state = f.service.read({ kind: 'regex', scope: 'global', ownerId: '' })
    const presetId = (f.database.native.prepare("SELECT activePresetId FROM agent_preset_state WHERE purpose='roleplay'").get() as { activePresetId: string }).activePresetId
    f.service.save({ kind: 'regex', documents: [JSON.stringify(f.regex.readEditor({ scope: 'preset', ownerId: presetId }))], versions: [state] })
    const stored = f.database.native.prepare("SELECT stateJson FROM editor_library_versions WHERE kind='regex'").get() as { stateJson: string }
    const invalid = JSON.parse(stored.stateJson)
    invalid.versions[0].content = JSON.stringify({ enabled: 'invalid', rules: [] })
    const invalidJson = JSON.stringify(invalid)
    f.database.native.prepare("UPDATE editor_library_versions SET stateJson=? WHERE kind='regex'").run(invalidJson)
    restoreEditorSchemaV12(f.database.native)
    f.database.native.exec('DROP TABLE regex_libraries'); f.database.close()
    expect(() => f.database.open()).toThrow('正则版本整体启停无效')
    const native = new Database(join(f.directory, 'product.sqlite'))
    try {
      expect(native.pragma('user_version', { simple: true })).toBe(12)
      expect(native.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='regex_libraries'").get()).toBeUndefined()
      expect(native.prepare("SELECT stateJson FROM editor_library_versions WHERE kind='regex'").get()).toEqual({ stateJson: invalidJson })
      expect(native.pragma('integrity_check', { simple: true })).toBe('ok')
    } finally { native.close() }
  }, 30_000)

  it('restores regex scope enablement together with individual rules in named versions across restart', () => {
    const f = fixture(), ownerId = f.database.native.prepare("SELECT activePresetId FROM agent_preset_state WHERE purpose='roleplay'").get() as { activePresetId: string }
    const target = { scope: 'preset' as const, ownerId: ownerId.activePresetId }, address = { kind: 'regex' as const, ...target }
    const collection = f.regex.readEditor(target)
    const item = { id: 'synthetic-regex', name: 'Synthetic', pattern: 'x', replacement: 'y', enabled: true,
      targets: ['AiOutput'] as const, displayOnly: true, promptOnly: false, runOnEdit: false, order: 0 }
    const rules = [{ ...item, targets: [...item.targets] }]
    const state = setContent(f.service.read(address), { enabled: false, rules })
    f.service.save({ kind: 'regex', documents: [JSON.stringify({ ...collection, agentPresetRules: rules, agentPresetEnabled: false })], versions: [state] })
    expect(f.regex.readEditor(target).agentPresetEnabled).toBe(false)
    expect(f.regex.readEditor(target).agentPresetRules[0]?.enabled).toBe(true)
    f.database.close(); f.database.open(); f.service = f.make()
    const restored = f.service.read(address)
    expect(JSON.parse(restored.versions.find(version => version.id === restored.activeVersionId)!.content)).toEqual({ enabled: false, rules })
    const enabled = setContent(restored, { enabled: true, rules })
    f.service.save({ kind: 'regex', documents: [JSON.stringify({ ...f.regex.readEditor(target), agentPresetEnabled: true })], versions: [enabled] })
    expect(f.regex.readEditor(target).agentPresetEnabled).toBe(true)
  }, 30_000)
  it('upgrades v11 to the current regex and script version storage and survives a disk reopen', () => {
    const f = fixture(); f.database.close()
    const legacy = new Database(join(f.directory, 'product.sqlite'))
    restoreLegacyConversationStorage(legacy)
    legacy.exec('DROP TABLE editor_library_versions; DROP TABLE IF EXISTS display_template_libraries')
    legacy.pragma('user_version=11'); const before = legacy.prepare('SELECT * FROM agent_presets').all(); legacy.close()
    for (let index = 0; index < 2; index++) {
      f.database.open()
      expect(f.database.native.pragma('user_version', { simple: true })).toBe(CURRENT_SCHEMA_VERSION)
      expect(f.database.native.prepare('SELECT * FROM agent_presets').all()).toEqual(before)
      expect(f.database.native.prepare("SELECT 1 FROM sqlite_master WHERE name='display_template_libraries'").get()).toBeUndefined()
      expect(f.database.native.prepare('SELECT * FROM editor_library_versions').all()).toEqual([])
      expect(f.database.native.pragma('foreign_key_check')).toEqual([])
      expect(f.database.native.pragma('integrity_check', { simple: true })).toBe('ok')
      f.database.close()
    }
  }, 30_000)



  it('restores script source and binary resources without storing script text in SQL', () => {
    const f = fixture(), read = () => f.service.read({ kind: 'scripts', scope: 'global', ownerId: '' })
    const save = (state: EditorLibraryVersions) => {
      const { files, ...content } = JSON.parse(state.versions.find(item => item.id === state.activeVersionId)!.content)
      return f.service.save({ kind: 'scripts', documents: [JSON.stringify({ ...f.scripts.get('global', ''), ...content })], versions: [state] }).versions[0]!
    }
    const content = { enabled: false, trees: [script('export default () => 11;')], variables: { score: 1 }, files: [{ path: 'assets/data.bin', data: Buffer.from([0, 255, 42]).toString('base64') }] }
    let state = save(setContent(read(), content))
    state = save({ ...state, activeVersionId: 'second', versions: [...state.versions, { id: 'second', name: '第二版', content: JSON.stringify({ ...content, trees: [script('export default () => 22;')], files: [] }) }] })
    expect(f.scripts.portable('global', '').files).toEqual([])
    const stored = f.database.native.prepare('SELECT stateJson FROM editor_library_versions').get() as { stateJson: string }
    expect(stored.stateJson).not.toContain('export default')
    expect(stored.stateJson).toContain('archive')
    f.database.close(); f.database.open(); f.service = f.make()
    save({ ...read(), activeVersionId: 'default' })
    expect(f.scripts.get('global', '').trees[0]).toMatchObject({ content: 'export default () => 11;' })
    expect(f.scripts.portable('global', '').files).toEqual(content.files)
    const workspace = f.scripts.workspace('global', ''), stale = read()
    writeFileSync(join(workspace.path, 'assets/data.bin'), Buffer.from([3]))
    expect(() => save(stale)).toThrow('外部更新')
    expect(readFileSync(join(workspace.path, 'assets/data.bin'))).toEqual(Buffer.from([3]))
  }, 30_000)

  it('rolls back script files and live configuration when a resource overwrites an entry path', () => {
    const f = fixture(), address = { kind: 'scripts' as const, scope: 'global' as const, ownerId: '' }
    const library = f.scripts.save({ ...f.scripts.get('global', ''), trees: [script('export default () => 1;')] })
    const workspace = f.scripts.workspace('global', ''), state = setContent(f.service.read(address), {
      enabled: false, trees: [script('export default () => 2;')], variables: {}, files: [{ path: workspace.entries[0]!.file, data: Buffer.from('broken').toString('base64') }],
    })
    expect(() => f.service.save({ kind: 'scripts', documents: [JSON.stringify({ ...library, trees: [script('export default () => 2;')] })], versions: [state] })).toThrow('入口')
    expect(f.scripts.get('global', '').trees[0]).toMatchObject({ content: 'export default () => 1;' })
    expect(readFileSync(join(workspace.path, workspace.entries[0]!.file), 'utf8')).toBe('export default () => 1;')
    expect(f.database.native.prepare('SELECT * FROM editor_library_versions').all()).toEqual([])
  }, 30_000)


  it('bounds immutable archives across repeated saves and collects an aborted snapshot on restart', () => {
    const f = fixture(), address = { kind: 'scripts' as const, scope: 'global' as const, ownerId: '' }
    const save = (number: number) => {
      const content = { enabled: false, trees: [script(`export default () => ${number};`)], variables: {}, files: [] }
      return f.service.save({ kind: 'scripts', documents: [JSON.stringify({ ...f.scripts.get('global', ''), trees: content.trees })],
        versions: [setContent(f.service.read(address), content)] })
    }
    for (let number = 1; number <= 12; number++) { save(number); expect(readdirSync(f.archiveRoot).length).toBeLessThanOrEqual(2) }
    f.database.native.exec("CREATE TRIGGER synthetic_version_failure BEFORE UPDATE ON editor_library_versions BEGIN SELECT RAISE(ABORT, 'Synthetic version failure'); END")
    expect(() => save(99)).toThrow('Synthetic version failure')
    expect(f.scripts.get('global', '').trees[0]).toMatchObject({ content: 'export default () => 12;' })
    f.database.native.exec('DROP TRIGGER synthetic_version_failure')
    f.database.close(); f.database.open(); f.service = f.make()
    expect(readdirSync(f.archiveRoot)).toHaveLength(1)
    expect(f.service.read(address).versions).toHaveLength(1)
  }, 30_000)
})
