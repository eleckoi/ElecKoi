import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export function usePresetContextMenu() {
  const [menu, setMenu] = useState(null);
  function open(event, target = null) {
    event.preventDefault();
    event.stopPropagation();
    const bounds = event.currentTarget.getBoundingClientRect();
    const trigger = target ? event.currentTarget.querySelector('button') || event.currentTarget : event.currentTarget;
    setMenu({ target, x: event.clientX || bounds.left + 16, y: event.clientY || bounds.top + 16, trigger });
  }
  return { menu, open, close: () => setMenu(null) };
}

export function PresetContextMenu({ menu, actions, onClose }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useLayoutEffect(() => {
    const element = ref.current;
    const bounds = element.getBoundingClientRect();
    element.style.left = `${Math.max(8, Math.min(menu.x, window.innerWidth - bounds.width - 8))}px`;
    element.style.top = `${Math.max(8, Math.min(menu.y, window.innerHeight - bounds.height - 8))}px`;
    element.querySelector('button')?.focus({ preventScroll: true });
  }, [menu]);
  useEffect(() => {
    function outside(event) { if (!ref.current?.contains(event.target)) closeRef.current(); }
    function close() { closeRef.current(); }
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', outside, true);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', outside, true);
    };
  }, []);
  return createPortal(<div ref={ref} className="setting-library-context-menu preset-context-menu" role="menu" aria-label="管理条目" style={{ left: menu.x, top: menu.y }}
    onContextMenu={(event) => event.preventDefault()}
    onMouseDown={(event) => event.stopPropagation()}
    onKeyDown={(event) => {
      const buttons = [...ref.current.querySelectorAll('button')];
      const index = buttons.indexOf(document.activeElement);
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }
      if (event.key === 'Escape' || event.key === 'Tab') {
        event.preventDefault(); onClose(); menu.trigger?.focus();
      }
    }}>
    {actions.map(({ label, icon: Icon, danger, run }) => <button key={label} type="button" role="menuitem" className={danger ? 'is-destructive' : undefined} onClick={() => { onClose(); run(); }}><Icon size={16} aria-hidden="true" /><span>{label}</span></button>)}
  </div>, document.body);
}
