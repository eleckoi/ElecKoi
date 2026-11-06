import { queryFromInspection } from '../helpers/session-query.js'
import * as NativeToolExecutor from '@deepseek-ai/dsh-tool-executor-native'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import LlmRuntime, { LlmAdapter, createUserMessage } from '@deepseek-ai/dsh-llm'
import TypertRegistry from '@deepseek-ai/dsh-typert-registry'
import { ElecKoiConversationsApi, ConversationChangeFeed, ElecKoiVariableProcessing } from '@eleckoi/dsh-product-api'
import { ElecKoiConversationLifecycle } from '../../packages/host/product-api/src/conversationLifecycle'
import { RequestPreviewStore } from '../../packages/client/features/dsh-client-roleplay/src/host/request-preview.mjs'
import { TYPERT } from '@eleckoi/dsh-product-api/typert'
import { SqliteDatabase } from '../helpers/SqliteDatabase'
import { ConversationRepository } from '../../packages/host/product-data/src/domain/conversations/ConversationRepository'
import { MessageRepository } from '../../packages/host/product-data/src/domain/conversations/MessageRepository'
import { afterEach, describe, expect, it, vi } from 'vitest'

const cleanups = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })

async function fixture() {
  const database = new SqliteDatabase(':memory:')
  database.open()
  cleanups.push(() => database.close())
  database.native.prepare(`INSERT INTO characters(
    id,name,avatar,squareImage,coverImage,groupName,orderIndex,groupViewOrder,folder,
    frontendBeautyEnabled,assistantName,assistantAvatar,profileAge,profileSex,profileHeight,
    profileBirthday,profileLike,chatBackground,chatBackgroundOpacity,chatBackgroundBlur,chatBackgroundScrim
  ) VALUES ('synthetic-character','合成角色','','','','',0,0,'',0,'合成助手','','','','','','','',1,0,0)`).run()
  const options = [
    { id: 'entry-a', title: '开场一', content: '合成开场一', initialVariableStateJson: '{}' },
    { id: 'entry-b', title: '开场二', content: '合成开场二', initialVariableStateJson: '{}' },
  ]
  const conversations = new ConversationRepository(database, () => ({ initialVariableStateJson: '{}',
    openingText: options[0].content, openingOptions: options, selectedOpeningId: options[0].id }))
  const messages = new MessageRepository(database)
  const { conversation, metadata } = conversations.create({ metadata: { characterId: 'synthetic-character' } })
  const details = () => ({ conversation: conversations.get(conversation.id), metadata,
    runtimeSessionId: conversation.id, messages: messages.listMetadata(conversation.id), hasMore: false, beforeSequence: null })
  const select = vi.fn((_id, entry) => { conversations.selectOpening(conversation.id, entry); return details() })
  const update = vi.fn((_id, content) => { conversations.updateOpening(conversation.id, content); return details() })

  const ctx = new Context()
  cleanups.push(() => ctx.fiber.dispose())
  for (const plugin of [LlmRuntime, SessionStore, SessionProjectionRegistry, SystemPrompt, ToolRuntime, NativeToolExecutor, AgentRegistry, TypertRegistry]) {
    await ctx.plugin(plugin)
  }
  ctx.typert.register(TYPERT)
  await ctx.plugin(AgentLoop, { agents: [] })
  class Adapter extends LlmAdapter {
    async resolveModel(provider, id) { return { provider, id, name: id } }
    async *stream() {
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: '合成回复' } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
  }
  ctx.llm.registerAdapter(['synthetic'], new Adapter())
  const handle = await ctx.agentLoop.createAgent(ctx, {
    sessionId: SessionId(conversation.id), agentOptions: { provider: 'synthetic', model: 'synthetic' },
  })
  const session = handle.agent.session
  const controller = {
    inspect: vi.fn(async () => ({ meta: session.header, inheritedEventCount: 0, events: session.snapshotEvents() })),
    projections: vi.fn(async () => ctx.sessionProjections.snapshot(session)),
  }
  ctx.provide('sessionController', controller)
  ctx.provide('sessionQuery', queryFromInspection(id => controller.inspect(id)))
  ctx.provide('sessionPersistence', {})
  ctx.provide('eleckoiProductData', { runtimeSessionId: () => conversation.id,
    selectConversationOpening: select, updateConversationOpening: update })
  const variables = new ElecKoiVariableProcessing(ctx.eleckoiProductData)
  ctx.provide('eleckoiVariableProcessing', variables)
  cleanups.push(() => variables.close())
  ctx.provide('eleckoiRoleplaySessions', {})
  ctx.provide('eleckoiSessionEditor', {})
  ctx.provide('eleckoiConversationChanges', new ConversationChangeFeed())
  const previews = new RequestPreviewStore()
  ctx.provide('eleckoiRequestPreviews', previews)
  cleanups.push(() => previews.close())
  await ctx.plugin(ElecKoiConversationLifecycle)
  await ctx.plugin(ElecKoiConversationsApi)
  return { ctx, database, conversation, session, handle, controller, select, update, details,
    api: ctx.eleckoiConversationsApi }
}

describe('opening mutation admission against the authoritative DSH Session', () => {
  it('allows selection and editing before any input without changing the source options', async () => {
    const f = await fixture()
    await f.api.selectOpening(f.conversation.id, 'entry-b')
    await f.api.updateOpening(f.conversation.id, '合成当前开场')
    expect(f.details().messages[0]).toMatchObject({ content: '合成当前开场', selectedOpeningId: 'entry-b' })
  })

  it('rejects both operations after a real DSH prompt without a SQLite user counter', async () => {
    const f = await fixture()
    f.handle.agent.followup(createUserMessage({ content: [{ type: 'text', text: '合成用户输入' }], source: { kind: 'user' } }))
    await f.handle.agent.whenIdle()
    expect(f.database.native.pragma('table_info(chat_sessions)').map(column => column.name))
      .not.toContain('historyUserMessageCount')
    expect(f.session.snapshotEvents().some(event => event.type === 'user/message')).toBe(true)
    await expect(f.api.selectOpening(f.conversation.id, 'entry-b')).rejects.toThrow('对话开始后')
    await expect(f.api.updateOpening(f.conversation.id, '拒绝修改')).rejects.toThrow('对话开始后')
    expect(f.select).not.toHaveBeenCalled()
    expect(f.update).not.toHaveBeenCalled()
    expect(f.details().messages[0].content).toBe('合成开场一')
  })

  it('rejects queued input before the first durable user event and when the Agent is no longer attached', async () => {
    const f = await fixture()
    f.handle.agent.inbox.append('next-turn', createUserMessage({
      content: [{ type: 'text', text: '合成排队输入' }], source: { kind: 'user' },
    }))
    expect(f.session.snapshotEvents().some(event => event.type === 'user/message')).toBe(false)
    await expect(f.api.selectOpening(f.conversation.id, 'entry-b')).rejects.toThrow('对话开始后')
    const persisted = await f.controller.inspect()
    const projections = await f.controller.projections()
    await f.handle.dispose()
    f.controller.inspect.mockResolvedValue(persisted)
    f.controller.projections.mockResolvedValue(projections)
    await expect(f.api.updateOpening(f.conversation.id, '拒绝修改')).rejects.toThrow('对话开始后')
    expect(f.update).not.toHaveBeenCalled()
  })

  it('rechecks input admission after a delayed inspection instead of trusting the stale prefix', async () => {
    const f = await fixture()
    const prefix = await f.controller.inspect()
    f.controller.inspect.mockResolvedValue(prefix)
    f.controller.projections.mockImplementation(async () => {
      const projection = f.ctx.sessionProjections.snapshot(f.session)
      f.session.append('user/message', createUserMessage({
        content: [{ type: 'text', text: '合成并发输入' }], source: { kind: 'user' },
      }), { surfaceOp: 'append' })
      return projection
    })
    await expect(f.api.selectOpening(f.conversation.id, 'entry-b')).rejects.toThrow('对话开始后')
    expect(f.select).not.toHaveBeenCalled()
  })

  it('fails closed when the Session cannot be inspected', async () => {
    const f = await fixture()
    f.controller.inspect.mockRejectedValue(new Error('合成读取失败'))
    await expect(f.api.selectOpening(f.conversation.id, 'entry-b')).rejects.toThrow('合成读取失败')
    expect(f.select).not.toHaveBeenCalled()
  })
})
