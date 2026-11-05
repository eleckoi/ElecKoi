import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import * as Cordis from '@deepseek-ai/cordis'
import TypertRegistry, { type TypertContribution } from '@deepseek-ai/dsh-typert-registry'
import TypertGatewayService from '@deepseek-ai/dsh-api-gateway'
import RemoteAccessService from '@deepseek-ai/dsh-api-remote-access'
import productDataPlugin from '@eleckoi/dsh-product-data'
import { LocalMediaStore } from '@eleckoi/dsh-product-data/media'
import { emptyEntry } from '@product-data/domain/settingLibraries'
import { ElecKoiCharactersApi, ProductRecordChangeFeed, CharacterConfigurationChangeFeed, ConversationChangeFeed } from '@eleckoi/dsh-product-api'
import { TYPERT } from '@eleckoi/dsh-product-api/typert'
import { ownerPeer } from '../../../../tests/support/owner-peer.js'
import { afterEach, expect, it, vi } from 'vitest'

const cleanups: Array<() => void | Promise<void>> = []
afterEach(async () => {
  vi.restoreAllMocks()
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
  vi.unstubAllEnvs()
})
async function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'eleckoi-character-copy-'))
  cleanups.push(() => rmSync(directory, { recursive: true, force: true }))
  vi.stubEnv('ELECKOI_DATABASE_PATH', join(directory, 'product.sqlite'))
  vi.stubEnv('ELECKOI_MEDIA_ROOT', join(directory, 'media'))
  vi.stubEnv('ELECKOI_WORKSPACE_ROOT', join(directory, 'workspace'))
  const connect = async () => {
    const ctx = new Cordis.Context(); cleanups.push(() => ctx.fiber.dispose())
    await ctx.plugin(TypertRegistry)
    cleanups.push(ctx.typert.register(TYPERT as TypertContribution))
    await ctx.plugin(productDataPlugin)
    for (const [key, feed] of [['eleckoiProductRecordChanges', new ProductRecordChangeFeed()],
      ['eleckoiCharacterConfigurationChanges', new CharacterConfigurationChangeFeed()],
      ['eleckoiConversationChanges', new ConversationChangeFeed()]] as const) {
      ctx.provide(key, feed as any); cleanups.push(() => feed.close())
    }
    ctx.provide('eleckoiRoleplaySessions', {} as any); ctx.provide('eleckoiSessionEditor', {} as any)
    await ctx.plugin(RemoteAccessService); await ctx.plugin(TypertGatewayService); await ctx.plugin(ElecKoiCharactersApi)
    return ctx
  }
  const ctx = await connect(), data = ctx.eleckoiProductData
  const avatar = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
  const source = data.createCharacter({ id: 'synthetic-source', name: '合成角色', avatar, group: '合成分组', profileLike: 'Synthetic profile',
    persona: { assistant_name: 'Synthetic identity', assistant_avatar: avatar, assistant_square: '', assistant_cover: '', opening: 'Synthetic opening', show_opening: true } }).items[0]!
  data.updateCharacter({ ...source, chatBackground: '' })
  const duplicate = (id = 'synthetic-source') => ctx.typertGateway.invoke({ peer: ownerPeer(ctx),
    namespace: 'eleckoiCharacters', method: 'duplicate', args: { characterId: id } }) as Promise<{ characterId: string; collection: ReturnType<typeof data.readCharacters> }>
  return { directory, ctx, data, connect, duplicate }
}

it('copies full native card data through the strict Remote and preserves independent resources after reopening', async () => {
  const f = await fixture(), sourceId = 'synthetic-source', data = f.data
  const long = 'Synthetic long body '.repeat(20)
  const initialLibrary = data.readSettingLibrary(sourceId)
  const entries = Array.from({ length: 10001 }, (_, index) => ({ ...emptyEntry(`synthetic-entry-${index}`),
    title: `Synthetic entry ${index}`, keywords: [`synthetic-key-${index}`], content: `${long}${index}:tail`, treeViewOrder: index + 1, openingMessages: [] }))
  const setting = data.saveSettingLibrary(sourceId, { ...initialLibrary, entries: [...initialLibrary.entries, ...entries] })
  const initialVariables = data.readVariableConfig(sourceId)
  const config = data.saveVariableConfig(sourceId, { ...initialVariables,
    variables: Array.from({ length: 10001 }, (_, index) => ({ id: `synthetic-var-${index}`, title: `field_${index}`, objectId: '',
      type: 'string', defaultValue: JSON.stringify(`${long}${index}:tail`), description: '', updateRule: '', readMode: 'on_demand',
      enabled: true, order: index + 1, treeViewOrder: index, createdAt: '', updatedAt: '' })) })
  data.saveScriptLibrary({ scope: 'character', ownerId: sourceId, enabled: true, revision: 0, variables: { synthetic: 9 }, trees: [{
    type: 'script', id: 'synthetic-script', name: 'Synthetic script', enabled: true, content: "import '../helpers/data.js'; export default () => 7;", info: '', data: {},
    button: { enabled: false, buttons: [] }, export_with: { data: true, button: true }, runtime: { kind: 'eleckoi-module', apiVersion: 1 },
  }] })
  const opening = data.readCharacterOpenings(sourceId)
  const sourceOpenings = data.saveCharacterOpenings(sourceId, { ...opening, enabled: true,
    openingMessages: [{ id: 'synthetic-main-opening', title: '合成主开场', content: long, variableVersionId: config.activeVersionId },
      { id: 'synthetic-backup-opening', title: '合成备用开场', content: '合成备用正文' }],
    defaultOpeningMessageId: 'synthetic-main-opening' })
  const scriptPath = data.readScriptWorkspace('character', sourceId).path
  mkdirSync(join(scriptPath, 'helpers')); writeFileSync(join(scriptPath, 'helpers/data.js'), 'export const synthetic = 7;')
  const regex = data.readRegexEditor({ scope: 'character', ownerId: sourceId })
  data.saveRegexEditor({ ...regex, characterEnabled: false, characterRules: [{ id: 'synthetic-regex', name: 'Synthetic regex',
    pattern: 'synthetic', replacement: 'example', targets: ['AiOutput'], enabled: true, displayOnly: true, promptOnly: false, runOnEdit: false, order: 0 }] })
  for (const kind of ['scripts', 'regex'] as const) {
    const versions = data.readEditorLibraryVersions({ kind, scope: 'character', ownerId: sourceId })
    const archived = JSON.parse(versions.versions[0]!.content)
    if (kind === 'scripts') archived.trees[0].content = 'export default () => 3;'
    else archived.rules[0].replacement = 'archived replacement'
    const content = JSON.stringify(archived)
    const document = kind === 'scripts' ? data.readScriptLibrary('character', sourceId) : data.readRegexEditor({ scope: 'character', ownerId: sourceId })
    data.saveEditorLibraries({ kind, documents: [JSON.stringify(document)], versions: [{ ...versions,
      versions: [...versions.versions, { id: 'synthetic-archive', name: 'Synthetic archive', content }] }] })
  }
  const repository = data.frontendProjects(), owner = { scope: 'character' as const, characterId: sourceId }
  repository.importProject(owner, { name: 'Synthetic project', files: [{ path: 'index.html', content: '<!doctype html><body>Synthetic page</body>' },
    { path: 'assets/data.bin', content: 'AP+A', encoding: 'base64' }] })
  repository.setMessageRenderer(owner, false)
  const original = { card: data.readCharacters().items[0], setting: data.readSettingLibrary(sourceId), config: data.readVariableConfig(sourceId),
    script: data.readScriptLibrary('character', sourceId), frontend: repository.workspace(owner) }
  const result = await f.duplicate(), id = result.characterId
  const copied = result.collection.items.find(item => item.id === id)!
  expect(copied).toMatchObject({ name: '合成角色（副本）', group: '合成分组', profileLike: 'Synthetic profile', chatBackground: '', persona: { assistant_name: 'Synthetic identity' } })
  expect(data.readCharacters().active_character_id).toBe(sourceId)
  expect(data.readCharacterOpenings(id)).toEqual({ ...sourceOpenings, characterId: id })
  const copiedSetting = data.readSettingLibrary(id), copiedConfig = data.readVariableConfig(id)
  expect(copiedSetting.entries.filter(item => item.kind === 'normal')).toHaveLength(10001)
  for (const index of [0, 5000, 10000]) {
    expect(copiedSetting.entries.find(item => item.id === `synthetic-entry-${index}`)).toMatchObject({ content: `${long}${index}:tail`, keywords: [`synthetic-key-${index}`] })
    expect(copiedConfig.variables[index]).toEqual(config.variables[index])
  }
  expect(copiedConfig.initialStateJson).toBe(config.initialStateJson)
  const contentOnly = (value: unknown) => JSON.stringify(value, (key, item) => key === 'updatedAt' || key === 'createdAt' ? undefined : item)
  expect(contentOnly(copiedSetting.versions) === contentOnly(setting.versions)).toBe(true)
  expect(data.readScriptLibrary('character', id)).toMatchObject({ enabled: true, variables: { synthetic: 9 }, trees: original.script.trees })
  expect(readFileSync(join(data.readScriptWorkspace('character', id).path, 'helpers/data.js'), 'utf8')).toBe('export const synthetic = 7;')
  const copiedRegex = data.readRegexEditor({ scope: 'character', ownerId: id })
  expect(copiedRegex.characterEnabled).toBe(false)
  expect(copiedRegex.characterRules[0]!.id).not.toBe('synthetic-regex')
  for (const kind of ['scripts', 'regex'] as const) {
    const versions = data.readEditorLibraryVersions({ kind, scope: 'character', ownerId: id })
    expect(versions.versions).toHaveLength(2)
    const archive = JSON.parse(versions.versions.find(item => item.id === 'synthetic-archive')!.content)
    if (kind === 'scripts') expect(archive.trees[0].content).toBe('export default () => 3;')
    else {
      expect(archive.rules[0].replacement).toBe('archived replacement')
      expect(archive.rules[0].id).toBe(copiedRegex.characterRules[0]!.id)
    }
  }
  const target = { scope: 'character' as const, characterId: id }, projects = repository.workspace(target)
  expect(projects.messageRendererEnabled).toBe(false); expect(projects.projects).toHaveLength(1)
  expect(projects.selectedProjectId).not.toBe(original.frontend.selectedProjectId)
  expect(repository.readFile(target, projects.selectedProjectId!, 'assets/data.bin', 'base64').content).toBe('AP+A')
  expect(data.readSettingLibrary(sourceId)).toEqual(original.setting); expect(data.readVariableConfig(sourceId)).toEqual(original.config)
  expect(repository.workspace(owner)).toEqual(original.frontend)
  repository.writeFile(target, projects.selectedProjectId!, { path: 'index.html', content: 'Copied page edited' })
  expect(repository.readFile(owner, original.frontend.selectedProjectId!).content).toContain('Synthetic page')
  expect((await f.duplicate()).collection.items.at(-1)!.name).toBe('合成角色（副本 2）')
  await f.ctx.fiber.dispose()
  const reopened = await f.connect()
  expect(reopened.eleckoiProductData.readVariableConfig(id).initialStateJson).toBe(config.initialStateJson)
  expect(reopened.eleckoiProductData.readSettingLibrary(id).entries.at(-1)!.content).toBe(`${long}10000:tail`)
  const reopenedProjects = reopened.eleckoiProductData.frontendProjects()
  expect(reopenedProjects.readFile(target, projects.selectedProjectId!).content).toBe('Copied page edited')
  reopened.eleckoiProductData.deleteCharacters([sourceId])
  expect(reopened.eleckoiProductData.readCharacterOpenings(id)).toEqual({ ...sourceOpenings, characterId: id })
  const media = new LocalMediaStore(join(f.directory, 'media'))
  expect(readFileSync(media.pathForReference(copied.persona!.assistant_avatar)!).length).toBeGreaterThan(0)
  expect(reopenedProjects.readFile(target, projects.selectedProjectId!).content).toBe('Copied page edited')
  const connection = new Database(join(f.directory, 'product.sqlite')); cleanups.push(() => { connection.close() })
  expect(connection.pragma('foreign_key_check')).toEqual([])
}, 60000)

it('rolls back a failed resource copy and rejects a missing source without publishing success', async () => {
  const f = await fixture(), repository = f.data.frontendProjects()
  repository.importProject({ scope: 'character', characterId: 'synthetic-source' }, { html: '<!doctype html><body>Synthetic page</body>' })
  const before = f.data.readCharacters(), projects = readdirSync(repository.root)
  const publish = vi.spyOn(f.ctx.eleckoiProductRecordChanges, 'publish')
  const original = repository.copyCharacterOwner.bind(repository)
  vi.spyOn(repository, 'copyCharacterOwner').mockImplementation((source, target, operation) => original(source, target, copy => operation(() => {
    copy(); throw new Error('Synthetic resource failure')
  })))
  await expect(f.duplicate()).rejects.toThrow('Synthetic resource failure')
  expect(f.data.readCharacters()).toEqual(before)
  expect(readdirSync(repository.root)).toEqual(projects)
  expect(publish).not.toHaveBeenCalled()
  await expect(f.duplicate('synthetic-missing')).rejects.toThrow('找不到要复制')
  expect(publish).not.toHaveBeenCalled()
}, 30000)
