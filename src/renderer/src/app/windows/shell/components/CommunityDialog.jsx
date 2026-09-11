import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { CopyIcon, XIcon } from "../../../../ui/icons/index.jsx";
import { ELECKOI_QQ_GROUP_NUMBER } from "@shared/foundation/community";

export function CommunityDialog({ open, onClose, onNotify }) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef(null);
  const primaryButtonRef = useRef(null);
  const onCloseRef = useRef(onClose);

  onCloseRef.current = onClose;

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

  async function copyGroupNumber(message = "群号已复制") {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(ELECKOI_QQ_GROUP_NUMBER);
      onNotify?.("success", message);
      return true;
    } catch {
      onNotify?.("error", `复制失败，请手动复制群号 ${ELECKOI_QQ_GROUP_NUMBER}`);
      return false;
    }
  }

  const dialog = (
    <div className="community-dialog-overlay" role="presentation" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        className="community-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="community-dialog-close" type="button" aria-label="关闭社区指引" title="关闭" onClick={onClose}>
          <XIcon />
        </button>
        <div className="community-dialog-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <circle cx="9" cy="8" r="3.15" />
            <path d="M3.4 19.4c.55-3.72 2.42-5.58 5.6-5.58s5.05 1.86 5.6 5.58" />
            <path d="M14.6 5.45a3 3 0 0 1 0 5.1" />
            <path d="M16.15 13.7c2.55.42 4 2.32 4.45 5.7" />
          </svg>
        </div>
        <h2 id={titleId}>ElecKoi测试群</h2>
        <p id={descriptionId}>交流使用体验与问题反馈</p>
        <div className="community-dialog-group-number">
          <span>QQ群</span>
          <strong>{ELECKOI_QQ_GROUP_NUMBER}</strong>
        </div>
        <div className="community-dialog-actions">
          <button ref={primaryButtonRef} type="button" className="is-primary" onClick={() => copyGroupNumber()}>
            <CopyIcon />
            <span>复制群号</span>
          </button>
        </div>
      </section>
    </div>
  );

  const portalTarget = typeof document === "undefined" ? null : document.body;
  return portalTarget ? createPortal(dialog, portalTarget) : dialog;
}
