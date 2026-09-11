import { beforeEach, describe, expect, it, vi } from 'vitest'

const electronMocks = vi.hoisted(() => {
  class BrowserWindow {
    static instances: BrowserWindow[] = []

    readonly show = vi.fn()
    readonly focus = vi.fn()
    readonly restore = vi.fn()
    readonly destroy = vi.fn(() => this.closeForTest())
    private destroyed = false
    private minimized = false
    private readonly onceHandlers = new Map<string, () => void>()

    constructor(_options: unknown) {
      BrowserWindow.instances.push(this)
    }

    once(event: string, handler: () => void): void {
      this.onceHandlers.set(event, handler)
    }

    isDestroyed(): boolean {
      return this.destroyed
    }

    isMinimized(): boolean {
      return this.minimized
    }

    closeForTest(): void {
      if (this.destroyed) return
      this.destroyed = true
      this.onceHandlers.get('closed')?.()
    }
  }

  return { BrowserWindow }
})

vi.mock('electron', () => ({ BrowserWindow: electronMocks.BrowserWindow }))

import { ElectronWindowHost } from '../src/main/platform/electron/ElectronWindowHost'

beforeEach(() => {
  electronMocks.BrowserWindow.instances = []
})

describe('ElectronWindowHost keyed child windows', () => {
  it('reuses and focuses a named child window but keeps different names separate', async () => {
    const load = vi.fn()
    const options = vi.fn(() => ({}))
    const windows = new ElectronWindowHost()
    windows.define('child', {
      singleton: false,
      instanceKey: (payload) => String((payload as { frameName?: string })?.frameName || ''),
      options,
      load
    })

    const firstPayload = { frameName: 'character-editor-character-1' }
    const first = await windows.open('child', firstPayload)
    const reused = await windows.open('child', { frameName: 'character-editor-character-1' })
    const other = await windows.open('child', { frameName: 'character-editor-character-2' })

    expect(reused).toBe(first)
    expect(other).not.toBe(first)
    expect(electronMocks.BrowserWindow.instances).toHaveLength(2)
    expect(options).toHaveBeenNthCalledWith(1, firstPayload)
    expect(load).toHaveBeenCalledTimes(2)
    expect(first.show).toHaveBeenCalledOnce()
    expect(first.focus).toHaveBeenCalledOnce()
  })

  it('allows a named child window to be recreated after it closes', async () => {
    const windows = new ElectronWindowHost()
    windows.define('child', {
      singleton: false,
      instanceKey: (payload) => String((payload as { frameName?: string })?.frameName || ''),
      options: () => ({}),
      load: vi.fn()
    })

    const first = await windows.open('child', { frameName: 'character-editor-character-1' })
    ;(first as unknown as InstanceType<typeof electronMocks.BrowserWindow>).closeForTest()
    const reopened = await windows.open('child', { frameName: 'character-editor-character-1' })

    expect(reopened).not.toBe(first)
    expect(electronMocks.BrowserWindow.instances).toHaveLength(2)
  })

  it('destroys every dependent window when the application root closes', async () => {
    const windows = new ElectronWindowHost()
    windows.define('main', {
      singleton: true,
      closesHostOnClose: true,
      options: () => ({}),
      load: vi.fn()
    })
    windows.define('child', {
      singleton: false,
      options: () => ({}),
      load: vi.fn()
    })

    const main = await windows.open('main')
    const firstChild = await windows.open('child')
    const secondChild = await windows.open('child')

    ;(main as unknown as InstanceType<typeof electronMocks.BrowserWindow>).closeForTest()

    expect(firstChild.destroy).toHaveBeenCalledOnce()
    expect(secondChild.destroy).toHaveBeenCalledOnce()
    expect(windows.all()).toEqual([])
  })
})
