import { DEEPSEEK_DEFAULT_COUNT } from '@deepseek-ai/dsh-web-deepseek-api'
import { AttachmentId } from '@deepseek-ai/dsh-attachment'
import { readSessionInspection, roleplayReplyMessages } from '@eleckoi/dsh-product-api'
import { executeToolCall, streamRoleplayReply } from '../helpers/tool-call.js'
import { retireDeepSeekExtensionSelection } from '@eleckoi/dsh-client-web-search/profile'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, relative, isAbsolute } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { initProfile, loadLayeredEnv, loadProfileDirectory } from '@deepseek-ai/dsh-app-boot'
import { PROFILE_TEMPLATES } from '@deepseek-ai/dsh-official-bundles'
import { runProfile } from '@deepseek-ai/dsh/profile-boot'
import { LlmAdapter, createUserMessage } from '@deepseek-ai/dsh-llm'
import { ELECKOI_DESKTOP_BUNDLES, ELECKOI_INSTALL_ANCHOR } from '../../apps/desktop-host/src/desktopPluginBundles'
import { preparePluginHost } from '../../apps/android-host/src/pluginHostConfiguration'
import { ELECKOI_INSTALL_ANCHOR as ANDROID_INSTALL_ANCHOR } from '../../apps/android-host/src/androidPluginBundles'
import Database from 'better-sqlite3'
import { DEFAULT_CREATOR_INSTRUCTIONS } from '../../packages/shared/src/contracts/presets/builtIns'
import { bundledHiddenToolTimeline } from '../../packages/host/product-data/src/HiddenToolTimelineFile'
import { emptyEntry } from '../../packages/host/product-data/src/domain/settingLibraries/settingLibraryNormalization'
import { ownerPeer } from '../support/owner-peer.js'
import { Session, SessionId, SESSION_FORMAT_VERSION } from '@deepseek-ai/dsh-session'
import { CREATOR_STUDIO_EVENT } from '../../packages/client/features/dsh-client-creator-studio/src/host/projection.mjs'
import { ROLEPLAY_REPLY_TOOL } from '../../packages/client/features/dsh-client-roleplay/src/host/roleplay-reply-tool.mjs'

const cleanups = []
afterEach(async () => { vi.unstubAllGlobals(); for (const stop of cleanups.splice(0).reverse()) await stop() }, 30000)

it.each(['desktop', 'android'])('%s sends preset custom positions while regenerating and after deleting messages', async platform => {
  const root = mkdtempSync(join(tmpdir(), 'eleckoi-preset-position-profile-'))
  cleanups.push(() => rm(root, { recursive: true, force: true, maxRetries: 3 }))
  let f = await start(platform, root)
  const requests = []
  const plainInput = '合成普通正文输入', plainReply = '合成普通正文'
  let replies = 0
  class Adapter extends LlmAdapter {
    async resolveModel(provider, id) { return { provider, id, name: id, context: { contextWindow: 1000000 }, defaultMaxTokens: 8192 } }
    async *stream(request) {
      if (request.messages.some(message => message.source.kind === 'user' && message.content.some(block => block.text === plainInput))) {
        yield { type: 'block-start', index: 0, blockType: 'text' }
        yield { type: 'block-end', index: 0, block: { type: 'text', text: plainReply } }
        yield { type: 'finish', reason: { kind: 'stop' } }
        return
      }
      requests.push(request.messages)
      expect(request.tools.some(tool => tool.name === ROLEPLAY_REPLY_TOOL)).toBe(true)
      yield* streamRoleplayReply(`合成回复 ${++replies}`, request)
    }
  }
  const provider = 'synthetic-preset-position'
  const registerModel = () => f.ctx.llm.registerAdapter([provider], new Adapter())
  registerModel()
  await f.ctx.agentDefaultModel.saveSelection({ provider, model: provider })
  const data = f.ctx.eleckoiProductData
  const preset = data.readAgentPreset(data.readAgentPresetCatalog().activePresetIds.roleplay)
  const defaultPrompt = readFileSync(bundledHiddenToolTimeline, 'utf8').replaceAll('\r\n', '\n').trimEnd()
  expect(defaultPrompt).toMatch(/^<roleplay_output_protocol>\nreply_phase:\n  output: "[^\n]*eleckoi_roleplay_reply/)
  expect(defaultPrompt).toMatch(/output: "[^\n]*严禁绕过该工具直接输出任何有关角色的回复内容。/)
  expect(defaultPrompt.indexOf('eleckoi_roleplay_reply')).toBeLessThan(defaultPrompt.indexOf('eleckoi_glob_setting_files'))
  expect(preset.entries.find(entry => entry.kind === 'hidden_tool_timeline')?.content).toBe(defaultPrompt)
  let activePrompt = defaultPrompt
  const timestamp = new Date().toISOString()
  const before = { id: 'synthetic-before', name: '合成自定义输入前', anchor: 'insert_point_3', side: 'before_setting_position', order: 1,
    createdAt: timestamp, updatedAt: timestamp }
  const after = { id: 'synthetic-after', name: '合成自定义输入后', anchor: 'insert_point_4', side: 'after_setting_position', order: 2,
    createdAt: timestamp, updatedAt: timestamp }
  const tail = { id: 'synthetic-tail', name: '合成自定义工具流后', anchor: 'insert_point_5', side: 'before_setting_position', order: 1,
    createdAt: timestamp, updatedAt: timestamp }
  data.saveAgentPreset({ ...preset, promptPositions: [...preset.promptPositions, before, after, tail],
    entries: [...preset.entries,
      { ...emptyEntry(before.id), title: before.name, content: before.name, triggerMode: 'always', promptPositionId: before.id, insertRole: 'assistant' },
      { ...emptyEntry(after.id), title: after.name, content: after.name, triggerMode: 'always', promptPositionId: after.id },
      { ...emptyEntry(tail.id), title: tail.name, content: tail.name, triggerMode: 'always', promptPositionId: tail.id }]
  }, preset.regexRules)
  const character = data.createCharacter({ id: 'synthetic-preset-character', name: '合成角色' }).items[0]
  const chat = await f.ctx.eleckoiConversationsApi.create({ metadata: { characterId: character.id } })
  const conversationId = chat.conversation.id
  const sessionId = chat.runtimeSessionId
  const invoke = (method, args) => f.ctx.typertGateway.invoke({
    peer: ownerPeer(f.ctx), namespace: 'eleckoiConversations', method, args: { conversationId, ...args }
  })
  const inspect = async () => (await readSessionInspection(f.ctx, sessionId)).events
  const first = '合成保留的输入', second = '合成待删除的输入', next = '合成重开后的输入'
  const send = async input => {
    expect(await f.ctx.eleckoiRoleplaySessions.preparePrompt(conversationId, input)).toBe(sessionId)
    const { agent } = await f.ctx.sessionController.resolveAgent(sessionId)
    agent.followup(createUserMessage({ content: [{ type: 'text', text: input }], source: { kind: 'user' } }))
    await agent.whenIdle()
    await f.ctx.eleckoiConversationLifecycle.drain(conversationId)
    expect(agent.session.snapshotEvents().findLast(event => event.type === 'turn/end').data.reason).toEqual({ kind: 'completed' })
  }
  const verifyRequest = input => {
    const markers = new Set([before.name, input, after.name, tail.name, activePrompt])
    const entries = requests.at(-1).flatMap(message => message.content.filter(block => block.type === 'text')
      .map(block => [message.role, block.text]))
    expect(entries.filter(([, text]) => markers.has(text))).toEqual([
      ['assistant', before.name], ['user', input], ['user', after.name], ['user', tail.name], ['user', activePrompt]
    ])
    const hiddenPrompt = { role: 'user', content: [{ type: 'text', text: activePrompt }] }
    expect(requests.at(-1).at(-1)).toMatchObject(hiddenPrompt)
  }
  await send(first)
  verifyRequest(first)
  activePrompt = '合成共享提示词'
  const editedPreset = data.readAgentPreset(preset.id)
  await f.ctx.typertGateway.invoke({ peer: ownerPeer(f.ctx), namespace: 'eleckoiAgentPresets', method: 'save',
    args: { preset: { ...editedPreset, entries: editedPreset.entries.map(entry => entry.kind === 'hidden_tool_timeline'
      ? { ...entry, content: activePrompt } : entry) }, expectedRegexRules: editedPreset.regexRules, expectedPrompt: defaultPrompt } })
  await send(second)
  verifyRequest(second)
  expect(requests.at(-1).filter(message => message.source.kind === 'plugin:eleckoi-product-history')).toEqual([
    expect.objectContaining({ role: 'assistant', content: [{ type: 'text', text: '合成回复 1' }] }),
  ])
  expect(requests.at(-1).some(message => message.role === 'tool'
    || message.content.some(block => block.type === 'tool-call' || block.type === 'reasoning'))).toBe(false)
  const userEvents = events => events.filter(event => event.type === 'user/message' && event.data.source.kind === 'user')
  const [retainedInput, retryInput] = userEvents(await inspect())
  const requestId = 'synthetic-preset-retry'
  const prepared = await invoke('regenerateMessage', { eventSeq: retryInput.seq, requestId })
  expect(prepared).toMatchObject({ runtimeSessionId: sessionId, prepared: true })
  expect(await invoke('startRegeneration', { requestId, cancelled: false })).toMatchObject({ accepted: true })
  const { agent: regeneratingAgent } = await f.ctx.sessionController.resolveAgent(sessionId)
  await regeneratingAgent.whenIdle()
  await invoke('waitForGeneration', { operationId: prepared.operationId })
  expect(requests).toHaveLength(3)
  verifyRequest(second)
  const regenerated = await inspect()
  expect(userEvents(regenerated).map(event => event.data.id)).toEqual([retainedInput.data.id, retryInput.data.id])
  const assistantText = events => roleplayReplyMessages(events).map(reply => reply.content)
  const rawReplies = events => events.filter(event => event.type === 'assistant/message')
    .flatMap(event => event.data.message.content.filter(block => block.type === 'tool-call' && block.name === ROLEPLAY_REPLY_TOOL)
      .map(block => JSON.parse(block.arguments)))
  expect(assistantText(regenerated)).toEqual(['合成角色：合成回复 1', '合成角色：合成回复 3'])
  expect(rawReplies(regenerated)).toEqual([{ 合成角色: '合成回复 1' }, { 合成角色: '合成回复 3' }])
  await invoke('deleteMessagesFrom', { eventSeq: retryInput.seq, role: 'user' })
  await f.close()
  f = await start(platform, root)
  registerModel()
  const reopened = await inspect()
  expect(userEvents(reopened).map(event => event.data.id)).toEqual([retainedInput.data.id])
  expect(assistantText(reopened)).toEqual(['合成角色：合成回复 1'])
  await send(next)
  expect(requests).toHaveLength(4)
  verifyRequest(next)
  expect(JSON.stringify(requests.at(-1))).not.toContain(second)
  const beforeEdit = await inspect()
  const lastReply = roleplayReplyMessages(beforeEdit).at(-1)
  await invoke('editMessage', { eventSeq: lastReply.addressSeq, role: 'assistant', content: '编辑后的扮演正文' })
  const edited = await inspect()
  expect(assistantText(edited)).toEqual(['合成角色：合成回复 1', '合成角色：编辑后的扮演正文'])
  const rawTrace = events => events.filter(event => ['assistant/message', 'tool/call', 'tool/result'].includes(event.type))
  expect(rawTrace(edited)).toEqual(rawTrace(beforeEdit))
  await send('合成编辑后的下一轮输入')
  expect(requests.at(-1).filter(message => message.source.kind === 'plugin:eleckoi-product-history').map(message => message.content)).toEqual([
    [{ type: 'text', text: '合成回复 1' }], [{ type: 'text', text: '编辑后的扮演正文' }]
  ])
  expect(requests.at(-1).some(message => message.role === 'tool'
    || message.content.some(block => block.type === 'tool-call' || block.type === 'reasoning'))).toBe(false)
  await invoke('deleteMessagesFrom', { eventSeq: lastReply.addressSeq, role: 'assistant' })
  const deleted = await inspect()
  expect(assistantText(deleted)).toEqual(['合成角色：合成回复 1'])
  expect(deleted.filter(event => event.type === 'tool/result' && event.data.meta?.source === 'eleckoi-roleplay-reply')).toHaveLength(1)
  await send(plainInput)
  const afterPlainReply = await inspect()
  expect(assistantText(afterPlainReply)).toEqual(['合成角色：合成回复 1'])
  expect(rawReplies(afterPlainReply)).toEqual([{ 合成角色: '合成回复 1' }])
  expect(afterPlainReply.findLast(event => event.type === 'assistant/message').data.message.content)
    .toContainEqual({ type: 'text', text: plainReply })
}, 120_000)

it.each(['desktop', 'android'])('%s keeps associated variable configuration live and continues chatting after it is removed', async platform => {
  const root = mkdtempSync(join(tmpdir(), 'eleckoi-live-variable-profile-'))
  cleanups.push(() => rm(root, { recursive: true, force: true, maxRetries: 3 }))
  let f = await start(platform, root), ctx = f.ctx, holdReply
  class Adapter extends LlmAdapter {
    async resolveModel(provider, id) { return { provider, id, name: id, context: { contextWindow: 1000000 }, defaultMaxTokens: 8192 } }
    async listModels(provider) { return [await this.resolveModel(provider, 'synthetic-variable-model')] }
    async *stream(request) {
      if (holdReply) await holdReply
      yield* streamRoleplayReply('Synthetic continued reply', request)
    }
  }
  const install = () => ctx.llm.registerAdapter(['synthetic-variable-profile'], new Adapter())
  install()
  await ctx.agentDefaultModel.saveSelection({ provider: 'synthetic-variable-profile', model: 'synthetic-variable-model' })
  const data = ctx.eleckoiProductData
  const character = data.createCharacter({ id: 'synthetic-variable-character', name: '合成变量角色' }).items[0]
  const blank = data.readVariableConfig(character.id)
  const variable = { id: 'score', title: 'score', objectId: '', enabled: true, type: 'number', defaultValue: '2',
    description: '原说明', updateRule: '原规则', readMode: 'required', order: 1, treeViewOrder: 1, createdAt: '', updatedAt: '' }
  const a = { ...blank.versions[0], id: 'synthetic-a', name: '合成 A', variables: [variable], schemaCode: 'const Schema = z.object({ score: z.number().max(10) })' }
  const b = { ...a, id: 'synthetic-b', name: '合成 B', variables: [{ ...variable, defaultValue: '100' }], schemaCode: 'const Schema = z.object({ score: z.number().max(200) })' }
  data.saveVariableConfig(character.id, { ...blank, ...a, activeVersionId: a.id, versions: [a, b] })
  const openings = data.readCharacterOpenings(character.id)
  data.saveCharacterOpenings(character.id, { ...openings, openingMessages: openings.openingMessages.map(item => ({ ...item, content: '合成变量开场', variableVersionId: a.id })) })
  const chat = await ctx.eleckoiConversationsApi.create({ metadata: { characterId: character.id } })
  let sessionId = await ctx.eleckoiRoleplaySessions.preparePrompt(chat.conversation.id, '合成第一次输入')
  let agent = (await ctx.sessionController.resolveAgent(sessionId)).agent
  const call = async (name, args) => {
    const result = await executeToolCall(agent.ctx.tools, { callId: `synthetic-live-${name}`, name, arguments: args,
      agent, signal: new AbortController().signal })
    expect(result.isError, JSON.stringify(result)).not.toBe(true)
    return JSON.parse(result.content.filter(block => block.type === 'text').map(block => block.text).join(''))
  }
  const config = data.readVariableConfig(character.id)
  data.saveVariableConfig(character.id, { ...config, ...b, activeVersionId: b.id, versions: [
    { ...a, variables: [{ ...variable, defaultValue: '4', description: '新说明', updateRule: '新规则' }] }, b,
  ] })
  expect((await call('eleckoi_read_variables', { paths: ['/score'] })).variables[0])
    .toMatchObject({ default: 4, current: 2, description: '新说明', update_rule: '新规则' })
  expect(await call('eleckoi_apply_variable_patch', { operations: [{ op: 'delta', path: '/score', value: 1 }] })).toMatchObject({ status: 'ok' })
  const send = async text => {
    agent.followup(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }))
    await agent.whenIdle()
    expect(agent.session.snapshotEvents().findLast(event => event.type === 'turn/end').data.reason).toEqual({ kind: 'completed' })
    await ctx.eleckoiConversationLifecycle.drain(chat.conversation.id)
  }
  await send('合成第一次输入')
  expect(JSON.parse(data.readAuthorConversationState(chat.conversation.id).currentVariableStateJson)).toEqual({ score: 3 })
  let releaseReply
  holdReply = new Promise(resolve => { releaseReply = resolve })
  sessionId = await ctx.eleckoiRoleplaySessions.preparePrompt(chat.conversation.id, '合成生成中输入')
  agent = (await ctx.sessionController.resolveAgent(sessionId)).agent
  const activeReply = send('合成生成中输入')
  try {
    await expect(ctx.eleckoiConversationsApi.selectVariableVersion(chat.conversation.id, b.id, a.id)).rejects.toThrow('等待当前回复结束')
    expect(ctx.eleckoiConversationsApi.variableConfiguration(chat.conversation.id).versionId).toBe(a.id)
  } finally { releaseReply(); await activeReply; holdReply = undefined }
  const lateOpenings = data.readCharacterOpenings(character.id)
  data.saveCharacterOpenings(character.id, { ...lateOpenings, openingMessages: lateOpenings.openingMessages.map(item => ({ ...item, content: '', variableVersionId: '' })) })
  const lateChat = await ctx.eleckoiConversationsApi.create({ metadata: { characterId: character.id } })
  expect(ctx.eleckoiConversationsApi.variableConfiguration(lateChat.conversation.id).versionId).toBe('')
  await ctx.eleckoiConversationsApi.selectVariableVersion(lateChat.conversation.id, b.id, '')
  expect(data.readConversationVariableContext(lateChat.conversation.id).versionId).toBe(b.id)
  expect(JSON.parse(data.readAuthorConversationState(lateChat.conversation.id).currentVariableStateJson)).toEqual({})
  const preserved = data.readAuthorConversationState(chat.conversation.id)
  expect(ctx.eleckoiConversationsApi.variableConfiguration(chat.conversation.id).versionId).toBe(a.id)
  await ctx.eleckoiConversationsApi.selectVariableVersion(chat.conversation.id, b.id, a.id)
  expect(data.readAuthorConversationState(chat.conversation.id).variableConfig.activeVersionId).toBe(b.id)
  await expect(ctx.eleckoiConversationsApi.selectVariableVersion(chat.conversation.id, '', a.id)).rejects.toThrow('已改变')
  await ctx.eleckoiConversationsApi.selectVariableVersion(chat.conversation.id, '', b.id)
  expect(data.readAuthorConversationState(chat.conversation.id).variableConfig).toBeNull()
  await ctx.eleckoiConversationsApi.selectVariableVersion(chat.conversation.id, a.id, '')
  expect(data.readAuthorConversationState(chat.conversation.id).currentVariableStateJson).toBe(preserved.currentVariableStateJson)
  expect(data.readAuthorConversationState(chat.conversation.id).variableIdentityJson).toBe(preserved.variableIdentityJson)
  const history = data.captureRuntimeHistory(chat.conversation.id)
  const initial = data.readAuthorConversationState(chat.conversation.id).initialVariableStateJson
  const current = data.readVariableConfig(character.id)
  data.saveVariableConfig(character.id, { ...current, versions: [current.versions.find(item => item.id === b.id)] })
  sessionId = await ctx.eleckoiRoleplaySessions.preparePrompt(chat.conversation.id, '合成缺失关联输入')
  agent = (await ctx.sessionController.resolveAgent(sessionId)).agent
  expect(await call('eleckoi_read_variables', { paths: ['/score'] })).toMatchObject({ status: 'not_found' })
  await send('合成缺失关联输入')
  expect(data.readAuthorConversationState(chat.conversation.id).variableConfig).toBeNull()
  expect(data.captureRuntimeHistory(chat.conversation.id)).toEqual(expect.arrayContaining(history))
  await f.close()
  f = await start(platform, root); ctx = f.ctx; install()
  expect(ctx.eleckoiConversationsApi.variableConfiguration(lateChat.conversation.id).versionId).toBe(b.id)
  sessionId = await ctx.eleckoiRoleplaySessions.preparePrompt(chat.conversation.id, '合成重开输入')
  agent = (await ctx.sessionController.resolveAgent(sessionId)).agent
  await send('合成重开输入')
  expect(JSON.parse(ctx.eleckoiProductData.readAuthorConversationState(chat.conversation.id).currentVariableStateJson)).toEqual({ score: 3 })
  expect(ctx.eleckoiProductData.readAuthorConversationState(chat.conversation.id).initialVariableStateJson).toBe(initial)
}, 120000)

it.each(['desktop', 'android'])('%s keeps authored removals out of actual model tool results while committing runtime additions', async platform => {
  const root = mkdtempSync(join(tmpdir(), 'eleckoi-variable-removal-profile-'))
  cleanups.push(() => rm(root, { recursive: true, force: true, maxRetries: 3 }))
  let f = await start(platform, root), ctx = f.ctx, step = 0
  const checkToolDescription = tool => expect(tool?.description).toMatch(
    /^eleckoi_roleplay_reply 可用时，务必按 <roleplay_output_protocol> 判断本轮是否需要调用该工具，严禁绕过该工具直接输出任何有关角色的回复内容。/)
  class Adapter extends LlmAdapter {
    async resolveModel(provider, id) { return { provider, id, name: id, context: { contextWindow: 1000000 }, defaultMaxTokens: 8192 } }
    async listModels(provider) { return [await this.resolveModel(provider, 'synthetic-removal-model')] }
    async *stream(options) {
      const calls = [
        [['eleckoi_glob_setting_files', {}], ['eleckoi_glob_variables', {}]],
        [['eleckoi_read_variables', { paths: ['/status'] }]],
        [['eleckoi_apply_variable_patch', { operations: [{ op: 'insert', path: '/status/newRuntime', value: 12 }] }]],
      ]
      const current = step++
      if (current > 0 && current <= calls.length) {
        const results = options.messages.filter(item => item.role === 'tool')
        const result = results.find(item => item.toolCallId === `synthetic-removal-${current - 1}-${calls[current - 1].length - 1}`)
        const value = JSON.parse(result.content.map(block => block.text).join(''))
        expect(JSON.stringify(value)).not.toContain('retired-profile-needle')
        if (current === 1) {
          const settingsResult = results.find(item => item.toolCallId === 'synthetic-removal-0-0')
          expect(JSON.parse(settingsResult.content.map(block => block.text).join('')).files).toEqual([])
          expect(value.paths).not.toContain('/status/coins')
          expect(value.paths).toContain('/status/runtime')
        } else if (current === 2) {
          expect(value.variables[0].current.entries.map(item => item.key)).toEqual(['runtime'])
        } else expect(value.status).toBe('ok')
      }
      if (current < calls.length) {
        for (const [index, [name, args]] of calls[current].entries()) {
          checkToolDescription(options.tools.find(tool => tool.name === name))
          const block = { type: 'tool-call', id: `synthetic-removal-${current}-${index}`, name, arguments: JSON.stringify(args) }
          yield { type: 'block-start', index, blockType: 'tool-call' }
          yield { type: 'tool-call-delta', index, id: block.id, name, argumentsDelta: block.arguments }
          yield { type: 'block-end', index, block }
        }
        yield { type: 'finish', reason: { kind: 'tool-calls' } }
      } else yield* streamRoleplayReply('Synthetic updated reply', options)
    }
  }
  const install = () => ctx.llm.registerAdapter(['synthetic-removal-profile'], new Adapter())
  install()
  await ctx.agentDefaultModel.saveSelection({ provider: 'synthetic-removal-profile', model: 'synthetic-removal-model' })
  const character = ctx.eleckoiProductData.createCharacter({ id: 'synthetic-removal-character', name: '合成变量角色' }).items[0]
  const data = ctx.eleckoiProductData, blank = data.readVariableConfig(character.id)
  const group = { id: 'status', name: 'status', parentId: '', enabled: true, dynamicKey: false, description: '', updateRule: '', order: 1, treeViewOrder: 1, createdAt: '', updatedAt: '' }
  const coins = { id: 'coins', title: 'coins', objectId: 'status', enabled: true, type: 'string', defaultValue: '', description: '', updateRule: '', readMode: 'on_demand', order: 1, treeViewOrder: 1, createdAt: '', updatedAt: '' }
  data.saveVariableConfig(character.id, { ...blank, objects: [group], variables: [coins] })
  const openings = data.readCharacterOpenings(character.id)
  data.saveCharacterOpenings(character.id, { ...openings, openingMessages: openings.openingMessages.map(item => ({ ...item, content: '合成变量开场', variableVersionId: blank.activeVersionId })) })
  const chat = await ctx.eleckoiConversationsApi.create({ metadata: { characterId: character.id } })
  const original = { status: { coins: 'retired-profile-needle', runtime: 9 } }
  data.replaceConversationVariableState(chat.conversation.id, JSON.stringify(original))
  const sessionId = await ctx.eleckoiRoleplaySessions.preparePrompt(chat.conversation.id, '合成变量修改输入')
  const config = data.readVariableConfig(character.id)
  data.saveVariableConfig(character.id, { ...config, variables: [] })
  const agent = (await ctx.sessionController.resolveAgent(sessionId)).agent
  agent.followup(createUserMessage({ content: [{ type: 'text', text: '合成变量修改输入' }], source: { kind: 'user' } }))
  await agent.whenIdle(); await ctx.eleckoiConversationLifecycle.drain(chat.conversation.id)
  expect(agent.session.snapshotEvents().findLast(event => event.type === 'turn/end').data.reason).toEqual({ kind: 'completed' })
  const loggedTools = agent.session.requestHeader().tools
  for (const name of ['eleckoi_glob_setting_files', 'eleckoi_glob_variables']) {
    checkToolDescription(loggedTools.find(tool => tool.name === name))
  }
  expect(step).toBe(4)
  expect(JSON.parse(data.readAuthorConversationState(chat.conversation.id).currentVariableStateJson)).toEqual({ status: { ...original.status, newRuntime: 12 } })
  await f.close(); f = await start(platform, root); ctx = f.ctx; install()
  const reopenedId = await ctx.eleckoiRoleplaySessions.preparePrompt(chat.conversation.id, '合成重开输入')
  const reopened = (await ctx.sessionController.resolveAgent(reopenedId)).agent
  const result = await executeToolCall(reopened.ctx.tools, { callId: 'synthetic-removal-reopened', name: 'eleckoi_glob_variables', arguments: {}, agent: reopened, signal: new AbortController().signal })
  expect(JSON.parse(result.content.filter(item => item.type === 'text').map(item => item.text).join('')).paths).toEqual(['/status', '/status/newRuntime', '/status/runtime'])
}, 120000)

it('deletes workspace Session trees, durable membership and results, and keeps unrelated files across restart', async () => {
  const root = mkdtempSync(join(tmpdir(), 'eleckoi-workspace-delete-'))
  cleanups.push(() => rm(root, { recursive: true, force: true, maxRetries: 3 }))
  const f = await start('desktop', root), { ctx } = f
  const workspace = await ctx.workspaceRegistry.create(join(root, 'workspace'))
  const projectFile = join(workspace.path, 'synthetic-project.txt')
  writeFileSync(projectFile, 'Synthetic workspace file')
  const created = await ctx.eleckoiCreatorStudioRuntime.create('', workspace.id)
  const kept = await ctx.eleckoiCreatorStudioRuntime.create('', workspace.id)
  const ordinary = await ctx.sessionController.create({ sessionId: 'synthetic-ordinary-workspace', workspaceId: workspace.id, agentPreset: 'cordis' })
  await ctx.eleckoiCreatorStudioSessionsApi.delete(ordinary.sessionId)
  expect((await ctx.sessionController.list({})).items.some(item => item.sessionId === ordinary.sessionId)).toBe(false)
  const childId = SessionId('synthetic-deleted-child')
  const child = Session.create(childId, [], { ...Session.create(childId).header, cwd: workspace.path,
    parentSession: SessionId(created.sessionId), origin: 'subagent', delegationDepth: 1 })
  const handle = await ctx.sessionPersistence.create(child.header)
  await handle.flush(); await handle.close()
  await workspace.attachSession(childId)
  await ctx.workspaceRegistry.pinSession(SessionId(created.sessionId))
  await ctx.workspaceRegistry.archiveSession(childId)
  const ids = [created.sessionId, childId]
  mkdirSync(process.env.ELECKOI_SESSION_SNAPSHOT_ROOT, { recursive: true })
  for (const id of ids) writeFileSync(join(process.env.ELECKOI_SESSION_SNAPSHOT_ROOT, `${id}.json`), '{}')
  const results = await Promise.all(ids.map(sessionId => ctx.spillStore.saveText({ owner: { sessionId },
    source: { kind: 'tool', toolName: 'synthetic_tool', callId: 'synthetic-call' }, suggestedName: 'synthetic-result.txt', content: 'Synthetic result' })))
  const snapshots = ids.map(id => join(process.env.ELECKOI_SESSION_SNAPSHOT_ROOT, `${id}.json`))
  await ctx.eleckoiCreatorStudioSessionsApi.delete(created.sessionId)
  expect(workspace.sessionIds).toEqual([kept.sessionId])
  expect(ctx.workspaceRegistry.pinnedSessionIds).not.toContain(created.sessionId)
  expect(ctx.workspaceRegistry.archivedSessionIds).not.toContain(childId)
  for (const id of ids) {
    expect(ctx.agents.get(id)).toBeUndefined()
    expect((await ctx.sessionController.list({})).items.some(item => item.sessionId === id)).toBe(false)
    await expect(readSessionInspection(ctx, id)).rejects.toBeDefined()
  }
  for (const file of [...snapshots, ...results.flatMap(result => [result.locator, `${result.locator}.owner.json`])]) expect(existsSync(file)).toBe(false)
  expect(readFileSync(projectFile, 'utf8')).toBe('Synthetic workspace file')
  const roleplayRecord = ctx.eleckoiProductData.createConversation({})
  const roleplay = await ctx.eleckoiRoleplaySessions.create(roleplayRecord.conversation.id)
  await expect(ctx.eleckoiCreatorStudioSessionsApi.delete(roleplay)).rejects.toMatchObject({ code: 'eleckoi/security/denied' })
  await f.close()
  const reopened = await start('desktop', root)
  expect(reopened.ctx.workspaceRegistry.get(workspace.id).sessionIds).toEqual([kept.sessionId])
  expect((await reopened.ctx.sessionController.list({})).items.some(item => ids.includes(item.sessionId))).toBe(false)
  await reopened.ctx.eleckoiCreatorStudioRuntime.open(kept.sessionId)
  expect((await reopened.ctx.eleckoiCreatorStudioRuntime.list()).map(item => item.sessionId)).toContain(kept.sessionId)
  expect(readFileSync(projectFile, 'utf8')).toBe('Synthetic workspace file')
}, 60_000)

it.each(['desktop', 'android'])('%s replaces the edited default Creator once and sends the merged tools through the actual profile', async platform => {
  const root = mkdtempSync(join(tmpdir(), 'eleckoi-default-creator-profile-'))
  cleanups.push(() => rm(root, { recursive: true, force: true, maxRetries: 3 }))
  let f = await start(platform, root)
  const id = 'agent-preset-creator'
  const original = f.ctx.eleckoiProductData.readAgentPreset(id)
  f.ctx.eleckoiProductData.saveAgentPreset({ ...original,
    entries: original.entries.map(entry => ({ ...entry, content: 'Synthetic old edited default' })),
    toolGroups: original.toolGroups.map(group => ({ ...group, included: ['builtin:creator', 'builtin:web'].includes(group.id), enabled: ['builtin:creator', 'builtin:web'].includes(group.id) })),
  }, original.regexRules)
  await f.close()
  const old = new Database(join(root, 'product.sqlite'))
  try { old.prepare("DELETE FROM agent_preset_contents WHERE presetId=? AND kind='builtin_creator_workspace_upgrade'").run(id) }
  finally { old.close() }
  f = await start(platform, root)
  const { ctx } = f, requests = []
  const upgraded = ctx.eleckoiProductData.readAgentPreset(id)
  expect(upgraded.entries.find(entry => entry.id === 'creator-studio-instructions').content).toBe(DEFAULT_CREATOR_INSTRUCTIONS)
  expect(upgraded.toolGroups.filter(group => group.included && group.enabled).map(group => group.id)).toEqual([
    'builtin:workflow', 'builtin:creator', 'builtin:collaboration', 'builtin:plugin-discovery', 'builtin:workspace', 'builtin:web',
  ])
  class Adapter extends LlmAdapter {
    async resolveModel(provider, id) { return { provider, id, name: id, context: { contextWindow: 1000000 }, defaultMaxTokens: 8192 } }
    async listModels(provider) { return [await this.resolveModel(provider, 'synthetic-creator-upgrade')] }
    async *stream(options) {
      requests.push(options)
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: 'Synthetic upgraded Creator reply' }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: 'Synthetic upgraded Creator reply' } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
  }
  ctx.llm.registerAdapter(['synthetic-creator-upgrade'], new Adapter())
  await ctx.agentDefaultModel.saveSelection({ provider: 'synthetic-creator-upgrade', model: 'synthetic-creator-upgrade' })
  const studio = await ctx.eleckoiCreatorStudioRuntime.create('')
  const resolved = await ctx.sessionController.resolveAgent(studio.sessionId)
  if ('error' in resolved) throw resolved.error
  resolved.agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Synthetic upgraded request' }], source: { kind: 'user' } }))
  await resolved.agent.whenIdle()
  expect(resolved.agent.session.snapshotEvents().findLast(event => event.type === 'turn/end').data.reason).toEqual({ kind: 'completed' })
  expect(requests).toHaveLength(1)
  expect(requests[0].tools.map(tool => tool.name)).toEqual(expect.arrayContaining([
    'eleckoi_list_toolsets', 'eleckoi_describe_toolset', 'eleckoi_call_capability',
    'read', 'edit', 'working_directory', 'todo_write', 'skill', 'subagent', 'plugin_manager',
  ]))
  expect(JSON.stringify(requests[0].messages)).toContain(DEFAULT_CREATOR_INSTRUCTIONS)
  const edited = ctx.eleckoiProductData.saveAgentPreset({ ...upgraded,
    entries: upgraded.entries.map(entry => ({ ...entry, content: 'Synthetic edit after upgrade' })),
  }, upgraded.regexRules)
  await f.close()
  const reopened = await start(platform, root)
  expect(reopened.ctx.eleckoiProductData.readAgentPreset(id)).toEqual(edited)
}, 120_000)

it.each(['desktop', 'android'])('%s keeps Studio APIs and model turns available with optional tools disabled across cold starts', async platform => {
  const root = mkdtempSync(join(tmpdir(), 'eleckoi-studio-disabled-tools-'))
  cleanups.push(() => rm(root, { recursive: true, force: true, maxRetries: 3 }))
  const stderr = vi.spyOn(process.stderr, 'write')
  cleanups.push(() => stderr.mockRestore())
  let f = await start(platform, root)
  const preset = f.ctx.eleckoiProductData.readAgentPreset('agent-preset-creator')
  f.ctx.eleckoiProductData.saveAgentPreset({ ...preset, toolGroups: preset.toolGroups.map(group => group.id === 'builtin:workspace'
    ? { ...group, included: false, enabled: false } : group) }, preset.regexRules)
  await f.close()
  f = await start(platform, root)
  const ctx = f.ctx
  const list = () => ctx.typertGateway.invoke({ peer: ownerPeer(ctx), namespace: 'eleckoiCreatorStudioSessions', method: 'list', args: {} })
  await expect(list()).resolves.toEqual([])
  const requests = []
  class Adapter extends LlmAdapter {
    async resolveModel(provider, id) { return { provider, id, name: id, context: { contextWindow: 1000000 }, defaultMaxTokens: 8192 } }
    async listModels(provider) { return [await this.resolveModel(provider, 'synthetic-tool-switches')] }
    async *stream(request) {
      requests.push(request)
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: 'Synthetic tools disabled reply' } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
  }
  ctx.llm.registerAdapter(['synthetic-tool-switches'], new Adapter())
  await ctx.agentDefaultModel.saveSelection({ provider: 'synthetic-tool-switches', model: 'synthetic-tool-switches' })
  const blockedTools = new Map([
    ['builtin:workspace', ['edit', 'write', 'apply_patch', 'bash', 'pwsh', 'working_directory']],
    ['builtin:workflow', ['todo_write', 'job_output', 'schedule_create', 'get_goal', 'create_goal', 'workflow']],
    ['builtin:collaboration', ['subagent', 'subagent_fork', 'send_message', 'list_agents']],
    ['builtin:web', ['web_search', 'web_fetch']],
    ['builtin:plugin-discovery', ['plugin_manager', 'plugin_market']],
    ['builtin:creator', ['eleckoi_list_toolsets', 'eleckoi_describe_toolset', 'eleckoi_call_capability']],
  ])
  let lastCompleted
  for (const blocked of [...blockedTools.keys()].map(id => [id]).concat([[...blockedTools.keys()]])) {
    const current = ctx.eleckoiProductData.readAgentPreset(preset.id)
    const saved = ctx.eleckoiProductData.saveAgentPreset({ ...current, toolGroups: preset.toolGroups.map(group => blocked.includes(group.id)
      ? { ...group, included: true, enabled: false } : group) }, current.regexRules)
    const studio = await ctx.typertGateway.invoke({ peer: ownerPeer(ctx), namespace: 'eleckoiCreatorStudioSessions', method: 'create', args: { characterId: '' } })
    const resolved = await ctx.sessionController.resolveAgent(studio.sessionId)
    if ('error' in resolved) throw resolved.error
    resolved.agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Synthetic tool switch request' }], source: { kind: 'user' } }))
    await resolved.agent.whenIdle()
    const completed = resolved.agent.session.snapshotEvents().findLast(event => event.type === 'turn/end')
    expect(completed.data.reason).toEqual({ kind: 'completed' })
    lastCompleted = { header: resolved.agent.session.header, seq: completed.seq }
    const tools = requests.at(-1).tools.map(tool => tool.name)
    for (const id of blocked) for (const name of blockedTools.get(id)) expect(tools, id).not.toContain(name)
    expect(tools).toEqual(expect.arrayContaining(['read', 'read_image']))
    expect((await list()).some(item => item.sessionId === studio.sessionId)).toBe(true)
    expect(ctx.eleckoiProductData.readAgentPreset(preset.id)).toEqual(saved)
  }
  expect(requests).toHaveLength(7)
  const disabledPreset = ctx.eleckoiProductData.readAgentPreset(preset.id)
  await f.close()
  const diagnostics = stderr.mock.calls.map(([chunk]) => String(chunk)).join('')
  expect(diagnostics).not.toMatch(/agent\/disposed listener threw|patch: entry "(?:tool-subagent-list-agents|workflow-worker-thread|tool-ralph)" not found/)
  expect(diagnostics).not.toContain('ElecKoi 会话运行状态提交失败')
  expect(diagnostics).not.toMatch(/session projection cache: (?:turn\/end|detach) write .*failed/)
  const reopened = await start(platform, root)
  const cache = reopened.ctx.sessionProjectionCache.cachedSnapshot(lastCompleted.header, ['eleckoiCreatorStudio'])
  expect(cache?.values.eleckoiCreatorStudio).toEqual({ presetId: preset.id, characterId: '' })
  expect(cache.asOfSeq).toBeGreaterThanOrEqual(lastCompleted.seq)
  expect(reopened.ctx.eleckoiProductData.readAgentPreset(preset.id)).toEqual(disabledPreset)
  const catalog = await reopened.ctx.typertGateway.invoke({ peer: ownerPeer(reopened.ctx), namespace: 'eleckoiCreatorStudioSessions', method: 'list', args: {} })
  expect(catalog).toHaveLength(7)
}, 120_000)

it.each(['desktop', 'android'])('%s omits roleplay-only groups from Creator execution without blocking Studio or changing saved choices', async platform => {
  const root = mkdtempSync(join(tmpdir(), 'eleckoi-studio-invalid-preset-'))
  cleanups.push(() => rm(root, { recursive: true, force: true, maxRetries: 3 }))
  let f = await start(platform, root)
  class Adapter extends LlmAdapter {
    async resolveModel(provider, id) { return { provider, id, name: id, context: { contextWindow: 1000000 }, defaultMaxTokens: 8192 } }
    async listModels(provider) { return [await this.resolveModel(provider, 'synthetic-invalid-preset')] }
  }
  f.ctx.llm.registerAdapter(['synthetic-invalid-preset'], new Adapter())
  await f.ctx.agentDefaultModel.saveSelection({ provider: 'synthetic-invalid-preset', model: 'synthetic-invalid-preset' })
  const existing = await f.ctx.eleckoiCreatorStudioRuntime.create('')
  const preset = f.ctx.eleckoiProductData.readAgentPreset('agent-preset-creator')
  f.ctx.eleckoiProductData.saveAgentPreset({ ...preset, toolGroups: preset.toolGroups.map(group => group.id === 'builtin:variables'
    ? { ...group, included: true, enabled: true } : group) }, preset.regexRules)
  await f.close()
  f = await start(platform, root)
  const ctx = f.ctx
  const invoke = (method, args = {}) => ctx.typertGateway.invoke({ peer: ownerPeer(ctx), namespace: 'eleckoiCreatorStudioSessions', method, args })
  ctx.llm.registerAdapter(['synthetic-invalid-preset'], new Adapter())
  await ctx.agentDefaultModel.saveSelection({ provider: 'synthetic-invalid-preset', model: 'synthetic-invalid-preset' })
  await expect(invoke('list')).resolves.toEqual([expect.objectContaining({ sessionId: existing.sessionId })])
  const unrelatedCreated = await invoke('create', { characterId: '' })
  expect(await invoke('open', { sessionId: existing.sessionId })).toMatchObject({ sessionId: existing.sessionId })
  const invalid = ctx.eleckoiProductData.readAgentPreset(preset.id)
  expect(invalid.toolGroups.find(group => group.id === 'builtin:variables')).toMatchObject({ included: true, enabled: true })
  expect(ctx.agents.get(existing.sessionId).ctx.tools.schemas().map(tool => tool.name)).not.toContain('eleckoi_read_variables')
  ctx.eleckoiProductData.saveAgentPreset({ ...invalid, toolGroups: preset.toolGroups }, invalid.regexRules)
  expect(await invoke('open', { sessionId: existing.sessionId })).toMatchObject({ sessionId: existing.sessionId })
  const created = await invoke('create', { characterId: '' })
  expect((await invoke('list')).map(item => item.sessionId).sort()).toEqual([existing.sessionId, unrelatedCreated.sessionId, created.sessionId].sort())
}, 120_000)

it.each(['desktop', 'android'])('%s keeps Studio available when an interrupted older Studio Session cannot be upgraded', async platform => {
  const root = mkdtempSync(join(tmpdir(), 'eleckoi-studio-partial-upgrade-'))
  cleanups.push(() => rm(root, { recursive: true, force: true, maxRetries: 3 }))
  let f = await start(platform, root)
  const legacyId = `eleckoi-creator-${'2'.repeat(64)}`
  const directory = join(root, 'generated-presets/creator-studio', legacyId)
  mkdirSync(directory, { recursive: true })
  const generated = `${JSON.stringify({ id: legacyId, plugins: [] })}\n`
  writeFileSync(join(directory, 'preset.json'), generated)
  const unreadableDirectory = join(root, 'generated-presets/creator-studio', `eleckoi-creator-${'3'.repeat(64)}`)
  mkdirSync(unreadableDirectory, { recursive: true })
  writeFileSync(join(unreadableDirectory, 'preset.json'), '{')
  const image = { attachmentId: AttachmentId(`sha256:${'c'.repeat(64)}`), mediaType: 'image/png', bytes: 68, width: 1, height: 1 }
  for (const complete of [true, false]) {
    const id = SessionId(complete ? 'synthetic-complete-old-studio' : 'synthetic-interrupted-old-studio')
    const header = { id, version: SESSION_FORMAT_VERSION, createdAt: 1, isSeeded: false, cwd: join(root, 'workspace'), agentPreset: legacyId }
    const handle = await f.ctx.sessionPersistence.create(header)
    try {
      const session = Session.create(id, [], header, undefined, f.ctx.sessions.messageProjections)
      if (complete) {
        session.append(CREATOR_STUDIO_EVENT, { presetId: 'agent-preset-creator', characterId: '' }, { ignorable: true })
        session.append('turn/start', { turn: 1 })
        const input = session.append('user/message', createUserMessage({ content: [{ type: 'image', attachment: image }], source: { kind: 'user' } }), { surfaceOp: 'append' })
        session.append('image/offload', { targets: [{ seq: input.seq, imageIndexes: [0] }] })
        session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
      }
      await handle.append(session.snapshotEvents()); await handle.flush()
    } finally { await handle.close() }
  }
  await f.close()
  f = await start(platform, root)
  const invoke = (method, args = {}) => f.ctx.typertGateway.invoke({ peer: ownerPeer(f.ctx), namespace: 'eleckoiCreatorStudioSessions', method, args })
  await expect(invoke('list')).resolves.toEqual(expect.any(Array))
  const observation = await f.ctx.sessionQuery.observeSession(SessionId('synthetic-complete-old-studio'))
  try {
    expect(observation.projections.values.eleckoiCreatorStudio).toEqual({ presetId: 'agent-preset-creator', characterId: '' })
  } finally { observation[Symbol.dispose]() }
  const complete = await f.ctx.sessionPersistence.open(SessionId('synthetic-complete-old-studio'), 'read')
  try {
    const log = await complete.read()
    expect(log.events.findLast(event => event.type === 'agent-preset/selected').data.agentPreset).toBe('eleckoi-creator-active')
    expect(log.events.find(event => event.type === CREATOR_STUDIO_EVENT).data).toEqual({ presetId: 'agent-preset-creator', characterId: '' })
    const restored = Session.fromRestore(complete.id, log.events, complete.header, complete.inheritedEventCount, log.eventState, f.ctx.sessions.messageProjections)
    expect(restored.deriveMessages()[0].content).toEqual([{ type: 'image', attachment: image, offloaded: true }])
  } finally { await complete.close() }
  const interrupted = await f.ctx.sessionPersistence.open(SessionId('synthetic-interrupted-old-studio'), 'read')
  try {
    const log = await interrupted.read()
    expect(log.events.some(event => event.type === CREATOR_STUDIO_EVENT)).toBe(false)
    expect(log.events.findLast(event => event.type === 'agent-preset/selected')?.data.agentPreset ?? interrupted.header.agentPreset).toBe(legacyId)
  } finally { await interrupted.close() }
  expect(readFileSync(join(directory, 'preset.json'), 'utf8')).toBe(generated)
  expect(readFileSync(join(unreadableDirectory, 'preset.json'), 'utf8')).toBe('{')
  await expect(invoke('open', { sessionId: 'synthetic-interrupted-old-studio' })).rejects.toMatchObject({ code: 'eleckoi/lookup/not-found' })
}, 120_000)

it.each(['desktop', 'android'])('%s exports original Remote causes through the shipped Host logger before wire folding', async platform => {
  const root = mkdtempSync(join(tmpdir(), 'eleckoi-host-root-diagnostic-'))
  cleanups.push(() => rm(root, { recursive: true, force: true, maxRetries: 3 }))
  const f = await start(platform, root), ctx = f.ctx
  const output = []
  const write = vi.spyOn(process.stderr, 'write').mockImplementation(text => { output.push(String(text)); return true })
  const previous = ctx.eleckoiCreatorStudioRuntime.list
  const peer = ownerPeer(ctx)
  const cause = Object.assign(new Error('Synthetic Remote original storage cause'), { code: 'SYNTHETIC_STORAGE', details: { endpoint: 'synthetic/storage' } })
  const failure = new Error('Synthetic Remote outer failure', { cause })
  ctx.eleckoiCreatorStudioRuntime.list = async () => { throw failure }
  try {
    await expect(ctx.typertGateway.invoke({ peer, namespace: 'eleckoiCreatorStudioSessions', method: 'list', args: {} })).rejects.toBe(failure)
    expect(output.join('')).toContain('Synthetic Remote original storage cause')
    output.length = 0
    const reply = await ctx.typertGateway.dispatchRpc('eleckoiCreatorStudioSessions/list', { args: {} }, new AbortController().signal, peer)
    expect(reply).toEqual({ ok: false, error: { code: 'gateway/internal', message: 'Synthetic Remote outer failure', details: {} } })
    expect(output.join('')).toContain('Synthetic Remote original storage cause')
    expect(output.join('')).toContain('SYNTHETIC_STORAGE')
    expect(output.join('')).toContain('deepseek-web-profile.test.js')
    expect(output.join('')).toContain('eleckoiCreatorStudioSessions/list')
    output.length = 0
    expect(ctx.typertGateway.wireStream.failure(failure).code).toBe('gateway/internal')
    expect(output.join('')).toContain('Synthetic Remote original storage cause')
  } finally {
    ctx.eleckoiCreatorStudioRuntime.list = previous
    write.mockRestore(); peer.dispose()
  }
}, 120_000)

it.each(['desktop', 'android'])('%s keeps Studio open and permits a model switch after its saved provider is removed', async platform => {
  const root = mkdtempSync(join(tmpdir(), 'eleckoi-studio-removed-model-'))
  cleanups.push(() => rm(root, { recursive: true, force: true, maxRetries: 3 }))
  let f = await start(platform, root), requests = []
  class Adapter extends LlmAdapter {
    async resolveModel(provider, id) { return { provider, id, name: id, context: { contextWindow: 1000000 }, defaultMaxTokens: 8192 } }
    async listModels(provider) { return [await this.resolveModel(provider, 'synthetic-model')] }
    async *stream(request) {
      requests.push(request)
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: 'Synthetic replacement model reply' } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
  }
  const oldSelection = { provider: 'synthetic-removed-provider', model: 'synthetic-model' }
  const replacement = { provider: 'synthetic-replacement-provider', model: 'synthetic-model' }
  const providerSettings = async ops => {
    const row = f.ctx.settings.describe().find(row => row.ns === 'llm-pi-ai')
    await f.ctx.settings.mutate(row.ns, ops, row.revision)
    await f.ctx.loader.await()
  }
  await providerSettings([{ op: 'set', path: ['providers', oldSelection.provider], value: {
    api: 'openai-completions', baseURL: 'https://synthetic.invalid/v1',
    models: [{ id: oldSelection.model, name: 'Synthetic removed model', contextWindow: 1000000, maxTokens: 8192 }],
  } }])
  f.ctx.llm.registerAdapter([replacement.provider], new Adapter())
  await f.ctx.agentDefaultModel.saveSelection(oldSelection)
  const studio = await f.ctx.eleckoiCreatorStudioRuntime.create('')
  await f.ctx.sessionController.selectModel({ sessionId: studio.sessionId, ...oldSelection })
  // Same namespace/path operation as the official provider delete command.
  await providerSettings([{ op: 'unset', path: ['providers', oldSelection.provider] }])
  await expect(f.ctx.llm.resolveModelInfo(oldSelection.provider, oldSelection.model)).rejects.toThrow('no adapter registered')
  await expect(f.ctx.eleckoiCreatorStudioRuntime.open(studio.sessionId)).resolves.toMatchObject({ sessionId: studio.sessionId })
  const blank = await f.ctx.eleckoiCreatorStudioRuntime.create('')
  expect(f.ctx.agentDefaultModel.currentSelection()).toMatchObject(oldSelection)
  const staleAgent = (await f.ctx.sessionController.resolveAgent(studio.sessionId)).agent
  expect(staleAgent.model.current()).toMatchObject(oldSelection)
  staleAgent.followup(createUserMessage({ content: [{ type: 'text', text: 'Synthetic unavailable model request' }], source: { kind: 'user' } }))
  await staleAgent.whenIdle()
  expect(staleAgent.session.snapshotEvents().findLast(event => event.type === 'turn/end').data.reason).toMatchObject({ kind: 'error', error: { message: expect.stringContaining('no adapter registered') } })
  expect(requests).toHaveLength(0)
  await f.close()
  f = await start(platform, root)
  f.ctx.llm.registerAdapter([replacement.provider], new Adapter())
  await expect(f.ctx.eleckoiCreatorStudioRuntime.open(studio.sessionId)).resolves.toMatchObject({ sessionId: studio.sessionId })
  await expect(f.ctx.eleckoiCreatorStudioRuntime.open(blank.sessionId)).resolves.toMatchObject({ sessionId: blank.sessionId })
  const before = (await f.ctx.sessionController.list({})).items.map(item => item.sessionId).sort()
  for (const sessionId of [studio.sessionId, blank.sessionId]) {
    await f.ctx.sessionController.selectModel({ sessionId, ...replacement })
    const { agent } = await f.ctx.sessionController.resolveAgent(sessionId)
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Synthetic replacement request' }], source: { kind: 'user' } }))
    await agent.whenIdle()
    expect(agent.session.snapshotEvents().findLast(event => event.type === 'turn/end').data.reason).toEqual({ kind: 'completed' })
    expect(agent.model.current()).toMatchObject(replacement)
  }
  expect(requests).toHaveLength(2)
  expect(requests.every(request => request.provider === replacement.provider)).toBe(true)
  expect((await f.ctx.sessionController.list({})).items.map(item => item.sessionId).sort()).toEqual(before)
}, 120_000)

it.each(['desktop', 'android'])('%s keeps roleplay accessible after its saved provider is removed', async platform => {
  const root = mkdtempSync(join(tmpdir(), 'eleckoi-roleplay-removed-model-'))
  cleanups.push(() => rm(root, { recursive: true, force: true, maxRetries: 3 }))
  let f = await start(platform, root)
  const requests = []
  class Adapter extends LlmAdapter {
    async resolveModel(provider, id) { return { provider, id, name: id, context: { contextWindow: 1000000 }, defaultMaxTokens: 8192 } }
    async listModels(provider) { return [await this.resolveModel(provider, 'synthetic-model')] }
    async *stream(request) {
      requests.push(request)
      yield* streamRoleplayReply('Synthetic roleplay replacement reply', request)
    }
  }
  const previous = { provider: 'synthetic-removed-roleplay', model: 'synthetic-model' }
  const replacement = { provider: 'synthetic-replacement-roleplay', model: 'synthetic-model' }
  f.ctx.llm.registerAdapter([previous.provider], new Adapter())
  await f.ctx.agentDefaultModel.saveSelection(previous)
  const character = f.ctx.eleckoiProductData.createCharacter({ id: 'synthetic-model-removal-character', name: '合成模型切换角色' }).items[0]
  const chat = await f.ctx.eleckoiConversationsApi.create({ metadata: { characterId: character.id } })
  await f.ctx.eleckoiConversationModelsApi.select(chat.conversation.id, previous)
  const sessionId = f.ctx.eleckoiProductData.runtimeSessionId(chat.conversation.id)
  await f.ctx.eleckoiRoleplaySessions.preparePrompt(chat.conversation.id, '合成原模型的历史输入')
  const initialAgent = (await f.ctx.sessionController.resolveAgent(sessionId)).agent
  initialAgent.followup(createUserMessage({ content: [{ type: 'text', text: '合成原模型的历史输入' }], source: { kind: 'user' } }))
  await initialAgent.whenIdle()
  expect(initialAgent.session.snapshotEvents().findLast(event => event.type === 'turn/end').data.reason).toEqual({ kind: 'completed' })
  await f.ctx.eleckoiConversationLifecycle.drain(chat.conversation.id)
  requests.length = 0
  const history = (await readSessionInspection(f.ctx, sessionId)).events.filter(event => event.surfaceOp === 'append')
  await f.close()
  f = await start(platform, root)
  f.ctx.llm.registerAdapter([replacement.provider], new Adapter())
  await expect(f.ctx.eleckoiConversationModelsApi.current(chat.conversation.id)).resolves.toMatchObject(previous)
  await expect(f.ctx.eleckoiRoleplaySessions.prepareSessionAccess(chat.conversation.id)).resolves.toBe(sessionId)
  await expect(f.ctx.eleckoiRoleplaySessions.preparePrompt(chat.conversation.id, '合成失效模型请求')).rejects.toThrow('no adapter registered')
  expect(requests).toHaveLength(0)
  expect((await readSessionInspection(f.ctx, sessionId)).events.filter(event => event.surfaceOp === 'append')).toEqual(history)
  const blank = await f.ctx.eleckoiConversationsApi.create({ metadata: { characterId: character.id } })
  expect(f.ctx.agentDefaultModel.currentSelection()).toMatchObject(previous)
  for (const conversationId of [chat.conversation.id, blank.conversation.id]) {
    await f.ctx.eleckoiConversationModelsApi.select(conversationId, replacement)
    const runtimeSessionId = await f.ctx.eleckoiRoleplaySessions.preparePrompt(conversationId, '合成模型切换后继续')
    const { agent } = await f.ctx.sessionController.resolveAgent(runtimeSessionId)
    agent.followup(createUserMessage({ content: [{ type: 'text', text: '合成模型切换后继续' }], source: { kind: 'user' } }))
    await agent.whenIdle()
    expect(agent.session.snapshotEvents().findLast(event => event.type === 'turn/end').data.reason).toEqual({ kind: 'completed' })
    expect(agent.model.current()).toMatchObject(replacement)
    await f.ctx.eleckoiConversationLifecycle.drain(conversationId)
  }
  expect(requests).toHaveLength(2)
  expect(requests.every(request => request.provider === replacement.provider)).toBe(true)
}, 120_000)

it('desktop compacts image and text history after switching away from an unavailable provider', async () => {
  const root = mkdtempSync(join(tmpdir(), 'eleckoi-compaction-model-switch-'))
  cleanups.push(() => rm(root, { recursive: true, force: true, maxRetries: 3 }))
  const started = await start('desktop', root)
  let { ctx } = started
  const previous = { provider: 'synthetic-old-compaction', model: 'old-model', reasoningEffort: 'high' }
  const selected = { provider: 'synthetic-new-compaction', model: 'new-model' }
  const requests = []
  class Adapter extends LlmAdapter {
    async resolveModel(provider, id) {
      return { provider, id, name: id, inputModalities: ['text', 'image'], context: { contextWindow: 250000 }, defaultMaxTokens: 8192,
        ...(provider === previous.provider ? { reasoning: { efforts: [{ id: 'high', name: 'High' }] } } : {}) }
    }
    async listModels(provider) {
      return [await this.resolveModel(provider, provider === previous.provider ? previous.model : selected.model)]
    }
    async *stream(request) {
      requests.push(request)
      if (request.purpose === 'compaction') {
        yield { type: 'block-start', index: 0, blockType: 'text' }
        yield { type: 'block-end', index: 0, block: { type: 'text', text: 'Synthetic history summary.' } }
        yield { type: 'finish', reason: { kind: 'stop' } }
      } else yield* streamRoleplayReply('Synthetic reply.', request)
    }
  }
  ctx.llm.registerAdapter([previous.provider], new Adapter())
  ctx.llm.registerAdapter([selected.provider], new Adapter())
  await ctx.agentDefaultModel.saveSelection(previous)
  const character = ctx.eleckoiProductData.createCharacter({ id: 'synthetic-compaction-character', name: 'Synthetic character' }).items[0]
  const image = await ctx.attachments.saveImage({
    data: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'),
    mediaType: 'image/png',
  })
  const send = async (chat, text, attachment) => {
    await ctx.eleckoiRoleplaySessions.preparePrompt(chat.conversation.id, text)
    const { agent } = await ctx.sessionController.resolveAgent(chat.runtimeSessionId)
    agent.followup(createUserMessage({ source: { kind: 'user' }, content: [
      ...(attachment ? [{ type: 'image', attachment }] : []),
      { type: 'text', text },
    ] }))
    await agent.whenIdle()
    await ctx.eleckoiConversationLifecycle.drain(chat.conversation.id)
    expect(agent.session.snapshotEvents().findLast(event => event.type === 'turn/end')?.data.reason).toEqual({ kind: 'completed' })
    return agent
  }
  const makeHistory = async (text, attachment) => {
    const chat = await ctx.eleckoiConversationsApi.create({ metadata: { characterId: character.id } })
    await ctx.eleckoiConversationModelsApi.select(chat.conversation.id, previous)
    return { ...chat, agent: await send(chat, text, attachment) }
  }
  const compact = async agent => (await ctx.commands.execute(agent, '/compact', [], new AbortController().signal)).result
  const imageBlocks = request => request.messages.flatMap(message => message.content.filter(block => block.type === 'image'))
  const summaryEvents = agent => agent.session.snapshotEvents().filter(event => event.type === 'compaction/summary')

  const control = await makeHistory('A history with a live previous provider. '.repeat(60), image)
  await send(control, 'One more message before compaction.')
  await ctx.eleckoiConversationModelsApi.select(control.conversation.id, selected)
  expect((await compact(control.agent)).kind).toBe('success')
  expect(requests.at(-1)).toMatchObject({ purpose: 'compaction', provider: previous.provider, model: previous.model, reasoningEffort: 'high' })
  expect(imageBlocks(requests.at(-1))).toEqual([{ type: 'image', attachment: image }])
  expect(requests.at(-1).messages.filter(message => message.source?.kind === 'plugin:eleckoi-product-history')).toEqual([
    expect.objectContaining({ role: 'assistant', content: [{ type: 'text', text: 'Synthetic reply.' }] }),
  ])
  expect(requests.at(-1).messages.some(message => message.role === 'tool'
    || message.content.some(block => block.type === 'tool-call'))).toBe(false)
  await send(control, 'Continue from the retained reply.')
  const continued = requests.at(-1).messages
  expect(continued.filter(message => message.source?.kind === 'plugin:eleckoi-product-history')).toEqual([
    expect.objectContaining({ role: 'assistant', content: [{ type: 'text', text: 'Synthetic reply.' }] }),
  ])
  expect(JSON.stringify(continued)).toContain('Synthetic history summary.')

  const imageChat = await makeHistory('An earlier chat message with an image. '.repeat(60), image)
  const textChat = await makeHistory('An earlier text-only chat message. '.repeat(60))
  const automatic = await makeHistory('A village keeps a detailed history of its harvests and traditions. '.repeat(1800), image)
  await started.close()
  ctx = (await start('desktop', root)).ctx
  ctx.llm.registerAdapter([selected.provider], new Adapter())
  await expect(ctx.llm.resolveModelInfo(previous.provider, previous.model)).rejects.toThrow('no adapter registered')

  const { agent: unselected } = await ctx.sessionController.resolveAgent(textChat.runtimeSessionId)
  const unchangedHistory = unselected.session.deriveMessages()
  expect((await compact(unselected)).kind).toBe('error')
  expect(unselected.session.deriveMessages()).toEqual(unchangedHistory)
  expect(summaryEvents(unselected)).toEqual([])

  for (const chat of [imageChat, textChat]) {
    const { agent } = await ctx.sessionController.resolveAgent(chat.runtimeSessionId)
    await ctx.eleckoiConversationModelsApi.select(chat.conversation.id, selected)
    expect(agent.session.requestHeader()?.config.provider).toBe(previous.provider)
    expect((await compact(agent)).kind).toBe('success')
    const request = requests.at(-1)
    expect(request).toMatchObject({ purpose: 'compaction', ...selected })
    expect(request.reasoningEffort).toBeUndefined()
    expect(imageBlocks(request)).toEqual(chat === imageChat ? [{ type: 'image', attachment: image }] : [])
    expect(summaryEvents(agent).map(event => event.data)).toEqual([expect.objectContaining(selected)])
    expect(agent.session.requestHeader()?.config.provider).toBe(previous.provider)
    const inspection = await readSessionInspection(ctx, chat.runtimeSessionId)
    expect(inspection.events.find(event => event.type === 'compaction/summary')?.data).toMatchObject(selected)
  }

  await ctx.eleckoiConversationModelsApi.select(automatic.conversation.id, selected)
  const parameters = await ctx.eleckoiConversationModelsApi.parameters(automatic.runtimeSessionId)
  await ctx.eleckoiConversationModelsApi.saveParameters(automatic.runtimeSessionId, selected.provider, selected.model, { autoCompactTokenLimit: 12000 }, parameters.revision)
  const before = requests.length
  const agent = await send(automatic, 'Continue from the long image history.')
  expect(requests.slice(before).map(request => [request.purpose, request.provider])).toEqual([
    ['compaction', selected.provider],
    [undefined, selected.provider],
  ])
  expect(imageBlocks(requests[before])).toEqual([{ type: 'image', attachment: image }])
  expect(JSON.stringify(requests[before + 1].messages)).toContain('Synthetic history summary.')
  expect(summaryEvents(agent).map(event => event.data)).toEqual([expect.objectContaining(selected)])
  expect(agent.session.requestHeader()?.config).toMatchObject(selected)
}, 120_000)

async function start(platform, root, legacySelection = false) {
  const resources = resolve('apps/desktop/resources/dsh')
  const paths = { runtimeDataRoot: root, homeRoot: join(root, 'home'), workspaceRoot: join(root, 'workspace'),
    productDatabasePath: join(root, 'product.sqlite'), productMediaRoot: join(root, 'media'), resourceRoot: resources,
    presetTemplatePath: join(resources, 'agent-preset-template/agent.cordis.yml'), agentPatchPath: join(resources, 'desktop-agent.patch.yml') }
  const prepared = preparePluginHost(paths)
  const profileDirectory = platform === 'android' ? prepared.profileDirectory : join(paths.homeRoot, 'profiles/desktop')
  if (platform === 'desktop') initProfile(profileDirectory, [...PROFILE_TEMPLATES.web.bundles, ...ELECKOI_DESKTOP_BUNDLES, '@eleckoi/dsh-web-search-tavily'])
  const previous = Object.fromEntries(Object.keys(prepared.environment).map(key => [key, process.env[key]]))
  Object.assign(process.env, prepared.environment)
  cleanups.push(() => { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value } })
  if (legacySelection) writeFileSync(join(profileDirectory, 'cordis.patch.yml'), JSON.stringify([
    { id: 'web', config: { searchProvider: 'eleckoi-deepseek-api', fetchProvider: 'eleckoi-deepseek-api' } },
    { id: 'web-deepseek-api', config: { count: 37, searchApiKeyEnv: 'SYNTHETIC_OFFICIAL_KEY' } }
  ]))
  await retireDeepSeekExtensionSelection(profileDirectory)
  const installAnchor = platform === 'android' ? ANDROID_INSTALL_ANCHOR : ELECKOI_INSTALL_ANCHOR
  const profile = loadProfileDirectory('dsh', profileDirectory, installAnchor)
  expect(profile.skippedBundles).toEqual([])
  const overlay = join(profileDirectory, 'eleckoi-plugin-host.patch.yml')
  if (platform === 'desktop') writeFileSync(overlay, JSON.stringify([
    { id: 'session-persistence-jsonl', config: { root: join(root, 'sessions'), compression: 'none' } },
    ...['desktop-product-telemetry', 'product-analytics', 'ui-layout', 'ui-sidebar', 'ui-settings-general', 'ui-settings-models'].map(id => ({ id, disabled: true }))
  ]))
  const running = await runProfile({ environment: loadLayeredEnv('dsh'), profile: platform, resolvedProfile: { profile, installAnchor },
    patchFiles: platform === 'android' ? prepared.patchFiles : [overlay, paths.agentPatchPath], args: ['--no-open', '--port', '0'] })
  expect(running.ctx.get('schedule') !== undefined).toBe(true)
  expect(running.ctx.configEditor.entries().find(entry => entry.options.id === 'ui-schedule')?.options.disabled).not.toBe(true)
  await running.ctx.loader.await()
  let closing
  const close = () => {
    if (closing) return closing
    // Keep the in-process teardown in the same queue as profile reloads.
    const hmr = running.ctx.get('hmr')
    closing = hmr ? hmr.runExclusive(() => running.ctx.fiber.dispose()) : Promise.resolve(running.ctx.fiber.dispose())
    return closing
  }
  cleanups.push(close)
  return { ...running, profileDirectory, close }
}

it.each(['desktop', 'android'])('%s keeps Studio commands available after failed requests and model changes in the actual profile', async platform => {
  const root = mkdtempSync(join(tmpdir(), 'eleckoi-studio-recovery-'))
  cleanups.push(() => rm(root, { recursive: true, force: true, maxRetries: 3 }))
  const f = await start(platform, root), ctx = f.ctx
  const failures = []
  ctx.on('agent/error', payload => { failures.push(payload.error?.stack ?? String(payload.error)) })
  let fail = true
  class Adapter extends LlmAdapter {
    async resolveModel(provider, id) { return { provider, id, name: id, context: { contextWindow: 1000000 }, defaultMaxTokens: 8192 } }
    async listModels(provider) { return Promise.all(['synthetic-first', 'synthetic-second'].map(id => this.resolveModel(provider, id))) }
    async *stream(options) {
      if (fail) readFileSync(join(root, 'session-snapshots', `${options.sessionId}.json`), 'utf8')
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: 'Synthetic recovered Studio reply' }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: 'Synthetic recovered Studio reply' } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
  }
  ctx.llm.registerAdapter(['synthetic-studio-recovery'], new Adapter())
  await ctx.agentDefaultModel.saveSelection({ provider: 'synthetic-studio-recovery', model: 'synthetic-first' })
  const data = ctx.eleckoiProductData
  const character = data.createCharacter({ id: 'synthetic-recovery-character', name: '合成恢复角色' }).items[0]
  const preset = data.readAgentPreset(data.readAgentPresetCatalog().activePresetIds.roleplay)
  data.saveAgentPreset({ ...preset, toolModelConfigIds: { ...preset.toolModelConfigIds, 'builtin:auto-illustration': 'synthetic-image' },
    toolGroups: preset.toolGroups.map(group => group.id === 'builtin:auto-illustration' ? { ...group, enabled: true, included: true } : group) }, preset.regexRules)
  const chat = await ctx.eleckoiConversationsApi.create({ metadata: { characterId: character.id } })
  const roleplayId = await ctx.eleckoiRoleplaySessions.preparePrompt(chat.conversation.id, '合成角色场景')
  const roleplay = await ctx.sessionController.resolveAgent(roleplayId)
  if ('error' in roleplay) throw roleplay.error
  let studio = await ctx.eleckoiCreatorStudioRuntime.create('')
  const failedId = studio.sessionId
  const resolved = await ctx.sessionController.resolveAgent(failedId)
  if ('error' in resolved) throw resolved.error
  let { agent } = resolved
  agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Synthetic failed request' }], source: { kind: 'user' } }))
  await agent.whenIdle()
  expect(agent.status).toBe('idle')
  const failure = agent.session.snapshotEvents().findLast(event => event.type === 'turn/end').data.reason
  expect(failure).toMatchObject({ kind: 'error', error: { message: expect.stringContaining('ENOENT') } })
  expect(failure.error.message).toContain(`${failedId}.json`)
  await ctx.eleckoiCreatorStudioRuntime.delete(failedId)
  expect(ctx.agents.get(failedId)).toBeUndefined()
  expect((await ctx.eleckoiCreatorStudioRuntime.list()).some(item => item.sessionId === failedId)).toBe(false)
  const isolated = await ctx.eleckoiCreatorStudioRuntime.create('')
  await ctx.eleckoiCreatorStudioRuntime.rename(isolated.sessionId, '合成独立对话')
  await ctx.eleckoiCreatorStudioRuntime.delete(isolated.sessionId)
  expect((await ctx.eleckoiCreatorStudioRuntime.list()).some(item => item.sessionId === isolated.sessionId)).toBe(false)
  fail = false
  studio = await ctx.eleckoiCreatorStudioRuntime.create('')
  agent = (await ctx.sessionController.resolveAgent(studio.sessionId)).agent
  expect(existsSync(join(root, 'session-snapshots', `${studio.sessionId}.json`))).toBe(false)
  await ctx.sessionController.selectModel({ sessionId: studio.sessionId, provider: 'synthetic-studio-recovery', model: 'synthetic-second' })
  const beforeOpen = (await ctx.sessionController.list({})).items.map(item => item.sessionId).sort()
  await ctx.eleckoiCreatorStudioRuntime.open(studio.sessionId)
  expect((await ctx.sessionController.list({})).items.map(item => item.sessionId).sort()).toEqual(beforeOpen)
  agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Synthetic recovery request' }], source: { kind: 'user' } }))
  await agent.whenIdle()
  const outcome = agent.session.snapshotEvents().findLast(event => event.type === 'turn/end').data.reason
  expect(outcome.kind, JSON.stringify({ outcome, failures })).toBe('completed')
  const next = await ctx.eleckoiCreatorStudioRuntime.create('')
  expect(next.sessionId).not.toBe(studio.sessionId)
  await ctx.eleckoiCreatorStudioRuntime.delete(studio.sessionId)
  expect((await ctx.eleckoiCreatorStudioRuntime.list()).some(item => item.sessionId === studio.sessionId)).toBe(false)
  await f.close()
  const restarted = await start(platform, root)
  restarted.ctx.llm.registerAdapter(['synthetic-studio-recovery'], new Adapter())
  await restarted.ctx.eleckoiRoleplaySessions.preparePrompt(chat.conversation.id, '合成重开场景')
  const beforeRestartOpen = (await restarted.ctx.sessionController.list({})).items.map(item => item.sessionId).sort()
  await restarted.ctx.eleckoiCreatorStudioRuntime.open(next.sessionId)
  expect((await restarted.ctx.sessionController.list({})).items.map(item => item.sessionId).sort()).toEqual(beforeRestartOpen)
  const reopened = (await restarted.ctx.sessionController.resolveAgent(next.sessionId)).agent
  reopened.followup(createUserMessage({ content: [{ type: 'text', text: 'Synthetic request after Host restart' }], source: { kind: 'user' } }))
  await reopened.whenIdle()
  expect(reopened.session.snapshotEvents().findLast(event => event.type === 'turn/end').data.reason).toEqual({ kind: 'completed' })
  await restarted.ctx.eleckoiCreatorStudioRuntime.delete(next.sessionId)
  expect(await restarted.ctx.eleckoiCreatorStudioRuntime.list()).toEqual([])
}, 60_000)

it('desktop persists Messages selection from Tavily with the new API off after restart', async () => {
  const root = mkdtempSync(join(tmpdir(), 'eleckoi-web-messages-selection-'))
  cleanups.push(async () => {
    const child = relative(tmpdir(), root)
    if (!child || child.startsWith('..') || isAbsolute(child)) throw new Error('Unexpected cleanup target')
    await rm(root, { recursive: true, force: true, maxRetries: 3 })
  })
  const f = await start('desktop', root)
  const api = f.ctx.eleckoiWebSearchApi
  expect(api.selection()).toBe('automatic')
  expect(api.fetchSelection()).toBe('http')
  const apiConfig = f.ctx.settings.describe().find(item => item.ns === 'web-deepseek-api').value
  await api.select('tavily')
  expect(api.selection()).toBe('tavily')
  await api.select('provider_native')
  expect(api.selection()).toBe('provider_native')
  expect(api.fetchSelection()).toBe('http')
  await f.close()
  const reopened = await start('desktop', root)
  expect(reopened.ctx.eleckoiWebSearchApi.selection()).toBe('provider_native')
  expect(reopened.ctx.eleckoiWebSearchApi.fetchSelection()).toBe('http')
  expect(reopened.ctx.settings.describe().find(item => item.ns === 'web-deepseek-api').value).toEqual(apiConfig)
  await reopened.ctx.eleckoiWebSearchApi.select('automatic')
  expect(reopened.ctx.eleckoiWebSearchApi.selection()).toBe('automatic')
  await reopened.close()
  const reset = await start('desktop', root)
  expect(reset.ctx.eleckoiWebSearchApi.selection()).toBe('automatic')
  expect(reset.ctx.eleckoiWebSearchApi.fetchSelection()).toBe('http')
}, 60_000)

it.each(['desktop', 'android'])('%s loads both APIs through the shipped bundles, saves settings and executes in roleplay and studio', async platform => {
  const root = mkdtempSync(join(tmpdir(), 'eleckoi-web-profile-'))
  cleanups.push(async () => { const child = relative(tmpdir(), root); if (!child || child.startsWith('..') || isAbsolute(child)) throw new Error('Unexpected cleanup target'); await rm(root, { recursive: true, force: true }) })
  const f = await start(platform, root), { ctx } = f
  const api = ctx.eleckoiWebSearchApi
  expect(api.selection()).toBe('automatic')
  expect(api.fetchSelection()).toBe('http')
  expect(ctx.settings.describe().some(item => item.ns === 'eleckoi-web-deepseek')).toBe(false)
  expect(ctx.configEditor.entries().some(item => item.options.name === '@eleckoi/dsh-web-deepseek')).toBe(false)
  await expect(api.select('deepseek_api')).rejects.toThrow('不支持的联网搜索方式')
  await expect(api.selectFetch('deepseek_api')).rejects.toThrow('不支持的网页抓取方式')
  const credentials = vi.spyOn(ctx.credentials, 'resolve').mockResolvedValue({ value: 'synthetic-live-profile', source: 'test' })
  const credentialPresence = vi.spyOn(ctx.credentials, 'describe').mockResolvedValue({ configured: true })
  class Adapter extends LlmAdapter {
    async resolveModel(provider, id) { return { provider, id, name: id, context: { contextWindow: 1000000 }, defaultMaxTokens: 8192 } }
    async *stream() { yield { type: 'text', text: '合成响应' } }
  }
  ctx.llm.registerAdapter(['synthetic-web-profile'], new Adapter())
  await ctx.agentDefaultModel.saveSelection({ provider: 'synthetic-web-profile', model: 'synthetic-web-profile' })
  const data = ctx.eleckoiProductData, character = data.createCharacter({ id: 'web-profile-character', name: '合成角色' }).items[0]
  for (const summary of data.readAgentPresetCatalog().presets) {
    const preset = data.readAgentPreset(summary.id)
    data.saveAgentPreset({ ...preset, toolGroups: preset.toolGroups.map(group => group.id === 'builtin:web' ? { ...group, enabled: true, included: true } : group) }, preset.regexRules)
  }
  const chat = await ctx.eleckoiConversationsApi.create({ metadata: { characterId: character.id } })
  const roleplayId = await ctx.eleckoiRoleplaySessions.preparePrompt(chat.conversation.id, '合成联网请求')
  const roleplay = (await ctx.sessionController.resolveAgent(roleplayId)).agent
  const studio = await ctx.eleckoiCreatorStudioRuntime.create(character.id)
  const creator = (await ctx.sessionController.resolveAgent(studio.sessionId)).agent
  const calls = []
  vi.stubGlobal('fetch', vi.fn(async (url, init) => {
    if (String(url) === 'https://api.deepseek.com/anthropic/v1/messages') {
      return new Response(JSON.stringify({ content: [{
        type: 'web_search_tool_result',
        content: [{ type: 'web_search_result', url: 'https://example.com/server-search' }]
      }] }))
    }
    if (!String(url).startsWith('https://api.deepseek.com/v1/tools/')) throw new Error(`Unexpected request: ${url}`)
    calls.push({ url, input: JSON.parse(init.body), authorization: new Headers(init.headers).get('authorization') })
    return new Response(JSON.stringify(String(url).endsWith('/search') ? { results: Array.from({ length: 50 }, (_, index) => ({ title: `合成来源-${index}`, url: `https://example.com/${index}`, snippet: '片段', summary: '摘要', content: `来源正文末尾-${index}`, site_name: null, site_icon: null, date: null, authority: 0, rerank_score: 1 })) } : { title: '抓取标题', content: '合成抓取完整正文末尾' }), { status: 200 })
  }))
  const officialNamespace = ctx.settings.describe().find(item => item.ns === 'web-deepseek-api')
  expect(officialNamespace).toBeDefined()
  await ctx.settings.mutate(officialNamespace.ns, [{ op: 'set', path: ['count'], value: 50 }], officialNamespace.revision)
  const serverSearch = await ctx.web.search({ query: '合成服务端搜索', llmProvider: 'deepseek-official' })
  expect(serverSearch.sources).toEqual([{ url: 'https://example.com/server-search' }])
  await api.selectFetch('deepseek_fetch_api')
  expect(api.fetchSelection()).toBe('deepseek_fetch_api')
  let scheduledTaskId
  for (const agent of [roleplay, creator]) {
    // Direct fixture batches capture a route without starting a model step.
    agent.model.select({ provider: 'synthetic-web-profile', model: 'synthetic-web-profile' })
    expect(await ctx.web.searchReady('synthetic-web-profile')).toBe(true)
    expect(agent.ctx.tools.get('web_search', agent)).toBeDefined()
    for (const name of ['schedule_create', 'schedule_list', 'schedule_view', 'schedule_edit']) {
      if (agent === creator) expect(agent.ctx.tools.get(name, agent)).toBeDefined()
      else expect(agent.ctx.tools.get(name, agent)).toBeUndefined()
    }
    const search = await executeToolCall(agent.ctx.tools, { callId: 'synthetic-official-search', name: 'web_search', arguments: { queries: ['合成官方搜索'] }, agent, signal: new AbortController().signal })
    expect(search.isError, JSON.stringify(search)).not.toBe(true)
    const resultCount = agent === roleplay ? 50 : 8
    expect(JSON.stringify(search.content)).toContain(`https://example.com/${resultCount - 1}`)
    expect(JSON.stringify(search.content)).not.toContain(`https://example.com/${resultCount}"`)
    const fetched = await executeToolCall(agent.ctx.tools, { callId: 'synthetic-official-fetch', name: 'web_fetch', arguments: { url: 'https://example.com' }, agent, signal: new AbortController().signal })
    expect(fetched.isError).not.toBe(true)
    expect(JSON.stringify(fetched.content)).toContain('合成抓取完整正文末尾')
    if (agent === creator) {
      const call = (name, args) => executeToolCall(agent.ctx.tools, { callId: `synthetic-${name}`, name,
        arguments: args, agent, signal: new AbortController().signal })
      const scheduledAt = new Date(Date.now() + 3_600_000).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
      const created = await call('schedule_create', { title: '合成创作任务', prompt: 'Synthetic scheduled instruction',
        rrule: `DTSTART:${scheduledAt}\nRRULE:FREQ=DAILY;COUNT=1`, target: 'this_session' })
      expect(created.isError, JSON.stringify(created)).not.toBe(true)
      const task = (await ctx.schedule.list({})).items.find(item => item.title === '合成创作任务')
      expect(task).toMatchObject({ status: 'active', target: { kind: 'session', sessionId: creator.id } })
      scheduledTaskId = task.id
      const paused = await call('schedule_edit', { id: task.id, action: 'update', active: false })
      expect(paused.isError, JSON.stringify(paused)).not.toBe(true)
    }
  }
  expect(calls).toHaveLength(4)
  expect(calls.every(call => call.authorization === 'Bearer synthetic-live-profile')).toBe(true)
  expect(calls.filter(call => call.url.endsWith('/search')).map(call => call.input.count)).toEqual([50, DEEPSEEK_DEFAULT_COUNT])
  expect(calls.filter(call => call.url.endsWith('/search')).every(call => call.input.need_content === false)).toBe(true)
  await api.select('deepseek_search_api')
  expect(api.selection()).toBe('deepseek_search_api')
  credentials.mockRestore()
  credentialPresence.mockRestore()
  vi.unstubAllGlobals()
  await f.close()
  const reopened = await start(platform, root)
  expect(reopened.ctx.eleckoiWebSearchApi.selection()).toBe('deepseek_search_api')
  expect(reopened.ctx.eleckoiWebSearchApi.fetchSelection()).toBe('deepseek_fetch_api')
  expect(reopened.ctx.settings.describe().find(item => item.ns === 'web-deepseek-api').value).toMatchObject({ count: 50 })
  expect((await reopened.ctx.schedule.list({})).items.find(item => item.id === scheduledTaskId)).toMatchObject({
    title: '合成创作任务', status: 'paused', prompt: 'Synthetic scheduled instruction' })
}, 30000)

it.each(['desktop', 'android'])('%s retires saved extension selections and preserves official settings after restart', async platform => {
  const root = mkdtempSync(join(tmpdir(), 'eleckoi-web-retirement-'))
  cleanups.push(() => rm(root, { recursive: true, force: true, maxRetries: 3 }))
  const f = await start(platform, root, true)
  expect(f.ctx.eleckoiWebSearchApi.selection()).toBe('deepseek_search_api')
  expect(f.ctx.eleckoiWebSearchApi.fetchSelection()).toBe('deepseek_fetch_api')
  expect(f.ctx.settings.describe().find(item => item.ns === 'web-deepseek-api').value).toMatchObject({ count: 37, searchApiKeyEnv: 'SYNTHETIC_OFFICIAL_KEY' })
  expect(readFileSync(join(f.profileDirectory, 'cordis.patch.yml'), 'utf8')).not.toContain('eleckoi-deepseek-api')
  await f.close()
  const reopened = await start(platform, root)
  expect(reopened.ctx.eleckoiWebSearchApi.selection()).toBe('deepseek_search_api')
  expect(reopened.ctx.eleckoiWebSearchApi.fetchSelection()).toBe('deepseek_fetch_api')
  expect(reopened.ctx.settings.describe().find(item => item.ns === 'web-deepseek-api').value).toMatchObject({ count: 37, searchApiKeyEnv: 'SYNTHETIC_OFFICIAL_KEY' })
}, 30_000)
