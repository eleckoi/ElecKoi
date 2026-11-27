import { useRef } from 'react';
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives';
import { CaretDown, CaretRight, Check, MagnifyingGlass } from '../icons/interfaceIcons.jsx';
import { useProductTranslation } from '../../app/i18n/ProductLocaleContext.jsx';
import './editor-select.css';
import './editor-search-picker.css';

export function EditorPickerButton({ label, children, disabled, onClick, desktop = false }) {
  return <Button variant="outline" className={`editor-select-control editor-picker-trigger${desktop ? ' is-desktop' : ''}`} aria-label={label}
    aria-haspopup="dialog" disabled={disabled} onClick={onClick}><span>{children}</span><CaretDown size={14} /></Button>;
}

export function EditorSearchPane({ query, onQueryChange, label, toolbar, children }) {
  const results = useRef(null);
  return <div className="editor-search-pane">
    <div className="editor-search-pane-toolbar">
      <Input data-dsh-control type="search" icon={<MagnifyingGlass size={16} />} value={query}
        onChange={event => { onQueryChange(event.target.value); if (results.current) results.current.scrollTop = 0; }}
        placeholder={label} aria-label={label} />
      {toolbar}
    </div>
    <div ref={results} className="editor-search-pane-results">{children}</div>
  </div>;
}

export function editorSearchMatches(query, ...text) {
  const parts = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const candidate = text.join(' ').toLocaleLowerCase();
  return parts.every(part => candidate.includes(part));
}

export function EditorPickerRows({ options, selectedId, onSelect, empty, busy = false, error }) {
  const tUi = useProductTranslation();
  return <div className="editor-picker-rows" aria-busy={busy}>
    {error && <p role="alert" className="editor-picker-message is-error">{error}</p>}
    {options.map(({ id, label, detail, Icon, leading, next, disabled }) => {
      const selected = id === selectedId;
      return <Button key={id} variant="ghost" className="editor-picker-row" aria-pressed={selectedId === undefined ? undefined : selected}
        title={label} disabled={busy || disabled} onClick={() => onSelect(id)}>
        {leading ?? (Icon && <Icon size={17} aria-hidden="true" />)}
        <span className="editor-picker-row-label">{label}</span>
        {detail && <span className="editor-picker-row-detail">{detail}</span>}
        {selected ? <Check size={16} aria-hidden="true" /> : next ? <CaretRight size={15} aria-hidden="true" /> : null}
      </Button>;
    })}
    {busy ? <p className="editor-picker-message" role="status">{tUi('正在加载…')}</p>
      : !options.length && !error && <p className="editor-picker-message" role="status">{empty}</p>}
  </div>;
}
