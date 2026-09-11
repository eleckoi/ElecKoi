import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  createChat: vi.fn(),
  listenAgentProcess: vi.fn(),
  listenChatStreamDelta: vi.fn(),
  sendChatMessage: vi.fn(),
  sendChatMessageStream: vi.fn()
}))
const images = vi.hoisted(() => ({ encodeImageDraft: vi.fn() }))

vi.mock('../src/renderer/src/modules/chat/api/chatApi.js', () => api)
vi.mock('../src/renderer/src/modules/chat/hooks/useChatInputImages.js', () => images)

import { runChatMessageSend } from '../src/renderer/src/modules/chat/hooks/chatMessageSend.js'

beforeEach(() => {
  for (const mock of Object.values(api)) mock.mockReset()
  images.encodeImageDraft.mockReset()
})

describe('chat message send cancellation', () => {
  it('never dispatches a request that was stopped while local preparation was pending', async () => {
    let finishEncoding
    images.encodeImageDraft.mockImplementation(() => new Promise((resolve) => { finishEncoding = resolve }))
    const requestRef = { current: null }
    const setMessages = vi.fn()

    const sending = runChatMessageSend({
      event: { preventDefault: vi.fn() },
      input: '测试停止',
      inputImagesRef: { current: [{ localId: 'image-1', mediaType: 'image/png', bytes: 12, name: 'test.png' }] },
      isSending: false,
      modelConfig: { id: 'model-1', model: 'test-model' },
      modelSupportsImages: true,
      setStatus: vi.fn(),
      requestRef,
      setIsSending: vi.fn(),
      sessionId: 'conversation-1',
      chatCharacter: { character_id: 'character-1' },
      setSessionId: vi.fn(),
      replaceChatMessages: vi.fn(),
      setChatCharacter: vi.fn(),
      normalizeLatestChatCharacter: vi.fn(),
      refreshSessionsOnly: vi.fn(),
      setInput: vi.fn(),
      clearInputImages: vi.fn(),
      modelSelection: { parameters: {} },
      language: 'zh-CN',
      setMessages,
      updatePendingReply: vi.fn(),
      requestScrollToEnd: vi.fn(),
      reconcileChatMessages: vi.fn(),
      commitPendingError: vi.fn()
    })

    await vi.waitFor(() => expect(images.encodeImageDraft).toHaveBeenCalledOnce())
    const stoppedRequest = requestRef.current
    requestRef.current = null
    stoppedRequest.controller.abort()
    finishEncoding({ mediaType: 'image/png', data: 'iVBORw0KGgo=', name: 'test.png' })
    await sending

    expect(api.listenAgentProcess).not.toHaveBeenCalled()
    expect(api.sendChatMessage).not.toHaveBeenCalled()
    expect(api.sendChatMessageStream).not.toHaveBeenCalled()
    expect(setMessages).not.toHaveBeenCalled()
  })
})
