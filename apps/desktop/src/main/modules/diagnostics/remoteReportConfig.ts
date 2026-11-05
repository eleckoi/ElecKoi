/**
 * 线上投递配置：**可选**，只在配了 `configUrl` 时才联网，拉回来的东西只用来换「表单往哪送」。
 *
 * 判据（[ADR 0041](../../../../../docs/adr/0041-bug-report-delivery.md) 决定 16，2026-11-05 修订）：内置
 * `bug-report.json` 随包发布，换 Base 就得发版；Base 被删或链接填错时，用户手里的版本只能等下次发版。
 * 所以留一条可选的远程配置通道。
 *
 * 三条护栏——这条链接决定用户的日志发到哪里，等于一条信任边界：
 *
 * 1. **只走 https，只认分享链接与四个题目名。** 远程配置改不了邮件、改不了代发，也改不了自己的地址
 *    （下一次拉取用哪个地址仍由内置文件与环境变量决定）。
 * 2. **分享链接的主机必须落在随包发布的白名单里**（{@link DEFAULT_FORM_HOSTS}，可在内置 JSON 的
 *    `formHosts` 里改）。远程配置不能自己扩权。
 * 3. **失败一律静默回退**：超时、非 2xx、超过 64 KB、形状不对都当「没有远程配置」，报告功能照常起来。
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { isBugReportFormConfig, isHttpUrl } from '@shared/contracts/bugReport/form'
import type { BugReportFormConfig } from '@shared/contracts/bugReport/form'
import type { BugReportDeliveryConfig } from '@shared/contracts/bugReport/delivery'
import { isRecord, parseJsonObject } from '@shared/foundation/json'

/** 覆盖远程配置地址的环境变量名；空串 = 显式关掉远程配置。 */
export const BUG_REPORT_CONFIG_URL_ENV = 'ELECKOI_BUG_REPORT_CONFIG_URL'

/** 拉远程配置的超时：报告对话框不该等网络。 */
export const BUG_REPORT_REMOTE_CONFIG_TIMEOUT_MS = 3000

/** 远程配置的响应上限：够放四个题目名，再大就不看了。 */
export const BUG_REPORT_REMOTE_CONFIG_MAX_BYTES = 64 * 1024

/** 缓存文件名（放在应用私有的 `bug-reports/` 目录下）。 */
export const BUG_REPORT_REMOTE_CONFIG_FILE = 'remote-config.json'

/** 分享链接默认允许的主机；后缀匹配，`axdf0mvt1ng.feishu.cn` 与 `feishu.cn` 都算。 */
export const DEFAULT_FORM_HOSTS: readonly string[] = ['feishu.cn']

/** 缓存多久之后再去取一次：拿不到新的就继续用旧的。 */
export const BUG_REPORT_REMOTE_CONFIG_REFRESH_MS = 6 * 60 * 60 * 1000

/** 缓存里的一份远程表单配置，带取回时刻（用来决定要不要再取一次）。 */
export interface CachedRemoteForm {
  readonly form: BugReportFormConfig
  /** ISO 8601；解析不了就当作很久以前。 */
  readonly fetchedAt: string
}

/**
 * 这个分享链接是不是落在允许的主机里（且是 https）。
 *
 * @param value - 候选地址。
 * @param hosts - 允许的主机后缀；缺省 {@link DEFAULT_FORM_HOSTS}。
 * @returns 允许远程配置把它当表单端点时返回 `true`。
 */
export function isAllowedFormHost(value: string, hosts: readonly string[] = DEFAULT_FORM_HOSTS): boolean {
  if (!isHttpsUrl(value)) return false
  let hostname: string
  try {
    hostname = new URL(value).hostname.toLowerCase()
  } catch {
    return false
  }
  return hosts.some(host => {
    const allowed = host.trim().toLowerCase()
    return allowed !== '' && (hostname === allowed || hostname.endsWith(`.${allowed}`))
  })
}

/**
 * 远程配置载荷 → 表单配置。
 *
 * 只读 `form` 一个键：分享链接、四个题目名。别的键一律忽略，所以远程配置扩不了权。
 *
 * @param payload - 响应的 JSON 文本。
 * @param hosts - 允许的主机后缀。
 * @returns 校验通过的表单配置；任何一处不对就 `undefined`。
 */
export function remoteFormOf(
  payload: string,
  hosts: readonly string[] = DEFAULT_FORM_HOSTS
): BugReportFormConfig | undefined {
  if (payload.length > BUG_REPORT_REMOTE_CONFIG_MAX_BYTES) return undefined
  const parsed = parseJsonObject(payload)
  if (!isRecord(parsed.form)) return undefined
  if (!isBugReportFormConfig(parsed.form)) return undefined
  if (!isAllowedFormHost(parsed.form.shareUrl, hosts)) return undefined
  return parsed.form
}

/**
 * 读缓存里的远程表单配置。
 *
 * @param directory - `bug-reports/` 目录。
 * @param hosts - 允许的主机后缀（缓存也要过一遍：白名单可能在版本里收紧过）。
 * @returns 缓存内容；没有、读不动或形状不对都返回 `undefined`。**永不抛。**
 */
export function readCachedRemoteForm(
  directory: string,
  hosts: readonly string[] = DEFAULT_FORM_HOSTS
): CachedRemoteForm | undefined {
  try {
    const path = join(directory, BUG_REPORT_REMOTE_CONFIG_FILE)
    if (!existsSync(path)) return undefined
    const parsed = parseJsonObject(readFileSync(path, 'utf8'))
    const fetchedAt = typeof parsed.fetchedAt === 'string' ? parsed.fetchedAt : ''
    if (fetchedAt === '') return undefined
    const form = isRecord(parsed.form) && isBugReportFormConfig(parsed.form) ? parsed.form : undefined
    if (form === undefined || !isAllowedFormHost(form.shareUrl, hosts)) return undefined
    return { form, fetchedAt }
  } catch {
    // 缓存读不动不是错误：没有它就用内置配置。
    return undefined
  }
}

/**
 * 写缓存；失败静默（缓存只是加速，不该让投递失败）。
 *
 * @param directory - `bug-reports/` 目录。
 * @param form - 校验过的表单配置。
 * @param now - 取回时刻（用例传固定值）。
 */
export function writeCachedRemoteForm(
  directory: string,
  form: BugReportFormConfig,
  now: Date = new Date()
): void {
  try {
    mkdirSync(directory, { recursive: true })
    const path = join(directory, BUG_REPORT_REMOTE_CONFIG_FILE)
    const temporary = `${path}.tmp`
    writeFileSync(temporary, `${JSON.stringify({ fetchedAt: now.toISOString(), form }, null, 2)}\n`, 'utf8')
    renameSync(temporary, path)
  } catch {
    // 写不下就用内置配置，报告功能不依赖缓存。
  }
}

/** 拉取远程配置要的选项（用例注入 fetch 与超时）。 */
export interface RemoteFormFetchOptions {
  readonly timeoutMs?: number
  readonly fetchImpl?: typeof fetch
}

/**
 * 拉一次远程配置。
 *
 * @param url - 配置地址（只接受 https）。
 * @param hosts - 允许的分享链接主机后缀。
 * @param options - 超时与 fetch 实现。
 * @returns 校验通过的表单配置；任何失败都返回 `undefined`，**永不抛**。
 */
export async function fetchRemoteForm(
  url: string,
  hosts: readonly string[] = DEFAULT_FORM_HOSTS,
  options: RemoteFormFetchOptions = {}
): Promise<BugReportFormConfig | undefined> {
  if (!isHttpsUrl(url)) return undefined
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? BUG_REPORT_REMOTE_CONFIG_TIMEOUT_MS)
  try {
    const response = await (options.fetchImpl ?? fetch)(url, { signal: controller.signal })
    if (!response.ok) return undefined
    const declared = Number(response.headers.get('content-length') ?? '')
    if (Number.isFinite(declared) && declared > BUG_REPORT_REMOTE_CONFIG_MAX_BYTES) return undefined
    return remoteFormOf(await response.text(), hosts)
  } catch {
    // 超时、断网、TLS 失败、响应体读一半断掉：都当「这次没拿到」。
    return undefined
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 该用哪份表单配置：远程赢了才用远程，否则用内置的。
 *
 * @param bundled - 内置配置里的表单。
 * @param remote - 远程配置里的表单（可能没有）。
 * @param hosts - 允许的主机后缀。
 * @returns 最终的表单配置；都不可用就是 `undefined`（界面据此不渲染「提交到飞书」）。
 */
export function preferredForm(
  bundled: BugReportFormConfig | undefined,
  remote: BugReportFormConfig | undefined,
  hosts: readonly string[] = DEFAULT_FORM_HOSTS
): BugReportFormConfig | undefined {
  if (remote !== undefined && isAllowedFormHost(remote.shareUrl, hosts)) return remote
  return bundled
}

/**
 * 把选定的表单配置放回投递配置里（远程没赢时保持原样）。
 *
 * @param delivery - 内置配置解析出的投递配置。
 * @param remote - 远程配置里的表单（可能没有）。
 * @param hosts - 允许的主机后缀。
 * @returns 新的投递配置；没有表单时**不产出** `form` 键（`exactOptionalPropertyTypes`）。
 */
export function withPreferredForm(
  delivery: BugReportDeliveryConfig,
  remote: BugReportFormConfig | undefined,
  hosts: readonly string[] = DEFAULT_FORM_HOSTS
): BugReportDeliveryConfig {
  const form = preferredForm(delivery.form, remote, hosts)
  if (form === delivery.form) return delivery
  if (form !== undefined) return { ...delivery, form }
  const { mailbox, repository, mailboxName, subscribeUrl, relay } = delivery
  return {
    mailbox,
    repository,
    ...(mailboxName === undefined ? {} : { mailboxName }),
    ...(subscribeUrl === undefined ? {} : { subscribeUrl }),
    ...(relay === undefined ? {} : { relay })
  }
}

function isHttpsUrl(value: string): boolean {
  return /^https:\/\/\S/i.test(value) && isHttpUrl(value)
}
