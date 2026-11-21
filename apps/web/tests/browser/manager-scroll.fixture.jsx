import React from 'react';
import { createRoot } from 'react-dom/client';
import { SettingLibraryManager } from '../../src/modules/settingLibraries/components/SettingLibraryManager.jsx';
import { VariableConfigManager } from '../../src/modules/variables/components/VariableConfigManager.jsx';
import '../../src/app/windows/styles/tokens.css';
import '../../src/app/windows/styles/base.css';
import '../../src/modules/settingLibraries/styles/setting-library.css';
import '../../src/modules/variables/styles/variable-config.css';
import '../../src/mobile/mobile.css';
import '../../src/mobile/mobile-character-editor.css';

const query = new URLSearchParams(location.search);
const mobile = !query.has('desktop');
document.documentElement.dataset.eleckoiMobile = String(mobile);
const version = {
  id: 'synthetic-version', name: '合成版本', groups: [], promptPositions: [], expandedGroupIds: [], listAllExpanded: true,
  entries: Array.from({ length: 60 }, (_, index) => ({ id: `synthetic-entry-${index}`, title: `合成设定 ${index}`, content: '合成正文', kind: 'normal', groupId: '', treeViewOrder: index })),
};
const library = { ...version, activeVersionId: version.id, versions: [version] };
const settingLibraries = {
  listCharacters: async () => ({ items: Array.from({ length: 40 }, (_, index) => ({ id: `synthetic-character-${index}`, name: `合成角色 ${index}` })) }),
  readUntracked: async () => library,
};
const config = { name: '合成版本', activeVersionId: version.id, versions: [{ id: version.id, name: '合成版本', objects: [], variables: [] }], objects: [], variables: [], expandedObjectIds: [], listAllExpanded: true };
const callbacks = { onChange() {}, onClose() {}, onError(message) { throw new Error(message); } };
createRoot(document.querySelector('#root')).render(
  <main className={mobile ? 'mobile-shell' : ''}><div className={mobile ? 'mobile-character-editor' : ''}>
    {query.get('mode') === 'variable' ? <VariableConfigManager config={config} {...callbacks} /> : <SettingLibraryManager
      initialAction={query.has('merge') ? 'merge' : 'manage'} characterId="synthetic-current-character"
      library={library} settingLibraries={settingLibraries} {...callbacks} />}
  </div></main>,
);
