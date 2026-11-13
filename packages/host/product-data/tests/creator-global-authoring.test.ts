import { Context } from '@deepseek-ai/cordis'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import productDataPlugin from '@eleckoi/dsh-product-data'
import { creatorCapabilities } from '../src/domain/creatorStudio/capabilities'
import { rulesForSurface } from '../../../shared/src/foundation/regex/RegexRuleProcessor'

const cleanups: Array<() => void | Promise<void>> = []
afterEach(async () => { vi.restoreAllMocks(); for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); vi.unstubAllEnvs() })
async function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'eleckoi-global-authoring-'))
  cleanups.push(() => { const child = relative(tmpdir(), root); if (!child || child.startsWith('..') || isAbsolute(child)) throw new Error('Unexpected cleanup path'); rmSync(root, { recursive: true, force: true }) })
  vi.stubEnv('ELECKOI_DATABASE_PATH', join(root, 'product.sqlite')); vi.stubEnv('ELECKOI_MEDIA_ROOT', join(root, 'media'))
  const ctx = new Context(); cleanups.push(() => ctx.fiber.dispose()); await ctx.plugin(productDataPlugin)
  const data = ctx.eleckoiProductData, characterId = 'synthetic-global-author'
  data.createCharacter({ id: characterId, name: 'Synthetic authoring target' })
  data.saveSettingLibrary(characterId, data.readSettingLibrary(characterId))
  const capabilities = creatorCapabilities(data)
  const call = (id: string, input: unknown = {}, selected = '') => capabilities.find(item => item.id === id)!.execute(selected, input) as any
  return { ctx, data, call, characterId }
}
const global = { scope: 'global' as const }
const rule = { name: 'Synthetic rule', pattern: 'TOKEN', replacement: 'Synthetic replacement', targets: ['AiOutput'], enabled: false,
  displayOnly: true, promptOnly: false, runOnEdit: false, order: 0 }

describe('Global authoring writes use native ownership, revisions and transactions', { timeout: 30_000 }, () => {
  it('creates, edits, groups, renames and removes only the explicitly addressed shared setting library', async () => {
    const f = await fixture(), character = f.data.readSettingLibrary(f.characterId)
    let result = f.call('settings.create_library', { target: global, expectedRevision: 0, name: 'Synthetic first' })
    const first = { ...global, libraryId: result.library.id }
    expect(result.library.enabled).toBe(false)
    result = f.call('settings.create_library', { target: global, expectedRevision: result.revision, name: 'Synthetic second' })
    const second = { ...global, libraryId: result.library.id }, untouched = f.data.readGlobalSettingLibraries().libraries[1]
    const write = (operation: string, input: object = {}) => f.call(`settings.${operation}`, { target: first, expectedRevision: f.data.readGlobalSettingLibraries().revision, ...input })
    const folder = write('create_group', { name: 'Synthetic folder', parentId: '', order: 1, treeViewOrder: 1 })
    const nested = write('create_group', { name: 'Synthetic child', parentId: folder.id, order: 2, treeViewOrder: 2 })
    const entry = write('create', { title: 'Synthetic entry', groupId: nested.id, content: 'Original $1 section $&', keywords: ['Synthetic retained keyword'], enabled: false })
    expect(entry.source.libraryId).toBe(first.libraryId)
    expect(write('update_group', { id: folder.id, changes: { name: 'Synthetic renamed folder' } }).name).toBe('Synthetic renamed folder')
    expect(write('update_many', { updates: [{ id: entry.id, changes: { title: 'Synthetic renamed entry', agentReadStrategy: 'keyword' } }] }).entries[0].keywords).toEqual(['Synthetic retained keyword'])
    const before = f.data.readGlobalSettingLibraries()
    expect(() => write('update_many', { updates: [{ id: entry.id, changes: { content: 'Unexpected' } }, { id: 'missing', changes: { enabled: true } }] })).toThrow()
    expect(() => write('update_group', { id: folder.id, changes: { parentId: nested.id } })).toThrow()
    expect(() => write('update', { id: entry.id, changes: { groupId: 'missing' } })).toThrow()
    expect(() => write('edit', { id: entry.id, old_string: 'missing', new_string: 'Unexpected' })).toThrow()
    expect(() => f.call('settings.update', { target: second, id: entry.id, expectedRevision: before.revision, changes: { content: 'Unexpected' } })).toThrow()
    expect(f.data.readGlobalSettingLibraries()).toEqual(before)
    const edited = write('edit', { id: entry.id, old_string: '$1 section', new_string: '$& $$ literal' })
    expect(edited).toMatchObject({ changed: true, replacements: 1, revision: before.revision + 1 })
    const read = f.call('settings.read', { target: first, id: entry.id })
    expect(read.content).toBe('Original $& $$ literal $&'); expect(read.enabled).toBe(false)
    expect(read.revision).toBe(edited.revision)
    expect(() => f.call('settings.update', { target: first, id: entry.id, changes: { enabled: true } })).toThrow('expectedRevision')
    expect(() => f.call('settings.update', { target: first, expectedRevision: before.revision, id: entry.id, changes: { enabled: true } })).toThrow('重新读取')
    result = write('update_library', { changes: { name: 'Synthetic renamed library', enabled: true } })
    expect(result.library.enabled).toBe(true); expect(f.call('settings.read', { target: first, id: entry.id }).enabled).toBe(false)
    expect(f.data.readGlobalSettingLibraries().libraries[1]).toEqual(untouched)
    expect(f.data.readSettingLibrary(f.characterId)).toEqual(character)
    const saved = f.data.readGlobalSettingLibraries()
    await f.ctx.fiber.dispose()
    const reopened = new Context(); cleanups.push(() => reopened.fiber.dispose()); await reopened.plugin(productDataPlugin)
    expect(reopened.eleckoiProductData.readGlobalSettingLibraries()).toEqual(saved)
    const operations = creatorCapabilities(reopened.eleckoiProductData)
    const execute = (id: string, input: object) => operations.find(item => item.id === id)!.execute('', input) as any
    const removed = execute('settings.remove_group', { target: first, expectedRevision: saved.revision, id: folder.id })
    expect(removed.removedEntryIds).toEqual([entry.id]); expect(removed.removedGroupIds).toEqual([folder.id, nested.id])
    execute('settings.remove_library', { target: first, expectedRevision: removed.revision })
    expect(reopened.eleckoiProductData.readGlobalSettingLibraries().libraries).toEqual([untouched])
  })

  it.each(['global', 'character'] as const)('edits %s script sources and folders without resending the library, preserving inactive versions and source rollback', async scope => {
    const f = await fixture()
    const target = { scope }, ownerId = scope === 'global' ? '' : f.characterId
    const untouchedScope = scope === 'global' ? 'character' : 'global', untouchedOwner = scope === 'global' ? f.characterId : ''
    const untouched = f.data.readScriptLibrary(untouchedScope, untouchedOwner)
    const write = (operation: string, input: object = {}) => f.call(`scripts.${operation}`, { target, expectedRevision: f.data.readScriptLibrary(scope, ownerId).revision, ...input }, f.characterId)
    const folder = write('create_folder', { name: 'Synthetic folder' })
    const created = write('create', { name: 'Synthetic script', folderId: folder.item.id, content: 'export default () => {}' })
    expect(created.item.enabled).toBe(false)
    write('update', { id: created.item.id, changes: { button: { enabled: false, buttons: [{ name: 'Synthetic retained button', visible: false }] } } })
    let state = f.data.readEditorLibraryVersions({ kind: 'scripts', scope, ownerId })
    state = { ...state, versions: [...state.versions, { ...state.versions[0]!, id: 'synthetic-inactive', name: 'Synthetic inactive' }] }
    f.data.saveEditorLibraries({ kind: 'scripts', documents: [JSON.stringify(f.data.readScriptLibrary(scope, ownerId))], versions: [state] })
    const inactive = f.data.readEditorLibraryVersions({ kind: 'scripts', scope, ownerId }).versions.find(item => item.id === 'synthetic-inactive')
    const updated = write('update', { id: created.item.id, changes: { content: 'export default () => { /* Synthetic saved tail */ }', data: { synthetic: 2 } } })
    expect(updated.item.enabled).toBe(false)
    expect(updated.item.button).toEqual({ enabled: false, buttons: [{ name: 'Synthetic retained button', visible: false }] })
    expect(() => write('update', { id: created.item.id, expectedRevision: created.revision, changes: { info: 'Unexpected' } })).toThrow('重新读取')
    expect(() => write('update', { id: created.item.id, changes: { content: '' , enabled: true } })).toThrow('源码为空')
    expect(() => write('remove_folder', { id: folder.item.id })).toThrow('空脚本文件夹')
    write('update_folder', { id: folder.item.id, changes: { name: 'Synthetic renamed' } })
    write('move', { id: created.item.id, folderId: '' }); write('remove_folder', { id: folder.item.id })
    write('configure', { changes: { enabled: true, variables: { synthetic: 'library setting' } } })
    const before = f.data.readScriptLibrary(scope, ownerId), workspace = f.data.readScriptWorkspace(scope, ownerId)
    const sourcePath = join(workspace.path, workspace.entries.find(item => item.id === created.item.id)!.file)
    expect(readFileSync(sourcePath, 'utf8')).toBe(updated.item.content)
    const service = (f.data as any).editorVersions
    const sync = vi.spyOn(service, 'sync').mockImplementation(() => { throw new Error('Synthetic named version failure') })
    expect(() => write('update', { id: created.item.id, changes: { content: 'export default () => { /* Unexpected */ }' } })).toThrow('Synthetic named version failure')
    sync.mockRestore()
    expect(f.data.readScriptLibrary(scope, ownerId)).toEqual(before); expect(readFileSync(sourcePath, 'utf8')).toBe(updated.item.content)
    const versions = f.data.readEditorLibraryVersions({ kind: 'scripts', scope, ownerId })
    expect(versions.versions.find(item => item.id === 'synthetic-inactive')).toEqual(inactive)
    expect(JSON.parse(versions.versions.find(item => item.id === versions.activeVersionId)!.content).trees.find((item: any) => item.id === created.item.id).content).toBe(updated.item.content)
    expect(f.data.readScriptLibrary(untouchedScope, untouchedOwner)).toEqual(untouched)
    write('remove', { id: created.item.id }); expect(existsSync(sourcePath)).toBe(false)
  })

  it('writes only the selected regex scope, updates active versions and effective enablement, and refuses preset writes', async () => {
    const f = await fixture(), presetId = f.data.readAgentPresetCatalog().activePresetIds.roleplay
    const collection = f.data.readRegexEditor({ scope: 'character', ownerId: f.characterId })
    f.data.saveRegexEditor({ ...collection, activeVersionId: 'synthetic-enablement', versions: [{ id: 'synthetic-enablement', name: 'Synthetic enablement', globalEnabledIds: [], characterEnabledIds: [], agentPresetEnabledIds: [] }] })
    const originalCharacter = f.data.readRegexLibrary('character', f.characterId), originalPreset = f.data.readRegexLibrary('preset', presetId)
    const write = (operation: string, input: object = {}, target: object = global) => {
      const current = f.call('regex.list', { target }, f.characterId)
      return f.call(`regex.${operation}`, { target, expectedRevision: current.revision, expectedOwnerRevision: current.ownerRevision, ...input }, f.characterId)
    }
    const first = write('create', { rule: { ...rule, enabled: true } })
    let state = f.data.readEditorLibraryVersions({ kind: 'regex', scope: 'global', ownerId: '' })
    state = { ...state, versions: [...state.versions, { ...state.versions[0]!, id: 'synthetic-inactive', name: 'Synthetic inactive' }] }
    f.data.saveEditorLibraries({ kind: 'regex', documents: [JSON.stringify(f.data.readRegexEditor({ scope: 'character', ownerId: f.characterId }))], versions: [state] })
    const inactive = f.data.readEditorLibraryVersions({ kind: 'regex', scope: 'global', ownerId: '' }).versions.find(item => item.id === 'synthetic-inactive')
    expect(rulesForSurface(f.data.readRegexRules(f.characterId), 'AiOutput', 'Display').map(item => item.id)).toContain(first.rule.id)
    const changed = write('update', { id: first.rule.id, changes: { replacement: 'Synthetic changed replacement' } })
    expect(changed.rule.enabled).toBe(true)
    const before = f.data.readRegexLibrary('global', '')
    expect(() => write('update', { id: first.rule.id, expectedRevision: first.revision, changes: { enabled: false } })).toThrow('重新读取')
    expect(() => write('update', { id: first.rule.id, changes: { pattern: '/(/g' } })).toThrow()
    const service = (f.data as any).editorVersions
    const sync = vi.spyOn(service, 'sync').mockImplementation(() => { throw new Error('Synthetic named version failure') })
    expect(() => write('update', { id: first.rule.id, changes: { replacement: 'Unexpected' } })).toThrow('Synthetic named version failure')
    sync.mockRestore(); expect(f.data.readRegexLibrary('global', '')).toEqual(before)
    write('configure', { enabled: false }); expect(rulesForSurface(f.data.readRegexRules(f.characterId), 'AiOutput', 'Display')).toEqual([])
    write('configure', { enabled: true })
    const versions = f.data.readEditorLibraryVersions({ kind: 'regex', scope: 'global', ownerId: '' })
    expect(versions.versions.find(item => item.id === 'synthetic-inactive')).toEqual(inactive)
    expect(JSON.parse(versions.versions.find(item => item.id === versions.activeVersionId)!.content).rules[0].replacement).toBe(changed.rule.replacement)
    expect(f.data.readRegexLibrary('character', f.characterId).rules).toEqual(originalCharacter.rules)
    expect(f.data.readRegexLibrary('preset', presetId).rules).toEqual(originalPreset.rules)
    const target = { scope: 'preset', presetId }
    const presetBeforeDeniedCalls = f.data.readRegexLibrary('preset', presetId)
    expect(() => f.call('regex.list', { target })).toThrow()
    expect(() => f.call('regex.create', { target, expectedRevision: originalPreset.revision, rule })).toThrow()
    expect(f.data.readRegexLibrary('preset', presetId)).toEqual(presetBeforeDeniedCalls)
    const removed = write('remove', { id: first.rule.id }); expect(removed.removedId).toBe(first.rule.id)
    expect(f.data.readRegexRules(f.characterId).versions[0]!.globalEnabledIds).not.toContain(first.rule.id)
  })

  it('keeps unrelated rules excluded by the selected enablement combination when changing one replacement', async () => {
    const f = await fixture(), ids = ['synthetic-included', 'synthetic-excluded']
    f.data.saveRegexEditor({ ...f.data.readRegexEditor({ scope: 'character', ownerId: f.characterId }),
      globalRules: ids.map(id => ({ ...rule, id, targets: ['AiOutput'], enabled: true })), activeVersionId: 'synthetic-combination',
      versions: [{ id: 'synthetic-combination', name: 'Synthetic combination', globalEnabledIds: [ids[0]!], characterEnabledIds: [], agentPresetEnabledIds: [] }] })
    const enabled = () => rulesForSurface(f.data.readRegexRules(f.characterId), 'AiOutput', 'Display').map(item => item.id)
    expect(enabled()).toEqual([ids[0]])
    let read = f.call('regex.list', { target: global })
    f.call('regex.update', { target: global, expectedRevision: read.revision, id: ids[0], changes: { replacement: 'Synthetic modified replacement' } })
    const after = f.data.readRegexRules(f.characterId)
    expect(after.activeVersionId).toBe('synthetic-combination')
    expect(enabled()).toEqual([ids[0]])
    read = f.call('regex.list', { target: global })
    f.call('regex.update', { target: global, expectedRevision: read.revision, id: ids[1], changes: { enabled: true } })
    expect(enabled()).toEqual(ids)
  })
})
