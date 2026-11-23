import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import { ELECKOI_FAILURE_CODES } from "@shared/contracts/errors/codes";
import { DesktopError } from "@shared/foundation/DesktopError";
import '../../../ui/styles/product-dialogs.css';
import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle, WarningCircle } from "../../../ui/icons/interfaceIcons.jsx";
import { ImportIcon } from "../../../ui/icons/index.jsx";
import { ImportSourceList } from "../../../ui/ui/ImportSourceList.jsx";
import { bestEffort } from "../../../utils/swallowedFailure.js";
import { resolveFailure } from "../../../utils/failureText.js";
import { CharacterTransferDialog } from "./CharacterTransferDialog.jsx";

const SOURCES = [
  { id: "eleckoi", title: "本项目角色卡", detail: "导入 ElecKoi 导出的角色卡" },
  { id: "sillytavern", title: "酒馆角色卡", detail: "导入 SillyTavern 角色卡并转换" },
];

export function CharacterImportDialog({ onClose, onImported, onPrepare, onDiscard }) {
  const tUi = useProductTranslation();
  const inputRef = useRef(null);
  const sourceRef = useRef("");
  const [preview, setPreview] = useState(null);
  const [files, setFiles] = useState([]);
  const [previewUrls, setPreviewUrls] = useState([]);
  const [readingFiles, setReadingFiles] = useState(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");

  const close = useCallback(async () => {
    if (preview?.token) await onDiscard(preview.token).catch(bestEffort);
    onClose();
  }, [onClose, onDiscard, preview?.token]);

  useEffect(() => {
    const urls = files.map((file) => file.type === "image/png" || file.name.toLowerCase().endsWith(".png") ? URL.createObjectURL(file) : "");
    setPreviewUrls(urls);
    return () => urls.filter(Boolean).forEach(URL.revokeObjectURL);
  }, [files]);

  function chooseSource(source) {
    sourceRef.current = source;
    setError("");
    inputRef.current?.click();
  }

  async function onFilesPicked(event) {
    const selected = [...(event.target.files || [])];
    event.target.value = "";
    if (!selected.length) return;
    const source = sourceRef.current;
    setReadingFiles(selected);
    setError("");
    try {
      const payloads = await Promise.all(selected.map(async (file) => ({
        displayName: file.name,
        mimeType: file.type,
        base64: await fileBase64(file),
      })));
      const next = await onPrepare(source, payloads);
      setFiles(selected);
      setPreview(next);
    } catch (caught) {
      setError(resolveFailure(caught, { fallback: tUi("角色卡无法读取") }).text);
    } finally {
      setReadingFiles(null);
    }
  }

  async function confirmImport() {
    if (!preview?.token || importing) return;
    setImporting(true);
    setError("");
    try {
      await onImported(preview.token);
      onClose();
    } catch (caught) {
      setError(resolveFailure(caught, { fallback: tUi("导入失败") }).text);
    } finally {
      setImporting(false);
    }
  }

  if (readingFiles) return <CharacterTransferDialog phase="reading" names={readingFiles.map(file => file.name)} />;
  if (importing) return <CharacterTransferDialog phase="importing" names={preview.items.flatMap((item, index) =>
    item.importable ? [files[index]?.name || item.name] : [])} />;

  const importableCount = preview?.items.filter((item) => item.importable).length || 0;

  return (
    <Modal open title={preview ? tUi('导入角色卡') : tUi('选择导入来源')} closeLabel={tUi('关闭')}
      onClose={() => void close()} className="product-dialog character-import-modal" contentClassName="product-dialog-content"
      footer={preview ? <div className="product-dialog-actions"><Button variant="outline" onClick={close}>{tUi('取消')}</Button><Button variant="primary" onClick={confirmImport} disabled={!importableCount}>{tUi('导入{value0}', {value0: importableCount ? ` ${importableCount}` : ''})}</Button></div> : undefined}>
        {preview ? (
          <div className="character-import-preview-list">
            {preview.items.map((item, index) => (
              <div className={`character-import-preview-item ${item.importable ? "" : "is-error"}`} key={item.id}>
                <div className="character-import-preview-image">
                  {item.imageAvailable && previewUrls[index] ? <img src={previewUrls[index]} alt="" /> : <ImportIcon size={20} />}
                </div>
                <div className="character-import-preview-copy">
                  <strong>{item.name}</strong>
                  <span>{item.errorMessage || item.summary}</span>
                  {item.warnings?.map((warning, warningIndex) => (
                    <span className="character-import-warning" key={warningIndex}>{warning}</span>
                  ))}
                </div>
                {item.importable ? <CheckCircle size={20} /> : <WarningCircle size={20} />}
              </div>
            ))}
          </div>
        ) : (
          <ImportSourceList sources={SOURCES} onSelect={chooseSource} />
        )}

        {error ? <p className="character-import-error" role="alert">{error}</p> : null}
        <input ref={inputRef} type="file" accept="image/png,application/json,application/zip,.png,.json,.zip" multiple hidden onChange={onFilesPicked} />
    </Modal>
  );
}

function fileBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || "").split(",", 2)[1] || "");
    reader.onerror = () => reject(new DesktopError(ELECKOI_FAILURE_CODES.ioFailed, `${file.name} 无法读取`, { operation: "read", path: file.name }));
    reader.readAsDataURL(file);
  });
}
