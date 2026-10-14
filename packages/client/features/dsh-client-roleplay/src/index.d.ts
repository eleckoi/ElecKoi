import type { Context } from '@deepseek-ai/cordis'
import type {} from './projections.js'
export const name: 'eleckoi-roleplay'
export const inject: readonly string[]
export function apply(ctx: Context): Promise<unknown>
export { materializeAgentPreset } from './host/session-runtime.mjs'
export { readRuntimePresetDefinition } from './host/preset-definition.mjs'
export { currentRequestSnapshot, requestSnapshot } from './host/model-selection-migration.mjs'
export { applyDisabledPolicy, registerAuthorToolNames } from './host/tool-policy.mjs'
export { projectRequestInput, extendNativeRequestInput, requestProjectionSnapshot, sessionInstructions } from './host/conversation-context.mjs'
