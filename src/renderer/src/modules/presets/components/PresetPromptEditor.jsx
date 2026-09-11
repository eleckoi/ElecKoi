import { useMemo, useRef, useState } from 'react';
import { CaretRight, Code, Copy, FilePlus, FileText, FolderPlus, LinkSimple, MagnifyingGlass, PencilSimple, Plus } from '@phosphor-icons/react';
import { isHiddenToolTimelineEntry } from '@shared/contracts/presets/builtIns';
import { TrashIcon } from '../../../ui/icons/index.jsx';
import { DshFolderClosedIcon } from '../../../ui/icons/dshTreeIcons.jsx';
import { ConfirmationDialog, PINNED_ENTRY_IDS, SettingEntryGlyph, SettingLibraryInspector, createEntryDraft, createGroupDraft } from '../../settingLibraries/index.js';
import { PresetContextMenu, usePresetContextMenu } from './PresetContextMenu.jsx';

const HIDDEN_TIMELINE_DISABLE_CONFIRMATION = {
  title: '关闭隐藏工具时间线？',
  message: '关闭后 AI 回复将无法流式显示，请着重考虑。',
};

export function shouldConfirmHiddenTimelineDisable(entry, nextEnabled) {
  return nextEnabled === false && isHiddenToolTimelineEntry(entry);
}

export function PresetPromptEditor({ preset, onChange, saveAction }) {
  const [query, setQuery] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [pendingHiddenTimelineDisableId, setPendingHiddenTimelineDisableId] = useState('');
  const nameInputRef = useRef(null);
  const context = usePresetContextMenu();
  const rows = useMemo(() => promptRows(preset, query, collapsed), [preset, query, collapsed]);
  const selectedValue = selected?.kind === 'group'
    ? preset.groups.find((group) => group.id === selected.id)
    : selected?.kind === 'entry'
      ? preset.entries.find((entry) => entry.id === selected.id)
      : null;

  function createNode(kind, target = selected) {
    const parentId = target?.kind === 'group'
      ? target.id
      : target?.kind === 'entry'
        ? preset.entries.find((entry) => entry.id === target.id)?.groupId || ''
        : '';
    const order = 1 + Math.max(0,
      ...preset.groups.filter((group) => group.parentId === parentId).map((group) => group.treeViewOrder),
      ...preset.entries.filter((entry) => entry.groupId === parentId).map((entry) => entry.treeViewOrder),
    );
    if (kind === 'group') {
      const group = createGroupDraft(parentId, order, new Set(preset.groups.filter((item) => item.parentId === parentId).map((item) => item.name)));
      onChange({ ...preset, groups: [...preset.groups, group], expandedGroupIds: [...new Set([...preset.expandedGroupIds, parentId].filter(Boolean))] });
      setSelected({ kind: 'group', id: group.id });
    } else {
      const entry = { ...createEntryDraft(parentId, order, preset.entries, kind === 'reference' ? 'reference' : 'standard'), title: kind === 'reference' ? '新建引用条目' : '新建提示词' };
      onChange({ ...preset, entries: [...preset.entries, entry] });
      setSelected({ kind: 'entry', id: entry.id });
    }
    setAddOpen(false);
    setCollapsed((current) => { const next = new Set(current); next.delete(parentId); return next; });
    setQuery('');
    requestAnimationFrame(() => nameInputRef.current?.select());
  }

  function duplicateEntry(source) {
    const order = Math.max(0, ...preset.groups.filter((group) => group.parentId === source.groupId).map((group) => group.treeViewOrder), ...preset.entries.filter((entry) => entry.groupId === source.groupId).map((entry) => entry.treeViewOrder)) + 1;
    const fresh = createEntryDraft(source.groupId, order, preset.entries);
    const entry = { ...structuredClone(source), id: fresh.id, title: `${source.title || '未命名提示词'} 副本`, treeViewOrder: order, viewOrder: fresh.viewOrder, groupViewOrder: fresh.groupViewOrder, createdAt: fresh.createdAt, updatedAt: fresh.updatedAt };
    onChange({ ...preset, entries: [...preset.entries, entry] });
    setSelected({ kind: 'entry', id: entry.id });
  }

  function renameNode(target) {
    setSelected({ kind: target.kind, id: target.value.id });
    requestAnimationFrame(() => nameInputRef.current?.select());
  }

  function updateEntry(entry) {
    onChange({ ...preset, entries: preset.entries.map((item) => item.id === entry.id ? entry : item) });
  }

  function requestEntryEnabledChange(entry) {
    const nextEnabled = entry.enabled === false;
    if (shouldConfirmHiddenTimelineDisable(entry, nextEnabled)) {
      setPendingHiddenTimelineDisableId(entry.id);
      return;
    }
    updateEntry({ ...entry, enabled: nextEnabled });
  }

  function confirmHiddenTimelineDisable() {
    const entry = preset.entries.find((item) => item.id === pendingHiddenTimelineDisableId);
    if (entry && isHiddenToolTimelineEntry(entry)) updateEntry({ ...entry, enabled: false });
    setPendingHiddenTimelineDisableId('');
  }

  function toggleGroup(groupId) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  function deleteEntry(entryId) {
    onChange({ ...preset, entries: preset.entries.filter((entry) => entry.id !== entryId) });
    if (selected?.kind === 'entry' && selected.id === entryId) setSelected(null);
  }

  function deleteGroup(groupId) {
    const removed = descendantGroups(preset.groups, groupId);
    onChange({
      ...preset,
      groups: preset.groups.filter((group) => !removed.has(group.id)),
      entries: preset.entries.filter((entry) => !removed.has(entry.groupId)),
      expandedGroupIds: preset.expandedGroupIds.filter((id) => !removed.has(id)),
    });
    setSelected(null);
  }

  const library = {
    characterId: `agent-preset:${preset.id}`,
    name: preset.name,
    entries: preset.entries,
    groups: preset.groups,
    promptPositions: preset.promptPositions,
    activeVersionId: preset.activeVersionId,
    versions: [],
    listAllExpanded: false,
    expandedGroupIds: preset.expandedGroupIds,
  };

  const menuTarget = context.menu?.target;
  const createTarget = menuTarget ? { kind: menuTarget.kind, id: menuTarget.value.id } : null;
  const pinnedMenuTarget = menuTarget?.kind === 'entry' && PINNED_ENTRY_IDS.has(menuTarget.value.id);
  const menuActions = pinnedMenuTarget ? [] : !menuTarget || menuTarget.kind === 'group' ? [
    { label: '新建文件夹', icon: FolderPlus, run: () => createNode('group', createTarget) },
    { label: '新建提示词', icon: FilePlus, run: () => createNode('entry', createTarget) },
    { label: '新建引用条目', icon: LinkSimple, run: () => createNode('reference', createTarget) },
  ] : [{ label: '复制', icon: Copy, run: () => duplicateEntry(menuTarget.value) }];
  if (menuTarget && !pinnedMenuTarget) menuActions.push(
    { label: '重命名', icon: PencilSimple, run: () => renameNode(menuTarget) },
    { label: '删除', icon: TrashIcon, danger: true, run: () => menuTarget.kind === 'group' ? deleteGroup(menuTarget.value.id) : deleteEntry(menuTarget.value.id) },
  );

  return (
    <section className="preset-prompt-editor setting-library-layout" aria-label="预设提示词" onMouseDown={() => setAddOpen(false)}>
      <div className="setting-library-browser">
        <div className="setting-library-toolbar" onMouseDown={(event) => event.stopPropagation()}>
          <label className="setting-library-search">
            <MagnifyingGlass size={15} aria-hidden="true" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索提示词" aria-label="搜索提示词" />
          </label>
          <div className="setting-library-add-wrap">
            <button type="button" className="setting-library-create-button" aria-expanded={addOpen} onClick={() => setAddOpen((value) => !value)}><Plus size={16} />新建</button>
            {addOpen ? <div className="setting-library-popover" role="menu">
              <button type="button" role="menuitem" onClick={() => createNode('group')}><FolderPlus size={16} />文件夹</button>
              <button type="button" role="menuitem" onClick={() => createNode('entry')}><FilePlus size={16} />提示词</button>
              <button type="button" role="menuitem" onClick={() => createNode('reference')}><LinkSimple size={16} />引用条目</button>
            </div> : null}
          </div>
          {saveAction}
        </div>
        <div className="preset-prompt-tree" tabIndex={0} aria-label="预设提示词列表" onContextMenu={(event) => { setAddOpen(false); context.open(event); }} onMouseDown={(event) => { if (event.button === 0 && event.target === event.currentTarget) setSelected(null); }}>
          {rows.map((row) => {
            const active = selected?.kind === row.kind && selected.id === row.value.id;
            return <div
              className={`preset-prompt-row${active ? ' is-selected' : ''}${row.value.enabled === false ? ' is-disabled' : ''}`}
              style={{ paddingLeft: 12 + row.depth * 18 }}
              key={`${row.kind}:${row.value.id}`}
              onContextMenu={(event) => {
                setAddOpen(false);
                if (row.kind === 'entry' && PINNED_ENTRY_IDS.has(row.value.id)) {
                  event.preventDefault();
                  event.stopPropagation();
                  return;
                }
                context.open(event, row);
              }}
            >
              <button type="button" className="preset-prompt-open" onClick={() => setSelected({ kind: row.kind, id: row.value.id })}>
                {row.kind === 'group' ? <>
                  <CaretRight size={13} className={collapsed.has(row.value.id) ? '' : 'is-expanded'} onClick={(event) => { event.stopPropagation(); toggleGroup(row.value.id); }} />
                  <DshFolderClosedIcon size={17} />
                </> : <><span className="preset-prompt-caret-space" />{row.value.dynamicMode === 'ejs_controller'
                  ? <Code size={17} />
                  : row.value.dynamicMode === 'ejs_reference' ? <LinkSimple size={17} /> : <SettingEntryGlyph iconId={row.value.iconId} size={17} />}</>}
                <span>{row.kind === 'group' ? row.value.name : row.value.title || '未命名提示词'}</span>
              </button>
              {row.kind === 'entry' ? <>
                <button
                  type="button"
                  className="preset-prompt-switch"
                  role="switch"
                  aria-checked={row.value.enabled !== false}
                  aria-label={`${row.value.title || '提示词'}启用状态`}
                  onClick={() => requestEntryEnabledChange(row.value)}
                ><i /></button>
              </> : null}
            </div>;
          })}
          {!rows.length ? <p className="setting-library-empty">{query ? '没有匹配的提示词' : '还没有预设提示词'}</p> : null}
        </div>
      </div>

      {selectedValue ? <SettingLibraryInspector
        selected={{ kind: selected.kind, value: selectedValue }}
        library={library}
        nameInputRef={nameInputRef}
        SelectedIcon={selected.kind === 'group' ? DshFolderClosedIcon : selectedValue.dynamicMode === 'ejs_controller' ? Code : selectedValue.dynamicMode === 'ejs_reference' ? LinkSimple : FileText}
        onClose={() => setSelected(null)}
        onUpdateGroup={(patch) => onChange({ ...preset, groups: preset.groups.map((group) => group.id === selected.id ? { ...group, ...patch } : group) })}
        onDeleteGroup={() => deleteGroup(selected.id)}
        onUpdateEntry={updateEntry}
        onEntriesChange={(entries) => onChange({ ...preset, entries })}
        onOpenEntry={(entryId) => setSelected({ kind: 'entry', id: entryId })}
        onRequestDeleteOpening={() => {}}
        onPromptPositionsChange={(promptPositions, entries = preset.entries) => onChange({ ...preset, promptPositions, entries })}
      /> : null}
      {context.menu ? <PresetContextMenu menu={context.menu} actions={menuActions} onClose={context.close} /> : null}
      <ConfirmationDialog
        target={pendingHiddenTimelineDisableId ? HIDDEN_TIMELINE_DISABLE_CONFIRMATION : null}
        confirmLabel="仍要关闭"
        onCancel={() => setPendingHiddenTimelineDisableId('')}
        onConfirm={confirmHiddenTimelineDisable}
      />
    </section>
  );
}

function promptRows(preset, query, collapsed) {
  const key = query.trim().toLocaleLowerCase();
  const result = [];
  function visit(parentId, depth) {
    const nodes = [
      ...preset.groups.filter((group) => group.parentId === parentId).map((value) => ({ kind: 'group', value })),
      ...preset.entries.filter((entry) => entry.groupId === parentId).map((value) => ({ kind: 'entry', value })),
    ].sort((left, right) => left.value.treeViewOrder - right.value.treeViewOrder);
    for (const node of nodes) {
      const label = node.kind === 'group' ? node.value.name : `${node.value.title} ${node.value.content}`;
      if (!key || label.toLocaleLowerCase().includes(key)) result.push({ ...node, depth });
      if (node.kind === 'group' && (key || !collapsed.has(node.value.id))) visit(node.value.id, depth + 1);
    }
  }
  visit('', 0);
  return result;
}

function descendantGroups(groups, groupId) {
  const removed = new Set([groupId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const group of groups) {
      if (removed.has(group.parentId) && !removed.has(group.id)) {
        removed.add(group.id);
        changed = true;
      }
    }
  }
  return removed;
}
