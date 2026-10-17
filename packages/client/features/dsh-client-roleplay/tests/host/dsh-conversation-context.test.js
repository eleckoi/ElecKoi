import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createUserMessage, markAgentLoopRequest } from '@deepseek-ai/dsh-llm'

import {
  installConversationContext,
  projectCurrentUserPrompt,
  projectRequestMessages,
  projectProductHistory,

  requestContextItems,
  requestProjectionPlan,
  renderRuntimeContext,
  settingInjections,
  visibleDialogueHistory
} from '../../../../../../apps/desktop/resources/dsh/conversation-context.mjs'

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
      message('system', '系统指令', { kind: 'plugin:system' }),
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

  it('registers only the live request middleware without adding persistent setup messages', () => {
    const release = vi.fn()
    const agentCtx = { on: vi.fn(() => release) }
    const dispose = installConversationContext(agentCtx, 'unused-root', 'synthetic-session', { capture: vi.fn() })
    expect(agentCtx.on).toHaveBeenCalledWith('llm/stream', expect.any(Function))
    expect(agentCtx.on).toHaveBeenCalledWith('session/event', expect.any(Function))
    dispose()
    expect(release).toHaveBeenCalledTimes(2)
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
    expect(projected[1].source).toEqual({ kind: 'plugin:eleckoi-product-history' })
  })

  it('keeps durable DSH history when product context only supplies an opening prefix', () => {
    const native = [
      createUserMessage({ content: [{ type: 'text', text: '上一问' }], source: { kind: 'user' } }),
      message('assistant', '上一答', { kind: 'model', provider: 'test', model: 'test' }),
      createUserMessage({ content: [{ type: 'text', text: '当前问题' }], source: { kind: 'user' } })
    ]

    const projected = projectProductHistory(native, {
      historyMode: 'prefix',
      history: [{ role: 'assistant', content: '开场白' }]
    })

    expect(projected.map((item) => [item.role, text(item)])).toEqual([
      ['assistant', '开场白'],
      ['user', '上一问'],
      ['assistant', '上一答'],
      ['user', '当前问题']
    ])
  })

  it('sends only product user and assistant history on the next turn request', () => {
    const root = mkdtempSync(join(tmpdir(), 'eleckoi-product-history-request-'))
    const sessionId = 'session-product-history-request'
    const requestContextFile = join(root, 'request-context.jsonl')
    const contextFile = join(root, 'conversation-context.json')
    writeFileSync(contextFile, JSON.stringify({
        currentPromptText: '当前问题（已处理）',
        history: [
          { role: 'user', content: '上一问' },
          { role: 'assistant', content: '上一答' }
        ]
    }))
    writeFileSync(join(root, `${sessionId}.json`), JSON.stringify({ model: { systemPrompt: '' }, contextFile }))
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

    const recordedEvents = []
    const session = {
      id: sessionId,
      surface: { nodes: [] },
      eventAt: vi.fn(seq => recordedEvents.find(event => event.seq === seq)),
      append: vi.fn((type, data, options) => {
        const event = { seq: 10 + recordedEvents.length, type, data, ...options }
        recordedEvents.push(event)

        if (type === 'user/message') { session.surface.nodes.push(event.seq); nativeMessages.push(data) }
        return event
      }),
      deriveMessages: () => nativeMessages,
      snapshotEvents: () => [{ seq: 9, type: 'step/start', time: 2_345, data: { turn: 2, step: 1 } }]
    }
    const listeners = new Map()
    const streamed = vi.fn((options) => options)
    const agentCtx = {
      systemPrompt: { section: vi.fn(() => vi.fn()) },
      sessions: { get: vi.fn(() => session) },
      sessionProjections: { stateOf: () => ({ inputs: [{ messageId: nativeMessages.findLast(item => item.source.kind === 'user').id }] }) },

      llm: { stream: streamed },
      on: vi.fn((event, handler) => {
        listeners.set(event, handler)
        return vi.fn()
      })
    }
    const previews = { capture: vi.fn() }; const dispose = installConversationContext(agentCtx, root, sessionId, previews)
    listeners.get('session/event')(session, { type: 'step/start', data: { turn: 2, step: 1 } })
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
      ['user', '当前问题（已处理）']
    ])
    expect(session.append).not.toHaveBeenCalled()
    expect(previews.capture).toHaveBeenCalledWith(session, expect.objectContaining({ messages: result.messages }), [], { round: 1, turn: 2, step: 1 })
    expect(text(nativeMessages.findLast(message => message.source.kind === 'user'))).toBe('当前问题')
    expect(JSON.stringify(result.messages)).not.toContain('上一轮思考')
    expect(JSON.stringify(result.messages)).not.toContain('call-1')
    expect(JSON.stringify(result.messages)).not.toContain('旧工具结果')
    expect(streamed).toHaveBeenCalledOnce()
    expect(recordedEvents.some(event => event.type === 'eleckoi/request-context')).toBe(false)
    expect(recordedEvents).toEqual([])
    expect(existsSync(requestContextFile)).toBe(false)

    nativeMessages.push(
      {
        id: 'current-reasoning', role: 'assistant',
        content: [{ type: 'reasoning', text: '当前轮次推理' }],
        source: { kind: 'model', provider: 'test', model: 'test' }
      },
      {
        id: 'current-tool-call', role: 'assistant',
        content: [{ type: 'tool-call', id: 'call-2', name: 'lookup', arguments: '{}' }],
        source: { kind: 'model', provider: 'test', model: 'test' }
      },
      {
        id: 'current-tool-result', role: 'user',
        content: [{ type: 'tool-result', toolCallId: 'call-2', content: [{ type: 'text', text: '本轮工具结果' }] }],
        source: { kind: 'tool', callId: 'call-2' }
      }
    )
    const continuation = listeners.get('llm/stream')(options, vi.fn())
    expect(continuation.messages.map((item) => [item.role, text(item)])).toEqual([
      ['user', '上一问'],
      ['assistant', '上一答'],
      ['user', '当前问题（已处理）'],
      ['assistant', ''],
      ['assistant', ''],
      ['user', '']
    ])
    expect(JSON.stringify(continuation.messages)).toContain('本轮工具结果')
    expect(continuation.messages.at(-3)).toBe(nativeMessages.at(-3))
    expect(JSON.stringify(continuation.messages)).toContain('当前轮次推理')
    expect(JSON.stringify(continuation.messages)).not.toContain('旧工具结果')
    expect(JSON.stringify(continuation.messages)).not.toContain('上一轮思考')

    dispose()
    rmSync(root, { recursive: true, force: true })
  })

  it('changes only the provider-facing latest user text and retains its image blocks', () => {
    const image = { type: 'image', mediaType: 'image/png', data: 'aW1hZ2U=' }
    const previous = message('user', '上一轮', { kind: 'user' })
    const current = createUserMessage({
      content: [{ type: 'text', text: '原文' }, image],
      source: { kind: 'user' }
    })
    const projected = projectCurrentUserPrompt([previous, current], { currentPromptText: '模型提示词' })

    expect(projected[0]).toBe(previous)
    expect(text(projected[1])).toBe('模型提示词')
    expect(projected[1].content[1]).toEqual(image)
    expect(text(current)).toBe('原文')
  })

  it('drops prior reasoning and tool flow in prefix mode but keeps the entire active turn', () => {
    const model = { kind: 'model', provider: 'test', model: 'test', replayState: { signature: 'old-signature' } }
    const currentFlow = [
      { id: 'reasoning', role: 'assistant', content: [{ type: 'reasoning', text: '当前推理' }], source: model },
      { id: 'call', role: 'assistant', content: [{ type: 'tool-call', id: 'active-call', name: 'lookup', arguments: '{}' }], source: model },
      { id: 'result', role: 'user', content: [{ type: 'tool-result', toolCallId: 'active-call', content: [{ type: 'text', text: '当前结果' }] }], source: { kind: 'tool', callId: 'active-call' } }
    ]
    const native = [
      message('user', '旧问题', { kind: 'user' }),
      { ...currentFlow[0], content: [{ type: 'reasoning', text: '旧推理' }] },
      { ...currentFlow[1], content: [{ type: 'tool-call', id: 'old-call', name: 'lookup', arguments: '{}' }] },
      { ...currentFlow[2], content: [{ type: 'tool-result', toolCallId: 'old-call', content: [] }], source: { kind: 'tool', callId: 'old-call' } },
      { ...message('assistant', '<FINAL>旧回复</FINAL>', model), content: [{ type: 'reasoning', text: '旧最终推理' }, { type: 'text', text: '<FINAL>旧回复</FINAL>' }] },
      message('user', '当前问题', { kind: 'user' }),
      ...currentFlow
    ]
    const projected = projectProductHistory(native, { historyMode: 'prefix', history: [{ role: 'assistant', content: '开场白' }] })
    expect(projected.slice(0, 4).map(item => [item.role, text(item)])).toEqual([
      ['assistant', '开场白'], ['user', '旧问题'], ['assistant', '旧回复'], ['user', '当前问题']
    ])
    expect(projected.slice(4)).toEqual(currentFlow)
    expect(projected.at(-3)).toBe(currentFlow[0])
    expect(projected[2].source).toEqual({ kind: 'plugin:eleckoi-product-history' })
    expect(JSON.stringify(projected.slice(0, 4))).not.toMatch(/旧推理|旧最终推理|old-call|old-signature/)
    expect(native).toHaveLength(9)
  })

  it('does not promote an assistant tool result into an old final reply', () => {
    const projected = projectProductHistory([
      message('user', '旧问题', { kind: 'user' }),
      {
        id: 'old-tool-result-message',
        role: 'assistant',
        content: [
          { type: 'tool-result', toolCallId: 'old-call', content: [{ type: 'text', text: '旧工具结果' }] }
        ],
        source: { kind: 'model', provider: 'test', model: 'test' }
      },
      message('assistant', '<FINAL>旧最终回复</FINAL>', { kind: 'model', provider: 'test', model: 'test' }),
      message('user', '当前问题', { kind: 'user' })
    ], { historyMode: 'prefix', history: [{ role: 'assistant', content: '开场白' }] })

    expect(projected.map(text)).toEqual(['开场白', '旧问题', '旧最终回复', '当前问题'])
    expect(JSON.stringify(projected)).not.toContain('旧工具结果')
  })

  it('preserves a matching compaction checkpoint and replaces its native tail', () => {
    const checkpoint = createUserMessage({
      content: [{ type: 'text', text: '<compacted-summary>较早历史摘要</compacted-summary>' }],
      source: { kind: 'compact-checkpoint' }
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

  describe('visible dialogue history', () => {
    it('keeps user input and final replies without tool steps or FINAL tags', () => {
      const messages = [
        message('system', '系统配置', { kind: 'plugin:system' }),
        message('user', '旧输入', { kind: 'user' }),
        { ...message('assistant', '', { kind: 'model' }), content: [{ type: 'tool-call', id: 'call-1', name: 'lookup', arguments: '{}' }] },
        message('user', '工具结果', { kind: 'tool', callId: 'call-1' }),
        message('assistant', '<FINAL>旧回复</FINAL>', { kind: 'model' })
      ]
      expect(visibleDialogueHistory(messages)).toEqual([
        { role: 'user', content: '旧输入' },
        { role: 'assistant', content: '旧回复' }
      ])
    })

    it('drops the trailing user input retained by regeneration', () => {
      const messages = [
        message('user', '旧输入', { kind: 'user' }),
        message('assistant', '旧回复', { kind: 'model' }),
        message('user', '当前输入', { kind: 'user' })
      ]
      expect(visibleDialogueHistory(messages)).toEqual([
        { role: 'user', content: '旧输入' },
        { role: 'assistant', content: '旧回复' }
      ])
    })

    it('keeps a trailing compaction checkpoint', () => {
      const messages = [
        message('user', '旧输入', { kind: 'user' }),
        message('assistant', '旧回复', { kind: 'model' }),
        message('user', '<compacted-summary>摘要</compacted-summary>', { kind: 'user' })
      ]
      expect(visibleDialogueHistory(messages).at(-1)).toEqual({
        role: 'user',
        content: '<compacted-summary>摘要</compacted-summary>'
      })
    })

    it('returns empty history when no messages are available', () => {
      expect(visibleDialogueHistory(undefined)).toEqual([])
      expect(visibleDialogueHistory([])).toEqual([])
    })
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
