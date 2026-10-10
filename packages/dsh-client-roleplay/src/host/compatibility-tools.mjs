import { readFileSync } from 'node:fs'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import { readSessionSnapshot } from './session-snapshot.mjs'

/** Registers frozen JS ToolManager callbacks in the existing scoped DSH ToolRuntime. */
export function installCompatibilityTools(agentCtx, snapshotRoot, sourceSessionId) {
  synchronizeCompatibilityTools(agentCtx, snapshotRoot, sourceSessionId)
  return () => {
    const state = registrations.get(agentCtx)
    if (state) clearRegistrations(state)
    registrations.delete(agentCtx)
  }
}

const registrations = new WeakMap()
function clearRegistrations(state) { for (const dispose of state.disposers.splice(0).reverse()) dispose() }

/** Product turn preparation calls this BEFORE the official prompt assembly reads schemas. */
export function synchronizeCompatibilityTools(agentCtx, snapshotRoot, sourceSessionId) {
  let state = registrations.get(agentCtx)
  if (!state) { state = { revision: undefined, disposers: [] }; registrations.set(agentCtx, state) }
  const snapshot = readSessionSnapshot(snapshotRoot, sourceSessionId)
  const context = JSON.parse(readFileSync(snapshot.contextFile, 'utf8'))
  const descriptors = context.compatibilityTools ?? [], conversationId = context.conversationId ?? snapshot.conversationId
  if (!Array.isArray(descriptors)) throw new TypeError('Frozen ToolManager descriptors must be an array')
  const nextRevision = JSON.stringify({ conversationId, descriptors })
  if (state.revision === nextRevision) return
  const callbacks = typeof agentCtx.get === 'function' ? agentCtx.get('eleckoiCompatibilityCallbacks', false) : agentCtx.eleckoiCompatibilityCallbacks
  if (descriptors.length && !callbacks) throw new Error('The shared ToolManager callback service is not mounted')
  const definitions = descriptors.map(descriptor => compatibilityToolDefinition(descriptor, { conversationId, callbacks }))
  clearRegistrations(state)
  try {
    for (const definition of definitions) state.disposers.push(agentCtx.tools.register(definition))
    state.revision = nextRevision
  } catch (error) { clearRegistrations(state); state.revision = undefined; throw error }
}

/** Keep raw ST parameter schemas; the original ToolManager owns argument semantics. */
export function compatibilityToolDefinition(descriptor, { conversationId, callbacks }) {
  const tool = descriptor?.function, version = descriptor?.__eleckoiVersion
  if (descriptor?.type !== 'function' || typeof tool?.name !== 'string' || !tool.name
    || typeof tool.description !== 'string' || !tool.parameters || typeof tool.parameters !== 'object' || Array.isArray(tool.parameters)
    || typeof version !== 'string' || !version) throw new TypeError('Agent tools require a frozen ToolManager function descriptor')
  const displayName = descriptor.__eleckoiDisplayName || tool.name, stealth = descriptor.__eleckoiStealth === true
  return {
    name: tool.name, description: tool.description, parameters: structuredClone(tool.parameters),
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
      presentationMeta: () => ({ source: 'eleckoi-tavern', conversationId, name: tool.name, version, displayName, stealth })
    },
    async execute(args, exec) {
      let result
      try {
        result = await callbacks.invokeTool({ conversationId, name: tool.name, version, arguments: args }, {
          conversationId, signal: exec.signal
        })
      } catch (error) {
        if (exec.signal.aborted) throw new HarnessError(`Plugin tool ${tool.name} was cancelled: ${String(exec.signal.reason)}`, 'ABORTED')
        throw error
      }
      if (!result || typeof result.success !== 'boolean' || typeof result.content !== 'string') throw new TypeError(`Tool ${tool.name} returned an invalid invocation result`)
      if (!result.success) throw Object.assign(new Error(result.content), { code: 'PLUGIN_TOOL_FAILED' })
      if (stealth) exec.concludeTurn()
      return result.content
    }
  }
}
