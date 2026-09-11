import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
})

describe('Renderer Agent request tracking', () => {
  it('requests older chat pages through the typed gateway and keeps message sequence metadata', async () => {
    const request = vi.fn(async (name, input) => {
      expect(name).toBe('query.conversations.messages')
      expect(input).toEqual({ conversationId: 'conversation-1', beforeSequence: 50, limit: 40 })
      return {
        messages: [{
          id: 'message-1',
          conversationId: 'conversation-1',
          role: 'user',
          content: '较早消息',
          status: 'complete',
          createdAt: '2026-09-10T00:00:00.000Z',
          sequence: 10,
        }],
        hasMore: true,
        beforeSequence: 10,
      }
    })
    vi.doMock('../src/renderer/src/bridge/desktopClient.ts', () => ({
      desktopClient: { request, on: vi.fn() }
    }))
    const { getChatMessages } = await import('../src/renderer/src/modules/chat/api/chatApi.js')

    await expect(getChatMessages('conversation-1', { beforeSequence: 50, limit: 40 })).resolves.toMatchObject({
      messages: [{ id: 'message-1', sequence: 10, content: '较早消息' }],
      has_more: true,
      before_sequence: 10,
    })
  })

  it('cancels the exact non-streaming Agent request and never falls back to another conversation', async () => {
    const listeners = new Map()
    const request = vi.fn(async (name) => {
      if (name === 'command.agent.start') return { accepted: true, runId: 'run-1' }
      if (name === 'command.agent.cancel') return { cancelled: true }
      throw new Error(`Unexpected request: ${name}`)
    })
    const desktopClient = {
      request,
      on: vi.fn((name, listener) => {
        const bucket = listeners.get(name) || new Set()
        bucket.add(listener)
        listeners.set(name, bucket)
        return () => bucket.delete(listener)
      })
    }
    vi.doMock('../src/renderer/src/bridge/desktopClient.ts', () => ({ desktopClient }))
    const { cancelChatStream, sendChatMessage } = await import('../src/renderer/src/modules/chat/api/chatApi.js')

    const image = { mediaType: 'image/png', data: 'iVBORw0KGgo=', name: 'pixel.png' }
    const reply = sendChatMessage({ session_id: 'conversation-1', message: '你好', images: [image] }, 'request-1')
    await vi.waitFor(() => {
      expect(request).toHaveBeenCalledWith('command.agent.start', {
        conversationId: 'conversation-1',
        text: '你好',
        images: [image]
      })
    })

    await cancelChatStream('unknown-request')
    expect(request).not.toHaveBeenCalledWith('command.agent.cancel', expect.anything())

    await cancelChatStream('request-1')
    expect(request).toHaveBeenCalledWith('command.agent.cancel', {
      conversationId: 'conversation-1'
    })

    for (const listener of listeners.get('agent.run.failed') || []) {
      listener({ conversationId: 'conversation-1', runId: 'run-1', message: 'cancelled for test' })
    }
    await expect(reply).rejects.toThrow('cancelled for test')
  })

  it('does not let a cancelled run settle or untrack the next run in the same conversation', async () => {
    const listeners = new Map()
    let startCount = 0
    const request = vi.fn(async (name) => {
      if (name === 'command.agent.start') {
        startCount += 1
        return { accepted: true, runId: startCount === 1 ? 'run-old' : 'run-new' }
      }
      if (name === 'command.agent.cancel') return { cancelled: true }
      if (name === 'query.conversations.details') return {
        conversation: { id: 'conversation-1', title: '测试', preview: '', createdAt: '', updatedAt: '' },
        metadata: {}, messages: [], hasMore: false, beforeSequence: null
      }
      if (name === 'query.conversations.rich_heights') return []
      throw new Error(`Unexpected request: ${name}`)
    })
    const desktopClient = {
      request,
      on: vi.fn((name, listener) => {
        const bucket = listeners.get(name) || new Set()
        bucket.add(listener)
        listeners.set(name, bucket)
        return () => bucket.delete(listener)
      })
    }
    vi.doMock('../src/renderer/src/bridge/desktopClient.ts', () => ({ desktopClient }))
    const { cancelChatStream, sendChatMessage } = await import('../src/renderer/src/modules/chat/api/chatApi.js')

    const oldReply = sendChatMessage({ session_id: 'conversation-1', message: '旧请求' }, 'request-old')
    await vi.waitFor(() => expect(startCount).toBe(1))
    const newReply = sendChatMessage({ session_id: 'conversation-1', message: '新请求' }, 'request-new')
    await vi.waitFor(() => expect(startCount).toBe(2))

    for (const listener of [...(listeners.get('agent.run.finished') || [])]) {
      listener({ conversationId: 'conversation-1', runId: 'run-old', message: { status: 'cancelled' } })
    }
    await expect(oldReply).resolves.toMatchObject({ cancelled: true })

    await cancelChatStream('request-new')
    expect(request).toHaveBeenCalledWith('command.agent.cancel', { conversationId: 'conversation-1' })

    for (const listener of [...(listeners.get('agent.run.failed') || [])]) {
      listener({ conversationId: 'conversation-1', runId: 'run-new', message: 'new run failed for test' })
    }
    await expect(newReply).rejects.toThrow('new run failed for test')
  })
})
