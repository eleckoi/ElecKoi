// The same cancellation promise is awaited at the turn boundary below.
const rejectionIsAwaitedElsewhere = () => {}

/** Keep delegated work inside the roleplay turn that owns its user input. */
export function installRoleplaySubagentTurn(agentCtx) {
  return agentCtx.on('agent/turn-stopping', async ({ agent, signal }) => {
    const subagents = agentCtx.get('subagents')
    if (!subagents) return
    let cancelled
    const stop = () => {
      cancelled = subagents.drainDescendants([agent])
      void cancelled.catch(rejectionIsAwaitedElsewhere)
    }
    signal.addEventListener('abort', stop, { once: true })
    try {
      if (signal.aborted) stop()
      await subagents.waitForChildren(agent)
      await cancelled
      signal.throwIfAborted()
    } finally { signal.removeEventListener('abort', stop) }
  })
}
