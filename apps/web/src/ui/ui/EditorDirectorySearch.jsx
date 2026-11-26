import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives';
import { ListChecks, MagnifyingGlass } from '../icons/interfaceIcons.jsx';
import { useProductTranslation } from '../../app/i18n/ProductLocaleContext.jsx';
import '../styles/editor-heading.css';

export function EditorSearchInput({ label, placeholder = label, query, onQueryChange, className = '' }) {
  return <Input data-dsh-control type="search" className={`editor-search-input ${className}`} icon={<MagnifyingGlass size={16} />}
    aria-label={label} placeholder={placeholder} value={query} onChange={event => onQueryChange(event.target.value)} />;
}

export function EditorDirectorySearch({ label, query, onQueryChange, selection, disabled }) {
  const tUi = useProductTranslation();
  const selectionLabel = tUi(selection?.active ? '完成多选' : '多选');
  return <div className="setting-directory-search">
    <EditorSearchInput className="setting-search-input" label={label} query={query} onQueryChange={onQueryChange} />
    {selection && <Button data-dsh-control variant="outline" className="editor-directory-select"
      aria-label={selectionLabel} title={selectionLabel} icon={<ListChecks size={18} aria-hidden="true" />}
      aria-pressed={selection.active} disabled={disabled} onClick={selection.toggle} />}
  </div>;
}
