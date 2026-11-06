import { useProductTranslation } from "../app/i18n/ProductLocaleContext.jsx";
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes';
import { DesktopError } from '@shared/foundation/DesktopError';
import { MobileSaveFeedback } from './MobileSaveFeedback.jsx';
import { useCallback, useEffect, useRef, useState } from 'react';
import { MobileGeneralIcon, MobileOverflowIcon, MobileSettingsIcon } from './MobileIcons.jsx';
import { Plus, CheckCircle } from '@phosphor-icons/react';
import defaultPresetAvatar from '../assets/eleckoi-app-icon.png';
import { ProviderLogo } from '../modules/models/components/ProviderLogo.jsx';
import { catalogItem } from '../modules/models/model/modelProviderCatalog.js';
import { useMainPageView } from '../app/windows/MainPageContext.jsx';
import { PresetProvider, PresetWorkspace, usePresets } from '../modules/presets/components/PresetPanel.jsx';
import { PresetImportDialog, downloadPresetFile, fileBase64 } from '../modules/presets/components/PresetTransfer.jsx';
import { Avatar } from '../ui/ui/Avatar.jsx';
import { EditorPresentationContext, useEditorFeedbackHost } from '../ui/ui/EditorPresentationContext.jsx';
import { MobileHeader, MobileSearch, MobileState, useMobileBack, useMobileScroll } from './MobileChrome.jsx';
import { MobileActionMenu, MobileConfirm, MobileNameDialog, MobileSelectionHeader, useMobileOperation } from './MobileLibraryChrome.jsx';
import { MobileLibraryIcon } from './MobileLibraryIcons.jsx';
import { MobilePresetGroups } from './MobilePresetGroups.jsx';
import { PresetPurposeSwitch, isDefaultPreset } from '../modules/presets/components/PresetPurposeSwitch.jsx';
import './mobile-preset-editor.css';

export function MobilePresetsPage() {
  const view = useMainPageView();
  return <PresetProvider catalogModel={view.presets} navigationGuardRef={view.guardRef}><MobilePresetLibrary /></PresetProvider>;
}

function MobilePresetLibrary() {
  const tUi = useProductTranslation();
  const view = useMainPageView();
  const { purposeCatalog: catalog, purpose, setPurpose, catalogModel, setSelectedPresetId, refresh, error: catalogError } = usePresets();
  const [keyword, setKeyword] = useState('');
  const [searching, setSearching] = useState(false);
  const [groupIds, setGroupIds] = useState({ roleplay: '', creator: '' });
  const groupId = groupIds[purpose];
  const setGroupId = id => setGroupIds(current => ({ ...current, [purpose]: id }));
  const [menu, setMenu] = useState(null);
  const [actionPreset, setActionPreset] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [groupDialog, setGroupDialog] = useState(null);
  const [assigning, setAssigning] = useState(null);
  const [assignGroupId, setAssignGroupId] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [deletePreset, setDeletePreset] = useState(null);
  const [selection, setSelection] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [format, setFormat] = useState('png');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const { busy, error, setError, run } = useMobileOperation();
  const inputRef = useRef(null);
  const importSource = useRef('');
  useEffect(() => { if (catalog && groupId && !catalog.groups.some(group => group.id === groupId)) setGroupId(''); }, [catalog, groupId]);
  const cancelSelection = () => { if (!busy) { setSelection(''); setSelectedIds([]); setError(''); } };
  useMobileBack(() => { cancelSelection(); return true; }, Boolean(selection));
  function open(presetId) {
    setSelectedPresetId(presetId);
    view.pushRoute({ kind: 'preset-editor', presetId });
  }
  async function create(name) {
    const preset = await catalogModel.create(name, groupId, purpose);
    setCreateOpen(false); open(preset.id);
  }
  async function finishSelection() {
    if (!selectedIds.length) return;
    await run(async () => {
      const failures = [];
      for (const id of selectedIds) {
        try {
          if (selection === 'delete') await catalogModel.delete(id);
          else downloadPresetFile(await catalogModel.export(id, format));
        } catch (cause) { failures.push({ id, message: `${catalog.presets.find(item => item.id === id)?.name || id}：${cause instanceof Error ? cause.message : String(cause)}` }); }
      }
      if (failures.length) { setSelectedIds(failures.map(item => item.id)); throw new DesktopError(ELECKOI_FAILURE_CODES.internal, failures.map(item => item.message).join('\n'), { what: '批量预设操作' }); }
      setSelection(''); setSelectedIds([]); setDeleteOpen(false);
    });
  }
  async function importFile(event) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    await run(async () => {
      const result = await catalogModel.import(importSource.current, { displayName: file.name, mimeType: file.type, base64: await fileBase64(file) }, purpose);
      open(result.preset.id);
    });
  }
  if (view.route.kind === 'preset-editor') return <MobilePresetEditor />;
  if (view.route.kind === 'preset-groups' && catalog) return <MobilePresetGroups catalog={catalog} model={catalogModel} purpose={purpose} onClose={view.goBack} />;
  const visible = (catalog?.presets || []).filter(preset => (searching || !groupId || preset.libraryGroupId === groupId) && (!keyword || `${preset.name} ${preset.profile.authorName}`.toLocaleLowerCase().includes(keyword.toLocaleLowerCase())));
  return <div className="mobile-root-page">
    <MobileHeader title={tUi("预设")} onSearch={() => setSearching(value => !value)}><button type="button" aria-label={tUi("预设操作")} aria-haspopup="menu" aria-expanded={Boolean(menu)} disabled={busy || !catalog || Boolean(selection)} onClick={event => setMenu(event.currentTarget)}><MobileOverflowIcon /></button></MobileHeader>
    <PresetPurposeSwitch value={purpose} disabled={busy || Boolean(selection)} onChange={value => { setPurpose(value); setKeyword(''); setActionPreset(null); }} />
    {searching && <MobileSearch value={keyword} onChange={setKeyword} label={tUi("搜索预设")} />}
    {selection && <MobileSelectionHeader title={tUi("选择预设")} busy={busy} onCancel={cancelSelection} onAll={() => setSelectedIds([...new Set([...selectedIds, ...visible.filter(item => selection !== 'delete' || !isDefaultPreset(item.id)).map(item => item.id)])])} />}
    <div className={`mobile-preset-library${searching ? ' is-searching' : ''}`}>
      {!searching && <nav className="mobile-preset-groups" aria-label={tUi("预设分组")}>
        <button type="button" aria-current={!groupId ? 'page' : undefined} onClick={() => setGroupId('')}>{tUi("全部预设")}<span>{catalog?.presets.length || 0}</span></button>
        {(catalog?.groups || []).map(group => <div className={`mobile-preset-group${groupId === group.id ? ' is-selected' : ''}`} key={group.id}>
          <button type="button" aria-current={groupId === group.id ? 'page' : undefined} onClick={() => setGroupId(group.id)}>{group.name}<span>{catalog.presets.filter(preset => preset.libraryGroupId === group.id).length}</span></button>
          {groupId === group.id && <button type="button" className="mobile-preset-group-manage" aria-label={tUi("管理分组 {value0}", {value0: group.name})} disabled={busy || Boolean(selection)} onClick={() => view.pushRoute({ kind: 'preset-groups' })}><MobileSettingsIcon /></button>}
        </div>)}
        <button type="button" className="mobile-preset-create-group" disabled={busy || Boolean(selection)} onClick={() => setGroupDialog({ mode: 'create' })}><Plus size={15} weight="regular" /><span>{tUi("新建分组")}</span></button>
      </nav>}
      <MobilePresetCards key={purpose} purpose={purpose} presets={visible} activeId={catalog?.activePresetIds[purpose]} selection={selection} selectedIds={selectedIds} busy={busy} onOpen={id => {
        if (!selection) open(id);
        else setSelectedIds(ids => ids.includes(id) ? ids.filter(item => item !== id) : [...ids, id]);
      }} onActions={(preset, anchor) => setActionPreset({ preset, anchor })} />
    </div>
    <MobileState error={catalogError || error} loading={!catalog && !catalogError} onRetry={() => refresh()} />
    {selection && <div className="mobile-selection-bar"><span>{selectedIds.length}{tUi(" 项")}</span>{selection === 'export' && <select aria-label={tUi("导出格式")} value={format} onChange={event => setFormat(event.target.value)} disabled={busy}><option value="png">PNG</option><option value="json">JSON</option></select>}<button type="button" disabled={busy || !selectedIds.length} onClick={() => selection === 'delete' ? setDeleteOpen(true) : finishSelection()}>{selection === 'delete' ? tUi("删除") : tUi("导出")}</button></div>}
    <input ref={inputRef} type="file" accept="application/json,image/png,.json,.png" hidden onChange={importFile} />
    {menu && <MobileActionMenu title={tUi("预设操作")} anchor={menu} onClose={() => setMenu(null)} actions={[
      { label: tUi("新建预设"), icon: <MobileLibraryIcon name="plus" />, action: () => { setMenu(null); setCreateOpen(true); } },
      { label: tUi("导入预设"), icon: <MobileLibraryIcon name="import" />, divider: true, action: () => { setMenu(null); setImportOpen(true); } },
      ...['export', 'delete'].map(mode => ({ label: mode === 'export' ? tUi("导出预设") : tUi("批量删除"), icon: <MobileLibraryIcon name={mode === 'export' ? 'export' : 'trash'} />, destructive: mode === 'delete', divider: mode === 'delete', action: () => { setMenu(null); setSelection(mode); setSelectedIds([]); setError(''); } })),
    ]} />}
    {createOpen && <MobileNameDialog title={tUi("新建预设")} onClose={() => setCreateOpen(false)} onSave={create} />}
    {importOpen && <PresetImportDialog onClose={() => setImportOpen(false)} onSelect={source => { importSource.current = source; setImportOpen(false); inputRef.current.click(); }} />}
    {actionPreset && <MobileActionMenu title={actionPreset.preset.name} anchor={actionPreset.anchor} onClose={() => setActionPreset(null)} busy={busy} error={error} actions={[
      { label: tUi("编辑预设"), icon: <MobileLibraryIcon name="pencil" />, action: () => { open(actionPreset.preset.id); setActionPreset(null); } },
      ...(actionPreset.preset.id === catalog.activePresetIds[purpose] ? [] : [{ label: tUi("使用此预设"), icon: <MobileLibraryIcon name="plus" />, action: () => run(async () => { await catalogModel.setActive(actionPreset.preset.id); setActionPreset(null); }) }]),
      { label: tUi("移动到分组"), icon: <MobileLibraryIcon name="gear" />, action: () => { setAssigning(actionPreset.preset); setAssignGroupId(actionPreset.preset.libraryGroupId); setActionPreset(null); } },
      ...['png', 'json'].map(value => ({ label: tUi("导出 {value0}", {value0: value.toUpperCase()}), icon: <MobileLibraryIcon name="export" />, divider: value === 'png', action: () => run(async () => { downloadPresetFile(await catalogModel.export(actionPreset.preset.id, value)); setActionPreset(null); }) })),
      ...(!isDefaultPreset(actionPreset.preset.id) ? [{ label: tUi("删除预设"), icon: <MobileLibraryIcon name="trash" />, destructive: true, divider: true, action: () => { setDeletePreset(actionPreset.preset); setActionPreset(null); } }] : []),
    ]} />}
    {assigning && <MobileConfirm title={tUi("移动到分组")} confirmText={tUi("保存")} destructive={false} onClose={() => setAssigning(null)} busy={busy} error={error} onConfirm={() => run(async () => { await catalogModel.assignGroup(assigning.id, assignGroupId); setAssigning(null); })}><select className="mobile-library-name" aria-label={tUi("预设分组")} value={assignGroupId} onChange={event => setAssignGroupId(event.target.value)} disabled={busy}><option value="">{tUi("未分组")}</option>{catalog.groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select></MobileConfirm>}
    {(deletePreset || deleteOpen) && <MobileConfirm title={tUi("删除预设？")} onClose={() => { setDeletePreset(null); setDeleteOpen(false); }} busy={busy} error={error} onConfirm={deletePreset ? () => run(async () => { await catalogModel.delete(deletePreset.id); setDeletePreset(null); }) : finishSelection}>{deletePreset ? tUi("确认删除“{value0}”？", {value0: deletePreset.name}) : tUi("确认删除已选的 {value0} 项预设？", {value0: selectedIds.length})}</MobileConfirm>}
    {groupDialog && <MobileNameDialog title={tUi("新建分组")} onClose={() => setGroupDialog(null)} onSave={name => catalogModel.createGroup(name, purpose)} />}
  </div>;
}

export function MobilePresetEditor() {
  const tUi = useProductTranslation();
  const { feedback, registerSaveFeedback } = useEditorFeedbackHost();
  const view = useMainPageView();
  const [subpage, setSubpage] = useState(null);
  const registerSubpage = useCallback(page => {
    setSubpage(page);
    return () => setSubpage(current => current === page ? null : current);
  }, []);
  useMobileBack(() => { subpage.back(); return true; }, Boolean(subpage));
  return <EditorPresentationContext.Provider value={{ compact: true, registerSubpage, registerSaveFeedback }}>
    <div className="mobile-root-page mobile-preset-editor" data-editor-subpage={Boolean(subpage) || undefined}>
      <PresetWorkspace characterConfiguration={view.characterConfiguration} renderEditorSection={view.renderPresetEditorSection} onNotify={view.chat.notify}
        renderHeader={({ tab, profileEditing, dirty, saving, error, active, onActivate, onSave }) => <>
          <MobileHeader title={subpage?.title || tUi("预设")} back={subpage?.back || view.goBack}>
            {subpage?.actions}
            <MobileSaveFeedback error={error || feedback?.error} onNotify={view.chat.notify} />
            {tab === 'introduction' && !profileEditing && !subpage && <button type="button" className="mobile-preset-activate" disabled={!onActivate || active || saving} onClick={onActivate}>{tUi("启用")}</button>}
            {tab !== 'introduction' && !profileEditing && !subpage && <button type="button" className="mobile-preset-save" disabled={!dirty || saving} onClick={onSave}>{saving ? tUi("保存中…") : tUi("保存")}</button>}
          </MobileHeader>
        </>}
        onTestRegex={(text, rule, target) => view.characterConfiguration.regexRules.test(text, rule, target)} />
    </div>
  </EditorPresentationContext.Provider>;
}

export function MobilePresetCards({ presets, activeId, onOpen, onActions, selection = '', selectedIds = [], busy = false, purpose = 'roleplay' }) {
  const tUi = useProductTranslation();
  const ref = useMobileScroll(`presets:${purpose}`);
  return <div className="mobile-scroll mobile-preset-cards" ref={ref}>{presets.map(preset => <article className={`mobile-preset-card${preset.id === activeId ? ' is-active' : ''}`} key={preset.id} data-selected={selection ? selectedIds.includes(preset.id) : undefined}>
    <button className="mobile-preset-open" type="button" aria-pressed={selection ? selectedIds.includes(preset.id) : undefined} disabled={busy || (selection === 'delete' && isDefaultPreset(preset.id))} onClick={() => onOpen(preset.id)}><strong>{preset.name}</strong>
      <span className="mobile-preset-author"><Avatar as="span" src={preset.profile.authorAvatarPath || defaultPresetAvatar} name={preset.profile.authorName || preset.name} /><span>{preset.profile.authorName || tUi("未署名")}</span></span>
      <span className="mobile-preset-footer"><MobilePresetTags tags={preset.modelTags} />{preset.id === activeId && <span className="mobile-preset-active">{tUi("使用中")}</span>}</span>
    </button>{selection ? <CheckCircle className="mobile-card-check" size={23} weight={selectedIds.includes(preset.id) ? 'fill' : 'regular'} /> : <button type="button" className="mobile-preset-actions" aria-label={tUi("{value0}的预设操作", {value0: preset.name})} aria-haspopup="menu" disabled={busy} onClick={event => onActions(preset, event.currentTarget)}><MobileSettingsIcon /></button>}
  </article>)}{!presets.length && <MobileState empty={tUi("暂无预设")} />}</div>;
}

function MobilePresetTags({ tags }) {
  const tUi = useProductTranslation();
  const tag = tags[0];
  const provider = tag?.providerId ? catalogItem(tag.providerId, tUi) : null;
  return <span className="mobile-preset-tags">{tag && <>
    {tag.id === 'general' ? <MobileGeneralIcon /> : provider?.id === tag.providerId && <ProviderLogo provider={provider} className="mobile-preset-provider-icon" />}
    <span className="mobile-preset-tag-label">{tag.label}</span>{tags.length > 1 && <span className="mobile-preset-tag-count">+{tags.length - 1}</span>}
  </>}</span>;
}
