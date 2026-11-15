import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import { useProductTranslation } from '../../../app/i18n/ProductLocaleContext.jsx';
import { FailureAlert } from '../../../ui/ui/FailureAlert.jsx';
import '../../../ui/styles/product-dialogs.css';

export function DeleteCharacterDialog({ character, deleting = false, error = null, onCancel, onConfirm }) {
  const tUi = useProductTranslation();
  if (!character) return null;
  return <Modal open title={`${tUi('删除“')}${character.name}”？`} description={tUi('角色及其对话记录将被永久删除。')}
    tone="warning" closeLabel={tUi('关闭')} onClose={() => { if (!deleting) onCancel(); }}
    className="product-dialog" contentClassName="product-dialog-content" footer={<div className="product-dialog-actions">
      <Button variant="outline" data-modal-autofocus disabled={deleting} onClick={onCancel}>{tUi('取消')}</Button>
      <Button variant="primary" disabled={deleting} onClick={onConfirm}>{deleting ? tUi('删除中') : tUi('删除角色')}</Button>
    </div>}>
    {error ? <FailureAlert failure={error} /> : undefined}
  </Modal>;
}
