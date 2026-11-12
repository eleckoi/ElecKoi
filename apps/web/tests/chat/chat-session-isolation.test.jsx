// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { useChatSessions } from '../../src/modules/chat/hooks/useChatSessions.js'

describe('conversation display ownership', () => {
  it.each(['send', 'regenerate'].flatMap(kind => [
    ...['complete', 'cancelled', 'error'].map(outcome => [kind, outcome, false]),
    [kind, 'cancelled', true],
  ]))('switches characters during %s without borrowing another conversation state (%s, return before stopping: %s)', async (kind, outcome, revisit) => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    const records = ['a', 'b'].map(key => ({ id: `chat-${key}`, title: `Synthetic ${key}`,
      runtimeSessionId: `session-${key}`, metadata: { characterId: `character-${key}` } }))
    const details = new Map(records.map(record => [record.id, { conversation: record, metadata: record.metadata,
      runtimeSessionId: record.runtimeSessionId, messages: [{ id: `input-${record.id}`, role: 'user', content: 'Synthetic previous input',
        conversationId: record.id, sessionEventSeq: 2, sequence: 2 }], hasMore: false }]))
    const runs = new Map(), listeners = new Set(), streamListeners = new Set()
    let snapshot
    const publish = id => {
      snapshot = { details: { id, status: 'ready', details: details.get(id) },
        stream: { id, status: runs.has(id) ? 'running' : 'idle', runId: runs.has(id) ? `session-${id.slice(-1)}` : '', content: '', process: [] } }
      for (const listener of [...listeners, ...streamListeners]) listener()
    }
    publish('chat-a')
    const catalog = { status: 'ready', items: records, error: '' }
    const model = {
      getSnapshot: () => catalog, subscribe: () => () => {}, getDetailsSnapshot: () => snapshot.details,
      getChatSnapshot: () => snapshot, getStreamSnapshot: () => snapshot.stream,
      subscribeChat: listener => { listeners.add(listener); return () => listeners.delete(listener) },
      subscribeStream: listener => { streamListeners.add(listener); return () => streamListeners.delete(listener) },
      refresh: async () => records, open: vi.fn(async id => { publish(id); return details.get(id) }),
      readModelSelection: async () => ({ provider: 'synthetic', model: 'synthetic' }),
      send: vi.fn(input => new Promise((resolve, reject) => { runs.set(input.conversationId, { input, resolve, reject }); publish(input.conversationId) })),
      cancelRequest: vi.fn(async (id, requestId) => {
        expect(runs.get(id).input.requestId).toBe(requestId)
        finish(id, 'cancelled'); return true
      }),
      invalidateDetails: vi.fn(),
    }
    model.regenerate = model.send
    function finish(id, result = 'complete') {
      const run = runs.get(id); runs.delete(id)
      const record = details.get(id)
      const next = { ...record, messages: [{ id: `reply-${id}`, conversationId: id, role: 'assistant',
        content: `Reply ${id}`, status: 'complete', sequence: 1 }] }
      details.set(id, next)
      if (snapshot.details.id === id) publish(id)
      if (result === 'error') run.reject(new Error(`Synthetic failure ${id}`))
      else run.resolve({ details: next, cancelled: result === 'cancelled' })
    }
    const props = { conversations: model, characters: [], modelConfigs: [{ id: 'synthetic', model: 'synthetic' }],
      setStatus: vi.fn(), setActiveSectionState: vi.fn(), notify: vi.fn() }
    const container = document.createElement('div'); document.body.append(container)
    const root = createRoot(container)
    let chat
    function Probe() { chat = useChatSessions(props); return null }
    let first, second
    try {
      await act(async () => root.render(<Probe />))
      await act(async () => { first = kind === 'send' ? chat.sendMessage(null, 'Input A')
        : chat.regenerateReply({ targetMessageId: 'input-chat-a', replacementMessage: 'Revised input A' }) })
      expect(chat.isSending).toBe(true)
      await act(async () => chat.openCharacterChat({ id: 'character-b', name: 'Synthetic B' }))
      expect(chat.sessionId).toBe('chat-b')
      expect(chat.isSending).toBe(false)
      expect(model.cancelRequest).not.toHaveBeenCalled()
      await act(async () => { second = chat.sendMessage(null, 'Input B') })
      expect([...runs.keys()]).toEqual(['chat-a', 'chat-b'])
      await act(async () => chat.setInput('Unsent draft B'))
      if (revisit) {
        await act(async () => chat.loadChat('chat-a'))
        expect(chat.isSending).toBe(true)
        await act(async () => chat.stopSend())
        await act(async () => { await first })
        expect(model.cancelRequest.mock.calls[0][0]).toBe('chat-a')
        expect([...runs.keys()]).toEqual(['chat-b'])
        await act(async () => chat.loadChat('chat-b'))
      } else await act(async () => { finish('chat-a', outcome); await first })
      expect(chat.sessionId).toBe('chat-b')
      expect(chat.isSending).toBe(true)
      if (!revisit) expect(chat.input).toBe('Unsent draft B')
      expect(chat.messages.every(message => message.conversationId === 'chat-b')).toBe(true)
      expect(model.open.mock.calls.at(-1)).toEqual(['chat-b'])
      await act(async () => chat.stopSend())
      await act(async () => { await second })
      expect(model.cancelRequest).toHaveBeenCalledTimes(revisit ? 2 : 1)
      expect(model.cancelRequest.mock.calls.at(-1)[0]).toBe('chat-b')
      expect(chat.isSending).toBe(false)
      await act(async () => chat.loadChat('chat-a'))
      expect(chat.messages.at(-1).content).toBe('Reply chat-a')
    } finally {
      for (const id of [...runs.keys()]) finish(id)
      await act(async () => { await Promise.allSettled([first, second]); root.unmount() })
      container.remove(); vi.unstubAllGlobals()
    }
  })

  it.each([false, true])('clears a deactivated conversation and rejects an outstanding open (%s)', async pendingOpen => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    const conversation = { id: 'synthetic-deleted-chat', title: 'Synthetic chat',
      runtimeSessionId: 'synthetic-deleted-session', metadata: { characterId: 'synthetic-character' } }
    const details = { conversation, metadata: conversation.metadata, runtimeSessionId: conversation.runtimeSessionId,
      messages: [{ id: 'synthetic-message', role: 'assistant', content: 'Synthetic reply', sequence: 1 }],
      hasMore: false, beforeSequence: null }
    const catalog = { status: 'ready', items: [conversation], error: '' }
    let snapshot = { details: { id: conversation.id, status: 'ready', details },
      stream: { id: conversation.id, status: 'idle', content: '', process: [] } }
    const listeners = new Set()
    const publish = next => { snapshot = next; for (const listener of listeners) listener() }
    let finishOpen
    const model = {
      getSnapshot: () => catalog, subscribe: () => () => {},
      getDetailsSnapshot: () => snapshot.details, getChatSnapshot: () => snapshot,
      subscribeChat: listener => { listeners.add(listener); return () => listeners.delete(listener) },
      readModelSelection: async () => ({ provider: '', model: '' }),
      activate: vi.fn(), open: () => new Promise(resolve => { finishOpen = resolve }),
    }
    const props = { conversations: model, characters: [], modelConfigs: [],
      setStatus: vi.fn(), setActiveSectionState: vi.fn(), notify: vi.fn() }
    const container = document.createElement('div'); document.body.append(container)
    const root = createRoot(container)
    let chat
    function Probe() {
      chat = useChatSessions(props)
      return chat.sessionId ? <iframe title="Synthetic role frontend" /> : null
    }
    try {
      await act(() => root.render(<Probe />))
      await act(() => chat.setInput('Synthetic unsent draft'))
      let opening
      if (pendingOpen) await act(() => { opening = chat.loadChat(conversation.id) })
      for (const status of ['loading', 'error']) {
        await act(() => publish({ ...snapshot, details: { id: conversation.id, status, details: null } }))
        expect(chat.sessionId).toBe(conversation.id)
        expect(container.querySelector('iframe')).not.toBeNull()
      }
      // A completed deletion deactivates the catalog before its list refresh.
      await act(() => publish({ details: { id: '', status: 'idle', details: null },
        stream: { id: '', status: 'idle', content: '', process: [] } }))
      expect(chat.sessionId).toBe('')
      expect(chat.runtimeSessionId).toBe('')
      expect(chat.chatCharacter.character_id).toBe('')
      expect(chat.messages).toEqual([])
      expect(chat.input).toBe('')
      expect(container.querySelector('iframe')).toBeNull()
      expect(model.activate).toHaveBeenCalledWith('')
      if (pendingOpen) {
        await act(async () => { finishOpen(details); await opening })
        expect(chat.sessionId).toBe('')
        expect(container.querySelector('iframe')).toBeNull()
      }
    } finally {
      await act(() => root.unmount()); container.remove(); vi.unstubAllGlobals()
    }
  })

  it('keeps the selected conversation and its opening together during repeated switches and delayed display projection', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    const conversations = ['a', 'b'].map(key => ({
      id: `conversation-${key}`, title: `会话 ${key.toUpperCase()}`,
      runtimeSessionId: `session-${key}`, metadata: { characterId: `synthetic-${key}` },
    }))
    const catalog = { status: 'ready', items: conversations, error: '' }
    const makeDetails = (key, projected) => {
      const conversation = conversations.find(item => item.id === `conversation-${key}`)
      const content = `合成开场 ${key.toUpperCase()}`
      const displayContent = projected
        ? `<!-- eleckoi:rich-replacement:start --><section>合成展示 ${key.toUpperCase()}</section><!-- eleckoi:rich-replacement:end -->`
        : content
      return {
        conversation, metadata: conversation.metadata, runtimeSessionId: conversation.runtimeSessionId,
        messages: [{ id: 'opening', conversationId: conversation.id, runtimeSessionId: conversation.runtimeSessionId,
          role: 'assistant', content, displayContent, status: 'complete', sequence: 0 }],
        hasMore: false, beforeSequence: null,
      }
    }
    let snapshot
    const listeners = new Set()
    const publish = (key, projected) => {
      const details = makeDetails(key, projected)
      snapshot = {
        details: { id: details.conversation.id, status: 'ready', details },
        stream: { id: details.conversation.id, status: 'idle', content: '', process: [] },
      }
      for (const listener of listeners) listener()
    }
    publish('a', true)
    const model = {
      getSnapshot: () => catalog, subscribe: () => () => {},
      getDetailsSnapshot: () => snapshot.details, getChatSnapshot: () => snapshot,
      subscribeChat: listener => { listeners.add(listener); return () => listeners.delete(listener) },
      refresh: async () => catalog.items,
      readModelSelection: async () => ({ provider: '', model: '' }),
      open: async id => {
        publish(id === 'conversation-a' ? 'a' : 'b', false)
        return snapshot.details.details
      },
    }
    const props = { conversations: model, characters: [], modelConfigs: [],
      setStatus: vi.fn(), setActiveSectionState: vi.fn(), notify: vi.fn() }
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    let chat
    function Probe() {
      chat = useChatSessions(props)
      return <div>
        <h1>{chat.currentTitle}</h1>
        {chat.messages.map(item => <p key={item.renderKey || item.id}>{item.displayContent}</p>)}
      </div>
    }
    try {
      await act(async () => root.render(<Probe />))
      expect(container.querySelector('p').textContent).toContain('合成展示 A')
      for (const key of ['b', 'a', 'b', 'a']) {
        await act(async () => chat.loadChat(`conversation-${key}`))
        expect(container.querySelector('h1').textContent).toBe(`会话 ${key.toUpperCase()}`)
        expect(container.querySelector('p').textContent).toBe(`合成开场 ${key.toUpperCase()}`)
        // Display projection arrives after the raw Session/product snapshot.
        await act(async () => publish(key, true))
        expect(container.querySelector('p').textContent).toBe(makeDetails(key, true).messages[0].displayContent)
        expect(chat.messages[0].conversationId).toBe(chat.sessionId)
        expect(chat.messages[0].runtimeSessionId).toBe(chat.runtimeSessionId)
      }
    } finally {
      await act(async () => root.unmount())
      container.remove()
      vi.unstubAllGlobals()
    }
  })
})
