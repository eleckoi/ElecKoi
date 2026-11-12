import { sourceText } from "../../../app/i18n/productCopy.js";
import { localizeUiCopy } from "../../../app/i18n/productCopy.js";
import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes';
import { DesktopError } from '@shared/foundation/DesktopError';
import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { CheckCircle } from '@phosphor-icons/react';
import { CharacterManagerIcon, ChevronRightIcon, ImportIcon, PlusIcon, TrashIcon } from '../../../ui/icons/index.jsx';
import { Avatar } from '../../../ui/ui/Avatar.jsx';
import { SidebarSectionHeader } from '../../../ui/ui/SidebarSectionHeader.jsx';
import { useSidebarListScroll } from '../../../ui/hooks/useSidebarListScroll.js';
import { SidebarScrollArea } from '../../../ui/ui/SidebarScrollArea.jsx';
import { useSidebarGroupCollapse } from '../../../ui/hooks/useSidebarGroupCollapse.js';
import { UnsavedChangesDialog } from '../../../ui/ui/UnsavedChangesDialog.jsx';
import { ConfirmationDialog } from '../../../ui/ui/ConfirmationDialog.jsx';
import { useEditorPresentation, useEditorSubpage } from '../../../ui/ui/EditorPresentationContext.jsx';
import defaultPresetAvatar from '../../../assets/eleckoi-app-icon.png';
import { SaveControl } from '../../settingLibraries/index.js';
import { LIST_COLLAPSE_AREAS, usePersistentCollapseState, useCharacterEditorSidebarState } from '../../settings/index.js';
import { PresetIntroductionEditor } from './PresetIntroductionEditor.jsx';
import { PresetContextMenu, usePresetContextMenu } from './PresetContextMenu.jsx';
import { PresetProfileHeader } from './PresetProfileHeader.jsx';
import { PresetProfileEditor } from './PresetProfileEditor.jsx';
import { PresetPromptEditor } from './PresetPromptEditor.jsx';
import { ScriptLibrariesPanel } from '../../scripts/index.js';
import { RegexRulesPanel } from '../../regex/index.js';
import { PresetToolsEditor } from './PresetToolsEditor.jsx';
import { PresetBasicDocument } from './PresetBasicDocument.jsx';
import { PresetMobileSections } from './PresetMobileSections.jsx';
import '../styles/preset-workspace.css';
import { fileBase64, PresetImportDialog } from './PresetTransfer.jsx';
import { openPresetManagerWindow } from '../window/openPresetManagerWindow.js';
import { PresetPurposeSwitch, isDefaultPreset } from './PresetPurposeSwitch.jsx';
import { LOG_ACTIONS, logAction } from '../../../utils/logAction.js';
import { resolveFailure } from '../../../utils/failureText.js';

const PresetContext = createContext(null);
const ALL_PRESETS = '全部预设';
const DEFAULT_PRESET_ID = 'agent-preset-standard';
const TABS = [
  { id: 'introduction', label: '使用说明' },
  { id: 'prompts', label: '预设提示词' },
  { id: 'tools', label: '工具' },
  { id: 'regex', label: '正则' },
  { id: 'scripts', label: '脚本' },
];
const EMPTY_PRESET_CATALOG = { status: 'loading', catalog: null, error: '' };
const subscribeEmptyCatalog = () => () => {};
const getEmptyCatalog = () => EMPTY_PRESET_CATALOG;

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

export function reconcilePresetToolRefresh(draft, previous, incoming) {
  const ids = new Set(previous.toolGroups.map(group => group.id));
  const content = ({ extraToolGroups, ...preset }) => JSON.stringify({ ...preset, toolGroups: preset.toolGroups.map(({ available, plugin, ...group }) => group) });
  const comparable = { ...incoming, toolGroups: incoming.toolGroups.filter(group => ids.has(group.id) || group.source !== 'extension') };
  if (content(comparable) !== content(previous)) return null;
  const latest = new Map([...incoming.toolGroups, ...(incoming.extraToolGroups || [])].map(group => [group.id, group]));
  const referencedNames = new Set(draft.toolGroups.filter(group => group.included).flatMap(group => group.members.map(member => member.name)));
  return { ...draft, toolGroups: [
    ...draft.toolGroups.map(group => latest.has(group.id) ? { ...group, available: latest.get(group.id).available, ...(latest.get(group.id).plugin ? { plugin: latest.get(group.id).plugin } : {}) } : group),
    ...incoming.toolGroups.filter(group => !ids.has(group.id)),
  ], extraToolGroups: [...latest.values()].filter(group => group.source === 'extension' && group.available === true
    && !group.members.some(member => referencedNames.has(member.name))).map(group => ({ ...group, included: false, enabled: true })) };
}

export function PresetProvider({ children, catalogModel, navigationGuardRef: externalNavigationGuardRef, fixedPresetId }) {
  const tUi = useProductTranslation();
  const snapshot = useSyncExternalStore(
    catalogModel?.subscribe || subscribeEmptyCatalog,
    catalogModel?.getSnapshot || getEmptyCatalog,
  );
  const catalog = snapshot.catalog;
  const [purpose, commitPurpose] = useState('roleplay');
  const purposeCatalog = useMemo(() => catalog ? { ...catalog, groups: catalog.groups.filter(item => item.purpose === purpose), presets: catalog.presets.filter(item => item.purpose === purpose) } : null, [catalog, purpose]);
  const [localSelectedPresetId, commitSelectedPresetId] = useState(() => catalog?.activePresetIds.roleplay || '');
  const selectedPresetId = fixedPresetId ?? localSelectedPresetId;
  const [localError, setError] = useState('');
  const error = localError || snapshot.error;
  const internalNavigationGuardRef = useRef(null);
  const navigationGuard = externalNavigationGuardRef || internalNavigationGuardRef;

  function setCatalog(next) {
    catalogModel.adopt(next);
  }

  function setSelectedPresetId(id) {
    if (id === selectedPresetId) return;
    const select = () => commitSelectedPresetId(id);
    if (navigationGuard.current) navigationGuard.current(select);
    else select();
  }

  function setPurpose(next) {
    if (next === purpose) return;
    const select = () => { commitPurpose(next); commitSelectedPresetId(catalog?.activePresetIds[next] || ''); };
    if (navigationGuard.current) navigationGuard.current(select);
    else select();
  }

  async function refresh(preferredId = '') {
    try {
      const next = await catalogModel.refresh();
      commitSelectedPresetId((current) => {
        const requested = preferredId || current || next.activePresetIds[purpose];
        return next.presets.some((item) => item.id === requested) ? requested : next.activePresetIds[purpose];
      });
      setError('');
      return next;
    } catch (cause) {
      setError(resolveFailure(cause, { fallback: tUi("读取预设失败") }).text);
      return null;
    }
  }

  useEffect(() => { if (catalogModel) void refresh(); }, [catalogModel]);
  useEffect(() => {
    if (!catalog) return;
    setError('');
    commitSelectedPresetId((current) => {
      const requested = current || catalog.activePresetIds[purpose];
      return catalog.presets.some((item) => item.id === requested) ? requested : catalog.activePresetIds[purpose];
    });
  }, [catalog, catalogModel, purpose]);
  const value = useMemo(() => ({ catalog, purposeCatalog, purpose, setPurpose, catalogModel, setCatalog, selectedPresetId, setSelectedPresetId, navigationGuard, refresh, error, setError }), [catalog, purposeCatalog, purpose, catalogModel, selectedPresetId, error]);
  return <PresetContext.Provider value={value}>{children}</PresetContext.Provider>;
}

export function usePresets() {
  const value = useContext(PresetContext);
  if (!value) throw new DesktopError(ELECKOI_FAILURE_CODES.internal, 'PresetProvider is missing.', { what: '预设 Provider' });
  return value;
}

export function PresetListPanel() {
  const tUi = useProductTranslation();
  const scrollRef = useSidebarListScroll();
  const { purposeCatalog: catalog, purpose, setPurpose, catalogModel, setCatalog, selectedPresetId, setSelectedPresetId, navigationGuard, refresh, error, setError } = usePresets();
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
        setSelectedGroup(ALL_PRESETS);
        await refresh(result.preset.id);
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

export function PresetWorkspace({
  characterConfiguration,
  requestedTab = '',
  onRequestedTabHandled,
  onNotify,
  onTestRegex,
  renderEditorSection,
  renderHeader,
  editorMode: desktopEditorMode = false,
  renderDesktopEditor,
}) {
  const tUi = useProductTranslation();
  const { compact } = useEditorPresentation();
  const editorMode = desktopEditorMode || compact;
  const sidebar = useCharacterEditorSidebarState();
  const { catalog, catalogModel, selectedPresetId, setCatalog, navigationGuard, refresh, error: catalogError } = usePresets();
  const [preset, setPreset] = useState(null);
  const [persisted, setPersisted] = useState(null);
  const [tab, setTab] = useState('introduction');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [profileEditing, setProfileEditing] = useState(false);
  const introductionRef = useRef(null);
  const scriptsRef = useRef(null), regexRef = useRef(null);
  const [editorDirty, setEditorDirty] = useState(false);
  const savingRef = useRef(false);
  const dirtyRef = useRef(false);
  const presetDirtyRef = useRef(false);
  const pendingLatestRef = useRef(null);
  const externalChangeRef = useRef(false);
  const allowCloseRef = useRef(false);
  const requestedTabRef = useRef(requestedTab);
  const requestedTabHandledRef = useRef(onRequestedTabHandled);
  const [pendingAction, setPendingAction] = useState(null);
  const presetDirty = Boolean(preset && persisted && !samePresetValue(preset, persisted));
  const dirty = editorDirty || presetDirty;
  const selectionMismatch = preset?.id !== selectedPresetId;
  const editorUnavailable = loading || selectionMismatch;
  presetDirtyRef.current = presetDirty;
  dirtyRef.current = dirty;
  requestedTabRef.current = requestedTab;
  requestedTabHandledRef.current = onRequestedTabHandled;
  useEditorSubpage(profileEditing, tUi("编辑预设资料"), () => navigate(() => setProfileEditing(false)));

  function navigate(action) {
    if (savingRef.current) return;
    const finish = () => { if (dirtyRef.current) setPendingAction({ action }); else action(); };
    if (!editorMode && introductionRef.current) introductionRef.current.requestLeave(action);
    else if (introductionRef.current?.hasDraft) introductionRef.current.requestLeave(() => setTimeout(finish, 0));
    else finish();
  }

  function confirmPresetSavedBeforePluginSettings() {
    if (savingRef.current) return false;
    if (!dirty) return true;
    setPendingAction({ reminderOnly: true });
    return false;
  }

  useEffect(() => {
    navigationGuard.current = navigate;
    return () => { navigationGuard.current = null; };
  });

  useEffect(() => {
    if (!selectedPresetId) return;
    let active = true;
    setLoading(true);
    setEditorDirty(false);
    setError('');
    catalogModel.read(selectedPresetId).then((loaded) => {
      if (!active) return;
      pendingLatestRef.current = null;
      externalChangeRef.current = false;
      setPreset(loaded);
      setPersisted(loaded);
      const initialTab = requestedTabRef.current || (editorMode ? 'profile' : 'introduction');
      setTab(initialTab);
      if (requestedTabRef.current) requestedTabHandledRef.current?.();
      setProfileEditing(false);
    }).catch((cause) => active && setError(resolveFailure(cause, { fallback: tUi("读取预设失败") }).text)).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [catalogModel, selectedPresetId]);

  useEffect(() => {
    if (!selectedPresetId) return undefined;
    let active = true;
    const applyLatest = (loaded) => {
        if (!active || savingRef.current) return;
        if (presetDirtyRef.current) {
          const refreshed = reconcilePresetToolRefresh(preset, persisted, loaded);
          if (refreshed) {
            setPreset(refreshed);
            setPersisted(loaded);
            return;
          }
          if (JSON.stringify(loaded) !== JSON.stringify(persisted)) {
            pendingLatestRef.current = loaded;
            externalChangeRef.current = true;
            setError(tUi("当前预设已在其他窗口更新，请放弃未保存修改后重新打开。"));
          }
          return;
        }
        pendingLatestRef.current = null;
        externalChangeRef.current = false;
        setPreset(loaded);
        setPersisted(loaded);
        setError('');
    };
    return catalogModel.subscribeDetail(selectedPresetId, () => {
      const snapshot = catalogModel.getDetailSnapshot(selectedPresetId);
      if (snapshot.status === 'ready') applyLatest(snapshot.preset);
      else if (snapshot.status === 'error') setError(snapshot.error);
    });
  }, [catalogModel, selectedPresetId, persisted, preset]);

  useEffect(() => {
    function saveShortcut(event) {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLocaleLowerCase() !== 's') return;
      event.preventDefault();
      if (editorUnavailable) return;
      if (document.activeElement?.closest('dialog')) return;
      if (introductionRef.current?.dirty) void introductionRef.current.save();
      else if (dirty && !saving) void save();
    }
    window.addEventListener('keydown', saveShortcut);
    return () => window.removeEventListener('keydown', saveShortcut);
  }, [dirty, saving, preset, editorUnavailable]);

  useEffect(() => {
    function handleBeforeUnload(event) {
      if (!dirty || allowCloseRef.current || introductionRef.current && (!editorMode || !presetDirty)) return;
      event.preventDefault();
      event.returnValue = false;
      setPendingAction({
        action: () => {
          allowCloseRef.current = true;
          window.close();
        },
      });
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [dirty]);

  async function save(candidate = preset) {
    if (editorUnavailable) return false;
    const editor = tab === 'scripts' ? scriptsRef.current : tab === 'regex' ? regexRef.current : null;
    if (editor) {
      if (savingRef.current) return false;
      savingRef.current = true; setSaving(true);
      try { const saved = await editor.save(); if (saved) setEditorDirty(false); return saved; }
      finally { savingRef.current = false; setSaving(false); }
    }
    if (!candidate || savingRef.current) return false;
    if (externalChangeRef.current) {
      setError(tUi("当前预设已在其他窗口更新，请放弃未保存修改后重新打开。"));
      return false;
    }
    savingRef.current = true;
    setSaving(true);
    setError('');
    // 关键路径日志：保存预设（预设正文的保存按钮；编辑器内的保存各自另有通道）。
    logAction(LOG_ACTIONS.presetSave, 'start');
    try {
      const saved = await catalogModel.save(candidate, persisted?.regexRules || []);
      pendingLatestRef.current = null;
      externalChangeRef.current = false;
      setPreset(saved);
      setPersisted(saved);
      await refresh(saved.id);
      if (compact) onNotify?.('success', tUi("预设已保存"));
      logAction(LOG_ACTIONS.presetSave, 'success');
      return true;
    } catch (cause) {
      logAction(LOG_ACTIONS.presetSave, 'failure', cause);
      setError(resolveFailure(cause, { fallback: tUi("保存预设失败") }).text);
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  function discardChanges() {
    scriptsRef.current?.discard?.(); regexRef.current?.discard?.(); setEditorDirty(false);
    const latest = pendingLatestRef.current || persisted;
    pendingLatestRef.current = null;
    externalChangeRef.current = false;
    setPreset(latest);
    setPersisted(latest);
    setError('');
  }

  async function activate() {
    if (!preset || editorUnavailable) return;
    if (dirty && !await save()) return;
    const next = await catalogModel.setActive(preset.id);
    setCatalog(next);
  }

  const active = Boolean(preset && catalog?.activePresetIds[preset.purpose] === preset.id);
  const editorError = selectionMismatch ? '' : error;
  const header = renderHeader?.({ tab, profileEditing, dirty: !editorUnavailable && dirty, saving, error, active, onActivate: preset && !editorUnavailable ? () => navigate(activate) : undefined, onSave: () => tab === 'profile' && introductionRef.current?.dirty ? introductionRef.current.save() : save() });
  if (!preset) {
    const body = <section className="preset-workspace" aria-busy={!error && !catalogError || undefined}>{error || catalogError ? <p className="preset-workspace-state is-error">{error || catalogError}</p> : null}</section>;
    return editorMode && !compact ? renderDesktopEditor({ tab: requestedTab || 'profile', body, unavailable: true, onSectionChange: () => {}, onClose: () => window.close() }) : <>{header}{body}</>;
  }
  const readError = selectionMismatch && error ? <p className="preset-workspace-state is-error" role="alert">{error}</p> : null;

  const tabCounts = {
    prompts: preset.entries.length,
    tools: preset.toolGroups.filter((group) => group.included).length,
    regex: preset.regexRules.length,
  };
  const saveAction = compact ? null : <SaveControl workspace={editorMode} title={tUi('保存（Ctrl/Command + S）')} dirty={dirty} error={editorError} saving={saving} onSave={() => void save()} />;
  const leaveDialog = <UnsavedChangesDialog
    open={Boolean(pendingAction)}
    title={tUi("保存修改？")}
    description={pendingAction?.reminderOnly
      ? tUi("前往插件设置前是否先保存当前预设的修改？")
      : tUi("离开前是否保存当前预设的修改？")}
    saving={saving}
    onCancel={() => setPendingAction(null)}
    onDiscard={() => {
      if (pendingAction?.reminderOnly) {
        setPendingAction(null);
        return;
      }
      const action = pendingAction?.action;
      discardChanges();
      setPendingAction(null);
      action?.();
    }}
    onSave={async () => {
      const action = pendingAction?.action;
      if (await save()) {
        setPendingAction(null);
        if (!pendingAction?.reminderOnly) action?.();
      }
    }}
  />;

  const extensionOwner = {
    presetId: preset.id,
    preset,
    active: catalog?.activePresetIds[preset.purpose] === preset.id,
    dirty,
    saving,
    error: editorError,
    onChange: setPreset,
    onSave: save,
    onDiscard: discardChanges,
    onActivate: activate,
  };

  if (profileEditing) {
    const profileEditor = <section className="preset-profile-edit-workspace" aria-label={tUi("编辑预设资料")} aria-busy={loading || undefined} inert={editorUnavailable}>
      <PresetProfileEditor
        preset={preset}
        dirty={dirty}
        saving={saving}
        error={editorError}
        onChange={setPreset}
        onCancel={() => { discardChanges(); setProfileEditing(false); }}
        onSave={async () => { if (await save()) setProfileEditing(false); }}
      />
    </section>;
    return <>
      {header}
      {readError}
      {renderEditorSection?.('profile', {
        ...extensionOwner,
        onClose: () => navigate(() => setProfileEditing(false)),
      }, profileEditor) ?? profileEditor}
      {leaveDialog}
    </>;
  }

  let tabEditor = null;
  if (editorMode && tab === 'profile') {
    tabEditor = <PresetBasicDocument action={compact ? <button type="button" className="mobile-preset-activate" disabled={active || saving} onClick={() => navigate(activate)}>{tUi(active ? "使用中" : "使用此预设")}</button> : null} preset={preset} dirty={dirty} saving={saving} error={editorError} onChange={setPreset} onSave={save} onDiscard={discardChanges} introductionRef={introductionRef} onClearError={() => setError('')} onIntroductionDirtyChange={compact ? setEditorDirty : undefined}
      renderIntroduction={fallback => renderEditorSection?.('introduction', extensionOwner, fallback) ?? fallback} />;
  } else if (tab === 'introduction') {
    tabEditor = <PresetIntroductionEditor key={preset.id} preset={preset} editorRef={introductionRef} saving={saving} error={editorError} onClearError={() => setError('')} onSaveProfile={(patch) => save({ ...preset, profile: { ...preset.profile, ...patch } })} />;
  } else if (tab === 'prompts') {
    tabEditor = <PresetPromptEditor preset={preset} onChange={setPreset} saveAction={saveAction} workspace={editorMode} dirty={dirty} saving={saving} />;
  } else if (tab === 'tools') {
    tabEditor = <PresetToolsEditor
      preset={preset}
      onChange={setPreset}
      onNotify={onNotify}
      onBeforeOpenSubagentSettings={confirmPresetSavedBeforePluginSettings}
      savePromptOpen={Boolean(pendingAction?.reminderOnly)}
      saveAction={saveAction}
      workspace={editorMode}
    />;
  } else if (tab === 'scripts') {
    tabEditor = <ScriptLibrariesPanel key={preset.id} ref={scriptsRef} presetId={preset.id} presetName={preset.name} manageSaveShortcut={false}
      scriptLibraries={characterConfiguration?.scripts} scriptRuntimeConnection={characterConfiguration?.scriptRuntimeConnection}
      onDirtyChange={setEditorDirty} />;
  } else if (tab === 'regex') {
    tabEditor = <RegexRulesPanel key={preset.id} ref={regexRef} presetId={preset.id} regexRules={characterConfiguration?.regexRules}
      manageSaveShortcut={false} onDirtyChange={setEditorDirty} />;
  }
  const renderedTabEditor = renderEditorSection?.(tab, extensionOwner, tabEditor) ?? tabEditor;

  if (editorMode && !compact) return <>{renderDesktopEditor({ tab, preset, body: <>{readError}<div className="preset-editor-page" inert={editorUnavailable}>{renderedTabEditor}</div></>, unavailable: editorUnavailable,
    onSectionChange: next => { if (next !== tab) navigate(() => setTab(next)); }, onClose: () => navigate(() => { allowCloseRef.current = true; window.close(); }) })}{leaveDialog}</>;

  return <>
    {header}
    {readError}
    <section className={`preset-workspace${compact ? ` is-mobile-rail${sidebar.collapsed ? ' is-sidebar-collapsed' : ''}` : ''}`} aria-label={tUi("预设编辑器")} aria-busy={loading || undefined} inert={editorUnavailable}>
      {!compact && <PresetProfileHeader preset={preset} active={active} showActivate={!renderHeader} onActivate={() => navigate(activate)} onEdit={() => navigate(() => setProfileEditing(true))} />}
      {compact ? <PresetMobileSections value={tab} sidebar={sidebar} onChange={next => { if (next !== tab) navigate(() => setTab(next)); }} /> : <nav className="preset-workspace-tabs" aria-label={tUi("预设编辑区域")}>
        <div className="preset-workspace-tab-list">{localizeUiCopy(TABS, tUi).map((item) => <button type="button" key={item.id} aria-current={tab === item.id ? 'page' : undefined} onClick={() => { if (tab !== item.id) navigate(() => setTab(item.id)); }}><span>{item.label}</span>{tabCounts[item.id] !== undefined ? <em>{tabCounts[item.id]}</em> : null}</button>)}</div>
      </nav>}
      <div className={`preset-workspace-body is-${tab}`}>
        {renderedTabEditor}
      </div>
    </section>
    {leaveDialog}
  </>;
}

function samePresetValue(left, right) {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every(key => Object.hasOwn(right, key) && samePresetValue(left[key], right[key]));
}
