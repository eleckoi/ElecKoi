import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'
import { dshClientPlugin } from '../../../../../../tests/helpers/dshClientPlugin'
import { mvuMessageDisplayCompatibility } from '@eleckoi/compatibility-mvu'
import { MessageDisplayProjector } from '../../../../../host/product-data/src/domain/conversations/MessageDisplayProjector'
import type { RegexRuleCollection } from '../../../../../shared/src/contracts/regex/schemas'
import { detectRichMessagePresentation } from '../../../../../shared/src/foundation/richMessage'
// @ts-expect-error The browser test runtime does not publish declarations.
import { JSDOM } from 'jsdom'
import { NativeAuthorClient } from '@eleckoi/dsh-client-author/runtime'
import type { ElecKoiAuthorApi } from '@eleckoi/author-sdk'
// @ts-expect-error The installed browser bundle fixture does not publish declarations.
import { officialChatFixture, officialTrajectoryFixture } from '../../../../../../tests/helpers/officialTrajectory.js'
import { interruptedTurnClosers } from '@deepseek-ai/dsh-session'
import { RemoteStream } from '@deepseek-ai/dsh-api-gateway/client'
// @ts-expect-error The Host projection module does not publish declarations.
import { inputContinuationsProjection } from '../../../dsh-client-roleplay/src/host/input-continuations-projection.mjs'
// @ts-expect-error The Host projection module does not publish declarations.
import { turnOutcomesProjection } from '../../../dsh-client-roleplay/src/host/turn-outcomes-projection.mjs'
// @ts-expect-error The Renderer seat adapter does not publish declarations.
import { selectRoleplayChatSeat } from '../../../../../../apps/web/src/modules/chat/model/chatViewSeats.js'
// @ts-expect-error The Renderer adapter is JavaScript.
import { findRegenerateBranchUserIndex } from '../../../../../../apps/web/src/modules/chat/model/chatRegeneration.js'
// @ts-expect-error The Renderer adapter is JavaScript.
import { adaptTrajectorySnapshot } from '../../../../../../apps/web/src/modules/chat/model/trajectorySnapshotAdapter.js'

const source = readFileSync(new URL('../../src/client.js', import.meta.url), 'utf8')
const settle = () => new Promise<void>(resolve => setImmediate(resolve))

describe('official request bindings across selected conversations', () => {
  it.each(['send', 'regenerate'].flatMap(kind => ['prepare', 'admission', 'execution'].flatMap(stage =>
    ['complete', 'cancelled', 'error'].map(outcome => [kind, stage, outcome]))))('%s keeps its own Session through %s while another generates (%s)', async (kind, stage, outcome) => {
    const records = ['a', 'b'].map(key => ({ id: `chat-${key}`, runtimeSessionId: `session-${key}`,
      metadata: { characterId: `character-${key}` } }))
    const detailsFor = (id: string) => { const record = records.find(record => record.id === id)!;
      return { conversation: record, runtimeSessionId: record.runtimeSessionId, metadata: record.metadata, messages: [], hasMore: false } }
    const r = mountCatalog(async (name, input: any) => name === 'query.conversations.list'
      ? { ok: true, data: records } : { ok: true, data: detailsFor(input.conversationId) }, { allowOtherQueries: true })
    const catalog = r.catalog as any
    let releasePrepare!: () => void, releaseAdmission!: () => void
    const preparation = new Promise<void>(resolve => { releasePrepare = resolve })
    const admission = new Promise<void>(resolve => { releaseAdmission = resolve })
    const references: Array<{ id: string; source: string; release: ReturnType<typeof vi.fn> }> = []
    const states = new Map(records.map(record => {
      const chatFixture = officialChatFixture(), trajectoryFixture = officialTrajectoryFixture()
      let chat = chatFixture.replace([]), trajectory = trajectoryFixture.replace([])
      const listeners = new Set<() => void>(), eventListeners = new Set<() => void>()
      const targetListeners = new Set<() => void>()
      const subscribe = (set: Set<() => void>) => (listener: () => void) => { set.add(listener); return () => { set.delete(listener) } }
      const state: any = { running: false, removed: false, events: [], requestId: '',
        notify: () => { for (const listener of listeners) listener() },
        append: (type: string, data: any, surfaceOp?: string) => {
          const event = { type, data, seq: state.events.length + 1, time: Date.now(), ...(surfaceOp ? { surfaceOp } : {}) }
          state.events.push({ type: 'event', event }); chat = chatFixture.append(event); trajectory = trajectoryFixture.append(event)
          for (const listener of [...targetListeners, ...eventListeners]) listener()
        },
        begin: (requestId: string) => {
          state.requestId = requestId; state.running = true; state.notify()
          state.append('turn/start', { turn: 1 })
          state.append('user/message', { id: `input-${record.id}`, role: 'user', source: { kind: 'user', rpcId: requestId }, content: [{ type: 'text', text: record.id }] }, 'append')
          state.append('step/start', { turn: 1, step: 1 })
        },
        finish: (result: string) => {
          state.append('assistant/message', { turn: 1, step: 1, stream: [], message: { id: `reply-${record.id}`, role: 'assistant',
            source: { provider: 'synthetic', model: 'synthetic' }, content: [{ type: 'text', text: `<FINAL>${record.id}</FINAL>` }] } }, 'append')
          state.append('step/end', { turn: 1, step: 1 })
          state.append('turn/end', { turn: 1, reason: result === 'cancelled' ? { kind: 'aborted', reason: 'user' }
            : result === 'error' ? { kind: 'error', error: { message: `Synthetic failure ${record.id}` } } : { kind: 'completed' } })
          state.running = false; state.notify()
        },
      }
      state.session = { getSnapshot: () => ({ running: state.running, removed: state.removed }), subscribe: subscribe(listeners),
        prompt: vi.fn(async (_content: unknown, _mode: string, _signal: unknown, requestId: string) => {
          state.begin(requestId)
          if (record.id === 'chat-a' && stage === 'admission') await admission
          return { ok: true, value: { accepted: true } }
        }),
        cancel: vi.fn(async () => { state.finish('cancelled'); return { ok: true, value: { accepted: true } } }),
      }
      state.binding = { session: state.session, eventSource: { getSnapshot: () => ({ revision: state.events.length,
        entries: state.events, hasMore: false, change: { kind: 'replace' } }), subscribe: subscribe(eventListeners) } }
      state.targets = { chat: { getSnapshot: () => chat, subscribe: subscribe(targetListeners) },
        trajectory: { getSnapshot: () => trajectory, subscribe: subscribe(targetListeners) } }
      return [record.runtimeSessionId, state]
    }))
    catalog.sessions = { list: { getSnapshot: () => ({ byId: Object.fromEntries(records.map(record => [record.runtimeSessionId, {}])) }) },
      refresh: async () => {}, reloadHistory: vi.fn(async () => {}), retain: (id: string, options: { source: string }) => {
        const binding = states.get(id).binding, release = vi.fn()
        references.push({ id, source: options.source, release }); return { sessionId: id, binding, ready: Promise.resolve(binding), release }
      } }
    catalog.uiConversation = { binding: (binding: any) => ({ target: (name: string) => [...states.values()].find(state => state.binding === binding).targets[name] }) }
    catalog.remote.session = {}
    catalog.remote.eleckoiConversations.preparePrompt = async (id: string) => {
      if (id === 'chat-a' && stage === 'prepare') await preparation
      return { ok: true, value: {} }
    }
    catalog.remote.eleckoiConversations.regenerateMessage = async (id: string) => {
      const state = states.get(id.replace('chat-', 'session-')); state.removed = true; state.notify()
      if (id === 'chat-a' && stage === 'prepare') await preparation
      state.removed = false
      return { ok: true, value: { prepared: true } }
    }
    catalog.remote.eleckoiConversations.startRegeneration = async (id: string, requestId: string) => {
      states.get(id.replace('chat-', 'session-')).begin(requestId)
      if (id === 'chat-a' && stage === 'admission') await admission
      return { ok: true, value: { accepted: true, turn: 1 } }
    }
    let first: Promise<any> | undefined, second: Promise<any> | undefined
    try {
      await settle(); await catalog.open('chat-a')
      first = (kind === 'send' ? catalog.send({ conversationId: 'chat-a', requestId: 'request-a', text: 'A' })
        : catalog.regenerate({ conversationId: 'chat-a', requestId: 'request-a', eventSeq: 2 }))
        .then((value: any) => ({ value }), (error: Error) => ({ error }))
      await settle()
      await catalog.open('chat-b')
      second = catalog.send({ conversationId: 'chat-b', requestId: 'request-b', text: 'B' })
      await settle(); releasePrepare(); releaseAdmission(); await settle()
      expect(catalog.activeRequests.size).toBe(2)
      expect(catalog.getDetailsSnapshot().id).toBe('chat-b')
      expect(states.get('session-a').requestId).toBe('request-a')
      expect(states.get('session-b').requestId).toBe('request-b')
      const requestA = references.find(reference => reference.id === 'session-a' && reference.source.endsWith('.request'))!
      expect(requestA.release).not.toHaveBeenCalled()
      states.get('session-a').finish(outcome)
      const result = await first
      if (outcome === 'error') expect(result.error.message).toContain('Synthetic failure chat-a')
      else expect(result.value).toMatchObject({ details: { conversation: { id: 'chat-a' } }, cancelled: outcome === 'cancelled' })
      expect(requestA.release).toHaveBeenCalledOnce()
      expect(catalog.getDetailsSnapshot().id).toBe('chat-b')
      expect(states.get('session-b').running).toBe(true)
      expect(catalog.activeRequests.size).toBe(1)
      await catalog.cancelRequest('chat-b', 'request-b'); await second
      expect(states.get('session-a').session.cancel).not.toHaveBeenCalled()
      expect(states.get('session-b').session.cancel).toHaveBeenCalledOnce()
      expect(catalog.activeRequests.size).toBe(0)
      await catalog.open('chat-a')
      expect(catalog.getDetailsSnapshot().details.messages.some((message: any) => message.content === 'chat-a')).toBe(true)
    } finally {
      releasePrepare(); releaseAdmission()
      for (const state of states.values()) if (state.running) state.finish('complete')
      await Promise.allSettled([first, second]); r.dispose()
    }
  })
})

interface Result {
  ok: boolean
  data?: Array<{ id: string }>
  error?: { isDSHRemoteError?: true; code?: string; message: string; details?: unknown }
}

type ConversationChange =
  | { kind: 'snapshot' }
  | { kind: 'catalog'; conversationId: string; reason: 'created' | 'deleted' }
  | { kind: 'messages'; conversationId: string; reason: 'edited' | 'deleted' | 'regenerated'; messageIds: string[] }

function conversationChangeFeed() {
  type StreamState = {
    queue: ConversationChange[]
    done: boolean
    wake: (() => void) | undefined
  }
  const streams = new Set<StreamState>()
  let stopped = false
  return {
    open(signal?: AbortSignal): AsyncIterable<ConversationChange> {
      const state: StreamState = { queue: [{ kind: 'snapshot' }], done: false, wake: undefined }
      streams.add(state)
      const stop = () => {
        if (state.done) return
        state.done = true
        streams.delete(state)
        stopped = true
        state.wake?.()
        state.wake = undefined
      }
      if (signal?.aborted) stop()
      else signal?.addEventListener('abort', stop, { once: true })
      return (async function* () {
        try {
          while (!state.done) {
            if (state.queue.length > 0) {
              yield state.queue.shift()!
              continue
            }
            await new Promise<void>(resolve => { state.wake = resolve })
            state.wake = undefined
          }
        } finally {
          signal?.removeEventListener('abort', stop)
          stop()
        }
      })()
    },
    emit(change: ConversationChange) {
      for (const state of streams) {
        state.queue.push(change)
        state.wake?.()
        state.wake = undefined
      }
    },
    isStopped: () => stopped
  }
}

function conversationRemote(
  read: (name?: string, input?: unknown) => Promise<Result | unknown>,
  changes = conversationChangeFeed(),
  projectDisplay?: (conversationId: string, messages: any[]) => Promise<any[]>
) {
  return {
    eleckoiConversations: {
      changes: (signal?: AbortSignal) => changes.open(signal),
      list: async () => {
        const result = await read('query.conversations.list', {}) as Result
        return result?.ok
          ? { ok: true, value: result.data ?? [] }
          : result
      },
      details: async (conversationId: string, beforeSequence?: number, limit?: number) => {
        const name = beforeSequence === undefined ? 'query.conversations.details' : 'query.conversations.messages'
        const result = await read(name, { conversationId, beforeSequence, limit }) as Result
        return result?.ok ? { ok: true, value: result.data } : result
      },
      variableTimeline: async (conversationId: string) => {
        const result = await read('query.conversations.variable_timeline', { conversationId }) as Result
        return result?.ok ? { ok: true, value: result.data } : result
      },
      ...(projectDisplay ? {
        projectDisplay: async (conversationId: string, messages: any[]) => ({
          ok: true,
          value: await projectDisplay(conversationId, messages)
        })
      } : {})
    }
  }
}

function mountCatalog(
  request: (name?: string, input?: unknown) => Promise<Result | unknown>,
  runtime: {
    allowOtherQueries?: boolean
    conversation?: { input: { for: (ctx: unknown) => unknown } }
    requestAnimationFrame?: (callback: () => void) => number
    cancelAnimationFrame?: (id: number) => void
    json?: Pick<JSON, 'parse' | 'stringify'>
    sessions?: { list: { getSnapshot: () => { byId: Record<string, { updatedAt: number; projectionValues?: { eleckoiConversationActivity: number } }> }; subscribe: (listener: () => void) => () => void } }
  } = {}
) {
  let registration: { id: string; factory: () => { apply: (ctx: unknown) => void } } | undefined
  const changes = conversationChangeFeed()
  let cleanup = () => {}
  let catalog: {
    getSnapshot: () => { status: string; items: Array<{ id: string }>; error: string }
    subscribe: (listener: () => void) => () => void
    refresh: () => Promise<Array<{ id: string }>>
  } | undefined
  const read = (name?: string, input?: unknown) => {
    if (!runtime.allowOtherQueries) {
      expect(name).toBe('query.conversations.list')
      expect(input).toEqual({})
    }
    return request(name, input)
  }
  runInNewContext(source, {
    AbortController,
    setTimeout, clearTimeout,
    JSON: runtime.json ?? JSON,
    requestAnimationFrame: runtime.requestAnimationFrame,
    cancelAnimationFrame: runtime.cancelAnimationFrame,
    window: {
      __ModuleLoader__: { load: (item: typeof registration) => { registration = item } }
    }
  })
  expect(registration?.id).toBe('@eleckoi/dsh-client-conversations')
  dshClientPlugin(registration!).apply({
    remote: conversationRemote(read, changes),
    sessions: runtime.sessions,
    conversation: runtime.conversation,
    provide: (name: string, value: typeof catalog) => {
      expect(name).toBe('eleckoiConversations')
      catalog = value
    },
    effect: (run: () => () => void) => { cleanup = run() },
    on: () => () => {}
  })
  if (!catalog) throw new Error('Conversation catalog was not provided')
  return {
    catalog,
    emit: (change: ConversationChange) => changes.emit(change),
    dispose: () => cleanup(),
    isStopped: changes.isStopped
  }
}

describe('DSH ElecKoi conversation client model', () => {
  it('observes only the selected Session model and releases the prior projection on a chat switch', async () => {
    const mounted = mountCatalog(async () => ({ ok: true, data: [] }))
    const catalog = mounted.catalog as any
    const listeners = new Set<() => void>()
    let selected = { provider: 'synthetic', model: 'model-a' }
    const face = { getSnapshot: () => ({ next: selected }), subscribe: (fn: () => void) => {
      listeners.add(fn); return () => { listeners.delete(fn) }
    } }
    try {
      await settle()
      catalog.publishDetails({ id: 'chat-a', runtimeSessionId: 'session-a', status: 'loading', details: null })
      const stop = catalog.subscribeModelSelection(vi.fn())
      catalog.sessionReference = { sessionId: 'session-a', release: vi.fn(), binding: { session: { projections: { faceOf: () => face } } } }
      catalog.sessionTarget = {}
      catalog.publishDetails({ id: 'chat-a', runtimeSessionId: 'session-a', status: 'loading', details: null })
      expect(catalog.getModelSelectionSnapshot()).toEqual(selected)
      expect(listeners.size).toBe(1)
      selected = { provider: 'synthetic', model: 'model-b' }
      for (const listener of listeners) listener()
      expect(catalog.getModelSelectionSnapshot()).toEqual(selected)
      catalog.releaseOfficialSession()
      catalog.publishDetails({ id: 'chat-b', runtimeSessionId: 'session-b', status: 'loading', details: null })
      catalog.publishModelSelection({ provider: 'synthetic', model: 'late-model-a' }, 'chat-a')
      expect(catalog.getModelSelectionSnapshot()).toEqual({ provider: '', model: '' })
      expect(listeners.size).toBe(0)
      catalog.publishModelSelection({ provider: 'synthetic', model: 'model-c' }, 'chat-b')
      expect(catalog.getModelSelectionSnapshot()).toEqual({ provider: 'synthetic', model: 'model-c' })
      stop()
    } finally { mounted.dispose() }
    expect(listeners.size).toBe(0)
  })

  it.each(['send', 'regenerate'])('publishes %s activity without reopening a chat or fetching the catalog, and releases the subscription', async mode => {
    const records = [
      { id: 'chat-a', runtimeSessionId: 'runtime-a', updatedAt: '2026-11-01T10:00:00.000Z' },
      { id: 'chat-b', runtimeSessionId: 'runtime-b', updatedAt: '2026-11-01T09:00:00.000Z' },
    ]
    let byId: Record<string, { updatedAt: number; projectionValues?: { eleckoiConversationActivity: number } }> = {
      'runtime-a': { updatedAt: Date.parse(records[0]!.updatedAt) }, 'runtime-b': { updatedAt: Date.parse(records[1]!.updatedAt) } }
    const listeners = new Set<() => void>()
    const read = vi.fn(async () => ({ ok: true, data: records }))
    const r = mountCatalog(read, { sessions: { list: { getSnapshot: () => ({ byId }),
      subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener) } } } } })
    const catalog = r.catalog as any
    try {
      await settle()
      const changed = vi.fn(), stop = catalog.subscribe(changed)
      const activity = Date.parse('2026-11-06T10:00:00.000Z')
      byId = { ...byId, 'runtime-b': mode === 'send' ? { updatedAt: activity }
        : { updatedAt: Date.parse(records[1]!.updatedAt), projectionValues: { eleckoiConversationActivity: activity } } }
      for (const listener of listeners) listener()
      expect(catalog.getSnapshot().items.find((item: any) => item.id === 'chat-b').updatedAt).toBe(new Date(activity).toISOString())
      expect(changed).toHaveBeenCalledOnce()
      for (const listener of listeners) listener()
      expect(changed).toHaveBeenCalledOnce()
      expect(read).toHaveBeenCalledOnce()
      expect(catalog.getDetailsSnapshot().id).toBe('')
      await catalog.refresh()
      expect(catalog.getSnapshot().items.find((item: any) => item.id === 'chat-b').updatedAt).toBe(new Date(activity).toISOString())
      expect(records[1]!.updatedAt).toBe('2026-11-01T09:00:00.000Z')
      stop()
    } finally { r.dispose() }
    expect(listeners.size).toBe(0)
  })

  it('exposes only the ready current Session without transferring its release ownership', async () => {
    const mounted = mountCatalog(async () => ({ ok: true, data: [] }))
    const catalog = mounted.catalog as any
    const reference = { sessionId: 'synthetic-session', release: vi.fn() }
    try {
      await settle()
      catalog.sessionReference = reference
      expect(catalog.getSessionReference(reference.sessionId)).toBeNull()
      catalog.sessionTarget = { getSnapshot: () => null }
      expect(catalog.getSessionReference('other-session')).toBeNull()
      expect(catalog.getSessionReference(reference.sessionId)).toBe(reference)
      expect(reference.release).not.toHaveBeenCalled()
      catalog.releaseOfficialSession()
      expect(reference.release).toHaveBeenCalledOnce()
      expect(catalog.getSessionReference(reference.sessionId)).toBeNull()
    } finally { mounted.dispose() }
  })

  it('moves official retry attempts into their AI processing history and retains cancellation and failure facts', async () => {
    const mounted = mountCatalog(async () => ({ ok: true, data: [] }))
    const catalog = mounted.catalog as any, fixture = officialChatFixture()
    const event = (type: string, seq: number, data: unknown) => ({ type, seq, time: seq * 100, data })
    const retry = { retryId: 'synthetic-retry', turn: 1, step: 1, provider: 'synthetic-provider', mode: 'normal',
      policyKey: 'synthetic-policy', retry: 1, maxRetries: 5, delayMs: 1000,
      failure: { code: 'RATE_LIMIT', status: 429, message: 'Synthetic overload' } }
    try {
      await settle()
      let snapshot = fixture.replace([event('turn/start', 1, { turn: 1 }), event('step/start', 2, { turn: 1, step: 1 }),
        event('llm/retry', 3, retry)])
      const retryNode = [...snapshot.nodes.values()].find((node: any) => node.kind === 'model-retry') as any
      expect(selectRoleplayChatSeat([], 'synthetic-session', retryNode)).toBeNull()
      let items = catalog.officialProcess(snapshot).get(1)
      expect(items).toHaveLength(1)
      expect(items[0]).toMatchObject({ kind: 'action', toolName: 'model_retry', status: 'running', summary: '等待重试模型请求（1/5）' })
      const identity = items[0].id
      snapshot = fixture.append(event('llm/retry-started', 4, { retryId: retry.retryId, turn: 1, step: 1, retry: 1 }))
      items = catalog.officialProcess(snapshot).get(1)
      expect(items[0]).toMatchObject({ id: identity, status: 'complete', summary: '已重试模型请求（1/5）' })
      expect(JSON.parse(items[0].detail).failure).toEqual(retry.failure)
      snapshot = fixture.append(event('llm/retry', 5, { ...retry, retry: 2 }))
      snapshot = fixture.append(event('turn/end', 6, { turn: 1, reason: { kind: 'aborted', reason: { kind: 'user' } } }))
      items = catalog.officialProcess(snapshot).get(1)
      expect(items).toHaveLength(2)
      expect(items[0].id).toBe(identity)
      expect(items[1]).toMatchObject({ status: 'cancelled', summary: '模型重试已取消（2/5）' })
      expect(selectRoleplayChatSeat([], 'synthetic-session', { kind: 'turn-error' })).toBeNull()
    } finally { mounted.dispose() }
  })

  it.each(['error', 'max-tokens'])('keeps tool results and %s details in the owning reply during updates and history replay', async reasonKind => {
    const mounted = mountCatalog(async () => ({ ok: true, data: [] }))
    const catalog = mounted.catalog as any, fixture = officialChatFixture()
    const event = (type: string, seq: number, data: any, surfaceOp?: string) => ({ type, seq, time: seq * 100, data,
      ...(surfaceOp ? { surfaceOp } : {}) })
    const events = [event('turn/start', 1, { turn: 1 }), event('step/start', 2, { turn: 1, step: 1 }),
      event('user/message', 3, { id: 'synthetic-input', role: 'user', source: { kind: 'user', rpcId: 'synthetic-request' },
        content: [{ type: 'text', text: 'Synthetic input' }] }, 'append')]
    for (const [index, isError] of [false, true].entries()) {
      events.push(event('tool/call', 4 + index * 2, { turn: 1, step: 1, callId: `synthetic-call-${index}`,
        name: 'eleckoi_glob_setting_files', arguments: '{}' }))
      events.push(event('tool/result', 5 + index * 2, { turn: 1, step: 1, message: {
        id: `synthetic-result-${index}`, role: 'tool', source: { callId: `synthetic-call-${index}` }, isError,
        content: [{ type: 'text', text: isError ? 'Synthetic tool failure' : 'Synthetic tool success' }] } }, 'append'))
    }
    let chat = fixture.replace(events), running = true
    const state = { getSnapshot: () => ({ running }) }, target = { getSnapshot: () => chat }
    const reply = () => catalog.getDetailsSnapshot().details.messages.find((message: any) => message.role === 'assistant')
    try {
      await settle()
      catalog.detailsSnapshot = { id: 'synthetic-chat', status: 'ready', runtimeSessionId: 'synthetic-session', error: '',
        details: { conversation: { id: 'synthetic-chat' }, metadata: {}, messages: [], hasMore: false } }
      catalog.acceptOfficialSession('synthetic-chat', 'synthetic-session', state, target)
      expect(reply().process).toMatchObject([{ status: 'complete', detail: 'Synthetic tool success' },
        { status: 'error', detail: 'Synthetic tool failure' }])
      for (const node of chat.nodes.values() as any) {
        if (node.kind === 'tool-call') expect(selectRoleplayChatSeat([], 'synthetic-session', node)).toBeNull()
      }
      if (reasonKind === 'max-tokens') events.push(event('assistant/message', 8, { turn: 1, step: 1, stream: [], message: {
        id: 'synthetic-partial-reply', role: 'assistant', source: { provider: 'synthetic', model: 'synthetic' },
        content: [{ type: 'text', text: '<FINAL>Synthetic partial reply</FINAL>' }] } }, 'append'))
      events.push(event('step/end', 9, { turn: 1, step: 1 }), event('turn/end', 10, { turn: 1,
        reason: reasonKind === 'error' ? { kind: 'error', error: { message: 'Synthetic generation failure', code: 'TEST_FAILURE' } }
          : { kind: 'max-tokens' } }))
      chat = fixture.replace(events); running = false
      catalog.acceptOfficialSession('synthetic-chat', 'synthetic-session', state, target)
      const noticeKind = reasonKind === 'error' ? 'turn-error' : 'turn-max-tokens'
      const notice = [...chat.nodes.values()].find((node: any) => node.kind === noticeKind) as any
      expect(selectRoleplayChatSeat([], 'synthetic-session', notice)).toBeNull()
      const completed = reply()
      expect(completed.process).toHaveLength(3)
      expect(completed.process.at(-1)).toMatchObject({ toolName: reasonKind === 'error' ? 'turn_error' : 'turn_max_tokens', status: 'error' })
      expect(JSON.parse(completed.process.at(-1).detail)).toEqual(notice.data)
      expect(completed.status).toBe(reasonKind === 'error' ? 'error' : 'complete')
      expect(catalog.getDetailsSnapshot().details.messages.find((message: any) => message.role === 'user').status).toBe('complete')
      expect(completed.displayContent).toBe(reasonKind === 'error' ? '' : 'Synthetic partial reply')
      chat = fixture.replace(events)
      catalog.acceptOfficialSession('synthetic-chat', 'synthetic-session', state, target)
      expect(reply().process).toEqual(completed.process)
      expect(catalog.getDetailsSnapshot().details.messages.filter((message: any) => message.role === 'assistant')).toHaveLength(1)
    } finally { mounted.dispose() }
  })

  it('compares live state and regex inputs without serializing growing text, while detecting equal-length changes', async () => {
    const stringify = vi.fn((value: unknown) => JSON.stringify(value))
    const mounted = mountCatalog(async () => ({ ok: true, data: [] }), { json: { parse: JSON.parse, stringify } })
    const catalog = mounted.catalog as any
    const payload = 'synthetic-result '.repeat(128_000)
    const item = { id: 'synthetic-call', kind: 'tool', status: 'running', toolName: 'synthetic_tool',
      arguments: payload, summary: 'Synthetic tool', detail: payload, startedAtMillis: 10 }
    const stream = { id: 'synthetic-chat', status: 'running', runId: 'synthetic-session',
      requestId: '', messageId: 'synthetic-message', nodeKey: 'synthetic-node', sequence: 1,
      renderKey: 'synthetic-render', dshTurn: 1, content: payload, process: [item], error: '' }
    const display = vi.fn(async () => ({ ok: true, value: [] }))
    catalog.remote.eleckoiConversations.projectDisplay = display
    const messages = [{ id: 'synthetic-message', role: 'assistant', status: 'streaming',
      content: payload, variableStateJson: '{}', createdAt: '2026-01-01T00:00:00.000Z' }]
    try {
      await settle()
      catalog.publishStream(stream)
      const before = catalog.getStreamSnapshot()
      for (let index = 0; index < 20; index += 1) {
        catalog.publishStream({ ...stream, sequence: index + 2, process: [{ ...item }] })
        await catalog.scheduleDisplayProjection('synthetic-chat', { messages: [{ ...messages[0], content: `${payload}${index}` }] })
      }
      expect(catalog.getStreamSnapshot()).toBe(before)
      expect(display).toHaveBeenCalledTimes(1)
      catalog.publishStream({ ...stream, process: [{ ...item, detail: `${payload.slice(0, -1)}!` }] })
      expect(catalog.getStreamSnapshot()).not.toBe(before)
      expect(catalog.getStreamSnapshot().process[0].detail).toBe(`${payload.slice(0, -1)}!`)
      await catalog.scheduleDisplayProjection('synthetic-chat', { messages: [{ ...messages[0], status: 'complete' }] })
      await catalog.scheduleDisplayProjection('synthetic-chat', { messages: [{ ...messages[0], status: 'complete', content: `${payload.slice(0, -1)}!` }] })
      expect(display).toHaveBeenCalledTimes(3)
      expect(stringify).not.toHaveBeenCalled()
    } finally { mounted.dispose() }
  })

  it('reuses unchanged large historical tool results and invalidates them on replacement and Session release', async () => {
    const mounted = mountCatalog(async () => ({ ok: true, data: [] }))
    const catalog = mounted.catalog as any
    const readPayload = vi.fn(() => 'Synthetic tool result '.repeat(8192))
    const root = { kind: 'tool-result', callId: 'synthetic-tool-1', callTime: 10, time: 20,
      call: { name: 'synthetic_tool', argsRaw: '{"value":1}' },
      content: [{ type: 'text', get text() { return readPayload() } }], subCalls: [] }
    const historical = { key: 'synthetic-tool', kind: 'tool-call', anchorSeq: 3,
      location: { kind: 'step', turn: { turn: 1 } }, data: { root } }
    const nodes = new Map<string, any>([[historical.key, historical]])
    const snapshot = () => ({ order: [...nodes.keys()], nodes })
    try {
      await settle()
      const original = catalog.officialProcess(snapshot()).get(1)[0]
      expect(readPayload).toHaveBeenCalledTimes(1)
      for (let index = 0; index < 30; index += 1) {
        nodes.set('synthetic-live', { key: 'synthetic-live', kind: 'assistant-step', anchorSeq: 10,
          location: { kind: 'step', turn: { turn: 2 } }, data: { turn: 2, step: 1, status: 'running', time: 30,
            blocks: [{ kind: 'reasoning', text: `Synthetic thought ${index}` }] } })
        expect(catalog.officialProcess(snapshot()).get(1)[0]).toBe(original)
      }
      expect(readPayload).toHaveBeenCalledTimes(1)
      nodes.set(historical.key, { ...historical, data: { root: { ...root, isError: true } } })
      expect(catalog.officialProcess(snapshot()).get(1)[0]).toMatchObject({ status: 'error', detail: original.detail })
      expect(readPayload).toHaveBeenCalledTimes(2)
      catalog.releaseOfficialSession()
      catalog.officialProcess(snapshot())
      expect(readPayload).toHaveBeenCalledTimes(3)
    } finally { mounted.dispose() }
  })

  it('keeps historical message objects stable through real official stream publications, prepend and replacement', async () => {
    const mounted = mountCatalog(async () => ({ ok: true, data: [] }))
    const catalog = mounted.catalog as any
    const fixture = officialChatFixture()
    const event = (type: string, seq: number, data: any, surfaceOp?: unknown) => ({ type, seq, time: seq * 10, data,
      ...(surfaceOp === undefined ? {} : { surfaceOp }) })
    const turn = (number: number, offset: number) => [
      event('turn/start', offset + 1, { turn: number }), event('step/start', offset + 2, { turn: number, step: 1 }),
      event('user/message', offset + 3, { id: `synthetic-input-${number}`, role: 'user', source: { kind: 'user' },
        content: [{ type: 'text', text: `Synthetic input ${number}` }] }, 'append'),
      event('assistant/message', offset + 4, { turn: number, step: 1, stream: [], message: {
        id: `synthetic-reply-${number}`, role: 'assistant', source: { provider: 'synthetic', model: 'synthetic' },
        content: [{ type: 'text', text: `<FINAL>Synthetic reply ${number}</FINAL>` }] } }, 'append'),
      event('step/end', offset + 5, { turn: number, step: 1 }), event('turn/end', offset + 6, { turn: number, reason: { kind: 'completed' } }),
    ]
    const history = Array.from({ length: 120 }, (_, index) => turn(index + 2, (index + 1) * 6)).flat()
    let chat = fixture.replace(history)
    let running = false
    const state = { getSnapshot: () => ({ running }) }
    const target = { getSnapshot: () => chat }
    const messages = () => catalog.getDetailsSnapshot().details.messages
    try {
      await settle()
      catalog.detailsSnapshot = { id: 'synthetic-chat', status: 'ready', runtimeSessionId: 'synthetic-session', error: '',
        details: { conversation: { id: 'synthetic-chat' }, metadata: {}, messages: [], hasMore: false } }
      catalog.acceptOfficialSession('synthetic-chat', 'synthetic-session', state, target)
      const first = messages().find((message: any) => message.id === 'synthetic-reply-2')
      expect(first).toMatchObject({ messageIndex: 1, displayContent: 'Synthetic reply 2', status: 'complete' })
      running = true
      chat = fixture.append(event('turn/start', 727, { turn: 122 }))
      chat = fixture.append(event('step/start', 728, { turn: 122, step: 1 }))
      chat = fixture.append(event('assistant/live-chunk', 728.01, { turn: 122, step: 1,
        attemptId: 'synthetic-live-attempt', chunk: { type: 'block-start', index: 0, blockType: 'text' } }))
      catalog.acceptOfficialSession('synthetic-chat', 'synthetic-session', state, target)
      const stable = messages().find((message: any) => message.id === first.id)
      const processProjection = vi.spyOn(catalog, 'officialProcess')
      for (let index = 0; index < 12; index += 1) {
        chat = fixture.append(event('assistant/live-chunk', 728.1 + index / 100, { turn: 122, step: 1,
          attemptId: 'synthetic-live-attempt', chunk: { type: 'text-delta', index: 0, text: index === 0 ? '<FINAL>' : 'Synthetic ' } }))
        catalog.acceptOfficialSession('synthetic-chat', 'synthetic-session', state, target)
        catalog.acceptOfficialSession('synthetic-chat', 'synthetic-session', state, target)
        expect(messages().find((message: any) => message.id === first.id)).toBe(stable)
      }
      expect(processProjection).toHaveBeenCalledTimes(12)
      expect(catalog.getStreamSnapshot().content).toBe('Synthetic '.repeat(11))
      chat = fixture.prepend(turn(1, 0))
      catalog.acceptOfficialSession('synthetic-chat', 'synthetic-session', state, target)
      expect(messages().find((message: any) => message.id === first.id)).toMatchObject({ messageIndex: 3, content: first.content })
      const replacement = history.slice(0, 6)
      replacement[3] = event('assistant/message', 10, { turn: 2, step: 1, stream: [], message: {
        id: first.id, role: 'assistant', source: { provider: 'synthetic', model: 'synthetic' },
        content: [{ type: 'text', text: '<FINAL>Synthetic edited reply</FINAL>' }] } }, 'append')
      chat = fixture.replace(replacement); running = false
      catalog.acceptOfficialSession('synthetic-chat', 'synthetic-session', state, target)
      expect(messages()).toHaveLength(2)
      expect(messages()[1]).toMatchObject({ id: first.id, displayContent: 'Synthetic edited reply', status: 'complete', messageIndex: 1 })
    } finally { mounted.dispose() }
  })

  it('recovers the human input for historic child wakes without retiring the original answer or skipping round labels', async () => {
    const mounted = mountCatalog(async () => ({ ok: true, data: [] }))
    const catalog = mounted.catalog as any
    const fixture = officialChatFixture()
    const event = (type: string, seq: number, data: any, surfaceOp?: unknown) => ({ type, seq, time: seq * 10, data,
      ...(surfaceOp === undefined ? {} : { surfaceOp }) })
    const message = (id: string, role: string, text: string, source: any) => ({ id, role, source, content: [{ type: 'text', text }] })
    const answer = (turn: number, step: number, seq: number, text: string) => event('assistant/message', seq, { turn, step, stream: [],
      message: message(`reply-${seq}`, 'assistant', `<FINAL>${text}</FINAL>`, { provider: 'synthetic', model: 'synthetic' }) }, 'append')
    const values = [event('turn/start', 1, { turn: 5 }), event('step/start', 2, { turn: 5, step: 1 }),
      event('user/message', 3, message('human-input', 'user', 'Synthetic delegation', { kind: 'user' }), 'append'),
      event('subagent/catalog', 3.5, { version: 0, childId: 'child', childCreatedAt: 35, mode: 'continuable', label: 'Synthetic task' }),
      answer(5, 1, 4, 'Synthetic dispatch reply'), event('step/end', 5, { turn: 5, step: 1 }),
      event('turn/end', 6, { turn: 5, reason: { kind: 'completed' } }), event('turn/start', 7, { turn: 6 }),
      event('step/start', 8, { turn: 6, step: 1 }),
      event('user/message', 9, message('child-result', 'user', 'Synthetic child result',
        { kind: 'agent-message', form: 'relay', senderSessionId: 'child' }), 'append'),
      answer(6, 1, 10, 'Synthetic delivered result'), event('step/end', 11, { turn: 6, step: 1 }),
      event('step/start', 12, { turn: 6, step: 2 }),
      event('user/message', 13, message('child-notice', 'user', 'Synthetic child closing result',
        { kind: 'subagent-settled', form: 'notice', summary: 'Child finished', senderSessionId: 'child' }), 'append'),
      answer(6, 2, 14, 'Synthetic closing reply'), event('step/end', 15, { turn: 6, step: 2 }),
      event('turn/end', 16, { turn: 6, reason: { kind: 'completed' } }),
    ]
    const identities = inputContinuationsProjection.wire.view(values.reduce(inputContinuationsProjection.apply, inputContinuationsProjection.init()))
    const chat = fixture.replace(values)
    try {
      await settle()
      catalog.detailsSnapshot = { id: 'synthetic-chat', status: 'ready', runtimeSessionId: 'synthetic-session', error: '',
        details: { conversation: { id: 'synthetic-chat' }, metadata: {}, messages: [], hasMore: false } }
      catalog.sessionReference = { sessionId: 'synthetic-session', binding: {
        eventSource: { getSnapshot: () => ({ entries: values.map(event => ({ type: 'event', event })) }) }, session: {
          getSnapshot: () => ({ running: false }), projections: {
        faceOf: (key: string) => key === 'eleckoiInputContinuations' ? { getSnapshot: () => identities } : undefined
      } } } }
      catalog.acceptOfficialSession('synthetic-chat', 'synthetic-session', { getSnapshot: () => ({ running: false }) }, { getSnapshot: () => chat })
      const messages = catalog.getDetailsSnapshot().details.messages
      expect(messages.map((item: any) => item.content)).toEqual(['Synthetic delegation', '<FINAL>Synthetic dispatch reply</FINAL>', '<FINAL>Synthetic closing reply</FINAL>'])
      expect(messages.at(-1)).toMatchObject({ dshTurn: 6, inputEventSeq: 3 })
      expect(findRegenerateBranchUserIndex(messages, messages.at(-1).id)).toBe(0)
      const trajectory = adaptTrajectorySnapshot({ eventNodes: [], requests: [] }, undefined, identities)
      expect([...trajectory.turnLabels]).toEqual([[5, 1], [6, 1]])
      expect(trajectory.inputTurns.get(3)).toBe(5)
    } finally { catalog.sessionReference = undefined; mounted.dispose() }
  })

  it('reuses settled nested dispatch results when only their parent call or sibling changes', async () => {
    const mounted = mountCatalog(async () => ({ ok: true, data: [] }))
    const catalog = mounted.catalog as any
    const readResult = vi.fn(() => 'Synthetic nested result '.repeat(8192))
    const settledChild = { kind: 'tool-result', callId: 'synthetic-child', callTime: 10, time: 20,
      call: { name: 'synthetic_child', argsRaw: '{}' }, subCalls: [],
      content: [{ type: 'text', get text() { return readResult() } }] }
    const parent = { phase: 'start', callId: 'synthetic-parent', name: 'synthetic_parent', argsRaw: '{}',
      turn: 1, step: 1, time: 5, subCalls: [settledChild] }
    const node = { key: 'synthetic-root', kind: 'tool-call', anchorSeq: 1,
      location: { kind: 'step', turn: { turn: 1 } }, data: { root: parent } }
    let current = node
    const snapshot = () => ({ order: [node.key], nodes: new Map([[node.key, current]]) })
    try {
      await settle()
      const original = catalog.officialProcess(snapshot()).get(1)[1]
      for (let index = 0; index < 20; index += 1) {
        current = { ...node, data: { root: { ...parent, subCalls: [settledChild,
          { phase: 'start', callId: 'synthetic-sibling', name: 'synthetic_child', argsRaw: String(index),
            turn: 1, step: 1, time: 30, subCalls: [] }] } } } as any
        const process = catalog.officialProcess(snapshot()).get(1)
        expect(process[1]).toBe(original)
        expect(process[2]).toMatchObject({ arguments: String(index), parentId: parent.callId })
      }
      expect(readResult).toHaveBeenCalledTimes(1)
      current = { ...node, data: { root: { ...parent, subCalls: [{ ...settledChild, isError: true }] } } } as any
      expect(catalog.officialProcess(snapshot()).get(1)[1]).toMatchObject({ status: 'error', parentId: parent.callId })
      expect(readResult).toHaveBeenCalledTimes(2)
    } finally { mounted.dispose() }
  })

  it('leaves native coding and Studio Sessions on their official send path while a roleplay chat is selected', async () => {
    const mounted = mountCatalog(async () => ({ ok: true, data: [] }))
    const catalog = mounted.catalog as any
    await settle()
    catalog.snapshot = { ...catalog.snapshot, items: [{ id: 'roleplay-chat', runtimeSessionId: 'roleplay-session' }] }
    catalog.detailsSnapshot = { ...catalog.detailsSnapshot, id: 'roleplay-chat' }
    const prepare = vi.fn()
    catalog.remote.eleckoiConversations.preparePrompt = prepare
    try {
      for (const sessionId of ['synthetic-coding-session', 'synthetic-studio-session']) {
        await expect(catalog.prepareNativeInput({ sessionId, text: 'Synthetic edit' })).resolves.toEqual({ kind: 'success' })
        await expect(catalog.prepareNativeInput({ sessionId, signal: AbortSignal.abort() })).rejects.toMatchObject({ name: 'AbortError' })
      }
      expect(prepare).not.toHaveBeenCalled()
    } finally { mounted.dispose() }
  })
  it('still prepares the exact owned roleplay Session and rejects a stale roleplay composer', async () => {
    const mounted = mountCatalog(async () => ({ ok: true, data: [] }))
    const catalog = mounted.catalog as any
    await settle()
    catalog.snapshot = { ...catalog.snapshot, items: [
      { id: 'current-chat', runtimeSessionId: 'current-session' },
      { id: 'previous-chat', runtimeSessionId: 'previous-session' },
    ] }
    catalog.detailsSnapshot = { ...catalog.detailsSnapshot, id: 'current-chat' }
    const prepare = vi.fn(async () => ({ ok: true, value: undefined }))
    catalog.remote.eleckoiConversations.preparePrompt = prepare
    catalog.bindOfficialSession = vi.fn()
    try {
      await expect(catalog.prepareNativeInput({ sessionId: 'previous-session', text: 'Stale draft' })).resolves.toEqual({ kind: 'error', text: '当前聊天与输入框会话不一致。' })
      expect(prepare).not.toHaveBeenCalled()
      await expect(catalog.prepareNativeInput({ sessionId: 'current-session', text: 'Current draft' })).resolves.toEqual({ kind: 'success' })
      expect(prepare).toHaveBeenCalledExactlyOnceWith('current-chat', 'Current draft', undefined)
    } finally { mounted.dispose() }
  })
  it.each(['complete', 'error', 'cancelled'])('does not revive the retired compaction-only AI row during regeneration (%s)', async outcome => {
    const chatFixture = officialChatFixture(), trajectoryFixture = officialTrajectoryFixture()
    const listeners = new Set<() => void>()
    const subscribe = (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener) }
    const event = (type: string, seq: number, data: any, surfaceOp?: any): any => ({
      type, seq, time: seq * 100, data, ...(surfaceOp ? { surfaceOp } : {})
    })
    const input = (id: string, text: string) => ({ id, role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text }] })
    const reply = (id: string, text: string) => ({ id, role: 'assistant', source: { provider: 'synthetic', model: 'synthetic' },
      content: [{ type: 'text', text: `<FINAL>${text}</FINAL>` }] })
    const prefix = [
      event('turn/start', 1, { turn: 1 }), event('step/start', 2, { turn: 1, step: 1 }),
      event('user/message', 3, input('previous-input', 'Synthetic previous input'), 'append'),
      event('assistant/message', 4, { turn: 1, step: 1, stream: [], message: reply('previous-reply', 'Synthetic previous reply') }, 'append'),
      event('step/end', 5, { turn: 1, step: 1 }), event('turn/end', 6, { turn: 1, reason: { kind: 'completed' } }),
      event('turn/start', 7, { turn: 2 }), event('compaction/start', 8, { turn: 2, compactionId: 'old-compaction' }),
      event('compaction/summary', 9, { turn: 2, compactionId: 'old-compaction', summary: [{ type: 'text', text: 'Synthetic summary' }],
        shadowedSeqs: [3, 4], shadowedTokenCount: 8000, provider: 'synthetic', model: 'synthetic' }),
      event('user/message', 10, { id: 'checkpoint', role: 'user', source: { kind: 'compact-checkpoint', compactionId: 'old-compaction' },
        content: [{ type: 'text', text: 'Synthetic summary' }] }, { op: 'replace', startSeq: 3, endSeq: 4 }),
      event('compaction/end', 11, { turn: 2, compactionId: 'old-compaction' }),
      event('step/start', 12, { turn: 2, step: 1 }), event('user/message', 13, input('retained-input', 'Synthetic retained input'), 'append'),
    ]
    let values = [...prefix, ...interruptedTurnClosers(prefix)]
    let chat = chatFixture.replace(values), trajectory = trajectoryFixture.replace(values), running = false, removed = false
    const projections = { faceOf: (name: string) => {
      const projection = name === 'eleckoiInputContinuations' ? inputContinuationsProjection
        : name === 'eleckoiTurnOutcomes' ? turnOutcomesProjection : undefined
      return projection ? { subscribe, getSnapshot: () => projection.wire.view(values.reduce(projection.apply, projection.init())) } : undefined
    } }
    const binding = { session: { getSnapshot: () => ({ running, removed }), subscribe, projections },
      eventSource: { getSnapshot: () => ({ hasMore: false, revision: 0, entries: values.map(event => ({ type: 'event', event })) }), subscribe } }
    const record = { id: 'synthetic-regeneration-chat', runtimeSessionId: 'synthetic-regeneration-session',
      metadata: { characterId: 'synthetic-character', characterName: 'Synthetic character' } }
    const r = mountCatalog(async name => name === 'query.conversations.list' ? { ok: true, data: [record] }
      : { ok: true, data: { conversation: record, metadata: record.metadata, runtimeSessionId: record.runtimeSessionId,
        messages: [], hasMore: false, beforeSequence: null } }, { allowOtherQueries: true })
    const catalog = r.catalog as any
    catalog.sessions = { list: { getSnapshot: () => ({ byId: { [record.runtimeSessionId]: {} } }) },
      refresh: async () => {}, reloadHistory: async () => { removed = false },
      retain: () => ({ sessionId: record.runtimeSessionId, binding, ready: Promise.resolve(binding), release: vi.fn() }) }
    catalog.uiConversation = { binding: () => ({ target: (name: string) => ({ getSnapshot: () => name === 'chat' ? chat : trajectory, subscribe }) }) }
    const publish = () => {
      chat = chatFixture.replace(values); trajectory = trajectoryFixture.replace(values)
      for (const listener of listeners) listener()
    }
    const messages = () => catalog.getDetailsSnapshot().details.messages
    const seats = () => chat.order.map((key: string) => selectRoleplayChatSeat(messages(), record.runtimeSessionId, chat.nodes.get(key)))
      .filter((seat: any) => seat?.item.role === 'assistant')
    const assertOneReplacement = (turn: number) => {
      const assistants = messages().filter((message: any) => message.role === 'assistant')
      expect(assistants.map((message: any) => message.dshTurn)).toEqual([1, turn])
      expect(seats().map((seat: any) => seat.item.dshTurn)).toEqual([1, turn])
      expect(messages().filter((message: any) => message.role === 'user' && message.sessionEventSeq === 13)).toHaveLength(1)
      expect(assistants[1].renderKey).toBe(`dsh-reply-${record.runtimeSessionId}-${turn}`)
      return assistants[1]
    }
    let releaseStart!: () => void
    const startGate = new Promise<void>(resolve => { releaseStart = resolve })
    let starting = false
    catalog.remote.session = {}
    catalog.remote.eleckoiConversations.regenerateMessage = async () => {
      values = [...prefix, ...interruptedTurnClosers(prefix)]
      chat = chatFixture.replace(values); trajectory = trajectoryFixture.replace(values)
      removed = true
      for (const listener of listeners) listener()
      return { ok: true, value: { runtimeSessionId: record.runtimeSessionId, prepared: true } }
    }
    catalog.remote.eleckoiConversations.startRegeneration = async () => {
      starting = true
      await startGate
      return { ok: true, value: { accepted: true, turn: 3 } }
    }
    const publications: number[][] = []
    const stop = catalog.subscribeChat(() => publications.push((catalog.getDetailsSnapshot().details?.messages || []).filter((message: any) => message.role === 'assistant')
      .map((message: any) => message.dshTurn)))
    try {
      await settle(); await catalog.open(record.id)
      // Stopping without reusing the input must retain its process history.
      expect(messages().filter((message: any) => message.role === 'assistant').map((message: any) => message.dshTurn)).toEqual([1, 2])
      values.push(event('turn/start', 16, { turn: 3 }),
        event('eleckoi/input-continuation', 17, { turn: 3, inputEventSeq: 13, inputMessageId: 'retained-input' }),
        event('step/start', 18, { turn: 3, step: 1 }),
        event('assistant/message', 19, { turn: 3, step: 1, stream: [], message: reply('retiring-reply', 'Synthetic retiring reply') }, 'append'),
        event('step/end', 20, { turn: 3, step: 1 }), event('turn/end', 21, { turn: 3, reason: { kind: 'completed' } }))
      publish()
      expect(messages().filter((message: any) => message.role === 'assistant').map((message: any) => message.dshTurn)).toEqual([1, 3])
      publications.length = 0
      const regeneration = catalog.regenerate({ conversationId: record.id, requestId: 'synthetic-regeneration', eventSeq: 13 })
        .then((value: any) => ({ value }), (error: Error) => ({ error }))
      await settle()
      expect(starting).toBe(true)
      // Rebind has completed, but the Host has not yet published the input's
      // continuation. Observe every publication, not just the final snapshot.
      await catalog.refreshDetails()
      expect(messages().filter((message: any) => message.role === 'assistant').map((message: any) => message.dshTurn)).toEqual([1])
      values.push(event('turn/start', 16, { turn: 3 }))
      running = true; publish()
      expect(messages().filter((message: any) => message.role === 'assistant').map((message: any) => message.dshTurn)).toEqual([1])
      expect(publications.every(turns => !turns.includes(2))).toBe(true)
      releaseStart()
      for (const turn of [3, 4]) {
        values = [...prefix, ...interruptedTurnClosers(prefix),
          event('turn/start', 16, { turn }),
          event('eleckoi/input-continuation', 17, { turn, inputEventSeq: 13, inputMessageId: 'retained-input' }),
          event('compaction/start', 18, { turn, compactionId: `new-compaction-${turn}` })]
        running = true; publish()
        expect(assertOneReplacement(turn)).toMatchObject({ status: 'streaming', content: '',
          process: [{ id: 'compaction:18', status: 'running' }] })
        if (outcome === 'complete') values.push(
          event('compaction/summary', 19, { turn, compactionId: `new-compaction-${turn}`, summary: [{ type: 'text', text: 'Synthetic new summary' }],
            shadowedSeqs: [10], shadowedTokenCount: 8000, provider: 'synthetic', model: 'synthetic' }),
          event('user/message', 20, { id: `checkpoint-${turn}`, role: 'user', source: { kind: 'compact-checkpoint', compactionId: `new-compaction-${turn}` },
            content: [{ type: 'text', text: 'Synthetic new summary' }] }, { op: 'replace', startSeq: 10, endSeq: 10 }))
        values.push(event('compaction/end', 21, { turn, compactionId: `new-compaction-${turn}`,
          ...(outcome === 'complete' ? {} : { error: 'Synthetic compaction failure' }) }))
        publish()
        expect(assertOneReplacement(turn).process).toMatchObject([{ status: outcome === 'complete' ? 'complete' : 'error' }])
        if (outcome === 'complete') values.push(event('step/start', 22, { turn, step: 1 }),
          event('assistant/message', 23, { turn, step: 1, stream: [], message: reply(`replacement-${turn}`, 'Synthetic replacement reply') }, 'append'),
          event('step/end', 24, { turn, step: 1 }))
        values.push(event('turn/end', 25, { turn, reason: outcome === 'cancelled' ? { kind: 'aborted', reason: { kind: 'user' } }
          : outcome === 'error' ? { kind: 'error', error: { message: 'Synthetic compaction failure', code: 'UNKNOWN' } } : { kind: 'completed' } }))
        running = false; publish()
        if (turn === 3) {
          const result = await regeneration
          if (outcome === 'error') expect(result.error?.message).toContain('Synthetic compaction failure')
          else expect(result.value.cancelled).toBe(outcome === 'cancelled')
          expect(catalog.activeRequests.size).toBe(0)
        }
        expect(assertOneReplacement(turn).status).toBe(outcome === 'cancelled' ? 'cancelled' : outcome === 'error' ? 'error' : 'complete')
        if (outcome === 'error') expect(assertOneReplacement(turn).process.at(-1)).toMatchObject({ toolName: 'turn_error', status: 'error' })
        catalog.releaseOfficialSession(); await catalog.bindOfficialSession(record.id)
        assertOneReplacement(turn)
      }
    } finally { releaseStart(); stop(); r.dispose() }
  })

  it.each(['rewind-error', 'start-error', 'cancel-before-start'])('restores stopped process history when regeneration is not accepted (%s)', async outcome => {
    const chatFixture = officialChatFixture(), trajectoryFixture = officialTrajectoryFixture()
    const listeners = new Set<() => void>()
    const subscribe = (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener) }
    const event = (type: string, seq: number, data: any, surfaceOp?: any): any => ({
      type, seq, time: seq * 100, data, ...(surfaceOp ? { surfaceOp } : {})
    })
    const values = [
      event('turn/start', 1, { turn: 1 }),
      event('compaction/start', 2, { turn: 1, compactionId: 'stopped-compaction' }),
      event('compaction/end', 3, { turn: 1, compactionId: 'stopped-compaction', error: 'Synthetic compaction failure' }),
      event('step/start', 4, { turn: 1, step: 1 }),
      event('user/message', 5, { id: 'stopped-input', role: 'user', source: { kind: 'user' },
        content: [{ type: 'text', text: 'Synthetic stopped input' }] }, 'append'),
    ]
    values.push(...interruptedTurnClosers(values))
    const chat = chatFixture.replace(values), trajectory = trajectoryFixture.replace(values)
    let removed = false
    const binding = { session: { getSnapshot: () => ({ running: false, removed }), subscribe,
      projections: { faceOf: (name: string) => name === 'eleckoiInputContinuations'
        ? { subscribe, getSnapshot: () => inputContinuationsProjection.wire.view(values.reduce(inputContinuationsProjection.apply, inputContinuationsProjection.init())) }
        : undefined } },
      eventSource: { getSnapshot: () => ({ hasMore: false, revision: 0, entries: values.map(event => ({ type: 'event', event })) }), subscribe } }
    const record = { id: 'synthetic-stopped-chat', runtimeSessionId: 'synthetic-stopped-session',
      metadata: { characterId: 'synthetic-character', characterName: 'Synthetic character' } }
    const r = mountCatalog(async name => name === 'query.conversations.list' ? { ok: true, data: [record] }
      : { ok: true, data: { conversation: record, metadata: record.metadata, runtimeSessionId: record.runtimeSessionId,
        messages: [], hasMore: false, beforeSequence: null } }, { allowOtherQueries: true })
    const catalog = r.catalog as any
    catalog.sessions = { list: { getSnapshot: () => ({ byId: { [record.runtimeSessionId]: {} } }) },
      refresh: async () => {}, reloadHistory: async () => { removed = false },
      retain: () => ({ sessionId: record.runtimeSessionId, binding, ready: Promise.resolve(binding), release: vi.fn() }) }
    catalog.uiConversation = { binding: () => ({ target: (name: string) => ({ getSnapshot: () => name === 'chat' ? chat : trajectory, subscribe }) }) }
    catalog.remote.session = {}
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const errorResult = { ok: false, error: { isDSHRemoteError: true, code: 'gateway/internal', message: 'Synthetic regeneration failure' } }
    catalog.remote.eleckoiConversations.regenerateMessage = async () => {
      if (outcome === 'rewind-error') { await gate; return errorResult }
      removed = true
      for (const listener of listeners) listener()
      return { ok: true, value: { runtimeSessionId: record.runtimeSessionId, prepared: true } }
    }
    const start = vi.fn(async (_conversationId: string, _requestId: string, cancelled: boolean) => {
      await gate
      return outcome === 'start-error' ? errorResult : { ok: true, value: { accepted: !cancelled } }
    })
    catalog.remote.eleckoiConversations.startRegeneration = start
    const controller = new AbortController()
    if (outcome === 'cancel-before-start') controller.abort()
    const assistantTurns = () => catalog.getDetailsSnapshot().details.messages
      .filter((message: any) => message.role === 'assistant').map((message: any) => message.dshTurn)
    try {
      await settle(); await catalog.open(record.id)
      expect(assistantTurns()).toEqual([1])
      const regeneration = catalog.regenerate({ conversationId: record.id, requestId: 'synthetic-rejected-regeneration',
        eventSeq: 5, signal: controller.signal }).then((value: any) => ({ value }), (error: Error) => ({ error }))
      await settle()
      if (outcome !== 'rewind-error') {
        await catalog.refreshDetails()
        expect(assistantTurns()).toEqual([])
      }
      release()
      const result = await regeneration
      if (outcome === 'cancel-before-start') {
        expect(start).toHaveBeenCalledWith(record.id, 'synthetic-rejected-regeneration', true)
        expect(result.value.cancelled).toBe(true)
        expect(result.value.details.messages.filter((message: any) => message.role === 'assistant')
          .map((message: any) => message.dshTurn)).toEqual([1])
      } else expect(result.error.message).toContain('Synthetic regeneration failure')
      expect(catalog.activeRequests.size).toBe(0)
      expect(assistantTurns()).toEqual([1])
      expect(catalog.getDetailsSnapshot().details.messages.filter((message: any) => message.sessionEventSeq === 5)).toHaveLength(1)
      catalog.releaseOfficialSession(); await catalog.bindOfficialSession(record.id)
      expect(assistantTurns()).toEqual([1])
    } finally { release(); r.dispose() }
  })

  it.each(['complete', 'error', 'interrupted'])('projects automatic compaction from its first official trajectory update (%s)', async outcome => {
    const chatFixture = officialChatFixture(), trajectoryFixture = officialTrajectoryFixture()
    const chatListeners = new Set<() => void>(), trajectoryListeners = new Set<() => void>()
    const sessionListeners = new Set<() => void>()
    const subscribe = (listeners: Set<() => void>) => (listener: () => void) => {
      listeners.add(listener); return () => listeners.delete(listener)
    }
    let running = true
    const values: any[] = []
    let chat = chatFixture.replace([]), trajectory = trajectoryFixture.replace([])
    const session = { getSnapshot: () => ({ running }), subscribe: subscribe(sessionListeners) }
    const targets = {
      chat: { getSnapshot: () => chat, subscribe: subscribe(chatListeners) },
      trajectory: { getSnapshot: () => trajectory, subscribe: subscribe(trajectoryListeners) },
    }
    const binding = { session, eventSource: { getSnapshot: () => ({ hasMore: false, revision: 0,
      entries: values.map(event => ({ type: 'event', event })) }), subscribe: () => () => {} } }
    const record = { id: 'synthetic-compact-chat', runtimeSessionId: 'synthetic-compact-session',
      metadata: { characterId: 'synthetic-character', characterName: 'Synthetic character' } }
    const r = mountCatalog(async name => name === 'query.conversations.list' ? { ok: true, data: [record] }
      : { ok: true, data: { conversation: record, metadata: record.metadata, runtimeSessionId: record.runtimeSessionId,
        messages: [], hasMore: false, beforeSequence: null } }, { allowOtherQueries: true })
    const catalog = r.catalog as any
    catalog.sessions = { list: { getSnapshot: () => ({ byId: { [record.runtimeSessionId]: {} } }) },
      retain: () => ({ sessionId: record.runtimeSessionId, binding, ready: Promise.resolve(binding), release: vi.fn() }) }
    catalog.uiConversation = { binding: () => ({ target: (name: keyof typeof targets) => targets[name] }) }
    const append = (type: string, seq: number, data: any, surfaceOp?: any) => {
      const event = { type, seq, time: seq * 100, data, ...(surfaceOp ? { surfaceOp } : {}) }
      values.push(event)
      chat = chatFixture.append(event)
      for (const listener of chatListeners) listener()
      trajectory = trajectoryFixture.append(event)
      // Compaction does not publish a visible Chat node until its checkpoint.
      // Its independent target notification must update the processing row.
      for (const listener of trajectoryListeners) listener()
    }
    try {
      await settle(); await catalog.open(record.id)
      append('turn/start', 1, { turn: 1 })
      append('step/start', 2, { turn: 1, step: 1 })
      append('user/message', 3, { id: 'old-input', role: 'user', source: { kind: 'user' },
        content: [{ type: 'text', text: 'Synthetic previous input' }] }, 'append')
      append('assistant/message', 4, { turn: 1, step: 1, stream: [], message: { id: 'old-reply', role: 'assistant',
        source: { provider: 'synthetic', model: 'synthetic' },
        content: [{ type: 'text', text: '<FINAL>Synthetic previous reply</FINAL>' }] } }, 'append')
      append('step/end', 5, { turn: 1, step: 1 })
      append('turn/end', 6, { turn: 1, reason: { kind: 'completed' } })
      append('turn/start', 7, { turn: 2 })
      append('user/message', 8, { id: 'new-input', role: 'user', source: { kind: 'user' },
        content: [{ type: 'text', text: 'Synthetic next input' }] }, 'append')
      append('compaction/start', 9, { compactionId: 'synthetic-auto', turn: 2 })
      expect(catalog.getStreamSnapshot()).toMatchObject({ status: 'running', dshTurn: 2,
        renderKey: `dsh-reply-${record.runtimeSessionId}-2`, process: [{ kind: 'compaction', status: 'running', startedAtMillis: 900 }] })
      const processId = catalog.getStreamSnapshot().process[0].id
      const liveReply = catalog.getDetailsSnapshot().details.messages.find((item: any) => item.role === 'assistant' && item.dshTurn === 2)
      expect(liveReply).toMatchObject({ status: 'streaming', content: '',
        renderKey: `dsh-reply-${record.runtimeSessionId}-2`, process: [{ id: processId, status: 'running' }] })
      expect(liveReply.sessionEventSeq).toBeUndefined()
      expect(liveReply.processTiming).toEqual({ startedAtMillis: 700 })
      if (outcome === 'complete') {
        append('compaction/summary', 10, { compactionId: 'synthetic-auto', turn: 2,
          summary: [{ type: 'text', text: 'Synthetic compacted summary' }], shadowedSeqs: [3, 4], shadowedTokenCount: 8000,
          provider: 'synthetic', model: 'synthetic' })
        append('user/message', 11, { id: 'synthetic-checkpoint', role: 'user',
          source: { kind: 'compact-checkpoint', compactionId: 'synthetic-auto' },
          content: [{ type: 'text', text: 'Synthetic compacted summary' }] }, { op: 'replace', startSeq: 3, endSeq: 4 })
      }
      append('compaction/end', 12, { compactionId: 'synthetic-auto', turn: 2,
        ...(outcome === 'complete' ? {} : { error: 'Synthetic compaction stopped' }) })
      expect(catalog.getStreamSnapshot().process).toMatchObject([{ id: processId,
        status: outcome === 'complete' ? 'complete' : 'error', completedAtMillis: 1200,
        detail: outcome === 'complete' ? 'Synthetic compacted summary' : 'Synthetic compaction stopped' }])
      append('step/start', 13, { turn: 2, step: 1 })
      if (outcome !== 'interrupted') append('assistant/message', 14, { turn: 2, step: 1, stream: [],
        message: { id: 'new-reply', role: 'assistant', source: { provider: 'synthetic', model: 'synthetic' },
          content: [{ type: 'text', text: '<FINAL>Synthetic reply</FINAL>' }] } }, 'append')
      append('step/end', 15, { turn: 2, step: 1 })
      running = false
      append('turn/end', 16, { turn: 2, reason: outcome === 'interrupted'
        ? { kind: 'aborted', reason: { kind: 'user' } } : { kind: 'completed' } })
      for (const listener of sessionListeners) listener()
      expect(catalog.getStreamSnapshot().status).toBe('idle')
      if (outcome !== 'interrupted') {
        const reply = catalog.getDetailsSnapshot().details.messages.find((item: any) => item.dshTurn === 2 && item.role === 'assistant')
        expect(reply.process).toMatchObject([{ id: processId, status: outcome === 'complete' ? 'complete' : 'error' }])
        expect(reply.processTiming).toEqual({ startedAtMillis: 700, completedAtMillis: 1600 })
        catalog.releaseOfficialSession()
        chat = chatFixture.replace(values); trajectory = trajectoryFixture.replace(values)
        await catalog.bindOfficialSession(record.id)
        expect(catalog.getDetailsSnapshot().details.messages.find((item: any) => item.id === reply.id).process)
          .toMatchObject([{ id: processId, status: outcome === 'complete' ? 'complete' : 'error' }])
        expect(catalog.getDetailsSnapshot().details.messages.find((item: any) => item.id === reply.id).processTiming)
          .toEqual({ startedAtMillis: 700, completedAtMillis: 1600 })
      }
      catalog.releaseOfficialSession()
      expect(chatListeners.size).toBe(0)
      expect(trajectoryListeners.size).toBe(0)
    } finally { r.dispose() }
  })

  it('does not attach idle manual compaction to an AI processing row', async () => {
    const trajectory = officialTrajectoryFixture().replace([
      { type: 'command/run', seq: 1, time: 100, data: { commandId: 'synthetic-command', name: 'compact' } },
      { type: 'compaction/start', seq: 2, time: 200,
        data: { compactionId: 'synthetic-manual', sourceCommandId: 'synthetic-command', turn: null } },
    ])
    const r = mountCatalog(async () => ({ ok: true, data: [] }))
    const catalog = r.catalog as any
    try {
      catalog.sessionTrajectoryTarget = { getSnapshot: () => trajectory }
      expect([...catalog.officialProcess(officialChatFixture().replace([])).values()]).toEqual([])
    } finally { r.dispose() }
  })

  it('refreshes image outcomes when the image projection changes without new chat nodes', () => {
    const r = mountCatalog(async () => ({ ok: true, data: [] }))
    const catalog = r.catalog as any
    let images: any[] = [{ batchId: 'synthetic-batch', status: 'generating' }]
    const empty: any[] = []
    try {
      catalog.sessionReference = { sessionId: 'synthetic-session', binding: { session: { getSnapshot: () => ({ openState: 'closed' }), projections: {
        faceOf: (name: string) => ({ getSnapshot: () => name === 'eleckoiIllustrations' ? images : empty })
      } } } }
      const chat = officialChatFixture().replace([])
      const before = catalog.createOfficialProjectionSignature(chat, 'synthetic-session', false, [], false)
      expect(catalog.sameOfficialProjection(before, catalog.createOfficialProjectionSignature(chat, 'synthetic-session', false, [], false))).toBe(true)
      images = [{ batchId: 'synthetic-batch', status: 'complete' }]
      expect(catalog.sameOfficialProjection(before, catalog.createOfficialProjectionSignature(chat, 'synthetic-session', false, [], false))).toBe(false)
    } finally { catalog.sessionReference = null; r.dispose() }
  })

  it('orders compaction between earlier and later activity by official event anchors, not timestamps', () => {
    const r = mountCatalog(async () => ({ ok: true, data: [] }))
    const catalog = r.catalog as any
    const node = (key: string, anchorSeq: number) => ({ key, kind: 'assistant-step', anchorSeq,
      location: { kind: 'step', turn: { turn: 1 } }, data: { step: anchorSeq, time: 100,
        status: 'complete', blocks: [{ kind: 'reasoning', text: key }] } })
    const before = node('before', 2), after = node('after', 5)
    try {
      catalog.sessionTrajectoryTarget = { getSnapshot: () => ({ requests: [{ purpose: 'compaction',
        turn: 1, startSeq: 3, startedAt: 100, completedAt: null, status: 'running' }] }) }
      const process = catalog.officialProcess({ order: [before.key, after.key], nodes: new Map([[before.key, before], [after.key, after]]) })
      expect(process.get(1).map((item: any) => item.kind)).toEqual(['reasoning', 'compaction', 'reasoning'])
    } finally { r.dispose() }
  })

  it('delivers native SDK generation events from the pinned official event window, not historical replay or idle guesses', async () => {
    const require = createRequire(import.meta.url)
    const { MutableSessionEventSource } = await import(pathToFileURL(join(dirname(require.resolve('@deepseek-ai/dsh-api-session-controller/package.json')),
      'lib/types/client/contract/events.js')).href)
    const events = new MutableSessionEventSource(), sessionListeners = new Set<() => void>(), targetListeners = new Set<() => void>()
    const subscribe = (listeners: Set<() => void>) => (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener) }
    let running = false, nodes = new Map<string, any>(), turns = new Map<number, any>()
    const session = { getSnapshot: () => ({ running }), subscribe: subscribe(sessionListeners) }
    const target = { getSnapshot: () => ({ nodes, order: [...nodes.keys()], timeline: { turns } }), subscribe: subscribe(targetListeners) }
    const binding = { session, eventSource: events }, released = vi.fn()
    const record = { id: 'synthetic-chat', runtimeSessionId: 'synthetic-session', title: '', preview: '', createdAt: '', updatedAt: '',
      metadata: { characterId: 'synthetic-character', characterName: 'Synthetic character', characterAvatar: '' } }
    const r = mountCatalog(async name => name === 'query.conversations.list' ? { ok: true, data: [record] }
      : { ok: true, data: { conversation: record, metadata: record.metadata, runtimeSessionId: record.runtimeSessionId,
        messages: [], hasMore: false, beforeSequence: null } }, { allowOtherQueries: true })
    const catalog = r.catalog as any
    catalog.sessions = { list: { getSnapshot: () => ({ byId: { [record.runtimeSessionId]: {} } }) }, refresh: async () => {},
      retain: () => ({ sessionId: record.runtimeSessionId, binding, ready: Promise.resolve(binding), release: released }) }
    catalog.uiConversation = { binding: () => ({ target: () => target }) }
    const page = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/' }), report = vi.fn()
    const runtime = new NativeAuthorClient({ window: page.window, conversations: catalog, models: {} as any,
      libraries: { subscribeChanges: () => () => {} } as any, report, remote: {
        $stream: <T>(options: ConstructorParameters<typeof RemoteStream<T>>[1]) => new RemoteStream<T>({
          generation: { getSnapshot: () => 'synthetic-generation', subscribe: () => () => {} },
        } as any, options),
        eleckoiAuthorScripts: {
          read: async () => ({ ok: true, value: { conversationId: record.id, characterId: record.metadata.characterId, presetId: '', version: 'synthetic-version', scripts: [] } }),
          connect: (_id: string, version: string, signal: AbortSignal) => {
            const stream = (async function* () {
              yield { kind: 'ready', version }
              await new Promise<void>(resolve => signal.addEventListener('abort', () => resolve(), { once: true }))
            })()
            return Object.assign(stream, { dispose: () => stream.return(undefined) })
          },
        }, eleckoiConversations: { changes: (signal: AbortSignal) => conversationChangeFeed().open(signal) },
      } as any })
    const changes: Array<{ name: string; payload: any }> = []
    const durable = (type: string, seq: number, data: any) => ({ type: 'event', event: { type, seq, time: seq, data } })
    try {
      await settle(); await catalog.open(record.id); await runtime.start(); runtime.mountDocument(page.window, record.id, '')
      const api = page.window.ElecKoi as ElecKoiAuthorApi
      for (const name of ['agent.state.changed', 'agent.output.delta', 'agent.run.finished', 'agent.run.cancelled'] as const) {
        api.events.on(name, payload => changes.push({ name, payload }))
      }
      events.replace([durable('turn/start', 1, { turn: 1 }), durable('turn/end', 2, { turn: 1, reason: { kind: 'completed' } })], false)
      events.prepend([durable('turn/start', 0, { turn: 0 })], false)
      await settle(); expect(changes).toEqual([])
      running = true
      events.append(durable('turn/start', 3, { turn: 2 }))
      nodes = new Map([['synthetic-live', { key: 'synthetic-live', kind: 'assistant-step',
        location: { kind: 'step', turn: { turn: 2 }, step: { step: 1 } },
        data: { turn: 2, step: 1, status: 'running', blocks: [{ kind: 'text', text: '<FINAL>Synthetic body' }] } }]])
      turns = new Map([[2, { turn: 2, status: 'open' }]])
      for (const listener of targetListeners) listener()
      const generation = await api.chat.getGenerationState()
      expect(generation).toMatchObject({ active: true, runId: record.runtimeSessionId, turn: 2, generationId: expect.any(String), sequence: 1 })
      running = false; for (const listener of sessionListeners) listener(); await settle()
      expect(changes.some(change => change.name === 'agent.run.finished')).toBe(false)
      events.settleAssistant('synthetic-attempt', durable('assistant/message', 5, { turn: 2, step: 1,
        message: { role: 'assistant', id: 'synthetic-assistant', content: [{ type: 'text', text: '<FINAL>Synthetic body</FINAL>' }] }, stream: [] }))
      events.append(durable('turn/end', 6, { turn: 2, reason: { kind: 'completed' } }))
      await settle(); expect(changes.some(change => change.name === 'agent.run.finished')).toBe(false)
      const finalNode = { seq: 5, messageId: 'synthetic-assistant', time: 5 }
      nodes = new Map([['synthetic-tail', { kind: 'turn-tail', data: { turn: 2, seq: 6, time: 6,
        closing: { finalNode, blocks: [{ kind: 'text', text: '<FINAL>Synthetic body</FINAL>' }] } } }]])
      turns = new Map([[2, { turn: 2, status: 'closed' }]])
      for (const listener of targetListeners) listener()
      await vi.waitFor(() => expect(changes.filter(change => change.name === 'agent.run.finished')).toHaveLength(1))
      expect(changes.find(change => change.name === 'agent.output.delta')!.payload).toMatchObject({ operation: 'append', accumulated: 'Synthetic body' })
      expect(changes.find(change => change.name === 'agent.run.finished')!.payload).toMatchObject({ turn: 2, reason: 'completed', message: { id: 'synthetic-assistant' } })
      events.append(durable('turn/start', 7, { turn: 3 })); events.append(durable('turn/end', 8, { turn: 3, reason: { kind: 'aborted', reason: 'user' } }))
      await vi.waitFor(() => expect(changes.filter(change => change.name === 'agent.run.cancelled')).toHaveLength(1))
      events.append(durable('turn/start', 9, { turn: 4 }))
      events.settleAssistant('synthetic-empty-attempt', durable('assistant/message', 10, { turn: 4, step: 1,
        message: { role: 'assistant', id: 'synthetic-empty', content: [] }, stream: [] }))
      events.append(durable('turn/end', 11, { turn: 4, reason: { kind: 'completed' } }))
      nodes = new Map([['synthetic-empty-tail', { kind: 'turn-tail', data: { turn: 4, seq: 11, time: 11,
        closing: { finalNode: { seq: 10, messageId: 'synthetic-empty', time: 10 }, blocks: [] } } }]])
      turns = new Map([[4, { turn: 4, status: 'closed' }]])
      expect(catalog.getGenerationReply(record.runtimeSessionId, 4, 10)).toEqual({ status: 'pending' })
      for (const listener of targetListeners) listener()
      await vi.waitFor(() => expect(changes.filter(change => change.name === 'agent.run.finished')).toHaveLength(2))
      expect(changes.find(change => change.name === 'agent.run.finished' && change.payload.turn === 4)!.payload.message).toBeNull()
      catalog.activate(''); await settle(); const count = changes.length
      events.append(durable('turn/start', 12, { turn: 5 })); await settle()
      expect(changes).toHaveLength(count); expect(report).not.toHaveBeenCalled()
    } finally {
      await runtime.dispose(); page.window.close(); r.dispose()
    }
    expect(sessionListeners.size + targetListeners.size).toBe(0); expect(released).toHaveBeenCalledOnce()
  })

  it('completes native SDK navigation through the actual conversation model after closing its source page', async () => {
    const record = (id: string) => ({ id, title: 'Synthetic catalog title', preview: '', createdAt: '', updatedAt: '',
      metadata: { characterId: 'synthetic-role', characterName: 'Synthetic role', characterAvatar: '' } })
    let items = [record('synthetic-source'), record('synthetic-destination')]
    const r = mountCatalog(async (name, input: any) => name === 'query.conversations.list'
      ? { ok: true, data: items }
      : { ok: true, data: { conversation: { ...record(input.conversationId), title: 'Synthetic loaded title' },
        metadata: record(input.conversationId).metadata, runtimeSessionId: '', messages: [], hasMore: false, beforeSequence: null } }, { allowOtherQueries: true })
    const catalog = r.catalog as any, page = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/' })
    const author = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/' })
    const runtime = new NativeAuthorClient({ window: page.window, conversations: catalog, models: {} as any,
      libraries: { subscribeChanges: () => () => {} } as any, report: vi.fn(), remote: {
        eleckoiAuthorScripts: {
          read: async (id: string) => ({ ok: true, value: { conversationId: id, characterId: 'synthetic-role',
            presetId: '', version: id, scripts: [] } }),
          connect: (_id: string, version: string, signal: AbortSignal) => (async function* () {
            yield { kind: 'ready', version }
            await new Promise<void>(resolve => signal.addEventListener('abort', () => resolve(), { once: true }))
          })(),
        },
        eleckoiConversations: { changes: (signal: AbortSignal) => conversationChangeFeed().open(signal) },
      } as any })
    try {
      await settle(); await catalog.open('synthetic-source'); await runtime.start()
      runtime.mountDocument(author.window, 'synthetic-source', '')
      const api = author.window.ElecKoi as ElecKoiAuthorApi
      expect(await api.chat.open('synthetic-destination')).toMatchObject({ chat: {
        id: 'synthetic-destination', title: 'Synthetic loaded title', characterId: 'synthetic-role',
      } })
      await expect(api.chat.current()).rejects.toMatchObject({ code: 'FRAME_CLOSED' })
      const next = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/' })
      try {
        runtime.mountDocument(next.window, 'synthetic-destination', '')
        catalog.sessions = { refresh: vi.fn(async () => {}) }
        catalog.remote.eleckoiConversations.delete = vi.fn(async (id: string) => {
          items = items.filter(item => item.id !== id)
          return { ok: true, value: undefined }
        })
        expect(await (next.window.ElecKoi as ElecKoiAuthorApi).chat.delete('synthetic-destination'))
          .toEqual({ deletedId: 'synthetic-destination', chat: null })
        expect(catalog.getDetailsSnapshot()).toMatchObject({ id: '', status: 'idle', details: null })
        expect((await catalog.refresh()).map((item: any) => item.id)).toEqual(['synthetic-source'])
      } finally { next.window.close() }
    } finally { await runtime.dispose(); author.window.close(); page.window.close(); r.dispose() }
  })

  it('reads, writes and submits the scoped official input instead of a separate page draft', async () => {
    let state = { draft: 'Synthetic typed draft', phase: 'plain', attachmentIds: [] as string[] }
    const facade = { state: { getSnapshot: () => state }, setDraft: vi.fn((text: string) => { state = { ...state, draft: text } }), submit: vi.fn() }
    const conversation = { input: { for: vi.fn(() => facade) } }
    const ctx = Object.defineProperty({}, 'conversation', { get() { throw new Error('Session scope does not inject the conversation service') } })
    const r = mountCatalog(async () => ({ ok: true, data: [] }), { conversation })
    const catalog = r.catalog as any
    try {
      await settle()
      catalog.snapshot = { ...catalog.snapshot, items: [{ id: 'synthetic-chat', runtimeSessionId: 'synthetic-session' }] }
      catalog.detailsSnapshot = { id: 'synthetic-chat', status: 'ready', runtimeSessionId: 'synthetic-session',
        details: { conversation: { id: 'synthetic-chat' }, runtimeSessionId: 'synthetic-session' } }
      catalog.sessionReference = { sessionId: 'synthetic-session', binding: { ctx }, release() {} }
      expect(catalog.readInputDraft('synthetic-chat')).toBe('Synthetic typed draft')
      expect(catalog.writeInputDraft('synthetic-chat', 'Synthetic page draft')).toBe('Synthetic page draft')
      expect(conversation.input.for).toHaveBeenLastCalledWith(ctx)
      expect(facade.setDraft).toHaveBeenCalledWith('Synthetic page draft')
      expect(catalog.submitInput('synthetic-chat')).toBe(true)
      expect(facade.submit).toHaveBeenCalledExactlyOnceWith('queue', 'click')
      state = { ...state, draft: '' }; expect(catalog.submitInput('synthetic-chat')).toBe(false)
      state = { ...state, attachmentIds: ['synthetic-attachment'] }; expect(catalog.submitInput('synthetic-chat')).toBe(true)
      state = { ...state, phase: 'submitting' }; expect(catalog.submitInput('synthetic-chat')).toBe(false)
      state = { ...state, phase: 'adjudicating' }; expect(catalog.submitInput('synthetic-chat')).toBe(false)
      expect(facade.submit).toHaveBeenCalledTimes(2)
      expect(() => catalog.readInputDraft('synthetic-other-chat')).toThrow('官方输入框尚未就绪')
      catalog.sessionReference.sessionId = 'synthetic-stale-session'
      expect(() => catalog.writeInputDraft('synthetic-chat', 'Do not write')).toThrow('官方输入框尚未就绪')
      expect(facade.setDraft).toHaveBeenCalledTimes(1)
    } finally { r.dispose() }
  })

  it('keeps the selected chat and its Session while deletion is pending or fails, and releases them only after success', async () => {
    const r = mountCatalog(async () => ({ ok: true, data: [] }))
    const catalog = r.catalog as any, release = vi.fn()
    try {
      await settle()
      catalog.detailsSnapshot = { id: 'synthetic-chat', status: 'ready', details: { conversation: { id: 'synthetic-chat' } } }
      catalog.sessionReference = { binding: { session: {} }, release }
      catalog.sessions = { refresh: vi.fn(async () => {}) }
      let finish!: (value: unknown) => void
      const remove = vi.fn(() => new Promise(resolve => { finish = resolve }))
      catalog.remote.eleckoiConversations.delete = remove
      const pending = catalog.delete('synthetic-chat'), outcome = pending.then(() => null, (error: Error) => error)
      expect(catalog.getDetailsSnapshot().id).toBe('synthetic-chat')
      expect(release).not.toHaveBeenCalled()
      finish({ ok: false, error: { isDSHRemoteError: true, code: 'gateway/internal', message: 'Synthetic deletion failed' } })
      expect(await outcome).toMatchObject({ message: 'Synthetic deletion failed' })
      expect(catalog.getDetailsSnapshot()).toMatchObject({ id: 'synthetic-chat', status: 'ready' })
      expect(release).not.toHaveBeenCalled()
      remove.mockResolvedValueOnce({ ok: true, value: undefined })
      await catalog.delete('synthetic-chat')
      expect(catalog.getDetailsSnapshot()).toMatchObject({ id: '', status: 'idle', details: null })
      expect(release).toHaveBeenCalledTimes(1)
    } finally { r.dispose() }
  })

  it('cancels the selected official Session without depending on the stream request id', async () => {
    const r = mountCatalog(async () => ({ ok: true, data: [] }))
    const catalog = r.catalog as any, cancel = vi.fn(async () => ({ ok: true }))
    try {
      await settle()
      catalog.detailsSnapshot = { id: 'synthetic-chat', status: 'ready', details: null }
      catalog.streamState = { id: 'synthetic-chat', status: 'running', requestId: '', runId: 'synthetic-session', content: '', process: [] }
      catalog.sessionReference = { binding: { session: { cancel } }, release() {} }
      expect(await catalog.cancelGeneration('synthetic-other')).toBe(false)
      expect(cancel).not.toHaveBeenCalled()
      expect(await catalog.cancelGeneration('synthetic-chat')).toBe(true)
      expect(cancel).toHaveBeenCalledTimes(1)
      expect(catalog.getStreamSnapshot().status).toBe('idle')
      expect(await catalog.cancelGeneration('synthetic-chat')).toBe(false)
    } finally { r.dispose() }
  })

  it('cancels an admitted native request even before the live projection is running', async () => {
    const r = mountCatalog(async () => ({ ok: true, data: [] }))
    const catalog = r.catalog as any, cancel = vi.fn(async () => ({ ok: true }))
    try {
      await settle()
      catalog.detailsSnapshot = { id: 'synthetic-chat', status: 'ready', details: null }
      const request = { requestId: 'synthetic-request', cancelled: false, session: { cancel } }
      catalog.activeRequests.set('synthetic-chat', request)
      expect(await catalog.cancelGeneration('synthetic-chat')).toBe(true)
      expect(request.cancelled).toBe(true); expect(cancel).toHaveBeenCalledTimes(1)
      catalog.activeRequests.clear()
    } finally { r.dispose() }
  })

  it('projects opening regexes on load, refresh, selection, edits and rule changes without changing the original', async () => {
    let registration: any
    let catalog: any
    let cleanup = () => {}
    let rulesChanged: (...args: any[]) => void = () => {}
    let opening = { id: 'opening', role: 'assistant', content: '[ENTRY]\nFirst opening',
      variableStateJson: '{}', status: 'complete', createdAt: '2026-10-02T00:00:00.000Z',
      selectedOpeningId: 'entry-1', openingOptions: [
        { id: 'entry-1', content: '[ENTRY]\nFirst opening' },
        { id: 'entry-2', content: '[ENTRY]\nSecond opening' }
      ] }
    const details = () => ({ conversation: { id: 'chat-1' }, metadata: { characterId: 'character-1' },
      runtimeSessionId: '', messages: [{ ...opening }], hasMore: false, beforeSequence: null })
    const collection: RegexRuleCollection = {
      characterId: 'character-1', agentPresetId: '', agentPresetName: '', agentPresetRegexRevision: '0'.repeat(64),
      globalRules: [], agentPresetRules: [], characterRules: [{
        id: 'entry-panel', name: 'Entry panel', pattern: '/\\[ENTRY\\]/g',
        replacement: '<section class="entry-panel">{{char}}</section>',
        targets: ['AiOutput'], enabled: true, displayOnly: true, promptOnly: false, runOnEdit: false, order: 0
      }],
      versions: [{ id: 'version-1', name: 'Current', globalEnabledIds: [], agentPresetEnabledIds: [],
        characterEnabledIds: ['entry-panel'] }], activeVersionId: 'version-1', revision: 1
    }
    const projector = new MessageDisplayProjector(mvuMessageDisplayCompatibility)
    const projectDisplay = vi.fn(async (conversationId: string, messages: any[]) => messages.map(message => {
      const projected = projector.project({ ...message, conversationId }, collection,
        { characterName: 'Test assistant', userName: 'Test user' })
      return { id: message.id, sourceContent: message.content,
        displayContent: projected.displayContent ?? projected.content, variableStateJson: projected.variableStateJson }
    }))
    const remote = conversationRemote(async name => name === 'query.conversations.list'
      ? { ok: true, data: [{ id: 'chat-1' }] }
      : { ok: true, data: details() }, conversationChangeFeed(), projectDisplay)
    Object.assign(remote.eleckoiConversations, {
      selectOpening: async (_id: string, openingId: string) => {
        opening = { ...opening, content: opening.openingOptions.find(option => option.id === openingId)!.content,
          selectedOpeningId: openingId }
        return { ok: true, value: details() }
      },
      updateOpening: async (_id: string, content: string) => {
        opening = { ...opening, content }
        return { ok: true, value: details() }
      }
    })
    runInNewContext(source, { AbortController,
      window: { __ModuleLoader__: { load: (item: any) => { registration = item } } } })
    dshClientPlugin(registration).apply({ remote,
      eleckoiRegexRules: { subscribe: (listener: typeof rulesChanged) => {
        rulesChanged = listener
        return () => { rulesChanged = () => {} }
      } },
      provide: (_name: string, value: unknown) => { catalog = value },
      effect: (run: () => () => void) => { cleanup = run() }, on: () => () => {} })
    try {
      await settle()
      await catalog.open('chat-1')
      await settle()
      const displayed = () => catalog.getDetailsSnapshot().details.messages[0]
      expect(displayed().content).toBe('[ENTRY]\nFirst opening')
      expect(displayed().displayContent).toContain('<section class="entry-panel">Test assistant</section>')
      expect(detectRichMessagePresentation(displayed().displayContent, false)?.parts.some(part => part.kind === 'rich'))
        .toBe(true)
      const initialCalls = projectDisplay.mock.calls.length
      await catalog.refreshDetails()
      await settle()
      expect(displayed().displayContent).toContain('<section class="entry-panel">Test assistant</section>')
      expect(projectDisplay).toHaveBeenCalledTimes(initialCalls)
      await catalog.selectOpening('chat-1', 'entry-2')
      await settle()
      expect(displayed()).toMatchObject({ content: '[ENTRY]\nSecond opening', selectedOpeningId: 'entry-2' })
      expect(displayed().displayContent).toContain('Second opening')
      expect(displayed().displayContent).not.toContain('[ENTRY]')
      collection.characterRules[0]!.replacement = '<section class="entry-panel">Updated {{char}}</section>'
      collection.revision += 1
      rulesChanged('configuration', 'character-1', { status: 'ready' })
      await settle()
      expect(displayed().displayContent).toContain('Updated Test assistant')
      await catalog.updateOpening('chat-1', '[ENTRY]\nEdited opening')
      await settle()
      expect(displayed().content).toBe('[ENTRY]\nEdited opening')
      expect(displayed().displayContent).toContain('Updated Test assistant')
      expect(displayed().displayContent).toContain('Edited opening')
    } finally { cleanup() }
  })

  it('keeps prior message projections visible while a changed tail is being projected', async () => {
    let registration: any
    let catalog: any
    let cleanup = () => {}
    let messages = [{ id: 'assistant-1', role: 'assistant', content: '[PANEL] previous',
      variableStateJson: '{}', status: 'complete', createdAt: '2026-10-04T00:00:00.000Z' }]
    let deferProjection = false
    let finishProjection: ((results: any[]) => void) | undefined
    const project = (input: any[]) => input.map(message => ({
      id: message.id,
      sourceContent: message.content,
      displayContent: `<section>${message.content.replace('[PANEL] ', '')}</section>`,
      variableStateJson: message.variableStateJson,
    }))
    const projectDisplay = vi.fn(async (_conversationId: string, input: any[]) => {
      if (!deferProjection) return project(input)
      return new Promise<any[]>(resolve => { finishProjection = resolve })
    })
    const remote = conversationRemote(async name => name === 'query.conversations.list'
      ? { ok: true, data: [{ id: 'chat-1' }] }
      : { ok: true, data: { conversation: { id: 'chat-1' }, metadata: { characterId: 'character-1' },
        runtimeSessionId: '', messages, hasMore: false, beforeSequence: null } },
    conversationChangeFeed(), projectDisplay)
    runInNewContext(source, { AbortController,
      window: { __ModuleLoader__: { load: (item: any) => { registration = item } } } })
    dshClientPlugin(registration).apply({ remote,
      provide: (_name: string, value: unknown) => { catalog = value },
      effect: (run: () => () => void) => { cleanup = run() }, on: () => () => {} })
    try {
      await settle()
      await catalog.open('chat-1')
      expect(catalog.getDetailsSnapshot().details.messages[0].displayContent)
        .toBe('<section>previous</section>')

      messages = [...messages, { id: 'user-2', role: 'user', content: '你好',
        variableStateJson: '{}', status: 'complete', createdAt: '2026-10-04T00:01:00.000Z' }]
      deferProjection = true
      const refresh = catalog.refreshDetails()
      await settle()
      expect(catalog.getDetailsSnapshot().details.messages[0].displayContent)
        .toBe('<section>previous</section>')
      finishProjection?.(project(messages))
      await refresh
      expect(catalog.getDetailsSnapshot().details.messages.map((message: any) => message.displayContent))
        .toEqual(['<section>previous</section>', '<section>你好</section>'])
    } finally { cleanup() }
  })

  it.each(['delayed', 'fast', 'cancelled', 'failed', 'live-error', 'pre-turn-error'])('waits for the matching official request completion (%s)', async (mode) => {
    let registration: any
    let catalog: any
    let cleanup = () => {}
    const listeners = new Set<() => void>()
    let events: any[] = []
    let running = false
    let lastAgentError: string | null = null
    const failure = 'Synthetic API error (402): {"message":"request refused"}'
    const details = { conversation: { id: 'chat-1' }, runtimeSessionId: 'runtime-1', messages: [] }
    const finish = () => {
      running = false
      if (mode === 'live-error' || mode === 'pre-turn-error') lastAgentError = failure
      events = [
        { type: 'event', event: { type: 'turn/start', seq: 1, data: { turn: 1 } } },
        { type: 'event', event: { type: 'user/message', seq: 2, data: { source: { kind: 'user', rpcId: 'request-1' } } } },
        { type: 'event', event: { type: 'turn/end', seq: 3, data: { turn: 1,
          reason: mode === 'failed' ? { kind: 'error', error: { message: '模型服务不可用' } }
            : mode === 'cancelled' ? { kind: 'aborted', reason: 'user' } : { kind: 'completed' } } } },
      ]
      // The control error can precede journal completion or occur before user admission.
      if (mode === 'live-error') { running = true; events = events.slice(0, 2) }
      if (mode === 'pre-turn-error') events = []
      for (const listener of listeners) listener()
    }
    const session = {
      getSnapshot: () => ({ running, promptError: null, lastAgentError }),
      subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
      prompt: vi.fn(async () => {
        if (mode === 'fast') finish()
        else { running = true; for (const listener of listeners) listener() }
        return { ok: true, value: { accepted: true } }
      }),
    }
    const binding = { session, eventSource: {
      getSnapshot: () => ({ entries: events, hasMore: false }), subscribe: session.subscribe,
    } }
    const changes = conversationChangeFeed()
    runInNewContext(source, { setTimeout, clearTimeout, Date, AbortController,
      window: { __ModuleLoader__: { load: (item: any) => { registration = item } } },
    })
    dshClientPlugin(registration).apply({
      remote: { session: {}, eleckoiConversations: {
        changes: (signal?: AbortSignal) => changes.open(signal),
        list: async () => ({ ok: true, value: [{ id: 'chat-1', runtimeSessionId: 'runtime-1' }] }),
        details: async () => ({ ok: true, value: details }),
        preparePrompt: async () => ({ ok: true, value: { runtimeSessionId: 'runtime-1' } }),
      } },
      sessions: { list: { getSnapshot: () => ({ byId: { 'runtime-1': {} } }) },
        refresh: async () => {}, reloadHistory: async () => {}, retain: () => ({ sessionId: 'runtime-1', binding, ready: Promise.resolve(binding), release() {} }) },
      uiConversation: { binding: () => ({ target: () => ({ getSnapshot: () => ({ legacy: { nodes: [], partial: null } }), subscribe: () => () => {} }) }) },
      provide: (_key: string, service: any) => { catalog = service },
      effect: (run: () => () => void) => { cleanup = run() }, on: () => () => {},
    })
    try {
      await settle()
      await catalog.open('chat-1')
      let settled = false
      const sending = catalog.send({ conversationId: 'chat-1', requestId: 'request-1', text: '测试输入' })
      const observed = sending.then((value: unknown) => { settled = true; return value }, (error: unknown) => { settled = true; throw error })
      await settle()
      expect(session.prompt).toHaveBeenCalledWith([{ type: 'text', text: '测试输入' }], 'queue', undefined, 'request-1')
      if (mode !== 'fast') {
        expect(settled).toBe(false)
        const expectation = mode === 'failed' ? expect(observed).rejects.toThrow('模型服务不可用')
          : mode.endsWith('error') ? expect(observed).rejects.toThrow(failure)
          : expect(observed).resolves.toMatchObject({ cancelled: mode === 'cancelled' })
        finish()
        await expectation
        if (mode === 'failed' || mode.endsWith('error')) {
          expect(catalog.getStreamSnapshot()).toMatchObject({ status: 'error' })
          expect(catalog.activeRequests.size).toBe(0)
          expect(listeners.size).toBe(2)
        }
      } else {
        await expect(observed).resolves.toMatchObject({ cancelled: false })
      }
    } finally { cleanup() }
  })

  it.each(['delete-pair/send', 'delete-ai/send', 'delete-ai/regenerate'])('keeps the rewritten Session authoritative through the next complete request (%s)', async (scenario) => {
    let registration: any, catalog: any
    let cleanup = () => {}
    const changes = conversationChangeFeed()
    // Product details deliberately have no transcript rows. DSH is the only
    // source of both historical and newly generated message bodies.
    const details = { conversation: { id: 'chat-1' }, runtimeSessionId: 'runtime-1', messages: [], hasMore: false,
      metadata: { characterId: '', characterName: '', characterAvatar: '', characterPersona: {
        assistant_name: '', assistant_avatar: '', assistant_square: '', assistant_cover: '', image_prompt: '',
      } } }
    const user = (seq: number, requestId: string) => ({ kind: 'user', anchorSeq: seq, data: {
      seq, time: seq, messageId: `input-${requestId}`, source: { kind: 'user', rpcId: requestId },
      content: [{ type: 'text', text: '重复的合成输入' }],
    } })
    const reply = (turn: number, seq: number, text: string) => ({ kind: 'turn-tail', anchorSeq: seq + 1, data: {
      turn, seq: seq + 1, closing: { blocks: [{ kind: 'text', text: `<FINAL>${text}</FINAL>` }],
        finalNode: { messageId: `reply-${turn}-${seq}`, seq, time: seq } },
    } })
    const prefix = new Map<string, any>([['user-2', user(2, 'prefix')], ['tail-1', reply(1, 5, '保留的回复')]])
    let nodes = new Map([...prefix, ['user-9', user(9, 'deleted')], ['tail-2', reply(2, 12, '要删除的回复')]])
    let turns = new Map<number, any>([[1, { turn: 1, status: 'closed' }], [2, { turn: 2, status: 'closed' }]])
    let chat: any = { order: [...nodes.keys()], nodes, timeline: { turns } }
    let events: any[] = []
    let running = false, removed = false
    let pendingSubmissions: any[] = []
    const targetListeners = new Set<() => void>()
    const sessionListeners = new Set<() => void>()
    const subscribe = (listeners: Set<() => void>) => (listener: () => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    }
    const publish = () => {
      chat = { order: [...nodes.keys()], nodes, timeline: { turns } }
      for (const listener of targetListeners) listener()
      for (const listener of sessionListeners) listener()
    }
    const retire = () => {
      removed = true
      for (const listener of sessionListeners) listener()
    }
    let activeRequestId = ''
    const begin = (requestId: string) => {
      activeRequestId = requestId
      running = true
      pendingSubmissions = [{ requestId, placement: 'transcript', time: 9, text: '重复的合成输入' }]
      publish()
    }
    const session = {
      getSnapshot: () => ({ running, removed, pendingSubmissions }), subscribe: subscribe(sessionListeners),
      projections: { faceOf: (key: string) => key === 'eleckoiInputContinuations' ? {
        getSnapshot: () => ({ links: [{ turn: 2, inputMessageId: 'input-deleted', inputEventSeq: 9 }] }),
        subscribe: subscribe(sessionListeners),
      } : undefined },
      prompt: vi.fn(async (_content: unknown, _mode: unknown, _signal: unknown, requestId: string) => {
        begin(requestId)
        return { ok: true, value: { accepted: true } }
      }),
    }
    const binding = { session, eventSource: {
      getSnapshot: () => ({ entries: events, hasMore: false }), subscribe: subscribe(sessionListeners),
    } }
    const target = { getSnapshot: () => chat, subscribe: subscribe(targetListeners) }
    const reloadHistory = vi.fn(async () => { removed = false; running = false; publish() })
    runInNewContext(source, { setTimeout, clearTimeout, Date, AbortController,
      window: { __ModuleLoader__: { load: (item: any) => { registration = item } } },
    })
    dshClientPlugin(registration).apply({
      remote: { session: {}, eleckoiConversations: {
        changes: (signal?: AbortSignal) => changes.open(signal),
        list: async () => ({ ok: true, value: [{ id: 'chat-1', runtimeSessionId: 'runtime-1' }] }),
        details: async () => ({ ok: true, value: details }),
        preparePrompt: async () => ({ ok: true, value: { runtimeSessionId: 'runtime-1' } }),
        deleteMessagesFrom: async (_id: string, eventSeq: number, role: string) => {
          expect(eventSeq).toBe(role === 'user' ? 9 : 12)
          nodes = new Map(prefix)
          if (role === 'assistant') nodes.set('user-9', user(9, 'deleted'))
          turns = new Map([[1, { turn: 1, status: 'closed' }]])
          retire()
          return { ok: true, value: { details, deletedMessageCount: role === 'user' ? 2 : 1, remainingMessageCount: role === 'user' ? 2 : 3 } }
        },
        regenerateMessage: async (_id: string, eventSeq: number) => {
          expect(eventSeq).toBe(9)
          nodes = new Map(prefix)
          nodes.set('user-9', user(9, 'deleted'))
          retire()
          return { ok: true, value: { prepared: true } }
        },
        startRegeneration: async (_id: string, requestId: string) => {
          begin(requestId)
          pendingSubmissions = []
          publish()
          return { ok: true, value: { accepted: true, turn: 2 } }
        },
      } },
      sessions: { list: { getSnapshot: () => ({ byId: { 'runtime-1': {} } }) },
        refresh: async () => {}, reloadHistory,
        retain: () => ({ sessionId: 'runtime-1', binding, ready: Promise.resolve(binding), release() {} }) },
      uiConversation: { binding: () => ({ target: () => target }) },
      provide: (_key: string, value: any) => { catalog = value },
      effect: (run: () => () => void) => { cleanup = run() }, on: () => () => {},
    })
    const messages = () => catalog.getDetailsSnapshot().details.messages
    const authorPage = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/' })
    let authorRequest = 0
    vi.spyOn(authorPage.window.crypto, 'randomUUID').mockImplementation(() => `next-${authorRequest++}` as any)
    const authorRuntime = new NativeAuthorClient({ window: authorPage.window, conversations: catalog,
      remote: {} as any, libraries: {} as any,
      models: { refresh: async () => { throw new Error('Unexpected model read during message mutation') } } as any,
      report: error => { throw error } })
    try {
      await settle()
      await catalog.open('chat-1')
      authorRuntime.mountDocument(authorPage.window, 'chat-1', '')
      const authorApi = authorPage.window.ElecKoi as ElecKoiAuthorApi
      expect(messages()).toHaveLength(4)
      const retiredSnapshot = chat
      const retiredCallbacks = [...targetListeners]
      const pair = scenario.startsWith('delete-pair')
      const deletion = await authorApi.messages.deleteFrom(pair ? 'input-deleted' : 'reply-2-12')
      expect(deletion).toEqual({ ok: true, deletedMessageCount: pair ? 2 : 1, remainingMessageCount: pair ? 2 : 3 })
      expect(messages().map((message: any) => message.dshMessageId))
        .toEqual(pair ? ['input-prefix', 'reply-1-5'] : ['input-prefix', 'reply-1-5', 'input-deleted'])
      expect(catalog.getStreamSnapshot()).toMatchObject({ status: 'idle', content: '', nodeKey: '' })
      const reloadedSnapshot = chat
      const settledDetails = catalog.getDetailsSnapshot()
      chat = retiredSnapshot
      for (const callback of retiredCallbacks) callback()
      expect(catalog.getDetailsSnapshot()).toBe(settledDetails)
      chat = reloadedSnapshot
      for (let round = 0; round < 2; round++) {
        const requestId = `next-${round}`
        const regenerating = scenario.endsWith('regenerate')
        const expectedInputCount = regenerating ? 2 : messages().filter((message: any) => message.role === 'user').length + 1
        const request = regenerating
          ? authorApi.messages.editAndRegenerate('input-deleted', '重复的合成输入')
          : catalog.send({ conversationId: 'chat-1', requestId, text: '重复的合成输入' })
        await settle()
        expect(activeRequestId).toBe(requestId)
        expect(messages().some((message: any) => message.requestId === requestId)).toBe(!regenerating)
        expect(messages().filter((message: any) => message.role === 'user')).toHaveLength(expectedInputCount)
        // Rewound logs reuse event positions and turn numbers. Neither is a
        // permanent deletion tombstone or permission to hide later replies.
        const inputSeq = regenerating ? 9 : 15 + round * 10
        const turn = regenerating ? 2 : 3 + round
        const assistantSeq = inputSeq + 3
        if (!regenerating) nodes = new Map(nodes).set(`input-${requestId}`, user(inputSeq, requestId))
        pendingSubmissions = []
        turns = new Map(turns).set(turn, { turn, status: 'open' })
        events = [
          { type: 'event', event: { type: 'turn/start', seq: inputSeq - 1, data: { turn } } },
          { type: 'event', event: { type: 'user/message', seq: inputSeq, data: { source: { kind: 'user', rpcId: requestId } } } },
        ]
        publish()
        const inputCount = messages().filter((message: any) => message.role === 'user').length
        const assistantKey = `step-${turn}`
        nodes = new Map(nodes).set(assistantKey, { kind: 'assistant-step', data: {
          turn, step: inputSeq + 1, seq: assistantSeq, status: 'running',
          blocks: [{ kind: 'text', text: '<FINAL>新的合成回复' }],
        } })
        publish()
        expect(messages().filter((message: any) => message.role === 'user')).toHaveLength(inputCount)
        expect(messages().at(-1)).toMatchObject({ role: 'assistant', status: 'streaming', content: '<FINAL>新的合成回复', displayContent: '新的合成回复' })
        running = false
        turns = new Map(turns).set(turn, { turn, status: 'closed' })
        nodes = new Map(nodes).set(`tail-${turn}`, reply(turn, assistantSeq, '新的合成回复'))
        events = [...events, { type: 'event', event: { type: 'turn/end', seq: assistantSeq + 1,
          data: { turn, reason: { kind: 'completed' } } } }]
        publish()
        const receipt = await request
        if (regenerating) expect(receipt).toMatchObject({ accepted: true, runId: 'runtime-1', messageId: `reply-${turn}-${assistantSeq}` })
        expect(messages().filter((message: any) => message.role === 'user')).toHaveLength(inputCount)
        expect(messages().at(-1)).toMatchObject({ role: 'assistant', status: 'complete', dshTurn: turn })
        expect(messages().slice(0, 2).map((message: any) => message.dshMessageId)).toEqual(['input-prefix', 'reply-1-5'])
        await catalog.refreshDetails()
        expect(messages().at(-1).dshMessageId).toBe(`reply-${turn}-${assistantSeq}`)
      }
      expect(reloadHistory).toHaveBeenCalledTimes(scenario.endsWith('regenerate') ? 3 : 1)
      expect(catalog.activeRequests.size).toBe(0)
      expect(catalog.sessionMutations.size).toBe(0)
    } finally { await authorRuntime.dispose(); authorPage.window.close(); cleanup() }
  })

  it('keeps the latest baseline when requests finish out of order and releases its listener', async () => {
    const pending: Array<(result: Result) => void> = []
    const mounted = mountCatalog(() => new Promise(resolve => pending.push(resolve)))
    await settle()
    expect(pending).toHaveLength(1)
    let changes = 0
    mounted.catalog.subscribe(() => { changes += 1 })
    const latest = mounted.catalog.refresh()
    expect(pending).toHaveLength(2)
    pending[1]!({ ok: true, data: [{ id: 'recent' }] })
    expect((await latest).map(item => item.id)).toEqual(['recent'])
    pending[0]!({ ok: true, data: [{ id: 'older' }] })
    await settle()
    expect(mounted.catalog.getSnapshot().items.map(item => item.id)).toEqual(['recent'])
    expect(changes).toBe(1)

    mounted.emit({ kind: 'catalog', conversationId: 'after-change', reason: 'created' })
    await settle()
    expect(pending).toHaveLength(3)
    pending[2]!({ ok: true, data: [{ id: 'after-change' }] })
    await settle()
    expect(mounted.catalog.getSnapshot().items.map(item => item.id)).toEqual(['after-change'])

    mounted.dispose()
    expect(mounted.isStopped()).toBe(true)
    mounted.emit({ kind: 'catalog', conversationId: 'ignored-after-dispose', reason: 'created' })
    expect(pending).toHaveLength(3)
  })

  it('reloads and rebinds rejected regeneration before another click', async () => {
    let registration: any, catalog: any
    let cleanup = () => {}
    let seq = 2
    let retained = 0
    const calls: number[] = []
    const details = { conversation: { id: 'chat-1' }, runtimeSessionId: 'runtime-1', messages: [] }
    const session = { getSnapshot: () => ({ running: false }), subscribe: () => () => {} }
    const binding = { session, eventSource: { getSnapshot: () => ({ entries: [], hasMore: false }), subscribe: () => () => {} } }
    const changes = conversationChangeFeed()
    const reloadHistory = vi.fn(async () => { seq = 9 })
    runInNewContext(source, { setTimeout, clearTimeout, Date, AbortController,
      window: { __ModuleLoader__: { load: (item: any) => { registration = item } } },
    })
    dshClientPlugin(registration).apply({
      remote: { session: {}, eleckoiConversations: {
        changes: (signal?: AbortSignal) => changes.open(signal),
        list: async () => ({ ok: true, value: [{ id: 'chat-1', runtimeSessionId: 'runtime-1' }] }),
        details: async () => ({ ok: true, value: details }),
        regenerateMessage: async (_id: string, eventSeq: number) => {
          calls.push(eventSeq)
          return { ok: false, error: { isDSHRemoteError: true, code: 'gateway/internal', message: '合成准备失败' } }
        },
      } },
      sessions: { list: { getSnapshot: () => ({ byId: { 'runtime-1': {} } }) },
        refresh: async () => {}, reloadHistory, retain: () => {
          retained++
          return { sessionId: 'runtime-1', binding, ready: Promise.resolve(binding), release() {} }
        } },
      uiConversation: { binding: () => ({ target: () => ({ subscribe: () => () => {}, getSnapshot: () => ({
        order: ['input'], nodes: new Map([['input', { kind: 'user', anchorSeq: seq, data: {
          seq, time: 10, content: [{ type: 'text', text: '合成输入' }], source: { kind: 'user' }
        } }]]), legacy: { nodes: [], partial: null },
      }) }) }) },
      provide: (_key: string, value: any) => { catalog = value },
      effect: (run: () => () => void) => { cleanup = run() }, on: () => () => {},
    })
    try {
      await settle()
      await catalog.open('chat-1')
      for (let attempt = 0; attempt < 2; attempt++) {
        const input = catalog.getDetailsSnapshot().details.messages[0]
        await expect(catalog.regenerate({ conversationId: 'chat-1', requestId: `retry-${attempt}`,
          eventSeq: input.sessionEventSeq })).rejects.toThrow('合成准备失败')
        expect(catalog.getDetailsSnapshot().details.messages[0].sessionEventSeq).toBe(9)
        expect(catalog.activeRequests.size).toBe(0)
        expect(catalog.sessionMutations.size).toBe(0)
      }
      expect(calls).toEqual([2, 9])
      expect(reloadHistory).toHaveBeenCalledTimes(2)
      expect(retained).toBeGreaterThanOrEqual(3)
    } finally { cleanup() }
  })

  it('keeps the last valid baseline when a later read fails', async () => {
    const responses: Result[] = [
      { ok: true, data: [{ id: 'saved' }] },
      { ok: false, error: { isDSHRemoteError: true, code: 'gateway/internal', message: 'read failed' } }
    ]
    const mounted = mountCatalog(async () => responses.shift()!)
    await settle()
    expect(mounted.catalog.getSnapshot().items.map(item => item.id)).toEqual(['saved'])
    await expect(mounted.catalog.refresh()).rejects.toThrow('read failed')
    expect(mounted.catalog.getSnapshot().status).toBe('error')
    expect(mounted.catalog.getSnapshot().items.map(item => item.id)).toEqual(['saved'])
    mounted.dispose()
  })

  it('keeps the chosen history for each character across view changes', async () => {
    const mounted = mountCatalog(async () => ({ ok: true, data: [] }))
    const catalog = mounted.catalog as typeof mounted.catalog & {
      rememberSession: (characterId: string, sessionId: string) => void
      preferredSession: (characterId: string) => string
      forgetSession: (characterId: string, sessionId: string) => void
    }
    catalog.rememberSession('character-a', 'older-a')
    catalog.rememberSession('character-b', 'current-b')
    expect(catalog.preferredSession('character-a')).toBe('older-a')
    expect(catalog.preferredSession('character-b')).toBe('current-b')
    catalog.forgetSession('character-a', 'other-a')
    expect(catalog.preferredSession('character-a')).toBe('older-a')
    catalog.forgetSession('character-a', 'older-a')
    expect(catalog.preferredSession('character-a')).toBe('')
    mounted.dispose()
  })

  it('creates chats and updates openings through the product Remote service', async () => {
    let registration: { factory: () => { apply: (ctx: unknown) => void } } | undefined
    let cleanup = () => {}
    let sessionRefreshes = 0
    const created = {
      conversation: { id: 'created-chat', title: '新聊天' },
      metadata: {},
      runtimeSessionId: 'created-runtime',
      messages: [{ id: 'opening', role: 'assistant', content: '开场白', variableStateJson: '{}', status: 'complete' }],
      hasMore: false,
      beforeSequence: null
    }
    const calls: Array<{ method: string; args: unknown[] }> = []
    const changeFeed = conversationChangeFeed()
    const remote = {
      eleckoiConversations: {
        changes: (signal?: AbortSignal) => changeFeed.open(signal),
        list: async () => ({ ok: true, value: [{ id: 'created-chat', runtimeSessionId: 'created-runtime' }] }),
        create: async (...args: unknown[]) => { calls.push({ method: 'create', args }); return { ok: true, value: created } },
        delete: async (...args: unknown[]) => { calls.push({ method: 'delete', args }); return { ok: true, value: undefined } },
        selectOpening: async (...args: unknown[]) => { calls.push({ method: 'selectOpening', args }); return { ok: true, value: created } },
        updateOpening: async (...args: unknown[]) => { calls.push({ method: 'updateOpening', args }); return { ok: true, value: created } }
      }
    }
    runInNewContext(source, {
      AbortController,
      window: {
        __ModuleLoader__: { load: (item: typeof registration) => { registration = item } }
      }
    })
    let catalog: any
    dshClientPlugin(registration!).apply({
      remote,
      sessions: { refresh: async () => { sessionRefreshes += 1 }, list: { getSnapshot: () => ({ byId: {} }) } },
      uiConversation: {},
      provide: (_name: string, value: unknown) => { catalog = value },
      effect: (run: () => () => void) => { cleanup = run() },
      on: () => () => {}
    })
    await settle()
    expect(await catalog.create({ title: '新聊天' })).toMatchObject({ conversation: { id: 'created-chat' } })
    expect(await catalog.selectOpening('created-chat', 'opening-2')).toMatchObject({ conversation: { id: 'created-chat' } })
    expect(await catalog.updateOpening('created-chat', '修改后的开场白')).toMatchObject({ conversation: { id: 'created-chat' } })
    await catalog.delete('created-chat')
    expect(calls).toEqual([
      { method: 'create', args: [{ title: '新聊天' }] },
      { method: 'selectOpening', args: ['created-chat', 'opening-2'] },
      { method: 'updateOpening', args: ['created-chat', '修改后的开场白'] },
      { method: 'delete', args: ['created-chat'] }
    ])
    expect(sessionRefreshes).toBe(2)
    cleanup()
  })

  it('projects official DSH Session history and live output into the roleplay model', async () => {
    let registration: { factory: () => { apply: (ctx: unknown) => void } } | undefined
    let cleanup = () => {}
    let targetListener = () => {}
    let sessionListener = () => {}
    let released = false
    const projectionListeners = new Map<string, () => void>()
    let pressure = { projectedTokens: 40, contextWindow: 100, pressureTokens: 50 }
    const breakdown = { sections: [] }
    const sessionStats = { turns: 1, steps: 2, llmMs: 30, toolMs: 4, ttftMs: 5, ttftSteps: 1, decodeMs: 20, decodeTokens: 8 }
    const tokenUsage = { uncachedInputTokens: 12, outputTokens: 8, cacheReadTokens: 3, cacheWriteTokens: 0 }
    let historyStatsAdjustment = { steps: 0, turns: 0 }
    let inputContinuations = { links: [] as Array<{ turn: number; inputMessageId: string; inputEventSeq: number }> }
    let running = false
    let pendingSubmissions: any[] = []
    const userNode = { kind: 'user', anchorSeq: 2, data: {
      kind: 'user', seq: 2, time: 10, content: [{ type: 'text', text: 'official user' }], source: { kind: 'user' }
    } }
    const finalNode = { kind: 'assistant', turn: 1, step: 4, seq: 5, time: 20,
      messageId: 'assistant-dsh', blocks: [{ kind: 'text', text: '<FINAL>official reply</FINAL>' }] }
    const turnTailNode = { kind: 'turn-tail', anchorSeq: 6, data: {
      turn: 1, seq: 6, time: 21, branchUnavailable: false,
      closing: { status: 'settled', turn: 1, step: 4, time: 20, blocks: finalNode.blocks, finalNode }
    } }
    let settledNodes = new Map<string, any>([
      ['user-2', userNode],
      ['turn-tail-1', turnTailNode]
    ])
    let targetSnapshot: any = {
      order: [...settledNodes.keys()], nodes: settledNodes,
      timeline: { turns: new Map([[1, { turn: 1, status: 'closed' }]]) },
      legacy: { nodes: [], partial: null, runningCalls: [] }
    }
    const session = {
      projections: { faceOf: (key: string) => ({
        getSnapshot: () => key === 'contextPressure' ? pressure
          : key === 'eleckoiInputContinuations' ? inputContinuations
          : key === 'contextBreakdown' ? breakdown
            : key === 'sessionStats' ? sessionStats
              : key === 'eleckoiHistoryStatsAdjustment' ? historyStatsAdjustment : tokenUsage,
        subscribe: (listener: () => void) => {
          projectionListeners.set(key, listener)
          return () => { projectionListeners.delete(key) }
        }
      }) },
      getSnapshot: () => ({ running, pendingSubmissions }),
      subscribe: (listener: () => void) => { sessionListener = listener; return () => { sessionListener = () => {} } },
      cancel: async () => ({ ok: true, value: { accepted: true } }),
      loadOlder: vi.fn(async () => {
        const olderFinal = { kind: 'assistant', turn: 0, step: 1, seq: 1, time: 2,
          messageId: 'older-assistant-dsh', blocks: [{ kind: 'text', text: 'earlier reply' }] }
        settledNodes = new Map([
          ['user-0', { kind: 'user', anchorSeq: 0, data: {
            kind: 'user', seq: 0, time: 1, content: [{ type: 'text', text: 'earlier user' }], source: { kind: 'user' }
          } }],
          ['turn-tail-0', { kind: 'turn-tail', anchorSeq: 1, data: {
            turn: 0, seq: 2, time: 3, branchUnavailable: false,
            closing: { status: 'settled', turn: 0, step: 1, time: 2, blocks: olderFinal.blocks, finalNode: olderFinal }
          } }],
          ...settledNodes
        ])
        targetSnapshot = { ...targetSnapshot, order: [...settledNodes.keys()], nodes: settledNodes }
        hasMore = false
        targetListener()
      })
    }
    let hasMore = false
    let eventEntries: any[] = []
    const binding = {
      session,
      eventSource: { getSnapshot: () => ({ hasMore, entries: eventEntries }), subscribe: () => () => {} }
    }
    const target = {
      getSnapshot: () => targetSnapshot,
      subscribe: (listener: () => void) => { targetListener = listener; return () => { targetListener = () => {} } }
    }
    const sessions = {
      list: { getSnapshot: () => ({ byId: { 'runtime-1': {} } }) },
      refresh: async () => {},
      retain: () => ({
        sessionId: 'runtime-1', binding, ready: Promise.resolve(binding),
        release: () => { released = true }
      })
    }
    const upload = vi.fn(async (_sessionId, _file, _name, _signal, onProgress) => {
      onProgress?.({ loaded: 12, total: 12 })
      return {
        ok: true,
        value: {
          receiptId: 'receipt-1',
          file: { attachmentId: 'sha256:file-1', name: 'notes.txt', bytes: 12 }
        }
      }
    })
    const bridge = {
      request: async (name: string, input?: any) => {
        if (name === 'query.conversations.messages') {
          expect(input.beforeSequence).toBe(3)
          return { ok: true, data: { hasMore: false, beforeSequence: 1, messages: [
            { id: 'older-user', role: 'user', sequence: 1, messageIndex: 0, dshMessageId: 'older-user-dsh' },
            { id: 'older-assistant', role: 'assistant', sequence: 2, messageIndex: 1, dshMessageId: 'older-assistant-dsh' },
          ] } }
        }
        if (name === 'query.conversations.details') return { ok: true, data: {
          conversation: { id: 'chat-1' }, runtimeSessionId: 'runtime-1', hasMore: false, beforeSequence: 1,
          runtimeVariableStateByTurn: { 1: '{"score":7}' },
          compatibilityPresentation: { extensions: { 'product-assistant': { nativeVariableStateJson: '{"score":999}' } } },
          messages: [
            { id: 'product-user', role: 'user', sequence: 3, sessionEventSeq: 2, messageIndex: 17, content: 'official user', variableStateJson: '{}' },
            { id: 'product-assistant', role: 'assistant', sequence: 4, messageIndex: 22, dshMessageId: 'assistant-dsh', variableStateJson: '{}', displayContent: '<FINAL>official reply</FINAL>' },
            { id: 'metadata-user-extra', role: 'user', sequence: 6, variableStateJson: '{}' }
          ]
        } }
        return { ok: true, data: [] }
      }
    }
    const changeFeed = conversationChangeFeed()
    runInNewContext(source, {
      Date,
      AbortController,
      window: { __ModuleLoader__: { load: (item: typeof registration) => { registration = item } } }
    })
    let catalog: any
    const imageUrl = vi.fn(async () => 'blob:session-image')
    dshClientPlugin(registration!).apply({
      remote: conversationRemote((name, input) => bridge.request(name!, input), changeFeed,
        async (conversationId, messages) => {
          expect(conversationId).toBe('chat-1')
          return messages.map(message => ({
            id: message.id,
            sourceContent: message.content,
            displayContent: message.role === 'assistant'
              ? `projected:${message.content.replace(/<\/?FINAL>/g, '').trim()}`
              : message.content,
            variableStateJson: message.variableStateJson
          }))
        }),
      sessions,
      uiConversation: { binding: () => ({ target: () => target }), imageUrl },
      fileUpload: { upload },
      provide: (_name: string, value: unknown) => { catalog = value },
      effect: (run: () => () => void) => { cleanup = run() },
      on: () => () => {}
    })
    await settle()
    const opened = await catalog.open('chat-1')
    await settle()
    expect(opened.messages.map((message: any) => message.content)).toEqual(['official user', '<FINAL>official reply</FINAL>'])
    expect(catalog.getDetailsSnapshot().details.messages.map((message: any) => message.displayContent))
      .toEqual(['official user', 'projected:official reply'])
    expect(opened.messages.map((message: any) => message.messageIndex)).toEqual([0, 1])
    expect(opened.messages[1].variableStateJson).toBe('{"score":7}')
    expect(opened.messages[1].nativeVariableStateJson).toBe('{"score":7}')
    expect(opened.messages[1].variableSnapshotAvailable).toBe(true)
    expect(catalog.getDetailsSnapshot().details.messages).toMatchObject([
      { id: 'product-user', content: 'official user', runtimeSessionId: 'runtime-1' },
      { id: 'product-assistant', content: '<FINAL>official reply</FINAL>', dshMessageId: 'assistant-dsh' }
    ])
    // The relationship projection can hydrate after an unchanged chat tree.
    inputContinuations = { links: [{ turn: 1, inputMessageId: 'synthetic-input', inputEventSeq: 2 }] }
    projectionListeners.get('eleckoiInputContinuations')!()
    await settle()
    expect(catalog.getDetailsSnapshot().details.messages[1].inputEventSeq).toBe(2)
    pendingSubmissions = [{
      requestId: 'request-new', placement: 'transcript', time: 30, text: '你好', attachments: []
    }]
    sessionListener()
    const optimistic = catalog.getDetailsSnapshot().details.messages
    expect(optimistic.filter((message: any) => message.content === '你好')).toHaveLength(1)
    expect(optimistic.at(-1)).toMatchObject({
      id: 'dsh-pending-request-new', requestId: 'request-new', content: '你好', status: 'streaming'
    })
    expect(optimistic.at(-1).nativeVariableStateJson).toBeUndefined()
    expect(optimistic.at(-1).variableSnapshotAvailable).toBe(false)
    const admittedUser = { kind: 'user', anchorSeq: 7, data: {
      kind: 'user', seq: 7, time: 31, content: [{ type: 'text', text: '你好' }],
      source: { kind: 'user', rpcId: 'request-new' }
    } }
    targetSnapshot = { ...targetSnapshot,
      order: [...targetSnapshot.order, 'user-7'],
      nodes: new Map([...targetSnapshot.nodes, ['user-7', admittedUser]]) }
    targetListener()
    const admitted = catalog.getDetailsSnapshot().details.messages
    expect(admitted.filter((message: any) => message.content === '你好')).toHaveLength(1)
    expect(admitted.at(-1)).toMatchObject({
      id: 'dsh-pending-request-new', requestId: 'request-new', sessionEventSeq: 7, status: 'complete'
    })
    pendingSubmissions = []
    sessionListener()
    expect(catalog.getDetailsSnapshot().details.messages
      .filter((message: any) => message.content === '你好')).toHaveLength(1)
    targetSnapshot = {
      order: [...settledNodes.keys()], nodes: settledNodes,
      timeline: { turns: new Map([[1, { turn: 1, status: 'closed' }]]) },
      legacy: { nodes: [], partial: null, runningCalls: [] },
    }
    targetListener()
    const stepNodes = new Map<string, any>([
      ['reasoning-1', { kind: 'assistant-step', location: { kind: 'step', turn: { turn: 1 } },
        data: { turn: 1, step: 1, status: 'complete', time: 12, blocks: [{ kind: 'reasoning', text: '检查资料' }] } }],
      ['assistant-before-tool', { kind: 'assistant-step', location: { kind: 'step', turn: { turn: 1 } },
        data: { turn: 1, step: 2, status: 'settled', time: 13, blocks: [{ kind: 'text', text: '我先检查资料。' }],
          finalNode: { kind: 'assistant', turn: 1, step: 2, seq: 13, time: 13,
            messageId: 'assistant-before-tool', blocks: [{ kind: 'text', text: '我先检查资料。' }] } } }],
      ['tool-1', { kind: 'tool-call', location: { kind: 'step', turn: { turn: 1 } },
        data: { root: { kind: 'tool-result', callId: 'probe-call', call: { name: 'read_file', argsRaw: '{}' },
          time: 14, content: [{ type: 'text', text: '资料已读取' }], subCalls: [] } } }],
    ])
    const finalAt25 = { ...finalNode, seq: 25 }
    const tailAt25 = { ...turnTailNode, anchorSeq: 26, data: { ...turnTailNode.data,
      seq: 26, closing: { ...turnTailNode.data.closing, finalNode: finalAt25 } } }
    settledNodes = new Map([
      ['user-2', userNode],
      ...stepNodes,
      ['turn-tail-1', tailAt25]
    ])
    targetSnapshot = {
      order: [...settledNodes.keys()], nodes: settledNodes,
      timeline: { turns: new Map([[1, { turn: 1, status: 'closed' }]]) },
      legacy: { nodes: [], partial: null, runningCalls: [] },
    }
    targetListener()
    const transcript = catalog.getDetailsSnapshot().details.messages
    expect(transcript).toHaveLength(2)
    expect(transcript.map((message: any) => message.messageIndex)).toEqual([0, 1])
    expect(transcript[1]).toMatchObject({ id: 'product-assistant', content: '<FINAL>official reply</FINAL>', sessionEventSeq: 25,
      process: [{ kind: 'reasoning', detail: '检查资料' }, { kind: 'tool', detail: '资料已读取' }] })
    await catalog.refreshDetails()
    expect(catalog.getDetailsSnapshot().details.messages).toHaveLength(2)
    expect(catalog.getDetailsSnapshot().details.messages[1].process).toHaveLength(2)
    hasMore = true
    targetListener()
    const olderPage = await catalog.pageOlder('chat-1', 2)
    expect(session.loadOlder).toHaveBeenCalledOnce()
    expect(olderPage.messages.map((message: any) => message.content)).toEqual(['earlier user', 'earlier reply', 'official user', '<FINAL>official reply</FINAL>'])
    expect(olderPage.messages.map((message: any) => message.messageIndex)).toEqual([0, 1, 2, 3])
    expect(olderPage.hasMore).toBe(false)
    expect(olderPage.replace).toBe(true)
    const file = { name: 'notes.txt', size: 12 }
    const progress = vi.fn()
    await expect(catalog.uploadFile('chat-1', file, { onProgress: progress })).resolves.toEqual({
      id: 'receipt-1',
      receiptId: 'receipt-1',
      attachmentId: 'sha256:file-1',
      name: 'notes.txt',
      bytes: 12
    })
    expect(upload).toHaveBeenCalledWith('runtime-1', file, 'notes.txt', undefined, progress)
    expect(progress).toHaveBeenCalledWith({ loaded: 12, total: 12 })
    const image = { attachmentId: 'sha256:image-1', name: 'sample.png', mediaType: 'image/png' }
    await expect(catalog.readImage('chat-1', image)).resolves.toBe('blob:session-image')
    expect(imageUrl).toHaveBeenCalledWith('runtime-1', image)
    expect(catalog.getStatsSnapshot()).toEqual({ id: 'chat-1', stats: {
      sessionStats, tokenUsage, contextPressure: pressure, contextBreakdown: breakdown
    } })
    const previousStats = catalog.getStatsSnapshot()
    pressure = { ...pressure, projectedTokens: 60 }
    projectionListeners.get('contextPressure')?.()
    expect(catalog.getStatsSnapshot()).not.toBe(previousStats)
    expect(catalog.getStatsSnapshot().stats.contextPressure.projectedTokens).toBe(60)

    historyStatsAdjustment = { steps: 1, turns: 1 }
    projectionListeners.get('eleckoiHistoryStatsAdjustment')?.()
    expect(catalog.getStatsSnapshot().stats.sessionStats).toEqual({ ...sessionStats, steps: 1, turns: 0 })
    const adjustedStats = catalog.getStatsSnapshot().stats
    catalog.publishStats('chat-1', adjustedStats)
    expect(catalog.getStatsSnapshot().stats.sessionStats).toEqual({ ...sessionStats, steps: 1, turns: 0 })
    expect(catalog.getStatsSnapshot().stats.tokenUsage).toEqual(tokenUsage)
    historyStatsAdjustment = { steps: 0, turns: 0 }
    projectionListeners.get('eleckoiHistoryStatsAdjustment')?.()

    running = true
    const liveNodes = new Map<string, any>([
      ['assistant-live', {
        kind: 'assistant-step',
        location: { kind: 'step', turn: { turn: 2 }, step: { step: 1 } },
        data: { turn: 2, step: 1, status: 'running', time: 30, blocks: [
          { kind: 'reasoning', text: '先读取资料' }
        ] }
      }]
    ])
    const allLiveNodes = new Map([...settledNodes, ...liveNodes])
    targetSnapshot = {
      order: [...allLiveNodes.keys()], nodes: allLiveNodes,
      timeline: { turns: new Map([[1, { turn: 1, status: 'closed' }], [2, { turn: 2, status: 'open' }]]) },
      legacy: { nodes: [], partial: null, runningCalls: [] }
    }
    targetListener()
    expect(catalog.getStreamSnapshot()).toMatchObject({
      status: 'running', messageId: '', content: '',
      renderKey: 'dsh-reply-runtime-1-2', dshTurn: 2,
      process: [{ kind: 'reasoning', status: 'running', detail: '先读取资料' }]
    })
    let streamPublications = 0
    const stopStreamObserver = catalog.subscribeStream(() => { streamPublications += 1 })
    const completionStreamStates: string[] = []
    const completionChatStates: string[] = []
    const stopDetailsObserver = catalog.subscribeDetails(() => {
      const messages = catalog.getDetailsSnapshot().details?.messages || []
      if (messages.at(-1)?.content === '<FINAL>\n第一段正文。\n</FINAL>') {
        completionStreamStates.push(catalog.getStreamSnapshot().status)
      }
    })
    const stopChatObserver = catalog.subscribeChat(() => {
      const snapshot = catalog.getChatSnapshot()
      const messages = snapshot.details.details?.messages || []
      if (messages.at(-1)?.content === '<FINAL>\n第一段正文。\n</FINAL>') {
        completionChatStates.push(snapshot.stream.status)
      }
    })
    const unchangedStreamPublications = streamPublications
    sessionListener()
    targetListener()
    expect(streamPublications).toBe(unchangedStreamPublications)
    const settledDetailsDuringStream = catalog.getDetailsSnapshot()
    const incrementalPublications: any[] = []
    const stopIncrementalObserver = catalog.subscribeChat(() => {
      const snapshot = catalog.getChatSnapshot()
      incrementalPublications.push({ messages: snapshot.details.details.messages, process: snapshot.stream.process })
    })
    allLiveNodes.set('assistant-live', {
      ...allLiveNodes.get('assistant-live'),
      data: { ...allLiveNodes.get('assistant-live').data, status: 'settled', blocks: [
        { kind: 'reasoning', text: '先读取资料' }, { kind: 'text', text: '准备工具调用<FIN' }
      ] }
    })
    allLiveNodes.set('tool-live', {
      kind: 'tool-call',
      location: { kind: 'step', turn: { turn: 2 }, step: { step: 1 } },
      data: { root: {
        phase: 'start', callId: 'call-1', name: 'read_file', argsRaw: '{"path":"notes.txt"}',
        turn: 2, step: 1, time: 31, subCalls: []
      } }
    })
    targetSnapshot = { ...targetSnapshot, order: [...allLiveNodes.keys()] }
    targetListener()
    sessionListener()
    stopIncrementalObserver()
    expect(incrementalPublications).toHaveLength(1)
    expect(incrementalPublications[0].messages.at(-1).process).toEqual(incrementalPublications[0].process)
    expect(incrementalPublications[0].messages.slice(0, -1)).toEqual(settledDetailsDuringStream.details.messages.slice(0, -1))
    expect(incrementalPublications[0].messages.slice(0, -1).every((message: any, index: number) => message === settledDetailsDuringStream.details.messages[index])).toBe(true)
    const detailsWithTool = catalog.getDetailsSnapshot()
    expect(detailsWithTool).not.toBe(settledDetailsDuringStream)
    expect(detailsWithTool.details.messages.map((message: any) => message.content)).toContain('official user')
    expect(detailsWithTool.details.messages.at(-1)).toMatchObject({
      role: 'assistant', status: 'streaming', process: [
        { kind: 'reasoning', status: 'complete', detail: '先读取资料' },
        { kind: 'tool', status: 'running', toolName: 'read_file' }
      ]
    })
    expect(catalog.getStreamSnapshot()).toMatchObject({
      status: 'running', messageId: '', content: '', runId: 'runtime-1',
      renderKey: 'dsh-reply-runtime-1-2', dshTurn: 2,
      process: [
        { kind: 'reasoning', status: 'complete', detail: '先读取资料' },
        { kind: 'tool', status: 'running', toolName: 'read_file' }
      ]
    })

    // `turn/end` can publish a tail before its closing assistant is attached.
    // That intermediate official snapshot must not make the visible stream
    // row disappear.
    const incompleteTailNodes = new Map([...allLiveNodes, ['turn-tail-2', {
      kind: 'turn-tail', anchorSeq: 32, data: {
        turn: 2, seq: 32, time: 41, branchUnavailable: true, closing: null
      }
    }]])
    targetSnapshot = {
      order: [...incompleteTailNodes.keys()], nodes: incompleteTailNodes,
      timeline: { turns: new Map([[1, { turn: 1, status: 'closed' }], [2, { turn: 2, status: 'closed' }]]) },
      legacy: { nodes: [], partial: null, runningCalls: [] }
    }
    running = false
    targetListener()
    sessionListener()
    expect(catalog.getStreamSnapshot().status).toBe('running')

    // An interrupted turn has the same incomplete tail shape as the normal
    // delayed-final snapshot, but the official end reason must release the
    // live stream immediately instead of leaving the chat locked.
    eventEntries = [{ type: 'event', event: {
      type: 'turn/end', data: { turn: 2, reason: { kind: 'aborted', reason: 'user' } }
    } }]
    targetListener()
    sessionListener()
    expect(catalog.getStreamSnapshot().status).toBe('idle')
    eventEntries = []
    running = true
    targetSnapshot = {
      order: [...allLiveNodes.keys()], nodes: allLiveNodes,
      timeline: { turns: new Map([[1, { turn: 1, status: 'closed' }], [2, { turn: 2, status: 'open' }]]) },
      legacy: { nodes: [], partial: null, runningCalls: [] }
    }

    allLiveNodes.set('assistant-live', {
      ...allLiveNodes.get('assistant-live'),
      data: {
        ...allLiveNodes.get('assistant-live').data,
        status: 'running',
        blocks: [
          { kind: 'reasoning', text: '先读取资料' },
          { kind: 'text', text: '准备工具调用<FINAL>\n第一段</FIN' }
        ]
      }
    })
    targetListener()
    expect(catalog.getDetailsSnapshot()).not.toBe(detailsWithTool)
    expect(catalog.getDetailsSnapshot().details.messages.at(-1)).toMatchObject({
      role: 'assistant', status: 'streaming', content: '准备工具调用<FINAL>\n第一段</FIN', displayContent: '第一段'
    })
    expect(catalog.getStreamSnapshot()).toMatchObject({
      status: 'running', messageId: '', content: '第一段', runId: 'runtime-1',
      renderKey: 'dsh-reply-runtime-1-2'
    })

    allLiveNodes.set('assistant-live', {
      ...allLiveNodes.get('assistant-live'),
      data: {
        ...allLiveNodes.get('assistant-live').data,
        blocks: [
          { kind: 'reasoning', text: '先读取资料' },
          { kind: 'text', text: '准备工具调用<FINAL>\n第一段正文。\n</FINAL>' }
        ]
      }
    })
    targetListener()
    expect(catalog.getDetailsSnapshot().details.messages.at(-1)).toMatchObject({
      role: 'assistant', status: 'streaming', content: '准备工具调用<FINAL>\n第一段正文。\n</FINAL>', displayContent: '第一段正文。'
    })
    expect(catalog.getStreamSnapshot()).toMatchObject({
      status: 'running', messageId: '', content: '第一段正文。', runId: 'runtime-1'
    })

    const appendAfterClose = '准备工具调用<FINAL>\n第一段正文。\n</FINAL>\n合成附加模块'
    allLiveNodes.set('assistant-live', {
      ...allLiveNodes.get('assistant-live'),
      data: { ...allLiveNodes.get('assistant-live').data, blocks: [{ kind: 'text', text: appendAfterClose }] }
    })
    targetListener()
    expect(catalog.getDetailsSnapshot().details.messages.at(-1)).toMatchObject({
      content: appendAfterClose, displayContent: '第一段正文。\n合成附加模块', status: 'streaming'
    })
    expect(catalog.getStreamSnapshot()).toMatchObject({ status: 'running', content: '第一段正文。\n合成附加模块' })
    allLiveNodes.set('assistant-live', {
      ...allLiveNodes.get('assistant-live'),
      data: { ...allLiveNodes.get('assistant-live').data,
        blocks: [{ kind: 'text', text: '准备工具调用<FINAL>\n第一段正文。\n</FINAL>' }] }
    })
    targetListener()

    // The assistant can already contain final-marked text while the Session
    // has not published a turn-tail at all. Ending the Session here must also
    // keep the live row until the durable detail arrives.
    running = false
    targetSnapshot = {
      order: [...allLiveNodes.keys()], nodes: allLiveNodes,
      timeline: { turns: new Map([[1, { turn: 1, status: 'closed' }], [2, { turn: 2, status: 'closed' }]]) },
      legacy: { nodes: [], partial: null, runningCalls: [] }
    }
    targetListener()
    sessionListener()
    expect(catalog.getStreamSnapshot().status).toBe('running')
    running = true
    targetSnapshot = {
      order: [...allLiveNodes.keys()], nodes: allLiveNodes,
      timeline: { turns: new Map([[1, { turn: 1, status: 'closed' }], [2, { turn: 2, status: 'open' }]]) },
      legacy: { nodes: [], partial: null, runningCalls: [] }
    }

    const liveFinalNode = { kind: 'assistant', turn: 2, step: 1, seq: 31, time: 40,
      messageId: 'assistant-live-final', blocks: [{ kind: 'text', text: '<FINAL>\n第一段正文。\n</FINAL>' }] }
    const completedNodes = new Map([...settledNodes, ['turn-tail-2', {
      kind: 'turn-tail', anchorSeq: 32, data: {
        turn: 2, seq: 32, time: 41, branchUnavailable: false,
        closing: { status: 'settled', turn: 2, step: 1, time: 40,
          blocks: liveFinalNode.blocks, finalNode: liveFinalNode }
      }
    }]])
    targetSnapshot = {
      order: [...completedNodes.keys()], nodes: completedNodes,
      timeline: { turns: new Map([[1, { turn: 1, status: 'closed' }], [2, { turn: 2, status: 'closed' }]]) },
      legacy: { nodes: [], partial: null, runningCalls: [] }
    }
    targetListener()
    expect(catalog.getDetailsSnapshot().details.messages.at(-1)).toMatchObject({
      content: '<FINAL>\n第一段正文。\n</FINAL>', displayContent: '第一段正文。'
    })
    expect(catalog.getStreamSnapshot().status).toBe('idle')
    expect(completionStreamStates.at(-1)).toBe('idle')
    expect(completionChatStates.at(-1)).toBe('idle')

    running = false
    sessionListener()
    stopDetailsObserver()
    stopChatObserver()
    expect(catalog.getStreamSnapshot().status).toBe('idle')

    // A new turn must not reuse the preceding reply or its activity.
    running = true
    targetSnapshot = { ...targetSnapshot, timeline: { turns: new Map([
      [2, { turn: 2, status: 'closed' }], [3, { turn: 3, status: 'open' }]
    ]) } }
    sessionListener()
    expect(catalog.getStreamSnapshot()).toMatchObject({
      status: 'running', messageId: '', content: '', process: [], dshTurn: 3
    })
    const toolOnlyNodes = new Map([...completedNodes, ['tool-only', {
      kind: 'tool-call', location: { kind: 'step', turn: { turn: 3 }, step: { step: 1 } },
      data: { root: { phase: 'start', callId: 'search-1', name: 'web_search', argsRaw: '{}',
        turn: 3, step: 1, time: 50, subCalls: [] } }
    }]])
    targetSnapshot = { ...targetSnapshot, order: [...toolOnlyNodes.keys()], nodes: toolOnlyNodes }
    targetListener()
    expect(catalog.getStreamSnapshot()).toMatchObject({
      status: 'running', messageId: '', content: '',
      renderKey: 'dsh-reply-runtime-1-3', dshTurn: 3,
      process: [{ id: 'search-1', kind: 'tool', status: 'running', toolName: 'web_search' }]
    })
    expect(catalog.getStreamSnapshot().process).toHaveLength(1)
    cleanup()
    stopStreamObserver()
    expect(released).toBe(true)
    expect(projectionListeners.size).toBe(0)
    expect(catalog.getStatsSnapshot()).toEqual({ id: '', stats: null })
  })

  it('keeps the active conversation detail when earlier opens finish later', async () => {
    type Details = { conversation: { id: string }; messages: Array<{ id: string }> }
    const detail = (id: string, messageId: string): Details => ({ conversation: { id }, messages: [{ id: messageId }] })
    const pending: Array<{ id: string; resolve: (result: { ok: boolean; data: Details }) => void }> = []
    let registration: { factory: () => { apply: (ctx: unknown) => void } } | undefined
    const changeFeed = conversationChangeFeed()
    let cleanup = () => {}
    let catalog: {
      getDetailsSnapshot: () => { id: string; status: string; details: Details | null }
      subscribeDetails: (listener: () => void) => () => void
      open: (id: string) => Promise<Details | null>
    } | undefined
    const bridge = {
      request: (name: string, input: { conversationId?: string }) => name === 'query.conversations.list'
        ? Promise.resolve({ ok: true, data: [{ id: 'first' }, { id: 'second' }] })
        : new Promise<{ ok: boolean; data: Details }>(resolve => {
          expect(name).toBe('query.conversations.details')
          pending.push({ id: input.conversationId!, resolve })
        }),
    }
    runInNewContext(source, {
      AbortController,
      window: { __ModuleLoader__: { load: (item: typeof registration) => { registration = item } } }
    })
    dshClientPlugin(registration!).apply({
      remote: conversationRemote((name, input) => bridge.request(name!, input as { conversationId?: string }), changeFeed),
      provide: (_name: string, value: typeof catalog) => { catalog = value },
      effect: (run: () => () => void) => { cleanup = run() },
      on: () => () => {}
    })
    if (!catalog) throw new Error('Conversation model was not provided')
    await settle()
    let changes = 0
    catalog.subscribeDetails(() => { changes += 1 })
    const first = catalog.open('first')
    const second = catalog.open('second')
    expect(pending.map(item => item.id)).toEqual(['first', 'second'])
    pending[1]!.resolve({ ok: true, data: detail('second', 'latest') })
    expect((await second)?.messages[0]?.id).toBe('latest')
    pending[0]!.resolve({ ok: true, data: detail('first', 'stale') })
    expect(await first).toBeNull()
    expect(catalog.getDetailsSnapshot().details?.conversation.id).toBe('second')

    changeFeed.emit({ kind: 'catalog', conversationId: 'second', reason: 'created' })
    await settle()
    expect(pending[2]?.id).toBe('second')
    pending[2]!.resolve({ ok: true, data: detail('second', 'updated') })
    await settle()
    expect(catalog.getDetailsSnapshot().details?.messages[0]?.id).toBe('updated')
    expect(changes).toBe(4)
    cleanup()
    expect(changeFeed.isStopped()).toBe(true)
  })

  it('clears a deleted active conversation before requesting its details again', async () => {
    let registration: { factory: () => { apply: (ctx: unknown) => void } } | undefined
    const changes = conversationChangeFeed()
    let cleanup = () => {}
    let exists = true
    let finishCatalog: (() => void) | undefined
    let pendingCatalog: Promise<void> | undefined
    const detailRequests: string[] = []
    let catalog: {
      open: (id: string) => Promise<unknown>
      getDetailsSnapshot: () => { id: string; status: string; error: string }
    } | undefined
    const bridge = {
      request: async (name: string, input: { conversationId?: string }) => {
        if (name === 'query.conversations.list') {
          if (pendingCatalog) await pendingCatalog
          return { ok: true, data: exists ? [{ id: 'only-chat' }] : [] }
        }
        if (name === 'query.conversations.details') {
          detailRequests.push(input.conversationId!)
          return exists
            ? { ok: true, data: { conversation: { id: 'only-chat' }, messages: [] } }
            : { ok: false, error: { isDSHRemoteError: true, code: 'gateway/internal', message: '找不到对应的聊天存档。' } }
        }
        throw new Error(`Unexpected query: ${name}`)
      },
    }
    runInNewContext(source, {
      AbortController,
      window: { __ModuleLoader__: { load: (item: typeof registration) => { registration = item } } }
    })
    dshClientPlugin(registration!).apply({
      remote: conversationRemote((name, input) => bridge.request(name!, input as { conversationId?: string }), changes),
      provide: (_name: string, value: typeof catalog) => { catalog = value },
      effect: (run: () => () => void) => { cleanup = run() },
      on: () => () => {}
    })
    if (!catalog) throw new Error('Conversation model was not provided')
    await settle()
    await catalog.open('only-chat')
    expect(catalog.getDetailsSnapshot()).toMatchObject({ id: 'only-chat', status: 'ready', error: '' })

    exists = false
    pendingCatalog = new Promise(resolve => { finishCatalog = resolve })
    changes.emit({ kind: 'catalog', conversationId: 'only-chat', reason: 'deleted' })
    await settle()
    expect(catalog.getDetailsSnapshot()).toMatchObject({ id: '', status: 'idle', error: '' })
    expect(detailRequests).toEqual(['only-chat'])
    finishCatalog!()
    await settle()
    expect(detailRequests).toEqual(['only-chat'])
    expect(catalog.getDetailsSnapshot()).toMatchObject({ id: '', status: 'idle', error: '' })
    cleanup()
  })

  it('retains loaded history while a destructive refresh is pending', async () => {
    type Details = {
      conversation: { id: string }
      runtimeSessionId: string
      messages: Array<{ id: string; sequence: number }>
      hasMore: boolean
      beforeSequence: number | null
    }
    const detail = (id: string, sequences: number[], hasMore = true): Details => ({
      conversation: { id },
      runtimeSessionId: `runtime-${id}`,
      messages: sequences.map(sequence => ({ id: `${id}-${sequence}`, sequence })),
      hasMore,
      beforeSequence: sequences[0] ?? null
    })
    const responses = [detail('first', [3, 4]), detail('first', [3, 4, 5]), detail('first', [5]), detail('second', [8], false)]
    let resolvePage: ((result: unknown) => void) | undefined
    const changes = conversationChangeFeed()
    let registration: { factory: () => { apply: (ctx: unknown) => void } } | undefined
    let cleanup = () => {}
    let catalog: {
      getDetailsSnapshot: () => { id: string; details: Details | null; runtimeSessionId?: string }
      open: (id: string) => Promise<Details | null>
      pageOlder: (id: string, beforeSequence: number) => Promise<unknown>
      invalidateDetails: (id: string) => void
      activate: (id: string) => void
    } | undefined
    const bridge = {
      request: (name: string) => {
        if (name === 'query.conversations.list') return Promise.resolve({ ok: true, data: [{ id: 'first' }, { id: 'second' }] })
        if (name === 'query.conversations.details') return Promise.resolve({ ok: true, data: responses.shift() })
        if (name === 'query.conversations.messages') return new Promise(resolve => { resolvePage = resolve })
        throw new Error(`Unexpected query: ${name}`)
      },
    }
    runInNewContext(source, {
      AbortController,
      window: { __ModuleLoader__: { load: (item: typeof registration) => { registration = item } } }
    })
    dshClientPlugin(registration!).apply({
      remote: conversationRemote((name) => bridge.request(name!), changes),
      provide: (_name: string, value: typeof catalog) => { catalog = value },
      effect: (run: () => () => void) => { cleanup = run() },
      on: () => () => {}
    })
    if (!catalog) throw new Error('Conversation model was not provided')
    await settle()
    await catalog.open('first')
    expect(await catalog.pageOlder('second', 3)).toBeNull()
    expect(await catalog.pageOlder('first', 2)).toBeNull()
    const older = catalog.pageOlder('first', 3)
    resolvePage!({ ok: true, data: {
      messages: [1, 2].map(sequence => ({ id: `first-${sequence}`, sequence })),
      hasMore: false, beforeSequence: 1
    } })
    await older
    changes.emit({ kind: 'catalog', conversationId: 'first', reason: 'created' })
    await settle()
    expect(catalog.getDetailsSnapshot().details?.messages.map(message => message.sequence)).toEqual([1, 2, 3, 4, 5])
    expect(catalog.getDetailsSnapshot().details?.beforeSequence).toBe(1)

    catalog.invalidateDetails('first')
    expect(catalog.getDetailsSnapshot().details?.messages.map(message => message.sequence)).toEqual([1, 2, 3, 4, 5])
    expect(catalog.getDetailsSnapshot().runtimeSessionId).toBe('runtime-first')
    await settle()
    expect(catalog.getDetailsSnapshot().details?.messages.map(message => message.sequence)).toEqual([1, 2, 3, 4, 5])
    const stalePage = catalog.pageOlder('first', 5)
    catalog.activate('second')
    expect(catalog.getDetailsSnapshot().runtimeSessionId).toBe('')
    await catalog.open('second')
    resolvePage!({ ok: true, data: { messages: [{ id: 'first-4', sequence: 4 }], hasMore: false, beforeSequence: 4 } })
    expect(await stalePage).toBeNull()
    expect(catalog.getDetailsSnapshot().id).toBe('second')
    expect(catalog.getDetailsSnapshot().details?.messages.map(message => message.sequence)).toEqual([8])
    cleanup()
  })

  it('returns the selected history while another refresh of the same history is pending', async () => {
    type Details = { conversation: { id: string }; messages: Array<{ id: string }> }
    const pending: Array<(result: { ok: boolean; data: Details }) => void> = []
    let registration: { factory: () => { apply: (ctx: unknown) => void } } | undefined
    let catalog: {
      open: (id: string) => Promise<Details | null>
      refreshDetails: () => Promise<Details>
      getDetailsSnapshot: () => { id: string; details: Details | null }
    } | undefined
    let cleanup = () => {}
    const request = (name: string) => {
      if (name === 'query.conversations.list') return Promise.resolve({ ok: true, data: [] })
      expect(name).toBe('query.conversations.details')
      return new Promise(resolve => pending.push(resolve))
    }
    runInNewContext(source, {
      AbortController,
      window: {
        __ModuleLoader__: { load: (item: typeof registration) => { registration = item } }
      }
    })
    dshClientPlugin(registration!).apply({
      remote: conversationRemote((name) => request(name!), conversationChangeFeed()),
      provide: (_name: string, value: typeof catalog) => { catalog = value },
      effect: (run: () => () => void) => { cleanup = run() },
      on: () => () => {}
    })
    if (!catalog) throw new Error('Conversation model was not provided')
    await settle()
    const opening = catalog.open('older-history')
    const refresh = catalog.refreshDetails()
    const detail = { conversation: { id: 'older-history' }, messages: [{ id: 'older-message' }] }
    pending[0]!({ ok: true, data: detail })
    expect((await opening)?.conversation.id).toBe('older-history')
    pending[1]!({ ok: true, data: detail })
    await refresh
    expect(catalog.getDetailsSnapshot().details?.conversation.id).toBe('older-history')
    cleanup()
  })

  it('refreshes the open variable timeline and drops results after it closes', async () => {
    type Timeline = { floors: Array<{ id: string }> }
    const pending: Array<(result: { ok: boolean; data: Timeline }) => void> = []
    const changes = conversationChangeFeed()
    let registration: { factory: () => { apply: (ctx: unknown) => void } } | undefined
    let cleanup = () => {}
    let catalog: {
      getTimelineSnapshot: () => { id: string; status: string; timeline: Timeline | null }
      openTimeline: (id: string) => Promise<Timeline | null>
      closeTimeline: (id: string) => void
    } | undefined
    const bridge = {
      request: (name: string) => name === 'query.conversations.variable_timeline'
        ? new Promise<{ ok: boolean; data: Timeline }>(resolve => pending.push(resolve))
        : Promise.resolve({ ok: true, data: [{ id: 'first' }] }),
    }
    runInNewContext(source, {
      AbortController,
      window: { __ModuleLoader__: { load: (item: typeof registration) => { registration = item } } }
    })
    dshClientPlugin(registration!).apply({
      remote: conversationRemote((name) => bridge.request(name!), changes),
      provide: (_name: string, value: typeof catalog) => { catalog = value },
      effect: (run: () => () => void) => { cleanup = run() },
      on: () => () => {}
    })
    if (!catalog) throw new Error('Conversation model was not provided')
    await settle()
    const opened = catalog.openTimeline('first')
    pending[0]!({ ok: true, data: { floors: [{ id: 'floor-1' }] } })
    expect((await opened)?.floors[0]?.id).toBe('floor-1')
    changes.emit({ kind: 'catalog', conversationId: 'first', reason: 'created' })
    await settle()
    pending[1]!({ ok: true, data: { floors: [{ id: 'floor-2' }] } })
    await settle()
    expect(catalog.getTimelineSnapshot().timeline?.floors[0]?.id).toBe('floor-2')

    const stale = catalog.openTimeline('first')
    catalog.closeTimeline('first')
    pending[2]!({ ok: true, data: { floors: [{ id: 'stale' }] } })
    expect(await stale).toBeNull()
    expect(catalog.getTimelineSnapshot().status).toBe('idle')
    cleanup()
    expect(changes.isStopped()).toBe(true)
  })

})
