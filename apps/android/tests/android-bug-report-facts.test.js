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
})
