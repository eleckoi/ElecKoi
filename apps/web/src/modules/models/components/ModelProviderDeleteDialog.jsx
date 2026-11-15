import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import { useProductTranslation } from '../../../app/i18n/ProductLocaleContext.jsx';
import { FailureAlert } from '../../../ui/ui/FailureAlert.jsx';
import '../../../ui/styles/product-dialogs.css';

export function ModelProviderDeleteDialog({ target, deleting = false, error = null, onCancel, onConfirm }) {
  const tUi = useProductTranslation();
  if (!target) return null;
  const builtIn = target.id === 'deepseek-official';
  const consequence = builtIn ? tUi('清空此内置配置的密钥和自定义参数，恢复提供商默认设置。') : tUi('这份配置将被删除。');
  return <Modal open title={`${builtIn ? tUi('清空') : tUi('删除')}“${target.label}”？`} tone="warning"
    description={`${consequence}${target.hasUnsavedChanges ? tUi(' 未保存的修改也会丢失。') : ''}`}
    closeLabel={tUi('关闭')} onClose={() => { if (!deleting) onCancel(); }} className="product-dialog" contentClassName="product-dialog-content"
    footer={<div className="product-dialog-actions">
      <Button variant="outline" data-modal-autofocus disabled={deleting} onClick={onCancel}>{tUi('取消')}</Button>
      <Button variant="primary" disabled={deleting} onClick={onConfirm}>{deleting ? tUi('删除中…') : builtIn ? tUi('清空配置') : tUi('删除配置')}</Button>
    </div>}>
    {error ? <FailureAlert failure={error} /> : undefined}
  </Modal>;
}
