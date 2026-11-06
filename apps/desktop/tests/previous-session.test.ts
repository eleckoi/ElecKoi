/**
 * 上一次会话判定：最近一次"没有 ended 的过去会话"。
 *
 * 判据（[ADR 0042](../../docs/adr/0042-bug-report-delivery.md) 决定 15 与 User Story 12）：
 * 「上次异常结束」的结论不能因为多启动几次就变成「正常结束」。断言的是外部行为——
 * 纯函数 `previousSessionOf` 给定会话标记序列返回哪一次，以及从临时目录造的日志里读对；
 * **不断言**内部循环怎么写，也不断言读取了几个文件，只断言"读有上界"的结果。
 *
 * 全部写进 `mkdtempSync` 的临时目录，不碰真实 userData。
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  parseSessionEvents,
  previousSessionOf,
  readPreviousSession
} from '../src/main/modules/diagnostics/previousSession'

let userData: string

beforeEach(() => {
  userData = mkdtempSync(join(tmpdir(), 'eleckoi-previous-session-'))
})

afterEach(() => {
  rmSync(userData, { recursive: true, force: true })
})

/** 一行 pino 形状的会话标记（`time` 是 epoch 毫秒）。 */
function sessionLine(kind: 'started' | 'ended', sessionId: string, time: number): string {
  const action = kind === 'started' ? 'session.started' : 'session.ended'
  return JSON.stringify({ level: 30, time, action, sessionId, msg: '会话标记' })
}

/** 往 `<userData>/logs` 写一个日志文件。 */
function writeLog(name: string, lines: readonly string[]): void {
  const directory = join(userData, 'logs')
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, name), `${lines.join('\n')}\n`, 'utf8')
}

describe('判断上一次会话', () => {
  it('崩溃后正常退出了几次，仍然判出更早那次崩溃', () => {
    const events = parseSessionEvents([
      sessionLine('started', 'crash', Date.parse('2026-10-27T09:00:00.000Z')),
      sessionLine('started', 'normal', Date.parse('2026-10-27T10:00:00.000Z')),
      sessionLine('ended', 'normal', Date.parse('2026-10-27T10:30:00.000Z')),
      sessionLine('started', 'current', Date.parse('2026-10-27T11:00:00.000Z'))
    ])
    expect(previousSessionOf(events)).toEqual({
      startedAt: '2026-10-27T09:00:00.000Z',
      ended: false
    })
  })

  it('崩溃之后只启动一次：仍然是异常结束', () => {
    const events = parseSessionEvents([
      sessionLine('started', 'crash', Date.parse('2026-10-27T09:00:00.000Z')),
      sessionLine('started', 'current', Date.parse('2026-10-27T10:00:00.000Z'))
    ])
    expect(previousSessionOf(events)).toEqual({
      startedAt: '2026-10-27T09:00:00.000Z',
      ended: false
    })
  })

  it('之前每次都正常退出：返回最近一次已结束会话', () => {
    const events = parseSessionEvents([
      sessionLine('started', 'old', Date.parse('2026-10-26T09:00:00.000Z')),
      sessionLine('ended', 'old', Date.parse('2026-10-26T10:00:00.000Z')),
      sessionLine('started', 'recent', Date.parse('2026-10-27T09:00:00.000Z')),
      sessionLine('ended', 'recent', Date.parse('2026-10-27T10:00:00.000Z')),
      sessionLine('started', 'current', Date.parse('2026-10-27T11:00:00.000Z'))
    ])
    expect(previousSessionOf(events)).toEqual({
      startedAt: '2026-10-27T09:00:00.000Z',
      ended: true
    })
  })

  it('首次运行（只有一次开始）没有上一次会话', () => {
    expect(previousSessionOf(parseSessionEvents([sessionLine('started', 'current', 1000)]))).toBeUndefined()
    expect(previousSessionOf([])).toBeUndefined()
  })

  it('结束标记的 sessionId 对不上：那一次不算结束', () => {
    const events = parseSessionEvents([
      sessionLine('started', 'mine', Date.parse('2026-10-27T09:00:00.000Z')),
      sessionLine('ended', 'other', Date.parse('2026-10-27T09:30:00.000Z')),
      sessionLine('started', 'current', Date.parse('2026-10-27T10:00:00.000Z'))
    ])
    expect(previousSessionOf(events)).toEqual({
      startedAt: '2026-10-27T09:00:00.000Z',
      ended: false
    })
  })
})

describe('从磁盘读上一次会话', () => {
  it('崩溃标记在旧文件、本次开始在新文件：仍然判出异常结束', () => {
    writeLog('eleckoi-desktop-2026-10-26.log', [
      sessionLine('started', 'crash', Date.parse('2026-10-26T09:00:00.000Z'))
    ])
    writeLog('eleckoi-desktop-2026-10-27.log', [
      sessionLine('started', 'normal', Date.parse('2026-10-27T09:00:00.000Z')),
      sessionLine('ended', 'normal', Date.parse('2026-10-27T09:30:00.000Z')),
      sessionLine('started', 'current', Date.parse('2026-10-27T10:00:00.000Z'))
    ])
    expect(readPreviousSession(userData)).toEqual({
      startedAt: '2026-10-26T09:00:00.000Z',
      ended: false
    })
  })

  it('最多读 7 个日志文件：更旧文件里的崩溃标记不参与判断', () => {
    // 8 个文件刚好越过上限：10-01 的崩溃在读取范围之外，判定只看 10-02…10-08。
    for (let day = 1; day <= 8; day += 1) {
      const date = `2026-10-${String(day).padStart(2, '0')}`
      const start = Date.parse(`${date}T09:00:00.000Z`)
      const lines = day === 1
        ? [sessionLine('started', 'crash', start)]
        : day === 8
          ? [sessionLine('started', 'current', start)]
          : [
              sessionLine('started', `session-${day}`, start),
              sessionLine('ended', `session-${day}`, start + 30 * 60 * 1000)
            ]
      writeLog(`eleckoi-desktop-${date}.log`, lines)
    }
    expect(readPreviousSession(userData)).toEqual({
      startedAt: '2026-10-07T09:00:00.000Z',
      ended: true
    })
  })

  it('日志目录不存在：返回 undefined，不抛', () => {
    expect(readPreviousSession(join(userData, 'missing'))).toBeUndefined()
  })

  it('坏 JSON 与空文件：跳过，仍然不抛', () => {
    writeLog('eleckoi-desktop-2026-10-26.log', ['{坏掉的 JSON', '不是日志的半行'])
    writeLog('eleckoi-desktop-2026-10-27.log', [])
    expect(readPreviousSession(userData)).toBeUndefined()
  })
})
