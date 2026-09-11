import type { Context, Plugin } from '@deepseek-ai/cordis'
import { CharacterTransferService } from './CharacterTransferService'

export const characterTransferPlugin = {
  name: 'eleckoi-character-transfer',
  inject: ['database', 'desktopGateway', 'characters', 'settingLibraries', 'variables', 'regexRules'],
  apply(ctx: Context) {
    const transfers = new CharacterTransferService(
      ctx.database,
      ctx.characters,
      ctx.settingLibraries,
      ctx.variables,
      ctx.regexRules
    )
    return [
      ctx.desktopGateway.register('command.characters.import.prepare', ({ source, files }) => (
        transfers.prepare(files, source)
      )),
      ctx.desktopGateway.register('command.characters.import.commit', ({ token }) => {
        const result = transfers.commit(token)
        for (const module of ['personas', 'settingLibraries', 'variables', 'regexRules'] as const) {
          ctx.desktopGateway.broadcast('records.changed', { module })
        }
        return result
      }),
      ctx.desktopGateway.register('command.characters.import.discard', ({ token }) => {
        transfers.discard(token)
        return { ok: true as const }
      })
    ]
  }
} satisfies Plugin.Object
