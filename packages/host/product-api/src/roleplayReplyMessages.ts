import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { ToolCallBlock } from '@deepseek-ai/dsh-llm'
import { appendRoleplayReplyBlock, roleplayReplyBlocks, roleplayReplySpeakers, submittedRoleplayBlocks, type RoleplayReplyBlock } from './roleplayReplyText.js'

export const ROLEPLAY_OUTPUT_EVENT = 'eleckoi/roleplay-output'
export const ROLEPLAY_REPLY_SOURCE = 'eleckoi-roleplay-reply'
export const DELEGATED_ROLEPLAY_REPLY_EVENT = 'eleckoi/delegated-roleplay-reply'

export function isDelegatedRoleplayReply(event: unknown): event is Extract<SessionEvent, { type: typeof DELEGATED_ROLEPLAY_REPLY_EVENT }> {
  const candidate = event as { type?: unknown; data?: { status?: unknown; text?: unknown } } | undefined
  return candidate?.type === DELEGATED_ROLEPLAY_REPLY_EVENT && candidate.data?.status === 'complete'
    && typeof candidate.data.text === 'string' && Boolean(candidate.data.text.trim())
}

export function delegatedRoleplayReplyBlocks(data: Extract<SessionEvent, { type: typeof DELEGATED_ROLEPLAY_REPLY_EVENT }>['data']): RoleplayReplyBlock[] {
  if (data.blocks) return data.blocks
  // RETIRE WHEN: supported Session histories and imports all store delegated reply blocks. Remove this
  // single-speaker read fallback and its regression coverage, preserving block-based edits and history.
  return data.speakerName ? [{ id: data.id + ':0', kind: 'speech', text: data.text ?? '', speakerName: data.speakerName,
    ...(data.speakerId ? { speakerId: data.speakerId } : {}) }] : []
}

export function isToolBackedRoleplayReply(event: unknown): event is Extract<SessionEvent, { type: typeof ROLEPLAY_OUTPUT_EVENT }> {
  const candidate = event as { type?: unknown; data?: { toolBacked?: unknown } } | undefined
  return candidate?.type === ROLEPLAY_OUTPUT_EVENT && candidate.data?.toolBacked === true
}

type TurnEnd = Extract<SessionEvent, { type: 'turn/end' }>

// DSH shares durable tool blocks between observations of an open Session.
// A replaced invocation gets a new key. Edits to the reply are applied below.
const parsedReplyArgs = new WeakMap<ToolCallBlock, { raw: string; fields: Record<string, unknown> }>()

export function roleplayReplyMessages(events: readonly SessionEvent[], processOnly?: Array<{ event: TurnEnd; processMessageIds: string[] }>) {
  const turns = new Map<number, {
    blocks: RoleplayReplyBlock[]
    bodyParts: { messageId: string; blockId: string; text: string }[]
    processMessageIds: string[]
    toolFields: boolean
    calls: Map<string, { block: ToolCallBlock; messageId: string }>
    selections: Map<number, Array<{ callId: string; speakers: ReturnType<typeof roleplayReplySpeakers> }>>
  }>()
  const replies = []
  for (const event of events) {
    if (event.type === ROLEPLAY_OUTPUT_EVENT && event.data.replySeq === undefined) {
      turns.set(event.data.turn, { blocks: [], bodyParts: [], processMessageIds: [], calls: new Map(),
        toolFields: event.data.toolFields !== undefined, selections: new Map() })
    } else if (event.type === 'assistant/message') {
      const turn = turns.get(event.data.turn)
      if (!turn) continue
      turn.processMessageIds.push(event.data.message.id)
      if (event.data.interrupted) continue
      if (turn.toolFields) {
        for (const block of event.data.message.content) {
          if (block.type === 'tool-call' && block.name === 'eleckoi_roleplay_reply') {
            turn.calls.set(block.id, { block, messageId: event.data.message.id })
          }
        }
        continue
      }
      // RETIRE WHEN: supported Sessions and chat imports no longer contain role selection followed by assistant text.
      // Remove this legacy text branch and step selections below, the corresponding Client read and old-format fixtures.
      const selections = turn.selections.get(event.data.step)
      if (selections?.length !== 1) continue
      const { callId, speakers } = selections[0]!
      const raw = event.data.message.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('')
      for (const part of roleplayReplyBlocks(raw, speakers, callId)) {
        const { text } = part
        const block = appendRoleplayReplyBlock(turn.blocks, part)
        turn.bodyParts.push({ messageId: event.data.message.id, blockId: block.id, text })
      }
    } else if (event.type === 'tool/result') {
      const turn = turns.get(event.data.turn)
      if (!turn) continue
      turn.processMessageIds.push(event.data.message.id)
      const meta = event.data.meta
      if (event.data.message.isError || !meta || typeof meta !== 'object' || Array.isArray(meta)
        || meta.source !== ROLEPLAY_REPLY_SOURCE) continue
      const speakers = roleplayReplySpeakers(meta)
      if (!speakers.length) continue
      if (turn.toolFields) {
        const callId = event.data.message.source.callId
        const call = turn.calls.get(callId)
        if (!call) continue
        const raw = call.block.arguments
        let args = parsedReplyArgs.get(call.block)
        if (args?.raw !== raw) {
          args = { raw, fields: JSON.parse(raw) }
          parsedReplyArgs.set(call.block, args)
        }
        const { fields } = args
        for (const part of submittedRoleplayBlocks(speakers, callId, field => fields[field])) {
          const block = appendRoleplayReplyBlock(turn.blocks, part)
          turn.bodyParts.push({ messageId: call.messageId, blockId: block.id, text: part.text })
        }
        continue
      }
      const bodyStep = event.data.step + 1
      const selections = turn.selections.get(bodyStep) ?? []
      selections.push({ callId: event.data.message.source.callId, speakers })
      turn.selections.set(bodyStep, selections)
    } else if (isToolBackedRoleplayReply(event)) {
      const turn = turns.get(event.data.turn)
      if (turn) {
        const { blocks, bodyParts, processMessageIds } = turn
        const messageId = bodyParts.at(-1)?.messageId
        const edited = event.data.editedText
        const edits = new Map(event.data.editedBlocks?.map(block => [block.id, block.text]))
        const editedBlocks = blocks.map(block => {
          const text = edits.get(block.id) ?? (blocks.length === 1 ? edited : undefined)
          return text === undefined ? block : { ...block, text }
        })
        const content = editedBlocks.map(block => `${block.speakerName}：${block.text}`).join('\n\n')
        if (messageId && content?.trim()) {
          replies.push({ event, messageId, content, blocks: editedBlocks, bodyParts,
            addressSeq: Number(event.seq), processMessageIds })
          turns.delete(event.data.turn)
        }
      }
    } else if (event.type === 'turn/end') {
      const turn = turns.get(event.data.turn)
      if (turn && processOnly) processOnly.push({ event, processMessageIds: turn.processMessageIds })
      turns.delete(event.data.turn)
    }
  }
  return replies
}
