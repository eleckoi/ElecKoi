import { runtimeContextsFor } from '../helpers/runtime-contexts.js'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SessionProjectionCache from '@deepseek-ai/dsh-session-projection-cache'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageJson from '@deepseek-ai/dsh-storage-json'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import LocalAttachmentStore from '@deepseek-ai/dsh-attachment-local'
import LocalCredentialProvider from '@deepseek-ai/dsh-credentials-local'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import LlmRuntime, { LlmAdapter, createUserMessage } from '@deepseek-ai/dsh-llm'
import * as JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import productDataPlugin from '@eleckoi/dsh-product-data'
import { ElecKoiConversationLifecycle } from '../../packages/host/product-api/src/conversationLifecycle'
import { ConversationChangeFeed, CharacterConfigurationChangeFeed } from '../../packages/host/product-api/src/index'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SqliteDatabase } from '../../packages/host/product-data/src/storage/sqlite/SqliteDatabase'
import { ConversationRepository } from '../../packages/host/product-data/src/domain/conversations/ConversationRepository'
import { VariableStateRepository } from '../../packages/host/product-data/src/domain/variables/VariableStateRepository'
import { VariableConfigRepository } from '../../packages/host/product-data/src/domain/variables/VariableConfigRepository'
import * as roleplayPlugin from '../../packages/client/features/dsh-client-roleplay/src/index.js'
import { readSessionSnapshot, writeSessionSnapshot } from '../../packages/client/features/dsh-client-roleplay/src/host/session-snapshot.mjs'
import { readDshSessionLog } from '../../packages/host/runtime/src/trajectory'
import { rewindDshSession } from '../../packages/host/runtime/src/sessionRewind'
import * as sessionEditPlugin from '../../packages/host/runtime/src/sessionEditPlugin'

const cleanups = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })

async function fixture({ stream } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'eleckoi-generation-save-'))
  cleanups.push(() => rmSync(root, { recursive: true, force: true }))
  const path = join(root, 'product.sqlite3')
  for (const [key, value] of Object.entries({ ELECKOI_DATABASE_PATH: path, ELECKOI_MEDIA_ROOT: root,
    ELECKOI_WORKSPACE_ROOT: root, ELECKOI_SESSION_SNAPSHOT_ROOT: root, ELECKOI_PRESET_ROOT: root,
    ELECKOI_PRESET_TEMPLATE_PATH: resolve('apps/desktop/resources/dsh/agent-preset-template/agent.cordis.yml'), ELECKOI_SESSION_BRIDGE_ROOT: root,
    DSH_SESSION_ROOT: join(root, 'sessions') })) {
    const previous = process.env[key]; process.env[key] = value
    cleanups.push(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous })
  }
  const initial = new SqliteDatabase(path)
  initial.open()
  const conversationId = new ConversationRepository(initial).create({ title: '合成聊天' }).conversation.id
  initial.close()
  const ctx = new Context()
  cleanups.push(() => ctx.fiber.dispose())
  for (const plugin of [LlmRuntime, SessionStore, SessionProjectionRegistry, SystemPrompt, ToolRuntime, AgentRegistry]) await ctx.plugin(plugin)
  await ctx.plugin(Storage)
  for (const [plugin, config] of [[StorageJson, { root: join(root, 'storage') }], [StorageDomain, { backend: 'json' }]]) {
    const { name, inject, apply, Config } = plugin
    await ctx.plugin({ name, inject, apply, Config }, config)
  }
  await ctx.plugin(SessionProjectionCache, { writeEveryEvents: 100, writeIntervalMs: 60000 })
  await ctx.plugin(LocalAttachmentStore, { dshHome: root })
  await ctx.plugin(LocalCredentialProvider, { dshHome: root, path: join(root, '.credentials.yaml'), watch: false })
  await ctx.plugin(JsonlSessionPersistence, { root: join(root, 'sessions'), compression: 'none' })
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(productDataPlugin)
  await ctx.plugin(ElecKoiConversationLifecycle)
  const changes = []
  await ctx.plugin({ name: 'synthetic-roleplay-services',
    provide: ['sessionController', 'agentDefaultModel', 'agentPresets', 'settings',
      'eleckoiConversationChanges', 'eleckoiCharacterConfigurationChanges'], apply(owner) {
    owner.provide('sessionController', {})
    owner.provide('agentDefaultModel', { currentSelection: () => ({ provider: 'synthetic', model: 'synthetic' }) })
    owner.provide('agentPresets', { register: async () => async () => {} })
    owner.provide('settings', { describe: () => [] })
    const feed = new ConversationChangeFeed()
    const publish = feed.publish.bind(feed)
    feed.publish = change => { changes.push(change); publish(change) }
    owner.provide('eleckoiConversationChanges', feed)
    const configurationFeed = new CharacterConfigurationChangeFeed()
    owner.provide('eleckoiCharacterConfigurationChanges', configurationFeed)
    owner.on('dispose', () => { feed.close(); configurationFeed.close() })
  } })
  class Adapter extends LlmAdapter {
    async resolveModel(provider, id) { return { provider, id, name: id } }
    async *stream(options) {
      if (stream) { yield* stream(options); return }
      const text = '<FINAL>合成正文</FINAL>'
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text }
      yield { type: 'block-end', index: 0, block: { type: 'text', text } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
  }
  ctx.llm.registerAdapter(['synthetic'], new Adapter())
  const input = { operationId: 'synthetic-attempt', conversationId, runtimeSessionId: conversationId, turn: 1 }
  ctx.eleckoiConversationLifecycle.begin(input)


  mkdirSync(join(root, 'eleckoi-active'), { recursive: true })
  writeFileSync(join(root, 'eleckoi-active', 'preset.json'), JSON.stringify({ id: 'eleckoi-active', plugins: [] }))
  mkdirSync(join(root, conversationId), { recursive: true })
  writeSessionSnapshot(root, conversationId, { conversationId, operationId: input.operationId,
    variablesEnabled: true, mountedPresetId: 'eleckoi-active',
    model: { provider: 'synthetic', model: 'synthetic' } })
  const editor = ctx.plugin(sessionEditPlugin)
  await ctx.plugin(roleplayPlugin)
  ctx.eleckoiRuntimeContexts.set(conversationId, runtimeContextsFor(conversationId, { conversationId, variables: { enabled: true, state: { score: 1 } }, generationVariableStateJson: ctx.eleckoiProductData.snapshotConversationRuntime(conversationId).variableStateJson }).get(conversationId))
  await editor
  await vi.waitFor(() => {
    expect(ctx.get('eleckoiSessionEditor')).toBeDefined()
    expect(ctx.get('eleckoiAutoIllustration')).toBeUndefined()
    expect(ctx.get('eleckoiRoleplaySessions')).toBeDefined()
  })
  const handle = await ctx.agents.create({ sessionId: SessionId(conversationId), agentOptions: { provider: 'synthetic', model: 'synthetic' } })
  return { ctx, root, path, conversationId, input, handle, changes }
}

function run(f) {
  f.handle.agent.followup(createUserMessage({ content: [{ type: 'text', text: '合成输入' }], source: { kind: 'user' } }))
  return f.handle.agent.whenIdle()
}

describe('official Session and product save boundary', { timeout: 30_000 }, () => {
  it.each([
    ['send', 'text'], ['send', 'reasoning'], ['regeneration', 'text'], ['regeneration', 'reasoning'],
  ])('settles an interrupted %s with only %s before the next input without replaying it', async (mode, interruptedType) => {
    const started = Promise.withResolvers()
    const requests = []
    const f = await fixture({ async *stream(options) {
      requests.push(options)
      const type = requests.length === 1 ? interruptedType : 'text'
      const text = requests.length === 1
        ? type === 'reasoning' ? '合成中断思考' : '<FINAL>合成中断正文'
        : '<FINAL>合成后续正文</FINAL>'
      yield { type: 'block-start', index: 0, blockType: type }
      yield { type: `${type}-delta`, index: 0, text }
      if (requests.length === 1) {
        started.resolve()
        await new Promise((_resolve, reject) => {
          if (options.signal.aborted) reject(options.signal.reason)
          else options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true })
        })
      }
      yield { type: 'block-end', index: 0, block: { type, text } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    } })
    const original = createUserMessage({ content: [{ type: 'text', text: '合成原输入' }], source: { kind: 'user' } })
    if (mode === 'send') f.handle.agent.followup(original)
    else {
      f.handle.agent.session.append('user/message', original, { surfaceOp: 'append' })
      expect(f.handle.agent.continueFromInput(original.id)).toBe(1)
    }
    await started.promise
    f.handle.agent.cancel({ kind: 'user' }, { keepInbox: true })
    await f.handle.agent.whenIdle()
    await f.ctx.eleckoiConversationLifecycle.wait(f.conversationId, f.input.operationId)
    const interruptedEvents = readDshSessionLog(join(f.root, 'sessions'), f.conversationId).events
    expect(interruptedEvents.find(event => event.type === 'assistant/message'))
      .toMatchObject({ surfaceOp: 'append', data: { interrupted: true,
        message: { content: [{ type: interruptedType }] } } })
    expect(interruptedEvents.at(-1))
      .toMatchObject({ type: 'turn/end', data: { turn: 1, reason: { kind: 'aborted' } } })
    expect(f.ctx.eleckoiProductData.snapshotConversationRuntime(f.conversationId).variableStateJson).toBe('{}')

    const next = { ...f.input, operationId: 'synthetic-next-attempt', turn: 2 }
    f.ctx.eleckoiConversationLifecycle.begin(next)
    writeSessionSnapshot(f.root, f.conversationId, { ...readSessionSnapshot(f.root, f.conversationId), operationId: next.operationId })
    const followup = createUserMessage({ content: [{ type: 'text', text: '合成后续输入' }], source: { kind: 'user' } })
    f.handle.agent.followup(followup)
    await f.handle.agent.whenIdle()
    await f.ctx.eleckoiConversationLifecycle.wait(f.conversationId, next.operationId)
    const events = readDshSessionLog(join(f.root, 'sessions'), f.conversationId).events
    expect(events.filter(event => event.type === 'user/message' && event.data.source.kind === 'user')
      .map(event => event.data.id)).toEqual([original.id, followup.id])
    expect(requests).toHaveLength(2)
    expect(events.at(-1)).toMatchObject({ type: 'turn/end', data: { turn: 2, reason: { kind: 'completed' } } })
    expect(f.changes.filter(change => change.kind === 'generation')).toEqual([
      { kind: 'generation', conversationId: f.conversationId, error: '' },
      { kind: 'generation', conversationId: f.conversationId, error: '' },
    ])
  })

  it('finishes regeneration of a normally sent and interrupted input on the same durable Session', async () => {
    const started = Promise.withResolvers()
    let attempts = 0
    const f = await fixture({ async *stream(options) {
      const text = ++attempts === 1 ? '<FINAL>合成中断正文' : '<FINAL>合成重新生成正文</FINAL>'
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text }
      if (attempts === 1) {
        started.resolve()
        await new Promise((_resolve, reject) => {
          if (options.signal.aborted) reject(options.signal.reason)
          else options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true })
        })
      }
      yield { type: 'block-end', index: 0, block: { type: 'text', text } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    } })
    const input = createUserMessage({ content: [{ type: 'text', text: '合成原输入' }], source: { kind: 'user' } })
    f.handle.agent.followup(input)
    await started.promise
    f.handle.agent.cancel({ kind: 'user' }, { keepInbox: true })
    await f.handle.agent.whenIdle()
    await f.ctx.eleckoiConversationLifecycle.wait(f.conversationId, f.input.operationId)
    await f.handle.dispose()
    const sessionRoot = join(f.root, 'sessions')
    const original = readDshSessionLog(sessionRoot, f.conversationId).events.find(event => event.type === 'user/message' && event.data.id === input.id)
    rewindDshSession(sessionRoot, f.conversationId, 1, original.seq, true)
    const handle = await f.ctx.agentLoop.resume(f.ctx, { resumeSessionId: SessionId(f.conversationId),
      agentOptions: { provider: 'synthetic', model: 'synthetic' } })
    const next = { ...f.input, operationId: 'synthetic-regeneration-attempt', turn: 2 }
    f.ctx.eleckoiConversationLifecycle.begin(next)
    writeSessionSnapshot(f.root, f.conversationId, { ...readSessionSnapshot(f.root, f.conversationId), operationId: next.operationId })
    expect(handle.agent.continueFromInput(input.id)).toBe(2)
    await handle.agent.whenIdle()
    await f.ctx.eleckoiConversationLifecycle.wait(f.conversationId, next.operationId)
    await handle.dispose()
    const persisted = readDshSessionLog(sessionRoot, f.conversationId)
    expect(persisted.header.id).toBe(f.conversationId)
    expect(persisted.events.filter(event => event.type === 'user/message' && event.data.source.kind === 'user')).toEqual([original])
    expect(persisted.events.at(-1)).toMatchObject({ type: 'turn/end', data: { turn: 2, reason: { kind: 'completed' } } })
    expect(f.changes.filter(change => change.kind === 'generation').map(change => change.error)).toEqual(['', ''])
  })

  it('waits for official Session persistence before committing variables and retains them after reopening', async () => {
    const f = await fixture()
    f.ctx.on('session/event', (session, event) => {
      if (event.type === 'turn/end') f.ctx.eleckoiRuntimeContexts.forget(session.id)
    })
    let release
    const gate = new Promise(resolve => { release = resolve })
    let entered
    const started = new Promise(resolve => { entered = resolve })
    f.ctx.on('session/flush', async () => {
      entered()
      await gate
    })
    await run(f)
    let finished = false
    const pending = f.ctx.eleckoiConversationLifecycle.wait(f.conversationId, f.input.operationId).then(() => { finished = true })
    await Promise.race([started, pending.then(() => { throw new Error('Product save finished before Session persistence') })])
    expect(finished).toBe(false)
    expect(f.ctx.eleckoiProductData.snapshotConversationRuntime(f.conversationId).variableStateJson).toBe('{}')
    release(); await pending
    expect(readDshSessionLog(join(f.root, 'sessions'), f.conversationId).events.some(event => event.type === 'turn/end')).toBe(true)
    expect(f.changes).toContainEqual({ kind: 'generation', conversationId: f.conversationId, error: '' })
    expect(JSON.parse(f.ctx.eleckoiProductData.snapshotConversationRuntime(f.conversationId).variableStateJson)).toEqual({ score: 1 })
    await f.ctx.fiber.dispose()
    const reopened = new SqliteDatabase(f.path)
    reopened.open()
    try {
      expect(JSON.parse(new VariableStateRepository(reopened, new VariableConfigRepository(reopened)).viewerStates(f.conversationId).currentStateJson)).toEqual({ score: 1 })
      expect(reopened.native.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='conversation_generation_results'").get()).toBeUndefined()
    }
    finally { reopened.close() }
  })

  it('does not commit variables if the official durability barrier fails', async () => {
    const f = await fixture()
    f.ctx.on('session/flush', () => { throw new Error('synthetic disk failure') })
    await run(f)
    await expect(f.ctx.eleckoiConversationLifecycle.wait(f.conversationId, f.input.operationId)).rejects.toThrow('synthetic disk failure')
    expect(f.ctx.eleckoiProductData.snapshotConversationRuntime(f.conversationId).variableStateJson).toBe('{}')
  })

  it('preserves a manual variable update made while the AI was working', async () => {
    const f = await fixture()
    f.ctx.eleckoiProductData.replaceConversationVariableState(f.conversationId, '{"score":7}')
    await run(f)
    await expect(f.ctx.eleckoiConversationLifecycle.wait(f.conversationId, f.input.operationId)).rejects.toThrow('未覆盖当前变量')
    expect(JSON.parse(f.ctx.eleckoiProductData.snapshotConversationRuntime(f.conversationId).variableStateJson)).toEqual({ score: 7 })
  })
})
