import React, { useMemo, useRef } from 'react';
import { MainPageContext } from '../../src/app/windows/MainPageContext.jsx';
import { MobileCharactersPage } from '../../src/mobile/MobileCharactersPage.jsx';
import { MobilePresetEditor } from '../../src/mobile/MobilePresetsPage.jsx';
import { PresetProvider } from '../../src/modules/presets/components/PresetPanel.jsx';
import { createVariableDraft } from '../../src/modules/variables/model/variableConfigEditing.js';
import '../../src/mobile/mobile.css';

// Only synthetic models are exposed to this isolated browser fixture.
export function MobileEditorHarness({ presetModel, configuration, preset, character = false, longText = '' }) {
  const guardRef = useRef(null);
  const view = useMemo(() => {
    const id = 'synthetic-character', handlers = [], records = {};
    window.mobileBack = () => handlers.at(-1)?.();
    const model = (name, initial) => {
      let value = initial;
      records[name] = () => value;
      return { getSnapshot: () => ({ status: 'ready', value }), subscribe: () => () => {}, read: async () => value,
        saveViewState: async () => [], save: async (_id, next) => {
          if (window.saveFails) throw Error('合成保存失败');
          value = structuredClone(next); return value;
        } };
    };
    const version = { id: 'v1', name: '合成版本', entries: preset.entries.map((entry, i) => ({ ...entry, content: i === 0 && longText ? longText : entry.content })), groups: [], promptPositions: [], expandedGroupIds: [], listAllExpanded: true };
    const variables = Array.from({ length: 24 }, (_, i) => ({ ...createVariableDraft({ variables: [], objects: [] }), id: `variable-${i}`, title: `合成变量 ${i + 1}`, treeViewOrder: i + 1, description: i === 0 && longText ? longText : '变量的中文说明', updateRule: i === 0 && longText ? longText : '根据实际剧情更新' }));
    const variableVersion = { id: 'v1', name: '合成版本', variables, objects: [], initialStateJson: '{}', schemaCode: '', expandedObjectIds: [] };
    const item = { id, name: '合成角色', persona: { assistant_name: '合成角色' } };
    window.savedMobileRecords = records;
    return {
      route: { kind: character ? 'character-editor' : 'preset-editor', characterId: id }, guardRef, routeBusy: false,
      characterConfiguration: { ...configuration,
        settingLibraries: model('settings', { ...version, characterId: id, activeVersionId: 'v1', versions: [version] }),
        variables: model('variables', { ...variableVersion, characterId: id, activeVersionId: 'v1', versions: [variableVersion] }),
        openings: model('openings', { characterId: id, defaultOpeningMessageId: 'opening-0', openingMessages: Array.from({ length: 24 }, (_, i) => ({ id: `opening-${i}`, title: `合成开场白 ${i + 1}`, content: i === 0 && longText ? longText : '合成开场白正文' })) }),
      },
      characters: { refresh: async () => ({ items: [item] }) },
      chat: { characters: { items: [item], groups: [] }, persona: {}, notify: (type, message) => { window.mobileNotice = { type, message }; } },
      registerBackHandler: handler => { handlers.push(handler); return () => handlers.splice(handlers.indexOf(handler), 1); },
      goBack: () => handlers.at(-1)?.(), scrollPositions: new Map(),
      renderCharacterEditorSection: (section, _owner, fallback) => section === 'card' ? <div /> : fallback,
    };
  }, []);
  return <MainPageContext.Provider value={view}><div className="mobile-shell" style={{ height: '100dvh', width: '100%', display: 'flex' }}>
    {character ? <MobileCharactersPage /> : <PresetProvider catalogModel={presetModel} fixedPresetId={preset.id} navigationGuardRef={guardRef}><MobilePresetEditor /></PresetProvider>}
  </div></MainPageContext.Provider>;
}
