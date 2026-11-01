import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { SystemBarOverlay } from '../../../ui/ui/SystemBarOverlay.jsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Avatar } from '../../../ui/ui/Avatar.jsx';
import { Input, IconSearchOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { GroupAssignmentMenu } from '../../../ui/ui/GroupAssignmentMenu.jsx';
import { ExportIcon, ImportIcon, PencilIcon, PlusIcon, TrashIcon } from '../../../ui/icons/index.jsx';
import defaultPresetAvatar from '../../../assets/eleckoi-app-icon.png';
import { isDefaultPreset, PresetPurposeSwitch } from './PresetPurposeSwitch.jsx';
import { resolveFailure } from '../../../utils/failureText.js';

const ALL_PRESETS = '全部预设';

export function PresetManager({ catalogModel, catalog, purpose, onPurposeChange, selectedGroup, selectedPresetId, onSelectGroup, onSelectPreset, onRefresh, onImport, onExport, importing, importError }) {
  const [groupDraft, setGroupDraft] = useState('');
  const [editingGroupId, setEditingGroupId] = useState('');
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [groupMenu, setGroupMenu] = useState(null);
  const [presetGroupMenu, setPresetGroupMenu] = useState(null);
  const [keyword, setKeyword] = useState('');
  const [deleteMode, setDeleteMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [error, setError] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const exportControlRef = useRef(null);
  const exportMenuRef = useRef(null);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const visible = useMemo(() => {
    const key = keyword.trim().toLocaleLowerCase();
    return catalog.presets.filter((preset) => {
      const inGroup = selectedGroup === ALL_PRESETS || preset.libraryGroupId === selectedGroup;
      const matches = !key || `${preset.name} ${preset.profile.authorName}`.toLocaleLowerCase().includes(key);
      return inGroup && matches;
    });
  }, [catalog.presets, keyword, selectedGroup]);
  const selectedGroupRecord = catalog.groups.find((group) => group.id === selectedGroup);

  useEffect(() => {
    function closeGroupMenu(event) {
      if (event.type === 'keydown' && event.key !== 'Escape') return;
      setGroupMenu(null);
      setPresetGroupMenu(null);
    }
    window.addEventListener('pointerdown', closeGroupMenu);
    window.addEventListener('keydown', closeGroupMenu);
    return () => {
      window.removeEventListener('pointerdown', closeGroupMenu);
      window.removeEventListener('keydown', closeGroupMenu);
    };
  }, []);

  useEffect(() => {
    function closeExportMenu(event) {
      if (event.type === 'keydown') {
        if (event.key !== 'Escape') return;
      } else if (exportControlRef.current?.contains(event.target)) return;
      setExportOpen(false);
      setExportError('');
    }
    window.addEventListener('pointerdown', closeExportMenu);
    window.addEventListener('keydown', closeExportMenu);
    return () => {
      window.removeEventListener('pointerdown', closeExportMenu);
      window.removeEventListener('keydown', closeExportMenu);
    };
  }, []);

  useEffect(() => {
    if (exportOpen) exportMenuRef.current?.querySelector('button')?.focus();
  }, [exportOpen]);

  function openGroupMenu(event, group = selectedGroupRecord || null) {
    event.preventDefault();
    event.stopPropagation();
    if (group) onSelectGroup(group.id);
    setPresetGroupMenu(null);
    setGroupMenu({
      group,
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 164)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 116)),
    });
  }

  function openGroupDialog(group = null) {
    setEditingGroupId(group?.id || '');
    setGroupDraft(group?.name || '');
    setGroupDialogOpen(true);
    setGroupMenu(null);
    setPresetGroupMenu(null);
  }

  function openPresetGroupMenu(event, preset) {
    event.preventDefault();
    event.stopPropagation();
    if (deleteMode) return;
    onSelectPreset(preset.id);
    setGroupMenu(null);
    setExportOpen(false);
    setPresetGroupMenu({ preset, x: event.clientX, y: event.clientY });
  }

  async function movePresetToGroup(groupId) {
    const preset = presetGroupMenu?.preset;
    if (!preset || preset.libraryGroupId === groupId) return;
    setError('');
    try {
      await catalogModel.assignGroup(preset.id, groupId);
      setPresetGroupMenu(null);
      await onRefresh(preset.id);
    } catch (cause) {
      setError(resolveFailure(cause, { fallback: '移动预设失败' }).text);
    }
  }

  async function addGroup() {
    if (!groupDraft.trim()) return;
    try {
      await catalogModel.createGroup(groupDraft, purpose);
      setGroupDraft('');
      setGroupDialogOpen(false);
      await onRefresh();
    } catch (cause) { setError(resolveFailure(cause, { fallback: '新建分组失败' }).text); }
  }

  async function renameGroup() {
    if (!selectedGroupRecord || !groupDraft.trim()) return;
    try {
      await catalogModel.renameGroup(selectedGroupRecord.id, groupDraft);
      setGroupDraft('');
      setEditingGroupId('');
      setGroupDialogOpen(false);
      await onRefresh();
    } catch (cause) { setError(resolveFailure(cause, { fallback: '重命名失败' }).text); }
  }

  async function removeGroup(group = selectedGroupRecord) {
    if (!group) return;
    try {
      await catalogModel.deleteGroup(group.id);
      onSelectGroup(ALL_PRESETS);
      setGroupMenu(null);
      await onRefresh();
    } catch (cause) { setError(resolveFailure(cause, { fallback: '删除分组失败' }).text); }
  }

  function togglePreset(id) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function cancelDeleteMode() {
    setDeleteMode(false);
    setSelectedIds([]);
  }

  async function removeSelectedPresets() {
    if (!selectedIds.length) return;
    try {
      for (const id of selectedIds) await catalogModel.delete(id);
      cancelDeleteMode();
      await onRefresh();
    } catch (cause) { setError(resolveFailure(cause, { fallback: '删除预设失败' }).text); }
  }

  async function exportPreset(format) {
    if (exporting || !selectedPresetId) return;
    setExporting(true);
    setExportError('');
    try {
      await onExport(format);
      setExportOpen(false);
    } catch (cause) {
      setExportError(resolveFailure(cause, { fallback: '导出预设失败' }).text);
    } finally {
      setExporting(false);
    }
  }

  return <section className="preset-manager-window" aria-label="预设管理器">
      <aside className="preset-manager-groups" onContextMenu={(event) => openGroupMenu(event)}>
        {onPurposeChange && <PresetPurposeSwitch value={purpose} disabled={importing} onChange={onPurposeChange} />}
        <button type="button" className={selectedGroup === ALL_PRESETS ? 'active' : ''} onClick={() => onSelectGroup(ALL_PRESETS)} onContextMenu={(event) => openGroupMenu(event, null)}><span>{ALL_PRESETS}</span><em>{catalog.presets.length}</em></button>
        <small>分组</small>
        <div>{catalog.groups.map((group) => <button type="button" className={selectedGroup === group.id ? 'active' : ''} key={group.id} onClick={() => onSelectGroup(group.id)} onContextMenu={(event) => openGroupMenu(event, group)}><span>{group.name}</span><em>{catalog.presets.filter((preset) => preset.libraryGroupId === group.id).length}</em></button>)}</div>
        <Button data-dsh-control variant="outline" className="preset-manager-add-group" type="button" onClick={() => openGroupDialog()}><PlusIcon /><span>添加分组</span></Button>
      </aside>
      <div className="preset-manager-main">
        <header className="preset-manager-titlebar">
          <h2>预设管理器</h2>
          <Input data-dsh-control className="preset-manager-search" type="search" icon={<IconSearchOutlineRegular />} value={keyword} onChange={event => setKeyword(event.target.value)} placeholder="搜索预设…" aria-label="搜索预设" />
          {!deleteMode ? <>
            <Button data-dsh-control variant="outline" type="button" disabled={importing} onClick={onImport}><ImportIcon /><span>导入预设</span></Button>
            <div className="preset-manager-export" ref={exportControlRef}>
              <Button data-dsh-control variant="outline" type="button" disabled={!selectedPresetId} aria-haspopup="menu" aria-expanded={exportOpen} onClick={() => { setExportError(''); setExportOpen((current) => !current); }}><ExportIcon /><span>导出预设</span></Button>
              {exportOpen ? <div className="preset-manager-export-menu" ref={exportMenuRef} role="menu" aria-label="选择预设格式">
                <button type="button" role="menuitem" disabled={exporting} onClick={() => void exportPreset('png')}>PNG 预设卡</button>
                <button type="button" role="menuitem" disabled={exporting} onClick={() => void exportPreset('json')}>JSON 预设</button>
                {exportError ? <span role="alert">{exportError}</span> : null}
              </div> : null}
            </div>
            <Button data-dsh-control variant="outline" type="button" onClick={() => setDeleteMode(true)}><TrashIcon /><span>删除</span></Button>
          </> : <>
            <Button data-dsh-control variant="primary" className="preset-manager-confirm-delete" type="button" disabled={!selectedIds.length} onClick={() => void removeSelectedPresets()}>确认{selectedIds.length ? ` ${selectedIds.length}` : ''}</Button>
            <Button data-dsh-control variant="outline" type="button" onClick={cancelDeleteMode}>取消</Button>
          </>}
        </header>
        {error || importError ? <p className="preset-manager-error">{error || importError}</p> : null}
        <div className="preset-manager-grid">{visible.map((preset) => {
          const removable = !isDefaultPreset(preset.id);
          const selected = selectedSet.has(preset.id);
          return <article className={`preset-manager-card${preset.id === selectedPresetId ? ' is-current' : ''}${deleteMode && removable ? ' is-selectable' : ''}${selected ? ' is-delete-selected' : ''}`} key={preset.id}>
            <button type="button" className="preset-manager-card-open" aria-pressed={deleteMode && removable ? selected : undefined} onClick={() => deleteMode ? (removable && togglePreset(preset.id)) : onSelectPreset(preset.id)} onContextMenu={deleteMode ? undefined : (event) => openPresetGroupMenu(event, preset)}>
              {deleteMode && removable ? <span className="preset-manager-card-check" aria-hidden="true" /> : null}
              <Avatar src={preset.profile.authorAvatarPath || defaultPresetAvatar} name={preset.name} className="preset-manager-avatar" />
              <strong>{preset.name}</strong><small>{preset.profile.authorName || '未填写作者'}</small>
            </button>
          </article>;
        })}</div>
      </div>
      {groupMenu ? <div className="preset-manager-group-menu" role="menu" aria-label={groupMenu.group ? `${groupMenu.group.name}的操作` : '分组操作'} style={{ left: `${groupMenu.x}px`, top: `${groupMenu.y}px` }} onPointerDown={(event) => event.stopPropagation()}>
        <button type="button" role="menuitem" onClick={() => openGroupDialog()}><PlusIcon /><span>添加分组</span></button>
        {groupMenu.group ? <>
          <button type="button" role="menuitem" onClick={() => openGroupDialog(groupMenu.group)}><PencilIcon /><span>重命名该组</span></button>
          <button type="button" role="menuitem" onClick={() => void removeGroup(groupMenu.group)}><TrashIcon /><span>删除分组</span></button>
        </> : null}
      </div> : null}
      {presetGroupMenu ? <GroupAssignmentMenu
        x={presetGroupMenu.x}
        y={presetGroupMenu.y}
        label={`移动${presetGroupMenu.preset.name}到分组`}
        currentGroupId={presetGroupMenu.preset.libraryGroupId || ''}
        groups={catalog.groups}
        onMove={movePresetToGroup}
      /> : null}
      {groupDialogOpen ? <PresetGroupDialog
        title={editingGroupId ? '重命名该组' : '添加分组'}
        value={groupDraft}
        onChange={setGroupDraft}
        onConfirm={() => void (editingGroupId ? renameGroup() : addGroup())}
        onCancel={() => { setGroupDialogOpen(false); setEditingGroupId(''); setGroupDraft(''); }}
      /> : null}
  </section>;
}

function PresetGroupDialog({ title, value, onChange, onConfirm, onCancel }) {
  return <SystemBarOverlay className="preset-group-dialog-backdrop">
    <form className="preset-group-dialog" role="dialog" aria-modal="true" aria-label={title} onSubmit={(event) => { event.preventDefault(); onConfirm(); }}>
      <h3>{title}</h3>
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder="填写分组" autoFocus />
      <div>
        <Button data-dsh-control variant="primary" className="preset-group-dialog-confirm" type="submit" disabled={!value.trim()}>确定</Button>
        <Button data-dsh-control variant="outline" type="button" onClick={onCancel}>取消</Button>
      </div>
    </form>
  </SystemBarOverlay>;
}
