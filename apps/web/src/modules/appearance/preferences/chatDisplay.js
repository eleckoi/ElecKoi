import { DEFAULT_CHAT_DISPLAY_PREFERENCES, DEFAULT_CHAT_TEXT_COLORS, DEFAULT_ROLEPLAY_STYLE } from "@shared/contracts/settings/schemas";

export function resolveRoleplayStyle(preferences) {
  return { ...DEFAULT_ROLEPLAY_STYLE, ...preferences?.roleplay_style };
}

export function roleplayStyleDefaultTint(kind, dark) {
  return kind === 'backdrop' ? (dark ? '#1b1f27' : '#f9fafc') : (dark ? '#12171f' : '#ffffff');
}

export function roleplayStyleCssVariables(style) {
  const value = { ...DEFAULT_ROLEPLAY_STYLE, ...style };
  const themeTint = kind => `light-dark(${roleplayStyleDefaultTint(kind, false)}, ${roleplayStyleDefaultTint(kind, true)})`;
  return {
    '--rp-backdrop-blur': `${value.backdrop_blur}px`,
    '--rp-backdrop-tint': value.backdrop_tint || themeTint('backdrop'),
    '--rp-backdrop-opacity': `${value.backdrop_opacity}%`,
    '--rp-bubble-blur': `${value.bubble_blur}px`,
    '--rp-user-tint': value.user_bubble_tint || themeTint('bubble'),
    '--rp-assistant-tint': value.assistant_bubble_tint || themeTint('bubble'),
    '--rp-user-opacity': `${value.user_bubble_opacity}%`,
    '--rp-assistant-opacity': `${value.assistant_bubble_opacity}%`,
  };
}

const previousAgentDefaults = {
  assistant_bubble_enabled: false,
  bubble_corner_radius: 12,
  avatar_size: 34.5,
  avatar_shape: "circle",
  name_font_size: 13,
  name_avatar_spacing: 8,
  horizontal_padding: 16,
  reply_spacing: 15,
  turn_spacing: 15,
  line_height_multiplier: 1,
  letter_spacing: 0,
  paragraph_spacing: 6,
};

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(Number(value), minimum), maximum);
}

export function chatTextColorCssVariables(colors) {
  const resolved = colors || DEFAULT_CHAT_TEXT_COLORS;
  return {
    "--chat-italics-color": resolved.italics || DEFAULT_CHAT_TEXT_COLORS.italics,
    "--chat-underline-color": resolved.underline || DEFAULT_CHAT_TEXT_COLORS.underline,
    "--chat-quote-color": resolved.quote || DEFAULT_CHAT_TEXT_COLORS.quote,
  };
}

export function resolveChatAvatarShape(layout, shape) {
  return shape === "portrait" && layout !== "roleplay" ? "circle" : shape;
}

export function resolveChatDisplayProfile(preferences) {
  const layout = preferences?.layout || "roleplay";
  const savedProfile = preferences?.profiles?.[layout] || preferences?.profiles?.roleplay;
  const agentUsesPreviousDefaults = layout === "agent" && savedProfile
    && Object.entries(previousAgentDefaults).every(([key, value]) => savedProfile[key] === value);
  const roleplayUsesPreviousDefaults = layout === 'roleplay' && savedProfile
    && Object.entries(DEFAULT_CHAT_DISPLAY_PREFERENCES.profiles.roleplay)
      .every(([key, value]) => key === 'bubble_corner_radius' ? [10, 12].includes(savedProfile[key])
        : savedProfile[key] === (key === 'turn_spacing' ? 10 : value));
  return {
    layout,
    profile: agentUsesPreviousDefaults || roleplayUsesPreviousDefaults ? DEFAULT_CHAT_DISPLAY_PREFERENCES.profiles[layout] : savedProfile,
  };
}

export function chatDisplayCssVariables(layout, profile) {
  if (!profile) return {};
  const avatarShape = resolveChatAvatarShape(layout, profile.avatar_shape);
  const avatarWidth = clamp(profile.avatar_size, 24, 96);
  const avatarHeight = avatarShape === "portrait" ? avatarWidth / 0.75 : avatarWidth;
  const avatarRadius = avatarShape === "circle"
    ? avatarWidth / 2
    : avatarShape === "rounded_square"
      ? avatarWidth * 0.28
      : avatarWidth * 0.14;
  const nameSize = clamp(profile.name_font_size, 10, 18);
  const fontSize = 'var(--dsh-content-font-size, 14px)';
  const lineHeight = `calc((24px + var(--dsh-content-font-delta, 0px)) * ${clamp(profile.line_height_multiplier, 0.8, 1.6)})`;

  return {
    "--chat-avatar-width": `${avatarWidth}px`,
    "--chat-avatar-height": `${avatarHeight}px`,
    "--chat-avatar-radius": `${avatarRadius}px`,
    "--chat-avatar-gap": `${clamp(profile.name_avatar_spacing, 0, 20)}px`,
    "--chat-horizontal-padding": `${clamp(profile.horizontal_padding, 0, 32)}px`,
    "--chat-reply-gap": `${clamp(profile.reply_spacing, 0, 32)}px`,
    "--chat-turn-gap": `${clamp(profile.turn_spacing, 0, 32)}px`,
    "--chat-font-size": fontSize,
    "--chat-line-height": lineHeight,
    "--dsw-font-markdown-base": `${fontSize}/${lineHeight} var(--dsw-font-family)`,
    "--chat-letter-spacing": `${clamp(profile.letter_spacing, -1, 4)}px`,
    "--chat-paragraph-gap": `${clamp(profile.paragraph_spacing, 0, 24)}px`,
    "--chat-name-size": `${nameSize}px`,
    "--chat-name-line-height": `${Math.max(16, nameSize * 1.35)}px`,
    "--chat-bubble-radius": `${clamp(profile.bubble_corner_radius, 0, 24)}px`,
  };
}

export function resolveChatAvatar(persona, role, shape) {
  const prefix = role === "user" ? "user" : "assistant";
  if (shape === "portrait") {
    return persona?.[`${prefix}_${role === "user" ? "portrait" : "cover"}`]
      || persona?.[`${prefix}_square`]
      || persona?.[`${prefix}_avatar`]
      || "";
  }
  if (shape === "rounded_square") {
    return persona?.[`${prefix}_square`] || persona?.[`${prefix}_avatar`] || "";
  }
  return persona?.[`${prefix}_avatar`] || persona?.[`${prefix}_square`] || "";
}

export function messageFloorNumber(messages, index) {
  const known = (position) => {
    const value = messages[position]?.messageIndex;
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  };
  const exact = known(index);
  if (exact !== null) return exact;
  for (let position = index - 1; position >= 0; position -= 1) {
    const floor = known(position);
    if (floor !== null) return floor + index - position;
  }
  for (let position = index + 1; position < messages.length; position += 1) {
    const floor = known(position);
    if (floor !== null) return Math.max(0, floor - position + index);
  }
  return index;
}
