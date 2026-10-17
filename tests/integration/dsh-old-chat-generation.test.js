import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { LlmRuntime, createAssistantMessage, createSystemMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import * as piAi from '@deepseek-ai/dsh-llm-pi-ai'
import SessionController from '@deepseek-ai/dsh-api-session-controller'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { SessionProjectionRegistry } from '@deepseek-ai/dsh-session-projection'
import TypertRegistry from '@deepseek-ai/dsh-typert-registry'
import TypertGatewayService from '@deepseek-ai/dsh-api-gateway'
import { afterEach, describe, expect, it } from 'vitest'
import productDataPlugin from '@eleckoi/dsh-product-data'
import { LocalMediaStore } from '@eleckoi/dsh-product-data/media'
import { ConversationChangeFeed, ElecKoiConversationsApi, ElecKoiVariableProcessing } from '@eleckoi/dsh-product-api'
import { ElecKoiConversationLifecycle } from '../../packages/host/product-api/src/conversationLifecycle'
import { TYPERT } from '@eleckoi/dsh-product-api/typert'
import { RequestPreviewStore } from '../../packages/client/features/dsh-client-roleplay/src/host/request-preview.mjs'
import { SqliteDatabase } from '../../packages/host/product-data/src/storage/sqlite/SqliteDatabase'
import { CharacterRepository } from '../../packages/host/product-data/src/domain/personas/CharacterRepository'
import { ConversationRepository } from '../../packages/host/product-data/src/domain/conversations/ConversationRepository'
import { emptyEntry } from '../../packages/host/product-data/src/domain/settingLibraries/settingLibraryNormalization'
import { MessageRepository } from '../../packages/host/product-data/src/domain/conversations/MessageRepository'
import { restoreLegacyConversationStorage, insertLegacyReply } from '../../packages/host/product-data/tests/helpers/conversationStorageV11'
import { installSchema } from '../../packages/host/product-data/src/storage/sqlite/installSchema'
import { readDshSessionLog } from '../../packages/host/runtime/src/trajectory'
import * as sessionEditPlugin from '../../packages/host/runtime/src/sessionEditPlugin'
import { installRoleplaySessionRuntime } from '../../packages/client/features/dsh-client-roleplay/src/host/session-runtime.mjs'
import { writeSessionSnapshot } from '../../packages/client/features/dsh-client-roleplay/src/host/session-snapshot.mjs'

const cleanups = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })

async function fixture(withOpening = true, { failPreparation = false,
  historicalVariableState = '{}', bindHistory = true, additionalHistoryTurn, finalReply = false, native = false, multipleSteps = false, emptySession = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'eleckoi-old-generation-'))
  cleanups.push(() => {
    const child = relative(tmpdir(), root)
    if (!child || child.startsWith('..') || isAbsolute(child)) throw new Error('Unexpected test cleanup path')
    rmSync(root, { recursive: true, force: true })
  })
  const env = {
    ELECKOI_DATABASE_PATH: join(root, 'product.sqlite3'),
    ELECKOI_MEDIA_ROOT: join(root, 'media'),
    ELECKOI_WORKSPACE_ROOT: join(root, 'workspace'),
    ELECKOI_PRESET_ROOT: join(root, 'presets'),
    ELECKOI_PRESET_TEMPLATE_PATH: resolve('apps/desktop/resources/dsh/agent-preset-template/agent.cordis.yml'),
    ELECKOI_SESSION_SNAPSHOT_ROOT: join(root, 'snapshots'),
    ELECKOI_SESSION_BRIDGE_ROOT: join(root, 'bridges'),
    DSH_HOME: join(root, 'dsh-home'),
    DSH_SESSION_ROOT: join(root, 'sessions')
  }
  for (const [key, value] of Object.entries(env)) {
    const previous = process.env[key]
    process.env[key] = value
    cleanups.push(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous })
  }
  mkdirSync(env.ELECKOI_WORKSPACE_ROOT)
  const database = new SqliteDatabase(env.ELECKOI_DATABASE_PATH)
  database.open()
  let conversationId, userId
  try {
    const conversations = new ConversationRepository(database, () => ({
      initialVariableStateJson: historicalVariableState, openingText: withOpening ? '合成开场白' : '',
      openingOptions: [], selectedOpeningId: ''
    }))
    new CharacterRepository(database, conversations, new LocalMediaStore(env.ELECKOI_MEDIA_ROOT)).create({
      id: 'synthetic-character', name: '合成角色', group: '',
      persona: { assistant_name: '合成角色', assistant_avatar: '', assistant_cover: '' }
    })
    conversationId = conversations.create({ metadata: {
      characterId: 'synthetic-character', characterPersona: { assistant_name: '合成角色' }
    } }).conversation.id
    userId = 'synthetic-user-input'
    const reply = { id: 'synthetic-old-reply' }
    if (!native) {
      restoreLegacyConversationStorage(database.native)
      insertLegacyReply(database.native, conversationId, { userId, replyId: reply.id, before: historicalVariableState,
        after: historicalVariableState, turn: bindHistory ? 1 : null })
      if (additionalHistoryTurn !== undefined) {
        insertLegacyReply(database.native, conversationId, { userId, replyId: 'synthetic-additional-reply', before: historicalVariableState,
          after: historicalVariableState, turn: additionalHistoryTurn, responseIndex: 1 })
      }
      installSchema(database.native)
      expect(new MessageRepository(database).listMetadata(conversationId).filter(message => message.id !== 'opening')
        .every(message => message.content === '')).toBe(true)
      expect(new MessageRepository(database).listMetadata(conversationId).map((message) => message.id))
        .toEqual(expect.arrayContaining([userId, reply.id]))
    }
  } finally { database.close() }

  const ctx = new Context()
  cleanups.push(() => ctx.fiber.dispose())
  const sessionRoot = join(root, 'sessions')
  await ctx.plugin(JsonlSessionPersistence, { root: sessionRoot, compression: 'none' })
  const session = Session.create(SessionId(conversationId))
  if (!emptySession) session.append('model/selection', { provider: 'removed-provider', model: 'old-model' })
  let userEvent
  if (!emptySession) {
  session.append('turn/start', { turn: 1 })
  session.append('step/start', { turn: 1, step: 1 })
  session.append('system/message', { turn: 1, step: 1, message: createSystemMessage('合成系统配置') }, { surfaceOp: 'append' })
  const input = createUserMessage({ content: [{ type: 'text', text: '合成旧输入' }], source: { kind: 'user' } })
  userEvent = session.append('user/message', { ...input, id: userId }, { surfaceOp: 'append' })
  session.append('assistant/message', { turn: 1, step: 1, stream: [], message: createAssistantMessage({
    content: [{ type: 'text', text: finalReply ? '<FINAL>Synthetic reply</FINAL>' : '合成旧回复' }], source: { provider: 'test', model: 'test' }
  }) }, { surfaceOp: 'append' })
  session.append('step/end', { turn: 1, step: 1 })
  if (multipleSteps) {
    session.append('step/start', { turn: 1, step: 2 })
    session.append('assistant/message', { turn: 1, step: 2, stream: [], message: createAssistantMessage({
      content: [{ type: 'text', text: '<FINAL>Synthetic settled reply</FINAL>' }], source: { provider: 'test', model: 'test' }
    }) }, { surfaceOp: 'append' })
    session.append('step/end', { turn: 1, step: 2 })
  }
  session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  }
  const handle = await ctx.sessionPersistence.create(session.header)
  await handle.append(session.snapshotEvents())
  await handle.flush()
  await handle.close()
  const followed = []
  const createAgent = current => {
    const scope = new Context()
    cleanups.push(() => scope.fiber.dispose())
    return { id: SessionId(conversationId), ctx: scope, session: current, status: 'idle',
      continueFromInput: id => {
        const input = current.deriveMessages().find(message => message.id === id)
        if (!input) throw new Error('Selected input is not retained')
        followed.push(input)
        return 2
      } }
  }
  let agent = createAgent(session)
  let globalModelSelection = { provider: 'test', model: 'test' }
  const flush = async () => {
    const logged = readDshSessionLog(sessionRoot, conversationId)
    const writer = await ctx.sessionPersistence.open(SessionId(conversationId), 'write')
    try { await writer.append(agent.session.snapshotEvents().slice(logged.events.length)); await writer.flush() }
    finally { await writer.close() }
  }
  const reload = () => {
    const log = readDshSessionLog(sessionRoot, conversationId)
    agent = createAgent(Session.create(SessionId(conversationId), log.events, log.header, log.inheritedEventCount))
  }
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin({ name: 'synthetic-generation-services',
    provide: ['agentDefaultModel', 'agents', 'eleckoiSessionHandles', 'eleckoiConversationChanges',
      'attachments', 'fileUploads', 'fs', 'sessions', 'sessionQuery', 'workspaceRegistry', 'sessionProjectionCache', 'credentials', 'settings'],
    apply(owner) {
      owner.provide('agentDefaultModel', {
        currentSelection: () => ({ ...globalModelSelection }),
        saveSelection: async (selection) => { globalModelSelection = { ...selection } }
      })
      owner.provide('agents', { get: () => agent })
      owner.provide('sessions', { get: () => agent.session })
      owner.provide('attachments', { imageLimits: { maxImageBytes: 1000000, maxImagesPerMessage: 4,
        maxMessageImageBytes: 4000000, maxImagePixels: 1000000, maxImageDimension: 1000, mediaTypes: ['image/png'] } })
      owner.provide('fileUploads', { registerAgentResolver: () => () => {} })
      owner.provide('fs', {})
      owner.provide('sessionQuery', {})
      owner.provide('workspaceRegistry', {})
      owner.provide('sessionProjectionCache', { write: async () => {} })
      owner.provide('credentials', { resolve: async () => ({ value: 'synthetic-key', source: 'test' }) })
      owner.provide('settings', { describe: () => [{ ns: 'eleckoi-client-models', value: { entries: {
        test: { parameters: { test: { temperature: 0.6, topP: 0.8 } } }
      } } }] })
      const changes = new ConversationChangeFeed()
      owner.provide('eleckoiConversationChanges', changes)
      owner.on('dispose', () => changes.close())
      owner.provide('eleckoiSessionHandles', { withClosed: async (_id, action) => {
        await flush()
        try { return await action() } finally { reload() }
      } })
    }
  })
  await ctx.plugin(productDataPlugin)
  const variables = new ElecKoiVariableProcessing(ctx.eleckoiProductData)
  ctx.provide('eleckoiVariableProcessing', variables)
  cleanups.push(() => variables.close())
  await ctx.plugin(ElecKoiConversationLifecycle)
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(piAi, { providers: { test: { api: 'openai-responses', baseURL: 'http://127.0.0.1:1/v1',
    apiKeyEnv: 'SYNTHETIC_KEY', models: [{ id: 'test', contextWindow: 100000, maxTokens: 8000 }] } } })
  writeSessionSnapshot(env.ELECKOI_SESSION_SNAPSHOT_ROOT, conversationId, { conversationId,
    model: { provider: 'removed-provider', model: 'old-model', temperature: 0.1, topP: 0.1 } })
  await ctx.plugin(TypertRegistry)
  await ctx.plugin(SessionController, {})
  await ctx.plugin(sessionEditPlugin)
  let preparationCount = 0
  cleanups.push(installRoleplaySessionRuntime(ctx, {
    registerForSession: async () => undefined,
    prepareForSession: async () => undefined,
    selectForSession: async () => {
      if (failPreparation && ++preparationCount === 1) throw new Error('Synthetic preparation failure')
    }
  }))
  cleanups.push(ctx.typert.register(TYPERT))
  await ctx.plugin(TypertGatewayService)
  const previews = new RequestPreviewStore()
  ctx.provide('eleckoiRequestPreviews', previews)
  cleanups.push(() => previews.close())
  await ctx.plugin(ElecKoiConversationsApi)
  const select = async (selection = { provider: 'test', model: 'test' }) => {
    globalModelSelection = { ...selection }
  }
  await select()
  return { ctx, env, conversationId, userEvent, sessionRoot, followed, select, flush, getAgent: () => agent }
}

function contextBridge(f) {
  return JSON.parse(readFileSync(join(f.env.ELECKOI_SESSION_BRIDGE_ROOT, f.conversationId,
    'eleckoi-conversation-context.json'), 'utf8'))
}

function settingBridge(f) {
  return JSON.parse(readFileSync(join(f.env.ELECKOI_SESSION_BRIDGE_ROOT, f.conversationId,
    'eleckoi-setting-library-state.json'), 'utf8'))
}

describe('old chat request preparation', { timeout: 30_000 }, () => {
  it('stores one native completed boundary across multiple assistant messages without using reply rows or retired files', async () => {
    const f = await fixture(false, { native: true, multipleSteps: true })
    const data = f.ctx.eleckoiProductData
    const retiredFile = join(f.env.ELECKOI_SESSION_BRIDGE_ROOT, f.conversationId, 'eleckoi-runtime-checkpoints.json')
    mkdirSync(join(f.env.ELECKOI_SESSION_BRIDGE_ROOT, f.conversationId), { recursive: true })
    writeFileSync(retiredFile, 'Synthetic invalid retired file')
    data.replaceConversationVariableState(f.conversationId, '{"score":10}')
    data.recordRuntimeBeforeTurn(f.conversationId, f.conversationId, 1)
    data.replaceConversationVariableState(f.conversationId, '{"score":20}')
    writeSessionSnapshot(f.env.ELECKOI_SESSION_SNAPSHOT_ROOT, f.conversationId, {
      conversationId: f.conversationId, operationId: 'native-completion', variablesEnabled: false,
      generationVariableStateJson: '{"score":20}'
    })
    f.ctx.sessions.flush = async () => { await f.flush(); return true }
    f.ctx.eleckoiConversationLifecycle.begin({ operationId: 'native-completion', conversationId: f.conversationId,
      runtimeSessionId: f.conversationId, turn: 1 })
    const session = f.getAgent().session
    expect(session.snapshotEvents().filter(event => event.type === 'assistant/message')).toHaveLength(2)
    f.ctx.emit('session/event', session, session.snapshotEvents().find(event => event.type === 'turn/end'))
    await f.ctx.eleckoiConversationLifecycle.wait(f.conversationId, 'native-completion')
    expect(JSON.parse(data.runtimeStateAt(f.conversationId, f.conversationId, 1, 'before').variableStateJson)).toEqual({ score: 10 })
    expect(data.captureRuntimeHistory(f.conversationId).filter(row => row.phase === 'after')).toHaveLength(1)
    expect(data.exportConversationArchive(f.conversationId).tables.agent_responses).toEqual([])
    const timeline = await f.ctx.eleckoiConversationsApi.variableTimeline(f.conversationId)
    expect(timeline.floors.find(floor => floor.label === '第 1 楼').state.root).toEqual({ score: 20 })
    const exported = JSON.parse(await f.ctx.eleckoiConversationsApi.exportArchive(f.conversationId))
    expect(exported.sessionLogs).toHaveLength(1)
    expect(exported.snapshot.tables.conversation_state_snapshots).toHaveLength(2)
    expect(readFileSync(retiredFile, 'utf8')).toBe('Synthetic invalid retired file')
  })

  it('uses official transcript bindings and the same database history for imported messages without writing reply rows', async () => {
    const f = await fixture(false, { native: true, emptySession: true })
    const bindings = await f.ctx.eleckoiSessionEditor.importTranscript(f.conversationId, [
      { role: 'user', content: 'Synthetic imported input', variableStateJson: '{"score":1}' },
      { role: 'assistant', content: 'Synthetic imported reply', variableStateJson: '{"score":2}' }
    ])
    const data = f.ctx.eleckoiProductData
    const turn = bindings[1].turn
    data.saveImportedTranscript(f.conversationId, bindings, undefined, '{"score":9}')
    expect(data.captureRuntimeHistory(f.conversationId)).toEqual(expect.arrayContaining([
      expect.objectContaining({ phase: 'after', turn, variableStateJson: '{"score":2}', settingLibraryStateJson: '[]' })
    ]))
    expect(data.exportConversationArchive(f.conversationId).tables.agent_responses).toEqual([])
    expect(JSON.parse(data.runtimeStateAt(f.conversationId, f.conversationId, turn, 'before', bindings[0].id).variableStateJson)).toEqual({ score: 1 })
    expect(data.runtimeStateAt(f.conversationId, f.conversationId, turn, 'after').variableStateJson).toBe('{"score":2}')
    expect(JSON.parse(data.snapshotConversationRuntime(f.conversationId).variableStateJson)).toEqual({ score: 9 })
    const timeline = await f.ctx.eleckoiConversationsApi.variableTimeline(f.conversationId)
    expect(timeline.floors[0].state.root).toEqual({ score: 2 })
  })

  it('adopts a fork at its completed state and starts the next boundary without overwriting cloned history', async () => {
    const f = await fixture(false, { native: true, finalReply: true })
    const data = f.ctx.eleckoiProductData
    data.replaceConversationVariableState(f.conversationId, '{"score":1}')
    data.recordRuntimeBeforeTurn(f.conversationId, f.conversationId, 1)
    const task = { ...emptyEntry('synthetic-accepted-task', '2026-10-01T00:00:00.000Z'), title: 'Accepted task', content: 'Synthetic accepted task' }
    const taskState = JSON.stringify([{ targetType: 'entry', targetId: task.id, operation: 'upsert',
      payloadJson: JSON.stringify(task), updatedAt: '2026-10-01T00:00:00.000Z' }])
    data.restoreConversationRuntime(f.conversationId, { ...data.snapshotConversationRuntime(f.conversationId), settingLibraryStateJson: taskState })
    data.completeConversationRuntime(f.conversationId, f.conversationId, 1, '{"score":2}', data.snapshotConversationRuntime(f.conversationId).variableStateJson)
    data.replaceConversationVariableState(f.conversationId, '{"score":99}')
    const snapshot = data.exportConversationArchive(f.conversationId)
    const forkId = 'synthetic-state-fork', forkSession = 'synthetic-fork-session'
    data.importConversationArchive(snapshot, 'synthetic-character', new Map([[f.conversationId, forkSession]]), forkId)
    const sourceInspection = await f.ctx.sessionController.inspect(f.conversationId)
    const originalInspect = f.ctx.sessionController.inspect.bind(f.ctx.sessionController)
    f.ctx.sessionController.inspect = async id => id === forkSession
      ? { ...sourceInspection, meta: { ...sourceInspection.meta, id: forkSession } } : originalInspect(id)
    await f.ctx.eleckoiRoleplaySessions.adoptFork(forkId, f.conversationId, 1, true)
    expect(JSON.parse(data.snapshotConversationRuntime(forkId).variableStateJson)).toEqual({ score: 2 })
    expect(JSON.parse(data.runtimeStateAt(forkId, forkSession, 1, 'before').variableStateJson)).toEqual({ score: 1 })
    expect(JSON.parse(data.runtimeStateAt(forkId, forkSession, 1, 'after').variableStateJson)).toEqual({ score: 2 })
    expect(JSON.parse(data.runtimeStateAt(forkId, forkSession, 2, 'before').variableStateJson)).toEqual({ score: 2 })
    expect(JSON.parse(data.snapshotConversationRuntime(forkId).settingLibraryStateJson)).toEqual(JSON.parse(taskState))
    const savedHistory = data.captureRuntimeHistory(f.conversationId)
    const rewind = f.ctx.eleckoiRoleplaySessions.prepareRestoreBeforeTurn(f.conversationId, f.conversationId, 1)
    rewind.apply(['synthetic-user-input'])
    expect(data.snapshotConversationRuntime(f.conversationId).settingLibraryStateJson).toBe('[]')
    expect(JSON.parse(data.snapshotConversationRuntime(forkId).settingLibraryStateJson)).toEqual(JSON.parse(taskState))
    rewind.rollback()
    expect(data.captureRuntimeHistory(f.conversationId)).toEqual(savedHistory)
    expect(JSON.parse(data.snapshotConversationRuntime(f.conversationId).settingLibraryStateJson)).toEqual(JSON.parse(taskState))
  })

  it('does not create a fork from an intermediate assistant step without a settled reply boundary', async () => {
    const f = await fixture(false, { native: true, multipleSteps: true })
    const intermediate = f.getAgent().session.snapshotEvents().find(event => event.type === 'assistant/message')
    let forks = 0
    f.ctx.sessionController.fork = async () => { forks += 1; throw new Error('Unexpected fork') }
    await expect(f.ctx.eleckoiConversationsApi.fork(f.conversationId, intermediate.seq, [], 'Synthetic branch')).rejects.toThrow('中间工具步骤')
    expect(forks).toBe(0)
  })

  it('rolls back the current-variable commit when saving a completed boundary fails', async () => {
    const f = await fixture(false, { native: true })
    const data = f.ctx.eleckoiProductData
    data.replaceConversationVariableState(f.conversationId, '{"score":1}')
    data.recordRuntimeBeforeTurn(f.conversationId, f.conversationId, 1)
    const db = new SqliteDatabase(f.env.ELECKOI_DATABASE_PATH)
    db.open()
    try { db.native.exec(`CREATE TRIGGER synthetic_failed_history BEFORE INSERT ON conversation_state_snapshots
      WHEN NEW.phase='after' BEGIN SELECT RAISE(ABORT,'Synthetic state failure'); END`) }
    finally { db.close() }
    expect(() => data.completeConversationRuntime(f.conversationId, f.conversationId, 1, '{"score":2}', data.snapshotConversationRuntime(f.conversationId).variableStateJson))
      .toThrow('Synthetic state failure')
    expect(JSON.parse(data.snapshotConversationRuntime(f.conversationId).variableStateJson)).toEqual({ score: 1 })
    expect(data.captureRuntimeHistory(f.conversationId).every(row => row.phase === 'before')).toBe(true)
  })

  it('reads a formally bound main-database history value without using a later pre-input checkpoint or current value', async () => {
    const f = await fixture(true, { historicalVariableState: '{"score":7}', finalReply: true })
    f.ctx.eleckoiProductData.replaceConversationVariableState(f.conversationId, '{"score":20}')
    await f.ctx.eleckoiRoleplaySessions.preparePrompt(f.conversationId, 'Synthetic next input')
    expect(f.ctx.eleckoiRoleplaySessions.variableStatesByTurn(f.conversationId)).toEqual({ '1': '{"score":7}' })
    const timeline = await f.ctx.eleckoiConversationsApi.variableTimeline(f.conversationId)
    expect(timeline.current.root).toEqual({ score: 20 })
    expect(timeline.floors.find(floor => floor.label === '第 1 楼').state.root).toEqual({ score: 7 })
  })

  it('reports missing historical variables without changing state or blocking the next prompt', async () => {
    const f = await fixture(true, { historicalVariableState: '{"score":7}', bindHistory: false, finalReply: true })
    const before = f.ctx.eleckoiProductData.snapshotConversationRuntime(f.conversationId)
    const timeline = await f.ctx.eleckoiConversationsApi.variableTimeline(f.conversationId)
    expect(timeline.floors.find(floor => floor.label === '第 1 楼').state).toMatchObject({ root: null, errorMessage: '无历史状态' })
    expect(f.ctx.eleckoiProductData.snapshotConversationRuntime(f.conversationId)).toEqual(before)
    expect(() => f.ctx.eleckoiConversationsApi.details(f.conversationId)).not.toThrow()
    await expect(f.ctx.eleckoiConversationsApi.preparePrompt(f.conversationId, 'Synthetic next input'))
      .resolves.toMatchObject({ runtimeSessionId: f.conversationId })
  })

  it('reports ambiguous historical variables without blocking the next prompt', async () => {
    const f = await fixture(true, { additionalHistoryTurn: 1, finalReply: true })
    const timeline = await f.ctx.eleckoiConversationsApi.variableTimeline(f.conversationId)
    expect(timeline.floors.find(floor => floor.label === '第 1 楼').state).toMatchObject({ root: null, errorMessage: '无历史状态' })
    expect(() => f.ctx.eleckoiConversationsApi.details(f.conversationId)).not.toThrow()
    await expect(f.ctx.eleckoiConversationsApi.preparePrompt(f.conversationId, 'Synthetic next input'))
      .resolves.toMatchObject({ runtimeSessionId: f.conversationId })
  })

  it('does not use an unrelated stored turn as the source of a displayed reply', async () => {
    const f = await fixture(true, { historicalVariableState: '{"score":7}', additionalHistoryTurn: 99, finalReply: true })
    expect(f.ctx.eleckoiProductData.readRuntimeVariableHistory(f.conversationId, 'unrelated-session')).toEqual([])
    const timeline = await f.ctx.eleckoiConversationsApi.variableTimeline(f.conversationId)
    expect(timeline.floors.find(floor => floor.label === '第 1 楼').state.root).toEqual({ score: 7 })
  })

  it('keeps the committed reply variables when later edits and prompt preparation change the next input state', async () => {
    const f = await fixture()
    const data = f.ctx.eleckoiProductData
    const operationId = 'synthetic-completion'
    mkdirSync(join(f.env.ELECKOI_SESSION_BRIDGE_ROOT, f.conversationId), { recursive: true })
    data.replaceConversationVariableState(f.conversationId, '{"score":10}')
    writeSessionSnapshot(f.env.ELECKOI_SESSION_SNAPSHOT_ROOT, f.conversationId, {
      conversationId: f.conversationId, operationId, variablesEnabled: false,
      generationVariableStateJson: '{"score":10}'
    })
    f.ctx.sessions.flush = async () => { await f.flush(); return true }
    f.ctx.eleckoiConversationLifecycle.begin({ operationId, conversationId: f.conversationId,
      runtimeSessionId: f.conversationId, turn: 1 })
    const session = f.getAgent().session
    f.ctx.emit('session/event', session, session.snapshotEvents().find(event => event.type === 'turn/end'))
    await f.ctx.eleckoiConversationLifecycle.wait(f.conversationId, operationId)
    expect(JSON.parse(f.ctx.eleckoiRoleplaySessions.variableStatesByTurn(f.conversationId)[1])).toEqual({ score: 10 })

    data.replaceConversationVariableState(f.conversationId, '{"score":20}')
    await f.ctx.eleckoiRoleplaySessions.preparePrompt(f.conversationId, 'Synthetic next input')
    expect(JSON.parse(data.readAuthorConversationState(f.conversationId).currentVariableStateJson)).toEqual({ score: 20 })
    expect(JSON.parse(f.ctx.eleckoiRoleplaySessions.variableStatesByTurn(f.conversationId)[1])).toEqual({ score: 10 })
  })

  it.each([true, false])('prepares new input with bound old replies and opening=%s', async withOpening => {
    const f = await fixture(withOpening)
    const before = readDshSessionLog(f.sessionRoot, f.conversationId).events
    await expect(f.ctx.eleckoiRoleplaySessions.preparePrompt(f.conversationId, '合成新输入'))
      .resolves.toBe(f.conversationId)
    expect(contextBridge(f)).toMatchObject({ historyMode: 'prefix', currentUserInput: '合成新输入',
      history: withOpening ? [{ role: 'assistant', content: '合成开场白' }] : [] })
    expect(readDshSessionLog(f.sessionRoot, f.conversationId).events).toEqual(before)
  })

  it('writes the visible conversation history into the setting library bridge', async () => {
    const f = await fixture(true, { finalReply: true })
    await f.ctx.eleckoiRoleplaySessions.preparePrompt(f.conversationId, '合成新输入')
    expect(settingBridge(f).history).toEqual([
      { role: 'assistant', content: '合成开场白' },
      { role: 'user', content: '合成旧输入' },
      { role: 'assistant', content: 'Synthetic reply' },
      { role: 'user', content: '合成新输入' }
    ])
  })

  it('rewinds an old native session and prepares and starts regeneration through Remote', async () => {
    const f = await fixture()
    await expect(f.ctx.typertGateway.invoke({ namespace: 'eleckoiConversations', method: 'regenerateMessage',
      args: { conversationId: f.conversationId, eventSeq: f.userEvent.seq,
        requestId: 'synthetic-regeneration', replacementMessage: '合成替换输入' } }))
      .resolves.toMatchObject({ runtimeSessionId: f.conversationId, prepared: true, operationId: expect.any(String) })
    expect(readDshSessionLog(f.sessionRoot, f.conversationId).events
      .filter(event => event.type === 'assistant/message')).toHaveLength(0)
    expect(contextBridge(f)).toMatchObject({ historyMode: 'prefix', currentUserInput: '合成替换输入',
      history: [{ role: 'assistant', content: '合成开场白' }] })
    expect(settingBridge(f).history).toEqual([
      { role: 'assistant', content: '合成开场白' },
      { role: 'user', content: '合成替换输入' }
    ])
    expect(JSON.parse(readFileSync(join(f.env.ELECKOI_SESSION_SNAPSHOT_ROOT, `${f.conversationId}.json`), 'utf8')).model)
      .toMatchObject({ provider: 'test', model: 'test', temperature: 0.6, topP: 0.8 })
    await expect(f.ctx.typertGateway.invoke({ namespace: 'eleckoiConversations', method: 'startRegeneration',
      args: { conversationId: f.conversationId, requestId: 'synthetic-regeneration', cancelled: false } }))
      .resolves.toEqual({ accepted: true, turn: 2 })
    expect(f.followed).toHaveLength(1)
    expect(f.followed[0]).toMatchObject({ id: f.userEvent.data.id,
      content: [{ type: 'text', text: '合成替换输入' }], source: f.userEvent.data.source })
    const retained = readDshSessionLog(f.sessionRoot, f.conversationId).events.find(event => event.seq === f.userEvent.seq)
    expect(retained).toMatchObject({ seq: f.userEvent.seq, time: f.userEvent.time,
      data: { id: f.userEvent.data.id, source: f.userEvent.data.source } })
  })

  it('rejects an unavailable global model repeatedly without discarding messages', async () => {
    const f = await fixture()
    await f.select({ provider: 'unavailable-current', model: 'test' })
    const before = readFileSync(readDshSessionLog(f.sessionRoot, f.conversationId).path, 'utf8')
    for (let attempt = 0; attempt < 2; attempt++) {
      await expect(f.ctx.eleckoiConversationsApi.regenerateMessage(f.conversationId, f.userEvent.seq, `retry-${attempt}`))
        .rejects.toThrow('no adapter registered')
      expect(readFileSync(readDshSessionLog(f.sessionRoot, f.conversationId).path, 'utf8')).toBe(before)
    }
  })

  it('restores the log and runtime if preparation fails after rewinding', async () => {
    const f = await fixture(true, { failPreparation: true })
    const logPath = readDshSessionLog(f.sessionRoot, f.conversationId).path
    const beforeLog = readFileSync(logPath, 'utf8')
    const beforeState = f.ctx.eleckoiProductData.snapshotConversationRuntime(f.conversationId)
    const snapshotPath = join(f.env.ELECKOI_SESSION_SNAPSHOT_ROOT, `${f.conversationId}.json`)
    const beforeSnapshot = readFileSync(snapshotPath, 'utf8')
    await expect(f.ctx.eleckoiConversationsApi.regenerateMessage(f.conversationId, f.userEvent.seq, 'failed-retry'))
      .rejects.toThrow('Synthetic preparation failure')
    expect(readFileSync(logPath, 'utf8')).toBe(beforeLog)
    expect(readFileSync(snapshotPath, 'utf8')).toBe(beforeSnapshot)
    expect(f.ctx.eleckoiProductData.snapshotConversationRuntime(f.conversationId)).toEqual(beforeState)
    await expect(f.ctx.eleckoiConversationsApi.regenerateMessage(f.conversationId, f.userEvent.seq, 'next-retry'))
      .resolves.toMatchObject({ prepared: true })
  })
})
