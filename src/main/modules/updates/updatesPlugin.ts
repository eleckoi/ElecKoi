import { app } from 'electron'
import electronUpdater from 'electron-updater'
import type { Context, Plugin } from '@deepseek-ai/cordis'
import { UpdateService } from './UpdateService'

export const updatesPlugin = {
  name: 'eleckoi-updates',
  inject: ['appLog', 'desktopGateway', 'agentSessions', 'electronWindows'],
  provide: 'updates',
  apply(ctx: Context) {
    const updater = electronUpdater.autoUpdater
    updater.logger = {
      info: (message?: unknown) => ctx.appLog.info({ message }, 'electron-updater'),
      warn: (message?: unknown) => ctx.appLog.warn({ message }, 'electron-updater'),
      error: (message?: unknown) => ctx.appLog.error({ message }, 'electron-updater'),
      debug: (message: string) => ctx.appLog.debug({ message }, 'electron-updater')
    }

    const enabled = app.isPackaged && process.platform === 'win32'
    const updates = new UpdateService({
      updater,
      currentVersion: app.getVersion(),
      enabled,
      disabledMessage: app.isPackaged ? '当前平台暂不支持自动更新。' : '开发模式不检查更新。',
      canInstall: () => !ctx.agentSessions.hasActiveRun(),
      publish: (status) => ctx.desktopGateway.broadcast('updates.state.changed', status),
      logger: ctx.appLog
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
    }
  }
} satisfies Plugin.Object
