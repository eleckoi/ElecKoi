// RETIRE WHEN: v18 and earlier SQLite upgrades and files with dynamic mode
// are no longer supported. Remove the migration/import calls and fixtures.
export function convertLegacySettingReference(entry: Record<string, unknown>, key: 'dynamicMode' | 'dynamic_mode') {
  if (!Object.hasOwn(entry, key)) return entry
  const { [key]: legacyMode, ...current } = entry
  return legacyMode === 'ejs_reference' ? { ...current, enabled: false } : current
}
