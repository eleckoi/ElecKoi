import type Database from 'better-sqlite3'
import { convertLegacySettingReference } from '@shared/foundation/legacySettingReferences'
import { convertLegacySettingEntryJson, convertLegacySettingState, settingJsonObject } from '@product-data/domain/settingLibraries/legacySettingState'
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes'
import { DesktopError } from '@shared/foundation/DesktopError'

function convertGlobalLibrary(raw: string): string {
  const library = settingJsonObject(JSON.parse(raw))
  if (!Array.isArray(library.entries)) throw new Error('全局设定库迁移缺少条目列表。')
  let changed = false
  const entries = library.entries.map(value => {
    const entry = settingJsonObject(value)
    const converted = convertLegacySettingReference(entry, 'dynamicMode')
    changed ||= entry !== converted
    return converted
  })
  return changed ? JSON.stringify({ ...library, entries }) : raw
}

function rewrite(database: Database.Database, table: string, column: string, convert: (raw: string) => string, where = '') {
  const rows = database.prepare(`SELECT rowid, ${column} AS value FROM ${table} ${where}`).all() as { rowid: number; value: string }[]
  const update = database.prepare(`UPDATE ${table} SET ${column}=? WHERE rowid=?`)
  for (const row of rows) {
    let value: string
    try {
      value = convert(row.value)
    } catch (cause) {
      throw new DesktopError(ELECKOI_FAILURE_CODES.storageCorrupt,
        `旧设定无法迁移（${table}/${row.rowid}）：${String(cause)}`, { what: '旧设定数据' })
    }
    if (value !== row.value) update.run(value, row.rowid)
  }
}

// RETIRE WHEN: direct upgrades from v18 and earlier are no longer supported.
// Remove the step, registration and upgrade/rollback tests together. Keep
// the shared conversion helpers while historical file imports use them.
export const migration0019 = {
  fromVersion: 18, toVersion: 19, name: 'setting-references', acceptedBaselines: [] as const,
  apply(database: Database.Database): void {
    rewrite(database, 'setting_entry_contents', 'payloadJson', raw => convertLegacySettingEntryJson(raw, 'dynamic_mode'))
    const camelEntry = (raw: string) => convertLegacySettingEntryJson(raw, 'dynamicMode')
    rewrite(database, 'agent_preset_entries', 'payloadJson', camelEntry)
    rewrite(database, 'agent_preset_version_entries', 'payloadJson', camelEntry)
    rewrite(database, 'conversation_setting_changes', 'payloadJson', camelEntry, "WHERE targetType='entry' AND operation='upsert'")
    rewrite(database, 'global_setting_libraries', 'configurationJson', convertGlobalLibrary)
    rewrite(database, 'conversation_state_snapshots', 'settingLibraryStateJson', convertLegacySettingState, 'WHERE settingLibraryStateJson IS NOT NULL')
  }
} as const
