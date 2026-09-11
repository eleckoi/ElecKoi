import { describe, expect, it } from 'vitest'
import { DesktopGateway } from '../src/main/gateway/DesktopGateway'

const context = { senderId: 1, windowId: 1 }

describe('Desktop Gateway（桌面网关）', () => {
  it('rejects routes that are absent from the contract or registry', async () => {
    const gateway = new DesktopGateway()
    await expect(gateway.dispatch({ name: 'unknown.route', input: {} }, context))
      .rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('validates request input before invoking a registered handler', async () => {
    const gateway = new DesktopGateway()
    gateway.register('command.window.control', () => ({ ok: true as const }))

    await expect(gateway.dispatch({
      name: 'command.window.control',
      input: { action: 'explode' }
    }, context)).rejects.toThrow()
  })

  it('validates handler output against the shared contract', async () => {
    const gateway = new DesktopGateway()
    gateway.register('command.window.control', () => ({ ok: true as const }))
    const handlers = gateway as unknown as {
      handlers: Map<string, () => unknown>
    }
    handlers.handlers.set('command.window.control', () => ({ ok: 'yes' }))

    await expect(gateway.dispatch({
      name: 'command.window.control',
      input: { action: 'close' }
    }, context)).rejects.toThrow()
  })

  it('unregisters only the route owned by its disposer', async () => {
    const gateway = new DesktopGateway()
    const unregister = gateway.register('command.window.control', () => ({ ok: true as const }))
    await expect(gateway.dispatch({
      name: 'command.window.control',
      input: { action: 'close' }
    }, context)).resolves.toEqual({ ok: true })

    unregister()
    await expect(gateway.dispatch({
      name: 'command.window.control',
      input: { action: 'close' }
    }, context)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})
