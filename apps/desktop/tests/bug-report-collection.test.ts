/**
 * 主进程报告收集：上次会话判定、失败收集、脱敏、投递配置。
 *
 * 设计判据（ADR 0042）：「用户点一次就能拿到一份维护者看得懂、又不带本机信息的报告」。
 * 这里断言四件事：
 *
 * 1. **会话判定只看配对的标记**：「有 start 没 end」才是异常；当前会话不算上一次；跨文件也成立；
 * 2. **失败行只认契约形状**（`phase: 'failure'` + 字符串 `code`），同码折叠，别的行忽略；
 * 3. **报告出门即脱敏**：日志尾里的家目录、凭据参数不出现在报告里；不勾选就没有日志尾；
 * 4. **投递配置只来自环境变量**，平台名与导出文件名是确定的。
 *
 * 全部写进 `mkdtempSync` 的临时目录，不碰真实 userData；不 import `electron`。
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BUG_REPORT_LOG_TAIL_MAX_LINES, type BugReportEnvironment } from '@shared/contracts/bugReport/report'
import { buildBugReport, collectReportFailures } from '@shared/foundation/bugReport'
import {
  parseSessionEvents,
  previousSessionOf,
  readPreviousSession,
  readRecentLogLines
} from '../src/main/modules/diagnostics/previousSession'
import {
  BUG_REPORT_MAILBOX_ENV,
  BUG_REPORT_MAILBOX_NAME_ENV,
  BUG_REPORT_RELAY_ENDPOINT_ENV,
  BUG_REPORT_RELAY_KEY_ENV,
  BUG_REPORT_RELAY_PROVIDER_ENV,
  BUG_REPORT_REPOSITORY_ENV,
  BUG_REPORT_SUBSCRIBE_URL_ENV,
  desktopReportEnvironment,
  desktopReportPlatform,
  exportFileName,
  readBugReportRelay
} from '../src/main/modules/diagnostics/reportDelivery'
import { parseBugReportConfig } from '../src/main/modules/diagnostics/reportConfig'

const GENERATED_AT = new Date('2026-10-27T12:00:00.000Z')
const ENVIRONMENT: BugReportEnvironment = {
  appVersion: '0.2.14',
  platform: 'windows',
  arch: 'x64',
  osVersion: 'Windows_NT 10.0.26100',
  runtime: 'Electron 40.0.0 / Node 22.0.0'
}

let userData: string

beforeEach(() => {
  userData = mkdtempSync(join(tmpdir(), 'eleckoi-bug-report-'))
})

afterEach(() => {
  rmSync(userData, { recursive: true, force: true })
})

/** 一行 pino 形状的会话标记。 */
function sessionLine(kind: 'started' | 'ended', sessionId: string, time: number): string {
  const action = kind === 'started' ? 'session.started' : 'session.ended'
  return JSON.stringify({ level: 30, time, action, sessionId, msg: `会话${kind}` })
}

/** 一行 pino 形状的失败日志（`logAction` 写出来的样子）。 */
function failureLine(code: string, msg: string, details?: Record<string, unknown>): string {
  return JSON.stringify({
    level: 50,
    time: GENERATED_AT.getTime(),
    action: 'message.send',
    phase: 'failure',
    code,
    msg,
    ...(details === undefined ? {} : { details })
  })
}

function writeLog(name: string, lines: readonly string[]): void {
  const directory = join(userData, 'logs')
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, name), `${lines.join('\n')}\n`, 'utf8')
}

describe('会话标记', () => {
  it('只认 session.started / session.ended，其余行跳过', () => {
    const events = parseSessionEvents([
      sessionLine('started', 'a', 1000),
      JSON.stringify({ action: 'message.send', phase: 'success' }),
      '不是 JSON 的半行',
      '{"action":"session.started"}',
      sessionLine('ended', 'a', 2000)
    ])
    expect(events).toEqual([
      { kind: 'started', sessionId: 'a', time: 1000 },
      { kind: 'ended', sessionId: 'a', time: 2000 }
    ])
  })

  it('配对的结束 = 正常；只有开始 = 崩溃', () => {
    const events = parseSessionEvents([
      sessionLine('started', 'a', 1000),
      sessionLine('ended', 'a', 2000),
      sessionLine('started', 'b', 3000),
      sessionLine('started', 'c', 4000)
    ])
    expect(previousSessionOf(events)).toEqual({
      startedAt: new Date(3000).toISOString(),
      ended: false
    })
  })

  it('上一次正常结束时 ended 为真', () => {
    const events = parseSessionEvents([
      sessionLine('started', 'a', 1000),
      sessionLine('ended', 'a', 2000),
      sessionLine('started', 'b', 3000)
    ])
    expect(previousSessionOf(events)?.ended).toBe(true)
  })

  it('首次运行（只有一次开始）没有上一次会话', () => {
    expect(previousSessionOf(parseSessionEvents([sessionLine('started', 'a', 1000)]))).toBeUndefined()
    expect(previousSessionOf([])).toBeUndefined()
  })

  it('结束标记属于别的会话不算数', () => {
    const events = parseSessionEvents([
      sessionLine('started', 'a', 1000),
      sessionLine('ended', 'other', 2000),
      sessionLine('started', 'b', 3000)
    ])
    expect(previousSessionOf(events)?.ended).toBe(false)
  })
})

describe('从磁盘读上次会话', () => {
  it('跨文件：今天只有本次开始，上一次在昨天的文件里', () => {
    writeLog('eleckoi-desktop-2026-10-26.log', [
      sessionLine('started', 'a', Date.parse('2026-10-26T09:00:00.000Z')),
      sessionLine('ended', 'a', Date.parse('2026-10-26T10:00:00.000Z'))
    ])
    writeLog('eleckoi-desktop-2026-10-27.log', [
      sessionLine('started', 'b', Date.parse('2026-10-27T09:00:00.000Z'))
    ])
    expect(readPreviousSession(userData)).toEqual({
      startedAt: '2026-10-26T09:00:00.000Z',
      ended: true
    })
  })

  it('崩溃那一次：上一次只有开始', () => {
    writeLog('eleckoi-desktop-2026-10-27.log', [
      sessionLine('started', 'a', Date.parse('2026-10-27T09:00:00.000Z')),
      sessionLine('started', 'b', Date.parse('2026-10-27T09:30:00.000Z'))
    ])
    expect(readPreviousSession(userData)?.ended).toBe(false)
  })

  it('日志目录不存在时返回 undefined，不抛', () => {
    expect(readPreviousSession(join(userData, 'missing'))).toBeUndefined()
  })

  it('最近日志行取末尾、跳过空行', () => {
    writeLog('eleckoi-desktop-2026-10-27.log', ['一', '', '二', '三'])
    expect(readRecentLogLines(userData, 2)).toEqual(['二', '三'])
    expect(readRecentLogLines(join(userData, 'missing'), 2)).toEqual([])
  })
})

describe('失败收集与报告', () => {
  it('只认 phase=failure 且带码的行', () => {
    const failures = collectReportFailures([
      failureLine('eleckoi/plugin/load-failed', '插件宿主启动失败', { what: 'DSH 插件宿主' }),
      JSON.stringify({ phase: 'success', action: 'message.send', msg: '成功' }),
      JSON.stringify({ phase: 'failure', msg: '没有码' }),
      'not json'
    ])
    expect(failures).toEqual([
      {
        code: 'eleckoi/plugin/load-failed',
        message: '插件宿主启动失败',
        details: { what: 'DSH 插件宿主' }
      }
    ])
  })

  it('同一个码折叠成一条', () => {
    const report = buildBugReport({
      lines: [
        failureLine('eleckoi/io/failed', '第一次'),
        failureLine('eleckoi/io/failed', '第二次'),
        failureLine('eleckoi/net/operation-failed', '网络')
      ],
      environment: ENVIRONMENT,
      session: { startedAt: '2026-10-27T09:00:00.000Z', ended: false },
      includeLogTail: false,
      generatedAt: GENERATED_AT
    })
    expect(report.failures.map(failure => failure.code)).toEqual([
      'eleckoi/io/failed',
      'eleckoi/net/operation-failed'
    ])
    expect(report.generatedAt).toBe('2026-10-27T12:00:00.000Z')
    expect(report.logTail).toBeUndefined()
  })

  it('不勾选就没有日志尾；勾选也只留最后若干行', () => {
    const lines = Array.from({ length: BUG_REPORT_LOG_TAIL_MAX_LINES + 10 }, (_, index) => `第 ${index} 行`)
    const report = buildBugReport({
      lines,
      environment: ENVIRONMENT,
      session: { startedAt: '2026-10-27T09:00:00.000Z', ended: true },
      includeLogTail: true,
      generatedAt: GENERATED_AT
    })
    expect(report.logTail?.split('\n')).toHaveLength(BUG_REPORT_LOG_TAIL_MAX_LINES)
    expect(report.logTail).toContain(`第 ${lines.length - 1} 行`)
    expect(report.logTail).not.toContain('第 0 行')
  })

  it('备注去空白；空白备注不留字段', () => {
    const withNotes = buildBugReport({
      lines: [],
      environment: ENVIRONMENT,
      session: { startedAt: '2026-10-27T09:00:00.000Z', ended: true },
      includeLogTail: false,
      notes: '  点了保存没反应  ',
      generatedAt: GENERATED_AT
    })
    expect(withNotes.notes).toBe('点了保存没反应')
    const withoutNotes = buildBugReport({
      lines: [],
      environment: ENVIRONMENT,
      session: { startedAt: '2026-10-27T09:00:00.000Z', ended: true },
      includeLogTail: false,
      notes: '   ',
      generatedAt: GENERATED_AT
    })
    expect(withoutNotes.notes).toBeUndefined()
  })

  it('日志尾里的本机路径与凭据在报告里已经不在了', () => {
    const report = buildBugReport({
      lines: [
        failureLine('eleckoi/io/failed', 'C:\\Users\\alice\\ElecKoi\\x.log 打不开'),
        JSON.stringify({ level: 50, time: 1, msg: 'api_key=sk-1234567890 与 alice 的目录' })
      ],
      environment: ENVIRONMENT,
      session: { startedAt: '2026-10-27T09:00:00.000Z', ended: false },
      includeLogTail: true,
      redaction: { home: 'C:\\Users\\alice', userName: 'alice' },
      generatedAt: GENERATED_AT
    })
    const serialized = JSON.stringify(report)
    expect(serialized).not.toContain('alice')
    expect(serialized).not.toContain('sk-1234567890')
    expect(serialized).toContain('<home>')
  })
})

describe('投递配置', () => {
  it('只从环境变量读，空值表示未配置', () => {
    expect(parseBugReportConfig({ fileText: undefined, environment: {} })).toEqual({ mailbox: '', repository: '' })
    expect(parseBugReportConfig({ fileText: undefined, environment: {
      [BUG_REPORT_MAILBOX_ENV]: '  bugs@eleckoi.test  ',
      [BUG_REPORT_REPOSITORY_ENV]: ' KuramiWan/eleckoi-reports '
    } })).toEqual({ mailbox: 'bugs@eleckoi.test', repository: 'KuramiWan/eleckoi-reports' })
  })

  it('列表名与订阅地址只在配了的时候出现', () => {
    const plain = parseBugReportConfig({ fileText: undefined, environment: { [BUG_REPORT_MAILBOX_ENV]: 'reports@eleckoi.test' } })
    expect(plain).toEqual({ mailbox: 'reports@eleckoi.test', repository: '' })
    expect(plain.mailboxName).toBeUndefined()

    const listed = parseBugReportConfig({ fileText: undefined, environment: {
      [BUG_REPORT_MAILBOX_ENV]: 'reports@eleckoi.test',
      [BUG_REPORT_MAILBOX_NAME_ENV]: ' ElecKoi 报告列表 ',
      [BUG_REPORT_SUBSCRIBE_URL_ENV]: ' https://groups.example/eleckoi '
    } })
    expect(listed.mailboxName).toBe('ElecKoi 报告列表')
    expect(listed.subscribeUrl).toBe('https://groups.example/eleckoi')
  })

  it('代发通道只在服务名与端点都合法时出现', () => {
    expect(readBugReportRelay({})).toBeUndefined()
    expect(readBugReportRelay({
      [BUG_REPORT_RELAY_PROVIDER_ENV]: 'unknown-service',
      [BUG_REPORT_RELAY_ENDPOINT_ENV]: 'https://example.test/send'
    })).toBeUndefined()
    expect(readBugReportRelay({
      [BUG_REPORT_RELAY_PROVIDER_ENV]: 'web3forms'
    })).toBeUndefined()

    const worker = readBugReportRelay({
      [BUG_REPORT_RELAY_PROVIDER_ENV]: 'eleckoi-relay',
      [BUG_REPORT_RELAY_ENDPOINT_ENV]: 'https://eleckoi-relay.example.workers.dev/report'
    })
    expect(worker).toEqual({
      provider: 'eleckoi-relay',
      endpoint: 'https://eleckoi-relay.example.workers.dev/report',
      accessKey: ''
    })

    const relay = readBugReportRelay({
      [BUG_REPORT_RELAY_PROVIDER_ENV]: 'web3forms',
      [BUG_REPORT_RELAY_ENDPOINT_ENV]: 'https://api.web3forms.com/submit',
      [BUG_REPORT_RELAY_KEY_ENV]: ' pub-key '
    })
    expect(relay).toEqual({
      provider: 'web3forms',
      endpoint: 'https://api.web3forms.com/submit',
      accessKey: 'pub-key'
    })
  })

  it('平台名映射', () => {
    expect(desktopReportPlatform('win32')).toBe('windows')
    expect(desktopReportPlatform('darwin')).toBe('macos')
    expect(desktopReportPlatform('android')).toBe('android')
    expect(desktopReportPlatform('linux')).toBe('linux')
  })

  it('环境段带版本与运行时', () => {
    const environment = desktopReportEnvironment({
      appVersion: '0.2.14',
      platform: 'win32',
      arch: 'x64',
      osType: 'Windows_NT',
      osRelease: '10.0.26100',
      electronVersion: '40.0.0',
      nodeVersion: '22.0.0'
    })
    expect(environment).toEqual({
      appVersion: '0.2.14',
      platform: 'windows',
      arch: 'x64',
      osVersion: 'Windows_NT 10.0.26100',
      runtime: 'Electron 40.0.0 / Node 22.0.0'
    })
  })

  it('导出文件名带时间戳', () => {
    expect(exportFileName(new Date(2026, 9, 27, 9, 5, 3))).toBe('eleckoi-report-20261027-090503.json')
  })
})
