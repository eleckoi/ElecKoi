/**
 * 客户端 bundle 的测试装载器。
 *
 * `packages/client/features/*` 的 `src/client.js` 是 `window.__ModuleLoader__.load({ id, factory })`
 * 形状的运行时模块；用例把源码 `runInNewContext` 进去、抓住 registration，再调 `factory(require)`
 * 拿到插件对象。这里提供那个 `require` 的桩。
 *
 * **为什么要有 `@eleckoi/dsh-product-api` 这一支**：边界⑥ 的 `unwrapOrFail` 收在
 * `@eleckoi/dsh-product-api` 的 client 面（`packages/host/product-api/src/client/`），
 * 14 个 bundle 在运行时用 `require('@eleckoi/dsh-product-api')` 取它。运行时那个 id 就是
 * tsdown banner 里写死的 `@eleckoi/dsh-product-api`（`packages/host/product-api/tsdown.client.config.ts`），
 * 所以桩按同一个 id 返回同一份实现——**测试里不许再抄第二份 `if (!result?.ok) throw new Error(...)`**。
 * P5 起 bundle 也在这里取带码失败构造器 `productFailure` 与码表 `ELECKOI_FAILURE_CODES`
 * （与 `packages/host/product-api/src/productFailure.ts` 同一份实现）。
 */
import {
  INTERNAL_FAILURE_CODE,
  internalFailure,
  MISSING_ERROR_ISSUE_PATH,
  MISSING_RESULT_ISSUE_PATH,
  invalidResponseFailure
} from '../../packages/host/product-api/src/client/invalidResponse'
import { failureOrInvalidResponse, unwrapOrFail } from '../../packages/host/product-api/src/client/unwrapFailure'
import { productFailure } from '../../packages/host/product-api/src/productFailure'
import { ELECKOI_FAILURE_CODES } from '../../packages/host/product-api/src/errorCodes.generated'

/** 测试用的 `require`：只认 bundle 真的会取的那几个模块，其余一律报错（防止悄悄新增依赖）。 */
export function dshClientRequire(name: string): any {
  if (name === 'react') return { createElement: () => null, lazy: () => () => null }
  if (name === '@deepseek-ai/dsh-client-ui-primitives') return { MenuItemButton: () => null, IconTrashOutlineRegular: () => null, Modal: () => null, Button: () => null }
  if (name === '@eleckoi/dsh-product-api') {
    return {
      unwrapOrFail,
      failureOrInvalidResponse,
      invalidResponseFailure,
      internalFailure,
      INTERNAL_FAILURE_CODE,
      MISSING_ERROR_ISSUE_PATH,
      MISSING_RESULT_ISSUE_PATH,
      productFailure,
      ELECKOI_FAILURE_CODES,
      failureAlreadyPublished: () => {},
      rejectionIsAwaitedElsewhere: () => {},
      bestEffort: () => {}
    }
  }
  throw new Error(`Unexpected client module ${name}`)
}

export function dshClientPlugin(registration: { factory: (...args: any[]) => any }) {
  const plugin = registration.factory(dshClientRequire)
  return {
    apply: (context: Record<string, unknown>) => plugin.apply({
      slots: { inject: () => {} },
      ...context,
    }),
  }
}
