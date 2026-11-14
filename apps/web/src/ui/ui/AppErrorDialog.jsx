import { useProductTranslation } from "../../app/i18n/ProductLocaleContext.jsx";
import { ELECKOI_FAILURE_CODES } from "@shared/contracts/errors/codes";
import { DesktopError } from "@shared/foundation/DesktopError";
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import React, { useEffect, useState } from "react";
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
  const [copyState, setCopyState] = useState("idle");

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
    if (failure?.message && failure.message !== message) lines.push(failure.message);
    if (failure?.code) lines.push(`错误码：${failure.code}`);
    const details = formatFailureDetails(failure?.details);
    if (details) lines.push(details);
    if (failure?.diagnostic) lines.push(failure.diagnostic);
    return lines.join("\n");
  }

  const copyLabel = copyState === "copied" ? tUi("已复制") : tUi("复制");
  const statusText = copyState === "copied"
    ? tUi("错误内容已复制")
    : copyState === "failed"
      ? tUi("复制失败，请手动选择错误内容")
      : "";

  return <Modal open title={tUi("运行错误")} closeLabel={tUi("关闭错误详情")} onClose={() => onDismiss?.()}
    className="app-error-dialog" contentClassName="app-error-content"
    footer={<div className="app-error-footer">
      {statusText && <span className={`app-error-copy-status${copyState === 'failed' ? ' is-failed' : ''}`} role="status" aria-live="polite">{statusText}</span>}
      <div className="app-error-actions">
        <Button variant="outline" onClick={onDismiss}>{tUi("关闭")}</Button>
        {onReportProblem && <Button variant="outline" onClick={() => onReportProblem(notice.failure)}>{tUi("报告问题")}</Button>}
        <Button variant="primary" data-modal-autofocus onClick={copyError}>{copyLabel}</Button>
      </div>
    </div>}>
    <pre className="app-error-detail" tabIndex={0}>{[message, notice.failure?.message !== message ? notice.failure?.message : null].filter(Boolean).join('\n\n')}</pre>
    {notice.failure && (notice.failure.code || failureDetailLines(notice.failure.details).length > 0) && <dl className="app-error-failure">
      {notice.failure.code && <><dt>{tUi("错误码")}</dt><dd>{notice.failure.code}</dd></>}
      {failureDetailLines(notice.failure.details).map(({ label, value }) => <React.Fragment key={label}><dt>{label}</dt><dd>{value}</dd></React.Fragment>)}
    </dl>}
    {notice.failure?.diagnostic && <details className="app-error-technical"><summary>{tUi("查看技术详情")}</summary><pre className="app-error-detail" tabIndex={0}>{notice.failure.diagnostic}</pre></details>}
  </Modal>;
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
