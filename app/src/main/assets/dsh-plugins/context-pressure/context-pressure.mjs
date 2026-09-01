/** Sends DSH's client-visible contextPressure projection to the Android presentation host. */

export const name = 'eleckoi-context-pressure-bridge'

export function apply(ctx, config = {}) {
  const baseUrl = requireLoopbackUrl(config.baseUrl)
  const pendingBySession = new Map()
  const activeSessions = new Set()

  ctx.inject(['sessionProjections'], (projectionCtx) => {
    projectionCtx.sessionProjections.onChanged((session, key, value, seq) => {
      if (key !== 'contextPressure') return
      const sessionId = session?.id
      if (typeof sessionId !== 'string' || !/^[A-Za-z0-9._:-]{1,160}$/.test(sessionId)) return
      if (!Number.isSafeInteger(seq) || seq < 0) return
      const pressure = normalizeContextPressure(value)
      if (pressure === undefined) return
      pendingBySession.set(sessionId, { sessionId, seq, value: pressure })
      if (!activeSessions.has(sessionId)) void drain(sessionId)
    })
  })

  async function drain(sessionId) {
    activeSessions.add(sessionId)
    try {
      while (pendingBySession.has(sessionId)) {
        const payload = pendingBySession.get(sessionId)
        pendingBySession.delete(sessionId)
        try {
          await postJson(`${baseUrl}/context-pressure`, payload)
        } catch {
          // The screen may release its route between a native projection event and delivery.
          // This bridge is observational; a later native change carries the complete fresh value.
        }
      }
    } finally {
      activeSessions.delete(sessionId)
      if (pendingBySession.has(sessionId)) void drain(sessionId)
    }
  }
}

function normalizeContextPressure(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const normalized = {}
  for (const key of ['pressureTokens', 'projectedTokens']) {
    const candidate = value[key]
    if (candidate === undefined) continue
    if (!Number.isSafeInteger(candidate) || candidate < 0) return undefined
    normalized[key] = candidate
  }
  if (value.contextWindow !== undefined) {
    if (!Number.isSafeInteger(value.contextWindow) || value.contextWindow <= 0) return undefined
    normalized.contextWindow = value.contextWindow
  }
  return normalized
}

function requireLoopbackUrl(value) {
  if (typeof value !== 'string' || !/^http:\/\/127\.0\.0\.1:\d{1,5}\/[A-Za-z0-9_-]{24,128}\/host-tools$/.test(value)) {
    throw new Error('ElecKoi context-pressure URL is not a session-scoped loopback route')
  }
  return value
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`ElecKoi context-pressure bridge HTTP ${response.status}: ${text.slice(0, 500)}`)
  }
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('ElecKoi context-pressure bridge returned non-JSON content')
  }
}
