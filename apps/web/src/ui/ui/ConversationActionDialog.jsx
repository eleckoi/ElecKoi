import { Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import { useProductTranslation } from '../../app/i18n/ProductLocaleContext.jsx';
import '../styles/product-dialogs.css';
import '../styles/conversation-action-dialog.css';

export function ConversationActionDialog({ title, onClose, children, footer, busy = false }) {
  const tUi = useProductTranslation();
  return <Modal open title={title} closeLabel={tUi('关闭')} onClose={() => { if (!busy) onClose(); }}
    className="product-dialog conversation-action-dialog" contentClassName="product-dialog-content" footer={footer}>
    {children}
  </Modal>;
}
