import { sourceText } from '../../../app/i18n/productCopy.js';
import { useProductTranslation } from '../../../app/i18n/ProductLocaleContext.jsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle } from '@phosphor-icons/react';
import { CharacterManagerIcon, ChevronRightIcon, ImportIcon, PlusIcon, TrashIcon } from '../../../ui/icons/index.jsx';
import { Avatar } from '../../../ui/ui/Avatar.jsx';
import { SidebarSectionHeader } from '../../../ui/ui/SidebarSectionHeader.jsx';
import { useSidebarListScroll } from '../../../ui/hooks/useSidebarListScroll.js';
import { SidebarScrollArea } from '../../../ui/ui/SidebarScrollArea.jsx';
import { useSidebarGroupCollapse } from '../../../ui/hooks/useSidebarGroupCollapse.js';
import { ConfirmationDialog } from '../../../ui/ui/ConfirmationDialog.jsx';
import defaultPresetAvatar from '../../../assets/eleckoi-app-icon.png';
import { LIST_COLLAPSE_AREAS } from '../../../ui/state/listCollapseState.js';
import { usePersistentCollapseState } from '../../../ui/hooks/usePersistentCollapseState.js';
import { PresetContextMenu, usePresetContextMenu } from './PresetContextMenu.jsx';
import { fileBase64, PresetImportDialog } from './PresetTransfer.jsx';
import { openPresetManagerWindow } from '../window/openPresetManagerWindow.js';
import { PresetPurposeSwitch, isDefaultPreset } from './PresetPurposeSwitch.jsx';
import { usePresets } from './PresetContext.jsx';
import { resolveFailure } from '../../../utils/failureText.js';
import '../styles/preset-workspace.css';

const ALL_PRESETS = '全部预设';

export function presetListContextActions(preset, activePresetId, onActivate, onDelete, tUi = sourceText) {
  return [
    ...(preset.id !== activePresetId ? [{ label: tUi("使用此预设"), icon: CheckCircle, run: onActivate }] : []),
    ...(!isDefaultPreset(preset.id) ? [{ label: tUi("删除预设"), icon: TrashIcon, danger: true, run: onDelete }] : []),
  ];
}

export function buildPresetListSections(groups, presets, tUi = sourceText) {
  return [
    { id: ALL_PRESETS, name: tUi(ALL_PRESETS), presets },
    ...groups.map((group) => ({
      ...group,
      presets: presets.filter((preset) => preset.libraryGroupId === group.id),
    })),
  ];
}

export function shouldShowPresetCatalogLoading(catalog, error) {
  return !catalog && !error;
}

export function PresetListPanel() {
  const tUi = useProductTranslation();
  const scrollRef = useSidebarListScroll();
  const { purposeCatalog: catalog, purpose, setPurpose, catalogModel, setCatalog, selectedPresetId, setSelectedPresetId, navigationGuard, error, setError } = usePresets();
  const [keyword, setKeyword] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const creatingRef = useRef(false);
  const currentPurpose = useRef(purpose);
  currentPurpose.current = purpose;
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const deletingRef = useRef(false);
  const [deleteError, setDeleteError] = useState('');
  const [selectedGroup, setSelectedGroup] = useState(ALL_PRESETS);
  const [importing, setImporting] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importError, setImportError] = useState('');
  const importInputRef = useRef(null);
  const importSourceRef = useRef('');
  const context = usePresetContextMenu();

  const groups = catalog?.groups || [];
  const presets = catalog?.presets || [];
  const filtered = useMemo(() => {
    const key = keyword.trim().toLocaleLowerCase();
    return presets.filter((preset) => !key || `${preset.name} ${preset.profile.authorName} ${preset.profile.usageInstructions}`.toLocaleLowerCase().includes(key));
  }, [keyword, presets]);
  const sections = useMemo(() => buildPresetListSections(groups, filtered, tUi), [filtered, groups, tUi]);
  const [collapsed, setCollapsed, collapseStateReady] = usePersistentCollapseState(
    LIST_COLLAPSE_AREAS.presets,
    {},
    catalog ? sections.map((section) => section.id) : undefined,
  );
  const keepCollapsedHeading = useSidebarGroupCollapse(collapsed);

  useEffect(() => {
    function closeCreateMenu(event) {
      if (event.type === 'keydown' && event.key !== 'Escape') return;
      setCreateOpen(false);
    }

    window.addEventListener('pointerdown', closeCreateMenu);
    window.addEventListener('keydown', closeCreateMenu);
    return () => {
      window.removeEventListener('pointerdown', closeCreateMenu);
      window.removeEventListener('keydown', closeCreateMenu);
    };
  }, []);

  function addPreset() {
    setCreateOpen(false);
    const create = async () => {
      if (creatingRef.current) return;
      creatingRef.current = true;
      setCreating(true);
      try {
        const selectedGroupRecord = groups.find((group) => group.id === selectedGroup);
        const libraryGroupId = selectedGroupRecord?.id || '';
        const created = await catalogModel.create('新预设', libraryGroupId, purpose);
        if (currentPurpose.current === purpose) {
          setKeyword('');
          setCollapsed(current => ({ ...current, [ALL_PRESETS]: false, ...(libraryGroupId ? { [libraryGroupId]: false } : {}) }));
          setSelectedPresetId(created.id);
        }
        setError('');
      } catch (cause) { setError(resolveFailure(cause, { fallback: tUi("操作失败，请重试。") }).text); }
      finally { creatingRef.current = false; setCreating(false); }
    };
    if (navigationGuard.current) navigationGuard.current(create);
    else void create();
  }

  function runGuarded(action) {
    if (navigationGuard.current) navigationGuard.current(action);
    else void action();
  }

  function beginImport() {
    setCreateOpen(false);
    setImportError('');
    setImportDialogOpen(true);
  }

  function chooseImportSource(source) {
    importSourceRef.current = source;
    setImportDialogOpen(false);
    if (!importInputRef.current) return;
    importInputRef.current.accept = source === 'sillytavern'
      ? 'application/json,.json'
      : 'image/png,application/json,.png,.json';
    importInputRef.current.click();
  }

  function handleImport(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    runGuarded(async () => {
      setImporting(true);
      setImportError('');
      try {
        const result = await catalogModel.import(importSourceRef.current, {
          displayName: file.name,
          mimeType: file.type,
          base64: await fileBase64(file),
        }, purpose);
        if (currentPurpose.current === purpose) {
          setSelectedGroup(ALL_PRESETS);
          setSelectedPresetId(result.preset.id);
        }
      } catch (cause) {
        setImportError(resolveFailure(cause, { fallback: tUi("导入预设失败") }).text);
      } finally {
        setImporting(false);
      }
    });
  }

  function activateFromList(preset) {
    runGuarded(async () => {
      try {
        setCatalog(await catalogModel.setActive(preset.id));
        setError('');
      } catch (cause) { setError(resolveFailure(cause, { fallback: tUi("启用预设失败") }).text); }
    });
  }

  function removeFromList(preset) {
    runGuarded(() => { setDeleteError(''); setDeleteTarget(preset); });
  }

  async function confirmDelete() {
    if (!deleteTarget || deletingRef.current) return;
    deletingRef.current = true; setDeleting(true);
    try {
      await catalogModel.delete(deleteTarget.id);
      setDeleteTarget(null); setDeleteError(''); setError('');
    } catch (cause) { setDeleteError(resolveFailure(cause, { fallback: tUi("删除预设失败") }).text); }
    finally { deletingRef.current = false; setDeleting(false); }
  }

  function renderGroup(section) {
    const isCollapsed = Boolean(collapsed[section.id]);
    return <section className="character-group-block preset-list-group" key={section.id}>
      <button type="button" className="character-group-row preset-group-heading" aria-expanded={!isCollapsed} onClick={(event) => {
        if (!isCollapsed) keepCollapsedHeading(event.currentTarget);
        setSelectedGroup(section.id);
        setCollapsed((current) => ({ ...current, [section.id]: !current[section.id] }));
      }}>
        <span><span className={`character-group-toggle${isCollapsed ? ' collapsed' : ''}`}><ChevronRightIcon /></span>{section.name}</span>
        <em>{section.presets.length}</em>
      </button>
      {!isCollapsed ? <div className="character-contact-list preset-list-rows">{section.presets.map((preset) => <PresetListRow
        key={preset.id}
        preset={preset}
        selected={preset.id === selectedPresetId}
        active={preset.id === catalog.activePresetIds[purpose]}
        onClick={() => setSelectedPresetId(preset.id)}
        onContextMenu={(event) => {
          if (preset.id === catalog.activePresetIds[purpose] && isDefaultPreset(preset.id)) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          context.open(event, preset);
        }}
      />)}</div> : null}
    </section>;
  }

  return <aside className="character-list-panel preset-list-panel" aria-label={tUi("预设列表")} aria-busy={creating || shouldShowPresetCatalogLoading(catalog, error) || undefined}>
    <SidebarSectionHeader title={tUi("预设")} value={keyword} onValueChange={setKeyword} placeholder={tUi("搜索预设名称")}
      createLabel={tUi("新建预设")} createExpanded={createOpen}
      onCreatePointerDown={(event) => event.stopPropagation()}
      onCreate={(event) => { event.stopPropagation(); setCreateOpen((value) => !value); }} onSearchFocus={() => setCreateOpen(false)} />
    {createOpen ? <div className="character-create-menu preset-create-menu" onPointerDown={(event) => event.stopPropagation()}>
      <button type="button" disabled={creating} onClick={addPreset}><PlusIcon /><span>{tUi("新建预设")}</span></button>
      <button type="button" disabled={importing} onClick={beginImport}><ImportIcon /><span>{tUi("导入预设")}</span></button>
    </div> : null}
    <input ref={importInputRef} type="file" accept="image/png,application/json,.png,.json" hidden onChange={handleImport} />
    <button type="button" className="character-manager-entry preset-manager-entry" onClick={openPresetManagerWindow}><CharacterManagerIcon /><span>{tUi("预设管理器")}</span></button>
    <PresetPurposeSwitch value={purpose} onChange={value => { setPurpose(value); setSelectedGroup(ALL_PRESETS); setKeyword(''); }} />
    <SidebarScrollArea ref={scrollRef} className="character-list-scroll preset-list-scroll">
      {collapseStateReady ? sections.map(renderGroup) : null}
      {error || importError ? <p className="preset-list-state is-error">{error || importError}</p> : null}
    </SidebarScrollArea>
    {context.menu ? <PresetContextMenu menu={context.menu} onClose={context.close} actions={presetListContextActions(
      context.menu.target,
      catalog.activePresetIds[purpose],
      () => activateFromList(context.menu.target),
      () => removeFromList(context.menu.target), tUi
    )} /> : null}
    {importDialogOpen ? <PresetImportDialog onSelect={chooseImportSource} onClose={() => setImportDialogOpen(false)} /> : null}
    <ConfirmationDialog open={Boolean(deleteTarget)} title={tUi("删除预设？")} destructive busy={deleting} confirmLabel={tUi("删除")}
      description={<>{tUi("确认删除“{value0}”？", { value0: deleteTarget?.name || '' })}{deleteError && <span role="alert"> {deleteError}</span>}</>}
      onCancel={() => { if (!deletingRef.current) { setDeleteTarget(null); setDeleteError(''); } }} onConfirm={() => void confirmDelete()} />
  </aside>;
}

export function PresetListRow({ preset, selected, active, onClick, onContextMenu }) {
  const tUi = useProductTranslation();
  return <button type="button" className={`character-contact-row preset-list-row${selected ? ' active' : ''}`} onClick={onClick} onContextMenu={onContextMenu}>
    <Avatar src={preset.profile.authorAvatarPath || defaultPresetAvatar} name={preset.name} className="preset-list-avatar" />
    <span className="character-contact-copy"><strong>{preset.name}</strong></span>
    {active ? <span className="preset-list-status">{tUi("使用中")}</span> : null}
  </button>;
}
