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

export function getConversationSettingLibraries(characterId) {
  return desktopClient.request("query.setting_library.conversations", { characterId });
}

export function saveConversationSettingLibrary(characterId, sessionId, library) {
  return desktopClient.request("command.setting_library.conversation.save", { characterId, sessionId, library });
}

export function resetConversationSettingLibrary(characterId, sessionId) {
  return desktopClient.request("command.setting_library.conversation.reset", { characterId, sessionId });
}

export function saveConversationSettingVersion(characterId, sessionId, name) {
  return desktopClient.request("command.setting_library.conversation.save_version", { characterId, sessionId, name });
}
