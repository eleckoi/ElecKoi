import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from '../../../ui/icons/interfaceIcons.jsx';
import { SystemBarOverlay } from '../../../ui/ui/SystemBarOverlay.jsx';
import '../../models/styles/model-picker.css';

export function DesktopIllustrationModelPicker({ subtitle, tab, onTabChange, canEditParameters, saving, canSave,
  leaveOpen, onClose, onSave, children }) {
  const panel = useRef(null), close = useRef(null), actions = useRef(null);
  actions.current = { saving, leaveOpen, onClose };
  useEffect(() => {
    const previous = document.activeElement;
    close.current?.focus({ preventScroll: true });
    function keys(event) {
      const current = actions.current;
      if (event.defaultPrevented || current.leaveOpen) return;
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopImmediatePropagation();
        if (!current.saving) current.onClose();
      } else if (event.key === 'Tab') {
        const controls = [...panel.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')];
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first?.focus();
        }
      }
    }
    window.addEventListener('keydown', keys, true);
    return () => {
      window.removeEventListener('keydown', keys, true);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);

  return createPortal(<SystemBarOverlay className="chat-model-backdrop is-elevated" role="presentation" onMouseDown={onClose}>
    <section ref={panel} className="chat-model-panel desktop-illustration-models" role="dialog" aria-modal="true"
      aria-label="选择绘图模型" aria-busy={saving} onMouseDown={event => event.stopPropagation()}>
      <header>
        <div className="chat-model-title"><strong>选择绘图模型</strong>{subtitle && <span title={subtitle}>{subtitle}</span>}</div>
        <button ref={close} type="button" className="chat-model-close" title="关闭" aria-label="关闭绘图模型选择" disabled={saving} onClick={onClose}><X size={20} /></button>
      </header>
      <div className="chat-model-content">
        <div className="chat-model-tabs" role="tablist" aria-label="绘图模型设置">
          <button type="button" role="tab" aria-selected={tab === 'models'} onClick={() => onTabChange('models')}>模型</button>
          <button type="button" role="tab" aria-selected={tab === 'parameters'} disabled={!canEditParameters} onClick={() => onTabChange('parameters')}>参数</button>
        </div>
        <div className="desktop-illustration-scroll" key={tab}>{children}</div>
      </div>
      <footer className="chat-model-actions">
        <button type="button" className="chat-model-cancel" disabled={saving} onClick={onClose}>取消</button>
        <button type="button" className="chat-model-save" disabled={!canSave || saving} onClick={onSave}>{saving ? '保存中…' : '保存'}</button>
      </footer>
    </section>
  </SystemBarOverlay>, document.body);
}
