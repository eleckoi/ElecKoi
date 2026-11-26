import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button, focusWithoutRing, IconChevronDownOutlineRegular, Menu, Modal, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives';
import { CheckCircle, SortAscending } from '@phosphor-icons/react';
import { useProductTranslation } from '../../../app/i18n/ProductLocaleContext.jsx';
import { CopyIcon, ExportIcon, ImportIcon, PencilIcon, TrashIcon } from '../../../ui/icons/index.jsx';
import { DshFolderClosedIcon } from '../../../ui/icons/dshTreeIcons.jsx';
import { CatalogManagerSearch } from '../../../ui/ui/CatalogManagerSearch.jsx';
import { ConfirmationDialog } from '../../../ui/ui/ConfirmationDialog.jsx';
import { FailureAlert } from '../../../ui/ui/FailureAlert.jsx';
import { GroupNameDialog } from '../../../ui/ui/GroupNameDialog.jsx';
import { useEditorContextMenu } from '../../../ui/ui/EditorContextMenu.jsx';
import { useCatalogSlots } from '../../../ui/ui/CatalogSlotsContext.jsx';
import { VirtualMasonry } from '../../../ui/ui/VirtualMasonry.jsx';
import { useCharacterSort } from '../../../ui/hooks/useCharacterSort.js';
import { openPresetEditorWindow } from '../window/openPresetEditorWindow.js';
import { usePresets } from './PresetContext.jsx';
import { PresetHomeCard } from './PresetHomeCards.jsx';
import { PresetListPanel } from './PresetListPanel.jsx';
import { PresetOverview } from './PresetOverview.jsx';
import { isDefaultPreset } from './PresetPurposeSwitch.jsx';
import { downloadPresetFile, fileBase64, PresetImportDialog } from './PresetTransfer.jsx';
import '../../persona/styles/character-home.css';
import '../../../ui/styles/catalog-manager.css';
import '../styles/preset-home.css';

const EMPTY = [];
const SORT_CHOICES = [['default', '默认顺序'], ['name', '名称排序']];
const estimateHeight = (_preset, _index, width) => width + 74;

function orderPresets(records, sort, locale) {
  if (sort !== 'name') return records;
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: 'base' });
  return [...records].sort((a, b) => collator.compare(a.name, b.name));
}

function PresetSortMenu({ sort, chooseSort, compact = false }) {
  const t = useProductTranslation();
  const [open, setOpen] = useState(false);
  const trigger = compact ? <Tooltip label={t('排序')} side="bottom" delayMs={500} portal>
    <Button data-dsh-control variant="ghost" size="sm" className="sidebar-section-action" aria-label={t('排序')}
      aria-haspopup="menu" aria-expanded={open} icon={<SortAscending size={16} />} onClick={() => setOpen(!open)} />
  </Tooltip> : <Button data-dsh-control variant="outline" className="catalog-manager-surface-button" aria-label={t('排序')}
    aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
    <SortAscending size={17} /><span>{t('排序')}</span><IconChevronDownOutlineRegular className="catalog-manager-caret" />
  </Button>;
  return <Menu portal align="end" anchor={trigger} open={open} selectedId={sort} onClose={() => setOpen(false)}
    items={SORT_CHOICES.map(([id, label]) => ({ id, label: t(label) }))} onSelect={id => { setOpen(false); void chooseSort(id); }} />;
}

export function PresetHome({ renderLayout, requestedTab, onRequestedTabHandled }) {
  const t = useProductTranslation();
  const { render, actions } = useCatalogSlots();
  const { purpose, purposeCatalog, catalogModel, selectedPresetId, setSelectedPresetId, error: catalogError } = usePresets();
  const { sort, chooseSort, error: sortError } = useCharacterSort('desktop_preset_sort');
  const sidebarSort = useCharacterSort('desktop_preset_sidebar_sort');
  const [opened, setOpened] = useState(null);
  const [groupsByPurpose, setGroupsByPurpose] = useState({});
  const [keyword, setKeyword] = useState('');
  const [selection, setSelection] = useState(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [deleteTargets, setDeleteTargets] = useState(null);
  const [moveTarget, setMoveTarget] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [groupDraft, setGroupDraft] = useState(null);
  const [groupEdit, setGroupEdit] = useState(null);
  const [groupDelete, setGroupDelete] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const restoreDetailFocus = useRef(null);
  const fileInput = useRef(null);
  const importSource = useRef(null);
  const context = useEditorContextMenu();

  const groups = purposeCatalog?.groups ?? EMPTY;
  const records = purposeCatalog?.presets ?? EMPTY;
  const items = useMemo(() => orderPresets(records, sort, t.locale), [records, sort, t.locale]);
  const sidebarItems = useMemo(() => orderPresets(records, sidebarSort.sort, t.locale), [records, sidebarSort.sort, t.locale]);
  const group = groups.find(item => item.id === groupsByPurpose[purpose])?.id || '';
  const query = keyword.trim().toLocaleLowerCase();
  const visible = items.filter(preset => (!group || preset.libraryGroupId === group)
    && (!query || `${preset.name} ${preset.profile.authorName}`.toLocaleLowerCase().includes(query)));
  const showDetail = opened?.purpose === purpose && opened.id === selectedPresetId && records.some(record => record.id === opened.id);
  const currentSelection = selection?.purpose === purpose ? selection : null;
  const selected = items.filter(preset => currentSelection?.ids.includes(preset.id));
  const moving = currentSelection?.mode === 'move';
  const needsTarget = moveTarget !== null;
  const targetValid = moveTarget === '' || groups.some(item => item.id === moveTarget);
  const selectedVisible = visible.length > 0 && visible.every(preset => currentSelection?.ids.includes(preset.id));
  const setFeed = useCallback(node => { if (node) node.inert = showDetail; }, [showDetail]);

  useLayoutEffect(() => {
    if (showDetail || !restoreDetailFocus.current) return;
    const { trigger, previousFocus } = restoreDetailFocus.current;
    restoreDetailFocus.current = null;
    if (!trigger?.isConnected) return;
    const { activeElement, body } = trigger.ownerDocument;
    if (activeElement === body || activeElement === previousFocus) focusWithoutRing(trigger, { preventScroll: true });
  }, [showDetail]);

  useEffect(() => {
    if (!requestedTab || !selectedPresetId) return;
    openPresetEditorWindow(selectedPresetId, requestedTab === 'introduction' ? 'profile' : requestedTab);
    onRequestedTabHandled?.();
  }, [requestedTab, selectedPresetId, onRequestedTabHandled]);
  useEffect(() => {
    setKeyword(''); setOpened(null); setSelection(null); setError(null); setExportOpen(false); setDeleteTargets(null); setMoveTarget(null);
    setGroupDraft(null); setGroupEdit(null); setGroupDelete(null);
    context.close();
  }, [purpose]);

  async function run(action) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try { await action(); }
    catch (failure) { setError(failure); }
    finally { pending.current = false; setBusy(false); }
  }

  function open(id, trigger) {
    if (busy) return;
    setSelectedPresetId(id);
    setOpened({ id, purpose, trigger, previousFocus: document.activeElement });
    setSelection(null);
  }
  function back() {
    restoreDetailFocus.current = opened;
    setOpened(null);
  }
  function chooseGroup(id) {
    setGroupsByPurpose(current => ({ ...current, [purpose]: id }));
  }
  function chooseImport(source) {
    importSource.current = source;
    setImportOpen(false);
    fileInput.current.accept = source === 'sillytavern' ? 'application/json,.json' : 'image/png,application/json,.png,.json';
    fileInput.current.click();
  }
  function importFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const source = importSource.current;
    void run(async () => {
      const result = await catalogModel.import(source, { displayName: file.name, mimeType: file.type, base64: await fileBase64(file) }, purpose);
      chooseGroup('');
      setKeyword('');
      setSelectedPresetId(result.preset.id);
    });
  }
  function startSelection(mode) {
    context.close();
    setError(null);
    setSelection({ purpose, mode, ids: [] });
  }

  function closeMove() {
    if (busy) return;
    setMoveTarget(null);
    setError(null);
  }

  function movePresets(event) {
    event.preventDefault();
    if (!targetValid || !selected.length) return;
    void run(async () => {
      await catalogModel.assignGroups(selected.map(preset => preset.id), moveTarget, purpose);
      setMoveTarget(null);
      setSelection(null);
    });
  }

  function saveGroup() {
    void run(async () => {
      if (groupEdit) await catalogModel.renameGroup(groupEdit.id, groupDraft.trim());
      else await catalogModel.createGroup(groupDraft.trim(), purpose);
      setGroupDraft(null);
      setGroupEdit(null);
    });
  }
  function pick(preset) {
    setSelection(current => ({ ...current, ids: current.ids.includes(preset.id)
      ? current.ids.filter(id => id !== preset.id)
      : current.mode === 'export' ? [preset.id] : [...current.ids, preset.id] }));
  }
  function exportFile(preset, format) {
    if (!preset) return;
    setExportOpen(false);
    void run(async () => {
      downloadPresetFile(await catalogModel.export(preset.id, format));
      setSelection(null);
    });
  }
  function askDelete(presets) {
    setError(null);
    setDeleteTargets(presets);
  }
  function deletePresets() {
    void run(async () => {
      for (const preset of deleteTargets) {
        await catalogModel.delete(preset.id);
        setDeleteTargets(current => current.filter(target => target.id !== preset.id));
        setSelection(current => current && ({ ...current, ids: current.ids.filter(id => id !== preset.id) }));
      }
      setDeleteTargets(null);
      setSelection(null);
    });
  }

  function openPresetMenu(event, preset, surface) {
    event.preventDefault();
    if (busy || currentSelection) return;
    context.open(event, { kind: 'preset', record: preset, surface });
  }

  const sortMenu = <PresetSortMenu sort={sidebarSort.sort} chooseSort={sidebarSort.chooseSort} compact />;
  const sidePanel = <PresetListPanel home={{ items: sidebarItems, sortMenu, sortError: sidebarSort.error, busy, openedId: showDetail ? opened.id : '', onOpen: open,
    onGroupMenu: (event, record) => context.open(event, { kind: 'group', record }),
    onPresetMenu: (event, preset) => openPresetMenu(event, preset, 'pc-sidebar'),
    onAddGroup: () => { setError(null); setGroupEdit(null); setGroupDraft(''); } }} />;
  const menu = context.menu;
  const menuRecord = menu?.target.record;
  const groupMenu = menu?.target.kind === 'group';
  const outline = 'catalog-manager-surface-button';
  const exportFormats = [{ id: 'png', label: t('PNG 预设卡') }, { id: 'json', label: t('JSON 预设卡') }];
  const mainPanel = <div className="character-home-main preset-home-main">
    <section className="character-home-feed preset-home-feed catalog-manager" ref={setFeed} aria-label={t('预设')}>
      <header className="preset-home-toolbar catalog-manager-header-actions">
        {render('eleckoi.preset.library.search', { surface: 'pc-manager', value: keyword, onChange: setKeyword },
          <CatalogManagerSearch label={t('搜索预设')} placeholder={t('搜索预设…')} value={keyword} onChange={setKeyword} />)}
        {!currentSelection ? <>
          <PresetSortMenu sort={sort} chooseSort={chooseSort} />
          <span className="catalog-manager-action-divider" aria-hidden="true" />
          <Button data-dsh-control variant="outline" className={outline} disabled={!visible.length || busy}
            icon={<DshFolderClosedIcon />} onClick={() => startSelection('move')}>{t('移动预设')}</Button>
          <Button data-dsh-control variant="primary" disabled={!purposeCatalog || busy} icon={<ImportIcon />} onClick={() => setImportOpen(true)}>{t('导入预设')}</Button>
          <Button data-dsh-control variant="outline" className={outline} disabled={!visible.length || busy} icon={<ExportIcon />} onClick={() => startSelection('export')}>{t('导出预设')}</Button>
          <Button data-dsh-control variant="outline" className={outline} disabled={busy || !visible.some(preset => !isDefaultPreset(preset.id))}
            icon={<TrashIcon />} onClick={() => startSelection('delete')}>{t('删除')}</Button>
        </> : <>
          {moving ? <>
            <span className="character-manager-selection-count">{t('已选 {count} 项', { count: selected.length })}</span>
            <Button data-dsh-control variant="outline" disabled={busy || !visible.length || selectedVisible}
              onClick={() => setSelection({ ...currentSelection, ids: [...new Set([...currentSelection.ids, ...visible.map(preset => preset.id)])] })}>
              {t('全选当前列表')}
            </Button>
            <Button data-dsh-control variant="primary" disabled={!selected.length || busy}
              onClick={() => { setError(null); setMoveTarget(undefined); }}>{t('移动到分组')}</Button>
          </> : currentSelection.mode === 'export' ? <Menu open={exportOpen} onClose={() => setExportOpen(false)} portal align="end"
            items={exportFormats}
            onSelect={format => exportFile(selected[0], format)} anchor={<Button data-dsh-control variant="primary" disabled={!selected.length || busy}
              aria-haspopup="menu" aria-expanded={exportOpen} onClick={() => setExportOpen(!exportOpen)}>{t('导出预设')}</Button>}>
            {exportOpen && actions('eleckoi.preset.library.menu.actions', { surface: 'pc-manager', purpose, menu: 'export', busy, onDismiss: () => setExportOpen(false) })}
          </Menu> : <Button data-dsh-control variant="primary" disabled={!selected.length || busy}
            onClick={() => askDelete(selected)}>{t('删除')}{selected.length ? ` (${selected.length})` : ''}</Button>}
          <Button data-dsh-control variant="outline" disabled={busy} onClick={() => { setSelection(null); setError(null); }}>{t('取消')}</Button>
        </>}
      </header>
      <div className="preset-home-filters">
        <nav className="character-home-tabs" aria-label={t('分组')}>
          {[{ id: '', name: t('全部') }, ...groups].map(item => <button type="button" key={item.id}
            aria-pressed={item.id === group} onClick={() => chooseGroup(item.id)}>{item.name}</button>)}
        </nav>
        {groupDraft === null && !deleteTargets && !groupDelete && !needsTarget && <FailureAlert failure={error || sortError || catalogError} className="preset-home-error" />}
      </div>
      <VirtualMasonry key={JSON.stringify([purpose, group, query, sort])} items={visible} scrollClassName="preset-home-scroll"
        gridClassName="character-manager-grid preset-home-grid" estimateHeight={estimateHeight}
        empty={purposeCatalog && <p className="preset-home-empty" role="status">{t('没有匹配的预设')}</p>}>
        {preset => {
          const active = purposeCatalog.activePresetIds[purpose] === preset.id;
          const onSelect = event => currentSelection ? pick(preset) : open(preset.id, event?.currentTarget);
          const onOpenMenu = currentSelection ? undefined : event => openPresetMenu(event, preset, 'pc-manager');
          const checked = currentSelection?.ids.includes(preset.id) ?? false;
          return render('eleckoi.preset.library.item', { surface: 'pc-manager', preset, active, selecting: Boolean(currentSelection), selected: Boolean(checked), onSelect, onOpenMenu },
            <PresetHomeCard preset={preset} active={active} onOpen={onSelect} onContextMenu={onOpenMenu} selecting={Boolean(currentSelection)}
              checked={checked} disabled={busy || (currentSelection?.mode === 'delete' && isDefaultPreset(preset.id))} />);
        }}
      </VirtualMasonry>
    </section>
    {showDetail && <PresetOverview key={opened.id} onBack={back} trigger={opened.trigger} />}
    <input hidden type="file" ref={fileInput} onChange={importFile} />
    {importOpen && <PresetImportDialog onSelect={chooseImport} onClose={() => setImportOpen(false)} />}
    {groupDraft !== null && <GroupNameDialog title={t(groupEdit ? '重命名该组' : '新建分组')} value={groupDraft} onChange={setGroupDraft} busy={busy} error={error}
      onConfirm={saveGroup} onCancel={() => { setGroupDraft(null); setGroupEdit(null); setError(null); }} />}
    {deleteTargets && <ConfirmationDialog open destructive busy={busy} title={t('删除预设？')} description={deleteTargets.map(preset => preset.name).join('、')}
      confirmLabel={t('删除')} onCancel={() => { setDeleteTargets(null); setError(null); }} onConfirm={deletePresets}>
      <FailureAlert failure={error} />
    </ConfirmationDialog>}
    {needsTarget && <Modal open title={t('移动到分组')} closeLabel={t('关闭')} onClose={closeMove}
      className="product-dialog" contentClassName="product-dialog-content">
      <form className="product-dialog-fields" onSubmit={movePresets}>
        <label>{t('分组')}
          <select className="character-home-move-select" data-modal-autofocus disabled={busy}
            value={moveTarget === undefined ? '' : `group:${moveTarget}`} onChange={event => setMoveTarget(event.target.value.slice('group:'.length))}>
            <option value="" disabled>{t('选择分组')}</option>
            <option value="group:">{t('未分组')}</option>
            {groups.map(item => <option key={item.id} value={`group:${item.id}`}>{item.name}</option>)}
          </select>
        </label>
        <FailureAlert failure={error} />
        <div className="product-dialog-actions">
          <Button type="button" variant="outline" disabled={busy} onClick={closeMove}>{t('取消')}</Button>
          <Button type="submit" variant="primary" disabled={busy || !selected.length || !targetValid}>{t('保存')}</Button>
        </div>
      </form>
    </Modal>}
    {groupDelete && <ConfirmationDialog open destructive busy={busy} title={t('删除分组？')} description={groupDelete.name}
      confirmLabel={t('删除')} onCancel={() => { setGroupDelete(null); setError(null); }} onConfirm={() => void run(async () => {
        await catalogModel.deleteGroup(groupDelete.id);
        if (group === groupDelete.id) chooseGroup('');
        setGroupDelete(null);
      })}><FailureAlert failure={error} /></ConfirmationDialog>}
    {menu && <Menu open anchor={null} contextual portal autoFocus anchorPoint={{ x: menu.x, y: menu.y }}
      returnFocus={() => menu.trigger} onClose={context.close}
      items={groupMenu ? [
        { id: 'rename', label: t('重命名该组'), icon: <PencilIcon /> },
        { id: 'delete', label: t('删除分组'), icon: <TrashIcon />, danger: true },
      ] : [
        { id: 'edit', label: t('编辑预设'), icon: <PencilIcon /> },
        { id: 'copy', label: t('复制预设'), icon: <CopyIcon /> },
        ...(purposeCatalog.activePresetIds[purpose] !== menuRecord.id ? [
          { id: 'activate', label: t('使用此预设'), icon: <CheckCircle size={16} /> },
        ] : []),
        { id: 'export', label: t('导出预设'), icon: <ExportIcon />, submenu: exportFormats },
        ...(!isDefaultPreset(menuRecord.id) ? [
          { id: 'delete-divider', type: 'separator' },
          { id: 'delete', label: t('删除预设'), icon: <TrashIcon />, danger: true },
        ] : []),
      ]}
      onSelect={id => {
        context.close();
        if (groupMenu) {
          setError(null);
          if (id === 'rename') { setGroupEdit(menuRecord); setGroupDraft(menuRecord.name); }
          else setGroupDelete(menuRecord);
        } else {
          switch (id) {
            case 'edit': openPresetEditorWindow(menuRecord.id); break;
            case 'copy': void run(() => catalogModel.duplicate(menuRecord.id)); break;
            case 'activate': void run(() => catalogModel.setActive(menuRecord.id)); break;
            case 'png':
            case 'json': exportFile(menuRecord, id); break;
            case 'delete': askDelete([menuRecord]); break;
          }
        }
      }}>
      {groupMenu ? actions('eleckoi.preset.library.group.menu.actions', { surface: 'pc-manager', purpose, group: menuRecord, onDismiss: context.close })
        : actions('eleckoi.preset.library.item.menu.actions', { surface: menu.target.surface, preset: menuRecord, busy, onDismiss: context.close })}
    </Menu>}
  </div>;
  return renderLayout({ sidePanel, mainPanel });
}
