import type { Context, Plugin } from '@deepseek-ai/cordis'
import { TavilyClient } from './TavilyClient'
import { WebSearchSettingsRepository } from './WebSearchSettingsRepository'

export const agentToolsPlugin = {
  name: 'eleckoi-agent-tools',
  inject: ['database', 'credentialCipher', 'desktopGateway'],
  provide: 'webSearchSettings',
  apply(ctx: Context) {
    const settings = new WebSearchSettingsRepository(ctx.database, ctx.credentialCipher)
    const tavily = new TavilyClient()
    ctx.provide('webSearchSettings', settings)

    return [
      ctx.desktopGateway.register('query.agent_tools.web_search.settings', () => settings.read()),
      ctx.desktopGateway.register('command.agent_tools.web_search.update', (input) => {
        const saved = settings.update(input)
        ctx.desktopGateway.broadcast('records.changed', { module: 'agentTools' })
        return saved
      }),
      ctx.desktopGateway.register('command.agent_tools.web_search.tavily.save_and_test', async ({ apiKey }) => {
        const connection = await tavily.test(apiKey)
        const saved = settings.saveTavilyApiKey(apiKey)
        ctx.desktopGateway.broadcast('records.changed', { module: 'agentTools' })
        return { settings: saved, connection }
      }),
      ctx.desktopGateway.register('command.agent_tools.web_search.tavily.test', async ({ apiKey }) => ({
        connection: await tavily.test(apiKey?.trim() || settings.tavilyApiKey())
      })),
      ctx.desktopGateway.register('command.agent_tools.web_search.tavily.remove', () => {
        const saved = settings.removeTavilyApiKey()
        ctx.desktopGateway.broadcast('records.changed', { module: 'agentTools' })
        return saved
      })
    ]
  }
} satisfies Plugin.Object
