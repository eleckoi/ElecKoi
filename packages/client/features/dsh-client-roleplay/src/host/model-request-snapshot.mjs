import { readSessionSnapshot, writeSessionSnapshot } from './session-snapshot.mjs'

export function requestSnapshot(ctx, selection, info, overrides = {}) {
  const namespace = ctx.settings?.describe().find(row => row.ns === 'eleckoi-client-models')
  const parameters = { ...namespace?.value?.entries?.[selection.provider]?.parameters?.[selection.model], ...overrides }
  const reasoningEffort = selection.reasoningEffort ?? parameters.reasoningEffort
  return {
    configId: selection.provider,
    provider: selection.provider,
    model: selection.model,
    ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
    ...(parameters.temperature == null ? {} : { temperature: parameters.temperature }),
    ...(parameters.topP == null ? {} : { topP: parameters.topP }),
    ...(parameters.autoCompactTokenLimit == null ? {} : { autoCompactTokenLimit: parameters.autoCompactTokenLimit }),
    ...((parameters.maxOutputTokens ?? info?.defaultMaxTokens) === undefined ? {} : { maxTokens: parameters.maxOutputTokens ?? info.defaultMaxTokens }),
    ...((parameters.contextWindowTokens ?? info?.context?.contextWindow) === undefined ? {} : { contextWindow: parameters.contextWindowTokens ?? info.context.contextWindow }),
    ...(parameters.contextWindowTokens != null && info?.context?.contextWindow !== undefined && parameters.contextWindowTokens !== info.context.contextWindow ? { compactionContextWindow: info.context.contextWindow } : {})
  }
}

// Existing Sessions own their selection. Only creation without a Session uses
// the deployment default; a failure resolving a saved route must not replace it.
export async function currentRequestSnapshot(ctx, selection = ctx.agentDefaultModel.currentSelection(), session) {
  const info = await ctx.llm.resolveModelInfo(selection.provider, selection.model)
  const api = session && ctx.get?.('eleckoiConversationModelsApi')
  const parameters = api ? await api.parameterState(session) : undefined
  const overrides = parameters?.entries[JSON.stringify([selection.provider, selection.model])] ?? {}
  return requestSnapshot(ctx, selection, info, overrides)
}

/** Permanent runtime path: align a resumed top-level Session before its next turn. */
export async function refreshSessionModelSnapshot(ctx, root, sessionId, selection, session) {
  const snapshot = readSessionSnapshot(root, sessionId)
  const model = await currentRequestSnapshot(ctx, selection, session)
  if (sameModelSnapshot(snapshot.model, model)) return snapshot
  const next = { ...snapshot, model }
  writeSessionSnapshot(root, sessionId, next)
  return next
}

function sameModelSnapshot(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}
