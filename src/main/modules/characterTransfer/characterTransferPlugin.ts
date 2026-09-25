import type { Context, Plugin } from '@deepseek-ai/cordis'
import { CharacterTransferService } from './CharacterTransferService'

export const characterTransferPlugin = {
  name: 'eleckoi-character-transfer',
  inject: ['database', 'desktopGateway', 'characters', 'settingLibraries', 'variables', 'regexRules', 'mediaAssets', 'directoryPicker'],
  apply(ctx: Context) {
    const transfers = new CharacterTransferService(
      ctx.database,
      ctx.characters,
      ctx.settingLibraries,
      ctx.variables,
      ctx.regexRules,
      ctx.mediaAssets
    )
    return [
      ctx.desktopGateway.register('command.characters.export', ({ characterId, format }) => (
        transfers.export(characterId, format)
      )),
      // 批量导出：只弹一次目录选择，之后由主进程直接写盘，避免每张卡一次系统保存对话框。
      ctx.desktopGateway.register('command.characters.export.files', async ({ characterIds, format }) => {
        const directory = await ctx.directoryPicker.pickDirectory({
          title: '选择导出位置',
          buttonLabel: '导出到这里'
        })
        if (directory === undefined) {
          return { canceled: true, directory: '', written: [], failures: [] }
        }
        const { written, failures } = transfers.exportMany(characterIds, format, directory)
        return { canceled: false, directory, written, failures }
      }),
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
