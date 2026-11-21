import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import { useProductTranslation } from '../../app/i18n/ProductLocaleContext.jsx';
import '../styles/product-dialogs.css';

export function ConfirmationDialog({ open, title, description, confirmLabel, cancelLabel, destructive = false, busy = false, onCancel, onConfirm, children }) {
  const tUi = useProductTranslation();
  return <Modal open={open} title={title} description={description} closeLabel={tUi('关闭')}
    tone={destructive ? 'warning' : undefined} onClose={() => { if (!busy) onCancel?.(); }}
    className="product-dialog" contentClassName="product-dialog-content"
    footer={<div className="product-dialog-actions">
      <Button variant="outline" data-modal-autofocus disabled={busy} onClick={onCancel}>{cancelLabel ?? tUi('取消')}</Button>
      <Button variant="primary" disabled={busy} onClick={onConfirm}>{busy ? tUi('处理中') : confirmLabel ?? tUi('确定')}</Button>
    </div>}>{children}</Modal>;
}
