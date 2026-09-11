import { describe, expect, it } from 'vitest'
import { createAssistantMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import { projectRequest } from '../resources/dsh/conversation-context.mjs'

const model = 'deepseek-chat'

function user(text, source = { kind: 'user' }) {
  return createUserMessage({ content: [{ type: 'text', text }], source })
}

function assistant(text, provider = 'eleckoi-runtime') {
  return createAssistantMessage({
    content: [{ type: 'text', text }],
    source: { provider, model }
  })
}

function text(message) {
  return message.content.filter((part) => part.type === 'text').map((part) => part.text).join('')
}

describe('Android-aligned DSH conversation projection', () => {
  it('replaces native history with authoritative role-preserving product history', () => {
    const projected = projectRequest({
      provider: 'eleckoi-upstream',
      model,
      system: 'system',
      messages: [
        user('旧插件上下文', { kind: 'plugin', plugin: 'old-context' }),
        user('旧用户消息'),
        assistant('不应进入重新生成请求的旧回复'),
        user('你好')
      ]
    }, {
      currentUserInput: '你好',
      history: [{ role: 'assistant', content: '你好啊', speakerName: '测试角色' }],
      persona: {}
    })

    expect(projected.messages.map((message) => message.role)).toEqual(['assistant', 'user'])
    expect(projected.messages.map(text)).toEqual(['你好啊', '你好'])
    expect(projected.messages.filter((message) => text(message) === '你好')).toHaveLength(1)
    expect(JSON.stringify(projected.messages)).not.toContain('prior transcript')
    expect(JSON.stringify(projected.messages)).not.toContain('不应进入重新生成请求的旧回复')
  })

  it('projects configured positions around the current user without flattening roles', () => {
    const projected = projectRequest({
      provider: 'eleckoi-upstream',
      model,
      system: 'base',
      messages: [user('继续')]
    }, {
      currentUserInput: '继续',
      history: [
        { role: 'user', content: '上一问' },
        { role: 'assistant', content: '上一答' }
      ],
      persona: { assistant_name: '测试角色' },
      settingLibrary: {
        entries: [
          { id: 'before', enabled: true, content: '当前输入前', kind: 'normal', triggerMode: 'always', position: 'before_latest_user_input', insertRole: 'user', order: 1 },
          { id: 'after', enabled: true, content: '当前输入后', kind: 'normal', triggerMode: 'always', position: 'after_latest_user_input', insertRole: 'assistant', order: 1 }
        ],
        promptPositions: []
      }
    })

    expect(projected.messages.map((message) => `${message.role}:${text(message)}`)).toEqual([
      'user:上一问',
      'assistant:上一答',
      'user:当前输入前',
      'user:继续',
      'assistant:当前输入后'
    ])
    expect(projected.system).toBe('base')
  })

  it('does not inject character identity outside the setting library', () => {
    const projected = projectRequest({
      provider: 'eleckoi-upstream',
      model,
      system: 'base',
      messages: [user('你是谁')]
    }, {
      currentUserInput: '你是谁',
      history: [],
      characterName: '旧身份角色',
      persona: {
        assistant_name: '旧身份角色',
        description: '角色说明',
        personality: '角色性格',
        scenario: '角色场景'
      },
      settingLibrary: {
        entries: [{
          id: 'identity',
          kind: 'normal',
          enabled: false,
          content: '你是旧身份角色，这是唯一身份设定。',
          triggerMode: 'always',
          position: 'instructions',
          insertRole: 'system',
          order: 1
        }],
        promptPositions: []
      }
    })

    expect(projected.system).toBe('base')
    expect(JSON.stringify(projected)).not.toContain('旧身份角色')
    expect(JSON.stringify(projected)).not.toContain('角色说明')
  })

  it('injects the preset-owned hidden tool timeline after the tool flow', () => {
    const projected = projectRequest({
      provider: 'eleckoi-upstream',
      model,
      system: 'base',
      messages: [user('继续')]
    }, {
      currentUserInput: '继续',
      history: [],
      persona: {},
      settingLibrary: {
        entries: [{
          id: 'hidden', kind: 'hidden_tool_timeline', enabled: true, content: '只显示最终正文',
          triggerMode: 'always', position: 'after_tool_flow', insertRole: 'user', order: 1
        }],
        promptPositions: []
      }
    })

    expect(projected.messages.map(text)).toEqual(['继续', '只显示最终正文'])
  })

  it('does not auto-inject the hidden timeline when it is configured for Agent reading', () => {
    const projected = projectRequest({
      provider: 'eleckoi-upstream',
      model,
      system: 'base',
      messages: [user('继续')]
    }, {
      currentUserInput: '继续',
      history: [],
      persona: {},
      settingLibrary: {
        entries: [{
          id: 'hidden', kind: 'hidden_tool_timeline', enabled: true, content: '按需读取的协议',
          triggerMode: 'agent_tool', position: 'after_tool_flow', insertRole: 'user', order: 1
        }],
        promptPositions: []
      }
    })

    expect(projected.messages.map(text)).toEqual(['继续'])
  })

  it('uses the preset summary template for isolated compaction and removes interactive tools', () => {
    const projected = projectRequest({
      provider: 'eleckoi-upstream',
      model,
      purpose: 'compaction',
      system: 'interactive system',
      tools: [{ name: 'search', description: '', parameters: {} }],
      stop: ['</FINAL>'],
      messages: [user('较早对话'), user('DSH native compaction instruction', { kind: 'plugin', plugin: 'compaction' })]
    }, { currentUserInput: '较早对话', history: [], persona: {} }, '只保留角色剧情')

    expect(projected.system).toContain('只执行内部历史压缩')
    expect(projected.tools).toBeUndefined()
    expect(projected.stop).toBeUndefined()
    expect(text(projected.messages.at(-1))).toContain('只保留角色剧情')
    expect(text(projected.messages.at(-1))).not.toContain('DSH native compaction instruction')
  })

  it('keeps a DSH compaction checkpoint instead of restoring already-compressed product history', () => {
    const checkpoint = user('checkpoint\n<compacted-summary>摘要</compacted-summary>', { kind: 'plugin', plugin: 'compaction' })
    const projected = projectRequest({
      provider: 'eleckoi-upstream',
      model,
      messages: [checkpoint, assistant('<FINAL>最近回复</FINAL>'), user('继续')]
    }, {
      currentUserInput: '继续',
      history: [
        { role: 'user', content: '已经压缩的旧消息' },
        { role: 'assistant', content: '最近回复' }
      ],
      persona: {}
    })

    expect(projected.messages.map(text)).toEqual([
      'checkpoint\n<compacted-summary>摘要</compacted-summary>',
      '最近回复',
      '继续'
    ])
  })
})
