import type { SessionEvent, SessionHeader, SessionId } from '@deepseek-ai/dsh-session'

export function queryFromInspection(inspect: (id: SessionId) => Promise<{
  meta: SessionHeader; events: readonly SessionEvent[]; inheritedEventCount?: number
}>): {
  observeSession(id: SessionId): Promise<{
    header: SessionHeader; events: readonly SessionEvent[]; inheritedEventCount: number; [Symbol.dispose](): void
  }>
}
