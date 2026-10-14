import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { OfficialMarkdown } from "../../../ui/messages/OfficialMarkdown.jsx";
import { CornersIn, CornersOut, Eye, PencilSimple } from "../../../ui/icons/interfaceIcons.jsx";
import { useEditorPresentation } from '../../../ui/ui/EditorPresentationContext.jsx';

export function MarkdownTextareaField({ label, value, placeholder, onChange, preview = true, labelAction = null }) {
  const { autoFocusInputs = true } = useEditorPresentation();
  const inputId = useId();
  const editorRef = useRef(null);
  const [immersive, setImmersive] = useState(false);
  const [mode, setMode] = useState("edit");

  useEffect(() => {
    if (!immersive) return undefined;
    document.documentElement.classList.add("immersive-editor-open");
    setMode("edit");
    const focusFrame = requestAnimationFrame(() => {
      const editor = editorRef.current;
      if (autoFocusInputs) editor?.focus();
      editor?.setSelectionRange(editor.value.length, editor.value.length);
    });
    const closeOnEscape = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setImmersive(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", closeOnEscape);
      document.documentElement.classList.remove("immersive-editor-open");
    };
  }, [immersive, autoFocusInputs]);

  const overlayHost = immersive
    ? document.querySelector(".qq-character-editor-window-shell") || document.body
    : null;

  const overlay = immersive && overlayHost ? createPortal(
    <section className="immersive-markdown-editor" role="dialog" aria-modal="true" aria-labelledby={`${inputId}-title`}>
      <header className="immersive-markdown-header">
        <strong id={`${inputId}-title`}>{label}</strong>
        <div className="immersive-markdown-actions">
          {preview ? (
            <div className="immersive-markdown-tabs" role="tablist" aria-label="编辑模式">
              <button type="button" role="tab" aria-selected={mode === "edit"} onClick={() => setMode("edit")}><PencilSimple size={15} />编辑</button>
              <button type="button" role="tab" aria-selected={mode === "preview"} onClick={() => setMode("preview")}><Eye size={15} />预览</button>
            </div>
          ) : null}
          <button type="button" className="immersive-markdown-exit" onClick={() => setImmersive(false)}><CornersIn size={15} />退出沉浸</button>
        </div>
      </header>
      <div className="immersive-markdown-body">
        {mode === "preview" && preview ? (
          <article className="immersive-markdown-preview">
            {value.trim() ? <OfficialMarkdown content={value} /> : <p className="is-empty">暂无内容</p>}
          </article>
        ) : (
          <textarea
            ref={editorRef}
            value={value}
            placeholder={placeholder}
            spellCheck={false}
            onChange={(event) => onChange(event.target.value)}
          />
        )}
      </div>
    </section>,
    overlayHost,
  ) : null;

  return (
    <>
      <div className="setting-library-content-field">
        <div className="setting-library-content-heading">
          <label htmlFor={inputId}>{label}</label>
          <div className="setting-library-content-actions">
            <button type="button" onClick={() => setImmersive(true)}><CornersOut size={14} />沉浸编辑</button>
            {labelAction}
          </div>
        </div>
        <textarea id={inputId} value={value} placeholder={placeholder} spellCheck={false} onChange={(event) => onChange(event.target.value)} />
      </div>
      {overlay}
    </>
  );
}
