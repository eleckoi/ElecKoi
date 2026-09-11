import type { Context, Plugin } from '@deepseek-ai/cordis'
import { ModelRepository } from './ModelRepository'
import { discoverModels, testModelConnection } from './ModelDiscovery'

export const modelsPlugin = {
  name: 'eleckoi-models',
  inject: ['database', 'desktopGateway', 'credentialCipher'],
  provide: 'models',
  apply(ctx: Context) {
    const models = new ModelRepository(ctx.database, ctx.credentialCipher)
    models.ensureDefault()
    ctx.provide('models', models)

    return [
      ctx.desktopGateway.register('query.models.list', () => models.list()),
      ctx.desktopGateway.register('command.models.save', (input) => {
        const saved = models.save(input)
        ctx.desktopGateway.broadcast('records.changed', { module: 'models' })
        return saved
      }),
      ctx.desktopGateway.register('command.models.delete', ({ configId }) => {
        const saved = models.delete(configId)
        ctx.desktopGateway.broadcast('records.changed', { module: 'models' })
        return saved
      }),
      ctx.desktopGateway.register('command.models.delete_provider', ({ provider }) => {
        const saved = models.deleteProvider(provider)
        ctx.desktopGateway.broadcast('records.changed', { module: 'models' })
        return saved
      }),
      ctx.desktopGateway.register('query.models.options', async (config) => {
        const items = await discoverModels(config)
        return { items, config: { ...config, model_options: items } }
      }),
      ctx.desktopGateway.register('command.models.test_connection', async (config) => {
        await testModelConnection(config)
        return { ok: true as const }
      })
    ]
  }
} satisfies Plugin.Object
