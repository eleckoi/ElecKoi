import {
  getAppearanceMode,
  listenAppearanceModeChanged,
} from "../api/appearanceApi.js";

export const DEFAULT_APPEARANCE_MODE = "light";
export const APPEARANCE_MODES = ["light", "dark", "system"];

export function normalizeAppearanceMode(mode) {
  return APPEARANCE_MODES.includes(mode) ? mode : DEFAULT_APPEARANCE_MODE;
}

export function resolveAppearanceMode(mode) {
  const normalized = normalizeAppearanceMode(mode);
  if (normalized !== "system") return normalized;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyAppearanceMode(mode) {
  const normalized = normalizeAppearanceMode(mode);
  const resolved = resolveAppearanceMode(normalized);
  const root = document.documentElement;

  root.dataset.appearanceMode = normalized;
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;

  return { mode: normalized, resolved };
}

export async function initializeAppearanceMode() {
  let mode = DEFAULT_APPEARANCE_MODE;
  const media = window.matchMedia?.("(prefers-color-scheme: dark)");

  const update = (nextMode) => {
    mode = normalizeAppearanceMode(nextMode);
    applyAppearanceMode(mode);
  };
  const handleSystemAppearanceChange = () => {
    if (mode === "system") applyAppearanceMode(mode);
  };

  media?.addEventListener?.("change", handleSystemAppearanceChange);

  try {
    update(await getAppearanceMode());
  } catch {
    update(DEFAULT_APPEARANCE_MODE);
  }

  let disposeSettings = () => {};
  try {
    disposeSettings = await listenAppearanceModeChanged(update);
  } catch {
    // The active mode is already applied; a future reload will retry the bridge.
  }

  return () => {
    disposeSettings();
    media?.removeEventListener?.("change", handleSystemAppearanceChange);
  };
}
