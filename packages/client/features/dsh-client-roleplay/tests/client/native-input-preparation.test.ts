import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const client = readFileSync(require.resolve('@deepseek-ai/dsh-client-ui-conversation/client'), 'utf8')
const start = client.indexOf('async sink(')
const end = client.indexOf('async steerQueue(', start)
if (start < 0 || end < 0) throw new Error('Locked native input sink changed')
const nativeSink = new Function(`return class { ${client.slice(start, end)} }`)()

describe('native input preparation ownership', () => {
  function fixture(product?: { prepareNativeInput: ReturnType<typeof vi.fn> }) {
    const input = new nativeSink()
    const sendSession = vi.fn(async () => ({ kind: 'success' }))
    input.rootCtx = { get: () => product }
    input.conversation = () => ({ sendSession })
    const session = { sessionId: 'synthetic-session', prompt: vi.fn(async () => ({ ok: true })) }
    const signal = new AbortController().signal
    return { sendSession, session, signal, send: (text = 'Synthetic draft') => input.sink(session, text, [], 'queue', signal, () => {}) }
  }

  it('keeps ordinary native sending available without the product catalog', async () => {
    const { send, sendSession, session, signal } = fixture()
    await expect(send()).resolves.toEqual({ kind: 'success' })
    expect(sendSession).toHaveBeenCalledWith(session, 'Synthetic draft', [], 'queue', signal, expect.any(Function))
  })

  it('delegates after a successful product preparation and preserves its rejection', async () => {
    const prepareNativeInput = vi.fn(async () => ({ kind: 'success' }))
    const { send, sendSession, session, signal } = fixture({ prepareNativeInput })
    await expect(send()).resolves.toEqual({ kind: 'success' })
    expect(prepareNativeInput).toHaveBeenCalledWith({ sessionId: session.sessionId, text: 'Synthetic draft', signal })
    prepareNativeInput.mockResolvedValueOnce({ kind: 'error', text: 'Synthetic preparation failed' } as any)
    await expect(send()).resolves.toEqual({ kind: 'error', text: 'Synthetic preparation failed' })
    expect(sendSession).toHaveBeenCalledTimes(1)
  })

  it('retains the native empty-prompt continuation path', async () => {
    const prepareNativeInput = vi.fn()
    const { send, sendSession, session } = fixture({ prepareNativeInput })
    await expect(send('')).resolves.toEqual({ kind: 'success' })
    expect(session.prompt).toHaveBeenCalledOnce()
    expect(prepareNativeInput).not.toHaveBeenCalled()
    expect(sendSession).not.toHaveBeenCalled()
  })
})
