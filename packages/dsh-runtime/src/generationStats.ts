import type { HarnessNotification } from '@deepseek-ai/dsh-sdk-client'

export interface DshTokenUsageStats {
  uncachedInputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

export interface DshContextPressureStats {
  pressureTokens?: number
  projectedTokens?: number
  contextWindow?: number
}

export interface DshContextBreakdownStats {
  systemTokens: number
  toolsTokens: number
  messageTokens: number
}

export interface DshGenerationStats {
  turns: number
  steps: number
  llmMs: number
  toolMs: number
  ttftMs: number
  ttftSteps: number
  decodeMs: number
  decodeTokens: number
  tokenUsage: DshTokenUsageStats
  contextPressure: DshContextPressureStats
  contextBreakdown: DshContextBreakdownStats
}

interface UsageSample {
  turn: number
  step: number
  buckets: DshTokenUsageStats
}

interface SurfaceClaim {
  start: number
  end: number
  tokens: number
}

export interface StoredDshGenerationStats extends DshGenerationStats {
  version: 1
  lastSeq: number
  lastTurn: number | null
  openStep: { turn: number; step: number; startTime: number; firstTokenTime: number | null } | null
  pendingCalls: Record<string, number>
  lastUsage: UsageSample | null
  surfaceTokens: number
  sampledSurfaceTokens?: number
  surfaceClaim?: SurfaceClaim
}

const zeroUsage = (): DshTokenUsageStats => ({
  uncachedInputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0
})

export function emptyStoredGenerationStats(): StoredDshGenerationStats {
  return {
    version: 1,
    lastSeq: 0,
    turns: 0,
    steps: 0,
    llmMs: 0,
    toolMs: 0,
    ttftMs: 0,
    ttftSteps: 0,
    decodeMs: 0,
    decodeTokens: 0,
    tokenUsage: zeroUsage(),
    contextPressure: {},
    contextBreakdown: { systemTokens: 0, toolsTokens: 0, messageTokens: 0 },
    lastTurn: null,
    openStep: null,
    pendingCalls: {},
    lastUsage: null,
    surfaceTokens: 0
  }
}

/**
 * Browser-independent fold of the DSH session event stream. Its fields and
 * replacement rules mirror DSH's sessionStats and token-meter projections.
 */
export class DshGenerationStatsProjector {
  constructor(private state: StoredDshGenerationStats = emptyStoredGenerationStats()) {}

  project(notification: HarnessNotification, rootSessionId: string): DshGenerationStats | undefined {
    if (notification.method !== 'session.event' || notification.params.sessionId !== rootSessionId) return undefined
    const event = record(notification.params.event)
    if (!event) return undefined
    const type = string(event.type)
    const seq = integer(event.seq)
    const time = number(event.time)
    const data = record(event.data) ?? {}
    if (!type || seq === undefined || time === undefined || seq <= this.state.lastSeq) return undefined

    let changed = false
    const turn = integer(data.turn)
    const step = integer(data.step)

    if (type === 'step/start' && turn !== undefined && step !== undefined) {
      this.state.openStep = { turn, step, startTime: time, firstTokenTime: null }
      changed = true
    } else if (type === 'assistant/chunk') {
      const chunk = record(data.chunk)
      const open = this.state.openStep
      if (open && open.turn === turn && open.step === step && open.firstTokenTime === null && isTokenDelta(chunk)) {
        open.firstTokenTime = time
        changed = true
      }
      const usage = chunk?.type === 'usage' ? record(chunk.usage) : undefined
      if (turn !== undefined && step !== undefined && usage && this.applyUsage(turn, step, usage)) changed = true
    } else if (type === 'assistant/message' && turn !== undefined && step !== undefined) {
      const open = this.state.openStep
      if (open && open.turn === turn && open.step === step) {
        this.state.llmMs += Math.max(0, time - open.startTime)
        if (open.firstTokenTime !== null) {
          this.state.ttftMs += Math.max(0, open.firstTokenTime - open.startTime)
          this.state.ttftSteps += 1
          const usage = record(data.usage)
          const outputTokens = usage ? nonnegativeInteger(usage.outputTokens) : undefined
          if (outputTokens !== undefined) {
            this.state.decodeMs += Math.max(0, time - open.firstTokenTime)
            this.state.decodeTokens += outputTokens
          }
        }
        this.state.openStep = null
        changed = true
      }
      const usage = record(data.usage)
      if (usage && this.applyUsage(turn, step, usage)) changed = true
    } else if (type === 'tool/call') {
      const callId = string(data.callId)
      if (callId) {
        this.state.pendingCalls[callId] = time
        changed = true
      }
    } else if (type === 'tool/result') {
      const callId = string(record(record(data.message)?.source)?.callId)
      const startedAt = callId && Object.hasOwn(this.state.pendingCalls, callId)
        ? this.state.pendingCalls[callId]
        : undefined
      if (callId && startedAt !== undefined) {
        this.state.toolMs += Math.max(0, time - startedAt)
        delete this.state.pendingCalls[callId]
        changed = true
      }
    } else if (type === 'step/end' && turn !== undefined) {
      this.state.turns += this.state.lastTurn === turn ? 0 : 1
      this.state.steps += 1
      this.state.lastTurn = turn
      this.state.openStep = null
      changed = true
    } else if (type === 'turn/end' && Object.keys(this.state.pendingCalls).length > 0) {
      this.state.pendingCalls = {}
      changed = true
    } else if (type === 'request/context') {
      const contextWindow = positiveInteger(data.contextWindow)
      if (contextWindow !== this.state.contextPressure.contextWindow) {
        this.state.contextPressure = contextWindow === undefined
          ? withoutContextWindow(this.state.contextPressure)
          : { ...this.state.contextPressure, contextWindow }
        changed = true
      }
    } else if (type === 'request/header') {
      const header = record(data.header)
      const system = typeof header?.system === 'string' ? header.system : undefined
      const tools = Array.isArray(header?.tools) ? header.tools : undefined
      const systemTokens = system === undefined ? 0 : Math.ceil(system.length / 4) + 4
      const toolsTokens = !tools?.length ? 0 : Math.ceil(JSON.stringify(tools).length / 4) + 4
      if (systemTokens !== this.state.contextBreakdown.systemTokens || toolsTokens !== this.state.contextBreakdown.toolsTokens) {
        this.state.contextBreakdown = { ...this.state.contextBreakdown, systemTokens, toolsTokens }
        changed = true
      }
    }

    const usage = usageFromEvent(type, data)
    if (usage && this.applyPressure(usage)) changed = true
    if (this.applySurface(type, event, data)) changed = true

    if (!changed) return undefined
    this.state.lastSeq = seq
    this.refreshContextView()
    return this.snapshot()
  }

  snapshot(): DshGenerationStats {
    return {
      turns: this.state.turns,
      steps: this.state.steps,
      llmMs: this.state.llmMs,
      toolMs: this.state.toolMs,
      ttftMs: this.state.ttftMs,
      ttftSteps: this.state.ttftSteps,
      decodeMs: this.state.decodeMs,
      decodeTokens: this.state.decodeTokens,
      tokenUsage: { ...this.state.tokenUsage },
      contextPressure: { ...this.state.contextPressure },
      contextBreakdown: { ...this.state.contextBreakdown }
    }
  }

  stored(): StoredDshGenerationStats {
    return JSON.parse(JSON.stringify(this.state)) as StoredDshGenerationStats
  }

  private applyUsage(turn: number, step: number, usage: Record<string, unknown>): boolean {
    const buckets = usageBuckets(usage)
    if (!buckets) return false
    const previous = this.state.lastUsage?.turn === turn && this.state.lastUsage.step === step
      ? this.state.lastUsage.buckets
      : zeroUsage()
    if (sameUsage(previous, buckets) && this.state.lastUsage?.turn === turn && this.state.lastUsage.step === step) return false
    this.state.tokenUsage = {
      uncachedInputTokens: this.state.tokenUsage.uncachedInputTokens - previous.uncachedInputTokens + buckets.uncachedInputTokens,
      outputTokens: this.state.tokenUsage.outputTokens - previous.outputTokens + buckets.outputTokens,
      cacheReadTokens: this.state.tokenUsage.cacheReadTokens - previous.cacheReadTokens + buckets.cacheReadTokens,
      cacheWriteTokens: this.state.tokenUsage.cacheWriteTokens - previous.cacheWriteTokens + buckets.cacheWriteTokens
    }
    this.state.lastUsage = { turn, step, buckets }
    return true
  }

  private applyPressure(usage: Record<string, unknown>): boolean {
    const buckets = usageBuckets(usage)
    if (!buckets) return false
    const pressureTokens = buckets.uncachedInputTokens + buckets.cacheReadTokens + buckets.cacheWriteTokens
    if (pressureTokens === this.state.contextPressure.pressureTokens
      && this.state.sampledSurfaceTokens === this.state.surfaceTokens) return false
    this.state.contextPressure = { ...this.state.contextPressure, pressureTokens }
    this.state.sampledSurfaceTokens = this.state.surfaceTokens
    return true
  }

  private applySurface(type: string, event: Record<string, unknown>, data: Record<string, unknown>): boolean {
    if (type === 'compaction/summary' || type === 'compaction/prune') {
      const range = record(data.shadowedRange)
      const start = nonnegativeInteger(range?.start)
      const end = nonnegativeInteger(range?.end)
      const tokens = nonnegativeInteger(data.shadowedTokenCount)
      if (start === undefined || end === undefined || tokens === undefined) return false
      this.state.surfaceClaim = { start, end, tokens }
      return true
    }

    const surfaceOp = event.surfaceOp
    const surfaceMessage = type === 'user/message'
      ? data
      : type === 'assistant/message' || type === 'tool/result'
        ? record(data.message)
        : undefined
    if (!surfaceMessage || surfaceOp === undefined) {
      if (!this.state.surfaceClaim) return false
      delete this.state.surfaceClaim
      return true
    }

    const tokens = estimateMessage(surfaceMessage)
    let delta = 0
    if (surfaceOp === 'append') {
      delta = tokens
    } else {
      const operation = record(surfaceOp)
      const claim = this.state.surfaceClaim
      if (operation?.op === 'replace' && claim
        && operation.start === claim.start && operation.end === claim.end) {
        delta = tokens - claim.tokens
      }
    }
    delete this.state.surfaceClaim
    if (delta === 0) return false
    this.state.surfaceTokens = Math.max(0, this.state.surfaceTokens + delta)
    return true
  }

  private refreshContextView(): void {
    const pressureTokens = this.state.contextPressure.pressureTokens
    this.state.contextBreakdown = { ...this.state.contextBreakdown, messageTokens: this.state.surfaceTokens }
    if (pressureTokens === undefined || this.state.sampledSurfaceTokens === undefined) return
    this.state.contextPressure = {
      ...this.state.contextPressure,
      projectedTokens: Math.max(0, pressureTokens + this.state.surfaceTokens - this.state.sampledSurfaceTokens)
    }
  }
}

export function parseStoredGenerationStats(value: unknown): StoredDshGenerationStats | undefined {
  const item = record(value)
  if (item?.version !== 1) return undefined
  const base = emptyStoredGenerationStats()
  const tokenUsage = record(item.tokenUsage)
  const pressure = record(item.contextPressure)
  const breakdown = record(item.contextBreakdown)
  if (!tokenUsage || !pressure || !breakdown) return undefined
  const required = ['turns', 'steps', 'llmMs', 'toolMs', 'ttftMs', 'ttftSteps', 'decodeMs', 'decodeTokens', 'surfaceTokens', 'lastSeq']
  if (required.some((key) => nonnegativeNumber(item[key]) === undefined)) return undefined
  const parsedUsage = usageBuckets({
    inputTokens: tokenUsage.uncachedInputTokens,
    outputTokens: tokenUsage.outputTokens,
    cacheReadTokens: tokenUsage.cacheReadTokens,
    cacheWriteTokens: tokenUsage.cacheWriteTokens
  })
  if (!parsedUsage) return undefined
  const pressureTokens = nonnegativeInteger(pressure.pressureTokens)
  const projectedTokens = nonnegativeInteger(pressure.projectedTokens)
  const contextWindow = positiveInteger(pressure.contextWindow)
  return {
    ...base,
    ...(item as unknown as StoredDshGenerationStats),
    tokenUsage: parsedUsage,
    contextPressure: {
      ...(pressureTokens === undefined ? {} : { pressureTokens }),
      ...(projectedTokens === undefined ? {} : { projectedTokens }),
      ...(contextWindow === undefined ? {} : { contextWindow })
    },
    contextBreakdown: {
      systemTokens: nonnegativeInteger(breakdown.systemTokens) ?? 0,
      toolsTokens: nonnegativeInteger(breakdown.toolsTokens) ?? 0,
      messageTokens: nonnegativeInteger(breakdown.messageTokens) ?? 0
    },
    openStep: null,
    pendingCalls: {}
  }
}

function usageFromEvent(type: string, data: Record<string, unknown>): Record<string, unknown> | undefined {
  if (type === 'assistant/message') return record(data.usage)
  const chunk = type === 'assistant/chunk' ? record(data.chunk) : undefined
  return chunk?.type === 'usage' ? record(chunk.usage) : undefined
}

function usageBuckets(usage: Record<string, unknown>): DshTokenUsageStats | undefined {
  const inputTokens = nonnegativeInteger(usage.inputTokens)
  const outputTokens = nonnegativeInteger(usage.outputTokens)
  if (inputTokens === undefined || outputTokens === undefined) return undefined
  return {
    uncachedInputTokens: inputTokens,
    outputTokens,
    cacheReadTokens: nonnegativeInteger(usage.cacheReadTokens) ?? 0,
    cacheWriteTokens: nonnegativeInteger(usage.cacheWriteTokens) ?? 0
  }
}

function sameUsage(left: DshTokenUsageStats, right: DshTokenUsageStats): boolean {
  return left.uncachedInputTokens === right.uncachedInputTokens
    && left.outputTokens === right.outputTokens
    && left.cacheReadTokens === right.cacheReadTokens
    && left.cacheWriteTokens === right.cacheWriteTokens
}

function isTokenDelta(chunk: Record<string, unknown> | undefined): boolean {
  if (!chunk) return false
  if (chunk.type === 'text-delta' || chunk.type === 'reasoning-delta') return string(chunk.text).length > 0
  return chunk.type === 'tool-call-delta' && (string(chunk.argumentsDelta).length > 0 || typeof chunk.name === 'string')
}

function estimateMessage(message: Record<string, unknown>): number {
  return estimateContent(Array.isArray(message.content) ? message.content : []) + 4
}

function estimateContent(blocks: unknown[]): number {
  let tokens = 0
  for (const value of blocks) {
    const block = record(value)
    if (!block) continue
    if (block.type === 'text' || block.type === 'reasoning') {
      tokens += Math.ceil(string(block.text).length / 4) + 4
    } else if (block.type === 'tool-call') {
      tokens += Math.ceil(string(block.name).length / 4) + Math.ceil(string(block.arguments).length / 4) + 4
    } else if (block.type === 'tool-result') {
      tokens += estimateContent(Array.isArray(block.content) ? block.content : []) + 4
    } else {
      tokens += Math.ceil(JSON.stringify(block).length / 4) + 4
    }
  }
  return tokens
}

function withoutContextWindow(value: DshContextPressureStats): DshContextPressureStats {
  const { contextWindow: _removed, ...rest } = value
  return rest
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function string(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function number(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function nonnegativeNumber(value: unknown): number | undefined {
  const parsed = number(value)
  return parsed !== undefined && parsed >= 0 ? parsed : undefined
}

function integer(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) ? value : undefined
}

function nonnegativeInteger(value: unknown): number | undefined {
  const parsed = integer(value)
  return parsed !== undefined && parsed >= 0 ? parsed : undefined
}

function positiveInteger(value: unknown): number | undefined {
  const parsed = integer(value)
  return parsed !== undefined && parsed > 0 ? parsed : undefined
}
