// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { useChatSessions } from '../../src/modules/chat/hooks/useChatSessions.js'
import { useConversationMessages } from '../../src/modules/chat/hooks/useConversationMessages.js'
import { MessageBubble } from '../helpers/officialMarkdown.jsx'

describe('DSH chat live rendering', () => {
  it.each(['delete-pair/send', 'delete-ai/regenerate'])('keeps history, input and completed reply visible after deletion (%s)', async scenario => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    const id = 'chat-delete-cycle'
    const runtimeSessionId = 'session-delete-cycle'
    const conversation = { id, title: '合成角色', metadata: { characterId: 'synthetic-character' } }
    const message = (id, role, content, seq, requestId = '') => ({ id, role, content,
      conversationId: conversation.id, runtimeSessionId, sessionEventSeq: seq, sequence: seq, status: 'complete', requestId,
      dshTurn: role === 'user' ? seq + 3 : seq,
      ...(role === 'assistant' ? { renderKey: `dsh-reply-${runtimeSessionId}-${seq}` } : {}) })
    const prefix = [message('prefix-input', 'user', '相同输入', 2, 'prefix'),
      message('prefix-reply', 'assistant', '保留正文', 5)]
    const deletedUser = message('deleted-input', 'user', '相同输入', 9, 'deleted')
    const deletedReply = message('deleted-reply', 'assistant', '被删除正文', 12)
    const makeDetails = messages => ({ conversation, metadata: conversation.metadata,
      runtimeSessionId, messages, hasMore: false, beforeSequence: 2 })
    let snapshot = { details: { id, status: 'ready', details: makeDetails([...prefix, deletedUser, deletedReply]) },
      stream: { id, status: 'idle', process: [], content: '' } }
    const listeners = new Set()
    const publish = (messages, stream = snapshot.stream) => {
      snapshot = { details: { id, status: 'ready', details: makeDetails(messages) }, stream }
      for (const listener of listeners) listener()
    }
    let finish, request
    const pair = scenario.startsWith('delete-pair')
    const start = vi.fn(input => {
      request = input
      if (!pair) publish([...prefix, snapshot.details.details.messages.find(item => item.role === 'user' && item.sequence === 9)],
        { id, status: 'idle', content: '', process: [] })
      return new Promise(resolve => { finish = resolve })
    })
    const model = {
      getSnapshot: () => catalog, subscribe: () => () => {},
      getDetailsSnapshot: () => snapshot.details,
      getChatSnapshot: () => snapshot,
      subscribeChat: listener => { listeners.add(listener); return () => listeners.delete(listener) },
      readModelSelection: async () => ({ provider: 'test-provider', model: 'test-model' }),
      refresh: async () => catalog.items, open: async () => snapshot.details.details,
      send: start, regenerate: start, invalidateDetails: vi.fn(),
      deleteMessagesFrom: vi.fn(async (_chatId, seq, role) => {
        expect(seq).toBe(pair ? 9 : 12)
        expect(role).toBe(pair ? 'user' : 'assistant')
        // Idle Session state can retain the retired node. It must never
        // synthesize an assistant row after the transcript replacement.
        publish(pair ? prefix : [...prefix, deletedUser], { id, status: 'idle', runId: runtimeSessionId,
          messageId: deletedReply.id, renderKey: deletedReply.renderKey, content: deletedReply.content, process: [] })
        return { details: snapshot.details.details, deletedMessageCount: pair ? 2 : 1 }
      }),
    }
    const catalog = { status: 'ready', items: [conversation], error: '' }
    const props = { conversations: model, characters: [],
      modelConfigs: [{ id: 'test-provider', model: 'test-model' }],
      setStatus: vi.fn(), setActiveSectionState: vi.fn(), notify: vi.fn() }
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    let chat
    function Probe() {
      chat = useChatSessions(props)
      return React.createElement('div', null, chat.messages.map(item =>
        React.createElement('p', { key: item.renderKey || item.id, 'data-role': item.role }, item.content)))
    }
    const contents = () => [...container.querySelectorAll('p')].map(node => node.textContent)
    try {
      await act(async () => root.render(React.createElement(Probe)))
      await act(async () => { expect(await chat.deleteMessagesFrom(pair ? deletedUser.id : deletedReply.id)).toBe(true) })
      expect(contents()).toEqual(pair ? ['相同输入', '保留正文'] : ['相同输入', '保留正文', '相同输入'])
      const afterDelete = snapshot.details.details.messages
      await act(async () => publish(afterDelete, { ...snapshot.stream, status: 'running' }))
      expect(contents()).toEqual(afterDelete.map(item => item.content))
      await act(async () => publish(afterDelete, { ...snapshot.stream, status: 'idle' }))
      for (let round = 0; round < 2; round++) {
        let running
        const before = pair ? snapshot.details.details.messages : prefix
        if (pair) await act(async () => chat.setInput('相同输入'))
        await act(async () => {
          running = pair ? chat.sendMessage({ preventDefault() {} })
            : chat.regenerateReply({ targetMessageId: chat.messages.at(-1).id })
        })
        expect(request.requestId).toBeTruthy()
        const expectedInput = [...before.map(item => item.content), '相同输入']
        expect(contents()).toEqual(expectedInput)
        await act(async () => publish(pair ? before : [...before, deletedUser], { id, status: 'idle', content: '', process: [] }))
        expect(contents()).toEqual(expectedInput)
        const user = pair ? message(`input-${round}`, 'user', '相同输入', 15 + round * 10, request.requestId) : deletedUser
        const reply = message(`reply-${round}`, 'assistant', '新正文', user.sequence + 3)
        const live = { id, status: 'running', runId: runtimeSessionId, messageId: `live-${round}`,
          renderKey: reply.renderKey, content: '新正文', process: [] }
        await act(async () => publish([...before, user], { ...live, content: '', messageId: '' }))
        expect(contents()).toEqual(expectedInput)
        await act(async () => publish([...before, user, { ...reply, id: live.messageId, status: 'streaming' }], live))
        expect(contents()).toEqual([...expectedInput, '新正文'])
        await act(async () => {
          publish([...before, user, reply], { ...live, status: 'idle' })
          finish({ details: snapshot.details.details, cancelled: false })
          await running
        })
        expect(contents()).toEqual([...expectedInput, '新正文'])
        expect(chat.isSending).toBe(false)
        expect(chat.sessionId).toBe(id)
        expect(chat.runtimeSessionId).toBe(runtimeSessionId)
      }
    } finally {
      await act(async () => root.unmount())
      container.remove()
      vi.unstubAllGlobals()
    }
  })

  it('replaces metadata rows and revoked replies with the complete DSH transcript, including older pages', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    let chat
    const message = (id, role, content, sequence, messageIndex) => ({ id, role, content, sequence, messageIndex })
    function Probe() {
      chat = useConversationMessages()
      return React.createElement('div', null, chat.messages.map(item =>
        React.createElement('p', { key: item.id }, `${item.messageIndex}:${item.content || ''}`)))
    }
    try {
      await act(async () => root.render(React.createElement(Probe)))
      await act(async () => chat.setMessagesWithScroll([
        message('index-0', 'user', '', 0, 0), message('index-2', 'user', '', 2, 2),
        message('index-4', 'user', '', 4, 4),
      ]))
      const user = message('user', 'user', '测试输入', 8, 0)
      const reply = message('reply', 'assistant', '测试回复', 14, 1)
      await act(async () => chat.reconcileMessages([user, reply]))
      expect(container.textContent).toBe('0:测试输入1:测试回复')
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await act(async () => chat.reconcileMessages([user]))
        expect(chat.messages.map(item => item.id)).toEqual(['user'])
        await act(async () => chat.reconcileMessages([
          user, message(`reply-${attempt}`, 'assistant', '重新生成', 20 + attempt, 1),
        ]))
        expect(chat.messages).toHaveLength(2)
        expect(chat.messages.map(item => item.messageIndex)).toEqual([0, 1])
      }
      await act(async () => chat.reconcileMessages([
        message('earlier', 'user', '更早输入', 0, 0),
        { ...user, messageIndex: 1 }, { ...reply, messageIndex: 2 },
      ], { hasMore: false, beforeSequence: 0 }))
      expect(container.textContent).toBe('0:更早输入1:测试输入2:测试回复')
      expect(chat.historyPage).toEqual({ hasMore: false, beforeSequence: 0 })
      await act(async () => chat.reconcileMessages([]))
      expect(chat.messages).toEqual([])
      expect(container.textContent).toBe('')
    } finally {
      await act(async () => root.unmount())
      container.remove()
      vi.unstubAllGlobals()
    }
  })

  it('shows official user and partial assistant messages during send and regeneration without duplicate replies', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    vi.stubGlobal('React', React)
    const id = 'chat-1'
    const conversation = { id, title: '测试角色', metadata: { characterId: 'character-1' } }
    const makeDetails = (messages) => ({ conversation, metadata: conversation.metadata,
      runtimeSessionId: 'session-1', messages, hasMore: false, beforeSequence: null })
    const makeMessage = (messageId, role, content, seq, options = {}) => ({ id: messageId, role, content,
      conversationId: id, runtimeSessionId: 'session-1', sessionEventSeq: seq, sequence: seq,
      status: options.status || 'complete',
      ...(options.process ? { process: options.process } : {}), createdAt: '',
      ...(role === 'user' ? { dshTurn: 1, requestId: model.send.mock.calls.at(-1)?.[0].requestId } : {}),
      ...(role === 'assistant' ? { dshTurn: executionTurn, renderKey: `dsh-reply-session-1-${executionTurn}`,
        inputEventSeq: 1 } : {}) })
    let catalog = { status: 'ready', items: [conversation], error: '' }
    let details = { id, status: 'ready', details: makeDetails([]), error: '' }
    let stream = { id, status: 'idle', content: '', process: [] }
    let chatSnapshot = { details, stream }
    const chatListeners = new Set()
    const publishChat = () => { chatSnapshot = { details, stream }; for (const listener of chatListeners) listener() }
    const catalogListeners = new Set()
    const detailsListeners = new Set()
    const streamListeners = new Set()
    const subscribe = (listeners) => (listener) => { listeners.add(listener); return () => listeners.delete(listener) }
    const emitDetails = (messages) => {
      details = { ...details, details: makeDetails(messages) }
      for (const listener of detailsListeners) listener()
      publishChat()
    }
    const emitStream = (content, status = 'running', process = []) => {
      stream = { id, status, content, process, runId: 'session-1', messageId: 'live-1',
        renderKey: `dsh-reply-session-1-${executionTurn}` }
      for (const listener of streamListeners) listener()
      publishChat()
      if (status === 'running' && (content || process.length)) {
        const previous = details.details.messages.filter(message =>
          !(message.role === 'assistant' && message.status === 'streaming'))
        emitDetails([...previous, makeMessage('live-1', 'assistant', content, 4,
          { status: 'streaming', process })])
      }
    }
    let executionTurn = 1
    let finishSend
    let finishRegenerate
    const model = {
      getSnapshot: () => catalog, subscribe: subscribe(catalogListeners),
      getChatSnapshot: () => chatSnapshot, subscribeChat: subscribe(chatListeners),
      getDetailsSnapshot: () => details, subscribeDetails: subscribe(detailsListeners),
      getStreamSnapshot: () => stream, subscribeStream: subscribe(streamListeners),
      readModelSelection: async () => ({ provider: 'test-provider', model: 'test-model' }),
      refresh: async () => catalog.items,
      send: vi.fn(() => new Promise(resolve => { finishSend = resolve })),
      regenerate: vi.fn(() => new Promise(resolve => { executionTurn = 2; finishRegenerate = resolve })),
      invalidateDetails: vi.fn(),
      open: async () => details.details,
    }
    const props = { conversations: model, characters: [], modelConfigs: [{ id: 'test-provider', model: 'test-model' }],
      setStatus: vi.fn(), setActiveSectionState: vi.fn(), notify: vi.fn() }
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    const openProcess = vi.fn()
    let chat
    function Probe() {
      chat = useChatSessions(props)
      return React.createElement('div', null, chat.messages.map(message =>
        React.createElement('div', { key: message.renderKey || message.id, 'data-role': message.role },
          React.createElement(MessageBubble, { message, onOpenProcess: openProcess }))))
    }
    try {
      await act(async () => root.render(React.createElement(Probe)))
      await act(async () => chat.setInput('读取文件'))
      let sending
      await act(async () => { sending = chat.sendMessage({ preventDefault() {} }) })
      expect(model.send).toHaveBeenCalledOnce()
      expect([...container.querySelectorAll('p')].map(node => node.textContent)).toEqual(['读取文件'])
      expect(container.querySelectorAll('[data-role="assistant"]')).toHaveLength(0)
      const reasoning = { id: 'reasoning-1', kind: 'reasoning', status: 'running', detail: '检查资料' }
      const search = { id: 'search-1', kind: 'tool', status: 'running', toolName: 'web_search', arguments: '{}' }
      await act(async () => emitDetails([makeMessage('user-1', 'user', '读取文件', 1)]))
      await act(async () => emitStream('', 'running', [reasoning]))
      expect(container.querySelectorAll('[data-role="assistant"]')).toHaveLength(1)
      expect(chat.messages.find(message => message.pending)).toMatchObject({ runtimeSessionId: 'session-1' })
      expect(container.querySelector('.agent-process-inline-label').textContent).toBe('正在分析请求 · 检查资料')
      expect(container.querySelector('[data-role="assistant"] .bubble')).toBeNull()
      const liveArticle = container.querySelector('[data-role="assistant"] article')
      const settledUserDuringStream = chat.messages[0]
      await act(async () => emitStream('', 'running', [{ ...reasoning, status: 'complete' }, search]))
      expect(chat.messages[0]).toMatchObject({ id: settledUserDuringStream.id, content: settledUserDuringStream.content })
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 160)) })
      expect(container.querySelector('.agent-process-inline-label').textContent).toBe('正在搜索网页 · web_search')
      expect(container.querySelector('[data-role="assistant"] article')).toBe(liveArticle)
      await act(async () => container.querySelector('.agent-process-inline').click())
      expect(openProcess).toHaveBeenCalledWith(expect.objectContaining({ pending: true, process: [
        expect.objectContaining({ id: 'reasoning-1' }), expect.objectContaining({ id: 'search-1' })
      ] }))
      await act(async () => {
        emitStream('正在读取', 'running', [{ ...reasoning, status: 'complete' }, { ...search, status: 'complete' }])
      })
      expect(chat.messages[0]).toMatchObject({ id: settledUserDuringStream.id, content: settledUserDuringStream.content })
      expect([...container.querySelectorAll('p')].map(node => node.textContent)).toEqual(['读取文件', '正在读取'])
      expect(container.querySelector('.agent-process-inline')).toBeNull()
      expect(container.querySelector('[data-role="assistant"] article')).toBe(liveArticle)
      await act(async () => {
        emitDetails([makeMessage('user-1', 'user', '读取文件', 1), makeMessage('assistant-1', 'assistant', '读取完成', 4)])
      })
      // The transcript is authoritative even if the control state is delayed.
      // A stale stream must not overwrite the settled body.
      expect([...container.querySelectorAll('p')].map(node => node.textContent)).toEqual(['读取文件', '读取完成'])
      expect(container.querySelector('[data-role="assistant"] article')).toBe(liveArticle)
      await act(async () => {
        finishSend({ details: details.details, cancelled: false })
        await sending
      })
      await act(async () => emitStream('', 'idle'))
      expect(container.querySelectorAll('[data-role="assistant"]')).toHaveLength(1)
      expect(container.querySelector('[data-role="assistant"] article')).toBe(liveArticle)
      expect(chat.isSending).toBe(false)

      let regenerating
      await act(async () => { regenerating = chat.regenerateReply({ targetMessageId: 'assistant-1' }) })
      expect(model.regenerate).toHaveBeenCalledWith(expect.objectContaining({ conversationId: id, eventSeq: 1 }))
      await act(async () => {
        emitDetails([makeMessage('user-1', 'user', '读取文件', 1)])
        emitStream('', 'running', [reasoning])
      })
      expect(container.querySelector('.agent-process-inline-label').textContent).toBe('正在分析请求 · 检查资料')
      await act(async () => emitStream('重新读取中', 'running', [reasoning]))
      expect([...container.querySelectorAll('p')].map(node => node.textContent)).toEqual(['读取文件', '重新读取中'])
      await act(async () => {
        emitDetails([makeMessage('user-1', 'user', '读取文件', 1), makeMessage('assistant-2', 'assistant', '重新读取完成', 4)])
        emitStream('', 'idle')
        finishRegenerate({ details: details.details, cancelled: false })
        await regenerating
      })
      expect(container.querySelectorAll('[data-role="assistant"]')).toHaveLength(1)
      expect([...container.querySelectorAll('p')].map(node => node.textContent)).toEqual(['读取文件', '重新读取完成'])
      expect(chat.sessionId).toBe(id)
      expect(chat.runtimeSessionId).toBe('session-1')
      const failure = 'Synthetic API error (402): {"message":"request refused"}'
      for (const operation of ['send', 'regenerate']) {
        let finishRefresh
        model.open = vi.fn(() => new Promise(resolve => { finishRefresh = resolve }))
        model[operation].mockImplementationOnce(async () => {
          emitStream('', 'error')
          throw new Error(failure)
        })
        props.notify.mockClear()
        let failed
        await act(async () => {
          if (operation === 'send') {
            chat.setInput('再次请求')
          }
        })
        await act(async () => {
          failed = operation === 'send' ? chat.sendMessage({ preventDefault() {} })
            : chat.regenerateReply({ targetMessageId: 'assistant-2' })
        })
        // Error presentation must not depend on the refresh completing.
        expect(chat.isSending).toBe(false)
        expect(props.notify).toHaveBeenCalledExactlyOnceWith('error', failure)
        expect(model.open).toHaveBeenCalled()
        await act(async () => { finishRefresh(details.details); await failed })
        expect(chat.sessionId).toBe(id)
        expect(chat.runtimeSessionId).toBe('session-1')
      }
    } finally {
      await act(async () => root.unmount())
      container.remove()
      vi.unstubAllGlobals()
    }
  })

  it('keeps a second optimistic user message visible while a stopped request is still settling', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    const id = 'chat-stop-send'
    const conversation = { id, title: '测试角色', metadata: { characterId: 'character-1' } }
    const makeMessage = (messageId, role, content, seq) => ({ id: messageId, role, content,
      ...(role === 'user' ? { requestId: requests[messageId === 'user-1' ? 0 : 1]?.input.requestId } : {}),
      conversationId: id, sessionEventSeq: seq, sequence: seq, status: 'complete', createdAt: '' })
    const makeDetails = messages => ({ conversation, metadata: conversation.metadata,
      runtimeSessionId: 'session-stop-send', messages, hasMore: false, beforeSequence: null })
    let details = { id, status: 'ready', details: makeDetails([]), error: '' }
    let stream = { id, status: 'idle', content: '', process: [] }
    let chatSnapshot = { details, stream }
    const chatListeners = new Set()
    const publishChat = () => { chatSnapshot = { details, stream }; for (const listener of chatListeners) listener() }
    const detailsListeners = new Set()
    const streamListeners = new Set()
    const subscribe = listeners => listener => { listeners.add(listener); return () => listeners.delete(listener) }
    const requests = []
    const catalog = { status: 'ready', items: [conversation], error: '' }
    const model = {
      getSnapshot: () => catalog,
      subscribe: () => () => {},
      getChatSnapshot: () => chatSnapshot, subscribeChat: subscribe(chatListeners),
      getDetailsSnapshot: () => details,
      subscribeDetails: subscribe(detailsListeners),
      getStreamSnapshot: () => stream,
      subscribeStream: subscribe(streamListeners),
      readModelSelection: async () => ({ provider: 'test-provider', model: 'test-model' }),
      refresh: async () => [conversation],
      send: vi.fn(input => new Promise(resolve => requests.push({ input, resolve }))),
      cancelRequest: vi.fn(async () => true),
      open: async () => details.details,
    }
    const props = { conversations: model, characters: [], modelConfigs: [{ id: 'test-provider', model: 'test-model' }],
      setStatus: vi.fn(), setActiveSectionState: vi.fn(), notify: vi.fn() }
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    let chat
    function Probe() {
      chat = useChatSessions(props)
      return React.createElement('div', null, chat.messages.map(message =>
        React.createElement('p', { key: message.renderKey || message.id, 'data-role': message.role }, message.content)))
    }
    try {
      await act(async () => root.render(React.createElement(Probe)))
      await act(async () => chat.setInput('第一条'))
      let firstRun
      await act(async () => { firstRun = chat.sendMessage({ preventDefault() {} }); await Promise.resolve() })
      expect(model.send).toHaveBeenCalledOnce()
      await act(async () => {
        details = { ...details, details: makeDetails([makeMessage('user-1', 'user', '第一条', 1)]) }
        for (const listener of detailsListeners) listener()
        publishChat()
      })

      await act(async () => chat.stopSend())
      await act(async () => chat.setInput('第二条'))
      let secondRun
      await act(async () => { secondRun = chat.sendMessage({ preventDefault() {} }); await Promise.resolve() })
      expect(model.send).toHaveBeenCalledTimes(2)
      expect([...container.querySelectorAll('[data-role="user"]')].map(node => node.textContent))
        .toEqual(['第一条', '第二条'])

      await act(async () => {
        requests[0].resolve({ details: makeDetails([makeMessage('user-1', 'user', '第一条', 1)]), cancelled: true })
        await firstRun
      })
      expect([...container.querySelectorAll('[data-role="user"]')].map(node => node.textContent))
        .toEqual(['第一条', '第二条'])

      await act(async () => {
        details = { ...details, details: makeDetails([
          makeMessage('user-1', 'user', '第一条', 1),
          makeMessage('user-2', 'user', '第二条', 5),
        ]) }
        for (const listener of detailsListeners) listener()
        publishChat()
        stream = { id, status: 'running', runId: 'session-stop-send', requestId: 'request-2',
          messageId: 'live-2', renderKey: 'dsh-reply-session-stop-send-2', dshTurn: 2,
          content: '', process: [], sequence: 1, error: '' }
        for (const listener of streamListeners) listener()
        publishChat()
      })
      expect([...container.querySelectorAll('[data-role="user"]')].map(node => node.textContent))
        .toEqual(['第一条', '第二条'])

      await act(async () => {
        const finalDetails = makeDetails([
          makeMessage('user-1', 'user', '第一条', 1),
          makeMessage('user-2', 'user', '第二条', 5),
          makeMessage('assistant-2', 'assistant', '第二条回复', 8),
        ])
        details = { ...details, details: finalDetails }
        stream = { ...stream, status: 'idle', messageId: '', content: '', process: [] }
        for (const listener of streamListeners) listener()
        publishChat()
        requests[1].resolve({ details: finalDetails, cancelled: false })
        await secondRun
      })
      expect([...container.querySelectorAll('p')].map(node => node.textContent))
        .toEqual(['第一条', '第二条', '第二条回复'])
    } finally {
      await act(async () => root.unmount())
      container.remove()
      vi.unstubAllGlobals()
    }
  })
})
