const fields = { sticky: 'stickyUntil', cooldown: 'cooldownUntil', delay: 'delayUntilTurn' }

/** Timed commands edit the same state evaluated by the worldbook scanner. */
export function worldbookTimedEffect(state, entryId, kind, turn, duration, value) {
  const field = fields[kind]
  if (!field) throw new TypeError(`未知世界书计时效果：${kind}`)
  if (!Number.isSafeInteger(turn) || turn < 0) throw new TypeError('世界书消息计数无效。')
  const next = structuredClone(state ?? { version: 1, entries: {} })
  next.entries ??= {}
  const timer = next.entries[entryId] ?? {}
  if (value !== undefined) {
    const normalized = typeof value === 'string' ? value.toLowerCase().trim() : value
    const enabled = normalized === true || normalized === 1 || ['true', 'on', '1'].includes(normalized)
    if (!enabled && normalized !== false && normalized !== 0 && !['false', 'off', '0'].includes(normalized))
      throw new TypeError('计时效果状态必须为 on/off 或 true/false。')
    if (!Number.isSafeInteger(duration) || duration < 0) throw new TypeError('计时效果时长必须为非负整数。')
    timer[field] = enabled ? turn + duration : turn
    next.entries[entryId] = timer
  }
  const remaining = Math.max(0, Number(timer[field] ?? 0) - turn)
  return { state: next, active: remaining > 0, remaining }
}
