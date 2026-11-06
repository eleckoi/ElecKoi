import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { CharacterTransferService } from '../src/domain/characterTransfer/CharacterTransferService'
import { CharacterRepository } from '../src/domain/personas/CharacterRepository'
import { SettingLibraryRepository } from '../src/domain/settingLibraries'
import { VariableConfigRepository } from '../src/domain/variables/VariableConfigRepository'
import { RegexRuleRepository } from '../src/domain/regexRules/RegexRuleRepository'
import { AgentPresetRepository } from '../src/domain/agentPresets'
import { SqliteDatabase } from '../../../../tests/helpers/SqliteDatabase'
import { createScriptLibraryRepository } from './helpers/scriptLibraryOwners'
import { LocalMediaStore } from '@eleckoi/dsh-product-data/media'

const fixtures: Array<{ directory: string; database: SqliteDatabase }> = []
afterEach(() => {
  for (const fixture of fixtures.splice(0)) {
    fixture.database.close()
    const child = relative(tmpdir(), fixture.directory)
    if (!child || child.startsWith('..') || isAbsolute(child)) throw new Error('Unexpected test cleanup path')
    rmSync(fixture.directory, { recursive: true, force: true })
  }
})
function setup() {
  const directory = mkdtempSync(join(tmpdir(), 'eleckoi-script-import-'))
  const database = new SqliteDatabase(join(directory, 'product.sqlite'))
  database.open(); fixtures.push({ directory, database })
  const characters = new CharacterRepository(database, { deleteForCharacter() {}, refreshCharacterIdentity() {} }, new LocalMediaStore(join(directory, 'media')))
  const scripts = createScriptLibraryRepository(database)
  const presets = new AgentPresetRepository(database, undefined, scripts)
  presets.ensureInitialized()
  const transfer = new CharacterTransferService(database, characters, new SettingLibraryRepository(database),
    new VariableConfigRepository(database), new RegexRuleRepository(database, presets), undefined, scripts)
  return { characters, scripts, presets, transfer, database }
}
const extensions = { tavern_helper: { scripts: [{ type: 'script', id: 'synthetic-script', name: 'Synthetic script',
  enabled: true, content: 'throw new Error("Synthetic program must not run");' }], variables: { setting: 3 } } }
const input = (value: unknown) => ({ displayName: 'synthetic.json', mimeType: 'application/json', base64: Buffer.from(JSON.stringify(value)).toString('base64') })

describe('format imports do not install external script programs', () => {
  it('imports character fields and openings without creating an executable native script library', () => {
    const f = setup()
    const preview = f.transfer.prepare([input({ spec: 'chara_card_v3', spec_version: '3.0',
      data: { name: 'Synthetic character', first_mes: 'Synthetic opening', creator_notes: 'Synthetic notes', extensions } })], 'sillytavern')
    expect(preview.items[0]).toMatchObject({ importable: true, errorMessage: '' })
    const id = f.transfer.commit(preview.token).importedCharacterIds[0]!
    expect(f.characters.get().items.find(item => item.id === id)).toMatchObject({ profileLike: 'Synthetic notes' })
    expect(f.scripts.exists('character', id)).toBe(false)
    expect(f.scripts.get('character', id).trees).toEqual([])
    expect(f.database.native.prepare('SELECT * FROM script_libraries').all()).toEqual([])
    expect(f.database.native.pragma('foreign_key_check')).toEqual([])
  }, 30000)

  it('imports preset entries without installing bundled external programs or changing global native scripts', () => {
    const f = setup()
    const global = f.scripts.save({ ...f.scripts.get('global', ''), variables: { nativeSetting: 5 } })
    const imported = f.presets.import(input({ name: 'Synthetic preset',
      prompts: [{ identifier: 'synthetic-prompt', name: 'Prompt', content: 'Synthetic instruction', role: 'system' }],
      prompt_order: [{ character_id: 100001, order: [{ identifier: 'synthetic-prompt', enabled: true }] }], extensions }), 'sillytavern')
    expect(imported.preset).toMatchObject({ name: 'Synthetic preset' })
    expect(JSON.stringify(imported.preset)).toContain('Synthetic instruction')
    expect(f.scripts.exists('preset', imported.preset.id)).toBe(false)
    expect(f.scripts.get('preset', imported.preset.id).trees).toEqual([])
    expect(f.scripts.get('global', '')).toEqual(global)
    expect(f.database.native.pragma('foreign_key_check')).toEqual([])
  }, 30000)
})
