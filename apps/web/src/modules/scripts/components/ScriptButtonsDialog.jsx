import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from '../../../ui/icons/interfaceIcons.jsx';
import { registerOverlayBack } from '../../../ui/hooks/overlayBack.js';
import '../styles/native-script-ui.css';

export function ScriptButtonsDialog({ buttons, ready, onRun, onClose }) {
  const tUi = useProductTranslation();
  const dialog = useRef(null), closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const target = dialog.current, previous = document.activeElement;
    target.showModal();
    const stopBack = registerOverlayBack(() => closeRef.current());
    return () => {
      stopBack(); target.close();
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  return createPortal(<dialog ref={dialog} className="native-script-dialog native-script-actions-dialog" aria-label={tUi("脚本")}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === dialog.current) onClose(); }}>
    <header><h2>{tUi("脚本")}</h2>
      <button type="button" title={tUi("关闭")} aria-label={tUi("关闭脚本")} onClick={onClose}><X /></button>
    </header>
    {buttons.length ? <ul className="native-script-actions-list" aria-label={tUi("脚本按钮")}>
      {buttons.map(button => <li key={button.key}>
        <button type="button" title={`${button.scriptName} · ${button.label}`} disabled={!ready || button.busy}
          aria-busy={button.busy} onClick={() => { onClose(); onRun?.(button.key); }}>
          <span>{button.label}</span><small>{button.scriptName}</small>
        </button>
        {button.error ? <p role="alert">{button.error}</p> : null}
      </li>)}
    </ul> : <p className="native-script-actions-empty" role="status">{tUi("暂无可用按钮")}</p>}
  </dialog>, document.body);
}
