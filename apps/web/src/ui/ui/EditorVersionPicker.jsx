import { useState } from 'react';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { CaretDown } from '../icons/interfaceIcons.jsx';
import { useProductTranslation } from '../../app/i18n/ProductLocaleContext.jsx';
import { EditorManagementModal } from './EditorCollectionControls.jsx';
import { EditorPickerButton, EditorPickerRows, EditorSearchPane, editorSearchMatches } from './EditorSearchPicker.jsx';

export function EditorVersionPicker({ versions, activeVersionId, onSelect, onClose, onManage, numbered = false, emptyVersionLabel }) {
  const tUi = useProductTranslation();
  const [query, setQuery] = useState('');
  const options = versions.map((version, index) => {
    const name = version.name?.trim() || tUi('未命名版本');
    return { id: version.id, label: numbered ? `v${index + 1} · ${name}` : name };
  });
  if (emptyVersionLabel) options.unshift({ id: '', label: emptyVersionLabel });
  return <EditorManagementModal title={tUi('选择版本')} className="editor-search-modal" onClose={onClose}
    footer={<><Button variant="outline" onClick={onClose}>{tUi('返回')}</Button>
      {onManage && <Button variant="outline" onClick={onManage}>{tUi('管理版本')}</Button>}</>}>
    <EditorSearchPane query={query} onQueryChange={setQuery} label={tUi('搜索版本')}>
      <EditorPickerRows options={options.filter(option => editorSearchMatches(query, option.label))} selectedId={activeVersionId} empty={tUi('没有匹配的版本')}
        onSelect={id => { onClose(); if (id !== activeVersionId) onSelect(id); }} />
    </EditorSearchPane>
  </EditorManagementModal>;
}

export function OptionalEditorVersionField({ label, emptyVersionLabel, versions, value = '', disabled, onChange }) {
  const tUi = useProductTranslation();
  const [open, setOpen] = useState(false);
  const current = versions.find(version => version.id === value);
  const currentLabel = current ? current.name?.trim() || tUi('未命名版本') : value ? tUi('版本不存在') : emptyVersionLabel;
  return <>
    <EditorPickerButton label={label} disabled={disabled} onClick={() => setOpen(true)}>{currentLabel}</EditorPickerButton>
    {open && <EditorVersionPicker versions={versions} activeVersionId={value} emptyVersionLabel={emptyVersionLabel}
      onSelect={onChange} onClose={() => setOpen(false)} />}
  </>;
}

export function EditorWorkspaceVersion({ label, config, disabled, onSelect, onManage }) {
  const tUi = useProductTranslation();
  const [open, setOpen] = useState(false);
  if (!config) return null;
  const { versions, activeVersionId } = config;
  const index = versions.findIndex(version => version.id === activeVersionId);
  const name = versions[index]?.name?.trim() || tUi('未命名版本');
  const close = () => setOpen(false);
  return <footer className="setting-version">
    <Button data-dsh-control variant="outline" className="setting-version-button" aria-label={label} title={name}
      aria-haspopup="dialog" aria-expanded={open} disabled={disabled || !versions.length} onClick={() => setOpen(true)}>
      <span className="setting-version-label">{tUi('版本')}</span>
      <span className="setting-version-value">{index < 0 ? tUi('未选择版本') : `v${index + 1} · ${name}`}</span>
      <CaretDown size={13} />
    </Button>
    {open && <EditorVersionPicker numbered versions={versions} activeVersionId={activeVersionId} onSelect={onSelect} onClose={close}
      onManage={onManage && (() => { close(); onManage(); })} />}
  </footer>;
}
