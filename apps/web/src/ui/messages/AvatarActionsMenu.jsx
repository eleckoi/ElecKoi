import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MenuItemButton, MenuSurface, useAnchoredPosition } from '@deepseek-ai/dsh-client-ui-primitives';
import { IdentificationCard, ImageSquare } from '@phosphor-icons/react';
import { useProductTranslation } from '../../app/i18n/ProductLocaleContext.jsx';
import './avatar-actions-menu.css';

function surfacePath(height, tip) {
  return `M24.5 .5H103.5A16 16 0 0 1 119.5 16.5V${height - 16.5}A16 16 0 0 1 103.5 ${height - .5}H24.5A16 16 0 0 1 8.5 ${height - 16.5}V${tip + 8.25}Q8.5 ${tip + 7.65} 8.08 ${tip + 7.22}L1.18 ${tip + .71}Q.42 ${tip} 1.18 ${tip - .71}L8.08 ${tip - 7.22}Q8.5 ${tip - 7.65} 8.5 ${tip - 8.25}V16.5A16 16 0 0 1 24.5 .5Z`;
}

/** The menu only owns its presentation; actions keep their existing owners. */
export function AvatarActionsMenu({ anchor, onClose, onView, onEdit, canView = true }) {
  const tUi = useProductTranslation();
  const anchorRef = useRef(anchor);
  const panelRef = useRef(null);
  const menuRef = useRef(null);
  const focusedRef = useRef(false);
  const id = useId().replaceAll(':', '');
  const [geometry, setGeometry] = useState({ height: 124, tip: 62 });
  const getAnchorRect = useCallback(() => {
    if (!anchor.isConnected) return null;
    const rect = anchor.getBoundingClientRect();
    return new DOMRect(rect.left, rect.top + rect.height / 2 - (panelRef.current?.offsetHeight || 124) / 2, rect.width, rect.height);
  }, [anchor]);
  const position = useAnchoredPosition({ open: true, anchorRef, panelRef, side: 'right', gap: 8, margin: 12, getAnchorRect });
  useLayoutEffect(() => {
    const measure = () => {
      const panel = panelRef.current;
      if (!panel) return;
      const rect = anchor.getBoundingClientRect();
      const height = panel.offsetHeight;
      const tip = Math.max(24, Math.min(height - 24, rect.top + rect.height / 2 - panel.getBoundingClientRect().top));
      setGeometry(current => current.height === height && current.tip === tip ? current : { height, tip });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(panelRef.current);
    window.addEventListener('scroll', measure, true);
    return () => { observer.disconnect(); window.removeEventListener('scroll', measure, true); };
  }, [anchor, position]);
  useEffect(() => {
    if (!position || focusedRef.current) return;
    menuRef.current?.querySelector('button:not(:disabled)')?.focus({ preventScroll: true });
    focusedRef.current = true;
  }, [position]);
  useEffect(() => {
    const outside = event => {
      if (!panelRef.current?.contains(event.target) && !anchor.contains(event.target)) onClose();
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [anchor, onClose]);
  function dismiss() {
    anchor.focus({ preventScroll: true });
    onClose();
  }
  function run(action) { dismiss(); action(); }
  function keyDown(event) {
    const buttons = [...menuRef.current.querySelectorAll('button:not(:disabled)')];
    const index = buttons.indexOf(document.activeElement);
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dismiss(); }
    else if (event.key === 'Tab') onClose();
    else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
        : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    }
  }
  const path = surfacePath(geometry.height, geometry.tip);
  return createPortal(<div ref={panelRef} className="avatar-actions-popup" style={position || { visibility: 'hidden' }} onKeyDown={keyDown}>
    <svg className="avatar-actions-outline" width="120" height={geometry.height} aria-hidden="true" focusable="false">
      <defs>
        <clipPath id={`${id}-clip`}><path d={path} /></clipPath>
        <filter id={`${id}-shadow`} x="-50%" y="-50%" width="200%" height="220%">
          {/* Blur alpha only: retaining SourceGraphic here would leave a dark
              antialiased rim when the interior is subtracted from the shadow. */}
          <feGaussianBlur in="SourceAlpha" stdDeviation="4" result="near-blur" />
          <feOffset in="near-blur" dy="3" result="near-offset" />
          <feComponentTransfer in="near-offset" result="near-shadow"><feFuncA type="linear" slope=".04" /></feComponentTransfer>
          <feGaussianBlur in="SourceAlpha" stdDeviation="10" result="far-blur" />
          <feComponentTransfer in="far-blur" result="far-shadow"><feFuncA type="linear" slope=".05" /></feComponentTransfer>
          <feMerge result="shadow"><feMergeNode in="far-shadow" /><feMergeNode in="near-shadow" /></feMerge>
          <feComposite in="shadow" in2="SourceAlpha" operator="out" />
        </filter>
      </defs>
      <path d={path} fill="black" filter={`url(#${id}-shadow)`} />
      <path d={path} fill="none" stroke="var(--dsw-alias-border-l1)" strokeWidth=".5" />
    </svg>
    <MenuSurface ref={menuRef} className="avatar-actions-menu" role="menu" aria-label={tUi('角色快捷入口')}
      style={{ '--avatar-actions-clip': `url(#${id}-clip)` }}>
      <MenuItemButton icon={<ImageSquare size={16} />} disabled={!canView} onSelect={() => run(onView)}>{tUi('查看头像')}</MenuItemButton>
      <MenuItemButton icon={<IdentificationCard size={16} />} onSelect={() => run(onEdit)}>{tUi('角色卡编辑')}</MenuItemButton>
    </MenuSurface>
  </div>, document.body);
}
