import { localizeUiCopy } from "../../../app/i18n/productCopy.js";
import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Input, Menu } from '@deepseek-ai/dsh-client-ui-primitives';
import { Code, Copy, DotsThree, FileText, LinkSimple, ListChecks, MagnifyingGlass, PencilSimple, Plus } from '../../../ui/icons/interfaceIcons.jsx';
import { isHiddenToolTimelineEntry } from '@shared/contracts/presets/builtIns';
import { TrashIcon } from '../../../ui/icons/index.jsx';
import { DshFolderClosedIcon } from '../../../ui/icons/dshTreeIcons.jsx';
import { SETTING_LIBRARY_CREATE_ICONS } from '../../../ui/icons/settingLibraryCreateIcons.jsx';
import { EditorLibraryWorkspace } from '../../../ui/ui/EditorLibraryWorkspace.jsx';
import { EditorSidebarLayout } from '../../../ui/ui/EditorSidebarLayout.jsx';
import { useEditorPresentation } from '../../../ui/ui/EditorPresentationContext.jsx';
import { MobileEditorActions } from '../../../ui/ui/MobileEditorActions.jsx';
import { EditorCollectionToolbar, EditorSelectionBar, useEditorMultiSelect } from '../../../ui/ui/EditorCollectionControls.jsx';
import { selectableTreeIds, selectedTreeRootIds, visibleTreeSelectionIds } from '../../../ui/ui/editorCollectionSelection.js';
import {
  ConfirmationDialog,
  PINNED_ENTRY_IDS,
  SettingLibraryInspector,
  SettingLibraryDocument,
  SettingLibraryTree,
  SettingTreeActionsContext,
  canTransferSettingNode,
  copySettingNode,
  createEntryDraft,
  createGroupDraft,
  hasSearchResults,
  moveTreeNode,
  nodeKey,
  parseNodeKey,
  treeNodes,
} from '../../settingLibraries/index.js';
import { PresetContextMenu, usePresetContextMenu } from './PresetContextMenu.jsx';

const HIDDEN_TIMELINE_DISABLE_CONFIRMATION = {
  title: '关闭隐藏工具时间线？',
  message: '关闭后 AI 回复将无法流式显示，请着重考虑。',
};

const CreateFolderIcon = SETTING_LIBRARY_CREATE_ICONS.group;
const CreateEntryIcon = SETTING_LIBRARY_CREATE_ICONS.entry;
const CreateReferenceIcon = SETTING_LIBRARY_CREATE_ICONS.reference;

export function shouldConfirmHiddenTimelineDisable(entry, nextEnabled) {
  return nextEnabled === false && isHiddenToolTimelineEntry(entry);
}

export function PresetPromptEditor({ preset, onChange, saveAction, workspace = false, dirty, saving }) {
  const tUi = useProductTranslation();
  const creatorPreset = preset.purpose === 'creator';
  const { compact } = useEditorPresentation();
  const [query, setQuery] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [entryMoreOpen, setEntryMoreOpen] = useState(false);
  const [selected, setSelected] = useState(() => workspace && preset.entries[0] ? { kind: 'entry', id: preset.entries[0].id } : null);
  const [editing, setEditing] = useState(false);
  const [moving, setMoving] = useState(null);
  const [pendingHiddenTimelineDisableId, setPendingHiddenTimelineDisableId] = useState('');
  const [deleteBatch, setDeleteBatch] = useState(null);
  const nameInputRef = useRef(null);
  const context = usePresetContextMenu();
  const library = useMemo(() => ({
    characterId: `agent-preset:${preset.id}`,
    name: preset.name,
    entries: preset.entries,
    groups: preset.groups,
    promptPositions: preset.promptPositions,
    activeVersionId: preset.activeVersionId,
    versions: [],
    listAllExpanded: false,
    expandedGroupIds: preset.expandedGroupIds,
  }), [preset]);
  const nodes = useMemo(() => treeNodes(library), [library]);
  const selectableIds = selectableTreeIds(nodes);
  const multi = useEditorMultiSelect(selectableIds, preset.id);
  const searchHasResults = useMemo(() => hasSearchResults(library, query), [library, query]);
  const selectedValue = selected?.kind === 'group'
    ? preset.groups.find((group) => group.id === selected.id)
    : selected?.kind === 'entry'
      ? preset.entries.find((entry) => entry.id === selected.id)
      : null;

  useEffect(() => {
    setSelected(workspace && preset.entries[0] ? { kind: 'entry', id: preset.entries[0].id } : null);
    setEditing(false);
    setMoving(null);
    setQuery('');
    setDeleteBatch(null);
    context.close();
  }, [preset.id]);

  function createNode(kind, target = selected) {
    if (creatorPreset && kind === 'reference') return;
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
      const entry = { ...createEntryDraft(parentId, order, preset.entries, kind === 'reference' ? 'reference' : 'prompt'), title: kind === 'reference' ? tUi("新建 EJS引用设定") : tUi("新建提示词") };
      onChange({ ...preset, entries: [...preset.entries, entry], expandedGroupIds: [...new Set([...preset.expandedGroupIds, parentId].filter(Boolean))] });
      setSelected({ kind: 'entry', id: entry.id });
    }
    setAddOpen(false);
    setQuery('');
    setEditing(true);
    requestAnimationFrame(() => nameInputRef.current?.select());
  }

  function duplicateEntry(source) {
    const order = Math.max(0, ...preset.groups.filter((group) => group.parentId === source.groupId).map((group) => group.treeViewOrder), ...preset.entries.filter((entry) => entry.groupId === source.groupId).map((entry) => entry.treeViewOrder)) + 1;
    const fresh = createEntryDraft(source.groupId, order, preset.entries);
    const entry = { ...structuredClone(source), id: fresh.id, title: tUi("{value0} 副本", {value0: source.title || tUi("未命名提示词")}), treeViewOrder: order, viewOrder: fresh.viewOrder, groupViewOrder: fresh.groupViewOrder, createdAt: fresh.createdAt, updatedAt: fresh.updatedAt };
    onChange({ ...preset, entries: [...preset.entries, entry] });
    setSelected({ kind: 'entry', id: entry.id });
  }

  function renameNode(target) {
    setSelected({ kind: target.kind, id: target.value.id });
    setEditing(true);
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

  function updateTreeEntry(entryId, patch) {
    const entry = preset.entries.find((item) => item.id === entryId);
    if (!entry) return;
    if (Object.hasOwn(patch, 'enabled') && patch.enabled !== entry.enabled) {
      requestEntryEnabledChange(entry);
      return;
    }
    updateEntry({ ...entry, ...patch });
  }

  function handleExpandedIdsChange(expandedKeys) {
    const expandedGroupIds = expandedKeys.map(parseNodeKey).filter((item) => item.kind === 'group').map((item) => item.id);
    onChange({ ...preset, expandedGroupIds });
  }

  function handleMove({ dragId, parentId, destinationIndex, expandParentId }) {
    const moved = parseNodeKey(dragId);
    const destinationParentId = parentId ? parseNodeKey(parentId).id : '';
    if (!moved.id || PINNED_ENTRY_IDS.has(moved.id)) return;
    const next = moveTreeNode(
      preset,
      moved,
      destinationParentId,
      destinationIndex,
    );
    const expandedParent = expandParentId ? parseNodeKey(expandParentId).id : '';
    onChange(expandedParent
      ? { ...next, expandedGroupIds: [...new Set([...next.expandedGroupIds, expandedParent])] }
      : next);
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

  function openTreeNodeContextMenu(event, data) {
    if (multi.active) { event.preventDefault(); event.stopPropagation(); return; }
    if (compact) {
      event.preventDefault();
      event.stopPropagation();
      setSelected({ kind: data.nodeKind, id: data.recordId });
      return;
    }
    setAddOpen(false);
    if (data.fixed) {
      context.open(event);
      return;
    }
    const value = data.nodeKind === 'group'
      ? preset.groups.find((group) => group.id === data.recordId)
      : preset.entries.find((entry) => entry.id === data.recordId);
    if (!value) return;
    context.open(event, { kind: data.nodeKind, value });
  }

  function openTreeContextMenu(event) {
    setAddOpen(false);
    if (multi.active) { event.preventDefault(); return; }
    if (compact) { event.preventDefault(); return; }
    context.open(event);
  }

  function openEditor(key = selected ? nodeKey(selected.kind, selected.id) : '') {
    const next = parseNodeKey(key);
    if (!next.id) return;
    setSelected(next);
    setEditing(true);
  }

  function closeEditor() {
    if (compact) setEditing(false);
    else setSelected(null);
  }

  function toggleMultiSelect() {
    multi.toggle();
    setSelected(null);
    setEditing(false);
    setMoving(null);
    setAddOpen(false);
    context.close();
  }

  function copySelected() {
    const targets = selectedTreeRootIds(nodes, multi.selected).map(parseNodeKey);
    const next = targets.reduce((current, target) => {
      const value = target.kind === 'group' ? current.groups.find(item => item.id === target.id) : current.entries.find(item => item.id === target.id);
      return copySettingNode(current, target, target.kind === 'group' ? value.parentId : value.groupId).library;
    }, preset);
    onChange(next);
    multi.clear();
  }

  function confirmDeleteBatch() {
    const removedGroups = new Set(), removedEntries = new Set();
    for (const key of deleteBatch.ids) {
      const target = parseNodeKey(key);
      if (target.kind === 'group') descendantGroups(preset.groups, target.id).forEach(id => removedGroups.add(id));
      else removedEntries.add(target.id);
    }
    onChange({ ...preset,
      groups: preset.groups.filter(group => !removedGroups.has(group.id)),
      entries: preset.entries.filter(entry => PINNED_ENTRY_IDS.has(entry.id) || !removedEntries.has(entry.id) && !removedGroups.has(entry.groupId)),
      expandedGroupIds: preset.expandedGroupIds.filter(id => !removedGroups.has(id)),
    });
    multi.clear();
    setDeleteBatch(null);
  }

  const destinationId = selected?.kind === 'group' ? selected.id : selectedValue?.groupId || '';
  const canModify = Boolean(selectedValue) && !PINNED_ENTRY_IDS.has(selectedValue.id);
  function pasteMove() {
    if (!moving || !canTransferSettingNode(preset, moving.target, destinationId)) return;
    handleMove({ dragId: nodeKey(moving.target.kind, moving.target.id), parentId: destinationId ? nodeKey('group', destinationId) : '',
      destinationIndex: Number.MAX_SAFE_INTEGER, expandParentId: destinationId ? nodeKey('group', destinationId) : '' });
    setSelected(moving.target);
    setMoving(null);
  }

  const Inspector = workspace || compact ? SettingLibraryDocument : SettingLibraryInspector;
  const inspector = !multi.active && selectedValue && (!compact || editing) ? <Inspector
    key={workspace || compact ? `${selected.kind}:${selectedValue.id}` : undefined}
    selected={{ kind: selected.kind, value: selectedValue }}
    library={library}
    allowCustomPromptPositions
    creatorPreset={creatorPreset}
    dirty={dirty} saving={saving} titleReadOnly={PINNED_ENTRY_IDS.has(selectedValue.id)}
    hideReferenceTabs
    entryActions={(workspace || compact) && selected.kind === 'entry' && !PINNED_ENTRY_IDS.has(selectedValue.id) ? <Menu portal dense open={entryMoreOpen} onClose={() => setEntryMoreOpen(false)}
      anchor={<Button data-dsh-control variant="outline" className="setting-folder-more" icon={<DotsThree size={18} />} aria-label={tUi('提示词操作')} onClick={() => setEntryMoreOpen(!entryMoreOpen)} />}
      items={[{ id: 'copy', label: tUi('复制'), icon: <Copy size={15} /> }, { id: 'rename', label: tUi('重命名'), icon: <PencilSimple size={15} /> }, { id: 'delete', label: tUi('删除'), icon: <TrashIcon size={15} />, danger: true }]}
      onSelect={id => { setEntryMoreOpen(false); if (id === 'copy') duplicateEntry(selectedValue); else if (id === 'rename') renameNode({ kind: 'entry', value: selectedValue }); else deleteEntry(selectedValue.id); }} /> : null}
    nameInputRef={nameInputRef}
    SelectedIcon={selected.kind === 'group' ? DshFolderClosedIcon : selectedValue.contentMode === 'ejs' ? Code : selectedValue.dynamicMode === 'ejs_reference' ? LinkSimple : FileText}
    onClose={closeEditor}
    onUpdateGroup={(patch) => onChange({ ...preset, groups: preset.groups.map((group) => group.id === selected.id ? { ...group, ...patch } : group) })}
    onDeleteGroup={() => deleteGroup(selected.id)}
    onUpdateEntry={updateEntry}
    onEntriesChange={(entries) => onChange({ ...preset, entries })}
    onOpenEntry={(entryId) => { setSelected({ kind: 'entry', id: entryId }); setEditing(true); }}
    onRequestDeleteOpening={() => {}}
    onPromptPositionsChange={(promptPositions, entries = preset.entries) => onChange({ ...preset, promptPositions, entries })}
  /> : null;
  const menuTarget = context.menu?.target;
  const createTarget = menuTarget ? { kind: menuTarget.kind, id: menuTarget.value.id } : null;
  const pinnedMenuTarget = menuTarget?.kind === 'entry' && PINNED_ENTRY_IDS.has(menuTarget.value.id);
  const menuActions = pinnedMenuTarget ? [] : !menuTarget || menuTarget.kind === 'group' ? [
    { label: tUi("新建文件夹"), icon: CreateFolderIcon, run: () => createNode('group', createTarget) },
    { label: tUi("新建提示词"), icon: CreateEntryIcon, run: () => createNode('entry', createTarget) },
    ...(!creatorPreset ? [{ label: tUi("新建 EJS引用设定"), icon: CreateReferenceIcon, run: () => createNode('reference', createTarget) }] : []),
  ] : [{ label: tUi("复制"), icon: Copy, run: () => duplicateEntry(menuTarget.value) }];
  if (menuTarget && !pinnedMenuTarget) menuActions.push(
    { label: '重命名', icon: PencilSimple, run: () => renameNode(menuTarget) },
    { label: '删除', icon: TrashIcon, danger: true, run: () => menuTarget.kind === 'group' ? deleteGroup(menuTarget.value.id) : deleteEntry(menuTarget.value.id) },
  );

  const Layout = workspace && !compact ? EditorLibraryWorkspace : LegacyPromptLayout;
  return (
    <Layout className={workspace && !compact ? "preset-prompt-workspace" : `preset-prompt-editor setting-library-layout${multi.active ? ' is-multiselect' : ''}`} aria-label={tUi("预设提示词")} onMouseDown={() => setAddOpen(false)}
      label={tUi('提示词')} query={query} onQueryChange={setQuery}
      directoryHeading={<h1 className="preset-prompt-directory-title">{tUi('预设提示词')}</h1>}
      directoryActions={<><Menu portal dense open={addOpen} onClose={() => setAddOpen(false)} anchor={<Button data-dsh-control variant="outline" className="setting-create" icon={<Plus size={16} />} disabled={multi.active || saving} aria-label={tUi('新建提示词')} onClick={() => setAddOpen(!addOpen)}>{tUi('新建')}</Button>}
        items={[{ id: 'group', label: tUi('文件夹'), icon: <CreateFolderIcon size={16} /> }, { id: 'entry', label: tUi('提示词'), icon: <CreateEntryIcon size={16} /> }, ...(!creatorPreset ? [{ id: 'reference', label: tUi('EJS引用设定'), icon: <CreateReferenceIcon size={16} /> }] : [])]} onSelect={id => createNode(id)} />
        {saveAction}<Menu portal dense open={moreOpen} onClose={() => setMoreOpen(false)} anchor={<Button data-dsh-control variant="outline" className="setting-directory-more" icon={<DotsThree size={18} />} aria-label={tUi('提示词操作')} onClick={() => setMoreOpen(!moreOpen)} />}
          items={[{ id: 'multi', label: multi.active ? tUi('完成多选') : tUi('多选'), icon: <ListChecks size={16} /> }, { id: 'expand', label: tUi('展开全部文件夹') }, { id: 'collapse', label: tUi('收起全部文件夹') }]}
          onSelect={id => { setMoreOpen(false); if (id === 'multi') toggleMultiSelect(); else onChange({ ...preset, expandedGroupIds: id === 'expand' ? preset.groups.map(group => group.id) : [] }); }} /></>}
      documentLayout={compact} inspector={inspector} inspectorTitle={selected?.kind === 'group' ? tUi("文件夹") : selectedValue?.title || tUi("提示词")} onCloseInspector={closeEditor}>
      <div className="setting-library-browser editor-collection-browser">
        {compact && <EditorCollectionToolbar heading={tUi('预设提示词')} query={query} onQueryChange={setQuery} placeholder={tUi('搜索提示词')}
          disabled={saving} selection={{ ...multi, toggle: toggleMultiSelect }} save={saveAction} createItems={[
            { label: tUi('文件夹'), Icon: CreateFolderIcon, run: () => createNode('group') },
            { label: tUi('提示词'), Icon: CreateEntryIcon, run: () => createNode('entry') },
            ...(!creatorPreset ? [{ label: tUi('EJS引用设定'), Icon: CreateReferenceIcon, run: () => createNode('reference') }] : []),
          ]} />}
        {!workspace && !compact && <div className="setting-library-toolbar editor-collection-toolbar" onMouseDown={(event) => event.stopPropagation()}>
          <Input data-dsh-control className="editor-collection-search" type="search" icon={<MagnifyingGlass size={16} />}
            value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tUi("搜索提示词")} aria-label={tUi("搜索提示词")} />
          <div className="editor-collection-actions">
          {!compact && <div className="setting-library-add-wrap">
            <Button data-dsh-control type="button" className="editor-collection-action" variant="primary" disabled={multi.active} aria-expanded={addOpen} onClick={() => setAddOpen((value) => !value)}><Plus size={16} />{tUi("新建")}</Button>
            {addOpen ? <div className="setting-library-popover" role="menu">
              <button type="button" role="menuitem" onClick={() => createNode('group')}><CreateFolderIcon size={16} />{tUi("文件夹")}</button>
              <button type="button" role="menuitem" onClick={() => createNode('entry')}><CreateEntryIcon size={16} />{tUi("提示词")}</button>
              {!creatorPreset && <button type="button" role="menuitem" onClick={() => createNode('reference')}><CreateReferenceIcon size={16} />{tUi("EJS引用设定")}</button>}
            </div> : null}
          </div>}
          <Button data-dsh-control className="editor-collection-action" variant="outline" icon={<ListChecks size={16} />}
            aria-label={multi.active ? tUi("完成") : tUi("多选")} aria-pressed={multi.active} onClick={toggleMultiSelect}>{multi.active ? tUi("完成") : tUi("多选")}</Button>
          {saveAction}
          </div>
        </div>}
        <EditorSelectionBar selection={multi} visibleIds={visibleTreeSelectionIds(nodes, query)} onCopy={copySelected}
          onDelete={() => setDeleteBatch({ ids: selectedTreeRootIds(nodes, multi.selected), title: tUi("删除选中的 {value0} 项？", {value0: multi.selected.size}), message: tUi("所选文件夹及其内容会在保存后删除。") })} />
        <div
          className="preset-prompt-tree setting-library-tree editor-sidebar-directory"
          tabIndex={0}
          aria-label={tUi("预设提示词列表")}
          onMouseDown={(event) => {
            if (event.button === 0 && !event.target.closest('[role="treeitem"]')) setSelected(null);
          }}
          onContextMenu={openTreeContextMenu}
        >
          <SettingTreeActionsContext.Provider value={{ openContextMenu: openTreeNodeContextMenu, updateEntryById: updateTreeEntry, selection: multi, openEditor: compact && !multi.active ? openEditor : undefined }}>
            <SettingLibraryTree
              key={preset.id}
              nodes={nodes}
              touchReorder={compact && !moving && !multi.active}
              dragEnabled={!moving && !multi.active}
              query={query}
              selectedId={!multi.active && selected ? nodeKey(selected.kind, selected.id) : ''}
              expandedIds={preset.expandedGroupIds.map((id) => nodeKey('group', id))}
              onSelectedIdChange={(id) => {
                if (multi.active) { if (selectableIds.includes(id)) multi.check(id, !multi.selected.has(id)); return; }
                const next = parseNodeKey(id);
                setSelected(next.id ? next : null);
                setEditing(false);
              }}
              onExpandedIdsChange={handleExpandedIdsChange}
              onMove={handleMove}
              ariaLabel={tUi("预设提示词树")}
            />
          </SettingTreeActionsContext.Provider>
          {!query && !nodes.length ? <p className="setting-library-empty">{tUi("还没有预设提示词")}</p> : null}
          {query && !searchHasResults ? <p className="setting-library-empty">{tUi("没有匹配的提示词")}</p> : null}
        </div>
        {compact && !multi.active && <MobileEditorActions label={tUi("提示词操作")} selectionId={selected ? nodeKey(selected.kind, selected.id) : ''}
          canEdit={Boolean(selectedValue)} canModify={canModify} clipboard={moving}
          canPaste={Boolean(moving && canTransferSettingNode(preset, moving.target, destinationId))}
          onEdit={() => openEditor()} onMove={() => { setMoving({ target: selected }); setSelected(null); }}
          onPaste={pasteMove} onCancel={() => setMoving(null)}
          onDelete={() => selected.kind === 'group' ? deleteGroup(selected.id) : deleteEntry(selected.id)}
          createItems={[
            { label: tUi("文件夹"), Icon: CreateFolderIcon, run: () => createNode('group') },
            { label: tUi("提示词"), Icon: CreateEntryIcon, run: () => createNode('entry') },
            ...(!creatorPreset ? [{ label: tUi("EJS引用设定"), Icon: CreateReferenceIcon, run: () => createNode('reference') }] : []),
          ]}
          moreItems={canModify ? [
            ...(selected.kind === 'entry' ? [{ label: tUi("复制"), Icon: Copy, run: () => duplicateEntry(selectedValue) }] : []),
            { label: tUi("重命名"), Icon: PencilSimple, run: () => renameNode({ kind: selected.kind, value: selectedValue }) },
          ] : []} />}
      </div>

      {context.menu ? <PresetContextMenu menu={context.menu} actions={menuActions} onClose={context.close} /> : null}
      <ConfirmationDialog target={deleteBatch} confirmLabel={tUi("删除")} tone="destructive" onCancel={() => setDeleteBatch(null)} onConfirm={confirmDeleteBatch} />
      <ConfirmationDialog
        target={pendingHiddenTimelineDisableId ? localizeUiCopy(HIDDEN_TIMELINE_DISABLE_CONFIRMATION, tUi) : null}
        confirmLabel={tUi("仍要关闭")}
        onCancel={() => setPendingHiddenTimelineDisableId('')}
        onConfirm={confirmHiddenTimelineDisable}
      />
    </Layout>
  );
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

function LegacyPromptLayout({ label, query, onQueryChange, directoryHeading, directoryActions, ...props }) {
  return <EditorSidebarLayout {...props} />;
}
