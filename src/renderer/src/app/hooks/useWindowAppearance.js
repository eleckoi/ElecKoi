import { useEffect, useRef, useState } from "react";
import { DEFAULT_CHAT_DISPLAY_PREFERENCES } from "@shared/contracts/settings/schemas";
import {
  DEFAULT_SIDEBAR_CHARACTER_ARTWORK,
  DEFAULT_NEW_CHARACTER_BACKGROUND,
  applyAppearanceMode,
  applyAppearanceTheme,
  getAppearanceMode,
  getChatDisplay,
  listenAppearanceModeChanged,
  listenChatDisplayChanged,
  normalizeAppearanceMode,
  normalizeComposerStyle,
  normalizeGlobalChatWallpaper,
  normalizeNewCharacterBackground,
  normalizeSidebarCharacterArtwork,
  saveAppearanceMode,
  saveChatDisplay,
} from "../../modules/appearance/index.js";
import {
  emitUiPreferencesChanged,
  getUiPreferences,
  listenUiPreferencesChanged,
  saveUiPreferences,
} from "../../modules/settings/index.js";

export function useWindowAppearance({ notify = () => {} } = {}) {
  const [appearanceMode, setAppearanceMode] = useState("light");
  const [sidebarCharacterArtwork, setSidebarCharacterArtwork] = useState(DEFAULT_SIDEBAR_CHARACTER_ARTWORK);
  const [chatDisplay, setChatDisplay] = useState(DEFAULT_CHAT_DISPLAY_PREFERENCES);
  const [composerStyle, setComposerStyle] = useState("glass");
  const [globalChatWallpaper, setGlobalChatWallpaper] = useState(() => normalizeGlobalChatWallpaper());
  const [newCharacterBackground, setNewCharacterBackground] = useState(DEFAULT_NEW_CHARACTER_BACKGROUND);
  const confirmedChatDisplayRef = useRef(DEFAULT_CHAT_DISPLAY_PREFERENCES);
  const chatDisplaySaveTimerRef = useRef(null);
  const chatDisplayVersionRef = useRef(0);
  const chatDisplayDirtyRef = useRef(false);

  useEffect(() => {
    let active = true;
    let dispose = () => {};
    applyAppearanceTheme(null);
    const updatePreferences = (preferences) => {
      if (!active) return;
      if (Object.hasOwn(preferences || {}, "composer_style")) {
        setComposerStyle(normalizeComposerStyle(preferences?.composer_style));
      }
      if (Object.hasOwn(preferences || {}, "global_chat_wallpaper")) {
        setGlobalChatWallpaper(normalizeGlobalChatWallpaper(preferences?.global_chat_wallpaper));
      }
      if (Object.hasOwn(preferences || {}, "new_character_background")) {
        setNewCharacterBackground(normalizeNewCharacterBackground(preferences?.new_character_background));
      }
      if (Object.hasOwn(preferences || {}, "sidebar_character_artwork")) {
        setSidebarCharacterArtwork(normalizeSidebarCharacterArtwork(preferences?.sidebar_character_artwork));
      }
    };
    getUiPreferences().then(updatePreferences).catch(() => {});
    listenUiPreferencesChanged(updatePreferences).then((cleanup) => {
      if (active) dispose = cleanup;
      else cleanup();
    }).catch(() => {});
    return () => {
      active = false;
      dispose();
    };
  }, []);

  useEffect(() => {
    let active = true;
    let dispose = () => {};
    const updateMode = (mode) => {
      if (!active) return;
      const nextMode = normalizeAppearanceMode(mode);
      setAppearanceMode(nextMode);
      applyAppearanceMode(nextMode);
    };
    getAppearanceMode().then(updateMode).catch(() => {});
    listenAppearanceModeChanged(updateMode).then((cleanup) => {
      if (active) dispose = cleanup;
      else cleanup();
    }).catch(() => {});
    return () => {
      active = false;
      dispose();
    };
  }, []);

  useEffect(() => {
    let active = true;
    let dispose = () => {};
    const updateDisplay = (preferences) => {
      if (!active || chatDisplayDirtyRef.current) return;
      confirmedChatDisplayRef.current = preferences;
      setChatDisplay(preferences);
    };
    getChatDisplay().then(updateDisplay).catch(() => {});
    listenChatDisplayChanged(updateDisplay).then((cleanup) => {
      if (active) dispose = cleanup;
      else cleanup();
    }).catch(() => {});
    return () => {
      active = false;
      dispose();
      if (chatDisplaySaveTimerRef.current) window.clearTimeout(chatDisplaySaveTimerRef.current);
    };
  }, []);

  async function changeAppearanceMode(mode) {
    const previousMode = appearanceMode;
    const nextMode = normalizeAppearanceMode(mode);
    setAppearanceMode(nextMode);
    applyAppearanceMode(nextMode);
    try {
      const saved = await saveAppearanceMode(nextMode);
      setAppearanceMode(saved.mode);
      applyAppearanceMode(saved.mode);
    } catch (error) {
      setAppearanceMode(previousMode);
      applyAppearanceMode(previousMode);
      notify("error", error?.message || "外观模式保存失败。");
    }
  }

  function changeChatDisplay(nextDisplay) {
    const version = chatDisplayVersionRef.current + 1;
    chatDisplayVersionRef.current = version;
    chatDisplayDirtyRef.current = true;
    setChatDisplay(nextDisplay);
    if (chatDisplaySaveTimerRef.current) window.clearTimeout(chatDisplaySaveTimerRef.current);
    chatDisplaySaveTimerRef.current = window.setTimeout(async () => {
      chatDisplaySaveTimerRef.current = null;
      try {
        const saved = await saveChatDisplay(nextDisplay);
        if (chatDisplayVersionRef.current !== version) return;
        chatDisplayDirtyRef.current = false;
        confirmedChatDisplayRef.current = saved;
        setChatDisplay(saved);
      } catch (error) {
        if (chatDisplayVersionRef.current !== version) return;
        chatDisplayDirtyRef.current = false;
        setChatDisplay(confirmedChatDisplayRef.current);
        notify("error", error?.message || "聊天显示设置保存失败。");
      }
    }, 250);
  }

  async function changeComposerStyle(style) {
    const previousStyle = composerStyle;
    const nextStyle = normalizeComposerStyle(style);
    setComposerStyle(nextStyle);
    try {
      await saveUiPreferences({ composer_style: nextStyle });
      notify("success", nextStyle === "glass" ? "已启用玻璃态输入框。" : "已恢复原版输入框。");
    } catch (error) {
      setComposerStyle(previousStyle);
      notify("error", error?.message || "输入框样式保存失败。");
    }
  }

  async function changeSidebarCharacterArtwork(mode) {
    const previousMode = sidebarCharacterArtwork;
    const nextMode = normalizeSidebarCharacterArtwork(mode);
    setSidebarCharacterArtwork(nextMode);
    try {
      await saveUiPreferences({ sidebar_character_artwork: nextMode });
    } catch (error) {
      setSidebarCharacterArtwork(previousMode);
      notify("error", error?.message || "侧栏角色图设置保存失败。");
    }
  }

  async function saveGlobalChatWallpaper(nextWallpaper) {
    const normalized = normalizeGlobalChatWallpaper(nextWallpaper);
    const savedPreferences = await saveUiPreferences({ global_chat_wallpaper: normalized });
    const saved = normalizeGlobalChatWallpaper(savedPreferences?.global_chat_wallpaper);
    setGlobalChatWallpaper(saved);
    emitUiPreferencesChanged({ global_chat_wallpaper: saved });
    return saved;
  }

  async function saveNewCharacterBackground(nextBackground) {
    const normalized = normalizeNewCharacterBackground(nextBackground);
    const previous = newCharacterBackground;
    setNewCharacterBackground(normalized);
    emitUiPreferencesChanged({ new_character_background: normalized });
    try {
      await saveUiPreferences({ new_character_background: normalized });
      return normalized;
    } catch (error) {
      setNewCharacterBackground(previous);
      throw error;
    }
  }

  return {
    appearanceMode,
    sidebarCharacterArtwork,
    chatDisplay,
    composerStyle,
    globalChatWallpaper,
    newCharacterBackground,
    changeAppearanceMode,
    changeChatDisplay,
    changeComposerStyle,
    changeSidebarCharacterArtwork,
    saveGlobalChatWallpaper,
    saveNewCharacterBackground,
  };
}
