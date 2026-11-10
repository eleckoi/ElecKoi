/**
 * 失败折叠——每条边界共用的「未知错误 → 契约形态」兜底规则。
 *
 * 判据来源：ADR 0040 决定 1（每条边界一个薄适配器、统一的兜底折叠）、决定 2（⑦ 任何边界都能
 * 产出同一个可记录对象）、决定 8（失败表达形态）、决定 13/14（legacy 6 码的防御映射）。
 *
 * 本文件是纯函数，**不 import** `node:` / `@deepseek-ai/` / `@eleckoi/`
 * （`scripts/check-architecture.mjs:95-106` 的 product-shared 闭集规则）。
 * 便利函数留在内部、不承诺兼容（ADR 0040 决定 3）——但它是 ①–⑥ 六条边界共同的那一条规则，
 * 所以六条边界都从这一个出口折叠，不许各自实现一份。
 */

import {
  ELECKOI_FAILURE_CODES,
  isEleckoiFailureCode,
  type EleckoiFailureCode
} from '../contracts/errors/codes.js'
import type { EleckoiFailureDetails, EleckoiFailureIssue } from '../contracts/errors/details.js'
import { DESKTOP_ERROR_CODES, type DesktopErrorCode } from './DesktopError.js'

/** 任何边界都能产出的同一个可记录对象（ADR 0040 决定 2 的 ⑦）。 */
export interface EleckoiFailure {
  readonly code: EleckoiFailureCode
  /** 开发者诊断文案；用户可见文案只有一个解析点（渲染层，ADR 0040 决定 4/9）。 */
  readonly message: string
  /** 参数化详情，顶层是扁平 JSON 对象。 */
  readonly details: EleckoiFailureDetails
}

/**
 * legacy 6 码 → 契约码的**防御映射**。
 *
 * 判据来源：ADR 0040 决定 13/14。19 处 `throw new DesktopError` 的真实语义决定这张表，
 * 不是凭印象写的：
 *
 * - `INTERNAL` → 兜底码（语义就是兜底）；
 * - `INVALID_REQUEST` → `eleckoi/input/invalid`（吸收 5 处用户输入校验）；
 * - `FORBIDDEN` → `eleckoi/safety/refused`（语义是「拒绝执行」而不是「执行失败」）。
 *
 * 下面三条**没有唯一对应**，所以是 `null`，折叠时码走兜底、原码进 `details.what` 做诊断——
 * **不许猜**成某个域码（猜错 = 给调用方一个假的可判别失败）：
 *
 * - `NOT_FOUND`：对应三个域（角色 / 创作项目 / Agent 预设），恢复动作本来就不同；
 * - `CONFLICT`：同一码两种语义（乐观并发失配 vs 目录已存在同名目录），必须拆；
 * - `RUNTIME_UNAVAILABLE`：无生产消费点，没有可点名的消费者。
 *
 * RETIRE WHEN: 所有生产 DESKTOP_ERROR_CODES 调用改用契约码后，
 * 与 DesktopError.ts 的旧码及联合类型分支、旧码映射回归一起删除。
 */
export const LEGACY_DESKTOP_FAILURE_CODES: Readonly<Record<DesktopErrorCode, EleckoiFailureCode | null>> = {
  INTERNAL: ELECKOI_FAILURE_CODES.internal,
  INVALID_REQUEST: ELECKOI_FAILURE_CODES.inputInvalid,
  FORBIDDEN: ELECKOI_FAILURE_CODES.safetyRefused,
  NOT_FOUND: null,
  CONFLICT: null,
  RUNTIME_UNAVAILABLE: null
}

const LEGACY_DESKTOP_ERROR_CODE_SET: ReadonlySet<string> = new Set(Object.values(DESKTOP_ERROR_CODES))

/**
 * 网关**载体码** → 契约码：合同违例的载体码折成 `contract/invalid-*`，`issues` 进详情。
 *
 * 判据来源：ADR 0040 决定 14（两条契约码的详情带 `issues`）、决定 2（「每条边界只声明不实现，
 * 不算完成」）与 `contracts/errors/boundaries.ts` 的 ② 表；票 EH-11 的 H 项。
 *
 * ⚠️ **票把这张表的来源写偏了一处。** 这些码**不都是** `dsh-api-gateway` 抛的，实测（2026-10-12，
 * `@deepseek-ai/*@0.2.0-rc.2`）：
 *
 * - `gateway/bad-request`：**DSH 自己的 API controller** 的入参 codec 失败，详情是 `{ issues }`
 *   （`dsh-api-settings-controller` 这个 DSH 包的 `lib/types/credentials.js:60` 的 `parsed.error.issues`；
 *   同族还有 session / workspace controller、`dsh-api-workspace-files`、`dsh-subagent`）。
 *   它是**真实可达**的：ElecKoi 的客户端就调 `settings.*` 这些面；
 * - `gateway/arguments-invalid`（`:1498`、`:1508`）与 `gateway/input-invalid`（`:1516-1520`）：网关
 *   dispatch 的入参校验，详情是 `{ endpoint, field? }`；
 * - `gateway/result-invalid`（`:768`）：出参 codec 失败，详情同上。
 *
 * 目标**就是**兜底码的那几条（`gateway/internal` / `gateway/cancelled`，以及签名、绑定、lookup
 * 那一族）**不在这张表里**：折过去与通用兜底等价，多一层没有信息量。
 *
 * ⚠️ 上面引的 DSH 包路径**故意不写作用域前缀**：`scripts/check-architecture.mjs` 的「组合根」那条按
 * **文本**扫产品侧源码（`packages/shared/src` 在内），注释里把作用域与 `dsh-` 连写成一个模块
 * 说明符也会被判成"绕过 Desktop Host 组合根"。包名与作用域分开写，判据与信息都不变。
 */
const GATEWAY_CARRIER_FOLDS: Readonly<Record<string, EleckoiFailureCode>> = {
  'gateway/bad-request': ELECKOI_FAILURE_CODES.contractInvalidRequest,
  'gateway/arguments-invalid': ELECKOI_FAILURE_CODES.contractInvalidRequest,
  'gateway/input-invalid': ELECKOI_FAILURE_CODES.contractInvalidRequest,
  'gateway/result-invalid': ELECKOI_FAILURE_CODES.contractInvalidResponse
}

/** 空白消息时的开发者诊断占位——不是用户可见文案。 */
const EMPTY_FAILURE_MESSAGE = '未提供失败消息'

/** `DesktopError` 构造器写死的 `name`：跨 bundle 副本的结构判据（见 {@link foldFailure}）。 */
const PRODUCT_FAILURE_NAME = 'DesktopError'

/**
 * 折叠任意抛出：能保真的保真，保不了的一律兜底。
 *
 * 顺序即优先级：
 *
 * 1. 结构上是**产品失败**（`name === 'DesktopError'` 且有 string `code`）带**契约码** → 码与详情原样保留；
 * 2. 同一个形状带 **legacy 码** → 走 {@link LEGACY_DESKTOP_FAILURE_CODES} 的防御映射；
 * 3. 结构上像 `RemoteError`（`isDSHRemoteError === true` 且有 string `code`，跨 realm 不靠
 *    `instanceof`）→ 契约码原样保留；**网关的合同违例载体码**（`gateway/bad-request`、
 *    `gateway/arguments-invalid`、`gateway/input-invalid`、`gateway/result-invalid`）折成
 *    `eleckoi/contract/invalid-request` / `invalid-response` 并把 `issues` 放进详情
 *    （{@link foldGatewayCarrier}）；码表外的其余码不猜，折成兜底并把原码记进 `details.what`；
 * 4. 其余一切（裸 `Error`、字符串、`null`、普通对象……）→ 兜底码 + `message`
 *    （非 `Error` 用 `String(...)`）。
 *
 * ⚠️ **第 1/2 步用形状而不是 `instanceof DesktopError`。** 边界②（宿主 Remote 出口）不在本包：
 * `dsh-product-data` 的产物是 tsdown 打的，它把本包**内联**成了自己那一份 `DesktopError`
 * （`packages/host/product-data/lib/index.js` 的 `var DesktopError = class extends Error`），
 * 而 `dsh-product-api` 的 host 面是 tsc 直出、按包名 import 本包——两个副本的原型不同，
 * `instanceof` 必为 false，会把码与详情整条丢掉。`boundaries.ts` 的②表写的就是
 * 「已带契约码的失败（DesktopError **形状**）」，这里跟上表。
 * （`name` 是构造器里写死的字面量，内联、压缩、跨 realm 都不会变。）
 */
export function foldFailure(error: unknown): EleckoiFailure {
  const product = productFailureOf(error)
  if (product !== undefined) {
    if (isDesktopErrorCode(product.code)) return foldLegacyCode(product.code, product.message)
    if (isEleckoiFailureCode(product.code)) {
      return { code: product.code, message: product.message, details: product.details }
    }
    // 形状对但码不在两张表里：不猜，折兜底并把原码记进 details.what。
    return internalFailure(product.message, product.code, product.details)
  }

  const remote = remoteFailureOf(error)
  if (remote !== undefined) {
    const code = remote.code
    const message = failureMessageOf(remote.message)
    if (isEleckoiFailureCode(code)) return { code, message, details: detailsOf(remote.details) }
    if (isDesktopErrorCode(code)) return foldLegacyCode(code, message)
    // 网关的合同违例载体码（入参 / 出参 codec 失败）：折成 contract/invalid-* 并把 issues 带出去。
    const carried = foldGatewayCarrier(code, message, detailsOf(remote.details))
    if (carried !== undefined) return carried
    return internalFailure(message, code, detailsOf(remote.details))
  }

  return internalFailure(failureMessageOf(error), undefined)
}

/**
 * 网关载体码的折法（表见 {@link GATEWAY_CARRIER_FOLDS}）。
 *
 * 详情一律是契约规定的 `{ issues }`：载体自带 `issues`（`gateway/bad-request`，元素形状是 zod 的
 * `{ path, message, ... }`）就逐条投影成 `{ path, message }`（`path` 是数组时按点号连接）；载体只带
 * `{ endpoint, field? }`（网关门自己的那三个码）就用 `field` 或 `endpoint` 加 message 合成一条——
 * **不拼用户可见句子**，那是渲染层解析点的事（ADR 0040 决定 4/8）。
 *
 * @param code - 载体码（Remote 失败对象上的 `code`）。
 * @param message - 开发者诊断（原文案）。
 * @param details - 载体的详情。
 * @returns 折出来的契约失败，或 `undefined` 表示这张表不认识这个载体码。
 */
function foldGatewayCarrier(
  code: string,
  message: string,
  details: EleckoiFailureDetails
): EleckoiFailure | undefined {
  const target = GATEWAY_CARRIER_FOLDS[code]
  if (target === undefined) return undefined
  const issues = carriedIssuesOf(details) ?? [contractIssueOf(details, message)]
  // `[...issues]` 是防御性复制：交出去的详情不引用调用方那个数组，也不引用载体那一份。
  if (target === ELECKOI_FAILURE_CODES.contractInvalidResponse) {
    return { code: ELECKOI_FAILURE_CODES.contractInvalidResponse, message, details: { issues: [...issues] } }
  }
  return { code: ELECKOI_FAILURE_CODES.contractInvalidRequest, message, details: { issues: [...issues] } }
}

/** 载体自带的 `issues`，逐条投影成契约的 `{ path, message }`；没有或一条都不可用就是 `undefined`。 */
function carriedIssuesOf(details: EleckoiFailureDetails): readonly EleckoiFailureIssue[] | undefined {
  const value: unknown = (details as { readonly issues?: unknown }).issues
  if (!Array.isArray(value)) return undefined
  const issues: EleckoiFailureIssue[] = []
  for (const item of value) {
    if (typeof item !== 'object' || item === null) continue
    const path = issuePathOf((item as { readonly path?: unknown }).path)
    const message = (item as { readonly message?: unknown }).message
    if (path === undefined || typeof message !== 'string') continue
    issues.push({ path: path, message: message })
  }
  return issues.length === 0 ? undefined : issues
}

/** 载体没带可用 `issues` 时，用它自己的 `field` 或 `endpoint` 与 message 合成一条。 */
function contractIssueOf(details: EleckoiFailureDetails, message: string): EleckoiFailureIssue {
  const field = detailStringOf(details, 'field')
  const endpoint = detailStringOf(details, 'endpoint')
  return { path: field === '' ? endpoint : field, message: message }
}

/** codec 的 `path`：字符串原样用，数组按点号连接（契约要求的形状），其余不认识。 */
function issuePathOf(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (!Array.isArray(value)) return undefined
  const segments: string[] = []
  for (const segment of value) {
    if (typeof segment !== 'string' && typeof segment !== 'number') return undefined
    segments.push(String(segment))
  }
  return segments.join('.')
}

/** 从详情里读一个 string 参数；没有或不是字符串就是空串。 */
function detailStringOf(details: EleckoiFailureDetails, key: string): string {
  const value: unknown = (details as Readonly<Record<string, unknown>>)[key]
  return typeof value === 'string' ? value : ''
}

/** 结构上像 `RemoteError` 的失败（`remoteErrorOf` 的判据，但这里不 import 官方包）。 */
interface RemoteFailureShape {
  readonly code: string
  readonly message: unknown
  readonly details: unknown
}

/** 结构识别出来的产品失败。 */
interface ProductFailureShape {
  readonly code: string
  readonly message: string
  readonly details: EleckoiFailureDetails
}

/**
 * 按形状识别 `DesktopError`：构造器写死 `name`，并带 string `code` 与可选 `details`。
 * 不 import 那个类、也不用 `instanceof`——理由见 {@link foldFailure}。
 * @param value - 被捕获的任意抛出。
 * @returns 识别出的产品失败，或 `undefined`。
 */
function productFailureOf(value: unknown): ProductFailureShape | undefined {
  // 标记是一串字面量、不是原型链：跨 bundle / 跨 realm 的副本都认。
  if (!isRecord(value)) return undefined
  if (value.name !== PRODUCT_FAILURE_NAME) return undefined
  if (typeof value.code !== 'string') return undefined
  return {
    code: value.code,
    message: shapeMessageOf(value),
    details: detailsOf(value.details)
  }
}

/**
 * 按形状读 `message`。
 *
 * **不能只靠 `failureMessageOf`**：那个函数用 `instanceof Error` 取 `.message`，而本函数服务的
 * 恰恰是「形状对、但不保证是这个 realm 的 `Error`」的对象（跨 bundle 副本、序列化后还原的对象、
 * 用例里手搭的形状）。先读自有属性上的 string `message`，读不到才退回 `failureMessageOf`。
 * @param value - 已确认是记录的对象。 @returns 非空的开发者诊断文案。
 */
function shapeMessageOf(value: Readonly<Record<string, unknown>>): string {
  const message = value.message
  if (typeof message === 'string' && message.trim() !== '') return message
  return failureMessageOf(value)
}

/** @param value - 任意值。 @returns 是不是非数组的普通对象。 */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function remoteFailureOf(value: unknown): RemoteFailureShape | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  // 标记是属性不是函数：跨 realm / 跨 bundle 的副本没有同一个原型，所以只认结构。
  if (!('isDSHRemoteError' in value) || value.isDSHRemoteError !== true) return undefined
  if (!('code' in value) || typeof value.code !== 'string') return undefined
  return {
    code: value.code,
    message: 'message' in value ? value.message : undefined,
    details: 'details' in value ? value.details : undefined
  }
}

function isDesktopErrorCode(code: string): code is DesktopErrorCode {
  return LEGACY_DESKTOP_ERROR_CODE_SET.has(code)
}

function foldLegacyCode(code: DesktopErrorCode, message: string): EleckoiFailure {
  const mapped = LEGACY_DESKTOP_FAILURE_CODES[code]
  // 没有唯一对应的三条：码走兜底，原码进 details.what。
  if (mapped === null) return internalFailure(message, code)
  // 有唯一对应的三条：只保码。19 处 legacy 抛出全是两参调用（没有详情），硬搬旧 details
  // 会产出不合该码形状的载荷；EH-3 之后这些码不该再出现。
  return { code: mapped, message, details: {} }
}

function internalFailure(message: string, what: string | undefined, upstreamDetails?: EleckoiFailureDetails): EleckoiFailure {
  return {
    code: ELECKOI_FAILURE_CODES.internal,
    message,
    details: {
      ...(what === undefined ? {} : { what }),
      ...(upstreamDetails && Object.keys(upstreamDetails).length ? { upstreamDetails: Object.fromEntries(Object.entries(upstreamDetails)) } : {})
    }
  }
}

function failureMessageOf(value: unknown): string {
  const message = value instanceof Error ? value.message : String(value)
  return message.trim() === '' ? EMPTY_FAILURE_MESSAGE : message
}

/**
 * 详情只接受对象形态：数组、`null`、标量一律折成 `{}`。
 * 运行期与线上一样**不深校验**（线上只校验 `z.record(z.string(), z.unknown())`），
 * 但契约要求它是扁平的、能过 `JSON.stringify` 往返的值。
 */
function detailsOf(value: unknown): EleckoiFailureDetails {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  return value as EleckoiFailureDetails
}
