import { readFileSync } from 'node:fs'
import { readSessionSnapshot } from './session-snapshot.mjs'

const installations = new WeakMap()
const schema = {
  type: 'object', properties: {
    frames: { type: 'array', minItems: 1, items: { type: 'object', properties: {
      id: { type: 'integer' }, prompt: { type: 'string' }, negative_prompt: { type: 'string' },
      after_paragraph: { type: 'integer', minimum: 0 }, seed: { type: 'integer' },
      workflow: { type: 'string' }, overrides: { type: 'object', additionalProperties: true }
    }, required: ['id', 'prompt', 'after_paragraph'], additionalProperties: false } }
  }, required: ['frames'], additionalProperties: false
}

/** Uses the original scoped ToolRuntime and Session events; no second Agent. */
export async function installImageGenerationTools(agentCtx, snapshotRoot, sessionId) {
  let state = installations.get(agentCtx)
  if (state) {
    state.references++
    try { await synchronizeImageGenerationTools(agentCtx, snapshotRoot, sessionId) }
    catch (error) { release(agentCtx, state); throw error }
    return () => release(agentCtx, state)
  }
  state = { references: 1, currentTurn: undefined, pending: new Map(), registration: undefined, description: undefined, retries: new Map(), commits: new Set() }
  installations.set(agentCtx, state)
  state.listener = agentCtx.on('session/event', (session, event) => {
    if (session.id !== sessionId) return
    if (event.type === 'turn/start') state.currentTurn = event.data.turn
    if (event.type !== 'turn/end') return
    const turn = event.data.turn, pending = state.pending.get(turn)
    state.pending.delete(turn); if (state.currentTurn === turn) state.currentTurn = undefined
    if (!pending || event.data.reason.kind !== 'completed') return
    const commit = commitImages(agentCtx, state, pending, turn)
    state.commits.add(commit)
    return commit.finally(() => state.commits.delete(commit))
  })
  try { await synchronizeImageGenerationTools(agentCtx, snapshotRoot, sessionId) }
  catch (error) { release(agentCtx, state); throw error }
  return () => release(agentCtx, state)
}

function release(agentCtx, state) {
  if (--state.references > 0) return
  state.registration?.(); state.listener(); state.pending.clear()
  installations.delete(agentCtx)
}

async function commitImages(agentCtx, state, pending, turn) {
  try {
    await pending.service.commitLatest(pending.conversationId, pending.images, turn)
    state.retries.delete(turn)
  } catch (error) {
    state.retries.set(turn, pending)
    agentCtx.logger.error(`ElecKoi 配图保存失败（会话 ${pending.conversationId}，轮次 ${turn}）：${String(error)}`)
    try { await pending.service.reportCommitFailure(pending.conversationId, pending.images, turn, error) }
    catch (reportError) { agentCtx.logger.error(`ElecKoi 配图失败诊断保存失败：${String(reportError)}`) }
    throw error
  }
}

/** Runs after the frozen turn snapshot is replaced and before prompt admission. */
export async function synchronizeImageGenerationTools(agentCtx, snapshotRoot, sessionId) {
  const state = installations.get(agentCtx)
  if (!state) return
  if (state.commits.size) await Promise.all(state.commits)
  // Retry the original image/message association after its data problem is
  // corrected; a failed save must remain visible without permanently blocking chat.
  for (const [turn, pending] of state.retries) await commitImages(agentCtx, state, pending, turn)
  const snapshot = readSessionSnapshot(snapshotRoot, sessionId)
  const service = typeof agentCtx.get === 'function' ? agentCtx.get('eleckoiImageGeneration', false) : agentCtx.eleckoiImageGeneration
  const disabled = snapshot.disabledToolGroupIds?.includes('builtin:auto-illustration') || snapshot.inheritedFromSessionId
  if (!disabled && snapshot.toolModelConfigIds?.['builtin:auto-illustration'] && !service) throw new Error('The native image generation service is not mounted')
  const enabled = !disabled && service && await service.enabledForSession(snapshot)
  if (!enabled) { state.registration?.(); state.registration = undefined; state.description = undefined; return }
  const description = await service.toolDescription(snapshot)
  if (typeof description !== 'string' || !description.trim()) throw new TypeError('The native image tool description must contain its generation instructions')
  if (state.registration && state.description === description) return
  state.registration?.(); state.registration = undefined
  state.registration = agentCtx.tools.register({
    name: 'generate_image', description, parameters: schema,
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }],
      presentationMeta: () => ({ source: 'eleckoi-auto-illustration', name: 'generate_image' }) },
    async execute(args, exec) {
      const turn = state.currentTurn
      if (!Number.isSafeInteger(turn) || turn < 1) throw new Error('Image generation requires an active original Agent turn')
      if (exec.agent && exec.agent.id !== sessionId) throw new Error('Image tool execution belongs to a different Session')
      const frozen = readSessionSnapshot(snapshotRoot, sessionId)
      const context = JSON.parse(readFileSync(frozen.contextFile, 'utf8')), conversationId = context.conversationId ?? frozen.conversationId
      if (typeof conversationId !== 'string' || !conversationId) throw new Error('Image generation snapshot has no conversation identity')
      if (frozen.disabledToolGroupIds?.includes('builtin:auto-illustration') || !await service.enabledForSession(frozen)) throw new Error('Image generation is disabled for this turn')
      const result = await service.generateTool(frozen, args, exec.signal)
      if (exec.signal.aborted) throw exec.signal.reason ?? new Error('Image generation was cancelled')
      if (!result || !Array.isArray(result.images) || typeof result.content !== 'string') throw new TypeError('Image generation returned an invalid tool result')
      if (state.currentTurn !== turn) throw new Error('Image generation settled after its original Agent turn ended')
      const pending = state.pending.get(turn)
      if (pending && pending.conversationId !== conversationId) throw new Error('Image generation turn changed conversation ownership')
      state.pending.set(turn, { service, conversationId, images: [...(pending?.images ?? []), ...result.images] })
      return result.content
    }
  })
  state.description = description
}
