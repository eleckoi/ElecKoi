export const LIST_COLLAPSE_AREAS = Object.freeze({
  characters: 'characters',
  presets: 'presets',
  models: 'models',
});

export function normalizeCollapsedGroups(value, defaults = {}, validKeys) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const allowed = validKeys ? new Set(validKeys) : null;
  return Object.fromEntries(
    Object.entries({ ...defaults, ...source })
      .filter(([key, collapsed]) => typeof collapsed === 'boolean' && (!allowed || allowed.has(key))),
  );
}
