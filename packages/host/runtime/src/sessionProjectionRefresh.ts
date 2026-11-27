import { Session, SessionId, SessionLogOffset, type SessionEvent, type SessionHeader, type SessionStore } from '@deepseek-ai/dsh-session'

export interface SessionProjectionRefreshContext {
  sessions: Pick<SessionStore, 'messageProjections'>
  sessionPersistence: {
    open(id: SessionId, access: 'read'): Promise<{
      header: SessionHeader
      inheritedEventCount: SessionLogOffset
      read(): Promise<{ events: readonly SessionEvent[] }>
      close(): Promise<void>
    }>
  }
  sessionProjections: {
    hydrate(session: Session, checkpoint: {}, events: readonly SessionEvent[], baseSeq: SessionLogOffset): unknown
  }
  sessionProjectionCache: { write(session: Session): Promise<void> }
}

/** Rebuild derived checkpoints after a closed log rewrite without trusting old sequence watermarks. */
export async function refreshSessionProjections(ctx: SessionProjectionRefreshContext, sessionId: string): Promise<void> {
  const handle = await ctx.sessionPersistence.open(SessionId(sessionId), 'read')
  try {
    const { events } = await handle.read()
    const session = Session.create(SessionId(sessionId), events, handle.header, handle.inheritedEventCount, ctx.sessions.messageProjections)
    ctx.sessionProjections.hydrate(session, {}, events, SessionLogOffset(0))
    await ctx.sessionProjectionCache.write(session)
  } finally { await handle.close() }
}
