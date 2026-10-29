/**
 * Bug 报告 → 飞书表单预填链接（ADR 0041 决定 12）。
 *
 * 设计判据：「用户点一次表单按钮，浏览器里已经填好报告，只差按一次提交」。
 * 这里只断言外部可观察行为：生成的 URL、返回值里的降级标记。
 *
 * 1. **题目名是契约**：参数名 = `prefill_<题目名>`，题目名可能是中文，编码要能被 `URL` 解回来；
 * 2. **预算按编码后算**：超限先截日志尾并注明，再只带摘要，最后硬截——永不返回 `undefined`
 *    （那是「端点没配」的语义）。降级原因只给枚举值（界面自己写句子），正文里的截断标注仍在；
 * 3. **通道与草稿**：表单进通道名单、`http(s)` 才交给系统打开；草稿键挡目录穿越，长度上限从契约导出。
 */
import { describe, expect, it } from 'vitest'
import { formatBugReportBody, formatBugReportSummary } from '../src/contracts/bugReport/mailto'
import type { BugReport } from '../src/contracts/bugReport/report'
import {
  BUG_REPORT_DRAFT_KEY_MAX_LENGTH,
  BUG_REPORT_TARGET_KINDS,
  hasBugReportChannel,
  isBugReportDraftKey,
  isBugReportExternalTarget,
  isBugReportPendingDraft,
  type BugReportDeliveryConfig
} from '../src/contracts/bugReport/delivery'
import {
  BUG_REPORT_FORM_LOG_TAIL_LINES,
  BUG_REPORT_FORM_MAX_URL_LENGTH,
  isBugReportFormConfig,
  buildBugReportFormUrl,
  type BugReportFormDegradation
} from '../src/contracts/bugReport/form'

const SHARE_URL = 'https://example.feishu.cn/share/base/form/shrcAbCdEf'

/** 发布配置里的题目名（ADR 0041 决定 12：一旦发布不可改）。 */
const FIELDS = {
  body: 'report_body',
  meta: 'report_meta',
  code: 'report_code',
  file: 'report_file'
} as const

const BASE_REPORT: BugReport = {
  schemaVersion: 1,
  generatedAt: '2026-10-29T12:00:00.000Z',
  environment: { appVersion: '0.2.14', platform: 'windows', arch: 'x64' },
  session: { startedAt: '2026-10-29T09:00:00.000Z', ended: false },
  failures: [{ code: 'eleckoi/plugin/load-failed', message: 'DSH 插件宿主启动失败' }]
}

function reportOf(overrides: Partial<BugReport> = {}): BugReport {
  return { ...BASE_REPORT, ...overrides }
}

/** 从 URL 里把某个预填题目反解回来（同时验证编码是合法的）。 */
function prefill(url: string, name: string): string | null {
  return new URL(url).searchParams.get(`prefill_${name}`)
}

describe('预填链接', () => {
  it('参数名与题目名一一对应，中文题目名的编码能解回来', () => {
    const built = buildBugReportFormUrl(BASE_REPORT, { shareUrl: SHARE_URL, fields: FIELDS })
    expect(built).toBeDefined()
    if (built === undefined) return
    expect(built.url).toContain('?prefill_report_body=')
    expect(prefill(built.url, 'report_body')).toBe(formatBugReportBody(BASE_REPORT))

    const chinese = buildBugReportFormUrl(BASE_REPORT, {
      shareUrl: SHARE_URL,
      fields: { body: '报告正文' }
    })
    expect(chinese).toBeDefined()
    if (chinese === undefined) return
    expect(prefill(chinese.url, '报告正文')).toBe(formatBugReportBody(BASE_REPORT))
  })

  it('元信息一行：签名、版本、平台、架构、生成时间、上次会话', () => {
    const built = buildBugReportFormUrl(BASE_REPORT, { shareUrl: SHARE_URL, fields: FIELDS })
    expect(built).toBeDefined()
    if (built === undefined) return
    const meta = prefill(built.url, 'report_meta') ?? ''
    expect(meta).toContain('eleckoi/plugin/load-failed@v0.2.14:windows')
    expect(meta).toContain('v0.2.14')
    expect(meta).toContain('windows')
    expect(meta).toContain('x64')
    expect(meta).toContain(BASE_REPORT.generatedAt)
    expect(meta).toContain('异常结束')
    expect(meta).not.toContain('\n')
  })

  it('失败码用顿号连接；没有失败行时给固定的说明', () => {
    const built = buildBugReportFormUrl(BASE_REPORT, { shareUrl: SHARE_URL, fields: FIELDS })
    expect(built?.url).toBeDefined()
    if (built === undefined) return
    expect(prefill(built.url, 'report_code')).toBe('eleckoi/plugin/load-failed')

    const empty = buildBugReportFormUrl(reportOf({ failures: [] }), { shareUrl: SHARE_URL, fields: FIELDS })
    if (empty === undefined) return
    expect(prefill(empty.url, 'report_code')).toContain('无失败行')
  })

  it('附件题目只给提示，客户端不经表单上传文件', () => {
    const built = buildBugReportFormUrl(BASE_REPORT, { shareUrl: SHARE_URL, fields: FIELDS })
    expect(built).toBeDefined()
    if (built === undefined) return
    expect(prefill(built.url, 'report_file')).toContain('导出文件')
  })

  it('shareUrl 里已经有 ? 时用 & 接，不出现两个 ?', () => {
    const shareUrl = `${SHARE_URL}?from=share`
    const built = buildBugReportFormUrl(BASE_REPORT, { shareUrl, fields: FIELDS })
    expect(built).toBeDefined()
    if (built === undefined) return
    expect(built.url.startsWith(`${shareUrl}&prefill_report_body=`)).toBe(true)
    expect(built.url.split('?')).toHaveLength(2)
  })

  it('fields 里没给的题目不出现参数', () => {
    const built = buildBugReportFormUrl(BASE_REPORT, {
      shareUrl: SHARE_URL,
      fields: { body: 'report_body' }
    })
    expect(built).toBeDefined()
    if (built === undefined) return
    expect(built.url).toContain('prefill_report_body=')
    expect(built.url).not.toContain('prefill_report_meta=')
    expect(built.url).not.toContain('prefill_report_code=')
    expect(built.url).not.toContain('prefill_report_file=')
  })

  it('全文档：不降级、没有原因说明', () => {
    const built = buildBugReportFormUrl(BASE_REPORT, { shareUrl: SHARE_URL, fields: FIELDS })
    expect(built).toBeDefined()
    if (built === undefined) return
    expect(built.summarized).toBe(false)
    expect(built.truncatedLogTail).toBe(false)
    expect(built.reasons).toEqual([])
  })

  it('shareUrl 为空或不是 http(s) 时不给链接（界面据此不渲染这个通道）', () => {
    expect(buildBugReportFormUrl(BASE_REPORT, { shareUrl: '', fields: FIELDS })).toBeUndefined()
    expect(buildBugReportFormUrl(BASE_REPORT, { shareUrl: '   ', fields: FIELDS })).toBeUndefined()
    expect(buildBugReportFormUrl(BASE_REPORT, { shareUrl: 'javascript:alert(1)', fields: FIELDS })).toBeUndefined()
    expect(buildBugReportFormUrl(BASE_REPORT, { shareUrl: 'file:///etc/passwd', fields: FIELDS })).toBeUndefined()
    expect(
      buildBugReportFormUrl(BASE_REPORT, { shareUrl: 'https://example.feishu.cn/f', fields: FIELDS })
    ).toBeDefined()
    expect(
      buildBugReportFormUrl(BASE_REPORT, { shareUrl: 'http://example.feishu.cn/f', fields: FIELDS })
    ).toBeDefined()
  })

  it('isBugReportFormConfig：形状对了才 true，永不抛', () => {
    expect(isBugReportFormConfig({ shareUrl: SHARE_URL, fields: { body: 'report_body' } })).toBe(true)
    expect(isBugReportFormConfig({ shareUrl: SHARE_URL, fields: { body: 'report_body', meta: 'm' } })).toBe(true)
    expect(isBugReportFormConfig({ shareUrl: SHARE_URL, fields: {} })).toBe(false)
    expect(isBugReportFormConfig({ shareUrl: SHARE_URL, fields: { body: '' } })).toBe(false)
    expect(isBugReportFormConfig({ shareUrl: SHARE_URL, fields: { body: 'b', meta: 3 } })).toBe(false)
    expect(isBugReportFormConfig({ shareUrl: 42, fields: { body: 'b' } })).toBe(false)
    expect(isBugReportFormConfig(null)).toBe(false)
    expect(isBugReportFormConfig([])).toBe(false)
    expect(isBugReportFormConfig('https://example.feishu.cn/f')).toBe(false)
  })
})

describe('日志尾与预算', () => {
  /**
   * 200 行中文日志：编码后约 5.4 万字符，超过 32,000 的预算，但只留 40 行后约 1.1 万。
   * 行数与 `BUG_REPORT_LOG_TAIL_MAX_LINES` 对齐（报告收集阶段的上限就是 200）。
   */
  const longLogTail = Array.from(
    { length: 200 },
    (_, index) => `2026-10-29T12:00:00.000Z 这一行日志内容故意写得比较长用来把编码后的长度推过表单链接的预算门槛 第 ${index} 行`
  ).join('\n')

  it('常量与 ADR 一致', () => {
    expect(BUG_REPORT_FORM_MAX_URL_LENGTH).toBe(32000)
    expect(BUG_REPORT_FORM_LOG_TAIL_LINES).toBe(40)
  })

  it('超预算时先截日志尾，正文里有截断标注，URL 不超预算', () => {
    const report = reportOf({ logTail: longLogTail })
    const built = buildBugReportFormUrl(report, { shareUrl: SHARE_URL, fields: FIELDS })
    expect(built).toBeDefined()
    if (built === undefined) return
    expect(built.truncatedLogTail).toBe(true)
    expect(built.summarized).toBe(false)
    expect(built.reasons).toEqual(['log-tail-truncated'])
    expect(built.url.length).toBeLessThanOrEqual(32000)
    const body = prefill(built.url, 'report_body') ?? ''
    expect(body).toContain('日志尾已截断')
    expect(body).toContain('第 199 行')
    expect(body).not.toContain('第 0 行')
  })

  it('摘要档：正文等于既有摘要格式化器的输出', () => {
    const report = reportOf({ logTail: longLogTail })
    const built = buildBugReportFormUrl(report, { shareUrl: SHARE_URL, fields: FIELDS }, { maxLength: 2500 })
    expect(built).toBeDefined()
    if (built === undefined) return
    expect(built.summarized).toBe(true)
    expect(built.truncatedLogTail).toBe(false)
    expect(built.reasons).toEqual(['summarized'])
    expect(prefill(built.url, 'report_body')).toBe(formatBugReportSummary(report))
    expect(built.url.length).toBeLessThanOrEqual(2500)
  })

  it('摘要也装不下时硬截，仍然返回且不超预算', () => {
    // 只启用正文题目：其余题目的固定参数会把骨架撑过 300，那样预算就不是「能不能装下摘要」的问题了。
    const built = buildBugReportFormUrl(
      BASE_REPORT,
      { shareUrl: SHARE_URL, fields: { body: 'report_body' } },
      { maxLength: 300 }
    )
    expect(built).toBeDefined()
    if (built === undefined) return
    expect(built.summarized).toBe(true)
    expect(built.reasons).toEqual(['summarized', 'hard-truncated'])
    expect(built.url.length).toBeLessThanOrEqual(300)
    expect(prefill(built.url, 'report_body') ?? '').toContain('（已截断）')
  })

  it('降级原因是枚举值，不是拼好的用户句子', () => {
    const report = reportOf({ logTail: longLogTail })
    const tiers: readonly (readonly BugReportFormDegradation[])[] = [
      buildBugReportFormUrl(BASE_REPORT, { shareUrl: SHARE_URL, fields: FIELDS })?.reasons ?? [],
      buildBugReportFormUrl(report, { shareUrl: SHARE_URL, fields: FIELDS })?.reasons ?? [],
      buildBugReportFormUrl(report, { shareUrl: SHARE_URL, fields: FIELDS }, { maxLength: 2500 })?.reasons ?? [],
      buildBugReportFormUrl(
        BASE_REPORT,
        { shareUrl: SHARE_URL, fields: { body: 'report_body' } },
        { maxLength: 300 }
      )?.reasons ?? []
    ]
    const degradations = tiers.flat()
    expect(tiers[0]).toEqual([])
    expect([...new Set(degradations)].sort()).toEqual(['hard-truncated', 'log-tail-truncated', 'summarized'])
    for (const reason of degradations) expect(reason).not.toMatch(/[\u4e00-\u9fff]/)
  })
})

describe('通道与草稿', () => {
  const form = { shareUrl: SHARE_URL, fields: FIELDS }

  it('表单是通道之一，分享链接是 http(s) 才交给系统打开', () => {
    expect(BUG_REPORT_TARGET_KINDS).toContain('form')
    expect(isBugReportExternalTarget({ kind: 'form', url: SHARE_URL })).toBe(true)
    expect(isBugReportExternalTarget({ kind: 'form', url: 'http://example.feishu.cn/f' })).toBe(true)
    expect(isBugReportExternalTarget({ kind: 'form', url: 'file:///etc/passwd' })).toBe(false)
    expect(isBugReportExternalTarget({ kind: 'form', url: 'javascript:alert(1)' })).toBe(false)
    expect(isBugReportExternalTarget({ kind: 'form', url: '' })).toBe(false)
  })

  it('既有通道的规则不放宽', () => {
    expect(isBugReportExternalTarget({ kind: 'mail', url: 'mailto:bugs@eleckoi.test' })).toBe(true)
    expect(isBugReportExternalTarget({ kind: 'issue', url: 'https://evil.example/' })).toBe(false)
    expect(isBugReportExternalTarget({ kind: 'issue', url: 'https://github.com/x/y/issues/new' })).toBe(true)
    expect(isBugReportExternalTarget({ kind: 'form' })).toBe(false)
    expect(isBugReportExternalTarget(null)).toBe(false)
  })

  it('配了表单也算有通道；什么都没配就没有', () => {
    const withForm: BugReportDeliveryConfig = { mailbox: '', repository: '', form }
    expect(hasBugReportChannel(withForm)).toBe(true)
    expect(hasBugReportChannel({ ...withForm, form: { ...form, shareUrl: '  ' } })).toBe(false)
    expect(hasBugReportChannel({ mailbox: '', repository: '' })).toBe(false)
    expect(hasBugReportChannel({ mailbox: 'bugs@eleckoi.test', repository: '' })).toBe(true)
  })

  it('草稿键挡目录穿越', () => {
    expect(isBugReportDraftKey('abc-123_4.json'.replace('.json', ''))).toBe(true)
    expect(isBugReportDraftKey('a.b-c_1')).toBe(true)
    expect(isBugReportDraftKey('../etc/passwd')).toBe(false)
    expect(isBugReportDraftKey('a/b')).toBe(false)
    expect(isBugReportDraftKey('a\\b')).toBe(false)
    expect(isBugReportDraftKey('')).toBe(false)
    expect(isBugReportDraftKey('x'.repeat(120))).toBe(true)
    expect(isBugReportDraftKey('x'.repeat(121))).toBe(false)
    expect(isBugReportDraftKey(42)).toBe(false)
    expect(isBugReportDraftKey(null)).toBe(false)
  })

  it('草稿键长度上限从契约导出，就是形状守卫允许的上限', () => {
    expect(BUG_REPORT_DRAFT_KEY_MAX_LENGTH).toBe(120)
    expect(isBugReportDraftKey('x'.repeat(BUG_REPORT_DRAFT_KEY_MAX_LENGTH))).toBe(true)
    expect(isBugReportDraftKey('x'.repeat(BUG_REPORT_DRAFT_KEY_MAX_LENGTH + 1))).toBe(false)
  })

  it('草稿读回时整份校验：键、时间、报告形状都对才收', () => {
    const draft = {
      key: 'eleckoi-plugin-load-failed-2026-10-29T12',
      savedAt: '2026-10-29T12:00:00.000Z',
      report: BASE_REPORT
    }
    expect(isBugReportPendingDraft(draft)).toBe(true)
    expect(isBugReportPendingDraft({ ...draft, key: '../etc/passwd' })).toBe(false)
    expect(isBugReportPendingDraft({ ...draft, savedAt: '' })).toBe(false)
    expect(isBugReportPendingDraft({ ...draft, report: { schemaVersion: 1 } })).toBe(false)
    expect(isBugReportPendingDraft({ key: draft.key, savedAt: draft.savedAt })).toBe(false)
    expect(isBugReportPendingDraft(null)).toBe(false)
    expect(isBugReportPendingDraft('草稿')).toBe(false)
  })
})
