import {
  APP_DEFAULT_CHAT_BACKGROUND,
  CUSTOM_CHAT_BACKGROUND,
  GLOBAL_CHAT_BACKGROUND,
} from "@shared/contracts/characters/chatBackground";

export {
  APP_DEFAULT_CHAT_BACKGROUND,
  CUSTOM_CHAT_BACKGROUND,
  GLOBAL_CHAT_BACKGROUND,
};

export const DEFAULT_NEW_CHARACTER_BACKGROUND = "character";

export function normalizeNewCharacterBackground(value) {
  return value === "app" ? "app" : DEFAULT_NEW_CHARACTER_BACKGROUND;
}

export const CHAT_WALLPAPER_DEFAULTS = Object.freeze({
  opacity: 0.72,
  blur: 2,
  scrim: 0.5,
});

const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), maximum);

function number(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? clamp(parsed, minimum, maximum) : fallback;
}

export function chatWallpaperMode(background = "") {
  if (background === APP_DEFAULT_CHAT_BACKGROUND) return "default";
  if (background === GLOBAL_CHAT_BACKGROUND) return "global";
  if (background === CUSTOM_CHAT_BACKGROUND || background) return "custom";
  return "character";
}

export function characterArtwork(character = {}, persona = {}) {
  return persona.assistant_cover
    || character.coverImage
    || persona.assistant_square
    || character.squareImage
    || persona.assistant_avatar
    || character.avatar
    || "";
}

export function normalizeGlobalChatWallpaper(value = {}) {
  return {
    image: typeof value?.image === "string" ? value.image : "",
    opacity: number(value?.opacity, CHAT_WALLPAPER_DEFAULTS.opacity, 0.12, 1),
    blur: number(value?.blur, CHAT_WALLPAPER_DEFAULTS.blur, 0, 24),
    scrim: number(value?.scrim, CHAT_WALLPAPER_DEFAULTS.scrim, 0, 1),
  };
}

export function resolveChatWallpaper({ character = {}, persona = {}, globalWallpaper = {} } = {}) {
  const background = typeof character.chatBackground === "string" ? character.chatBackground : "";
  const mode = chatWallpaperMode(background);
  const cardImage = characterArtwork(character, persona);
  const global = normalizeGlobalChatWallpaper(globalWallpaper);
  let image = "";

  if (mode === "character") image = cardImage;
  if (mode === "custom" && background !== CUSTOM_CHAT_BACKGROUND) image = background;
  if (mode === "global") image = global.image;

  const opacity = number(character.chatBackgroundOpacity, CHAT_WALLPAPER_DEFAULTS.opacity, 0.12, 1);
  const blur = number(character.chatBackgroundBlur, CHAT_WALLPAPER_DEFAULTS.blur, 0, 24);
  const scrim = number(character.chatBackgroundScrim, CHAT_WALLPAPER_DEFAULTS.scrim, 0, 1);

  return {
    mode,
    image,
    source: mode === "global" && global.image ? "global" : mode,
    opacity: mode === "global" ? global.opacity : opacity,
    blur: mode === "global" ? global.blur : blur,
    scrim: mode === "global" ? global.scrim : scrim,
  };
}

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("图片读取失败，请换一张图片试试。"));
    reader.readAsDataURL(file);
  });
}
