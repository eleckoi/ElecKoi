/**
 * `foldFailure`：六条边界共用的那一条「未知错误 → 契约形态」规则。
 *
 * 重点断言的三个性质：
 *
 * 1. **带码的失败不被改写**（码与详情原样保留）；
 * 2. **认不出的码不猜**：折成兜底码，原码进 `details.what`；
 * 3. **不靠 `instanceof`**：跨 bundle 副本、跨 realm 的对象只按形状识别。
 */
import { describe, expect, it } from 'vitest'
import { ELECKOI_FAILURE_CODES } from '../src/contracts/errors/codes'
import { DESKTOP_ERROR_CODES } from '../src/foundation/DesktopError'
import { foldFailure } from '../src/foundation/failure'

/** 造一个 `DesktopError` 形状的对象——**不**用真类，顺带证明折叠只看形状。 */
function desktopErrorOf(code: string, message: string, details?: unknown): object {
  return { name: 'DesktopError', code, message, details }
}

/** 造一个官方 `RemoteError` 形状的对象（标记是自有属性，不是函数）。 */
function remoteErrorOf(code: string, message: string, details?: unknown): object {
  return { isDSHRemoteError: true, code, message, details }
}

describe('foldFailure：已经是契约形态的失败', () => {
  it('契约码与详情原样保留', () => {
    const failure = foldFailure(desktopErrorOf(
      ELECKOI_FAILURE_CODES.agentPresetNotFound,
      '找不到这个预设。',
      { what: '预设 preset-1' }
    ))
    expect(failure).toEqual({
      code: ELECKOI_FAILURE_CODES.agentPresetNotFound,
      message: '找不到这个预设。',
      details: { what: '预设 preset-1' }
    })
  })

  it('官方失败标记上的契约码同样保留（跨 realm 不靠 instanceof）', () => {
    const failure = foldFailure(remoteErrorOf(
      ELECKOI_FAILURE_CODES.ioFailed,
      '写不进去',
      { operation: 'write', path: '/tmp/x' }
    ))
    expect(failure.code).toBe(ELECKOI_FAILURE_CODES.ioFailed)
    expect(failure.details).toEqual({ operation: 'write', path: '/tmp/x' })
  })
})

describe('foldFailure：上游 6 个 legacy 码的防御映射', () => {
  it.each([
    [DESKTOP_ERROR_CODES.INTERNAL, ELECKOI_FAILURE_CODES.internal],
    [DESKTOP_ERROR_CODES.INVALID_REQUEST, ELECKOI_FAILURE_CODES.inputInvalid],
    [DESKTOP_ERROR_CODES.FORBIDDEN, ELECKOI_FAILURE_CODES.safetyRefused]
  ])('%s 折成 %s', (legacy, expected) => {
    expect(foldFailure(desktopErrorOf(legacy, '旧码')).code).toBe(expected)
  })

  it.each([
    DESKTOP_ERROR_CODES.NOT_FOUND,
    DESKTOP_ERROR_CODES.CONFLICT,
    DESKTOP_ERROR_CODES.RUNTIME_UNAVAILABLE
  ])('%s 没有唯一对应，折兜底并把原码记进 details.what', (legacy) => {
    const failure = foldFailure(desktopErrorOf(legacy, '旧码'))
    expect(failure.code).toBe(ELECKOI_FAILURE_CODES.internal)
    expect(failure.details).toEqual({ what: legacy })
  })
})

describe('foldFailure：认不出的码不猜', () => {
  it.each(['remote', 'product'])('保留 %s 未知码的上游详情，跨序列化边界不再丢失', (kind) => {
    const originalDetails = { endpoint: 'creatorStudio.open', context: { service: 'synthetic-studio', available: false } }
    const original = kind === 'remote'
      ? remoteErrorOf('gateway/service-unavailable', 'active Service "synthetic-studio" is unavailable', originalDetails)
      : desktopErrorOf('future/unavailable', 'Synthetic service unavailable', originalDetails)
    const failure = foldFailure(JSON.parse(JSON.stringify(original)))
    expect(failure.code).toBe(ELECKOI_FAILURE_CODES.internal)
    expect(failure.message).toBe((original as { message: string }).message)
    expect(failure.details).toEqual({ what: (original as { code: string }).code, upstreamDetails: originalDetails })
    expect(foldFailure(remoteErrorOf(failure.code, failure.message, failure.details))).toEqual(failure)
  })

  it('形状对、码不在两张表里 → 兜底 + 原码进 what', () => {
    const failure = foldFailure(desktopErrorOf('eleckoi/unknown/whatever', '谁知道'))
    expect(failure.code).toBe(ELECKOI_FAILURE_CODES.internal)
    expect(failure.details).toEqual({ what: 'eleckoi/unknown/whatever' })
  })

  it('官方失败形状上的陌生码同样兜底', () => {
    const failure = foldFailure(remoteErrorOf('some/third-party-code', '第三方码'))
    expect(failure.code).toBe(ELECKOI_FAILURE_CODES.internal)
    expect(failure.details).toEqual({ what: 'some/third-party-code' })
  })
})

describe('foldFailure：网关的合同违例载体码', () => {
  it('入参违例折成 contract/invalid-request 并把 issues 投影成 {path, message}', () => {
    const failure = foldFailure(remoteErrorOf('gateway/bad-request', '入参不合合同', {
      issues: [{ path: ['a', 'b'], message: '必填' }, { path: 'c', message: '类型不对' }]
    }))
    expect(failure.code).toBe(ELECKOI_FAILURE_CODES.contractInvalidRequest)
    expect(failure.details).toEqual({
      issues: [{ path: 'a.b', message: '必填' }, { path: 'c', message: '类型不对' }]
    })
  })

  it('出参违例折成 contract/invalid-response', () => {
    const failure = foldFailure(remoteErrorOf('gateway/result-invalid', '出参不合合同', {
      issues: [{ path: '', message: '整体失败' }]
    }))
    expect(failure.code).toBe(ELECKOI_FAILURE_CODES.contractInvalidResponse)
  })

  it('载体只给 endpoint / field 时合成一条 issue', () => {
    const failure = foldFailure(remoteErrorOf('gateway/arguments-invalid', '端点参数不对', {
      endpoint: 'presets.save',
      field: 'name'
    }))
    expect(failure.code).toBe(ELECKOI_FAILURE_CODES.contractInvalidRequest)
    expect(failure.details).toEqual({ issues: [{ path: 'name', message: '端点参数不对' }] })
  })
})

describe('foldFailure：其它一切', () => {
  it('裸 Error 折兜底，message 保留', () => {
    expect(foldFailure(new Error('炸了'))).toEqual({
      code: ELECKOI_FAILURE_CODES.internal,
      message: '炸了',
      details: {}
    })
  })

  it('字符串、null、普通对象都不抛', () => {
    for (const input of ['字符串失败', null, undefined, 42, { foo: 'bar' }]) {
      const failure = foldFailure(input)
      expect(failure.code).toBe(ELECKOI_FAILURE_CODES.internal)
      expect(failure.message.trim()).not.toBe('')
      expect(failure.details).toEqual({})
    }
  })

  it('空 message 给占位，不产出空串', () => {
    expect(foldFailure(new Error('')).message.trim()).not.toBe('')
    expect(foldFailure(new Error('   ')).message.trim()).not.toBe('')
  })

  it('详情不是扁平对象时折成空对象（数组 / null / 标量）', () => {
    for (const details of [[1, 2], null, 'text', 7]) {
      const failure = foldFailure(desktopErrorOf(ELECKOI_FAILURE_CODES.internal, 'x', details))
      expect(failure.details).toEqual({})
    }
  })

  it('折叠结果可以 JSON 往返（详情必须能过序列化）', () => {
    const failure = foldFailure(remoteErrorOf('gateway/bad-request', '入参', {
      issues: [{ path: 'a', message: '必填' }]
    }))
    expect(JSON.parse(JSON.stringify(failure))).toEqual(failure)
  })
})
