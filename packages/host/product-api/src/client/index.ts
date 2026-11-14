import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-gateway/client'
import eleckoiRemote from '@eleckoi/dsh-product-api/remote'
import { invalidResponseFailure } from './invalidResponse.js'
import { registerClientApiInspect } from './inspect.js'

export type {} from '@eleckoi/dsh-product-api/remote'

/**
 * 边界⑥ 的公共出口：14 个 `dsh-client-*` bundle 用
 * `require('@eleckoi/dsh-product-api/client')` 拿这两个函数。
 *
 * 导出它们不改变本模块作为 Cordis 插件入口的形状（`inject` + `apply` 仍在）。
 */
export { invalidResponseFailure, MISSING_ERROR_ISSUE_PATH, MISSING_RESULT_ISSUE_PATH } from './invalidResponse.js'
export type { InvalidResponseFailure, InvalidResponseIssue } from './invalidResponse.js'
export { failureOrInvalidResponse, unwrapOrFail } from './unwrapFailure.js'
export { bestEffort, failureAlreadyPublished, rejectionIsAwaitedElsewhere } from './swallowedFailure.js'
export { internalFailure, INTERNAL_FAILURE_CODE } from './invalidResponse.js'
export { ELECKOI_FAILURE_CODES } from '../errorCodes.generated.js'
export type { ClientFailureCode } from '../errorCodes.generated.js'
export { productFailure, PRODUCT_FAILURE_DETAIL_KEYS, FALLBACK_FAILURE_CODE } from '../productFailure.js'
export type { ProductFailure, ProductFailureDetails, ProductFailureIssue } from '../productFailure.js'
export type { InternalFailure } from './invalidResponse.js'
export type { RemoteResultEnvelope } from './unwrapFailure.js'

export const inject = ['remote']

export async function apply(ctx: Context): Promise<() => Promise<void>> {
  const disposeRemote = await ctx.remote.$mount(eleckoiRemote)
  const verifier = ctx.inject(['remote.eleckoiSystem'], async (scope) => {
    const status = await scope.remote.eleckoiSystem.status()
    // 失败分支保住失败对象本身：把 `.error.message` 压成一句话会把码与详情一起丢掉
    // （这正是「禁止丢码」那条规则盯的形状）。
    if (!status.ok) throw status.error
    // 协议版本不兼容是**本端**观察到的事：宿主返回的载荷不合我们这条契约，
    // 所以是 `contract/invalid-response`，不是宿主报了一个错。
    if (status.value.architecture !== 'dsh-remote' || status.value.protocolVersion !== 1) {
      throw invalidResponseFailure('ElecKoi DSH Remote 协议版本不兼容。')
    }
  })
  try {
    await verifier
  } catch (error) {
    await disposeRemote()
    throw error
  }
  const inspect = registerClientApiInspect(ctx)
  return async () => {
    try { await inspect.dispose() }
    finally {
      try { await verifier.dispose() }
      finally { await disposeRemote() }
    }
  }
}
