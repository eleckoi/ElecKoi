import { useProductTranslation } from "../../app/i18n/ProductLocaleContext.jsx";
import React, { useEffect } from "react";
import { hasAppFailureListener, reportAppFailure } from "../../utils/appFailureOutlet.js";
import {
  FAILURE_CHANNELS,
  defaultChannelOf,
  failureDetailLines,
  resolveFailure,
  localizeFailure,
  upgradeChannel,
} from "../../utils/failureText.js";

/**
 * 功能内（`inline` 通道）的失败面。
 *
 * 判据来源：ADR 0040 决定 4/8（用户可见文案只有一个解析点，在渲染层）、
 * `apps/web/src/utils/failureText.js` 的文件头（折叠 / 说人话 / 给通道 / 给出口）。
 *
 * 呈现三件事，缺一不可：
 *
 * 1. **一句用户话**：`resolveFailure` 按码给出的 `text`，调用点不自己拼句子；
 * 2. **错误码**：可见、可选中复制（放在正文里，不藏进 `title`）。码是维护者与用户之间
 *    唯一能对上的标识，藏起来等于把证据丢掉；
 * 3. **参数化详情**：有就给（`failureDetailLines` 逐条，与 `AppErrorDialog` 同一口径）。
 *
 * 通道默认由码给（`resolveFailure` 的 `channel`）。调用点只能**上调**到应用级
 * （`upgradeTo="app"`）——组件没有下调参数，把严重失败藏成一行小字在结构上做不到。
 *
 * **应用级失败不留在角落**：码表里有五条码默认走 `app` 通道（插件装载失败、库结构不符、
 * 存储损坏、调用来源不可信、服务已关闭）。命中这些码时本组件**不就地渲染**，而是把
 * `resolveFailure` 的结果交给 `appFailureOutlet` 的应用级出口（窗口级 `AppErrorDialog`，
 * 码与详情在那里同样可见）。没有窗口订阅（单测 / SSR / 窗口还没挂载）时退回就地渲染——
 * 宁可显示在角落，也不能让失败消失。上调只改严重度，不会把功能内失败误升级：
 * 只有 `channel === "app"` 才走出口。
 *
 * `failure` 可以是任何抛出值（`resolveFailure` 能吃的都行），也可以**已经**是
 * `resolveFailure` 的结果——调用点把失败对象直接存进状态，渲染时交给这里即可。
 * 传 `null` / `undefined` / 空串表示"没有失败"，什么都不渲染（调用点可以不写条件）。
 *
 * @param props - 组件参数。
 * @param props.failure - 任意抛出值，或 `resolveFailure` 的结果。
 * @param props.context - 调用方对这次失败的称法（如「保存失败」），只在失败本身给不出任何
 *   用户说法时用作兜底文案；它**不**替代码表文案。
 * @param props.onRetry - 给了就出「重试」按钮。
 * @param props.upgradeTo - 只允许上调到 `"app"`；其余取值被忽略。
 * @param props.className - 调用点已有的版式类（保留原有外边距 / 布局）。
 * @returns 失败面元素，或 `null`（没有失败）。
 */
export function FailureAlert({ failure, context, onRetry, upgradeTo, className = "" }) {
  const tUi = useProductTranslation();
  const resolved = localizeFailure(resolveAlertFailure(failure, context, upgradeTo), tUi);
  // 应用级失败交给窗口级出口（对话框），本组件不渲染这一小块；没有出口时才就地渲染。
  const escalated = resolved?.channel === FAILURE_CHANNELS.app && hasAppFailureListener();
  useEffect(() => {
    if (!escalated) return;
    reportAppFailure(resolved);
  }, [escalated, resolved?.code, resolved?.diagnostic]);
  if (!resolved || escalated) return null;
  const details = failureDetailLines(resolved.details);
  const classes = ["failure-alert", resolved.channel === FAILURE_CHANNELS.app ? "is-app-level" : "", className]
    .filter(Boolean)
    .join(" ");
  return (
    <div
      className={classes}
      role="alert"
      data-failure-code={resolved.code}
      data-failure-channel={resolved.channel}
    >
      <div className="failure-alert-head">
        <p className="failure-alert-text">{resolved.text}</p>
        {onRetry ? (
          <button type="button" className="failure-alert-retry" onClick={onRetry}>{tUi("重试")}</button>
        ) : null}
      </div>
      <code className="failure-alert-code">{resolved.code}</code>
      {details.length > 0 ? (
        <dl className="failure-alert-details">
          {details.map(({ label, value }) => (
            <React.Fragment key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </React.Fragment>
          ))}
        </dl>
      ) : null}
    </div>
  );
}

/**
 * 把入参解析成界面能直接用的形状。已经是 `resolveFailure` 结果的照原样用（只补通道上调），
 * 其余交给 `resolveFailure`（它永不抛）。
 */
function resolveAlertFailure(failure, context, upgradeTo) {
  if (isAbsent(failure)) return null;
  if (isResolvedFailure(failure)) {
    return { ...failure, channel: upgradeChannel(failure.channel || defaultChannelOf(failure.code), upgradeTo) };
  }
  return resolveFailure(failure, { fallback: context, upgradeTo });
}

/** `null` / `undefined` / 空白字符串 = 没有失败。 */
function isAbsent(failure) {
  return failure === null || failure === undefined || (typeof failure === "string" && failure.trim() === "");
}

/**
 * 认出 `resolveFailure` 的产物：`text` + `code` + `diagnostic` 三个 string。
 * 判据用形状而不是原型——失败对象可能跨 bundle / 序列化回来。
 */
function isResolvedFailure(failure) {
  return typeof failure === "object"
    && failure !== null
    && typeof failure.text === "string"
    && typeof failure.code === "string"
    && typeof failure.diagnostic === "string";
}
