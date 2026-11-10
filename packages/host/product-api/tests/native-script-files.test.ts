import RemoteAccessService from '@deepseek-ai/dsh-api-remote-access'
import { ownerPeer } from '../../../../tests/support/owner-peer.js'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative } from 'node:path'
import * as Cordis from '@deepseek-ai/cordis'
import TypertRegistry, { type TypertContribution } from '@deepseek-ai/dsh-typert-registry'
import TypertGatewayService from '@deepseek-ai/dsh-api-gateway'
import WebServer from '@deepseek-ai/dsh-host-webserver'
import productDataPlugin from '@eleckoi/dsh-product-data'
import { CharacterConfigurationChangeFeed, ProductRecordChangeFeed, ElecKoiAuthorScriptsApi, ElecKoiCharacterConfigurationApi,
  ElecKoiVariableProcessing, eleckoiScriptAssetsPlugin, type NativeAuthorScriptCatalog } from '@eleckoi/dsh-product-api'
import { TYPERT } from '@eleckoi/dsh-product-api/typert'
import { afterEach, expect, it, vi } from 'vitest'

const cleanups: Array<() => void | Promise<void>> = []
afterEach(async () => {
  for (const close of cleanups.splice(0).reverse()) await close()
  vi.unstubAllEnvs()
})

it('serves registered modules and relative resources through the actual Host, Remote and WebServer', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'eleckoi-native-script-files-'))
  cleanups.push(() => {
    const child = relative(tmpdir(), directory)
    if (!child || child.startsWith('..') || isAbsolute(child)) throw new Error('Unexpected fixture cleanup path')
    rmSync(directory, { recursive: true, force: true })
  })
  vi.stubEnv('ELECKOI_DATABASE_PATH', join(directory, 'product.sqlite'))
  vi.stubEnv('ELECKOI_MEDIA_ROOT', join(directory, 'media'))
  vi.stubEnv('ELECKOI_WORKSPACE_ROOT', directory)
  const ctx = new Cordis.Context(); cleanups.push(() => ctx.fiber.dispose())
  await ctx.plugin(TypertRegistry)
  const unregister = ctx.typert.register(TYPERT as TypertContribution); cleanups.push(unregister)
  await ctx.plugin(productDataPlugin)
  const feed = new CharacterConfigurationChangeFeed()
  ctx.provide('eleckoiCharacterConfigurationChanges', feed); cleanups.push(() => feed.close())
  const records = new ProductRecordChangeFeed(); ctx.provide('eleckoiProductRecordChanges', records); cleanups.push(() => records.close())
  await ctx.plugin(RemoteAccessService)
  await ctx.plugin(TypertGatewayService)
  await ctx.plugin(ElecKoiCharacterConfigurationApi)
  const processor = new ElecKoiVariableProcessing(ctx.eleckoiProductData)
  ctx.provide('eleckoiVariableProcessing', processor); cleanups.push(() => processor.close())
  await ctx.plugin(ElecKoiAuthorScriptsApi)
  await ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 })
  ctx.eleckoiProductData.createCharacter({ id: 'synthetic-character', name: 'Synthetic character' })
  const conversationId = ctx.eleckoiProductData.createConversation({ metadata: { characterId: 'synthetic-character' } }).conversation.id
  ctx.eleckoiProductData.saveScriptLibrary({ scope: 'character', ownerId: 'synthetic-character', enabled: true, revision: 0,
    trees: [{ type: 'script', id: 'synthetic-script', name: 'Synthetic script', enabled: true,
      content: "import { derive } from '../helpers/derive.js'; export default () => derive(2);", info: '', data: {},
      button: { enabled: false, buttons: [] }, export_with: { data: true, button: true }, runtime: { kind: 'eleckoi-module', apiVersion: 1 } }], variables: {} })
  const invoke = (method: string, args: Record<string, unknown>) => ctx.typertGateway.invoke({ peer: ownerPeer(ctx), namespace: 'eleckoiCharacterConfiguration', method, args }) as Promise<any>
  const openings = await invoke('readCharacterOpenings', { characterId: 'synthetic-character' })
  const savedOpenings = await invoke('saveCharacterOpenings', { characterId: 'synthetic-character', value: { ...openings,
    openingMessages: openings.openingMessages.map((message: any) => ({ ...message, content: '合成独立开场白' })) } })
  expect(savedOpenings.openingMessages[0].content).toBe('合成独立开场白')
  expect((await invoke('readSettingLibrary', { characterId: 'synthetic-character' })).entries).toEqual([])
  const settingLibrary = await invoke('readSettingLibrary', { characterId: 'synthetic-character' })
  const importedOpening = { ...savedOpenings.openingMessages[0], id: 'synthetic-imported-opening', title: '合成导入开场白' }
  await invoke('importSettingLibrary', { characterId: 'synthetic-character', library: settingLibrary, openingImports: [importedOpening] })
  const imported = await invoke('readCharacterOpenings', { characterId: 'synthetic-character' })
  expect(imported.defaultOpeningMessageId).toBe(savedOpenings.defaultOpeningMessageId)
  expect(imported.openingMessages.slice(0, -1)).toEqual(savedOpenings.openingMessages)
  expect(imported.openingMessages.at(-1)).toEqual(importedOpening)
  const unlinked = { ...importedOpening, id: 'synthetic-unlinked-opening', variableVersionId: 'synthetic-missing-variables' }
  await invoke('importSettingLibrary', { characterId: 'synthetic-character', library: settingLibrary, openingImports: [unlinked] })
  expect((await invoke('readSettingLibrary', { characterId: 'synthetic-character' })).name).toBe(settingLibrary.name)
  expect(await invoke('readCharacterOpenings', { characterId: 'synthetic-character' })).toEqual({ ...imported, openingMessages: [...imported.openingMessages, unlinked] })

  const workspace = () => ctx.typertGateway.invoke({ peer: ownerPeer(ctx), namespace: 'eleckoiCharacterConfiguration', method: 'readScriptWorkspace',
    args: { scope: 'character', ownerId: 'synthetic-character' } }) as Promise<{ path: string; version: string; entries: Array<{ id: string; file: string }> }>
  const before = await workspace()
  mkdirSync(join(before.path, 'helpers'))
  writeFileSync(join(before.path, 'helpers', 'derive.js'), 'export const derive = n => n * 2;')
  const ready = await workspace(), base = `http://127.0.0.1:${ctx.webServer.port}/eleckoi/scripts/character/synthetic-character/${ready.version}`
  const catalog = () => ctx.typertGateway.invoke({ peer: ownerPeer(ctx), namespace: 'eleckoiAuthorScripts', method: 'read', args: { conversationId } }) as Promise<NativeAuthorScriptCatalog>
  const loaded = await catalog()
  expect(loaded.scripts).toHaveLength(1)
  expect(loaded.scripts[0]).toMatchObject({ scope: 'character', ownerId: 'synthetic-character', id: 'synthetic-script',
    entryUrl: `/eleckoi/scripts/character/synthetic-character/${ready.version}/${ready.entries[0]!.file}` })
  const identity = { scope: 'character', ownerId: 'synthetic-character', scriptId: 'synthetic-script' }
  const settings = await ctx.typertGateway.invoke({ peer: ownerPeer(ctx), namespace: 'eleckoiAuthorScripts', method: 'getSettings',
    args: { conversationId, version: loaded.version, identity, target: 'script' }, signal: new AbortController().signal }) as any
  const saved = await ctx.typertGateway.invoke({ peer: ownerPeer(ctx), namespace: 'eleckoiAuthorScripts', method: 'setSettings',
    args: { conversationId, version: loaded.version, identity, target: 'script', settingsJson: '{"amount":3}', expectedRevision: settings.revision },
    signal: new AbortController().signal })
  expect(saved).toEqual({ revision: settings.revision + 1, values: { amount: 3 } })
  expect((await workspace()).version).toBe(ready.version); expect((await catalog()).version).toBe(loaded.version)
  expect(ctx.eleckoiProductData.readScriptLibrary('character', 'synthetic-character').trees[0]!.data).toEqual({ amount: 3 })
  const callSettings = (changes: object, signal = new AbortController().signal) => ctx.typertGateway.invoke({ peer: ownerPeer(ctx),
    namespace: 'eleckoiAuthorScripts', method: 'setSettings', args: { conversationId, version: loaded.version, identity,
      target: 'script', settingsJson: '{"amount":9}', expectedRevision: settings.revision, ...changes }, signal })
  await expect(callSettings({})).rejects.toThrow('重新读取')
  await expect(callSettings({ identity: { ...identity, ownerId: 'synthetic-other' } })).rejects.toThrow('不属于')
  await expect(callSettings({ version: 'synthetic-retired' })).rejects.toThrow('程序已变化')
  const cancelled = new AbortController(); cancelled.abort(new Error('Synthetic cancelled settings'))
  await expect(callSettings({}, cancelled.signal)).rejects.toThrow('was aborted')
  expect(ctx.eleckoiProductData.readScriptLibrary('character', 'synthetic-character').trees[0]!.data).toEqual({ amount: 3 })
  const plugin = ctx.plugin(eleckoiScriptAssetsPlugin); await plugin
  const entry = await fetch(`http://127.0.0.1:${ctx.webServer.port}${loaded.scripts[0]!.entryUrl}`)
  expect(entry.status).toBe(200); expect(entry.headers.get('content-type')).toContain('text/javascript')
  expect(await entry.text()).toContain("from '../helpers/derive.js'")
  const helper = await fetch(`${base}/helpers/derive.js`)
  expect(helper.status).toBe(200); expect(await helper.text()).toBe('export const derive = n => n * 2;')
  expect(helper.headers.get('cache-control')).toBe('no-store')
  const head = await fetch(`${base}/helpers/derive.js`, { method: 'HEAD' })
  expect(head.status).toBe(200); expect(await head.text()).toBe('')
  expect((await fetch(`${base}/missing.js`)).status).toBe(404)
  expect((await fetch(`${base}/helpers/derive.js`, { method: 'POST' })).status).toBe(405)
  expect((await fetch(`${base}/%ZZ`)).status).toBe(400)
  const abort = new AbortController(); cleanups.push(() => abort.abort())
  const changes = await ctx.typertGateway.stream({ peer: ownerPeer(ctx), namespace: 'eleckoiCharacterConfiguration', method: 'changes', args: {}, signal: abort.signal })
  const iterator = changes[Symbol.asyncIterator]()
  expect((await iterator.next()).value).toEqual({ kind: 'snapshot' })
  writeFileSync(join(before.path, 'helpers', 'derive.js'), 'export const derive = n => n * 3;')
  expect((await iterator.next()).value).toEqual({ kind: 'configuration', domain: 'scripts' })
  expect((await workspace()).version).not.toBe(ready.version)
  const changed = await catalog()
  expect(changed.version).not.toBe(loaded.version)
  expect(changed.scripts[0]!.source).toBe(loaded.scripts[0]!.source)
  expect(changed.scripts[0]!.entryUrl).not.toBe(loaded.scripts[0]!.entryUrl)
  expect((await fetch(`${base}/helpers/derive.js`)).status).toBe(409)
  abort.abort()
  await plugin.dispose()
  expect((await fetch(`${base}/${ready.entries[0]!.file}`)).status).toBe(404)
  expect(ctx.get('eleckoiCompatibilityApi', false)).toBeUndefined()
}, 30000)
