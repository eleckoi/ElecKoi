/**
 * 远程投递配置（ADR 0042 决定 16 修订）：默认不联网；配了 `configUrl` 才拉，且只用来换表单端点。
 *
 * 判据：这条链接决定用户的日志发到哪里，等于信任边界——所以 https、形状、主机白名单、
 * 失败静默回退这四件事各有一条用例守着。
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BUG_REPORT_CONFIG_URL_ENV,
  BUG_REPORT_REMOTE_CONFIG_FILE,
  DEFAULT_FORM_HOSTS,
  fetchRemoteForm,
  isAllowedFormHost,
  preferredForm,
  readCachedRemoteForm,
  remoteFormOf,
  withPreferredForm,
  writeCachedRemoteForm
} from '../src/main/modules/diagnostics/remoteReportConfig'
import { parseBugReportConfigSources } from '../src/main/modules/diagnostics/reportConfig'

const FORM = {
  shareUrl: 'https://axdf0mvt1ng.feishu.cn/share/base/form/shrcSyntheticForm',
  fields: { body: 'report_body', meta: 'report_meta', code: 'report_code', file: 'report_file' }
}

const PAYLOAD = JSON.stringify({ form: FORM })

const directories: string[] = []

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'eleckoi-remote-config-'))
  directories.push(directory)
  return directory
}

function responseOf(body: string, init: { status?: number; contentLength?: string } = {}): Response {
  return new Response(body, {
    status: init.status ?? 200,
    headers: init.contentLength === undefined ? {} : { 'content-length': init.contentLength }
  })
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe('允许的表单主机', () => {
  it('只认白名单里的 https 主机（含子域）', () => {
    expect(isAllowedFormHost('https://axdf0mvt1ng.feishu.cn/share/base/form/shrcX')).toBe(true)
    expect(isAllowedFormHost('https://feishu.cn/share/base/form/shrcX')).toBe(true)
    expect(isAllowedFormHost('http://axdf0mvt1ng.feishu.cn/share/base/form/shrcX')).toBe(false)
    expect(isAllowedFormHost('https://feishu.cn.example.com/share/base/form/shrcX')).toBe(false)
    expect(isAllowedFormHost('https://example.com/share/base/form/shrcX')).toBe(false)
    expect(isAllowedFormHost('not a url')).toBe(false)
  })

  it('白名单可以按配置收紧', () => {
    expect(isAllowedFormHost(FORM.shareUrl, [])).toBe(false)
    expect(isAllowedFormHost(FORM.shareUrl, ['example.com'])).toBe(false)
    expect(isAllowedFormHost(FORM.shareUrl, ['feishu.cn'])).toBe(true)
  })
})

describe('远程配置载荷', () => {
  it('只取分享链接与四个题目名', () => {
    expect(remoteFormOf(PAYLOAD)).toEqual(FORM)
    // 别的键一律忽略：远程配置扩不了权。
    const noisy = JSON.stringify({ form: FORM, mailbox: 'attacker@example.com', relay: { endpoint: 'https://example.com' } })
    expect(remoteFormOf(noisy)).toEqual(FORM)
  })

  it('形状不对、主机不在白名单、超过上限都整份丢弃', () => {
    expect(remoteFormOf('not json')).toBeUndefined()
    expect(remoteFormOf(JSON.stringify({}))).toBeUndefined()
    expect(remoteFormOf(JSON.stringify({ form: { shareUrl: FORM.shareUrl } }))).toBeUndefined()
    expect(remoteFormOf(JSON.stringify({
      form: { ...FORM, shareUrl: 'https://example.com/share/base/form/shrcSyntheticForm' }
    }))).toBeUndefined()
    expect(remoteFormOf(`${PAYLOAD}${'x'.repeat(64 * 1024)}`)).toBeUndefined()
  })
})

describe('拉取', () => {
  it('200 + 合法载荷才采信', async () => {
    const fetchImpl = vi.fn(async () => responseOf(PAYLOAD))
    await expect(fetchRemoteForm('https://config.example.test/report.json', DEFAULT_FORM_HOSTS, { fetchImpl }))
      .resolves.toEqual(FORM)
  })

  it('非 2xx、非 https、超大、断网都当「这次没拿到」', async () => {
    const failing = vi.fn(async () => responseOf(PAYLOAD, { status: 500 }))
    await expect(fetchRemoteForm('https://config.example.test/report.json', DEFAULT_FORM_HOSTS, { fetchImpl: failing }))
      .resolves.toBeUndefined()
    await expect(fetchRemoteForm('http://config.example.test/report.json', DEFAULT_FORM_HOSTS, { fetchImpl: failing }))
      .resolves.toBeUndefined()
    const oversized = vi.fn(async () => responseOf(PAYLOAD, { contentLength: String(65 * 1024) }))
    await expect(fetchRemoteForm('https://config.example.test/report.json', DEFAULT_FORM_HOSTS, { fetchImpl: oversized }))
      .resolves.toBeUndefined()
    const offline = vi.fn(async () => { throw new Error('ENOTFOUND') })
    await expect(fetchRemoteForm('https://config.example.test/report.json', DEFAULT_FORM_HOSTS, { fetchImpl: offline }))
      .resolves.toBeUndefined()
  })

  it('超时就放弃，不让报告对话框挂在网络上', async () => {
    const hanging = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new Error('aborted')))
    }))
    const started = Date.now()
    await expect(fetchRemoteForm('https://config.example.test/report.json', DEFAULT_FORM_HOSTS, {
      fetchImpl: hanging as unknown as typeof fetch,
      timeoutMs: 20
    })).resolves.toBeUndefined()
    expect(Date.now() - started).toBeLessThan(2000)
  })
})

describe('缓存', () => {
  it('写进去再读回来，形状一样', () => {
    const directory = temporaryDirectory()
    writeCachedRemoteForm(directory, FORM, new Date('2026-11-05T08:00:00.000Z'))
    expect(readCachedRemoteForm(directory)).toEqual({ form: FORM, fetchedAt: '2026-11-05T08:00:00.000Z' })
    expect(JSON.parse(readFileSync(join(directory, BUG_REPORT_REMOTE_CONFIG_FILE), 'utf8')).form).toEqual(FORM)
  })

  it('坏缓存、主机不在白名单都不采信（不留假端点）', () => {
    const directory = temporaryDirectory()
    writeFileSync(join(directory, BUG_REPORT_REMOTE_CONFIG_FILE), '{"fetchedAt":"2026-11-05T08:00:00.000Z","form":',
      'utf8')
    expect(readCachedRemoteForm(directory)).toBeUndefined()
    writeCachedRemoteForm(directory, FORM)
    expect(readCachedRemoteForm(directory, ['example.com'])).toBeUndefined()
  })
})

describe('优先级', () => {
  it('远程赢了才用远程，否则用内置', () => {
    const bundled = { ...FORM, shareUrl: 'https://axdf0mvt1ng.feishu.cn/share/base/form/shrcBundled' }
    expect(preferredForm(bundled, FORM)).toEqual(FORM)
    expect(preferredForm(bundled, undefined)).toEqual(bundled)
    expect(preferredForm(bundled, { ...FORM, shareUrl: 'https://example.com/x' })).toEqual(bundled)
  })

  it('没有表单时不留空的 form 键', () => {
    const delivery = { mailbox: 'bugs@eleckoi.test', repository: '' }
    expect(withPreferredForm(delivery, undefined)).toEqual(delivery)
    expect('form' in withPreferredForm(delivery, undefined)).toBe(false)
    expect(withPreferredForm(delivery, FORM)).toEqual({ ...delivery, form: FORM })
  })
})

describe('配置来源', () => {
  it('configUrl 与白名单只从文件/环境变量来', () => {
    const sources = parseBugReportConfigSources({
      fileText: JSON.stringify({ form: FORM, configUrl: 'https://config.example.test/report.json', formHosts: ['feishu.cn'] }),
      environment: {}
    })
    expect(sources.configUrl).toBe('https://config.example.test/report.json')
    expect(sources.formHosts).toEqual(['feishu.cn'])
    expect(sources.delivery.form).toEqual(FORM)
  })

  it('空串显式关掉，非 https 一律当没配，白名单缺省是 feishu.cn', () => {
    const file = JSON.stringify({ form: FORM, configUrl: 'https://config.example.test/report.json' })
    expect(parseBugReportConfigSources({ fileText: file, environment: { [BUG_REPORT_CONFIG_URL_ENV]: '' } }).configUrl)
      .toBeUndefined()
    expect(parseBugReportConfigSources({ fileText: file, environment: { [BUG_REPORT_CONFIG_URL_ENV]: 'http://config.example.test/x' } }).configUrl)
      .toBeUndefined()
    expect(parseBugReportConfigSources({ fileText: file, environment: {} }).formHosts).toEqual(DEFAULT_FORM_HOSTS)
    expect(parseBugReportConfigSources({ fileText: file, environment: { [BUG_REPORT_CONFIG_URL_ENV]: 'https://raw.example.test/c.json' } }).configUrl)
      .toBe('https://raw.example.test/c.json')
  })
})
