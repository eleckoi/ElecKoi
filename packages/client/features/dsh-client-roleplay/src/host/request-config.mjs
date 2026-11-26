import { readSessionSnapshot } from './session-snapshot.mjs'
import { isProjectionEnvelope, projectRoleplayDialogue } from './conversation-context.mjs'

const COMPACTION_GUARD = '你当前只执行内部历史压缩。只返回非空的纯文本摘要正文；不要调用工具，不要输出推理过程，也不要使用主对话的输出协议标签。'

/**
 * Installs a request configuration on one Agent scope. The top-level turn
 * preparation captures the Session's selection for product controls. DSH owns
 * the durable route and captures it for each step; this plugin never selects
 * a route from a product snapshot or from the deployment default.
 */
export function installRequestConfig(agentCtx, snapshotRoot, sourceSessionId, readHistory) {
  const reroutedCompactions = new WeakSet()
  const disposeAssembly = agentCtx.on('system-prompt/assemble', async (_assembly, _context, next) => {
    const snapshot = readSessionSnapshot(snapshotRoot, sourceSessionId)
    const model = snapshot.model
    const result = await next()
    const selection = _context.modelSelection ?? model
    return selection === undefined ? result : {
      ...result,
      variables: {
        ...result.variables,
        provider: selection.provider,
        model: selection.model
      }
    }
  })
  const disposeRequest = agentCtx.on('agent/request', async (_payload, next) => {
    const inherited = await next()
    const snapshot = readSessionSnapshot(snapshotRoot, sourceSessionId)
    // Numeric model parameters are applied once by the shared Session model API.
    // A one-off author request length remains an explicit request-local override.
    return snapshot.responseLengthOverride === undefined ? inherited : { ...inherited, maxTokens: snapshot.responseLengthOverride }
  }, { prepend: true })
  const disposeCompaction = agentCtx.on('llm/stream', (options, next) => {
    if (options.sessionId !== sourceSessionId || options.purpose !== 'compaction' || reroutedCompactions.has(options)) return next()
    const snapshot = readSessionSnapshot(snapshotRoot, sourceSessionId)
    const model = snapshot.model
    // Maintenance can summarize on a different route from the last prepared turn.
    const effort = model && model.provider === options.provider && model.model === options.model
      ? model.reasoningEffort
      : undefined
    const dispatch = messages => {
      const request = messages === options.messages ? options : { ...options, messages }
      const projected = projectCompactionRequest(request, snapshot.historyCompactionInstructions, effort) ?? request
      if (projected === options) return next()
      // DSH deep-freezes requests before the waterfall. Route the projected
      // request through the public LLM service once.
      reroutedCompactions.add(projected)
      return agentCtx.llm.stream(projected)
    }
    if (!readHistory) return dispatch(options.messages)
    return (async function* () {
      const replies = await readHistory(sourceSessionId, options.signal)
      yield* dispatch(projectRoleplayDialogue(options.messages, replies))
    })()
  })
  return () => {
    disposeCompaction()
    disposeRequest()
    disposeAssembly()
  }
}

export function projectCompactionRequest(options, customInstructions, defaultReasoningEffort) {
  const instructions = typeof customInstructions === 'string' ? customInstructions.trim() : ''
  if (options?.purpose !== 'compaction' || !Array.isArray(options.messages) || !options.messages.length) {
    return undefined
  }
  const configuredReasoningEffort = typeof defaultReasoningEffort === 'string' && defaultReasoningEffort.trim()
    ? defaultReasoningEffort.trim()
    : undefined
  const reasoningEffort = options.reasoningEffort ?? configuredReasoningEffort
  const reasoningChanged = reasoningEffort !== undefined && options.reasoningEffort !== reasoningEffort
  const messages = options.messages.filter((message) => !isProjectionEnvelope(message))
  const removedProjection = messages.length !== options.messages.length
  const last = messages.at(-1)
  if (!instructions || !last || last.role !== 'user') {
    if (!removedProjection && !reasoningChanged) return undefined
    return {
      ...options,
      ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
      messages
    }
  }
  return {
    ...options,
    ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
    messages: [
      ...messages.slice(0, -1),
      {
        ...last,
        content: [{ type: 'text', text: `${COMPACTION_GUARD}\n\n${instructions}` }]
      }
    ]
  }
}
