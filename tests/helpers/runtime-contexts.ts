import { RuntimeContexts } from '../../packages/client/features/dsh-client-roleplay/src/host/runtime-contexts.mjs'
import { createVariableIdentities } from '../../packages/shared/src/foundation/variables/identity'

/** Shared tool fixture using the same Host state owner as the product plugin. */
export function runtimeContextsFor(sessionId: string, state: Record<string, unknown> = {}) {
  const contexts = new RuntimeContexts()
  const variables = (state.variables ?? { enabled: false, config: null, state: {} }) as any
  if (variables.config) variables.config.versionId ??= 'synthetic-version'
  variables.identities ??= createVariableIdentities(variables.state, variables.config ?? { versionId: '', objects: [], variables: [] }, 'runtime')
  contexts.set(sessionId, {
    rootSessionId: sessionId,
    conversationId: 'synthetic-chat',
    conversationContext: {},
    settings: { enabled: false, library: null, frozenLibrary: null, history: [] },
    ...state,
    variables
  })
  return contexts
}
