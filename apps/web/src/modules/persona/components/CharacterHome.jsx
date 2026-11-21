import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Star } from '@phosphor-icons/react';
import { Button, Menu, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives';
import { useProductTranslation } from '../../../app/i18n/ProductLocaleContext.jsx';
import { ChevronRightIcon, CopyIcon, ExportIcon, PencilIcon, TrashIcon } from '../../../ui/icons/index.jsx';
import { useDshDisplayPreferences } from '../../../ui/state/DisplayPreferencesContext.jsx';
import { sortCharacters, useCharacterSort } from '../../../ui/hooks/useCharacterSort.js';
import { useCatalogSlots } from '../../../ui/ui/CatalogSlotsContext.jsx';
import { CharacterSortMenu } from '../../../ui/ui/CharacterSortMenu.jsx';
import { SidebarScrollArea } from '../../../ui/ui/SidebarScrollArea.jsx';
import { LOG_ACTIONS, runLoggedAction } from '../../../utils/logAction.js';
import { resolveFailure } from '../../../utils/failureText.js';
import { useEditorContextMenu } from '../../../ui/ui/EditorContextMenu.jsx';
import { FailureAlert } from '../../../ui/ui/FailureAlert.jsx';
import { openCharacterEditorWindow } from '../window/openCharacterEditorWindow.js';
import { CharacterManager } from './CharacterManager.jsx';
import { CharacterContactRow } from './CharacterContactRow.jsx';
import { CharacterGroupList } from './CharacterGroupList.jsx';
import { CharacterListPanel } from './CharacterListPanel.jsx';
import { CharacterDetailPanel } from './CharacterDetailPanel.jsx';
import { DeleteCharacterDialog } from './DeleteCharacterDialog.jsx';
import { ALL_CHARACTERS, characterGroup, characterName } from './characterUtils.js';
import '../styles/character-home.css';

const EMPTY_PREFERENCES = { ui: {}, writable: false };
const noSubscription = () => () => {};
const emptyPreferences = () => EMPTY_PREFERENCES;
const favoriteIds = ui => (Array.isArray(ui?.favorite_character_ids) ? ui.favorite_character_ids : []);

function applySidebarOrder(items, order) {
  if (!order?.length) return items;
  const remaining = new Map(items.map(item => [item.id, item]));
  const ordered = [];
  for (const id of order) {
    if (!remaining.has(id)) continue;
    ordered.push(remaining.get(id));
    remaining.delete(id);
  }
  return ordered.concat([...remaining.values()]);
}

function FavoriteStar({ character, saved, disabled, onToggle }) {
  const tUi = useProductTranslation();
  const label = tUi(saved ? '取消收藏' : '收藏角色');
  return <div className="character-home-star">
    <Tooltip label={label} side="top" delayMs={450}>
      <Button data-dsh-control variant="outline" size="sm" className="catalog-manager-surface-button"
        aria-label={`${label} · ${characterName(character, tUi)}`} aria-pressed={saved} disabled={disabled}
        onClick={onToggle} icon={<Star weight={saved ? 'fill' : 'regular'} aria-hidden="true" />} />
    </Tooltip>
  </div>;
}

function SidebarSection({ title, Icon, hidden, children }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return <section className="character-home-sidebar-section" aria-label={title} hidden={hidden}>
    <button type="button" className="character-home-sidebar-heading" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>
      <span className={`character-group-toggle${open ? '' : ' collapsed'}`} aria-hidden="true"><ChevronRightIcon /></span>
      <Icon size={16} aria-hidden="true" /><span>{title}</span>
    </button>
    <div id={id} hidden={!open}>{children}</div>
  </section>;
}

export function CharacterHome({ view }) {
  const tUi = useProductTranslation();
  const { chat, characters: catalog, appearance, renderLayout, renderCharacterPageSection } = view;
  const [keyword, setKeyword] = useState('');
  const [sidebarKeyword, setSidebarKeyword] = useState('');
  const [sidebarCharacterId, setSidebarCharacterId] = useState('');
  const [selectedGroup, setSelectedGroup] = useState(ALL_CHARACTERS);
  const [expandedSidebarGroups, setExpandedSidebarGroups] = useState(() => new Set());
  const [detail, setDetail] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const [savingFavorites, setSavingFavorites] = useState(false);
  const operation = useRef(false);
  const returnFocus = useRef(null);
  const sidebarScroll = useRef(null);
  const groupTabs = useRef(null);
  const context = useEditorContextMenu();
  const { actions } = useCatalogSlots();
  const preferences = useDshDisplayPreferences();
  const settings = useSyncExternalStore(preferences?.subscribe || noSubscription, preferences?.getSnapshot || emptyPreferences, emptyPreferences);
  const { sort: sidebarSort, chooseSort: chooseSidebarSort, error: sidebarSortError } = useCharacterSort('desktop_character_sidebar_sort');
  const saved = new Set(favoriteIds(settings.ui));
  const { characters } = chat;
  const items = characters.items || [];
  const manualOrder = settings.ui?.desktop_character_sidebar_order;
  const sidebarItems = useMemo(() => sidebarSort === 'default'
    ? applySidebarOrder(items, manualOrder)
    : sortCharacters(items, sidebarSort, tUi.locale), [items, manualOrder, sidebarSort, tUi.locale]);
  const groups = [...new Set([...(characters.groups || []).map(group => group.trim()), ...items.map(characterGroup)].filter(Boolean))];
  const detailCharacter = items.find(card => card.id === detail?.id);
  const showDetail = Boolean(detailCharacter);
  const selectedCharacterId = detailCharacter?.id || chat.selectedCharacterId;

  const setFeed = useCallback(node => {
    // The desktop DSH platform uses React 18, which drops a boolean inert prop.
    if (node) node.inert = showDetail;
  }, [showDetail]);

  useEffect(() => {
    if (!showDetail) groupTabs.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [selectedGroup, characters.groups, showDetail]);

  function reportError(error) {
    const resolved = resolveFailure(error);
    chat.notify('error', resolved.text, resolved);
  }

  async function toggleFavorite(characterId) {
    if (!preferences || !settings.writable || savingFavorites) return;
    setSavingFavorites(true);
    try {
      await preferences.updateUi(ui => {
        const ids = favoriteIds(ui);
        return { ...ui, favorite_character_ids: ids.includes(characterId) ? ids.filter(id => id !== characterId) : [...ids, characterId] };
      });
    } catch (error) { reportError(error); }
    finally { setSavingFavorites(false); }
  }

  function openCharacter(id, focusBack = true) {
    const trigger = document.activeElement;
    returnFocus.current = trigger === document.body ? null : trigger;
    chat.selectCharacter(id);
    setDetail({ id, focusBack: focusBack && Boolean(returnFocus.current) });
  }

  function openSidebarCharacter(id) {
    setSidebarCharacterId(id);
    openCharacter(id, false);
  }

  function leaveDetail() {
    const trigger = returnFocus.current;
    setDetail(null);
    requestAnimationFrame(() => trigger?.focus({ preventScroll: true }));
  }

  async function createInGroup(group) {
    try {
      return await chat.createCharacter(group);
    } catch (error) { reportError(error); }
  }

  function selectGroup(group) {
    setSelectedGroup(group);
    setDetail(null);
  }

  function toggleSidebarGroup(group) {
    setExpandedSidebarGroups(current => {
      const next = new Set(current);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }

  function changeSidebarGroup(previous, replacement) {
    setSelectedGroup(current => current === previous ? replacement ?? ALL_CHARACTERS : current);
    setExpandedSidebarGroups(current => {
      if (!current.has(previous)) return current;
      const next = new Set(current);
      next.delete(previous);
      if (replacement) next.add(replacement);
      return next;
    });
  }

  function searchSidebar(value) {
    setSidebarKeyword(value);
    if (sidebarScroll.current) sidebarScroll.current.scrollTop = 0;
  }

  function sortSidebar(value) {
    if (sidebarScroll.current) sidebarScroll.current.scrollTop = 0;
    return chooseSidebarSort(value);
  }

  async function reorderSidebarCharacter(group, source, target, half) {
    try {
      await preferences.updateUi(ui => {
        const ordered = applySidebarOrder(items, ui.desktop_character_sidebar_order);
        const inGroup = item => group === ALL_CHARACTERS || characterGroup(item) === group;
        const siblings = ordered.filter(inGroup).map(item => item.id);
        const sourceIndex = siblings.indexOf(source);
        if (sourceIndex < 0 || !siblings.includes(target) || source === target) return ui;
        siblings.splice(sourceIndex, 1);
        const insertAt = siblings.indexOf(target) + (half === 'after' ? 1 : 0);
        if (insertAt === sourceIndex) return ui;
        siblings.splice(insertAt, 0, source);
        let index = 0;
        return { ...ui, desktop_character_sidebar_order: ordered.map(item => inGroup(item) ? siblings[index++] : item.id) };
      });
    } catch (error) { reportError(error); }
  }

  const exportCharacters = (ids, format) => runLoggedAction(LOG_ACTIONS.characterExport, () => catalog.exportCharacters(ids, format));

  async function runCardAction(action) {
    if (operation.current) return;
    operation.current = true;
    try { await action(); }
    catch (error) { reportError(error); }
    finally { operation.current = false; }
  }

  function chooseCardAction(id) {
    const card = context.menu.target;
    const trigger = context.menu.trigger;
    context.close();
    if (id === 'favorite') return void toggleFavorite(card.id);
    if (id === 'edit') return openCharacterEditorWindow(card.id);
    if (id === 'copy') return void runCardAction(() => catalog.duplicate(card.id));
    if (id === 'delete') {
      setDeleteError(null);
      setPendingDelete({ card, trigger });
      return;
    }
    if (id === 'png' || id === 'zip') void runCardAction(async () => {
      const result = await exportCharacters([card.id], id);
      if (result?.failures?.length) reportError(result.failures[0].message);
    });
  }

  async function confirmDelete() {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await chat.deleteCharacterIds([pendingDelete.card.id]);
      setPendingDelete(null);
    } catch (error) { setDeleteError(error); }
    finally { setDeleting(false); }
  }

  const listOwner = {
    characters,
    activeCharacterId: sidebarCharacterId,
    artworkMode: appearance.sidebarCharacterArtwork,
    onSelectCharacter: openSidebarCharacter,
    onOpenCharacterChat: chat.openCharacterChat,
    onSaveCharacterGroups: chat.saveCharacterGroups,
    onImportPreparedCharacters: chat.importPreparedCharacters,
    onPrepareCharacterImports: chat.prepareCharacterImports,
    onDiscardCharacterImports: chat.discardCharacterImports,
    onCreateCharacter: createInGroup,
    onDeleteCharacters: chat.deleteCharacterIds,
    onExportCharacters: exportCharacters,
  };
  const profileOwner = {
    characters, selectedCharacterId, onSelectCharacter: openCharacter,
    onStartConversation: chat.openCharacterChat,
    onEditCharacter: openCharacterEditorWindow,
    onCreateFirstCharacter: async () => {
      const id = await createInGroup('');
      if (id) setDetail({ id });
    },
  };
  const favoriteCards = sidebarItems.filter(card => saved.has(card.id));
  const sidebarQuery = sidebarKeyword.trim().toLocaleLowerCase();
  const sidebarMatches = sidebarQuery
    ? sidebarItems.filter(card => characterName(card, tUi).toLocaleLowerCase().includes(sidebarQuery))
    : [];
  const renderSidebarCard = card => <CharacterContactRow key={card.id} character={card} active={sidebarCharacterId === card.id}
    artworkMode="square" onClick={openSidebarCharacter} onContextMenu={context.open} />;
  const renderSidebarShelf = ({ onGroupContextMenu, onReorderGroup, groupSortError }) => (
    <SidebarScrollArea ref={sidebarScroll} className="character-list-scroll character-home-sidebar-scroll">
      {(groupSortError || sidebarSortError) && <FailureAlert failure={groupSortError || sidebarSortError} className="character-group-sort-error" />}
      <SidebarSection title={tUi('收藏夹')} Icon={Star} hidden={Boolean(sidebarQuery)}>
        {favoriteCards.length ? <div className="character-contact-list">
          {favoriteCards.map(renderSidebarCard)}
        </div> : <p className="character-home-favorites-empty">{tUi('暂无收藏')}</p>}
      </SidebarSection>
      {sidebarQuery ? <div className="character-home-sidebar-results">
        {sidebarMatches.length ? <div className="character-contact-list">{sidebarMatches.map(renderSidebarCard)}</div>
          : <p className="character-home-favorites-empty" role="status">{tUi('没有匹配的角色')}</p>}
      </div> : <CharacterGroupList groups={groups} characters={{ ...characters, items: sidebarItems }} activeCharacterId={sidebarCharacterId} artworkMode="square"
        allLabel={tUi('全部')} showCount={false}
        collapsedGroups={Object.fromEntries([ALL_CHARACTERS, ...groups].map(group => [group, !expandedSidebarGroups.has(group)]))}
        onToggleGroup={toggleSidebarGroup}
        onSelectCharacter={openSidebarCharacter}
        onReorderCharacter={settings.writable && sidebarSort === 'default' ? reorderSidebarCharacter : undefined}
        onCharacterContextMenu={context.open} onGroupContextMenu={onGroupContextMenu} onReorderGroup={onReorderGroup} />}
    </SidebarScrollArea>
  );
  const shelf = <aside className="character-home-sidebar">
    <CharacterListPanel {...listOwner}
      home={{ keyword: sidebarKeyword, setKeyword: searchSidebar, group: groups.includes(selectedGroup) ? selectedGroup : '',
        sortMenu: <CharacterSortMenu surface="pc-sidebar" value={sidebarSort} onChange={sortSidebar} />,
        onGroupChange: changeSidebarGroup, renderShelf: renderSidebarShelf }} />
  </aside>;
  const fallback = <div className="character-home-main">
    <div className="character-home-feed" ref={setFeed}>
      <CharacterManager characters={characters} onSaveGroups={chat.saveCharacterGroups} onDeleteCharacters={chat.deleteCharacterIds}
        onImportCharacters={chat.importPreparedCharacters} onPrepareImports={chat.prepareCharacterImports} onDiscardImports={chat.discardCharacterImports}
        onExportCharacters={exportCharacters} onDuplicateCharacter={id => catalog.duplicate(id)}
        home={{
          keyword, setKeyword, selectedGroup, setSelectedGroup, onOpenCharacter: openCharacter, onContextMenu: context.open,
          renderGroups: groupNames => <nav ref={groupTabs} className="character-home-tabs" aria-label={tUi('角色分组')}>
            {[ALL_CHARACTERS, ...groupNames].map(group => <button key={group} type="button"
              aria-pressed={selectedGroup === group} onClick={() => selectGroup(group)}>
              {group === ALL_CHARACTERS ? tUi('全部') : group}
            </button>)}
          </nav>,
          withFavorite: (character, card) => <div className="character-home-card">{card}
            <FavoriteStar character={character} saved={saved.has(character.id)} disabled={!settings.writable || savingFavorites}
              onToggle={() => toggleFavorite(character.id)} />
          </div>,
        }} />
    </div>
    {detailCharacter && <CharacterDetailPanel key={detailCharacter.id} character={detailCharacter}
      onBack={leaveDetail} focusBack={detail.focusBack}
      onStartConversation={profileOwner.onStartConversation} onEditCharacter={profileOwner.onEditCharacter} />}
    {context.menu && <Menu open anchor={null} contextual portal autoFocus
      anchorPoint={{ x: context.menu.x, y: context.menu.y }} returnFocus={() => context.menu?.trigger} onClose={context.close} onSelect={chooseCardAction}
      items={[
        { id: 'edit', label: tUi('编辑角色卡'), icon: <PencilIcon /> },
        { id: 'copy', label: tUi('复制角色卡'), icon: <CopyIcon /> },
        { id: 'favorite', label: tUi(saved.has(context.menu.target.id) ? '取消收藏' : '收藏角色'), icon: <Star />, disabled: !settings.writable || savingFavorites },
        { id: 'export', label: tUi('导出角色'), icon: <ExportIcon />, submenu: ['png', 'zip'].map(format => ({ id: format, label: format.toUpperCase() })) },
        { id: 'delete-divider', type: 'separator' },
        { id: 'delete', label: tUi('删除角色'), icon: <TrashIcon />, danger: true },
      ]}>
      {actions('eleckoi.character.library.item.menu.actions', {
        surface: 'pc-manager', character: context.menu.target, busy: savingFavorites, onDismiss: context.close,
      })}
    </Menu>}
    {pendingDelete && <DeleteCharacterDialog character={{ ...pendingDelete.card, name: characterName(pendingDelete.card, tUi) }}
      deleting={deleting} error={deleteError}
      onCancel={() => {
        if (deleting) return;
        const { trigger } = pendingDelete;
        setPendingDelete(null);
        requestAnimationFrame(() => trigger.focus({ preventScroll: true }));
      }} onConfirm={confirmDelete} />}
  </div>;
  return renderLayout({
    sidePanel: renderCharacterPageSection?.('list', listOwner, shelf) ?? shelf,
    mainPanel: renderCharacterPageSection?.('profile', profileOwner, fallback) ?? fallback,
  });
}
