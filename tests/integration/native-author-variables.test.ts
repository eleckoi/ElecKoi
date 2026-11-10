import { clientBundlePath } from '../support/client-bundle.js'
import RemoteAccessService from '@deepseek-ai/dsh-api-remote-access'
import { ownerPeer } from '../support/owner-peer.js'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative } from 'node:path'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import * as Cordis from '@deepseek-ai/cordis'
import TypertGatewayService from '@deepseek-ai/dsh-api-gateway'
import TypertRegistry, { type TypertContribution } from '@deepseek-ai/dsh-typert-registry'
import { TYPERT } from '@eleckoi/dsh-product-api/typert'
import { TYPERT_REMOTE } from '@eleckoi/dsh-product-api/remote'
import { createAuthorVariableBindings, installElecKoiAuthorApi } from '@eleckoi/author-sdk/browser'
import { afterEach, describe, expect, it, vi } from 'vitest'
// @ts-expect-error The browser test runtime does not publish declarations.
import { JSDOM } from 'jsdom'
import { ElecKoiAuthorVariablesApi, ElecKoiVariableProcessing } from '@eleckoi/dsh-product-api'
import { createVariableIdentities } from '../../packages/shared/src/foundation/variables/identity'
import productDataPlugin from '@eleckoi/dsh-product-data'
import { installTavernFrontend } from '@eleckoi/tavern-frontend'

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => { for (const close of cleanups.splice(0)) await close() })
const signal = () => new AbortController().signal
const require = createRequire(import.meta.url)

async function runtime(persisted?: { conversationId(): string }) {
  const ctx = new Cordis.Context()
  if (persisted) await ctx.plugin(productDataPlugin)
  const conversationId = persisted?.conversationId ?? (() => 'synthetic-chat')
  let current = '{"value":2,"nested":{"kept":true}}', initial = '{"value":1}', schemaCode = ''
  let identityJson = JSON.stringify(createVariableIdentities(JSON.parse(current), { versionId: '', objects: [], variables: [] }, 'runtime'))
  const save = vi.fn((_id: string, json: string, identity?: string) => { current = json; identityJson = identity!; return json })
  const listeners = new Set<(event: unknown) => void>()
  const publish = vi.fn(change => {
    if (change.kind === 'messages') for (const listener of listeners) listener(change)
  })
  const data = persisted ? ctx.eleckoiProductData : {
    readAuthorConversationState(id: string) {
      if (id !== 'synthetic-chat') throw new Error('Synthetic conversation not found')
      return { currentVariableStateJson: current, initialVariableStateJson: initial, variableIdentityJson: identityJson, variableConfig: schemaCode ? { schemaCode } : null }
    },
    replaceConversationVariableState: save,
  }
  const processor = new ElecKoiVariableProcessing(data as any)
  const registry = ctx.plugin(TypertRegistry)
  await registry
  const unregister = ctx.typert.register(TYPERT as TypertContribution)
  if (!persisted) ctx.provide('eleckoiProductData', data as any)
  ctx.provide('eleckoiVariableProcessing', processor)
  ctx.provide('eleckoiConversationChanges', { publish } as any)
  await ctx.plugin(RemoteAccessService)
  const gateway = ctx.plugin(TypertGatewayService), variables = ctx.plugin(ElecKoiAuthorVariablesApi)
  await gateway; await variables
  const page = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/' })
  const invoke = (method: string, args: Record<string, unknown>, requestSignal = signal()) => ctx.typertGateway.invoke({ peer: ownerPeer(ctx),
    namespace: 'eleckoiAuthorVariables', method, args, signal: requestSignal,
  })
  const client = new Cordis.Context()
  let closed = false
  const close = async () => {
    if (closed) return
    closed = true
    page.window.dispatchEvent(new page.window.Event('pagehide'))
    await client.fiber.dispose(); page.window.close()
    processor.close(); await variables.dispose(); await gateway.dispose(); unregister(); await registry.dispose()
    await ctx.fiber.dispose()
  }
  cleanups.push(close)
  await client.plugin(TypertRegistry)
  const call = vi.fn(async (_base: string, endpoint: string, payload: { args: Record<string, unknown> }, requestSignal: AbortSignal) => {
      const [namespace, method] = endpoint.split('/')
      if (namespace !== 'eleckoiAuthorVariables') throw new Error('Synthetic native namespace unavailable')
      const controller = new AbortController(), cancel = () => controller.abort(requestSignal.reason)
      if (requestSignal.aborted) controller.abort(requestSignal.reason)
      else requestSignal.addEventListener('abort', cancel, { once: true })
      try {
        return { ok: true, value: await invoke(method!, payload.args, controller.signal) }
      } catch (error) {
        return { ok: false, error: { code: 'gateway/internal', message: error instanceof Error ? error.message : String(error), details: {} } }
      } finally { requestSignal.removeEventListener('abort', cancel) }
  })
  client.provide('connection', { rpc: { call, open: vi.fn(async function* () {}) },
    registerGenerationSource: () => () => {}, start: () => ({ stop() {} }) } as any)
  let registration: { factory(load: (name: string) => unknown): Cordis.Plugin }
  runInNewContext(readFileSync(clientBundlePath(require, '@deepseek-ai/dsh-api-gateway/client'), 'utf8'), {
    window: { __ModuleLoader__: { load(value: typeof registration) { registration = value } } },
    crypto: globalThis.crypto, AbortController: page.window.AbortController, AbortSignal: page.window.AbortSignal,
    Error, setTimeout, clearTimeout,
  })
  await client.plugin(registration!.factory(name => {
    if (name === '@deepseek-ai/cordis') return Cordis
    throw new Error(`Unexpected native Client dependency: ${name}`)
  }))
  await client.remote.$mount(TYPERT_REMOTE)
  const bindings = createAuthorVariableBindings(client.remote.eleckoiAuthorVariables, conversationId)
  const browserMethods: Record<string, () => unknown> = {
    'context.current': () => ({ surface: 'message-renderer', scope: 'current-character', conversationId: conversationId(), messageId: 'synthetic-message' }),
    'app.getCapabilities': () => [...Object.keys(bindings), ...Object.keys(browserMethods)].map(method => ({ method })),
    'events.list': () => ({ items: ['messages.changed'] }),
  }
  const api = installElecKoiAuthorApi(page.window as any, {
    request(method, params, options) {
      if (Object.hasOwn(browserMethods, method)) return browserMethods[method]!()
      const binding = bindings[method]
      if (!binding) throw new Error('Synthetic native method unavailable')
      return binding(params, options)
    },
    on(event, listener) {
      if (event !== 'messages.changed') throw new Error('Synthetic event subscription unavailable')
      listeners.add(listener); return () => listeners.delete(listener)
    },
  })
  return { ctx, client, bindings, call, processor, api, invoke, save, publish, close, window: page.window,
    get state() { return JSON.parse(current) },
    set current(value: string) {
      current = value
      try { identityJson = JSON.stringify(createVariableIdentities(JSON.parse(value), { versionId: '', objects: [], variables: [] }, 'runtime')) }
      catch { identityJson = '{}' }
    },
    set initial(value: string) { initial = value },
    set schema(value: string) { schemaCode = value },
  }
}

describe('native author variable Remote', () => {
  it('keeps player form values inside their chat across new chats, resets and a complete Host reopen', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'eleckoi-player-form-'))
    const environment = {
      ELECKOI_DATABASE_PATH: join(directory, 'product.sqlite3'),
      ELECKOI_MEDIA_ROOT: join(directory, 'media'),
      ELECKOI_WORKSPACE_ROOT: directory,
    }
    const previous = Object.fromEntries(Object.keys(environment).map(key => [key, process.env[key]]))
    Object.assign(process.env, environment)
    try {
      let selected = ''
      const r = await runtime({ conversationId: () => selected })
      const data = r.ctx.eleckoiProductData, characterId = 'synthetic-form-character'
      data.createCharacter({ id: characterId, name: 'Synthetic form character' })
      const base = data.readVariableConfig(characterId), source = base.versions[0]!
      const group = (id: string, dynamicKey = false) => ({ id, name: id, parentId: '', enabled: true,
        dynamicKey, description: '', updateRule: '', order: 1, treeViewOrder: 1, createdAt: '', updatedAt: '' })
      const variable = (id: string, objectId: string, defaultValue: string) => ({ id, title: id, objectId,
        enabled: true, type: 'string' as const, defaultValue, description: '', updateRule: '', readMode: 'on_demand' as const,
        order: 1, treeViewOrder: 1, createdAt: '', updatedAt: '' })
      const version = { ...source, schemaCode: '', objects: [group('world'), group('player'), group('members', true)],
        variables: [variable('date', 'world', '第一天'), variable('name', 'player', ''), variable('profession', 'player', '')],
        initialStateJson: '{"world":{"date":"第一天"},"player":{"name":"","profession":""},"members":{}}' }
      const saved = data.saveVariableConfig(characterId, { ...base, ...version, versions: [version] })
      const opening = data.readCharacterOpenings(characterId)
      data.saveCharacterOpenings(characterId, { ...opening, openingMessages: [{ id: 'synthetic-opening', title: 'Synthetic opening',
        content: 'Synthetic start', variableVersionId: version.id }], defaultOpeningMessageId: 'synthetic-opening' })
      const defaults = JSON.parse(saved.initialStateJson)
      const first = data.createConversation({ metadata: { characterId } }).conversation.id
      selected = first
      const filled = { world: { date: '第三天' }, player: { name: 'Synthetic player A', profession: 'Synthetic profession A' },
        members: { alpha: { score: 8 } } }
      expect(await r.api.variables.merge(filled)).toEqual(filled)
      const second = data.createConversation({ metadata: { characterId } }).conversation.id
      expect(second).not.toBe(first)
      selected = second
      expect(await r.api.variables.getState()).toEqual(defaults)
      const secondFilled = { ...defaults, player: { name: 'Synthetic player B', profession: 'Synthetic profession B' } }
      expect(await r.api.variables.setState(secondFilled)).toEqual(secondFilled)
      selected = first
      expect(await r.api.variables.getState()).toEqual(filled)
      expect(data.readVariableConfig(characterId)).toEqual(saved)
      expect(JSON.parse(data.readAuthorConversationState(first).initialVariableStateJson)).toEqual(defaults)
      await r.close()
      const reopened = await runtime({ conversationId: () => selected })
      expect(await reopened.api.variables.getState()).toEqual(filled)
      selected = second
      expect(await reopened.api.variables.getState()).toEqual(secondFilled)
      expect(await reopened.api.variables.reset()).toEqual(defaults)
      selected = first
      expect(await reopened.api.variables.getState()).toEqual(filled)
      const fresh = reopened.ctx.eleckoiProductData.createConversation({ metadata: { characterId } }).conversation.id
      selected = fresh
      expect(await reopened.api.variables.getState()).toEqual(defaults)
      expect(reopened.ctx.eleckoiProductData.readVariableConfig(characterId)).toEqual(saved)
    } finally {
      cleanups.push(async () => {
        for (const [key, value] of Object.entries(previous)) {
          if (value === undefined) delete process.env[key]; else process.env[key] = value
        }
        const child = relative(tmpdir(), directory)
        if (!child || child.startsWith('..') || isAbsolute(child)) throw new Error('Unexpected fixture cleanup path')
        rmSync(directory, { recursive: true, force: true })
      })
    }
  }, 60_000)

  it('projects all native entries through the generated Remote and notifies only accepted saves', async () => {
    const r = await runtime(), count = 10001
    const records = Object.fromEntries(Array.from({ length: count }, (_, index) => [`synthetic-${index}`, {
      text: `Synthetic start ${index} ${'x'.repeat(256)} Synthetic final keyword ${index}`, count: index, optional: null,
    }]))
    r.current = JSON.stringify({ records })
    r.schema = 'z.object({ records: z.record(z.string(), z.object({ text: z.string(), count: z.number().min(0), optional: z.string().nullable() })) })'
    const report = vi.fn(), controller = await installTavernFrontend(r.window as any, r.api, { report })
    cleanups.unshift(async () => controller.dispose())
    const page = r.window as any, listener = vi.fn()
    page.eventOn(page.Mvu.events.VARIABLE_UPDATE_ENDED, listener)
    const initial = page.getAllVariables().stat_data.records
    expect(Object.keys(initial)).toHaveLength(count)
    for (const index of [0, 5000, 10000]) expect(initial[`synthetic-${index}`]).toEqual(records[`synthetic-${index}`])
    await r.api.variables.applyPatch([{ op: 'replace', path: '/records/synthetic-10000/count', value: 9 }])
    await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce())
    expect(r.save).toHaveBeenCalledOnce()
    expect(page.getAllVariables().stat_data.records['synthetic-10000']).toMatchObject({ count: 9, optional: null })
    expect(page.getAllVariables().stat_data.records['synthetic-10000'].text).toContain('Synthetic final keyword 10000')
    expect(Object.keys(page.Mvu.getMvuData().stat_data.records)).toHaveLength(count)
    const after = listener.mock.calls[0]![0]
    expect(after.stat_data).toEqual(await r.api.variables.getState())
    await expect(r.api.variables.applyPatch([{ op: 'replace', path: '/records/synthetic-10000/count', value: -1 }]))
      .rejects.toMatchObject({ message: expect.any(String) })
    await controller.flush()
    expect(r.save).toHaveBeenCalledOnce(); expect(listener).toHaveBeenCalledOnce()
    expect(report).not.toHaveBeenCalled()
  }, 60000)

  it('runs the real SDK through generated Remote without a compatibility service or store', async () => {
    const r = await runtime()
    expect(ElecKoiAuthorVariablesApi.inject.some(name => name.includes('Compatibility'))).toBe(false)
    expect(r.ctx.get('eleckoiCompatibilityApi', false)).toBeUndefined()
    expect(await r.api.variables.getState()).toEqual({ value: 2, nested: { kept: true } })
    expect(await r.api.variables.getConfig()).toBeNull()
    await r.api.variables.merge({ nested: { added: true } })
    await r.api.variables.applyPatch([{ op: 'replace', path: '/value', value: 5 }])
    expect(r.state).toEqual({ value: 5, nested: { kept: true, added: true } })
    expect(r.save).toHaveBeenCalledTimes(2); expect(r.publish).toHaveBeenCalledTimes(2)
    expect(r.call.mock.calls.map(([, endpoint]) => endpoint)).toEqual([
      'eleckoiAuthorVariables/getState', 'eleckoiAuthorVariables/getConfig',
      'eleckoiAuthorVariables/merge', 'eleckoiAuthorVariables/applyPatch',
    ])
    expect((r.window as any).TavernHelper).toBeUndefined(); expect((r.window as any).Mvu).toBeUndefined()
  })

  it('preserves the existing strict Remote argument and cancellation contracts', async () => {
    const r = await runtime()
    await expect(r.invoke('setState', { conversationId: 'synthetic-chat' })).rejects.toThrow()
    await expect(r.invoke('setState', { conversationId: 'synthetic-chat', stateJson: '{}', extra: true })).rejects.toThrow()
    expect(r.save).not.toHaveBeenCalled()
    const controller = new AbortController(); controller.abort(new Error('Synthetic cancellation'))
    await expect(r.invoke('setState', { conversationId: 'synthetic-chat', stateJson: '{"value":8}' }, controller.signal)).rejects.toThrow()
    expect(r.state.value).toBe(2); expect(r.publish).not.toHaveBeenCalled()
  })

  it('runs native Zod defaults, preprocessing and transforms before one save', async () => {
    const r = await runtime()
    r.schema = 'z.object({ value: z.preprocess(value => Number(value), z.number().min(0)), label: z.string().default("Synthetic") }).transform(state => ({ ...state, derived: state.value * 2 }))'
    expect(await r.api.variables.setState({ value: '5' })).toEqual({ value: 5, label: 'Synthetic', derived: 10 })
    expect(r.save).toHaveBeenCalledTimes(1); expect(r.publish).toHaveBeenCalledTimes(1)
    await expect(r.api.variables.setState({ value: -1 })).rejects.toThrow()
    expect(r.state).toEqual({ value: 5, label: 'Synthetic', derived: 10 })
    expect(r.save).toHaveBeenCalledTimes(1)
    await r.api.variables.setState({ value: 6 })
    expect(r.state.derived).toBe(12); expect(r.save).toHaveBeenCalledTimes(2)
  })

  it('applies merge and patch to the candidate after the before-change rules', async () => {
    const r = await runtime(), stages: string[] = []
    r.processor.register({ open: () => ({
      async apply(stage, state) { stages.push(stage); return stage === 'before' ? { ...state, prepared: { enabled: true } } : state },
      close() {},
    }) })
    await r.api.variables.applyPatch([{ op: 'replace', path: '/prepared/enabled', value: false }])
    expect(r.state.prepared).toEqual({ enabled: false })
    expect(stages).toEqual(['before', 'after', 'afterSchema'])
    await r.api.variables.merge({ prepared: { value: 3 } })
    expect(r.state.prepared).toEqual({ enabled: true, value: 3 })
    expect(r.save).toHaveBeenCalledTimes(2)
  })

  it('awaits native asynchronous rules and lets a failed attempt be corrected', async () => {
    const r = await runtime(); let finish!: () => void, fail = true
    r.processor.register({ open: () => ({
      async apply(stage, state) {
        if (stage !== 'after') return state
        await new Promise<void>(resolve => { finish = resolve })
        if (fail) throw new Error('Synthetic derived rule failure')
        return { ...state, derived: Number(state.value) * 2 }
      },
      close() {},
    }) })
    const failed = r.api.variables.setState({ value: 4 })
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    expect(r.save).not.toHaveBeenCalled(); expect(r.state.value).toBe(2)
    finish(); await expect(failed).rejects.toThrow('Synthetic derived rule failure')
    expect(r.save).not.toHaveBeenCalled(); expect(r.publish).not.toHaveBeenCalled()
    fail = false; finish = undefined as any
    const corrected = r.api.variables.setState({ value: 5 })
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    finish(); expect(await corrected).toEqual({ value: 5, derived: 10 })
    expect(r.save).toHaveBeenCalledTimes(1)
  })

  it('rejects a concurrent attempt and a stale completed candidate without overwriting data', async () => {
    const r = await runtime(); let finish!: () => void
    r.processor.register({ open: () => ({
      async apply(stage, state) { if (stage === 'after') await new Promise<void>(resolve => { finish = resolve }); return state }, close() {},
    }) })
    const pending = r.api.variables.merge({ added: true })
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    await expect(r.api.variables.applyPatch([{ op: 'replace', path: '/value', value: 8 }])).rejects.toThrow()
    r.current = '{"value":9}'
    finish(); await expect(pending).rejects.toThrow()
    expect(r.state).toEqual({ value: 9 }); expect(r.save).not.toHaveBeenCalled(); expect(r.publish).not.toHaveBeenCalled()
  })

  it('does not save partial patches, invalid JSON or empty placeholder states', async () => {
    const r = await runtime()
    await expect(r.api.variables.applyPatch([{ op: 'add', path: '/added', value: true }, { op: 'replace', path: '/missing', value: 3 }])).rejects.toThrow()
    for (const stateJson of ['not-json', '[]', 'null']) await expect(r.invoke('setState', { conversationId: 'synthetic-chat', stateJson })).rejects.toThrow()
    r.current = 'not-json'
    await expect(r.api.variables.getState()).rejects.toThrow()
    expect(r.save).not.toHaveBeenCalled(); expect(r.publish).not.toHaveBeenCalled()
  })

  it('resets from the bound opening state and processes it once', async () => {
    const r = await runtime()
    r.initial = '{"value":3}'
    r.schema = 'z.object({ value: z.number() }).transform(state => ({ ...state, derived: state.value * 2 }))'
    expect(await r.api.variables.reset()).toEqual({ value: 3, derived: 6 })
    expect(r.save).toHaveBeenCalledTimes(1); expect(r.publish).toHaveBeenCalledTimes(1)
  })

  it('does not substitute current state for an explicit historical or unavailable conversation', async () => {
    const r = await runtime()
    await expect(r.api.variables.getState({ messageId: 'synthetic-message' })).rejects.toThrow('历史消息')
    expect(r.call).not.toHaveBeenCalled()
    await expect(r.api.call('variables.getState', { conversationId: 'synthetic-other-chat' })).rejects.toThrow('not found')
    expect(r.call.mock.calls[0]?.[2].args).toEqual({ conversationId: 'synthetic-other-chat' })
    const bindings = createAuthorVariableBindings(r.client.remote.eleckoiAuthorVariables, () => '')
    await expect(bindings['variables.getState']!({}, { signal: new r.window.AbortController().signal })).rejects.toThrow('尚未绑定')
    expect(r.call).toHaveBeenCalledTimes(1); expect(r.save).not.toHaveBeenCalled()
  })

  it('cancels the real native Remote when the author page closes during asynchronous processing', async () => {
    const r = await runtime(); let finish!: () => void
    r.processor.register({ open: () => ({
      async apply(stage, state) { if (stage === 'after') await new Promise<void>(resolve => { finish = resolve }); return state },
      close() {},
    }) })
    const pending = r.api.variables.merge({ added: true })
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    r.window.dispatchEvent(new r.window.Event('pagehide'))
    await expect(pending).rejects.toMatchObject({ code: 'FRAME_CLOSED' })
    finish()
    await vi.waitFor(() => expect(r.call.mock.settledResults[0]?.type).toBe('fulfilled'))
    expect(r.save).not.toHaveBeenCalled(); expect(r.publish).not.toHaveBeenCalled()
  })
})
