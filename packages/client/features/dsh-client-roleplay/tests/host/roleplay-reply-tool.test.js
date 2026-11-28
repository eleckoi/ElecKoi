import { Context } from '@deepseek-ai/cordis'
import { AgentRegistry } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import LlmRuntime, { LlmAdapter, createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId, SessionStore } from '@deepseek-ai/dsh-session'
import { SessionProjectionRegistry } from '@deepseek-ai/dsh-session-projection'
import { SystemPrompt } from '@deepseek-ai/dsh-system-prompt'
import * as NativeToolExecutor from '@deepseek-ai/dsh-tool-executor-native'
import { defineTool, ToolRuntime } from '@deepseek-ai/dsh-tools'
import { roleplayReplyMessages } from '@eleckoi/dsh-product-api'
import { officialChatFixture } from '../../../../../../tests/helpers/officialTrajectory.js'
import { afterEach, expect, it } from 'vitest'
import { installRoleplayReply, ROLEPLAY_OUTPUT_EVENT, ROLEPLAY_REPLY_GROUP_ID, ROLEPLAY_REPLY_TOOL } from '../../src/host/roleplay-reply-tool.mjs'
import { conversationPreviewProjection } from '../../src/host/conversation-preview.mjs'
import { projectRoleplayDialogue } from '../../src/host/conversation-context.mjs'

let ctx
afterEach(async () => { await ctx?.fiber.dispose() })

const cast = [{ id: 'speaker-a', name: '合成角色甲' }, { id: 'searcher', name: 'ScenePartner' }]

async function runTurn(responses, enabled = true, readCast = () => cast, collaboration = false) {
  let requests = 0
  const frames = [], modelInputs = [], advertisedTools = [], replySchemas = [], rawReplies = []
  class Adapter extends LlmAdapter {
    async resolveModel(provider, id) { return { provider, id, name: id } }
    async *stream(options) {
      modelInputs.push(options.messages)
      advertisedTools.push(options.tools.map(tool => tool.name))
      replySchemas.push(options.tools.find(tool => tool.name === ROLEPLAY_REPLY_TOOL))
      const response = responses[requests++]
      if (response === undefined) throw new Error('Unexpected extra request')
      const blocks = typeof response === 'string' ? [{ type: 'text', text: response }] : [
        ...(response.body ? [{ type: 'text', text: response.body }] : []),
        { type: 'tool-call', id: `call-${requests}`, name: response.lookup ? 'lookup_scene' : ROLEPLAY_REPLY_TOOL,
          arguments: JSON.stringify(response.lookup ? {} : response.fields) }
      ]
      for (const [index, block] of blocks.entries()) {
        yield { type: 'block-start', index, blockType: block.type }
        if (block.type === 'tool-call') yield { type: 'tool-call-delta', index, id: block.id, name: block.name, argumentsDelta: block.arguments }
        else yield { type: 'text-delta', index, text: block.text }
        yield { type: 'block-end', index, block }
      }
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
  }
  ctx = new Context()
  for (const plugin of [LlmRuntime, SessionStore, SessionProjectionRegistry, SystemPrompt, ToolRuntime, NativeToolExecutor, AgentRegistry]) await ctx.plugin(plugin)
  await ctx.sessionProjections.register(conversationPreviewProjection)
  await ctx.plugin(AgentLoop, { agents: [] })
  ctx.llm.registerAdapter(['synthetic'], new Adapter())
  const { agent } = await ctx.agentLoop.createAgent(ctx, { sessionId: SessionId('synthetic-roleplay-reply'), agentOptions: { provider: 'synthetic', model: 'synthetic' } })
  ctx.on('agent/assistant-stream', ({ frame }) => frames.push(frame))
  const disabledToolGroupIds = [
    ...(enabled ? [] : [ROLEPLAY_REPLY_GROUP_ID]),
    ...(collaboration ? [] : ['builtin:collaboration']),
  ]
  const replyEnabled = () => !disabledToolGroupIds.includes(ROLEPLAY_REPLY_GROUP_ID)
  installRoleplayReply(agent, replyEnabled, () => ({ cast: readCast(), characterName: '合成卡片' }))
  agent.ctx.on('tools/result', (execution, result) => {
    if (execution.name === ROLEPLAY_REPLY_TOOL && !result.isError) rawReplies.push(result.value)
  })
  agent.ctx.tools.register(defineTool({ name: 'lookup_scene', description: '读取当前设定。', parameters: {},
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute() { return '设定查阅结果' } }))
  agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '你好' }] }))
  await agent.whenIdle()
  const events = agent.session.snapshotEvents()
  const replySeq = events.findLast(event => event.type === ROLEPLAY_OUTPUT_EVENT)?.data.replySeq
  return { requests, frames, events, modelInputs, advertisedTools, replySchemas, rawReplies, reply: events.find(event => event.seq === replySeq),
    messages: agent.session.deriveMessages(),
    catalogPreview: ctx.sessionProjections.snapshot(agent.session).values.eleckoiConversationPreview,
    outcome: events.findLast(event => event.type === 'turn/end')?.data.reason }
}

it('commits one call containing outer strings and ends the turn without another model request', async () => {
  const text = '他说 "开始。"\n\n路径 C:\\新目录。'
  const { requests, frames, reply, events, outcome, replySchemas, catalogPreview } = await runTurn(
    [{ fields: { 合成角色甲: text } }], true, () => cast.slice(0, 1))
  expect(requests).toBe(1)
  expect(outcome).toEqual({ kind: 'completed' })
  expect(replySchemas[0].parameters.properties).toEqual({ 合成角色甲: { type: 'string' } })
  expect(frames.some(frame => frame.chunk?.type === 'tool-call-delta')).toBe(true)
  const results = events.filter(event => event.type === 'tool/result')
  expect(results).toHaveLength(1)
  expect(results[0].data.meta.speakers).toEqual([{ kind: 'speech', speakerId: 'speaker-a', speakerName: '合成角色甲' }])
  expect(roleplayReplyMessages(events)).toMatchObject([{ content: '合成角色甲：' + text, event: { data: { toolBacked: true, replySeq: reply.seq } } }])
  expect(catalogPreview).toBe(text)
  expect(reply.data.step).toBe(results[0].data.step)
  const official = officialChatFixture().replace(events)
  const tail = [...official.nodes.values()].find(node => node.kind === 'turn-tail')
  expect(tail.data.turn).toBe(reply.data.turn)
})

it('uses the submitted field order and exact string contents in preview and history', async () => {
  const first = '他说 "好"。\n\nconst path = "C:\\\\test";'
  const second = '<div class="speech">我来按回放。</div>'
  const { replySchemas, events, advertisedTools, requests, messages, catalogPreview } = await runTurn([
    { fields: { ScenePartner: first, 合成角色甲: second } }
  ], true, () => [...cast, { name: '未出场角色', id: 'absent' }])
  expect(requests).toBe(1)
  expect(advertisedTools[0].filter(name => name === ROLEPLAY_REPLY_TOOL)).toEqual([ROLEPLAY_REPLY_TOOL])
  expect(replySchemas[0].description).toMatch(/每轮必须至少调用一次.*玩家看不到/)
  expect(Object.keys(replySchemas[0].parameters.properties)).toEqual(['合成角色甲', 'ScenePartner', '未出场角色'])
  const replies = roleplayReplyMessages(events)
  const text = 'ScenePartner：' + first + '\n\n合成角色甲：' + second
  expect(replies).toMatchObject([{ content: text, blocks: [{ speakerId: 'searcher', text: first }, { speakerId: 'speaker-a', text: second }] }])
  expect(projectRoleplayDialogue(messages, replies).filter(message => message.role === 'assistant').flatMap(message => message.content))
    .toEqual([{ type: 'text', text }])
  expect(projectRoleplayDialogue(messages, replies).some(message => message.role === 'tool')).toBe(false)
  expect(catalogPreview).toBe(first + '\n\n' + second)
})

it('refreshes the roster and accepts a name containing numbers', async () => {
  let roster = cast.slice(0, 1)
  const { replySchemas, events } = await runTurn([{ lookup: true }, { fields: { 合成角色123: '角色发言。' } }], true,
    () => {
      const current = roster
      roster = [{ id: 'new', name: '合成角色123' }]
      return current
    })
  expect(replySchemas[0].parameters.properties).toEqual({ 合成角色123: { type: 'string' } })
  expect(roleplayReplyMessages(events)).toMatchObject([{ content: '合成角色123：角色发言。' }])
})

it.each([false, true])('keeps unbound text in the trace and out of dialogue (collaboration=%s)', async collaboration => {
  const text = '合成调度总结。'
  const { requests, reply, outcome, events, messages, catalogPreview } = await runTurn([{ lookup: true }, text], true, () => cast, collaboration)
  expect(requests).toBe(2)
  expect(outcome).toEqual({ kind: 'completed' })
  const assistant = events.findLast(event => event.type === 'assistant/message')
  expect(assistant.data.message.content).toEqual([{ type: 'text', text }])
  expect(reply).toBeUndefined()
  const processOnly = []
  expect(roleplayReplyMessages(events, processOnly)).toEqual([])
  expect(projectRoleplayDialogue(messages, processOnly).some(message => message.role === 'assistant')).toBe(false)
  expect(projectRoleplayDialogue(messages, processOnly, assistant.data.turn)).toBe(messages)
  expect(catalogPreview).toBe('你好')
  expect(events.filter(event => event.type === 'tool/result')).toHaveLength(1)
  const official = officialChatFixture().replace(events)
  expect([...official.nodes.values()].find(node => node.kind === 'turn-tail').data.closing.finalNode.seq).toBe(assistant.seq)
})

it('accepts a natural stop without a visible reply', async () => {
  const { requests, reply, outcome } = await runTurn([''])
  expect(requests).toBe(1)
  expect(reply).toBeUndefined()
  expect(outcome).toEqual({ kind: 'completed' })
})

it('withholds the disabled tool and lets the normal loop complete without a visible reply', async () => {
  const { reply, outcome, advertisedTools } = await runTurn([{ lookup: true }, '普通文本'], false)
  expect(advertisedTools).toEqual([['lookup_scene'], ['lookup_scene']])
  expect(reply).toBeUndefined()
  expect(outcome).toEqual({ kind: 'completed' })
})
