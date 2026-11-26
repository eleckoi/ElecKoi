import { useProductTranslation } from "../app/i18n/ProductLocaleContext.jsx";
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes';
import { DesktopError } from '@shared/foundation/DesktopError';
import { MobileSaveFeedback } from './MobileSaveFeedback.jsx';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { MobileGeneralIcon, MobileOverflowIcon } from './MobileIcons.jsx';
import { Check, DotsThree } from '@phosphor-icons/react';
import { NotePencil } from '../ui/icons/interfaceIcons.jsx';
import defaultPresetAvatar from '../assets/eleckoi-app-icon.png';
import { ProviderLogo } from '../modules/models/components/ProviderLogo.jsx';
import { catalogItem } from '../modules/models/model/modelProviderCatalog.js';
import { useMainPageView } from '../app/windows/MainPageContext.jsx';
import { PresetProvider, PresetWorkspace, usePresets } from '../modules/presets/components/PresetPanel.jsx';
import { PRESET_MOBILE_SECTIONS } from '../modules/presets/components/PresetMobileSections.jsx';
import { PresetImportDialog, downloadPresetFile, fileBase64 } from '../modules/presets/components/PresetTransfer.jsx';
import { Avatar } from '../ui/ui/Avatar.jsx';
import { useCatalogSlots } from '../ui/ui/CatalogSlotsContext.jsx';
import { EditorPresentationContext, useEditorFeedbackHost } from '../ui/ui/EditorPresentationContext.jsx';
import { useMobileEditorCaret } from '../ui/hooks/useMobileEditorCaret.js';
import { MobileHeader, MobileState, useMobileBack, useMobileScroll } from './MobileChrome.jsx';
import { MobileActionMenu, MobileConfirm, MobileNameDialog, MobileSelectionHeader, MobileSelectionMark, useMobileOperation } from './MobileLibraryChrome.jsx';
import { MobileLibraryIcon } from './MobileLibraryIcons.jsx';
import { MobilePresetLibraryBar } from './MobilePresetLibraryBar.jsx';
import { PresetPurposeSwitch, isDefaultPreset } from '../modules/presets/components/PresetPurposeSwitch.jsx';
import './mobile-preset-editor.css';
import './mobile-preset-library.css';

export function MobilePresetsPage() {
  const view = useMainPageView();
  return <PresetProvider catalogModel={view.presets} navigationGuardRef={view.guardRef} fixedPresetId={view.route.kind === 'preset-editor' ? view.route.presetId : undefined}><MobilePresetLibrary /></PresetProvider>;
}

function MobilePresetLibrary() {
  const tUi = useProductTranslation();
  const view = useMainPageView();
  const { purposeCatalog: catalog, purpose, setPurpose, catalogModel, selectedPresetId, setSelectedPresetId, refresh, error: catalogError } = usePresets();
  const { render, actions } = useCatalogSlots();
  const [groupIds, setGroupIds] = useState({ roleplay: '', creator: '' });
  const groupId = groupIds[purpose];
  const setGroupId = id => setGroupIds(current => ({ ...current, [purpose]: id }));
  const [menu, setMenu] = useState(null);
  const [actionPreset, setActionPreset] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [groupEditing, setGroupEditing] = useState(false);
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
  const visible = (catalog?.presets || []).filter(preset => !groupId || preset.libraryGroupId === groupId);
  function selectPreset(id) {
    if (busy || groupEditing || !visible.some(preset => preset.id === id)) return;
    if (!selection) open(id);
    else if (selection !== 'delete' || !isDefaultPreset(id)) {
      setSelectedIds(ids => ids.includes(id) ? ids.filter(item => item !== id) : [...ids, id]);
    }
  }
  function selectAll() {
    setSelectedIds(ids => [...new Set([...ids, ...visible.filter(item => selection !== 'delete' || !isDefaultPreset(item.id)).map(item => item.id)])]);
  }
  function confirmSelection() {
    if (busy || !selectedIds.length) return;
    if (selection === 'delete') setDeleteOpen(true);
    else return finishSelection();
  }
  return <div className="mobile-root-page mobile-preset-page">
    <MobileHeader title={tUi("预设")} onSearch={groupEditing ? undefined : view.openSearch}
      renderSearch={fallback => render('eleckoi.preset.library.search', { surface: 'android', onOpen: view.openSearch }, fallback)}>
      <button type="button" aria-label={tUi("预设操作")} aria-haspopup="menu" aria-expanded={Boolean(menu)} disabled={busy || groupEditing || !catalog || Boolean(selection)} onClick={event => setMenu(event.currentTarget)}><MobileOverflowIcon /></button>
    </MobileHeader>
    <PresetPurposeSwitch compact value={purpose} disabled={busy || groupEditing || Boolean(selection)} onChange={value => { setPurpose(value); setActionPreset(null); setGroupsOpen(false); }} />
    {selection && render('eleckoi.preset.library.selection', {
      surface: 'android', purpose, mode: selection, selectedIds, busy, onCancel: cancelSelection, onConfirm: confirmSelection, onSelectAll: selectAll,
    }, <MobileSelectionHeader title={tUi("选择预设")} summary={<>{selectedIds.length}{tUi(" 项")}</>} busy={busy} onCancel={cancelSelection} onAll={selectAll}>
      {selection === 'export' && <select aria-label={tUi("导出格式")} value={format} onChange={event => setFormat(event.target.value)} disabled={busy}><option value="png">PNG</option><option value="json">JSON</option></select>}
      <button type="button" className={selection === 'delete' ? 'is-destructive' : 'is-confirm'} disabled={busy || !selectedIds.length} onClick={confirmSelection}>{selection === 'delete' ? tUi("删除") : tUi("导出")}</button>
    </MobileSelectionHeader>)}
    <div className="mobile-preset-library">
      {render('eleckoi.preset.library.groups', {
        surface: 'android', purpose, groups: catalog?.groups || [], allGroup: '', selectedGroup: groupId, onSelectGroup: setGroupId,
      }, <MobilePresetLibraryBar key={`groups:${purpose}`} groups={catalog?.groups || []} model={catalogModel} purpose={purpose} selected={groupId} onSelect={setGroupId}
        open={groupsOpen} onOpenChange={setGroupsOpen} disabled={busy || Boolean(selection) || !catalog} onEditingChange={setGroupEditing} />)}
      {catalog && render('eleckoi.preset.page.list', { surface: 'android', purpose, presets: visible, selectedPresetId, onSelect: selectPreset },
        <MobilePresetCards key={`cards:${purpose}`} purpose={purpose} presets={visible} activeId={catalog.activePresetIds[purpose]} selection={selection}
          selectedIds={selectedIds} busy={busy || groupEditing} onOpen={selectPreset} onActions={(preset, anchor) => setActionPreset({ preset, anchor })} />)}
    </div>
    <MobileState error={catalogError || error} loading={!catalog && !catalogError} onRetry={() => refresh()} />
    <input ref={inputRef} type="file" accept="application/json,image/png,.json,.png" hidden onChange={importFile} />
    {menu && <MobileActionMenu title={tUi("预设操作")} anchor={menu} onClose={() => setMenu(null)} actions={[
      { label: tUi("新建预设"), icon: <MobileLibraryIcon name="plus" />, action: () => { setMenu(null); setCreateOpen(true); } },
      { label: tUi("导入预设"), icon: <MobileLibraryIcon name="import" />, divider: true, action: () => { setMenu(null); setImportOpen(true); } },
      ...['export', 'delete'].map(mode => ({ label: mode === 'export' ? tUi("导出预设") : tUi("批量删除"), icon: <MobileLibraryIcon name={mode === 'export' ? 'export' : 'trash'} />, destructive: mode === 'delete', divider: mode === 'delete', action: () => { setMenu(null); setSelection(mode); setSelectedIds([]); setError(''); } })),
    ]}>
      {actions('eleckoi.preset.library.menu.actions', { surface: 'android', purpose, menu: 'bulk', busy, onDismiss: () => setMenu(null) })}
    </MobileActionMenu>}
    {createOpen && <MobileNameDialog title={tUi("新建预设")} onClose={() => setCreateOpen(false)} onSave={create} />}
    {importOpen && <PresetImportDialog onClose={() => setImportOpen(false)} onSelect={source => { importSource.current = source; setImportOpen(false); inputRef.current.click(); }} />}
    {actionPreset && <MobileActionMenu title={actionPreset.preset.name} anchor={actionPreset.anchor} onClose={() => setActionPreset(null)} busy={busy} error={error} actions={[
      { label: tUi("编辑预设"), icon: <NotePencil size={21} />, action: () => { open(actionPreset.preset.id); setActionPreset(null); } },
      ...(actionPreset.preset.id === catalog.activePresetIds[purpose] ? [] : [{ label: tUi("使用此预设"), icon: <MobileLibraryIcon name="plus" />, action: () => run(async () => { await catalogModel.setActive(actionPreset.preset.id); setActionPreset(null); }) }]),
      { label: tUi("移动到分组"), icon: <MobileLibraryIcon name="move" />, action: () => { setAssigning(actionPreset.preset); setAssignGroupId(actionPreset.preset.libraryGroupId); setActionPreset(null); } },
      ...['png', 'json'].map(value => ({ label: tUi("导出 {value0}", {value0: value.toUpperCase()}), icon: <MobileLibraryIcon name="export" />, divider: value === 'png', action: () => run(async () => { downloadPresetFile(await catalogModel.export(actionPreset.preset.id, value)); setActionPreset(null); }) })),
      ...(!isDefaultPreset(actionPreset.preset.id) ? [{ label: tUi("删除预设"), icon: <MobileLibraryIcon name="trash" />, destructive: true, divider: true, action: () => { setDeletePreset(actionPreset.preset); setActionPreset(null); } }] : []),
    ]}>
      {actions('eleckoi.preset.library.item.menu.actions', { surface: 'android', preset: actionPreset.preset, busy, onDismiss: () => setActionPreset(null) })}
    </MobileActionMenu>}
    {assigning && <MobileConfirm title={tUi("移动到分组")} confirmText={tUi("保存")} destructive={false} onClose={() => setAssigning(null)} busy={busy} error={error} onConfirm={() => run(async () => { await catalogModel.assignGroup(assigning.id, assignGroupId); setAssigning(null); })}><select className="mobile-library-name" aria-label={tUi("预设分组")} value={assignGroupId} onChange={event => setAssignGroupId(event.target.value)} disabled={busy}><option value="">{tUi("未分组")}</option>{catalog.groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select></MobileConfirm>}
    {(deletePreset || deleteOpen) && <MobileConfirm title={tUi("删除预设？")} onClose={() => { setDeletePreset(null); setDeleteOpen(false); }} busy={busy} error={error} onConfirm={deletePreset ? () => run(async () => { await catalogModel.delete(deletePreset.id); setDeletePreset(null); }) : finishSelection}>{deletePreset ? tUi("确认删除“{value0}”？", {value0: deletePreset.name}) : tUi("确认删除已选的 {value0} 项预设？", {value0: selectedIds.length})}</MobileConfirm>}
  </div>;
}

export function MobilePresetEditor() {
  const tUi = useProductTranslation();
  const mobileCaret = useMobileEditorCaret(true);
  const { feedback, registerSaveFeedback } = useEditorFeedbackHost();
  const view = useMainPageView();
  const [subpage, setSubpage] = useState(null);
  const registerSubpage = useCallback(page => {
    setSubpage(page);
    return () => setSubpage(current => current === page ? null : current);
  }, []);
  useMobileBack(() => { subpage.back(); return true; }, Boolean(subpage));
  return <EditorPresentationContext.Provider value={{ compact: true, sectionTitleInHeader: true, registerSubpage, registerSaveFeedback, registerBackHandler: view.registerBackHandler }}>
    <div className="mobile-root-page mobile-preset-editor" data-editor-subpage={Boolean(subpage) || undefined} {...mobileCaret}>
      <PresetWorkspace characterConfiguration={view.characterConfiguration} renderEditorSection={view.renderPresetEditorSection} onNotify={view.chat.notify}
        renderHeader={({ tab, profileEditing, dirty, saving, error, onSave }) =>
          <MobileHeader title={subpage?.title || tUi(PRESET_MOBILE_SECTIONS.find(section => section.id === tab)?.label ?? '预设')} back={subpage?.back || view.goBack}>
            {subpage?.actions}
            <MobileSaveFeedback error={error || feedback?.error} onNotify={view.chat.notify} />
            {!profileEditing && <button type="button" className="mobile-preset-save" disabled={!dirty || saving} onClick={onSave}>{saving ? tUi("保存中…") : tUi("保存")}</button>}
          </MobileHeader>}
        onTestRegex={(text, rule, target) => view.characterConfiguration.regexRules.test(text, rule, target)} />
    </div>
  </EditorPresentationContext.Provider>;
}

function MobilePresetCards({ presets, activeId, onOpen, onActions, selection = '', selectedIds = [], busy = false, purpose = 'roleplay' }) {
  const tUi = useProductTranslation();
  const { render } = useCatalogSlots();
  const ref = useMobileScroll(`presets:${purpose}`);
  return <div className="mobile-scroll mobile-preset-cards" ref={ref}>{presets.map(preset => {
    const active = preset.id === activeId;
    const selected = selectedIds.includes(preset.id);
    const onSelect = () => onOpen(preset.id);
    const onOpenMenu = selection || busy ? undefined : event => onActions(preset, event.currentTarget);
    return <Fragment key={preset.id}>{render('eleckoi.preset.library.item', {
      surface: 'android', preset, active, selected, selecting: Boolean(selection), onSelect, onOpenMenu,
    }, <article className={`mobile-preset-card${active ? ' is-active' : ''}`} data-selected={selection ? selected : undefined}>
    <button className="mobile-preset-open" type="button" aria-pressed={selection ? selected : undefined} disabled={busy || (selection === 'delete' && isDefaultPreset(preset.id))} onClick={onSelect}><strong>{preset.name}</strong>
      <span className="mobile-preset-author"><Avatar as="span" src={preset.profile.authorAvatarPath || defaultPresetAvatar} name={preset.profile.authorName || preset.name} /><span>{preset.profile.authorName || tUi("未署名")}</span></span>
      <span className="mobile-preset-footer"><MobilePresetTags tags={preset.modelTags} />{preset.id === activeId && <span className="mobile-preset-active"><Check size={13} weight="bold" />{tUi("使用中")}</span>}</span>
    </button>{selection ? <MobileSelectionMark selected={selected} /> : <button type="button" className="mobile-preset-actions" aria-label={tUi("{value0}的预设操作", {value0: preset.name})} aria-haspopup="menu" disabled={busy} onClick={onOpenMenu}><DotsThree size={25} /></button>}
  </article>)}</Fragment>;
  })}{!presets.length && <MobileState empty={tUi("暂无预设")} />}</div>;
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
