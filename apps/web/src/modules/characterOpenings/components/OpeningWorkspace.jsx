import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { Button, Input, Menu } from '@deepseek-ai/dsh-client-ui-primitives';
import { useProductTranslation } from '../../../app/i18n/ProductLocaleContext.jsx';
import { ArrowDown, ArrowUp, ChatCircleDots, Copy, DotsThree, Plus, Trash } from '../../../ui/icons/interfaceIcons.jsx';
import { EditorLibraryWorkspace } from '../../../ui/ui/EditorLibraryWorkspace.jsx';
import { EditorField } from '../../../ui/ui/EditorLibraryFields.jsx';
import { EditorContextMenu, useEditorContextMenu } from '../../../ui/ui/EditorContextMenu.jsx';
import { FailureAlert } from '../../../ui/ui/FailureAlert.jsx';
import { EditorWritingBoard } from '../../settingLibraries/index.js';
import { createBackupOpening, duplicateOpening, moveBackupOpening, primaryFirstOpeningMessages, updateOpening } from '../model/openingEditing.js';
import '../../settingLibraries/styles/setting-workspace.css';
import '../styles/opening-workspace.css';

export const OpeningWorkspace = forwardRef(function OpeningWorkspace({ entry, query, onQueryChange, variableVersions, variableVersionsError, onChange, onRequestDelete, busy, dirty, save }, ref) {
  const tUi = useProductTranslation(), context = useEditorContextMenu();
  const messages = useMemo(() => primaryFirstOpeningMessages(entry), [entry]);
  const [selectedId, setSelectedId] = useState(messages[0].id), [more, setMore] = useState(false);
  const selected = messages.find(message => message.id === selectedId);
  const keyword = query.trim().toLocaleLowerCase();
  const visible = useMemo(() => messages.filter(message => !keyword || message.title.toLocaleLowerCase().includes(keyword) || message.content.toLocaleLowerCase().includes(keyword)), [messages, keyword]);

  useEffect(() => {
    if (selectedId && !messages.some(message => message.id === selectedId)) setSelectedId(messages[0].id);
  }, [messages, selectedId]);
  useEffect(() => { setMore(false); context.close(); }, [selectedId, query, busy]);
  function createBackup() {
    const result = createBackupOpening(entry);
    onChange(result.entry); onQueryChange(''); setSelectedId(result.createdId);
  }
  useImperativeHandle(ref, () => ({ createBackup }), [entry, onChange, onQueryChange]);
  function duplicate(message) {
    const result = duplicateOpening(entry, message.id);
    onChange(result.entry); onQueryChange(''); setSelectedId(result.createdId);
  }
  function actions(message) {
    const index = messages.findIndex(item => item.id === message.id);
    return [
      { id: 'copy', label: tUi('复制开场白'), icon: Copy, disabled: busy, run: () => duplicate(message) },
      { id: 'up', label: tUi('上移'), icon: ArrowUp, disabled: busy || index <= 1, run: () => onChange(moveBackupOpening(entry, message.id, -1)) },
      { id: 'down', label: tUi('下移'), icon: ArrowDown, disabled: busy || index === 0 || index === messages.length - 1, run: () => onChange(moveBackupOpening(entry, message.id, 1)) },
      { id: 'delete', label: tUi('删除开场白'), icon: Trash, disabled: busy || messages.length <= 1, danger: true, run: () => onRequestDelete(message) },
    ];
  }
  function listKeys(event, message) {
    if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) { context.open(event, message.id); return; }
    if (event.altKey && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault(); if (!busy) onChange(moveBackupOpening(entry, message.id, event.key === 'ArrowUp' ? -1 : 1)); return;
    }
    if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const index = visible.findIndex(item => item.id === message.id);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? visible.length - 1 : Math.max(0, Math.min(visible.length - 1, index + (event.key === 'ArrowUp' ? -1 : 1)));
      setSelectedId(visible[next].id);
      event.currentTarget.parentElement.children[next]?.querySelector('.opening-list-main')?.focus();
    }
  }
  const currentActions = selected ? actions(selected) : [];
  const contextMessage = context.menu && messages.find(message => message.id === context.menu.target);
  const inspector = selected && <>
    <header className="setting-entry-heading opening-entry-heading"><div className="setting-document-heading">
      <div className="setting-document-title"><ChatCircleDots size={21} /><h2>{selected.title || tUi('未命名开场白')}</h2></div>
      <Menu portal dense open={more} onClose={() => setMore(false)}
        anchor={<Button disabled={busy} data-dsh-control variant="outline" className="setting-folder-more" aria-label={tUi('开场白操作')} icon={<DotsThree size={18} />} aria-haspopup="menu" aria-expanded={more} onClick={() => setMore(!more)} />}
        items={currentActions.map(({ id, label, icon: Icon, disabled, danger }) => ({ id, label, icon: <Icon size={15} />, disabled, danger }))}
        onSelect={id => { setMore(false); currentActions.find(action => action.id === id)?.run(); }} />
    </div></header>
    <div className="opening-document-content">
      <div className="rs-fields opening-properties">
        <EditorField label={tUi('标题')}><Input disabled={busy} data-dsh-control className="rs-input" aria-label={tUi('标题')} value={selected.title} placeholder={tUi('未命名开场白')} onChange={event => onChange(updateOpening(entry, selected.id, { title: event.target.value }))} /></EditorField>
        <EditorField label={tUi('关联变量版本')}><select disabled={busy} aria-label={tUi('关联变量版本')} value={selected.variableVersionId || ''} onChange={event => onChange(updateOpening(entry, selected.id, { variableVersionId: event.target.value }))}>
          <option value="">{tUi('不关联变量')}</option>
          {selected.variableVersionId && !variableVersions.some(version => version.id === selected.variableVersionId) && <option value={selected.variableVersionId} disabled>{tUi('版本不存在')}</option>}
          {variableVersions.map(version => <option key={version.id} value={version.id}>{version.name || tUi('未命名版本')}</option>)}
        </select><FailureAlert failure={variableVersionsError} /></EditorField>
      </div>
      <div className="opening-body-field">
        <h3 className="opening-body-label">{tUi('开场白正文')}</h3>
        <EditorWritingBoard key={selected.id} disabled={busy} label={tUi('开场白正文')} showHeading={false} code={false} value={selected.content}
          placeholder={tUi('作为聊天记录中的第一条 Assistant 开场白使用。')} onChange={content => onChange(updateOpening(entry, selected.id, { content }))}
          className="opening-writing" status={dirty ? tUi('未保存') : tUi('已保存')} />
      </div>
    </div>
  </>;
  return <>
    <EditorLibraryWorkspace label={tUi('开场白')} query={query} onQueryChange={onQueryChange} inspector={inspector}
      directoryHeading={<h2 className="opening-directory-title">{tUi('开场白')}</h2>}
      directoryActions={<><Button disabled={busy} data-dsh-control variant="outline" className="setting-create" icon={<Plus size={16} />} aria-label={tUi('新建开场白')} onClick={createBackup}>{tUi('新建')}</Button>{save}</>}>
      <div className="opening-directory-list" onMouseDown={event => { if (!event.target.closest('.opening-list-item')) setSelectedId(''); }}>
        <div role="list" aria-label={tUi('开场白列表')}>{visible.map(message => <div key={message.id} role="listitem"
          className={`opening-list-item${selectedId === message.id ? ' is-selected' : ''}`} onClick={() => setSelectedId(message.id)} onKeyDown={event => listKeys(event, message)}
          onContextMenu={event => context.open(event, message.id)}>
          <button type="button" className="opening-list-main" disabled={busy} aria-current={selectedId === message.id ? 'true' : undefined} title={message.title || tUi('未命名开场白')}>
            <ChatCircleDots size={17} /><span className="opening-list-name">{message.title || tUi('未命名开场白')}</span>{message.id === messages[0].id && <span className="opening-primary-label">{tUi('主开场白')}</span>}
          </button>
          <div className="opening-list-tools" onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
            {actions(message).filter(action => message.id !== messages[0].id || !['up', 'down'].includes(action.id)).map(({ id, label, icon: Icon, disabled, run }) => <Button key={id} type="button" data-dsh-control variant="outline" className="opening-row-action" disabled={disabled} title={label} aria-label={label} icon={<Icon size={14} />} onClick={run} />)}
          </div>
        </div>)}</div>
        {!visible.length && <p className="opening-list-empty" role="status">{tUi('没有匹配的开场白')}</p>}
      </div>
    </EditorLibraryWorkspace>
    {contextMessage && <EditorContextMenu menu={context.menu} label={tUi('开场白操作')} actions={actions(contextMessage)} onClose={context.close} />}
  </>;
});
