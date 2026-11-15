import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import { useProductTranslation } from '../../app/i18n/ProductLocaleContext.jsx';
import '../styles/product-dialogs.css';

/** Product commands only; official Modal owns chrome, focus, Escape and portals. */
export function UnsavedChangesDialog({ open, title, description, error = '', saving = false, saveDisabled = false,
  saveLabel, discardLabel, cancelLabel, onCancel, onDiscard, onSave }) {
  const tUi = useProductTranslation();
  return <Modal open={open} title={title} description={description} closeLabel={tUi('关闭')}
    onClose={() => { if (!saving) onCancel?.(); }} className="product-dialog" contentClassName="product-dialog-content"
    footer={<div className="product-dialog-actions">
      <Button variant="outline" data-modal-autofocus disabled={saving} onClick={onCancel}>{cancelLabel ?? tUi('取消')}</Button>
      <Button variant="outline" disabled={saving} onClick={onDiscard}>{discardLabel ?? tUi('不保存')}</Button>
      <Button variant="primary" disabled={saving || saveDisabled} onClick={onSave}>{saving ? tUi('保存中') : saveLabel ?? tUi('保存')}</Button>
    </div>}>
    {error ? <p className="product-dialog-error" role="alert">{error}</p> : undefined}
  </Modal>;
}
