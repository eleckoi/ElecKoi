/**
 * Android 报告事实门面（ADR 0041 决定 8）。
 *
 * Java 只给原始事实（环境 / 上次会话 / 最近事件 / 投递配置），门面负责解析成对象；
 * 报告的拼装、脱敏与折叠都在渲染层的共享契约里。这里断言门面只做这一件事，且不吞掉
 * 「诊断没开启」的如实回答。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'

const facade = readFileSync(new URL('../app/src/main/assets/platform-facade.js', import.meta.url), 'utf8')
const diagnostics = readFileSync(new URL('../app/src/main/java/com/eleckoi/app/AndroidDiagnostics.java', import.meta.url), 'utf8')
const strings = readFileSync(new URL('../app/src/main/res/values/strings.xml', import.meta.url), 'utf8')

function pageWith(facts) {
  const page = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://127.0.0.1:12345/',
    runScripts: 'outside-only',
    pretendToBeVisual: true
  })
  page.window.matchMedia = () => ({ matches: true })
  page.window.ElecKoiAndroid = { bugReportFacts: () => JSON.stringify(facts) }
  page.window.eval(facade)
  return page
}

describe('Android 报告事实门面', () => {
  it('facts() 解析 Java 返回的事实', async () => {
    const page = pageWith({
      available: true,
      environment: { appVersion: '0.2.13', platform: 'android', arch: 'arm64-v8a' },
      session: { startedAt: '2026-10-27T09:00:00.000Z', ended: false },
      events: ['{"kind":"java-uncaught","message":"空指针"}'],
      delivery: { mailbox: '', repository: '' }
    })
    await expect(page.window.ElecKoiPlatform.bugReport.facts()).resolves.toMatchObject({
      available: true,
      environment: { platform: 'android' },
      session: { ended: false }
    })
  })

  it('诊断没开启时如实返回 available:false', async () => {
    const page = pageWith({ available: false })
    await expect(page.window.ElecKoiPlatform.bugReport.facts()).resolves.toEqual({ available: false })
  })

  it('原样透出 Java 给的表单投递配置（门面不做形状加工）', async () => {
    const form = {
      shareUrl: 'https://axdf0mvt1ng.feishu.cn/share/base/form/shrcnS4SMQzG3Bs4ReqtlR1Xcud',
      fields: { body: 'report_body', meta: 'report_meta', code: 'report_code', file: 'report_file' }
    }
    const page = pageWith({
      available: true,
      environment: { appVersion: '0.2.13', platform: 'android', arch: 'arm64-v8a' },
      session: { startedAt: '2026-10-27T09:00:00.000Z', ended: true },
      events: [],
      delivery: { mailbox: '', repository: '', form }
    })
    const facts = await page.window.ElecKoiPlatform.bugReport.facts()
    expect(facts).toMatchObject({ available: true, delivery: { mailbox: '', repository: '' } })
    // 链接与四个题目名都来自发布配置，门面只做 JSON.parse——原样带出去，不改一个字符。
    expect(facts.delivery.form).toEqual(form)
  })

  // Java 本机编译不了（无 Android SDK），所以用源码核对把「资源 → delivery.form」这条线钉住。
  it('Java 侧的 delivery.form 与资源里的表单配置对得上', () => {
    const names = [...diagnostics.matchAll(/R\.string\.(bug_report_form_\w+)/g)].map(match => match[1])
    expect(new Set(names)).toEqual(new Set([
      'bug_report_form_url',
      'bug_report_form_field_body',
      'bug_report_form_field_meta',
      'bug_report_form_field_code',
      'bug_report_form_field_file'
    ]))
    for (const name of names) {
      expect(strings).toContain(`<string name="${name}" translatable="false">`)
    }
    expect(strings).toMatch(/bug_report_form_url"[^>]*>https:\/\/[^<]*\/share\/base\/form\/shr/)
    // 链接为空时不带 form：渲染层据此不渲染按钮（与「未配置」同义）。
    expect(diagnostics).toContain('if (!formUrl.isEmpty()) {')
    expect(diagnostics).toContain('.put("shareUrl", formUrl)')
    expect(diagnostics).toContain('.put("delivery", delivery)')
  })
})
