import { app } from 'electron'
import electronUpdater, { type AppUpdater } from 'electron-updater'
import type { Context, Plugin } from '@deepseek-ai/cordis'
import type { Logger } from 'pino'
import { UpdateService } from './UpdateService'

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

export const updatesPlugin = {
  name: 'eleckoi-updates',
  inject: ['appLog', 'desktopGateway', 'agentSessions', 'electronWindows'],
  provide: 'updates',
  apply(ctx: Context) {
    const updater = electronUpdater.autoUpdater
    const appLog = ctx.appLog
    const desktopGateway = ctx.desktopGateway
    const agentSessions = ctx.agentSessions
    const detachUpdaterLogger = attachUpdaterLogger(updater, appLog)

    const enabled = app.isPackaged && process.platform === 'win32'
    const updates = new UpdateService({
      updater,
      currentVersion: app.getVersion(),
      enabled,
      disabledMessage: app.isPackaged ? '当前平台暂不支持自动更新。' : '开发模式不检查更新。',
      canInstall: () => !agentSessions.hasActiveRun(),
      publish: (status) => desktopGateway.broadcast('updates.state.changed', status),
      logger: appLog
    })
    ctx.provide('updates', updates)

    const unregister = [
      ctx.desktopGateway.register('query.updates.status', () => updates.status()),
      ctx.desktopGateway.register('command.updates.check', () => updates.check()),
      ctx.desktopGateway.register('command.updates.download', () => updates.download()),
      ctx.desktopGateway.register('command.updates.install', () => updates.install())
    ]
    updates.start()

    return () => {
      for (const remove of unregister) remove()
      updates.dispose()
      detachUpdaterLogger()
    }
  }
} satisfies Plugin.Object
