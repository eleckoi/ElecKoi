import { Button, Input, Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import { useProductTranslation } from '../../app/i18n/ProductLocaleContext.jsx';
import '../styles/product-dialogs.css';

export function GroupNameDialog({ title, value, onChange, onConfirm, onCancel }) {
  const tUi = useProductTranslation();
  const submit = event => { event?.preventDefault(); if (value.trim()) onConfirm(); };
  return <Modal open title={title ?? tUi('添加分组')} closeLabel={tUi('关闭')} onClose={onCancel}
    className="product-dialog" contentClassName="product-dialog-content" footer={<div className="product-dialog-actions">
      <Button variant="outline" onClick={onCancel}>{tUi('取消')}</Button>
      <Button variant="primary" disabled={!value.trim()} onClick={submit}>{tUi('确定')}</Button>
    </div>}>
    <form className="product-dialog-fields" onSubmit={submit}>
      <Input data-modal-autofocus className="product-dialog-field" aria-label={tUi('填写分组')} placeholder={tUi('填写分组')} value={value} onChange={event => onChange(event.target.value)} />
    </form>
  </Modal>;
}
