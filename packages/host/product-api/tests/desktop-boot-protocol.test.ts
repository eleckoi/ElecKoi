import type { Context } from '@deepseek-ai/cordis'
import { afterEach, expect, it, vi } from 'vitest'
import { apply } from '../lib/types/client/index.js'

afterEach(() => vi.unstubAllGlobals())

function clientContext(status = vi.fn(async () => ({
  ok: true, value: { architecture: 'dsh-remote', protocolVersion: 1 },
}))) {
  const releaseRemote = vi.fn(async () => {})
  const scope = { remote: { eleckoiSystem: { status } } }
  const ctx = {
    remote: { $mount: vi.fn(async () => releaseRemote) },
    inject: (dependencies: string[], verify: (ctx: typeof scope) => Promise<void>) => {
      const release = async () => {}
      return dependencies.includes('remote.eleckoiSystem')
        ? Object.assign(verify(scope), { dispose: release })
        : { dispose: release }
    },
  }
  return { ctx: ctx as unknown as Context, status, releaseRemote }
}

it('mounts the product Remote without repeating the owned Desktop Host handshake', async () => {
  vi.stubGlobal('location', { protocol: 'dsh-app:', hostname: 'app' })
  vi.stubGlobal('dshDesktopBoot', { ready: () => {} })
  vi.stubGlobal('__DSH_TRANSPORT__', { ownsHost: true })
  vi.stubGlobal('__ELECKOI_DESKTOP_PRODUCT_PROTOCOL__', { architecture: 'dsh-remote', protocolVersion: 1 })
  const { ctx, status, releaseRemote } = clientContext()
  const dispose = await apply(ctx)
  expect(ctx.remote.$mount).toHaveBeenCalledOnce()
  expect(status).not.toHaveBeenCalled()
  await dispose()
  expect(releaseRemote).toHaveBeenCalledOnce()
})

it.each(['https:', 'dsh-app:'])('keeps verification when the %s page lacks the verified product protocol', async protocol => {
  vi.stubGlobal('location', { protocol, hostname: 'app' })
  vi.stubGlobal('dshDesktopBoot', { ready: () => {} })
  vi.stubGlobal('__DSH_TRANSPORT__', { ownsHost: true })
  const failure = new Error('Synthetic protocol lookup failed')
  const { ctx, status, releaseRemote } = clientContext(vi.fn(async () => { throw failure }))
  await expect(apply(ctx)).rejects.toBe(failure)
  expect(status).toHaveBeenCalledOnce()
  expect(releaseRemote).toHaveBeenCalledOnce()
})
