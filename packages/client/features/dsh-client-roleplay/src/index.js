import { apply as applyBridge } from './host/agent-preset-bridge.mjs'
import { RequestPreviewStore } from './host/request-preview.mjs'
import { conversationPreviewProjection } from './host/conversation-preview.mjs'
import { retireRequestContextCache } from './host/request-cache-retirement.mjs'
import { migrateLegacyGlobalModelSelection } from './host/model-selection-migration.mjs'
import { createNovelAiImageGeneration } from './host/novelai-image-generation.mjs'
import { illustrationProjection } from './host/illustration-projection.mjs'

export const name = 'eleckoi-roleplay'
export { materializeAgentPreset } from './host/session-runtime.mjs'
export { readRuntimePresetDefinition } from './host/preset-definition.mjs'
export { currentRequestSnapshot, requestSnapshot } from './host/model-selection-migration.mjs'
export { applyDisabledPolicy, registerAuthorToolNames } from './host/tool-policy.mjs'
export { projectRequestInput, extendNativeRequestInput, requestProjectionSnapshot, sessionInstructions } from './host/conversation-context.mjs'
export const inject = [
  'agents',
  'agentPresets',
  'agentDefaultModel',
  'eleckoiProductData',
  'llm',
  'settings',
  'sessionController',
  'sessions',
  'eleckoiConversationLifecycle',
  'eleckoiConversationChanges',
  'eleckoiCharacterConfigurationChanges',
  'sessionProjections'
]

export async function apply(ctx) {
  await migrateLegacyGlobalModelSelection(ctx)
  ctx.inject(['credentials', 'attachments', 'eleckoiSessionEditor'], owner => {
    const images = createNovelAiImageGeneration(owner)
    owner.provide('eleckoiImageGeneration', images)
    owner.effect(() => () => images.close())
  })
  const previews = new RequestPreviewStore()
  ctx.provide('eleckoiRequestPreviews', previews)
  ctx.effect(() => () => previews.close())
  ctx.sessionProjections.register(conversationPreviewProjection)
  ctx.sessionProjections.register(illustrationProjection)
  ctx.inject(['sessionProjectionCache', 'storageDomain'], retireRequestContextCache)
  return applyBridge(ctx)
}
