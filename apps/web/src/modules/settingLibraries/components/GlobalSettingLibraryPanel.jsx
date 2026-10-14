import { forwardRef, useMemo } from 'react';
import { SettingLibraryPanel } from './SettingLibraryPanel.jsx';

export const GLOBAL_SETTING_LIBRARY_OWNER = 'eleckoi:global-settings';

/** The shared editor receives a global store, without binding a character's variables. */
export const GlobalSettingLibraryPanel = forwardRef(function GlobalSettingLibraryPanel({ settingLibraries, onDirtyChange }, ref) {
  const globalLibrary = useMemo(() => ({
    getSnapshot: () => settingLibraries.getGlobalSnapshot(),
    subscribe: listener => settingLibraries.subscribeGlobal(snapshot => listener('configuration', GLOBAL_SETTING_LIBRARY_OWNER, snapshot)),
    read: () => settingLibraries.readGlobal(),
    save: (_owner, library) => settingLibraries.saveGlobal(library),
    saveViewState: (_owner, expandedIds) => settingLibraries.saveGlobalViewState(expandedIds),
    listCharacters: () => settingLibraries.listCharacters(),
    readUntracked: characterId => settingLibraries.readUntracked(characterId),
  }), [settingLibraries]);

  return <SettingLibraryPanel ref={ref} characterId={GLOBAL_SETTING_LIBRARY_OWNER}
    settingLibraries={globalLibrary} onDirtyChange={onDirtyChange} autoFocusNewEntry={false} globalLibrary />;
});
