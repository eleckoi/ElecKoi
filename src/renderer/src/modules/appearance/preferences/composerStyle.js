export const DEFAULT_COMPOSER_STYLE = "glass";

export function normalizeComposerStyle(value) {
  return value === "standard" ? "standard" : DEFAULT_COMPOSER_STYLE;
}
