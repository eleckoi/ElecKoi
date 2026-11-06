import { BrowserWindow, type BrowserWindowConstructorOptions } from 'electron'
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes'
import { DesktopError } from '@shared/foundation/DesktopError'
import { DesktopUpdateOverlays } from '@main/platform/electron/dsh/update-overlay'

export interface WindowBlueprint {
  singleton: boolean
  closesHostOnClose?: boolean
  instanceKey?(payload?: unknown): string
  options(payload?: unknown): BrowserWindowConstructorOptions
  load(window: BrowserWindow, payload?: unknown): void | Promise<void>
  afterCreate?(window: BrowserWindow): void
}

export class ElectronWindowHost {
  readonly updateOverlays = new DesktopUpdateOverlays()
  constructor(private readonly restartHostOperation?: () => Promise<void>, private readonly stopTransfersOperation?: () => Promise<void>) {}

  async stopFileTransfers(): Promise<void> { await this.stopTransfersOperation?.() }

  async restartHost(): Promise<void> {
    if (!this.restartHostOperation) throw new DesktopError(ELECKOI_FAILURE_CODES.lifecycleNotReady, 'Host 恢复服务尚未就绪。', { what: 'Host 恢复服务' })
    await this.restartHostOperation()
  }
  private readonly blueprints = new Map<string, WindowBlueprint>()
  private readonly liveWindows = new Map<string, Set<BrowserWindow>>()
  private readonly keyedWindows = new Map<string, BrowserWindow>()
  private closing = false

  define(type: string, blueprint: WindowBlueprint): void {
    if (this.blueprints.has(type)) {
      throw new DesktopError(ELECKOI_FAILURE_CODES.lookupDuplicate, `窗口类型已经注册：${type}`, { what: '窗口类型' })
    }
    this.blueprints.set(type, blueprint)
  }

  async open(type: string, payload?: unknown): Promise<BrowserWindow> {
    const blueprint = this.blueprints.get(type)
    if (blueprint === undefined) {
      throw new DesktopError(ELECKOI_FAILURE_CODES.lookupNotFound, `窗口类型尚未注册：${type}`, { what: '窗口类型' })
    }
    const instanceKey = blueprint.instanceKey?.(payload)?.trim()
    const scopedKey = instanceKey ? `${type}:${instanceKey}` : ''
    const existing = blueprint.singleton
      ? [...(this.liveWindows.get(type) ?? [])].find((window) => !window.isDestroyed())
      : scopedKey ? this.keyedWindows.get(scopedKey) : undefined
    if (existing !== undefined && !existing.isDestroyed()) {
      if (existing.isMinimized()) existing.restore()
      existing.show()
      existing.focus()
      return existing
    }
    if (scopedKey) this.keyedWindows.delete(scopedKey)

    const window = new BrowserWindow(blueprint.options(payload))
    const bucket = this.liveWindows.get(type) ?? new Set<BrowserWindow>()
    bucket.add(window)
    this.liveWindows.set(type, bucket)
    if (scopedKey) this.keyedWindows.set(scopedKey, window)
    window.once('closed', () => {
      bucket.delete(window)
      if (scopedKey && this.keyedWindows.get(scopedKey) === window) this.keyedWindows.delete(scopedKey)
      if (blueprint.closesHostOnClose) this.close()
    })
    try {
      blueprint.afterCreate?.(window)
      await blueprint.load(window, payload)
    } catch (error) {
      if (!window.isDestroyed()) window.destroy()
      throw error
    }
    return window
  }

  all(): BrowserWindow[] {
    return [...this.liveWindows.values()]
      .flatMap((bucket) => [...bucket])
      .filter((window) => !window.isDestroyed())
  }

  close(): void {
    if (this.closing) return
    this.closing = true
    try {
      for (const window of this.all()) window.destroy()
      this.liveWindows.clear()
      this.keyedWindows.clear()
      this.blueprints.clear()
    } finally {
      this.closing = false
    }
  }
}
