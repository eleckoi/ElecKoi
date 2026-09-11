import type { TavilyConnection } from '@shared/contracts/agent/webSearch'

const BASE_URL = 'https://api.tavily.com'
const RESPONSE_LIMIT = 2 * 1024 * 1024
const ERROR_LIMIT = 32 * 1024

export class TavilyClient {
  constructor(private readonly request: typeof fetch = fetch) {}

  async test(apiKey: string, signal?: AbortSignal): Promise<TavilyConnection> {
    const key = validatedKey(apiKey)
    const response = await this.execute(`${BASE_URL}/usage`, {
      method: 'GET',
      redirect: 'error',
      headers: requestHeaders(key),
      ...(signal ? { signal } : {})
    }, key, 'Tavily 连接测试')
    const keyUsage = objectValue(response.key)
    const account = objectValue(response.account)
    return {
      ok: true,
      plan: stringValue(account?.current_plan) || 'Unknown',
      used: integerValue(keyUsage?.usage) ?? integerValue(account?.plan_usage) ?? 0,
      limit: integerValue(keyUsage?.limit) ?? integerValue(account?.plan_limit) ?? 0
    }
  }

  private async execute(url: string, init: RequestInit, apiKey: string, label: string): Promise<Record<string, unknown>> {
    let response: Response
    try {
      response = await this.request(url, init)
    } catch (error) {
      if (isAbortError(error)) throw new Error(`${label}已取消。`, { cause: error })
      throw new Error(`${label}失败，请检查网络连接。`, { cause: error })
    }
    const body = await readBoundedBody(response, response.ok ? RESPONSE_LIMIT : ERROR_LIMIT)
    if (!response.ok) throw new Error(publicHttpError(response.status, body, apiKey, label))
    try {
      const parsed: unknown = JSON.parse(body)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object')
      return parsed as Record<string, unknown>
    } catch (error) {
      throw new Error(`${label}返回了无效 JSON。`, { cause: error })
    }
  }
}

function requestHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'X-Project-ID': 'eleckoi'
  }
}

async function readBoundedBody(response: Response, limit: number): Promise<string> {
  const declared = Number(response.headers.get('content-length') || 0)
  if (Number.isFinite(declared) && declared > limit) throw new Error('Tavily 响应超过安全上限。')
  if (!response.body) return ''
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const part = await reader.read()
    if (part.done) break
    total += part.value.byteLength
    if (total > limit) {
      await reader.cancel()
      throw new Error('Tavily 响应超过安全上限。')
    }
    chunks.push(part.value)
  }
  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(merged)
}

function publicHttpError(status: number, body: string, apiKey: string, label: string): string {
  if (status === 401) return 'Tavily API Key 无效。'
  if (status === 429) return 'Tavily 请求过于频繁，请稍后重试。'
  if (status === 432 || status === 433) return 'Tavily 可用额度已耗尽。'
  const detail = body.replaceAll(apiKey, '[REDACTED]').replace(/\s+/g, ' ').trim().slice(0, 600)
  return `${label} HTTP ${status}${detail ? `：${detail}` : ''}`
}

function validatedKey(value: string): string {
  const normalized = value.trim()
  if (!normalized) throw new Error('请先填写 Tavily API Key。')
  if (normalized.length > 2_048) throw new Error('Tavily API Key 长度无效。')
  return normalized
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function integerValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

