import { describe, expect, it } from "vitest";
import {
  DEFAULT_CHAT_DISPLAY_PREFERENCES,
  chatDisplayPreferencesSchema,
} from "../src/shared/contracts/settings/schemas.ts";
import {
  chatDisplayCssVariables,
  chatTextColorCssVariables,
  messageFloorNumber,
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
      avatar_size: 65,
      avatar_shape: "portrait",
      name_font_size: 15,
      name_avatar_spacing: 10,
      reply_spacing: 4,
      turn_spacing: 10,
      message_font_size: 15,
      paragraph_spacing: 10,
    });
    expect(DEFAULT_CHAT_DISPLAY_PREFERENCES.profiles.agent).toMatchObject({
      avatar_size: 48,
      name_font_size: 16,
      message_font_size: 16,
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
    expect(css["--chat-avatar-width"]).toBe("65px");
    expect(Number.parseFloat(css["--chat-avatar-height"])).toBeCloseTo(86.667, 3);
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

  it("fills the roleplay message options when reading saved preferences from before these switches", () => {
    const { roleplay_timestamps_enabled: _timestamps, roleplay_message_floors_enabled: _floors, ...saved } = DEFAULT_CHAT_DISPLAY_PREFERENCES;
    expect(chatDisplayPreferencesSchema.parse(saved)).toMatchObject({
      roleplay_timestamps_enabled: true,
      roleplay_message_floors_enabled: true,
    });
  });

  it("keeps message floors stable across paged history and pending replies", () => {
    const page = [{ messageIndex: 48 }, { messageIndex: 49 }, { pending: true }];
    expect(page.map((_, index) => messageFloorNumber(page, index))).toEqual([48, 49, 50]);
    const withOlderPage = [{ messageIndex: 46 }, { messageIndex: 47 }, ...page];
    expect(withOlderPage.map((_, index) => messageFloorNumber(withOlderPage, index))).toEqual([46, 47, 48, 49, 50]);
  });

  it("refreshes untouched Agent defaults while preserving a customized profile", () => {
    const previousAgentProfile = {
      ...DEFAULT_CHAT_DISPLAY_PREFERENCES.profiles.agent,
      avatar_size: 34.5,
      name_font_size: 13,
      message_font_size: 14,
      line_height_multiplier: 1,
    };
    const preferences = {
      ...DEFAULT_CHAT_DISPLAY_PREFERENCES,
      layout: "agent",
      profiles: { ...DEFAULT_CHAT_DISPLAY_PREFERENCES.profiles, agent: previousAgentProfile },
    };
    expect(resolveChatDisplayProfile(preferences).profile).toBe(DEFAULT_CHAT_DISPLAY_PREFERENCES.profiles.agent);
    const customized = { ...preferences, profiles: { ...preferences.profiles, agent: { ...previousAgentProfile, avatar_size: 52 } } };
    expect(resolveChatDisplayProfile(customized).profile.avatar_size).toBe(52);
    expect(resolveChatDisplayProfile(customized).profile.message_font_size).toBe(14);
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
