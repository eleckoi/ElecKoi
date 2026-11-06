/** Dispatch one fixture call through the current executor's complete batch contract. */
export async function executeToolCall(tools, { callId, name, arguments: args, ...context }) {
  const modelSelection = context.agent?.model?.current()
  const toolSet = modelSelection ? await tools.resolve({ agent: context.agent, modelSelection, signal: context.signal }) : undefined
  try {
    const batch = await tools.execute({ ...context, ...(toolSet ? { toolSet } : {}), calls: [{ type: 'tool-call', id: callId, name,
      arguments: typeof args === 'string' ? args : JSON.stringify(args) }] })
    return batch.results[0].result
  } finally { toolSet?.dispose() }
}
