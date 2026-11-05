import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes';
import { DesktopError } from '@shared/foundation/DesktopError';
import { useEffect, useMemo, useState } from 'react';
import { CheckCircle, Copy } from '@phosphor-icons/react';
import { Avatar } from '../ui/ui/Avatar.jsx';
import { MobileOverflowIcon, MobilePictureFrameIcon } from './MobileIcons.jsx';
import { useMainPageView } from '../app/windows/MainPageContext.jsx';
import { CharacterEditorWindow } from '../app/windows/CharacterEditorWindow.jsx';
import { CharacterImportDialog } from '../modules/persona/components/CharacterImportDialog.jsx';
import { newCharacter } from '../modules/persona/hooks/usePersonaCharacters.js';
import { characterCover, characterGroup, characterName } from '../utils/characterDisplay.js';
import { assetSrc } from '../app/services/assets.js';
import { CharacterProfilePanel } from '../modules/persona/components/CharacterProfilePanel.jsx';
import '../modules/persona/styles/character-profile.css';
import { MobileHeader, MobileState, useMobileBack, useMobileScroll } from './MobileChrome.jsx';
import { MobileWaterfall } from './MobileWaterfall.jsx';
import { MobileActionMenu, MobileConfirm, MobileSelectionHeader, useMobileOperation } from './MobileLibraryChrome.jsx';
import { MobileLibraryIcon } from './MobileLibraryIcons.jsx';
import { MobileCharacterGroups } from './MobileCharacterGroups.jsx';
import { MobileSaveFeedback } from './MobileSaveFeedback.jsx';
import './mobile-character-editor.css';

export function MobileCharactersPage() {
  const view = useMainPageView();
  const { chat, characters, route } = view;
  const [group, setGroup] = useState('');
  const [menu, setMenu] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [selection, setSelection] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [format, setFormat] = useState('png');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const { busy, error, setError, run } = useMobileOperation();
  const groups = [...new Set([...chat.characters.groups, ...chat.characters.items.map(characterGroup)].filter(Boolean))];
  useEffect(() => { if (group && !groups.includes(group)) setGroup(''); }, [group, chat.characters]);
  const visible = useMemo(() => chat.characters.items.filter(item => !group || characterGroup(item) === group), [chat.characters.items, group]);
  const cancelSelection = () => { if (!busy) { setSelection(''); setSelectedIds([]); setError(''); } };
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
        if (copied) chat.notify('info', `已复制 ${copied} 张角色卡`);
        if (failures.length) {
          setSelectedIds(failures.map(item => item.id));
          throw failures[0].cause;
        }
      } else {
        const result = await characters.exportCharacters(selectedIds, format);
        if (result.canceled) {
          const writtenIds = new Set(result.written.map(item => item.characterId));
          setSelectedIds(current => current.filter(id => !writtenIds.has(id)));
          if (result.written.length) chat.notify('info', `已导出 ${result.written.length} 张角色卡`);
          if (result.failures.length) throw new DesktopError(ELECKOI_FAILURE_CODES.internal, result.failures.map(item => item.message).join('\n'), { what: '批量角色卡导出' });
          return;
        }
        if (result.failures.length) {
          setSelectedIds(result.failures.map(item => item.characterId));
          throw new DesktopError(ELECKOI_FAILURE_CODES.internal, result.failures.map(item => item.message).join('\n'), { what: '批量角色卡导出' });
        }
        chat.notify('info', `已导出 ${result.written.length} 张角色卡`);
      }
      setSelection(''); setSelectedIds([]);
      setDeleteOpen(false);
    });
  }
  if (route.kind === 'character-editor') return <div className="mobile-character-editor">
    <CharacterEditorWindow embeddedCharacterId={route.characterId} characterCatalog={characters} characterConfiguration={view.characterConfiguration}
      compact registerBackHandler={view.registerBackHandler}
      navigationGuardRef={view.guardRef} renderCharacterEditorSection={view.renderCharacterEditorSection}
      renderHeader={({ saving, dirty, save, subpage, feedback }) => <MobileHeader title={subpage?.title || '编辑角色'} back={subpage?.back || view.goBack}>{subpage?.actions}<MobileSaveFeedback {...feedback} onNotify={chat.notify} successMessage="角色配置已保存" />{!subpage && <button type="button" disabled={saving || !dirty} onClick={save}>保存</button>}</MobileHeader>} />
  </div>;
  if (route.kind === 'character-groups') return <MobileCharacterGroups groups={groups} characters={chat.characters.items} persona={chat.persona} onSave={chat.saveCharacterGroups} onClose={view.goBack} renderGrid={props => <CharacterGrid {...props} scrollKey="character-group-picker" />} />;
  if (route.kind === 'character-profile') {
    const character = chat.characters.items.find(item => item.id === route.characterId);
    const owner = { characters: chat.characters, selectedCharacterId: route.characterId,
      onSelectCharacter: id => { chat.selectCharacter(id); view.replaceRoute({ kind: 'character-profile', characterId: id }); },
      onStartConversation: id => { if (!view.routeBusy) view.openCharacterConversation(id); },
      onEditCharacter: openEditor, onCreateFirstCharacter: create };
    const fallback = <CharacterProfilePanel {...owner} presentation="single" />;
    return <div className="mobile-root-page"><MobileHeader title="角色" back={view.goBack} />{character ? <div className="mobile-character-profile">
      {view.renderCharacterPageSection?.('profile', owner, fallback) ?? fallback}
    </div> : <MobileState empty="角色不存在" />}</div>;
  }
  return <div className="mobile-root-page">
    <MobileHeader title="角色" onSearch={view.openSearch}>
      <button type="button" aria-label="角色操作" aria-haspopup="menu" aria-expanded={Boolean(menu)} disabled={busy || Boolean(selection)} onClick={event => setMenu(event.currentTarget)}><MobileOverflowIcon /></button>
    </MobileHeader>
    {selection && <MobileSelectionHeader title="选择角色" summary={`${selectedIds.length} 张`} busy={busy} onCancel={cancelSelection} onAll={() => {
      const ids = [...new Set([...selectedIds, ...visible.map(item => item.id)])];
      setSelectedIds(ids);
    }}>
      {selection === 'export' && <select aria-label="导出格式" value={format} disabled={busy} onChange={event => setFormat(event.target.value)}><option value="png">PNG</option><option value="json">JSON</option></select>}
      <button type="button" className={selection === 'delete' ? 'is-destructive' : 'is-confirm'} disabled={busy || !selectedIds.length} onClick={() => selection === 'delete' ? setDeleteOpen(true) : finishSelection()}>{selection === 'delete' ? '删除' : selection === 'duplicate' ? '复制' : '导出'}</button>
    </MobileSelectionHeader>}
    <CharacterGrid characters={visible} persona={chat.persona} selectedIds={selectedIds} selection={selection} filters={<div className="mobile-group-tabs" role="group" aria-label="角色分组"><button type="button" aria-pressed={!group} onClick={() => setGroup('')}>全部{!group && <span>{chat.characters.items.length}</span>}</button>
      {groups.map(name => <button type="button" key={name} aria-pressed={group === name} onClick={() => setGroup(name)}>{name}{group === name && <span>{chat.characters.items.filter(item => characterGroup(item) === name).length}</span>}</button>)}
    </div>} onClick={item => {
      if (!selection) { chat.selectCharacter(item.id); view.pushRoute({ kind: 'character-profile', characterId: item.id }); return; }
      if (busy) return;
      if (selectedIds.includes(item.id)) setSelectedIds(selectedIds.filter(id => id !== item.id));
      else setSelectedIds([...selectedIds, item.id]);
    }} />
    {error && <p className="mobile-inline-error" role="alert">{error}</p>}
    {deleteOpen && <MobileConfirm title="删除角色？" onClose={() => setDeleteOpen(false)} busy={busy} onConfirm={finishSelection} error={error}>确认删除已选的 {selectedIds.length} 张角色卡？</MobileConfirm>}
    {menu && <MobileActionMenu title="角色操作" anchor={menu} onClose={() => setMenu(null)} busy={busy} actions={[
      { label: '新建角色', icon: <MobileLibraryIcon name="character" />, action: create },
      { label: '分组管理', icon: <MobileLibraryIcon name="gear" />, divider: true, action: () => { setMenu(null); view.pushRoute({ kind: 'character-groups' }); } },
      { label: '复制角色卡', icon: <Copy size={21} />, action: () => { setMenu(null); setSelection('duplicate'); setSelectedIds([]); setError(''); } },
      { label: '导入角色卡', icon: <MobileLibraryIcon name="import" />, action: () => { setMenu(null); setImportOpen(true); } },
      ...['export', 'delete'].map(mode => ({ label: mode === 'export' ? '导出角色卡' : '删除角色卡', icon: <MobileLibraryIcon name={mode === 'export' ? 'export' : 'trash'} />, destructive: mode === 'delete', divider: mode === 'delete', action: () => { setMenu(null); setSelection(mode); setSelectedIds([]); setError(''); } })),
    ]} />}
    {importOpen && <CharacterImportDialog onClose={() => setImportOpen(false)} onPrepare={chat.prepareCharacterImports} onDiscard={chat.discardCharacterImports} onImported={chat.importPreparedCharacters} />}
  </div>;
}

function CharacterCover({ character }) {
  const source = assetSrc(characterCover(character));
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [source]);
  return source && !failed ? <img className="mobile-character-cover" src={source} alt="" loading="lazy" onError={() => setFailed(true)} />
    : <span className="mobile-cover-empty"><MobilePictureFrameIcon />暂无封面</span>;
}
export function CharacterGrid({ characters, persona, selection, selectedIds, onClick, filters, scrollKey = 'characters' }) {
  const ref = useMobileScroll(scrollKey);
  const author = persona?.user_name || '用户';
  return <div className={`mobile-scroll mobile-character-list${characters.length ? '' : ' is-empty'}`} ref={ref}>{filters}<MobileWaterfall>{characters.map((character, index) => <button type="button" key={character.id} aria-label={characterName(character)} className="mobile-character-card" style={{ '--mobile-cover-ratio': [0.76, 0.68, 0.84, 0.72][index % 4] }} onClick={() => onClick(character)} aria-pressed={selection ? selectedIds.includes(character.id) : undefined}>
    <CharacterCover character={character} /><strong>{characterName(character)}</strong>
    <span className="mobile-character-author"><Avatar as="span" name={author} src={persona?.user_avatar} /><span>{author}</span></span>
    {selection && <CheckCircle className="mobile-card-check" size={23} weight={selectedIds.includes(character.id) ? 'fill' : 'regular'} />}
  </button>)}</MobileWaterfall>{!characters.length && <MobileState empty="暂无角色" />}</div>;
}
