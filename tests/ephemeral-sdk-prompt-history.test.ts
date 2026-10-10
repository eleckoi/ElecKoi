import { describe, expect, it } from 'vitest'
import { EphemeralPromptHistory } from '../packages/dsh-product-api/lib/types/ephemeral-prompt-history.js'

describe('ephemeral SDK prompt history', () => {
  it('shares repeated history bodies across 100 rounds with seven requests each and releases them', () => {
    const store = new EphemeralPromptHistory()
    const messages: { role: string; content: string }[] = []
    for (let round = 0; round < 100; round++) {
      messages.push({ role: 'user', content: `synthetic-${round}-` + 'x'.repeat(2000) })
      for (let step = 0; step < 7; step++) {
        const request = { messages: structuredClone(messages), model: 'synthetic' }
        store.save('chat', { mesId: round, step, request, rawPrompt: JSON.stringify(request) })
      }
    }
    const rows = store.read('chat') as any[]
    expect(rows).toHaveLength(100)
    expect(rows[99].requests).toHaveLength(7)
    expect(rows[0].request.messages[0]).toBe(rows[99].request.messages[0])
    expect(rows[99].requests[0].request.messages).toBe(rows[99].requests[6].request.messages)
    expect(store.retainedValueCount('chat')).toBeLessThan(1500)
    expect(rows[99].rawPrompt).toBe(JSON.stringify(rows[99].request))
    expect(Object.isFrozen(rows[99].request.messages[0])).toBe(true)
    store.forget('chat')
    expect(store.read('chat')).toEqual([])
    expect(store.retainedValueCount('chat')).toBe(0)
    store.save('other', { mesId: 'id', request: {} })
    store.close()
    expect(store.read('other')).toEqual([])
  }, 30_000)

  it('captures immutable values and rejects missing message identity', () => {
    const store = new EphemeralPromptHistory(), entry = { mesId: 'message', request: { messages: [{ content: 'original' }] } }
    store.save('chat', entry)
    entry.request.messages[0]!.content = 'edited'
    expect((store.read('chat')[0] as any).request.messages[0].content).toBe('original')
    expect(() => store.save('chat', { request: {} })).toThrow('message identity')
  })
})
