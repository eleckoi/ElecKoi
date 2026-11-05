import { CharacterOpeningRepository } from '../../packages/host/product-data/src/domain/characterOpenings'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
// @ts-expect-error The documentation generator is build tooling.
import { generateAuthorDocs } from '../../scripts/generate-author-docs.mjs'
import { CharacterTransferService } from '../../packages/host/product-data/src/domain/characterTransfer/CharacterTransferService'
import { CharacterRepository } from '../../packages/host/product-data/src/domain/personas/CharacterRepository'
import { SettingLibraryRepository } from '../../packages/host/product-data/src/domain/settingLibraries'
import { VariableConfigRepository } from '../../packages/host/product-data/src/domain/variables/VariableConfigRepository'
import { VariableStateRepository } from '../../packages/host/product-data/src/domain/variables/VariableStateRepository'
import { ConversationRepository } from '../../packages/host/product-data/src/domain/conversations/ConversationRepository'
import { resolveConversationSeed } from '../../packages/host/product-data/src/domain/conversations/conversationSeed'
import { RegexRuleRepository } from '../../packages/host/product-data/src/domain/regexRules/RegexRuleRepository'
import { AgentPresetRepository } from '../../packages/host/product-data/src/domain/agentPresets'
import { SqliteDatabase } from '../../packages/host/product-data/src/storage/sqlite/SqliteDatabase'
import { LocalMediaStore } from '@eleckoi/dsh-product-data/media'
import { createScriptLibraryRepository } from '../../packages/host/product-data/tests/helpers/scriptLibraryOwners'
// @ts-expect-error The setting-library editor transfer model is JavaScript.
import { importLibraryAsVersion, parseSettingLibraryFile, serializeSettingLibrary } from '../../apps/web/src/modules/settingLibraries/model/settingLibraryTransfer.js'
// @ts-expect-error The DOM runtime is only used by the documentation tests.
import { JSDOM } from 'jsdom'

const exampleDirectory = resolve('packages/examples/native-author')
const cleanups: Array<() => void> = []
afterEach(() => { for (const close of cleanups.splice(0)) close() })
// The examples are compared with the same text stored inside the JSON cards, so a
// checkout that rewrites line endings (core.autocrlf on Windows) must not change the
// comparison.
const read = (name: string) => readFileSync(join(exampleDirectory, name), 'utf8')
  .replaceAll('\r\n', '\n')

describe('native author developer documentation and examples', () => {
  it('keeps the searchable page, complete source signatures and import documents current', async () => {
    const result = await generateAuthorDocs(resolve('.'), { check: true })
    expect(result).toMatchObject({ methods: 81, requestMethods: 75, files: 4 })
    const view = new JSDOM(readFileSync('docs/plugins/author-sdk.html', 'utf8'), { runScripts: 'outside-only' }).window
    const page = view.document
    expect(page.querySelectorAll('.api-method')).toHaveLength(result.methods)
    expect(page.querySelectorAll('#types details')).toHaveLength(result.types)
    for (const method of ['script.setSettings', 'variables.registerRule', 'ui.registerButton', 'chat.send', 'events.on', 'presets.updateEntries', 'settingLibrary.updateEntries']) {
      expect(page.getElementById(`method-${method.replaceAll('.', '-')}`)?.querySelector('pre')?.textContent).toBeTruthy()
    }
    for (const link of page.querySelectorAll<HTMLAnchorElement>('nav a')) {
      expect(page.getElementById(link.getAttribute('href')!.slice(1))).not.toBeNull()
    }
    expect(page.querySelector('input[type=search]')?.getAttribute('aria-label')).toBe('搜索 SDK 接口')
    view.eval(readFileSync('docs/plugins/author-sdk-page.js', 'utf8'))
    const search = page.querySelector<HTMLInputElement>('input[type=search]')!
    search.value = 'presets.updateEntries'
    search.dispatchEvent(new view.Event('input'))
    expect([...page.querySelectorAll('.api-method:not([hidden])')].map(item => item.id)).toEqual(['method-presets-updateEntries'])
    expect(page.getElementById('guide')!.hidden).toBe(true)
    page.querySelector<HTMLAnchorElement>('nav a[href="#guide"]')!.click()
    expect(search.value).toBe('')
    expect(page.getElementById('guide')!.hidden).toBe(false)
    expect(page.getElementById('types')!.hidden).toBe(false)
    view.close()
  }, 30000)

  it('imports the actual published character and preset examples into their formal owners with helper files', () => {
    const directory = mkdtempSync(join(tmpdir(), 'eleckoi-author-example-'))
    const database = new SqliteDatabase(join(directory, 'product.sqlite'))
    database.open()
    cleanups.push(() => { database.close(); rmSync(directory, { recursive: true, force: true }) })
    const scripts = createScriptLibraryRepository(database)
    const characters = new CharacterRepository(database, { deleteForCharacter() {}, refreshCharacterIdentity() {} }, new LocalMediaStore(join(directory, 'media')))
    const settings = new SettingLibraryRepository(database), configs = new VariableConfigRepository(database)
    const presets = new AgentPresetRepository(database, undefined, scripts)
    presets.ensureInitialized()
    const transfer = new CharacterTransferService(database, characters, settings, configs, new RegexRuleRepository(database, presets), undefined, scripts)
    const document = (name: string) => ({ displayName: name, mimeType: 'application/json', base64: Buffer.from(read(name)).toString('base64') })
    const preview = transfer.prepare([document('example.character.json')], 'eleckoi')
    expect(preview.items[0]).toMatchObject({ importable: true, errorMessage: '' })
    const characterId = transfer.commit(preview.token).importedCharacterIds[0]!
    const library = scripts.get('character', characterId), workspace = scripts.workspace('character', characterId)
    expect(library.enabled).toBe(false)
    expect(library.trees[0]).toMatchObject({ enabled: false, content: read('character.js'), runtime: { kind: 'eleckoi-module', apiVersion: 1 }, data: { multiplier: 2 } })
    expect(readFileSync(join(workspace.path, 'derive.js'), 'utf8')).toBe(read('derive.js'))
    expect(readFileSync(join(workspace.path, 'settings.html'), 'utf8')).toBe(read('settings.html'))
    expect(configs.get(characterId)).toMatchObject({ schemaCode: expect.stringContaining('z.looseObject') })
    expect(JSON.parse(configs.get(characterId).initialStateJson)).toEqual({ score: 0, total: 0, level: 1 })
    const opening = new CharacterOpeningRepository(database).get(characterId)
    expect(opening.openingMessages).toHaveLength(2)
    const seed = resolveConversationSeed(characterId, database.db, new CharacterOpeningRepository(database), configs)
    expect(seed.openingOptions.map(item => JSON.parse(item.initialVariableStateJson).score)).toEqual([0, 10])
    const conversations = new ConversationRepository(database, (id, db) => resolveConversationSeed(id, db, new CharacterOpeningRepository(database), configs))
    const exampleChat = conversations.create({ metadata: { characterId } }).conversation.id
    conversations.selectOpening(exampleChat, 'example-advanced')
    expect(configs.forConversation(exampleChat, characterId)!.activeVersionId).toBe('example-advanced-variables')
    expect(JSON.parse(new VariableStateRepository(database, configs).viewerStates(exampleChat).currentStateJson)).toEqual({ score: 10, total: 20, level: 2 })
    expect(opening.openingMessages.every(item => item.content === read('frontend.html'))).toBe(true)
    const imported = presets.import(document('example.preset.json'), 'eleckoi').preset
    expect(scripts.get('preset', imported.id)).toMatchObject({ enabled: false, trees: [{ content: read('preset.js'), runtime: { kind: 'eleckoi-module', apiVersion: 1 }, data: { briefEntryId: 'example-brief', detailedEntryId: 'example-detailed' } }] })
    expect(imported.entries.filter(entry => ['example-brief', 'example-detailed'].includes(entry.id)).map(entry => entry.enabled)).toEqual([true, false])
    expect(scripts.get('global', '').trees).toEqual([])
    const nativeRoot = JSON.parse(read('example.character.json'))
    const nativeSettings = JSON.parse(nativeRoot.setting_library)
    Object.assign(nativeSettings.versions[0], {
      groups: [{ id: 'synthetic-folder', name: '合成文件夹', parent_id: '', order: 1, tree_view_order: 1 }],
      prompt_positions: [{ id: 'synthetic-position', name: '合成插入位置', anchor: 'instructions', side: 'before_setting_position', order: 1 }],
    })
    nativeSettings.versions[0].entries.push({ id: 'synthetic-option', kind: 'normal', title: '合成选项', content: '合成条目正文', group_id: 'synthetic-folder',
      enabled: true, trigger_mode: 'always', position: 'instructions', prompt_position_id: 'synthetic-position', insert_role: 'system' })
    nativeRoot.setting_library = JSON.stringify(nativeSettings)
    const nativeDocument = { displayName: 'synthetic-card.json', mimeType: 'application/json', base64: Buffer.from(JSON.stringify(nativeRoot)).toString('base64') }
    const first = transfer.commit(transfer.prepare([nativeDocument], 'eleckoi').token).importedCharacterIds[0]!
    const second = transfer.commit(transfer.prepare([nativeDocument], 'eleckoi').token).importedCharacterIds[0]!
    expect(second).not.toBe(first)
    for (const id of [first, second]) {
      const stored = settings.get(id)
      expect(stored.entries.find(entry => entry.id === 'synthetic-option')).toMatchObject({ groupId: 'synthetic-folder', promptPositionId: 'synthetic-position', enabled: true })
      expect(stored.groups[0]!.id).toBe('synthetic-folder')
      expect(stored.promptPositions[0]!.id).toBe('synthetic-position')
      expect(stored.entries.every(entry => entry.kind !== 'opening')).toBe(true)
      expect(new CharacterOpeningRepository(database).get(id).openingMessages.map(item => item.variableVersionId)).toEqual(['example-variables', 'example-advanced-variables'])
    }
    const standalone = parseSettingLibraryFile(serializeSettingLibrary(settings.get(first)), 'eleckoi')
    const saved = settings.save(first, importLibraryAsVersion(settings.get(first), standalone))
    expect(saved.entries.find(entry => entry.id === 'synthetic-option')).toMatchObject({ groupId: 'synthetic-folder', promptPositionId: 'synthetic-position' })
    const changed = settings.updateEntries(first, [{ id: 'synthetic-option', changes: { enabled: false } }])
    expect(changed[0]!.enabled).toBe(false)
    expect(settings.get(second).entries.find(entry => entry.id === 'synthetic-option')!.enabled).toBe(true)
    const otherPreset = presets.import(document('example.preset.json'), 'eleckoi').preset
    expect(otherPreset.id).not.toBe(imported.id)
    presets.updateEntries(imported.id, [{ id: 'example-brief', changes: { enabled: false } }, { id: 'example-detailed', changes: { enabled: true } }])
    expect(presets.get(otherPreset.id).entries.find(entry => entry.id === 'example-brief')!.enabled).toBe(true)
    const openings = new CharacterOpeningRepository(database)
    const invalid = structuredClone(openings.get(first))
    invalid.openingMessages[0]!.variableVersionId = 'synthetic-missing-version'
    expect(() => openings.save(first, invalid)).toThrow(/绑定的变量版本不存在/)
    expect(openings.get(first).openingMessages[0]!.variableVersionId).toBe('example-variables')
    expect(database.native.pragma('foreign_key_check')).toEqual([])
  }, 30000)
})
