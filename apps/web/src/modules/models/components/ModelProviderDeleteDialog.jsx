import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { SystemBarOverlay } from '../../../ui/ui/SystemBarOverlay.jsx';
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { FailureAlert } from "../../../ui/ui/FailureAlert.jsx";

export function ModelProviderDeleteDialog({ target, deleting = false, error = null, onCancel, onConfirm }) {
  const tUi = useProductTranslation();
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef(null);
  const cancelRef = useRef(null);
  const deletingRef = useRef(deleting);
  const onCancelRef = useRef(onCancel);

  deletingRef.current = deleting;
  onCancelRef.current = onCancel;

  useEffect(() => {
    if (!target) return undefined;
    cancelRef.current?.focus();

    function handleKeyDown(event) {
      if (event.key === "Escape" && !deletingRef.current) {
        event.preventDefault();
        onCancelRef.current();
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
      window.removeEventListener("keydown", handleKeyDown);
      target.returnFocus?.focus?.();
    };
  }, [target]);

  if (!target) return null;

  const consequence = target.id === 'deepseek-official'
    ? tUi("清空此内置配置的密钥和自定义参数，恢复提供商默认设置。")
    : tUi("这份配置将被删除。");

  return createPortal(
    <SystemBarOverlay className="model-provider-delete-overlay" role="presentation" onMouseDown={() => !deleting && onCancel()}>
      <section
        ref={dialogRef}
        className="model-provider-delete-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={deleting || undefined}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id={titleId}>{target.id === 'deepseek-official' ? tUi("清空") : tUi("删除")}“{target.label}”？</h2>
        <p id={descriptionId}>
          {consequence}{target.hasUnsavedChanges ? tUi(" 未保存的修改也会丢失。") : ""}
        </p>
        <FailureAlert failure={error} className="model-provider-delete-error" />
        <div>
          <button ref={cancelRef} type="button" disabled={deleting} onClick={onCancel}>{tUi("取消")}</button>
          <button type="button" className="danger" disabled={deleting} onClick={onConfirm}>
            {deleting ? tUi("删除中…") : target.id === 'deepseek-official' ? tUi("清空配置") : tUi("删除配置")}
          </button>
        </div>
      </section>
    </SystemBarOverlay>,
    document.body,
  );
}
