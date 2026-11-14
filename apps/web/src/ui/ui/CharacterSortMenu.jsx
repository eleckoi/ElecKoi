import { useState } from 'react';
import { Button, Menu, IconChevronDownOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { SortAscending } from '@phosphor-icons/react';
import { useProductTranslation } from '../../app/i18n/ProductLocaleContext.jsx';
import { CHARACTER_SORT_OPTIONS } from '../hooks/useCharacterSort.js';

export function CharacterSortMenu({ value, onChange }) {
  const tUi = useProductTranslation();
  const [open, setOpen] = useState(false);
  return <Menu open={open} onClose={() => setOpen(false)} portal align="end" selectedId={value}
    items={CHARACTER_SORT_OPTIONS.map(([id, label]) => ({ id, label: tUi(label) }))}
    onSelect={id => { setOpen(false); void onChange(id); }}
    anchor={<Button data-dsh-control variant="outline" className="catalog-manager-surface-button" aria-label={tUi('排序')}
      aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
      <SortAscending size={17} /><span>{tUi('排序')}</span><IconChevronDownOutlineRegular className="catalog-manager-caret" />
    </Button>} />;
}
