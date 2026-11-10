/**
 * 失败契约的形状不变量：码表、详情表、六条边界闭集。
 *
 * 这里断言的是「表本身有没有说谎」，不是某个调用点。任何一条改错都会在这里红：
 * 重复的码、形态不合 `eleckoi/<域>/<原因>` 的码、边界数量不是 6、边界折到一个不存在的码。
 */
import { describe, expect, it } from 'vitest'
import {
  ELECKOI_FAILURE_CODES,
  ELECKOI_FAILURE_CODE_LIST,
  ELECKOI_FAILURE_CODE_PATTERN,
  ELECKOI_FALLBACK_FAILURE_CODE,
  isEleckoiFailureCode
} from '../src/contracts/errors/codes'
import { ELECKOI_BOUNDARIES } from '../src/contracts/errors/boundaries'
import { DesktopError } from '../src/foundation/DesktopError'
import { ELECKOI_FAILURE_DETAIL_PARAMS } from '../src/contracts/errors/details'

const ALL_CODES = Object.values(ELECKOI_FAILURE_CODES)

/** 详情参数的闭集（见 `details.ts` 文件头）。新增参数要先改这份列表与文档。 */
const DETAIL_PARAM_CLOSED_SET = ['field', 'issues', 'path', 'operation', 'guard', 'what', 'expected', 'actual', 'upstreamDetails']

describe('码表', () => {
  it('每条码都符合 eleckoi/<域>/<原因> 的形态', () => {
    for (const code of ALL_CODES) {
      expect(code, code).toMatch(ELECKOI_FAILURE_CODE_PATTERN)
    }
  })

  it('码不重复', () => {
    expect(new Set(ALL_CODES).size).toBe(ALL_CODES.length)
  })

  it('固定清单与码表一一对应，且顺序稳定', () => {
    expect([...ELECKOI_FAILURE_CODE_LIST].sort()).toEqual([...ALL_CODES].sort())
    expect(ELECKOI_FAILURE_CODE_LIST[0]).toBe(ELECKOI_FAILURE_CODES.internal)
  })

  it('兜底码是码表里的 internal', () => {
    expect(ELECKOI_FALLBACK_FAILURE_CODE).toBe(ELECKOI_FAILURE_CODES.internal)
    expect(ELECKOI_FAILURE_CODE_PATTERN.test(ELECKOI_FALLBACK_FAILURE_CODE)).toBe(true)
  })

  it('运行期判定只认码表里的码', () => {
    for (const code of ALL_CODES) expect(isEleckoiFailureCode(code)).toBe(true)
    expect(isEleckoiFailureCode('eleckoi/unknown/thing')).toBe(false)
    expect(isEleckoiFailureCode('INTERNAL')).toBe(false)
    expect(isEleckoiFailureCode('')).toBe(false)
  })
})

describe('六条边界闭集', () => {
  it('恰好 6 条，序号 1–6 各一条', () => {
    expect(ELECKOI_BOUNDARIES).toHaveLength(6)
    expect([...ELECKOI_BOUNDARIES.map((boundary) => boundary.ordinal)].sort((left, right) => left - right))
      .toEqual([1, 2, 3, 4, 5, 6])
  })

  it('边界的标识不重复，且是 ASCII', () => {
    const ids = ELECKOI_BOUNDARIES.map((boundary) => boundary.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z-]*$/)
  })

  it('每条边界都写明了落点与载体', () => {
    for (const boundary of ELECKOI_BOUNDARIES) {
      expect(boundary.title.trim(), boundary.id).not.toBe('')
      expect(boundary.adapter.trim(), boundary.id).not.toBe('')
      expect(boundary.carries.trim(), boundary.id).not.toBe('')
      expect(boundary.folds.length, boundary.id).toBeGreaterThan(0)
    }
  })

  it('每条边界折到的码都在码表里，兜底码也在码表里', () => {
    for (const boundary of ELECKOI_BOUNDARIES) {
      expect(isEleckoiFailureCode(boundary.fallback), boundary.id).toBe(true)
      for (const fold of boundary.folds) {
        if (fold.code === null) continue
        expect(isEleckoiFailureCode(fold.code), `${boundary.id}: ${fold.when}`).toBe(true)
      }
    }
  })

  it('每条边界都至少有一个「不折」的入口，否则已经带码的失败会被改写', () => {
    for (const boundary of ELECKOI_BOUNDARIES) {
      expect(boundary.folds.some((fold) => fold.code === null), boundary.id).toBe(true)
    }
  })
})

describe('详情表与码表一一对应', () => {
  it('每条码都登记了详情参数（漏一条码会在类型层就先红）', () => {
    expect(Object.keys(ELECKOI_FAILURE_DETAIL_PARAMS).sort()).toEqual([...ALL_CODES].sort())
  })

  it('详情参数只来自声明的参数闭集', () => {
    for (const [code, params] of Object.entries(ELECKOI_FAILURE_DETAIL_PARAMS)) {
      for (const param of params) {
        expect(DETAIL_PARAM_CLOSED_SET, `${code} 用了 ${param}`).toContain(param)
      }
    }
  })

  it('兜底码登记原码与上游详情的保留字段', () => {
    expect(ELECKOI_FAILURE_DETAIL_PARAMS[ELECKOI_FAILURE_CODES.internal]).toEqual(['what', 'upstreamDetails'])
  })

  it('合同违例两条码都带 issues（规则 2 的判据）', () => {
    for (const code of [ELECKOI_FAILURE_CODES.contractInvalidRequest, ELECKOI_FAILURE_CODES.contractInvalidResponse]) {
      expect(ELECKOI_FAILURE_DETAIL_PARAMS[code]).toContain('issues')
    }
  })

  it('详情参数不重复', () => {
    for (const [code, params] of Object.entries(ELECKOI_FAILURE_DETAIL_PARAMS)) {
      expect(new Set(params).size, code).toBe(params.length)
    }
  })
})

describe('边界② 的载体形状', () => {
  it('产品失败自带网关载体标记，码是字符串——这正是 remoteErrorOf 的判据', () => {
    const failure = new DesktopError(ELECKOI_FAILURE_CODES.ioFailed, '写不进去', { operation: 'write' })
    // 判据抄自 @deepseek-ai/dsh-typert-protocol 的 remoteErrorOf：
    // typeof value === 'object' && value !== null && value.isDSHRemoteError === true && typeof value.code === 'string'
    expect(failure.isDSHRemoteError).toBe(true)
    expect(typeof failure.code).toBe('string')
  })

  it('标记是自有属性，不是原型链上的 getter（结构化克隆与跨副本识别都靠它）', () => {
    const failure = new DesktopError(ELECKOI_FAILURE_CODES.internal, '炸了')
    expect(Object.hasOwn(failure, 'isDSHRemoteError')).toBe(true)
    expect(Object.getOwnPropertyDescriptor(failure, 'isDSHRemoteError')?.get).toBeUndefined()
  })

  it('枚举自己的属性时带上标记与码（网关编码线上载荷时读的就是这些）', () => {
    const failure = new DesktopError(ELECKOI_FAILURE_CODES.agentPresetNotFound, '找不到这个预设。', { what: '预设' })
    const plain = { ...failure }
    expect(plain).toMatchObject({ isDSHRemoteError: true, code: ELECKOI_FAILURE_CODES.agentPresetNotFound, details: { what: '预设' } })
  })
})
