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
const replyCallPrefix = 'synthetic-roleplay-'
const pendingReplies = new Map()

function latestRoleplayResult(request) {
  if (request.purpose === 'compaction') return undefined
  const currentInput = request.messages.findLastIndex(message => message.role === 'user'
    && ['user', 'agent-message', 'subagent-settled'].includes(message.source.kind))
  return request.messages.slice(currentInput + 1).findLast(message => message.role === 'tool'
    && message.toolCallId.startsWith(replyCallPrefix))
}

export const hasRoleplayReplyResult = request => Boolean(latestRoleplayResult(request))

export async function* streamRoleplayReply(textOrBlocks, request) {
  if (Array.isArray(textOrBlocks)) return yield* streamRoleplaySpeaker(textOrBlocks)
  const tool = request.tools.find(tool => tool.name === 'eleckoi_roleplay_reply')
  const names = tool?.parameters?.properties?.names?.items?.enum
  if (names?.length !== 1) throw new Error('Synthetic reply requires a single advertised speaker')
  yield* streamRoleplaySpeaker([{ name: names[0], text: textOrBlocks }])
}

export async function* streamNextRoleplayReply(request) {
  const receipt = latestRoleplayResult(request)
  const replies = pendingReplies.get(receipt?.toolCallId)
  if (!replies || receipt.isError) throw new Error('Expected a successful synthetic roleplay submission')
  pendingReplies.delete(receipt.toolCallId)
  const labeled = replies.map(({ name, text }) => `<${name}>${text}</${name}>`).join('\n\n')
  yield { type: 'block-start', index: 0, blockType: 'text' }
  yield { type: 'text-delta', index: 0, text: labeled }
  yield { type: 'block-end', index: 0, block: { type: 'text', text: labeled } }
  yield { type: 'finish', reason: { kind: 'stop' } }
}

async function* streamRoleplaySpeaker(replies) {
  const index = 0
  const name = 'eleckoi_roleplay_reply'
  const block = { type: 'tool-call', id: `${replyCallPrefix}${++replyCallCount}`, name,
    arguments: JSON.stringify({ names: [...new Set(replies.map(reply => reply.name))] }) }
  pendingReplies.set(block.id, replies)
  yield { type: 'block-start', index, blockType: 'tool-call' }
  yield { type: 'tool-call-delta', index, id: block.id, name: block.name, argumentsDelta: block.arguments }
  yield { type: 'block-end', index, block }
  yield { type: 'finish', reason: { kind: 'tool-calls' } }
}
