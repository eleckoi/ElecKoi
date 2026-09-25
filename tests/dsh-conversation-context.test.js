import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createUserMessage, markAgentLoopRequest } from '@deepseek-ai/dsh-llm'
import {
  createConversationSeed,
  installConversationContext,
  projectRequestMessages,
  projectProductHistory,
  projectionPlanFromMessages,
  recordRequestContextSnapshot,
  requestContextItems,
  requestProjectionPlan,
  renderRuntimeContext,
  settingInjections
} from '../resources/dsh/conversation-context.mjs'

const model = { provider: 'moonshotai-cn', model: 'kimi-k3' }

function text(message) {
  return message.content.filter((part) => part.type === 'text').map((part) => part.text).join('')
}

function context(entries, promptPositions = []) {
  return {
    history: [],
    settingLibrary: { entries, promptPositions }
  }
}

describe('DSH conversation context', () => {
  it('creates a balanced seed from product history without the current prompt', () => {
    const seed = createConversationSeed({
      conversationContext: {
        history: [
          { role: 'assistant', content: '开场' },
          { role: 'user', content: '上一问' },
          { role: 'assistant', content: '上一答' }
        ]
      }
    }, model)

    expect(seed.map((event) => event.seq)).toEqual(seed.map((_, index) => index))
    expect(seed.filter((event) => event.type === 'turn/start')).toHaveLength(2)
    expect(seed.filter((event) => event.type === 'turn/end')).toHaveLength(2)
    expect(seed.filter((event) => event.type === 'step/start')).toHaveLength(2)
    expect(seed.filter((event) => event.type === 'step/end')).toHaveLength(2)
    expect(seed.filter((event) => event.type === 'user/message').map((event) => text(event.data))).toEqual(['上一问'])
    expect(seed.filter((event) => event.type === 'assistant/message').map((event) => text(event.data.message))).toEqual(['开场', '上一答'])
    expect(seed.filter((event) => event.type === 'assistant/message').every((event) => Array.isArray(event.data.stream))).toBe(true)
    expect(JSON.stringify(seed)).not.toContain('最新用户输入')
    expect(seed.filter((event) => event.type === 'assistant/message')[0].data.message.source).toEqual({
      kind: 'model',
      ...model
    })
  })

  it('projects fixed and custom positions with their selected user/assistant identities', () => {
    const plan = requestProjectionPlan(context([
      setting('point-1', '第一插入点', 'insert_point_1', 1),
      { ...setting('cache', '缓存内容', null, 1), triggerMode: 'agent_tool', agentReadStrategy: 'required' },
      { ...setting('custom-before-2', '自定义二号位前', 'insert_point_2', 1), promptPositionId: 'custom-before-2', insertRole: 'assistant' },
      setting('point-2', '第二插入点', 'insert_point_2', 1),
      { ...setting('point-3', '最新输入前', 'insert_point_3', 1), insertRole: 'assistant' },
      setting('point-4', '最新输入后', 'insert_point_4', 1),
      { ...setting('point-5', '工具流程后', 'insert_point_5', 1), insertRole: 'assistant' }
    ], [{ id: 'custom-before-2', name: '二号位前扩展', anchor: 'insert_point_2', side: 'before_setting_position', order: 1 }]))
    const messages = [
      message('system', '系统指令', { kind: 'plugin', plugin: 'system' }),
      message('user', '历史用户', { kind: 'user' }),
      message('assistant', '历史回复', { kind: 'model', provider: 'test', model: 'test' }),
      message('user', '最新用户输入', { kind: 'user' }),
      message('assistant', '工具调用', { kind: 'model', provider: 'test', model: 'test' }),
      message('user', '工具结果', { kind: 'tool', callId: 'call-1' })
    ]

    const projected = projectRequestMessages(messages, plan)

    expect(projected.map((item) => [item.role, text(item)])).toEqual([
      ['system', '系统指令'],
      ['user', '第一插入点'],
      ['user', '[Setting #S01: cache]\n缓存内容'],
      ['assistant', '自定义二号位前'],
      ['user', '第二插入点'],
      ['user', '历史用户'],
      ['assistant', '历史回复'],
      ['assistant', '最新输入前'],
      ['user', '最新用户输入'],
      ['user', '最新输入后'],
      ['assistant', '工具调用'],
      ['user', '工具结果'],
      ['assistant', '工具流程后']
    ])
    expect(requestContextItems(projected, plan).map((item) => [
      item.order, item.role, item.kind, item.title, item.source, item.content
    ])).toEqual([
      [1, 'system', 'system', '系统提示词', 'system', '系统指令'],
      [2, 'user', 'prompt', '设定 · point-1', '设定插入点 1', '第一插入点'],
      [3, 'user', 'prompt', 'Agent 必读 · cache', '缓存设定区', '[Setting #S01: cache]\n缓存内容'],
      [4, 'assistant', 'prompt', '设定 · custom-before-2', '二号位前扩展', '自定义二号位前'],
      [5, 'user', 'prompt', '设定 · point-2', '设定插入点 2', '第二插入点'],
      [6, 'user', 'user', '用户消息', '聊天记录', '历史用户'],
      [7, 'assistant', 'assistant', '助手消息', 'test · test', '历史回复'],
      [8, 'assistant', 'prompt', '设定 · point-3', '设定插入点 3', '最新输入前'],
      [9, 'user', 'user', '用户最新输入', '本轮输入', '最新用户输入'],
      [10, 'user', 'prompt', '设定 · point-4', '设定插入点 4', '最新输入后'],
      [11, 'assistant', 'assistant', '助手消息', 'test · test', '工具调用'],
      [12, 'user', 'tool', '工具结果', '工具结果 · call-1', '工具结果'],
      [13, 'assistant', 'prompt', '设定 · point-5', '设定插入点 5', '工具流程后']
    ])
  })

  it('records one readable context snapshot for each DSH request boundary', () => {
    const root = mkdtempSync(join(tmpdir(), 'eleckoi-request-context-'))
    const file = join(root, 'contexts', 'thread.jsonl')
    const session = {
      snapshotEvents: () => [{ seq: 7, type: 'step/start', time: 1_234, data: { turn: 2, step: 3 } }]
    }
    const messages = [message('user', '当前问题', { kind: 'user' })]

    recordRequestContextSnapshot(file, session, messages, [])
    recordRequestContextSnapshot(file, session, messages, [])

    const rows = readFileSync(file, 'utf8').trim().split(/\r?\n/).map((line) => JSON.parse(line))
    expect(rows.filter((row) => row.type === 'definition')).toEqual([
      expect.objectContaining({ title: '用户最新输入', content: '当前问题' })
    ])
    expect(rows.filter((row) => row.type === 'request')).toEqual([expect.objectContaining({
      requestSeq: 7,
      turn: 2,
      step: 3,
      timeMillis: 1_234,
      items: [expect.objectContaining({ order: 1, key: expect.any(String) })]
    })])
    rmSync(root, { recursive: true, force: true })
  })

  it('registers a durable projection definition instead of a flattened runtime context', async () => {
    const root = mkdtempSync(join(tmpdir(), 'eleckoi-conversation-context-'))
    const sessionId = 'session-context-test'
    writeFileSync(join(root, `${sessionId}.json`), JSON.stringify({
      model: { systemPrompt: '' },
      conversationContext: {
        history: [{ role: 'assistant', content: '不应重复写入本轮批次' }],
        settingLibrary: {
          entries: [
            setting('point-1', '固定背景', 'insert_point_1', 1),
            setting('hidden-timeline', '<roleplay_output_protocol>必须使用 FINAL</roleplay_output_protocol>', 'insert_point_5', 1)
          ],
          promptPositions: []
        }
      }
    }))
    const handlers = new Map()
    const disposers = []
    const agentCtx = {
      systemPrompt: {
        section: vi.fn(() => { const dispose = vi.fn(); disposers.push(dispose); return dispose })
      },
      on: vi.fn((event, handler) => {
        handlers.set(event, handler)
        const dispose = vi.fn(); disposers.push(dispose); return dispose
      })
    }
    const dispose = installConversationContext(agentCtx, root, sessionId)
    const decision = await handlers.get('agent/pre-step')({
      agent: { session: { surface: { nodes: [] }, eventAt: vi.fn() } },
      signal: new AbortController().signal
    }, async () => ({
      kind: 'enter',
      messages: [createUserMessage({ content: [{ type: 'text', text: '最新用户输入' }], source: { kind: 'user' } })]
    }))

    expect(agentCtx.on).toHaveBeenCalledTimes(2)
    expect(projectionPlanFromMessages(decision.messages).map((entry) => [entry.anchor, entry.content])).toEqual([
      ['insert_point_1', '固定背景'],
      ['insert_point_5', '<roleplay_output_protocol>必须使用 FINAL</roleplay_output_protocol>']
    ])
    expect(decision.messages.at(-1).source.plugin).toBe('eleckoi-request-projection')
    dispose()
    expect(disposers.every((item) => item.mock.calls.length === 1)).toBe(true)
    rmSync(root, { recursive: true, force: true })
  })

  it('replaces provider-native history before the current input', () => {
    const native = [
      {
        role: 'assistant',
        content: [{ type: 'tool-call', id: 'call-google-1', name: 'lookup', arguments: '{}' }],
        source: { kind: 'model', provider: 'google', model: 'gemini', replayState: { responseId: 'google-response' } }
      },
      {
        role: 'user',
        content: [{ type: 'tool-result', toolCallId: 'call-google-1', content: [] }],
        source: { kind: 'tool', callId: 'call-google-1' }
      },
      {
        role: 'assistant',
        content: [{ type: 'text', text: '<FINAL>上一答</FINAL>' }],
        source: { kind: 'model', provider: 'google', model: 'gemini' }
      },
      createUserMessage({
        content: [{ type: 'text', text: '最新用户输入' }],
        source: { kind: 'user' }
      })
    ]
    const projected = projectProductHistory(native, {
      history: [
        { role: 'user', content: '上一问' },
        { role: 'assistant', content: '上一答' }
      ]
    })

    expect(projected.map((message) => [message.role, text(message)])).toEqual([
      ['user', '上一问'],
      ['assistant', '上一答'],
      ['user', '最新用户输入']
    ])
    expect(JSON.stringify(projected)).not.toContain('call-google-1')
    expect(JSON.stringify(projected)).not.toContain('google-response')
    expect(projected[1].source).toEqual({ kind: 'plugin', plugin: 'eleckoi-product-history' })
  })

  it('sends only product user and assistant history on the next turn request', () => {
    const root = mkdtempSync(join(tmpdir(), 'eleckoi-product-history-request-'))
    const sessionId = 'session-product-history-request'
    const requestContextFile = join(root, 'request-context.jsonl')
    writeFileSync(join(root, `${sessionId}.json`), JSON.stringify({
      model: { systemPrompt: '' },
      requestContextFile,
      conversationContext: {
        history: [
          { role: 'user', content: '上一问' },
          { role: 'assistant', content: '上一答' }
        ]
      }
    }))
    const nativeMessages = [
      message('assistant', '上一轮思考', { kind: 'model', provider: 'test', model: 'test' }),
      {
        id: 'previous-tool-call',
        role: 'assistant',
        content: [{ type: 'tool-call', id: 'call-1', name: 'lookup', arguments: '{}' }],
        source: { kind: 'model', provider: 'test', model: 'test' }
      },
      {
        id: 'previous-tool-result',
        role: 'user',
        content: [{ type: 'tool-result', toolCallId: 'call-1', content: [{ type: 'text', text: '旧工具结果' }] }],
        source: { kind: 'tool', callId: 'call-1' }
      },
      message('assistant', '<FINAL>上一答</FINAL>', { kind: 'model', provider: 'test', model: 'test' }),
      message('user', '当前问题', { kind: 'user' })
    ]
    const session = {
      surface: { nodes: [] },
      eventAt: vi.fn(),
      deriveMessages: () => nativeMessages,
      snapshotEvents: () => [{ seq: 9, type: 'step/start', time: 2_345, data: { turn: 2, step: 1 } }]
    }
    const listeners = new Map()
    const streamed = vi.fn((options) => options)
    const agentCtx = {
      systemPrompt: { section: vi.fn(() => vi.fn()) },
      sessions: { get: vi.fn(() => session) },
      llm: { stream: streamed },
      on: vi.fn((event, handler) => {
        listeners.set(event, handler)
        return vi.fn()
      })
    }
    const dispose = installConversationContext(agentCtx, root, sessionId)
    const options = markAgentLoopRequest({
      provider: 'test',
      model: 'test',
      sessionId,
      messages: nativeMessages
    })

    const result = listeners.get('llm/stream')(options, vi.fn())

    expect(result.messages.map((item) => [item.role, text(item)])).toEqual([
      ['user', '上一问'],
      ['assistant', '上一答'],
      ['user', '当前问题']
    ])
    expect(JSON.stringify(result.messages)).not.toContain('上一轮思考')
    expect(JSON.stringify(result.messages)).not.toContain('call-1')
    expect(JSON.stringify(result.messages)).not.toContain('旧工具结果')
    expect(streamed).toHaveBeenCalledOnce()

    dispose()
    rmSync(root, { recursive: true, force: true })
  })

  it('preserves a matching compaction checkpoint and replaces its native tail', () => {
    const checkpoint = createUserMessage({
      content: [{ type: 'text', text: '<compacted-summary>较早历史摘要</compacted-summary>' }],
      source: { kind: 'plugin', plugin: 'compaction' }
    })
    const projected = projectProductHistory([
      checkpoint,
      { role: 'assistant', content: [{ type: 'text', text: '<FINAL>上一答</FINAL>' }], source: { kind: 'model', provider: 'google', model: 'gemini' } },
      createUserMessage({ content: [{ type: 'text', text: '最新输入' }], source: { kind: 'user' } })
    ], {
      history: [
        { role: 'user', content: '很早的问题' },
        { role: 'assistant', content: '上一答' }
      ]
    })

    expect(projected[0]).toBe(checkpoint)
    expect(projected.map(text)).toEqual([
      '<compacted-summary>较早历史摘要</compacted-summary>',
      '上一答',
      '最新输入'
    ])
  })

  it('keeps only the active turn tool flow after replacing historical runtime events', () => {
    const currentToolCall = {
      id: 'current-tool-call-message',
      role: 'assistant',
      content: [{ type: 'tool-call', id: 'current-call', name: 'lookup', arguments: '{}' }],
      source: { kind: 'model', provider: 'test', model: 'test' }
    }
    const currentToolResult = {
      id: 'current-tool-result-message',
      role: 'user',
      content: [{ type: 'tool-result', toolCallId: 'current-call', content: [{ type: 'text', text: '当前工具结果' }] }],
      source: { kind: 'tool', callId: 'current-call' }
    }
    const projected = projectProductHistory([
      message('assistant', '旧思考', { kind: 'model', provider: 'test', model: 'test' }),
      message('user', '旧工具结果', { kind: 'tool', callId: 'old-call' }),
      message('assistant', '<FINAL>上一答</FINAL>', { kind: 'model', provider: 'test', model: 'test' }),
      message('user', '当前问题', { kind: 'user' }),
      currentToolCall,
      currentToolResult
    ], {
      history: [
        { role: 'user', content: '上一问' },
        { role: 'assistant', content: '上一答' }
      ]
    })

    expect(projected.slice(0, 3).map((item) => [item.role, text(item)])).toEqual([
      ['user', '上一问'],
      ['assistant', '上一答'],
      ['user', '当前问题']
    ])
    expect(projected.slice(3)).toEqual([currentToolCall, currentToolResult])
    expect(JSON.stringify(projected)).not.toContain('旧思考')
    expect(JSON.stringify(projected)).not.toContain('old-call')
  })

  it('keeps cache and every custom position in the diagnostic projection view', () => {
    const rendered = renderRuntimeContext(context([
      setting('point-1', '第一插入点', 'insert_point_1', 1),
      { ...setting('cache', '缓存内容', null, 2), triggerMode: 'agent_tool', agentReadStrategy: 'required' },
      setting('point-2', '第二插入点', 'insert_point_2', 1),
      setting('point-3', '输入前', 'insert_point_3', 1)
    ]))
    expect(rendered).toBe('第一插入点\n\n[Setting #S01: cache]\n缓存内容\n\n第二插入点\n\n输入前')
  })

  it('uses custom position anchors and ignores disabled/on-demand entries', () => {
    const entries = settingInjections(context([
      { ...setting('custom', '自定义位置', 'insert_point_2', 2), promptPositionId: 'custom-position' },
      { ...setting('disabled', '不应出现', 'insert_point_2', 1), enabled: false },
      { ...setting('on-demand', '按需读取', 'insert_point_5', 1), triggerMode: 'agent_tool' }
    ], [{ id: 'custom-position', name: '输入前扩展', anchor: 'insert_point_3', side: 'before_setting_position', order: 7 }]))

    expect(entries).toEqual([expect.objectContaining({
      id: 'custom',
      anchor: 'insert_point_3',
      traceSource: '输入前扩展',
      content: '自定义位置',
      positionOrder: 7,
      order: 2
    })])
  })
})

function setting(id, content, position, order) {
  return {
    id,
    title: id,
    enabled: true,
    content,
    kind: 'normal',
    triggerMode: 'always',
    position,
    promptPositionId: '',
    insertRole: 'user',
    order
  }
}

function message(role, content, source) {
  return {
    id: `message-${role}-${content}`,
    role,
    content: [{ type: 'text', text: content }],
    source
  }
}
