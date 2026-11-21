import { convertLegacySettingReference } from '@shared/foundation/legacySettingReferences'

export function settingJsonObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('设定迁移需要 JSON 对象。')
  return value as Record<string, unknown>
}

export function convertLegacySettingEntryJson(raw: string, key: 'dynamicMode' | 'dynamic_mode'): string {
  const entry = settingJsonObject(JSON.parse(raw))
  const converted = convertLegacySettingReference(entry, key)
  return converted === entry ? raw : JSON.stringify(converted)
}

// RETIRE WHEN: both v18 (or older) SQLite upgrades and conversation archives
// with dynamicMode retire. Remove the v19 and archive decoder calls together.
export function convertLegacySettingState(raw: string): string {
  const rows: unknown = JSON.parse(raw)
  if (!Array.isArray(rows)) throw new Error('设定状态迁移需要 JSON 数组。')
  let changed = false
  const converted = rows.map(value => {
    const row = settingJsonObject(value)
    if (row.targetType !== 'entry' || row.operation !== 'upsert') return row
    if (typeof row.payloadJson !== 'string') throw new Error('设定状态迁移缺少条目正文。')
    const payloadJson = convertLegacySettingEntryJson(row.payloadJson, 'dynamicMode')
    if (payloadJson === row.payloadJson) return row
    changed = true
    return { ...row, payloadJson }
  })
  return changed ? JSON.stringify(converted) : raw
}
