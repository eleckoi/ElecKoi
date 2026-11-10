import { productFailure, ELECKOI_FAILURE_CODES } from '@eleckoi/dsh-product-api'
import { visibleDialogueHistory } from './conversation-context.mjs'
import { parseVariableIdentities } from '@eleckoi/dsh-product-data/variables'

/** Host-owned current-turn state. Children share their parent's exact state;
 * replacing a turn does not copy it into snapshots, Session records, or files. */
export class RuntimeContexts {
  #contexts = new Map()
  #readVariableConfiguration

  constructor(readVariableConfiguration) {
    this.#readVariableConfiguration = readVariableConfiguration
  }

  get(sessionId) {
    const state = this.#contexts.get(sessionId)
    if (!state) throw productFailure(ELECKOI_FAILURE_CODES.lifecycleNotReady,
      '当前 Session 的本轮运行上下文尚未准备好。', { what: '本轮运行上下文' })
    return state
  }

  has(sessionId) { return this.#contexts.has(sessionId) }

  /** Read configuration from its owner; only candidate values belong to the turn. */
  readVariables(sessionId) {
    const runtime = this.get(sessionId)
    if (!this.#readVariableConfiguration) return runtime.variables
    const variables = this.#readVariableConfiguration(runtime.conversationId)
    const value = {
      enabled: variables !== undefined || Object.keys(runtime.variables.state).length > 0,
      config: variables === undefined
        ? { defaultState: {}, schemaCode: '', objects: [], variables: [], versionId: '' }
        : { defaultState: parsedState(variables.defaultStateJson), schemaCode: variables.schemaCode,
          objects: variables.objects, variables: variables.variables, versionId: variables.versionId },
      state: runtime.variables.state,
      identities: runtime.variables.identities
    }
    runtime.variables.enabled = value.enabled
    return value
  }

  set(sessionId, state) {
    if (state.rootSessionId === sessionId) {
      for (const [id, previous] of this.#contexts) {
        if (previous.rootSessionId === sessionId) this.#contexts.set(id, state)
      }
    }
    this.#contexts.set(sessionId, state)
  }

  prepare(sessionId, runtime, history, currentUserInput, generationVariableStateJson, appendCurrentInput = true) {
    const context = runtime.conversationContext
    const variables = runtime.variableContext
    const state = {
      rootSessionId: sessionId,
      conversationId: runtime.conversationId,
      conversationContext: { ...context, currentUserInput },
      settingLibraryBaseline: runtime.settingLibraryBaseline,
      generationVariableStateJson,
      generationVariableIdentityJson: variables?.identityJson,
      settings: {
        enabled: context.settingLibrary !== undefined,
        library: context.settingLibrary ?? null,
        frozenLibrary: context.settingLibrary ?? null,
        history: [...(context.history ?? []), ...history, ...(appendCurrentInput ? [{ role: 'user', content: currentUserInput }] : [])]
      },
      variables: variables === undefined ? { enabled: false, config: null, state: {}, identities: {} } : {
        enabled: true,
        config: this.#readVariableConfiguration ? null : {
          defaultState: parsedState(variables.defaultStateJson), schemaCode: variables.schemaCode,
          objects: variables.objects, variables: variables.variables, versionId: variables.versionId },
        state: parsedState(variables.stateJson),
        identities: parseVariableIdentities(variables.identityJson)
      }
    }
    this.set(sessionId, state)
    return state
  }

  inherit(parentId, childId) { this.set(childId, this.get(parentId)) }

  forget(sessionId) { this.#contexts.delete(sessionId) }

  forgetConversation(conversationId) {
    for (const [id, state] of this.#contexts) if (state.conversationId === conversationId) this.forget(id)
  }

  close() { this.#contexts.clear() }
}

function parsedState(raw) {
  let state
  try { state = JSON.parse(raw) }
  catch { throw productFailure(ELECKOI_FAILURE_CODES.storageCorrupt, '变量状态不是合法 JSON。', { what: '变量状态' }) }
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    throw productFailure(ELECKOI_FAILURE_CODES.dataShapeInvalid, '变量状态必须是 JSON object。', { what: '变量状态' })
  }
  return state
}

/** Rebuild ephemeral state from its durable owners when an Agent is restored. */
export function restoreRuntimeContext(ctx, session, snapshot) {
  if (ctx.eleckoiRuntimeContexts.has(session.id)) return
  const messages = session.deriveMessages()
  const input = messages.findLast(message => message.role === 'user' && message.source?.kind === 'user')
  const text = input?.content.filter(block => block.type === 'text').map(block => block.text).join('\n') ?? ''
  const runtime = ctx.eleckoiProductData.prepareConversationRuntime(snapshot.conversationId, text)
  ctx.eleckoiRuntimeContexts.prepare(session.id, runtime, visibleDialogueHistory(messages),
    runtime.conversationContext.currentPromptText ?? text,
    ctx.eleckoiProductData.snapshotConversationRuntime(snapshot.conversationId).variableStateJson, false)
}
