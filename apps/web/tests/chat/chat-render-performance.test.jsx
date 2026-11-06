// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MessageBubble, MessageList } from '../helpers/officialMarkdown.jsx'

vi.stubGlobal('React', React)
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)

let resizeCallbacks = []

beforeEach(() => {
  resizeCallbacks = []
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback) { resizeCallbacks.push(callback) }
    observe() {}
    disconnect() {}
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.stubGlobal('React', React)
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  document.body.innerHTML = ''
})

describe('chat rendering performance', () => {
  it('runs the conversation entrance animation only once per mounted conversation', async () => {
    vi.useFakeTimers()
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    const props = {
      conversationId: 'chat-enter', entering: true, scrollElement: null,
      scrollRequest: { revision: 0, behavior: 'auto' },
      onFollowingTailChange: vi.fn(), returnToBottomRef: { current: null },
      layoutMode: 'roleplay', profile: { reply_spacing: 10, turn_spacing: 10 },
      avatarShape: 'portrait', userAvatar: '', assistantAvatar: '',
      userPinImage: '', assistantPinImage: '', userName: '用户', assistantName: '角色',
      showRoleplayTimestamp: false, showRoleplayFloor: false,
      onOpenProcess: vi.fn(), onEditMessage: vi.fn(), onEditOpening: vi.fn(),
      onSelectOpening: vi.fn(), onRegenerate: vi.fn(), deleteMode: false,
      deleteFromMessageId: '', onSelectDeleteFrom: vi.fn(), runtimeSessionId: '',
    }

    try {
      await act(async () => root.render(<MessageList {...props} messages={[
        { id: 'message-1', role: 'assistant', content: '消息', conversationId: 'chat-enter' },
      ]} />))
      const messageFlow = container.querySelector('.message-flow')
      const messageRow = container.querySelector('.message-flow-row')
      expect(messageFlow?.classList.contains('is-conversation-entering')).toBe(true)

      await act(async () => { vi.advanceTimersByTime(220) })

      expect(messageFlow?.classList.contains('is-conversation-entering')).toBe(false)
      expect(container.querySelector('.message-flow-row')).toBe(messageRow)
    } finally {
      await act(async () => root.unmount())
    }
  })

  it('keeps settled DSH message rows mounted while a pending reply changes', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    const renderRoleplaySlot = vi.fn(() => null)
    const renderRoleplayMessage = vi.fn((_owner, fallback) => fallback)
    const settledMessages = [
      {
        id: 'user-1', role: 'user', content: '你好', conversationId: 'chat-1',
        runtimeSessionId: 'session-1', messageIndex: 1,
      },
      {
        id: 'assistant-1', role: 'assistant', content: '你好。', conversationId: 'chat-1',
        runtimeSessionId: 'session-1', dshMessageId: 'dsh-1', messageIndex: 2,
      },
    ]
    const createPending = (content) => ({
      id: 'assistant-pending', role: 'assistant', content, pending: true,
      conversationId: 'chat-1', runtimeSessionId: 'session-1', messageIndex: 3,
    })
    const stableProps = {
      conversationId: 'chat-1', entering: false, scrollElement: null,
      scrollRequest: { revision: 0, behavior: 'auto' },
      onFollowingTailChange: vi.fn(), returnToBottomRef: { current: null },
      layoutMode: 'roleplay', profile: { reply_spacing: 10, turn_spacing: 10 },
      avatarShape: 'portrait', userAvatar: '', assistantAvatar: '',
      userPinImage: '', assistantPinImage: '', userName: '用户', assistantName: '角色',
      showRoleplayTimestamp: false, showRoleplayFloor: false,
      onOpenProcess: vi.fn(), onEditMessage: vi.fn(), onEditOpening: vi.fn(),
      onSelectOpening: vi.fn(), onRegenerate: vi.fn(), deleteMode: false,
      deleteFromMessageId: '', onSelectDeleteFrom: vi.fn(), runtimeSessionId: 'session-1',
      renderRoleplaySlot, renderRoleplayMessage,
    }

    try {
      await act(async () => root.render(
        <MessageList {...stableProps} messages={[...settledMessages, createPending('正')]} />,
      ))
      expect(renderRoleplaySlot).toHaveBeenCalledTimes(3)
      expect(renderRoleplayMessage).toHaveBeenCalledTimes(3)
      const settledRenderCount = renderRoleplayMessage.mock.calls.filter(([owner]) => (
        owner.productMessageId === 'user-1' || owner.productMessageId === 'assistant-1'
      )).length
      expect(settledRenderCount).toBe(2)

      await act(async () => root.render(
        <MessageList {...stableProps} messages={[...settledMessages, createPending('正在回复')]} />,
      ))
      expect(renderRoleplaySlot).toHaveBeenCalledTimes(3)
      expect(renderRoleplayMessage.mock.calls.filter(([owner]) => (
        owner.productMessageId === 'user-1' || owner.productMessageId === 'assistant-1'
      ))).toHaveLength(settledRenderCount)
    } finally {
      await act(async () => root.unmount())
    }
  })

  it('keeps regeneration available when an older reply has an event sequence but no projected turn', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    const onRegenerate = vi.fn()
    const props = {
      conversationId: 'chat-legacy', entering: false, scrollElement: null,
      scrollRequest: { revision: 0, behavior: 'auto' },
      onFollowingTailChange: vi.fn(), returnToBottomRef: { current: null },
      layoutMode: 'agent', profile: { reply_spacing: 10, turn_spacing: 10 },
      avatarShape: 'portrait', userAvatar: '', assistantAvatar: '',
      userPinImage: '', assistantPinImage: '', userName: '用户', assistantName: '角色',
      showRoleplayTimestamp: false, showRoleplayFloor: false,
      onOpenProcess: vi.fn(), onEditMessage: vi.fn(), onEditOpening: vi.fn(),
      onSelectOpening: vi.fn(), onRegenerate, deleteMode: false,
      deleteFromMessageId: '', onSelectDeleteFrom: vi.fn(), runtimeSessionId: 'session-legacy',
    }

    try {
      await act(async () => root.render(<MessageList {...props} messages={[
        {
          id: 'user-legacy', role: 'user', content: '旧输入', sessionEventSeq: 7, dshTurn: null,
          conversationId: 'chat-legacy', runtimeSessionId: 'session-legacy',
        },
        {
          id: 'assistant-legacy', role: 'assistant', content: '旧回复', sessionEventSeq: 11, dshTurn: null,
          conversationId: 'chat-legacy', runtimeSessionId: 'session-legacy',
        },
      ]} />))
      const button = container.querySelector('[aria-label="重新生成"]')
      expect(button).not.toBeNull()
      await act(async () => button.click())
      expect(onRegenerate).toHaveBeenCalledWith({ targetMessageId: 'assistant-legacy' })
    } finally {
      await act(async () => root.unmount())
    }
  })

  it('keeps settled message rows mounted while only the streaming tail changes', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    const render = (tail) => root.render(<MessageBubble
      message={{
        id: 'assistant-stream',
        role: 'assistant',
        pending: true,
        content: `第一段。\n\n第二段。\n\n${tail}`,
      }}
      name="角色"
    />)

    try {
      await act(async () => render('尾部一'))
      const firstParagraph = container.querySelector('.eleckoi-dsh-markdown p')
      expect(firstParagraph?.textContent).toBe('第一段。')

      await act(async () => render('尾部一继续增长'))
      expect(container.querySelector('.eleckoi-dsh-markdown p')).toBe(firstParagraph)
      expect(container.textContent).toContain('尾部一继续增长')
    } finally {
      await act(async () => root.unmount())
    }
  })

  it('does not install a second scroll owner from the message presentation', async () => {
    vi.useFakeTimers()
    const scrollElement = document.createElement('div')
    document.body.append(scrollElement)
    let scrollHeight = 1_000
    Object.defineProperties(scrollElement, {
      clientHeight: { configurable: true, get: () => 200 },
      scrollHeight: { configurable: true, get: () => scrollHeight },
      scrollTop: { configurable: true, writable: true, value: 800 },
    })
    const root = createRoot(scrollElement)
    const onFollowingTailChange = vi.fn()
    const props = {
      conversationId: 'chat-scroll', entering: false, scrollElement,
      scrollRequest: { revision: 0, behavior: 'auto' },
      onFollowingTailChange, returnToBottomRef: { current: null },
      layoutMode: 'roleplay', profile: { reply_spacing: 10, turn_spacing: 10 },
      avatarShape: 'portrait', userAvatar: '', assistantAvatar: '',
      userPinImage: '', assistantPinImage: '', userName: '用户', assistantName: '角色',
      showRoleplayTimestamp: false, showRoleplayFloor: false,
      onOpenProcess: vi.fn(), onEditMessage: vi.fn(), onEditOpening: vi.fn(),
      onSelectOpening: vi.fn(), onRegenerate: vi.fn(), deleteMode: false,
      deleteFromMessageId: '', onSelectDeleteFrom: vi.fn(), runtimeSessionId: '',
    }

    try {
      await act(async () => root.render(<MessageList {...props} messages={[
        { id: 'message-1', role: 'assistant', content: '消息', conversationId: 'chat-scroll' },
      ]} />))
      scrollElement.scrollTop = 520
      scrollElement.dispatchEvent(new Event('scroll'))

      scrollHeight = 1_200
      for (const callback of resizeCallbacks) callback([])
      expect(scrollElement.scrollTop).toBe(520)

      await act(async () => { vi.advanceTimersByTime(500) })
      expect(scrollElement.scrollTop).toBe(520)
      expect(onFollowingTailChange).not.toHaveBeenCalled()
      expect(resizeCallbacks).toHaveLength(0)
    } finally {
      await act(async () => root.unmount())
    }
  })

  it('leaves history compensation to ChatView while presenting prepended messages', async () => {
    vi.useFakeTimers()
    const scrollElement = document.createElement('div')
    document.body.append(scrollElement)
    Object.defineProperties(scrollElement, {
      clientHeight: { configurable: true, get: () => 400 },
      scrollHeight: { configurable: true, get: () => 1_400 },
      scrollTop: { configurable: true, writable: true, value: 1_000 },
    })
    scrollElement.getBoundingClientRect = () => ({ top: 0, bottom: 400, left: 0, right: 800, width: 800, height: 400 })
    const root = createRoot(scrollElement)
    const historyPagingRef = { current: null }
    const positions = new Map([['current-1', 200]])
    const props = {
      conversationId: 'chat-history', entering: false, scrollElement,
      scrollRequest: { revision: 0, behavior: 'auto' },
      onFollowingTailChange: vi.fn(), returnToBottomRef: { current: null }, historyPagingRef,
      layoutMode: 'roleplay', profile: { reply_spacing: 10, turn_spacing: 10 },
      avatarShape: 'portrait', userAvatar: '', assistantAvatar: '',
      userPinImage: '', assistantPinImage: '', userName: '用户', assistantName: '角色',
      showRoleplayTimestamp: false, showRoleplayFloor: false,
      onOpenProcess: vi.fn(), onEditMessage: vi.fn(), onEditOpening: vi.fn(),
      onSelectOpening: vi.fn(), onRegenerate: vi.fn(), deleteMode: false,
      deleteFromMessageId: '', onSelectDeleteFrom: vi.fn(), runtimeSessionId: '',
    }
    const current = { id: 'current-1', role: 'assistant', content: '当前消息', conversationId: 'chat-history' }
    const older = { id: 'older-1', role: 'user', content: '更早消息', conversationId: 'chat-history' }

    try {
      await act(async () => root.render(<MessageList {...props} messages={[current]} />))
      for (const row of scrollElement.querySelectorAll('[data-chat-anchor-key]')) {
        row.getBoundingClientRect = () => {
          const top = (positions.get(row.dataset.chatAnchorKey) ?? 0) - scrollElement.scrollTop
          return { top, bottom: top + 80, left: 0, right: 800, width: 800, height: 80 }
        }
      }
      scrollElement.scrollTop = 120
      scrollElement.dispatchEvent(new Event('scroll'))
      await act(async () => { vi.advanceTimersByTime(500) })
      expect(historyPagingRef.current).toBeNull()

      positions.set('older-1', 200)
      positions.set('current-1', 400)
      await act(async () => root.render(<MessageList {...props} messages={[older, current]} />))
      for (const row of scrollElement.querySelectorAll('[data-chat-anchor-key]')) {
        row.getBoundingClientRect = () => {
          const top = (positions.get(row.dataset.chatAnchorKey) ?? 0) - scrollElement.scrollTop
          return { top, bottom: top + 80, left: 0, right: 800, width: 800, height: 80 }
        }
      }
      for (const callback of resizeCallbacks) callback([])

      expect(scrollElement.scrollTop).toBe(120)
      expect(scrollElement.textContent).toContain('更早消息')
    } finally {
      await act(async () => root.unmount())
    }
  })


})
