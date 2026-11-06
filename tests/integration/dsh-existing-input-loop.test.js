import * as NativeToolExecutor from '@deepseek-ai/dsh-tool-executor-native'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import LlmRuntime, { LlmAdapter, createUserMessage } from '@deepseek-ai/dsh-llm'
import * as JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative } from 'node:path'
import { readDshSessionLog, rewindDshSession } from '@eleckoi/dsh-runtime'
import { editDshSessionMessage } from '../../packages/host/runtime/src/sessionMessageEdit'
import { inputContinuationsProjection } from '../../packages/client/features/dsh-client-roleplay/src/host/input-continuations-projection.mjs'
import { officialTrajectoryFixture } from '../helpers/officialTrajectory.js'
import { adaptTrajectorySnapshot } from '../../apps/web/src/modules/chat/model/trajectorySnapshotAdapter.js'
import { findRegenerateBranchUserIndex } from '../../apps/web/src/modules/chat/model/chatRegeneration.js'
import { afterEach, describe, expect, it } from 'vitest'

const contexts = []
const temporaryRoots = []
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  for (const root of temporaryRoots.splice(0)) {
    const child = relative(tmpdir(), root)
    if (!child || child.startsWith('..') || isAbsolute(child)) throw new Error('Unexpected test cleanup path')
    rmSync(root, { recursive: true, force: true })
  }
})

async function fixture({ persistenceRoot, appendInput = true } = {}) {
  const ctx = new Context()
  contexts.push(ctx)
  for (const plugin of [LlmRuntime, SessionStore, SessionProjectionRegistry, SystemPrompt, ToolRuntime, NativeToolExecutor, AgentRegistry]) {
    await ctx.plugin(plugin)
  }
  if (persistenceRoot) await ctx.plugin(JsonlSessionPersistence, { root: persistenceRoot, compression: 'none' })
  await ctx.plugin(AgentLoop, { agents: [] })
  const requests = []
  class Adapter extends LlmAdapter {
    async resolveModel(provider, id) { return { provider, id, name: id } }
    async *stream(options) {
      requests.push(options)
      const text = '<FINAL>合成回复</FINAL>'
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text }
      yield { type: 'block-end', index: 0, block: { type: 'text', text } }
      yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
  }
  ctx.llm.registerAdapter(['synthetic'], new Adapter())
  const agentOptions = { provider: 'synthetic', model: 'synthetic' }
  const handle = await ctx.agentLoop.createAgent(ctx, { sessionId: SessionId('synthetic-session'), agentOptions })
  const agent = handle.agent
  const events = []
  ctx.on('session/event', (session, event) => { if (session === agent.session) events.push(event) })
  const input = createUserMessage({ content: [{ type: 'text', text: '合成编辑后的输入' }], source: { kind: 'user' } })
  const original = appendInput ? agent.session.append('user/message', input, { surfaceOp: 'append' }) : undefined
  return { ctx, agent, handle, agentOptions, requests, events, input, original }
}

describe('explicit existing-input continuation in the pinned official loop', () => {
  it('edits, rewinds, reopens and regenerates twice on the same durable Session input', async () => {
    const root = mkdtempSync(join(tmpdir(), 'eleckoi-existing-input-'))
    temporaryRoots.push(root)
    const f = await fixture({ persistenceRoot: root, appendInput: false })
    f.agent.followup(f.input)
    await f.agent.whenIdle()
    await f.handle.dispose()
    const original = readDshSessionLog(root, 'synthetic-session').events.find(event =>
      event.type === 'user/message' && event.data.id === f.input.id)
    expect(original).toBeTruthy()
    for (let attempt = 0; attempt < 2; attempt++) {
      const text = `合成修改输入 ${attempt}`
      editDshSessionMessage(root, 'synthetic-session', original.seq, 'user', text)
      rewindDshSession(root, 'synthetic-session', 1, original.seq, true)
      const handle = await f.ctx.agentLoop.resume(f.ctx, {
        resumeSessionId: SessionId('synthetic-session'), agentOptions: f.agentOptions
      })
      const turn = handle.agent.continueFromInput(f.input.id)
      handle.agent.session.append('eleckoi/input-continuation', {
        turn, inputMessageId: f.input.id, inputEventSeq: original.seq
      }, { ignorable: true })
      await handle.agent.whenIdle()
      await handle.dispose()
      const persisted = readDshSessionLog(root, 'synthetic-session')
      expect(persisted.header.id).toBe('synthetic-session')
      const inputs = persisted.events.filter(event => event.type === 'user/message' && event.data.source.kind === 'user')
      expect(inputs).toEqual([{ ...original, data: { ...original.data, content: [{ type: 'text', text }] } }])
      expect(f.requests.at(-1).messages.filter(message => message.id === f.input.id)).toEqual([inputs[0].data])
      expect(persisted.events.filter(event => event.type === 'assistant/message')).toHaveLength(1)
      expect(persisted.events.at(-1)).toMatchObject({ type: 'turn/end', data: { turn, reason: { kind: 'completed' } } })
      const links = persisted.events.reduce((state, event) => inputContinuationsProjection.apply(state, event),
        inputContinuationsProjection.init())
      expect(links.links).toEqual([{ turn, inputMessageId: f.input.id, inputEventSeq: original.seq }])
      expect(links.inputs).toEqual([{ turn: 1, eventSeq: original.seq, messageId: f.input.id }])
      const trajectory = adaptTrajectorySnapshot(officialTrajectoryFixture().replace(persisted.events), {},
        inputContinuationsProjection.wire.view(links))
      expect(trajectory.requests).toMatchObject([{ turn, status: 'complete' }])
      expect(trajectory.requests).toHaveLength(1)
      expect(trajectory.turnLabels.get(turn)).toBe(1)
      expect(trajectory.inputTurns.get(original.seq)).toBe(turn)
      expect(findRegenerateBranchUserIndex([
        { id: f.input.id, role: 'user', runtimeSessionId: 'synthetic-session', sessionEventSeq: original.seq, dshTurn: 1 },
        { id: 'synthetic-output', role: 'assistant', runtimeSessionId: 'synthetic-session', dshTurn: turn,
          inputEventSeq: links.links[0].inputEventSeq }
      ], 'synthetic-output')).toBe(0)
    }
  }, 20_000)

  it('runs assistant streaming without changing or appending the existing input, then sends normally', async () => {
    const f = await fixture()
    const frames = []
    f.ctx.on('agent/assistant-stream', payload => frames.push(payload))
    expect(f.agent.continueFromInput(f.input.id)).toBe(1)
    await f.agent.whenIdle()
    expect(f.requests).toHaveLength(1)
    expect(f.requests[0].messages.filter(message => message.id === f.input.id)).toEqual([f.input])
    expect(f.events.filter(event => event.type === 'user/message' && event.data.source.kind === 'user')).toEqual([f.original])
    expect(f.events.at(-1)).toMatchObject({ type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } })
    expect(frames.length).toBeGreaterThan(0)
    expect(() => f.agent.continueFromInput(f.input.id)).toThrow('rewound')
    f.agent.followup(createUserMessage({ content: [{ type: 'text', text: '合成新输入' }], source: { kind: 'user' } }))
    await f.agent.whenIdle()
    expect(f.requests).toHaveLength(2)
    expect(f.events.filter(event => event.type === 'user/message' && event.data.source.kind === 'user')).toHaveLength(2)
    expect(f.events.at(-1)).toMatchObject({ type: 'turn/end', data: { turn: 2, reason: { kind: 'completed' } } })
  })

  it('rejects missing IDs and keeps the original event through pre-step rejection and retry', async () => {
    const f = await fixture()
    expect(() => f.agent.continueFromInput('missing-id')).toThrow('not found')
    const stop = f.agent.ctx.on('agent/pre-step', () => ({ kind: 'reject' }))
    expect(f.agent.continueFromInput(f.input.id)).toBe(1)
    await f.agent.whenIdle()
    expect(f.requests).toHaveLength(0)
    stop()
    expect(f.agent.continueFromInput(f.input.id)).toBe(2)
    await f.agent.whenIdle()
    expect(f.requests).toHaveLength(1)
    expect(f.events.filter(event => event.type === 'user/message' && event.data.id === f.input.id)).toEqual([f.original])
  })
})
