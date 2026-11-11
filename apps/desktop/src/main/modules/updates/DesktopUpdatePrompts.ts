import { app, type BrowserWindow } from 'electron'
import { DesktopUpdateDialog } from './dsh/update-dialog'
import { DesktopUpdateOverlays } from '../../platform/electron/dsh/update-overlay'
import { desktopUpdateErrorSummary } from './dsh/update-presentation'
import { desktopUpdateReadyConfirmation, formatDesktopMessage, resolveDesktopLocale, type DesktopLocale } from '../../platform/electron/dsh/locale'
import { prepareDesktopUpdateWindow } from '../../platform/electron/dsh/update-window'
import type { DesktopUpdateState } from '@shared/contracts/desktopNative'
import type { UpdateService } from './UpdateService'

/** Product feed adapter over the official isolated Desktop update documents. */
export class DesktopUpdatePrompts {
  private locale: DesktopLocale
  private readonly dialogs: DesktopUpdateDialog
  private operation: Promise<void> | undefined
  private readonly announced = new Set<string>()
  private deferredOwner: BrowserWindow | undefined
  private deferredOpen: (() => void) | undefined
  private deferredFinish: (() => void) | undefined
  private disposed = false

  constructor(preload: string, private readonly parent: () => BrowserWindow | undefined, overlays: DesktopUpdateOverlays,
    initialLocale: DesktopLocale = resolveDesktopLocale(app.getLocale())) {
    this.locale = initialLocale
    this.dialogs = new DesktopUpdateDialog(preload, () => this.locale, overlays)
  }

  async confirmInstall(version: string, active: boolean): Promise<boolean> {
    const parent = this.parent(), messages = this.locale.messages
    if (!parent || !await prepareDesktopUpdateWindow(parent, messages.updateFullscreenTimeout)) return false
    const ready = desktopUpdateReadyConfirmation(messages, version, process.platform)
    const result = await this.dialogs.show(parent, {
      type: active ? 'warning' : 'info', title: messages.updateTitle,
      message: active ? messages.updateActiveTasks : ready.message,
      detail: active ? messages.updateActiveTasksDetail : ready.detail,
      buttons: active ? [messages.updateStopTasks, messages.updateLater] : [messages.installAndRestart],
      defaultId: 1, cancelId: 1
    })
    return result.response === 0
  }

  open(updates: UpdateService, language: string, manual: boolean): Promise<void> {
    if (this.disposed) return Promise.resolve()
    this.clearDeferred()
    this.locale = resolveDesktopLocale(language)
    if (this.operation) { this.dialogs.focus(); return this.operation }
    this.operation = this.present(updates, manual).finally(() => { this.operation = undefined })
    return this.operation
  }

  /** Restore automatic offers; downloads still require the displayed download choice. */
  notify(updates: UpdateService): Promise<void> {
    const state = updates.nativeStatus()
    if (this.disposed || !['available', 'ready'].includes(state.phase) || !state.version) return Promise.resolve()
    const key = `${state.phase}:${state.version}`
    if (this.announced.has(key)) return Promise.resolve()
    this.announced.add(key)
    if (this.operation) return Promise.resolve()
    return this.openWhenVisible(updates)
  }

  dispose(): void { this.disposed = true; this.clearDeferred(); this.dialogs.dispose() }

  private clearDeferred(): void {
    if (this.deferredOpen) {
      this.deferredOwner?.off('show', this.deferredOpen)
      this.deferredOwner?.off('closed', this.deferredOpen)
    }
    this.deferredOpen = undefined
    this.deferredOwner = undefined
    this.deferredFinish?.()
    this.deferredFinish = undefined
  }

  private openWhenVisible(updates: UpdateService): Promise<void> {
    const parent = this.parent()
    if (!parent || parent.isDestroyed()) return Promise.resolve()
    if (parent.isVisible()) return this.open(updates, this.locale.id, false)
    this.clearDeferred()
    this.deferredOwner = parent
    return new Promise<void>((resolve, reject) => {
      this.deferredFinish = resolve
      this.deferredOpen = () => {
        this.deferredFinish = undefined
        this.clearDeferred()
        if (parent.isDestroyed() || this.disposed) { resolve(); return }
        this.open(updates, this.locale.id, false).then(resolve, reject)
      }
      parent.once('show', this.deferredOpen)
      parent.once('closed', this.deferredOpen)
    })
  }

  private transferContent(updates: UpdateService) {
    const status = updates.status(), state = updates.nativeStatus(), messages = this.locale.messages
    const message = state.phase === 'verifying' ? messages.updateVerifying
      : state.phase === 'installing' ? messages.updateInstalling
      : formatDesktopMessage(messages.updateDownloading, { percent: String(Math.floor(status.progress?.percent ?? 0)) })
    const bytes = status.progress
    const format = (value: number) => `${(value / 1_048_576).toFixed(1)} MB`
    return { message, detail: [state.version, bytes && `${format(bytes.transferredBytes)} / ${format(bytes.totalBytes)}`].filter(Boolean).join('\n') }
  }

  private async progress(updates: UpdateService): Promise<boolean> {
    const parent = this.parent()
    if (!parent || parent.isDestroyed()) return false
    const controller = new AbortController()
    const stop = updates.subscribe(() => {
      if (!['downloading', 'verifying', 'installing'].includes(updates.nativeStatus().phase)) controller.abort()
      else this.dialogs.update(this.transferContent(updates))
    })
    try {
      await this.dialogs.show(parent, { type: 'info', title: this.locale.messages.updateTitle,
        ...this.transferContent(updates), buttons: [this.locale.messages.later], cancelId: 0, signal: controller.signal })
      return controller.signal.aborted
    } finally { stop(); controller.abort() }
  }

  private async failure(state: DesktopUpdateState): Promise<void> {
    const parent = this.parent()
    if (state.phase !== 'error' || !parent) return
    await this.dialogs.show(parent, {
      type: 'error', title: this.locale.messages.updateFailedTitle,
      message: desktopUpdateErrorSummary(state, this.locale.messages),
      technicalDetails: state.technicalDetails ?? state.message ?? ''
    })
  }

  private async present(updates: UpdateService, manual: boolean): Promise<void> {
    const parent = this.parent()
    if (!parent) return
    const messages = this.locale.messages
    const controller = new AbortController()
    let progress: Promise<unknown> | undefined
    try {
      let state = updates.nativeStatus()
      if (manual && !['downloading', 'verifying', 'ready', 'installing'].includes(state.phase)
        || state.phase === 'idle' || state.phase === 'error' && state.failedOperation === 'check') {
        progress = this.dialogs.show(parent, { type: 'info', title: messages.updateCheckTitle,
          message: messages.updateChecking, buttons: [messages.later], cancelId: 0, signal: controller.signal })
        const completed = await Promise.race([updates.check(true).then(() => true), progress.then(() => false)])
        if (!completed) return
        state = updates.nativeStatus()
      }
      if (state.phase === 'error' && state.failedOperation === 'check') { await this.failure(state); return }
      if (state.phase === 'idle') {
        await this.dialogs.show(parent, { type: 'info', title: messages.updateCheckTitle, message: messages.updateCurrent,
          detail: formatDesktopMessage(messages.updateCurrentDetail, { version: app.getVersion() }) })
        return
      }
      if (state.phase === 'ready' || state.phase === 'error' && state.failedOperation === 'install') {
        await updates.install()
        await this.failure(updates.nativeStatus())
        return
      }
      if (['downloading', 'verifying', 'installing'].includes(state.phase)) {
        if (await this.progress(updates)) {
          if (updates.nativeStatus().phase === 'ready') await updates.install()
          await this.failure(updates.nativeStatus())
        }
        return
      }
      if (state.phase !== 'available' && !(state.phase === 'error' && state.failedOperation === 'download')) return
      {
        const result = await this.dialogs.show(parent, { title: messages.updateCheckTitle,
          message: formatDesktopMessage(messages.updateAvailable, { version: state.version ?? '' }),
          detail: [messages.updateDetail, updates.status().releaseNotes].filter(Boolean).join('\n\n'),
          buttons: [messages.updateDownload], cancelId: 1 })
        if (result.response !== 0) return
      }
      controller.abort()
      // The service owns the transfer; dismissing its view never cancels or duplicates it.
      const download = updates.download()
      await Promise.resolve()
      if (!await this.progress(updates)) return
      await download
      if (updates.nativeStatus().phase === 'ready') {
        // Match the official user-driven download: confirm only on a visible owner.
        if (!parent.isDestroyed() && !parent.isVisible()) { void this.openWhenVisible(updates); return }
        if (!parent.isDestroyed()) await updates.install()
      }
      await this.failure(updates.nativeStatus())
    } finally { controller.abort(); await progress }
  }
}
