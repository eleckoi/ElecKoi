import { afterEach, describe, expect, it, vi } from 'vitest'
import { installConnection } from '@deepseek-ai/dsh-client-connection/client'

const stops = []
afterEach(() => { for (const stop of stops.splice(0).reverse()) stop(); vi.unstubAllGlobals() })

function fixture(hostname, initiallyOnline = true, transport) {
  const browser = new EventTarget()
  browser.navigator = { onLine: initiallyOnline }
  vi.stubGlobal('window', browser)
  let connection, loseSocket, attempts = 0
  installConnection({ provide: (_key, value) => { connection = value } }, {
    location: { hostname }, interactions: 'answer', transport,
    recovery: { backoffBaseMs: 5, backoffMaxMs: 5 },
  })
  connection.registerGenerationSource((signal, ready) => new Promise(resolve => {
    attempts++
    loseSocket = resolve
    signal.addEventListener('abort', resolve, { once: true })
    ready({ home: '/synthetic-home' })
  }))
  const loop = connection.start({})
  stops.push(() => loop.stop())
  return { connection, get attempts() { return attempts }, lose: () => loseSocket(),
    network(online) { browser.navigator.onLine = online; browser.dispatchEvent(new Event(online ? 'online' : 'offline')) } }
}

describe('local Host connection recovery during browser network changes', () => {
  it.each(['127.0.0.1', '127.10.20.30', 'localhost', '[::1]'])('keeps %s connected and replaces a lost carrier while the browser stays offline', async hostname => {
    const f = fixture(hostname)
    await vi.waitFor(() => expect(f.connection.generation.getSnapshot()?.id).toBe(1))
    f.network(false)
    expect(f.connection.state.getSnapshot()).toBe('connected')
    f.lose()
    await vi.waitFor(() => expect(f.connection.generation.getSnapshot()?.id).toBe(2))
    expect(f.connection.state.getSnapshot()).toBe('connected')
    expect(f.attempts).toBe(2)
  })

  it.each([
    ['127.0.0.1', undefined],
    ['preview.invalid', { ownsHost: true }],
  ])('opens its owned local Host while initially offline (%s)', async (hostname, transport) => {
    const f = fixture(hostname, false, transport)
    await vi.waitFor(() => expect(f.connection.generation.getSnapshot()?.id).toBe(1))
    f.lose()
    await vi.waitFor(() => expect(f.connection.generation.getSnapshot()?.id).toBe(2))
  })

  it('suspends a remote Host while offline and resumes when the network returns', async () => {
    const f = fixture('remote.invalid')
    await vi.waitFor(() => expect(f.connection.generation.getSnapshot()?.id).toBe(1))
    f.network(false)
    expect(f.connection.state.getSnapshot()).toBe('disconnected')
    expect(f.connection.generation.getSnapshot()).toBeUndefined()
    await new Promise(resolve => setTimeout(resolve, 25))
    expect(f.attempts).toBe(1)
    f.network(true)
    await vi.waitFor(() => expect(f.connection.generation.getSnapshot()?.id).toBe(2))
  })

  it('does not open an initially offline remote Host until online', async () => {
    const f = fixture('remote.invalid', false)
    await new Promise(resolve => setTimeout(resolve, 25))
    expect(f.attempts).toBe(0)
    f.network(true)
    await vi.waitFor(() => expect(f.connection.generation.getSnapshot()?.id).toBe(1))
  })
})
