import { useEffect, useId, useRef } from "react";
import { CheckCircle, CircleNotch, FloppyDisk, WarningCircle } from "@phosphor-icons/react";

export function ConfirmationDialog({ target, cancelLabel = "取消", confirmLabel = "确定", tone = "primary", onCancel, onConfirm }) {
  const titleId = useId();
  const messageId = useId();
  const dialogRef = useRef(null);
  const cancelRef = useRef(null);
  const previousFocusRef = useRef(null);

  useEffect(() => {
    if (!target) return undefined;
    previousFocusRef.current = document.activeElement;
    cancelRef.current?.focus();
    return () => previousFocusRef.current?.focus?.();
  }, [target]);

  if (!target) return null;

  function handleKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== "Tab") return;
    const controls = [...(dialogRef.current?.querySelectorAll("button:not(:disabled)") || [])];
    if (!controls.length) return;
    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="setting-library-dialog-overlay" role="presentation" onMouseDown={onCancel}>
      <section ref={dialogRef} className="setting-library-dialog" role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={messageId} onKeyDown={handleKeyDown} onMouseDown={(event) => event.stopPropagation()}>
        <h2 id={titleId}>{target.title}</h2>
        <p id={messageId}>{target.message}</p>
        <div>
          <button ref={cancelRef} type="button" onClick={onCancel}>{cancelLabel}</button>
          <button type="button" className={tone === "destructive" ? "is-destructive" : "is-primary"} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </section>
    </div>
  );
}

export function SaveControl({ dirty, error, notice, saving, onSave }) {
  return (
    <div className="setting-library-save-control">
      <button
        type="button"
        className={`setting-library-save-button${saving ? " is-saving" : ""}`}
        title="保存（Ctrl/Command + S）"
        aria-keyshortcuts="Control+S Meta+S"
        disabled={!dirty || saving}
        onClick={onSave}
      >
        {saving ? <CircleNotch size={16} aria-hidden="true" /> : <FloppyDisk size={16} aria-hidden="true" />}
        {saving ? "保存中…" : "保存"}
      </button>
      {error ? <span className="setting-library-save-feedback is-error" role="alert" title={error}><WarningCircle size={14} />保存失败</span> : null}
      {!error && notice === "saved" ? <span className="setting-library-save-feedback is-saved" role="status"><CheckCircle size={14} />已保存</span> : null}
    </div>
  );
}
