import { useEffect, useRef } from 'react';
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import { CaretLeft, X } from '../icons/interfaceIcons.jsx';
import { useProductTranslation } from '../../app/i18n/ProductLocaleContext.jsx';
import { registerOverlayBack } from '../hooks/overlayBack.js';
import '../styles/conversation-action-dialog.css';

/** Conversation actions keep the official modal focus layer and a mobile sheet seat. */
export function ConversationActionDialog({ title, onClose, children, footer, busy = false }) {
  const tUi = useProductTranslation(), close = useRef(onClose), pending = useRef(busy);
  close.current = onClose; pending.current = busy;
  useEffect(() => registerOverlayBack(() => { if (!pending.current) close.current(); }), []);
  const dismiss = () => { if (!pending.current) close.current(); };
  return <Modal open headless title={title} onClose={dismiss} className="conversation-action-dialog">
    <header className="conversation-action-heading">
      <button type="button" aria-label={tUi('返回菜单')} disabled={busy} onClick={dismiss}><CaretLeft size={18} /></button>
      <h2>{title}</h2><button type="button" aria-label={tUi('关闭')} disabled={busy} onClick={dismiss}><X size={18} /></button>
    </header>
    <div className="conversation-action-content">{children}</div>
    {footer && <footer className="conversation-action-footer">{footer}</footer>}
  </Modal>;
}
