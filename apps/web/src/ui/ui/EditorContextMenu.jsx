import { useProductTranslation } from "../../app/i18n/ProductLocaleContext.jsx";
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from '../styles/editor-context-menu.css?inline';

export function useEditorContextMenu() {
  const [menu, setMenu] = useState(null);
  return { menu, close: () => setMenu(null), open(event, target) {
    event.preventDefault();
    event.stopPropagation();
    const trigger = event.currentTarget;
    const bounds = trigger.getBoundingClientRect();
    setMenu({ target, trigger, x: event.clientX || bounds.left + 16, y: event.clientY || bounds.top + 16 });
  } };
}

export function EditorContextMenu({ menu, actions, onClose, label: labelSource }) {
  const tUi = useProductTranslation();
  const label = labelSource === undefined ? tUi("编辑操作") : labelSource;
  const ref = useRef(null), closeRef = useRef(onClose);
  closeRef.current = onClose;
  const root = menu.trigger.getRootNode();
  const portal = root instanceof ShadowRoot ? root : document.body;
  useLayoutEffect(() => {
    const element = ref.current, bounds = element.getBoundingClientRect();
    element.style.left = `${Math.max(8, Math.min(menu.x, window.innerWidth - bounds.width - 8))}px`;
    element.style.top = `${Math.max(8, Math.min(menu.y, window.innerHeight - bounds.height - 8))}px`;
    element.querySelector('button:not(:disabled)')?.focus({ preventScroll: true });
  }, [menu]);
  useEffect(() => {
    const outside = event => { if (!event.composedPath().includes(ref.current)) closeRef.current(); };
    const close = () => closeRef.current();
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('scroll', outside, true);
    window.addEventListener('resize', close);
    window.addEventListener('blur', close);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('scroll', outside, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('blur', close);
    };
  }, []);
  return createPortal(<><style>{styles}</style><div ref={ref} className="editor-context-menu" role="menu" aria-label={label}
    style={{ left: menu.x, top: menu.y }} onContextMenu={event => event.preventDefault()}
    onKeyDown={event => {
      const buttons = [...ref.current.querySelectorAll('button:not(:disabled)')];
      const index = buttons.indexOf(root.activeElement || document.activeElement);
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
          : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }
      if (event.key === 'Escape' || event.key === 'Tab') {
        event.preventDefault(); event.stopPropagation(); onClose();
        const trigger = menu.trigger.matches('button, [tabindex]') ? menu.trigger : menu.trigger.querySelector('button');
        trigger?.focus();
      }
    }}>
    {actions.map(({ label: text, icon: Icon, danger, disabled, run }) => <button key={text} type="button" role="menuitem"
      className={danger ? 'is-destructive' : undefined} disabled={disabled} onClick={() => { onClose(); run(); }}>
      <Icon size={16} aria-hidden="true" /><span>{text}</span>
    </button>)}
  </div></>, portal);
}
