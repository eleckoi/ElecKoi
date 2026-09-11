import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

export function UnsavedChangesDialog({
  open,
  title,
  description,
  error = "",
  saving = false,
  saveLabel = "保存",
  discardLabel = "不保存",
  cancelLabel = "取消",
  onCancel,
  onDiscard,
  onSave,
}) {
  const titleId = useId();
  const descriptionId = useId();
  const errorId = useId();
  const dialogRef = useRef(null);
  const cancelRef = useRef(null);
  const savingRef = useRef(saving);
  const onCancelRef = useRef(onCancel);

  savingRef.current = saving;
  onCancelRef.current = onCancel;

  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;
    const previousFocus = document.activeElement;
    const focusFrame = window.requestAnimationFrame(() => cancelRef.current?.focus());

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!savingRef.current) onCancelRef.current?.();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll("button:not(:disabled)") || []);
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

  if (!open) return null;

  const dialog = (
    <div className="unsaved-changes-overlay" role="presentation" onMouseDown={() => !saving && onCancel?.()}>
      <section
        ref={dialogRef}
        className="unsaved-changes-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={`${descriptionId}${error ? ` ${errorId}` : ""}`}
        aria-busy={saving || undefined}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id={titleId}>{title}</h2>
        <p id={descriptionId}>{description}</p>
        {error ? <p id={errorId} className="unsaved-changes-error" role="alert">{error}</p> : null}
        <div className="unsaved-changes-actions">
          <button type="button" className="is-primary" disabled={saving} onClick={onSave}>
            {saving ? "保存中" : saveLabel}
          </button>
          <button type="button" disabled={saving} onClick={onDiscard}>{discardLabel}</button>
          <button ref={cancelRef} type="button" disabled={saving} onClick={onCancel}>{cancelLabel}</button>
        </div>
      </section>
    </div>
  );

  const portalTarget = typeof document === "undefined" ? null : document.body;
  return portalTarget ? createPortal(dialog, portalTarget) : dialog;
}
