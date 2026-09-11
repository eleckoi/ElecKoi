import { describe, expect, it, vi } from 'vitest'
import { AUTHOR_API_VERSION } from '@eleckoi/author-sdk'
import { AuthorSdkService } from '../src/main/modules/authorSdk/AuthorSdkService'

function request(method: string, params: Record<string, unknown> = {}) {
  return JSON.stringify({ id: 'request-1', apiVersion: AUTHOR_API_VERSION, method, params })
}

function service() {
  const message = {
    id: 'assistant-1', conversationId: 'chat-1', role: 'assistant' as const, content: 'content',
    variableStateJson: '{"messageValue":7}', status: 'complete' as const, createdAt: 'now'
  }
  const selectOpening = vi.fn()
  const start = vi.fn(() => ({ accepted: true as const, conversationId: 'chat-1', runId: 'run-1', messageId: 'assistant-2' }))
  const value = new AuthorSdkService({
    conversations: {
      get: () => ({ id: 'chat-1', title: 'Chat', preview: '', createdAt: 'now', updatedAt: 'now' }),
      getMetadata: () => ({ characterId: 'card-1', characterName: 'Card', characterAvatar: '', characterPersona: {}, modelSettings: {} }),
      selectOpening
    } as never,
    messages: {
      get: (_conversationId: string, messageId: string) => messageId === 'opening'
        ? { ...message, id: 'opening', openingOptions: [{ id: 'opening-b', title: 'B', content: 'B', initialVariableStateJson: '{}' }], selectedOpeningId: 'opening-b' }
        : message,
      list: () => [message]
    } as never,
    variables: { get: () => ({ characterId: 'card-1' }) } as never,
    agentSessions: { start } as never
  })
  return { value, selectOpening, start }
}

describe('desktop author SDK service', () => {
  it('returns the rendered message snapshot and rejects state mutation', async () => {
    const { value } = service()
    const state = JSON.parse((await value.invoke({ conversationId: 'chat-1', messageId: 'assistant-1', request: request('variables.getState') }, 1)).response)
    const denied = JSON.parse((await value.invoke({ conversationId: 'chat-1', messageId: 'assistant-1', request: request('variables.setState', { state: {} }) }, 1)).response)
    expect(state).toMatchObject({ ok: true, result: { messageValue: 7 } })
    expect(denied).toMatchObject({ ok: false, error: { code: 'PERMISSION_DENIED' } })
  })

  it('maps the permitted opening switch and chat send actions to native services', async () => {
    const { value, selectOpening, start } = service()
    const selected = JSON.parse((await value.invoke({ conversationId: 'chat-1', messageId: 'assistant-1', request: request('openings.select', { id: 'opening-b' }) }, 2)).response)
    const sent = JSON.parse((await value.invoke({ conversationId: 'chat-1', messageId: 'assistant-1', request: request('chat.send', { text: 'hello' }) }, 2)).response)
    expect(selected).toMatchObject({ ok: true, result: { selectedId: 'opening-b' } })
    expect(sent).toMatchObject({ ok: true, result: { runId: 'run-1' } })
    expect(selectOpening).toHaveBeenCalledWith('chat-1', 'opening-b')
    expect(start).toHaveBeenCalledWith('chat-1', 'hello')
  })
})
