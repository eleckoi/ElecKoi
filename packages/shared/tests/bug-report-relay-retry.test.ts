/**
 * 代发状态码判定（[ADR 0042](../../../docs/adr/0042-bug-report-delivery.md) 决定 14）。
 *
 * 判据：「自动重试只发生在用户点下去的那一次会话里，且只对 `5xx` / `429`；网络层失败（连不上、
 * DNS、TLS）直接失败并降级」。这里只断言纯函数——重试动作本身在主进程，由 IPC 胶水覆盖。
 *
 * 1. **限流与临时故障**：429 与 5xx 值得再试一次；
 * 2. **请求本身不对**：其它 4xx 与 2xx 都不重试（2xx 本来就不是失败）；
 * 3. **越界值不猜**：状态码不是整数、或落在 HTTP 范围外，一律按不重试处理。
 */
import { describe, expect, it } from 'vitest'
import { isRetriableRelayStatus } from '../src/contracts/bugReport/relay'

describe('代发状态码是否值得重试一次', () => {
  it('限流与 5xx 才重试', () => {
    for (const status of [429, 500, 501, 502, 503, 599]) {
      expect(isRetriableRelayStatus(status)).toBe(true)
    }
  })

  it('2xx 与其它 4xx 不重试', () => {
    for (const status of [200, 201, 204, 400, 401, 403, 404, 418, 422, 499]) {
      expect(isRetriableRelayStatus(status)).toBe(false)
    }
  })

  it('不是整数或不落在 HTTP 范围里的值不重试', () => {
    for (const status of [0, -1, 600, 1000, 429.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(isRetriableRelayStatus(status)).toBe(false)
    }
  })
})
