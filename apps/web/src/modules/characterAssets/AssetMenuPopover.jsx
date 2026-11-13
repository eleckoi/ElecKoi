import React, { useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAnchoredPosition, useDismissOnOutsidePointer } from '@deepseek-ai/dsh-client-ui-primitives';
import { useProductTranslation } from '../../app/i18n/ProductLocaleContext.jsx';

export function AssetMenuPopover({ anchor, align = 'start', label, onClose, children }) {
  const tUi = useProductTranslation();
  const anchorRef = useRef(anchor), panelRef = useRef(null);
  anchorRef.current = anchor;
  const position = useAnchoredPosition({ open:true, anchorRef, panelRef, align, side:'bottom', gap:7, margin:8 });
  useDismissOnOutsidePointer(anchorRef, true, onClose, panelRef);
  const root = anchor.getRootNode();
  return createPortal(<div className="character-asset-library asset-menu-layer">
    <button type="button" className="menu-dismiss" aria-label={tUi('关闭菜单')} onClick={onClose} />
    <div ref={panelRef} className="popover" role="menu" aria-label={label} style={position || { visibility:'hidden' }}
      onContextMenu={event => event.preventDefault()}>{children}</div>
  </div>, root instanceof ShadowRoot ? root : anchor.ownerDocument.body);
}
