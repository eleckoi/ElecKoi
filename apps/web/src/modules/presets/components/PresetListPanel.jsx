import { sourceText } from '../../../app/i18n/productCopy.js';
import { useProductTranslation } from '../../../app/i18n/ProductLocaleContext.jsx';
import { Fragment, useEffect, useId, useMemo, useRef, useState } from 'react';
import { CheckCircle } from '@phosphor-icons/react';
import { Button, IconProjectAddOutlineRegular, SegmentedControl, Tag, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives';
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
import { useCatalogSlots } from '../../../ui/ui/CatalogSlotsContext.jsx';
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

export function PresetListPanel({ home } = {}) {
  const tUi = useProductTranslation();
  const { render, actions } = useCatalogSlots();
  const scrollRef = useSidebarListScroll();
  const { purposeCatalog: catalog, purpose, setPurpose, catalogModel, setCatalog, selectedPresetId, setSelectedPresetId, navigationGuard, error, setError } = usePresets();
  const [keyword, setKeyword] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const purposeId = useId();
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
  const presets = home?.items ?? catalog?.presets ?? [];
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

  function addPreset(event) {
    const trigger = event.currentTarget;
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
          if (home) home.onOpen(created.id, trigger, true);
          else setSelectedPresetId(created.id);
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
      <button type="button" className="character-group-row preset-group-heading" aria-expanded={!isCollapsed}
        onContextMenu={home && section.id !== ALL_PRESETS ? event => home.onGroupMenu(event, section) : undefined} onClick={(event) => {
        if (!isCollapsed) keepCollapsedHeading(event.currentTarget);
        setSelectedGroup(section.id);
        setCollapsed((current) => ({ ...current, [section.id]: !current[section.id] }));
      }}>
        <span><span className={`character-group-toggle${isCollapsed ? ' collapsed' : ''}`}><ChevronRightIcon /></span>{section.name}</span>
        {!home && <em>{section.presets.length}</em>}
      </button>
      {!isCollapsed ? <div className="character-contact-list preset-list-rows">{section.presets.map((preset) => {
        const active = preset.id === catalog.activePresetIds[purpose];
        const selected = preset.id === (home ? home.openedId : selectedPresetId);
        const onSelect = event => home ? home.onOpen(preset.id, event?.currentTarget) : setSelectedPresetId(preset.id);
        const onOpenMenu = event => {
          if (home) {
            home.onPresetMenu(event, preset);
            return;
          }
          if (active && isDefaultPreset(preset.id)) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          context.open(event, preset);
        };
        return <Fragment key={preset.id}>{render('eleckoi.preset.library.item', {
          surface: 'pc-sidebar', preset, active, selected, selecting: false, onSelect, onOpenMenu,
        }, <PresetListRow preset={preset} selected={selected} active={active} onClick={onSelect} onContextMenu={onOpenMenu} />)}</Fragment>;
      })}</div> : null}
    </section>;
  }

  function choosePurpose(value) {
    setPurpose(value);
    setSelectedGroup(ALL_PRESETS);
    setKeyword('');
  }
  const purposeOptions = [
    { value: 'roleplay', label: tUi('扮演预设'), title: tUi('扮演预设') },
    { value: 'creator', label: tUi('创作预设'), title: tUi('创作预设') },
  ];
  const purposeSwitch = home && <SegmentedControl id={purposeId} value={purpose} options={purposeOptions}
    className="preset-purpose-tabs" label={tUi('预设分类')} disabled={home.busy || creating} onChange={choosePurpose} />;
  const groupList = collapseStateReady ? render('eleckoi.preset.library.groups', {
    surface: 'pc-sidebar', purpose, groups, allGroup: ALL_PRESETS, selectedGroup, onSelectGroup: setSelectedGroup,
  }, <>{sections.map(renderGroup)}</>) : null;
  return render('eleckoi.preset.page.list', {
    surface: 'pc-sidebar', purpose, presets: filtered, selectedPresetId, onSelect: home?.onOpen ?? setSelectedPresetId,
  }, <aside className={`character-list-panel preset-list-panel${home ? ' preset-home-sidebar' : ''}`} aria-label={tUi("预设列表")} aria-busy={creating || shouldShowPresetCatalogLoading(catalog, error) || undefined}>
    {home && <div className="character-home-create">
      <Button data-dsh-control variant="toolbar" icon={<CharacterManagerIcon size={16} />}
        disabled={!catalog || creating || home.busy} onClick={addPreset}>{tUi('新建预设')}</Button>
    </div>}
    <SidebarSectionHeader title={tUi('预设')} value={keyword} onValueChange={setKeyword} placeholder={tUi("搜索预设名称")}
      searchLabel={home ? tUi('搜索预设') : undefined}
      compact={Boolean(home)} compactTitle={purposeSwitch} compactActions={home && <>{home.sortMenu}
        <Tooltip label={tUi('新建分组')} side="bottom" delayMs={500} portal>
          <Button data-dsh-control variant="ghost" size="sm" className="sidebar-section-action" aria-label={tUi('新建分组')}
            aria-haspopup="dialog" icon={<IconProjectAddOutlineRegular size={16} />} onClick={home.onAddGroup} />
        </Tooltip></>}
      createLabel={tUi("新建预设")} createExpanded={createOpen}
      renderSearch={fallback => render('eleckoi.preset.library.search', { surface: 'pc-sidebar', value: keyword, onChange: setKeyword }, fallback)}
      onCreatePointerDown={(event) => event.stopPropagation()}
      onCreate={(event) => { event.stopPropagation(); setCreateOpen((value) => !value); }} onSearchFocus={() => setCreateOpen(false)} />
    {createOpen ? <div className="character-create-menu preset-create-menu" onPointerDown={(event) => event.stopPropagation()}>
      <button type="button" disabled={creating} onClick={addPreset}><PlusIcon /><span>{tUi("新建预设")}</span></button>
      <button type="button" disabled={importing} onClick={beginImport}><ImportIcon /><span>{tUi("导入预设")}</span></button>
      {actions('eleckoi.preset.library.menu.actions', { surface: 'pc-sidebar', purpose, menu: 'create', busy: importing || creating, onDismiss: () => setCreateOpen(false) })}
    </div> : null}
    <input ref={importInputRef} type="file" accept="image/png,application/json,.png,.json" hidden onChange={handleImport} />
    {!home && <button type="button" className="character-manager-entry preset-manager-entry" onClick={openPresetManagerWindow}><CharacterManagerIcon /><span>{tUi("预设管理器")}</span></button>}
    {!home && <PresetPurposeSwitch value={purpose} onChange={choosePurpose} />}
    <SidebarScrollArea ref={scrollRef} className="character-list-scroll preset-list-scroll">
      {home ? purposeOptions.map(({ value, label }) => <div key={value} role="tabpanel" id={`${purposeId}-${value}-panel`}
        aria-labelledby={`${purposeId}-${value}`} aria-label={label} hidden={purpose !== value}>
        {purpose === value && groupList}
      </div>) : groupList}
      {error || importError || home?.sortError ? <p className="preset-list-state is-error" role="alert">{error || importError || home.sortError}</p> : null}
    </SidebarScrollArea>
    {context.menu ? <PresetContextMenu menu={context.menu} onClose={context.close} actions={presetListContextActions(
      context.menu.target,
      catalog.activePresetIds[purpose],
      () => activateFromList(context.menu.target),
      () => removeFromList(context.menu.target), tUi
    )}>
      {actions('eleckoi.preset.library.item.menu.actions', {
        surface: 'pc-sidebar', preset: context.menu.target, busy: false,
        onDismiss: () => { context.close(); context.menu.trigger?.focus(); },
      })}
    </PresetContextMenu> : null}
    {importDialogOpen ? <PresetImportDialog onSelect={chooseImportSource} onClose={() => setImportDialogOpen(false)} /> : null}
    <ConfirmationDialog open={Boolean(deleteTarget)} title={tUi("删除预设？")} destructive busy={deleting} confirmLabel={tUi("删除")}
      description={<>{tUi("确认删除“{value0}”？", { value0: deleteTarget?.name || '' })}{deleteError && <span role="alert"> {deleteError}</span>}</>}
      onCancel={() => { if (!deletingRef.current) { setDeleteTarget(null); setDeleteError(''); } }} onConfirm={() => void confirmDelete()} />
  </aside>);
}

export function PresetListRow({ preset, selected, active, onClick, onContextMenu }) {
  const tUi = useProductTranslation();
  const image = preset.profile.authorAvatarPath || defaultPresetAvatar;
  return <button type="button" className={`character-contact-row preset-list-row${selected ? ' active' : ''}`} onClick={onClick} onContextMenu={onContextMenu}>
    <Avatar src={image} name={preset.name} className="preset-list-avatar" />
    <span className="character-contact-copy"><strong>{preset.name}</strong></span>
    {active && <Tag tone="neutral" className="preset-list-status">
      <CheckCircle size={12} aria-hidden="true" />{tUi('使用中')}
    </Tag>}
  </button>;
}
