import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { roleplayReplyText } from './roleplayReplyText.js'

export const ROLEPLAY_OUTPUT_EVENT = 'eleckoi/roleplay-output'
export const ROLEPLAY_REPLY_SOURCE = 'eleckoi-roleplay-reply'
export const DELEGATED_ROLEPLAY_REPLY_EVENT = 'eleckoi/delegated-roleplay-reply'

type ReplyBlock = { id: string; kind: 'speech'; text: string; speakerName: string; speakerId?: string }

export function isDelegatedRoleplayReply(event: unknown): event is Extract<SessionEvent, { type: typeof DELEGATED_ROLEPLAY_REPLY_EVENT }> {
  const candidate = event as { type?: unknown; data?: { status?: unknown; text?: unknown } } | undefined
  return candidate?.type === DELEGATED_ROLEPLAY_REPLY_EVENT && candidate.data?.status === 'complete'
    && typeof candidate.data.text === 'string' && Boolean(candidate.data.text.trim())
}

export function delegatedRoleplayReplyBlock(data: Extract<SessionEvent, { type: typeof DELEGATED_ROLEPLAY_REPLY_EVENT }>['data']): ReplyBlock {
  return { id: data.id + ':0', kind: 'speech', text: data.text ?? '', speakerName: data.speakerName,
    ...(data.speakerId ? { speakerId: data.speakerId } : {}) }
}

export function isToolBackedRoleplayReply(event: unknown): event is Extract<SessionEvent, { type: typeof ROLEPLAY_OUTPUT_EVENT }> {
  const candidate = event as { type?: unknown; data?: { toolBacked?: unknown } } | undefined
  return candidate?.type === ROLEPLAY_OUTPUT_EVENT && candidate.data?.toolBacked === true
}

export function roleplayReplyMessages(events: readonly SessionEvent[]) {
  const turns = new Map<number, {
    blocks: ReplyBlock[]
    bodyParts: { messageId: string; blockId: string; text: string }[]
    assistants: Array<Extract<SessionEvent, { type: 'assistant/message' }>>
    toolMessageIds: string[]
    selections: Map<number, ReplyBlock[]>
  }>()
  const replies = []
  for (const event of events) {
    if (event.type === ROLEPLAY_OUTPUT_EVENT && event.data.replySeq === undefined) {
      turns.set(event.data.turn, { blocks: [], bodyParts: [], assistants: [], toolMessageIds: [], selections: new Map() })
    } else if (event.type === 'assistant/message') {
      const turn = turns.get(event.data.turn)
      if (!turn) continue
      turn.assistants.push(event)
      const selections = turn.selections.get(event.data.step)
      const speaker = selections?.[0]
      if (!speaker || selections?.length !== 1 || event.data.interrupted) continue
      const raw = event.data.message.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('')
      const text = roleplayReplyText(raw, speaker.speakerName)
      if (!text.trim()) continue
      const previous = turn.blocks.at(-1)
      const { speakerId, speakerName } = speaker
      const sameSpeaker = previous && (previous.speakerId && speakerId
        ? previous.speakerId === speakerId : previous.speakerName === speakerName)
      const block = sameSpeaker ? previous : { ...speaker }
      if (!sameSpeaker) turn.blocks.push(block)
      block.text = block.text ? `${block.text}\n\n${text}` : text
      turn.bodyParts.push({ messageId: event.data.message.id, blockId: block.id, text })
    } else if (event.type === 'tool/result') {
      const turn = turns.get(event.data.turn)
      if (!turn) continue
      turn.toolMessageIds.push(event.data.message.id)
      const meta = event.data.meta
      if (event.data.message.isError || !meta || typeof meta !== 'object' || Array.isArray(meta)
        || meta.source !== ROLEPLAY_REPLY_SOURCE) continue
      const speaker = meta.speaker
      if (!speaker || typeof speaker !== 'object' || Array.isArray(speaker) || typeof speaker.speakerName !== 'string') continue
      const bodyStep = event.data.step + 1
      const selections = turn.selections.get(bodyStep) ?? []
      selections.push({ id: `${event.data.message.source.callId}:0`, kind: 'speech', text: '', speakerName: speaker.speakerName,
        ...(typeof speaker.speakerId === 'string' ? { speakerId: speaker.speakerId } : {}) })
      turn.selections.set(bodyStep, selections)
    } else if (event.type === ROLEPLAY_OUTPUT_EVENT) {
      const turn = turns.get(event.data.turn)
      if (turn) {
        const original = turn.assistants.findLast(assistant => assistant.seq === event.data.replySeq)
        const bodyParts = event.data.toolBacked ? turn.bodyParts : []
        const messageId = event.data.toolBacked ? bodyParts.at(-1)?.messageId : original?.data.message.id
        const edited = event.data.editedText
        const { blocks } = turn
        const edits = new Map(event.data.editedBlocks?.map(block => [block.id, block.text]))
        const editedBlocks = blocks.map(block => {
          const text = edits.get(block.id) ?? (blocks.length === 1 ? edited : undefined)
          return text === undefined ? block : { ...block, text }
        })
        const content = event.data.toolBacked
          ? editedBlocks.map(block => `${block.speakerName}：${block.text}`).join('\n\n')
          : edited ?? original?.data.message.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('')
        if (messageId && content?.trim()) {
          replies.push({ event, messageId, content, blocks: editedBlocks, bodyParts,
            addressSeq: event.data.toolBacked ? Number(event.seq) : Number(event.data.replySeq),
            processMessageIds: [...turn.assistants.map(assistant => assistant.data.message.id), ...turn.toolMessageIds] })
        }
      }
      turns.delete(event.data.turn)
    } else if (event.type === 'turn/end') {
      turns.delete(event.data.turn)
    }
  }
  return replies
}
