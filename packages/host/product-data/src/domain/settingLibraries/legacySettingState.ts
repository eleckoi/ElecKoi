import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes'
import { DesktopError } from '@shared/foundation/DesktopError'
import { convertLegacySettingReference } from '@shared/foundation/legacySettingReferences'

export function settingJsonObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, '设定迁移需要 JSON 对象。', { what: '旧设定数据' })
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
  if (!Array.isArray(rows)) throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, '设定状态迁移需要 JSON 数组。', { what: '旧设定状态' })
  let changed = false
  const converted = rows.map(value => {
    const row = settingJsonObject(value)
    if (row.targetType !== 'entry' || row.operation !== 'upsert') return row
    if (typeof row.payloadJson !== 'string') throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, '设定状态迁移缺少条目正文。', { what: '旧设定条目正文' })
    const payloadJson = convertLegacySettingEntryJson(row.payloadJson, 'dynamicMode')
    if (payloadJson === row.payloadJson) return row
    changed = true
    return { ...row, payloadJson }
  })
  return changed ? JSON.stringify(converted) : raw
}
