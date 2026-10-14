import { Session, SessionId, SessionLogOffset, interruptedTurnClosers } from '@deepseek-ai/dsh-session'
import { materializeAppendBatch } from '@deepseek-ai/dsh-session-persistence'
import { currentSessionMessageProjections } from '@deepseek-ai/dsh-session-format-catalog/message-projections'
import { expandAssistantStream } from '@deepseek-ai/dsh-llm'

/** SDK boundary: durable current-format JSON is validated by the official Session restorer. */
export function restoreFormatSession(artifact) {
  return Session.fromRestore(SessionId(artifact.header.id), artifact.events, artifact.header,
    SessionLogOffset(artifact.inheritedEventCount), 'detached', currentSessionMessageProjections)
}

/** The native persistence admission takes the lossless JSON snapshot, including unknown fields. */
export function runtimeEventToFormat(event) {
  return materializeAppendBatch([event])[0]
}

export function interruptedFormatClosers(artifact) {
  // Restoring opens a live boundary marker; the durable prefix being rewritten excludes it.
  const prefix = restoreFormatSession(artifact).snapshotEvents(SessionLogOffset(0), SessionLogOffset(artifact.events.length))
  return interruptedTurnClosers(prefix).map(runtimeEventToFormat)
}

/** Streams read from disk must use the SDK's validating expander before block inspection. */
export function storedAssistantBlocks(stream) {
  if (!Array.isArray(stream)) throw new TypeError('正式 AI 事件缺少流记录数组。')
  return expandAssistantStream(stream).flatMap(({ chunk }) => chunk.type === 'block-end' ? [chunk.block] : [])
}
