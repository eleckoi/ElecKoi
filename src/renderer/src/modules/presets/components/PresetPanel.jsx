import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle } from '@phosphor-icons/react';
import { CharacterManagerIcon, ChevronRightIcon, ImportIcon, PlusIcon, TrashIcon } from '../../../ui/icons/index.jsx';
import { Avatar } from '../../../ui/ui/Avatar.jsx';
import { DshSearchField } from '../../../ui/ui/DshSearchField.jsx';
import { SidebarCreateButton } from '../../../ui/ui/SidebarCreateButton.jsx';
import { UnsavedChangesDialog } from '../../../ui/ui/UnsavedChangesDialog.jsx';
import defaultPresetAvatar from '../../../assets/eleckoi-app-icon.png';
import { SaveControl } from '../../settingLibraries/index.js';
import { LIST_COLLAPSE_AREAS, usePersistentCollapseState } from '../../settings/index.js';
import {
  createPreset,
  deletePreset,
  exportPreset,
  getPreset,
  getPresetCatalog,
  importPreset,
  savePreset,
  setActivePreset,
} from '../api/presetApi.js';
import { PresetIntroductionEditor } from './PresetIntroductionEditor.jsx';
import { PresetContextMenu, usePresetContextMenu } from './PresetContextMenu.jsx';
import { PresetProfileHeader } from './PresetProfileHeader.jsx';
import { PresetProfileEditor } from './PresetProfileEditor.jsx';
import { PresetPromptEditor } from './PresetPromptEditor.jsx';
import { PresetRegexEditor } from './PresetRegexEditor.jsx';
import { PresetToolsEditor } from './PresetToolsEditor.jsx';
import { PresetManager } from './PresetManager.jsx';
import { downloadPresetJson, fileBase64, PresetImportDialog } from './PresetTransfer.jsx';

const PresetContext = createContext(null);
const ALL_PRESETS = '全部预设';
const DEFAULT_PRESET_ID = 'agent-preset-standard';
const TABS = [
  { id: 'introduction', label: '使用说明' },
  { id: 'prompts', label: '预设提示词' },
  { id: 'tools', label: '工具' },
  { id: 'regex', label: '预设正则' },
];

export function presetListContextActions(preset, activePresetId, onActivate, onDelete) {
  return [
    ...(preset.id !== activePresetId ? [{ label: '使用此预设', icon: CheckCircle, run: onActivate }] : []),
    ...(preset.id !== DEFAULT_PRESET_ID ? [{ label: '删除预设', icon: TrashIcon, danger: true, run: onDelete }] : []),
  ];
}

export function buildPresetListSections(groups, presets) {
  return [
    { id: ALL_PRESETS, name: ALL_PRESETS, presets },
    ...groups.map((group) => ({
      ...group,
      presets: presets.filter((preset) => preset.libraryGroupId === group.id),
    })),
  ];
}

export function shouldShowPresetCatalogLoading(catalog, error) {
  return !catalog && !error;
}

export function PresetProvider({ children, navigationGuardRef: externalNavigationGuardRef }) {
  const [catalog, setCatalog] = useState(null);
  const [selectedPresetId, commitSelectedPresetId] = useState('');
  const [error, setError] = useState('');
  const internalNavigationGuardRef = useRef(null);
  const navigationGuard = externalNavigationGuardRef || internalNavigationGuardRef;

  function setSelectedPresetId(id) {
    if (id === selectedPresetId) return;
    const select = () => commitSelectedPresetId(id);
    if (navigationGuard.current) navigationGuard.current(select);
    else select();
  }

  async function refresh(preferredId = '') {
    try {
      const next = await getPresetCatalog();
      setCatalog(next);
      commitSelectedPresetId((current) => {
        const requested = preferredId || current || next.activePresetId;
        return next.presets.some((item) => item.id === requested) ? requested : next.presets[0]?.id || '';
      });
      setError('');
      return next;
    } catch (cause) {
      setError(cause?.message || '读取预设失败');
      return null;
    }
  }

  useEffect(() => { void refresh(); }, []);

  const value = useMemo(() => ({ catalog, setCatalog, selectedPresetId, setSelectedPresetId, navigationGuard, refresh, error, setError }), [catalog, selectedPresetId, error]);
  return <PresetContext.Provider value={value}>{children}</PresetContext.Provider>;
}

function usePresets() {
  const value = useContext(PresetContext);
  if (!value) throw new Error('PresetProvider is missing.');
  return value;
}

export function PresetListPanel() {
  const { catalog, setCatalog, selectedPresetId, setSelectedPresetId, navigationGuard, refresh, error, setError } = usePresets();
  const [keyword, setKeyword] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
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
  const sections = useMemo(() => buildPresetListSections(groups, filtered), [filtered, groups]);
  const [collapsed, setCollapsed] = usePersistentCollapseState(
    LIST_COLLAPSE_AREAS.presets,
    {},
    catalog ? sections.map((section) => section.id) : undefined,
  );

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
      const selectedGroupRecord = groups.find((group) => group.id === selectedGroup);
      const libraryGroupId = selectedGroupRecord?.id || '';
      const created = await createPreset('新预设', libraryGroupId);
      await refresh(created.id);
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
    if (file.size > 64 * 1024 * 1024) {
      setImportError('预设文件不能超过 64 MB');
      return;
    }
    runGuarded(async () => {
      setImporting(true);
      setImportError('');
      try {
        const result = await importPreset(importSourceRef.current, {
          displayName: file.name,
          mimeType: file.type,
          base64: await fileBase64(file),
        });
        setSelectedGroup(ALL_PRESETS);
        await refresh(result.preset.id);
      } catch (cause) {
        setImportError(cause?.message || '导入预设失败');
      } finally {
        setImporting(false);
      }
    });
  }

  async function exportSelectedPreset() {
    if (!selectedPresetId) return;
    try {
      setImportError('');
      const result = await exportPreset(selectedPresetId);
      downloadPresetJson(result.fileName, result.json);
    } catch (cause) {
      setImportError(cause?.message || '导出预设失败');
    }
  }

  function activateFromList(preset) {
    runGuarded(async () => {
      try {
        setCatalog(await setActivePreset(preset.id));
        setError('');
      } catch (cause) { setError(cause?.message || '启用预设失败'); }
    });
  }

  function removeFromList(preset) {
    runGuarded(async () => {
      try {
        await deletePreset(preset.id);
        await refresh();
      } catch (cause) { setError(cause?.message || '删除预设失败'); }
    });
  }

  function renderGroup(section) {
    const isCollapsed = Boolean(collapsed[section.id]);
    return <section className="character-group-block preset-list-group" key={section.id}>
      <button type="button" className="character-group-row preset-group-heading" aria-expanded={!isCollapsed} onClick={() => {
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
        active={preset.id === catalog.activePresetId}
        onClick={() => setSelectedPresetId(preset.id)}
        onContextMenu={(event) => {
          if (preset.id === catalog.activePresetId && preset.id === DEFAULT_PRESET_ID) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          context.open(event, preset);
        }}
      />)}</div> : null}
    </section>;
  }

  return <aside className="character-list-panel preset-list-panel" aria-label="预设列表">
    <div className="preset-list-title-row">
      <h2>Agent预设</h2>
    </div>
    <div className="search-row character-list-search preset-list-search">
      <DshSearchField value={keyword} onValueChange={setKeyword} placeholder="搜索预设…" ariaLabel="搜索预设" />
      <SidebarCreateButton title="新建" expanded={createOpen} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); setCreateOpen((value) => !value); }} />
    </div>
    {createOpen ? <div className="character-create-menu preset-create-menu" onPointerDown={(event) => event.stopPropagation()}>
      <button type="button" onClick={addPreset}><PlusIcon /><span>新建预设</span></button>
      <button type="button" disabled={importing} onClick={beginImport}><ImportIcon /><span>导入预设</span></button>
    </div> : null}
    <input ref={importInputRef} type="file" accept="image/png,application/json,.png,.json" hidden onChange={handleImport} />
    <button type="button" className="character-manager-entry preset-manager-entry" onClick={() => { if (navigationGuard.current) navigationGuard.current(() => setManagerOpen(true)); else setManagerOpen(true); }}><CharacterManagerIcon /><span>预设管理器</span></button>
    <div className="character-list-scroll preset-list-scroll">
      {sections.map(renderGroup)}
      {shouldShowPresetCatalogLoading(catalog, error) ? <p className="preset-list-state">正在读取…</p> : null}
      {error || importError ? <p className="preset-list-state is-error">{error || importError}</p> : null}
    </div>
    {context.menu ? <PresetContextMenu menu={context.menu} onClose={context.close} actions={presetListContextActions(
      context.menu.target,
      catalog.activePresetId,
      () => activateFromList(context.menu.target),
      () => removeFromList(context.menu.target),
    )} /> : null}
    {managerOpen && catalog ? <PresetManager
      catalog={catalog}
      selectedGroup={selectedGroup}
      selectedPresetId={selectedPresetId}
      onSelectGroup={setSelectedGroup}
      onSelectPreset={(id) => { setSelectedPresetId(id); setManagerOpen(false); }}
      onClose={() => setManagerOpen(false)}
      onRefresh={refresh}
      onImport={beginImport}
      onExport={() => void exportSelectedPreset()}
      importing={importing}
      importError={importError}
    /> : null}
    {importDialogOpen ? <PresetImportDialog onSelect={chooseImportSource} onClose={() => setImportDialogOpen(false)} /> : null}
  </aside>;
}

export function PresetListRow({ preset, selected, active, onClick, onContextMenu }) {
  return <button type="button" className={`character-contact-row preset-list-row${selected ? ' active' : ''}`} onClick={onClick} onContextMenu={onContextMenu}>
    <Avatar src={preset.profile.authorAvatarPath || defaultPresetAvatar} name={preset.name} className="preset-list-avatar" />
    <span className="character-contact-copy"><strong>{preset.name}</strong><span>{preset.profile.authorName || `${preset.entryCount} 条提示词`}</span></span>
    {active ? <span className="preset-list-status">使用中</span> : null}
  </button>;
}

export function PresetWorkspace({
  requestedTab = '',
  onRequestedTabHandled,
  modelConfigs = [],
  modelOptionsByKey,
  onLoadModels,
  onSaveModelConfig,
  onNotify,
}) {
  const { catalog, selectedPresetId, setCatalog, navigationGuard, refresh, error: catalogError } = usePresets();
  const [preset, setPreset] = useState(null);
  const [persisted, setPersisted] = useState(null);
  const [tab, setTab] = useState('introduction');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [profileEditing, setProfileEditing] = useState(false);
  const introductionRef = useRef(null);
  const savingRef = useRef(false);
  const allowCloseRef = useRef(false);
  const requestedTabRef = useRef(requestedTab);
  const requestedTabHandledRef = useRef(onRequestedTabHandled);
  const [pendingAction, setPendingAction] = useState(null);
  const dirty = Boolean(preset && persisted && JSON.stringify(preset) !== JSON.stringify(persisted));
  requestedTabRef.current = requestedTab;
  requestedTabHandledRef.current = onRequestedTabHandled;

  function navigate(action) {
    if (savingRef.current) return;
    if (introductionRef.current) introductionRef.current.requestLeave(action);
    else if (dirty) setPendingAction({ action });
    else action();
  }

  useEffect(() => {
    navigationGuard.current = navigate;
    return () => { navigationGuard.current = null; };
  });

  useEffect(() => {
    if (!selectedPresetId) return;
    let active = true;
    setLoading(true);
    setError('');
    getPreset(selectedPresetId).then((loaded) => {
      if (!active) return;
      setPreset(loaded);
      setPersisted(loaded);
      const initialTab = requestedTabRef.current || 'introduction';
      setTab(initialTab);
      if (requestedTabRef.current) requestedTabHandledRef.current?.();
      setProfileEditing(false);
    }).catch((cause) => active && setError(cause?.message || '读取预设失败')).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [selectedPresetId]);

  useEffect(() => {
    function saveShortcut(event) {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLocaleLowerCase() !== 's') return;
      event.preventDefault();
      if (document.activeElement?.closest('dialog')) return;
      if (introductionRef.current?.hasDraft) void introductionRef.current.save();
      else if (dirty && !saving) void save();
    }
    window.addEventListener('keydown', saveShortcut);
    return () => window.removeEventListener('keydown', saveShortcut);
  }, [dirty, saving, preset]);

  useEffect(() => {
    function handleBeforeUnload(event) {
      if (!dirty || allowCloseRef.current || introductionRef.current) return;
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
    if (!candidate || savingRef.current) return false;
    savingRef.current = true;
    setSaving(true);
    setError('');
    try {
      const saved = await savePreset(candidate);
      setPreset(saved);
      setPersisted(saved);
      await refresh(saved.id);
      return true;
    } catch (cause) {
      setError(cause?.message || '保存预设失败');
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function activate() {
    if (!preset) return;
    if (dirty && !await save()) return;
    const next = await setActivePreset(preset.id);
    setCatalog(next);
  }

  if (loading || (!preset && !error && !catalogError)) return <section className="preset-workspace"><p className="preset-workspace-state">正在读取…</p></section>;
  if (!preset) return <section className="preset-workspace"><p className="preset-workspace-state is-error">{error || catalogError || '没有可编辑的预设'}</p></section>;

  const tabCounts = {
    prompts: preset.entries.length,
    tools: preset.toolGroups.filter((group) => group.included ?? group.enabled).length,
    regex: preset.regexRules.length,
  };
  const saveAction = <SaveControl dirty={dirty} error={error} saving={saving} onSave={() => void save()} />;
  const leaveDialog = <UnsavedChangesDialog
    open={Boolean(pendingAction)}
    title="保存修改？"
    description="离开前是否保存当前预设的修改？"
    saving={saving}
    onCancel={() => setPendingAction(null)}
    onDiscard={() => {
      const action = pendingAction?.action;
      setPreset(persisted);
      setError('');
      setPendingAction(null);
      action?.();
    }}
    onSave={async () => {
      const action = pendingAction?.action;
      if (await save()) {
        setPendingAction(null);
        action?.();
      }
    }}
  />;

  if (profileEditing) return <>
    <section className="preset-profile-edit-workspace" aria-label="编辑预设资料">
      <PresetProfileEditor
        preset={preset}
        dirty={dirty}
        saving={saving}
        error={error}
        onChange={setPreset}
        onCancel={() => { setPreset(persisted); setProfileEditing(false); }}
        onSave={async () => { if (await save()) setProfileEditing(false); }}
      />
    </section>
    {leaveDialog}
  </>;

  return <>
    <section className="preset-workspace" aria-label="预设编辑器">
      <PresetProfileHeader preset={preset} active={catalog?.activePresetId === preset.id} onActivate={() => navigate(activate)} onEdit={() => navigate(() => setProfileEditing(true))} />
      <nav className="preset-workspace-tabs" aria-label="预设编辑区域">
        <div className="preset-workspace-tab-list">{TABS.map((item) => <button type="button" key={item.id} aria-current={tab === item.id ? 'page' : undefined} onClick={() => { if (tab !== item.id) navigate(() => setTab(item.id)); }}><span>{item.label}</span>{tabCounts[item.id] !== undefined ? <em>{tabCounts[item.id]}</em> : null}</button>)}</div>
      </nav>
      <div className={`preset-workspace-body is-${tab}`}>
        {tab === 'introduction' ? <PresetIntroductionEditor key={preset.id} preset={preset} editorRef={introductionRef} saving={saving} error={error} onClearError={() => setError('')} onSaveProfile={(patch) => save({ ...preset, profile: { ...preset.profile, ...patch } })} /> : null}
        {tab === 'prompts' ? <PresetPromptEditor preset={preset} onChange={setPreset} saveAction={saveAction} /> : null}
        {tab === 'tools' ? <PresetToolsEditor
          preset={preset}
          modelConfigs={modelConfigs}
          modelOptionsByKey={modelOptionsByKey}
          onChange={setPreset}
          onLoadModels={onLoadModels}
          onSaveModelConfig={onSaveModelConfig}
          onNotify={onNotify}
          saveAction={saveAction}
        /> : null}
        {tab === 'regex' ? <PresetRegexEditor preset={preset} onChange={setPreset} saveAction={saveAction} /> : null}
      </div>
    </section>
    {leaveDialog}
  </>;
}
