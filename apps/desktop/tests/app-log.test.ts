/**
 * 主进程日志：落盘、失败行、轮转纯函数、会话首尾标记。
 *
 * 断言的是外部行为（判据：日志一行能读出码、开发者文案、参数化详情与操作名）：
 * 文件里读得到那几行、一行里同时有码与开发者文案与详情、轮转计划在三种情形下分别给什么动作、
 * 崩溃路径只有 start 没有 end。**不断言**私有函数被调用了几次。
 *
 * 全部写进 `mkdtempSync` 的临时目录，不碰真实 userData。
 */
import { EventEmitter } from 'node:events'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes'
import { LOG_ACTIONS } from '@shared/contracts/logActions'
import { DesktopError } from '@shared/foundation/DesktopError'
import { describeAction, formatActionLogMessage } from '@shared/foundation/actionLog'
import {
  APP_LOG_SESSION_END,
  APP_LOG_SESSION_START,
  createAppLog,
  logAppSessionEnd,
  logAppSessionStart
} from '../src/main/platform/logging/AppLog'
import { logAction, relayRendererActionLog } from '../src/main/platform/logging/logActions'
import {
  APP_LOG_MAX_BYTES,
  planAppLogRotation,
  type AppLogFileEntry
} from '../src/main/platform/logging/logRotation'
import { installProcessFailureLogging } from '../src/main/platform/logging/processFailureLogging'
import { formatHostDiagnostic } from '../../../packages/host/runtime/src/hostDiagnostics'

/** 固定"今天"，让日志文件名与轮转年龄可断言。 */
const NOW = new Date(2026, 9, 15, 9, 30, 0)
const TODAY = '2026-10-15'
const TODAY_LOG = 'eleckoi-desktop-2026-10-15.log'

let userData: string

beforeEach(() => {
  userData = mkdtempSync(join(tmpdir(), 'eleckoi-app-log-'))
})

afterEach(() => {
  try {
    rmSync(userData, { recursive: true, force: true })
  } catch (error) {
    // Windows 上日志文件可能还被 pino 的同步 fd 打开；残留临时目录不影响判据。
    console.warn('临时日志目录清理失败', error)
  }
})

/** 当日日志文件的完整路径（按命名约定拼，不借被测的 helper 自证）。 */
function logFile(): string {
  return join(userData, 'logs', TODAY_LOG)
}

/** 逐行解析 JSON 日志。 */
function logLines(): Record<string, unknown>[] {
  return readFileSync(logFile(), 'utf8')
    .trim()
    .split('\n')
    .filter(line => line.length > 0)
    .map(line => JSON.parse(line) as Record<string, unknown>)
}

function entry(name: string, size = 0): AppLogFileEntry {
  return { name, size }
}

describe('日志落盘', () => {
  it('把日志写进 <userData>/logs 的当日文件，行里带结构化字段', () => {
    const log = createAppLog(userData, NOW)
    log.info({ logFile: logFile() }, '探针：日志真的落盘')

    expect(existsSync(logFile())).toBe(true)
    expect(logLines().at(-1)).toMatchObject({
      level: 30,
      name: 'eleckoi-desktop',
      process: 'main',
      msg: '探针：日志真的落盘'
    })
  })

  it('日志目录建不出来时降级为只写 stdout，不把启动拖垮', () => {
    // 用"文件占住日志目录的位置"制造一个必然失败的 mkdir。
    writeFileSync(join(userData, 'blocked'), '不是目录')
    expect(() => createAppLog(join(userData, 'blocked'), NOW)).not.toThrow()
  })

  it('崩溃行同时带码、开发者文案与参数化详情', () => {
    const log = createAppLog(userData, NOW)
    const events = new EventEmitter()
    installProcessFailureLogging(log, formatHostDiagnostic, events)
    events.emit(
      'uncaughtExceptionMonitor',
      new DesktopError(ELECKOI_FAILURE_CODES.characterNotFound, '角色卡不存在：角色卡 abc.json', { what: '角色卡' }),
      'uncaughtException'
    )

    const line = logLines().at(-1)
    expect(line).toMatchObject({
      level: 50,
      event: 'uncaughtExceptionMonitor',
      origin: 'uncaughtException',
      code: ELECKOI_FAILURE_CODES.characterNotFound,
      message: '角色卡不存在：角色卡 abc.json',
      details: { what: '角色卡' }
    })
    expect(line?.err).toMatchObject({ type: 'DesktopError', message: '角色卡不存在：角色卡 abc.json' })
  })

  it('未处理的 Promise 拒绝也写一行', () => {
    const log = createAppLog(userData, NOW)
    const events = new EventEmitter()
    installProcessFailureLogging(log, formatHostDiagnostic, events)
    events.emit('unhandledRejection', new Error('拒绝探针'), Promise.resolve())

    expect(logLines().at(-1)).toMatchObject({
      level: 50,
      event: 'unhandledRejection',
      code: ELECKOI_FAILURE_CODES.internal,
      message: '拒绝探针'
    })
  })

  it('只装 uncaughtExceptionMonitor，不装会接管默认崩溃行为的 uncaughtException', () => {
    const events = new EventEmitter()
    installProcessFailureLogging(createAppLog(userData, NOW), formatHostDiagnostic, events)

    expect(events.listenerCount('unhandledRejection')).toBe(1)
    expect(events.listenerCount('uncaughtExceptionMonitor')).toBe(1)
    expect(events.listenerCount('uncaughtException')).toBe(0)
  })
})

describe('轮转纯函数', () => {
  it('当日文件超过阈值：改名成 .1，旧的 .1 先删掉（只保留一份）', () => {
    const actions = planAppLogRotation({
      today: TODAY,
      maxBytes: 1024,
      entries: [entry(TODAY_LOG, 1025), entry(`${TODAY_LOG}.1`, 32)]
    })

    expect(actions).toEqual([
      { action: 'delete', name: `${TODAY_LOG}.1`, reason: 'replaced' },
      { action: 'rename', from: TODAY_LOG, to: `${TODAY_LOG}.1` }
    ])
  })

  it('7 天前及更早的文件删掉（含轮转副本），今天与前 6 天留着', () => {
    const actions = planAppLogRotation({
      today: TODAY,
      entries: [
        entry('eleckoi-desktop-2026-10-08.log', 10),
        entry('eleckoi-desktop-2026-10-07.log.1', 10),
        entry('eleckoi-desktop-2026-10-09.log', 10),
        entry(TODAY_LOG, 10)
      ]
    })

    expect(actions).toEqual([
      { action: 'delete', name: 'eleckoi-desktop-2026-10-08.log', reason: 'expired' },
      { action: 'delete', name: 'eleckoi-desktop-2026-10-07.log.1', reason: 'expired' }
    ])
  })

  it('没有超大文件、没有过期文件时无事可做', () => {
    expect(planAppLogRotation({
      today: TODAY,
      entries: [entry(TODAY_LOG, 100), entry('eleckoi-desktop-2026-10-14.log', 100)]
    })).toEqual([])
  })

  it('建日志时真的执行轮转：超大的当日文件被改名成 .1', () => {
    // 先摆一个超大的"今天的日志"再建实例：轮转发生在 pino 打开文件之前（启动时），
    // 所以这里没有"重命名一个仍被打开的文件"的跨平台问题。
    mkdirSync(join(userData, 'logs'), { recursive: true })
    const oversized = APP_LOG_MAX_BYTES + 1
    writeFileSync(logFile(), 'x'.repeat(oversized))
    createAppLog(userData, NOW)

    expect(existsSync(`${logFile()}.1`)).toBe(true)
    expect(readFileSync(`${logFile()}.1`, 'utf8').length).toBe(oversized)
  })
})

describe('会话首尾标记', () => {
  it('正常退出：start 与 end 成对，start 行带日志文件路径', () => {
    const log = createAppLog(userData, NOW)
    const sessionId = logAppSessionStart(log, logFile())
    logAppSessionEnd(log, sessionId)

    const lines = logLines()
    expect(lines.map(line => line.msg)).toEqual([APP_LOG_SESSION_START, APP_LOG_SESSION_END])
    expect(lines[0]?.logFile).toBe(logFile())
  })

  it('首尾两行带语义键与同一个配对标识（session.started / session.ended）', () => {
    const log = createAppLog(userData, NOW)
    const sessionId = logAppSessionStart(log, logFile())
    logAppSessionEnd(log, sessionId)

    const [start, end] = logLines()
    expect(start).toMatchObject({ action: LOG_ACTIONS.sessionStarted, sessionId })
    expect(end).toMatchObject({ action: LOG_ACTIONS.sessionEnded, sessionId })
    expect(sessionId).not.toBe('')
  })

  it('两次启动的配对标识不同（不能靠「日志里只有一个 end」蒙混成对）', () => {
    const log = createAppLog(userData, NOW)
    const first = logAppSessionStart(log, logFile())
    logAppSessionEnd(log, first)
    const second = logAppSessionStart(log, logFile())

    expect(second).not.toBe(first)
    const ids = logLines().map(line => line.sessionId)
    expect(ids).toEqual([first, first, second])
  })

  it('崩溃路径：只有 start，没有 end，崩溃本身还有一行', () => {
    const log = createAppLog(userData, NOW)
    logAppSessionStart(log, logFile())
    const events = new EventEmitter()
    installProcessFailureLogging(log, formatHostDiagnostic, events)
    events.emit('uncaughtExceptionMonitor', new Error('崩溃探针'), 'uncaughtException')

    const text = readFileSync(logFile(), 'utf8')
    expect(text).toContain(APP_LOG_SESSION_START)
    expect(text).not.toContain(APP_LOG_SESSION_END)
    expect(logLines().map(line => line.msg)).toEqual([APP_LOG_SESSION_START, '主进程出现未捕获异常'])
    // 崩溃路径上 start 仍然带语义键，维护者据此确认「这次是异常终止」。
    expect(logLines()[0]).toMatchObject({ action: LOG_ACTIONS.sessionStarted })
  })
})

describe('动作语义键', () => {
  it('成功动作写一行：带动作键与阶段，正文读得出在做什么', () => {
    const log = createAppLog(userData, NOW)
    logAction(log, LOG_ACTIONS.presetSave, 'success')

    expect(logLines().at(-1)).toMatchObject({
      level: 30,
      action: LOG_ACTIONS.presetSave,
      phase: 'success'
    })
    expect(logLines().at(-1)?.msg).toContain(LOG_ACTIONS.presetSave)
  })

  it('失败动作一行里同时有动作键、契约码、开发者文案与详情', () => {
    const log = createAppLog(userData, NOW)
    logAction(log, LOG_ACTIONS.characterImport, 'failure', new DesktopError(
      ELECKOI_FAILURE_CODES.characterNotFound,
      '角色卡不存在：角色卡 abc.json',
      { what: '角色卡' }
    ))

    const line = logLines().at(-1)
    expect(line).toMatchObject({
      level: 50,
      action: LOG_ACTIONS.characterImport,
      phase: 'failure',
      code: ELECKOI_FAILURE_CODES.characterNotFound,
      details: { what: '角色卡' }
    })
    expect(line?.msg).toContain(LOG_ACTIONS.characterImport)
    expect(line?.msg).toContain(ELECKOI_FAILURE_CODES.characterNotFound)
    expect(line?.err).toMatchObject({ type: 'DesktopError' })
  })

  it('渲染层动作行经 console 桥进来：带 source=renderer 与码，普通 console 行不收', () => {
    const log = createAppLog(userData, NOW)
    const rendererLine = formatActionLogMessage(describeAction(
      LOG_ACTIONS.messageSend,
      'failure',
      new DesktopError(ELECKOI_FAILURE_CODES.netOperationFailed, '消息没有发出去', { what: '消息' })
    ))

    expect(relayRendererActionLog(log, rendererLine)).toBe(true)
    expect(logLines().at(-1)).toMatchObject({
      level: 50,
      action: LOG_ACTIONS.messageSend,
      phase: 'failure',
      source: 'renderer',
      code: ELECKOI_FAILURE_CODES.netOperationFailed
    })
    expect(relayRendererActionLog(log, '随便一句 console 输出')).toBe(false)
    expect(logLines()).toHaveLength(1)
  })
})
