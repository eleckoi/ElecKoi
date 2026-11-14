import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SqliteDatabase } from '../../../../tests/helpers/SqliteDatabase'
import { CharacterRepository } from '../src/domain/personas/CharacterRepository'
import { CharacterOpeningRepository } from '../src/domain/characterOpenings'
import { SettingLibraryRepository } from '../src/domain/settingLibraries/SettingLibraryRepository'
import { VariableConfigRepository } from '../src/domain/variables/VariableConfigRepository'
import { LocalMediaStore } from '../src/storage/media/LocalMediaStore'
import { installSchema } from '../src/storage/sqlite/installSchema'
import { CURRENT_SCHEMA_VERSION } from '../src/storage/sqlite/schemaVersion'
import { recordCharacterEdit } from '../src/domain/characterCatalog'
import { CharacterAssetRepository } from '../src/domain/characterAssets'
import { FrontendIndex, FrontendProjectRepository } from '../src/domain/frontends'
import { AgentPresetRepository } from '../src/domain/agentPresets'
import { RegexRuleRepository } from '../src/domain/regexRules'
import { createScriptLibraryRepository } from './helpers/scriptLibraryOwners'

const roots: string[] = [], stores: SqliteDatabase[] = []
afterEach(() => {
  vi.restoreAllMocks()
  for (const store of stores.splice(0)) store.close()
  for (const root of roots.splice(0)) {
    const child = relative(tmpdir(), root)
    if (!child || child.startsWith('..') || isAbsolute(child)) throw new Error('Unexpected fixture cleanup target')
    rmSync(root, { recursive: true, force: true })
  }
})
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'eleckoi-character-catalog-')); roots.push(root)
  const store = new SqliteDatabase(join(root, 'catalog.sqlite')); stores.push(store); store.open()
  const characters = new CharacterRepository(store, { deleteForCharacter() {}, refreshCharacterIdentity() {} }, new LocalMediaStore(join(root, 'media')))
  const card = (id: string) => ({ id, name: id, group: '', persona: { assistant_name: id } })
  return { root, store, characters, card }
}
function legacySnapshot(store: SqliteDatabase) {
  return store.native.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name<>'character_catalog_activity' ORDER BY name").all()
    .map((row: any) => [row.name, store.native.prepare(`SELECT * FROM "${row.name}" ORDER BY rowid`).all()])
}

describe('local character catalog activity and grouping', () => {
  it('records actual local additions, rejects imported timestamp spoofing and does not count selection, grouping or another card deletion as editing', () => {
    const f = fixture(), clock = vi.spyOn(Date, 'now').mockReturnValue(1000)
    f.characters.create({ ...f.card('a'), addedAtEpochMs: 99, editedAtEpochMs: 999999 })
    expect(f.characters.get().items[0]).toMatchObject({ addedAtEpochMs: 1000, editedAtEpochMs: 1000 })
    clock.mockReturnValue(2000); f.characters.create(f.card('b'))
    clock.mockReturnValue(3000); f.characters.update({ ...f.characters.get().items[0]!, name: 'Edited', persona: { assistant_name: 'Edited' } })
    const before = f.characters.get().items[0]!
    expect(before).toMatchObject({ addedAtEpochMs: 1000, editedAtEpochMs: 3000 })
    clock.mockReturnValue(4000); f.characters.update(before); f.characters.select('b'); f.characters.saveGroups(['Group'], [{ characterId: 'a', group: 'Group' }]); f.characters.delete(['b'])
    expect(f.characters.get().items[0]).toMatchObject({ addedAtEpochMs: 1000, editedAtEpochMs: 3000, group: 'Group' })
  })
  it('records authored opening, setting and variable saves, while read-only access and view changes retain the last edit time', () => {
    const f = fixture(), clock = vi.spyOn(Date, 'now').mockReturnValue(1000); f.characters.create(f.card('a'))
    const openings = new CharacterOpeningRepository(f.store), settings = new SettingLibraryRepository(f.store), variables = new VariableConfigRepository(f.store)
    const opening = openings.get('a'), library = settings.get('a'), variable = variables.get('a')
    clock.mockReturnValue(2000); openings.save('a', { ...opening, enabled: !opening.enabled })
    expect(f.characters.get().items[0]?.editedAtEpochMs).toBe(2000)
    clock.mockReturnValue(3000); settings.save('a', { ...library, name: 'Edited library' })
    expect(f.characters.get().items[0]?.editedAtEpochMs).toBe(3000)
    clock.mockReturnValue(4000); variables.save('a', { ...variable, name: 'Edited variables' })
    expect(f.characters.get().items[0]?.editedAtEpochMs).toBe(4000)
    clock.mockReturnValue(5000); openings.get('a'); settings.get('a'); variables.get('a'); settings.saveViewState('a', []); variables.saveViewState('a', [])
    expect(f.characters.get().items[0]?.editedAtEpochMs).toBe(4000)
  })
  it('rolls back activity together with a failed authored save', () => {
    const f = fixture(), clock = vi.spyOn(Date, 'now').mockReturnValue(1000); f.characters.create(f.card('a'))
    const openings = new CharacterOpeningRepository(f.store), before = openings.get('a')
    clock.mockReturnValue(2000)
    expect(() => f.store.withWriteTx(db => { openings.saveInTransaction('a', { ...before, enabled: !before.enabled }, db); throw new Error('Synthetic rollback') })).toThrow('Synthetic rollback')
    expect(openings.get('a')).toEqual(before)
    expect(f.characters.get().items[0]?.editedAtEpochMs).toBe(1000)
  })
  it('records successful asset, frontend, regex and script author changes while resource reads leave the time unchanged', () => {
    const f = fixture(), clock = vi.spyOn(Date, 'now').mockReturnValue(1000); f.characters.create(f.card('a'))
    const changed = (id: string) => f.store.withWriteTx(db => recordCharacterEdit(db, id))
    const assets = new CharacterAssetRepository(join(f.root, 'assets'), id => f.characters.get().items.some(item => item.id === id), changed)
    clock.mockReturnValue(2000); assets.createFolder('a', 'Synthetic assets', null)
    expect(f.characters.get().items[0]?.editedAtEpochMs).toBe(2000)
    const frontends = new FrontendProjectRepository(new FrontendIndex(join(f.root, 'frontends')), id => id === 'a', undefined, changed)
    clock.mockReturnValue(3000); const project = frontends.importProject({ scope: 'character', characterId: 'a' }, { name: 'Synthetic project', files: [{ path: 'index.html', content: '<p>One</p>' }] }).projects[0]!
    expect(f.characters.get().items[0]?.editedAtEpochMs).toBe(3000)
    clock.mockReturnValue(4000); frontends.writeFile({ scope: 'character', characterId: 'a' }, project.id, { path: 'index.html', content: '<p>Two</p>' })
    expect(f.characters.get().items[0]?.editedAtEpochMs).toBe(4000)
    clock.mockReturnValue(5000); assets.list('a'); frontends.workspace({ scope: 'character', characterId: 'a' }); frontends.readAsset(project.id, 'index.html')
    expect(f.characters.get().items[0]?.editedAtEpochMs).toBe(4000)
    const scripts = createScriptLibraryRepository(f.store)
    clock.mockReturnValue(6000); scripts.save({ ...scripts.get('character', 'a'), enabled: true })
    expect(f.characters.get().items[0]?.editedAtEpochMs).toBe(6000)
    const presets = new AgentPresetRepository(f.store); presets.ensureInitialized(); const regex = new RegexRuleRepository(f.store, presets)
    clock.mockReturnValue(7000); const library = regex.readLibrary('character', 'a'); regex.saveLibrary({ ...library, enabled: !library.enabled }, [])
    expect(f.characters.get().items[0]?.editedAtEpochMs).toBe(7000)
    clock.mockReturnValue(8000); scripts.get('character', 'a'); regex.readLibrary('character', 'a')
    expect(f.characters.get().items[0]?.editedAtEpochMs).toBe(7000)
  }, 30_000)
  it('upgrades a v17 file without inventing old timestamps or changing product records, then persists later edits across reopen', () => {
    const f = fixture(); f.characters.create(f.card('a')); f.characters.saveGroups(['A', 'B'], [{ characterId: 'a', group: 'B' }])
    f.store.native.exec('DROP TABLE character_catalog_activity; PRAGMA user_version=17')
    const before = legacySnapshot(f.store)
    installSchema(f.store.native)
    expect(f.store.native.pragma('user_version', { simple: true })).toBe(CURRENT_SCHEMA_VERSION)
    expect(legacySnapshot(f.store)).toEqual(before)
    expect(f.characters.get().items[0]).toMatchObject({ addedAtEpochMs: 0, editedAtEpochMs: 0 })
    vi.spyOn(Date, 'now').mockReturnValue(6000); f.characters.update({ ...f.characters.get().items[0]!, name: 'Edited after upgrade' })
    f.store.close(); f.store.open()
    expect(f.characters.get().items[0]).toMatchObject({ addedAtEpochMs: 0, editedAtEpochMs: 6000, group: 'B' })
    expect(f.characters.get().groups).toEqual(['A', 'B'])
    expect(f.store.native.pragma('foreign_key_check')).toEqual([])
    expect(f.store.native.pragma('integrity_check', { simple: true })).toBe('ok')
  }, 30_000)
  it('leaves the original v17 file intact when the activity migration fails before its version stamp', () => {
    const f = fixture(); f.characters.create(f.card('a')); f.store.native.exec('DROP TABLE character_catalog_activity; PRAGMA user_version=17')
    const before = legacySnapshot(f.store), exec = f.store.native.exec.bind(f.store.native)
    const probe = vi.spyOn(f.store.native, 'exec').mockImplementation(sql => {
      const result = exec(sql)
      if (sql.startsWith('CREATE TABLE IF NOT EXISTS `character_catalog_activity`')) throw new Error('Synthetic migration failure')
      return result
    })
    expect(() => installSchema(f.store.native)).toThrow('Synthetic migration failure'); probe.mockRestore()
    expect(f.store.native.pragma('user_version', { simple: true })).toBe(17)
    expect(f.store.native.prepare("SELECT name FROM sqlite_master WHERE name='character_catalog_activity'").get()).toBeUndefined()
    expect(legacySnapshot(f.store)).toEqual(before)
    installSchema(f.store.native); expect(f.characters.get().items[0]?.addedAtEpochMs).toBe(0)
  }, 30_000)
  it('saves all 1001 group assignments atomically and reopens with exact long contents, final membership and group order', () => {
    const f = fixture(), long = 'Synthetic retained content '.repeat(301)
    const items = Array.from({ length: 1001 }, (_, index) => ({ ...f.card(`card-${index}`), group: 'A', profileLike: `${index}:${long}` }))
    f.characters.replaceAll({ active_character_id: 'card-500', groups: ['A', 'B', 'C'], items })
    const assignments = items.map(item => ({ characterId: item.id, group: 'C' }))
    expect(() => f.characters.saveGroups(['C', 'B', 'A'], [...assignments, { characterId: 'missing', group: 'C' }])).toThrow()
    expect(f.characters.get().items.every(item => item.group === 'A')).toBe(true)
    f.characters.saveGroups(['C', 'B', 'A'], assignments)
    f.store.close(); f.store.open()
    const saved = f.characters.get(); expect(saved.groups).toEqual(['C', 'B', 'A']); expect(saved.items).toHaveLength(1001)
    expect(saved.items.every(item => item.group === 'C')).toBe(true)
    for (const index of [0, 500, 1000]) expect(saved.items[index]?.profileLike).toBe(`${index}:${long}`)
    f.characters.saveGroups(['B', 'A'], assignments.map(item => ({ ...item, group: '' })))
    expect(f.characters.get().items.every(item => item.group === '')).toBe(true)
    expect(f.store.native.pragma('foreign_key_check')).toEqual([])
  }, 30_000)
});
