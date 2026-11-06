import { useProductTranslation } from "../../app/i18n/ProductLocaleContext.jsx";
import { SystemBarOverlay } from '../ui/SystemBarOverlay.jsx';
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { assetSrc } from "../../app/services/assets.js";

export function AvatarPreviewDialog({ src, name, onClose, onPin }) {
  const tUi = useProductTranslation();
  const closeRef = useRef(null);
  const pinRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const [failed, setFailed] = useState(false);
  onCloseRef.current = onClose;

  useEffect(() => {
    setFailed(false);
  }, [src]);

  useEffect(() => {
    const previousFocus = document.activeElement;
    closeRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current?.();
      } else if (event.key === "Tab") {
        if (!onPin) {
          event.preventDefault();
          closeRef.current?.focus();
        } else if (event.shiftKey && document.activeElement === pinRef.current) {
          event.preventDefault();
          closeRef.current?.focus();
        } else if (!event.shiftKey && document.activeElement === closeRef.current) {
          event.preventDefault();
          pinRef.current?.focus();
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    <SystemBarOverlay className="avatar-preview-backdrop" onPointerDown={(event) => {
      if (event.target === event.currentTarget) onClose?.();
    }}>
      <div className="avatar-preview-dialog" role="dialog" aria-modal="true" aria-label={tUi("{value0}的头像预览", {value0: name || tUi("角色")})}>
        {failed ? <p className="avatar-preview-error">{tUi("头像无法加载")}</p> : <img className="avatar-preview-image" src={assetSrc(src)} alt={tUi("{value0}的头像", {value0: name || tUi("角色")})} onError={() => setFailed(true)} />}
        <div className="avatar-preview-actions">
          {onPin ? <button ref={pinRef} type="button" className="avatar-preview-pin" onClick={onPin}>{tUi("固定在聊天中")}</button> : null}
          <button ref={closeRef} type="button" className="avatar-preview-close" onClick={onClose} aria-label={tUi("关闭头像预览")}><span aria-hidden="true">×</span>{tUi("关闭")}</button>
        </div>
      </div>
    </SystemBarOverlay>,
    document.body,
  );
}
