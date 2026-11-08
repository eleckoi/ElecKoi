import { officialTrajectoryFixture } from '../../../../../../tests/helpers/officialTrajectory.js'
import * as NativeToolExecutor from '@deepseek-ai/dsh-tool-executor-native'
import { runtimeContextsFor } from '../../../../../../tests/helpers/runtime-contexts.js'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { Session, SessionId, SessionStore } from '@deepseek-ai/dsh-session'
import { SessionProjectionRegistry } from '@deepseek-ai/dsh-session-projection'
import LlmRuntime, { LlmAdapter, createUserMessage } from '@deepseek-ai/dsh-llm'
import { SystemPrompt } from '@deepseek-ai/dsh-system-prompt'
import { ToolRuntime } from '@deepseek-ai/dsh-tools'
import { AgentRegistry } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import * as JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installConversationContext, projectRequestInput, requestContextItems } from '../../src/host/conversation-context.mjs'
import { RequestPreviewStore } from '../../src/host/request-preview.mjs'
import { inputContinuationsProjection } from '../../src/host/input-continuations-projection.mjs'
import { rewindDshSession } from '../../../../../host/runtime/src/sessionRewind'
import { editDshSessionMessage } from '../../../../../host/runtime/src/sessionMessageEdit'
import { readDshSessionLog } from '../../../../../host/runtime/src/trajectory'

const cleanups = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })
const user = text => createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } })
const store = () => { const value = new RequestPreviewStore(); cleanups.push(() => value.close()); return value }
const start = (session, turn, text) => {
  session.append('turn/start', { turn })
  session.append('user/message', user(text), { surfaceOp: 'append' })
  session.append('step/start', { turn, step: 1 })
}

describe('actual request previews retained only by the running Host', { timeout: 30_000 }, () => {
  it('captures actual official-loop dispatches, keeps edited and regenerated requests distinct, and restores no previews from disk', async () => {
    const root = mkdtempSync(join(tmpdir(), 'eleckoi-live-preview-'))
    cleanups.push(() => rmSync(root, { recursive: true, force: true }))
    const contexts = runtimeContextsFor('synthetic-loop')
    const sessionId = SessionId('synthetic-loop')
    const write = (instruction, prompt) => {
      contexts.get(sessionId).conversationContext = { historyMode: 'prefix', history: [{ role: 'assistant', content: '合成开场' }], currentPromptText: prompt, settingLibrary: { entries: [{ id: 'synthetic-standing', title: '合成常驻', enabled: true, triggerMode: 'always', position: 'instructions', content: '合成常驻 {{literal}}', order: 0 }] } }
      writeFileSync(join(root, `${sessionId}.json`), JSON.stringify({ model: { systemPrompt: instruction } }))
    }
    write('合成指令一', '合成处理后的输入一')
    const ctx = new Context()
    cleanups.push(() => ctx.fiber.dispose())
    for (const plugin of [LlmRuntime, SessionStore, SessionProjectionRegistry, SystemPrompt, ToolRuntime, NativeToolExecutor, AgentRegistry]) await ctx.plugin(plugin)
    await ctx.sessionProjections.register(inputContinuationsProjection)
    await ctx.plugin(JsonlSessionPersistence, { root: join(root, 'sessions'), compression: 'none' })
    await ctx.plugin(AgentLoop, { agents: [] })
    const previews = store()
    ctx.provide('eleckoiRuntimeContexts', contexts)
    installConversationContext(ctx, root, sessionId, previews)
    const dispatched = []
    class Adapter extends LlmAdapter {
      async resolveModel(provider, id) { return { provider, id, name: id } }
      async *stream(options) {
        dispatched.push(options.messages)
        const text = '<FINAL>合成最终回复</FINAL>'
        yield { type: 'block-start', index: 0, blockType: 'text' }
        yield { type: 'text-delta', index: 0, text }
        yield { type: 'block-end', index: 0, block: { type: 'text', text } }
        yield { type: 'finish', reason: { kind: 'stop' } }
      }
    }
    ctx.llm.registerAdapter(['synthetic'], new Adapter())
    const handle = await ctx.agentLoop.createAgent(ctx, { sessionId, agentOptions: { provider: 'synthetic', model: 'synthetic' } })
    handle.agent.followup(user('合成原始输入一'))
    await handle.agent.whenIdle()
    write('合成指令二', '合成处理后的输入二')
    handle.agent.followup(user('合成原始输入二'))
    await handle.agent.whenIdle()
    const catalog = previews.list(sessionId)
    expect(catalog.map(({ round, request }) => [round, request])).toEqual([[1, 1], [2, 1]])
    for (const [index, request] of catalog.entries()) expect(previews.read(sessionId, request.id).items).toEqual(requestContextItems(dispatched[index]))
    const systemText = messages => messages.filter(message => message.role === 'system').flatMap(message => message.content).filter(block => block.type === 'text').map(block => block.text).join('\n\n')
    expect(systemText(dispatched[0])).toMatch(/^合成指令一\n\n/)
    expect(systemText(dispatched[1])).toMatch(/^合成指令二\n\n/)
    expect(systemText(dispatched[1]).match(/合成指令二/g)).toHaveLength(1)
    const events = handle.agent.session.snapshotEvents()
    const trajectory = officialTrajectoryFixture().replace(events)
    expect(trajectory.requests[0].prompt.system).toBe(systemText(dispatched[0]))
    expect(trajectory.requests.at(-1).prompt.system).toBe(systemText(dispatched[1]))
    expect(systemText(dispatched[0])).toContain('合成指令一\n\n合成常驻 {{literal}}\n\nYou are')
    const systemEvents = events.filter(event => event.type === 'system/message')
    expect(systemEvents.some(event => systemText([event.data.message]).startsWith('合成指令一\n\n'))).toBe(true)
    expect(systemEvents.some(event => systemText([event.data.message]).startsWith('合成指令二\n\n'))).toBe(true)
    expect(events.some(event => event.type.startsWith('eleckoi/request-'))).toBe(false)
    expect(events.some(event => event.type === 'user/message' && event.data.source.kind === 'plugin:eleckoi-request-projection')).toBe(false)
    expect(JSON.stringify(ctx.sessionProjections.snapshot(handle.agent.session))).not.toContain('合成指令二')
    await handle.dispose()

    const sessionRoot = join(root, 'sessions')
    const inputs = events.filter(event => event.type === 'user/message' && event.data.source.kind === 'user')
    editDshSessionMessage(sessionRoot, sessionId, inputs[0].seq, 'user', '合成编辑后的历史输入')
    expect(previews.read(sessionId, catalog[1].id).items).toEqual(requestContextItems(dispatched[1]))
    rewindDshSession(sessionRoot, sessionId, 2, inputs[1].seq, true)
    write('合成重新生成指令', '合成重新生成输入')
    const regenerated = await ctx.agentLoop.resume(ctx, { resumeSessionId: sessionId, agentOptions: { provider: 'synthetic', model: 'synthetic' } })
    regenerated.agent.continueFromInput(inputs[1].data.id)
    await regenerated.agent.whenIdle()
    await regenerated.dispose()
    expect(previews.list(sessionId).map(({ round, request }) => [round, request])).toEqual([[1, 1], [2, 1], [2, 2]])
    expect(previews.read(sessionId, previews.list(sessionId).at(-1).id).items).toEqual(requestContextItems(dispatched.at(-1)))
    expect(JSON.stringify(dispatched.at(-1))).toContain('合成编辑后的历史输入')
    expect(systemText(dispatched.at(-1))).toMatch(/^合成重新生成指令\n\n/)
    expect(systemText(dispatched.at(-1)).match(/合成常驻/g)).toHaveLength(1)
    const stored = readDshSessionLog(sessionRoot, sessionId)
    expect(stored.header.id).toBe(sessionId)
    expect(stored.events.filter(event => event.type === 'user/message' && event.data.id === inputs[1].data.id)).toHaveLength(1)
    expect(stored.events.some(event => event.type.startsWith('eleckoi/request-'))).toBe(false)
    const fresh = store()
    expect(fresh.list(stored.header.id)).toEqual([])
    expect(() => fresh.read(stored.header.id, catalog[0].id)).toThrow('当前运行期间')
    rewindDshSession(sessionRoot, sessionId, 2, inputs[1].seq)
    expect(readDshSessionLog(sessionRoot, sessionId).events.some(event => event.type === 'user/message' && event.data.id === inputs[1].data.id)).toBe(false)
  })

  it('captures 700 large requests without adding preview events or bodies to official projections and streams only the catalog', async () => {
    const ctx = new Context()
    cleanups.push(() => ctx.fiber.dispose())
    const registry = new SessionProjectionRegistry(ctx)
    const session = Session.create(SessionId('synthetic-growth'))
    const previews = store()
    const controller = new AbortController()
    const feed = previews.stream(session.id, controller.signal)
    expect((await feed.next()).value).toEqual([])
    const setting = '合成设定'.repeat(16384)
    const chat = '合成输入'.repeat(2048)
    const result = '合成工具结果'.repeat(1024)
    const snapshot = { historyMode: 'prefix', history: [], plan: [{ id: 'synthetic-setting', anchor: 'insert_point_3', role: 'user', content: setting,
      placementRank: 1, positionOrder: 0, order: 1, traceTitle: '合成设定', traceSource: '用户输入前' }] }
    const transform = { instructions: '合成指令'.repeat(16384), currentPromptText: null }
    for (let turn = 1; turn <= 100; turn++) {
      session.append('turn/start', { turn })
      session.append('user/message', user(chat), { surfaceOp: 'append' })
      for (let step = 1; step <= 7; step++) {
        session.append('step/start', { turn, step })
        const messages = projectRequestInput(session.deriveMessages(), snapshot, transform)
        const before = session.seq
        previews.capture(session, { provider: 'synthetic', model: 'synthetic', messages }, snapshot.plan, { round: turn, turn, step })
        expect(session.seq).toBe(before)
        const callId = `synthetic-${turn}-${step}`
        session.append('assistant/message', { turn, step, stream: [], message: {
          id: `reply-${callId}`, role: 'assistant', source: { kind: 'model', provider: 'synthetic', model: 'synthetic' },
          content: step < 7 ? [{ type: 'tool-call', id: callId, name: 'synthetic-tool', arguments: '{}' }]
            : [{ type: 'text', text: '<FINAL>合成最终回复</FINAL>' }]
        } }, { surfaceOp: 'append' })
        if (step < 7) session.append('tool/result', { turn, step, message: {
          id: `result-${callId}`, role: 'user', source: { kind: 'tool', callId },
          content: [{ type: 'tool-result', toolCallId: callId, content: [{ type: 'text', text: result }] }]
        } }, { surfaceOp: 'append' })
        session.append('step/end', { turn, step })
      }
      session.append('turn/end', { turn, reason: { kind: 'completed' } })
    }
    const catalog = previews.list(session.id)
    expect(catalog).toHaveLength(700)
    expect(catalog.at(-1)).toMatchObject({ round: 100, request: 7 })
    expect((await feed.next()).value).toEqual(catalog)
    for (const text of [setting, chat, result, transform.instructions]) expect(JSON.stringify(catalog)).not.toContain(text)
    const items = previews.read(session.id, catalog.at(-1).id).items
    expect(items.filter(item => item.kind === 'user')).toHaveLength(100)
    expect(items.filter(item => item.kind === 'tool')).toHaveLength(6)
    const position = items.findIndex(item => item.anchor === 'insert_point_3')
    expect(items[position]).toMatchObject({ content: setting, title: '合成设定' })
    expect(items[position + 1]).toMatchObject({ title: '用户最新输入', content: chat })
    expect(session.snapshotEvents().filter(event => event.type.startsWith('eleckoi/request-'))).toEqual([])
    expect(JSON.stringify(registry.checkpoint(session))).not.toContain(setting)
    expect(JSON.stringify(registry.snapshot(session))).not.toContain(transform.instructions)
    controller.abort()
    expect((await feed.next()).done).toBe(true)
  })

  it('isolates conversations, releases deleted sessions and ends subscriptions on Host disposal', async () => {
    const previews = store()
    const first = Session.create(SessionId('synthetic-first'))
    const second = Session.create(SessionId('synthetic-second'))
    start(first, 1, '合成第一会话')
    start(second, 1, '合成第二会话')
    const historicalRead = vi.spyOn(first, 'snapshotEvents').mockImplementation(() => { throw new Error('不得同步读取历史事件') })
    const request = previews.capture(first, { provider: 'synthetic', model: 'synthetic', messages: first.deriveMessages() }, [], { round: 1, turn: 1, step: 1 })
    expect(historicalRead).not.toHaveBeenCalled()
    expect(() => previews.read(second.id, request.id)).toThrow('当前运行期间')
    const controller = new AbortController()
    const feed = previews.stream(first.id, controller.signal)
    expect((await feed.next()).value).toHaveLength(1)
    previews.forget(first.id)
    expect((await feed.next()).value).toEqual([])
    expect(() => previews.read(first.id, request.id)).toThrow('当前运行期间')
    const next = feed.next()
    previews.close()
    expect((await next).done).toBe(true)
    controller.abort()
  })
})
