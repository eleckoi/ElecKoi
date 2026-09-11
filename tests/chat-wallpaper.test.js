import { describe, expect, it } from "vitest";
import {
  APP_DEFAULT_CHAT_BACKGROUND,
  CUSTOM_CHAT_BACKGROUND,
  GLOBAL_CHAT_BACKGROUND,
  chatWallpaperMode,
  resolveChatWallpaper,
} from "../src/renderer/src/modules/appearance/preferences/chatWallpaper.js";

const persona = { assistant_cover: "cover", assistant_square: "square", assistant_avatar: "avatar" };

describe("chat wallpaper parity with Android", () => {
  it("uses character artwork for the blank new-character default", () => {
    const result = resolveChatWallpaper({ character: { chatBackground: "" }, persona });
    expect(result.mode).toBe("character");
    expect(result.image).toBe("cover");
  });

  it("suppresses images in app-default and empty-custom modes", () => {
    expect(resolveChatWallpaper({ character: { chatBackground: APP_DEFAULT_CHAT_BACKGROUND }, persona }).image).toBe("");
    expect(resolveChatWallpaper({ character: { chatBackground: CUSTOM_CHAT_BACKGROUND }, persona }).image).toBe("");
  });

  it("uses a custom image directly", () => {
    expect(resolveChatWallpaper({ character: { chatBackground: "data:image/png;base64,test" }, persona }).image).toContain("data:image/png");
  });

  it("uses only the uploaded global image", () => {
    expect(resolveChatWallpaper({ character: { chatBackground: GLOBAL_CHAT_BACKGROUND }, persona, globalWallpaper: { image: "global" } }).image).toBe("global");
    expect(resolveChatWallpaper({ character: { chatBackground: GLOBAL_CHAT_BACKGROUND }, persona }).image).toBe("");
  });

  it("recognizes all four modes", () => {
    expect([
      chatWallpaperMode(APP_DEFAULT_CHAT_BACKGROUND),
      chatWallpaperMode(CUSTOM_CHAT_BACKGROUND),
      chatWallpaperMode(""),
      chatWallpaperMode(GLOBAL_CHAT_BACKGROUND),
    ]).toEqual(["default", "custom", "character", "global"]);
  });

  it("uses only the configured reading scrim without an extra roleplay veil", () => {
    expect(resolveChatWallpaper({ character: { chatBackground: "", chatBackgroundScrim: 0.22 }, persona }).scrim).toBe(0.22);
    expect(resolveChatWallpaper({
      character: { chatBackground: GLOBAL_CHAT_BACKGROUND, chatBackgroundScrim: 0.8 },
      persona,
      globalWallpaper: { image: "global", scrim: 0.16 },
    }).scrim).toBe(0.16);
  });

  it("uses a 50% reading scrim when no value has been saved", () => {
    expect(resolveChatWallpaper({ character: { chatBackground: "" }, persona }).scrim).toBe(0.5);
    expect(resolveChatWallpaper({
      character: { chatBackground: GLOBAL_CHAT_BACKGROUND },
      persona,
      globalWallpaper: { image: "global" },
    }).scrim).toBe(0.5);
  });

  it("uses a 2px blur when no value has been saved", () => {
    expect(resolveChatWallpaper({ character: { chatBackground: "" }, persona }).blur).toBe(2);
    expect(resolveChatWallpaper({
      character: { chatBackground: GLOBAL_CHAT_BACKGROUND },
      persona,
      globalWallpaper: { image: "global" },
    }).blur).toBe(2);
  });
});
