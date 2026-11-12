import type { SessionEvent } from '@deepseek-ai/dsh-session'

/** User model preferences survive message deletion and regeneration on the same Session. */
export function retainSessionModelPreferences(retained: SessionEvent[], original: readonly SessionEvent[]): SessionEvent[] {
  for (const type of ['model/selection', 'eleckoi/model-parameters']) {
    const latest = original.findLast(event => event.type === type)
    if (!latest || retained.includes(latest)) continue
    retained.push({ ...latest, seq: (retained.at(-1)?.seq ?? -1) + 1 } as SessionEvent)
  }
  return retained
}
