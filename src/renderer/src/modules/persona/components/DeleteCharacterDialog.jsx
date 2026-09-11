import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

export function DeleteCharacterDialog({ character, deleting = false, error = "", returnFocus, onCancel, onConfirm }) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef(null);
  const cancelRef = useRef(null);
  const deletingRef = useRef(deleting);
  const onCancelRef = useRef(onCancel);

  deletingRef.current = deleting;
  onCancelRef.current = onCancel;

  useEffect(() => {
    cancelRef.current?.focus();

    function handleKeyDown(event) {
      if (event.key === "Escape" && !deletingRef.current) {
        event.preventDefault();
        onCancelRef.current();
        return;
      }

      if (event.key !== "Tab") return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll("button:not(:disabled)") || []);
      if (!focusable.length) return;
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
      if (returnFocus?.isConnected) returnFocus.focus();
    };
  }, [returnFocus]);

  return createPortal(
    <div className="character-delete-overlay" role="presentation" onMouseDown={() => !deleting && onCancel()}>
      <section
        ref={dialogRef}
        className="character-delete-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={deleting}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id={titleId}>删除“{character.name}”？</h2>
        <p id={descriptionId}>角色及其对话记录将被永久删除。</p>
        {error ? <span className="character-delete-error" role="alert">{error}</span> : null}
        <div className="character-delete-actions">
          <button ref={cancelRef} type="button" disabled={deleting} onClick={onCancel}>取消</button>
          <button type="button" className="is-danger" disabled={deleting} onClick={onConfirm}>
            {deleting ? "删除中" : "删除角色"}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
