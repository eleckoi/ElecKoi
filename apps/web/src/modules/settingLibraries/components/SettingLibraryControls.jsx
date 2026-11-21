import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { ConfirmationDialog as ProductConfirmationDialog } from '../../../ui/ui/ConfirmationDialog.jsx';
import { Button, Menu } from '@deepseek-ai/dsh-client-ui-primitives';
import { useEffect, useState } from "react";
import { CheckCircle, CircleNotch, FloppyDisk, WarningCircle } from "@phosphor-icons/react";
import { useEditorPresentation, useEditorSaveFeedback } from '../../../ui/ui/EditorPresentationContext.jsx';
import { AppErrorDialog } from '../../../ui/ui/AppErrorDialog.jsx';
import { ListChecks, SlidersHorizontal } from '../../../ui/icons/interfaceIcons.jsx';
import { ImportIcon } from '../../../ui/icons/index.jsx';

export function ConfirmationDialog({ target, cancelLabel, confirmLabel, tone = 'primary', onCancel, onConfirm }) {
  return <ProductConfirmationDialog open={Boolean(target)} title={target?.title || ''} description={target?.message || ''}
    cancelLabel={cancelLabel} confirmLabel={confirmLabel} destructive={tone === 'destructive'} onCancel={onCancel} onConfirm={onConfirm} />;
}

export function SettingLibraryImportMenu({ label, disabled, items, onSelect }) {
  const tUi = useProductTranslation();
  const [open, setOpen] = useState(false);
  return <Menu open={open} portal dense anchor={<Button data-dsh-control className="setting-toolbar-button setting-toolbar-import"
    variant="ghost" icon={<ImportIcon size={17} />} disabled={disabled} aria-label={label} title={label}
    aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}><span>{tUi("导入")}</span></Button>}
    items={items} onClose={() => setOpen(false)} onSelect={id => { setOpen(false); onSelect(id); }} />;
}

export function SettingLibraryDirectoryOptions({ characterScope, busy, available, selection, onManage }) {
  const tUi = useProductTranslation();
  const [open, setOpen] = useState(false);
  const selectionLabel = tUi(selection.active ? '完成' : '多选');
  if (!characterScope) return <Button data-dsh-control variant="ghost" className="setting-toolbar-button setting-toolbar-icon"
    icon={<ListChecks size={19} />} title={selectionLabel} aria-label={selectionLabel} aria-pressed={selection.active}
    disabled={busy || !available} onClick={selection.toggle} />;
  const label = tUi('设定库管理');
  const items = [
    { id: 'manage', label: tUi('版本管理'), icon: <SlidersHorizontal size={16} />, disabled: selection.active, run: onManage },
    { id: 'select', label: selectionLabel, icon: <ListChecks size={16} />, run: selection.toggle },
  ];
  return <Menu open={open} portal dense anchor={<Button data-dsh-control variant="ghost" className="setting-toolbar-button setting-toolbar-icon"
    icon={<SlidersHorizontal size={19} />} title={label} aria-label={label} aria-haspopup="menu" aria-expanded={open}
    disabled={busy || !available} onClick={() => setOpen(!open)} />}
    items={items} onClose={() => setOpen(false)} onSelect={id => { setOpen(false); items.find(item => item.id === id)?.run(); }} />;
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
      <Button data-dsh-control variant={workspace && !dirty ? 'ghost' : 'primary'}
        icon={workspace ? saving ? <CircleNotch size={15} aria-hidden="true" /> : <FloppyDisk size={15} aria-hidden="true" /> : undefined}
        type="button"
        className={`setting-library-save-button${workspace ? ' setting-document-save setting-toolbar-button setting-toolbar-save' : ''}${saving ? " is-saving" : ""}`}
        aria-label={saving ? tUi("保存中…") : tUi("保存")}
        title={title || (workspace ? tUi('统一保存设定库的全部修改') : tUi("保存（Ctrl/Command + S）"))}
        aria-keyshortcuts="Control+S Meta+S"
        disabled={!dirty || saving}
        onClick={onSave}
      >
        {!workspace && (saving ? <CircleNotch size={16} aria-hidden="true" /> : <FloppyDisk size={16} aria-hidden="true" />)}
        <span>{saving ? tUi("保存中…") : tUi("保存")}</span>
      </Button>
      {error ? <span className="setting-library-save-feedback is-error" role="alert" title={error}>
        {compact ? <><WarningCircle size={14} />{error}</> : <button type="button" className="setting-library-error-detail-button" aria-label={tUi("查看保存错误")} onClick={() => setErrorOpen(true)}><WarningCircle size={14} />{tUi("保存失败")}</button>}
      </span> : null}
      {!error && notice === "saved" ? <span className="setting-library-save-feedback is-saved" role="status"><CheckCircle size={14} />{tUi("已保存")}</span> : null}
      {error && errorOpen ? <AppErrorDialog notice={{ id: error, message: error }} onDismiss={() => setErrorOpen(false)} /> : null}
    </div>
  );
}
