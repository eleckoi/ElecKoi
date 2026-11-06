/**
 * Bug 报告契约（ADR 0042）。
 *
 * 设计判据：「用户点一次就能生成一份维护者看得懂、又不带本机信息的报告」。
 * 这里断言四件事：
 *
 * 1. **签名与主题**：同一失败在不同版本 / 平台上可区分；没有失败行时用兜底码，不能崩；
 * 2. **形状校验**：坏数据整份拒收，合法数据一个字段都不多要；
 * 3. **脱敏**：路径、用户名、邮箱、凭据参数认得出就删干净，且不误伤正文里的近形词；
 * 4. **邮件**：装得下就带全文，装不下降级成摘要，**编码后**的 URL 永不超限；
 * 5. **issue**：正文第一行是隐藏签名块且能被读回去（收件箱仓库靠它折叠），正文里的围栏不会被
 *    日志内容提前闭合。
 */
import { describe, expect, it } from 'vitest'
import { buildBugReport } from '../src/foundation/bugReport'
import {
  BUG_REPORT_LOG_TAIL_MAX_LINES,
  BUG_REPORT_MAX_FAILURES,
  BUG_REPORT_SUBJECT_PREFIX,
  bugReportSignature,
  bugReportSubject,
  foldBugReportFailures,
  isBugReport,
  limitLogTail,
  type BugReport
} from '../src/contracts/bugReport/report'
import {
  buildBugReportMailto,
  formatBugReportBody,
  formatBugReportSummary,
  isBugReportMailbox
} from '../src/contracts/bugReport/mailto'
import {
  BUG_REPORT_ISSUE_URL_MAX_LENGTH,
  BUG_REPORT_SIGNATURE_MARKER,
  buildBugReportIssueUrl,
  bugReportSignatureRecord,
  formatBugReportIssueBody,
  formatBugReportIssueSummary,
  formatBugReportSignatureComment,
  isBugReportRepository,
  parseBugReportSignatureComment
} from '../src/contracts/bugReport/issue'
import { bugReportRelayReceipt, buildBugReportRelayRequest } from '../src/contracts/bugReport/relay'
import type { BugReportRelayConfig } from '../src/contracts/bugReport/delivery'
import {
  REDACTED_EMAIL,
  REDACTED_HOME,
  REDACTED_PHONE,
  REDACTED_SECRET,
  REDACTED_USER_DATA,
  REDACTED_USER_NAME,
  redactBugReport,
  redactReportText
} from '../src/contracts/bugReport/redact'

const BASE_REPORT: BugReport = {
  schemaVersion: 1,
  generatedAt: '2026-10-27T12:00:00.000Z',
  environment: { appVersion: '0.2.14', platform: 'windows', arch: 'x64' },
  session: { startedAt: '2026-10-27T09:00:00.000Z', ended: false },
  failures: [
    {
      code: 'eleckoi/plugin/load-failed',
      message: 'DSH 插件宿主启动失败',
      details: { what: 'DSH 插件宿主' }
    }
  ]
}

function reportOf(overrides: Partial<BugReport> = {}): BugReport {
  return { ...BASE_REPORT, ...overrides }
}

/** `mailto:` → 主题与正文（用 URLSearchParams 解码，顺带验证编码是合法的）。 */
function mailtoParts(url: string): { subject: string; body: string } {
  const query = url.slice(url.indexOf('?') + 1)
  const params = new URLSearchParams(query)
  return { subject: params.get('subject') ?? '', body: params.get('body') ?? '' }
}

describe('签名与主题', () => {
  it('主题是 [ElecKoi] + 失败码 + 版本 + 平台', () => {
    expect(bugReportSubject(BASE_REPORT)).toBe(
      `${BUG_REPORT_SUBJECT_PREFIX} eleckoi/plugin/load-failed @ v0.2.14 windows`
    )
  })

  it('版本已经带 v 时不再叠一层', () => {
    const report = reportOf({ environment: { appVersion: 'v0.2.14', platform: 'windows', arch: 'x64' } })
    expect(bugReportSubject(report)).toContain('@ v0.2.14 ')
  })

  it('没有失败行时用兜底码（原生崩溃可能没来得及写失败行）', () => {
    const report = reportOf({ failures: [] })
    expect(bugReportSignature(report)).toBe('none@v0.2.14:windows')
    expect(bugReportSubject(report)).toContain('none')
  })

  it('同一码在不同版本 / 平台上签名不同', () => {
    const other = reportOf({ environment: { appVersion: '0.2.15', platform: 'android', arch: 'arm64' } })
    expect(bugReportSignature(other)).not.toBe(bugReportSignature(BASE_REPORT))
  })
})

describe('失败折叠与日志尾', () => {
  it('同一个码只留一条，先到的保留', () => {
    const folded = foldBugReportFailures([
      { code: 'a', message: '第一次' },
      { code: 'b', message: '别的' },
      { code: 'a', message: '第二次' }
    ])
    expect(folded).toEqual([
      { code: 'a', message: '第一次' },
      { code: 'b', message: '别的' }
    ])
  })

  it('折叠到上限为止', () => {
    const many = Array.from({ length: BUG_REPORT_MAX_FAILURES + 5 }, (_, index) => ({
      code: `eleckoi/x/${index}`,
      message: '失败'
    }))
    expect(foldBugReportFailures(many)).toHaveLength(BUG_REPORT_MAX_FAILURES)
  })

  it('日志尾留最后若干行，不动短文本', () => {
    expect(limitLogTail('a\nb\nc', 2)).toBe('b\nc')
    expect(limitLogTail('a\nb', 5)).toBe('a\nb')
    expect(limitLogTail('a\nb', 0)).toBe('')
    expect(limitLogTail('a\nb')).toBe('a\nb')
    expect(BUG_REPORT_LOG_TAIL_MAX_LINES).toBeGreaterThan(1)
  })
})

describe('形状校验', () => {
  it('合法报告通过', () => {
    expect(isBugReport(BASE_REPORT)).toBe(true)
    expect(isBugReport({ ...BASE_REPORT, logTail: '日志', notes: '备注' })).toBe(true)
    expect(isBugReport({ ...BASE_REPORT, failures: [] })).toBe(true)
  })

  it('拒收版本不符、平台未知、字段缺失与超量失败', () => {
    expect(isBugReport({ ...BASE_REPORT, schemaVersion: 2 })).toBe(false)
    expect(isBugReport({ ...BASE_REPORT, environment: { appVersion: '0.2.14', platform: 'solaris', arch: 'x64' } })).toBe(false)
    expect(isBugReport({ ...BASE_REPORT, session: { startedAt: '2026-10-27T09:00:00.000Z' } })).toBe(false)
    expect(isBugReport({ ...BASE_REPORT, generatedAt: '  ' })).toBe(false)
    expect(isBugReport({ ...BASE_REPORT, failures: 'eleckoi/x' })).toBe(false)
    expect(isBugReport(null)).toBe(false)
    expect(isBugReport([])).toBe(false)
    const tooMany = Array.from({ length: BUG_REPORT_MAX_FAILURES + 1 }, (_, index) => ({
      code: `eleckoi/x/${index}`,
      message: '失败'
    }))
    expect(isBugReport({ ...BASE_REPORT, failures: tooMany })).toBe(false)
  })
})

describe('脱敏', () => {
  it('递归处理真实日志中的嵌套详情与数组，并按凭据键脱敏而不修改输入', () => {
    const details = {
      issues: [{ path: '/home/alice/private/file.json', context: { authorization: 'Bearer synthetic-private-token' } }],
      request: { api_key: 'synthetic-private-key', labels: ['alice@example.com', { password: 'synthetic-password' }] },
      count: 3,
      enabled: false,
      absent: null
    }
    const input = JSON.stringify({ phase: 'failure', code: 'eleckoi/contract/invalid-request', msg: 'validation failed', details })
    const report = buildBugReport({ lines: [input], environment: BASE_REPORT.environment,
      session: BASE_REPORT.session, includeLogTail: false })
    expect(report.failures[0]?.details).toEqual({
      issues: [{ path: `${REDACTED_HOME}/private/file.json`, context: { authorization: REDACTED_SECRET } }],
      request: { api_key: REDACTED_SECRET, labels: [REDACTED_EMAIL, { password: REDACTED_SECRET }] },
      count: 3,
      enabled: false,
      absent: null
    })
    const direct = redactBugReport(reportOf({ failures: [{ code: 'eleckoi/contract/invalid-request', message: 'validation failed', details }] }))
    expect(direct.failures[0]?.details).toEqual(report.failures[0]?.details)
    expect(JSON.stringify(details)).toContain('synthetic-private-token')
    expect(details.issues[0]?.path).toBe('/home/alice/private/file.json')
  })

  it('显式路径优先于通用形态', () => {
    const text = redactReportText('C:\\Users\\alice\\AppData\\Roaming\\ElecKoi\\logs\\x.log', {
      home: 'C:\\Users\\alice',
      userData: 'C:\\Users\\alice\\AppData\\Roaming\\ElecKoi'
    })
    expect(text).toBe(`${REDACTED_USER_DATA}\\logs\\x.log`)
  })

  it('没给路径时也认得出 Windows / POSIX / macOS / Android 的用户目录', () => {
    expect(redactReportText('C:\\Users\\alice\\x.log')).toBe(`${REDACTED_HOME}\\x.log`)
    expect(redactReportText('/home/alice/x.log')).toBe(`${REDACTED_HOME}/x.log`)
    expect(redactReportText('/Users/alice/x.log')).toBe(`${REDACTED_HOME}/x.log`)
    expect(redactReportText('/data/user/0/com.eleckoi.app/files/x.log')).toBe(`${REDACTED_USER_DATA}/files/x.log`)
    expect(redactReportText('/data/data/com.eleckoi.app/x.log')).toBe(`${REDACTED_USER_DATA}/x.log`)
  })

  it('被 JSON 转义成双反斜杠的路径也要抹掉用户名', () => {
    const text = redactReportText('{"path":"C:\\\\Users\\\\alice\\\\x.log"}')
    expect(text).not.toContain('alice')
  })

  it('邮箱与凭据参数', () => {
    expect(redactReportText('联系 alice@example.com')).toBe(`联系 ${REDACTED_EMAIL}`)
    expect(redactReportText('api_key=sk-1234567890')).toBe(`api_key=${REDACTED_SECRET}`)
    expect(redactReportText('Authorization: Bearer abc.def.ghi')).toBe(
      `Authorization: Bearer ${REDACTED_SECRET}`
    )
    expect(redactReportText('{"token":"abc123"}')).toContain(REDACTED_SECRET)
  })

  it('用户名按全词替换，不误伤近形词', () => {
    expect(redactReportText('camera 坏了，cam 的目录没了', { userName: 'cam' })).toBe(
      `camera 坏了，${REDACTED_USER_NAME} 的目录没了`
    )
  })

  it('大陆手机号及常见分段写法脱敏，不截取时间戳或标识中的数字', () => {
    for (const phone of ['13800138000', '+8613800138000', '+86 138 0013 8000', '138-0013-8000']) {
      expect(redactReportText(`联系${phone}，请回电`)).toBe(`联系${REDACTED_PHONE}，请回电`)
    }
    const diagnostic = 'timestamp=1380013800000 model=abc13800138000 build=13800138000beta count=12345'
    expect(redactReportText(diagnostic)).toBe(diagnostic)
  })

  it('电话在失败详情、日志及补充说明中都脱敏，明确电话字段也覆盖数字和其他地区', () => {
    const details = { contacts: [{ phone: 13800138000, mobile_number: '+1 (202) 555-0123' }], count: 13800138000 }
    const report = buildBugReport({
      lines: [JSON.stringify({ phase: 'failure', code: 'eleckoi/io/failed', msg: '联系13800138000', details })],
      environment: BASE_REPORT.environment, session: BASE_REPORT.session, includeLogTail: true,
      notes: '回电 +86 138 0013 8000'
    })
    expect(report.failures[0]?.message).toBe(`联系${REDACTED_PHONE}`)
    expect(report.failures[0]?.details).toEqual({ contacts: [{ phone: REDACTED_PHONE, mobile_number: REDACTED_PHONE }], count: 13800138000 })
    expect(report.logTail).not.toContain('联系13800138000')
    expect(report.logTail).not.toContain('+1 (202) 555-0123')
    expect(report.notes).toBe(`回电 ${REDACTED_PHONE}`)
    expect(details.contacts[0]?.phone).toBe(13800138000)
  })

  it('没给用户名时从家目录末段推导', () => {
    expect(redactReportText('alice 打开了 camera', { home: 'C:\\Users\\alice' })).toBe(
      `${REDACTED_USER_NAME} 打开了 camera`
    )
  })

  it('整份报告都过一遍，码与结构化详情保持原样', () => {
    const report = redactBugReport(
      reportOf({
        failures: [
          {
            code: 'eleckoi/plugin/load-failed',
            message: '加载 C:\\Users\\alice\\plugin 失败',
            details: { what: '密文 alice@example.com', count: 3 }
          }
        ],
        logTail: 'token=abcdef 写到 /home/alice/x.log',
        notes: 'alice 留'
      }),
      { home: 'C:\\Users\\alice', userName: 'alice' }
    )
    expect(report.failures[0]?.code).toBe('eleckoi/plugin/load-failed')
    expect(report.failures[0]?.message).not.toContain('alice')
    expect(report.failures[0]?.details?.what).toBe(`密文 ${REDACTED_EMAIL}`)
    expect(report.failures[0]?.details?.count).toBe(3)
    expect(report.logTail).not.toContain('abcdef')
    expect(report.logTail).not.toContain('/home/alice')
    expect(report.notes).toBe(`${REDACTED_USER_NAME} 留`)
  })
})

describe('邮件', () => {
  it('地址形态', () => {
    expect(isBugReportMailbox('bugs@eleckoi.test')).toBe(true)
    expect(isBugReportMailbox(' bugs@eleckoi.test ')).toBe(true)
    expect(isBugReportMailbox('bugs@localhost')).toBe(false)
    expect(isBugReportMailbox('bugs eleckoi.test')).toBe(false)
    expect(isBugReportMailbox('')).toBe(false)
  })

  it('地址不合法时不给链接（调用方改为显示地址 + 复制正文）', () => {
    expect(buildBugReportMailto(BASE_REPORT, 'not-an-address')).toBeUndefined()
  })

  it('短报告带全文，主题与正文都能解码回来', () => {
    const report = reportOf({ logTail: '第一行\n第二行' })
    const mailto = buildBugReportMailto(report, 'bugs@eleckoi.test')
    expect(mailto).toBeDefined()
    if (mailto === undefined) return
    expect(mailto.url.startsWith('mailto:bugs@eleckoi.test?')).toBe(true)
    expect(mailto.summarized).toBe(false)
    const { subject, body } = mailtoParts(mailto.url)
    expect(subject).toBe(bugReportSubject(report))
    expect(body).toContain('v0.2.14')
    expect(body).toContain('eleckoi/plugin/load-failed')
    expect(body).toContain('第一行')
    expect(body).toContain('\r\n')
    expect(mailto.body).toBe(formatBugReportBody(report))
  })

  it('装不下时降级成摘要，编码后的 URL 不超限，全文不进链接', () => {
    const logTail = Array.from({ length: 200 }, (_, index) => `2026-10-27T12:00:00.000Z 第 ${index} 行日志内容`).join('\n')
    const report = reportOf({ logTail })
    const mailto = buildBugReportMailto(report, 'bugs@eleckoi.test')
    expect(mailto).toBeDefined()
    if (mailto === undefined) return
    expect(mailto.summarized).toBe(true)
    expect(mailto.url.length).toBeLessThanOrEqual(1800)
    expect(mailto.body).toBe(formatBugReportSummary(report))
    const { body } = mailtoParts(mailto.url)
    expect(body).toContain('摘要')
    expect(body).not.toContain('第 199 行')
  })

  it('摘要也要满足给定的更小上限', () => {
    const mailto = buildBugReportMailto(BASE_REPORT, 'bugs@eleckoi.test', { maxLength: 60 })
    expect(mailto?.summarized).toBe(true)
  })

  it('正文是纯文本，失败详情按 JSON 展开', () => {
    const body = formatBugReportBody(BASE_REPORT)
    expect(body).toContain('失败（1 条）')
    expect(body).toContain('详情：{"what":"DSH 插件宿主"}')
    expect(body.startsWith('ElecKoi 故障报告')).toBe(true)
  })
})

describe('issue', () => {
  const REPOSITORY = 'KuramiWan/eleckoi-reports'

  /** `https://github.com/<repo>/issues/new?...` → 解码后的标题与正文。 */
  function issueParts(url: string): { title: string; body: string } {
    const query = url.slice(url.indexOf('?') + 1)
    const params = new URLSearchParams(query)
    return { title: params.get('title') ?? '', body: params.get('body') ?? '' }
  }

  it('仓库名形态', () => {
    expect(isBugReportRepository(REPOSITORY)).toBe(true)
    expect(isBugReportRepository('eleckoi/ElecKoi')).toBe(true)
    expect(isBugReportRepository('eleckoi')).toBe(false)
    expect(isBugReportRepository('eleckoi/ElecKoi/issues')).toBe(false)
  })

  it('签名块能原样读回来', () => {
    const record = bugReportSignatureRecord(BASE_REPORT)
    expect(record.signature).toBe(bugReportSignature(BASE_REPORT))
    expect(record.code).toBe('eleckoi/plugin/load-failed')
    expect(record.version).toBe('v0.2.14')
    expect(record.platform).toBe('windows')

    const comment = formatBugReportSignatureComment(BASE_REPORT)
    expect(comment.startsWith(`<!-- ${BUG_REPORT_SIGNATURE_MARKER}:`)).toBe(true)
    expect(comment.endsWith(' -->')).toBe(true)
    expect(parseBugReportSignatureComment(comment)).toEqual(record)
  })

  it('读不回来的正文一律返回 undefined，不抛', () => {
    expect(parseBugReportSignatureComment('没有签名块')).toBeUndefined()
    expect(parseBugReportSignatureComment(`<!-- ${BUG_REPORT_SIGNATURE_MARKER}:{坏 JSON} -->`)).toBeUndefined()
    expect(
      parseBugReportSignatureComment(
        `<!-- ${BUG_REPORT_SIGNATURE_MARKER}:{"schemaVersion":1,"signature":"a@v1:windows","code":"a","version":"v1","platform":"solaris"} -->`
      )
    ).toBeUndefined()
  })

  it('正文第一行就是签名块，日志尾收在 details 里', () => {
    const body = formatBugReportIssueBody(reportOf({ logTail: '第一行\n第二行' }))
    expect(body.split('\n')[0]).toBe(formatBugReportSignatureComment(reportOf({ logTail: '第一行\n第二行' })))
    expect(body).toContain('### 失败（1 条）')
    expect(body).toContain('```json')
    expect(body).toContain('<details>')
    expect(body).toContain('第一行')
    expect(parseBugReportSignatureComment(body)?.signature).toBe(bugReportSignature(BASE_REPORT))
  })

  it('日志里有围栏时用更长的围栏，块不会被提前闭合', () => {
    const body = formatBugReportIssueBody(reportOf({ logTail: '行一\n```\n行三' }))
    expect(body).toContain('````')
    expect(parseBugReportSignatureComment(body)).toBeDefined()
  })

  it('短报告直接带全文', () => {
    const link = buildBugReportIssueUrl(BASE_REPORT, { repository: REPOSITORY })
    expect(link).toBeDefined()
    if (link === undefined) return
    expect(link.url.startsWith(`https://github.com/${REPOSITORY}/issues/new?`)).toBe(true)
    expect(link.summarized).toBe(false)
    const { title, body } = issueParts(link.url)
    expect(title).toBe(bugReportSubject(BASE_REPORT))
    expect(body).toContain('eleckoi/plugin/load-failed')
    expect(parseBugReportSignatureComment(body)?.platform).toBe('windows')
    expect(link.body).toBe(formatBugReportIssueBody(BASE_REPORT))
  })

  it('仓库名不合法时不给链接', () => {
    expect(buildBugReportIssueUrl(BASE_REPORT, { repository: 'eleckoi' })).toBeUndefined()
  })

  it('装不下时降级成摘要，签名块仍在（折叠不依赖正文长度）', () => {
    const logTail = Array.from({ length: 200 }, (_, index) => `2026-10-27T12:00:00.000Z 第 ${index} 行日志内容`).join('\n')
    const report = reportOf({ logTail })
    const link = buildBugReportIssueUrl(report, { repository: REPOSITORY })
    expect(link).toBeDefined()
    if (link === undefined) return
    expect(link.summarized).toBe(true)
    expect(link.url.length).toBeLessThanOrEqual(BUG_REPORT_ISSUE_URL_MAX_LENGTH)
    expect(link.body).toBe(formatBugReportIssueSummary(report))
    const { body } = issueParts(link.url)
    expect(parseBugReportSignatureComment(body)?.signature).toBe(bugReportSignature(report))
    expect(body).not.toContain('第 199 行日志内容')
  })

  it('标签是可选预填', () => {
    const link = buildBugReportIssueUrl(BASE_REPORT, { repository: REPOSITORY, labels: ['bug', 'crash'] })
    expect(link?.url).toContain('&labels=bug%2Ccrash')
  })

  it('摘要也要满足给定的更小上限', () => {
    const link = buildBugReportIssueUrl(BASE_REPORT, { repository: REPOSITORY, maxLength: 60 })
    expect(link?.summarized).toBe(true)
  })
})

describe('列表与代发', () => {
  const LETTER = { mailboxName: 'ElecKoi 报告列表', subscribeUrl: 'https://groups.example/eleckoi' }

  it('正文带上列表名与订阅地址（邮件通道没有回执，跟丢就靠这一句）', () => {
    const body = formatBugReportBody(BASE_REPORT, LETTER)
    expect(body).toContain('已投递到 ElecKoi 报告列表')
    expect(body).toContain('https://groups.example/eleckoi')
    expect(formatBugReportBody(BASE_REPORT)).not.toContain('已投递到')
  })

  it('摘要降级后也不丢跟进方式', () => {
    const summary = formatBugReportSummary(BASE_REPORT, LETTER)
    expect(summary).toContain('ElecKoi 报告列表')
    expect(summary).toContain('订阅')
  })

  it('mailto 把页脚带进去', () => {
    const mailto = buildBugReportMailto(BASE_REPORT, 'bugs@eleckoi.test', LETTER)
    expect(mailto).toBeDefined()
    if (mailto === undefined) return
    const { body } = mailtoParts(mailto.url)
    expect(body).toContain('ElecKoi 报告列表')
  })

  it('Web3Forms：公开标识 + 主题 + 正文', () => {
    const relay: BugReportRelayConfig = {
      provider: 'web3forms',
      endpoint: 'https://api.web3forms.com/submit',
      accessKey: 'pub-key',
      fromName: 'ElecKoi 报告'
    }
    const request = buildBugReportRelayRequest(relay, BASE_REPORT, LETTER)
    expect(request).toBeDefined()
    if (request === undefined) return
    expect(request.url).toBe('https://api.web3forms.com/submit')
    expect(request.body.access_key).toBe('pub-key')
    expect(request.body.subject).toBe(bugReportSubject(BASE_REPORT))
    expect(request.body.from_name).toBe('ElecKoi 报告')
    expect(request.body.message).toContain('ElecKoi 报告列表')
  })

  it('Formspree：用下划线字段，不需要 key', () => {
    const relay: BugReportRelayConfig = {
      provider: 'formspree',
      endpoint: 'https://formspree.io/f/abc123',
      accessKey: ''
    }
    const request = buildBugReportRelayRequest(relay, BASE_REPORT)
    expect(request?.body._subject).toBe(bugReportSubject(BASE_REPORT))
    expect(request?.body.message).toContain('ElecKoi 故障报告')
  })

  it('自有 Worker：整份报告进信封，入口不需要密钥', () => {
    const relay: BugReportRelayConfig = {
      provider: 'eleckoi-relay',
      endpoint: 'https://eleckoi-relay.example.workers.dev/report',
      accessKey: ''
    }
    const request = buildBugReportRelayRequest(relay, BASE_REPORT, LETTER)
    expect(request).toBeDefined()
    if (request === undefined) return
    expect(request.url).toBe('https://eleckoi-relay.example.workers.dev/report')
    const envelope = request.body as {
      schemaVersion: number
      report: { failures: { code: string }[] }
      letter?: { mailboxName?: string; subscribeUrl?: string }
    }
    expect(envelope.schemaVersion).toBe(1)
    expect(envelope.report.failures[0]?.code).toBe('eleckoi/plugin/load-failed')
    expect(envelope.letter?.mailboxName).toBe('ElecKoi 报告列表')
    expect(envelope.letter?.subscribeUrl).toBe('https://groups.example/eleckoi')
  })

  it('回执只从自有 Worker 的响应里取，托管表单服务不给', () => {
    expect(bugReportRelayReceipt('eleckoi-relay', '{"ok":true,"issue":123}')).toBe('#123')
    expect(bugReportRelayReceipt('eleckoi-relay', '{"ok":true,"issue":"EL-7"}')).toBe('#EL-7')
    expect(bugReportRelayReceipt('eleckoi-relay', 'not json')).toBeUndefined()
    expect(bugReportRelayReceipt('eleckoi-relay', '{"ok":true,"issue":0}')).toBeUndefined()
    expect(bugReportRelayReceipt('web3forms', '{"issue":123}')).toBeUndefined()
  })

  it('配置不完整就不给请求（宁可少一个按钮，也不发必然失败的请求）', () => {
    const https = 'https://api.web3forms.com/submit'
    expect(buildBugReportRelayRequest(
      { provider: 'web3forms', endpoint: 'http://insecure.example', accessKey: 'k' }, BASE_REPORT)).toBeUndefined()
    expect(buildBugReportRelayRequest(
      { provider: 'web3forms', endpoint: https, accessKey: '   ' }, BASE_REPORT)).toBeUndefined()
    expect(buildBugReportRelayRequest(
      { provider: 'formspree', endpoint: 'not-a-url', accessKey: '' }, BASE_REPORT)).toBeUndefined()
  })
})
