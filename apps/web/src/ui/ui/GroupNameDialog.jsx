import { Button, Input, Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import { useProductTranslation } from '../../app/i18n/ProductLocaleContext.jsx';
import { FailureAlert } from './FailureAlert.jsx';
import '../styles/product-dialogs.css';

export function GroupNameDialog({ title, value, onChange, onConfirm, onCancel, busy = false, error }) {
  const tUi = useProductTranslation();
  const submit = event => { event?.preventDefault(); if (!busy && value.trim()) onConfirm(); };
  return <Modal open title={title ?? tUi('添加分组')} closeLabel={tUi('关闭')} onClose={() => { if (!busy) onCancel(); }}
    className="product-dialog" contentClassName="product-dialog-content" footer={<div className="product-dialog-actions">
      <Button variant="outline" disabled={busy} onClick={onCancel}>{tUi('取消')}</Button>
      <Button variant="primary" disabled={busy || !value.trim()} onClick={submit}>{tUi('确定')}</Button>
    </div>}>
    <form className="product-dialog-fields" onSubmit={submit}>
      <Input data-modal-autofocus className="product-dialog-field" aria-label={tUi('填写分组')} placeholder={tUi('填写分组')} value={value} disabled={busy} onChange={event => onChange(event.target.value)} />
      {error && <FailureAlert failure={error} />}
    </form>
  </Modal>;
}
