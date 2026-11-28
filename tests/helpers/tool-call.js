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

let replyCallCount = 0

export async function* streamRoleplayReply(textOrBlocks, request) {
  const replies = Array.isArray(textOrBlocks) ? textOrBlocks : (() => {
    const tool = request.tools.find(tool => tool.name === 'eleckoi_roleplay_reply')
    const names = Object.entries(tool?.parameters?.properties ?? {}).filter(([, schema]) => schema.type === 'string')
    if (names.length !== 1) throw new Error('Synthetic reply requires a single advertised speaker')
    return [{ name: names[0][0], text: textOrBlocks }]
  })()
  const fields = new Map()
  for (const { name, text } of replies) fields.set(name, fields.has(name) ? fields.get(name) + '\n\n' + text : text)
  const index = 0
  const block = { type: 'tool-call', id: 'synthetic-roleplay-' + ++replyCallCount, name: 'eleckoi_roleplay_reply',
    arguments: JSON.stringify(Object.fromEntries(fields)) }
  yield { type: 'block-start', index, blockType: 'tool-call' }
  yield { type: 'tool-call-delta', index, id: block.id, name: block.name, argumentsDelta: block.arguments }
  yield { type: 'block-end', index, block }
  yield { type: 'finish', reason: { kind: 'tool-calls' } }
}
