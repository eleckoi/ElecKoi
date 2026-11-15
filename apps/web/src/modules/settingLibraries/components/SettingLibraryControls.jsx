import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { ConfirmationDialog as ProductConfirmationDialog } from '../../../ui/ui/ConfirmationDialog.jsx';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { useEffect, useState } from "react";
import { CheckCircle, CircleNotch, FloppyDisk, WarningCircle } from "@phosphor-icons/react";
import { useEditorPresentation, useEditorSaveFeedback } from '../../../ui/ui/EditorPresentationContext.jsx';
import { AppErrorDialog } from '../../../ui/ui/AppErrorDialog.jsx';

export function ConfirmationDialog({ target, cancelLabel, confirmLabel, tone = 'primary', onCancel, onConfirm }) {
  return <ProductConfirmationDialog open={Boolean(target)} title={target?.title || ''} description={target?.message || ''}
    cancelLabel={cancelLabel} confirmLabel={confirmLabel} destructive={tone === 'destructive'} onCancel={onCancel} onConfirm={onConfirm} />;
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
