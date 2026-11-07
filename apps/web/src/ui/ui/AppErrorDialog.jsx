import { useProductTranslation } from "../../app/i18n/ProductLocaleContext.jsx";
import { ELECKOI_FAILURE_CODES } from "@shared/contracts/errors/codes";
import { DesktopError } from "@shared/foundation/DesktopError";
import { SystemBarOverlay } from './SystemBarOverlay.jsx';
import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CopyIcon, XIcon } from "../icons/index.jsx";
import { failureDetailLines, formatFailureDetails, localizeFailure } from "../../utils/failureText.js";

/**
 * 窗口级错误对话框。
 *
 * `onReportProblem` 是「报告问题」的出口（ADR 0042 决定 17）：出错的那一刻是用户最想报告的时候，
 * 所以这里给一个入口。**不传就不渲染**——窗口里没有报告服务时，多一个点下去必然失败的按钮比
 * 少一个入口更糟（与 `CommunityDialog` 同一条规矩）。点击时把失败对象交给调用方，
 * 由它关掉这条错误、打开报告对话框。
 */
export function AppErrorDialog({ notice, onDismiss, onReportProblem }) {
  const tUi = useProductTranslation();
  const message = (notice?.failure ? localizeFailure(notice.failure, tUi).text : null) ?? tUi(notice?.message || '');
  const titleId = useId();
  const detailId = useId();
  const statusId = useId();
  const dialogRef = useRef(null);
  const copyRef = useRef(null);
  const onDismissRef = useRef(onDismiss);
  const [copyState, setCopyState] = useState("idle");

  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!notice?.message || typeof document === "undefined") return undefined;
    const previousFocus = document.activeElement;
    const focusFrame = window.requestAnimationFrame(() => copyRef.current?.focus());

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        onDismissRef.current?.();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = Array.from(dialogRef.current?.querySelectorAll("button:not(:disabled)") || []);
      if (!controls.length) {
        event.preventDefault();
        return;
      }
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", handleKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [notice?.id]);

  useEffect(() => {
    setCopyState("idle");
  }, [notice?.id]);

  if (!notice?.message) return null;

  async function copyError() {
    try {
      // 复制要能直接交给开发者：一句话 + 码 + 参数化详情 + 诊断行。
      await writeClipboard(copyPayload());
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  function copyPayload() {
    const failure = notice.failure;
    const lines = [message];
    if (failure?.code) lines.push(`错误码：${failure.code}`);
    const details = formatFailureDetails(failure?.details);
    if (details) lines.push(details);
    if (failure?.diagnostic) lines.push(failure.diagnostic);
    return lines.join("\n");
  }

  const copyLabel = copyState === "copied" ? tUi("已复制") : copyState === "failed" ? tUi("重试复制") : tUi("复制错误");
  const statusText = copyState === "copied"
    ? tUi("错误内容已复制")
    : copyState === "failed"
      ? tUi("复制失败，请手动选择错误内容")
      : "";

  const dialog = (
    <SystemBarOverlay className="app-error-overlay" role="presentation" onMouseDown={() => onDismiss?.()}>
      <section
        ref={dialogRef}
        className="app-error-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={`${detailId}${statusText ? ` ${statusId}` : ""}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="app-error-header">
          <h2 id={titleId}>{tUi("运行错误")}</h2>
          <button type="button" className="app-error-close" aria-label={tUi("关闭错误详情")} onClick={onDismiss}>
            <XIcon size={18} />
          </button>
        </header>
        <pre id={detailId} className="app-error-detail" tabIndex={0}>{message}</pre>
        {notice.failure && (notice.failure.code || failureDetailLines(notice.failure.details).length > 0) ? (
          <dl className="app-error-failure">
            {notice.failure.code ? (
              <>
                <dt>{tUi("错误码")}</dt>
                <dd>{notice.failure.code}</dd>
              </>
            ) : null}
            {failureDetailLines(notice.failure.details).map(({ label, value }) => (
              <React.Fragment key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </React.Fragment>
            ))}
          </dl>
        ) : null}
        <div className="app-error-footer">
          <span id={statusId} className={`app-error-copy-status${copyState === "failed" ? " is-failed" : ""}`} role="status" aria-live="polite">
            {statusText}
          </span>
          <div className="app-error-actions">
            <button type="button" onClick={onDismiss}>{tUi("关闭")}</button>
            {onReportProblem ? (
              <button type="button" onClick={() => onReportProblem(notice.failure)}>
                <span>{tUi("报告问题")}</span>
              </button>
            ) : null}
            <button ref={copyRef} type="button" className="is-primary" onClick={copyError}>
              <CopyIcon size={15} />
              <span>{copyLabel}</span>
            </button>
          </div>
        </div>
      </section>
    </SystemBarOverlay>
  );

  const portalTarget = typeof document === "undefined" ? null : document.body;
  return portalTarget ? createPortal(dialog, portalTarget) : dialog;
}

async function writeClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new DesktopError(ELECKOI_FAILURE_CODES.internal, "Clipboard write failed", { what: "剪贴板写入" });
}
