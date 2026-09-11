import { useCallback, useEffect, useRef, useState } from "react";
import { CaretRight, CheckCircle, WarningCircle } from "@phosphor-icons/react";
import { ImportIcon, XIcon } from "../../../ui/icons/index.jsx";
import { discardCharacterImports, prepareCharacterImports } from "../api/personaApi.js";

const SOURCES = [
  { id: "eleckoi", title: "本项目角色卡", detail: "导入 ElecKoi 导出的角色卡" },
  { id: "sillytavern", title: "酒馆角色卡", detail: "导入 SillyTavern 角色卡并转换" },
];

export function CharacterImportDialog({ onClose, onImported }) {
  const inputRef = useRef(null);
  const sourceRef = useRef("");
  const [preview, setPreview] = useState(null);
  const [files, setFiles] = useState([]);
  const [previewUrls, setPreviewUrls] = useState([]);
  const [preparing, setPreparing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");

  const close = useCallback(async () => {
    if (preview?.token) await discardCharacterImports(preview.token).catch(() => {});
    onClose();
  }, [onClose, preview?.token]);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === "Escape" && !preparing && !importing) close();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close, preparing, importing]);

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
    setPreparing(true);
    setError("");
    try {
      if (selected.length > 50) throw new Error("一次最多导入 50 张角色卡");
      const oversized = selected.find((file) => file.size > 64 * 1024 * 1024);
      if (oversized) throw new Error(`${oversized.name} 超过 64 MB`);
      const payloads = await Promise.all(selected.map(async (file) => ({
        displayName: file.name,
        mimeType: file.type,
        base64: await fileBase64(file),
      })));
      const next = await prepareCharacterImports(sourceRef.current, payloads);
      setFiles(selected);
      setPreview(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "角色卡无法读取");
    } finally {
      setPreparing(false);
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
      setError(caught instanceof Error ? caught.message : "导入失败");
    } finally {
      setImporting(false);
    }
  }

  const importableCount = preview?.items.filter((item) => item.importable).length || 0;

  return (
    <div className="character-import-overlay" onMouseDown={() => !preparing && !importing && close()}>
      <section className="character-import-dialog" role="dialog" aria-modal="true" aria-labelledby="character-import-title" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <h2 id="character-import-title">{preview ? "导入角色卡" : "选择导入来源"}</h2>
          <button type="button" aria-label="关闭" onClick={close} disabled={preparing || importing}><XIcon /></button>
        </header>

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
                </div>
                {item.importable ? <CheckCircle size={20} /> : <WarningCircle size={20} />}
              </div>
            ))}
          </div>
        ) : (
          <div className="character-import-source-list">
            {SOURCES.map((source) => (
              <button type="button" key={source.id} onClick={() => chooseSource(source.id)} disabled={preparing}>
                <ImportIcon size={22} />
                <span><strong>{source.title}</strong><small>{source.detail}</small></span>
                <CaretRight size={17} />
              </button>
            ))}
          </div>
        )}

        {error ? <p className="character-import-error" role="alert">{error}</p> : null}
        {preview ? (
          <footer>
            <button type="button" onClick={close} disabled={importing}>取消</button>
            <button className="primary" type="button" onClick={confirmImport} disabled={!importableCount || importing}>
              {importing ? "导入中…" : `导入${importableCount ? ` ${importableCount}` : ""}`}
            </button>
          </footer>
        ) : null}
        {preparing ? <div className="character-import-busy">正在读取角色卡…</div> : null}
        <input ref={inputRef} type="file" accept="image/png,application/json,.png,.json" multiple hidden onChange={onFilesPicked} />
      </section>
    </div>
  );
}

function fileBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || "").split(",", 2)[1] || "");
    reader.onerror = () => reject(new Error(`${file.name} 无法读取`));
    reader.readAsDataURL(file);
  });
}
