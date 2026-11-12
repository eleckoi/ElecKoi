import { useId, useLayoutEffect, useRef, useState } from 'react';
import { Button, Input, Menu, SegmentedTabs } from '@deepseek-ai/dsh-client-ui-primitives';
import { CaretDown, DotsThree, LinkSimple, Trash } from '../../../ui/icons/interfaceIcons.jsx';
import { DshFolderClosedIcon } from '../../../ui/icons/dshTreeIcons.jsx';
import { useProductTranslation } from '../../../app/i18n/ProductLocaleContext.jsx';
import { FIXED_ENTRY_IDS } from '../model/settingLibraryEditing.js';
import { ContentSection, InsertSection, SettingEntryGlyph, TriggerSection } from './SettingLibraryEntryEditor.jsx';
import { SettingWorkspaceContext } from './SettingPropertyFields.jsx';
import { SettingEntryIconPicker } from './SettingEntryIconPicker.jsx';
import { MarkdownTextareaField } from './MarkdownTextareaField.jsx';
import { CustomPositionManager } from './CustomPositionManager.jsx';

export function SettingLibraryDocument({ selected, library, nameInputRef, SelectedIcon, onUpdateGroup, onDeleteGroup, onUpdateEntry, onEntriesChange, onOpenEntry, dirty, saving, creatorPreset = false, allowCustomPromptPositions = false, onPromptPositionsChange, titleReadOnly = false, entryActions, hideReferenceTabs = false }) {
  const tUi = useProductTranslation();
  const [view, setView] = useState('content'), [iconsOpen, setIconsOpen] = useState(false);
  const [folderMenuOpen, setFolderMenuOpen] = useState(false);
  const [positions, setPositions] = useState(false);
  const documentRef = useRef(null), settingsScroll = useRef(0), returning = useRef(false);
  useLayoutEffect(() => {
    const scroller = documentRef.current?.closest('.mobile-editor-document');
    if (positions) { if (scroller) scroller.scrollTop = 0; }
    else if (returning.current) {
      returning.current = false;
      if (scroller) scroller.scrollTop = settingsScroll.current;
      documentRef.current?.parentElement.querySelector('.setting-library-position-manage')?.focus({ preventScroll: true });
    }
  }, [positions]);
  function openPositions() {
    settingsScroll.current = documentRef.current?.closest('.mobile-editor-document')?.scrollTop || 0;
    setIconsOpen(false);
    setPositions(true);
  }
  const [toolbarHost, setToolbarHost] = useState(null), [immersiveHost, setImmersiveHost] = useState(null);
  const nameId = useId();
  const entry = selected.value, group = selected.kind === 'group';
  const reference = !group && entry.dynamicMode === 'ejs_reference', fixed = !group && FIXED_ENTRY_IDS.has(entry.id);
  const normal = !group && !reference && !fixed;
  const Glyph = group ? DshFolderClosedIcon : reference ? LinkSimple : fixed ? SelectedIcon : null;
  const updateName = title => group ? onUpdateGroup({ name: title }) : onUpdateEntry({ ...entry, title });
  if (positions) return <SettingWorkspaceContext.Provider value><div ref={documentRef} className="setting-position-page">
    <CustomPositionManager entry={entry} positions={library.promptPositions} entries={library.entries} onChange={onPromptPositionsChange}
      onBack={() => { returning.current = true; setPositions(false); }} />
  </div></SettingWorkspaceContext.Provider>;
  return <SettingWorkspaceContext.Provider value>
    <header ref={documentRef} className="setting-entry-heading">
      <div className="setting-document-heading">
        <div className="setting-document-title"><div className="setting-glyph-anchor">
          {normal ? <button type="button" className="setting-glyph" disabled={titleReadOnly} aria-label={tUi('更改条目图标')} aria-expanded={iconsOpen === 'title'} onClick={() => setIconsOpen(iconsOpen === 'title' ? false : 'title')}><SettingEntryGlyph iconId={entry.iconId} size={21} /></button> : <Glyph size={21} />}
          {iconsOpen === 'title' && <SettingEntryIconPicker entry={entry} onChange={onUpdateEntry} onClose={() => setIconsOpen(false)} />}
        </div><input ref={nameInputRef} aria-label={group ? tUi('文件夹名称') : tUi('条目标题')} placeholder={group ? tUi('文件夹名称') : tUi('条目标题/待命名')}
          value={group ? entry.name : entry.title} readOnly={fixed || titleReadOnly} onChange={event => updateName(event.target.value)} /></div>
        <div className="setting-document-actions">
          {entryActions}
          {group && <Menu open={folderMenuOpen} portal dense onClose={() => setFolderMenuOpen(false)}
            anchor={<Button data-dsh-control variant="outline" className="setting-folder-more" icon={<DotsThree size={18} />}
              aria-label={tUi('文件夹操作')} title={tUi('文件夹操作')} aria-haspopup="menu" aria-expanded={folderMenuOpen} disabled={saving}
              onClick={() => setFolderMenuOpen(!folderMenuOpen)} />}
            items={[{ id: 'delete', label: tUi('删除文件夹'), icon: <Trash size={15} />, danger: true }]}
            onSelect={id => { setFolderMenuOpen(false); if (id === 'delete') onDeleteGroup(); }} />}
        </div>
      </div>
      {!group && <div className="setting-editor-tools" role="toolbar" aria-label={tUi('设定编辑操作')}>
        {!fixed && (!reference || !hideReferenceTabs) ? <SegmentedTabs size="sm" className="setting-view-switch" label={tUi('设定编辑视图')} value={view} onChange={next => { setView(next); setIconsOpen(false); }}
          items={[{ value: 'content', label: tUi('正文') }, { value: 'settings', label: tUi('设置') }]} /> : null}
        <div className="setting-content-tools" ref={setToolbarHost} />
      </div>}
    </header>
    {group ? <div className="setting-settings-board setting-group-settings"><section className="setting-entry-basics"><h2>{tUi('基本信息')}</h2>
      <div className="setting-property-row"><label className="setting-property-label" htmlFor={nameId}>{tUi('名称')}</label><div className="setting-identity-control"><Input data-dsh-control className="setting-entry-name" id={nameId} value={entry.name} onChange={event => updateName(event.target.value)} /></div></div>
    </section></div> : view === 'content' || fixed || reference && hideReferenceTabs ? <div className="setting-writing-board">
      {normal ? <ContentSection entry={entry} entries={library.entries} onChange={onUpdateEntry} onOpenEntry={onOpenEntry} creatorPreset={creatorPreset} toolbarHost={toolbarHost} immersiveHost={immersiveHost} /> :
        <MarkdownTextareaField label={reference ? tUi('EJS引用正文') : entry.kind === 'history_compaction' ? tUi('摘要模板') : tUi('设定正文')}
          placeholder={reference ? tUi('填写供 EJS 控制器读取的内容') : tUi('填写设定正文')} value={entry.content} onChange={content => onUpdateEntry({ ...entry, content })} toolbarHost={toolbarHost} immersiveHost={immersiveHost} />}
      <footer className="setting-editor-status"><span>{saving ? tUi('保存中…') : dirty ? tUi('未保存') : tUi('已保存')}</span>
        <div className="setting-footer-tools"><span>{tUi('{value0} 字符', { value0: entry.content.length })}</span><div className="setting-immersive-host" ref={setImmersiveHost} /></div></footer>
    </div> : <div className="setting-settings-board">
      <section className="setting-entry-basics" aria-label={tUi('基本信息')}><h2>{tUi('基本信息')}</h2>
        <div className="setting-property-row"><label className="setting-property-label" htmlFor={nameId}>{tUi('名称')}</label>
          <div className="setting-identity-control">{normal && <div className="setting-basic-icon-anchor"><Button data-dsh-control variant="outline" className="setting-basic-icon-button"
            disabled={titleReadOnly} aria-label={tUi('选择条目图标')} aria-expanded={iconsOpen === 'settings'} onClick={() => setIconsOpen(iconsOpen === 'settings' ? false : 'settings')}><SettingEntryGlyph iconId={entry.iconId} size={20} /><CaretDown size={12} /></Button>
            {iconsOpen === 'settings' && <SettingEntryIconPicker entry={entry} onChange={onUpdateEntry} onClose={() => setIconsOpen(false)} />}</div>}
            <Input data-dsh-control id={nameId} className="setting-entry-name" readOnly={titleReadOnly} aria-label={tUi('设定名称')} value={entry.title} onChange={event => updateName(event.target.value)} /></div></div>
      </section>
      {normal && <><section className="setting-reading-settings"><h2>{tUi('读取与触发')}</h2><div className="setting-property-basic"><TriggerSection entry={entry} onChange={onUpdateEntry} creatorPreset={creatorPreset} /></div></section>
        {entry.triggerMode === 'always' && <section className="setting-insert-settings"><h2>{tUi('插入与顺序')}</h2><InsertSection entry={entry} entries={library.entries} promptPositions={library.promptPositions} allowCustomPromptPositions={allowCustomPromptPositions} onChange={onUpdateEntry} onEntriesChange={onEntriesChange} onManagePositions={openPositions} /></section>}</>}
    </div>}
  </SettingWorkspaceContext.Provider>;
}
