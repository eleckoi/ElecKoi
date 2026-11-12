import type { Context } from '@deepseek-ai/cordis'
import type {} from './projections.js'
export const name: 'eleckoi-roleplay'
export const inject: readonly string[]
export function apply(ctx: Context): Promise<unknown>
export { materializeAgentPreset } from './host/session-runtime.mjs'
export { readRuntimePresetDefinition } from './host/preset-definition.mjs'
export { currentRequestSnapshot, requestSnapshot } from './host/model-request-snapshot.mjs'
export { applyDisabledPolicy } from './host/tool-policy.mjs'
export { projectCompactionRequest } from './host/request-config.mjs'
export { projectRequestInput, extendNativeRequestInput, requestProjectionSnapshot, sessionInstructions } from './host/conversation-context.mjs'
