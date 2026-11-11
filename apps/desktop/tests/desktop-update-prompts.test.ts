import { EventEmitter } from 'node:events'
import { afterEach, expect, it, vi } from 'vitest'
import { DesktopUpdatePrompts } from '../src/main/modules/updates/DesktopUpdatePrompts'
import type { UpdateService } from '../src/main/modules/updates/UpdateService'

const fixture = vi.hoisted(() => ({ shown: [] as any[], active: undefined as any, update: vi.fn() }))
vi.mock('electron', () => ({ app: { getLocale: () => 'zh', getVersion: () => '0.2.20' } }))
vi.mock('../src/main/platform/electron/dsh/update-window', () => ({ prepareDesktopUpdateWindow: async () => true }))
vi.mock('../src/main/modules/updates/dsh/update-dialog', () => ({ DesktopUpdateDialog: class {
  focus = vi.fn()
  update = (content: unknown) => { fixture.update(content); if (fixture.active) Object.assign(fixture.active.options, content) }
  show(_parent: unknown, options: any) {
    fixture.active?.finish(fixture.active.options.cancelId ?? 0)
    return new Promise(resolve => {
      const row = { options, finish: (response: number) => {
        if (fixture.active === row) fixture.active = undefined
        resolve({ response })
      } }
      fixture.active = row; fixture.shown.push(row)
      options.signal?.addEventListener('abort', () => row.finish(options.cancelId ?? 0), { once: true })
      if (options.signal?.aborted) row.finish(options.cancelId ?? 0)
    })
  }
  dispose() { fixture.active?.finish(fixture.active.options.cancelId ?? 0) }
} }))

let prompts: DesktopUpdatePrompts | undefined
afterEach(() => { prompts?.dispose(); prompts = undefined; fixture.shown.length = 0; fixture.active = undefined; fixture.update.mockClear() })

function setup(phase = 'available') {
  const parent = Object.assign(new EventEmitter(), { visible: true, isVisible() { return this.visible }, isDestroyed: () => false })
  let state: any = { phase, version: '0.2.21' }
  const listeners = new Set<() => void>()
  const progress = { percent: 46, transferredBytes: 46 * 1_048_576, totalBytes: 100 * 1_048_576 }
  const updates = {
    nativeStatus: () => state,
    status: () => ({ ...state, progress, releaseNotes: 'Synthetic release notes' }),
    subscribe: (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener) },
    check: vi.fn(async () => state),
    download: vi.fn(async () => { set({ phase: 'downloading', version: '0.2.21' }) }),
    install: vi.fn(async () => ({ accepted: false })),
  }
  const set = (next: any) => { state = next; for (const listener of listeners) listener() }
  prompts = new DesktopUpdatePrompts('synthetic-preload', () => parent as any, {} as any)
  return { parent, updates, service: updates as unknown as UpdateService, set, progress, listeners }
}

it('automatically offers an available version once and waits for download authorization', async () => {
  const f = setup()
  const pending = prompts!.notify(f.service)
  expect(fixture.active.options.message).toContain('0.2.21')
  expect(fixture.active.options.detail).toContain('Synthetic release notes')
  expect(f.updates.download).not.toHaveBeenCalled()
  fixture.active.finish(1); await pending
  await prompts!.notify(f.service)
  expect(fixture.shown).toHaveLength(1)
})

it('dismisses and reopens the same transfer with live percentage and bytes, without another download', async () => {
  const f = setup('downloading')
  let pending = prompts!.open(f.service, 'zh', false)
  expect(fixture.active.options.message).toContain('46%')
  expect(fixture.active.options.detail).toContain('46.0 MB / 100.0 MB')
  f.progress.percent = 67.9
  f.set({ phase: 'downloading', version: '0.2.21' })
  expect(fixture.active.options.message).toContain('67%')
  fixture.active.finish(0); await pending
  expect(f.listeners.size).toBe(0)
  pending = prompts!.open(f.service, 'zh', false)
  expect(fixture.active.options.message).toContain('67%')
  f.set({ phase: 'ready', version: '0.2.21' }); await pending
  expect(f.updates.install).toHaveBeenCalledOnce()
  expect(f.updates.download).not.toHaveBeenCalled()
  expect(f.updates.check).not.toHaveBeenCalled()
})

it('keeps a user-authorized download running after its progress document is dismissed', async () => {
  const f = setup()
  const download = Promise.withResolvers<any>()
  f.updates.download.mockImplementation(() => { f.set({ phase: 'downloading', version: '0.2.21' }); return download.promise })
  const pending = prompts!.open(f.service, 'zh', false)
  fixture.active.finish(0)
  await vi.waitFor(() => expect(fixture.active.options.message).toContain('46%'))
  fixture.active.finish(0); await pending
  expect(f.updates.download).toHaveBeenCalledOnce()
  expect(f.updates.install).not.toHaveBeenCalled()
  download.resolve({ phase: 'ready' })
})

it('dismisses a pending manual check without keeping the navigation open action locked', async () => {
  const f = setup('idle'), check = Promise.withResolvers<any>()
  f.updates.check.mockReturnValue(check.promise)
  const pending = prompts!.open(f.service, 'zh', true)
  expect(fixture.active.options.message).toContain('检查')
  fixture.active.finish(0); await pending
  const reopened = prompts!.open(f.service, 'zh', true)
  await vi.waitFor(() => expect(fixture.active.options.message).toContain('检查'))
  fixture.active.finish(0); check.resolve({ phase: 'idle' }); await reopened
})

it('retains download failure details and reaches the retry explanation instead of spinning', async () => {
  const f = setup('verifying')
  const pending = prompts!.open(f.service, 'zh', false)
  expect(fixture.active.options.message).toContain('校验')
  f.set({ phase: 'error', version: '0.2.21', failedOperation: 'download', message: 'synthetic socket failed' })
  await vi.waitFor(() => expect(fixture.active.options.technicalDetails).toBe('synthetic socket failed'))
  fixture.active.finish(0); await pending
  expect(f.listeners.size).toBe(0)
  expect(f.updates.install).not.toHaveBeenCalled()
})

it('defers automatic ready presentation until the background owner is shown', async () => {
  const f = setup('ready'); f.parent.visible = false
  const pending = prompts!.notify(f.service)
  expect(f.updates.install).not.toHaveBeenCalled()
  f.parent.visible = true; f.parent.emit('show'); await pending
  expect(f.updates.install).toHaveBeenCalledOnce()
  await prompts!.notify(f.service)
  expect(f.updates.install).toHaveBeenCalledOnce()
  expect(f.parent.listenerCount('show')).toBe(0)
})
