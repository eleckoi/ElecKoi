import { useProductTranslation } from "../app/i18n/ProductLocaleContext.jsx";
import { productLocaleTag } from '../app/i18n/productCopy.js';
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes';
import { DesktopError } from '@shared/foundation/DesktopError';
import { useEffect, useMemo, useState } from 'react';
import { Check, Copy } from '@phosphor-icons/react';
import { Avatar } from '../ui/ui/Avatar.jsx';
import { MobileOverflowIcon, MobilePictureFrameIcon } from './MobileIcons.jsx';
import { useMainPageView } from '../app/windows/MainPageContext.jsx';
import { CharacterEditorWindow } from '../app/windows/CharacterEditorWindow.jsx';
import { CharacterImportDialog } from '../modules/persona/components/CharacterImportDialog.jsx';
import { newCharacter } from '../modules/persona/hooks/usePersonaCharacters.js';
import { characterCover, characterGroup, characterName } from '../utils/characterDisplay.js';
import { assetSrc, coverSources } from '../app/services/assets.js';
import { failureAlreadyPublished } from '../utils/swallowedFailure.js';
import { CharacterProfilePanel } from '../modules/persona/components/CharacterProfilePanel.jsx';
import '../modules/persona/styles/character-profile.css';
import { MobileHeader, MobileState, useMobileBack } from './MobileChrome.jsx';
import { VirtualMasonry } from '../ui/ui/VirtualMasonry.jsx';
import { MobileActionMenu, MobileConfirm, MobileSelectionHeader, useMobileOperation } from './MobileLibraryChrome.jsx';
import { MobileLibraryIcon } from './MobileLibraryIcons.jsx';
import { MobileCharacterLibraryBar } from './MobileCharacterLibraryBar.jsx';
import { sortMobileCharacters, useMobileCharacterSort } from './mobileCharacterSorting.js';
import { MobileSaveFeedback } from './MobileSaveFeedback.jsx';
import './mobile-character-editor.css';

export function MobileCharactersPage() {
  const tUi = useProductTranslation();
  const locale = productLocaleTag(tUi);
  const view = useMainPageView();
  const { chat, characters, route } = view;
  const [group, setGroup] = useState('');
  const [groupsOpen, setGroupsOpen] = useState(false), [moveDestination, setMoveDestination] = useState(false);
  const { sort, chooseSort, error: sortError } = useMobileCharacterSort();
  const [menu, setMenu] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [selection, setSelection] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [format, setFormat] = useState('png');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const { busy, error, setError, run } = useMobileOperation();
  useEffect(() => { if (route.kind === 'root') void characters.refresh?.().catch(failureAlreadyPublished); }, [route.kind, characters]);
  const groups = useMemo(() => [...new Set([...chat.characters.groups, ...chat.characters.items.map(characterGroup)].filter(Boolean))], [chat.characters]);
  useEffect(() => { if (group && !groups.includes(group)) setGroup(''); }, [group, chat.characters]);
  const visible = useMemo(() => sortMobileCharacters(chat.characters.items.filter(item => !group || characterGroup(item) === group), sort, locale), [chat.characters.items, group, sort, locale]);
  const cancelSelection = () => { if (!busy) { setSelection(''); setSelectedIds([]); setError(''); setMoveDestination(false); setGroupsOpen(false); } };
  useMobileBack(() => { cancelSelection(); return true; }, Boolean(selection));
  const openEditor = id => view.pushRoute({ kind: 'character-editor', characterId: id });
  async function create() {
    setMenu(null);
    await run(async () => {
      const character = newCharacter(group);
      await characters.create(character);
      openEditor(character.id);
    });
  }
  async function finishSelection() {
    if (!selectedIds.length || busy) return;
    await run(async () => {
      if (selection === 'delete') await chat.deleteCharacterIds(selectedIds);
      else if (selection === 'duplicate') {
        const failures = [];
        let copied = 0;
        for (const id of selectedIds) {
          try { await characters.duplicate(id); copied += 1; }
          catch (cause) { failures.push({ id, cause }); }
        }
        if (copied) chat.notify('info', tUi("已复制 {value0} 张角色卡", {value0: copied}));
        if (failures.length) {
          setSelectedIds(failures.map(item => item.id));
          throw failures[0].cause;
        }
      } else {
        const result = await characters.exportCharacters(selectedIds, format);
        if (result.canceled) {
          const writtenIds = new Set(result.written.map(item => item.characterId));
          setSelectedIds(current => current.filter(id => !writtenIds.has(id)));
          if (result.written.length) chat.notify('info', tUi("已导出 {value0} 张角色卡", {value0: result.written.length}));
          if (result.failures.length) throw new DesktopError(ELECKOI_FAILURE_CODES.internal, result.failures.map(item => item.message).join('\n'), { what: '批量角色卡导出' });
          return;
        }
        if (result.failures.length) {
          setSelectedIds(result.failures.map(item => item.characterId));
          throw new DesktopError(ELECKOI_FAILURE_CODES.internal, result.failures.map(item => item.message).join('\n'), { what: '批量角色卡导出' });
        }
        chat.notify('info', tUi("已导出 {value0} 张角色卡", {value0: result.written.length}));
      }
      setSelection(''); setSelectedIds([]);
      setDeleteOpen(false);
    });
  }
  if (route.kind === 'character-editor') return <div className="mobile-character-editor">
    <CharacterEditorWindow embeddedCharacterId={route.characterId} characterCatalog={characters} characterConfiguration={view.characterConfiguration}
      compact registerBackHandler={view.registerBackHandler}
      navigationGuardRef={view.guardRef} renderCharacterEditorSection={view.renderCharacterEditorSection}
      renderHeader={({ saving, dirty, save, subpage, feedback }) => <MobileHeader title={subpage?.title || tUi("编辑角色")} back={subpage?.back || view.goBack}>{subpage?.actions}<MobileSaveFeedback {...feedback} onNotify={chat.notify} successMessage={tUi("角色配置已保存")} /><button type="button" disabled={saving || !dirty} onClick={save}>{tUi("保存")}</button></MobileHeader>} />
  </div>;
  if (route.kind === 'character-profile') {
    const character = chat.characters.items.find(item => item.id === route.characterId);
    const owner = { characters: chat.characters, selectedCharacterId: route.characterId,
      onSelectCharacter: id => { chat.selectCharacter(id); view.replaceRoute({ kind: 'character-profile', characterId: id }); },
      onStartConversation: id => { if (!view.routeBusy) view.openCharacterConversation(id); },
      onEditCharacter: openEditor, onCreateFirstCharacter: create };
    const fallback = <CharacterProfilePanel {...owner} presentation="single" />;
    return <div className="mobile-root-page"><MobileHeader title={tUi("角色")} back={view.goBack} />{character ? <div className="mobile-character-profile">
      {view.renderCharacterPageSection?.('profile', owner, fallback) ?? fallback}
    </div> : <MobileState empty={tUi("角色不存在")} />}</div>;
  }
  return <div className="mobile-root-page">
    <MobileHeader title={tUi("角色")} onSearch={view.openSearch}>
      <button type="button" aria-label={tUi("角色操作")} aria-haspopup="menu" aria-expanded={Boolean(menu)} disabled={busy || Boolean(selection)} onClick={event => setMenu(event.currentTarget)}><MobileOverflowIcon /></button>
    </MobileHeader>
    {selection && <MobileSelectionHeader title={tUi("选择角色")} summary={tUi("{value0} 张", {value0: selectedIds.length})} busy={busy} onCancel={cancelSelection} onAll={() => {
      const ids = [...new Set([...selectedIds, ...visible.map(item => item.id)])];
      setSelectedIds(ids);
    }}>
      {selection === 'export' && <select aria-label={tUi("导出格式")} value={format} disabled={busy} onChange={event => setFormat(event.target.value)}><option value="png">PNG</option><option value="zip">ZIP</option></select>}
      <button type="button" className={selection === 'delete' ? 'is-destructive' : 'is-confirm'} disabled={busy || !selectedIds.length} onClick={() => selection === 'delete' ? setDeleteOpen(true) : selection === 'move' ? (setMoveDestination(true), setGroupsOpen(true)) : finishSelection()}>{selection === 'delete' ? tUi("删除") : selection === 'duplicate' ? tUi("复制") : selection === 'move' ? tUi('移动到分组') : tUi("导出")}</button>
    </MobileSelectionHeader>}
    <div className="mobile-character-library-body">
    <MobileCharacterLibraryBar groups={groups} characters={chat.characters.items} selected={group} sort={sort} onSort={chooseSort}
      open={groupsOpen} onOpenChange={value => { setGroupsOpen(value); if (!value) setMoveDestination(false); }}
      disabled={busy} destination={moveDestination} onSave={chat.saveCharacterGroups} onSelect={async name => {
        if (!moveDestination) { setGroup(name); return; }
        const success = await run(async () => {
          await chat.saveCharacterGroups(groups, selectedIds.map(characterId => ({ characterId, group: name })));
          setGroup(name); setSelection(''); setSelectedIds([]); setMoveDestination(false);
        });
        return success;
      }} />
    <CharacterGrid characters={visible} selectedIds={selectedIds} selection={selection} scrollKey={JSON.stringify(['characters', group, sort])} onClick={item => {
      if (!selection) { chat.selectCharacter(item.id); view.pushRoute({ kind: 'character-profile', characterId: item.id }); return; }
      if (busy) return;
      if (selectedIds.includes(item.id)) setSelectedIds(selectedIds.filter(id => id !== item.id));
      else setSelectedIds([...selectedIds, item.id]);
    }} />
    </div>
    {(error || sortError) && <p className="mobile-inline-error" role="alert">{error || sortError}</p>}
    {deleteOpen && <MobileConfirm title={tUi("删除角色？")} onClose={() => setDeleteOpen(false)} busy={busy} onConfirm={finishSelection} error={error}>{tUi("确认删除已选的 ")}{selectedIds.length}{tUi(" 张角色卡？")}</MobileConfirm>}
    {menu && <MobileActionMenu title={tUi("角色操作")} anchor={menu} onClose={() => setMenu(null)} busy={busy} actions={[
      { label: tUi("新建角色"), icon: <MobileLibraryIcon name="character" />, action: create },
      { label: tUi('移动角色'), icon: <MobileLibraryIcon name="move" />, divider: true, action: () => { setMenu(null); setSelection('move'); setSelectedIds([]); setError(''); } },
      { label: tUi("复制角色卡"), icon: <Copy size={21} />, action: () => { setMenu(null); setSelection('duplicate'); setSelectedIds([]); setError(''); } },
      { label: tUi("导入角色卡"), icon: <MobileLibraryIcon name="import" />, action: () => { setMenu(null); setImportOpen(true); } },
      ...['export', 'delete'].map(mode => ({ label: mode === 'export' ? tUi("导出角色卡") : tUi("删除角色卡"), icon: <MobileLibraryIcon name={mode === 'export' ? 'export' : 'trash'} />, destructive: mode === 'delete', divider: mode === 'delete', action: () => { setMenu(null); setSelection(mode); setSelectedIds([]); setError(''); } })),
    ]} />}
    {importOpen && <CharacterImportDialog onClose={() => setImportOpen(false)} onPrepare={chat.prepareCharacterImports} onDiscard={chat.discardCharacterImports} onImported={chat.importPreparedCharacters} />}
  </div>;
}

const artworkRatio = index => [0.76, 0.68, 0.84, 0.72][index % 4];
// Existing two-line title plus author and padding; visible cards are measured exactly.
const estimateCardHeight = (_character, index, width) => width / artworkRatio(index) + 84;

function CharacterCover({ character, width, ratio }) {
  const tUi = useProductTranslation();
  const source = assetSrc(characterCover(character));
  const [failure, setFailure] = useState(null);
  const failed = failure?.source === source ? failure.stage : 0;
  const sources = coverSources(characterCover(character), width, ratio);
  return source && failed < 2 ? <img className="mobile-character-cover" {...(failed ? { src: source } : sources)} alt="" loading="lazy" decoding="async"
    onError={() => setFailure({ source, stage: !failed && sources.src !== source ? 1 : 2 })} />
    : <span className="mobile-cover-empty"><MobilePictureFrameIcon />{tUi("暂无封面")}</span>;
}
function CharacterGrid({ characters, selection, selectedIds, onClick, filters, scrollKey = 'characters' }) {
  const tUi = useProductTranslation();
  const { scrollPositions } = useMainPageView();
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  return <VirtualMasonry key={scrollKey} items={characters} scrollClassName={`mobile-scroll mobile-character-list${characters.length ? '' : ' is-empty'}`}
    gridClassName="mobile-character-grid" initialState={scrollPositions.get(`masonry:${scrollKey}`)}
    onSaveState={state => scrollPositions.set(`masonry:${scrollKey}`, state)} estimateHeight={estimateCardHeight}
    leading={filters} empty={<MobileState empty={tUi("暂无角色")} />}>
    {(character, index, width) => <button type="button" key={character.id} aria-label={characterName(character, tUi)} className="mobile-character-card" style={{ '--mobile-cover-ratio': artworkRatio(index) }} onClick={() => onClick(character)} aria-pressed={selection ? selected.has(character.id) : undefined}>
    <CharacterCover character={character} width={width} ratio={artworkRatio(index)} /><strong>{characterName(character, tUi)}</strong>
    <span className="mobile-character-author"><Avatar as="span" name={character.authorName?.trim() || tUi("未填写作者")} src={character.authorAvatar || ''} /><span>{character.authorName?.trim() || tUi("未填写作者")}</span></span>
    {selection && <span className="mobile-character-selection" data-selected={selected.has(character.id)} aria-hidden="true">{selected.has(character.id) && <Check size={15} weight="bold" />}</span>}
  </button>}</VirtualMasonry>;
}
