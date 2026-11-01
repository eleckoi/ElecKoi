import { useMemo, useRef, useState } from 'react';
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes';
import { DesktopError } from '@shared/foundation/DesktopError';
import { BookOpen, CaretRight, PencilSimple, Trash } from '../../../ui/icons/interfaceIcons.jsx';
import { ImportIcon } from '../../../ui/icons/index.jsx';
import { Button, Menu, MenuSurface } from '@deepseek-ai/dsh-client-ui-primitives';
import { EditorManagementModal } from '../../../ui/ui/EditorCollectionControls.jsx';
import { VersionNameDialog } from '../../../ui/ui/VersionNameDialog.jsx';
import { useCharacterConfigurationDraft } from '../../../ui/hooks/useCharacterConfigurationDraft.js';
import { globalSettingLibrarySchema } from '@shared/contracts/settingLibrary/global';
import { SettingLibraryTree, SettingTreeActionsContext } from './SettingLibraryTree.jsx';
import { ConfirmationDialog } from './SettingLibraryControls.jsx';
import { createId, uniqueName } from '../model/settingLibraryEditing.js';
import { nodeKey, treeNodes, hasSearchResults } from '../model/settingLibraryTree.js';
import { parseSettingLibraryFile } from '../model/settingLibraryTransfer.js';
import { resolveFailure } from '../../../utils/failureText.js';

const empty = { revision: 0, libraries: [] };
const unavailable = { getSnapshot: () => ({ status: 'ready', value: empty }), read: async () => empty,
  save: async () => { throw new DesktopError(ELECKOI_FAILURE_CODES.lifecycleNotReady, '全局设定库服务不可用。', { what: '全局设定库服务' }); }, subscribe: () => () => {} };

export function useGlobalSettingLibraries(model, onSelect) {
  const [selection, setSelection] = useState(null);
  const [expanded, setExpanded] = useState(new Set());
  const [expandedGroups, setExpandedGroups] = useState({});
  const adapter = useMemo(() => {
    const service = model || unavailable;
    return { getSnapshot: () => service.getSnapshot(), read: () => service.read(), save: (_key, value) => service.save(value),
      subscribe: listener => service.subscribe((_kind, _address, snapshot) => listener('configuration', 'global', snapshot)) };
  }, [model]);
  const draft = useCharacterConfigurationDraft({ characterId: 'global', configuration: adapter, label: '全局设定库', saveShortcut: false,
    rebaseAfterSave: (current, saved) => ({ ...current, revision: saved.revision }) });
  const library = draft.library?.libraries.find(item => item.id === selection?.libraryId);
  const activeLibraryRef = useRef(library);
  activeLibraryRef.current = library;
  function select(libraryId, key = '') { setSelection({ libraryId, key }); onSelect(key); }
  function updateLibrary(id, updater) {
    draft.changeLibrary(current => ({ ...current, libraries: current.libraries.map(item => {
      if (item.id !== id) return item;
      const next = { ...(typeof updater === 'function' ? updater(item) : updater), updatedAt: new Date().toISOString() };
      if (selection?.libraryId === id) activeLibraryRef.current = next;
      return next;
    }) }));
  }
  function setEnabled(id, enabled) {
    updateLibrary(id, item => ({ ...item, enabled }));
  }
  function importLibrary(source) {
    if (!source) throw new DesktopError(ELECKOI_FAILURE_CODES.statePrecondition, '请选择要导入的设定库。', { what: '选择要导入的设定库' });
    const timestamp = new Date().toISOString();
    const value = globalSettingLibrarySchema.parse({ id: createId('global-library'),
      name: uniqueName(source.name?.trim() || '导入设定库', new Set(draft.libraryRef.current.libraries.map(item => item.name))),
      enabled: true, entries: source.entries.filter(entry => entry.kind === 'normal'), groups: source.groups,
      promptPositions: source.promptPositions, listAllExpanded: source.listAllExpanded ?? false,
      expandedGroupIds: source.expandedGroupIds ?? [], createdAt: timestamp, updatedAt: timestamp });
    draft.changeLibrary(current => ({ ...current, libraries: [...current.libraries, value] }));
    select(value.id);
  }
  function remove(id) {
    draft.changeLibrary(current => ({ ...current, libraries: current.libraries.filter(item => item.id !== id) }));
    if (selection?.libraryId === id) { setSelection(null); onSelect(''); }
  }
  return { ...draft, available: Boolean(model), selection, library, activeLibraryRef, expanded, setExpanded, expandedGroups, setExpandedGroups,
    select, clear: () => setSelection(null), updateLibrary, setEnabled, importLibrary, remove };
}

/** Creates global libraries from existing resources. Contents use the shared setting editor. */
export function GlobalSettingLibraryImport({ state, settingLibraries, disabled }) {
  const input = useRef(null), request = useRef(0);
  const [menu, setMenu] = useState(false), [dialog, setDialog] = useState(false);
  const [characters, setCharacters] = useState([]), [source, setSource] = useState(null), [characterId, setCharacterId] = useState('');
  const [versionId, setVersionId] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  function close() { request.current++; setDialog(false); setBusy(false); }
  async function openCharacters() {
    const generation = ++request.current;
    setDialog(true); setCharacters([]); setSource(null); setCharacterId(''); setVersionId(''); setError(''); setBusy(true);
    try {
      const catalog = await settingLibraries.listCharacters();
      if (generation === request.current) setCharacters(catalog.items);
    } catch (cause) { if (generation === request.current) setError(resolveFailure(cause, { fallback: '读取角色列表失败' }).text); }
    finally { if (generation === request.current) setBusy(false); }
  }
  async function chooseCharacter(id) {
    const generation = ++request.current;
    setCharacterId(id); setSource(null); setVersionId(''); setError('');
    if (!id) return;
    setBusy(true);
    try {
      const library = await settingLibraries.readUntracked(id);
      if (!library.versions.some(version => version.id === library.activeVersionId)) throw new DesktopError(ELECKOI_FAILURE_CODES.lookupNotFound, '来源角色的当前设定库版本不存在。', { what: '来源角色的当前设定库版本' });
      if (generation === request.current) { setSource(library); setVersionId(library.activeVersionId); }
    } catch (cause) { if (generation === request.current) setError(resolveFailure(cause, { fallback: '读取来源设定库失败' }).text); }
    finally { if (generation === request.current) setBusy(false); }
  }
  async function importFile(event) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    try {
      const parsed = parseSettingLibraryFile(await file.text(), 'auto', file.name);
      state.importLibrary({ ...parsed, name: parsed.name || file.name.replace(/\.json$/i, '') });
    } catch (cause) { state.setError(resolveFailure(cause, { fallback: '导入全局设定库失败' }).text); }
  }
  const version = source?.versions.find(item => item.id === versionId);
  return <>
    <Menu open={menu} portal dense anchor={<Button className="editor-collection-action" variant="outline" icon={<ImportIcon size={16} />}
      disabled={disabled || !state.libraryRef.current} aria-label="导入全局设定库" onClick={() => setMenu(value => !value)}>导入</Button>}
      items={[{ id: 'character', label: '从角色设定库' }, { id: 'file', label: '从本地文件' }]}
      onClose={() => setMenu(false)} onSelect={id => { setMenu(false); if (id === 'character') void openCharacters(); else input.current?.click(); }} />
    <input ref={input} type="file" accept=".json,application/json" hidden aria-label="全局设定库文件" onChange={importFile} />
    {dialog ? <EditorManagementModal title="导入角色设定库" onClose={close} className="global-library-import-dialog"
      footer={<><Button variant="outline" onClick={close}>取消</Button><Button disabled={busy || !version} onClick={() => {
        const character = characters.find(item => item.id === characterId);
        state.importLibrary({ ...version, name: `${character.name || '未命名角色'} · ${version.name || '设定库'}` }); close();
      }}>导入</Button></>}>
      <div className="global-library-import-fields">
        <label><span>来源角色</span><select value={characterId} disabled={busy} onChange={event => void chooseCharacter(event.target.value)}>
          <option value="">选择角色</option>{characters.map(item => <option key={item.id} value={item.id}>{item.name || '未命名角色'}</option>)}
        </select></label>
        {source ? <label><span>来源版本</span><select value={versionId} onChange={event => setVersionId(event.target.value)}>
          {source.versions.map(item => <option key={item.id} value={item.id}>{item.name || '未命名版本'}</option>)}
        </select></label> : null}
        {version ? <p>{version.entries.filter(item => item.kind === 'normal').length} 条设定</p> : null}
        {busy ? <p role="status">正在读取…</p> : error ? <p role="alert">{error}</p> : characters.length === 0 ? <p>暂无可导入的角色设定库</p> : null}
      </div>
    </EditorManagementModal> : null}
  </>;
}

// Tree identity includes its owning library, since separate imports can retain the same entry IDs.
function scopeTreeNodes(nodes, prefix) {
  return nodes.map(node => ({ ...node, id: prefix + node.id, key: prefix + node.key, value: prefix + node.value,
    children: node.children ? scopeTreeNodes(node.children, prefix) : undefined }));
}

export function GlobalSettingLibrariesDirectory({ state, query, disabled, editor }) {
  const [deleting, setDeleting] = useState(null);
  const [renaming, setRenaming] = useState(null);
  if (!state.available) return null;
  const libraries = state.libraryRef.current?.libraries;
  const visible = libraries?.filter(library => !query.trim() || library.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) || hasSearchResults(library, query));
  return <section className="global-setting-libraries" aria-label="全局设定库" onMouseDown={event => event.stopPropagation()} onContextMenu={event => { event.preventDefault(); event.stopPropagation(); }}>
    {!libraries ? <p role={state.error ? 'alert' : 'status'} className="global-setting-library-empty">{state.error || '正在读取…'}</p> : null}
    {libraries?.length === 0 ? <p className="global-setting-library-empty">暂无全局设定库，导入后可在这里启用。</p> : visible?.length === 0 ? <p className="global-setting-library-empty">没有匹配的设定库</p> : null}
    {visible?.map(library => {
      const open = state.expanded.has(library.id) || Boolean(query.trim());
      const selected = state.selection?.libraryId === library.id;
      const prefix = `${JSON.stringify(library.id)}:`;
      const unscoped = key => key.startsWith(prefix) ? key.slice(prefix.length) : null;
      const choose = key => { state.select(library.id, key); };
      const actions = { saving: disabled,
        updateEntryById: (id, patch) => state.updateLibrary(library.id, current => ({ ...current,
          entries: current.entries.map(entry => entry.id === id ? { ...entry, ...patch } : entry) })),
        openEditor: editor.compact ? key => { choose(unscoped(key)); editor.openEditor(unscoped(key)); } : undefined,
        openContextMenu: (event, node) => editor.openContextMenu(event, { ...node, key: unscoped(node.key) }, library),
        selection: selected ? { ...editor.selection, selected: new Set([...editor.selection.selected].map(key => prefix + key)),
          check: (key, checked) => editor.selection.check(unscoped(key), checked) } : null };
      const nodeQuery = library.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) ? '' : query;
      const toggle = () => state.setExpanded(current => { const next = new Set(current); next.has(library.id) ? next.delete(library.id) : next.add(library.id); return next; });
      return <MenuSurface key={library.id} className={`global-setting-library${selected ? ' is-current' : ''}${library.enabled === false ? ' is-disabled' : ''}`}>
        <div className="global-setting-library-header">
          <button type="button" className="global-setting-library-expand" aria-label={`${open ? '折叠' : '展开'}${library.name}`} aria-expanded={open} onClick={toggle}><CaretRight size={13} /></button>
          <button type="button" className="global-setting-library-name" title={library.name} onClick={() => { choose(''); toggle(); }}><BookOpen size={17} /><span>{library.name}</span></button>
          <span className="setting-library-tree-count">{library.entries.length}</span>
          <div className="global-setting-library-actions">
          <button type="button" className="setting-library-tree-switch" role="switch" aria-checked={library.enabled} aria-label={`${library.enabled ? '停用' : '启用'}全局库${library.name}`} disabled={disabled}
            onClick={() => state.setEnabled(library.id, !library.enabled)}><span aria-hidden="true" /></button>
          <button type="button" className="global-setting-library-action global-setting-library-rename" aria-label={`重命名全局库${library.name}`} title="重命名" disabled={disabled}
            onClick={() => setRenaming({ id: library.id, name: library.name })}><PencilSimple size={15} /></button>
          <button type="button" className="global-setting-library-action global-setting-library-delete" aria-label={`删除全局库${library.name}`} title="删除" disabled={disabled}
            onClick={() => setDeleting({ id: library.id, title: `删除“${library.name}”？`, message: '此库将在保存后删除，并对所有角色停止生效。来源角色和本地文件不会改动。' })}><Trash size={15} /></button>
          </div>
        </div>
        {open ? <div className="global-setting-library-entries" onContextMenu={event => editor.openTreeContextMenu(event, library)}><SettingTreeActionsContext.Provider value={actions}>
          <SettingLibraryTree nodes={scopeTreeNodes(treeNodes(library), prefix)} query={nodeQuery} selectedId={selected && !editor.selection.active && editor.selectedKey ? prefix + editor.selectedKey : ''}
            expandedIds={(state.expandedGroups[library.id] ?? (library.listAllExpanded ? library.groups.map(item => nodeKey('group', item.id)) : library.expandedGroupIds.map(id => nodeKey('group', id)))).map(key => prefix + key)}
            dragEnabled={!disabled && !editor.clipboard && !editor.selection.active} touchReorder={editor.compact && !editor.clipboard && !editor.selection.active}
            onSelectedIdChange={key => { const raw = unscoped(key); if (raw === null) return;
              if (selected && editor.selection.active) editor.selection.check(raw, !editor.selection.selected.has(raw)); else choose(raw); }}
            onExpandedIdsChange={keys => state.setExpandedGroups(current => ({ ...current, [library.id]: keys.map(unscoped).filter(key => key !== null) }))}
            onMove={drop => { const dragId = unscoped(drop.dragId), parentId = drop.parentId ? unscoped(drop.parentId) : '', expandParentId = drop.expandParentId ? unscoped(drop.expandParentId) : '';
              if (dragId === null || parentId === null || expandParentId === null) return;
              editor.moveLibrary(library.id, { ...drop, dragId, parentId, expandParentId }); }}
            ariaLabel={`${library.name}设定树`} />
        </SettingTreeActionsContext.Provider>{!library.entries.length && !library.groups.length ? <p className="global-setting-library-empty">暂无设定</p> : null}</div> : null}
      </MenuSurface>;
    })}
    {renaming ? <VersionNameDialog key={renaming.id} title="重命名全局设定库" nameLabel="设定库名称" confirmLabel="完成"
      initialName={renaming.name} versions={[]} onCancel={() => setRenaming(null)} onCreate={name => {
        state.updateLibrary(renaming.id, current => ({ ...current, name })); setRenaming(null);
      }} /> : null}
    <ConfirmationDialog target={deleting} confirmLabel="删除" tone="destructive" onCancel={() => setDeleting(null)} onConfirm={() => { state.remove(deleting.id); setDeleting(null); }} />
  </section>;
}
