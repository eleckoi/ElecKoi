import React from 'react';
import { createRoot } from 'react-dom/client';
import { CharacterManagerWindow } from '../../src/app/windows/CharacterManagerWindow.jsx';
import { PresetManagerWindow } from '../../src/app/windows/PresetManagerWindow.jsx';
import '../../src/app/windows/styles/tokens.css';
import '../../src/app/windows/styles/base.css';
import '../../src/app/windows/shell/styles/titlebar.css';
import '../../src/modules/persona/styles/character-manager.css';
import '../../src/modules/presets/styles/preset-panel.css';

const query = new URLSearchParams(location.search);
window.setCaptionTheme = theme => {
  if (theme === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.dsThemeSource = theme;
  const dark = theme === 'system' ? matchMedia('(prefers-color-scheme: dark)').matches : theme === 'dark';
  document.body.toggleAttribute('data-ds-dark-theme', dark);
};
window.setCaptionTheme(query.get('theme'));
const collection = { active_character_id: '', groups: [], items: [] };
const profile = { user_name: '合成用户', user_avatar: '' };
const catalog = { presets: [], groups: [], activePresetIds: { roleplay: '', creator: '' } };
const model = value => ({ refresh: async () => value, subscribe: () => () => {},
  getSnapshot: () => ({ status: 'ready', collection: value, profile: value, catalog: value }) });
createRoot(document.querySelector('#root')).render(query.get('view') === 'character-manager'
  ? <CharacterManagerWindow characterCatalog={model(collection)} personaModel={model(profile)} />
  : <PresetManagerWindow presetCatalog={model(catalog)} />);
