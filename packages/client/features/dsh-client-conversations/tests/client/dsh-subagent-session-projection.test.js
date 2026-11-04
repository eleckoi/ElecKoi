import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'
import { dshClientPlugin } from '../../../../../../tests/helpers/dshClientPlugin'
import source from '../../src/client.js?raw'

const settle = () => new Promise(resolve => setTimeout(resolve, 0))

function observable(value) {
  const listeners = new Set()
  return {
    getSnapshot: () => value(),
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    publish() { for (const listener of listeners) listener() },
  }
}

function target(nodes) {
  const source = observable(() => ({ nodes, order: [...nodes.keys()], timeline: { turns: new Map() } }))
  return { getSnapshot: source.getSnapshot, subscribe: source.subscribe, publish: source.publish }
}

function session(projections = {}) {
  const state = observable(() => ({ running: false, removed: false }))
  const faces = new Map()
  return {
    getSnapshot: state.getSnapshot,
    subscribe: state.subscribe,
    projections: { faceOf(key) {
      if (!faces.has(key)) faces.set(key, observable(() => projections[key]))
      return faces.get(key)
    } },
  }
}

function binding(sessionValue, targetValue) {
  return {
    session: sessionValue,
    target: targetValue,
    eventSource: { getSnapshot: () => ({ entries: [], hasMore: false }), subscribe: () => () => {} },
  }
}

describe('DSH child Session process projection', () => {
  it('keeps child Session retention and body projection under the official child viewer', async () => {
    const parentNodes = new Map([
      ['user', { kind: 'user', data: { seq: 1, time: 1, content: [{ type: 'text', text: '委派任务' }] } }],
      ['subagent', { kind: 'tool-call', data: { turn: 1, root: {
        kind: 'tool-result', callId: 'delegate-1', callTime: 10, time: 30,
        call: { name: 'subagent', argsRaw: '{"description":"检索资料","prompt":"查询今天的新闻"}' },
        content: [{ type: 'text', text: '子任务已完成' }],
      } } }],
      ['tail', { kind: 'turn-tail', data: { turn: 1, closing: {
        blocks: [{ kind: 'text', text: '<FINAL>父回复</FINAL>' }],
        finalNode: { seq: 4, time: 40, messageId: 'parent-final' },
      } } }],
    ])
    const childNodes = new Map([
      ['reasoning', { kind: 'assistant-step', data: { seq: 2, messageId: 'child-stage-1', turn: 1, step: 1, status: 'settled', time: 14,
        blocks: [{ kind: 'reasoning', text: '先查找可靠来源。' }, { kind: 'text', text: '我先搜索新闻来源。' }, { kind: 'tool-call' }] } }],
      ['tool', { kind: 'tool-call', data: { turn: 1, root: {
        kind: 'tool-result', callId: 'search-1', callTime: 15, time: 20,
        call: { name: 'web_search', argsRaw: '{"query":"新闻"}' },
        content: [{ type: 'text', text: '找到 3 条结果' }],
      } } }],
      ['stage-2', { kind: 'assistant-step', data: { seq: 4, messageId: 'child-stage-2', turn: 1, step: 2, status: 'running', time: 21,
        blocks: [{ kind: 'text', text: '我再核对这些来源。' }, { kind: 'tool-call' }] } }],
      ['tool-2', { kind: 'tool-call', data: { turn: 1, root: {
        kind: 'tool-result', callId: 'fetch-1', callTime: 22, time: 23,
        call: { name: 'web_fetch', argsRaw: '{"url":"https://example.com"}' },
        content: [{ type: 'text', text: '已核对来源' }],
      } } }],
    ])
    const parentTarget = target(parentNodes)
    const childTarget = target(childNodes)
    // The published child catalog remains available to official navigation.
    const parentSession = session()
    const childSession = session()
    const parentBinding = binding(parentSession, parentTarget)
    const childBinding = binding(childSession, childTarget)
    const releaseParent = vi.fn()
    const releaseChild = vi.fn()
    const sessionList = observable(() => ({
        byId: { 'parent-1': {} },
        projectionsBySession: { 'parent-1': { values: { subagentCatalog: [
          { id: 'child-1', createdAt: 11, mode: 'one-shot' },
        ] } } },
      }))
    const sessions = {
      list: sessionList,
      refresh: async () => {},
      retain: vi.fn(value => {
        if (value === 'parent-1') {
          return { sessionId: 'parent-1', binding: parentBinding, ready: Promise.resolve(parentBinding), release: releaseParent }
        }
        // The real Session list can publish synchronously while a child is
        // retained. This must be coalesced instead of recursively retaining
        // the same child until the call stack overflows.
        sessionList.publish()
        return { sessionId: 'child-1', binding: childBinding, ready: Promise.resolve(childBinding), release: releaseChild }
      }),
    }
    const conversation = { id: 'chat-1', runtimeSessionId: 'parent-1' }
    const remote = {
      eleckoiConversations: {
        changes: async function* (signal) { await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true })) },
        list: async () => ({ ok: true, value: [conversation] }),
        details: async () => ({ ok: true, value: { conversation, runtimeSessionId: 'parent-1', messages: [] } }),
      },
      settings: { describe: async () => ({ ok: true, value: { namespaces: [] } }), mutate: async () => ({ ok: true }) },
      eleckoiConversationModels: { current: async () => ({ ok: true, value: { provider: 'provider', model: 'model' } }) },
      session: {},
    }
    let registration
    let catalog
    let dispose = () => {}
    runInNewContext(source, { Date, AbortController, setTimeout, clearTimeout, console,
      window: { __ModuleLoader__: { load: item => { registration = item } } } })
    dshClientPlugin(registration).apply({
      remote, sessions,
      uiConversation: { binding: value => ({ target: () => value.target }) },
      provide: (_name, value) => { catalog = value },
      effect: run => { dispose = run() },
      on: () => () => {},
    })
    try {
      await catalog.open('chat-1')
      await settle()
      await settle()
      expect(sessions.retain).toHaveBeenCalledExactlyOnceWith('parent-1', { source: 'eleckoiConversations' })
      const runningProcess = catalog.getDetailsSnapshot().details.messages.find(message => message.role === 'assistant').process
      expect(runningProcess.some(item => item.toolName === 'subagent')).toBe(true)
      expect(JSON.stringify(runningProcess)).not.toContain('child-stage-1')

      childNodes.set('stage-2', { kind: 'assistant-step', data: { seq: 4, messageId: 'child-stage-2', turn: 1, step: 2, status: 'settled', time: 21,
        blocks: [{ kind: 'text', text: '我再核对这些来源。' }, { kind: 'tool-call' }] } })
      childNodes.set('final', { kind: 'assistant-step', data: { seq: 5, messageId: 'child-final', turn: 1, step: 3, status: 'settled', time: 25,
        blocks: [{ kind: 'text', text: '<FINAL>这是子 Agent 的最终回复。</FINAL>' }] } })
      childNodes.set('tail', { kind: 'turn-tail', data: { turn: 1, closing: {
        blocks: [{ kind: 'text', text: '<FINAL>这是子 Agent 的最终回复。</FINAL>' }],
        finalNode: { seq: 5, time: 25, messageId: 'child-final' },
      } } })
      childTarget.publish()
      await settle()

      const process = catalog.getDetailsSnapshot().details.messages.find(message => message.role === 'assistant').process
      expect(process).toBe(runningProcess)
      expect(JSON.stringify(process)).not.toContain('这是子 Agent 的最终回复。')
      expect(sessions.retain).toHaveBeenCalledTimes(1)
    } finally {
      dispose()
    }
    expect(releaseParent).toHaveBeenCalledTimes(1)
    expect(releaseChild).not.toHaveBeenCalled()
  })
})
