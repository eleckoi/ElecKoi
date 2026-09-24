import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DesktopGateway } from '../src/main/gateway/DesktopGateway'
import { AgentSessionCoordinator } from '../src/main/modules/agent/AgentSessionCoordinator'
import { GenerationRepository } from '../src/main/modules/agent/GenerationRepository'
import { ConversationRepository } from '../src/main/modules/conversations/ConversationRepository'
import { MessageRepository } from '../src/main/modules/conversations/MessageRepository'
import { ModelRepository } from '../src/main/modules/models/ModelRepository'
import { UserSettingsStore } from '../src/main/modules/settings/UserSettingsStore'
import { LocalMediaStore } from '../src/main/platform/filesystem/LocalMediaStore'
import type { VariableStateRepository } from '../src/main/modules/variables/VariableStateRepository'
import type { AgentPresetRepository } from '../src/main/modules/agentPresets'
import type { PersonaRepository } from '../src/main/modules/personas'
import { SqliteDatabase } from '../src/main/platform/sqlite/SqliteDatabase'
import type {
  AgentRunCallbacks,
  AgentRunInput,
  AgentRunResult,
  AgentRuntimePort
} from '../src/shared/contracts/agent/runtime'

interface Harness {
  coordinator: AgentSessionCoordinator
  conversations: ConversationRepository
  database: SqliteDatabase
  models: ModelRepository
  userSettings: UserSettingsStore
  conversationId: string
  events: Array<{ name: string; payload: unknown }>
  terminal: Promise<void>
  terminalRecords: unknown[]
}

const temporaryDirectories: string[] = []
const databases: SqliteDatabase[] = []

afterEach(() => {
  for (const database of databases.splice(0)) database.close()
  for (const directory of temporaryDirectories.splice(0)) {
    const child = relative(tmpdir(), directory)
    if (!child || child.startsWith('..') || isAbsolute(child)) throw new Error('Unexpected test cleanup path')
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('Agent session coordinator（Agent 会话协调器）', () => {
  it('persists the terminal message before announcing completion', async () => {
    const harness = createHarness({
      run: async (_input, callbacks) => {
        callbacks.onDelta('你')
        callbacks.onDelta('好')
        callbacks.onFinal('你好')
        return 'complete'
      }
    })

    harness.coordinator.start(harness.conversationId, '测试')
    await harness.terminal

    expect(harness.events.filter((event) => event.name === 'agent.output.delta')).toHaveLength(2)
    const createdMessages = new MessageRepository(harness.database).list(harness.conversationId)
    expect(harness.events.find((event) => event.name === 'messages.changed')).toEqual({
      name: 'messages.changed',
      payload: {
        conversationId: harness.conversationId,
        reason: 'sent',
        messageIds: createdMessages.map((message) => message.id)
      }
    })
    expect(harness.events.find((event) => event.name === 'agent.run.finished')).toMatchObject({
      payload: { message: { content: '你好', status: 'complete' } }
    })
    expect(harness.terminalRecords).toEqual([{ status: 'completed', state: 'succeeded', text: '你好' }])
    expect(harness.coordinator.inspect(harness.conversationId)).toEqual({
      active: false,
      conversationId: harness.conversationId
    })
    harness.database.close()
  })

  it('does not split a streamed Unicode character across checkpoints', async () => {
    let release!: () => void
    const held = new Promise<void>((resolve) => { release = resolve })
    const harness = createHarness({
      run: async (_input, callbacks) => {
        callbacks.onDelta('\uD83D')
        callbacks.onDelta('\uDE00')
        await held
        callbacks.onFinal('😀')
        return 'complete'
      }
    })

    harness.coordinator.start(harness.conversationId, 'Unicode 测试')
    expect(harness.database.native.prepare("SELECT text FROM agent_content_parts WHERE ownerType='response'").get()).toEqual({ text: '😀' })
    release()
    await harness.terminal
    expect(harness.events.find((event) => event.name === 'agent.run.finished')).toMatchObject({
      payload: { message: { content: '😀', status: 'complete' } }
    })
    harness.database.close()
  })

  it('commits cancellation immediately without waiting for the runtime to drain', async () => {
    let finishRuntime: ((result: AgentRunResult) => void) | undefined
    const harness = createHarness({
      run: () => new Promise<AgentRunResult>((resolve) => { finishRuntime = resolve }),
      cancel: async () => true
    })

    harness.coordinator.start(harness.conversationId, '停止测试')
    await expect(harness.coordinator.cancel(harness.conversationId)).resolves.toEqual({ cancelled: true })
    await harness.terminal

    expect(harness.events.find((event) => event.name === 'agent.run.finished')).toMatchObject({
      payload: { message: { status: 'cancelled' } }
    })
    expect(harness.terminalRecords).toEqual([{ status: 'cancelled', state: 'cancelled', text: '' }])
    finishRuntime?.('cancelled')
    await new Promise((resolve) => setTimeout(resolve, 0))
    harness.database.close()
  })

  it('rejects a stale cancellation identity without stopping the current run', async () => {
    let finishRuntime: ((result: AgentRunResult) => void) | undefined
    const cancel = vi.fn(async () => true)
    const harness = createHarness({
      run: () => new Promise<AgentRunResult>((resolve) => { finishRuntime = resolve }),
      cancel
    })

    const accepted = await harness.coordinator.start(harness.conversationId, '竞态测试', [], 'request-current')
    await expect(harness.coordinator.cancel(harness.conversationId, {
      requestId: 'request-stale',
      runId: accepted.runId
    })).resolves.toEqual({ cancelled: false })
    await expect(harness.coordinator.cancel(harness.conversationId, {
      requestId: 'request-current',
      runId: 'run-stale'
    })).resolves.toEqual({ cancelled: false })

    expect(cancel).not.toHaveBeenCalled()
    expect(harness.coordinator.inspect(harness.conversationId)).toMatchObject({
      active: true,
      runId: accepted.runId
    })

    await expect(harness.coordinator.cancel(harness.conversationId, {
      requestId: 'request-current',
      runId: accepted.runId
    })).resolves.toEqual({ cancelled: true })
    expect(cancel).toHaveBeenCalledOnce()
    finishRuntime?.('cancelled')
    await new Promise((resolve) => setTimeout(resolve, 0))
    harness.database.close()
  })

  it('does not let a late cancellation for the previous run stop its replacement', async () => {
    const finishRuns: Array<(result: AgentRunResult) => void> = []
    const cancel = vi.fn(async () => true)
    const harness = createHarness({
      run: () => new Promise<AgentRunResult>((resolve) => { finishRuns.push(resolve) }),
      cancel
    })

    const previous = await harness.coordinator.start(harness.conversationId, '旧请求', [], 'request-previous')
    await expect(harness.coordinator.cancel(harness.conversationId, {
      requestId: 'request-previous',
      runId: previous.runId
    })).resolves.toEqual({ cancelled: true })

    const current = await harness.coordinator.start(harness.conversationId, '新请求', [], 'request-current')
    await expect(harness.coordinator.cancel(harness.conversationId, {
      requestId: 'request-previous',
      runId: previous.runId
    })).resolves.toEqual({ cancelled: false })

    expect(cancel).toHaveBeenCalledTimes(1)
    expect(harness.coordinator.inspect(harness.conversationId)).toMatchObject({
      active: true,
      runId: current.runId
    })

    await expect(harness.coordinator.cancel(harness.conversationId, {
      requestId: 'request-current',
      runId: current.runId
    })).resolves.toEqual({ cancelled: true })
    expect(cancel).toHaveBeenCalledTimes(2)
    finishRuns.forEach((finish) => finish('cancelled'))
    await new Promise((resolve) => setTimeout(resolve, 0))
    harness.database.close()
  })

  it('opens the trajectory from the latest attempted runtime even when that reply was cancelled', () => {
    const trajectory = vi.fn((conversationId: string, runtimeThreadId: string) => ({
      conversationId,
      runtimeThreadId,
      records: [],
      totalRecords: 0,
      hasMore: false,
      beforeIndex: null,
      startedAtMillis: null,
      completedAtMillis: null
    }))
    const harness = createHarness({ trajectory })
    const messages = new MessageRepository(harness.database)
    messages.create(harness.conversationId, 'user', '已完成的一轮', 'complete')
    messages.create(harness.conversationId, 'assistant', '旧回复', 'complete', undefined, 'thread-completed')
    messages.create(harness.conversationId, 'user', '后来取消的一轮', 'complete')
    messages.create(harness.conversationId, 'assistant', '', 'cancelled', undefined, 'thread-cancelled')

    expect(harness.coordinator.trajectory(harness.conversationId)).toMatchObject({
      runtimeThreadId: 'thread-cancelled'
    })
    expect(trajectory).toHaveBeenCalledWith(harness.conversationId, 'thread-cancelled', undefined)
    expect(messages.latestCompletedRuntimeThreadId(harness.conversationId)).toBe('thread-completed')
  })

  it('regenerates from the durable user turn after an empty reply is cancelled', async () => {
    let finishRuntime: ((result: AgentRunResult) => void) | undefined
    let runCount = 0
    const runtimeThreadIds: string[] = []
    const harness = createHarness({
      run: async (input, callbacks) => {
        runCount += 1
        runtimeThreadIds.push(input.runtimeThreadId ?? '')
        if (runCount === 1) {
          return new Promise<AgentRunResult>((resolve) => { finishRuntime = resolve })
        }
        callbacks.onFinal('重新生成成功')
        return 'complete'
      },
      cancel: async () => {
        finishRuntime?.('cancelled')
        return true
      }
    })

    harness.coordinator.start(harness.conversationId, '取消后重试')
    await expect(harness.coordinator.cancel(harness.conversationId)).resolves.toEqual({ cancelled: true })
    await harness.terminal
    const messages = new MessageRepository(harness.database)
    const cancelled = messages.list(harness.conversationId)
    const user = cancelled.find((message) => message.role === 'user')
    expect(user?.id).toBeTruthy()

    harness.coordinator.regenerate(harness.conversationId, user!.id)
    await vi.waitFor(() => {
      expect(harness.events.filter((event) => event.name === 'agent.run.finished')).toHaveLength(2)
    })
    expect(messages.list(harness.conversationId).map((message) => [message.role, message.content])).toEqual([
      ['user', '取消后重试'],
      ['assistant', '重新生成成功']
    ])
    expect(runtimeThreadIds[1]).not.toBe(runtimeThreadIds[0])
    harness.database.close()
  })

  it('stores failure state and emits the stable runtime error contract', async () => {
    const harness = createHarness({
      run: async () => { throw new Error('DSH unavailable') }
    })

    harness.coordinator.start(harness.conversationId, '失败测试')
    await harness.terminal

    expect(harness.events.find((event) => event.name === 'agent.run.failed')).toMatchObject({
      payload: { code: 'RUNTIME_UNAVAILABLE', message: 'DSH unavailable' }
    })
    expect(harness.terminalRecords).toEqual([{ status: 'error', state: 'failed', text: '' }])
    harness.database.close()
  })

  it('keeps a cancelled run cancelled when the runtime completes late', async () => {
    let callbacks: AgentRunCallbacks | undefined
    let finishRuntime: ((result: AgentRunResult) => void) | undefined
    const harness = createHarness({
      run: async (_input, currentCallbacks) => {
        callbacks = currentCallbacks
        return new Promise<AgentRunResult>((resolve) => { finishRuntime = resolve })
      },
      cancel: async () => true
    })

    harness.coordinator.start(harness.conversationId, '网络不稳定时停止')
    const cancellation = harness.coordinator.cancel(harness.conversationId)
    callbacks?.onDelta('不应写入')
    callbacks?.onProcessItem?.({
      id: 'late-tool', kind: 'tool', status: 'complete', toolName: 'late_tool',
      arguments: '{}', summary: '不应写入', detail: '', startedAtMillis: Date.now()
    })
    callbacks?.onFinal('不应完成')
    finishRuntime?.('complete')

    await expect(cancellation).resolves.toEqual({ cancelled: true })
    await harness.terminal
    expect(harness.events.some((event) => event.name === 'agent.output.delta')).toBe(false)
    expect(harness.events.some((event) => event.name === 'agent.process.updated')).toBe(false)
    expect(harness.events.find((event) => event.name === 'agent.run.finished')).toMatchObject({
      payload: { message: { content: '', status: 'cancelled' } }
    })
    expect(harness.terminalRecords).toEqual([{ status: 'cancelled', state: 'cancelled', text: '' }])
  })

  it('does not start the runtime when image preparation is cancelled', async () => {
    const image = {
      attachmentId: `sha256:${'b'.repeat(64)}`,
      mediaType: 'image/png' as const,
      bytes: 68,
      width: 1,
      height: 1,
      name: 'pixel.png'
    }
    let releasePreparation!: (images: Array<typeof image>) => void
    const runtimeRun = vi.fn(defaultRun)
    const harness = createHarness({
      prepareImages: () => new Promise<Array<typeof image>>((resolve) => { releasePreparation = resolve }),
      run: runtimeRun
    })
    harness.models.save({
      id: 'test-model', name: 'Test model', provider: 'deepseek', api_key: 'test-key',
      base_url: 'https://api.deepseek.com', model: 'deepseek-chat',
      model_options: [{ id: 'deepseek-chat', name: 'deepseek-chat', supportsImageInput: true }],
      custom_headers: {}, supports_tools: null, enabled: true, image_settings: {}, api_format: 'responses'
    })

    const start = Promise.resolve(harness.coordinator.start(harness.conversationId, '', [{
      mediaType: 'image/png', data: 'iVBORw0KGgo=', name: 'pixel.png'
    }], 'request-image'))
    await expect(harness.coordinator.cancel(harness.conversationId, {
      requestId: 'request-stale'
    })).resolves.toEqual({ cancelled: false })
    await expect(harness.coordinator.cancel(harness.conversationId, {
      requestId: 'request-image'
    })).resolves.toEqual({ cancelled: true })
    releasePreparation([image])

    await expect(start).rejects.toMatchObject({ name: 'AbortError', message: '生成已停止' })
    expect(runtimeRun).not.toHaveBeenCalled()
    expect(harness.database.native.prepare("SELECT COUNT(*) AS count FROM agent_turns").get()).toEqual({ count: 0 })
  })

  it('reports a completed runtime without final text as an error instead of silently succeeding', async () => {
    const harness = createHarness({
      run: async () => 'complete'
    })

    harness.coordinator.start(harness.conversationId, '不能静默结束')
    await harness.terminal

    expect(harness.events.find((event) => event.name === 'agent.run.failed')).toMatchObject({
      payload: { message: 'DSH completed the turn without assistant text' }
    })
    expect(harness.terminalRecords).toEqual([{ status: 'error', state: 'failed', text: '' }])
  })

  it('persists process history on the assistant message for later playback', async () => {
    const processItem = {
      id: 'tool-1',
      kind: 'tool' as const,
      status: 'complete' as const,
      toolName: 'eleckoi_read_variables',
      arguments: '{"path":"/状态"}',
      summary: '{"value":1}',
      detail: '读取完成',
      startedAtMillis: 100,
      completedAtMillis: 160
    }
    const harness = createHarness({
      run: async (_input, callbacks) => {
        callbacks.onProcessItem?.(processItem)
        callbacks.onFinal('完成')
        return 'complete'
      }
    })

    harness.coordinator.start(harness.conversationId, '查看过程')
    await harness.terminal

    const finished = harness.events.find((event) => event.name === 'agent.run.finished')
    expect(finished).toMatchObject({ payload: { message: { process: [processItem] } } })
    expect(new MessageRepository(harness.database).list(harness.conversationId).at(-1)?.process).toEqual([processItem])
  })

  it('commits image attachments before the user turn and forwards durable references to DSH', async () => {
    const image = {
      attachmentId: `sha256:${'a'.repeat(64)}`,
      mediaType: 'image/png' as const,
      bytes: 68,
      width: 1,
      height: 1,
      name: 'pixel.png'
    }
    let runtimeInput: AgentRunInput | undefined
    const harness = createHarness({
      prepareImages: async () => {
        expect(harness.database.native.prepare("SELECT COUNT(*) AS count FROM agent_turns WHERE kind='user'").get())
          .toEqual({ count: 0 })
        return [image]
      },
      run: async (input, callbacks) => {
        runtimeInput = input
        callbacks.onFinal('看到了')
        return 'complete'
      }
    })
    harness.models.save({
      id: 'test-model', name: 'Test model', provider: 'deepseek', api_key: 'test-key',
      base_url: 'https://api.deepseek.com', model: 'deepseek-chat',
      model_options: [{ id: 'deepseek-chat', name: 'deepseek-chat', supportsImageInput: true }],
      custom_headers: {}, supports_tools: null, enabled: true, image_settings: {}, api_format: 'responses'
    })

    await harness.coordinator.start(harness.conversationId, '', [{
      mediaType: 'image/png', data: 'iVBORw0KGgo=', name: 'pixel.png'
    }])
    await harness.terminal

    expect(runtimeInput?.inputImages).toEqual([image])
    expect(new MessageRepository(harness.database).list(harness.conversationId)[0]).toMatchObject({
      role: 'user', content: '', inputImageAttachments: [image]
    })
  })

  it('rejects images before persistence when the selected model has not declared image input', () => {
    let prepareCalls = 0
    const harness = createHarness({
      prepareImages: async () => {
        prepareCalls += 1
        return []
      }
    })

    expect(() => harness.coordinator.start(harness.conversationId, '看看这张图', [{
      mediaType: 'image/png', data: 'iVBORw0KGgo=', name: 'pixel.png'
    }])).toThrow('当前模型未声明图片输入能力。')
    expect(prepareCalls).toBe(0)
    expect(harness.database.native.prepare("SELECT COUNT(*) AS count FROM agent_turns WHERE kind='user'").get())
      .toEqual({ count: 0 })
    expect(harness.database.native.prepare("SELECT COUNT(*) AS count FROM agent_content_parts WHERE kind='user_image'").get())
      .toEqual({ count: 0 })
  })

  it('rolls back messages and counters when creating the execution record fails', () => {
    const harness = createHarness({})
    harness.database.native.exec(`CREATE TEMP TRIGGER reject_attempt BEFORE INSERT ON generation_attempts BEGIN SELECT RAISE(ABORT, 'injected attempt failure'); END;`)
    expect(() => harness.coordinator.start(harness.conversationId, 'must roll back')).toThrow('injected attempt failure')
    for (const table of ['agent_turns', 'agent_responses', 'agent_branch_turns', 'agent_content_parts', 'conversation_speakers', 'generation_attempts']) {
      expect(harness.database.native.prepare(`SELECT * FROM ${table}`).all()).toEqual([])
    }
    expect(harness.database.native.prepare('SELECT historyMessageCount,historyUserMessageCount FROM chat_sessions').get()).toEqual({ historyMessageCount: 0, historyUserMessageCount: 0 })
    expect(harness.coordinator.inspect(harness.conversationId).active).toBe(false)
    expect(harness.events).toEqual([])
  })

  it('uses the single global active model for every conversation', async () => {
    let runtimeInput: AgentRunInput | undefined
    const harness = createHarness({
      run: async (input, callbacks) => {
        runtimeInput = input
        callbacks.onFinal('完成')
        return 'complete'
      }
    })
    harness.models.save({
      id: 'global-model',
      name: 'Global model',
      provider: 'deepseek',
      api_key: 'global-key',
      base_url: 'https://global.example.com',
      model: 'global-chat',
      model_options: [{ id: 'global-chat', name: 'global-chat' }],
      custom_headers: {},
      supports_tools: null,
      enabled: true,
      image_settings: {},
      api_format: 'responses'
    })
    harness.userSettings.write('models.active', {
      capability: 'chat',
      config_id: 'global-model',
      model: 'global-chat'
    })

    harness.coordinator.start(harness.conversationId, '全局模型测试')
    await harness.terminal

    expect(runtimeInput?.settings).toMatchObject({
      apiKey: 'global-key',
      baseUrl: 'https://global.example.com',
      model: 'global-chat'
    })
  })

  it('resolves the preset subagent model through the authoritative model repository with all parameters', async () => {
    let runtimeInput: AgentRunInput | undefined
    const agentPresets = {
      runtimeSelection: () => ({ id: 'preset-a', versionId: 'version-a', name: '预设 A' }),
      subagentModelSelection: () => ({ configId: 'child-config', model: 'child-model' }),
      runtimeContext: () => undefined,
      disabledToolGroupIds: () => []
    } as unknown as AgentPresetRepository
    const harness = createHarness({
      run: async (input, callbacks) => {
        runtimeInput = input
        callbacks.onFinal('完成')
        return 'complete'
      }
    }, undefined, agentPresets)
    harness.models.save({
      id: 'child-config',
      name: 'Child model',
      provider: 'custom',
      api_key: 'child-key',
      base_url: 'https://child.example.com/v1',
      proxy_url: 'http://127.0.0.1:7890',
      model: 'child-model',
      model_options: [{
        id: 'child-model',
        name: 'child-model',
        contextWindowTokens: 196_000,
        autoCompactTokenLimit: 140_000,
        maxOutputTokens: 12_000,
        temperature: 0.35,
        topP: 0.82,
        reasoningEffort: 'high',
        supportsImageInput: true
      }],
      custom_headers: { 'X-Child-Route': 'enabled' },
      supports_tools: true,
      enabled: true,
      image_settings: {},
      api_format: 'anthropic_messages'
    })

    harness.coordinator.start(harness.conversationId, '委派测试')
    await harness.terminal

    expect(runtimeInput?.subagentSettings).toEqual({
      configId: 'child-config',
      provider: 'custom',
      apiKey: 'child-key',
      baseUrl: 'https://child.example.com/v1',
      model: 'child-model',
      systemPrompt: '',
      apiFormat: 'anthropic-messages',
      customHeaders: { 'X-Child-Route': 'enabled' },
      contextWindow: 196_000,
      contextWindowOverride: 196_000,
      autoCompactTokenLimit: 140_000,
      maxTokens: 12_000,
      temperature: 0.35,
      topP: 0.82,
      reasoningEffort: 'high',
      supportsImageInput: true,
      proxyUrl: 'http://127.0.0.1:7890'
    })
  })

  it('resolves character card macros for the DSH turn while preserving stored source text', async () => {
    let runtimeInput: AgentRunInput | undefined
    const variableStates = {
      runtimeContext: () => ({
        initialStateJson: '{}',
        schemaCode: '',
        stateJson: '{}',
        objects: [{ description: '{{char}}的状态', updateRule: '{{user}}观察时更新' }],
        variables: [{ description: '{{user}}的好感度', updateRule: '{{char}}回应时更新' }]
      })
    } as unknown as VariableStateRepository
    const personas = {
      get: () => ({ user_name: '测试用户' })
    } as unknown as Pick<PersonaRepository, 'get'>
    const harness = createHarness({
      run: async (input, callbacks) => {
        runtimeInput = input
        callbacks.onFinal('完成')
        return 'complete'
      }
    }, variableStates, undefined, personas)
    harness.database.native.prepare(
      'UPDATE chat_sessions SET characterId=?, characterName=? WHERE id=?'
    ).run('character-a', '测试角色', harness.conversationId)
    harness.database.native.prepare(
      'UPDATE chat_session_character_snapshots SET personaJson=? WHERE sessionId=?'
    ).run(JSON.stringify({
      user_name: '过期用户',
      assistant_name: '备用角色名',
      description: '{{char}}认识{{user}}'
    }), harness.conversationId)
    const messages = new MessageRepository(harness.database)
    messages.create(harness.conversationId, 'user', '{{user}}先开口', 'complete')
    messages.create(harness.conversationId, 'assistant', '{{char}}先回应', 'complete')

    harness.coordinator.start(harness.conversationId, '请让 {{ CHAR }} 回应 {{user}}')
    await harness.terminal

    expect(runtimeInput).toMatchObject({
      text: '请让测试角色回应测试用户',
      variableContext: {
        objects: [{ description: '测试角色的状态', updateRule: '测试用户观察时更新' }],
        variables: [{ description: '测试用户的好感度', updateRule: '测试角色回应时更新' }]
      },
      conversationContext: {
        characterName: '测试角色',
        persona: {},
        history: [
          { role: 'user', content: '测试用户先开口' },
          { role: 'assistant', content: '测试角色先回应' }
        ]
      }
    })
    expect(messages.list(harness.conversationId).findLast((message) => message.role === 'user')?.content)
      .toBe('请让 {{ CHAR }} 回应 {{user}}')
  })

  it('uses the global agent preset and opens a new DSH segment only after it changes', async () => {
    const runtimeInputs: AgentRunInput[] = []
    let currentPreset = { id: 'preset-a', versionId: 'version-a', name: '预设 A' }
    const agentPresets = {
      runtimeSelection: () => currentPreset,
      subagentModelSelection: () => ({ configId: '', model: '' }),
      runtimeContext: () => undefined,
      disabledToolGroupIds: () => []
    } as unknown as AgentPresetRepository
    const harness = createHarness({
      run: async (input, callbacks) => {
        runtimeInputs.push(input)
        callbacks.onFinal('完成')
        return 'complete'
      }
    }, undefined, agentPresets)

    harness.coordinator.start(harness.conversationId, '第一条')
    await vi.waitFor(() => expect(harness.coordinator.inspect(harness.conversationId).active).toBe(false))
    harness.coordinator.start(harness.conversationId, '第二条')
    await vi.waitFor(() => expect(harness.coordinator.inspect(harness.conversationId).active).toBe(false))

    currentPreset = { id: 'preset-b', versionId: 'version-b', name: '预设 B' }
    harness.coordinator.start(harness.conversationId, '切换后的第一条')
    await vi.waitFor(() => expect(harness.coordinator.inspect(harness.conversationId).active).toBe(false))

    expect(runtimeInputs.map((input) => input.agentPreset)).toEqual([
      { id: 'preset-a', versionId: 'version-a', name: '预设 A' },
      { id: 'preset-a', versionId: 'version-a', name: '预设 A' },
      { id: 'preset-b', versionId: 'version-b', name: '预设 B' }
    ])
    expect(runtimeInputs[0]?.runtimeThreadId).toMatch(/^preset_preset-a_version-a_/)
    expect(runtimeInputs[1]?.runtimeThreadId).toBe(runtimeInputs[0]?.runtimeThreadId)
    expect(runtimeInputs[2]?.runtimeThreadId).toMatch(/^preset_preset-b_version-b_/)
    expect(runtimeInputs[2]?.runtimeThreadId).not.toBe(runtimeInputs[1]?.runtimeThreadId)
  })

  it('commits the completed turn variable state and response snapshot together', async () => {
    let database!: SqliteDatabase
    const variableStates = {
      runtimeContext: () => ({
        initialStateJson: '{"好感度":0}', schemaCode: '', objects: [], variables: [], stateJson: '{"好感度":1}'
      }),
      replaceCurrent: (conversationId: string, stateJson: string, _db: unknown) => {
        database.native.prepare("UPDATE chat_session_variable_states SET stateJson=? WHERE sessionId=? AND kind='current'").run(stateJson, conversationId)
        return stateJson
      }
    } as unknown as VariableStateRepository
    const harness = createHarness({
      run: async (input, callbacks) => {
        expect(input.variableContext?.stateJson).toBe('{"好感度":1}')
        callbacks.onVariableState?.('{"好感度":2}')
        callbacks.onFinal('完成')
        return 'complete'
      }
    }, variableStates)
    database = harness.database

    harness.coordinator.start(harness.conversationId, '推进剧情')
    await harness.terminal

    expect(harness.database.native.prepare("SELECT stateJson FROM chat_session_variable_states WHERE sessionId=? AND kind='current'").get(harness.conversationId)).toEqual({ stateJson: '{"好感度":2}' })
    expect(harness.database.native.prepare('SELECT variableStateJson FROM agent_responses WHERE conversationId=?').get(harness.conversationId)).toEqual({ variableStateJson: '{"好感度":2}' })
  })

  it('stops and disposes the runtime before deleting a conversation', async () => {
    let finishRuntime!: (result: AgentRunResult) => void
    const order: string[] = []
    const harness = createHarness({
      run: () => new Promise<AgentRunResult>((resolve) => { finishRuntime = resolve }),
      cancel: async () => {
        order.push('cancel')
        finishRuntime('cancelled')
        return true
      },
      disposeConversation: async () => {
        order.push('dispose')
        expect(harness.conversations.exists(harness.conversationId)).toBe(true)
      }
    })
    harness.conversations.registerDeleteParticipant(harness.coordinator)
    harness.coordinator.start(harness.conversationId, '删除中的回复')

    await harness.conversations.delete(harness.conversationId)

    expect(order).toEqual(['cancel', 'dispose'])
    expect(harness.conversations.exists(harness.conversationId)).toBe(false)
    expect(harness.database.native.prepare('SELECT * FROM generation_attempts').all()).toEqual([])
  })

  it.each([
    { label: 'regeneration', replacement: undefined, reason: 'regenerated', expectedText: '原始问题' },
    { label: 'edit and regeneration', replacement: '修改后的问题', reason: 'edited', expectedText: '修改后的问题' }
  ])('announces $label after the replacement messages are durable', async ({ replacement, reason, expectedText }) => {
    const harness = createHarness({
      run: async (_input, callbacks) => {
        callbacks.onFinal('新的回复')
        return 'complete'
      }
    })
    const messages = new MessageRepository(harness.database)
    const user = messages.create(harness.conversationId, 'user', '原始问题', 'complete')
    const assistant = messages.create(harness.conversationId, 'assistant', '原始回复', 'complete', undefined, 'old-thread')

    const accepted = replacement === undefined
      ? harness.coordinator.regenerate(harness.conversationId, assistant.id)
      : harness.coordinator.regenerate(harness.conversationId, assistant.id, replacement)

    expect(harness.events).toContainEqual({
      name: 'messages.changed',
      payload: {
        conversationId: harness.conversationId,
        reason,
        messageIds: [user.id, accepted.messageId]
      }
    })
    await harness.terminal
    expect(messages.list(harness.conversationId).map((message) => message.content)).toEqual([expectedText, '新的回复'])
  })

  it('seeds a fresh runtime from cumulative stats and the retained chat turn count', async () => {
    const runtimeInputs: AgentRunInput[] = []
    const previousStats = {
      turns: 58, steps: 367, llmMs: 10_000, toolMs: 500, ttftMs: 200,
      ttftSteps: 1, decodeMs: 300, decodeTokens: 40,
      tokenUsage: { uncachedInputTokens: 300_000, outputTokens: 20_000, cacheReadTokens: 2_700_000, cacheWriteTokens: 0 },
      contextPressure: { projectedTokens: 70_000, contextWindow: 1_000_000 },
      contextBreakdown: { systemTokens: 100, toolsTokens: 200, messageTokens: 300 }
    }
    const harness = createHarness({
      generationStats: (_conversationId, threadId) => threadId === 'old-thread' ? previousStats : undefined,
      run: async (input, callbacks) => {
        runtimeInputs.push(input)
        callbacks.onFinal('新的回复')
        return 'complete'
      }
    })
    const messages = new MessageRepository(harness.database)
    messages.create(harness.conversationId, 'user', '保留的问题', 'complete')
    messages.create(harness.conversationId, 'assistant', '保留的回复', 'complete', undefined, 'old-thread')
    const replacedUser = messages.create(harness.conversationId, 'user', '需要重生成的问题', 'complete')
    const replaced = messages.create(harness.conversationId, 'assistant', '旧回复', 'complete', undefined, 'old-thread')
    messages.create(harness.conversationId, 'user', '会被删除的问题', 'complete')
    messages.create(harness.conversationId, 'assistant', '会被删除的回复', 'complete', undefined, 'old-thread')

    harness.coordinator.regenerate(harness.conversationId, replaced.id)
    await harness.terminal

    expect(runtimeInputs[0]?.generationStatsSeed).toEqual({ previous: previousStats, retainedTurns: 2 })
    expect(runtimeInputs[0]?.runtimeThreadId).not.toBe('old-thread')
    expect(messages.list(harness.conversationId).map((message) => message.id)).toContain(replacedUser.id)

    harness.coordinator.start(harness.conversationId, '继续对话')
    await vi.waitFor(() => expect(runtimeInputs).toHaveLength(2))
    await vi.waitFor(() => expect(harness.coordinator.inspect(harness.conversationId).active).toBe(false))
    expect(runtimeInputs[1]?.runtimeThreadId).toBe(runtimeInputs[0]?.runtimeThreadId)
    expect(runtimeInputs[1]?.generationStatsSeed).toBeUndefined()
  })

  it.each([
    { label: 'image-only', text: '' },
    { label: 'image and text', text: '这张图里是什么' }
  ])('regenerates a durable $label user turn with its image attachment', async ({ text }) => {
    const image = {
      attachmentId: `sha256:${'f'.repeat(64)}`,
      mediaType: 'image/png' as const,
      bytes: 68,
      width: 1,
      height: 1,
      name: 'pixel.png'
    }
    let runtimeInput: AgentRunInput | undefined
    const harness = createHarness({
      run: async (input, callbacks) => {
        runtimeInput = input
        callbacks.onFinal('识图回复')
        return 'complete'
      }
    })
    harness.models.save({
      id: 'test-model', name: 'Test model', provider: 'deepseek', api_key: 'test-key',
      base_url: 'https://api.deepseek.com', model: 'deepseek-chat',
      model_options: [{ id: 'deepseek-chat', name: 'deepseek-chat', supportsImageInput: true }],
      custom_headers: {}, supports_tools: null, enabled: true, image_settings: {}, api_format: 'responses'
    })
    const messages = new MessageRepository(harness.database)
    const user = messages.create(harness.conversationId, 'user', text, 'complete', undefined, '', [image])

    harness.coordinator.regenerate(harness.conversationId, user.id)
    await harness.terminal

    expect(runtimeInput).toMatchObject({ text, inputImages: [image] })
    expect(messages.list(harness.conversationId)).toEqual([
      expect.objectContaining({ id: user.id, role: 'user', content: text, inputImageAttachments: [image] }),
      expect.objectContaining({ role: 'assistant', content: '识图回复', status: 'complete' })
    ])
  })

  it('coordinates message-tail deletion with runtime and unreferenced image cleanup', async () => {
    const disposed: Array<{ conversationId: string; threadIds: readonly string[] | undefined }> = []
    const discarded: string[][] = []
    const harness = createHarness({
      disposeConversation: async (conversationId, threadIds) => {
        disposed.push({ conversationId, threadIds })
      }
    }, undefined, undefined, undefined, (attachmentIds) => discarded.push([...attachmentIds]))
    const messages = new MessageRepository(harness.database)
    const image = {
      attachmentId: `sha256:${'e'.repeat(64)}`,
      mediaType: 'image/png' as const,
      bytes: 10,
      width: 1,
      height: 1
    }
    const user = messages.create(harness.conversationId, 'user', '带图消息', 'complete', undefined, '', [image])
    const assistant = messages.create(harness.conversationId, 'assistant', '回复', 'complete', undefined, 'thread-delete')

    const result = await harness.coordinator.deleteMessagesFrom(harness.conversationId, user.id)

    expect(result).toEqual({ ok: true, deletedMessageCount: 2, remainingMessageCount: 0 })
    expect(disposed).toEqual([{
      conversationId: harness.conversationId,
      threadIds: ['thread-delete']
    }])
    expect(discarded).toEqual([[image.attachmentId]])
    expect(messages.list(harness.conversationId)).toEqual([])
    expect(harness.events).toContainEqual({ name: 'records.changed', payload: { module: 'conversations' } })
    expect(harness.events).toContainEqual({
      name: 'messages.changed',
      payload: {
        conversationId: harness.conversationId,
        reason: 'deleted',
        messageIds: [user.id, assistant.id]
      }
    })
  })

  it('waits for image preparation and discards the detached image before deletion', async () => {
    const image = {
      attachmentId: 'sha256:' + 'd'.repeat(64),
      mediaType: 'image/png' as const,
      bytes: 68,
      width: 1,
      height: 1
    }
    let releasePreparation!: (images: Array<typeof image>) => void
    const discarded: string[][] = []
    const harness = createHarness({
      prepareImages: () => new Promise<Array<typeof image>>((resolve) => { releasePreparation = resolve })
    }, undefined, undefined, undefined, (attachmentIds) => discarded.push([...attachmentIds]))
    harness.models.save({
      id: 'test-model', name: 'Test model', provider: 'deepseek', api_key: 'test-key',
      base_url: 'https://api.deepseek.com', model: 'deepseek-chat',
      model_options: [{ id: 'deepseek-chat', name: 'deepseek-chat', supportsImageInput: true }],
      custom_headers: {}, supports_tools: null, enabled: true, image_settings: {}, api_format: 'responses'
    })
    harness.conversations.registerDeleteParticipant(harness.coordinator)
    const start = Promise.resolve(harness.coordinator.start(harness.conversationId, '', [{
      mediaType: 'image/png', data: 'iVBORw0KGgo=', name: 'pixel.png'
    }]))
    const deletion = harness.conversations.delete(harness.conversationId)

    expect(() => harness.coordinator.start(harness.conversationId, '不应再开始')).toThrow('正在删除')
    releasePreparation([image])
    await expect(start).rejects.toMatchObject({ name: 'AbortError' })
    await deletion

    expect(discarded).toEqual([[image.attachmentId]])
    expect(harness.conversations.exists(harness.conversationId)).toBe(false)
  })
})

function createHarness(
  overrides: Partial<AgentRuntimePort>,
  variableStates?: VariableStateRepository,
  agentPresets?: AgentPresetRepository,
  personas?: Pick<PersonaRepository, 'get'>,
  discardPreparedImages?: (attachmentIds: readonly string[]) => void
): Harness {
  const directory = mkdtempSync(join(tmpdir(), 'eleckoi-agent-'))
  temporaryDirectories.push(directory)
  const database = new SqliteDatabase(join(directory, 'eleckoi.sqlite3'))
  database.open()
  databases.push(database)

  const conversations = new ConversationRepository(database)
  const messages = new MessageRepository(database)
  const models = new ModelRepository(database, { encrypt: (value) => 'test:' + value, decrypt: (value) => value.slice(5) })
  const userSettings = new UserSettingsStore(database, new LocalMediaStore(join(directory, 'media')))
  const conversationId = conversations.create({}).conversation.id
  models.save({
    id: 'test-model',
    name: 'Test model',
    provider: 'deepseek',
    api_key: 'test-key',
    base_url: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    model_options: [{ id: 'deepseek-chat', name: 'deepseek-chat' }],
    custom_headers: {},
    supports_tools: null,
    enabled: true,
    image_settings: {},
    api_format: 'responses'
  })

  const events: Array<{ name: string; payload: unknown }> = []
  const terminalRecords: unknown[] = []
  let resolveTerminal!: () => void
  const terminal = new Promise<void>((resolve) => { resolveTerminal = resolve })
  const gateway = {
    broadcast: (name: string, payload: unknown) => {
      events.push({ name, payload })
      if (name === 'agent.run.finished' || name === 'agent.run.failed') {
        terminalRecords.push(database.native.prepare(`SELECT r.status,a.state,p.text FROM agent_responses r
          JOIN generation_attempts a ON a.ownerId=r.id AND a.conversationId=r.conversationId
          JOIN agent_content_parts p ON p.ownerType='response' AND p.ownerId=r.id WHERE r.conversationId=?`).get(conversationId))
        resolveTerminal()
      }
    }
  } as unknown as DesktopGateway
  const runtime: AgentRuntimePort = {
    ...(overrides.prepareImages ? { prepareImages: overrides.prepareImages } : {}),
    ...(overrides.readImage ? { readImage: overrides.readImage } : {}),
    run: overrides.run ?? defaultRun,
    ...(overrides.generationStats ? { generationStats: overrides.generationStats } : {}),
    ...(overrides.trajectory ? { trajectory: overrides.trajectory } : {}),
    cancel: overrides.cancel ?? (async () => true),
    disposeConversation: overrides.disposeConversation ?? (async () => undefined),
    close: overrides.close ?? (async () => undefined)
  }
  const currentPersonas = personas ?? {
    get: () => ({ user_name: '你' })
  } as unknown as Pick<PersonaRepository, 'get'>

  const coordinator = new AgentSessionCoordinator({
    runtime,
    database,
    gateway,
    conversations,
    messages,
    models,
    userSettings,
    generations: new GenerationRepository(database, messages),
    variableStates,
    agentPresets,
    personas: currentPersonas,
    discardPreparedImages
  })
  return { coordinator, conversations, database, models, userSettings, conversationId, events, terminal, terminalRecords }
}

async function defaultRun(
  _input: AgentRunInput,
  callbacks: AgentRunCallbacks
): Promise<AgentRunResult> {
  callbacks.onFinal('完成')
  return 'complete'
}
