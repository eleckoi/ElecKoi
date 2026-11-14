import { DEEPSEEK_DEFAULT_COUNT } from '@deepseek-ai/dsh-web-deepseek-api'
import { readSessionInspection } from '@eleckoi/dsh-product-api'
import { executeToolCall } from '../helpers/tool-call.js'
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
import { ownerPeer } from '../support/owner-peer.js'
import { Session, SessionId, SESSION_FORMAT_VERSION } from '@deepseek-ai/dsh-session'
import { CREATOR_STUDIO_EVENT } from '../../packages/client/features/dsh-client-creator-studio/src/host/projection.mjs'

const cleanups = []
afterEach(async () => { vi.unstubAllGlobals(); for (const stop of cleanups.splice(0).reverse()) await stop() }, 30000)

it.each(['desktop', 'android'])('%s keeps associated variable configuration live and continues chatting after it is removed', async platform => {
  const root = mkdtempSync(join(tmpdir(), 'eleckoi-live-variable-profile-'))
  cleanups.push(() => rm(root, { recursive: true, force: true, maxRetries: 3 }))
  let f = await start(platform, root), ctx = f.ctx, holdReply
  class Adapter extends LlmAdapter {
    async resolveModel(provider, id) { return { provider, id, name: id, context: { contextWindow: 1000000 }, defaultMaxTokens: 8192 } }
    async listModels(provider) { return [await this.resolveModel(provider, 'synthetic-variable-model')] }
    async *stream() {
      if (holdReply) await holdReply
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: 'Synthetic continued reply' }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: 'Synthetic continued reply' } }
      yield { type: 'finish', reason: { kind: 'stop' } }
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
  class Adapter extends LlmAdapter {
    async resolveModel(provider, id) { return { provider, id, name: id, context: { contextWindow: 1000000 }, defaultMaxTokens: 8192 } }
    async listModels(provider) { return [await this.resolveModel(provider, 'synthetic-removal-model')] }
    async *stream(options) {
      const calls = [
        ['eleckoi_glob_variables', {}],
        ['eleckoi_read_variables', { paths: ['/status'] }],
        ['eleckoi_apply_variable_patch', { operations: [{ op: 'insert', path: '/status/newRuntime', value: 12 }] }],
      ]
      const current = step++
      if (current > 0 && current <= calls.length) {
        const result = options.messages.findLast(item => item.role === 'tool')
        const value = JSON.parse(result.content.filter(item => item.type === 'text').map(item => item.text).join(''))
        expect(JSON.stringify(value)).not.toContain('retired-profile-needle')
        if (current === 1) {
          expect(value.paths).not.toContain('/status/coins')
          expect(value.paths).toContain('/status/runtime')
        } else if (current === 2) {
          expect(value.variables[0].current.entries.map(item => item.key)).toEqual(['runtime'])
        } else expect(value.status).toBe('ok')
      }
      if (current < calls.length) {
        const [name, args] = calls[current], id = `synthetic-removal-${current}`
        yield { type: 'block-start', index: 0, blockType: 'tool-call' }
        yield { type: 'tool-call-delta', index: 0, id, name, argumentsDelta: JSON.stringify(args) }
        yield { type: 'block-end', index: 0, block: { type: 'tool-call', id, name, arguments: JSON.stringify(args) } }
        yield { type: 'finish', reason: { kind: 'tool-calls' } }
      } else {
        yield { type: 'block-start', index: 0, blockType: 'text' }
        yield { type: 'text-delta', index: 0, text: 'Synthetic updated reply' }
        yield { type: 'block-end', index: 0, block: { type: 'text', text: 'Synthetic updated reply' } }
        yield { type: 'finish', reason: { kind: 'stop' } }
      }
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
    ['builtin:workspace', ['read', 'edit', 'write', 'bash', 'pwsh', 'working_directory']],
    ['builtin:workflow', ['todo_write', 'job_output', 'schedule_create', 'get_goal', 'create_goal', 'workflow']],
    ['builtin:collaboration', ['subagent', 'subagent_fork', 'send_message', 'list_agents']],
    ['builtin:web', ['web_search', 'web_fetch']],
    ['builtin:plugin-discovery', ['plugin_manager', 'plugin_market']],
    ['builtin:creator', ['eleckoi_list_toolsets', 'eleckoi_describe_toolset', 'eleckoi_call_capability']],
  ])
  for (const blocked of [...blockedTools.keys()].map(id => [id]).concat([[...blockedTools.keys()]])) {
    const current = ctx.eleckoiProductData.readAgentPreset(preset.id)
    const saved = ctx.eleckoiProductData.saveAgentPreset({ ...current, toolGroups: preset.toolGroups.map(group => blocked.includes(group.id)
      ? { ...group, included: true, enabled: false } : group) }, current.regexRules)
    const studio = await ctx.typertGateway.invoke({ peer: ownerPeer(ctx), namespace: 'eleckoiCreatorStudioSessions', method: 'create', args: { characterId: '' } })
    const resolved = await ctx.sessionController.resolveAgent(studio.sessionId)
    if ('error' in resolved) throw resolved.error
    resolved.agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Synthetic tool switch request' }], source: { kind: 'user' } }))
    await resolved.agent.whenIdle()
    expect(resolved.agent.session.snapshotEvents().findLast(event => event.type === 'turn/end').data.reason).toEqual({ kind: 'completed' })
    const tools = requests.at(-1).tools.map(tool => tool.name)
    for (const id of blocked) for (const name of blockedTools.get(id)) expect(tools, id).not.toContain(name)
    expect((await list()).some(item => item.sessionId === studio.sessionId)).toBe(true)
    expect(ctx.eleckoiProductData.readAgentPreset(preset.id)).toEqual(saved)
  }
  expect(requests).toHaveLength(7)
  const disabledPreset = ctx.eleckoiProductData.readAgentPreset(preset.id)
  await f.close()
  const reopened = await start(platform, root)
  expect(reopened.ctx.eleckoiProductData.readAgentPreset(preset.id)).toEqual(disabledPreset)
  const catalog = await reopened.ctx.typertGateway.invoke({ peer: ownerPeer(reopened.ctx), namespace: 'eleckoiCreatorStudioSessions', method: 'list', args: {} })
  expect(catalog).toHaveLength(7)
}, 120_000)

it.each(['desktop', 'android'])('%s reports an invalid Creator preset without losing the Studio API and recovers after a preset correction', async platform => {
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
  const configurationError = {
    code: 'eleckoi/state/precondition',
    message: '创作预设中的角色对话工具不适用于 AI 创作工作室，请使用创作能力。',
  }
  await expect(invoke('create', { characterId: '' })).rejects.toMatchObject(configurationError)
  await expect(invoke('open', { sessionId: existing.sessionId })).rejects.toMatchObject(configurationError)
  const invalid = ctx.eleckoiProductData.readAgentPreset(preset.id)
  ctx.eleckoiProductData.saveAgentPreset({ ...invalid, toolGroups: preset.toolGroups }, invalid.regexRules)
  expect(await invoke('open', { sessionId: existing.sessionId })).toMatchObject({ sessionId: existing.sessionId })
  const created = await invoke('create', { characterId: '' })
  expect((await invoke('list')).map(item => item.sessionId).sort()).toEqual([existing.sessionId, created.sessionId].sort())
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
  for (const complete of [true, false]) {
    const id = SessionId(complete ? 'synthetic-complete-old-studio' : 'synthetic-interrupted-old-studio')
    const header = { id, version: SESSION_FORMAT_VERSION, createdAt: 1, isSeeded: false, cwd: join(root, 'workspace'), agentPreset: legacyId }
    const handle = await f.ctx.sessionPersistence.create(header)
    try {
      const session = Session.create(id, [], header)
      if (complete) session.append(CREATOR_STUDIO_EVENT, { presetId: 'agent-preset-creator', characterId: '' }, { ignorable: true })
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
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: 'Synthetic roleplay replacement reply' } }
      yield { type: 'finish', reason: { kind: 'stop' } }
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
  expect(api.selection()).toBe('provider_native')
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
}, 60_000)

it.each(['desktop', 'android'])('%s loads both APIs through the shipped bundles, saves settings and executes in roleplay and studio', async platform => {
  const root = mkdtempSync(join(tmpdir(), 'eleckoi-web-profile-'))
  cleanups.push(async () => { const child = relative(tmpdir(), root); if (!child || child.startsWith('..') || isAbsolute(child)) throw new Error('Unexpected cleanup target'); await rm(root, { recursive: true, force: true }) })
  const f = await start(platform, root), { ctx } = f
  const api = ctx.eleckoiWebSearchApi
  expect(api.selection()).toBe('provider_native')
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
    if (!String(url).startsWith('https://api.deepseek.com/v1/tools/')) throw new Error(`Unexpected request: ${url}`)
    calls.push({ url, input: JSON.parse(init.body), authorization: new Headers(init.headers).get('authorization') })
    return new Response(JSON.stringify(String(url).endsWith('/search') ? { results: Array.from({ length: 50 }, (_, index) => ({ title: `合成来源-${index}`, url: `https://example.com/${index}`, snippet: '片段', summary: '摘要', content: `来源正文末尾-${index}`, site_name: null, site_icon: null, date: null, authority: 0, rerank_score: 1 })) } : { title: '抓取标题', content: '合成抓取完整正文末尾' }), { status: 200 })
  }))
  const officialNamespace = ctx.settings.describe().find(item => item.ns === 'web-deepseek-api')
  expect(officialNamespace).toBeDefined()
  await ctx.settings.mutate(officialNamespace.ns, [{ op: 'set', path: ['count'], value: 50 }], officialNamespace.revision)
  await api.select('deepseek_search_api'); await api.selectFetch('deepseek_fetch_api')
  expect(api.selection()).toBe('deepseek_search_api'); expect(api.fetchSelection()).toBe('deepseek_fetch_api')
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
