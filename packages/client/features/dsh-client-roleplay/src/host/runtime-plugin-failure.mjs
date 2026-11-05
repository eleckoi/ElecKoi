/**
 * 边界④（DSH 运行时插件失败出口）的统一出口。
 *
 * 判据来源：`packages/shared/src/contracts/errors/boundaries.ts` 的 `runtime-plugin` 条目——
 * 「插件内的抛出；出口只要求『产出同一个可记录对象』并落到 logger，不新增通道」。
 * 折法只有两条：**已带契约码的失败原样保留**，**未分类失败折成兜底码 `internal`**。
 *
 * ## 这个出口做三件事
 *
 * 1. **折叠**：任意抛出 → 一条带码失败（`isDSHRemoteError` + `code` + `message` + `details`）。
 * 2. **落一行日志**：`ctx.logger.warn(...)` 写一行可检索的诊断（标记 + 码 + 开发者文案 +
 *    参数化详情 + 操作名 + 插件名），见 {@link runtimePluginFailureLine}。
 * 3. **仍然抛出**：出口不是吞掉——记录完把同一个失败对象抛出去，cordis / DSH 工具调度照旧看到失败。
 *
 * ## 码表与构造器来自 product-api 的宿主入口
 *
 * 运行时插件由宿主的 Node 直接 import、不经 tsdown/tsc 打包，所以只能取**已构建**的包：
 * `@eleckoi/product-shared` 的 exports 指向 `.ts` 源码，拿不到。`@eleckoi/dsh-product-api`
 * 是 `apps/desktop/package.json` 的 `workspace:*` 依赖、也在 `runtime-manifest.json` 的
 * `desktopProfile.bundles` 里，包根（`lib/types/index.js`，`tsc` 直出）现在转出
 * `productFailure` 与 `ELECKOI_FAILURE_CODES`（集成分支 9b1a644 补的两行转出），构造与码表
 * 因此只有一份真相：本文件不写码字符串，也不重写 `productFailure` 的形状。
 * 同目录插件已在 import `@eleckoi/dsh-client-roleplay/host/*.mjs`，解析路径同一条。
 *
 * ## 为什么抛的是 Error 子类（而不是 productFailure 那个普通对象）
 *
 * 1. 插件 `apply()` 的抛出会经过 cordis 的 `composeError`/`handleError`
 *    （`@deepseek-ai/cordis/lib/index.js:171-207`）：没有 string `stack` 的抛出会被
 *    `new Error(reason)` 包一层，码和文案都变成 `[object Object]`。Error 子类保住 message 与 stack。
 * 2. 这些文件里已有 `error instanceof Error` 的判定与 `error.message` 的读取
 *    （例如 `patchTool` 的 catch），Error 子类让它们不用改语义。
 * 3. 契约形状照样满足：字段仍由 `productFailure` 造，只是挂到 Error 上
 *    （`isDSHRemoteError` + 字符串码 + `details` 一个不少）。
 *
 * ## 它不是 Cordis 插件
 *
 * 文件里没有 `name` / `inject` / `apply`（对比同目录的插件 wrapper）。它是普通 ESM 助手模块，
 * 由本目录两个工具插件 import。登记在 `runtime-manifest.json` 的 `localModules`
 * （`check:dsh-runtime` 会查它在不在）。
 */

import { productFailure, ELECKOI_FAILURE_CODES } from '@eleckoi/dsh-product-api'

/** 诊断行标记。日志里按它检索运行时插件失败；故意不带 `eleckoi/…` 码形态，免得跟码表混淆。 */
export const RUNTIME_PLUGIN_FAILURE_EVENT = 'eleckoi/runtime-plugin-failure'

/** 码表（转出去给用例核对与调用点用；真相是 `@eleckoi/dsh-product-api`）。 */
export { ELECKOI_FAILURE_CODES }

const FAILURE_CODE_SET = new Set(Object.values(ELECKOI_FAILURE_CODES))

/** 一条带码失败：字段由 `productFailure` 造（普通对象），容器是 Error（理由见文件头）。 */
export class RuntimePluginFailure extends Error {
  /**
   * @param {string} code - 契约码（只用 {@link ELECKOI_FAILURE_CODES} 里的值）。
   * @param {string} message - 开发者诊断：保留原来那句中文，别删掉——日志靠它定位。
   * @param {object} [details] - 参数化详情，键只用闭集里的八个（契约 `details.ts`）。
   * @param {ErrorOptions} [options] - 传给 `Error` 的 `cause` 等选项。
   */
  constructor(code, message, details = {}, options) {
    super(message, options)
    this.name = 'RuntimePluginFailure'
    Object.assign(this, productFailure(code, message, details))
  }
}

/**
 * 造一条带码失败。
 *
 * @param {string} code - 契约码。
 * @param {string} message - 开发者诊断（原中文句）。
 * @param {object} [details] - 参数化详情。
 * @returns {RuntimePluginFailure} 可直接 `throw` 的失败。
 */
export function runtimePluginFailure(code, message, details = {}) {
  return new RuntimePluginFailure(code, message, details)
}

/** 任意抛出 → 一句开发者诊断（非 Error 的普通对象也认 `message`，与 DSH 的 `errorMessage` 同规则）。 */
function messageOf(error) {
  if (error instanceof Error) return error.message
  if (error !== null && typeof error === 'object' && typeof error.message === 'string') return error.message
  return String(error)
}

/**
 * 是不是一条带码失败：本模块造的实例，或任何契约载体形状（`isDSHRemoteError` + 码表里的字符串码）。
 *
 * @param {unknown} error - 任意抛出。
 * @returns {boolean} 带码时为 true。
 */
export function isCodedFailure(error) {
  if (error instanceof RuntimePluginFailure) return true
  return error !== null && typeof error === 'object' && error.isDSHRemoteError === true
    && typeof error.code === 'string' && FAILURE_CODE_SET.has(error.code)
}

/**
 * 折叠规则（边界④的那两条）：带码的保留码与详情；未分类的折成 `internal`，
 * 若原抛出带着不在码表里的 `code`，把它放进 `details.what`（契约：`what` 记被折叠掉的原码）。
 *
 * @param {unknown} error - 任意抛出。
 * @returns {RuntimePluginFailure} 带码失败。
 */
export function foldRuntimePluginFailure(error) {
  if (error instanceof RuntimePluginFailure) return error
  if (isCodedFailure(error)) {
    return runtimePluginFailure(error.code, messageOf(error), error.details && typeof error.details === 'object' ? error.details : {})
  }
  const foldedCode = error !== null && typeof error === 'object' && typeof error.code === 'string' && !FAILURE_CODE_SET.has(error.code)
    ? { what: error.code }
    : {}
  return runtimePluginFailure(ELECKOI_FAILURE_CODES.internal, messageOf(error), foldedCode)
}

/**
 * 一行可检索的诊断：标记 + 码 + 开发者文案 + 参数化详情 + 操作名 + 插件名，堆栈有就带上。
 *
 * 用 JSON 是刻意的：一行内既能人读（`code` / `message` 挨着），又能被 `grep` 与脚本切成字段。
 *
 * @param {string} plugin - 插件 id（`name` 导出）。
 * @param {string} operation - 失败时正在做的操作（工具名，或补丁里的文件操作名）。
 * @param {RuntimePluginFailure} failure - 折叠后的带码失败。
 * @param {unknown} error - 原始抛出（用来取 stack）。
 * @returns {string} 一行诊断。
 */
export function runtimePluginFailureLine(plugin, operation, failure, error) {
  const stack = error instanceof Error ? error.stack : undefined
  return `${RUNTIME_PLUGIN_FAILURE_EVENT} ${JSON.stringify({
    plugin,
    operation,
    code: failure.code,
    message: failure.message,
    details: failure.details,
    ...(stack === undefined ? {} : { stack })
  })}`
}

/**
 * 折成带码失败、写一行日志、把失败对象返回给调用方（**不在这里抛**）。
 *
 * 记录点统一用插件上下文里的 logger（`ctx.logger.warn`，与同目录其它插件一致）；
 * 没有 logger（例如单测里的假 ctx）时跳过记录，但折叠结果照旧返回。
 *
 * @param {unknown} ctx - 插件上下文（只用到 `ctx.logger`）。
 * @param {string} plugin - 插件 id。
 * @param {string} operation - 操作名。
 * @param {unknown} error - 原始抛出。
 * @returns {RuntimePluginFailure} 折叠后的带码失败。
 */
export function recordRuntimePluginFailure(ctx, plugin, operation, error) {
  const failure = foldRuntimePluginFailure(error)
  ctx?.logger?.warn?.(runtimePluginFailureLine(plugin, operation, failure, error))
  return failure
}

/**
 * 失败出口：记录一行日志后把同一个失败抛出去（出口不是吞掉）。
 *
 * @param {unknown} ctx - 插件上下文。
 * @param {string} plugin - 插件 id。
 * @param {string} operation - 操作名。
 * @param {unknown} error - 原始抛出。
 * @returns {never} 总是抛出。
 */
export function throwRuntimePluginFailure(ctx, plugin, operation, error) {
  throw recordRuntimePluginFailure(ctx, plugin, operation, error)
}

/**
 * 包住插件的 `apply(ctx)`：同步返回**原样透传**（disposer 不能变成 Promise），
 * 同步抛出与 thenable 拒绝都走统一出口。
 *
 * @template T
 * @param {unknown} ctx - 插件上下文。
 * @param {string} plugin - 插件 id。
 * @param {() => T} run - 插件入口体。
 * @returns {T} 入口体的返回值（同步路径）。
 */
export function runRuntimePluginApply(ctx, plugin, run) {
  let returned
  try {
    returned = run()
  } catch (error) {
    throwRuntimePluginFailure(ctx, plugin, 'apply', error)
  }
  if (returned !== null && typeof returned === 'object' && typeof returned.then === 'function') {
    return returned.catch((error) => {
      throwRuntimePluginFailure(ctx, plugin, 'apply', error)
    })
  }
  return returned
}

/**
 * 包住一个工具定义的 `execute`：工具执行期间的任何抛出都走统一出口。
 *
 * 取消不是失败：`exec.signal` 已中止时原样抛出，交给 DSH 的取消出口（它会产出 `ABORTED` 结果），
 * 不记成 `internal`。
 *
 * @template {{ name: string, execute: Function }} T
 * @param {unknown} ctx - 插件上下文。
 * @param {string} plugin - 插件 id。
 * @param {T} definition - `defineTool(...)` 的工具定义。
 * @returns {T} 同一个定义（只换掉 `execute`）。
 */
export function withRuntimePluginExit(ctx, plugin, definition) {
  const execute = definition.execute
  return {
    ...definition,
    async execute(args, exec) {
      try {
        return await execute(args, exec)
      } catch (error) {
        if (exec?.signal?.aborted) throw error
        throwRuntimePluginFailure(ctx, plugin, definition.name, error)
      }
    }
  }
}
