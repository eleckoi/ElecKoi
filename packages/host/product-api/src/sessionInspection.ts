import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-session-query'
import type { SessionId } from '@deepseek-ai/dsh-session'

/** Read one complete, detached Session cut through the official query lease. */
export async function readSessionInspection(ctx: Context, sessionId: SessionId, signal?: AbortSignal) {
  using observation = await ctx.sessionQuery.observeSession(sessionId, { ...(signal ? { signal } : {}), projectionMode: 'none' })
  return {
    meta: structuredClone(observation.header),
    inheritedEventCount: observation.inheritedEventCount,
    events: structuredClone([...observation.events])
  }
}
