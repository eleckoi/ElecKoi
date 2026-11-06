import { useState } from 'react';
import { Button, IconAppsAddOutlineRegular, IconEllipsisOutlineRegular, Menu } from '@deepseek-ai/dsh-client-ui-primitives';
import css from './DshEntryActionsMenu.module.css';
import { NavigationFill } from '../icons/navigationFill.jsx';

/** Region-owned launcher for the official plugin entry actions slot. */
export function DshEntryActionsMenu({ region, renderActions, className, showLabel = false }) {
  const [open, setOpen] = useState(false);
  const sidebar = region === 'sidebar';
  const props = { type: 'button', 'aria-label': '更多插件', 'aria-haspopup': 'menu',
    'aria-expanded': open, 'data-plugin-entry-more': region, onClick: () => setOpen(value => !value) };
  return <Menu open={open} onClose={() => setOpen(false)} portal compact autoFocus
    className={css.anchor}
    anchor={sidebar ? <button {...props} className={`${className || ''}${open ? ' active' : ''}`}>
      <span className="rail-icon-layer base"><IconAppsAddOutlineRegular size={24} /></span>
      <span className="rail-icon-layer active-fill" aria-hidden="true"><NavigationFill glyph="apps-add-outline" /></span>
      {showLabel ? <span className="rail-navigation-label">更多</span> : null}
    </button> : <Button {...props} size="sm" className={css.viewsMore}><IconEllipsisOutlineRegular size={13} /></Button>}>
    {open ? renderActions(() => setOpen(false)) : null}
  </Menu>;
}
