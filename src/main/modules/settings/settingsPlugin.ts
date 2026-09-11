import type { Context, Plugin } from '@deepseek-ai/cordis'
import { settingSchemas, type SettingKey } from '@shared/contracts/settings/schemas'
import { UserSettingsStore } from './UserSettingsStore'

export const settingsPlugin = {
  name: 'eleckoi-settings',
  inject: ['database', 'desktopGateway', 'mediaAssets'],
  provide: 'userSettings',
  apply(ctx: Context) {
    const settings = new UserSettingsStore(ctx.database, ctx.mediaAssets)
    ctx.provide('userSettings', settings)

    return [
      ctx.desktopGateway.register('query.settings.read', ({ key }) => settings.read(key)),
      ctx.desktopGateway.register('command.settings.write', ({ key, value }) => {
        const parsed = settingSchemas[key as SettingKey].parse(value)
        const saved = settings.write(key, parsed)
        ctx.desktopGateway.broadcast('settings.changed', { key, value: saved })
        return saved
      })
    ]
  }
} satisfies Plugin.Object
