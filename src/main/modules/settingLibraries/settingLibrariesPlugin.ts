import type { Context, Plugin } from '@deepseek-ai/cordis'
import { SettingLibraryRepository } from './SettingLibraryRepository'

export const settingLibrariesPlugin = {
  name: 'eleckoi-setting-libraries',
  inject: ['database', 'desktopGateway'],
  provide: 'settingLibraries',
  apply(ctx: Context) {
    const settingLibraries = new SettingLibraryRepository(ctx.database)
    ctx.provide('settingLibraries', settingLibraries)
    return [
      ctx.desktopGateway.register('query.setting_library.read', ({ characterId }) => settingLibraries.get(characterId)),
      ctx.desktopGateway.register('command.setting_library.save', ({ characterId, library }) => {
        const saved = settingLibraries.save(characterId, library)
        ctx.desktopGateway.broadcast('records.changed', { module: 'settingLibraries' })
        return saved
      }),
      ctx.desktopGateway.register('command.setting_library.view_state.save', ({ characterId, expandedGroupIds }) => (
        settingLibraries.saveViewState(characterId, expandedGroupIds)
      ))
    ]
  }
} satisfies Plugin.Object
