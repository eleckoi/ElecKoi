import { useProductTranslation } from "../../app/i18n/ProductLocaleContext.jsx";
import { SystemBarOverlay } from './SystemBarOverlay.jsx';
import React, { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

export function ConfirmationDialog({
  open,
  title,
  description,
  confirmLabel: confirmLabelSource,
  cancelLabel: cancelLabelSource,
  destructive = false,
  busy = false,
  onCancel,
  onConfirm,
}) {
  const tUi = useProductTranslation();
  const confirmLabel = confirmLabelSource === undefined ? tUi("确定") : confirmLabelSource;
  const cancelLabel = cancelLabelSource === undefined ? tUi("取消") : cancelLabelSource;
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef(null);
  const cancelRef = useRef(null);
  const busyRef = useRef(busy);
  const onCancelRef = useRef(onCancel);

  busyRef.current = busy;
  onCancelRef.current = onCancel;

  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;
    const previousFocus = document.activeElement;
    const focusFrame = window.requestAnimationFrame(() => cancelRef.current?.focus());

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!busyRef.current) onCancelRef.current?.();
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
  }, [open]);

  if (!open) return null;

  const dialog = (
    <SystemBarOverlay className="confirmation-overlay" role="presentation" onMouseDown={() => !busy && onCancel?.()}>
      <section
        ref={dialogRef}
        className="confirmation-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={busy || undefined}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id={titleId}>{title}</h2>
        <p id={descriptionId}>{description}</p>
        <div className="confirmation-actions">
          <button ref={cancelRef} type="button" disabled={busy} onClick={onCancel}>{cancelLabel}</button>
          <button
            type="button"
            className={destructive ? "is-destructive" : "is-primary"}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? tUi("处理中") : confirmLabel}
          </button>
        </div>
      </section>
    </SystemBarOverlay>
  );

  const portalTarget = typeof document === "undefined" ? null : document.body;
  return portalTarget ? createPortal(dialog, portalTarget) : dialog;
}
