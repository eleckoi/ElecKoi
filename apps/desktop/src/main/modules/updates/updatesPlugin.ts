import { join, win32 } from 'node:path'
import { app, BrowserWindow, ipcMain } from 'electron'
import electronUpdater, { type AppUpdater } from 'electron-updater'
import type { Context, Plugin } from '@deepseek-ai/cordis'
import type { Logger } from 'pino'
import { UpdateService } from './UpdateService'
import { configureGitHubApiUpdates } from './GitHubApiProvider'
import { DESKTOP_SHELL_IPC } from '@shared/contracts/desktopShell'
import { LOG_ACTIONS } from '@shared/contracts/logActions'
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes'
import { DesktopError } from '@shared/foundation/DesktopError'
import { assertTrustedDshClientFrame } from '@main/platform/electron/validateSender'
import { logAction } from '@main/platform/logging/logActions'
import { handleDesktopIpcCall } from '@main/platform/electron/desktopIpcHandler'
import { DesktopUpdatePrompts } from './DesktopUpdatePrompts'
import { DesktopUpdatePreparationError } from '../../platform/electron/dsh/update-error'
import { resolveDesktopLocale, resolveDesktopStartupLocale } from '../../platform/electron/dsh/locale'
import { readDesktopLocaleCache } from '../../platform/electron/dsh/locale-cache'
import { presentDesktopUpdate } from './dsh/update-presentation'

export function attachUpdaterLogger(
  updater: Pick<AppUpdater, 'logger'>,
  appLog: Pick<Logger, 'info' | 'warn' | 'error' | 'debug'>
): () => void {
  updater.logger = {
    info: (message?: unknown) => appLog.info({ message }, 'electron-updater'),
    warn: (message?: unknown) => appLog.warn({ message }, 'electron-updater'),
    error: (message?: unknown) => appLog.error({ message }, 'electron-updater'),
    debug: (message: string) => appLog.debug({ message }, 'electron-updater')
  }
  return () => { updater.logger = null }
}

export function preserveWindowsUpdateInstallDirectory(
  updater: AppUpdater,
  executablePath: string,
  packaged: boolean,
  platform: NodeJS.Platform
): void {
  if (!packaged || platform !== 'win32') return
  ;(updater as AppUpdater & { installDirectory?: string }).installDirectory = win32.dirname(executablePath)
}

export const updatesPlugin = {
  name: 'eleckoi-updates',
  inject: ['appPaths', 'appLog', 'pluginHost', 'electronWindows'],
  provide: 'updates',
  apply(ctx: Context) {
    const updater = electronUpdater.autoUpdater
    const appLog = ctx.appLog
    const pluginHost = ctx.pluginHost
    const windows = ctx.electronWindows
    const prompts = new DesktopUpdatePrompts(join(__dirname, '../preload/preload-update-dialog.cjs'),
      () => windows.all().find(window => window === BrowserWindow.getFocusedWindow()) ?? windows.all()[0], windows.updateOverlays,
      resolveDesktopStartupLocale(readDesktopLocaleCache(ctx.appPaths.userData) ?? null, app.getPreferredSystemLanguages()))
    let hostStopped = false
    const detachUpdaterLogger = attachUpdaterLogger(updater, appLog)

    const enabled = app.isPackaged && process.platform === 'win32'
    preserveWindowsUpdateInstallDirectory(updater, process.execPath, app.isPackaged, process.platform)
    const updates = new UpdateService({
      updater,
      currentVersion: app.getVersion(),
      enabled,
      disabledMessage: app.isPackaged ? '当前平台暂不支持自动更新。' : '开发模式不检查更新。',
      open: (language, manual) => prompts.open(updates, language, manual),
      async prepareInstall() {
        const active = await pluginHost.updateTasks('inspect')
        if (!await prompts.confirmInstall(updates.nativeStatus().version ?? '', active)) return false
        try {
          const stillActive = await pluginHost.updateTasks('lock')
          if (stillActive && !active) throw new DesktopUpdatePreparationError('tasks-changed', resolveDesktopLocale(app.getLocale()).messages.updateTasksChanged)
          await windows.stopFileTransfers()
          hostStopped = true
          await pluginHost.close(true)
          return true
        } catch (error) {
          if (hostStopped) {
            await windows.restartHost()
            hostStopped = false
          } else await pluginHost.updateTasks('unlock')
          throw error
        }
      },
      releaseInstall: async () => {
        if (hostStopped) { await windows.restartHost(); hostStopped = false }
        else await pluginHost.updateTasks('unlock')
      },
      publish: (status) => {
        for (const window of windows.all()) {
          if (!window.isDestroyed()) window.webContents.send(DESKTOP_SHELL_IPC.updatesChanged, status)
        }
        void prompts.notify(updates).catch(error => appLog.warn({ err: error }, '无法显示桌面更新界面'))
      },
      logger: appLog
    })
    // Providers capture their HTTP executor when the feed is configured.
    if (enabled) configureGitHubApiUpdates(updater)
    ctx.provide('updates', updates)

    const assertSender = (event: Electron.IpcMainInvokeEvent): void => assertTrustedDshClientFrame(
      event.sender,
      event.senderFrame?.url ?? '',
      event.senderFrame === event.sender.mainFrame,
      windows.all().map(window => window.webContents)
    )
    handleDesktopIpcCall(DESKTOP_SHELL_IPC.updatesStatus, (event) => {
      assertSender(event)
      return { ...updates.status(), ...presentDesktopUpdate(updates.nativeStatus()) }
    })
    handleDesktopIpcCall(DESKTOP_SHELL_IPC.updatesOpen, (event, language: unknown, manual: unknown) => {
      assertSender(event)
      if (typeof language !== 'string' || language.length > 64 || manual !== undefined && typeof manual !== 'boolean') {
        throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, '更新界面参数无效。', { field: 'language' })
      }
      return updates.open(language, manual === true)
    })
    handleDesktopIpcCall(DESKTOP_SHELL_IPC.updatesCheck, async (event) => {
      assertSender(event)
      // 检查更新是用户按的按钮、失败时最想看日志的动作之一：开始 / 成功 / 失败各一行。
      // `UpdateService.check` 把"检查失败"折进 status（不抛），所以两种失败形态都要记。
      logAction(appLog, LOG_ACTIONS.updateCheck, 'start')
      try {
        const status = await updates.check()
        if (status.phase === 'error') {
          logAction(appLog, LOG_ACTIONS.updateCheck, 'failure', new DesktopError(
            ELECKOI_FAILURE_CODES.netOperationFailed,
            `更新检查失败：${status.message ?? '未知原因'}`,
            { what: '更新检查' }
          ))
        } else {
          logAction(appLog, LOG_ACTIONS.updateCheck, 'success')
        }
        return status
      } catch (error) {
        logAction(appLog, LOG_ACTIONS.updateCheck, 'failure', error)
        throw error
      }
    })
    handleDesktopIpcCall(DESKTOP_SHELL_IPC.updatesDownload, (event) => {
      assertSender(event)
      return updates.download()
    })
    handleDesktopIpcCall(DESKTOP_SHELL_IPC.updatesInstall, (event) => {
      assertSender(event)
      return updates.install()
    })
    updates.start()

    return () => {
      ipcMain.removeHandler(DESKTOP_SHELL_IPC.updatesOpen)
      prompts.dispose()
      ipcMain.removeHandler(DESKTOP_SHELL_IPC.updatesStatus)
      ipcMain.removeHandler(DESKTOP_SHELL_IPC.updatesCheck)
      ipcMain.removeHandler(DESKTOP_SHELL_IPC.updatesDownload)
      ipcMain.removeHandler(DESKTOP_SHELL_IPC.updatesInstall)
      updates.dispose()
      detachUpdaterLogger()
    }
  }
} satisfies Plugin.Object
