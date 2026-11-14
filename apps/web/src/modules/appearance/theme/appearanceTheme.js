const THEME_VARIABLES = [
  "--title-fg", "--title-logo-filter", "--shell-backdrop", "--rail", "--rail-fg", "--list",
  "--chat", "--active", "--blue", "--blue-hover", "--control-bg", "--control-bg-hover",
  "--bubble-bg", "--bubble-fg", "--bubble-fg-shadow", "--bubble-blue", "--bubble-white",
  "--glass-border", "--chat-header-fg",
  "--chat-header-fg-shadow", "--composer-icon-fg", "--composer-icon-shadow",
];

const DEFAULT_THEME = {
  titleFg: "#111111", titleLogoFilter: "none", shellBackdrop: "#ffffff", rail: "#f0f3f6",
  railFg: "#252525", list: "#f0f3f6", chat: "#ffffff", active: "rgba(38, 49, 72, 0.06)",
  blue: "#13a8ff", blueHover: "#079cf0", controlBg: "#ebebeb", controlBgHover: "#e2e2e2",
  bubbleBg: "#ffffff", bubbleFg: "#181818", bubbleFgShadow: "rgba(255, 255, 255, 0.18)",
  bubbleBlue: "#cdeeff", bubbleWhite: "#ffffff", glassBorder: "rgba(255, 255, 255, 0.62)",
  chatHeaderFg: "#111111", chatHeaderFgShadow: "rgba(255, 255, 255, 0.22)",
  composerIconFg: "#111111", composerIconShadow: "rgba(255, 255, 255, 0.22)",
};

export function applyAppearanceTheme(theme) {
  const root = document.documentElement;
  if (!theme?.colors) {
    for (const name of THEME_VARIABLES) root.style.removeProperty(name);
    return;
  }
  const colors = { ...DEFAULT_THEME, ...theme.colors };
  const values = {
    "--title-fg": colors.titleFg, "--title-logo-filter": colors.titleLogoFilter,
    "--shell-backdrop": colors.shellBackdrop, "--rail": colors.rail, "--rail-fg": colors.railFg,
    "--list": colors.list, "--chat": colors.chat, "--active": colors.active, "--blue": colors.blue,
    "--blue-hover": colors.blueHover, "--control-bg": colors.controlBg, "--control-bg-hover": colors.controlBgHover,
    "--bubble-bg": colors.bubbleBg, "--bubble-fg": colors.bubbleFg,
    "--bubble-fg-shadow": colors.bubbleFgShadow, "--bubble-blue": colors.bubbleBlue,
    "--bubble-white": colors.bubbleWhite, "--glass-border": colors.glassBorder,
    "--chat-header-fg": colors.chatHeaderFg, "--chat-header-fg-shadow": colors.chatHeaderFgShadow,
    "--composer-icon-fg": colors.composerIconFg, "--composer-icon-shadow": colors.composerIconShadow,
  };
  for (const [name, value] of Object.entries(values)) root.style.setProperty(name, value);
}
