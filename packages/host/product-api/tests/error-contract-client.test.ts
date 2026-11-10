/**
 * 边界⑥ 的 client 面常量与折叠形状。
 *
 * client 面不 import 契约包（理由见 `src/client/invalidResponse.ts` 文件头），所以码字符串有一份
 * 本地副本。这份副本的**唯一守卫就是本文件**：码表改了而常量没改，这里红。
 */
import { describe, expect, it } from 'vitest'
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes'
import { ELECKOI_FAILURE_DETAIL_PARAMS } from '@shared/contracts/errors/details'
import { productFailure, PRODUCT_FAILURE_DETAIL_KEYS } from '../src/productFailure'
import {
  INTERNAL_FAILURE_CODE,
  internalFailure,
  INVALID_RESPONSE_CODE,
  MISSING_ERROR_ISSUE_PATH,
  MISSING_RESULT_ISSUE_PATH,
  invalidResponseFailure
} from '../src/client/invalidResponse'
import { failureOrInvalidResponse, unwrapOrFail } from '../src/client/unwrapFailure'

describe('client 面的码常量与码表一致', () => {
  it('INVALID_RESPONSE_CODE 逐字等于码表里的 contractInvalidResponse', () => {
    expect(INVALID_RESPONSE_CODE).toBe(ELECKOI_FAILURE_CODES.contractInvalidResponse)
  })
})

describe('invalidResponseFailure', () => {
  it('产出官方线上形状：结构标记 + 码 + issues', () => {
    const failure = invalidResponseFailure('没拿到信封')
    expect(failure.isDSHRemoteError).toBe(true)
    expect(failure.code).toBe(ELECKOI_FAILURE_CODES.contractInvalidResponse)
    expect(failure.message).toBe('没拿到信封')
    expect(failure.details).toEqual({ issues: [{ path: MISSING_ERROR_ISSUE_PATH, message: '没拿到信封' }] })
  })

  it('是普通对象，能过结构化克隆（不能是类实例）', () => {
    const failure = invalidResponseFailure('x', MISSING_RESULT_ISSUE_PATH)
    expect(Object.getPrototypeOf(failure)).toBe(Object.prototype)
    expect(JSON.parse(JSON.stringify(failure))).toEqual(failure)
  })
})

describe('unwrapOrFail', () => {
  it('ok 为真时给值', () => {
    expect(unwrapOrFail({ ok: true, value: 42 }, '读不到')).toBe(42)
  })

  it('失败分支带码时抛失败对象本身（码与详情逐字保留）', () => {
    const error = { isDSHRemoteError: true, code: 'gateway/internal', message: '宿主炸了', details: {} }
    let thrown: unknown
    try {
      unwrapOrFail({ ok: false, error }, '读取失败')
    } catch (caught) {
      thrown = caught
    }
    expect(thrown).toBe(error)
  })

  it('信封整体缺失时抛 contract/invalid-response，path 是 result', () => {
    let thrown: unknown
    try {
      unwrapOrFail(null, '没拿到结果')
    } catch (caught) {
      thrown = caught
    }
    expect(thrown).toMatchObject({
      isDSHRemoteError: true,
      code: ELECKOI_FAILURE_CODES.contractInvalidResponse,
      details: { issues: [{ path: MISSING_RESULT_ISSUE_PATH }] }
    })
  })

  it('失败分支没有可用码时折成 contract/invalid-response，path 是 result.error', () => {
    let thrown: unknown
    try {
      unwrapOrFail({ ok: false, error: '只是一句话' }, '失败分支不是对象')
    } catch (caught) {
      thrown = caught
    }
    expect(thrown).toMatchObject({
      code: ELECKOI_FAILURE_CODES.contractInvalidResponse,
      details: { issues: [{ path: MISSING_ERROR_ISSUE_PATH }] }
    })
  })

  it('码的真值判据与旧写法等价：空串 / 0 / null 都算没有码', () => {
    for (const error of [{ code: '' }, { code: 0 }, { code: null }, {}]) {
      expect(failureOrInvalidResponse(error, 'x')).toMatchObject({
        code: ELECKOI_FAILURE_CODES.contractInvalidResponse
      })
    }
    const coded = { code: 'eleckoi/internal' }
    expect(failureOrInvalidResponse(coded, 'x')).toBe(coded)
  })
})

describe('internalFailure：载体不是产品失败时的折法', () => {
  it('INTERNAL_FAILURE_CODE 逐字等于码表里的 internal', () => {
    expect(INTERNAL_FAILURE_CODE).toBe(ELECKOI_FAILURE_CODES.internal)
  })

  it('把 provider 的 message 当诊断、code/status 放进详情', () => {
    const failure = internalFailure('余额不足', { code: 'RATE_LIMIT', status: 429 })
    expect(failure).toMatchObject({
      isDSHRemoteError: true,
      code: ELECKOI_FAILURE_CODES.internal,
      message: '余额不足',
      details: { code: 'RATE_LIMIT', status: 429 }
    })
  })

  it('**不写 details.what**：否则渲染层会给通用句，provider 那句就到不了用户眼前', () => {
    for (const details of [{}, { code: 'AUTH' }, { status: 401 }]) {
      expect(internalFailure('认证失败', details).details).not.toHaveProperty('what')
    }
  })
})

describe('productFailure：两边共用的带码失败构造器', () => {
  it('产出的形状过网关判据：isDSHRemoteError + 字符串码', () => {
    const failure = productFailure(ELECKOI_FAILURE_CODES.characterNotFound, '找不到角色卡：c-1', { what: '角色卡' })
    expect(failure.isDSHRemoteError).toBe(true)
    expect(typeof failure.code).toBe('string')
    expect(failure.code).toBe(ELECKOI_FAILURE_CODES.characterNotFound)
    expect(failure.message).toBe('找不到角色卡：c-1')
    expect(failure.details).toEqual({ what: '角色卡' })
  })

  it('是普通对象，能原样过 JSON（要穿过 IPC 与 Remote 信封两处序列化）', () => {
    const failure = productFailure(ELECKOI_FAILURE_CODES.ioFailed, '写文件失败：/tmp/a', {
      operation: 'write',
      path: '/tmp/a'
    })
    expect(Object.getPrototypeOf(failure)).toBe(Object.prototype)
    expect(JSON.parse(JSON.stringify(failure))).toEqual(failure)
  })

  it('码表里的每一条码都能构造出来，且码字符串通过生成物回读一致', () => {
    for (const code of Object.values(ELECKOI_FAILURE_CODES)) {
      const failure = productFailure(code, 'x')
      expect(failure.code).toBe(code)
      expect(Object.values(ELECKOI_FAILURE_CODES)).toContain(failure.code)
    }
  })

  it('详情参数名闭集覆盖契约表用到的每一个参数（client 面拿不到契约包，靠这条守住）', () => {
    const usedParams = new Set(Object.values(ELECKOI_FAILURE_DETAIL_PARAMS).flat())
    const known: readonly string[] = PRODUCT_FAILURE_DETAIL_KEYS
    // 契约表里用到的参数，本文件必须全都有——漏一个就意味着那条码的详情在 client 面构造不出来。
    expect([...usedParams].filter((param) => !known.includes(param))).toEqual([])
    // 反向核对契约声明的参数，包含完整上游错误详情。
    expect([...PRODUCT_FAILURE_DETAIL_KEYS].sort()).toEqual(
      ['actual', 'expected', 'field', 'guard', 'issues', 'operation', 'path', 'upstreamDetails', 'what']
    )
  })
})
