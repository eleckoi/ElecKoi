/**
 * 内置投递配置的解析：文件原文 + 环境变量 → 通道配置。
 *
 * 判据（[ADR 0042](../../docs/adr/0042-bug-report-delivery.md) 决定 12 / 16 与 spec「配置」段）：
 * 普通用户装的是安装包，环境变量那条路等于没有，所以配置随应用打包；环境变量逐项覆盖。
 * 文件缺失、JSON 损坏、字段形状不对一律按「未配置」处理，**永不抛**——报告功能不能因为配置坏了起不来。
 *
 * 断言的是纯函数接缝：固定输入 → 固定输出。不 mock 文件系统；文件读取是胶水层，由主进程接线间接覆盖。
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseBugReportConfig } from '../src/main/modules/diagnostics/reportConfig'

/** 一份合法的内置配置文件原文（测试里独立的真值，不找解析器要）。 */
const VALID_FILE = JSON.stringify({
  form: {
    shareUrl: 'https://axdf0mvt1ng.feishu.cn/share/base/form/shrcnTest',
    fields: {
      body: 'report_body',
      meta: 'report_meta',
      code: 'report_code',
      file: 'report_file'
    }
  },
  mailbox: 'bugs@example.com',
  mailboxName: 'ElecKoi 报告列表',
  subscribeUrl: 'https://example.com/subscribe',
  repository: 'KuramiWan/ElecKoi'
})

describe('没有可用配置', () => {
  it('文件缺失、环境变量为空 → 表单缺失，邮箱与仓库为空', () => {
    const config = parseBugReportConfig({ fileText: undefined, environment: {} })

    expect(config.form).toBeUndefined()
    expect(config.mailbox).toBe('')
    expect(config.repository).toBe('')
  })

  it('坏 JSON 一律按未配置处理，不抛', () => {
    for (const text of ['{', '[]', 'null', '"字符串"', '这是一段纯文本']) {
      const config = parseBugReportConfig({ fileText: text, environment: {} })

      expect(config.form).toBeUndefined()
      expect(config.mailbox).toBe('')
      expect(config.repository).toBe('')
    }
  })
})

describe('合法的内置配置', () => {
  it('读出表单链接与四个题目名', () => {
    const config = parseBugReportConfig({ fileText: VALID_FILE, environment: {} })

    expect(config.form?.shareUrl).toBe('https://axdf0mvt1ng.feishu.cn/share/base/form/shrcnTest')
    expect(config.form?.fields).toEqual({
      body: 'report_body',
      meta: 'report_meta',
      code: 'report_code',
      file: 'report_file'
    })
    expect(config.mailbox).toBe('bugs@example.com')
    expect(config.mailboxName).toBe('ElecKoi 报告列表')
    expect(config.subscribeUrl).toBe('https://example.com/subscribe')
    expect(config.repository).toBe('KuramiWan/ElecKoi')
  })
})

describe('表单段形状不对', () => {
  /** 只造一个表单段，其余字段用一份「其余字段照读」的合法值。 */
  function fileWithForm(form: unknown): string {
    return JSON.stringify({
      form,
      mailbox: 'bugs@example.com',
      repository: 'KuramiWan/ElecKoi'
    })
  }

  it('分享链接是数字 → 不产出表单，其余字段照读', () => {
    const config = parseBugReportConfig({
      fileText: fileWithForm({ shareUrl: 123, fields: { body: 'report_body' } }),
      environment: {}
    })

    expect(config.form).toBeUndefined()
    expect(config.mailbox).toBe('bugs@example.com')
    expect(config.repository).toBe('KuramiWan/ElecKoi')
  })

  it('题目里缺正文 → 不产出表单，其余字段照读', () => {
    const config = parseBugReportConfig({
      fileText: fileWithForm({
        shareUrl: 'https://example.feishu.cn/share/base/form/shrcnTest',
        fields: { meta: 'report_meta' }
      }),
      environment: {}
    })

    expect(config.form).toBeUndefined()
    expect(config.mailbox).toBe('bugs@example.com')
    expect(config.repository).toBe('KuramiWan/ElecKoi')
  })

  it('分享链接不是 http(s) → 不产出表单，其余字段照读', () => {
    for (const shareUrl of ['mailto:bugs@example.com', 'file:///报告.json', '/share/base/form/x']) {
      const config = parseBugReportConfig({
        fileText: fileWithForm({ shareUrl, fields: { body: 'report_body' } }),
        environment: {}
      })

      expect(config.form).toBeUndefined()
      expect(config.mailbox).toBe('bugs@example.com')
      expect(config.repository).toBe('KuramiWan/ElecKoi')
    }
  })
})

describe('环境变量覆盖', () => {
  it('表单链接被 env 换掉，题目名保留文件值', () => {
    const config = parseBugReportConfig({
      fileText: VALID_FILE,
      environment: { ELECKOI_BUG_REPORT_FORM_URL: ' https://new.feishu.cn/share/base/form/shrcnNew ' }
    })

    expect(config.form?.shareUrl).toBe('https://new.feishu.cn/share/base/form/shrcnNew')
    expect(config.form?.fields.body).toBe('report_body')
  })

  it('题目名逐项被 env 覆盖', () => {
    const config = parseBugReportConfig({
      fileText: VALID_FILE,
      environment: {
        ELECKOI_BUG_REPORT_FORM_FIELD_BODY: 'body_v2',
        ELECKOI_BUG_REPORT_FORM_FIELD_CODE: 'code_v2'
      }
    })

    expect(config.form?.fields).toEqual({
      body: 'body_v2',
      meta: 'report_meta',
      code: 'code_v2',
      file: 'report_file'
    })
  })

  it('文件里没有表单、env 给齐链接与正文题目 → 表单出现', () => {
    const config = parseBugReportConfig({
      fileText: JSON.stringify({}),
      environment: {
        ELECKOI_BUG_REPORT_FORM_URL: 'https://example.feishu.cn/share/base/form/shrcnEnv',
        ELECKOI_BUG_REPORT_FORM_FIELD_BODY: 'report_body'
      }
    })

    expect(config.form?.shareUrl).toBe('https://example.feishu.cn/share/base/form/shrcnEnv')
    expect(config.form?.fields).toEqual({ body: 'report_body' })
  })

  it('显式空串清掉表单链接 → 表单不出现（其余字段照读）', () => {
    const config = parseBugReportConfig({
      fileText: VALID_FILE,
      environment: { ELECKOI_BUG_REPORT_FORM_URL: '   ' }
    })

    expect(config.form).toBeUndefined()
    expect(config.mailbox).toBe('bugs@example.com')
  })

  it('显式空串清掉邮箱，其余字段不受影响', () => {
    const config = parseBugReportConfig({
      fileText: VALID_FILE,
      environment: { ELECKOI_BUG_REPORT_MAILBOX: '' }
    })

    expect(config.mailbox).toBe('')
    expect(config.repository).toBe('KuramiWan/ElecKoi')
    expect(config.form?.shareUrl).toBe('https://axdf0mvt1ng.feishu.cn/share/base/form/shrcnTest')
  })

  it('env 是 undefined（没设）→ 保留文件值', () => {
    const config = parseBugReportConfig({
      fileText: VALID_FILE,
      environment: {
        ELECKOI_BUG_REPORT_FORM_URL: undefined,
        ELECKOI_BUG_REPORT_MAILBOX: undefined
      }
    })

    expect(config.form?.shareUrl).toBe('https://axdf0mvt1ng.feishu.cn/share/base/form/shrcnTest')
    expect(config.mailbox).toBe('bugs@example.com')
  })

  it('文件为空、env 给出邮箱类与仓库 → 用 env', () => {
    const config = parseBugReportConfig({
      fileText: JSON.stringify({ mailbox: '' }),
      environment: {
        ELECKOI_BUG_REPORT_MAILBOX: 'new@example.com',
        ELECKOI_BUG_REPORT_MAILBOX_NAME: '新列表',
        ELECKOI_BUG_REPORT_SUBSCRIBE_URL: 'https://example.com/subscribe',
        ELECKOI_BUG_REPORT_REPOSITORY: 'KuramiWan/ElecKoi'
      }
    })

    expect(config.mailbox).toBe('new@example.com')
    expect(config.mailboxName).toBe('新列表')
    expect(config.subscribeUrl).toBe('https://example.com/subscribe')
    expect(config.repository).toBe('KuramiWan/ElecKoi')
  })
})

describe('代发通道（沿用既有环境变量语义）', () => {
  it('四件套齐全 → relay 出现', () => {
    const config = parseBugReportConfig({
      fileText: undefined,
      environment: {
        ELECKOI_BUG_REPORT_RELAY_PROVIDER: 'web3forms',
        ELECKOI_BUG_REPORT_RELAY_ENDPOINT: 'https://api.web3forms.com/submit',
        ELECKOI_BUG_REPORT_RELAY_KEY: 'public-key',
        ELECKOI_BUG_REPORT_RELAY_FROM_NAME: 'ElecKoi 报告'
      }
    })

    expect(config.relay).toEqual({
      provider: 'web3forms',
      endpoint: 'https://api.web3forms.com/submit',
      accessKey: 'public-key',
      fromName: 'ElecKoi 报告'
    })
  })

  it('缺 key（provider 认识）→ relay 仍在，accessKey 为空', () => {
    const config = parseBugReportConfig({
      fileText: VALID_FILE,
      environment: {
        ELECKOI_BUG_REPORT_RELAY_PROVIDER: 'formspree',
        ELECKOI_BUG_REPORT_RELAY_ENDPOINT: 'https://formspree.io/f/xyz'
      }
    })

    expect(config.relay).toEqual({
      provider: 'formspree',
      endpoint: 'https://formspree.io/f/xyz',
      accessKey: ''
    })
  })

  it('provider 不认识或端点为空 → 没有 relay', () => {
    for (const environment of [
      { ELECKOI_BUG_REPORT_RELAY_PROVIDER: 'unknown-service', ELECKOI_BUG_REPORT_RELAY_ENDPOINT: 'https://x' },
      { ELECKOI_BUG_REPORT_RELAY_PROVIDER: 'web3forms' }
    ]) {
      const config = parseBugReportConfig({ fileText: VALID_FILE, environment })

      expect(config.relay).toBeUndefined()
    }
  })
})

describe('任何输入都不抛', () => {
  it('数组、字符串与深层嵌套垃圾一律按未配置处理', () => {
    const texts = [
      JSON.stringify({ form: [] }),
      JSON.stringify({ form: { shareUrl: {}, fields: [] } }),
      JSON.stringify({ form: { shareUrl: 'https://example.feishu.cn/f', fields: { body: ['report_body'] } } }),
      JSON.stringify({ form: 'report', mailbox: { nested: { deeper: [1, 2, 3] } }, repository: null }),
      JSON.stringify([[[{ form: 'x' }]]]),
      JSON.stringify({ mailbox: 42, mailboxName: ['列表'], subscribeUrl: { url: 'x' } })
    ]
    for (const text of texts) {
      const parse = (): unknown => parseBugReportConfig({ fileText: text, environment: {} })

      expect(parse).not.toThrow()
      expect(parseBugReportConfig({ fileText: text, environment: {} }).form).toBeUndefined()
    }
  })
})

describe('仓库里那份内置配置', () => {
  it('能解析出表单，且链接是带 /form/ 的填写页', () => {
    const fileText = readFileSync('apps/desktop/resources/bug-report.json', 'utf8')
    const config = parseBugReportConfig({ fileText, environment: {} })

    expect(config.form?.shareUrl).toContain('/share/base/form/')
    expect(config.form?.fields).toEqual({
      body: 'report_body',
      meta: 'report_meta',
      code: 'report_code',
      file: 'report_file'
    })
  })
})
