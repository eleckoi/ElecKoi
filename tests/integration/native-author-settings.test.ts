import { clientBundlePath } from '../support/client-bundle.js'
import RemoteAccessService from '@deepseek-ai/dsh-api-remote-access'
import { ownerPeer } from '../support/owner-peer.js'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative } from 'node:path'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import Database from 'better-sqlite3'
import * as Cordis from '@deepseek-ai/cordis'
import TypertRegistry, { type TypertContribution } from '@deepseek-ai/dsh-typert-registry'
import TypertGatewayService from '@deepseek-ai/dsh-api-gateway'
import { TYPERT } from '@eleckoi/dsh-product-api/typert'
import { TYPERT_REMOTE } from '@eleckoi/dsh-product-api/remote'
import { ElecKoiCharacterConfigurationApi, ElecKoiAgentPresetsApi, CharacterConfigurationChangeFeed, ProductRecordChangeFeed } from '@eleckoi/dsh-product-api'
import productDataPlugin from '@eleckoi/dsh-product-data'
import { NativeAuthorClient } from '@eleckoi/dsh-client-author/runtime'
import type { AuthorSettingLibrary, ElecKoiAuthorApi } from '@eleckoi/author-sdk'
import { AUTHOR_SETTING_ENTRY_MUTABLE_FIELDS } from '@eleckoi/author-sdk'
import { settingLibraryEntryChangesSchema } from '../../packages/shared/src/contracts/settingLibrary/schemas'
import { emptyEntry } from '../../packages/host/product-data/src/domain/settingLibraries/index'
import { afterEach, describe, expect, it, vi } from 'vitest'
// @ts-expect-error The browser test runtime does not publish declarations.
import { JSDOM } from 'jsdom'

const cleanups: Array<() => void | Promise<void>> = []
afterEach(async () => { for (const close of cleanups.splice(0).reverse()) await close() })

async function harness() {
  const directory = mkdtempSync(join(tmpdir(), 'eleckoi-native-settings-')), path = join(directory, 'product.sqlite3')
  cleanups.push(() => {
    const child = relative(tmpdir(), directory)
    if (!child || child.startsWith('..') || isAbsolute(child)) throw new Error('Unexpected fixture cleanup path')
    rmSync(directory, { recursive: true, force: true })
  })
  const previous = Object.fromEntries(['ELECKOI_DATABASE_PATH', 'ELECKOI_MEDIA_ROOT', 'ELECKOI_WORKSPACE_ROOT'].map(key => [key, process.env[key]]))
  process.env.ELECKOI_DATABASE_PATH = path
  process.env.ELECKOI_MEDIA_ROOT = join(directory, 'media')
  process.env.ELECKOI_WORKSPACE_ROOT = directory
  cleanups.push(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value
    }
  })
  const ctx = new Cordis.Context(), client = new Cordis.Context()
  await ctx.plugin(TypertRegistry)
  const unregister = ctx.typert.register(TYPERT as TypertContribution)
  cleanups.push(async () => { unregister(); await ctx.fiber.dispose() })
  await ctx.plugin(productDataPlugin)
  const changes = new CharacterConfigurationChangeFeed(), publish = vi.spyOn(changes, 'publish')
  ctx.provide('eleckoiCharacterConfigurationChanges', changes)
  cleanups.push(() => changes.close())
  const records = new ProductRecordChangeFeed()
  ctx.provide('eleckoiProductRecordChanges', records)
  cleanups.push(() => records.close())
  await ctx.plugin(RemoteAccessService)
  await ctx.plugin(TypertGatewayService); await ctx.plugin(ElecKoiCharacterConfigurationApi)
  await ctx.plugin(ElecKoiAgentPresetsApi)
  const data = ctx.eleckoiProductData
  data.createCharacter({ id: 'synthetic-character', name: 'Synthetic character' })
  data.createCharacter({ id: 'synthetic-other-character', name: 'Synthetic other character' })
  const base = data.readSettingLibrary('synthetic-character')
  const entry = { ...emptyEntry('synthetic-entry'), title: 'Synthetic setting', kind: 'normal' as const,
    content: '{{char}} meets {{user}}', openingMessages: [],
    agentReadStrategy: 'normal' as const, triggerMode: 'agent_tool' as const, enabled: true }
  const alternative = { ...entry, id: 'synthetic-alternative', title: 'Synthetic alternative', enabled: false }
  data.saveSettingLibrary(base.characterId, { ...base, entries: [...base.entries, entry, alternative] })
  const draft = data.createAgentPreset('Synthetic preset', '', 'roleplay')
  const preset = data.saveAgentPreset({ ...draft, entries: [...draft.entries,
    { ...entry, content: 'Synthetic preset option A', triggerMode: 'always', position: 'instructions' },
    { ...alternative, content: 'Synthetic preset option B', triggerMode: 'always', position: 'instructions' }] }, [])
  const otherDraft = data.createAgentPreset('Synthetic other preset', '', 'roleplay')
  const otherPreset = data.saveAgentPreset({ ...otherDraft, entries: [...otherDraft.entries,
    { ...entry, content: 'Synthetic other preset option', triggerMode: 'always', position: 'instructions' }] }, [])
  data.setActiveAgentPreset(preset.id)
  const created = data.createConversation({ metadata: { characterId: base.characterId } }), id = created.conversation.id
  const sibling = data.createConversation({ metadata: { characterId: base.characterId } }).conversation.id
  const unbound = data.createConversation({}).conversation.id
  const page = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/' })
  let selected = { id, status: 'ready', error: '', details: created }

  await client.plugin(TypertRegistry)
  const call = vi.fn(async (_base: string, endpoint: string, payload: any, signal: AbortSignal) => {
    const [namespace, method] = endpoint.split('/')
    const controller = new AbortController(), cancel = () => controller.abort(signal.reason)
    if (signal.aborted) controller.abort(signal.reason); else signal.addEventListener('abort', cancel, { once: true })
    try { return { ok: true, value: await ctx.typertGateway.invoke({ peer: ownerPeer(ctx), namespace: namespace!, method: method!, args: payload.args, signal: controller.signal }) } }
    catch (error) { return { ok: false, error: { code: 'gateway/internal', message: error instanceof Error ? error.message : String(error), details: {} } } }
    finally { signal.removeEventListener('abort', cancel) }
  })
  client.provide('connection', { rpc: { call, open: vi.fn(async function* () {}) },
    registerGenerationSource: () => () => {}, start: () => ({ stop() {} }) } as any)
  let registration: any
  runInNewContext(readFileSync(clientBundlePath(createRequire(import.meta.url), '@deepseek-ai/dsh-api-gateway/client'), 'utf8'), {
    window: { __ModuleLoader__: { load(value: any) { registration = value } } }, crypto: globalThis.crypto,
    AbortController: page.window.AbortController, AbortSignal: page.window.AbortSignal, Error, Object, setTimeout, clearTimeout,
  })
  await client.plugin(registration.factory((name: string) => {
    if (name === '@deepseek-ai/cordis') return Cordis
    throw new Error(`Unexpected native Client dependency: ${name}`)
  }))
  await client.remote.$mount(TYPERT_REMOTE)
  cleanups.push(async () => { await client.fiber.dispose() })
  const runtime = new NativeAuthorClient({ window: page.window, remote: client.remote,
    conversations: { getDetailsSnapshot: () => selected } as any, libraries: {} as any, models: {} as any, report: vi.fn() })
  runtime.mountDocument(page.window, id, '')
  cleanups.push(async () => { await runtime.dispose(); page.window.close() })
  const api = page.window.ElecKoi as ElecKoiAuthorApi
  const invoke = (method: string, args: Record<string, unknown>, signal = new AbortController().signal) => ctx.typertGateway.invoke({ peer: ownerPeer(ctx),
    namespace: 'eleckoiCharacterConfiguration', method, args, signal,
  })
  return { ctx, client, data, id, sibling, unbound, path, directory, runtime, api, invoke, call, publish, preset, otherPreset,
    select(conversationId: string) { selected = { ...selected, id: conversationId, details: data.readConversationDetails(conversationId) } },
    effective(conversationId: string) { return data.prepareConversationRuntime(conversationId, 'Synthetic input').settingLibraryBaseline!.source },
    readStorage() { return new Database(path) },
  }
}

describe('native author setting library', () => {


  it('exposes exactly the formal mutable entry fields', () => {
    expect([...AUTHOR_SETTING_ENTRY_MUTABLE_FIELDS].sort()).toEqual(Object.keys(settingLibraryEntryChangesSchema.shape).sort())
  })
  it('updates the character original and active version without overwriting other entries, versions or characters', async () => {
    const r = await harness(), initial = (await r.api.settingLibrary.current())!
    const author = r.data.readSettingLibrary(initial.characterId)
    r.data.saveSettingLibrary(author.characterId, { ...author, versions: [...author.versions,
      { ...author.versions[0]!, id: 'synthetic-inactive-version', name: 'Synthetic saved version' }] })
    const stored = r.data.readSettingLibrary(author.characterId)
    const other = r.data.saveSettingLibrary('synthetic-other-character', r.data.readSettingLibrary('synthetic-other-character'))
    const stale = await r.api.settingLibrary.getEntry('synthetic-entry')
    await Promise.all([
      r.api.settingLibrary.updateEntry(stale.id, { content: 'Synthetic latest content' }),
      r.api.settingLibrary.updateEntry(stale.id, { keywords: ['synthetic latest'], agentReadStrategy: 'required' }),
    ])
    const latest = await r.api.settingLibrary.getEntry(stale.id)
    expect(latest).toMatchObject({ content: 'Synthetic latest content', keywords: ['synthetic latest'], agentReadStrategy: 'required' })
    expect(stale.content).toBe('{{char}} meets {{user}}')
    const changed = await r.api.settingLibrary.updateEntries([
      { id: 'synthetic-alternative', changes: { enabled: true } },
      { id: stale.id, changes: { enabled: false } },
    ])
    expect(changed.map(({ id, enabled }) => ({ id, enabled }))).toEqual([
      { id: 'synthetic-alternative', enabled: true }, { id: stale.id, enabled: false },
    ])
    expect(await r.api.settingLibrary.getEntry(stale.id)).toMatchObject({ ...latest, enabled: false, updatedAt: expect.any(String) })
    const updated = r.data.readSettingLibrary(initial.characterId)
    expect(updated.entries).toEqual(stored.entries.map(entry => entry.id === stale.id ? { ...latest, enabled: false, updatedAt: changed[1]!.updatedAt }
      : changed.find(item => item.id === entry.id) ?? entry))
    expect(updated.versions.find(version => version.id === updated.activeVersionId)!.entries).toEqual(updated.entries)
    expect(updated.versions.find(version => version.id === 'synthetic-inactive-version'))
      .toEqual(stored.versions.find(version => version.id === 'synthetic-inactive-version'))
    expect(r.data.readSettingLibrary('synthetic-other-character')).toEqual(other)
    expect(r.effective(r.sibling).entries).toEqual(expect.arrayContaining(changed))
    expect(r.data.readConversationSettingLibraries(initial.characterId)).toEqual([])
    expect(r.data.prepareConversationRuntime(r.id, 'Synthetic input').settingLibraryBaseline!.source.entries)
      .toEqual(expect.arrayContaining(changed))
    expect(await r.api.settingLibrary.updateEntries([])).toEqual([])
    expect(r.publish).toHaveBeenCalledTimes(3)
    ;(r.data as any).close()
    expect(await r.api.settingLibrary.getEntry('synthetic-alternative')).toMatchObject({ enabled: true })
  }, 30_000)

  it('rejects missing, duplicate, opening and malformed entry batches without committing part of the group', async () => {
    const r = await harness(), initial = (await r.api.settingLibrary.current())!
    const invalid = [
      [{ id: 'synthetic-entry', changes: { enabled: false } }, { id: 'synthetic-missing', changes: { enabled: true } }],
      [{ id: 'synthetic-entry', changes: { enabled: false } }, { id: 'synthetic-entry', changes: { enabled: true } }],
      [{ id: 'synthetic-entry', changes: { enabled: false } }, { id: 'synthetic-alternative', changes: { openingMessages: [{ id: 'synthetic-opening', content: 'Synthetic opening edit' }] } }],
      [{ id: 'synthetic-entry', changes: {} }],
      [{ id: 'synthetic-entry', changes: { id: 'synthetic-replacement', enabled: false } }],
      [{ id: 'synthetic-entry', changes: { kind: 'opening' } }],
      [{ id: 'synthetic-entry', changes: { unsupported: true, enabled: false } }],
      [{ id: 'synthetic-entry', changes: { enabled: 'false' } }],
    ]
    for (const updates of invalid) {
      await expect(r.api.settingLibrary.updateEntries(updates as any)).rejects.toThrow()
      expect(await r.api.settingLibrary.current()).toEqual(initial)
    }
    await expect(r.api.settingLibrary.getEntry('synthetic-missing')).rejects.toMatchObject({ code: 'ENTRY_NOT_FOUND' })
    expect(r.publish).not.toHaveBeenCalled()
    const storage = r.readStorage()
    try {
      storage.exec("CREATE TRIGGER synthetic_batch_failure BEFORE UPDATE ON setting_library_version_entry_links WHEN NEW.entryId='synthetic-alternative' BEGIN SELECT RAISE(ABORT, 'Synthetic batch failure'); END")
      const updates = [{ id: 'synthetic-entry', changes: { enabled: false } },
        { id: 'synthetic-alternative', changes: { enabled: true } }]
      await expect(r.api.settingLibrary.updateEntries(updates)).rejects.toThrow('Synthetic batch failure')
      expect(await r.api.settingLibrary.current()).toEqual(initial)
      expect(r.publish).not.toHaveBeenCalled()
      storage.exec('DROP TRIGGER synthetic_batch_failure')
      expect(await r.api.settingLibrary.updateEntries(updates)).toHaveLength(2)
      expect(r.publish).toHaveBeenCalledOnce()
    } finally { storage.close() }
  }, 30_000)

  it('controls explicitly identified preset originals and their active versions through the native SDK', async () => {
    const r = await harness(), original = r.data.readAgentPreset(r.preset.id)
    expect((await r.api.presets.list()).activePresetId).toBe(original.id)
    expect((await r.api.presets.current())!.id).toBe(original.id)
    expect(await r.api.presets.getEntry(r.otherPreset.id, 'synthetic-entry')).toMatchObject({ content: 'Synthetic other preset option' })
    const changed = await r.api.presets.updateEntries(original.id, [
      { id: 'synthetic-entry', changes: { enabled: false } },
      { id: 'synthetic-alternative', changes: { enabled: true } },
    ])
    const updated = r.data.readAgentPreset(original.id)
    expect(updated).toEqual({ ...original, entries: original.entries.map(entry => changed.find(item => item.id === entry.id) ?? entry) })
    expect(r.data.readAgentPreset(r.otherPreset.id)).toEqual(r.otherPreset)
    expect((await r.api.settingLibrary.getEntry('synthetic-entry')).enabled).toBe(true)
    const projected = r.data.prepareConversationRuntime(r.id, 'Synthetic input').settingLibraryBaseline!.source.entries
    expect(projected).toEqual(expect.arrayContaining(changed.map(entry => expect.objectContaining({
      id: `agent-preset:${original.id}:${entry.id}`, content: entry.content, enabled: entry.enabled,
    }))))
    expect(r.publish).toHaveBeenCalledOnce()
    expect(r.publish).toHaveBeenCalledWith({ kind: 'configuration', domain: 'agentPresets' })
    const storage = r.readStorage()
    try {
      for (const entry of changed) {
        const row = storage.prepare('SELECT payloadJson FROM agent_preset_version_entries WHERE presetId=? AND versionId=? AND entryId=?')
          .get(original.id, original.activeVersionId, entry.id) as { payloadJson: string }
        expect(JSON.parse(row.payloadJson)).toEqual(entry)
      }
    } finally { storage.close() }
    expect(await r.api.presets.updateEntry(r.otherPreset.id, 'synthetic-entry', { content: 'Synthetic modified inactive preset' }))
      .toMatchObject({ content: 'Synthetic modified inactive preset' })
    expect((await r.api.presets.current())!.id).toBe(original.id)
    expect((await r.api.presets.select(r.otherPreset.id)).activePresetId).toBe(r.otherPreset.id)
    expect((await r.api.presets.current())!.id).toBe(r.otherPreset.id)
    await expect(r.api.presets.getEntry(original.id, 'synthetic-missing')).rejects.toMatchObject({ code: 'ENTRY_NOT_FOUND' })
    await expect(r.api.presets.get('synthetic-missing-preset')).rejects.toThrow('找不到')
    ;(r.data as any).close()
    expect((await r.api.presets.current())!.id).toBe(r.otherPreset.id)
    expect(await r.api.presets.getEntry(original.id, 'synthetic-alternative')).toMatchObject({ enabled: true })
  }, 30_000)

  it('rolls back preset batches and versions on validation or disk errors, with no change notification', async () => {
    const r = await harness(), original = await r.api.presets.get(r.preset.id)
    for (const updates of [
      [{ id: 'synthetic-entry', changes: { enabled: false } }, { id: 'synthetic-missing', changes: { enabled: true } }],
      [{ id: 'synthetic-entry', changes: { enabled: false } }, { id: 'synthetic-entry', changes: { enabled: true } }],
      [{ id: 'synthetic-entry', changes: { groupId: 'synthetic-missing-group' } }],
      [{ id: 'synthetic-entry', changes: { promptPositionId: 'synthetic-missing-position' } }],
      [{ id: 'synthetic-entry', changes: { position: 'insert_point_1' } }],
    ]) {
      await expect(r.api.presets.updateEntries(original.id, updates as any)).rejects.toThrow()
      expect(await r.api.presets.get(original.id)).toEqual(original)
    }
    const storage = r.readStorage()
    try {
      const versionRows = storage.prepare('SELECT payloadJson FROM agent_preset_version_entries WHERE presetId=? AND versionId=? ORDER BY entryId')
      const before = versionRows.all(original.id, original.activeVersionId)
      expect(before).toHaveLength(original.entries.length)
      storage.exec("CREATE TRIGGER synthetic_preset_failure BEFORE UPDATE ON agent_preset_version_entries WHEN NEW.entryId='synthetic-alternative' BEGIN SELECT RAISE(ABORT, 'Synthetic preset failure'); END")
      const updates = [{ id: 'synthetic-entry', changes: { enabled: false } },
        { id: 'synthetic-alternative', changes: { enabled: true } }]
      await expect(r.api.presets.updateEntries(original.id, updates)).rejects.toThrow('Synthetic preset failure')
      expect(await r.api.presets.get(original.id)).toEqual(original)
      expect(versionRows.all(original.id, original.activeVersionId)).toEqual(before)
      expect(r.publish).not.toHaveBeenCalled()
      storage.exec('DROP TRIGGER synthetic_preset_failure')
      expect(await r.api.presets.updateEntries(original.id, updates)).toHaveLength(2)
      expect(await r.api.presets.updateEntries(original.id, [])).toEqual([])
      expect(r.publish).toHaveBeenCalledOnce()
    } finally { storage.close() }
  }, 30_000)

  it('replaces the character original through the SDK and generated Remote, including its name and insertion positions', async () => {
    const r = await harness(), initial = (await r.api.settingLibrary.current())!
    expect(initial.entries.find(entry => entry.id === 'synthetic-entry')!.content).toBe('{{char}} meets {{user}}')
    expect(initial).not.toHaveProperty('versions'); expect(initial).not.toHaveProperty('listAllExpanded')
    expect(r.data.readConversationSettingLibraries(initial.characterId)).toEqual([])
    const author = r.data.readSettingLibrary(initial.characterId), timestamp = '2026-01-01T00:00:00Z'
    const desired = { ...initial, name: 'Synthetic edited library',
      promptPositions: [{ id: 'synthetic-position', name: 'Synthetic position', anchor: 'instructions' as const,
        side: 'before_setting_position' as const, order: 1, createdAt: timestamp, updatedAt: timestamp }],
      groups: [{ id: 'synthetic-group', name: 'Synthetic group', parentId: '', order: 1,
      treeViewOrder: 1, createdAt: timestamp, updatedAt: timestamp }],
      entries: initial.entries.map(entry => entry.id === 'synthetic-entry'
        ? { ...entry, groupId: 'synthetic-group', content: '{{char}} saves {{user}}', keywords: ['synthetic'],
          agentReadStrategy: 'keyword' as const, contentMode: 'ejs' as const, updatedAt: timestamp } : entry) }
    desired.entries.push({ ...desired.entries.find(entry => entry.id === 'synthetic-entry')!, id: 'synthetic-added',
      title: 'Synthetic added setting', content: 'Synthetic added content' })
    const saved = await r.api.settingLibrary.replace(desired)
    expect(saved).toMatchObject({ characterId: initial.characterId, name: desired.name, promptPositions: desired.promptPositions })
    expect(saved.entries).toContainEqual(expect.objectContaining({ id: 'synthetic-entry', content: '{{char}} saves {{user}}' }))
    expect(await r.api.settingLibrary.getSummary()).toEqual({ characterId: initial.characterId, name: desired.name,
      activeVersionId: author.activeVersionId, entryCount: initial.entries.length + 1, groupCount: 1 })
    desired.entries.find(entry => entry.id === 'synthetic-entry')!.content = 'Synthetic local-only edit'
    expect((await r.api.settingLibrary.current())!.entries.find(entry => entry.id === 'synthetic-entry')!.content).toBe('{{char}} saves {{user}}')
    const updated = r.data.readSettingLibrary(initial.characterId)
    expect(updated.entries).toEqual(saved.entries)
    expect(updated.activeVersionId).toBe(author.activeVersionId)
    expect(updated.versions.find(version => version.id === updated.activeVersionId)!.entries).toEqual(saved.entries)
    expect(r.effective(r.sibling).entries).toEqual(expect.arrayContaining(saved.entries))
    expect(r.data.prepareConversationRuntime(r.id, 'Synthetic input').settingLibraryBaseline!.source.entries)
      .toContainEqual(expect.objectContaining({ id: 'synthetic-entry', content: '{{char}} saves {{user}}' }))
    expect(r.data.readAuthorConversationState(r.id).settingLibrary!.entries.find(entry => entry.id === 'synthetic-entry')!.content)
      .not.toContain('{{char}}')
    expect(r.publish).toHaveBeenCalledOnce()
    expect(r.publish).toHaveBeenCalledWith({ kind: 'configuration', domain: 'settingLibraries', characterId: initial.characterId })
    expect(r.ctx.get('eleckoiCompatibilityApi', false)).toBeUndefined()
    expect(r.client.get('eleckoiCompatibility', false)).toBeUndefined()
    expect(existsSync(join(r.directory, 'author-plugins', 'registry.sqlite'))).toBe(false)
    ;(r.data as any).close()
    expect((await r.api.settingLibrary.current())!.entries).toContainEqual(expect.objectContaining({ id: 'synthetic-added' }))
    const storage = r.readStorage()
    try {
      expect(storage.prepare('SELECT count(*) AS count FROM conversation_setting_changes WHERE sessionId=?').get(r.id)).toEqual({ count: 0 })
      expect(storage.pragma('foreign_key_check')).toEqual([])
      expect(storage.pragma('integrity_check', { simple: true })).toBe('ok')
    } finally { storage.close() }
  }, 30_000)

  it('rejects foreign roles and malformed contents before altering accepted character data', async () => {
    const r = await harness(), initial = (await r.api.settingLibrary.current())!
    const saved = await r.api.settingLibrary.replace({ ...initial, entries: initial.entries.map(entry => entry.id === 'synthetic-entry'
      ? { ...entry, content: 'Synthetic accepted' } : entry) })
    const variants: Array<[AuthorSettingLibrary, string | undefined]> = [
      [{ ...saved, characterId: 'synthetic-other-character' }, '不匹配'],
      [{ ...saved, entries: [...saved.entries, saved.entries.find(entry => entry.id === 'synthetic-entry')!] }, '编号不能重复'],
      [{ ...saved, entries: saved.entries.map(entry => entry.id === 'synthetic-entry' ? { ...entry, contentMode: 'unsupported' as any } : entry) }, undefined],
    ]
    for (const [invalid, message] of variants) {
      await expect(r.api.settingLibrary.replace(invalid)).rejects.toThrow(message)
      expect(await r.api.settingLibrary.current()).toEqual(saved)
    }
    expect(r.publish).toHaveBeenCalledOnce()
    await r.api.settingLibrary.replace({ ...saved, entries: saved.entries.filter(entry => entry.id !== 'synthetic-entry') })
    expect((await r.api.settingLibrary.current())!.entries.find(entry => entry.id === 'synthetic-entry')).toBeUndefined()
    expect(r.data.readSettingLibrary(saved.characterId).entries).not.toContainEqual(expect.objectContaining({ id: 'synthetic-entry' }))
  }, 30_000)

  it('rolls back a failed SQLite replacement and keeps accepted data readable for retry', async () => {
    const r = await harness(), initial = (await r.api.settingLibrary.current())!
    const saved = await r.api.settingLibrary.replace({ ...initial, entries: initial.entries.map(entry => entry.id === 'synthetic-entry'
      ? { ...entry, content: 'Synthetic accepted' } : entry) })
    const storage = r.readStorage()
    try {
      storage.exec("CREATE TRIGGER synthetic_write_failure BEFORE INSERT ON setting_entry_contents BEGIN SELECT RAISE(ABORT, 'Synthetic write failure'); END")
      const next = { ...saved, entries: saved.entries.map(entry => entry.id === 'synthetic-entry'
        ? { ...entry, content: 'Synthetic replacement' } : entry) }
      await expect(r.api.settingLibrary.replace(next)).rejects.toThrow('Synthetic write failure')
      expect(await r.api.settingLibrary.current()).toEqual(saved)
      expect(r.publish).toHaveBeenCalledOnce()
      storage.exec('DROP TRIGGER synthetic_write_failure')
      expect(await r.api.settingLibrary.replace(next)).toMatchObject({ entries: expect.arrayContaining([
        expect.objectContaining({ id: 'synthetic-entry', content: 'Synthetic replacement' })]) })
    } finally { storage.close() }
  }, 30_000)

  it('distinguishes unbound pages and missing roles, propagates cancellation, and keeps the story editor guard', async () => {
    const r = await harness(), initial = (await r.api.settingLibrary.current())!
    await expect(r.invoke('saveConversationSettingLibrary', { characterId: initial.characterId,
      conversationId: r.id, library: r.data.readSettingLibrary(initial.characterId) })).rejects.toThrow('只有设定修改工具')
    await expect(r.invoke('readSettingLibrary', { characterId: 'synthetic-missing-character' })).rejects.toThrow('找不到')
    await expect(r.invoke('replaceSettingLibraryContent', { characterId: 'synthetic-missing-character', library: initial })).rejects.toThrow('找不到')
    const abort = new AbortController(); abort.abort(new Error('Synthetic cancellation'))
    await expect(r.invoke('replaceSettingLibraryContent', { characterId: initial.characterId, library: initial }, abort.signal)).rejects.toThrow()
    const updates = [{ id: 'synthetic-entry', changes: { enabled: false } }]
    await expect(r.invoke('updateSettingLibraryEntries', { characterId: initial.characterId, updates }, abort.signal)).rejects.toThrow()
    await expect(r.ctx.typertGateway.invoke({ peer: ownerPeer(r.ctx), namespace: 'eleckoiAgentPresets', method: 'updateEntries',
      args: { presetId: r.preset.id, updates }, signal: abort.signal })).rejects.toThrow()
    await expect(r.invoke('updateSettingLibraryEntries', { characterId: 'synthetic-missing-character', updates })).rejects.toThrow('找不到')
    const callsBefore = r.call.mock.calls.length
    r.select(r.sibling)
    await expect(r.api.settingLibrary.updateEntry('synthetic-entry', { enabled: false })).rejects.toThrow()
    await expect(r.api.presets.updateEntry(r.preset.id, 'synthetic-entry', { enabled: false })).rejects.toThrow()
    expect(r.call).toHaveBeenCalledTimes(callsBefore)
    expect(r.data.readAgentPreset(r.preset.id)).toEqual(r.preset)
    expect(r.data.readConversationSettingLibraries(initial.characterId)).toEqual([])
    expect(r.publish).not.toHaveBeenCalled()
    r.select(r.unbound)
    const page = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/' })
    r.runtime.mountDocument(page.window, r.unbound, '')
    cleanups.push(() => page.window.close())
    const api = page.window.ElecKoi as ElecKoiAuthorApi
    expect(await api.settingLibrary.current()).toBeNull()
    await expect(api.settingLibrary.updateEntry('synthetic-entry', { enabled: false })).rejects.toMatchObject({ code: 'CHARACTER_REQUIRED' })
  }, 30_000)

  it('reads and changes the original even when a model tool has created a story override, preserving that override', async () => {
    const r = await harness(), original = (await r.api.settingLibrary.current())!
    const preparation = r.data.prepareConversationRuntime(r.id, 'Synthetic input')
    const projected = preparation.conversationContext.settingLibrary!
    r.data.commitConversationRuntime(r.id, undefined, JSON.stringify({ ...projected,
      entries: projected.entries.map(entry => entry.id === 'synthetic-entry'
        ? { ...entry, content: 'Synthetic story-only content' } : entry) }), preparation.settingLibraryBaseline)
    const storage = r.readStorage()
    try {
      const rows = () => storage.prepare('SELECT * FROM conversation_setting_changes ORDER BY sessionId,targetType,targetId').all()
      const before = rows()
      expect(before).toHaveLength(1)
      expect(await r.api.settingLibrary.current()).toEqual(original)
      await r.api.settingLibrary.updateEntries([
        { id: 'synthetic-entry', changes: { content: 'Synthetic edited original' } },
        { id: 'synthetic-alternative', changes: { enabled: true } },
      ])
      expect(await r.api.settingLibrary.getEntry('synthetic-entry')).toMatchObject({ content: 'Synthetic edited original' })
      expect(r.data.readSettingLibrary(original.characterId).entries)
        .toContainEqual(expect.objectContaining({ id: 'synthetic-entry', content: 'Synthetic edited original' }))
      expect(r.effective(r.sibling).entries).toContainEqual(expect.objectContaining({ id: 'synthetic-entry', content: 'Synthetic edited original' }))
      expect(r.effective(r.id).entries).toContainEqual(expect.objectContaining({ id: 'synthetic-entry', content: 'Synthetic story-only content' }))
      const saved = (await r.api.settingLibrary.current())!
      await r.api.settingLibrary.replace({ ...saved, name: 'Synthetic final original' })
      expect(rows()).toEqual(before)
      expect(r.data.readSettingLibrary(original.characterId).name).toBe('Synthetic final original')
    } finally { storage.close() }
  }, 30_000)
})
