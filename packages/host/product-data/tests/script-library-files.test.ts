import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SqliteDatabase } from '../../../../tests/helpers/SqliteDatabase'
import { createScriptLibraryRepository } from './helpers/scriptLibraryOwners'
import { CharacterRepository } from '../src/domain/personas/CharacterRepository'
import { AgentPresetRepository } from '../src/domain/agentPresets'
import { LocalMediaStore } from '@eleckoi/dsh-product-data/media'
import productDataPlugin from '@eleckoi/dsh-product-data'
import * as Cordis from '@deepseek-ai/cordis'
import { ELECKOI_FAILURE_CODES } from '../../../shared/src/contracts/errors/codes'

const fixtures: Array<{ database: SqliteDatabase; directory: string }> = []
const contexts: Cordis.Context[] = []
const watchers: Array<() => void> = []
afterEach(async () => {
  vi.restoreAllMocks()
  watchers.splice(0).forEach(stop => stop())
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  vi.unstubAllEnvs()
  for (const f of fixtures.splice(0)) { f.database.close(); rmSync(f.directory, { recursive: true, force: true }) }
})
function setup() {
  const directory = mkdtempSync(join(tmpdir(), 'eleckoi-script-files-'))
  const database = new SqliteDatabase(join(directory, 'product.sqlite'))
  database.open()
  fixtures.push({ database, directory })
  const scripts = createScriptLibraryRepository(database)
  const characters = new CharacterRepository(database, { deleteForCharacter() {}, refreshCharacterIdentity() {} }, new LocalMediaStore(join(directory, 'media')))
  characters.create({ id: 'synthetic-character', name: 'Synthetic character' })
  const presets = new AgentPresetRepository(database, undefined, scripts)
  const presetId = presets.create('Synthetic preset').id
  return { database, scripts, characters, presets, presetId }
}
const script = { type: 'script' as const, id: 'synthetic-script', name: 'Synthetic script', enabled: true,
  content: 'export const answer = 2;', info: '', data: {}, button: { enabled: false, buttons: [] },
  export_with: { data: true, button: true }, runtime: { kind: 'eleckoi-module', apiVersion: 1 } }
function source(f: ReturnType<typeof setup>, scope = 'global', ownerId = ''): string {
  const row = f.database.native.prepare('SELECT treesJson FROM script_libraries WHERE scope=? AND ownerId=?').get(scope, ownerId) as { treesJson: string }
  const index = JSON.parse(row.treesJson)
  return f.scripts.files.path(index.items[0].sourceFile)
}

describe('script source files', () => {
  it('persists an empty disabled script without filling in a starter module', () => {
    const f = setup()
    for (const [scope, ownerId] of [['global', ''], ['character', 'synthetic-character'], ['preset', f.presetId]] as const) {
      f.scripts.save({ ...f.scripts.get(scope, ownerId), trees: [{ ...script, enabled: false, content: '' }] })
      expect(readFileSync(source(f, scope, ownerId), 'utf8')).toBe('')
      expect(f.scripts.get(scope, ownerId).trees[0]).toMatchObject({ enabled: false, content: '' })
    }
  }, 30000)

  it('saves settings against the latest library revision without changing source files or other script data', () => {
    const f = setup()
    for (const [scope, ownerId] of [['global', ''], ['character', 'synthetic-character'], ['preset', f.presetId]] as const) {
      const saved = f.scripts.save({ ...f.scripts.get(scope, ownerId), enabled: true,
        trees: [{ type: 'folder', id: 'synthetic-folder', name: 'Synthetic folder', enabled: true, icon: '', color: '',
          scripts: [{ ...script, data: { amount: 2 } }, { ...script, id: 'synthetic-other', data: { preserve: true } }] }],
        variables: { shared: 1 } })
      const workspace = f.scripts.workspace(scope, ownerId)
      const updated = f.scripts.updateSettings(scope, ownerId, script.id, 'script', { amount: 3 }, saved.revision)
      expect(updated.revision).toBe(saved.revision + 1)
      expect(updated.variables).toEqual(saved.variables)
      expect(updated.trees).toEqual([{ ...saved.trees[0], scripts: [
        { ...(saved.trees[0] as any).scripts[0], data: { amount: 3 } }, (saved.trees[0] as any).scripts[1],
      ] }])
      expect(f.scripts.workspace(scope, ownerId)).toEqual(workspace)
      expect(() => f.scripts.updateSettings(scope, ownerId, script.id, 'script', { amount: 99 }, saved.revision)).toThrow('重新读取')
      expect(() => f.scripts.updateSettings(scope, ownerId, 'synthetic-missing', 'library', {}, updated.revision)).toThrow('不存在')
      expect(() => f.scripts.updateSettings(scope, ownerId, script.id, 'script', { bad: undefined }, updated.revision)).toThrow()
      expect(f.scripts.get(scope, ownerId)).toEqual(updated)
      const shared = f.scripts.updateSettings(scope, ownerId, script.id, 'library', { shared: 5 }, updated.revision)
      expect(shared.variables).toEqual({ shared: 5 }); expect(shared.trees).toEqual(updated.trees)
    }
    const saved = f.scripts.get('global', '')
    f.database.close(); f.database.open()
    expect(createScriptLibraryRepository(f.database).get('global', '')).toEqual(saved)
  }, 30000)

  it('rolls back settings failures and preserves external source edits rather than overwriting them', () => {
    const f = setup(), saved = f.scripts.save({ ...f.scripts.get('global', ''), trees: [script] })
    const path = source(f), changed = 'export const answer = 8;'
    writeFileSync(path, changed)
    expect(() => f.scripts.updateSettings('global', '', script.id, 'script', { amount: 3 }, saved.revision)).toThrow('重新读取')
    const latest = f.scripts.get('global', '')
    expect(latest.trees[0]!.content).toBe(changed)
    f.database.native.exec("CREATE TRIGGER synthetic_settings_failure BEFORE UPDATE ON script_libraries BEGIN SELECT RAISE(ABORT, 'Synthetic settings failure'); END")
    expect(() => f.scripts.updateSettings('global', '', script.id, 'script', { amount: 3 }, latest.revision)).toThrow('Synthetic settings failure')
    expect(f.scripts.get('global', '')).toEqual(latest); expect(readFileSync(path, 'utf8')).toBe(changed)
    f.database.native.exec('DROP TRIGGER synthetic_settings_failure')
    const accepted = f.scripts.updateSettings('global', '', script.id, 'script', { amount: 3 }, latest.revision)
    expect(accepted.trees[0]!.data).toEqual({ amount: 3 }); expect(readFileSync(path, 'utf8')).toBe(changed)
  }, 30000)

  it('versions relative helper files and refuses stale assets without changing the stored entry', () => {
    const f = setup()
    f.scripts.save({ ...f.scripts.get('character', 'synthetic-character'), trees: [script] })
    const before = f.scripts.workspace('character', 'synthetic-character')
    expect(before.entries).toEqual([{ id: script.id, file: expect.stringMatching(/^scripts\/[a-f0-9]+\.js$/) }])
    mkdirSync(join(before.path, 'helpers'))
    writeFileSync(join(before.path, 'helpers', 'derive.js'), 'export const derive = n => n * 2;')
    const after = f.scripts.workspace('character', 'synthetic-character')
    expect(after.version).not.toBe(before.version)
    expect(new TextDecoder().decode(f.scripts.asset('character', 'synthetic-character', after.version, 'helpers/derive.js'))).toBe('export const derive = n => n * 2;')
    expect(() => f.scripts.asset('character', 'synthetic-character', before.version, before.entries[0]!.file)).toThrow('脚本文件已更新')
    expect(() => f.scripts.asset('character', 'synthetic-character', after.version, '../global/file.js')).toThrow('路径无效')
    expect(readFileSync(source(f, 'character', 'synthetic-character'), 'utf8')).toBe(script.content)
    rmSync(source(f, 'character', 'synthetic-character'))
    expect(f.scripts.workspace('character', 'synthetic-character').path).toBe(before.path)
    expect(() => f.scripts.get('character', 'synthetic-character')).toThrow()
  }, 30000)

  it('observes nested helper creation and editor replacement, then stops on disposal', async () => {
    const f = setup(), workspace = f.scripts.workspace('global', '')
    const changed = vi.fn(), stop = f.scripts.files.watch(changed); watchers.push(stop)
    mkdirSync(join(workspace.path, 'helpers'))
    const path = join(workspace.path, 'helpers', 'derive.js')
    writeFileSync(path, 'export const value = 1;')
    await vi.waitFor(() => expect(changed).toHaveBeenCalled(), { timeout: 5000 })
    changed.mockClear()
    writeFileSync(`${path}.tmp`, 'export const value = 2;')
    renameSync(`${path}.tmp`, path)
    await vi.waitFor(() => expect(changed).toHaveBeenCalledTimes(1), { timeout: 5000 })
    expect(f.scripts.workspace('global', '').version).not.toBe(workspace.version)
    stop(); changed.mockClear()
    writeFileSync(path, 'export const value = 3;')
    await new Promise(resolve => setTimeout(resolve, 300))
    expect(changed).not.toHaveBeenCalled()
  }, 30000)

  it('does not persist helper versions or repeated asset reads as growing product records', () => {
    const f = setup()
    f.scripts.save({ ...f.scripts.get('global', ''), trees: [script] })
    const workspace = f.scripts.workspace('global', ''), entry = workspace.entries[0]!.file
    mkdirSync(join(workspace.path, 'helpers'))
    const writes = () => f.database.native.prepare('SELECT total_changes() AS count').get()
    const before = writes()
    for (let version = 0; version < 30; version++) {
      writeFileSync(join(workspace.path, 'helpers', 'derive.js'), `export const value = ${version};`)
      const current = f.scripts.workspace('global', '')
      for (let request = 0; request < 3; request++) f.scripts.asset('global', '', current.version, entry)
      expect(f.scripts.get('global', '').revision).toBe(1)
    }
    expect(writes()).toEqual(before)
    expect(f.database.native.prepare('SELECT COUNT(*) AS count FROM script_libraries').get()).toEqual({ count: 1 })
  }, 30000)

  it('keeps executable source only in ordinary files across all scopes and reopen', () => {
    const f = setup()
    for (const [scope, ownerId] of [['global', ''], ['character', 'synthetic-character'], ['preset', f.presetId]] as const) {
      const saved = f.scripts.save({ ...f.scripts.get(scope, ownerId), trees: [script], enabled: true })
      expect(readFileSync(source(f, scope, ownerId), 'utf8')).toBe(script.content)
      const row = f.database.native.prepare('SELECT * FROM script_libraries WHERE scope=? AND ownerId=?').get(scope, ownerId)
      expect(JSON.stringify(row)).not.toContain(script.content)
      expect(f.scripts.get(scope, ownerId)).toEqual(saved)
    }
    const saved = f.scripts.get('global', '')
    f.database.close(); f.database.open()
    expect(createScriptLibraryRepository(f.database).get('global', '')).toEqual(saved)
  }, 30000)

  it('reads external editor changes and rejects overwriting them with an old UI draft', () => {
    const f = setup(), before = f.scripts.save({ ...f.scripts.get('global', ''), trees: [script] })
    const path = source(f)
    writeFileSync(path, 'export const answer = 7;', 'utf8')
    expect(() => f.scripts.save(before)).toThrow('脚本库已被修改')
    const edited = f.scripts.get('global', '')
    expect(edited.revision).toBe(before.revision + 1)
    expect(edited.trees[0]).toMatchObject({ content: 'export const answer = 7;' })
    expect(readFileSync(path, 'utf8')).toBe('export const answer = 7;')
    expect(f.scripts.get('global', '')).toEqual(edited)
  }, 30000)

  it('preserves files and configuration when a batch fails and removes deleted scripts', () => {
    const f = setup(), original = f.scripts.save({ ...f.scripts.get('global', ''), trees: [script] })
    const path = source(f), character = f.scripts.get('character', 'synthetic-character')
    expect(() => f.scripts.saveAll([{ ...character, trees: [script] }, { ...original, revision: 0 }])).toThrow('脚本库已被修改')
    expect(f.scripts.get('character', 'synthetic-character')).toEqual(character)
    expect(f.scripts.get('global', '')).toEqual(original)
    expect(readFileSync(path, 'utf8')).toBe(script.content)
    f.scripts.save({ ...original, trees: [] })
    expect(existsSync(path)).toBe(false)
    expect(f.scripts.get('global', '').trees).toEqual([])
  }, 30000)

  it('restores published source if SQL commit fails and cleans interrupted work on reopen', () => {
    const f = setup(), original = f.scripts.save({ ...f.scripts.get('global', ''), trees: [script] })
    const path = source(f)
    const transaction = f.database.withWriteTx.bind(f.database)
    const failure = vi.spyOn(f.database, 'withWriteTx').mockImplementation(operation => transaction(db => {
      operation(db)
      throw new Error('Synthetic commit failure')
    }))
    expect(() => f.scripts.save({ ...original, trees: [{ ...script, content: 'export const answer = 9;' }] })).toThrow('Synthetic commit failure')
    failure.mockRestore()
    expect(f.scripts.get('global', '')).toEqual(original)
    expect(readFileSync(path, 'utf8')).toBe(script.content)
    expect(readdirSync(join(f.scripts.files.root, '.transactions'))).toEqual([])
  }, 30000)

  it('recovers an interrupted rollback from the persisted ownership record', () => {
    const f = setup(), original = f.scripts.save({ ...f.scripts.get('global', ''), trees: [script] })
    const path = source(f), transaction = f.database.withWriteTx.bind(f.database)
    const failure = vi.spyOn(f.database, 'withWriteTx').mockImplementation(operation => transaction(db => {
      operation(db)
      throw new Error('Synthetic SQL failure')
    }))
    const interrupted = vi.spyOn(f.scripts.files as any, 'rollback').mockImplementation(() => { throw new Error('Synthetic process interruption') })
    expect(() => f.scripts.save({ ...original, trees: [{ ...script, content: 'export const answer = 9;' }] })).toThrow('Synthetic process interruption')
    expect(readFileSync(path, 'utf8')).toBe('export const answer = 9;')
    failure.mockRestore(); interrupted.mockRestore()
    f.database.close(); f.database.open()
    const reopened = createScriptLibraryRepository(f.database)
    expect(reopened.get('global', '')).toEqual(original)
    expect(readFileSync(path, 'utf8')).toBe(script.content)
    expect(readdirSync(join(reopened.files.root, '.transactions'))).toEqual([])
  }, 30000)

  it('finishes cleanup after a committed save without reverting newly accepted source', () => {
    const f = setup(), original = f.scripts.save({ ...f.scripts.get('global', ''), trees: [script] })
    const path = source(f)
    const interrupted = vi.spyOn(f.scripts.files as any, 'cleanup').mockImplementationOnce(() => { throw new Error('Synthetic cleanup interruption') })
    expect(() => f.scripts.save({ ...original, trees: [{ ...script, content: 'export const answer = 9;' }] })).toThrow('Synthetic cleanup interruption')
    interrupted.mockRestore()
    f.database.close(); f.database.open()
    const reopened = createScriptLibraryRepository(f.database)
    expect(reopened.get('global', '')).toMatchObject({ revision: original.revision + 1, trees: [{ content: 'export const answer = 9;' }] })
    expect(readFileSync(path, 'utf8')).toBe('export const answer = 9;')
    expect(readdirSync(join(reopened.files.root, '.transactions'))).toEqual([])
  }, 30000)

  it('preserves an external edit discovered inside an interrupted transaction', () => {
    const f = setup(), original = f.scripts.save({ ...f.scripts.get('global', ''), trees: [script] })
    const path = source(f), transaction = f.database.withWriteTx.bind(f.database)
    writeFileSync(path, 'export const answer = 7;', 'utf8')
    const failure = vi.spyOn(f.database, 'withWriteTx').mockImplementation(operation => transaction(db => {
      operation(db)
      throw new Error('Synthetic SQL failure')
    }))
    const interrupted = vi.spyOn(f.scripts.files as any, 'rollback').mockImplementation(() => { throw new Error('Synthetic process interruption') })
    expect(() => f.scripts.transaction(db => {
      const current = f.scripts.get('global', '', db)
      f.scripts.saveInTransaction({ ...current, trees: [{ ...script, content: 'export const answer = 9;' }] }, db)
    })).toThrow('Synthetic process interruption')
    failure.mockRestore(); interrupted.mockRestore()
    f.database.close(); f.database.open()
    const reopened = createScriptLibraryRepository(f.database)
    expect(reopened.get('global', '')).toMatchObject({ revision: original.revision + 1, trees: [{ content: 'export const answer = 7;' }] })
    expect(readFileSync(path, 'utf8')).toBe('export const answer = 7;')
  }, 30000)

  it('removes role-owned source through the actual Host without deleting shared scripts or other product data', async () => {
    const f = setup()
    f.scripts.save({ ...f.scripts.get('global', ''), trees: [script] })
    f.scripts.save({ ...f.scripts.get('character', 'synthetic-character'), trees: [script] })
    const global = source(f), owned = source(f, 'character', 'synthetic-character')
    const roleWorkspace = f.scripts.workspace('character', 'synthetic-character').path
    mkdirSync(join(roleWorkspace, 'helpers'))
    writeFileSync(join(roleWorkspace, 'helpers', 'derive.mjs'), 'export const derive = n => n * 2;')
    const directory = fixtures[fixtures.length - 1]!.directory
    f.database.close()
    vi.stubEnv('ELECKOI_DATABASE_PATH', join(directory, 'product.sqlite'))
    vi.stubEnv('ELECKOI_MEDIA_ROOT', join(directory, 'media'))
    vi.stubEnv('ELECKOI_WORKSPACE_ROOT', directory)
    const ctx = new Cordis.Context(); contexts.push(ctx)
    await ctx.plugin(productDataPlugin)
    const data = ctx.eleckoiProductData
    data.deleteCharacters(['synthetic-character'])
    expect(existsSync(owned)).toBe(false)
    expect(existsSync(join(roleWorkspace, 'helpers', 'derive.mjs'))).toBe(false)
    expect(readFileSync(global, 'utf8')).toBe(script.content)
    expect(data.readScriptLibrary('global', '').trees[0]).toMatchObject(script)
    expect(data.readCharacters().items).toEqual([])
    expect(data.readAgentPresetCatalog().presets.some(item => item.id === f.presetId)).toBe(true)
  }, 30000)

  it('does not fabricate source when a file is missing and deletes only the specified owner', () => {
    const f = setup()
    f.scripts.save({ ...f.scripts.get('global', ''), trees: [script] })
    f.scripts.save({ ...f.scripts.get('preset', f.presetId), trees: [script] })
    const global = source(f), preset = source(f, 'preset', f.presetId)
    f.presets.delete(f.presetId)
    expect(existsSync(preset)).toBe(false)
    expect(readFileSync(global, 'utf8')).toBe(script.content)
    rmSync(global)
    expect(() => f.scripts.get('global', '')).toThrow()
    expect(f.scripts.exists('global', '')).toBe(true)
  }, 30000)

  it('reports unparseable stored trees and variables as contract-coded storage corruption', () => {
    const f = setup()
    f.scripts.save({ ...f.scripts.get('global', ''), trees: [script], variables: { shared: 1 } })
    const corrupt = (column: 'treesJson' | 'variablesJson', value: string) =>
      f.database.native.prepare(`UPDATE script_libraries SET ${column}=? WHERE scope='global'`).run(value)
    const failureOf = (run: () => unknown): { code?: string; details?: Record<string, unknown> } => {
      try { run() }
      catch (error) { return error as { code?: string; details?: Record<string, unknown> } }
      throw new Error('Expected the stored script library payload to fail')
    }
    corrupt('treesJson', '{not json')
    expect(failureOf(() => f.scripts.get('global', ''))).toMatchObject({
      code: ELECKOI_FAILURE_CODES.storageCorrupt, details: { what: '脚本库树' }
    })
    expect(failureOf(() => f.scripts.workspace('global', ''))).toMatchObject({
      code: ELECKOI_FAILURE_CODES.storageCorrupt, details: { what: '脚本库树' }
    })
    corrupt('treesJson', JSON.stringify({ version: 1, items: [] }))
    corrupt('variablesJson', '{not json')
    expect(failureOf(() => f.scripts.get('global', ''))).toMatchObject({
      code: ELECKOI_FAILURE_CODES.storageCorrupt, details: { what: '变量配置' }
    })
  }, 30000)
})
