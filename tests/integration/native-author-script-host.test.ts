import { clientBundlePath } from '../support/client-bundle.js'
import { createVariableIdentities } from '../../packages/shared/src/foundation/variables/identity'
import RemoteAccessService from '@deepseek-ai/dsh-api-remote-access'
import { ownerPeer } from '../support/owner-peer.js'
import * as Cordis from '@deepseek-ai/cordis'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import TypertGatewayService from '@deepseek-ai/dsh-api-gateway'
import TypertRegistry, { type TypertContribution } from '@deepseek-ai/dsh-typert-registry'
import { TYPERT } from '@eleckoi/dsh-product-api/typert'
import { TYPERT_REMOTE } from '@eleckoi/dsh-product-api/remote'
import { ElecKoiAuthorScriptsApi, ElecKoiAuthorVariablesApi, ElecKoiVariableProcessing,
  type NativeAuthorRuleTask, type NativeAuthorRuleReply } from '@eleckoi/dsh-product-api'
import type { ScriptLibrary, ScriptItem } from '@eleckoi/dsh-product-api/types'
import { AuthorScriptSession, type AuthorScriptProgram, isNativeAuthorScript } from '@eleckoi/author-sdk'
// @ts-expect-error The browser test runtime does not publish declarations.
import { JSDOM } from 'jsdom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NativeAuthorClient } from '@eleckoi/dsh-client-author/runtime'
import { runtimeContextsFor } from '../helpers/runtime-contexts.js'
// @ts-expect-error The production tool entry is JavaScript.
import { apply as applyVariableTools } from '../../apps/desktop/resources/dsh/variable-tools.mjs'

const { Context } = Cordis
const require = createRequire(import.meta.url)

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => { for (const close of cleanups.splice(0).reverse()) await close() })

class Inbox<T> implements AsyncIterable<T> {
  private readonly queue: T[] = []
  private waiter: (() => void) | undefined
  private closed = false
  send(value: T) { this.queue.push(value); this.waiter?.(); this.waiter = undefined }
  close() { this.closed = true; this.waiter?.(); this.waiter = undefined }
  async *[Symbol.asyncIterator]() {
    while (!this.closed) {
      const value = this.queue.shift()
      if (value !== undefined) yield value
      else await new Promise<void>(resolve => { this.waiter = resolve })
    }
  }
}

function script(extra: Record<string, any> = {}): ScriptItem {
  return { type: 'script', id: 'synthetic-script', name: 'Synthetic script', enabled: true, content: 'export default () => {}',
    info: '', data: {}, button: { enabled: false, buttons: [] }, export_with: { data: true, button: true },
    runtime: { kind: 'eleckoi-module', apiVersion: 1 }, ...extra }
}
async function runtime() {
  const ctx = new Context(), libraries = new Map<string, ScriptLibrary>()
  let current = '{"value":1}', schema = '', characterId = 'synthetic-character', presetId = 'synthetic-preset'
  let identityJson = JSON.stringify(createVariableIdentities(JSON.parse(current), { versionId: '', objects: [], variables: [] }, 'runtime'))
  const publish = vi.fn(), save = vi.fn((_id: string, json: string, identities: string) => { current = json; identityJson = identities; return json })
  for (const scope of ['global', 'preset', 'character'] as const) {
    const ownerId = scope === 'character' ? characterId : scope === 'preset' ? presetId : ''
    libraries.set(JSON.stringify([scope, ownerId]), { scope, ownerId, enabled: true, revision: 0, trees: [], variables: {} })
  }
  const data = {
    readConversationDetails(id: string) { if (id !== 'synthetic-chat') throw new Error('Synthetic chat not found'); return { metadata: { characterId } } },
    readAgentPresetCatalog: () => ({ activePresetIds: { roleplay: presetId, creator: 'synthetic-creator' } }),
    readScriptWorkspace(scope: string, ownerId: string) {
      const library = libraries.get(JSON.stringify([scope, ownerId]))!
      const scripts = library.trees.flatMap(item => item.type === 'folder' ? item.scripts : [item])
      return { path: '', version: createHash('sha256').update(JSON.stringify(scripts.map(item => item.content))).digest('hex'),
        entries: scripts.map(item => ({ id: item.id, file: `scripts/${encodeURIComponent(item.id)}.js` })) }
    },
    readScriptLibrary(scope: string, ownerId: string) {
      const library = libraries.get(JSON.stringify([scope, ownerId]))
      if (!library) throw new Error('Synthetic library not found')
      return structuredClone(library)
    },
    readAuthorConversationState: () => ({ currentVariableStateJson: current, variableIdentityJson: identityJson, initialVariableStateJson: '{"value":1}', variableConfig: schema ? { schemaCode: schema } : null }),
    replaceConversationVariableState: save,
  }
  const processor = new ElecKoiVariableProcessing(data as any)
  await ctx.plugin(TypertRegistry); const unregister = ctx.typert.register(TYPERT as TypertContribution)
  ctx.provide('eleckoiProductData', data as any); ctx.provide('eleckoiVariableProcessing', processor)
  ctx.provide('eleckoiConversationChanges', { publish } as any)
  ctx.provide('eleckoiCharacterConfigurationChanges', { publish } as any)
  await ctx.plugin(RemoteAccessService)
  await ctx.plugin(TypertGatewayService); await ctx.plugin(ElecKoiAuthorVariablesApi); await ctx.plugin(ElecKoiAuthorScriptsApi)
  cleanups.push(async () => { processor.close(); unregister(); await ctx.fiber.dispose() })
  const controller = () => new AbortController()
  const read = () => ctx.typertGateway.invoke({ peer: ownerPeer(ctx), namespace: 'eleckoiAuthorScripts', method: 'read', args: { conversationId: 'synthetic-chat' } })
  const set = (state: unknown, signal = controller().signal) => ctx.typertGateway.invoke({ peer: ownerPeer(ctx), namespace: 'eleckoiAuthorVariables', method: 'setState', args: { conversationId: 'synthetic-chat', stateJson: JSON.stringify(state) }, signal })
  return { ctx, data, processor, libraries, read, set, save, publish,
    get state() { return JSON.parse(current) }, set schema(value: string) { schema = value },
    library(scope: ScriptLibrary['scope']) { return libraries.get(JSON.stringify([scope, scope === 'global' ? '' : scope === 'character' ? characterId : presetId]))! },
    async open(version = ctx.eleckoiAuthorScriptsApi.read('synthetic-chat').version) {
      const abort = controller(), inbox = new Inbox<NativeAuthorRuleReply>()
      const stream = await ctx.typertGateway.stream({ peer: ownerPeer(ctx), namespace: 'eleckoiAuthorScripts', method: 'connect',
        args: { conversationId: 'synthetic-chat', version }, signal: abort.signal, uplink: inbox })
      const iterator = stream[Symbol.asyncIterator]()
      const ready = await iterator.next()
      cleanups.push(async () => { abort.abort(new Error('Synthetic page closed')); inbox.close(); await iterator.return?.().catch(() => {}) })
      return { abort, inbox, iterator, ready }
    },
  }
}

async function connectPrograms(r: Awaited<ReturnType<typeof runtime>>, programs: AuthorScriptProgram[]) {
  const catalog = r.ctx.eleckoiAuthorScriptsApi.read('synthetic-chat'), pages: any[] = [], stages: string[] = []
  const session = new AuthorScriptSession({ conversationId: 'synthetic-chat', scripts: catalog.scripts,
    createFrame() {
      const page = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/' }), index = pages.length
      pages.push(page)
      return { window: page.window, load: async () => programs[index]!, dispose: () => page.window.dispatchEvent(new page.window.Event('pagehide')) }
    },
    adapter: () => ({ request: () => { throw new Error('Unexpected second Host call during a candidate rule') }, on: () => () => {} }), status() {},
  })
  await session.start()
  const channel = await r.open(catalog.version)
  let streamError: unknown
  const consume = (async () => {
    try {
      for (;;) {
        const next = await channel.iterator.next()
        if (next.done) break
        const task = next.value as NativeAuthorRuleTask
        if (task.kind === 'cancel') { session.cancel(task.runId); continue }
        if (task.kind !== 'process') throw new Error('Unexpected native rule task')
        stages.push(task.stage)
        try {
          if (task.scriptSettings) session.updateSettings(task.scriptSettings)
          channel.inbox.send({ id: task.id, ok: true, stateJson: await session.apply(task.runId, task.stage, task.stateJson, task.beforeJson) })
        }
        catch (error) { channel.inbox.send({ id: task.id, ok: false, message: error instanceof Error ? error.message : String(error) }) }
      }
    } catch (error) { if (!channel.abort.signal.aborted) streamError = error }
  })()
  const disconnect = async () => {
    channel.abort.abort(new Error('Synthetic page closed')); channel.inbox.close()
    await session.close(); await consume
  }
  cleanups.push(async () => { await disconnect(); for (const page of pages) page.window.close() })
  return { session, channel, stages, disconnect, get streamError() { return streamError } }
}

describe('native author script Host', () => {
  it('removes every program in a disabled scope without changing individual or folder switches and restores them on enable', async () => {
    const r = await runtime()
    for (const scope of ['global', 'preset', 'character'] as const) {
      r.library(scope).trees = [script({ id: `script-${scope}` }), { type: 'folder', id: `folder-${scope}`,
        name: 'Synthetic folder', enabled: true, icon: '', color: '', scripts: [script({ id: `nested-${scope}` })] }]
    }
    expect(r.ctx.eleckoiAuthorScriptsApi.read('synthetic-chat').scripts).toHaveLength(6)
    for (const scope of ['global', 'preset', 'character'] as const) {
      const before = structuredClone(r.library(scope).trees)
      r.library(scope).enabled = false
      const disabled = r.ctx.eleckoiAuthorScriptsApi.read('synthetic-chat')
      expect(disabled.scripts).toHaveLength(4)
      expect(disabled.scripts.some(item => item.scope === scope)).toBe(false)
      expect(r.library(scope).trees).toEqual(before)
      r.library(scope).enabled = true
      expect(r.ctx.eleckoiAuthorScriptsApi.read('synthetic-chat').scripts).toHaveLength(6)
    }
  })
  it('runs the real native Client through generated Remote, retries rule failures and unloads cleanly without compatibility', async () => {
    const r = await runtime(), client = new Context(), page = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/' })
    const frames: any[] = [], libraryListeners = new Set<() => void>(), report = vi.fn()
    let native!: NativeAuthorClient
    r.library('character').trees = [script({ content: `export default ({api}) => {
      api.variables.registerRule({id:'derive',stage:'after',async run(context) {
        if (context.state.value < 0) throw new Error('Synthetic negative value');
        await api.variables.merge({derived: context.state.value * 2});
      }});
    }` })]
    r.schema = 'z.looseObject({value:z.number()}).transform(state=>({...state,value:state.value+1}))'
    await client.plugin(TypertRegistry)
    const call = vi.fn(async (_base: string, endpoint: string, payload: any, signal: AbortSignal) => {
      const [namespace, method] = endpoint.split('/')
      try { return { ok: true, value: await r.ctx.typertGateway.invoke({ peer: ownerPeer(r.ctx), namespace: namespace!, method: method!, args: payload.args, signal }) } }
      catch (error) { return { ok: false, error: { code: 'gateway/internal', message: String(error), details: {} } } }
    })
    const open = vi.fn(async function* (_base: string, endpoint: string, payload: any, signal: AbortSignal, uplink: AsyncIterable<unknown>) {
      if (endpoint === 'eleckoiConversations/changes') {
        const feed = new Inbox<unknown>(); signal.addEventListener('abort', () => feed.close(), { once: true })
        try { yield* feed } finally { feed.close() }
      } else {
        const [namespace, method] = endpoint.split('/')
        yield* await r.ctx.typertGateway.stream({ peer: ownerPeer(r.ctx), namespace: namespace!, method: method!, args: payload.args, signal, uplink })
      }
    })
    client.provide('connection', { rpc: { call, open }, registerGenerationSource: () => () => {}, start: () => ({ stop() {} }) } as any)
    let registration: any
    runInNewContext(readFileSync(clientBundlePath(require, '@deepseek-ai/dsh-api-gateway/client'), 'utf8'), {
      window: { __ModuleLoader__: { load(value: any) { registration = value } } },
      crypto: globalThis.crypto, AbortController, AbortSignal, Error, Object, setTimeout, clearTimeout,
    })
    cleanups.push(async () => { await native?.dispose(); await client.fiber.dispose(); for (const frame of frames) frame.window.close(); page.window.close() })
    await client.plugin(registration.factory((name: string) => {
      if (name === '@deepseek-ai/cordis') return Cordis
      throw new Error(`Unexpected native dependency: ${name}`)
    }))
    await client.remote.$mount(TYPERT_REMOTE)
    await client.plugin({ inject: ['remote', 'remote.eleckoiAuthorScripts', 'remote.eleckoiAuthorVariables', 'remote.eleckoiConversations', 'remote.eleckoiCharacterConfiguration', 'remote.eleckoiAgentPresets'],
      async apply(consumer: Cordis.Context) {
        native = new NativeAuthorClient({ window: page.window, remote: consumer.remote,
          conversations: { getDetailsSnapshot: () => ({ id: 'synthetic-chat', status: 'ready', details: { metadata: { characterId: 'synthetic-character' } } }),
            subscribeGeneration: () => () => {}, subscribeStream: () => () => {}, subscribeStats: () => () => {},
            subscribeDetails: () => () => {} } as any,
          libraries: { subscribeChanges: (listener: () => void) => { libraryListeners.add(listener); return () => libraryListeners.delete(listener) } } as any,
          models: { refresh: async () => { throw new Error('Unexpected model read during variable processing') } } as any,
          createFrame() {
            const frame = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/' }); frames.push(frame)
            return { window: frame.window, load: async source => (await import(`data:text/javascript,${encodeURIComponent(source)}`)).default,
              dispose: () => frame.window.dispatchEvent(new frame.window.Event('pagehide')) }
          }, report,
        })
        await consumer.effect(async () => { await native.start(); return () => native.dispose() })
      },
    })
    expect(native.getSnapshot().error).toBe('')
    expect(native.getSnapshot().status).toBe('ready')
    expect(client.get('eleckoiHtmlResources', false)).toBeUndefined()
    expect(r.ctx.get('eleckoiCompatibilityApi', false)).toBeUndefined()
    await expect(r.set({ value: -1 })).rejects.toThrow('Synthetic negative value')
    expect(r.save).not.toHaveBeenCalled(); expect(native.getSnapshot().status).toBe('ready')
    await r.set({ value: 3 })
    expect(r.state).toEqual({ value: 4, derived: 6 }); expect(r.save).toHaveBeenCalledTimes(1)
    // Candidate-local SDK calls never recurse into another Remote save.
    expect(call.mock.calls.map(([, endpoint]) => endpoint)).toEqual(['eleckoiAuthorScripts/read'])
    r.library('character').trees[0]!.enabled = false
    await native.refresh(true)
    expect(native.getSnapshot().status).toBe('ready')
    await r.set({ value: 5 }); expect(r.state).toEqual({ value: 6 })
    expect(open.mock.calls.filter(([, endpoint]) => endpoint === 'eleckoiAuthorScripts/connect')).toHaveLength(1)
    r.library('character').trees[0]!.enabled = true
    await native.refresh(true)
    await r.set({ value: 2 }); expect(r.state).toEqual({ value: 3, derived: 4 })
    expect(open.mock.calls.filter(([, endpoint]) => endpoint === 'eleckoiAuthorScripts/connect')).toHaveLength(2)
    expect(report).not.toHaveBeenCalled()
    await native.dispose(); expect(libraryListeners.size).toBe(0)
    expect(native.getSnapshot().status).toBe('closed')
  })

  it('selects explicit native runtime markers, never names, source text or another library owner', async () => {
    const r = await runtime()
    r.library('global').trees = [script()]
    r.library('preset').trees = [script()]
    r.library('character').trees = [script(), script({ id: 'synthetic-old', name: 'eleckoi-module', runtime: null,
      content: 'export default () => {}; // eleckoi-module' }), script({ id: 'synthetic-other', runtime: { kind: 'another-runtime', apiVersion: 1 } })]
    const catalog = await r.read() as any
    expect(catalog.scripts.map((item: any) => item.scope)).toEqual(['global', 'preset', 'character'])
    expect(new Set(catalog.scripts.map((item: any) => item.key)).size).toBe(3)
    expect(r.library('character').trees).toHaveLength(3)
    expect(isNativeAuthorScript({ name: 'eleckoi-module', content: 'eleckoi-module' })).toBe(false)
    expect(r.ctx.get('eleckoiCompatibilityApi', false)).toBeUndefined()
    expect(ElecKoiAuthorScriptsApi.inject.some(value => value.includes('Compatibility'))).toBe(false)
  })

  it('honors library, folder and item switches and diagnoses a known unsupported native version', async () => {
    const r = await runtime()
    r.library('global').enabled = false; r.library('global').trees = [script()]
    r.library('character').trees = [{ type: 'folder', id: 'synthetic-folder', name: 'Synthetic folder', enabled: false, icon: '', color: '', scripts: [script()] }, script({ id: 'synthetic-disabled', enabled: false })]
    expect((await r.read() as any).scripts).toEqual([])
    r.library('preset').trees = [script({ runtime: { kind: 'eleckoi-module', apiVersion: 99 } })]
    await expect(r.read()).rejects.toThrow('不支持')
    expect(r.library('preset').trees[0]!.runtime).toEqual({ kind: 'eleckoi-module', apiVersion: 99 })
  })

  it('runs generated bidirectional Remote rules, native candidate SDK calls and Zod exactly once before saving', async () => {
    const r = await runtime(); r.library('character').trees = [script()]
    r.schema = 'z.object({ value: z.number(), prepared: z.boolean(), derived: z.number() }).transform(state => ({ ...state, value: state.value + 1 }))'
    const c = await connectPrograms(r, [({ api }) => {
      api.variables.registerRule({ id: 'prepare', stage: 'before', run: context => { context.state.prepared = true } })
      api.variables.registerRule({ id: 'derive', stage: 'after', run: async context => {
        expect(await api.variables.getState()).toEqual(context.state)
        await api.variables.merge({ derived: Number(context.state.value) * 2 })
      } })
      api.variables.registerRule({ id: 'finish', stage: 'afterSchema', run: context => { context.state.finalized = true } })
    }])
    expect(c.channel.ready.value).toMatchObject({ kind: 'ready' })
    // A merge retains the before-stage preparation while the proposed value changes.
    const result = await r.ctx.typertGateway.invoke({ peer: ownerPeer(r.ctx), namespace: 'eleckoiAuthorVariables', method: 'merge',
      args: { conversationId: 'synthetic-chat', stateJson: '{"value":4}' }, signal: new AbortController().signal })
    expect(JSON.parse(result as string)).toEqual({ value: 5, prepared: true, derived: 8, finalized: true })
    expect(c.stages).toEqual(['before', 'after', 'afterSchema']); expect(r.save).toHaveBeenCalledTimes(1)
    expect(r.publish).toHaveBeenCalledTimes(1); expect(c.streamError).toBeUndefined()
  })

  it('returns an author failure without saving, then accepts a corrected Agent-style candidate', async () => {
    const r = await runtime(); r.library('character').trees = [script()]
    await connectPrograms(r, [({ api }) => { api.variables.registerRule({ id: 'check', stage: 'after', run: context => {
      if (Number(context.state.value) < 0) throw new Error('Synthetic value must be nonnegative')
      context.state.derived = Number(context.state.value) * 2
    } }) }])
    await expect(r.set({ value: -1 })).rejects.toMatchObject({ code: 'eleckoi/author-script', details: { reason: 'RULE_FAILED' }, message: 'Synthetic value must be nonnegative' })
    expect(r.state).toEqual({ value: 1 }); expect(r.save).not.toHaveBeenCalled()
    await r.set({ value: 3 }); expect(r.state).toEqual({ value: 3, derived: 6 }); expect(r.save).toHaveBeenCalledTimes(1)
  })

  it('accepts schema-only updates with an enabled panel script even before its Client starts', async () => {
    const r = await runtime(); r.schema = 'z.object({ value: z.number() }).transform(state => ({ ...state, derived: state.value * 2 }))'
    await r.set({ value: 2 }); expect(r.state).toEqual({ value: 2, derived: 4 })
    r.library('character').trees = [script()]
    await r.set({ value: 3 })
    expect(r.state).toEqual({ value: 3, derived: 6 })
    expect(r.save).toHaveBeenCalledTimes(2)
  })

  it('does not inspect or require unavailable script modules for AI and manual variable writes', async () => {
    const r = await runtime()
    r.library('character').trees = [script({ content: 'export default () => { throw new Error("Synthetic panel error") }' })]
    const workspace = vi.spyOn(r.data, 'readScriptWorkspace').mockImplementation(() => { throw new Error('Synthetic module unavailable') })
    const schemaCode = 'z.looseObject({value:z.number()}).transform(state=>({...state,derived:state.value*2}))'
    r.schema = schemaCode
    const contexts = runtimeContextsFor('synthetic-session', { variables: { enabled: true, state: { value: 1 }, config: {
      objects: [], variables: [], defaultState: {}, schemaCode,
    } } })
    const tools = new Map<string, any>()
    applyVariableTools({ eleckoiRuntimeContexts: contexts, eleckoiVariableProcessing: r.processor,
      tools: { register(definition: any) { tools.set(definition.name, definition); return () => {} } } })
    const outcome = await tools.get('eleckoi_apply_variable_patch').execute({ operations: [{ op: 'delta', path: '/value', value: 2 }] },
      { agent: { session: { id: 'synthetic-session' } }, signal: new AbortController().signal })
    expect(outcome, JSON.stringify(outcome)).toMatchObject({ status: 'ok', applied_operations: 1 })
    expect(contexts.get('synthetic-session').variables.state).toEqual({ value: 3, derived: 6 })
    await r.ctx.typertGateway.invoke({ peer: ownerPeer(r.ctx), namespace: 'eleckoiAuthorVariables', method: 'applyPatch',
      args: { conversationId: 'synthetic-chat', patchJson: '[{"op":"replace","path":"/value","value":4}]' }, signal: new AbortController().signal })
    expect(r.state).toEqual({ value: 4, derived: 8 })
    expect(workspace).not.toHaveBeenCalled()
  })

  it('allows new SDK writes after the script page has stopped, without requiring it to reconnect', async () => {
    const r = await runtime(); r.library('character').trees = [script()]
    const running = await connectPrograms(r, [() => {}])
    await running.disconnect()
    await r.set({ value: 5 })
    expect(r.state).toEqual({ value: 5 })
    expect(r.save).toHaveBeenCalledTimes(1)
  })

  it('rejects stale and duplicate script connections instead of choosing an arbitrary page', async () => {
    const r = await runtime(); r.library('character').trees = [script()]
    const version = r.ctx.eleckoiAuthorScriptsApi.read('synthetic-chat').version
    r.library('character').trees[0]!.content = 'export default () => { /* Synthetic code change */ }'
    await expect(r.open(version)).rejects.toMatchObject({ details: { reason: 'CATALOG_CHANGED' } })
    await r.open()
    await expect(r.open()).rejects.toMatchObject({ details: { reason: 'OWNER_CONFLICT' } })
    expect(r.save).not.toHaveBeenCalled()
  })

  it('releases a cancelled owner before its suspended iterator is drained and preserves its replacement', async () => {
    const r = await runtime(); r.library('character').trees = [script()]
    const former = await r.open()
    former.abort.abort(new Error('Synthetic page closed')); former.inbox.close()
    const replacement = await r.open()
    expect(replacement.ready.value).toMatchObject({ kind: 'ready' })
    await former.iterator.return?.().catch(() => {})
    await expect(r.open()).rejects.toMatchObject({ details: { reason: 'OWNER_CONFLICT' } })
    expect(r.save).not.toHaveBeenCalled()
  })

  it('keeps the same running program for settings edits and sends authoritative settings before each candidate', async () => {
    const r = await runtime(); r.library('character').trees = [script({ data: { multiplier: 2 } })]
    const start = vi.fn(), stop = vi.fn()
    await connectPrograms(r, [context => {
      start()
      context.api.variables.registerRule({ id: 'derive', stage: 'after', run: candidate => {
        candidate.state.derived = Number(candidate.state.value) * Number(context.settings.multiplier)
      } })
      return stop
    }])
    const version = r.ctx.eleckoiAuthorScriptsApi.read('synthetic-chat').version
    r.library('character').trees[0]!.data = { multiplier: 3 }
    expect(r.ctx.eleckoiAuthorScriptsApi.read('synthetic-chat').version).toBe(version)
    await r.set({ value: 4 })
    expect(r.state).toEqual({ value: 4, derived: 12 })
    expect(start).toHaveBeenCalledTimes(1); expect(stop).not.toHaveBeenCalled()
  })

  it('rejects settings changes midway through a rule, then retries on the same stream with new settings', async () => {
    const r = await runtime(); r.library('character').trees = [script({ data: { multiplier: 2 } })]
    let finish!: () => void, wait = true
    await connectPrograms(r, [context => {
      context.api.variables.registerRule({ id: 'derive', stage: 'after', run: async candidate => {
        if (wait) await new Promise<void>(resolve => { finish = resolve })
        candidate.state.derived = Number(candidate.state.value) * Number(context.settings.multiplier)
      } })
    }])
    const pending = r.set({ value: 3 })
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    r.library('character').trees[0]!.data = { multiplier: 4 }; wait = false; finish()
    await expect(pending).rejects.toMatchObject({ details: { reason: 'SETTINGS_CHANGED' } })
    expect(r.state).toEqual({ value: 1 }); expect(r.save).not.toHaveBeenCalled()
    await r.set({ value: 3 }); expect(r.state).toEqual({ value: 3, derived: 12 })
    expect(r.save).toHaveBeenCalledTimes(1)
  })

  it('rejects a configuration change during an awaited rule, leaving the prior state intact', async () => {
    const r = await runtime(); r.library('character').trees = [script()]; let finish!: () => void
    await connectPrograms(r, [({ api }) => { api.variables.registerRule({ id: 'wait', stage: 'after', run: async context => {
      await new Promise<void>(resolve => { finish = resolve }); context.state.derived = 10
    } }) }])
    const pending = r.set({ value: 3 })
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    r.library('character').trees[0]!.content = 'export default () => { /* Synthetic edit */ }'; finish()
    await expect(pending).rejects.toMatchObject({ details: { reason: 'CATALOG_CHANGED' } })
    expect(r.state).toEqual({ value: 1 }); expect(r.save).not.toHaveBeenCalled()
  })

  it('unblocks a pending update on stream cancellation and rejects a late reply', async () => {
    const r = await runtime(); r.library('character').trees = [script()]
    const c = await r.open(), pending = r.set({ value: 3 })
    const task = (await c.iterator.next()).value as Extract<NativeAuthorRuleTask, { kind: 'process' }>
    expect(task.kind).toBe('process'); c.abort.abort(new Error('Synthetic disconnect')); c.inbox.close()
    await expect(pending).rejects.toThrow('Synthetic disconnect')
    c.inbox.send({ id: task.id, ok: true, stateJson: '{"value":9}' })
    expect(r.state).toEqual({ value: 1 }); expect(r.save).not.toHaveBeenCalled()
  })

  it('validates the generated uplink codec and does not accept malformed rule results', async () => {
    const r = await runtime(); r.library('character').trees = [script()]
    const c = await r.open(), pending = r.set({ value: 3 })
    const task = (await c.iterator.next()).value as Extract<NativeAuthorRuleTask, { kind: 'process' }>
    c.inbox.send({ id: task.id, ok: true, stateJson: '[]' })
    await expect(pending).rejects.toThrow('JSON 对象'); expect(r.save).not.toHaveBeenCalled()
    expect((await c.iterator.next()).value).toMatchObject({ kind: 'cancel', runId: task.runId })
    c.inbox.send({ id: 'synthetic-invalid', ok: true, extra: 'invalid' } as any)
    await expect(c.iterator.next()).rejects.toThrow()
    expect(r.state).toEqual({ value: 1 })
  })
})
