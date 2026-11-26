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
import { installRoleplayReply, ROLEPLAY_OUTPUT_EVENT, ROLEPLAY_REPLY_TOOL } from '../../src/host/roleplay-reply-tool.mjs'
import { conversationPreviewProjection } from '../../src/host/conversation-preview.mjs'
import { projectRoleplayDialogue } from '../../src/host/conversation-context.mjs'

let ctx
afterEach(async () => { await ctx?.fiber.dispose() })

const cast = [{ id: 'speaker-a', name: '合成角色甲' }, { id: 'searcher', name: 'ScenePartner' }]

async function runTurn(responses, enabled = true, readCast = () => cast) {
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
          arguments: JSON.stringify(response.lookup ? {} : { name: response.name }) }
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
  installRoleplayReply(agent, () => enabled, () => ({ cast: readCast(), characterName: '合成卡片' }))
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

it('binds the next native assistant step to the selected role', async () => {
  const text = '他说 "开始。"\n\n路径 C:\\新目录。'
  const labeled = `<合成角色甲>${text}</合成角色甲>`
  const { requests, frames, reply, events, outcome, modelInputs, replySchemas, catalogPreview } = await runTurn(
    [{ name: '合成角色甲' }, labeled], true, () => cast.slice(0, 1))
  expect(requests).toBe(2)
  expect(outcome).toEqual({ kind: 'completed' })
  expect(frames.some(frame => frame.chunk?.type === 'tool-call-delta')).toBe(true)
  const results = events.filter(event => event.type === 'tool/result')
  expect(results).toHaveLength(1)
  expect(results[0].data.meta.speaker).toEqual({ kind: 'speech', speakerId: 'speaker-a', speakerName: '合成角色甲' })
  expect(Object.keys(replySchemas[0].parameters.properties)).toEqual(['name'])
  expect(replySchemas[0].parameters.properties.name.enum).toEqual(['合成角色甲'])
  expect(replySchemas[0].description).toContain('本卡登记了 1 位登场角色 ["合成角色甲"]')
  const receipt = modelInputs[1].at(-1)
  expect(receipt.role).toBe('tool')
  expect(frames.find(frame => frame.chunk?.type === 'text-delta').chunk.text).toBe(labeled)
  expect(roleplayReplyMessages(events)).toMatchObject([{ content: `合成角色甲：${text}`, event: { data: { toolBacked: true, replySeq: reply.seq } } }])
  expect(catalogPreview).toBe(text)
  const modelEvents = events.filter(event => event.type === 'assistant/message')
  expect(modelEvents).toHaveLength(requests)
  expect(modelEvents[0].data.message.content).toMatchObject([{ type: 'tool-call', name: ROLEPLAY_REPLY_TOOL }])
  expect(modelEvents[0].data.step).toBe(results[0].data.step)
  expect(modelEvents[1].data.message.content).toEqual([{ type: 'text', text: labeled }])
  expect(reply.seq).toBe(modelEvents[1].seq)
  const official = officialChatFixture().replace(events)
  const tail = [...official.nodes.values()].find(node => node.kind === 'turn-tail')
  expect(tail.data.turn).toBe(reply.data.turn)
})

it('combines consecutive same-speaker submissions with an intervening lookup', async () => {
  const { requests, events, reply, outcome, modelInputs, catalogPreview, replySchemas, messages } = await runTurn([
    { name: '合成卡片' }, { lookup: true, body: '<合成卡片>第一段。</合成卡片>' }, { name: '合成卡片' }, '<合成卡片>第二段。</合成卡片>'
  ], true, () => [])
  expect(requests).toBe(4)
  expect(outcome).toEqual({ kind: 'completed' })
  expect(replySchemas[0].parameters.properties.name.enum).toEqual(['合成卡片'])
  expect(replySchemas[0].description).toContain('卡片封面发言名是 "合成卡片"')
  expect(JSON.stringify(modelInputs[2])).toContain('设定查阅结果')
  const replies = roleplayReplyMessages(events)
  expect(replies).toMatchObject([{ content: '合成卡片：第一段。\n\n第二段。' }])
  expect(catalogPreview).toBe('第一段。\n\n第二段。')
  expect(reply.data.message.content[0]).toEqual({ type: 'text', text: '<合成卡片>第二段。</合成卡片>' })
  const retainedId = reply.data.message.id
  const prefix = projectRoleplayDialogue(messages.filter(message => message.id !== retainedId), replies)
  expect(prefix.filter(message => message.role === 'assistant').flatMap(message => message.content)).toEqual([
    { type: 'text', text: '合成卡片：第一段。' }
  ])
  expect(prefix.some(message => message.role === 'tool')).toBe(false)
  const blocksByMessage = new Map()
  const retained = projectRoleplayDialogue(messages.filter(message => message.id === retainedId), replies, Infinity, blocksByMessage)
  expect(retained[0].content).toEqual([{ type: 'text', text: '合成卡片：第二段。' }])
  expect(blocksByMessage.get(retainedId)).toMatchObject([{ text: '第二段。' }])
})

it('advertises the current cast and uses it to resolve the speakers in a complete scene', async () => {
  const text = '合成角色甲：录音机开始转动。\n\n「我来按回放。」\n\nScenePartner：「等一下，我先调低音量。」'
  const { replySchemas, events, advertisedTools, rawReplies, requests, modelInputs } = await runTurn([
    { name: '合成角色甲' }, { name: 'ScenePartner', body: '<合成角色甲>录音机开始转动。\n\n「我来按回放。」</合成角色甲>' },
    '<ScenePartner>「等一下，我先调低音量。」</ScenePartner>'
  ])
  expect(requests).toBe(3)
  expect(advertisedTools[0].filter(name => name === ROLEPLAY_REPLY_TOOL)).toEqual([ROLEPLAY_REPLY_TOOL])
  expect(JSON.stringify(replySchemas[0])).not.toMatch(/speakerId|speaker-a|searcher/)
  expect(replySchemas[0].description).toContain('本卡登记了 2 位登场角色 ["合成角色甲","ScenePartner"]。名单中的每一项各是一位角色。')
  expect(replySchemas[0].description).toMatch(/下一步必须.*<角色名>对应的角色扮演内容<\/角色名>.*单人回复调用一次.*多人可在同一轮发言/)
  expect(replySchemas[0].description).not.toMatch(/示例|台词|动作|环境|剧情|玩家询问|先选第一位/)
  expect(replySchemas[0].parameters.required).toEqual(['name'])
  expect(replySchemas[0].parameters.properties.name.enum).toEqual(['合成角色甲', 'ScenePartner'])
  expect(modelInputs[1].at(-1)?.content[0]?.text).toContain('在同一条消息末尾调用 eleckoi_roleplay_reply 选择接下来发言的角色。')
  expect(rawReplies).toEqual([{ name: '合成角色甲' }, { name: 'ScenePartner' }])
  expect(roleplayReplyMessages(events)).toMatchObject([{ content: text, blocks: [{ speakerId: 'speaker-a' }, { speakerId: 'searcher' }] }])
})

it('refreshes the published roster through DSH before resolving the next step', async () => {
  let roster = cast.slice(0, 1)
  const { replySchemas, events } = await runTurn([{ lookup: true }, { name: '新角色' }, '<新角色>新角色发言。</新角色>'], true,
    () => {
      const current = roster
      roster = [{ id: 'new', name: '新角色' }]
      return current
    })
  expect(replySchemas[0].parameters.properties.name.enum).toEqual(['新角色'])
  expect(replySchemas[0].description).toContain('本卡登记了 1 位登场角色 ["新角色"]')
  expect(roleplayReplyMessages(events)).toMatchObject([{ content: '新角色：新角色发言。' }])
})

it('tells the selected role how to format the next reply and keeps ordinary text visible if it omits the label', async () => {
  const { rawReplies, modelInputs, events } = await runTurn([{ name: '合成角色甲' }, '下一步的正文。'], true, () => cast.slice(0, 1))
  expect(rawReplies).toEqual([{ name: '合成角色甲' }])
  const receipt = modelInputs[1].at(-1)
  expect(receipt).toMatchObject({ role: 'tool', content: [
    { type: 'text', text: '下一步必须把 合成角色甲 的扮演正文直接发给玩家，格式为 <合成角色甲>对应的角色扮演内容</合成角色甲>。' }
  ] })
  expect(receipt.isError).not.toBe(true)
  expect(roleplayReplyMessages(events)).toMatchObject([{ content: '合成角色甲：下一步的正文。' }])
})

it('keeps the ordinary assistant reply and successful tool results when the reply tool was skipped', async () => {
  const text = '普通正文仍然可见。'
  const { requests, reply, outcome, events } = await runTurn([{ lookup: true }, text])
  expect(requests).toBe(2)
  expect(outcome).toEqual({ kind: 'completed' })
  expect(reply.data.message.content).toEqual([{ type: 'text', text }])
  expect(events.findLast(event => event.type === ROLEPLAY_OUTPUT_EVENT).data).toMatchObject({ replySeq: reply.seq, fallback: true })
  expect(events.filter(event => event.type === 'tool/result')).toHaveLength(1)
  const official = officialChatFixture().replace(events)
  expect([...official.nodes.values()].find(node => node.kind === 'turn-tail').data.closing.finalNode.seq).toBe(reply.seq)
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
