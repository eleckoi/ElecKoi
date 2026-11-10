import { CharacterOpeningRepository } from '../../packages/host/product-data/src/domain/characterOpenings'
import { runtimeContextsFor } from '../helpers/runtime-contexts.js'
import { RuntimeContexts } from '../../packages/client/features/dsh-client-roleplay/src/host/runtime-contexts.mjs'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { restoreV10PresetFixture } from '../../packages/host/product-data/tests/helpers/presetSchemaV10'
import { CURRENT_SCHEMA_VERSION } from '../../packages/host/product-data/src/storage/sqlite/schemaVersion'
import { afterEach, describe, expect, it } from 'vitest'
import { SqliteDatabase } from '../helpers/SqliteDatabase'
import { ConversationRepository } from '../../packages/host/product-data/src/domain/conversations/ConversationRepository'
import { ConversationStateRepository } from '../../packages/host/product-data/src/domain/conversations/ConversationStateRepository'
import { CharacterRepository } from '../../packages/host/product-data/src/domain/personas/CharacterRepository'
import { SettingLibraryRepository } from '../../packages/host/product-data/src/domain/settingLibraries'
import { VariableConfigRepository } from '../../packages/host/product-data/src/domain/variables/VariableConfigRepository'
import { VariableStateRepository } from '../../packages/host/product-data/src/domain/variables/VariableStateRepository'
import { ElecKoiVariableProcessing } from '@eleckoi/dsh-product-api'
import { resolveConversationSeed } from '../../packages/host/product-data/src/domain/conversations/conversationSeed'
import { LocalMediaStore } from '@eleckoi/dsh-product-data/media'
import { encodeSettingLibrarySnapshot, decodeSettingLibrarySnapshot, encodeVariableConfigSnapshot, decodeVariableConfigSnapshot } from '../../packages/host/product-data/src/domain/characterTransfer/portableSnapshots'
// @ts-expect-error 工具插件为无声明文件的 JavaScript 入口。
import { apply as applyVariableTools } from '../../apps/desktop/resources/dsh/variable-tools.mjs'
import type { VariableConfigVersion } from '../../packages/shared/src/contracts/variables/schemas'

const fixtures: Array<{ database: SqliteDatabase; directory: string }> = []
afterEach(() => {
  delete process.env.ELECKOI_SESSION_SNAPSHOT_ROOT
  for (const fixture of fixtures.splice(0)) {
    fixture.database.close()
    rmSync(fixture.directory, { recursive: true, force: true })
  }
})

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'eleckoi-opening-version-'))
  const path = join(directory, 'product.sqlite3')
  const database = new SqliteDatabase(path)
  database.open()
  fixtures.push({ database, directory })
  const characters = new CharacterRepository(database, new ConversationRepository(database), new LocalMediaStore(join(directory, 'media')))
  characters.replaceAll({ active_character_id: 'synthetic-character', groups: [], items: [{
    id: 'synthetic-character', name: '合成角色', group: '', persona: {},
  }] })
  const variables = new VariableConfigRepository(database)
  const libraries = new SettingLibraryRepository(database)
  const blank = variables.get('synthetic-character')
  const variant = (id: string, limit: number, value: number): VariableConfigVersion => ({
    ...blank.versions[0]!, id, name: id,
    schemaCode: `const Schema = z.object({ status: z.object({ energy: z.number().max(${limit}) }) })`,
    objects: [{ id: 'status', name: 'status', parentId: '', enabled: true, dynamicKey: false,
      description: '', updateRule: id, order: 1, treeViewOrder: 1, createdAt: '', updatedAt: '' }],
    variables: [{ id: 'energy', title: 'energy', objectId: 'status', type: 'number', defaultValue: String(value),
      enabled: true, description: id, updateRule: `rule-${id}`, readMode: 'required',
      order: 1, treeViewOrder: 1, createdAt: '', updatedAt: '' }],
  })
  const a = variant('variant-a', 10, 2)
  const b = variant('variant-b', 100, 20)
  variables.save('synthetic-character', { ...blank, ...a, activeVersionId: a.id, versions: [a, b] })
  const openings = new CharacterOpeningRepository(database)
  openings.save('synthetic-character', { ...openings.get('synthetic-character'), openingMessages: [
    { id: 'opening-a', title: '开场 A', content: '合成开场 A', variableVersionId: a.id },
    { id: 'opening-b', title: '开场 B', content: '合成开场 B', variableVersionId: b.id },
  ], defaultOpeningMessageId: 'opening-a' })
  const conversations = new ConversationRepository(database, (characterId, db) => resolveConversationSeed(characterId, db, new CharacterOpeningRepository(database), variables))
  const states = new VariableStateRepository(database, variables)
  return { database, path, directory, variables, libraries, openings, conversations, states }
}

function liveTools(f: ReturnType<typeof fixture>, id: string) {
  const contexts = new RuntimeContexts(conversationId => f.states.runtimeContext(conversationId, { characterId: 'synthetic-character' }))
  contexts.prepare(id, { conversationId: id, conversationContext: { history: [] },
    variableContext: f.states.runtimeContext(id, { characterId: 'synthetic-character' }) } as never, [], '', f.states.viewerStates(id).currentStateJson)
  const processing = new ElecKoiVariableProcessing({} as never)
  const tools = new Map<string, { execute(args: unknown, execution: unknown): Promise<any> }>()
  applyVariableTools({ eleckoiRuntimeContexts: contexts, eleckoiVariableProcessing: processing,
    tools: { register(definition: any) { tools.set(definition.name, definition); return () => {} } } })
  return { contexts, processing, tools, call: (name: string, args: unknown, sessionId = id) => tools.get(name)!.execute(args, { agent: { session: { id: sessionId } } }) }
}

describe('opening variable version associations', () => {
  it('associates a previously unassociated chat and switches versions without rewriting values, ownership or history', async () => {
    const f = fixture(), characterId = 'synthetic-character'
    f.openings.save(characterId, { ...f.openings.get(characterId), openingMessages: [{ id: 'blank-opening', title: '', content: '', variableVersionId: '' }], defaultOpeningMessageId: 'blank-opening' })
    const id = f.conversations.create({ metadata: { characterId } }).conversation.id
    expect(f.states.configuration(id).versionId).toBe('')
    f.states.replaceCurrent(id, '{"played":{"value":35},"runtime":3}')
    const before = { ...f.states.viewerStates(id), identities: f.states.identities(id) }
    const history = new ConversationStateRepository(f.database)
    history.recordTurn(id, id, 1, 'after', { variableStateJson: before.currentStateJson, variableIdentityJson: before.identities, settingLibraryStateJson: '[]' })
    const savedHistory = history.list(id)
    expect(f.states.selectVersion(id, 'variant-b', '').versionId).toBe('variant-b')
    expect((await liveTools(f, id).call('eleckoi_read_variables', { paths: ['/status/energy'] })).variables[0])
      .toMatchObject({ default: 20, current_present: false })
    expect(f.states.configuration(id).versionId).toBe('variant-b')
    f.states.selectVersion(id, 'variant-a', 'variant-b')
    expect((await liveTools(f, id).call('eleckoi_read_variables', { paths: ['/status/energy'] })).variables[0].default).toBe(2)
    f.states.selectVersion(id, '', 'variant-a')
    expect(f.states.viewerStates(id)).toEqual({ initialStateJson: before.initialStateJson, currentStateJson: before.currentStateJson })
    expect(f.states.identities(id)).toBe(before.identities)
    expect(history.list(id)).toEqual(savedHistory)
    expect(f.variables.get(characterId).activeVersionId).toBe('variant-a')
    f.states.selectVersion(id, 'variant-b', '')
    f.database.close(); f.database.open()
    expect(f.states.configuration(id).versionId).toBe('variant-b')
  }, 20000)

  it('rejects an unavailable or stale selection atomically and restores authored progress when switching back', async () => {
    const f = fixture(), characterId = 'synthetic-character'
    const id = f.conversations.create({ metadata: { characterId } }).conversation.id
    f.states.replaceCurrent(id, '{"status":{"energy":7}}')
    const state = f.states.viewerStates(id), identities = f.states.identities(id)
    expect(() => f.states.selectVersion(id, 'missing-version', 'variant-a')).toThrow('不存在')
    f.states.selectVersion(id, 'variant-b', 'variant-a')
    expect(() => f.states.selectVersion(id, '', 'variant-a')).toThrow('已改变')
    expect((await liveTools(f, id).call('eleckoi_read_variables', { paths: ['/status/energy'] })).variables[0])
      .toMatchObject({ default: 20, current_present: false })
    f.states.selectVersion(id, 'variant-a', 'variant-b')
    expect((await liveTools(f, id).call('eleckoi_read_variables', { paths: ['/status/energy'] })).variables[0].current).toBe(7)
    expect(f.states.viewerStates(id)).toEqual(state)
    expect(f.states.identities(id)).toBe(identities)
  }, 20000)

  it('creates a new same-name definition independently and rewinds both values and ownership', async () => {
    const f = fixture(), characterId = 'synthetic-character'
    const id = f.conversations.create({ metadata: { characterId } }).conversation.id
    f.states.replaceCurrent(id, '{"status":{"energy":7,"dynamic":3}}')
    const original = { ...f.states.viewerStates(id), identityJson: f.states.identities(id) }
    const history = new ConversationStateRepository(f.database)
    history.recordTurn(id, id, 1, 'after', { variableStateJson: original.currentStateJson, variableIdentityJson: original.identityJson, settingLibraryStateJson: '[]' })
    const config = f.variables.get(characterId)
    f.variables.save(characterId, { ...config, schemaCode: '', variables: [{ ...config.variables[0]!, id: 'new-energy', type: 'object', defaultValue: '{"value":2}' }] })
    const live = liveTools(f, id)
    expect((await live.call('eleckoi_read_variables', { paths: ['/status/energy'] })).variables[0])
      .toMatchObject({ type: 'object', default: { kind: 'object_page', entries: [{ key: 'value', value: 2 }] }, current_present: false, current: null })
    expect(await live.call('eleckoi_apply_variable_patch', { operations: [{ op: 'insert', path: '/status/energy', value: { value: 9 } }] })).toMatchObject({ status: 'ok' })
    const candidate = live.contexts.get(id).variables
    f.states.replaceCurrent(id, JSON.stringify(candidate.state), f.database.db, JSON.stringify(candidate.identities))
    expect(candidate.identities['/status/energy']!.definitionId).toBe('new-energy')
    f.database.close(); f.database.open()
    expect((await liveTools(f, id).call('eleckoi_read_variables', { paths: ['/status/energy'] })).variables[0].current.entries[0].value).toBe(9)
    const restored = history.read(id, id, 1, 'after')
    f.states.replaceCurrent(id, restored.variableStateJson, f.database.db, restored.variableIdentityJson)
    const afterRewind = liveTools(f, id)
    expect((await afterRewind.call('eleckoi_read_variables', { paths: ['/status/energy'] })).variables[0].current_present).toBe(false)
    expect((await afterRewind.call('eleckoi_read_variables', { paths: ['/status/dynamic'] })).variables[0].current).toBe(3)
    expect(f.states.viewerStates(id).currentStateJson).toBe(original.currentStateJson)
    expect(f.states.identities(id)).toBe(original.identityJson)
    f.states.replaceAuthored(id, characterId, '{"status":{"energy":{"value":4},"dynamic":3}}')
    expect(JSON.parse(f.states.identities(id))['/status/energy'].definitionId).toBe('new-energy')
    expect((await liveTools(f, id).call('eleckoi_read_variables', { paths: ['/status/energy'] })).variables[0].current.entries[0].value).toBe(4)
  }, 20000)
  it('distinguishes authored removals from runtime additions without rewriting saved values or history', async () => {
    const f = fixture(), characterId = 'synthetic-character'
    const config = f.variables.get(characterId), a = config.versions[0]!, b = config.versions[1]!
    const coins = { ...a.variables[0]!, id: 'coins', title: 'coins', type: 'string' as const, defaultValue: '' }
    f.variables.save(characterId, { ...config, ...a, schemaCode: '', variables: [...a.variables, coins] })
    const id = f.conversations.create({ metadata: { characterId } }).conversation.id
    const dynamic = Object.fromEntries(Array.from({ length: 1001 }, (_, index) => [`runtime-${index}`, `dynamic-${index}`]))
    const raw = JSON.stringify({ status: { energy: 7, coins: 'retired-only-needle', ...dynamic }, runtimeRoot: { note: 'retained' } })
    f.states.replaceCurrent(id, raw)
    const before = f.states.viewerStates(id), history = new ConversationStateRepository(f.database)
    history.recordTurn(id, id, 1, 'after', { variableStateJson: before.currentStateJson, variableIdentityJson: f.states.identities(id), settingLibraryStateJson: '[]' })
    const oldHistory = history.list(id), live = liveTools(f, id)
    const saved = f.variables.get(characterId)
    f.variables.save(characterId, { ...saved, variables: saved.variables.filter(item => item.id !== 'coins') })

    const paths = (await live.call('eleckoi_glob_variables', {})).paths
    expect(paths).not.toContain('/status/coins')
    expect(paths).toEqual(expect.arrayContaining(['/status/energy', '/status/runtime-0', '/status/runtime-500', '/status/runtime-1000', '/runtimeRoot/note']))
    expect((await live.call('eleckoi_grep_variables', { pattern: 'retired-only-needle', output_mode: 'content' })).matches).toEqual([])
    expect(await live.call('eleckoi_read_variables', { paths: ['/status/coins'] })).toMatchObject({ status: 'not_found' })
    const parent = (await live.call('eleckoi_read_variables', { paths: ['/status'] })).variables[0].current
    expect(parent.entries.some((item: any) => item.key === 'coins')).toBe(false)
    expect(parent.entries).toHaveLength(1002)
    expect(await live.call('eleckoi_apply_variable_patch', { operations: [{ op: 'insert', path: '/status/newRuntime', value: 12 }] })).toMatchObject({ status: 'ok' })
    expect((await live.call('eleckoi_read_variables', { paths: ['/status/newRuntime'] })).variables[0].current).toBe(12)
    expect(f.states.viewerStates(id)).toEqual(before)
    expect(history.list(id)).toEqual(oldHistory)
    const edited = f.variables.get(characterId)
    const exported = decodeVariableConfigSnapshot(encodeVariableConfigSnapshot(edited), characterId)
    expect(exported.versions.map(item => item.id)).toEqual(edited.versions.map(item => item.id))
    f.database.close(); f.database.open()
    const reopened = liveTools(f, id)
    expect((await reopened.call('eleckoi_glob_variables', {})).paths).not.toContain('/status/coins')
    expect(f.states.viewerStates(id)).toEqual(before)
    expect(history.list(id)).toEqual(oldHistory)
    f.variables.save(characterId, { ...edited, ...b, activeVersionId: b.id })
    expect((await reopened.call('eleckoi_glob_variables', {})).paths).not.toContain('/status/coins')
    const restore = f.variables.get(characterId)
    const source = restore.versions.find(item => item.id === a.id)!
    f.variables.save(characterId, { ...restore, versions: restore.versions.map(item => item.id === a.id ? { ...source, variables: [...source.variables, coins] } : item) })
    expect((await reopened.call('eleckoi_read_variables', { paths: ['/status/coins'] })).variables[0].current).toBe('retired-only-needle')
  }, 20000)

  it.each(['delete', 'disable', 'rename', 'delete-group'] as const)('respects author %s inside dynamic dictionaries while retaining runtime keys and escaped paths', async mode => {
    const f = fixture(), characterId = 'synthetic-character'
    const config = f.variables.get(characterId), a = config.versions[0]!
    const members = { ...a.objects[0]!, id: 'members', name: 'members/~', dynamicKey: true }
    const secret = { ...a.variables[0]!, id: 'secret', title: 'secret/~', objectId: members.id, type: 'string' as const, defaultValue: 'default-secret' }
    f.variables.save(characterId, { ...config, ...a, schemaCode: '', objects: [...a.objects, members], variables: [...a.variables, secret] })
    const id = f.conversations.create({ metadata: { characterId } }).conversation.id
    f.states.replaceCurrent(id, JSON.stringify({ status: { energy: 7 }, 'members/~': {
      'entry/~': { 'secret/~': 'retired-dynamic-needle', runtime: 9 }, another: { 'secret/~': 'old', runtime: 10 },
    }, 'secret/~': 'unrelated-runtime-field' }))
    const before = f.states.viewerStates(id), live = liveTools(f, id), saved = f.variables.get(characterId)
    f.variables.save(characterId, { ...saved,
      objects: mode === 'delete-group' ? saved.objects.filter(item => item.id !== members.id) : saved.objects,
      variables: mode === 'delete' || mode === 'delete-group' ? saved.variables.filter(item => item.id !== secret.id)
        : saved.variables.map(item => item.id !== secret.id ? item : { ...item, ...(mode === 'disable' ? { enabled: false } : { title: 'renamed' }) }),
    })
    const paths = (await live.call('eleckoi_glob_variables', {})).paths
    expect(paths).not.toContain('/members~1~0/entry~1~0/secret~1~0')
    expect(paths).toContain('/secret~1~0')
    expect(paths.includes('/members~1~0/entry~1~0/runtime')).toBe(mode !== 'delete-group')
    expect(await live.call('eleckoi_read_variables', { paths: ['/members~1~0/entry~1~0/secret~1~0'] })).toMatchObject({ status: 'not_found' })
    if (mode !== 'delete-group') {
      const read = await live.call('eleckoi_read_variables', { paths: ['/members~1~0', '/members~1~0/entry~1~0'] })
      if (mode === 'rename') expect(read.variables[1].current.entries).toContainEqual(expect.objectContaining({ key: 'renamed', value: 'retired-dynamic-needle' }))
      else expect(JSON.stringify(read)).not.toContain('retired-dynamic-needle')
      expect(await live.call('eleckoi_apply_variable_patch', { operations: [{ op: 'insert', path: '/members~1~0/new', value: { runtime: 11 } }] }))
        .toMatchObject({ status: 'ok' })
      expect((await live.call('eleckoi_glob_variables', {})).paths).toContain('/members~1~0/new/runtime')
    }
    expect(f.states.viewerStates(id)).toEqual(before)
    f.database.close(); f.database.open()
    const reopened = liveTools(f, id)
    expect((await reopened.call('eleckoi_glob_variables', {})).paths).not.toContain('/members~1~0/another/secret~1~0')
  }, 20000)

  it('reads saved defaults and rules immediately without switching the chat to the editor selection or rewriting history', async () => {
    const f = fixture(), characterId = 'synthetic-character'
    const initial = f.variables.get(characterId)
    f.variables.save(characterId, { ...initial, objects: [...initial.objects, { ...initial.objects.find(item => item.id === 'status')!, id: 'members', name: 'members', dynamicKey: true }] })
    const id = f.conversations.create({ metadata: { characterId } }).conversation.id
    f.states.replaceCurrent(id, '{"status":{"energy":7},"members":{"one":{"energy":3}}}')
    const previousStates = f.states.viewerStates(id)
    const history = new ConversationStateRepository(f.database)
    history.recordTurn(id, id, 1, 'before', { variableStateJson: previousStates.initialStateJson, settingLibraryStateJson: '[]' })
    history.recordTurn(id, id, 1, 'after', { variableStateJson: previousStates.currentStateJson, settingLibraryStateJson: '[]' })
    const previousHistory = history.list(id)
    const live = liveTools(f, id)
    live.contexts.inherit(id, 'synthetic-child')
    const config = f.variables.get(characterId), a = config.versions[0]!, b = config.versions[1]!
    const edited = { ...a, schemaCode: 'const Schema = z.object({ status: z.object({ energy: z.number().max(20), bonus: z.number().optional() }), members: z.record(z.string(), z.object({ energy: z.number(), note: z.string().optional() })).optional() })',
      objects: a.objects,
      variables: [{ ...a.variables[0]!, defaultValue: '4', description: '最新说明', updateRule: '最新规则' },
        { ...a.variables[0]!, id: 'bonus', title: 'bonus', defaultValue: '5' },
        { ...a.variables[0]!, id: 'note', objectId: 'members', title: 'note', type: 'string' as const, defaultValue: '动态字段默认值' }] }
    f.variables.save(characterId, { ...config, ...b, activeVersionId: b.id, versions: [edited, b] })
    const result = await live.call('eleckoi_read_variables', { paths: ['/status/energy', '/status/bonus'] }, 'synthetic-child')
    expect(result).toMatchObject({ status: 'ok', variables: [
      { path: '/status/energy', current: 7, default: 4, description: '最新说明', update_rule: '最新规则' },
      { path: '/status/bonus', current: null, default: 5, current_present: false },
    ] })
    expect((await live.call('eleckoi_glob_variables', {})).paths).toContain('/status/bonus')
    expect((await live.call('eleckoi_read_variables', { paths: ['/members/one/note'] })).variables[0])
      .toMatchObject({ default: '动态字段默认值', current: null, current_present: false })
    expect(live.contexts.get(id).variables.config).toBeNull()
    expect(f.states.viewerStates(id)).toEqual(previousStates)
    expect(history.list(id)).toEqual(previousHistory)
    expect(await live.call('eleckoi_apply_variable_patch', { operations: [{ op: 'replace', path: '/status/energy', value: 21 }] })).toMatchObject({ status: 'validation_error', state_unchanged: true })
    expect(await live.call('eleckoi_apply_variable_patch', { operations: [{ op: 'insert', path: '/status/bonus', value: 5 }] })).toMatchObject({ status: 'ok' })
    expect((await live.call('eleckoi_read_variables', { paths: ['/status/bonus'] }, 'synthetic-child')).variables[0].current).toBe(5)
    expect(f.states.viewerStates(id)).toEqual(previousStates)
    f.states.replaceCurrent(id, JSON.stringify(live.contexts.get(id).variables.state))
    f.database.close(); f.database.open()
    expect((await liveTools(f, id).call('eleckoi_read_variables', { paths: ['/status/energy', '/status/bonus'] })).variables)
      .toMatchObject([{ current: 7, default: 4 }, { current: 5, default: 5 }])
    expect(f.states.viewerStates(id).initialStateJson).toBe(previousStates.initialStateJson)
    expect(history.list(id)).toEqual(previousHistory)
    f.states.replaceCurrent(id, history.read(id, id, 1, 'before').variableStateJson)
    expect((await liveTools(f, id).call('eleckoi_read_variables', { paths: ['/status/energy'] })).variables[0])
      .toMatchObject({ current: 2, default: 4, update_rule: '最新规则' })
  }, 20_000)

  it('rejects an in-flight patch if its authoritative configuration changes before acceptance', async () => {
    const f = fixture(), characterId = 'synthetic-character'
    const id = f.conversations.create({ metadata: { characterId } }).conversation.id
    const live = liveTools(f, id)
    let release!: () => void, entered!: () => void
    const pending = new Promise<void>(resolve => { release = resolve })
    const started = new Promise<void>(resolve => { entered = resolve })
    const unregister = live.processing.register({ open: () => ({ close() {}, async apply(stage, state) {
      if (stage === 'before') { entered(); await pending }
      return state
    } }) })
    try {
      const mutation = live.call('eleckoi_apply_variable_patch', { operations: [{ op: 'delta', path: '/status/energy', value: 1 }] })
      await started
      const config = f.variables.get(characterId)
      f.variables.save(characterId, { ...config, variables: config.variables.map(item => ({ ...item, updateRule: '已更新的规则' })) })
      release()
      expect(await mutation).toMatchObject({ status: 'state_conflict', state_unchanged: true })
      expect(live.contexts.get(id).variables.state).toEqual({ status: { energy: 2 } })
      expect(JSON.parse(f.states.viewerStates(id).currentStateJson)).toEqual({ status: { energy: 2 } })
    } finally { release(); unregister() }
  }, 20_000)

  it('uses edited static defaults in new chats while preserving populated dynamic groups and existing chats', () => {
    const f = fixture(), characterId = 'synthetic-character'
    const base = f.variables.get(characterId)
    const original = base.versions[0]!
    const version: VariableConfigVersion = {
      ...original, schemaCode: '',
      objects: [...original.objects, { ...original.objects[1]!, id: 'members', name: 'members', dynamicKey: true, parentId: '' }],
      variables: [...original.variables, { ...original.variables[0]!, id: 'date', title: 'date', type: 'string', defaultValue: '第一日' }],
      initialStateJson: JSON.stringify({ status: { energy: 2, date: '第一日' }, members: { alpha: { energy: 8, note: null } } }),
    }
    f.variables.save(characterId, { ...base, ...version, activeVersionId: version.id, versions: [version, base.versions[1]!] })
    const oldChat = f.conversations.create({ metadata: { characterId } }).conversation.id
    const oldState = f.states.viewerStates(oldChat)
    const loaded = f.variables.get(characterId)
    const edited = { ...loaded, variables: loaded.variables.map(item => item.id === 'date' ? { ...item, defaultValue: '第一天' } : item) }
    const saved = f.variables.save(characterId, edited)
    f.database.close(); f.database.open()
    const newChat = f.conversations.create({ metadata: { characterId } }).conversation.id
    expect(JSON.parse(saved.initialStateJson)).toEqual({ status: { energy: 2, date: '第一天' }, members: { alpha: { energy: 8, note: null } } })
    expect(f.variables.forConversation(newChat, characterId)!.activeVersionId).toBe(version.id)
    expect(JSON.parse(f.states.viewerStates(newChat).currentStateJson)).toEqual(JSON.parse(saved.initialStateJson))
    expect(JSON.parse(f.states.runtimeContext(newChat, { characterId })!.stateJson).status.date).toBe('第一天')
    expect(f.states.viewerStates(oldChat)).toEqual(oldState)
    expect(f.variables.get(characterId).versions.map(item => item.id)).toEqual(['variant-a', 'variant-b'])
  }, 20_000)

  it('keeps unbound openings inactive through creation, switching, editor changes and disk reopen', () => {
    const f = fixture(), characterId = 'synthetic-character'
    const value = f.openings.get(characterId)
    const unbound = { id: 'unbound-opening', title: '合成未绑定开场', content: '合成未绑定正文',
      variableVersionId: '' }
    f.openings.save(characterId, { ...value, openingMessages: [...value.openingMessages, unbound], defaultOpeningMessageId: unbound.id })
    const chat = f.conversations.create({ metadata: { characterId } }).conversation.id
    const binding = () => f.database.native.prepare('SELECT variableVersionId FROM agent_conversations WHERE id=?').get(chat)
    expect(binding()).toEqual({ variableVersionId: '' })
    expect(f.variables.forConversation(chat, characterId)).toBeNull()
    expect(f.states.runtimeContext(chat, { characterId })).toBeUndefined()
    expect(JSON.parse(f.states.viewerStates(chat).initialStateJson)).toEqual({})
    f.conversations.selectOpening(chat, 'opening-b')
    expect(binding()).toEqual({ variableVersionId: 'variant-b' })
    expect(JSON.parse(f.states.runtimeContext(chat, { characterId })!.stateJson)).toEqual({ status: { energy: 20 } })
    f.conversations.selectOpening(chat, unbound.id)
    expect(binding()).toEqual({ variableVersionId: '' })
    expect(f.states.runtimeContext(chat, { characterId })).toBeUndefined()
    expect(JSON.parse(f.states.viewerStates(chat).currentStateJson)).toEqual({})
    const config = f.variables.get(characterId)
    f.variables.save(characterId, { ...config, ...config.versions[1]!, activeVersionId: 'variant-b' })
    f.database.close(); f.database.open()
    expect(binding()).toEqual({ variableVersionId: '' })
    expect(f.variables.forConversation(chat, characterId)).toBeNull()
    expect(f.states.runtimeContext(chat, { characterId })).toBeUndefined()
    const second = f.conversations.create({ metadata: { characterId } }).conversation.id
    expect(f.variables.forConversation(second, characterId)).toBeNull()
    f.openings.save(characterId, { ...value, openingMessages: value.openingMessages.map(message => ({ ...message, content: '' })) })
    const blank = f.conversations.create({ metadata: { characterId } }).conversation.id
    expect(f.variables.forConversation(blank, characterId)).toBeNull()
    expect(f.conversations.openingText(blank)).toBe('')
  }, 20_000)
  it('loads the complete selected configuration and keeps it across active-version changes and reopening', async () => {
    const f = fixture()
    const id = f.conversations.create({ metadata: { characterId: 'synthetic-character' } }).conversation.id
    const context = () => f.states.runtimeContext(id, { characterId: 'synthetic-character' })!
    expect(JSON.parse(context().stateJson)).toEqual({ status: { energy: 2 } })
    expect(context().schemaCode).toContain('.max(10)')
    expect(context().variables[0]?.updateRule).toBe('rule-variant-a')

    f.conversations.selectOpening(id, 'opening-b')
    expect(JSON.parse(context().defaultStateJson)).toEqual({ status: { energy: 20 } })
    expect(context().schemaCode).toContain('.max(100)')
    expect(context().objects.find((object) => object.id === 'status')?.updateRule).toBe('variant-b')
    expect(context().variables[0]?.updateRule).toBe('rule-variant-b')
    const config = f.variables.get('synthetic-character')
    f.variables.save('synthetic-character', { ...config, ...config.versions[0]!, activeVersionId: 'variant-a' })
    expect(context().schemaCode).toContain('.max(100)')

    const snapshotRoot = join(f.directory, 'snapshots')
    mkdirSync(snapshotRoot)
    process.env.ELECKOI_SESSION_SNAPSHOT_ROOT = snapshotRoot
    const selected = context()
    const variableState = { enabled: true, config: {
      defaultState: JSON.parse(selected.defaultStateJson), schemaCode: selected.schemaCode,
      objects: selected.objects, variables: selected.variables,
    }, state: JSON.parse(selected.stateJson) }
    const contexts = runtimeContextsFor(id, { variables: variableState })
    const tools = new Map<string, { execute(args: unknown, execution: unknown): Promise<any> }>()
    applyVariableTools({ eleckoiRuntimeContexts: contexts, eleckoiVariableProcessing: new ElecKoiVariableProcessing({} as any),
      tools: { register(definition: any) { tools.set(definition.name, definition); return () => {} } } })
    const execution = { agent: { session: { id } } }
    const patch = tools.get('eleckoi_apply_variable_patch')!
    expect(await patch.execute({ operations: [{ op: 'replace', path: '/status/energy', value: 50 }] }, execution)).toMatchObject({ status: 'ok' })
    expect(await patch.execute({ operations: [{ op: 'replace', path: '/status/energy', value: 101 }] }, execution)).toMatchObject({ status: 'validation_error' })

    f.states.replaceCurrent(id, '{"status":{"energy":50}}')
    f.database.close(); f.database.open()
    expect(JSON.parse(context().stateJson)).toEqual({ status: { energy: 50 } })
    expect(context().schemaCode).toContain('.max(100)')
    f.conversations.updateOpening(id, '修改合成开场')
    expect(f.variables.forConversation(id, 'synthetic-character')!.activeVersionId).toBe('variant-b')
  }, 20000)

  it('keeps chat progress when an associated version is deleted and restores the association by identity', async () => {
    const f = fixture()
    const library = f.libraries.get('synthetic-character')
    const exported = decodeSettingLibrarySnapshot(encodeSettingLibrarySnapshot(library), 'synthetic-character')
    const config = decodeVariableConfigSnapshot(encodeVariableConfigSnapshot(f.variables.get('synthetic-character')), 'synthetic-character')
    expect(exported.entries).toEqual([])
    expect(JSON.parse(JSON.stringify(f.openings.get('synthetic-character'))).openingMessages.map((opening: any) => opening.variableVersionId)).toEqual(['variant-a', 'variant-b'])
    expect(config.versions.map((version) => version.id)).toEqual(['variant-a', 'variant-b'])
    const id = f.conversations.create({ metadata: { characterId: 'synthetic-character' } }).conversation.id
    f.states.replaceCurrent(id, '{"status":{"energy":7}}')
    const before = f.states.viewerStates(id)
    const live = liveTools(f, id)
    f.variables.save('synthetic-character', { ...config, ...config.versions[1]!, activeVersionId: 'variant-b', versions: [config.versions[1]!] })
    expect(f.variables.forConversation(id, 'synthetic-character')).toBeNull()
    expect(f.states.runtimeContext(id, { characterId: 'synthetic-character' })).toMatchObject({ defaultStateJson: '{}', schemaCode: '', variables: [] })
    expect(f.states.viewerStates(id)).toEqual(before)
    expect(await live.call('eleckoi_read_variables', { paths: ['/status/energy'] })).toMatchObject({ status: 'not_found' })
    const missing = f.conversations.create({ metadata: { characterId: 'synthetic-character' } }).conversation.id
    expect(f.variables.forConversation(missing, 'synthetic-character')).toBeNull()
    expect(f.states.runtimeContext(missing, { characterId: 'synthetic-character' })).toBeUndefined()
    expect(f.conversations.openingText(missing)).toBe('合成开场 A')
    f.database.close(); f.database.open()
    expect(f.states.viewerStates(id)).toEqual(before)
    expect(f.variables.forConversation(id, 'synthetic-character')).toBeNull()
    f.variables.save('synthetic-character', { ...config, ...config.versions[1]!, activeVersionId: 'variant-b' })
    expect(f.variables.forConversation(id, 'synthetic-character')!.activeVersionId).toBe('variant-a')
    expect(f.states.viewerStates(id)).toEqual(before)
    expect(f.variables.get('synthetic-character').versions).toHaveLength(2)
  }, 20000)

  it('preserves a development v10 chat binding even when the character now selects another variable version', () => {
    const f = fixture()
    const id = f.conversations.create({ metadata: { characterId: 'synthetic-character' } }).conversation.id
    f.states.replaceCurrent(id, '{"status":{"energy":7}}')
    const before = f.states.viewerStates(id)
    const config = f.variables.get('synthetic-character')
    f.variables.save('synthetic-character', { ...config, ...config.versions[1]!, activeVersionId: 'variant-b' })
    f.database.close()
    const legacy = new Database(f.path)
    restoreV10PresetFixture(legacy)
    legacy.exec('DROP TABLE script_libraries; CREATE TABLE IF NOT EXISTS `conversation_generation_results` (`operationId` TEXT NOT NULL, `conversationId` TEXT NOT NULL, `resultJson` TEXT NOT NULL, PRIMARY KEY(`operationId`), FOREIGN KEY(`conversationId`) REFERENCES `chat_sessions`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE ); PRAGMA user_version=10;')
    legacy.close()
    f.database.open()
    expect(f.database.native.pragma('user_version', { simple: true })).toBe(CURRENT_SCHEMA_VERSION)
    expect(f.variables.get('synthetic-character').activeVersionId).toBe('variant-b')
    expect(f.variables.forConversation(id, 'synthetic-character')!.activeVersionId).toBe('variant-a')
    expect(f.states.viewerStates(id)).toEqual(before)
    expect(f.database.native.pragma('foreign_key_check')).toEqual([])
    expect(f.database.native.pragma('integrity_check', { simple: true })).toBe('ok')
  }, 20000)

  it('migrates a real v8 chat with current values intact and fixes its version before later editor changes', () => {
    const f = fixture()
    const id = f.conversations.create({ metadata: { characterId: 'synthetic-character' } }).conversation.id
    f.states.replaceCurrent(id, '{"status":{"energy":7}}')
    f.database.close()
    const legacy = new Database(f.path)
    restoreV10PresetFixture(legacy)
    legacy.exec('DROP TABLE script_libraries; ALTER TABLE agent_conversations DROP COLUMN variableVersionId; PRAGMA user_version=8;')
    legacy.close()
    f.database.open()
    expect(f.database.native.pragma('user_version', { simple: true })).toBe(CURRENT_SCHEMA_VERSION)
    const config = f.variables.get('synthetic-character')
    f.variables.save('synthetic-character', { ...config, ...config.versions[1]!, activeVersionId: 'variant-b' })
    expect(f.variables.forConversation(id, 'synthetic-character')!.activeVersionId).toBe('variant-a')
    expect(f.states.viewerStates(id)).toMatchObject({ currentStateJson: '{\n  "status": {\n    "energy": 7\n  }\n}' })
    expect(f.database.native.pragma('foreign_key_check')).toEqual([])
    expect(f.database.native.pragma('integrity_check', { simple: true })).toBe('ok')
  }, 20000)
})
