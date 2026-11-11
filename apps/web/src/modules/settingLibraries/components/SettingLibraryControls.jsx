import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { SystemBarOverlay } from '../../../ui/ui/SystemBarOverlay.jsx';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { useEffect, useId, useRef, useState } from "react";
import { CheckCircle, CircleNotch, FloppyDisk, WarningCircle } from "@phosphor-icons/react";
import { useEditorPresentation, useEditorSaveFeedback } from '../../../ui/ui/EditorPresentationContext.jsx';
import { AppErrorDialog } from '../../../ui/ui/AppErrorDialog.jsx';

export function ConfirmationDialog({ target, cancelLabel: cancelLabelSource, confirmLabel: confirmLabelSource, tone = "primary", onCancel, onConfirm }) {
  const tUi = useProductTranslation();
  const cancelLabel = cancelLabelSource === undefined ? tUi("取消") : cancelLabelSource;
  const confirmLabel = confirmLabelSource === undefined ? tUi("确定") : confirmLabelSource;
  const titleId = useId();
  const messageId = useId();
  const dialogRef = useRef(null);
  const cancelRef = useRef(null);
  const previousFocusRef = useRef(null);

  useEffect(() => {
    if (!target) return undefined;
    previousFocusRef.current = document.activeElement;
    cancelRef.current?.focus();
    return () => previousFocusRef.current?.focus?.();
  }, [target]);

  if (!target) return null;

  function handleKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== "Tab") return;
    const controls = [...(dialogRef.current?.querySelectorAll("button:not(:disabled)") || [])];
    if (!controls.length) return;
    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <SystemBarOverlay className="setting-library-dialog-overlay" role="presentation" onMouseDown={onCancel}>
      <section ref={dialogRef} className="setting-library-dialog" role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={messageId} onKeyDown={handleKeyDown} onMouseDown={(event) => event.stopPropagation()}>
        <h2 id={titleId}>{target.title}</h2>
        <p id={messageId}>{target.message}</p>
        <div>
          <Button data-dsh-control ref={cancelRef} type="button" variant="outline" onClick={onCancel}>{cancelLabel}</Button>
          <Button data-dsh-control type="button" variant="primary" className={tone === "destructive" ? "is-destructive" : undefined} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </section>
    </SystemBarOverlay>
  );
}

export function SaveControl({ dirty, error, notice, saving, onSave, workspace = false, title }) {
  const tUi = useProductTranslation();
  const { compact } = useEditorPresentation();
  const inHeader = useEditorSaveFeedback(error, notice);
  const [errorOpen, setErrorOpen] = useState(false);
  useEffect(() => setErrorOpen(false), [error]);
  if (inHeader) return null;
  return (
    <div className="setting-library-save-control">
      <Button data-dsh-control variant={workspace && !dirty ? 'outline' : 'primary'}
        icon={workspace ? saving ? <CircleNotch size={15} aria-hidden="true" /> : <FloppyDisk size={15} aria-hidden="true" /> : undefined}
        type="button"
        className={`setting-library-save-button${workspace ? ' setting-document-save' : ''}${saving ? " is-saving" : ""}`}
        title={title || (workspace ? tUi('统一保存设定库的全部修改') : tUi("保存（Ctrl/Command + S）"))}
        aria-keyshortcuts="Control+S Meta+S"
        disabled={!dirty || saving}
        onClick={onSave}
      >
        {!workspace && (saving ? <CircleNotch size={16} aria-hidden="true" /> : <FloppyDisk size={16} aria-hidden="true" />)}
        {saving ? tUi("保存中…") : tUi("保存")}
      </Button>
      {error ? <span className="setting-library-save-feedback is-error" role="alert" title={error}>
        {compact ? <><WarningCircle size={14} />{error}</> : <button type="button" className="setting-library-error-detail-button" aria-label={tUi("查看保存错误")} onClick={() => setErrorOpen(true)}><WarningCircle size={14} />{tUi("保存失败")}</button>}
      </span> : null}
      {!error && notice === "saved" ? <span className="setting-library-save-feedback is-saved" role="status"><CheckCircle size={14} />{tUi("已保存")}</span> : null}
      {error && errorOpen ? <AppErrorDialog notice={{ id: error, message: error }} onDismiss={() => setErrorOpen(false)} /> : null}
    </div>
  );
}
