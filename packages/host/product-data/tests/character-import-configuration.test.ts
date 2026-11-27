import { characterExportRoot } from './helpers/characterExportRoot'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, isAbsolute, relative } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { CharacterTransferService } from '../src/domain/characterTransfer/CharacterTransferService'
import { CharacterRepository } from '../src/domain/personas/CharacterRepository'
import { SettingLibraryRepository, emptyEntry } from '../src/domain/settingLibraries'
import { VariableConfigRepository } from '../src/domain/variables'
import { RegexRuleRepository } from '../src/domain/regexRules'
import { AgentPresetRepository } from '../src/domain/agentPresets'
import { FrontendIndex, FrontendProjectRepository } from '../src/domain/frontends'
import { SqliteDatabase } from '../../../../tests/helpers/SqliteDatabase'
import { createScriptLibraryRepository } from './helpers/scriptLibraryOwners'
import { LocalMediaStore } from '@eleckoi/dsh-product-data/media'
import { transformCollectionSurface } from '@shared/foundation/regex/RegexRuleProcessor'

const fixtures: Array<{ root: string; database: SqliteDatabase }> = []
afterEach(() => {
  for (const { root, database } of fixtures.splice(0)) {
    database.close()
    const child = relative(tmpdir(), root)
    if (!child || child.startsWith('..') || isAbsolute(child)) throw new Error('Unexpected fixture path')
    rmSync(root, { recursive: true, force: true })
  }
})
function setup() {
  const root = mkdtempSync(join(tmpdir(), 'eleckoi-import-config-'))
  const database = new SqliteDatabase(join(root, 'product.sqlite')); database.open()
  fixtures.push({ root, database })
  const characters = new CharacterRepository(database, { deleteForCharacter() {}, refreshCharacterIdentity() {} }, new LocalMediaStore(join(root, 'media')))
  const scripts = createScriptLibraryRepository(database), presets = new AgentPresetRepository(database, undefined, scripts)
  const regex = new RegexRuleRepository(database, presets), settings = new SettingLibraryRepository(database), variables = new VariableConfigRepository(database)
  const frontends = () => new FrontendProjectRepository(new FrontendIndex(join(root, 'frontends')), id => characters.get().items.some(item => item.id === id))
  const transfer = new CharacterTransferService(database, characters, settings, variables, regex, undefined, scripts, undefined, undefined, frontends())
  return { root, database, characters, scripts, presets, regex, settings, variables, frontends, transfer }
}
const input = (file: { fileName: string; mimeType: string; base64: string }) => ({ displayName: file.fileName, mimeType: file.mimeType, base64: file.base64 })
const rules = [true, false].map((enabled, index) => ({ id: `synthetic-regex-${index}`, name: `Synthetic regex ${index}`,
  pattern: index ? 'BETA' : 'ALPHA', replacement: index ? 'OFF' : 'ACTIVE', targets: ['AiOutput' as const], enabled,
  displayOnly: true, promptOnly: false, runOnEdit: true, order: index, trimStrings: [], minDepth: null, maxDepth: null, substituteRegex: 0 as const }))

it.each(['png', 'zip'] as const)('preserves frontend selection, rendering and opening switches through complete-card %s import and reopen', format => {
  for (const selected of [false, true]) for (const enabled of [false, true]) {
    const source = setup(), target = setup(), id = 'synthetic-source'
    source.characters.create({ id, name: 'Synthetic configuration', frontendBeautyEnabled: !enabled })
    const owner = { scope: 'character' as const, characterId: id }, frontends = source.frontends()
    frontends.importProject(owner, { name: 'Synthetic first', html: '<html>First</html>', select: false })
    const second = frontends.importProject(owner, { name: 'Synthetic second', entryFile: 'pages/start.html', select: false,
      files: [{ path: 'pages/start.html', content: '<html>Second</html>' }],
      manifest: { config: { authored: true }, bindings: [{ target: 'root', view: 'chat', entryFile: 'pages/start.html' }] } }).projects[1]!
    if (selected) frontends.select(owner, second.id)
    frontends.setMessageRenderer(owner, enabled)
    const initial = source.transfer.export(id, 'png'), root = characterExportRoot(initial)
    const openings = JSON.parse(root.character_openings)
    root.character_openings = JSON.stringify({ ...openings, enabled,
      openingMessages: [...openings.openingMessages, { id: 'synthetic-second-opening', title: 'Second', content: 'Synthetic opening', variableVersionId: '' }],
      defaultOpeningMessageId: 'synthetic-second-opening' })
    const staged = source.transfer.prepare([input({ ...initial, base64: Buffer.from(JSON.stringify(root)).toString('base64') })], 'eleckoi')
    const configuredId = source.transfer.commit(staged.token).importedCharacterIds[0]!
    const file = source.transfer.export(configuredId, format)
    const imported = target.transfer.commit(target.transfer.prepare([input(file)], 'eleckoi').token).importedCharacterIds[0]!
    const check = () => {
      const workspace = target.frontends().workspace({ scope: 'character', characterId: imported })
      expect(workspace.messageRendererEnabled).toBe(enabled)
      expect(workspace.projects.map(project => project.name)).toEqual(['Synthetic first', 'Synthetic second'])
      if (selected) {
        const active = workspace.projects.find(project => project.id === workspace.selectedProjectId)!
        expect(active.name).toBe('Synthetic second')
        expect(active.manifest?.config).toEqual({ authored: true })
        expect(workspace.activeBindings).toEqual([{ target: 'root', view: 'chat', entryFile: 'pages/start.html' }])
      } else { expect(workspace.selectedProjectId).toBeNull(); expect(workspace.activeBindings).toEqual([]) }
      const character = target.characters.get().items.find(item => item.id === imported)!
      expect(Boolean(character.frontendBeautyEnabled)).toBe(!enabled)
      const card = characterExportRoot(target.transfer.export(imported, 'png'))
      expect(card.character.show_opening).toBe(enabled)
      expect(JSON.parse(card.character_openings)).toMatchObject({ enabled, defaultOpeningMessageId: 'synthetic-second-opening' })
    }
    check(); target.database.close(); target.database.open(); check()
  }
}, 60_000)

it.each(['png', 'zip'] as const)('preserves regex library and individual switches through complete-card %s and active target combinations', format => {
  for (const enabled of [false, true]) {
    const source = setup(), target = setup(), id = 'synthetic-regex-owner'
    source.characters.create({ id, name: 'Synthetic regex owner' })
    source.regex.saveEditor({ ...source.regex.readEditor({ scope: 'character', ownerId: id }), characterEnabled: enabled, characterRules: rules })
    target.characters.create({ id: 'synthetic-existing', name: 'Synthetic existing' })
    const existing = target.regex.get('synthetic-existing')
    target.regex.save('synthetic-existing', { ...existing, globalEnabled: false, activeVersionId: 'synthetic-selection',
      versions: [{ id: 'synthetic-selection', name: 'Synthetic selection', globalEnabledIds: [], characterEnabledIds: [], agentPresetEnabledIds: [] }] }, existing.revision)
    const file = source.transfer.export(id, format)
    const imported = target.transfer.commit(target.transfer.prepare([input(file)], 'eleckoi').token).importedCharacterIds[0]!
    const check = () => {
      const collection = target.regex.get(imported)
      expect(collection.characterEnabled).toBe(enabled)
      expect(collection.globalEnabled).toBe(false)
      expect(collection.activeVersionId).toBe('synthetic-selection')
      expect(collection.characterRules).toEqual(rules)
      expect(transformCollectionSurface('ALPHA BETA', collection, 'AiOutput', 'Display')).toBe(enabled ? 'ACTIVE BETA' : 'ALPHA BETA')
    }
    check(); target.database.close(); target.database.open(); check()
  }
}, 30_000)

it.each(['json', 'png'] as const)('preserves preset regex library switches through %s import and reopen', format => {
  for (const enabled of [false, true]) {
    const source = setup(), target = setup(), id = source.presets.create('Synthetic preset').id
    source.regex.saveEditor({ ...source.regex.readEditor({ scope: 'preset', ownerId: id }), agentPresetEnabled: enabled, agentPresetRules: rules })
    const imported = target.presets.import(input(source.presets.export(id, format)), 'eleckoi').preset.id
    const check = () => {
      expect(target.regex.scopeEnabled('preset', imported)).toBe(enabled)
      expect(target.regex.readScope('preset', imported).map(rule => rule.enabled)).toEqual([true, false])
    }
    check(); target.database.close(); target.database.open(); check()
  }
}, 30_000)

it('preserves large setting and variable collections, long originals, active versions and every switch on import and reopen', () => {
  const source = setup(), target = setup(), id = 'synthetic-settings-owner'
  source.characters.create({ id, name: 'Synthetic settings owner' })
  const long = 'Synthetic original configuration.\n'.repeat(2000).trimEnd(), timestamp = '2026-11-14T00:00:00.000Z'
  const entries = Array.from({ length: 1001 }, (_, index) => ({ ...emptyEntry(`synthetic-entry-${index}`, timestamp),
    title: `Synthetic entry ${index}`, enabled: index % 2 === 0, content: [0, 500, 1000].includes(index) ? long : `Content ${index}`, order: index + 1 }))
  source.settings.save(id, { ...source.settings.get(id), entries })
  const variables = Array.from({ length: 1001 }, (_, index) => ({ id: `synthetic-variable-${index}`, title: `Synthetic variable ${index}`,
    objectId: 'synthetic-object', enabled: index % 2 !== 0, type: 'number' as const, defaultValue: '3',
    description: [0, 500, 1000].includes(index) ? long : '', updateRule: '', readMode: 'on_demand' as const,
    order: index + 1, treeViewOrder: index + 1, createdAt: timestamp, updatedAt: timestamp }))
  const initial = source.variables.get(id)
  source.variables.save(id, { ...initial, variables, objects: [...initial.objects, { id: 'synthetic-object', name: 'Synthetic object', parentId: '',
    enabled: false, description: '', updateRule: '', dynamicKey: true, order: 1, treeViewOrder: 1, createdAt: timestamp, updatedAt: timestamp }] })
  const file = source.transfer.export(id, 'png')
  const imported = target.transfer.commit(target.transfer.prepare([input(file)], 'eleckoi').token).importedCharacterIds[0]!
  const check = () => {
    const library = target.settings.get(imported), config = target.variables.get(imported)
    expect(library.entries).toHaveLength(1001); expect(config.variables).toHaveLength(1001)
    expect(library.activeVersionId).toBe(source.settings.get(id).activeVersionId)
    expect(config.activeVersionId).toBe(source.variables.get(id).activeVersionId)
    expect(library.entries.map(entry => entry.enabled)).toEqual(entries.map(entry => entry.enabled))
    expect(config.variables.map(variable => variable.enabled)).toEqual(variables.map(variable => variable.enabled))
    expect(config.objects.find(item => item.id === 'synthetic-object')).toMatchObject({ enabled: false, dynamicKey: true })
    for (const index of [0, 500, 1000]) {
      expect(library.entries.find(entry => entry.id === entries[index]!.id)?.content).toBe(long)
      expect(config.variables.find(variable => variable.id === variables[index]!.id)?.description).toBe(long)
    }
  }
  check(); target.database.close(); target.database.open(); check()
}, 60_000)

it('keeps the established enabled default for a card without a regex library switch and rejects malformed explicit switches', () => {
  const source = setup(), target = setup()
  source.characters.create({ id: 'synthetic-default', name: 'Synthetic default' })
  const file = source.transfer.export('synthetic-default', 'png'), root = characterExportRoot(file)
  delete root.regex_enabled
  const preview = target.transfer.prepare([input({ ...file, base64: Buffer.from(JSON.stringify(root)).toString('base64') })], 'eleckoi')
  expect(target.regex.scopeEnabled('character', target.transfer.commit(preview.token).importedCharacterIds[0]!)).toBe(true)
  for (const enabled of [null, 0, 'false']) {
    root.regex_enabled = enabled
    expect(target.transfer.prepare([input({ ...file, base64: Buffer.from(JSON.stringify(root)).toString('base64') })], 'eleckoi').items[0]?.importable).toBe(false)
  }
})
