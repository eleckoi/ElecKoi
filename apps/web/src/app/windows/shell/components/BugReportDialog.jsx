import { ELECKOI_FAILURE_CODES } from "@shared/contracts/errors/codes";
import { DesktopError } from "@shared/foundation/DesktopError";
import { formatBugReportBody, buildBugReportMailto } from "@shared/contracts/bugReport/mailto";
import { buildBugReportIssueUrl } from "@shared/contracts/bugReport/issue";
import { SystemBarOverlay } from '../../../../ui/ui/SystemBarOverlay.jsx';
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CopyIcon, DownloadIcon, XIcon } from "../../../../ui/icons/index.jsx";
import { resolveFailure } from "../../../../utils/failureText.js";
import { bugReportBridge, letterOf } from "./bugReportBridge.js";

const PLATFORM_LABELS = {
  windows: "Windows",
  macos: "macOS",
  linux: "Linux",
  android: "Android",
};

function bridgeOrFail() {
  const bridge = bugReportBridge();
  if (!bridge) {
    throw new DesktopError(ELECKOI_FAILURE_CODES.lifecycleNotReady, "当前平台暂不支持报告功能。", { what: "报告服务" });
  }
  return bridge;
}

async function copyText(text) {
  if (!navigator.clipboard?.writeText) {
    throw new DesktopError(ELECKOI_FAILURE_CODES.inputUnsupported, "Clipboard API unavailable", { what: "剪贴板接口" });
  }
  await navigator.clipboard.writeText(text);
}

/**
 * 报告问题对话框：展示主进程收集好的报告，让用户选一条投递通道。
 *
 * 判据（ADR 0041）：用户发出去的东西必须是他看过的。所以这里只做三件事——把报告摆出来、
 * 让用户勾选与补一句话、调用对应的通道。桌面端的报告与脱敏在 Electron 主进程完成；Android 的
 * 运行诊断只给原始事实，报告由 `bugReportBridge.js` 用共享契约拼。
 */
export function BugReportDialog({ open, onClose, onNotify }) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef(null);
  const primaryButtonRef = useRef(null);
  const onCloseRef = useRef(onClose);

  onCloseRef.current = onClose;

  const [preview, setPreview] = useState(null);
  const [includeLogTail, setIncludeLogTail] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;
    const previousFocus = document.activeElement;
    const focusFrame = window.requestAnimationFrame(() => primaryButtonRef.current?.focus());

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current?.();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll("button:not(:disabled), input:not(:disabled), textarea:not(:disabled)") || []);
      if (!focusable.length) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
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
  }, [open]);

  // 收集参数走 ref：notes 每敲一个字都变，若让 collect 跟着变，打开对话框那个 effect 会被反复触发
  // 并把刚输入的备注清掉。
  const stateRef = useRef({ includeLogTail, notes });
  stateRef.current = { includeLogTail, notes };

  const collect = useCallback(async (overrides = {}) => {
    const logTail = overrides.logTail ?? stateRef.current.includeLogTail;
    const noteText = overrides.noteText ?? stateRef.current.notes;
    const trimmed = noteText.trim();
    return bridgeOrFail().preview({
      includeLogTail: logTail,
      ...(trimmed === "" ? {} : { notes: trimmed }),
    });
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    setError("");
    setNotice("");
    setNotes("");
    setIncludeLogTail(false);
    setPreview(null);
    collect({ logTail: false, noteText: "" })
      .then((nextPreview) => { if (active) setPreview(nextPreview); })
      .catch((cause) => { if (active) setError(resolveFailure(cause, { fallback: "无法生成报告。" }).text); });
    return () => { active = false; };
  }, [open, collect]);

  async function toggleLogTail(event) {
    const next = event.target.checked;
    setIncludeLogTail(next);
    setError("");
    setBusy(true);
    try {
      setPreview(await collect({ logTail: next }));
    } catch (cause) {
      setError(resolveFailure(cause, { fallback: "无法生成报告。" }).text);
    } finally {
      setBusy(false);
    }
  }

  async function deliver(action) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const fresh = await collect();
      setPreview(fresh);
      await action(fresh);
    } catch (cause) {
      setError(resolveFailure(cause, { fallback: "报告没能发出去。" }).text);
    } finally {
      setBusy(false);
    }
  }

  function sendByMail() {
    return deliver(async (fresh) => {
      const mailto = buildBugReportMailto(fresh.report, fresh.delivery.mailbox, letterOf(fresh.delivery));
      if (!mailto) {
        throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, `收件地址不合法：${fresh.delivery.mailbox}`, { field: "mailbox" });
      }
      if (mailto.summarized) {
        await copyText(formatBugReportBody(fresh.report, letterOf(fresh.delivery)));
        setNotice("报告较长，完整内容已复制到剪贴板；打开邮件后粘贴到正文末尾即可。");
      } else {
        setNotice("已打开邮件客户端，检查后发送即可。");
      }
      await bridgeOrFail().open({ kind: "mail", url: mailto.url });
    });
  }

  function sendDirectly() {
    return deliver(async (fresh) => {
      const noteText = stateRef.current.notes.trim();
      const result = await bridgeOrFail().send({
        includeLogTail: stateRef.current.includeLogTail,
        ...(noteText === "" ? {} : { notes: noteText }),
      });
      const where = fresh.delivery.mailboxName ? `到 ${fresh.delivery.mailboxName}` : "";
      const receipt = result?.receipt ? `（回执 ${result.receipt}）` : "";
      setNotice(`报告已发送${where}${receipt}，谢谢！`);
    });
  }

  function submitToIssue() {
    return deliver(async (fresh) => {
      const link = buildBugReportIssueUrl(fresh.report, { repository: fresh.delivery.repository });
      if (!link) {
        throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, `收件仓库不合法：${fresh.delivery.repository}`, { field: "repository" });
      }
      if (link.summarized) {
        await copyText(formatBugReportBody(fresh.report));
        setNotice("报告较长，完整内容已复制到剪贴板；在 issue 正文里粘贴即可。");
      } else {
        setNotice("已在浏览器中打开报告页面，提交前可以再改。");
      }
      await bridgeOrFail().open({ kind: "issue", url: link.url });
    });
  }

  function copyReport() {
    return deliver(async (fresh) => {
      await copyText(formatBugReportBody(fresh.report, letterOf(fresh.delivery)));
      setNotice("报告已复制，可以自己发到群里或邮件里。");
    });
  }

  function exportReport() {
    setBusy(true);
    setError("");
    setNotice("");
    const trimmed = notes.trim();
    return bridgeOrFail()
      .export(trimmed === "" ? {} : { notes: trimmed })
      .then((result) => {
        if (result.saved) setNotice(`已导出到 ${result.path}`);
      })
      .catch((cause) => setError(resolveFailure(cause, { fallback: "导出失败。" }).text))
      .finally(() => setBusy(false));
  }

  if (!open) return null;

  const report = preview?.report;
  const delivery = preview?.delivery;
  const hasChannel = Boolean(delivery?.mailbox || delivery?.repository);

  const dialog = (
    <SystemBarOverlay className="bug-report-overlay" role="presentation" onMouseDown={() => !busy && onClose?.()}>
      <section
        ref={dialogRef}
        className="bug-report-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={busy || undefined}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="bug-report-close" type="button" aria-label="关闭报告" title="关闭" disabled={busy} onClick={onClose}>
          <XIcon />
        </button>
        <h2 id={titleId}>报告问题</h2>
        <p id={descriptionId}>报告里只有版本、失败和你要带上的日志尾；发送前可以自己删改。</p>

        {report ? (
          <>
            <dl className="bug-report-summary">
              <div>
                <dt>版本</dt>
                <dd>{report.environment.appVersion} · {PLATFORM_LABELS[report.environment.platform] || report.environment.platform} · {report.environment.arch}</dd>
              </div>
              <div>
                <dt>上次会话</dt>
                <dd className={report.session.ended ? "" : "is-warning"}>
                  {report.session.ended ? "正常结束" : "异常结束（可能是崩溃）"}
                </dd>
              </div>
            </dl>

            <section className="bug-report-failures" aria-label="失败">
              <h3>失败（{report.failures.length}）</h3>
              {report.failures.length ? (
                <ul>
                  {report.failures.map((failure) => (
                    <li key={failure.code}>
                      <code>{failure.code}</code>
                      <span>{failure.message}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>没有记录到失败行。</p>
              )}
            </section>

            <label className="bug-report-toggle">
              <input type="checkbox" checked={includeLogTail} disabled={busy} onChange={toggleLogTail} />
              <span>附带最近的日志尾（已脱敏）</span>
            </label>

            <label className="bug-report-notes">
              <span>补充说明（可选）</span>
              <textarea
                rows={3}
                maxLength={2000}
                value={notes}
                disabled={busy}
                placeholder="当时在做什么？点了什么之后出现的？"
                onChange={(event) => setNotes(event.target.value)}
              />
            </label>
          </>
        ) : (
          <p className="bug-report-loading" role="status">{error ? "报告没准备好。" : "正在收集…"}</p>
        )}

        {report ? (
          <details className="bug-report-preview">
            <summary>查看将要发送的全文</summary>
            <pre>{formatBugReportBody(report, letterOf(delivery))}</pre>
          </details>
        ) : null}

        {error ? <p className="bug-report-error" role="alert">{error}</p> : null}
        {notice ? <p className="bug-report-notice" role="status">{notice}</p> : null}
        {report && !hasChannel ? (
          <p className="bug-report-hint">还没配置收件地址，先把报告复制或导出，再自己发到群里。</p>
        ) : null}

        <div className="bug-report-actions">
          {report && delivery?.relay ? (
            <button ref={primaryButtonRef} type="button" className="is-primary" disabled={busy} onClick={sendDirectly}>
              直接发送
            </button>
          ) : null}
          {report && delivery?.mailbox ? (
            <button
              ref={delivery.relay ? undefined : primaryButtonRef}
              type="button"
              className={delivery.relay ? undefined : "is-primary"}
              disabled={busy}
              onClick={sendByMail}
            >
              {delivery.mailboxName ? `发送到 ${delivery.mailboxName}` : "用邮件发送"}
            </button>
          ) : null}
          {report && delivery?.repository ? (
            <button type="button" disabled={busy} onClick={submitToIssue}>在 GitHub 提交</button>
          ) : null}
          {report ? (
            <button type="button" disabled={busy} onClick={copyReport}>
              <CopyIcon />
              <span>复制报告</span>
            </button>
          ) : null}
          {report ? (
            <button type="button" disabled={busy} onClick={exportReport}>
              <DownloadIcon />
              <span>导出文件</span>
            </button>
          ) : null}
          <button type="button" disabled={busy} onClick={() => onClose?.()}>关闭</button>
        </div>
      </section>
    </SystemBarOverlay>
  );

  const portalTarget = typeof document === "undefined" ? null : document.body;
  return portalTarget ? createPortal(dialog, portalTarget) : dialog;
}
