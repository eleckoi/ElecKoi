import { retireDeepSeekExtensionSelection } from '@eleckoi/dsh-client-web-search/profile'
import Hmr from '@deepseek-ai/cordis-plugin-hmr'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, relative, isAbsolute } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { initProfile, loadLayeredEnv, loadProfileDirectory, PROFILE_TEMPLATES } from '@deepseek-ai/dsh-app-boot'
import { runProfile } from '@deepseek-ai/dsh/profile-boot'
import { LlmAdapter, createUserMessage } from '@deepseek-ai/dsh-llm'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { ELECKOI_DESKTOP_BUNDLES, ELECKOI_INSTALL_ANCHOR } from '../../apps/desktop-host/src/desktopPluginBundles'
import { preparePluginHost } from '../../apps/android-host/src/pluginHostConfiguration'
import { ELECKOI_INSTALL_ANCHOR as ANDROID_INSTALL_ANCHOR } from '../../apps/android-host/src/androidPluginBundles'

const cleanups = []
afterEach(async () => { vi.unstubAllGlobals(); for (const stop of cleanups.splice(0).reverse()) await stop() })

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
    await expect(ctx.sessionController.inspect(id)).rejects.toBeDefined()
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
    { id: 'web-deepseek-api', config: { count: 37, apiKeyEnv: 'SYNTHETIC_OFFICIAL_KEY' } }
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
  expect(running.ctx.get('schedule')).toBeUndefined()
  expect(running.ctx.configEditor.entries().find(entry => entry.options.id === 'ui-schedule')?.options.disabled).toBe(true)
  // The in-process fixture may close immediately after reopening. Wait for the
  // official watcher initialization before requesting its teardown.
  await Promise.all([...running.ctx.registry.get(Hmr)?.fibers ?? []].map(fiber => fiber.await()))
  let closing
  const close = () => closing ??= running.ctx.fiber.dispose()
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
  for (const agent of [roleplay, creator]) {
    for (const name of ['schedule_create', 'schedule_list', 'schedule_update', 'schedule_delete']) expect(agent.ctx.tools.get(name, agent)).toBeUndefined()
    const search = await agent.ctx.tools.execute({ callId: 'synthetic-official-search', name: 'web_search', arguments: { queries: ['合成官方搜索'] }, agent, signal: new AbortController().signal })
    expect(search.isError).not.toBe(true)
    const resultCount = agent === roleplay ? 50 : 8
    expect(JSON.stringify(search.content)).toContain(`https://example.com/${resultCount - 1}`)
    expect(JSON.stringify(search.content)).not.toContain(`https://example.com/${resultCount}"`)
    const fetched = await agent.ctx.tools.execute({ callId: 'synthetic-official-fetch', name: 'web_fetch', arguments: { url: 'https://example.com' }, agent, signal: new AbortController().signal })
    expect(fetched.isError).not.toBe(true)
    expect(JSON.stringify(fetched.content)).toContain('合成抓取完整正文末尾')
  }
  expect(calls).toHaveLength(4)
  expect(calls.every(call => call.authorization === 'Bearer synthetic-live-profile')).toBe(true)
  expect(calls.filter(call => call.url.endsWith('/search')).map(call => call.input.count)).toEqual([50, 8])
  expect(calls.filter(call => call.url.endsWith('/search')).every(call => call.input.need_content === false)).toBe(true)
  credentials.mockRestore()
  vi.unstubAllGlobals()
  await f.close()
  const reopened = await start(platform, root)
  expect(reopened.ctx.eleckoiWebSearchApi.selection()).toBe('deepseek_search_api')
  expect(reopened.ctx.eleckoiWebSearchApi.fetchSelection()).toBe('deepseek_fetch_api')
  expect(reopened.ctx.settings.describe().find(item => item.ns === 'web-deepseek-api').value).toMatchObject({ count: 50 })
}, 30000)

it.each(['desktop', 'android'])('%s retires saved extension selections and preserves official settings after restart', async platform => {
  const root = mkdtempSync(join(tmpdir(), 'eleckoi-web-retirement-'))
  cleanups.push(() => rm(root, { recursive: true, force: true, maxRetries: 3 }))
  const f = await start(platform, root, true)
  expect(f.ctx.eleckoiWebSearchApi.selection()).toBe('deepseek_search_api')
  expect(f.ctx.eleckoiWebSearchApi.fetchSelection()).toBe('deepseek_fetch_api')
  expect(f.ctx.settings.describe().find(item => item.ns === 'web-deepseek-api').value).toMatchObject({ count: 37, apiKeyEnv: 'SYNTHETIC_OFFICIAL_KEY' })
  expect(readFileSync(join(f.profileDirectory, 'cordis.patch.yml'), 'utf8')).not.toContain('eleckoi-deepseek-api')
  await f.close()
  const reopened = await start(platform, root)
  expect(reopened.ctx.eleckoiWebSearchApi.selection()).toBe('deepseek_search_api')
  expect(reopened.ctx.eleckoiWebSearchApi.fetchSelection()).toBe('deepseek_fetch_api')
  expect(reopened.ctx.settings.describe().find(item => item.ns === 'web-deepseek-api').value).toMatchObject({ count: 37, apiKeyEnv: 'SYNTHETIC_OFFICIAL_KEY' })
}, 30_000)
