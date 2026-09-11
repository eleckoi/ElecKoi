export const DEFAULT_SIDEBAR_CHARACTER_ARTWORK = "cover";

export function normalizeSidebarCharacterArtwork(value) {
  return value === "avatar" ? "avatar" : DEFAULT_SIDEBAR_CHARACTER_ARTWORK;
}
