import { DEFAULT_CHAT_TEXT_COLORS } from "@shared/contracts/settings/schemas";

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
  return {
    layout,
    profile: preferences?.profiles?.[layout] || preferences?.profiles?.roleplay,
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
  const fontSize = clamp(profile.message_font_size, 9, 20);
  const nameSize = clamp(profile.name_font_size, 10, 18);
  const baseLineHeightRatio = layout === "roleplay" ? 23 / 15 : 1.4;

  return {
    "--chat-avatar-width": `${avatarWidth}px`,
    "--chat-avatar-height": `${avatarHeight}px`,
    "--chat-avatar-radius": `${avatarRadius}px`,
    "--chat-avatar-gap": `${clamp(profile.name_avatar_spacing, 0, 20)}px`,
    "--chat-horizontal-padding": `${clamp(profile.horizontal_padding, 0, 32)}px`,
    "--chat-reply-gap": `${clamp(profile.reply_spacing, 0, 32)}px`,
    "--chat-turn-gap": `${clamp(profile.turn_spacing, 0, 32)}px`,
    "--chat-font-size": `${fontSize}px`,
    "--chat-line-height": `${fontSize * baseLineHeightRatio * clamp(profile.line_height_multiplier, 0.8, 1.6)}px`,
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
