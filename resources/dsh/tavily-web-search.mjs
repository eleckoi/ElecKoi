import { WebError } from '@deepseek-ai/dsh-web'

export const name = 'eleckoi-web-search-tavily'
export const inject = ['web']

const BASE_URL = 'https://api.tavily.com'
const RESPONSE_LIMIT = 2 * 1024 * 1024
const ERROR_LIMIT = 32 * 1024

export function apply(ctx) {
  ctx.web.registerSearchProvider({
    id: 'tavily',
    available() {
      return Boolean(process.env.ELECKOI_TAVILY_API_KEY?.trim())
    },
    async search(request, signal) {
      const apiKey = process.env.ELECKOI_TAVILY_API_KEY?.trim() ?? ''
      if (!apiKey) throw new WebError('Tavily API Key 尚未配置', 'WEB_PROVIDER_CREDENTIAL_MISSING')
      let response
      try {
        response = await fetch(`${BASE_URL}/search`, {
          method: 'POST',
          redirect: 'error',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-Project-ID': 'eleckoi',
            'User-Agent': 'ElecKoi-Desktop/0.1'
          },
          body: JSON.stringify({
            query: String(request.query ?? '').trim().slice(0, 1_000),
            topic: 'general',
            search_depth: 'basic',
            max_results: integerInRange(request.maxResults, 1, 8, 5),
            include_answer: false,
            include_raw_content: false,
            include_images: false,
            include_favicon: false,
            include_usage: true
          }),
          ...(signal ? { signal } : {})
        })
      } catch (error) {
        if (signal?.aborted || isAbortError(error)) {
          throw new WebError('Tavily search aborted', 'WEB_ABORTED', { cause: error })
        }
        throw new WebError('Tavily 搜索请求失败，请检查网络连接。', 'WEB_PROVIDER_ERROR', { cause: error })
      }

      const body = await readBoundedBody(response, response.ok ? RESPONSE_LIMIT : ERROR_LIMIT)
      if (!response.ok) throw new WebError(httpError(response.status, body, apiKey), 'WEB_PROVIDER_ERROR')
      let payload
      try {
        payload = JSON.parse(body)
      } catch (error) {
        throw new WebError('Tavily 返回了无效 JSON。', 'WEB_PROVIDER_ERROR', { cause: error })
      }
      return {
        sources: Array.isArray(payload?.results) ? payload.results.map(normalizeResult).filter(Boolean) : [],
        truncated: false
      }
    }
  })
}

function normalizeResult(result) {
  if (!result || typeof result !== 'object') return undefined
  const url = safeUrl(result.url)
  if (!url) return undefined
  const title = typeof result.title === 'string' ? result.title.trim().slice(0, 500) : ''
  const snippet = typeof result.content === 'string' ? result.content.trim().slice(0, 6_000) : ''
  return { url, ...(title ? { title } : {}), ...(snippet ? { snippet } : {}) }
}

function safeUrl(value) {
  try {
    const url = new URL(String(value ?? '').trim())
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) return ''
    return url.toString().slice(0, 4_096)
  } catch {
    return ''
  }
}

async function readBoundedBody(response, limit) {
  const declared = Number(response.headers.get('content-length') || 0)
  if (Number.isFinite(declared) && declared > limit) {
    throw new WebError('Tavily 响应超过安全上限。', 'WEB_PROVIDER_ERROR')
  }
  if (!response.body) return ''
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let body = ''
  let bytes = 0
  while (true) {
    const part = await reader.read()
    if (part.done) break
    bytes += part.value.byteLength
    if (bytes > limit) {
      await reader.cancel()
      throw new WebError('Tavily 响应超过安全上限。', 'WEB_PROVIDER_ERROR')
    }
    body += decoder.decode(part.value, { stream: true })
  }
  return body + decoder.decode()
}

function httpError(status, body, apiKey) {
  if (status === 401) return 'Tavily API Key 无效。'
  if (status === 429) return 'Tavily 请求过于频繁，请稍后重试。'
  if (status === 432 || status === 433) return 'Tavily 可用额度已耗尽。'
  const detail = String(body).split(apiKey).join('[REDACTED]').replace(/\s+/g, ' ').trim().slice(0, 600)
  return `Tavily API error (HTTP ${status})${detail ? `: ${detail}` : ''}`
}

function integerInRange(value, min, max, fallback) {
  return Number.isInteger(value) ? Math.min(max, Math.max(min, value)) : fallback
}

function isAbortError(error) {
  return error instanceof DOMException && error.name === 'AbortError'
}

