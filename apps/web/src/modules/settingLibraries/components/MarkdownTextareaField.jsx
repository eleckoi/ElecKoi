import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { OfficialMarkdown } from "../../../ui/messages/OfficialMarkdown.jsx";
import { CornersOut, Eye, PencilSimple } from "../../../ui/icons/interfaceIcons.jsx";
import { EditorTextInput } from '../../../ui/ui/EditorTextInput.jsx';
import { useEditorPresentation } from '../../../ui/ui/EditorPresentationContext.jsx';
import { ImmersiveMarkdownEditor } from './ImmersiveMarkdownEditor.jsx';

export function MarkdownTextareaField({ label, value, placeholder, onChange, preview = true, labelAction = null, disabled = false, readOnly = false, code = false, textareaClassName = '', toolbarHost = null, immersiveHost = null, fullWidth = false }) {
  const tUi = useProductTranslation();
  const { compact } = useEditorPresentation();
  const inputId = useId();
  const editorRef = useRef(null);
  const [immersive, setImmersive] = useState(false);
  const [mode, setMode] = useState("edit");
  const closeImmersive = useCallback(() => setImmersive(false), []);
  const editorClassName = [code ? 'is-code' : '', textareaClassName].filter(Boolean).join(' ') || undefined;

  useEffect(() => {
    if (!immersive) return undefined;
    const focusFrame = requestAnimationFrame(() => {
      const editor = editorRef.current;
      if (!compact) editor?.focus();
      editor?.setSelectionRange(editor.value.length, editor.value.length);
    });
    return () => cancelAnimationFrame(focusFrame);
  }, [compact, immersive]);

  const tabs = preview && <div className="immersive-markdown-tabs" role="tablist" aria-label={tUi("编辑模式")}>
    <button type="button" role="tab" aria-selected={mode === "edit"} onClick={() => setMode("edit")}><PencilSimple size={15} />{tUi("编辑")}</button>
    <button type="button" role="tab" aria-selected={mode === "preview"} onClick={() => setMode("preview")}><Eye size={15} />{tUi("预览")}</button>
  </div>;

  const immersiveAction = <button type="button" disabled={disabled || readOnly} onClick={() => { setMode('edit'); setImmersive(true); }}><CornersOut size={14} />{tUi('沉浸编辑')}</button>;
  const fieldActions = <div className="setting-library-content-actions">
    {immersiveHost ? createPortal(immersiveAction, immersiveHost) : immersiveAction}{labelAction}
  </div>;
  return (
    <>
      <div className="setting-library-content-field">
        <div className="setting-library-content-heading">
          <label htmlFor={inputId} onClick={() => editorRef.current?.focus()}>{label}</label>
          {toolbarHost ? createPortal(fieldActions, toolbarHost) : fieldActions}
        </div>
        {!immersive && <EditorTextInput ref={editorRef} id={inputId} label={label} className={editorClassName} value={value} placeholder={placeholder} disabled={disabled} readOnly={readOnly} code={code} onChange={onChange} />}
      </div>
      {immersive && <ImmersiveMarkdownEditor label={label} onClose={closeImmersive} tabs={tabs} fullWidth={fullWidth}>
        {!compact && mode === 'preview' && preview ? <article className="immersive-markdown-preview">
          {value.trim() ? <OfficialMarkdown content={value} /> : <p className="is-empty">{tUi('暂无内容')}</p>}
        </article> : <EditorTextInput ref={editorRef} label={label} className={editorClassName} value={value}
          placeholder={placeholder} disabled={disabled} readOnly={readOnly} code={code} onChange={onChange} />}
      </ImmersiveMarkdownEditor>}
    </>
  );
}
