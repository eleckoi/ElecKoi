import { describe, expect, it } from "vitest";
import {
  DEFAULT_CHAT_DISPLAY_PREFERENCES,
  chatDisplayPreferencesSchema,
  DEFAULT_ROLEPLAY_STYLE,
  normalizeChatDisplaySettings,
} from "../../../../packages/shared/src/contracts/settings/schemas.ts";
import {
  chatDisplayCssVariables,
  chatTextColorCssVariables,
  messageFloorNumber,
  resolveChatAvatar,
  resolveChatAvatarShape,
  resolveChatDisplayProfile,
  resolveRoleplayStyle,
  roleplayStyleCssVariables,
} from "../../src/modules/appearance/preferences/chatDisplay.js";
import { chatDisplaySettings } from '../../src/modules/settings/model/chatDisplaySettings.js';

describe("chat display preferences", () => {
  it('fills older display documents without changing their profiles or unknown extension fields', () => {
    const { roleplay_style, ...older } = structuredClone(DEFAULT_CHAT_DISPLAY_PREFERENCES);
    older.profiles.roleplay.avatar_size = 72;
    expect(normalizeChatDisplaySettings(older)).toMatchObject({ roleplay_style: DEFAULT_ROLEPLAY_STYLE, profiles: { roleplay: { avatar_size: 72 } } });
    const saved = { ...older, roleplay_style: { bubbles_enabled: true, user_bubble_tint: '#987654', extra: 'preserved' } };
    expect(normalizeChatDisplaySettings(saved).roleplay_style).toMatchObject({ ...DEFAULT_ROLEPLAY_STYLE, bubbles_enabled: true, user_bubble_tint: '#987654', extra: 'preserved' });
  });
  it('uses identical theme-aware bubble defaults and rejects out-of-range or invalid stored styles', () => {
    expect(DEFAULT_ROLEPLAY_STYLE).toMatchObject({ backdrop_enabled: false, bubbles_enabled: false });
    const css = roleplayStyleCssVariables(resolveRoleplayStyle({}));
    expect(css['--rp-user-tint']).toBe(css['--rp-assistant-tint']);
    expect(css['--rp-user-tint']).toContain('light-dark(');
    expect(css['--rp-user-opacity']).toBe(css['--rp-assistant-opacity']);
    for (const patch of [{ backdrop_blur: 41 }, { bubble_blur: -1 }, { user_bubble_opacity: 101 }, { assistant_bubble_tint: 'red' }]) {
      expect(chatDisplayPreferencesSchema.safeParse({ ...DEFAULT_CHAT_DISPLAY_PREFERENCES, roleplay_style: patch }).success).toBe(false);
    }
    const custom = roleplayStyleCssVariables({ user_bubble_tint: '#987654', backdrop_blur: 0 });
    expect(custom['--rp-user-tint']).toBe('#987654');
    expect(custom['--rp-assistant-tint']).toBe(css['--rp-assistant-tint']);
    expect(custom['--rp-backdrop-blur']).toBe('0px');
  });
  it('retains roleplay style across layout switching, toggles, and Agent profile resets', () => {
    let saved = structuredClone(DEFAULT_CHAT_DISPLAY_PREFERENCES);
    const model = () => chatDisplaySettings(saved, next => { saved = next; });
    model().updateRoleplayStyle({ bubbles_enabled: true, backdrop_blur: 32, user_bubble_tint: '#987654' });
    model().updateRoleplayStyle({ bubbles_enabled: false });
    expect(saved.roleplay_style.user_bubble_tint).toBe('#987654');
    model().selectLayout('agent');
    model().resetProfile();
    expect(saved.roleplay_style).toMatchObject({ backdrop_blur: 32, user_bubble_tint: '#987654' });
    model().selectLayout('roleplay');
    model().resetProfile();
    expect(saved.roleplay_style).toEqual(DEFAULT_ROLEPLAY_STYLE);
  });
  it("keeps rich message limits opt-in and accepts authored positive floor counts", () => {
    const defaults = DEFAULT_CHAT_DISPLAY_PREFERENCES;
    expect(defaults.rich_message_limit_enabled).toBe(false);
    expect(defaults.rich_message_floor_limit).toBe(10);
    const { rich_message_limit_enabled, rich_message_floor_limit, ...saved } = defaults;
    expect(chatDisplayPreferencesSchema.parse(saved)).toMatchObject({ rich_message_limit_enabled: false, rich_message_floor_limit: 10 });
    expect(chatDisplayPreferencesSchema.parse({ ...defaults, rich_message_limit_enabled: false, rich_message_floor_limit: 6 }))
      .toMatchObject({ rich_message_limit_enabled: false, rich_message_floor_limit: 6 });
    for (const limit of [101, 1001, 10001]) expect(chatDisplayPreferencesSchema.parse({ ...defaults, rich_message_limit_enabled: true, rich_message_floor_limit: limit }).rich_message_floor_limit).toBe(limit);
    for (const limit of [0, 1.5, Infinity]) {
      expect(chatDisplayPreferencesSchema.safeParse({ ...defaults, rich_message_floor_limit: limit }).success).toBe(false);
    }
  });
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
      turn_spacing: 12,
      paragraph_spacing: 10,
    });
    expect(DEFAULT_CHAT_DISPLAY_PREFERENCES.profiles.agent).toMatchObject({
      avatar_size: 48,
      name_font_size: 16,
      reply_spacing: 15,
      turn_spacing: 15,
    });
    expect(DEFAULT_CHAT_DISPLAY_PREFERENCES.profiles.social).toMatchObject({
      assistant_bubble_enabled: true,
      avatar_size: 40,
      turn_spacing: 16,
    });
  });

  it("maps the active profile to the same CSS geometry used by the renderer", () => {
    const { layout, profile } = resolveChatDisplayProfile(DEFAULT_CHAT_DISPLAY_PREFERENCES);
    const css = chatDisplayCssVariables(layout, profile);

    expect(layout).toBe("roleplay");
    expect(css["--chat-avatar-width"]).toBe("65px");
    expect(Number.parseFloat(css["--chat-avatar-height"])).toBeCloseTo(86.667, 3);
    expect(css["--chat-font-size"]).toBe("var(--dsh-content-font-size, 14px)");
    expect(css).not.toHaveProperty("--chat-font-weight");
    expect(css["--chat-line-height"]).toBe("calc((24px + var(--dsh-content-font-delta, 0px)) * 1)");
    expect(css["--chat-reply-gap"]).toBe("4px");
    expect(css["--chat-turn-gap"]).toBe("12px");
  });

  it('refreshes the untouched previous roleplay radius while preserving a customized profile', () => {
    const previous = { ...DEFAULT_CHAT_DISPLAY_PREFERENCES.profiles.roleplay, bubble_corner_radius: 10, turn_spacing: 10 };
    const saved = { ...DEFAULT_CHAT_DISPLAY_PREFERENCES, profiles: { ...DEFAULT_CHAT_DISPLAY_PREFERENCES.profiles, roleplay: previous } };
    expect(resolveChatDisplayProfile(saved).profile.bubble_corner_radius).toBe(12);
    expect(resolveChatDisplayProfile(saved).profile.turn_spacing).toBe(12);
    saved.profiles.roleplay = { ...previous, bubble_corner_radius: 12 };
    expect(resolveChatDisplayProfile(saved).profile.turn_spacing).toBe(12);
    saved.profiles.roleplay = { ...previous, avatar_size: 72 };
    expect(resolveChatDisplayProfile(saved).profile.bubble_corner_radius).toBe(10);
    expect(resolveChatDisplayProfile(saved).profile.turn_spacing).toBe(10);
  });

  it("uses the official typography even when a saved profile contains retired font overrides", () => {
    const preferences = structuredClone(DEFAULT_CHAT_DISPLAY_PREFERENCES);
    Object.assign(preferences.profiles.roleplay, { message_font_size: 20, message_font_weight: 100 });
    const normalized = normalizeChatDisplaySettings(preferences);
    const { layout, profile } = resolveChatDisplayProfile(normalized);
    const css = chatDisplayCssVariables(layout, profile);
    expect(css['--chat-font-size']).toBe('var(--dsh-content-font-size, 14px)');
    expect(css).not.toHaveProperty('--chat-font-weight');
    expect(css['--dsw-font-markdown-base']).not.toContain('100');
    expect(normalized.profiles.roleplay.avatar_size).toBe(preferences.profiles.roleplay.avatar_size);
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

  it("keeps the display contract free of independent font sizes and weights", () => {
    for (const profile of Object.values(chatDisplayPreferencesSchema.parse(DEFAULT_CHAT_DISPLAY_PREFERENCES).profiles)) {
      expect(profile).not.toHaveProperty('message_font_size');
      expect(profile).not.toHaveProperty('message_font_weight');
    }
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
  });

  it("uses dedicated markup colors while main text follows the app theme", () => {
    expect(DEFAULT_CHAT_DISPLAY_PREFERENCES.text_colors).toEqual({
      italics: "#919191",
      underline: "#bce7cf",
      quote: "#4176e6",
    });
    expect(chatTextColorCssVariables(DEFAULT_CHAT_DISPLAY_PREFERENCES.text_colors)).toEqual({
      "--chat-italics-color": "#919191",
      "--chat-underline-color": "#bce7cf",
      "--chat-quote-color": "#4176e6",
    });
  });
});
