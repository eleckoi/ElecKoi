import { desktopClient } from "../../../bridge/desktopClient.ts";

export function getSettingLibrary(characterId) {
  return desktopClient.request("query.setting_library.read", { characterId });
}

export function saveSettingLibrary(characterId, library) {
  return desktopClient.request("command.setting_library.save", { characterId, library });
}

export function saveSettingLibraryViewState(characterId, expandedGroupIds) {
  return desktopClient.request("command.setting_library.view_state.save", { characterId, expandedGroupIds });
}
