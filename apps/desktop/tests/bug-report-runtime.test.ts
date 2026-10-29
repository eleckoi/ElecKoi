/**
 * 主进程报告运行时：打开外部程序失败带码、草稿落盘 / 列目录 / 30 天清理 / 最多 10 份。
 *
 * 判据（[ADR 0041](../../../docs/adr/0041-bug-report-delivery.md) 决定 13 / 14）：
 *
 * 1. **打开失败带码**：`eleckoi/shell/open-failed` + 判别值 `what: 'mail' | 'form'`，界面才知道
 *    该说「没能打开邮件客户端」还是「没能打开浏览器」，下一步是「全文已复制」。
 * 2. **失败不丢**：发送失败或中途关闭时报告落进 `userData/bug-reports/pending/`；30 天后清掉，
 *    最多留 10 份，坏文件跳过，草稿出问题永不拖垮主流程。
 *
 * 全部写进 `mkdtempSync` 的临时目录，不碰真实 userData；不 import `electron`。
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { isBugReportDraftKey } from '@shared/contracts/bugReport/delivery'
import type { BugReport } from '@shared/contracts/bugReport/report'
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes'
import { DesktopError } from '@shared/foundation/DesktopError'
import { bugReportOpenFailure } from '../src/main/modules/diagnostics/reportOpen'
import {
  discardPendingDraft,
  listPendingDrafts,
  pendingDraftDirectory,
  pendingDraftKey,
  savePendingDraft
} from '../src/main/modules/diagnostics/reportDrafts'

const GENERATED_AT = '2026-10-27T12:00:00.000Z'

let base: string
let directory: string

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'eleckoi-bug-report-drafts-'))
  directory = join(base, 'bug-reports', 'pending')
})

afterEach(() => {
  rmSync(base, { recursive: true, force: true })
})

/** 一份固定形状的报告；只需要改生成时间就能造出「不同的草稿」。 */
function reportAt(generatedAt: string): BugReport {
  return {
    schemaVersion: 1,
    generatedAt,
    environment: { appVersion: '0.2.14', platform: 'windows', arch: 'x64' },
    session: { startedAt: '2026-10-27T09:00:00.000Z', ended: false },
    failures: [{ code: 'eleckoi/io/failed', message: '写入报告失败' }]
  }
}

describe('打开外部程序失败', () => {
  it('邮件是 mail，表单与 issue 是 form', () => {
    const mail = bugReportOpenFailure('mail', new Error('xdg-open 退出码 3'))
    expect(mail.code).toBe(ELECKOI_FAILURE_CODES.shellOpenFailed)
    expect(mail.message).toContain('xdg-open 退出码 3')
    expect(mail.details).toEqual({ what: 'mail' })

    expect(bugReportOpenFailure('form', new Error('没有处理程序')).details).toEqual({ what: 'form' })
    expect(bugReportOpenFailure('issue', new Error('没有处理程序')).details).toEqual({ what: 'form' })
  })

  it('非 Error 的抛出也保留诊断原文', () => {
    expect(bugReportOpenFailure('form', '打开失败').message).toContain('打开失败')
  })
})

describe('草稿键', () => {
  it('由签名与生成时间组成，只留文件名安全字符', () => {
    const key = pendingDraftKey(reportAt(GENERATED_AT))
    expect(isBugReportDraftKey(key)).toBe(true)
    expect(key).toContain('eleckoi-io-failed')
    expect(key).toContain('2026-10-27')
    expect(pendingDraftKey(reportAt(GENERATED_AT))).toBe(key)
    expect(pendingDraftKey(reportAt('2026-10-28T12:00:00.000Z'))).not.toBe(key)
  })

  it('超长签名也压进合法长度', () => {
    const longCode = `eleckoi/${'x'.repeat(300)}/failed`
    const key = pendingDraftKey({
      ...reportAt(GENERATED_AT),
      failures: [{ code: longCode, message: '长' }]
    })
    expect(isBugReportDraftKey(key)).toBe(true)
  })
})

describe('草稿存储', () => {
  it('存一份就能列出来，报告与落盘时间对得上', () => {
    const now = new Date(GENERATED_AT)
    const report = reportAt(GENERATED_AT)
    const saved = savePendingDraft({ directory, report, now })
    expect(saved.key).toBe(pendingDraftKey(report))
    expect(saved.savedAt).toBe(now.toISOString())
    expect(listPendingDrafts({ directory, now })).toEqual([
      { key: saved.key, savedAt: now.toISOString(), report }
    ])
  })

  it('同一份报告同一时刻存两次只有一个键（覆盖，不是两条）', () => {
    const now = new Date(GENERATED_AT)
    const report = reportAt(GENERATED_AT)
    const first = savePendingDraft({ directory, report, now })
    const second = savePendingDraft({ directory, report, now })
    expect(second.key).toBe(first.key)
    expect(listPendingDrafts({ directory, now })).toHaveLength(1)
    expect(readdirSync(directory)).toEqual([`${first.key}.json`])
  })

  it('列表新到旧', () => {
    const older = new Date('2026-10-25T12:00:00.000Z')
    const newer = new Date(GENERATED_AT)
    savePendingDraft({ directory, report: reportAt(older.toISOString()), now: older })
    savePendingDraft({ directory, report: reportAt(newer.toISOString()), now: newer })
    expect(listPendingDrafts({ directory, now: newer }).map(draft => draft.savedAt)).toEqual([
      newer.toISOString(),
      older.toISOString()
    ])
  })

  it('目录不存在时列表为空，保存时自动建目录', () => {
    expect(existsSync(directory)).toBe(false)
    expect(listPendingDrafts({ directory, now: new Date(GENERATED_AT) })).toEqual([])
    savePendingDraft({ directory, report: reportAt(GENERATED_AT), now: new Date(GENERATED_AT) })
    expect(existsSync(directory)).toBe(true)
  })

  it('坏文件跳过且不删', () => {
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, 'broken-json.json'), '{')
    writeFileSync(join(directory, 'array.json'), '[]')
    writeFileSync(join(directory, 'no-report.json'), JSON.stringify({ key: 'no-report', savedAt: GENERATED_AT }))
    writeFileSync(join(directory, 'mismatch.json'), JSON.stringify({
      key: 'other', savedAt: GENERATED_AT, report: reportAt(GENERATED_AT)
    }))
    expect(listPendingDrafts({ directory, now: new Date(GENERATED_AT) })).toEqual([])
    expect(readdirSync(directory).sort()).toEqual([
      'array.json',
      'broken-json.json',
      'mismatch.json',
      'no-report.json'
    ])
  })

  it('超过 30 天的草稿在列表时清掉', () => {
    const oldNow = new Date('2026-09-16T12:00:00.000Z')
    const later = new Date(GENERATED_AT)
    const saved = savePendingDraft({ directory, report: reportAt(oldNow.toISOString()), now: oldNow })
    expect(listPendingDrafts({ directory, now: later })).toEqual([])
    expect(existsSync(join(directory, `${saved.key}.json`))).toBe(false)
  })

  it('第 11 份进来时最旧的那份被删，只留 10 份', () => {
    const start = Date.parse('2026-10-01T00:00:00.000Z')
    const keys: string[] = []
    for (let index = 0; index < 11; index += 1) {
      const time = new Date(start + index * 60_000)
      keys.push(savePendingDraft({ directory, report: reportAt(time.toISOString()), now: time }).key)
    }
    const drafts = listPendingDrafts({ directory, now: new Date(start + 11 * 60_000) })
    expect(drafts).toHaveLength(10)
    expect(drafts.map(draft => draft.key)).not.toContain(keys[0])
    expect(drafts.map(draft => draft.key)).toEqual(keys.slice(1).reverse())
  })

  it('目录写不进去时抛 ioFailed，详情带操作与路径', () => {
    const blocked = join(base, 'blocked')
    writeFileSync(blocked, '')
    let failure: unknown
    try {
      savePendingDraft({ directory: blocked, report: reportAt(GENERATED_AT), now: new Date(GENERATED_AT) })
    } catch (error) {
      failure = error
    }
    expect(failure).toBeInstanceOf(DesktopError)
    const desktopFailure = failure as DesktopError
    expect(desktopFailure.code).toBe(ELECKOI_FAILURE_CODES.ioFailed)
    expect(desktopFailure.details).toMatchObject({
      operation: expect.any(String),
      path: expect.any(String)
    })
  })
})

describe('删草稿', () => {
  it('删掉之后列表为空；不存在的键不抛', () => {
    const now = new Date(GENERATED_AT)
    const saved = savePendingDraft({ directory, report: reportAt(GENERATED_AT), now })
    discardPendingDraft({ directory, key: saved.key })
    expect(listPendingDrafts({ directory, now })).toEqual([])
    expect(() => discardPendingDraft({ directory, key: 'not-there' })).not.toThrow()
  })

  it('非法键不抛也不越界', () => {
    mkdirSync(join(base, 'bug-reports'), { recursive: true })
    const sentinel = join(base, 'bug-reports', 'x.json')
    writeFileSync(sentinel, 'keep')
    expect(() => discardPendingDraft({ directory, key: '../x' })).not.toThrow()
    expect(readFileSync(sentinel, 'utf8')).toBe('keep')
  })
})

describe('草稿目录', () => {
  it('落在 userData/bug-reports/pending', () => {
    expect(pendingDraftDirectory('/data/userData')).toBe(join('/data/userData', 'bug-reports', 'pending'))
  })
})
