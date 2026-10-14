import type { Context } from '@deepseek-ai/cordis'
import { randomUUID } from 'node:crypto'

type Value = Record<string, unknown>
const object = (value: unknown): Value => value && typeof value === 'object' && !Array.isArray(value) ? value as Value : {}
const text = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback

/** Native HTTP transport shared by public network, captions and script media providers. */
export class NativeTavernNetworkOperations {
  private readonly lifetime = new AbortController()
  private readonly jobs = new Map<string, { controller: AbortController; conversationId: string }>()
  constructor(private readonly owner: Context) {
    owner.effect(() => () => { this.lifetime.abort(new Error('ElecKoi Host 已卸载。')); this.jobs.clear() })
  }
  async fetchResponse(url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal; requestId?: string; conversationId?: string; timeout?: number }): Promise<Response> {
    const result = await this.invoke('network.fetch', { url, method: init.method, headers: init.headers,
      body: Buffer.from(init.body).toString('base64'), timeout: init.timeout ?? 180000, signal: init.signal,
      requestId: init.requestId, conversationId: init.conversationId }) as Value
    return new Response(Buffer.from(text(result.body), 'base64'), { status: Number(result.status), statusText: text(result.statusText),
      headers: Object.fromEntries(Object.entries(object(result.headers)).map(([key, item]) => [key, String(item)])) })
  }

  has(method: string): boolean { return method === 'network.fetch' || method === 'network.cancel' }
  concurrent(method: string): boolean { return this.has(method) }
  async invoke(method: string, params: Value): Promise<unknown> {
    if (method === 'network.cancel') {
      let cancelled = 0
      for (const [id, job] of this.jobs) {
        if (params.requestId ? id !== params.requestId : params.conversationId && job.conversationId !== params.conversationId) continue
        job.controller.abort(new Error('网络请求已取消。')); cancelled++
      }
      return { cancelled }
    }
    if (method !== 'network.fetch') throw new Error(`未知网络操作：${method}`)
    const url = new URL(text(params.url))
    if (!['http:', 'https:'].includes(url.protocol)) throw new TypeError('原生网络请求需要 HTTP(S) URL。')
    const requestId = text(params.requestId, randomUUID()), controller = new AbortController()
    if (this.jobs.has(requestId)) throw new Error(`网络请求编号正在使用：${requestId}`)
    this.jobs.set(requestId, { controller, conversationId: text(params.conversationId) })
    try {
      const signal = AbortSignal.any([controller.signal, this.lifetime.signal, AbortSignal.timeout(Number(params.timeout ?? 180000)),
        ...(params.signal ? [params.signal as AbortSignal] : [])])
      const method = text(params.method, 'GET').toUpperCase(), headers = Object.fromEntries(Object.entries(object(params.headers)).map(([key, value]) => [key, String(value)]))
      const response = await fetch(url, { method, headers, signal,
        ...(params.body !== undefined ? { body: Buffer.from(text(params.body), 'base64') } : {}),
        ...(params.redirect !== undefined ? { redirect: params.redirect as RequestRedirect } : {}) })
      const body = Buffer.from(await response.arrayBuffer()).toString('base64')
      signal.throwIfAborted()
      return { url: response.url, status: response.status, statusText: response.statusText, redirected: response.redirected,
        headers: Object.fromEntries(response.headers), body }
    } finally { this.jobs.delete(requestId) }
  }
}
