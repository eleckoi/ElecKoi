/**
 * 用户可见文案的**唯一解析点**（渲染层）。
 *
 * 判据来源：`contracts/errors/boundaries.ts` 第 6 条边界的 `carries`；ADR 0040 决定 4/8
 * （契约只给码 + 参数化详情 + 开发者诊断文案；**用户可见文案只有一个解析点，在渲染层**，
 * 宿主侧永不拼用户可见句子）。
 *
 * 这一层只做四件事：
 *
 * 1. **折叠**：交给契约包的 `foldFailure`（纯函数）。**不在这里再写一份码表**——
 *    码字符串的唯一真相是 `@shared/contracts/errors/codes`；本文件只把码映射成句子。
 * 2. **说人话**：按码给一句用户可见的说法（`text`）。认不出的码只给一句通用说法
 *    （`foldFailure` 已把它折成兜底码并把原码放进 `details.what`，所以原码不会被吞）。
 *    真正的裸 `Error`（没有码语义）才用它的 `message` 当说法——那是唯一能让用户知道
 *    发生了什么的东西。
 * 3. **给通道**：按码给默认通道（严重度），调用点**只能上调**（`upgradeTo: "app"`），
 *    没有下调的参数——"严重度是场景的属性"这条因此是结构保证，不是约定。
 * 4. **给出口**：`code` / `details` 原样交给界面展示与复制，`diagnostic` 给日志。
 *
 * 输入可以是任何抛出值：`RemoteError` 形状、`DesktopError`、裸 `Error`、字符串、`null`、
 * 普通对象。**永不抛**。
 */
import { describeFailure } from "@shared/foundation/describeFailure";
import { foldFailure } from "@shared/foundation/failure";
import { APP_LEVEL_CODES, FAILURE_TEXTS, IO_OPERATION_TEXTS, detailString } from "./failureTexts.js";

// 表与参数读取工具住 `failureTexts.js`（对外文档生成器直接读那一份）；这里原样再导出，
// 既有调用点与用例的导入路径不变。
export { APP_LEVEL_CODES, FAILURE_TEXTS, IO_OPERATION_TEXTS, detailString };

/** 认不出语义时的通用说法（不是某个码的文案）。 */
export const GENERIC_FAILURE_TEXT = "操作失败，请重试。";

/** 日志里用来检索渲染层失败的标记（不是失败码，故意不带 `eleckoi/` 前缀以免与码表混淆）。 */
export const RENDERER_FAILURE_LOG_MARKER = "eleckoi-renderer-failure";

/** 两个呈现通道。`inline` = 功能内就地失败面；`app` = 应用级对话框 / 窗口级提示。 */
export const FAILURE_CHANNELS = { inline: "inline", app: "app" };

/**
 * 把一个失败解析成界面与日志都能用的形状。
 *
 * - `text`：给用户的一句话（按码给；见文件头）；
 * - `code` / `details`：契约形态，原样给出供界面展示与复制；
 * - `diagnostic`：给日志的一行（可检索标记 + 码 + 开发者诊断 + 参数化详情）；
 * - `channel`：`"inline"` 或 `"app"`。默认由码给；`options.upgradeTo` **只能**把它往上调
 *   （"inline" → "app"）。`"app"` → `"inline"` 会被忽略——不允许把严重失败藏成一行小字，
 *   所以这个函数的参数里根本没有下调的位置。
 *
 * `options.fallback` 是调用方对这次操作的称法（如「保存失败」），只在给不出任何说法时使用。
 */
export function resolveFailure(failure, options = {}) {
  const folded = foldFailure(failure);
  const channel = upgradeChannel(defaultChannelOf(folded.code), options.upgradeTo);
  return {
    text: userText(failure, folded, fallbackText(options.fallback)),
    message: folded.message,
    code: folded.code,
    details: folded.details,
    diagnostic: `${RENDERER_FAILURE_LOG_MARKER} ${describeFailure(folded)}`,
    channel,
  };
}

/**
 * 只要一句话时的入口（各窗口 `cause?.message || '…'` 的收口点）。
 * @param failure - 任意抛出值。
 * @param fallback - 给不出说法时的调用方说法。
 * @returns 用户可见的一句话。
 */
export function failureMessage(failure, fallback = "") {
  return resolveFailure(failure, { fallback }).text;
}

/** Render known product failures in the active locale; diagnostics and detail values remain intact. */
export function localizeFailure(failure, translate) {
  if (!failure) return failure;
  const describe = FAILURE_TEXTS[failure.code];
  return { ...failure, text: describe ? describe(failure.details || {}, translate)
    : typeof failure.text === 'string' ? translate(failure.text) : failure.text };
}

/**
 * 码 → 默认通道。
 * @param code - 契约码。
 * @returns `"inline"` 或 `"app"`。
 */
export function defaultChannelOf(code) {
  return APP_LEVEL_CODES.has(code) ? FAILURE_CHANNELS.app : FAILURE_CHANNELS.inline;
}

/**
 * 只上不下的通道合并。
 *
 * @param channel - 码给的默认通道。
 * @param upgradeTo - 调用点请求上调到的通道（可选）。
 * @returns 合并后的通道：`upgradeTo` 是 `"app"` 才是 `"app"`，其余一律保持原通道。
 */
export function upgradeChannel(channel, upgradeTo) {
  return upgradeTo === FAILURE_CHANNELS.app ? FAILURE_CHANNELS.app : channel;
}

/**
 * 详情 → `[{ key, label, value }]`，供界面逐条展示与复制。
 * `label` 就是契约的参数名（`operation` / `path` / …）：维护者要的就是这些原始键。
 */
export function failureDetailLines(details) {
  if (typeof details !== "object" || details === null || Array.isArray(details)) return [];
  return Object.keys(details)
    .filter((key) => details[key] !== undefined && details[key] !== null)
    .map((key) => ({ key, label: key, value: detailValueText(details[key]) }));
}

/** 详情 → 一行可复制的文本。 */
export function formatFailureDetails(details) {
  return failureDetailLines(details).map(({ label, value }) => `${label}: ${value}`).join("；");
}

/**
 * 给**没有界面出口**的失败留落点：把诊断串交给 `console.error`。
 * 桌面主窗口会把这个 console 消息转发进主进程日志（`mainWindowPlugin.ts` 的 console-message 桥），
 * 所以不需要为它新建 IPC 通道。
 */
export function reportFailure(failure, context = "") {
  const resolved = resolveFailure(failure);
  console.error(`${context ? `[${context}] ` : ""}${resolved.diagnostic}`);
  return resolved;
}

/**
 * 渲染层未处理拒绝的落点。
 * 只报告、不 `preventDefault`：开发者工具里仍然看得到原始栈。
 */
export function installUnhandledFailureReporting(target = window) {
  target.addEventListener("unhandledRejection", (event) => {
    reportFailure(event ? event.reason : undefined, "渲染层未处理的拒绝");
  });
}

function userText(failure, folded, fallback) {
  const describe = FAILURE_TEXTS[folded.code];
  if (describe) return describe(folded.details);
  // 兜底码：下面两种情形都在这里。
  // - 带 `details.what` = 有一个码被折掉了（`foldFailure` 的未知码路径）。不猜它的语义，
  //   只给通用说法；原码由 `code`/`details` 带出去。
  if (detailString(folded.details.what)) return fallback;
  // - 真正的裸失败（没有码语义）：它的 message 是唯一能让用户知道发生了什么的东西。
  return developerMessage(failure) || fallback;
}

/**
 * 从抛出值里取**开发者写明的** message。三种形态认得：字符串、`Error`、带 string `message` 的对象。
 *
 * 故意**不**用 `foldFailure` 的 `message`：那种 message 对非 `Error` 输入是 `String(value)`，
 * 会把 `null` / `[object Object]` 这类东西当说法给用户。
 */
function developerMessage(failure) {
  if (typeof failure === "string") return failure.trim();
  if (failure instanceof Error) return failure.message.trim();
  if (typeof failure === "object" && failure !== null && typeof failure.message === "string") {
    return failure.message.trim();
  }
  return "";
}

function fallbackText(fallback) {
  const text = typeof fallback === "string" ? fallback.trim() : "";
  return text || GENERIC_FAILURE_TEXT;
}

function detailValueText(value) {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? String(value) : serialized;
  } catch {
    return String(value);
  }
}
