import { apply as applyBridge } from './host/agent-preset-bridge.mjs'
import { RequestPreviewStore } from './host/request-preview.mjs'
import { conversationPreviewProjection } from './host/conversation-preview.mjs'
import { retireRequestContextCache } from './host/request-cache-retirement.mjs'
import { migrateLegacyGlobalModelSelection } from './host/model-selection-migration.mjs'
import { illustrationProjection } from './host/illustration-projection.mjs'

export const name = 'eleckoi-roleplay'
export { materializeAgentPreset } from './host/session-runtime.mjs'
export { readRuntimePresetDefinition } from './host/preset-definition.mjs'
export { currentRequestSnapshot, requestSnapshot } from './host/model-selection-migration.mjs'
export { applyDisabledPolicy } from './host/tool-policy.mjs'
export { projectCompactionRequest } from './host/request-config.mjs'
export { projectRequestInput, extendNativeRequestInput, requestProjectionSnapshot, sessionInstructions } from './host/conversation-context.mjs'
export const inject = [
  'agents',
  'agentPresets',
  'agentDefaultModel',
  'eleckoiProductData',
  'llm',
  'settings',
  'sessionController',
  'sessionQuery',
  'sessionPersistence',
  'sessions',
  'eleckoiConversationLifecycle',
  'eleckoiConversationChanges',
  'eleckoiCharacterConfigurationChanges',
  'sessionProjections'
]

export async function apply(ctx) {
  await migrateLegacyGlobalModelSelection(ctx)
  const previews = new RequestPreviewStore()
  ctx.provide('eleckoiRequestPreviews', previews)
  ctx.effect(() => () => previews.close())
  await ctx.sessionProjections.register(conversationPreviewProjection)
  await ctx.sessionProjections.register(illustrationProjection)
  ctx.inject(['sessionProjectionCache', 'storageDomain'], retireRequestContextCache)
  return applyBridge(ctx)
}
