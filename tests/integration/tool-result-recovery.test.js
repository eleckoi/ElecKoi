import { runtimeContextsFor } from '../helpers/runtime-contexts.js'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import WorkingDirectory from '@deepseek-ai/dsh-working-directory'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, { LlmAdapter, createUserMessage } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import Tools, { defineTool } from '@deepseek-ai/dsh-tools'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import * as spillPolicy from '@deepseek-ai/dsh-spill-policy'
import TokenMeter from '@deepseek-ai/dsh-token-meter'
import { PtcRuntime } from '@deepseek-ai/dsh-ptc-runtime'
import ToolResultStore from '../../packages/client/features/dsh-client-roleplay/src/host/tool-result-store.mjs'
import * as settingTools from '../../apps/desktop/resources/dsh/setting-library-tools.mjs'
import * as variableTools from '../../apps/desktop/resources/dsh/variable-tools.mjs'
import { ElecKoiVariableProcessing } from '../../packages/host/product-api/src/variable-processing.ts'
import { emptyEntry } from '../../packages/host/product-data/src/domain/settingLibraries/index'
import { RESULT_READERS, resultDomain } from '../../packages/client/features/dsh-client-roleplay/src/host/tool-result-access.mjs'
import { applyDisabledPolicy, filterDeclarations } from '../../packages/client/features/dsh-client-roleplay/src/host/tool-policy.mjs'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { composeEntries, initProfile, loadLayeredEnv, loadOverlayPatches, loadProfileDirectory, PROFILE_TEMPLATES } from '@deepseek-ai/dsh-app-boot'
import { runProfile } from '@deepseek-ai/dsh/profile-boot'
import { ELECKOI_DESKTOP_BUNDLES, ELECKOI_INSTALL_ANCHOR } from '../../apps/desktop-host/src/desktopPluginBundles'
import { preparePluginHost } from '../../apps/android-host/src/pluginHostConfiguration'
import { ELECKOI_INSTALL_ANCHOR as ANDROID_INSTALL_ANCHOR } from '../../apps/android-host/src/androidPluginBundles'
import { resolve } from 'node:path'
import { captureSerializedRequest } from '../helpers/captureModelRequest.js'

const RESULT_READER = RESULT_READERS.settings
const cleanups = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })

async function fixture({ root, sessionId = 'result-owner', stream } = {}) {
  if (!root) {
    root = mkdtempSync(join(tmpdir(), 'eleckoi-tool-results-'))
    cleanups.push(async () => { const child = relative(tmpdir(), root); if (!child || child.startsWith('..') || isAbsolute(child)) throw new Error('Unexpected cleanup path'); await rm(root, { recursive: true, force: true }) })
  }
  const ctx = new Context(), requests = []
  cleanups.push(() => ctx.fiber.dispose())
  ctx.provide('sessionQuery', { readSession: vi.fn() })
  for (const plugin of [LlmRuntime, SessionStore, SessionProjectionRegistry, SystemPrompt, Tools, AgentRegistry, TokenMeter]) await ctx.plugin(plugin)
  await ctx.plugin(LocalFileSystem, { cwd: root })
  await ctx.plugin(WorkingDirectory, { defaultDirectory: root })
  await ctx.plugin(ToolResultStore, { root, cleanupPeriodDays: 0 })
  await ctx.plugin(spillPolicy, { maxInlineTokens: 12_500, exemptTools: ['eleckoi_read_uploaded_file'], pagedTools: Object.values(RESULT_READERS) })
  ctx.provide('eleckoiProductData', { commitConversationRuntime: vi.fn() })
  ctx.provide('eleckoiCharacterConfigurationChanges', { publish: vi.fn() })
  ctx.provide('eleckoiVariableProcessing', new ElecKoiVariableProcessing(null))
  ctx.provide('eleckoiRuntimeContexts', runtimeContextsFor('synthetic-unprepared'))
  await ctx.plugin(settingTools)
  await ctx.plugin(variableTools)
  await ctx.plugin(AgentLoop, { agents: [] })
  class Adapter extends LlmAdapter {
    async resolveModel(provider, id) { return { provider, id, name: id, context: { contextWindow: 10_000_000 } } }
    async *stream(options) { requests.push(options); yield* stream(options, requests.length) }
  }
  ctx.llm.registerAdapter(['synthetic'], new Adapter())
  const handle = await ctx.agents.create({ sessionId: SessionId(sessionId), cwd: root, agentOptions: { provider: 'synthetic', model: 'synthetic' } })
  cleanups.push(() => handle.dispose())
  const exec = { agent: handle.agent, signal: new AbortController().signal }
  const save = content => ctx.spillStore.saveText({ owner: { sessionId: handle.agent.session.id }, source: { kind: 'tool', toolName: 'eleckoi_read_setting_files', callId: 'synthetic-call', label: 'result' }, suggestedName: 'result.txt', content })
  return { ctx, root, handle, exec, requests, save, read: args => ctx.spillStore.readResult(args, exec, 'settings') }
}

async function profileFixture(platform, existingRoot) {
  const root = existingRoot ?? mkdtempSync(join(tmpdir(), 'eleckoi-result-profile-'))
  if (!existingRoot) cleanups.push(async () => {
    const child = relative(tmpdir(), root)
    if (!child || child.startsWith('..') || isAbsolute(child)) throw new Error('Unexpected cleanup path')
    await rm(root, { recursive: true, force: true })
  })
  const resources = resolve('apps/desktop/resources/dsh')
  const paths = { runtimeDataRoot: root, homeRoot: join(root, 'home'), workspaceRoot: join(root, 'workspace'),
    productDatabasePath: join(root, 'product.sqlite'), productMediaRoot: join(root, 'media'),
    resourceRoot: resources, presetTemplatePath: join(resources, 'agent-preset-template/agent.cordis.yml'),
    agentPatchPath: join(resources, 'desktop-agent.patch.yml') }
  const prepared = preparePluginHost(paths)
  const profileDirectory = platform === 'android' ? prepared.profileDirectory : join(paths.homeRoot, 'profiles/desktop')
  if (platform === 'desktop') initProfile(profileDirectory, [...PROFILE_TEMPLATES.web.bundles, ...ELECKOI_DESKTOP_BUNDLES, '@eleckoi/dsh-web-search-tavily'])
  const previous = Object.fromEntries(Object.keys(prepared.environment).map(key => [key, process.env[key]]))
  Object.assign(process.env, prepared.environment)
  cleanups.push(() => { for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value
  } })
  const installAnchor = platform === 'android' ? ANDROID_INSTALL_ANCHOR : ELECKOI_INSTALL_ANCHOR
  const profile = loadProfileDirectory('dsh', profileDirectory, installAnchor)
  expect(profile.skippedBundles).toEqual([])
  const desktopOverlay = join(profileDirectory, 'eleckoi-plugin-host.patch.yml')
  if (platform === 'desktop') writeFileSync(desktopOverlay, JSON.stringify([
    { id: 'session-persistence-jsonl', config: { root: join(root, 'sessions'), compression: 'none' } },
    ...['desktop-product-telemetry', 'product-analytics', 'ui-layout', 'ui-sidebar', 'ui-settings-general', 'ui-settings-models']
      .map(id => ({ id, disabled: true })),
  ]))
  const running = await runProfile({ environment: loadLayeredEnv('dsh'), profile: platform,
    resolvedProfile: { profile, installAnchor },
    patchFiles: platform === 'android' ? prepared.patchFiles : [desktopOverlay, paths.agentPatchPath],
    args: ['--no-open', '--port', '0'] })
  cleanups.push(() => running.ctx.fiber.dispose())
  let stream
  class Adapter extends LlmAdapter {
    async resolveModel(provider, id) { return { provider, id, name: id, context: { contextWindow: 100_000_000 }, defaultMaxTokens: 8192 } }
    async *stream(request) { yield* stream(request) }
  }
  running.ctx.llm.registerAdapter(['synthetic-profile'], new Adapter())
  await running.ctx.agentDefaultModel.saveSelection({ provider: 'synthetic-profile', model: 'synthetic-profile' })
  return { ctx: running.ctx, root, setStream(value) { stream = value } }
}

describe('Shipped Host tool-result composition', () => {
  it.each(['desktop', 'android'])('%s edits every opening and its variable binding through the Studio model loop and resumes saved results', async platform => {
    const f = await profileFixture(platform), { ctx, root } = f, data = ctx.eleckoiProductData
    const characterId = 'synthetic-opening-author'
    data.createCharacter({ id: characterId, name: '合成开场编辑目标' })
    const config = data.readVariableConfig(characterId), variableVersionId = 'synthetic-opening-variables'
    data.saveVariableConfig(characterId, { ...config, versions: [...config.versions, { ...config.versions[0], id: variableVersionId, name: '合成绑定版本' }] })
    const indexes = [0, 5_000, 10_000], library = data.readSettingLibrary(characterId)
    const normal = { ...emptyEntry('synthetic-retained-setting'), title: '合成普通条目', content: '合成原正文' }
    data.saveSettingLibrary(characterId, { ...library, entries: [...library.entries, normal] })
    const seeded = data.saveCharacterOpenings(characterId, { ...data.readCharacterOpenings(characterId), enabled: true, defaultOpeningMessageId: 'synthetic-opening-5000',
      openingMessages: Array.from({ length: 10_001 }, (_, index) => ({ id: `synthetic-opening-${index}`, title: `合成开场-${index}`,
        content: `他在开场-${index}。${indexes.includes(index) ? '合成长正文他𠮷'.repeat(20_001) : ''}末尾他-${index}`,
        variableVersionId: config.activeVersionId })),
    })
    const opening = seeded, desired = opening.openingMessages.map((message, index) => ({ ...message,
      content: message.content.replaceAll('他', '她'),
      variableVersionId: index === 5_000 ? '' : indexes.includes(index) ? variableVersionId : message.variableVersionId,
    }))
    const studio = await ctx.eleckoiCreatorStudioRuntime.create(characterId)
    const agent = (await ctx.sessionController.resolveAgent(studio.sessionId)).agent
    const discover = async (name, args) => {
      const result = await agent.ctx.tools.execute({ callId: `synthetic-discovery-${name}-${args.toolset_id ?? 'catalog'}`, name, arguments: args,
        agent, signal: new AbortController().signal })
      expect(result.isError, JSON.stringify(result)).not.toBe(true)
      return JSON.parse(result.content[0].text)
    }
    const catalog = await discover('eleckoi_list_toolsets', {})
    expect(catalog.toolsets.find(toolset => toolset.id === 'character').description).toContain('开场白')
    expect(catalog.toolsets.find(toolset => toolset.id === 'settings').description).not.toContain('开场白')
    expect(catalog.toolsets.some(toolset => toolset.id === 'displayTemplates')).toBe(false)
    const characterGuide = await discover('eleckoi_describe_toolset', {
      toolset_id: 'character', operation_ids: ['character.read_openings', 'character.save_openings'], include_schema: true,
    })
    const openingSchema = characterGuide.operations.find(operation => operation.id === 'character.save_openings').inputSchema
    expect(Object.keys(openingSchema.properties).sort()).toEqual(['defaultOpeningMessageId', 'enabled', 'openingMessages'])
    expect(openingSchema.additionalProperties).toBe(false)
    expect(characterGuide.toolset.guide.join('\n')).toContain('character.save_openings')
    const regexGuide = await discover('eleckoi_describe_toolset', {
      toolset_id: 'regex', operation_ids: ['regex.create', 'regex.test'], include_schema: true,
    })
    expect(regexGuide.toolset.guide.join('\n')).toContain('EJS')
    expect(regexGuide.operations.find(operation => operation.id === 'regex.test').inputSchema.properties).toHaveProperty('variables')
    const spills = [], requests = []
    const saveText = ctx.spillStore.saveText.bind(ctx.spillStore)
    const save = vi.spyOn(ctx.spillStore, 'saveText').mockImplementation(async input => {
      const ref = await saveText(input); spills.push({ ref, original: input.content }); return ref
    })
    const toolValue = request => JSON.parse(request.messages.findLast(message => message.role === 'tool').content[0].text)
    let step = 0
    f.setStream(async function* (request) {
      requests.push(request)
      let args
      if (step === 0) args = { capability_id: 'variables.list', arguments: {} }
      if (step === 1) {
        expect(toolValue(request).value.versions).toContainEqual({ id: variableVersionId, name: '合成绑定版本' })
        args = { capability_id: 'character.read_openings', arguments: {} }
      }
      if (step === 2 || step === 4) {
        const spill = spills.at(-1)
        expect(request.messages.findLast(message => message.role === 'tool').content[0].text).toContain(spill.ref.locator)
        args = { result: { file_path: spill.ref.locator, limit: Buffer.byteLength(spill.original) } }
      }
      if (step === 3 || step === 5) {
        const page = toolValue(request)
        expect(page).toMatchObject({ kind: 'tool_result_page', next_offset: null })
        const value = JSON.parse(page.content).value
        const actual = value
        const expected = step === 3 ? opening.openingMessages : desired
        expect(JSON.stringify(actual.openingMessages) === JSON.stringify(expected)).toBe(true)
        for (const index of indexes) expect(actual.openingMessages[index].content.endsWith(`末尾${step === 3 ? '他' : '她'}-${index}`)).toBe(true)
        if (step === 3) {
          const { characterId: _ownerId, ...configuration } = value
          args = { capability_id: 'character.save_openings', arguments: { ...configuration, openingMessages: desired, defaultOpeningMessageId: desired.at(-1).id } }
        } else expect(data.readSettingLibrary(characterId).entries.find(entry => entry.id === normal.id).content).toBe('合成原正文')
      }
      yield { type: 'block-start', index: 0, blockType: args ? 'tool-call' : 'text' }
      yield { type: 'block-end', index: 0, block: args ? { type: 'tool-call', id: `synthetic-opening-call-${step++}`, name: 'eleckoi_call_capability', arguments: JSON.stringify(args) }
        : { type: 'text', text: '合成全部开场及绑定已修改' } }
      yield { type: 'finish', reason: { kind: args ? 'tool-calls' : 'stop' } }
    })
    await ctx.sessionController.prompt({ sessionId: agent.id, requestId: 'synthetic-opening-edit', mode: 'queue', content: [{ type: 'text', text: '合成全部开场与变量绑定编辑' }] }, new AbortController().signal)
    await agent.whenIdle()
    expect(agent.session.snapshotEvents().findLast(event => event.type === 'turn/end').data.reason).toEqual({ kind: 'completed' })
    expect(requests).toHaveLength(6)
    expect(save).toHaveBeenCalledTimes(2)
    save.mockRestore()
    const saved = data.readCharacterOpenings(characterId)
    expect(JSON.stringify(saved.openingMessages) === JSON.stringify(desired)).toBe(true)
    const chat = data.createConversation({ metadata: { characterId } })
    expect(chat.messages[0].content === desired.at(-1).content).toBe(true)
    expect(chat.messages[0].openingOptions.at(-1).variableVersionId).toBe(variableVersionId)
    const wire = await captureSerializedRequest('deepseek_messages', requests.at(-1))
    expect(JSON.stringify(wire)).toContain('末尾她-10000')
    await ctx.sessions.flush(agent.session)
    await ctx.fiber.dispose()
    const reopened = await profileFixture(platform, root)
    await reopened.ctx.eleckoiCreatorStudioRuntime.open(studio.sessionId)
    expect(JSON.stringify(reopened.ctx.eleckoiProductData.readCharacterOpenings(characterId)) === JSON.stringify(saved)).toBe(true)
    const restored = (await reopened.ctx.sessionController.resolveAgent(studio.sessionId)).agent
    const result = await restored.ctx.tools.execute({ callId: 'synthetic-opening-restored-receipt', name: 'eleckoi_call_capability',
      arguments: { result: { file_path: spills[1].ref.locator, limit: Buffer.byteLength(spills[1].original) } }, agent: restored, signal: new AbortController().signal })
    expect(result.isError).not.toBe(true)
    expect(JSON.parse(result.content[0].text).content === spills[1].original).toBe(true)
  }, 120_000)

  it('replaces the store in the retained SDK composition using the official patch semantics', () => {
    const root = mkdtempSync(join(tmpdir(), 'eleckoi-sdk-result-profile-'))
    cleanups.push(() => {
      const child = relative(tmpdir(), root)
      if (!child || child.startsWith('..') || isAbsolute(child)) throw new Error('Unexpected cleanup path')
      rmSync(root, { recursive: true, force: true })
    })
    initProfile(root, PROFILE_TEMPLATES.sdk.bundles)
    const profile = loadProfileDirectory('dsh', root, ELECKOI_INSTALL_ANCHOR)
    expect(profile.skippedBundles).toEqual([])
    const entries = composeEntries([...profile.layers.map(layer => layer.patches),
      loadOverlayPatches('dsh', resolve('apps/desktop/resources/dsh/cordis.yml'))])
    expect(entries.find(entry => entry.id === 'spill-local').disabled).toBe(true)
    const store = entries.filter(entry => entry.id === 'eleckoi-tool-result-store')
    expect(store).toHaveLength(1)
    expect(store[0].disabled).not.toBe(true)
    expect(store[0].name).toMatch(/tool-result-store\.mjs$/)
  })

  it.each(['desktop', 'android'])('%s recovers all three tool groups through its actual profile, copied cards and saved presets', async platform => {
    const f = await profileFixture(platform), { ctx, root } = f
    expect(typeof ctx.spillStore.readResult).toBe('function')
    expect(ctx.spillStore.root).toBe(join(root, 'home', 'tool-results'))
    const count = 10_001, data = ctx.eleckoiProductData
    let character = data.createCharacter({ id: 'synthetic-profile-character', name: '合成编辑目标' }).items[0]
    const library = data.readSettingLibrary(character.id)
    const entries = Array.from({ length: count }, (_, index) => ({ ...emptyEntry(`synthetic-profile-${index}`),
      title: `合成目录-${String(index).padStart(5, '0')}`,
      content: `开始-${index}|${'合成正文𠮷😀'.repeat([0, Math.floor(count / 2), count - 1].includes(index) ? 20_001 : 1)}|末尾关键词-${index}`,
      agentReadStrategy: 'normal' }))
    data.saveSettingLibrary(character.id, { ...library, entries })
    const globalEntries = entries.map(entry => ({ ...entry, title: `全局${entry.title}`, content: `全局${entry.content}` }))
    const savedGlobals = data.saveGlobalSettingLibraries({ revision: 0, libraries: [{ id: 'synthetic-shared-library', name: '合成共享库', enabled: true,
      entries: globalEntries, groups: [], promptPositions: [], expandedGroupIds: [], listAllExpanded: false, createdAt: '', updatedAt: '' },
      { id: 'synthetic-shared-rules', name: '合成触发规则', enabled: true, groups: [], promptPositions: [], expandedGroupIds: [], listAllExpanded: false, createdAt: '', updatedAt: '',
        entries: [
          { ...emptyEntry('synthetic-required'), title: '合成全局必读', content: '合成全局必读标记', agentReadStrategy: 'required' },
          { ...emptyEntry('synthetic-keyword'), title: '合成全局关键词', content: '合成全局关键词正文', agentReadStrategy: 'keyword', keywords: ['合成'] },
          { ...emptyEntry('synthetic-reference'), title: '合成全局引用', content: '合成全局引用标记', dynamicMode: 'ejs_reference' },
          { ...emptyEntry('synthetic-controller'), title: '合成全局控制器', content: '<%- await getwi("全局设定库/合成触发规则/合成全局引用") %>', contentMode: 'ejs', agentReadStrategy: 'normal' },
        ] }] })
    const config = data.readVariableConfig(character.id)
    const variables = Array.from({ length: count }, (_, index) => ({ id: `synthetic-variable-${index}`, title: `合成变量-${String(index).padStart(5, '0')}`,
      objectId: '', enabled: true, type: 'string', defaultValue: `合成变量正文-${index}`,
      description: `合成说明-${index}`, updateRule: `合成更新规则-${index}`, readMode: 'required',
      order: index + 1, treeViewOrder: index, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }))
    data.saveVariableConfig(character.id, { ...config, variables,
      initialStateJson: JSON.stringify(Object.fromEntries(variables.map((variable, index) => [variable.title, `合成变量正文-${index}`]))) })
    data.saveCharacterOpenings(character.id, { ...data.readCharacterOpenings(character.id),
      defaultOpeningMessageId: 'synthetic-bound-opening', openingMessages: [{ id: 'synthetic-bound-opening',
        title: '合成绑定开场', content: '合成变量开场', variableVersionId: config.activeVersionId }] })
    const copy = data.duplicateCharacter(character.id)
    expect(copy.collection.items).toHaveLength(2)
    character = copy.collection.items.find(item => item.id === copy.characterId)
    expect(data.readGlobalSettingLibraries()).toEqual(savedGlobals)
    expect(data.readSettingLibrary(character.id).entries).toHaveLength(count)
    const chat = await ctx.eleckoiConversationsApi.create({ metadata: { characterId: character.id } })
    const roleplayId = await ctx.eleckoiRoleplaySessions.preparePrompt(chat.conversation.id, '合成大量条目续读')
    const roleplay = (await ctx.sessionController.resolveAgent(roleplayId)).agent
    const globalCatalog = await roleplay.ctx.tools.execute({ callId: 'synthetic-global-catalog', name: 'eleckoi_glob_setting_files',
      arguments: { path: '全局设定库/合成触发规则' }, agent: roleplay, signal: new AbortController().signal })
    expect(globalCatalog.isError).not.toBe(true)
    expect(JSON.parse(globalCatalog.content[0].text).required_entries.map(item => item.title)).toContain('合成全局关键词')
    const studio = await ctx.eleckoiCreatorStudioRuntime.create(character.id)
    const creator = (await ctx.sessionController.resolveAgent(studio.sessionId)).agent
    const receipts = []
    for (const [agent, toolName, args, keyword] of [
      [roleplay, 'eleckoi_read_setting_files', { paths: entries.map(entry => entry.title) }, '末尾关键词-'],
      [roleplay, 'eleckoi_read_setting_files', { paths: [...globalEntries.map(entry => `全局设定库/合成共享库/${entry.title}`), '全局设定库/合成触发规则/合成全局控制器'] }, '末尾关键词-'],
      [roleplay, 'eleckoi_read_variables', { paths: variables.map(variable => `/${variable.title}`) }, '合成变量正文-'],
      [creator, 'eleckoi_call_capability', { capability_id: 'settings.list', arguments: {} }, '合成目录-'],
    ]) {
      let ref, original, step = 0, offset = 0, recovered = '', found = []
      const trace = []
      let finalRequest
      const reader = RESULT_READERS[resultDomain(toolName)]
      const saveText = ctx.spillStore.saveText.bind(ctx.spillStore)
      const save = vi.spyOn(ctx.spillStore, 'saveText').mockImplementation(async input => {
        original = input.content; ref = await saveText(input); return ref
      })
      f.setStream(async function* (request) {
        const toolText = request.messages.findLast(message => message.role === 'tool')?.content[0].text
        trace.push({ step, purpose: request.purpose, last: toolText?.slice(0, 500) })
        if (step === 1) {
          expect(toolText).toContain(reader)
          expect(toolText).toContain(ref.locator)
        } else if (step === 2) {
          const page = JSON.parse(toolText)
          found = page.matches
          expect(page.next_offset).toBeNull()
        } else if (step > 2) {
          const page = JSON.parse(toolText)
          expect(page.kind).toBe('tool_result_page')
          recovered += page.content; offset = page.next_offset
        }
        const done = step > 2 && offset === null
        if (done) finalRequest = request
        const parameters = step === 0 ? args : step === 1
          ? { result: { file_path: ref.locator, query: keyword, limit: count * 10 } }
          : { result: { file_path: ref.locator, offset, limit: Math.ceil(Buffer.byteLength(original) / 2) } }
        yield { type: 'block-start', index: 0, blockType: done ? 'text' : 'tool-call' }
        yield { type: 'block-end', index: 0, block: done ? { type: 'text', text: '合成完整结果已恢复' }
          : { type: 'tool-call', id: `synthetic-profile-call-${step++}`, name: step === 1 ? toolName : reader, arguments: JSON.stringify(parameters) } }
        yield { type: 'finish', reason: { kind: done ? 'stop' : 'tool-calls' } }
      })
      await ctx.sessionController.prompt({ sessionId: agent.id, requestId: `synthetic-${toolName}-${receipts.length}`, mode: 'queue',
        content: [{ type: 'text', text: '合成条目全部续读及末尾关键词查找' }] }, new AbortController().signal)
      await agent.whenIdle()
      expect(recovered.length, JSON.stringify({ trace, ends: agent.session.snapshotEvents().filter(event => event.type === 'turn/end' || event.type === 'assistant/error') })).toBe(original?.length)
      expect(recovered).toBe(original)
      expect(found).toHaveLength(original.split(keyword).length - 1)
      expect(found.length).toBeGreaterThanOrEqual(count)
      for (const index of [0, Math.floor(count / 2), count - 1]) {
        expect(recovered).toContain(toolName === 'eleckoi_read_variables' ? `合成变量正文-${index}`
          : toolName === 'eleckoi_call_capability' ? entries[index].title : `末尾关键词-${index}`)
      }
      expect(save).toHaveBeenCalledOnce()
      save.mockRestore()
      const wire = await captureSerializedRequest('deepseek_messages', finalRequest)
      if (agent === roleplay) {
        expect(finalRequest.messages.some(message => JSON.stringify(message).includes('合成全局必读标记'))).toBe(true)
        if (args.paths?.includes('全局设定库/合成触发规则/合成全局控制器')) {
          expect(finalRequest.messages.some(message => JSON.stringify(message).includes('合成全局引用标记'))).toBe(true)
        }
      }
      const toolOutputs = finalRequest.messages.filter(message => message.role === 'tool')
        .map(message => message.content.filter(block => block.type === 'text').map(block => block.text).join(''))
      const wireOutputs = wire.messages.flatMap(message => message.content.filter(block => block.type === 'tool_result')
        .map(block => block.content.map(part => part.text || '').join('')))
      expect(wireOutputs).toEqual(toolOutputs)
      expect(wireOutputs.some(text => text.includes(`${keyword}${count - 1}`)
        || text.includes(entries.at(-1).title))).toBe(true)
      const schemas = agent.ctx.tools.schemas(agent)
      const domain = resultDomain(toolName)
      expect(schemas.filter(tool => resultDomain(tool.name) === domain)).toHaveLength(domain === 'creator' ? 3 : 4)
      receipts.push({ sessionId: agent.id, reader, file_path: ref.locator, original, query: `${keyword}${count - 1}` })
    }
    await Promise.all([ctx.sessions.flush(roleplay.session), ctx.sessions.flush(creator.session)])
    await ctx.fiber.dispose()
    const restarted = await profileFixture(platform, root)
    expect(restarted.ctx.eleckoiProductData.readGlobalSettingLibraries()).toEqual(savedGlobals)
    await restarted.ctx.eleckoiRoleplaySessions.prepareSessionAccess(chat.conversation.id)
    await restarted.ctx.eleckoiCreatorStudioRuntime.open(studio.sessionId)
    for (const receipt of receipts) {
      const { agent } = await restarted.ctx.sessionController.resolveAgent(receipt.sessionId)
      const result = await agent.ctx.tools.execute({ callId: 'synthetic-restored-reader', name: receipt.reader,
        arguments: { result: { file_path: receipt.file_path, query: receipt.query } }, agent, signal: new AbortController().signal })
      expect(result.isError).not.toBe(true)
      const page = JSON.parse(result.content[0].text)
      expect(page).toMatchObject({ kind: 'tool_result_page', next_offset: null })
      expect(page.matches.length).toBeGreaterThan(0)
    }
    await restarted.ctx.eleckoiConversationsApi.delete(chat.conversation.id)
    for (const receipt of receipts) {
      const retained = receipt.sessionId === studio.sessionId
      expect(existsSync(receipt.file_path)).toBe(retained)
      expect(existsSync(`${receipt.file_path}.owner.json`)).toBe(retained)
    }
    await restarted.ctx.eleckoiCreatorStudioRuntime.delete(studio.sessionId)
    for (const receipt of receipts) {
      expect(existsSync(receipt.file_path)).toBe(false)
      expect(existsSync(`${receipt.file_path}.owner.json`)).toBe(false)
    }
  }, 120_000)
})

describe('Complete tool-result access', { timeout: 30_000 }, () => {
  it('refuses redirected result directories while still cleaning the other deleted Sessions', async () => {
    const f = await fixture(), redirected = await f.save('合成保留正文'), retained = join(f.root, 'retained')
    const other = await f.ctx.spillStore.saveText({ owner: { sessionId: 'synthetic-other' }, source: { kind: 'tool', toolName: RESULT_READER }, suggestedName: 'other.txt', content: '合成待删除正文' })
    const directory = dirname(redirected.locator)
    renameSync(directory, retained)
    symlinkSync(retained, directory, process.platform === 'win32' ? 'junction' : 'dir')
    try {
      await expect(f.ctx.spillStore.removeSessionResults([f.handle.agent.id, 'synthetic-other'])).rejects.toThrow('真实目录')
      expect(readdirSync(retained)).toHaveLength(2)
      expect(existsSync(dirname(other.locator))).toBe(false)
    } finally { unlinkSync(directory) }
  })

  it('writes one complete artifact and one small ownership record per result, with no files added by repeated reads', async () => {
    const f = await fixture(), body = '合成正文😀'.repeat(10_001), refs = []
    const listFiles = () => readdirSync(f.root, { recursive: true }).filter(name => statSync(join(f.root, name)).isFile()).sort()
    for (let index = 0; index < 12; index++) {
      refs.push(await f.save(body))
      expect(listFiles()).toHaveLength((index + 1) * 2)
    }
    const files = listFiles(), before = files.map(name => statSync(join(f.root, name)).size)
    expect(files.filter(name => name.endsWith('.owner.json')).every(name => statSync(join(f.root, name)).size < 512)).toBe(true)
    expect(before.reduce((total, size) => total + size, 0)).toBeLessThan(12 * (Buffer.byteLength(body) + 512))
    for (const ref of refs) {
      let offset = 0, restored = ''
      do {
        const page = await f.read({ file_path: ref.locator, offset })
        restored += page.content; offset = page.next_offset
      } while (offset !== null)
      expect(restored).toBe(body)
    }
    expect(listFiles()).toEqual(files)
    expect(files.map(name => statSync(join(f.root, name)).size)).toEqual(before)
  })

  it.each(['eleckoi_glob_setting_files', 'eleckoi_grep_setting_files', 'eleckoi_read_setting_files',
    'eleckoi_glob_variables', 'eleckoi_grep_variables', 'eleckoi_read_variables'])('recovers the complete real %s output through the Agent loop', async toolName => {
    let ref, offset = 0, recovered = '', args, original
    const f = await fixture({ stream: async function* (request, step) {
      if (step === 2) expect(request.messages.at(-1).content[0].text).toContain(RESULT_READERS[resultDomain(toolName)])
      if (step > 2) {
        const page = JSON.parse(request.messages.at(-1).content[0].text)
        recovered += page.content
        offset = page.next_offset
      }
      yield { type: 'block-start', index: 0, blockType: offset === null ? 'text' : 'tool-call' }
      yield { type: 'block-end', index: 0, block: offset === null ? { type: 'text', text: '合成角色工具全文已恢复' }
        : { type: 'tool-call', id: `synthetic-real-tool-${step}`, name: step === 1 ? toolName : RESULT_READERS[resultDomain(toolName)],
          arguments: JSON.stringify(step === 1 ? args : { result: { file_path: ref.locator, offset, limit: 100_000 } }) } }
      yield { type: 'finish', reason: { kind: offset === null ? 'stop' : 'tool-calls' } }
    } })
    const count = 1_001, snapshotRoot = join(f.root, 'snapshots')
    mkdirSync(snapshotRoot)
    const previous = process.env.ELECKOI_SESSION_SNAPSHOT_ROOT
    process.env.ELECKOI_SESSION_SNAPSHOT_ROOT = snapshotRoot
    cleanups.push(() => { if (previous === undefined) delete process.env.ELECKOI_SESSION_SNAPSHOT_ROOT; else process.env.ELECKOI_SESSION_SNAPSHOT_ROOT = previous })
    const entries = Array.from({ length: count }, (_, index) => ({ ...emptyEntry(`synthetic-setting-${index}`), title: `合成设定-${String(index).padStart(4, '0')}`,
      content: `完整正文与末尾关键词-${index}`, agentReadStrategy: 'normal' }))
    const library = { characterId: 'synthetic-character', groups: [], entries }
    const variables = Array.from({ length: count }, (_, index) => ({ id: `synthetic-variable-${index}`, title: `合成指标-${String(index).padStart(4, '0')}`,
      objectId: '', enabled: true, type: 'number', defaultValue: '0', description: `合成说明-${index}`, updateRule: `完整更新规则-${index}`, readMode: 'required' }))
    const state = Object.fromEntries(variables.map(variable => [variable.title, 0]))
    f.ctx.eleckoiRuntimeContexts.set(f.handle.agent.session.id, runtimeContextsFor(f.handle.agent.session.id, {
      settings: { enabled: true, library, history: [] }, variables: { enabled: true, config: { initialState: state, schemaCode: '', objects: [], variables }, state },
      settingLibraryBaseline: { source: library, projected: library }
    }).get(f.handle.agent.session.id))
    args = toolName.includes('grep') ? { pattern: toolName.endsWith('variables') ? '合成指标' : '合成设定' }
      : toolName.includes('read') ? { paths: toolName.endsWith('variables') ? variables.map(variable => `/${variable.title}`) : entries.map(entry => entry.title) } : {}
    f.ctx.on('tools/post-execute', async (exec, result, next) => { if (exec.name === toolName && !Object.hasOwn(exec.arguments, 'result')) original = result.content[0].text; return next() })
    const originalSave = f.ctx.spillStore.saveText.bind(f.ctx.spillStore)
    const save = vi.spyOn(f.ctx.spillStore, 'saveText').mockImplementation(async input => { ref = await originalSave(input); return ref })
    f.handle.agent.followup(createUserMessage({ content: [{ type: 'text', text: '合成大量设定与变量读取' }], source: { kind: 'user' } }))
    await f.handle.agent.whenIdle()
    expect(recovered).toBe(original)
    const parsed = JSON.parse(recovered)
    expect(parsed.status).toBe('ok')
    expect(parsed.files ?? parsed.matches ?? parsed.paths ?? parsed.variables).toHaveLength(count)
    expect(parsed.omitted ?? 0).toBe(0)
    expect(save).toHaveBeenCalledTimes(1)
    expect(f.handle.agent.session.snapshotEvents().filter(event => event.type === 'turn/end').at(-1).data.reason).toEqual({ kind: 'completed' })
    save.mockRestore()
  })

  it('reconstructs a long single line with Chinese, surrogate pairs and the final keyword without splitting UTF-8', async () => {
    const f = await fixture()
    const original = `开始𠮷${'合成正文😀'.repeat(20_001)}末尾关键词`
    const ref = await f.save(original)
    let offset = 0, reconstructed = '', pages = 0
    do {
      const page = await f.read({ file_path: ref.locator, offset, limit: pages < 8 ? 1 : 32_768 })
      reconstructed += page.content
      expect(page.content).not.toContain('\ufffd')
      expect(page.total_bytes).toBe(Buffer.byteLength(original))
      expect(page.next_offset === null || page.next_offset > offset).toBe(true)
      offset = page.next_offset
      pages++
    } while (offset !== null)
    expect(reconstructed).toBe(original)
    expect(ref.retrievalHint).toContain(RESULT_READER)
    expect(pages).toBeGreaterThan(10)
    await expect(f.read({ file_path: ref.locator, offset: 1 })).rejects.toThrow('UTF-8')
  })

  it('finds literal keywords across stream boundaries and retrieves every match through continuation', async () => {
    const f = await fixture()
    const original = `${'x'.repeat(65_535)}中文😀${'合成关键词𠮷,'.repeat(1_501)}最终关键词`
    const ref = await f.save(original)
    let offset = 0, matches = []
    do {
      const page = await f.read({ file_path: ref.locator, offset, query: '合成关键词𠮷', limit: 37 })
      matches.push(...page.matches)
      expect(page.next_offset === null || page.next_offset > offset).toBe(true)
      offset = page.next_offset
    } while (offset !== null)
    expect(matches).toHaveLength(1_501)
    const bytes = Buffer.from(original)
    for (const match of matches) expect(bytes.subarray(match.offset, match.offset + Buffer.byteLength('合成关键词𠮷')).toString()).toBe('合成关键词𠮷')
    const final = await f.read({ file_path: ref.locator, query: '最终关键词' })
    expect(final.matches).toHaveLength(1)
    const body = await f.read({ file_path: ref.locator, offset: final.matches[0].offset })
    expect(body.content).toBe('最终关键词')
    expect(await f.read({ file_path: ref.locator, query: '不匹配的文字' })).toMatchObject({ matches: [], next_offset: null })
  })

  it('rejects another session, arbitrary files, invalid offsets and missing ownership records', async () => {
    const f = await fixture(), other = await fixture({ sessionId: 'other-result-owner' })
    const ref = await f.save('合成内容')
    await expect(other.read({ file_path: ref.locator })).rejects.toThrow('无权')
    const peer = await fixture({ root: f.root, sessionId: 'same-root-peer' })
    await expect(peer.read({ file_path: ref.locator })).rejects.toThrow('不属于')
    await expect(f.ctx.spillStore.readResult({ file_path: ref.locator }, f.exec, 'variables')).rejects.toThrow('本工具组')
    await expect(f.ctx.spillStore.readResult({ file_path: ref.locator }, f.exec, 'creator')).rejects.toThrow('本工具组')
    const arbitrary = join(f.root, 'arbitrary.txt')
    writeFileSync(arbitrary, '无归属的合成内容')
    await expect(f.read({ file_path: arbitrary })).rejects.toThrow('凭据')
    await expect(f.read({ file_path: ref.locator, offset: 10_000 })).rejects.toThrow('范围')
    await expect(f.read({ file_path: ref.locator, limit: 0 })).rejects.toThrow('limit')
    await expect(f.read({ file_path: ref.locator, query: '' })).rejects.toThrow('query')
    rmSync(ref.locator)
    await expect(f.read({ file_path: ref.locator })).rejects.toThrow('失效')
  })

  it('reports a corrupted ownership record as storage/corrupt', async () => {
    const f = await fixture(), ref = await f.save('合成内容')
    writeFileSync(`${ref.locator}.owner.json`, '{"version":1')
    const failure = await f.read({ file_path: ref.locator }).catch(error => error)
    expect(failure).toMatchObject({ code: 'eleckoi/storage/corrupt', details: { what: '工具结果归属记录' } })
    expect(failure.message).toContain('无法解析')
  })

  it.each(['settings', 'variables'])('continues and searches through the existing %s reader and rejects mixed business arguments', async domain => {
    const f = await fixture(), reader = RESULT_READERS[domain], body = '合成关键词𠮷😀'.repeat(1_501)
    const ref = await f.ctx.spillStore.saveText({ owner: { sessionId: f.handle.agent.session.id },
      source: { kind: 'tool', toolName: reader, callId: 'synthetic-owned-result', label: 'result' }, suggestedName: 'result.txt', content: body })
    const run = args => f.handle.agent.ctx.tools.execute({ callId: 'synthetic-read-own-result', name: reader, arguments: args, ...f.exec })
    const page = await run({ result: { file_path: ref.locator, query: '合成关键词𠮷😀', limit: 1_501 } })
    expect(page.isError).not.toBe(true)
    expect(page.value.matches).toHaveLength(1_501)
    expect(page.value.next_offset).toBeNull()
    const mixed = await run({ paths: ['synthetic'], result: { file_path: ref.locator } })
    expect(mixed.isError).toBe(true)
    expect(mixed.content[0].text).toContain('只传 result')
    expect(f.ctx.tools.schemas().map(tool => tool.name)).not.toContain('eleckoi_read_tool_result')
    expect(filterDeclarations([{ name: reader }], [`builtin:${domain === 'settings' ? 'setting-library' : 'variables'}`])).toEqual([])
    applyDisabledPolicy(f.handle.agent.ctx, [`builtin:${domain === 'settings' ? 'setting-library' : 'variables'}`])
    expect((await run({ result: { file_path: ref.locator } })).isError).toBe(true)
    applyDisabledPolicy(f.handle.agent.ctx, [])
    expect((await run({ result: { file_path: ref.locator } })).isError).not.toBe(true)
  })

  it('retains session authorization and exact content after the Host is reconstructed', async () => {
    const f = await fixture()
    const ref = await f.save('合成重开内容𠮷😀')
    await f.ctx.fiber.dispose()
    const reopened = await fixture({ root: f.root })
    expect(await reopened.read({ file_path: ref.locator })).toMatchObject({ content: '合成重开内容𠮷😀', next_offset: null })
    expect(readFileSync(`${ref.locator}.owner.json`, 'utf8')).not.toContain('合成重开内容')
  })

  it('rejects cancellation without returning a placeholder success', async () => {
    const f = await fixture(), ref = await f.save('合成取消场景')
    const controller = new AbortController(), reason = new Error('Synthetic cancellation')
    controller.abort(reason)
    await expect(f.ctx.spillStore.readResult({ file_path: ref.locator }, { ...f.exec, signal: controller.signal }, 'settings')).rejects.toBe(reason)
  })

  it('allows only result artifacts actually inherited at the official Session fork boundary', async () => {
    const f = await fixture({ stream: async function* (_options, step) {
      yield { type: 'block-start', index: 0, blockType: step === 1 ? 'tool-call' : 'text' }
      yield { type: 'block-end', index: 0, block: step === 1
        ? { type: 'tool-call', id: 'synthetic-fork-call', name: 'eleckoi_glob_setting_files', arguments: '{}' }
        : { type: 'text', text: '合成分叉前回复' } }
      yield { type: 'finish', reason: { kind: step === 1 ? 'tool-calls' : 'stop' } }
    } })
    const original = '合成继承全文𠮷😀'.repeat(20_001)
    f.handle.agent.ctx.tools.register(defineTool({ name: 'eleckoi_glob_setting_files', description: '合成分叉结果', parameters: {},
      output: { schema: { type: 'object', additionalProperties: true }, render: () => [{ type: 'text', text: original }] }, execute: () => ({ content: original }) }))
    const save = vi.spyOn(f.ctx.spillStore, 'saveText')
    f.handle.agent.followup(createUserMessage({ content: [{ type: 'text', text: '合成分叉权限测试' }], source: { kind: 'user' } }))
    await f.handle.agent.whenIdle()
    const ref = await save.mock.results[0].value
    const child = f.ctx.sessions.fork(f.handle.agent.session, undefined, SessionId('synthetic-result-child'))
    const inherited = await f.ctx.spillStore.readResult({ file_path: ref.locator, limit: Buffer.byteLength(original) }, { ...f.exec, agent: { session: child } }, 'settings')
    expect(inherited.content).toBe(original)
    const firstUser = f.handle.agent.session.snapshotEvents().find(event => event.type === 'user/message')
    const earlier = f.ctx.sessions.fork(f.handle.agent.session, firstUser.seq, SessionId('synthetic-result-earlier-child'))
    await expect(f.ctx.spillStore.readResult({ file_path: ref.locator }, { ...f.exec, agent: { session: earlier } }, 'settings')).rejects.toThrow('不属于')
    const grandchild = f.ctx.sessions.fork(child, undefined, SessionId('synthetic-result-grandchild'))
    expect((await f.ctx.spillStore.readResult({ file_path: ref.locator }, { ...f.exec, agent: { session: grandchild } }, 'settings')).content).toBeTruthy()
    save.mockRestore()
  })

  it('keeps a reader response above the spill budget intact without writing another spill file', async () => {
    const f = await fixture()
    const original = `${'合成😀'.repeat(30_000)}最后关键词`
    const ref = await f.save(original)
    const save = vi.spyOn(f.ctx.spillStore, 'saveText')
    const result = await f.handle.agent.ctx.tools.execute({ callId: 'read-complete-result', name: RESULT_READER,
      arguments: { result: { file_path: ref.locator, limit: Buffer.byteLength(original) } }, ...f.exec })
    expect(result.isError).not.toBe(true)
    expect(result.value.content).toBe(original)
    expect(JSON.parse(result.content[0].text).content).toBe(original)
    expect(save).not.toHaveBeenCalled()
    expect(filterDeclarations([{ name: RESULT_READER }], ['builtin:other', 'builtin:workspace'])).toEqual([{ name: RESULT_READER }])
    save.mockRestore()
  })

  it('recovers a PTC dispatch artifact, keeps its reader log whole, and permits an inheriting fork', async () => {
    let ref
    const original = '合成程序工具正文😀'.repeat(20_001)
    const f = await fixture({ stream: async function* (_options, step) {
      yield { type: 'block-start', index: 0, blockType: step <= 2 ? 'tool-call' : 'text' }
      yield { type: 'block-end', index: 0, block: step <= 2
        ? { type: 'tool-call', id: `synthetic-ptc-${step}`, name: 'run_code', arguments: JSON.stringify({ code: step === 1 ? 'source' : 'read', description: '合成程序工具续读' }) }
        : { type: 'text', text: '合成程序工具已完整读取' } }
      yield { type: 'finish', reason: { kind: step <= 2 ? 'tool-calls' : 'stop' } }
    } })
    class SyntheticRuntime extends PtcRuntime {
      language = 'typescript'
      isolation = 'synthetic'
      resolve(request) { return { ...request, cwd: f.root, timeoutMs: 30_000 } }
      async run(request) {
        const tools = request.bindings[0].functions
        if (request.program === 'source') expect(await tools.eleckoi_glob_setting_files({})).toBe(original)
        else expect((await tools[RESULT_READER]({ result: { file_path: ref.locator, limit: Buffer.byteLength(original) } })).content).toBe(original)
        return { logs: [], value: '合成程序读取完成' }
      }
    }
    await f.ctx.plugin(SyntheticRuntime)
    const stop = f.handle.agent.ctx.tools.presentAs('ptc')
    cleanups.push(stop)
    f.handle.agent.ctx.tools.register(defineTool({ name: 'eleckoi_glob_setting_files', description: '合成程序数据源', parameters: {},
      output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] }, execute: () => original }))
    const save = vi.spyOn(f.ctx.spillStore, 'saveText').mockImplementation(async input => {
      ref = await ToolResultStore.prototype.saveText.call(f.ctx.spillStore, input); return ref
    })
    f.handle.agent.followup(createUserMessage({ content: [{ type: 'text', text: '合成程序工具结果恢复' }], source: { kind: 'user' } }))
    await f.handle.agent.whenIdle()
    const dispatches = f.handle.agent.session.snapshotEvents().filter(event => event.type === 'tool/ptc-dispatch')
    expect(dispatches).toHaveLength(2)
    expect(dispatches.every(event => event.data.isError === false)).toBe(true)
    expect(JSON.parse(dispatches[1].data.content[0].text).content).toBe(original)
    expect(save).toHaveBeenCalledTimes(1)
    const child = f.ctx.sessions.fork(f.handle.agent.session, undefined, SessionId('synthetic-ptc-child'))
    expect((await f.ctx.spillStore.readResult({ file_path: ref.locator, limit: Buffer.byteLength(original) }, { ...f.exec, agent: { session: child } }, 'settings')).content).toBe(original)
    save.mockRestore()
  })

  it.each([101, 1_001, 10_001])('returns all %i entries to the model through actual spill and result-reader calls', async count => {
    const entries = Array.from({ length: count }, (_, index) => ({ id: `synthetic-${index}`, title: `合成条目-${index}`, content: `${'合成正文'.repeat(count === 101 ? 200 : 60)}|末尾关键词-${index}` }))
    const complete = JSON.stringify({ entries })
    let ref, reconstructed = '', nextOffset = 0
    const f = await fixture({ stream: async function* (options, step) {
      if (step > 1) {
        const result = options.messages.at(-1)
        if (step === 2) {
          expect(result.content[0].text).toContain(RESULT_READER)
          expect(result.content[0].text).toContain('Full formatted result stored at:')
        } else {
          const value = JSON.parse(result.content[0].text)
          reconstructed += value.content
          nextOffset = value.next_offset
        }
      }
      if (step === 1 || nextOffset !== null) {
        yield { type: 'block-start', index: 0, blockType: 'tool-call' }
        yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: `volume-call-${step}`,
          name: step === 1 ? 'eleckoi_glob_setting_files' : RESULT_READER,
          arguments: step === 1 ? '{}' : JSON.stringify({ result: { file_path: ref.locator, offset: nextOffset, limit: 250_000 } }) } }
        yield { type: 'finish', reason: { kind: 'tool-calls' } }
      } else {
        yield { type: 'block-start', index: 0, blockType: 'text' }
        yield { type: 'block-end', index: 0, block: { type: 'text', text: '合成全文恢复完成' } }
        yield { type: 'finish', reason: { kind: 'stop' } }
      }
    } })
    f.handle.agent.ctx.tools.register(defineTool({ name: 'eleckoi_glob_setting_files', description: '合成大结果', parameters: {},
      output: { schema: { type: 'object', additionalProperties: true }, render: () => [{ type: 'text', text: complete }] }, execute: () => ({ entries }) }))
    const save = vi.spyOn(f.ctx.spillStore, 'saveText').mockImplementationOnce(async input => {
      ref = await ToolResultStore.prototype.saveText.call(f.ctx.spillStore, input)
      return ref
    })
    f.handle.agent.followup(createUserMessage({ content: [{ type: 'text', text: '合成大量条目完整读取' }], source: { kind: 'user' } }))
    await f.handle.agent.whenIdle()
    expect(reconstructed).toBe(complete)
    expect(JSON.parse(reconstructed).entries).toHaveLength(count)
    expect(f.handle.agent.session.snapshotEvents().filter(event => event.type === 'turn/end').at(-1).data.reason).toEqual({ kind: 'completed' })
    expect(save).toHaveBeenCalledTimes(1)
    save.mockRestore()
  })
})
