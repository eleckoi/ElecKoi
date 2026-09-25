import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { assetSrc } from "../../app/services/assets.js";

export function AvatarPreviewDialog({ src, name, onClose }) {
  const closeRef = useRef(null);
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
        event.preventDefault();
        closeRef.current?.focus();
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
    <div className="avatar-preview-backdrop" onPointerDown={(event) => {
      if (event.target === event.currentTarget) onClose?.();
    }}>
      <div className="avatar-preview-dialog" role="dialog" aria-modal="true" aria-label={`${name || "角色"}的头像预览`}>
        {failed ? <p className="avatar-preview-error">头像无法加载</p> : <img className="avatar-preview-image" src={assetSrc(src)} alt={`${name || "角色"}的头像`} onError={() => setFailed(true)} />}
        <button ref={closeRef} type="button" className="avatar-preview-close" onClick={onClose} aria-label="关闭头像预览"><span aria-hidden="true">×</span>关闭</button>
      </div>
    </div>,
    document.body,
  );
}
