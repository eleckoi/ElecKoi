import { useId, useState } from 'react';
import { Button, Input, Menu, SegmentedTabs } from '@deepseek-ai/dsh-client-ui-primitives';
import { CaretDown, DotsThree, LinkSimple, Trash } from '../../../ui/icons/interfaceIcons.jsx';
import { DshFolderClosedIcon } from '../../../ui/icons/dshTreeIcons.jsx';
import { useProductTranslation } from '../../../app/i18n/ProductLocaleContext.jsx';
import { FIXED_ENTRY_IDS } from '../model/settingLibraryEditing.js';
import { ContentSection, InsertSection, SettingEntryGlyph, TriggerSection } from './SettingLibraryEntryEditor.jsx';
import { SettingWorkspaceContext } from './SettingPropertyFields.jsx';
import { SettingEntryIconPicker } from './SettingEntryIconPicker.jsx';
import { MarkdownTextareaField } from './MarkdownTextareaField.jsx';

export function SettingLibraryDocument({ selected, library, nameInputRef, SelectedIcon, onUpdateGroup, onDeleteGroup, onUpdateEntry, onEntriesChange, onOpenEntry, dirty, saving }) {
  const tUi = useProductTranslation();
  const [view, setView] = useState('content'), [iconsOpen, setIconsOpen] = useState(false);
  const [folderMenuOpen, setFolderMenuOpen] = useState(false);
  const [toolbarHost, setToolbarHost] = useState(null), [immersiveHost, setImmersiveHost] = useState(null);
  const nameId = useId();
  const entry = selected.value, group = selected.kind === 'group';
  const reference = !group && entry.dynamicMode === 'ejs_reference', fixed = !group && FIXED_ENTRY_IDS.has(entry.id);
  const normal = !group && !reference && !fixed;
  const Glyph = group ? DshFolderClosedIcon : reference ? LinkSimple : fixed ? SelectedIcon : null;
  const updateName = title => group ? onUpdateGroup({ name: title }) : onUpdateEntry({ ...entry, title });
  return <SettingWorkspaceContext.Provider value>
    <header className="setting-entry-heading">
      <div className="setting-document-heading">
        <div className="setting-document-title"><div className="setting-glyph-anchor">
          {normal ? <button type="button" className="setting-glyph" aria-label={tUi('更改条目图标')} aria-expanded={iconsOpen === 'title'} onClick={() => setIconsOpen(iconsOpen === 'title' ? false : 'title')}><SettingEntryGlyph iconId={entry.iconId} size={21} /></button> : <Glyph size={21} />}
          {iconsOpen === 'title' && <SettingEntryIconPicker entry={entry} onChange={onUpdateEntry} onClose={() => setIconsOpen(false)} />}
        </div><input ref={nameInputRef} aria-label={group ? tUi('文件夹名称') : tUi('条目标题')} placeholder={group ? tUi('文件夹名称') : tUi('条目标题/待命名')}
          value={group ? entry.name : entry.title} readOnly={fixed} onChange={event => updateName(event.target.value)} /></div>
        <div className="setting-document-actions">
          {group && <Menu open={folderMenuOpen} portal dense onClose={() => setFolderMenuOpen(false)}
            anchor={<Button data-dsh-control variant="outline" className="setting-folder-more" icon={<DotsThree size={18} />}
              aria-label={tUi('文件夹操作')} title={tUi('文件夹操作')} aria-haspopup="menu" aria-expanded={folderMenuOpen} disabled={saving}
              onClick={() => setFolderMenuOpen(!folderMenuOpen)} />}
            items={[{ id: 'delete', label: tUi('删除文件夹'), icon: <Trash size={15} />, danger: true }]}
            onSelect={id => { setFolderMenuOpen(false); if (id === 'delete') onDeleteGroup(); }} />}
        </div>
      </div>
      {!group && <div className="setting-editor-tools" role="toolbar" aria-label={tUi('设定编辑操作')}>
        {!fixed ? <SegmentedTabs size="sm" className="setting-view-switch" label={tUi('设定编辑视图')} value={view} onChange={next => { setView(next); setIconsOpen(false); }}
          items={[{ value: 'content', label: tUi('正文') }, { value: 'settings', label: tUi('设置') }]} /> : null}
        <div className="setting-content-tools" ref={setToolbarHost} />
      </div>}
    </header>
    {group ? <div className="setting-settings-board setting-group-settings"><section className="setting-entry-basics"><h2>{tUi('基本信息')}</h2>
      <div className="setting-property-row"><label className="setting-property-label" htmlFor={nameId}>{tUi('名称')}</label><div className="setting-identity-control"><Input data-dsh-control className="setting-entry-name" id={nameId} value={entry.name} onChange={event => updateName(event.target.value)} /></div></div>
    </section></div> : view === 'content' || fixed ? <div className="setting-writing-board">
      {normal ? <ContentSection entry={entry} entries={library.entries} onChange={onUpdateEntry} onOpenEntry={onOpenEntry} creatorPreset={false} toolbarHost={toolbarHost} immersiveHost={immersiveHost} /> :
        <MarkdownTextareaField label={reference ? tUi('EJS引用正文') : entry.kind === 'history_compaction' ? tUi('摘要模板') : tUi('设定正文')}
          placeholder={reference ? tUi('填写供 EJS 控制器读取的内容') : tUi('填写设定正文')} value={entry.content} onChange={content => onUpdateEntry({ ...entry, content })} toolbarHost={toolbarHost} immersiveHost={immersiveHost} />}
      <footer className="setting-editor-status"><span>{saving ? tUi('保存中…') : dirty ? tUi('未保存') : tUi('已保存')}</span>
        <div className="setting-footer-tools"><span>{tUi('{value0} 字符', { value0: entry.content.length })}</span><div className="setting-immersive-host" ref={setImmersiveHost} /></div></footer>
    </div> : <div className="setting-settings-board">
      <section className="setting-entry-basics" aria-label={tUi('基本信息')}><h2>{tUi('基本信息')}</h2>
        <div className="setting-property-row"><label className="setting-property-label" htmlFor={nameId}>{tUi('名称')}</label>
          <div className="setting-identity-control">{normal && <div className="setting-basic-icon-anchor"><Button data-dsh-control variant="outline" className="setting-basic-icon-button"
            aria-label={tUi('选择条目图标')} aria-expanded={iconsOpen === 'settings'} onClick={() => setIconsOpen(iconsOpen === 'settings' ? false : 'settings')}><SettingEntryGlyph iconId={entry.iconId} size={20} /><CaretDown size={12} /></Button>
            {iconsOpen === 'settings' && <SettingEntryIconPicker entry={entry} onChange={onUpdateEntry} onClose={() => setIconsOpen(false)} />}</div>}
            <Input data-dsh-control id={nameId} className="setting-entry-name" aria-label={tUi('设定名称')} value={entry.title} onChange={event => updateName(event.target.value)} /></div></div>
      </section>
      {normal && <><section className="setting-reading-settings"><h2>{tUi('读取与触发')}</h2><div className="setting-property-basic"><TriggerSection entry={entry} onChange={onUpdateEntry} creatorPreset={false} /></div></section>
        {entry.triggerMode === 'always' && <section className="setting-insert-settings"><h2>{tUi('插入与顺序')}</h2><InsertSection entry={entry} entries={library.entries} promptPositions={library.promptPositions} allowCustomPromptPositions={false} onChange={onUpdateEntry} onEntriesChange={onEntriesChange} /></section>}</>}
    </div>}
  </SettingWorkspaceContext.Provider>;
}
