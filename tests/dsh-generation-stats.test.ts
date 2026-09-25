import { describe, expect, it } from 'vitest'
import {
  DshGenerationStatsProjector,
  emptyStoredGenerationStats,
  parseStoredGenerationStats,
  regenerationGenerationStats
} from '@eleckoi/dsh-runtime'

function sessionEvent(seq: number, type: string, data: Record<string, unknown>, time: number, surfaceOp?: unknown) {
  return {
    method: 'session.event',
    params: {
      sessionId: 'session-a',
      event: { seq, type, data, time, ...(surfaceOp === undefined ? {} : { surfaceOp }) }
    }
  } as never
}

describe('DSH generation statistics projection', () => {
  it('counts a new reply from durable attempt and compact message streams', () => {
    const projector = new DshGenerationStatsProjector()
    projector.project(sessionEvent(1, 'step/start', { turn: 1, step: 1 }, 1_000), 'session-a')
    projector.project(sessionEvent(2, 'assistant/attempt', {
      turn: 1, step: 1,
      stream: [{ type: 'reasoning-chunks', time0: 1_300, index: 0, dt: [], texts: ['思考'] }]
    }, 1_500), 'session-a')
    projector.project(sessionEvent(3, 'assistant/message', {
      turn: 1, step: 1,
      stream: [{ type: 'text-chunks', time0: 1_800, index: 0, dt: [], texts: ['回答'] }],
      usage: { inputTokens: 10, outputTokens: 60 },
      message: { content: [{ type: 'text', text: '回答' }] }
    }, 4_000, 'append'), 'session-a')
    const stats = projector.project(sessionEvent(4, 'step/end', { turn: 1, step: 1 }, 4_100), 'session-a')

    expect(stats).toMatchObject({
      turns: 1, steps: 1, llmMs: 3_000,
      ttftMs: 300, ttftSteps: 1, decodeMs: 2_700, decodeTokens: 60
    })
  })

  it('counts regenerated reply timing while retaining conversation totals', () => {
    const seed = regenerationGenerationStats({
      steps: 2, llmMs: 5_000, toolMs: 0,
      ttftMs: 0, ttftSteps: 0, decodeMs: 0, decodeTokens: 0,
      tokenUsage: { uncachedInputTokens: 20, outputTokens: 40, cacheReadTokens: 0, cacheWriteTokens: 0 }
    }, 2, { '1': 1, '2': 2 })
    const projector = new DshGenerationStatsProjector(seed)
    projector.project(sessionEvent(1, 'step/start', { turn: 1, step: 1 }, 10_000), 'session-a')
    projector.project(sessionEvent(2, 'assistant/message', {
      turn: 1, step: 1,
      stream: [{ type: 'text-chunks', time0: 10_400, index: 0, dt: [], texts: ['重试回复'] }],
      usage: { inputTokens: 8, outputTokens: 30 },
      message: { content: [{ type: 'text', text: '重试回复' }] }
    }, 12_000, 'append'), 'session-a')
    const stats = projector.project(sessionEvent(3, 'step/end', { turn: 1, step: 1 }, 12_100), 'session-a')

    expect(stats).toMatchObject({
      turns: 2, steps: 2, llmMs: 7_000,
      ttftMs: 400, ttftSteps: 1, decodeMs: 1_600, decodeTokens: 30
    })
  })

  it('removes rolled-away steps and keeps retained turns through repeated regeneration', () => {
    const original = new DshGenerationStatsProjector()
    let seq = 0
    for (const [turn, count] of [[1, 2], [2, 1], [3, 3]] as const) {
      for (let step = 1; step <= count; step += 1) {
        original.project(sessionEvent(++seq, 'step/end', { turn, step }, seq * 100), 'session-a')
      }
    }
    expect(original.snapshot()).toMatchObject({ turns: 3, steps: 6 })

    const firstSeed = regenerationGenerationStats(original.snapshot(), 2, original.stored().stepTotalsByTurn)
    expect(firstSeed).toMatchObject({ turns: 2, steps: 2, stepTotalsByTurn: { '1': 2 } })
    const regenerated = new DshGenerationStatsProjector(parseStoredGenerationStats(firstSeed))
    regenerated.project(sessionEvent(1, 'step/end', { turn: 1, step: 1 }, 100), 'session-a')
    regenerated.project(sessionEvent(2, 'step/end', { turn: 1, step: 2 }, 200), 'session-a')
    regenerated.project(sessionEvent(3, 'step/end', { turn: 2, step: 1 }, 300), 'session-a')
    expect(regenerated.snapshot()).toMatchObject({ turns: 3, steps: 5 })

    const secondSeed = regenerationGenerationStats(regenerated.snapshot(), 3, regenerated.stored().stepTotalsByTurn)
    expect(secondSeed).toMatchObject({ turns: 3, steps: 4, stepTotalsByTurn: { '1': 2, '2': 4 } })
    const repeated = new DshGenerationStatsProjector(secondSeed)
    expect(repeated.project(sessionEvent(1, 'step/end', { turn: 1, step: 1 }, 100), 'session-a'))
      .toMatchObject({ turns: 3, steps: 5 })

    expect(regenerationGenerationStats(repeated.snapshot(), 1, repeated.stored().stepTotalsByTurn).steps).toBe(0)
  })

  it('folds whole-session timing, tool duration and replacement token usage', () => {
    const projector = new DshGenerationStatsProjector()
    projector.project(sessionEvent(1, 'request/context', { contextWindow: 128_000 }, 0), 'session-a')
    projector.project(sessionEvent(2, 'step/start', { turn: 1, step: 1 }, 1_000), 'session-a')
    projector.project(sessionEvent(3, 'assistant/chunk', {
      turn: 1,
      step: 1,
      chunk: { type: 'text-delta', text: '开始' }
    }, 1_800), 'session-a')
    projector.project(sessionEvent(4, 'tool/call', { callId: 'call-a' }, 2_000), 'session-a')
    projector.project(sessionEvent(5, 'tool/result', {
      message: { source: { callId: 'call-a' }, content: [{ type: 'text', text: '完成' }] }
    }, 2_500), 'session-a')
    projector.project(sessionEvent(6, 'assistant/chunk', {
      turn: 1,
      step: 1,
      chunk: {
        type: 'usage',
        usage: { inputTokens: 6_000, outputTokens: 20, cacheReadTokens: 4_000, cacheWriteTokens: 0 }
      }
    }, 4_700), 'session-a')
    projector.project(sessionEvent(7, 'assistant/message', {
      turn: 1,
      step: 1,
      usage: { inputTokens: 6_000, outputTokens: 60, cacheReadTokens: 4_000, cacheWriteTokens: 0 },
      message: { content: [{ type: 'text', text: '最终回复' }] }
    }, 4_800), 'session-a')
    const stats = projector.project(sessionEvent(8, 'step/end', { turn: 1, step: 1 }, 4_900), 'session-a')

    expect(stats).toMatchObject({
      turns: 1,
      steps: 1,
      llmMs: 3_800,
      toolMs: 500,
      ttftMs: 800,
      ttftSteps: 1,
      decodeMs: 3_000,
      decodeTokens: 60,
      tokenUsage: {
        uncachedInputTokens: 6_000,
        outputTokens: 60,
        cacheReadTokens: 4_000,
        cacheWriteTokens: 0
      },
      contextPressure: { pressureTokens: 10_000, contextWindow: 128_000 }
    })
  })

  it('tracks surface movement for the projected context total and ignores subagents', () => {
    const projector = new DshGenerationStatsProjector()
    projector.project(sessionEvent(1, 'user/message', {
      content: [{ type: 'text', text: '12345678' }]
    }, 100, 'append'), 'session-a')
    projector.project(sessionEvent(2, 'assistant/chunk', {
      turn: 1,
      step: 1,
      chunk: { type: 'usage', usage: { inputTokens: 90, outputTokens: 10 } }
    }, 200), 'session-a')
    const ignored = {
      method: 'session.event',
      params: {
        sessionId: 'subagent',
        event: { seq: 3, type: 'step/end', data: { turn: 1, step: 1 }, time: 300 }
      }
    } as never
    expect(projector.project(ignored, 'session-a')).toBeUndefined()
    const stats = projector.project(sessionEvent(4, 'assistant/message', {
      turn: 1,
      step: 1,
      message: { content: [{ type: 'text', text: 'abcdefghijkl' }] }
    }, 400, 'append'), 'session-a')

    expect(stats?.contextPressure).toMatchObject({ pressureTokens: 90, projectedTokens: 101 })
    expect(stats?.contextBreakdown.messageTokens).toBe(21)
  })

  it('classifies the final surviving system surface exactly like the DSH token meter', () => {
    const projector = new DshGenerationStatsProjector()
    projector.project(sessionEvent(1, 'system/message', {
      turn: 1,
      step: 1,
      message: { role: 'system', content: [{ type: 'text', text: '12345678' }] }
    }, 100, 'append'), 'session-a')
    projector.project(sessionEvent(2, 'user/message', {
      role: 'user',
      content: [{ type: 'text', text: '12345678' }],
      source: { kind: 'plugin', plugin: 'eleckoi-conversation-context' }
    }, 110, 'append'), 'session-a')
    const stats = projector.project(sessionEvent(3, 'request/header', {
      header: { config: { provider: 'test', model: 'test' }, tools: [{ name: 'tool-a' }] }
    }, 120), 'session-a')

    expect(stats?.contextBreakdown).toEqual({
      systemTokens: 6,
      toolsTokens: 9,
      messageTokens: 10
    })
  })

  it('uses DSH startSeq and endSeq replacements for both pressure and breakdown', () => {
    const projector = new DshGenerationStatsProjector()
    projector.project(sessionEvent(1, 'user/message', {
      role: 'user', content: [{ type: 'text', text: '12345678' }]
    }, 100, 'append'), 'session-a')
    projector.project(sessionEvent(2, 'user/message', {
      role: 'user', content: [{ type: 'text', text: 'abcdefghijkl' }]
    }, 110, 'append'), 'session-a')
    projector.project(sessionEvent(3, 'assistant/chunk', {
      turn: 1,
      step: 1,
      chunk: { type: 'usage', usage: { inputTokens: 100, outputTokens: 5 } }
    }, 120), 'session-a')
    projector.project(sessionEvent(4, 'compaction/summary', {
      shadowedRange: { start: 1, end: 2 },
      shadowedTokenCount: 21
    }, 130), 'session-a')
    const stats = projector.project(sessionEvent(5, 'user/message', {
      role: 'user', content: [{ type: 'text', text: 'abcd' }]
    }, 140, { op: 'replace', startSeq: 1, endSeq: 2 }), 'session-a')

    expect(stats?.contextPressure).toMatchObject({ pressureTokens: 100, projectedTokens: 88 })
    expect(stats?.contextBreakdown).toMatchObject({ systemTokens: 0, messageTokens: 9 })
  })

  it('restores durable totals without reviving transient open work', () => {
    const stored = emptyStoredGenerationStats()
    stored.turns = 3
    stored.steps = 8
    stored.lastSeq = 42
    stored.openStep = { turn: 4, step: 1, startTime: 100, firstTokenTime: null }
    stored.pendingCalls = { stale: 120 }

    const parsed = parseStoredGenerationStats(stored)
    expect(parsed).toMatchObject({ turns: 3, steps: 8, lastSeq: 42, openStep: null, pendingCalls: {} })
  })

  it('keeps conversation totals while a fresh native thread replaces one retained turn', () => {
    const previous = new DshGenerationStatsProjector()
    previous.project(sessionEvent(1, 'assistant/chunk', {
      turn: 1, step: 1,
      chunk: { type: 'usage', usage: { inputTokens: 1_000, outputTokens: 100, cacheReadTokens: 2_000, cacheWriteTokens: 0 } }
    }, 100), 'session-a')
    previous.project(sessionEvent(2, 'step/end', { turn: 1, step: 1 }, 200), 'session-a')
    const seed = regenerationGenerationStats(previous.snapshot(), 58)
    expect(seed.contextPressure).toEqual({})
    expect(seed.contextBreakdown).toEqual({ systemTokens: 0, toolsTokens: 0, messageTokens: 0 })

    const restored = parseStoredGenerationStats(JSON.parse(JSON.stringify(seed)))
    expect(restored?.replaceFirstTurn).toBe(true)
    const regenerated = new DshGenerationStatsProjector(restored)
    regenerated.project(sessionEvent(1, 'assistant/chunk', {
      turn: 1, step: 1,
      chunk: { type: 'usage', usage: { inputTokens: 200, outputTokens: 20, cacheReadTokens: 300, cacheWriteTokens: 0 } }
    }, 300), 'session-a')
    const first = regenerated.project(sessionEvent(2, 'step/end', { turn: 1, step: 1 }, 400), 'session-a')
    expect(first).toMatchObject({
      turns: 58, steps: 2,
      tokenUsage: { uncachedInputTokens: 1_200, outputTokens: 120, cacheReadTokens: 2_300 }
    })
    const afterRestart = new DshGenerationStatsProjector(parseStoredGenerationStats(regenerated.stored()))
    expect(afterRestart.project(sessionEvent(3, 'step/end', { turn: 2, step: 1 }, 500), 'session-a'))
      .toMatchObject({ turns: 59, steps: 3 })
  })

  it('does not treat prototype names as pending tool calls', () => {
    const projector = new DshGenerationStatsProjector()
    const stats = projector.project(sessionEvent(1, 'tool/result', {
      message: { source: { callId: 'constructor' }, content: [] }
    }, 500), 'session-a')

    expect(stats).toBeUndefined()
    expect(projector.snapshot().toolMs).toBe(0)
  })
})
