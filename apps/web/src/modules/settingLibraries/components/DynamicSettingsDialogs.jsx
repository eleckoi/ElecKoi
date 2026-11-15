import { Button, Input, Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import { useEffect, useState } from 'react';
import { useProductTranslation } from '../../../app/i18n/ProductLocaleContext.jsx';
import '../../../ui/styles/product-dialogs.css';

export function DynamicSettingsNameDialog({ dialog, busy, onCancel, onConfirm }) {
  const tUi = useProductTranslation();
  const [value, setValue] = useState(dialog?.value || '');
  useEffect(() => setValue(dialog?.value || ''), [dialog]);
  if (!dialog) return null;
  const submit = event => { event?.preventDefault(); if (value.trim() && !busy) onConfirm(value.trim()); };
  return <Modal open title={dialog.title} closeLabel={tUi('关闭')} onClose={() => { if (!busy) onCancel(); }}
    className="product-dialog" contentClassName="product-dialog-content" footer={<div className="product-dialog-actions">
      <Button variant="outline" disabled={busy} onClick={onCancel}>{tUi('取消')}</Button>
      <Button variant="primary" disabled={!value.trim() || busy} onClick={submit}>{busy ? tUi('保存中…') : dialog.confirmLabel}</Button>
    </div>}>
    <form className="product-dialog-fields" onSubmit={submit}><label><span>{dialog.label}</span>
      <Input className="product-dialog-field" data-modal-autofocus aria-label={dialog.label} value={value} disabled={busy} onChange={event => setValue(event.target.value)} />
    </label></form>
  </Modal>;
}
