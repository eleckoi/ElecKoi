import { readSessionInspection } from '@eleckoi/dsh-product-api'
import TypertGateway from '@deepseek-ai/dsh-api-gateway'
import * as NativeToolExecutor from '@deepseek-ai/dsh-tool-executor-native'
import WorkingDirectory from '@deepseek-ai/dsh-working-directory'
import RemoteAccessService from '@deepseek-ai/dsh-api-remote-access'
import { Context } from '@deepseek-ai/cordis'
import { randomUUID } from 'node:crypto'
import Loader, { Group } from '@deepseek-ai/cordis-plugin-loader'
import AgentPresetRegistry from '@deepseek-ai/dsh-agent-preset-registry'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import SessionStore, { Session, SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SessionQuery from '@deepseek-ai/dsh-session-query-sqlite'
import * as JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import LocalAttachmentStore from '@deepseek-ai/dsh-attachment-local'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import FileUploads from '@deepseek-ai/dsh-client-file-upload'
import Commands from '@deepseek-ai/dsh-commands'
import SessionController from '@deepseek-ai/dsh-api-session-controller'
import TypertRegistry from '@deepseek-ai/dsh-typert-registry'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import TokenMeter from '@deepseek-ai/dsh-token-meter'
import * as spillPolicy from '@deepseek-ai/dsh-spill-policy'
import ToolResultStore from '../../packages/client/features/dsh-client-roleplay/src/host/tool-result-store.mjs'
import { emptyEntry } from '../../packages/host/product-data/src/domain/settingLibraries/index'
import LlmRuntime, { LlmAdapter, createUserMessage, createAssistantMessage } from '@deepseek-ai/dsh-llm'
import productDataPlugin from '@eleckoi/dsh-product-data'
import { CharacterConfigurationChangeFeed, ProductRecordChangeFeed, ElecKoiConversationModelsApi } from '../../packages/host/product-api/src/index'
import { installCreatorStudioRuntime, CREATOR_RUNTIME_PRESET_ID } from '../../packages/client/features/dsh-client-creator-studio/src/host/runtime.mjs'
import { materializeAgentPreset } from '@eleckoi/dsh-client-roleplay'
import * as roleplayPlugin from '../../packages/client/features/dsh-client-roleplay/src/index.js'
import * as sessionEditPlugin from '../../packages/host/runtime/src/sessionEditPlugin'
import { ElecKoiConversationLifecycle } from '../../packages/host/product-api/src/conversationLifecycle'
import { ConversationChangeFeed, ElecKoiConversationsApi, ElecKoiVariableProcessing } from '../../packages/host/product-api/src/index'
import SessionProjectionCache from '@deepseek-ai/dsh-session-projection-cache'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageJson from '@deepseek-ai/dsh-storage-json'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import { creatorStudioProjection, CREATOR_STUDIO_EVENT } from '../../packages/client/features/dsh-client-creator-studio/src/host/projection.mjs'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { captureSerializedRequest } from '../helpers/captureModelRequest.js'

const RESULT_READER = 'eleckoi_call_capability'
const cleanups = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })

async function fixture(existing, { productionTemplate = false, stream, legacy = false, roleplay = false } = {}) {
  const root = existing?.root ?? mkdtempSync(join(tmpdir(), 'eleckoi-studio-files-'))
  if (!existing) cleanups.push(async () => {
    const child = relative(tmpdir(), root)
    if (!child || child.startsWith('..') || isAbsolute(child)) throw new Error('Unexpected cleanup path')
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
  })
  const resources = join(root, 'resources'), template = join(resources, 'agent-preset-template', 'agent.cordis.yml')
  mkdirSync(join(resources, 'agent-preset-template'), { recursive: true })
  const sections = ['creator', 'variables', 'setting-library', 'web', 'workspace', 'collaboration', 'roleplay-workflow', 'workflow']
  writeFileSync(template, productionTemplate ? readFileSync(resolve('apps/desktop/resources/dsh/agent-preset-template/agent.cordis.yml'), 'utf8')
    : '- id: tool-fs\n  name: \'@deepseek-ai/dsh-tool-fs\'\n  config: { write: false, edit: false, applyPatch: false }\n' + sections.map(id => `# ELECKOI:${id}:BEGIN\n# ELECKOI:${id}:END\n`).join(''))
  for (const [key, value] of Object.entries({ ELECKOI_DATABASE_PATH: join(root, 'product.sqlite'), ELECKOI_MEDIA_ROOT: join(root, 'media'),
    ELECKOI_PRESET_ROOT: join(root, 'presets'), ELECKOI_PRESET_TEMPLATE_PATH: template, ELECKOI_WORKSPACE_ROOT: root,
    ...(roleplay ? { ELECKOI_SESSION_SNAPSHOT_ROOT: join(root, 'snapshots'), ELECKOI_SESSION_BRIDGE_ROOT: join(root, 'bridges'), DSH_SESSION_ROOT: join(root, 'sessions') } : {}) })) {
    const previous = process.env[key]; process.env[key] = value
    cleanups.push(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous })
  }
  mkdirSync(join(root, 'media'), { recursive: true })
  const ctx = new Context(), requests = [], requestedPaths = new Map()
  cleanups.push(() => ctx.fiber.dispose())
  ctx.provide('settings', { describe: () => [] })
  let defaultSelection = { provider: 'synthetic', model: 'synthetic' }
  ctx.provide('agentDefaultModel', { currentSelection: () => ({ ...defaultSelection }), saveSelection: async selection => { defaultSelection = { ...selection } } })
  ctx.provide('workspaceRegistry', { pinnedSessionIds: [], archivedSessionIds: [] })
  ctx.provide('connection', { fetch: { register: () => () => {} } })
  for (const plugin of [LlmRuntime, SessionStore, SessionProjectionRegistry, SystemPrompt, ToolRuntime, NativeToolExecutor, AgentRegistry, Commands, TypertRegistry, TokenMeter]) await ctx.plugin(plugin)
  await ctx.plugin(JsonlSessionPersistence, { root: join(root, 'sessions'), compression: 'none' })
  await ctx.plugin(SessionQuery, { path: join(root, 'query.sqlite') })
  await ctx.plugin(LocalAttachmentStore, { dshHome: root })
  await ctx.plugin(LocalFileSystem, { cwd: root })
  await ctx.plugin(WorkingDirectory, { defaultDirectory: root })
  await ctx.plugin(ToolResultStore, { root: join(root, 'tool-results'), cleanupPeriodDays: 0 })
  await ctx.plugin(spillPolicy, { maxInlineTokens: 12_500, pagedTools: ['eleckoi_read_setting_files', 'eleckoi_read_variables', RESULT_READER] })
  await ctx.plugin(FileUploads)
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(productDataPlugin)
  ctx.provide('eleckoiCharacterConfigurationChanges', new CharacterConfigurationChangeFeed())
  ctx.provide('eleckoiProductRecordChanges', new ProductRecordChangeFeed())
  await ctx.sessionProjections.register(creatorStudioProjection)
  await ctx.plugin(Loader)
  ctx.loader.builtins.group = Group
  await ctx.plugin(AgentPresetRegistry, { default: 'synthetic-unused-preset' })
  await ctx.agentPresets.register({ id: 'cordis', name: 'Synthetic baseline', plugins: [] })
  await ctx.plugin(TypertGateway)
  await ctx.plugin(RemoteAccessService)
  await ctx.plugin(SessionController, { nativeOpen: false })
  await ctx.plugin(ElecKoiConversationModelsApi)
  if (roleplay) {
    await ctx.plugin(Storage)
    for (const [plugin, config] of [[StorageJson, { root: join(root, 'storage') }], [StorageDomain, { backend: 'json' }]]) {
      const { name, inject, apply, Config } = plugin
      await ctx.plugin({ name, inject, apply, Config }, config)
    }
    await ctx.plugin(SessionProjectionCache, { writeEveryEvents: 100, writeIntervalMs: 60000 })
    await ctx.plugin(ElecKoiConversationLifecycle)
    const changes = new ConversationChangeFeed(), variables = new ElecKoiVariableProcessing(ctx.eleckoiProductData)
    ctx.provide('eleckoiConversationChanges', changes)
    ctx.provide('eleckoiVariableProcessing', variables)
    cleanups.push(() => { changes.close(); variables.close() })
    await ctx.plugin(roleplayPlugin)
    await ctx.plugin(sessionEditPlugin)
    await vi.waitFor(() => expect(ctx.get('eleckoiRoleplaySessions')).toBeDefined())
    await ctx.plugin(ElecKoiConversationsApi)
  }
  const expectedContent = '合成上传内容：synthetic-file-marker'
  class Adapter extends LlmAdapter {
    async resolveModel(provider, id) { return { provider, id, name: id, inputModalities: ['text', 'image'], context: { contextWindow: 10_000_000 }, defaultMaxTokens: 8192,
      reasoning: { efforts: [{ id: 'low', name: 'Low' }, { id: 'high', name: 'High' }] } } }
    async listModels(provider) { return Promise.all(['synthetic', 'model-a', 'model-b'].map(id => this.resolveModel(provider, id))) }
    async *stream(options) {
      requests.push(options)
      if (stream) { yield* stream(options, requests.length); return }
      const last = options.messages.at(-1)
      if (last.role === 'user') {
        const uploaded = (await ctx.sessionQuery.readSurface(options.sessionId)).events
          .findLast(event => event.type === 'user/message' && event.data.source.kind === 'user').data.content.find(part => part.type === 'file').attachment
        const filePath = requestedPaths.get(options.sessionId) ?? ctx.fs.processPathFromHostPath(ctx.attachments.fileHostPath(uploaded))
        yield { type: 'block-start', index: 0, blockType: 'tool-call' }
        yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: `synthetic-read-${requests.length}`,
          name: 'read', arguments: JSON.stringify({ file_path: filePath }) } }
        yield { type: 'finish', reason: { kind: 'tool-calls' } }
      } else {
        yield { type: 'block-start', index: 0, blockType: 'text' }
        yield { type: 'text-delta', index: 0, text: '合成读取完成' }
        yield { type: 'block-end', index: 0, block: { type: 'text', text: '合成读取完成' } }
        yield { type: 'finish', reason: { kind: 'stop' } }
      }
    }
  }
  ctx.llm.registerAdapter(['synthetic'], new Adapter())
  const legacySessions = []
  if (legacy) {
    const preset = ctx.eleckoiProductData.readAgentPreset(ctx.eleckoiProductData.readAgentPresetCatalog().activePresetIds.creator)
    for (let index = 0; index < 2; index++) {
      const id = `eleckoi-creator-${String(index + 1).repeat(64)}`
      materializeAgentPreset(join(root, 'presets', 'creator-studio'), template, { ...preset, versionId: preset.activeVersionId },
        { disabledGroupIds: preset.toolGroups.filter(group => !group.included || !group.enabled).map(group => group.id) }, {},
        { id, plugins: [{ id: 'creator-studio-agent', name: '@eleckoi/dsh-client-creator-studio/agent', config: { presetId: preset.id, creatorTools: true } }] })
      const prepared = ctx.sessions.prepare(SessionId(`synthetic-legacy-studio-${index}`), { meta: { cwd: root, agentPreset: id } })
      const session = Session.create(prepared.id, [], prepared.header)
      session.append(CREATOR_STUDIO_EVENT, { presetId: preset.id, characterId: '' }, { ignorable: true })
      session.append('turn/start', { turn: 1 })
      session.append('step/start', { turn: 1, step: 1 })
      session.append('user/message', createUserMessage({ content: [{ type: 'text', text: `Synthetic retained input ${index}` }], source: { kind: 'user' } }), { surfaceOp: 'append' })
      session.append('assistant/message', { turn: 1, step: 1, stream: [], message: createAssistantMessage({ content: [{ type: 'text', text: `Synthetic retained reply ${index}` }], source: { provider: 'synthetic', model: 'synthetic' } }) }, { surfaceOp: 'append' })
      session.append('step/end', { turn: 1, step: 1 })
      session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
      session.append('session/title', { title: `Synthetic retained title ${index}`, messageSeqs: [], source: { kind: 'user' } })
      const handle = await ctx.sessionPersistence.create(session.header)
      try { await handle.append(session.snapshotEvents()); await handle.flush() } finally { await handle.close() }
      legacySessions.push({ id: session.id, presetId: id, events: session.snapshotEvents() })
    }
  }
  const runtimePlugin = { name: 'synthetic-studio-file-runtime',
    inject: ['agents', 'agentPresets', 'agentDefaultModel', 'llm', 'settings', 'sessionController', 'sessionQuery', 'sessionPersistence', 'sessions', 'sessionProjections', 'eleckoiProductData', 'workspaceRegistry'],
    apply: installCreatorStudioRuntime }
  await ctx.plugin(runtimePlugin)
  const service = ctx.eleckoiCreatorStudioRuntime
  const opened = existing ? await service.open(existing.sessionId) : legacy ? await service.open(legacySessions[0].id) : await service.create()
  async function sendFile(sessionId, { content = expectedContent, readPath } = {}) {
    const { agent } = await ctx.sessionController.resolveAgent(sessionId)
    if (readPath === undefined) requestedPaths.delete(sessionId)
    else requestedPaths.set(sessionId, readPath)
    const receipt = await ctx.fileUploads.upload(agent, { data: Buffer.from(content).toString('base64'), name: 'synthetic-notes.md' }, new AbortController().signal)
    await ctx.sessionController.prompt({ sessionId, requestId: `synthetic-upload-${randomUUID()}`, mode: 'queue',
      content: [{ type: 'text', text: '读取上传文件' }, { type: 'file', receiptId: receipt.receiptId }] }, new AbortController().signal)
    await agent.whenIdle()
    return { agent, receipt }
  }
  return { ctx, root, opened, requests, expectedContent, sendFile, service, legacySessions, async restart() {
    await ctx.fiber.dispose()
    return fixture({ root, sessionId: opened.sessionId }, { productionTemplate, stream })
  } }
}

describe('Creator studio uploaded-file composition', { timeout: 30_000 }, () => {
  it.each([true, false])('discovers and edits an explicit character without changing the shortcut binding, roleplay=%s', async roleplay => {
    const calls = [
      ['eleckoi_list_toolsets', {}],
      ['eleckoi_describe_toolset', { toolset_id: 'character', operation_ids: ['character.list', 'character.read', 'character.update'], include_schema: true }],
      ['eleckoi_call_capability', { capability_id: 'character.list', arguments: { query: 'Other' } }],
      ['eleckoi_call_capability', { capability_id: 'character.read', character_id: 'other-target', arguments: {} }],
      ['eleckoi_call_capability', { capability_id: 'character.update', character_id: 'other-target', arguments: { name: 'Updated target' } }],
    ]
    let step = 0
    const f = await fixture(undefined, { productionTemplate: true, roleplay, stream: async function* () {
      const call = calls[step++]
      if (call) {
        yield { type: 'block-start', index: 0, blockType: 'tool-call' }
        yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: `authoring-${step}`, name: call[0], arguments: JSON.stringify(call[1]) } }
        yield { type: 'finish', reason: { kind: 'tool-calls' } }; return
      }
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: '<FINAL>Authoring complete</FINAL>' } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    } })
    const data = f.ctx.eleckoiProductData
    data.createCharacter({ id: 'shortcut-character', name: 'Shortcut unchanged', persona: { assistant_name: 'Shortcut' } })
    data.createCharacter({ id: 'other-target', name: 'Other target' })
    const purpose = roleplay ? 'roleplay' : 'creator'
    const preset = data.readAgentPreset(data.readAgentPresetCatalog().activePresetIds[purpose])
    data.saveAgentPreset({ ...preset, toolGroups: preset.toolGroups.map(group => ({ ...group, included: group.id === 'builtin:creator', enabled: group.id === 'builtin:creator' })) }, preset.regexRules)
    const id = roleplay ? (await f.ctx.eleckoiConversationsApi.create({ metadata: { characterId: 'shortcut-character' } })).conversation.id : f.opened.sessionId
    if (roleplay) await f.ctx.eleckoiRoleplaySessions.preparePrompt(id, 'Discover and edit Other target')
    else await f.service.open(id)
    await f.ctx.sessionController.prompt({ sessionId: id, requestId: 'authoring-discovery', mode: 'queue', content: [{ type: 'text', text: 'Discover and edit Other target' }] }, new AbortController().signal)
    await f.ctx.agents.get(id).whenIdle()
    expect(f.requests).toHaveLength(6)
    for (const request of f.requests) expect(request.tools.map(tool => tool.name)).toEqual(expect.arrayContaining(calls.map(call => call[0])))
    const messages = (await f.ctx.sessionQuery.readSurface(id)).events
    const results = messages.filter(event => event.type === 'tool/result')
    expect(results).toHaveLength(5)
    expect(JSON.stringify(results)).toContain('Other target')
    expect(JSON.stringify(results)).not.toContain('isError":true')
    expect(data.readCharacters().items.find(item => item.id === 'other-target').name).toBe('Updated target')
    expect(data.readCharacters().items.find(item => item.id === 'shortcut-character').name).toBe('Shortcut unchanged')
    if (roleplay) {
      expect(data.readConversationDetails(id).metadata.characterId).toBe('shortcut-character')
      expect(messages.some(event => event.type === CREATOR_STUDIO_EVENT)).toBe(false)
      await f.ctx.eleckoiConversationLifecycle.wait(id, f.ctx.eleckoiRoleplaySessions.currentOperation(id))
      data.saveAgentPreset({ ...preset, toolGroups: preset.toolGroups.map(group => ({ ...group, included: false, enabled: false })) }, preset.regexRules)
      await f.ctx.eleckoiRoleplaySessions.preparePrompt(id, 'Disabled now')
      await f.ctx.sessionController.prompt({ sessionId: id, requestId: 'authoring-disabled', mode: 'queue', content: [{ type: 'text', text: 'Disabled now' }] }, new AbortController().signal)
      await f.ctx.agents.get(id).whenIdle()
      expect(f.requests.at(-1).tools.map(tool => tool.name)).not.toEqual(expect.arrayContaining(['eleckoi_call_capability']))
    } else expect(f.ctx.sessionProjections.stateOf(f.ctx.agents.get(id).session, creatorStudioProjection.key).characterId).toBe('')
  })
  it('reads desktop paths and Android-style uploads in actual roleplay with Workspace tools disabled', async () => {
    const external = mkdtempSync(join(tmpdir(), 'eleckoi-official-read-'))
    const filePath = join(external, '工作区之外.txt'), marker = 'OFFICIAL_OUTSIDE_WORKSPACE_正文'
    writeFileSync(filePath, marker)
    cleanups.push(() => rm(external, { recursive: true, force: true, maxRetries: 5 }))
    let f
    f = await fixture(undefined, { productionTemplate: true, roleplay: true, stream: async function* (request, step) {
      const last = request.messages.findLast(message => message.role === 'tool' || message.role === 'user' && message.source?.kind === 'user')
      if (last.role === 'user') {
        const surface = await f.ctx.sessionQuery.readSurface(request.sessionId)
        const content = surface.events.findLast(event => event.type === 'user/message').data.content
        const file = content.find(part => part.type === 'file')?.attachment
        const image = content.find(part => part.type === 'image')?.attachment
        const target = image ? f.ctx.fs.processPathFromHostPath(f.ctx.attachments.imageHostPath(image))
          : file ? f.ctx.fs.processPathFromHostPath(f.ctx.attachments.fileHostPath(file)) : filePath
        yield { type: 'block-start', index: 0, blockType: 'tool-call' }
        yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: `native-read-${step}`, name: image ? 'read_image' : 'read', arguments: JSON.stringify({ file_path: target }) } }
        yield { type: 'finish', reason: { kind: 'tool-calls' } }; return
      }
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: '<FINAL>Read through the native tool</FINAL>' } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    } })
    const data = f.ctx.eleckoiProductData, api = f.ctx.eleckoiConversationsApi
    data.createCharacter({ id: 'native-reader-character', name: 'Native reader', persona: { assistant_name: 'Reader' } })
    const preset = data.readAgentPreset(data.readAgentPresetCatalog().activePresetIds.roleplay)
    data.saveAgentPreset({ ...preset, toolGroups: preset.toolGroups.map(group => ({ ...group, enabled: false })) }, preset.regexRules)
    const source = await api.create({ metadata: { characterId: 'native-reader-character' } }), id = source.conversation.id
    await f.ctx.eleckoiRoleplaySessions.preparePrompt(id, `@${filePath}`)
    await f.ctx.sessionController.prompt({ sessionId: id, requestId: 'native-path', mode: 'queue', content: [{ type: 'text', text: `@${filePath}` }] }, new AbortController().signal)
    await f.ctx.agents.get(id).whenIdle()
    expect(f.requests[1].messages.findLast(message => message.role === 'tool').content[0].text).toContain(marker)
    await f.ctx.eleckoiConversationLifecycle.wait(id, f.ctx.eleckoiRoleplaySessions.currentOperation(id))
    await f.ctx.eleckoiRoleplaySessions.preparePrompt(id, '读取上传文件')
    await f.sendFile(id, { content: marker })
    expect(f.requests[3].messages.findLast(message => message.role === 'tool').content[0].text).toContain(marker)
    await f.ctx.eleckoiConversationLifecycle.wait(id, f.ctx.eleckoiRoleplaySessions.currentOperation(id))
    await f.ctx.eleckoiRoleplaySessions.preparePrompt(id, '读取图片')
    const png = readFileSync('apps/web/src/assets/eleckoi-app-icon.png')
    const image = await f.ctx.fileUploads.uploadImageStream({ sessionId: id, data: (async function* () { yield png })(), mediaType: 'image/png', name: '手机相册.png' })
    await f.ctx.sessionController.prompt({ sessionId: id, requestId: 'native-image', mode: 'queue', content: [{ type: 'text', text: '读取图片' }, { type: 'file', receiptId: image.receiptId }] }, new AbortController().signal)
    await f.ctx.agents.get(id).whenIdle()
    expect(f.requests).toHaveLength(6)
    expect(f.requests.at(-1).messages.findLast(message => message.role === 'tool').content.some(part => part.type === 'image')).toBe(true)
    for (const request of f.requests) {
      const names = request.tools.map(tool => tool.name)
      expect(names).toEqual(expect.arrayContaining(['read', 'read_image']))
      for (const name of ['write', 'edit', 'apply_patch', 'pwsh', 'bash', 'shell_command', 'eleckoi_read_uploaded_file']) expect(names).not.toContain(name)
    }
    expect(readFileSync(filePath, 'utf8')).toBe(marker)
  })
  it('regenerates an archive imported into another character through the production roleplay bridge without a local snapshot', async () => {
    const f = await fixture(undefined, { productionTemplate: true, roleplay: true, stream: async function* () {
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: '<FINAL>Synthetic roleplay reply</FINAL>' } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    } })
    const data = f.ctx.eleckoiProductData, api = f.ctx.eleckoiConversationsApi
    for (const key of ['source', 'target']) data.createCharacter({ id: `synthetic-${key}`, name: `Synthetic ${key}`, group: '', persona: { assistant_name: `Synthetic ${key}` } })
    const preset = data.readAgentPreset(data.readAgentPresetCatalog().activePresetIds.roleplay)
    data.saveAgentPreset({ ...preset, toolGroups: preset.toolGroups.map(group => ({ ...group, enabled: false })) }, preset.regexRules)
    const source = await api.create({ metadata: { characterId: 'synthetic-source' } })
    const sourceId = source.conversation.id
    await f.ctx.eleckoiRoleplaySessions.preparePrompt(sourceId, 'Synthetic archive input')
    await f.ctx.sessionController.prompt({ sessionId: sourceId, requestId: 'synthetic-archive-source', mode: 'queue', content: [{ type: 'text', text: 'Synthetic archive input' }] }, new AbortController().signal)
    await f.ctx.agents.get(sourceId).whenIdle()
    await f.ctx.eleckoiConversationLifecycle.wait(sourceId, f.ctx.eleckoiRoleplaySessions.currentOperation(sourceId))
    const imported = await api.importArchive('synthetic-target', await api.exportArchive(sourceId))
    const snapshot = join(f.root, 'snapshots', `${imported}.json`)
    expect(existsSync(snapshot)).toBe(false)
    expect(data.readConversationDetails(imported).metadata.characterId).toBe('synthetic-target')
    const before = await readSessionInspection(f.ctx, imported)
    const input = before.events.find(event => event.type === 'user/message')
    const prepared = await api.regenerateMessage(imported, input.seq, 'synthetic-import-regeneration')
    expect(await api.startRegeneration(imported, 'synthetic-import-regeneration', false)).toMatchObject({ accepted: true })
    await f.ctx.agents.get(imported).whenIdle()
    await f.ctx.eleckoiConversationLifecycle.wait(imported, prepared.operationId)
    const after = await readSessionInspection(f.ctx, imported)
    expect(after.events.filter(event => event.type === 'user/message' && event.data.source.kind === 'user').map(event => event.data.id)).toEqual([input.data.id])
    expect(after.events.at(-1)).toMatchObject({ type: 'turn/end', data: { reason: { kind: 'completed' } } })
    expect(JSON.parse(readFileSync(snapshot, 'utf8')).conversationId).toBe(imported)
    expect(f.ctx.eleckoiRequestPreviews.list(imported)).toHaveLength(1)
    const repeated = await api.regenerateMessage(imported, input.seq, 'synthetic-import-regeneration-again', 'Synthetic edited archive input')
    await api.startRegeneration(imported, 'synthetic-import-regeneration-again', false)
    await f.ctx.agents.get(imported).whenIdle()
    await f.ctx.eleckoiConversationLifecycle.wait(imported, repeated.operationId)
    const again = await readSessionInspection(f.ctx, imported)
    expect(again.events.filter(event => event.type === 'user/message' && event.data.source.kind === 'user')).toMatchObject([
      { data: { id: input.data.id, content: [{ type: 'text', text: 'Synthetic edited archive input' }] } },
    ])
    expect(again.events.at(-1)).toMatchObject({ type: 'turn/end', data: { reason: { kind: 'completed' } } })
    expect(f.ctx.eleckoiRequestPreviews.list(imported)).toHaveLength(2)
    expect((await readSessionInspection(f.ctx, sourceId)).events.filter(event => event.type === 'user/message' && event.data.source.kind === 'user'))
      .toMatchObject([{ data: { content: [{ type: 'text', text: 'Synthetic archive input' }] } }])
  })

  it('keeps official model selections and numeric parameters independent across Sessions, actual requests and cold reopen', async () => {
    const f = await fixture(undefined, { stream: async function* () {
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: 'Synthetic isolated reply' } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    } })
    const first = f.opened.sessionId, second = (await f.service.create()).sessionId
    const choose = (sessionId, model, reasoningEffort) => f.ctx.sessionController.selectModel({ sessionId, provider: 'synthetic', model, reasoningEffort })
    await choose(first, 'model-a', 'high'); await choose(second, 'model-b', 'low')
    const api = f.ctx.eleckoiConversationModelsApi
    await api.saveParameters(first, 'synthetic', 'model-a', { temperature: 0.3, topP: 0.7, maxOutputTokens: 1234, contextWindowTokens: 30000, autoCompactTokenLimit: 15000 }, 0)
    await api.saveParameters(second, 'synthetic', 'model-b', { temperature: 0.8, maxOutputTokens: 4321 }, 0)
    expect((await api.parameters(first)).entries['["synthetic","model-a"]']).toMatchObject({ temperature: 0.3, maxOutputTokens: 1234 })
    const requestParameters = vi.spyOn(api, 'parameterState')
    await expect(api.saveParameters(first, 'synthetic', 'model-a', { temperature: 0.9 }, 0)).rejects.toMatchObject({ code: 'eleckoi/conflict/stale-revision' })
    await expect(api.saveParameters(first, 'synthetic', 'model-a', { topP: 1.5 }, 1)).rejects.toMatchObject({ code: 'eleckoi/model/config-invalid' })
    for (const sessionId of [first, second]) {
      await f.service.open(sessionId)
      await f.ctx.sessionController.prompt({ sessionId, requestId: `isolated-${sessionId}`, mode: 'queue', content: [{ type: 'text', text: 'Synthetic input' }] }, new AbortController().signal)
      await f.ctx.agents.get(sessionId).whenIdle()
    }
    expect(requestParameters.mock.calls.map(call => call[0].id)).toContain(first)
    expect(f.requests.filter(request => request.sessionId === first).at(-1)).toMatchObject({ model: 'model-a', reasoningEffort: 'high', temperature: 0.3, topP: 0.7, maxTokens: 1234 })
    expect(f.requests.filter(request => request.sessionId === second).at(-1)).toMatchObject({ model: 'model-b', reasoningEffort: 'low', temperature: 0.8, maxTokens: 4321 })
    const fresh = await f.service.create()
    expect(f.ctx.agents.get(fresh.sessionId).model.current()).toMatchObject({ model: 'model-b', reasoningEffort: 'low' })
    expect(await api.parameters(fresh.sessionId)).toEqual({ revision: 0, entries: {} })
    await choose(first, 'model-b', 'low')
    await f.ctx.sessionController.prompt({ sessionId: first, requestId: 'same-session-other-model', mode: 'queue', content: [{ type: 'text', text: 'Synthetic other model' }] }, new AbortController().signal)
    await f.ctx.agents.get(first).whenIdle()
    expect(f.requests.at(-1)).toMatchObject({ model: 'model-b', maxTokens: 8192 })
    expect(f.requests.at(-1).temperature).toBeUndefined()
    expect(f.requests.at(-1).topP).toBeUndefined()
    await choose(first, 'model-a', 'high')
    const reopened = await f.restart()
    expect(reopened.ctx.agents.get(first).model.current()).toMatchObject({ model: 'model-a', reasoningEffort: 'high' })
    expect((await reopened.ctx.eleckoiConversationModelsApi.parameters(first)).entries['["synthetic","model-a"]']).toMatchObject({ temperature: 0.3, maxOutputTokens: 1234 })
    await reopened.ctx.sessionController.prompt({ sessionId: first, requestId: 'isolated-cold-reopen', mode: 'queue', content: [{ type: 'text', text: 'Synthetic reopened input' }] }, new AbortController().signal)
    await reopened.ctx.agents.get(first).whenIdle()
    expect(reopened.requests.at(-1)).toMatchObject({ model: 'model-a', temperature: 0.3, maxTokens: 1234 })
    expect(reopened.ctx.agents.get(first).session.snapshotEvents().filter(event => event.type === 'eleckoi/model-parameters')).toHaveLength(1)
  })
  it('uses the global preset in existing Sessions on their first request and keeps one generated configuration', async () => {
    const f = await fixture(undefined, { stream: async function* () {
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: 'Synthetic reply' } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    } })
    const first = f.opened, second = await f.service.create()
    const data = f.ctx.eleckoiProductData
    const current = data.readAgentPreset(data.readAgentPresetCatalog().activePresetIds.creator)
    const changed = data.createAgentPreset('Synthetic current creator preset', '', 'creator')
    const marker = 'SYNTHETIC_CURRENT_GLOBAL_PRESET'
    data.saveAgentPreset({ ...changed, entries: [...changed.entries, { ...emptyEntry('synthetic-global-prompt'), content: marker, agentReadStrategy: 'required' }],
      toolGroups: changed.toolGroups.map(group => group.id === 'builtin:creator' ? { ...group, enabled: false } : group) }, changed.regexRules)
    data.setActiveAgentPreset(changed.id)
    for (const opened of [first, second]) {
      const { agent } = await f.ctx.sessionController.resolveAgent(opened.sessionId)
      await f.ctx.sessionController.prompt({ sessionId: agent.id, requestId: randomUUID(), mode: 'queue', content: [{ type: 'text', text: 'Synthetic next turn' }] }, new AbortController().signal)
      await agent.whenIdle()
      expect(agent.session.snapshotEvents().findLast(event => event.type === 'turn/end').data.reason).toEqual({ kind: 'completed' })
      const request = f.requests.at(-1)
      expect(JSON.stringify(request.messages)).toContain(marker)
      expect(request.tools.map(tool => tool.name)).not.toContain('eleckoi_call_capability')
      expect(f.ctx.agentPresets.composedPreset(agent.ctx)).toBe(CREATOR_RUNTIME_PRESET_ID)
      expect(f.ctx.sessionProjections.stateOf(agent.session, creatorStudioProjection.key).presetId).toBe(changed.id)
    }
    data.setActiveAgentPreset(current.id)
    const { agent } = await f.ctx.sessionController.resolveAgent(first.sessionId)
    await f.ctx.sessionController.prompt({ sessionId: agent.id, requestId: randomUUID(), mode: 'queue', content: [{ type: 'text', text: 'Synthetic restored creator tools' }] }, new AbortController().signal)
    await agent.whenIdle()
    expect(f.requests.at(-1).tools.map(tool => tool.name)).toContain('eleckoi_call_capability')
    expect(JSON.stringify(f.requests.at(-1).messages)).not.toContain(marker)
    await f.service.create()
    expect((await f.ctx.agentPresets.compositionInventory()).map(preset => preset.id)).toEqual(['cordis', CREATOR_RUNTIME_PRESET_ID])
    expect(readdirSync(join(f.root, 'presets', 'creator-studio'))).toEqual([CREATOR_RUNTIME_PRESET_ID])
    const id = first.sessionId, before = agent.session.snapshotEvents()
    await f.ctx.sessions.flush(agent.session)
    const reopened = await f.restart()
    expect(reopened.opened.sessionId).toBe(id)
    const resumed = (await reopened.ctx.sessionController.resolveAgent(id)).agent
    expect(resumed.session.snapshotEvents().slice(0, before.length)).toEqual(before)
    expect(resumed.ctx.tools.schemas(resumed).map(tool => tool.name)).toContain('eleckoi_call_capability')
  })

  it('converts both historical generated presets through persistence and resumes their original Sessions', async () => {
    const f = await fixture(undefined, { legacy: true })
    for (const original of f.legacySessions) {
      const opened = await f.service.open(original.id)
      const { agent } = await f.ctx.sessionController.resolveAgent(original.id)
      expect(opened.sessionId).toBe(original.id)
      expect(agent.session.snapshotEvents().slice(0, original.events.length)).toEqual(original.events)
      expect(agent.session.snapshotEvents().filter(event => event.type === 'agent-preset/selected')).toHaveLength(1)
      expect(agent.session.snapshotEvents().findLast(event => event.type === 'agent-preset/selected').data.agentPreset).toBe(CREATOR_RUNTIME_PRESET_ID)
      expect(agent.session.snapshotEvents().findLast(event => event.type === 'session/title').data.title).toContain('Synthetic retained title')
      expect((await f.service.messages(original.id)).map(message => message.text)).toEqual([
        `Synthetic retained input ${f.legacySessions.indexOf(original)}`, `Synthetic retained reply ${f.legacySessions.indexOf(original)}`,
      ])
      expect(existsSync(join(f.root, 'presets', 'creator-studio', original.presetId))).toBe(false)
    }
    expect((await f.ctx.agentPresets.compositionInventory()).map(preset => preset.id)).toEqual(['cordis', CREATOR_RUNTIME_PRESET_ID])
    await f.ctx.sessionPersistence.flush()
    const reopened = await f.restart()
    for (const original of f.legacySessions) {
      const { agent } = await reopened.ctx.sessionController.resolveAgent(original.id)
      expect(agent.session.snapshotEvents().filter(event => event.type === 'agent-preset/selected')).toHaveLength(1)
    }
  })

  it('finishes an active tool round with its preset and applies a global switch to the queued turn', async () => {
    let started, release
    const firstRequest = new Promise(resolve => { started = resolve })
    const resume = new Promise(resolve => { release = resolve })
    const f = await fixture(undefined, { stream: async function* (_request, step) {
      if (step === 1) {
        started()
        await resume
        yield { type: 'block-start', index: 0, blockType: 'tool-call' }
        yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: 'synthetic-before-global-switch', name: 'eleckoi_list_toolsets', arguments: '{}' } }
        yield { type: 'finish', reason: { kind: 'tool-calls' } }
      } else {
        yield { type: 'block-start', index: 0, blockType: 'text' }
        yield { type: 'block-end', index: 0, block: { type: 'text', text: 'Synthetic completed turn' } }
        yield { type: 'finish', reason: { kind: 'stop' } }
      }
    } })
    const data = f.ctx.eleckoiProductData
    const { agent } = await f.ctx.sessionController.resolveAgent(f.opened.sessionId)
    await f.ctx.sessionController.prompt({ sessionId: agent.id, requestId: randomUUID(), mode: 'queue', content: [{ type: 'text', text: 'Synthetic active turn' }] }, new AbortController().signal)
    await firstRequest
    try {
      const changed = data.createAgentPreset('Synthetic queued creator preset', '', 'creator')
      data.saveAgentPreset({ ...changed, entries: [...changed.entries, { ...emptyEntry('synthetic-queued-prompt'), content: 'SYNTHETIC_QUEUED_PRESET', agentReadStrategy: 'required' }],
        toolGroups: changed.toolGroups.map(group => group.id === 'builtin:creator' ? { ...group, enabled: false } : group) }, changed.regexRules)
      data.setActiveAgentPreset(changed.id)
      await f.ctx.sessionController.prompt({ sessionId: agent.id, requestId: randomUUID(), mode: 'queue', content: [{ type: 'text', text: 'Synthetic queued turn' }] }, new AbortController().signal)
    } finally { release() }
    await agent.whenIdle()
    expect(f.requests).toHaveLength(3)
    expect(f.requests[1].tools.map(tool => tool.name)).toContain('eleckoi_list_toolsets')
    expect(JSON.stringify(f.requests[1].messages)).not.toContain('SYNTHETIC_QUEUED_PRESET')
    expect(f.requests[2].tools.map(tool => tool.name)).not.toContain('eleckoi_list_toolsets')
    expect(JSON.stringify(f.requests[2].messages)).toContain('SYNTHETIC_QUEUED_PRESET')
    expect(agent.session.snapshotEvents().filter(event => event.type === 'turn/end').map(event => event.data.reason.kind)).toEqual(['completed', 'completed'])
  })

  it('moves a queued instruction into the running Studio turn without waiting for its active request to finish', async () => {
    let started, release
    const firstRequest = new Promise(resolve => { started = resolve })
    const resume = new Promise(resolve => { release = resolve })
    const f = await fixture(undefined, { stream: async function* (_request, step) {
      if (step === 1) { started(); await resume }
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: 'Synthetic completed step' } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    } })
    const { agent } = await f.ctx.sessionController.resolveAgent(f.opened.sessionId)
    const prompt = text => f.ctx.sessionController.prompt({ sessionId: agent.id, requestId: randomUUID(), mode: 'queue',
      content: [{ type: 'text', text }] }, new AbortController().signal)
    await prompt('Synthetic running task')
    await firstRequest
    try {
      await prompt('Synthetic later queued turn')
      await prompt('Synthetic inserted instruction')
      const inserted = agent.inbox.nextTurn[1]
      await f.ctx.sessionController.updateQueue({ sessionId: agent.id, itemId: inserted.id, action: { kind: 'steer' } })
      expect(agent.status).toBe('running')
      expect(f.requests).toHaveLength(1)
      expect(agent.inbox.nextStep.map(message => message.id)).toEqual([inserted.id])
      expect(agent.inbox.nextTurn.map(message => message.content[0].text)).toEqual(['Synthetic later queued turn'])
    } finally { release() }
    await agent.whenIdle()
    expect(f.requests).toHaveLength(3)
    expect(JSON.stringify(f.requests[1].messages)).toContain('Synthetic inserted instruction')
    expect(JSON.stringify(f.requests[1].messages)).not.toContain('Synthetic later queued turn')
    const inputs = agent.session.snapshotEvents().filter(event => event.type === 'user/message' && event.data.source.kind === 'user')
    expect(inputs.map(event => event.data.content[0].text)).toEqual(['Synthetic running task', 'Synthetic inserted instruction', 'Synthetic later queued turn'])
    expect(agent.session.snapshotEvents().filter(event => event.type === 'turn/start')).toHaveLength(2)
    expect(agent.inbox.nextStep).toHaveLength(0)
    expect(agent.inbox.nextTurn).toHaveLength(0)
  })

  it('reads a complete large upload with the native line windows and preserves the tail', async () => {
    const lines = Array.from({ length: 10001 }, (_, index) => `Synthetic 😀 line ${index + 1}`)
    let f, offset = 1, recovered = []
    f = await fixture(undefined, { productionTemplate: true, stream: async function* (request, step) {
      if (step > 1) {
        const text = request.messages.at(-1).content[0].text
        const page = [...text.matchAll(/^(\d+): (.*)$/gm)]
        expect(page.length).toBeGreaterThan(0)
        recovered.push(...page.map(row => row[2]))
        offset = Number(page.at(-1)[1]) + 1
        if (offset > lines.length) {
          yield { type: 'block-start', index: 0, blockType: 'text' }
          yield { type: 'block-end', index: 0, block: { type: 'text', text: 'Synthetic upload recovered' } }
          yield { type: 'finish', reason: { kind: 'stop' } }; return
        }
      }
      const surface = await f.ctx.sessionQuery.readSurface(request.sessionId)
      const file = surface.events.findLast(event => event.type === 'user/message' && event.data.source.kind === 'user').data.content.find(part => part.type === 'file').attachment
      const file_path = f.ctx.fs.processPathFromHostPath(f.ctx.attachments.fileHostPath(file))
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: `synthetic-upload-read-${step}`, name: 'read', arguments: JSON.stringify({ file_path, offset, limit: 1000 }) } }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
    } })
    await f.sendFile(f.opened.sessionId, { content: lines.join('\n') })
    expect(recovered).toEqual(lines)
    expect(f.requests.at(-1).tools.some(tool => tool.name === 'eleckoi_read_uploaded_file')).toBe(false)
  })

  it('continues a large write receipt through the existing creator call without repeating the write', async () => {
    const body = `${'合成正文😀'.repeat(20_001)}最终写入关键词`
    let ref, read
    const f = await fixture(undefined, { productionTemplate: true, stream: async function* (request, step) {
      if (step === 3) {
        const page = JSON.parse(request.messages.at(-1).content[0].text)
        expect(page.kind).toBe('tool_result_page')
        expect(page.matches).toHaveLength(1)
        read = true
        yield { type: 'block-start', index: 0, blockType: 'text' }
        yield { type: 'block-end', index: 0, block: { type: 'text', text: '合成写入回执已读取' } }
        yield { type: 'finish', reason: { kind: 'stop' } }; return
      }
      const args = step === 1 ? { capability_id: 'settings.create', arguments: { title: '合成写入条目', content: body } }
        : { result: { file_path: ref.locator, query: '最终写入关键词' } }
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: `synthetic-write-receipt-${step}`, name: RESULT_READER, arguments: JSON.stringify(args) } }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
    } })
    const character = f.ctx.eleckoiProductData.createCharacter({ id: 'synthetic-write-target', name: '合成编辑目标', group: '' }).items[0]
    await f.service.selectCharacter(f.opened.sessionId, character.id)
    const before = f.ctx.eleckoiProductData.readSettingLibrary(character.id).entries.length
    const originalSave = f.ctx.spillStore.saveText.bind(f.ctx.spillStore)
    const save = vi.spyOn(f.ctx.spillStore, 'saveText').mockImplementation(async input => { ref = await originalSave(input); return ref })
    const { agent } = await f.ctx.sessionController.resolveAgent(f.opened.sessionId)
    await f.ctx.sessionController.prompt({ sessionId: agent.id, requestId: 'synthetic-write-receipt', mode: 'queue', content: [{ type: 'text', text: '创建一条合成设定并续读回执' }] }, new AbortController().signal)
    await agent.whenIdle()
    expect(read).toBe(true)
    const after = f.ctx.eleckoiProductData.readSettingLibrary(character.id).entries
    expect(after).toHaveLength(before + 1)
    expect(after.filter(entry => entry.title === '合成写入条目').map(entry => entry.content)).toEqual([body])
    expect(save).toHaveBeenCalledTimes(1)
    save.mockRestore()
  })

  it('uploads through the official receipt flow and reads the text during the Agent tool loop', async () => {
    const f = await fixture()
    const { agent, receipt } = await f.sendFile(f.opened.sessionId)
    expect(f.requests[0].tools.map(tool => tool.name)).toContain('read')
    expect(f.requests[0].tools.filter(tool => tool.name === 'read')).toHaveLength(1)
    expect(JSON.stringify(f.requests[0].messages)).toContain('synthetic-notes.md')
    expect(JSON.stringify(f.requests[1].messages)).toContain(f.expectedContent)
    expect(agent.session.deriveMessages().find(message => message.role === 'user').content)
      .toContainEqual({ type: 'file', attachment: receipt.file })
    await f.ctx.sessions.flush(agent.session)
    const id = agent.id
    const reopened = await f.restart()
    expect(reopened.opened.sessionId).toBe(id)
    await reopened.sendFile(id)
    expect(reopened.requests.at(-1).messages.some(message => JSON.stringify(message).includes(f.expectedContent))).toBe(true)
  })

  it('restores the required reader when an existing generated studio preset omitted it', async () => {
    const f = await fixture()
    const { agent } = await f.sendFile(f.opened.sessionId)
    const presetId = (await readSessionInspection(f.ctx, agent.id)).meta.agentPreset
    const path = join(f.root, 'presets', 'creator-studio', presetId, 'preset.json')
    const definition = JSON.parse(readFileSync(path, 'utf8'))
    definition.plugins = definition.plugins.filter(plugin => plugin.id !== 'tool-fs')
    writeFileSync(path, JSON.stringify(definition))
    const reopened = await f.restart()
    // Resume must retain the conversation identity and the persisted file reference.
    expect(reopened.opened.sessionId).toBe(agent.id)
    await reopened.sendFile(agent.id)
    expect(reopened.requests.at(-2).tools.map(tool => tool.name)).toContain('read')
    expect(JSON.stringify(reopened.requests.at(-1).messages)).toContain(f.expectedContent)
    expect(JSON.parse(readFileSync(path, 'utf8')).plugins.map(plugin => plugin.id)).toContain('tool-fs')
  })

  it('requires an actual native file path rather than treating an attachment digest as a filesystem path', async () => {
    const f = await fixture()
    const peer = await f.service.create()
    const foreignText = 'synthetic-other-session-private-content'
    const { receipt } = await f.sendFile(peer.sessionId, { content: foreignText })
    const before = f.requests.length
    await f.sendFile(f.opened.sessionId, { readPath: receipt.file.attachmentId })
    const request = f.requests.slice(before).at(-1)
    expect(request.sessionId).toBe(f.opened.sessionId)
    expect(JSON.stringify(request.messages)).toContain(receipt.file.attachmentId)
    expect(JSON.stringify(request.messages)).not.toContain(foreignText)
  })

  it('reports binary content as unsupported text instead of claiming to read it', async () => {
    const f = await fixture()
    await f.sendFile(f.opened.sessionId, { content: Buffer.from([0x41, 0, 0x42]) })
    expect(JSON.stringify(f.requests.at(-1).messages)).toMatch(/binary|Binary/)
  })
})
