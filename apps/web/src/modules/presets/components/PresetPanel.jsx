import { localizeUiCopy } from '../../../app/i18n/productCopy.js';
import { useProductTranslation } from '../../../app/i18n/ProductLocaleContext.jsx';
import { useEffect, useRef, useState } from 'react';
import { UnsavedChangesDialog } from '../../../ui/ui/UnsavedChangesDialog.jsx';
import { useEditorPresentation, useEditorSubpage } from '../../../ui/ui/EditorPresentationContext.jsx';
import { SaveControl } from '../../settingLibraries/index.js';
import { useCharacterEditorSidebarState } from '../../settings/index.js';
import { PresetIntroductionEditor } from './PresetIntroductionEditor.jsx';
import { PresetProfileHeader } from './PresetProfileHeader.jsx';
import { PresetProfileEditor } from './PresetProfileEditor.jsx';
import { PresetPromptEditor } from './PresetPromptEditor.jsx';
import { ScriptLibrariesPanel } from '../../scripts/index.js';
import { RegexRulesPanel } from '../../regex/index.js';
import { PresetToolsEditor } from './PresetToolsEditor.jsx';
import { PresetBasicDocument } from './PresetBasicDocument.jsx';
import { PresetMobileSections } from './PresetMobileSections.jsx';
import { LOG_ACTIONS, logAction } from '../../../utils/logAction.js';
import { resolveFailure } from '../../../utils/failureText.js';
import { usePresets } from './PresetContext.jsx';
import '../styles/preset-workspace.css';

// Keep existing editor imports compatible; the catalog page imports only the lightweight modules.
export { PresetProvider, usePresets } from './PresetContext.jsx';
export { PresetListPanel, PresetListRow, presetListContextActions, buildPresetListSections, shouldShowPresetCatalogLoading } from './PresetListPanel.jsx';

const TABS = [
  { id: 'introduction', label: '使用说明' },
  { id: 'prompts', label: '预设提示词' },
  { id: 'tools', label: '工具' },
  { id: 'regex', label: '正则' },
  { id: 'scripts', label: '脚本' },
];
export function reconcilePresetToolRefresh(draft, previous, incoming) {
  const ids = new Set(previous.toolGroups.map(group => group.id));
  const content = ({ extraToolGroups, basicToolGroups, ...preset }) => JSON.stringify({ ...preset, toolGroups: preset.toolGroups.map(({ available, plugin, ...group }) => group) });
  const comparable = { ...incoming, toolGroups: incoming.toolGroups.filter(group => ids.has(group.id) || group.source !== 'extension') };
  if (content(comparable) !== content(previous)) return null;
  const latest = new Map([...incoming.toolGroups, ...(incoming.extraToolGroups || [])].map(group => [group.id, group]));
  const referencedNames = new Set(draft.toolGroups.filter(group => group.included).flatMap(group => group.members.map(member => member.name)));
  return { ...draft, basicToolGroups: incoming.basicToolGroups, toolGroups: [
    ...draft.toolGroups.map(group => latest.has(group.id) ? { ...group, available: latest.get(group.id).available, ...(latest.get(group.id).plugin ? { plugin: latest.get(group.id).plugin } : {}) } : group),
    ...incoming.toolGroups.filter(group => !ids.has(group.id)),
  ], extraToolGroups: [...latest.values()].filter(group => group.source === 'extension' && group.available === true
    && !group.members.some(member => referencedNames.has(member.name))).map(group => ({ ...group, included: false, enabled: true })) };
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
  const [tab, setTab] = useState(() => requestedTab || (editorMode ? 'profile' : 'introduction'));
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
  const desktopEditor = editorMode && !compact;
  const closeDesktopEditor = () => navigate(() => { allowCloseRef.current = true; window.close(); });
  const tabOwner = desktopEditor && tab === 'profile' ? { ...extensionOwner, onClose: closeDesktopEditor } : extensionOwner;
  const renderedTabEditor = renderEditorSection?.(tab, tabOwner, tabEditor) ?? tabEditor;

  if (desktopEditor) return <>{renderDesktopEditor({ tab, preset, body: <>{readError}<div className="preset-editor-page" inert={editorUnavailable}>{renderedTabEditor}</div></>, unavailable: editorUnavailable,
    onSectionChange: (next, present) => {
      if (next === tab) return;
      const commit = () => setTab(next);
      navigate(() => present ? present(next, commit) : commit());
    }, onClose: closeDesktopEditor })}{leaveDialog}</>;

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
