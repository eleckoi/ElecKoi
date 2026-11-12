import { Session, SessionId, SessionLogOffset, SessionSeq, type SessionEvent, type SessionHeader } from '@deepseek-ai/dsh-session'
import { buildForkSeed } from '@deepseek-ai/dsh-session/fork'
import { sessionFormatCatalog } from '@deepseek-ai/dsh-session-format-catalog'

export interface DshSessionArchive {
  readonly header: SessionHeader
  readonly inheritedEventCount: number
  readonly events: readonly SessionEvent[]
}

/** Validate the archived cut before inheriting it into a distinct Session. */
export function importedSession(archive: DshSessionArchive, id: string, ids: ReadonlyMap<string, string>, cwd?: string): Session {
  const restore = sessionFormatCatalog.createRestore(
    sessionFormatCatalog.encodeCurrentHeader({ ...archive.header, delegationDepth: archive.header.delegationDepth ?? 0 } as unknown as Parameters<typeof sessionFormatCatalog.encodeCurrentHeader>[0], archive.inheritedEventCount),
    { recovery: 'strict', validation: 'current' },
  )
  for (const event of archive.events) restore.decodeRow(sessionFormatCatalog.encodeCurrentEvent(event as unknown as Parameters<typeof sessionFormatCatalog.encodeCurrentEvent>[0]))
  const validated = restore.finish()
  const events = (validated.events as unknown as SessionEvent[]).map(event => {
    const record = event as { type: string; data: { childId?: string } }
    if (record.type !== 'subagent/catalog') return event
    const data = record.data
    const childId = data.childId && ids.get(data.childId)
    return childId ? { ...event, data: { ...record.data, childId } } as unknown as SessionEvent : event
  })
  const parent = validated.header.parentSession
  const header = {
    ...validated.header, id: SessionId(id), isSeeded: true,
    ...(cwd === undefined ? {} : { cwd }),
    ...(typeof parent === 'string' ? { parentSession: ids.get(parent) ?? parent } : {}),
  } as SessionHeader
  // Delivery receipts keep the exact Session that was accepted by the endpoint.
  // The official inherited cut prevents their use as this new Session's watermark.
  const seed = events.length ? buildForkSeed(events, SessionSeq(events.length - 1)) : []
  return Session.create(SessionId(id), seed, header, SessionLogOffset(events.length))
}
