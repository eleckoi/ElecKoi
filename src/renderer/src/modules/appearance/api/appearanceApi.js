import { listenSetting, readSetting, writeSetting } from "../../../bridge/settingsClient.js";
import { desktopClient } from "../../../bridge/desktopClient.ts";

const APPEARANCE_MODE_KEY = "appearance.mode";
const CHAT_DISPLAY_KEY = "chat.display";

export function getAppearanceMode() {
  return readSetting(APPEARANCE_MODE_KEY);
}

export function saveAppearanceMode(mode) {
  return desktopClient.request("command.appearance.set_mode", { mode });
}

export async function listenAppearanceModeChanged(handler) {
  return listenSetting(APPEARANCE_MODE_KEY, handler);
}

export function getChatDisplay() {
  return readSetting(CHAT_DISPLAY_KEY);
}

export function saveChatDisplay(preferences) {
  return writeSetting(CHAT_DISPLAY_KEY, preferences);
}

export async function listenChatDisplayChanged(handler) {
  return listenSetting(CHAT_DISPLAY_KEY, handler);
}
