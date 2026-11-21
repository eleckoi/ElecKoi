import React, { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useDismissOnOutsidePointer } from '@deepseek-ai/dsh-client-ui-primitives';
import { useProductTranslation } from '../../app/i18n/ProductLocaleContext.jsx';
import { useCssAnchor } from '../../ui/hooks/useCssAnchor.js';

export function AssetMenuPopover({ anchor, align = 'start', label, onClose, children }) {
  const tUi = useProductTranslation();
  const anchorRef = useRef(anchor), panelRef = useRef(null);
  anchorRef.current = anchor;
  const anchorName = useCssAnchor(anchor);
  useDismissOnOutsidePointer(anchorRef, true, onClose, panelRef);
  const root = anchor.getRootNode();
  const view = anchor.ownerDocument.defaultView;
  const nativeAnchor = view.CSS?.supports(
    '(position-anchor: --asset-trigger) and (top: max(8px, calc(anchor(bottom) + 7px))) and (position-try: --asset-below)'
  );

  useLayoutEffect(() => {
    if (nativeAnchor) return;
    const panel = panelRef.current;
    // Older system WebViews need viewport coordinates for the portaled menu.
    const place = () => {
      const edge = 8, gap = 7;
      const trigger = anchor.getBoundingClientRect();
      const { width, height } = panel.getBoundingClientRect();
      const below = trigger.bottom + gap;
      const above = trigger.top - gap - height;
      const maxTop = view.innerHeight - edge - height;
      const top = below > maxTop && above >= edge ? above : below;
      const left = align === 'end' ? trigger.right - width : trigger.left;
      panel.style.top = `${Math.max(edge, Math.min(top, maxTop))}px`;
      panel.style.left = `${Math.max(edge, Math.min(left, view.innerWidth - edge - width))}px`;
    };
    place();
    const observer = new view.ResizeObserver(place);
    observer.observe(panel);
    observer.observe(anchor);
    root.addEventListener('scroll', place, { capture: true, passive: true });
    view.addEventListener('resize', place);
    return () => {
      observer.disconnect();
      root.removeEventListener('scroll', place, true);
      view.removeEventListener('resize', place);
      panel.style.removeProperty('top');
      panel.style.removeProperty('left');
    };
  }, [align, anchor, nativeAnchor, root, view]);

  return createPortal(<div className="character-asset-library asset-menu-layer">
    <button type="button" className="menu-dismiss" aria-label={tUi('关闭菜单')} onClick={onClose} />
    <div ref={panelRef} className="popover" role="menu" aria-label={label} data-anchor-align={align}
      data-css-anchor={nativeAnchor ? '' : undefined} style={nativeAnchor ? { positionAnchor: anchorName } : undefined}
      onContextMenu={event => event.preventDefault()}>{children}</div>
  </div>, root instanceof ShadowRoot ? root : anchor.ownerDocument.body);
}
