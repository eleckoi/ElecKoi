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
    this.locale = resolveDesktopLocale(language)
    if (this.operation) { this.dialogs.focus(); return this.operation }
    this.operation = this.present(updates, manual).finally(() => { this.operation = undefined })
    return this.operation
  }

  dispose(): void { this.dialogs.dispose() }

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
      if (manual || state.phase === 'idle' || state.phase === 'error' && state.failedOperation === 'check') {
        progress = this.dialogs.show(parent, { type: 'info', title: messages.updateCheckTitle,
          message: messages.updateChecking, buttons: [messages.later], cancelId: 0, signal: controller.signal })
        await updates.check(true)
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
      if (state.phase !== 'available' && !(state.phase === 'error' && state.failedOperation === 'download')) return
      if (manual) {
        const result = await this.dialogs.show(parent, { title: messages.updateCheckTitle,
          message: formatDesktopMessage(messages.updateAvailable, { version: state.version ?? '' }),
          detail: messages.updateDetail, buttons: [messages.updateDownload], cancelId: 1 })
        if (result.response !== 0) return
      }
      controller.abort()
      await updates.download()
      if (updates.nativeStatus().phase === 'ready') {
        // Match the official user-driven download: confirm only on a visible owner.
        if (!parent.isDestroyed() && !parent.isVisible()) await new Promise<void>(resolve => {
          const done = (): void => { parent.off('show', done); parent.off('closed', done); resolve() }
          parent.once('show', done); parent.once('closed', done)
        })
        if (!parent.isDestroyed()) await updates.install()
      }
      await this.failure(updates.nativeStatus())
    } finally { controller.abort(); await progress }
  }
}
