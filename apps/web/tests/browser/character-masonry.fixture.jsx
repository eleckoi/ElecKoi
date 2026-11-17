import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CharacterManager } from '../../src/modules/persona/components/CharacterManager.jsx';
import { MobileCharactersPage } from '../../src/mobile/MobileCharactersPage.jsx';
import { MainPageContext } from '../../src/app/windows/MainPageContext.jsx';
import '../../src/app/windows/styles/index.css';
import '../../src/mobile/mobile.css';
const noop = () => {};
const image = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400"><rect width="300" height="400" fill="#b9a0a3"/><circle cx="150" cy="120" r="65" fill="#f0e5df"/></svg>');
const original = Array.from({ length: 10001 }, (_, index) => ({ id: `card-${index}`, name: `Sample ${index}${index % 3 ? '' : ' long title over two lines for variable-height coverage'}`, authorName: 'Sample author',
  group: index % 2 ? 'Group B' : 'Group A', persona: { assistant_cover: index % 4 ? image : '', assistant_avatar: '' }, addedAtEpochMs: index + 1 }));
const scrollPositions = new Map(), actions = [];
window.open = (url) => { actions.push(['edit', new URL(url, location.href).searchParams.get('character')]); return null; };
function Fixture() {
  const [mobile, setMobile] = useState(true), [visible, setVisible] = useState(true), [route, setRoute] = useState({ kind: 'root' });
  const [items, setItems] = useState(original);
  const collection = { active_character_id: '', groups: ['Group A', 'Group B'], items };
  const characters = { refresh: async () => collection, duplicate: async id => { actions.push(['duplicate', id]); }, create: noop, exportCharacters: async (ids, format) => { actions.push(['export', ids, format]); return { canceled: true, written: [], failures: [] }; } };
  const view = { route, routeBusy: false, characters, scrollPositions, pushRoute: setRoute, goBack: () => setRoute({ kind: 'root' }), replaceRoute: setRoute,
    registerBackHandler: () => noop, openDrawer: noop, openSearch: noop, guardRef: { current: null },
    chat: { characters: collection, persona: {}, selectCharacter: id => actions.push(['select', id]), notify: noop, saveCharacterGroups: noop, deleteCharacterIds: noop } };
  window.masonryProbe = { setMobile, setVisible, setRoute, actions, scrollPositions, remove: id => setItems(current => current.filter(item => item.id !== id)), reset: () => setItems(original) };
  return <MainPageContext.Provider value={view}><div className={mobile ? 'mobile-shell' : 'pc-fixture'} style={{ height: '100vh' }}>
    {visible && (mobile ? <MobileCharactersPage /> : <CharacterManager characters={collection} persona={{}} onSaveGroups={noop}
      onDeleteCharacters={async ids => { actions.push(['delete', ids]); setItems(current => current.filter(item => !ids.includes(item.id))); }}
      onDuplicateCharacter={characters.duplicate} onExportCharacters={characters.exportCharacters} />)}
  </div></MainPageContext.Provider>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
