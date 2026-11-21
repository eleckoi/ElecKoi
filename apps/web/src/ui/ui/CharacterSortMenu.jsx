import { useState } from 'react';
import { Button, Menu, Tooltip, IconChevronDownOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { SortAscending } from '@phosphor-icons/react';
import { useProductTranslation } from '../../app/i18n/ProductLocaleContext.jsx';
import { CHARACTER_SORT_OPTIONS } from '../hooks/useCharacterSort.js';
import { useCatalogSlots } from './CatalogSlotsContext.jsx';

export function CharacterSortMenu({ value, onChange, surface = 'pc-manager' }) {
  const tUi = useProductTranslation();
  const { render, actions } = useCatalogSlots();
  const [open, setOpen] = useState(false);
  const compact = surface === 'pc-sidebar';
  const anchor = compact ? <Tooltip label={tUi('角色卡排序')} side="bottom" delayMs={500} portal>
    <Button data-dsh-control variant="ghost" size="sm" className="sidebar-section-action" aria-label={tUi('角色卡排序')}
      aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} icon={<SortAscending size={16} />} />
  </Tooltip> : <Button data-dsh-control variant="outline" className="catalog-manager-surface-button" aria-label={tUi('排序')}
    aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
    <SortAscending size={17} /><span>{tUi('排序')}</span><IconChevronDownOutlineRegular className="catalog-manager-caret" />
  </Button>;
  return render('eleckoi.character.library.sort', { surface, value, onChange }, <Menu open={open} onClose={() => setOpen(false)} portal align="end" selectedId={value}
    items={CHARACTER_SORT_OPTIONS.map(([id, label]) => ({ id, label: tUi(label) }))}
    onSelect={id => { setOpen(false); void onChange(id); }}
    anchor={anchor}>
    {open && actions('eleckoi.character.library.menu.actions', { surface, menu: 'sort', busy: false, onDismiss: () => setOpen(false) })}
  </Menu>);
}
