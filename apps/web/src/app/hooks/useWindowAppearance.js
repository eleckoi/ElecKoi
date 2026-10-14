import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { chatDisplayPreferencesSchema, DEFAULT_CHAT_DISPLAY_PREFERENCES } from "@shared/contracts/settings/schemas";
import {
  DEFAULT_SIDEBAR_CHARACTER_ARTWORK,
  DEFAULT_NEW_CHARACTER_BACKGROUND,
  applyAppearanceTheme,
  normalizeAppearanceMode,
  useDshAppearance,
  normalizeGlobalChatWallpaper,
  normalizeNewCharacterBackground,
  normalizeSidebarCharacterArtwork,
} from "../../modules/appearance/index.js";
import {
  useDshDisplayPreferences,
} from "../../modules/settings/index.js";

const EMPTY_DISPLAY_PREFERENCES = Object.freeze({
  status: "loading",
  ui: Object.freeze({}),
  chatDisplay: Object.freeze({}),
  writable: false,
  revision: undefined,
  error: "",
});
const EMPTY_SUBSCRIBE = () => () => {};
const GET_EMPTY_DISPLAY_PREFERENCES = () => EMPTY_DISPLAY_PREFERENCES;

export function useWindowAppearance({ notify = () => {} } = {}) {
  const appearance = useDshAppearance();
  const displayPreferences = useDshDisplayPreferences();
  const displaySnapshot = useSyncExternalStore(
    displayPreferences?.subscribe || EMPTY_SUBSCRIBE,
    displayPreferences?.getSnapshot || GET_EMPTY_DISPLAY_PREFERENCES,
  );
  const [appearanceMode, setAppearanceMode] = useState(() => appearance?.theme.getTheme().preference || "light");
  const [sidebarCharacterArtwork, setSidebarCharacterArtwork] = useState(DEFAULT_SIDEBAR_CHARACTER_ARTWORK);
  const [chatDisplay, setChatDisplay] = useState(DEFAULT_CHAT_DISPLAY_PREFERENCES);
  const [globalChatWallpaper, setGlobalChatWallpaper] = useState(() => normalizeGlobalChatWallpaper());
  const [newCharacterBackground, setNewCharacterBackground] = useState(DEFAULT_NEW_CHARACTER_BACKGROUND);
  const confirmedChatDisplayRef = useRef(DEFAULT_CHAT_DISPLAY_PREFERENCES);
  const chatDisplaySaveTimerRef = useRef(null);
  const chatDisplayVersionRef = useRef(0);
  const chatDisplayDirtyRef = useRef(false);

  useEffect(() => {
    const preferences = displaySnapshot.ui;
    applyAppearanceTheme(preferences.appearance_theme);
    if (Object.hasOwn(preferences, "global_chat_wallpaper")) {
      setGlobalChatWallpaper(normalizeGlobalChatWallpaper(preferences.global_chat_wallpaper));
    }
    if (Object.hasOwn(preferences, "new_character_background")) {
      setNewCharacterBackground(normalizeNewCharacterBackground(preferences.new_character_background));
    }
    if (Object.hasOwn(preferences, "sidebar_character_artwork")) {
      setSidebarCharacterArtwork(normalizeSidebarCharacterArtwork(preferences.sidebar_character_artwork));
    }
  }, [displaySnapshot.ui]);

  useEffect(() => {
    if (!appearance) return;
    const update = snapshot => setAppearanceMode(snapshot.preference);
    const stop = appearance.subscribe(update);
    update(appearance.theme.getTheme());
    return stop;
  }, [appearance]);

  useEffect(() => {
    if (chatDisplayDirtyRef.current) return;
    const parsed = chatDisplayPreferencesSchema.safeParse(displaySnapshot.chatDisplay);
    const preferences = parsed.success ? parsed.data : DEFAULT_CHAT_DISPLAY_PREFERENCES;
    confirmedChatDisplayRef.current = preferences;
    setChatDisplay(preferences);
    return () => {
      if (chatDisplaySaveTimerRef.current) window.clearTimeout(chatDisplaySaveTimerRef.current);
    };
  }, [displaySnapshot.chatDisplay]);

  function changeAppearanceMode(mode) {
    try {
      if (!appearance) throw new Error("DSH 主题服务尚未就绪。");
      appearance.theme.setTheme(normalizeAppearanceMode(mode));
    } catch (error) {
      notify("error", error?.message || "外观模式切换失败。");
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
        if (!displayPreferences) throw new Error("DSH 显示偏好服务尚未就绪。");
        const snapshot = await displayPreferences.setChatDisplay(nextDisplay);
        const parsed = chatDisplayPreferencesSchema.safeParse(snapshot.chatDisplay);
        const saved = parsed.success ? parsed.data : DEFAULT_CHAT_DISPLAY_PREFERENCES;
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

  async function changeSidebarCharacterArtwork(mode) {
    const previousMode = sidebarCharacterArtwork;
    const nextMode = normalizeSidebarCharacterArtwork(mode);
    setSidebarCharacterArtwork(nextMode);
    try {
      if (!displayPreferences) throw new Error("DSH 显示偏好服务尚未就绪。");
      await displayPreferences.updateUi({ sidebar_character_artwork: nextMode });
    } catch (error) {
      setSidebarCharacterArtwork(previousMode);
      notify("error", error?.message || "侧栏角色图设置保存失败。");
    }
  }

  async function saveGlobalChatWallpaper(nextWallpaper) {
    const normalized = normalizeGlobalChatWallpaper(nextWallpaper);
    if (!displayPreferences) throw new Error("DSH 显示偏好服务尚未就绪。");
    const snapshot = await displayPreferences.updateUi({ global_chat_wallpaper: normalized });
    const saved = normalizeGlobalChatWallpaper(snapshot.ui.global_chat_wallpaper);
    setGlobalChatWallpaper(saved);
    return saved;
  }

  async function saveNewCharacterBackground(nextBackground) {
    const normalized = normalizeNewCharacterBackground(nextBackground);
    const previous = newCharacterBackground;
    setNewCharacterBackground(normalized);
    try {
      if (!displayPreferences) throw new Error("DSH 显示偏好服务尚未就绪。");
      await displayPreferences.updateUi({ new_character_background: normalized });
      return normalized;
    } catch (error) {
      setNewCharacterBackground(previous);
      throw error;
    }
  }

  return {
    appearanceMode,
    messageStyle: displaySnapshot.ui.message_style,
    chatBackgroundLocks: displaySnapshot.ui.chat_background_locks,
    sidebarCharacterArtwork,
    chatDisplay,
    globalChatWallpaper,
    newCharacterBackground,
    changeAppearanceMode,
    changeChatDisplay,
    changeSidebarCharacterArtwork,
    saveGlobalChatWallpaper,
    saveNewCharacterBackground,
  };
}
