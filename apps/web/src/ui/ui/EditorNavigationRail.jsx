import { CaretLeft, CaretRight } from '../icons/interfaceIcons.jsx';
import { useProductTranslation } from '../../app/i18n/ProductLocaleContext.jsx';

/** Shared category rail; the owner retains navigation guards and collapse persistence. */
export function EditorNavigationRail({ id, label, items, value, onChange, compact = false, collapsed = false, busy = false, onToggle }) {
  const tUi = useProductTranslation();
  return <>
    <nav id={id} className="character-editor-navigation" aria-label={label}>
      {items.map(({ id: section, label: title, Icon }) => <button key={section} type="button" aria-label={title}
        aria-current={value === section ? 'page' : undefined} onClick={() => onChange(section)}>
        <Icon size={19} weight="fill" aria-hidden="true" /><span>{title}</span>
      </button>)}
    </nav>
    {compact && <button type="button" className="character-editor-sidebar-toggle" aria-label={tUi(collapsed ? '展开侧边栏' : '收起侧边栏')}
      aria-expanded={!collapsed} aria-controls={id} disabled={busy} onClick={onToggle}>
      {collapsed ? <CaretRight size={20} aria-hidden="true" /> : <CaretLeft size={20} aria-hidden="true" />}
    </button>}
  </>;
}
