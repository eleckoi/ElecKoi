import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { SystemBarOverlay } from '../../../ui/ui/SystemBarOverlay.jsx';
import { useRef, useState } from "react";
import { PaletteIcon, PictureFrameIcon, RestoreDefaultIcon, XIcon } from "../../../ui/icons/index.jsx";
import { createAppearanceThemeFromFile } from "../theme/appearanceTheme.js";

export function ThemePaletteModal({ open, theme, onClose, onApply, onReset, onNotify }) {
  const tUi = useProductTranslation();
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  if (!open) return null;

  async function handleFile(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      onNotify?.("error", tUi("请选择图片文件。"));
      return;
    }

    try {
      setBusy(true);
      const nextTheme = await createAppearanceThemeFromFile(file);
      await onApply(nextTheme);
      onNotify?.("success", tUi("调色盘已应用。"));
    } catch (error) {
      onNotify?.("error", error?.message || tUi("调色失败，请换张图片试试。"));
    } finally {
      setBusy(false);
      setDragging(false);
    }
  }

  function pickFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    handleFile(file);
  }

  function dropFile(event) {
    event.preventDefault();
    handleFile(event.dataTransfer.files?.[0]);
  }

  const hasTheme = Boolean(theme?.colors);

  return (
    <SystemBarOverlay className="theme-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="theme-modal"
        role="dialog"
        aria-modal="true"
        aria-label={tUi("超级调色盘")}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="theme-modal-titlebar">
          <div>
            <PaletteIcon />
            <strong>{tUi("超级调色盘")}</strong>
          </div>
          <button type="button" title={tUi("关闭")} aria-label={tUi("关闭")} onClick={onClose}>
            <XIcon />
          </button>
        </header>

        <div
            className={`theme-modal-stage ${dragging ? "dragging" : ""}`}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={dropFile}
          >
            <div className="theme-preview-card">
              <div className="theme-preview-window">
                <div className="theme-preview-rail" />
                <div className="theme-preview-list">
                  <span />
                  <span />
                  <span className="active" />
                  <span />
                </div>
                <div className="theme-preview-chat">
                  <span className="theme-preview-desktop-bubble" />
                  <span className="theme-preview-desktop-bubble" />
                  <b className="theme-preview-desktop-bubble" />
                </div>
              </div>
            </div>

            <div className="theme-control-column" aria-label={tUi("调色盘操作")}>
              <button className="theme-control-button restore" type="button" onClick={onReset}>
                <RestoreDefaultIcon />
                <span>{tUi("恢复默认")}</span>
              </button>
              <button className="theme-control-button" type="button" title={hasTheme ? tUi("重新选择取色图片") : tUi("上传取色图片")} aria-label={hasTheme ? tUi("重新选择取色图片") : tUi("上传取色图片")} onClick={() => inputRef.current?.click()}>
                {busy ? <span className="theme-upload-spinner" /> : <PictureFrameIcon />}
                <span>{hasTheme ? tUi("重新取色") : tUi("上传取色图片")}</span>
              </button>
            </div>
            <input ref={inputRef} className="theme-file-input" type="file" accept="image/*" onChange={pickFile} />
        </div>
      </section>
    </SystemBarOverlay>
  );
}
