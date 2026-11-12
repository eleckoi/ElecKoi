import * as NativeToolExecutor from '@deepseek-ai/dsh-tool-executor-native'
import { runtimeContextsFor } from '../helpers/runtime-contexts.js'
import { createVariableIdentities } from '../../packages/shared/src/foundation/variables/identity'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { AgentRegistry } from '@deepseek-ai/dsh-agent'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import * as JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import LlmRuntime, { LlmAdapter } from '@deepseek-ai/dsh-llm'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import SessionStore from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import * as SpawnSubagent from '@deepseek-ai/dsh-subagent-spawn-in-process'
import * as ForkSubagent from '@deepseek-ai/dsh-subagent-fork-in-process'
import * as SubagentTool from '@deepseek-ai/dsh-tool-subagent'
import * as SubagentControl from '@deepseek-ai/dsh-tool-subagent-control'
import { installRoleplaySubagentTurn } from '../../packages/client/features/dsh-client-roleplay/src/host/subagent-turn.mjs'
import { readDshSessionLog } from '@eleckoi/dsh-runtime'
import { apply as applySessionEdit } from '../../packages/host/runtime/src/sessionEditPlugin'
import { snapshotPath } from '../../packages/client/features/dsh-client-roleplay/src/host/session-snapshot.mjs'
import { ElecKoiVariableProcessing } from '@eleckoi/dsh-product-api'
import {
  apply as applyAgentPresetBridge,
  installAgentHandleTracking
} from '../../apps/desktop/resources/dsh/agent-preset-bridge.mjs'
import { apply as applySettingLibraryTools } from '../../apps/desktop/resources/dsh/setting-library-tools.mjs'
import { apply as applyVariableTools } from '../../apps/desktop/resources/dsh/variable-tools.mjs'
import { restoreRuntimeContext } from '../../packages/client/features/dsh-client-roleplay/src/host/runtime-contexts.mjs'

const directories = []
const previousSessionRoot = process.env.DSH_SESSION_ROOT

afterEach(() => {
  delete process.env.ELECKOI_SESSION_SNAPSHOT_ROOT
  delete process.env.ELECKOI_PRESET_ROOT
  if (previousSessionRoot === undefined) delete process.env.DSH_SESSION_ROOT
  else process.env.DSH_SESSION_ROOT = previousSessionRoot
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('DSH subagent runtime context inheritance', () => {
  it.each(['spawn', 'fork', 'cancel', 'delete-spawn', 'delete-fork'])('settles delegated work before closing or deleting its roleplay turn (%s)', async mode => {
    const ctx = new Context(), childEntered = Promise.withResolvers(), release = Promise.withResolvers(), stopped = Promise.withResolvers()
    const counts = new Map(), requests = []
    const rootId = SessionId('synthetic-roleplay-parent')
    try {
      for (const plugin of [LlmRuntime, SessionStore, SessionProjectionRegistry, SystemPrompt, ToolRuntime, NativeToolExecutor, AgentRegistry]) await ctx.plugin(plugin)
      const directory = mkdtempSync(join(tmpdir(), 'eleckoi-subagent-turn-'))
      directories.push(directory)
      await ctx.plugin(JsonlSessionPersistence, { root: directory, compression: 'none' })
      await ctx.plugin(AgentLoop, { agents: [] })
      const deleting = mode.startsWith('delete-')
      if (deleting) {
        process.env.ELECKOI_SESSION_SNAPSHOT_ROOT = join(directory, 'snapshots')
        process.env.ELECKOI_PRESET_ROOT = join(directory, 'presets')
        await applyAgentPresetBridge(ctx)
      }
      ctx.provide('workingDirectory', { get: () => process.cwd(), ensure: async () => process.cwd(), set: async (_agent, value) => value })
      await ctx.plugin(SubagentRuntime)
      await ctx.plugin(SpawnSubagent)
      await ctx.plugin(ForkSubagent)
      await ctx.plugin(SubagentTool, { provider: mode.endsWith('fork') ? 'fork' : 'spawn' })
      await ctx.plugin(SubagentControl)
      class Adapter extends LlmAdapter {
        async resolveModel(provider, id) { return { provider, id, name: id } }
        async *stream(options) {
          requests.push(options)
          const step = (counts.get(options.sessionId) ?? 0) + 1
          counts.set(options.sessionId, step)
          if (options.sessionId === rootId) {
            if (step === 1) yield* call('subagent', { description: 'Synthetic task', prompt: 'Synthetic child input' })
            else {
              if (step === 2) stopped.resolve()
              yield* reply(step === 2 ? 'Synthetic pending child' : 'Synthetic final child result')
            }
          } else if (step === 1) {
            childEntered.resolve()
            await Promise.race([release.promise, new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }))])
            yield* call('send_message', { agent_id: rootId, message: 'Synthetic delivered result' })
          } else yield* reply('Synthetic child closing result')
        }
      }
      ctx.llm.registerAdapter(['synthetic'], new Adapter())
      const root = await ctx.agents.create({ sessionId: rootId, agentOptions: { provider: 'synthetic', model: 'synthetic' },
        setup: owner => { if (!deleting) installRoleplaySubagentTurn(owner) } })
      root.agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Synthetic delegation' }], source: { kind: 'user' } }))
      await Promise.race([
        Promise.all([childEntered.promise, stopped.promise]),
        ...(!deleting ? [root.agent.whenIdle().then(() => { throw new Error(`Parent ended before delegation: ${JSON.stringify(root.agent.session.snapshotEvents())}`) })] : []),
      ])
      if (deleting) {
        // Older Sessions can already be idle while a child is still running.
        await root.agent.whenIdle()
        const child = ctx.agents.list().find(agent => agent.session.header.origin === 'subagent')
        await ctx.sessionPersistence.flush()
        expect(readDshSessionLog(directory, child.id)).toBeDefined()
        const snapshots = process.env.ELECKOI_SESSION_SNAPSHOT_ROOT
        mkdirSync(snapshots, { recursive: true })
        for (const id of [rootId, child.id, 'unrelated']) writeFileSync(snapshotPath(snapshots, id), '{}')
        process.env.DSH_SESSION_ROOT = directory
        const removeResults = vi.fn(async () => {})
        ctx.provide('spillStore', { removeSessionResults: removeResults })
        ctx.provide('workspaceRegistry', { list: () => [], unpinSession: async () => {}, unarchiveSession: async () => {} })
        applySessionEdit(ctx)
        await ctx.eleckoiSessionEditor.deleteSession(rootId)
        expect(removeResults.mock.calls[0][0].sort()).toEqual([rootId, child.id].sort())
        expect(ctx.agents.list()).toHaveLength(0)
        release.resolve()
        await new Promise(resolve => setImmediate(resolve))
        expect(readDshSessionLog(directory, rootId)).toBeUndefined()
        expect(readDshSessionLog(directory, child.id)).toBeUndefined()
        expect(await ctx.sessionPersistence.list()).toHaveLength(0)
        expect(existsSync(snapshotPath(snapshots, rootId))).toBe(false)
        expect(existsSync(snapshotPath(snapshots, child.id))).toBe(false)
        expect(existsSync(snapshotPath(snapshots, 'unrelated'))).toBe(true)
        return
      }
      let idle = false
      const wait = root.agent.whenIdle().then(() => { idle = true })
      await new Promise(resolve => setImmediate(resolve))
      expect(idle).toBe(false)
      if (mode === 'cancel') root.agent.cancel({ kind: 'user' })
      else release.resolve()
      await wait
      const events = root.agent.session.snapshotEvents()
      expect(events.filter(event => event.type === 'turn/start')).toHaveLength(1)
      expect(events.findLast(event => event.type === 'turn/end').data.reason.kind).toBe(mode === 'cancel' ? 'aborted' : 'completed')
      if (mode !== 'cancel') {
        const sources = events.filter(event => event.type === 'user/message').map(event => event.data.source.kind)
        expect(sources).toEqual(expect.arrayContaining(['user', 'agent-message', 'subagent-settled']))
        const final = requests.filter(request => request.sessionId === rootId).at(-1)
        expect(JSON.stringify(final.messages)).toContain('Synthetic delivered result')
        expect(JSON.stringify(final.messages)).toContain('its closing message is omitted')
      }
      expect(ctx.agents.list().filter(agent => agent.session.header.origin === 'subagent')).toHaveLength(0)
      await root.dispose()
    } finally { release.resolve(); await ctx.fiber.dispose() }
  }, 30_000)

  it('restores only durable variables and keeps the official dialogue order without replaying an input', () => {
    const id = 'synthetic-restored-session'
    const contexts = runtimeContextsFor(id)
    const messages = [createUserMessage({ content: [{ type: 'text', text: '合成输入一' }, { type: 'text', text: '合成输入二' }], source: { kind: 'user' } }),
      { id: 'synthetic-reply', role: 'assistant', content: [{ type: 'text', text: '合成回复' }], source: { kind: 'model' } }]
    const library = { characterId: 'synthetic-character', groups: [], entries: [] }
    const runtime = { conversationId: 'synthetic-chat', conversationContext: { history: [], settingLibrary: library },
        variableContext: { versionId: 'synthetic-version', identityJson: JSON.stringify(createVariableIdentities({ score: 7 }, { versionId: 'synthetic-version', objects: [], variables: [] }, 'runtime')), defaultStateJson: '{"score":0}', stateJson: '{"score":7}', schemaCode: '', objects: [], variables: [] } }
    const ctx = { eleckoiRuntimeContexts: contexts, eleckoiProductData: {
      prepareConversationRuntime: vi.fn(() => runtime), snapshotConversationRuntime: () => ({ variableStateJson: '{"score":7}' }) } }
    contexts.get(id).variables = { enabled: true, state: { score: 99 } }
    contexts.forget(id)
    restoreRuntimeContext(ctx, { id, deriveMessages: () => messages }, { conversationId: 'synthetic-chat' })
    expect(ctx.eleckoiProductData.prepareConversationRuntime).toHaveBeenCalledWith('synthetic-chat', '合成输入一\n合成输入二')
    expect(contexts.get(id).variables.state).toEqual({ score: 7 })
    expect(contexts.get(id).settings.history).toEqual([{ role: 'user', content: '合成输入一\n合成输入二' }, { role: 'assistant', content: '合成回复' }])
    expect(contexts.get(id).settings).not.toHaveProperty('runtimeResolution')
  })

  it('shares the current turn with nested children and releases every conversation binding', () => {
    const contexts = runtimeContextsFor('root', { conversationId: 'synthetic-owner' })
    const initial = contexts.get('root')
    contexts.inherit('root', 'child')
    contexts.inherit('child', 'grandchild')
    expect(contexts.get('grandchild')).toBe(initial)
    const next = { ...initial, variables: { enabled: true, state: { score: 2 } } }
    contexts.set('root', next)
    expect(contexts.get('child')).toBe(next)
    expect(contexts.get('grandchild')).toBe(next)
    contexts.forget('child')
    expect(contexts.has('child')).toBe(false)
    expect(contexts.get('grandchild')).toBe(next)
    contexts.forgetConversation('synthetic-owner')
    expect(contexts.has('root')).toBe(false)
    expect(contexts.has('grandchild')).toBe(false)
    contexts.set('other', { ...initial, rootSessionId: 'other' })
    contexts.close()
    expect(contexts.has('other')).toBe(false)
  })

  it.each(['resume-first', 'rewrite-first'])('serializes writer ownership when the observer resumes during a rewrite (%s)', async order => {
    const fixture = runtimeFixture(), persistence = new Context(), id = SessionId('synthetic-writer-session')
    const entered = Promise.withResolvers(), released = Promise.withResolvers()
    let activeAgent, resumeStarted = false, rewriteStarted = false, writer
    const ctx = {
      get(name) { return this[name] },
      inject: vi.fn(() => ({ dispose: vi.fn() })),
      provide: vi.fn(), on: vi.fn(() => () => {}),
      agents: {
        get: () => activeAgent,
        create: vi.fn(),
        resume: async () => {
          resumeStarted = true
          writer = await persistence.sessionPersistence.open(id, 'write')
          if (order === 'resume-first') { entered.resolve(); await released.promise }
          activeAgent = { id }
          return { agent: activeAgent, dispose: async () => { await writer.close(); activeAgent = undefined } }
        }
      },
      agentPresets: { register: vi.fn(async () => async () => {}) }
    }
    let resume, rewrite, dispose
    try {
      await persistence.plugin(JsonlSessionPersistence, { root: join(fixture.directory, 'sessions'), compression: 'none' })
      const session = Session.create(id)
      session.append('user/message', createUserMessage({ content: [{ type: 'text', text: 'Synthetic input' }], source: { kind: 'user' } }), { surfaceOp: 'append' })
      const seed = await persistence.sessionPersistence.create(session.header)
      await seed.append(session.snapshotEvents())
      await seed.flush()
      await seed.close()
      dispose = await applyAgentPresetBridge(ctx)
      const handles = ctx.provide.mock.calls.find(([name]) => name === 'eleckoiSessionHandles')[1]
      const edit = () => handles.withClosed(id, async () => {
        rewriteStarted = true
        const probe = await persistence.sessionPersistence.open(id, 'write')
        try {
          if (order === 'rewrite-first') { entered.resolve(); await released.promise }
        } finally { await probe.close() }
      })
      if (order === 'resume-first') {
        resume = ctx.agents.resume({ resumeSessionId: id })
        void resume.catch(entered.reject)
        await entered.promise
        rewrite = edit()
        void rewrite.catch(() => {})
        await new Promise(resolve => setImmediate(resolve))
        expect(rewriteStarted).toBe(false)
      } else {
        rewrite = edit()
        void rewrite.catch(entered.reject)
        await entered.promise
        resume = ctx.agents.resume({ resumeSessionId: id })
        void resume.catch(() => {})
        await new Promise(resolve => setImmediate(resolve))
        expect(resumeStarted).toBe(false)
      }
      released.resolve()
      await Promise.all([resume, rewrite])
      await handles.dispose(id)
      const probe = await persistence.sessionPersistence.open(id, 'write')
      await probe.close()
    } finally {
      released.resolve()
      await Promise.allSettled([resume, rewrite])
      await writer?.close()
      await dispose?.()
      await persistence.fiber.dispose()
    }
  }, 30000)

  it('tracks handles through the concrete Cordis service for every caller context', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionProjectionRegistry)
    const registry = ctx.plugin(AgentRegistry)
    await registry
    const createHandle = vi.fn(async (_ownerCtx, options) => ({
      agent: { id: options.sessionId },
      dispose: vi.fn()
    }))
    const resumeHandle = vi.fn(async (_ownerCtx, options) => ({
      agent: { id: options.resumeSessionId },
      dispose: vi.fn()
    }))
    const disposeFactory = ctx.agents.setFactory({
      createAgent: createHandle,
      resume: resumeHandle
    })
    const tracked = []
    const disposeTracking = installAgentHandleTracking(ctx.agents, handle => tracked.push(handle), (_id, action) => action())
    const caller = ctx.extend()

    await caller.agents.create({ sessionId: 'created-session' })
    await caller.agents.resume({ resumeSessionId: 'resumed-session' })
    expect(tracked.map(handle => handle.agent.id)).toEqual(['created-session', 'resumed-session'])
    expect(createHandle).toHaveBeenCalledTimes(1)
    expect(resumeHandle).toHaveBeenCalledTimes(1)

    disposeTracking()
    await caller.agents.create({ sessionId: 'untracked-session' })
    expect(tracked).toHaveLength(2)
    await disposeFactory()
    await registry.dispose()
  })

  it('registers only the global declaration while a live Session switches away from a historical snapshot', async () => {
    const fixture = runtimeFixture()
    writeFileSync(join(fixture.snapshotRoot, 'orphan-session.json'), JSON.stringify({
      ...JSON.parse(readFileSync(join(fixture.snapshotRoot, 'root-session.json'), 'utf8')),
      model: { provider: 'legacy-label', model: 'model-main' },
      mountedPresetId: 'snapshot-preset'
    }))
    writeFileSync(join(fixture.snapshotRoot, 'new-session.json'), JSON.stringify({
      ...JSON.parse(readFileSync(join(fixture.snapshotRoot, 'root-session.json'), 'utf8')),
      model: { provider: 'legacy-label', model: 'model-main' }
    }))
    writeFileSync(join(fixture.snapshotRoot, 'unused-snapshot.json'), '{')
    mkdirSync(join(process.env.ELECKOI_PRESET_ROOT, 'obsolete-preset'))
    writeFileSync(join(process.env.ELECKOI_PRESET_ROOT, 'obsolete-preset', 'preset.json'),
      JSON.stringify({ id: 'obsolete-preset', plugins: [] }))
    const unregister = vi.fn()
    const append = vi.fn()
    const agent = runtimeAgent('orphan-session', {}, { append })
    const originalCreate = vi.fn(async options => ({ agent: { id: options.sessionId }, dispose: vi.fn() }))
    const originalResume = vi.fn(async () => ({ agent, dispose: vi.fn() }))
    const ctx = {
      get(name) { return this[name] },
      inject: vi.fn(() => ({ dispose: vi.fn() })),
      provide: vi.fn(),
      on: vi.fn(),
      agents: { create: originalCreate, resume: originalResume, get: vi.fn(() => agent) },
      agentDefaultModel: { currentSelection: () => ({ provider: 'provider-main', model: 'model-main' }) },
      llm: { resolveModelInfo: vi.fn(async () => ({})) },
      settings: { describe: () => [] },
      sessionController: { inspect: vi.fn(async () => ({
        meta: { agentPreset: 'agent-preset-from-header' },
        events: [{ type: 'agent-preset/selected', data: { agentPreset: 'deleted-preset' } }]
      })) },
      agentPresets: { register: vi.fn(async () => unregister), recompose: vi.fn() }
    }
    const dispose = await applyAgentPresetBridge(ctx)
    const runtimeContexts = ctx.provide.mock.calls.find(([name]) => name === 'eleckoiRuntimeContexts')[1]
    ctx.eleckoiRuntimeContexts = runtimeContexts
    runtimeContexts.set('root-session', fixture.contexts.get('root-session'))
    expect(ctx.agentPresets.register.mock.calls.map(([definition]) => definition.id))
      .toEqual(['eleckoi-active'])
    expect(existsSync(join(process.env.ELECKOI_PRESET_ROOT, 'obsolete-preset'))).toBe(true)
    expect(ctx.provide).toHaveBeenCalledWith('eleckoiPresetRegistrar', expect.any(Object))
    runtimeContexts.set('orphan-session', fixture.contexts.get('root-session'))
    await agentCreatedListener(ctx)({ agent })
    expect(JSON.parse(readFileSync(join(fixture.snapshotRoot, 'orphan-session.json'), 'utf8')).model)
      .toMatchObject({ configId: 'provider-main', provider: 'provider-main', model: 'model-main' })
    expect(ctx.agentPresets.register.mock.calls.map(([definition]) => definition.id))
      .toEqual(['eleckoi-active'])
    expect(originalCreate).not.toHaveBeenCalled()
    expect(originalResume).not.toHaveBeenCalled()

    const activeSource = readFileSync(join(process.env.ELECKOI_PRESET_ROOT, 'eleckoi-active', 'preset.json'))
    const activeRevision = createHash('sha256').update(activeSource).digest('hex')
    const snapshotPath = join(fixture.snapshotRoot, 'orphan-session.json')
    writeFileSync(snapshotPath, JSON.stringify({
      ...JSON.parse(readFileSync(snapshotPath, 'utf8')),
      pendingPresetId: 'eleckoi-active',
      pendingPresetRevision: activeRevision
    }))
    const registrar = ctx.provide.mock.calls.find(([name]) => name === 'eleckoiPresetRegistrar')[1]
    await expect(registrar.prepareForSession('orphan-session', 'eleckoi-active'))
      .resolves.toBe('eleckoi-active')
    expect(ctx.agentPresets.register.mock.calls.map(([definition]) => definition.id))
      .toEqual(['eleckoi-active'])
    await expect(registrar.selectForSession('orphan-session')).resolves.toBe('eleckoi-active')
    expect(ctx.agentPresets.recompose).toHaveBeenCalledWith(agent.ctx, 'eleckoi-active')
    expect(append).toHaveBeenCalledWith('agent-preset/selected', { agentPreset: 'eleckoi-active' })
    expect(JSON.parse(readFileSync(snapshotPath, 'utf8'))).toMatchObject({
      mountedPresetId: 'eleckoi-active',
      mountedPresetRevision: activeRevision
    })
    await dispose()
    expect(unregister).toHaveBeenCalledTimes(1)
    expect(existsSync(join(fixture.snapshotRoot, 'orphan-session.json'))).toBe(true)
  })

  it('gives created, nested, and resumed children the parent setting library and variables', async () => {
    const fixture = runtimeFixture()
    const originalCreate = vi.fn()
    const originalResume = vi.fn()
    const ctx = {
      eleckoiProductData: { readConversationVariableContext() {
        const value = fixture.contexts.get('root-session').variables
        return { versionId: value.config.versionId, identityJson: JSON.stringify(value.identities), defaultStateJson: JSON.stringify(value.config.defaultState), stateJson: JSON.stringify(value.state),
          schemaCode: value.config.schemaCode, objects: value.config.objects, variables: value.config.variables }
      } },
      get(name) { return this[name] },
      inject: vi.fn(() => ({ dispose: vi.fn() })),
      provide: vi.fn(),
      on: vi.fn(() => () => undefined),
      agents: { create: originalCreate, resume: originalResume },
      sessionController: { inspect: vi.fn(async () => ({ meta: {}, events: [] })) },
      agentPresets: { mount: vi.fn(), register: vi.fn(async () => async () => undefined) }
    }
    const dispose = await applyAgentPresetBridge(ctx)
    const runtimeContexts = ctx.provide.mock.calls.find(([name]) => name === 'eleckoiRuntimeContexts')[1]
    ctx.eleckoiRuntimeContexts = runtimeContexts
    runtimeContexts.set('root-session', fixture.contexts.get('root-session'))
    expect(ctx.agentPresets.register).toHaveBeenCalledWith(expect.objectContaining({ id: 'eleckoi-active' }))
    const created = agentCreatedListener(ctx)

    const childA = runtimeAgent('child-a', { origin: 'subagent', parentSession: 'root-session' })
    await created({ agent: childA })
    expect(childA.ctx.on).not.toHaveBeenCalled()
    await expect(toolResultFor(ctx.eleckoiRuntimeContexts, 'child-a', 'eleckoi_glob_setting_files', { pattern: '**' }))
      .resolves.toMatchObject({ files: [{ path: '世界/港口', title: '港口' }] })
    await expect(toolResultFor(ctx.eleckoiRuntimeContexts, 'child-a', 'eleckoi_grep_setting_files', {
      pattern: '多雾', path: '世界', output_mode: 'content'
    })).resolves.toMatchObject({ matches: [{ path: '世界/港口', text: '港口终年多雾。' }] })
    const variables = await toolResultFor(ctx.eleckoiRuntimeContexts, 'child-a', 'eleckoi_glob_variables', { pattern: '**' })
    expect(variables.paths).toContain('/状态/好感度')
    const matchedVariables = await toolResultFor(ctx.eleckoiRuntimeContexts, 'child-a', 'eleckoi_grep_variables', {
      pattern: '好感度', output_mode: 'content'
    })
    expect(matchedVariables.matches.length).toBeGreaterThan(0)
    await expect(toolResultFor(ctx.eleckoiRuntimeContexts, 'child-a', 'eleckoi_apply_setting_patch', {
      operation: 'edit_file', path: '世界/港口', old_string: '多雾', new_string: '晴朗'
    })).resolves.toMatchObject({ status: 'ok', replacements: 1 })
    await expect(toolResultFor(ctx.eleckoiRuntimeContexts, 'child-a', 'eleckoi_apply_variable_patch', {
      operations: [{ op: 'delta', path: '/状态/好感度', value: 5 }]
    })).resolves.toMatchObject({ status: 'ok', applied_operations: 1 })

    const childB = runtimeAgent('child-b', { origin: 'subagent', parentSession: 'child-a' })
    await created({ agent: childB })
    expect(childB.ctx.on).not.toHaveBeenCalled()
    await expect(toolResultFor(ctx.eleckoiRuntimeContexts, 'child-b', 'eleckoi_read_setting_files', { paths: ['世界/港口'] }))
      .resolves.toMatchObject({ files: [{ content: '港口终年晴朗。' }] })
    await expect(toolResultFor(ctx.eleckoiRuntimeContexts, 'child-b', 'eleckoi_read_variables', { paths: ['/状态/好感度'] }))
      .resolves.toMatchObject({ variables: [{ current: 15 }] })

    const resumedChild = runtimeAgent('child-resumed', { origin: 'subagent', parentSession: 'root-session' })
    await created({ agent: resumedChild })
    expect(resumedChild.ctx.on).not.toHaveBeenCalled()
    expect(JSON.parse(readFileSync(join(fixture.snapshotRoot, 'child-resumed.json'), 'utf8')))
      .toMatchObject({ inheritedFromSessionId: 'root-session', rootRuntimeThreadId: 'root-session' })
    const inherited = JSON.parse(readFileSync(join(fixture.snapshotRoot, 'child-resumed.json'), 'utf8'))
    expect(inherited).not.toHaveProperty('settingLibraryBaseline')
    expect(inherited).not.toHaveProperty('conversationContext')

    expect(originalCreate).not.toHaveBeenCalled()
    expect(originalResume).not.toHaveBeenCalled()
    await dispose()
  })

  it('removes the inherited snapshot when child creation fails', async () => {
    const fixture = runtimeFixture()
    const failure = new Error('child setup failed')
    const rootSnapshotPath = join(fixture.snapshotRoot, 'root-session.json')
    writeFileSync(rootSnapshotPath, JSON.stringify({
      ...JSON.parse(readFileSync(rootSnapshotPath, 'utf8')),
      disabledToolGroupIds: ['builtin:web']
    }))
    const ctx = {
      get(name) { return this[name] },
      inject: vi.fn(() => ({ dispose: vi.fn() })),
      provide: vi.fn(),
      on: vi.fn(() => () => undefined),
      agents: {
        create: vi.fn(async () => { throw failure }),
        resume: vi.fn()
      },
      sessionController: { inspect: vi.fn(async () => ({ meta: {}, events: [] })) },
      agentPresets: { mount: vi.fn(), register: vi.fn(async () => async () => undefined) }
    }
    await applyAgentPresetBridge(ctx)
    ctx.eleckoiRuntimeContexts = ctx.provide.mock.calls.find(([name]) => name === 'eleckoiRuntimeContexts')[1]
    ctx.eleckoiRuntimeContexts.set('root-session', fixture.contexts.get('root-session'))

    const failed = runtimeAgent('failed-child', { origin: 'subagent', parentSession: 'root-session' })
    failed.ctx.tools.schemas = vi.fn(() => { throw failure })
    await expect(agentCreatedListener(ctx)({ agent: failed })).rejects.toThrow(failure)
    expect(existsSync(join(fixture.snapshotRoot, 'failed-child.json'))).toBe(false)
  })
})

async function* call(name, args) {
  yield { type: 'block-start', index: 0, blockType: 'tool-call' }
  yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: `synthetic-${name}`, name, arguments: JSON.stringify(args) } }
  yield { type: 'finish', reason: { kind: 'tool-calls' } }
}
async function* reply(text) {
  yield { type: 'block-start', index: 0, blockType: 'text' }
  yield { type: 'text-delta', index: 0, text: `<FINAL>${text}</FINAL>` }
  yield { type: 'block-end', index: 0, block: { type: 'text', text: `<FINAL>${text}</FINAL>` } }
  yield { type: 'finish', reason: { kind: 'stop' } }
}

function agentCreatedListener(ctx) {
  return ctx.on.mock.calls.find(([name]) => name === 'agent/created')[1]
}

function runtimeAgent(id, header = {}, session = {}) {
  return {
    id,
    status: 'idle',
    model: { current: () => ({ provider: 'provider-main', model: 'model-main' }) },
    ctx: {
      get(name) { return this[name] },
      on: vi.fn(() => () => undefined),
      llm: { stream: vi.fn() },
      sessions: { get: vi.fn() },
      tools: { schemas: vi.fn(() => []), restrict: vi.fn(() => () => undefined) }
    },
    session: {
      id,
      header,
      append: vi.fn(),
      ...session
    }
  }
}

function runtimeFixture() {
  const directory = mkdtempSync(join(tmpdir(), 'eleckoi-subagent-context-'))
  directories.push(directory)
  const snapshotRoot = join(directory, 'session-snapshots')
  process.env.ELECKOI_SESSION_SNAPSHOT_ROOT = snapshotRoot
  const presetRoot = join(directory, 'generated-presets')
  process.env.ELECKOI_PRESET_ROOT = presetRoot
  mkdirSync(snapshotRoot)
  mkdirSync(join(presetRoot, 'eleckoi-active'), { recursive: true })
  writeFileSync(join(presetRoot, 'eleckoi-active', 'preset.json'), JSON.stringify({ id: 'eleckoi-active', plugins: [] }))

  const settingState = {
    enabled: true,
    library: {
      characterId: 'character-a',
      groups: [{ id: 'world', name: '世界', parentId: '', order: 1 }],
      entries: [{
        id: 'port', title: '港口', iconId: 'setting', kind: 'normal', groupId: 'world',
        content: '港口终年多雾。', agentSelectionHint: '抵达港口时读取', agentReadStrategy: 'normal',
        dynamicMode: 'standard', triggerMode: 'agent_tool', enabled: true, order: 1
      }]
    },
    history: [],
    variableState: { 状态: { 好感度: 10 } }
  }
  const variableState = {
    enabled: true,
    config: {
      defaultState: { 状态: { 好感度: 0 } },
      schemaCode: 'const Schema = z.object({ 状态: z.object({ 好感度: z.number() }) })',
      objects: [{
        id: 'status', name: '状态', parentId: '', enabled: true,
        description: '角色状态', updateRule: '仅在剧情明确变化时更新', dynamicKey: false
      }],
      variables: [{
        id: 'affinity', title: '好感度', objectId: 'status', enabled: true, type: 'number',
        defaultValue: '0', description: '当前好感', updateRule: '按互动结果小幅增减', readMode: 'required'
      }]
    },
    state: { 状态: { 好感度: 10 } }
  }
  writeFileSync(join(snapshotRoot, 'root-session.json'), JSON.stringify({
    conversationId: 'conversation-a',
    runtimeThreadId: 'root-session',
    mountedPresetId: 'eleckoi-active',
    mountedPresetRevision: 'fixture-revision',
    model: { provider: 'provider-main', model: 'model-main' },
    settingLibraryBaseline: { source: settingState.library, projected: settingState.library },
    settingLibraryEnabled: true,
    variablesEnabled: true,
    disabledToolGroupIds: [],
    conversationContext: { characterId: 'character-a', characterName: '测试角色', persona: {}, history: [] }
  }, null, 2), { flag: 'wx' })
  const contexts = runtimeContextsFor('root-session', { conversationId: 'conversation-a', settings: settingState,
    variables: variableState, settingLibraryBaseline: { source: settingState.library, projected: settingState.library } })
  return { directory, snapshotRoot, contexts }
}

async function toolResultFor(contexts, sessionId, name, args) {
  const registered = []
  const context = {
    eleckoiRuntimeContexts: contexts,
    eleckoiVariableProcessing: new ElecKoiVariableProcessing(null),
    eleckoiProductData: { commitConversationRuntime: vi.fn((conversationId, _variables, raw) => {
      expect(conversationId).toBe('conversation-a')
      expect(JSON.parse(raw).entries[0].content).toBe('港口终年晴朗。')
    }) },
    eleckoiCharacterConfigurationChanges: { publish: vi.fn() },
    tools: {
      register(definition) {
        registered.push(definition)
        return () => undefined
      }
    }
  }
  applySettingLibraryTools(context)
  applyVariableTools(context)
  const definition = registered.find((candidate) => candidate.name === name)
  if (!definition) throw new Error(`Missing tool ${name}`)
  return definition.execute(args, { agent: { session: { id: sessionId } } })
}
