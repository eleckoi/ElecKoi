export { ThemePaletteModal } from "./components/ThemePaletteModal.jsx";
export {
  getAppearanceMode,
  getChatDisplay,
  listenAppearanceModeChanged,
  listenChatDisplayChanged,
  saveAppearanceMode,
  saveChatDisplay,
} from "./api/appearanceApi.js";
export {
  applyAppearanceMode,
  initializeAppearanceMode,
  normalizeAppearanceMode,
} from "./theme/appearanceMode.js";
export { applyAppearanceTheme } from "./theme/appearanceTheme.js";
export {
  DEFAULT_SIDEBAR_CHARACTER_ARTWORK,
  normalizeSidebarCharacterArtwork,
} from "./preferences/sidebarCharacterArtwork.js";
export {
  chatDisplayCssVariables,
  chatTextColorCssVariables,
  resolveChatAvatar,
  resolveChatAvatarShape,
  resolveChatDisplayProfile,
} from "./preferences/chatDisplay.js";
export {
  APP_DEFAULT_CHAT_BACKGROUND,
  CHAT_WALLPAPER_DEFAULTS,
  CUSTOM_CHAT_BACKGROUND,
  DEFAULT_NEW_CHARACTER_BACKGROUND,
  GLOBAL_CHAT_BACKGROUND,
  chatWallpaperMode,
  characterArtwork,
  fileToDataUrl,
  normalizeGlobalChatWallpaper,
  normalizeNewCharacterBackground,
  resolveChatWallpaper,
} from "./preferences/chatWallpaper.js";
export { DEFAULT_COMPOSER_STYLE, normalizeComposerStyle } from "./preferences/composerStyle.js";
