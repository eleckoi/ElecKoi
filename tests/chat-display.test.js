import { describe, expect, it } from "vitest";
import {
  DEFAULT_CHAT_DISPLAY_PREFERENCES,
  chatDisplayPreferencesSchema,
} from "../src/shared/contracts/settings/schemas.ts";
import {
  chatDisplayCssVariables,
  chatTextColorCssVariables,
  resolveChatAvatar,
  resolveChatAvatarShape,
  resolveChatDisplayProfile,
} from "../src/renderer/src/modules/appearance/preferences/chatDisplay.js";

describe("chat display preferences", () => {
  it("keeps the three Android layout profiles independent and defaults to roleplay", () => {
    expect(chatDisplayPreferencesSchema.parse(DEFAULT_CHAT_DISPLAY_PREFERENCES)).toEqual(DEFAULT_CHAT_DISPLAY_PREFERENCES);
    expect(DEFAULT_CHAT_DISPLAY_PREFERENCES.layout).toBe("roleplay");
    expect(DEFAULT_CHAT_DISPLAY_PREFERENCES.profiles.roleplay).toMatchObject({
      assistant_bubble_enabled: false,
      avatar_size: 55,
      avatar_shape: "portrait",
      name_font_size: 15,
      name_avatar_spacing: 10,
      reply_spacing: 4,
      turn_spacing: 10,
      message_font_size: 15,
      paragraph_spacing: 10,
    });
    expect(DEFAULT_CHAT_DISPLAY_PREFERENCES.profiles.agent).toMatchObject({
      avatar_size: 34.5,
      message_font_size: 14,
      reply_spacing: 15,
      turn_spacing: 15,
    });
    expect(DEFAULT_CHAT_DISPLAY_PREFERENCES.profiles.social).toMatchObject({
      assistant_bubble_enabled: true,
      avatar_size: 40,
      message_font_size: 16,
      turn_spacing: 16,
    });
  });

  it("maps the active profile to the same CSS geometry used by the renderer", () => {
    const { layout, profile } = resolveChatDisplayProfile(DEFAULT_CHAT_DISPLAY_PREFERENCES);
    const css = chatDisplayCssVariables(layout, profile);

    expect(layout).toBe("roleplay");
    expect(css["--chat-avatar-width"]).toBe("55px");
    expect(Number.parseFloat(css["--chat-avatar-height"])).toBeCloseTo(73.333, 3);
    expect(css["--chat-font-size"]).toBe("15px");
    expect(Number.parseFloat(css["--chat-line-height"])).toBeCloseTo(23, 5);
    expect(css["--chat-reply-gap"]).toBe("4px");
    expect(css["--chat-turn-gap"]).toBe("10px");
  });

  it("uses portrait assets only in roleplay and falls back safely", () => {
    const persona = {
      user_avatar: "user-avatar",
      user_square: "user-square",
      user_portrait: "user-portrait",
      assistant_avatar: "assistant-avatar",
      assistant_square: "assistant-square",
      assistant_cover: "assistant-cover",
    };

    expect(resolveChatAvatarShape("agent", "portrait")).toBe("circle");
    expect(resolveChatAvatarShape("roleplay", "portrait")).toBe("portrait");
    expect(resolveChatAvatar(persona, "user", "portrait")).toBe("user-portrait");
    expect(resolveChatAvatar(persona, "assistant", "portrait")).toBe("assistant-cover");
    expect(resolveChatAvatar(persona, "assistant", "rounded_square")).toBe("assistant-square");
  });

  it("uses dedicated markup colors while main text follows the app theme", () => {
    expect(DEFAULT_CHAT_DISPLAY_PREFERENCES.text_colors).toEqual({
      italics: "#919191",
      underline: "#bce7cf",
      quote: "#f2a65a",
    });
    expect(chatTextColorCssVariables(DEFAULT_CHAT_DISPLAY_PREFERENCES.text_colors)).toEqual({
      "--chat-italics-color": "#919191",
      "--chat-underline-color": "#bce7cf",
      "--chat-quote-color": "#f2a65a",
    });
  });
});
