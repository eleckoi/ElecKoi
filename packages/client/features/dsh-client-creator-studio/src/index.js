import { installCreatorStudioRuntime } from './host/runtime.mjs'
import { creatorStudioProjection } from './host/projection.mjs'

export const name = 'eleckoi-creator-studio'
export const inject = ['agents', 'agentPresets', 'agentDefaultModel', 'llm', 'settings', 'sessionController', 'sessionQuery', 'sessionPersistence', 'sessionProjections', 'workspaceRegistry', 'eleckoiSessionEditor', 'eleckoiProductData', 'eleckoiProductRecordChanges', 'eleckoiCharacterConfigurationChanges']
export async function apply(ctx) {
  await ctx.sessionProjections.register(creatorStudioProjection)
  return installCreatorStudioRuntime(ctx)
}
