/**
 * **带码失败的构造器**：host 面与 client 面共用的一份。
 *
 * ## 为什么需要它
 *
 * 转换 900 处裸抛时，两边都缺一个"造一条带契约码的失败"的工具：
 *
 * - `product-data` 那边有 `@shared/foundation/DesktopError`（类实例，域层用）；
 * - `product-api` 这边**不能**在运行时 import 契约包（本包 host 面是 `tsc` 直出，
 *   契约包的 exports 指向 TS 源码，`require('@shared/...')` 在宿主进程里解析不到）。
 *
 * 所以这里给出一个**普通对象**工厂：形状与官方 `RemoteError` 的线上形状一致
 * （`isDSHRemoteError: true` + `code` + `message` + `details`），网关的 `rpcFailure`
 * 只认这个标记，于是码与详情逐字穿过边界②。
 *
 * ## 为什么放在 `src/` 根而不是 `src/client/`
 *
 * 两个 tsc 工程都要能编译到它：
 * - host 面（`tsconfig.host.json`，`include: src/*.ts`）——`src/*.ts` 里的 90 处裸抛要它；
 * - client 面（`tsconfig.client.json`）——`dsh-client-*` bundle 经
 *   `require('@eleckoi/dsh-product-api')` 拿到它。
 *
 * `tsconfig.client.json` 的 `include` 因此显式列上本文件（与 `src/inspectProvider.ts`
 * 同一个做法）。码表产物 `src/errorCodes.generated.ts` 放在 `src/` 根，两个工程都编译它
 * （内容相同、输出相同），所以两边都能 `import` 同一个常量表。
 *
 * ## 它不做什么
 *
 * 不拼用户可见句子（用户文案的唯一解析点在渲染层 `apps/web/src/utils/failureText.js`），
 * 不校验"这条码必须带哪个参数"（那是 `contracts/errors/details.ts` 的类型表，编译期管），
 * 也不吞掉调用方给的诊断 `message`。
 */

import { ELECKOI_FAILURE_CODES, type ClientFailureCode } from './errorCodes.generated.js'

/** 一条合同违例（与 `contracts/errors/details.ts` 的 `EleckoiFailureIssue` 同形）。 */
export interface ProductFailureIssue {
  readonly path: string
  readonly message: string
}

/**
 * 失败详情的参数名闭集（与 `contracts/errors/details.ts` 逐一对应）。
 *
 * 这里必然是一份本地副本——client 面取不到契约包。守卫在
 * `packages/host/product-api/tests/error-contract-client.test.ts`：
 * 它断言这份键表与契约包的参数并集**逐字相等**，改契约而不改这里会红。
 */
export const PRODUCT_FAILURE_DETAIL_KEYS = [
  'field',
  'issues',
  'path',
  'operation',
  'guard',
  'what',
  'expected',
  'actual',
  'upstreamDetails'
] as const

/** 详情参数名。 */
export type ProductFailureDetailKey = (typeof PRODUCT_FAILURE_DETAIL_KEYS)[number]

/**
 * 失败详情：JSON 对象，顶层键只用正式参数闭集。
 *
 * `what` 不是标识符：多数码写名词短语（会被拼进用户句「找不到{what}。」），`state/precondition`
 * 例外、写用户该先做的动作（「请先{what}。」）；具体 id / 路径留给 `message`。
 */
export interface ProductFailureDetails {
  readonly field?: string
  readonly issues?: readonly ProductFailureIssue[]
  readonly path?: string
  readonly operation?: string
  readonly guard?: string
  readonly what?: string
  readonly expected?: string
  readonly actual?: string
  readonly upstreamDetails?: Readonly<Record<string, unknown>>
}

/**
 * 带契约码的失败：普通对象，能过结构化克隆与 `JSON.stringify`。
 *
 * 不用类实例是刻意的——它要穿过 Electron IPC 与 Remote 信封两处序列化。
 */
export interface ProductFailure {
  readonly isDSHRemoteError: true
  readonly code: ClientFailureCode
  /** 开发者诊断文案（不是用户可见句子）。 */
  readonly message: string
  readonly details: ProductFailureDetails
}

/**
 * 造一条带契约码的失败。
 *
 * @param code - 契约码，只能是码表里的键（编译期挡住拼错的码）。
 * @param message - 开发者诊断：保留原来那句中文，别删掉——日志靠它定位。
 * @param details - 参数化详情，只用 {@link PRODUCT_FAILURE_DETAIL_KEYS} 里的键。
 * @returns 可直接 `throw` 的失败对象。
 */
export function productFailure(
  code: ClientFailureCode,
  message: string,
  details: ProductFailureDetails = {}
): ProductFailure {
  return { isDSHRemoteError: true, code, message, details }
}

/** 兜底码（从生成物派生，码表改了自动跟上）。 */
export const FALLBACK_FAILURE_CODE = ELECKOI_FAILURE_CODES.internal
