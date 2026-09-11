import type { Context, Plugin } from '@deepseek-ai/cordis'
import { VariableConfigRepository } from './VariableConfigRepository'
import { VariableStateRepository } from './VariableStateRepository'

export const variablesPlugin = {
  name: 'eleckoi-variables',
  inject: ['database', 'desktopGateway'],
  provide: ['variables', 'variableStates'],
  apply(ctx: Context) {
    const variables = new VariableConfigRepository(ctx.database)
    const variableStates = new VariableStateRepository(ctx.database, variables)
    ctx.provide('variables', variables)
    ctx.provide('variableStates', variableStates)
    return [
      ctx.desktopGateway.register('query.variable_config.read', ({ characterId }) => variables.get(characterId)),
      ctx.desktopGateway.register('command.variable_config.save', ({ characterId, config }) => {
        const saved = variables.save(characterId, config)
        ctx.desktopGateway.broadcast('records.changed', { module: 'variables' })
        return saved
      }),
      ctx.desktopGateway.register('command.variable_config.view_state.save', ({ characterId, expandedObjectIds }) => (
        variables.saveViewState(characterId, expandedObjectIds)
      ))
    ]
  }
} satisfies Plugin.Object
