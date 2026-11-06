import type Database from 'better-sqlite3'
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes'
import { DesktopError } from '@shared/foundation/DesktopError'

type JsonObject = Record<string, unknown>
type EntryStyle = 'camel' | 'snake'

interface Placement {
  anchor: string
  side: 'before_setting_position' | 'after_setting_position'
}

const CURRENT_POSITIONS = new Set([
  'instructions',
  'insert_point_1',
  'insert_point_2',
  'insert_point_3',
  'insert_point_4',
  'insert_point_5'
])

const LEGACY_PLACEMENTS = new Map<string, Placement>([
  ['after_instructions', { anchor: 'insert_point_1', side: 'before_setting_position' }],
  ['before_history', { anchor: 'insert_point_2', side: 'before_setting_position' }],
  ['after_history', { anchor: 'insert_point_3', side: 'before_setting_position' }],
  ['before_latest_user_input', { anchor: 'insert_point_3', side: 'after_setting_position' }],
  ['after_latest_user_input', { anchor: 'insert_point_4', side: 'before_setting_position' }],
  ['before_tool_flow', { anchor: 'insert_point_4', side: 'after_setting_position' }],
  ['after_tool_flow', { anchor: 'insert_point_5', side: 'after_setting_position' }]
])

const VALID_SIDES = new Set(['before_setting_position', 'after_setting_position'])
const HIDDEN_TIMELINE_ENTRY_ID = 'built-in-hidden-tool-timeline'
const HIDDEN_TIMELINE_ENTRY_KIND = 'hidden_tool_timeline'
const HIDDEN_TIMELINE_POSITION_ID = 'hidden-tool-timeline'

/**
 * RETIRE WHEN: 停止支持所有低于 schema v3 的数据库直接升级后，移除此步骤、
 * installSchema 登记和对应旧库 fixture；只完成某次 v2 升级不能删除该步骤。
 */
export const migration0003 = {
  fromVersion: 2,
  toVersion: 3,
  name: 'setting-placements',
  acceptedBaselines: ['eleckoi-common-v1-2026-09-14-runtime-clean'] as const,
  apply(database: Database.Database): void {
    migrateEntryRows(database, 'setting_entry_contents', 'snake')
    migratePromptPositionColumn(database, 'setting_libraries', 'promptPositionsJson', false)
    migratePromptPositionColumn(database, 'setting_library_versions', 'promptPositionsJson', false)

    migrateEntryRows(database, 'agent_preset_entries', 'camel')
    migrateEntryRows(database, 'agent_preset_version_entries', 'camel')
    migratePresetPromptPositions(database, 'agent_preset_contents')
    migratePresetPromptPositions(database, 'agent_preset_version_contents')

    migrateConversationChanges(database)
    migrateSettingStateSnapshots(database)
  }
} as const

function migrateEntryRows(database: Database.Database, table: string, style: EntryStyle): void {
  const rows = database.prepare(`SELECT rowid, entryId, payloadJson FROM ${table}`).all() as Array<{
    rowid: number
    entryId: string
    payloadJson: string
  }>
  const update = database.prepare(`UPDATE ${table} SET payloadJson = ? WHERE rowid = ?`)
  for (const row of rows) {
    const next = migrateEntry(row.payloadJson, style, row.entryId, `${table}/${row.entryId}`)
    if (next !== row.payloadJson) update.run(next, row.rowid)
  }
}

function migratePromptPositionColumn(
  database: Database.Database,
  table: string,
  column: string,
  includeHiddenTimeline: boolean
): void {
  const rows = database.prepare(`SELECT rowid, ${column} AS value FROM ${table}`).all() as Array<{
    rowid: number
    value: string
  }>
  const update = database.prepare(`UPDATE ${table} SET ${column} = ? WHERE rowid = ?`)
  for (const row of rows) {
    const next = migratePromptPositions(row.value, 'snake', includeHiddenTimeline, `${table}/${row.rowid}`)
    if (next !== row.value) update.run(next, row.rowid)
  }
}

function migratePresetPromptPositions(database: Database.Database, table: string): void {
  const rows = database.prepare(`SELECT rowid, content FROM ${table} WHERE kind = 'prompt_positions'`).all() as Array<{
    rowid: number
    content: string
  }>
  const update = database.prepare(`UPDATE ${table} SET content = ? WHERE rowid = ?`)
  for (const row of rows) {
    const next = migratePromptPositions(row.content, 'camel', true, `${table}/${row.rowid}`)
    if (next !== row.content) update.run(next, row.rowid)
  }
}

function migrateConversationChanges(database: Database.Database): void {
  const rows = database.prepare(`SELECT rowid, targetId, payloadJson FROM conversation_setting_changes
    WHERE targetType = 'entry' AND operation = 'upsert'`).all() as Array<{
    rowid: number
    targetId: string
    payloadJson: string
  }>
  const update = database.prepare('UPDATE conversation_setting_changes SET payloadJson = ? WHERE rowid = ?')
  for (const row of rows) {
    const next = migrateEntry(row.payloadJson, 'camel', row.targetId, `conversation_setting_changes/${row.targetId}`)
    if (next !== row.payloadJson) update.run(next, row.rowid)
  }
}

function migrateSettingStateSnapshots(database: Database.Database): void {
  const rows = database.prepare(`SELECT rowid, payloadJson FROM agent_content_parts
    WHERE kind = 'setting_library_state'`).all() as Array<{ rowid: number; payloadJson: string }>
  const update = database.prepare('UPDATE agent_content_parts SET payloadJson = ? WHERE rowid = ?')
  for (const row of rows) {
    const value = jsonArray(row.payloadJson, `agent_content_parts/${row.rowid}`)
    let changed = false
    const migrated = value.map((item, index) => {
      const record = jsonObject(item, `agent_content_parts/${row.rowid}/${index}`)
      if (record.targetType !== 'entry' || record.operation !== 'upsert') return record
      if (typeof record.targetId !== 'string' || typeof record.payloadJson !== 'string') {
        throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, `对话设定状态快照格式无效：agent_content_parts/${row.rowid}/${index}。`, { what: '对话设定状态快照' })
      }
      const payloadJson = migrateEntry(
        record.payloadJson,
        'camel',
        record.targetId,
        `agent_content_parts/${row.rowid}/${index}`
      )
      if (payloadJson === record.payloadJson) return record
      changed = true
      return { ...record, payloadJson }
    })
    if (changed) update.run(JSON.stringify(migrated), row.rowid)
  }
}

function migrateEntry(raw: string, style: EntryStyle, entryId: string, label: string): string {
  const value = jsonObject(json(raw, label), label)
  const positionKey = style === 'camel' ? 'position' : 'position'
  const promptPositionKey = style === 'camel' ? 'promptPositionId' : 'prompt_position_id'
  const id = typeof value.id === 'string' ? value.id : entryId
  const hiddenTimeline = id === HIDDEN_TIMELINE_ENTRY_ID || value.kind === HIDDEN_TIMELINE_ENTRY_KIND
  let changed = false

  if (hiddenTimeline) {
    if (value[positionKey] !== 'insert_point_4') {
      value[positionKey] = 'insert_point_4'
      changed = true
    }
    if (value[promptPositionKey] !== HIDDEN_TIMELINE_POSITION_ID) {
      value[promptPositionKey] = HIDDEN_TIMELINE_POSITION_ID
      changed = true
    }
  } else {
    const position = value[positionKey]
    if (position !== undefined && position !== null && position !== '') {
      if (typeof position !== 'string') throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, `设定位置格式无效：${label}。`, { what: '设定位置' })
      const placement = LEGACY_PLACEMENTS.get(position)
      if (placement) {
        value[positionKey] = placement.anchor
        changed = true
      } else if (!CURRENT_POSITIONS.has(position)) {
        throw new DesktopError(ELECKOI_FAILURE_CODES.dataLegacyMismatch, `无法识别设定位置“${position}”：${label}。`, { what: '设定位置' })
      }
    }
  }
  return changed ? JSON.stringify(value) : raw
}

function migratePromptPositions(
  raw: string,
  style: EntryStyle,
  includeHiddenTimeline: boolean,
  label: string
): string {
  const value = jsonArray(raw, label)
  const createdAtKey = style === 'camel' ? 'createdAt' : 'created_at'
  const updatedAtKey = style === 'camel' ? 'updatedAt' : 'updated_at'
  let changed = false
  const positions = value.map((item, index) => {
    const position = jsonObject(item, `${label}/${index}`)
    const legacy = typeof position.anchor === 'string' ? LEGACY_PLACEMENTS.get(position.anchor) : undefined
    if (legacy) {
      position.anchor = legacy.anchor
      position.side = legacy.side
      changed = true
    } else {
      if (typeof position.anchor !== 'string' || !CURRENT_POSITIONS.has(position.anchor)) {
        throw new DesktopError(ELECKOI_FAILURE_CODES.dataLegacyMismatch, `无法识别提示词位置：${label}/${index}。`, { what: '提示词位置' })
      }
      if (position.side === undefined || position.side === '') {
        position.side = 'before_setting_position'
        changed = true
      } else if (typeof position.side !== 'string' || !VALID_SIDES.has(position.side)) {
        throw new DesktopError(ELECKOI_FAILURE_CODES.dataLegacyMismatch, `无法识别提示词位置方向：${label}/${index}。`, { what: '提示词位置方向' })
      }
    }
    if (includeHiddenTimeline && position.id === HIDDEN_TIMELINE_POSITION_ID) {
      if (position.anchor !== 'insert_point_4' || position.side !== 'before_setting_position') changed = true
      position.anchor = 'insert_point_4'
      position.side = 'before_setting_position'
    }
    return position
  })

  if (includeHiddenTimeline && !positions.some((position) => position.id === HIDDEN_TIMELINE_POSITION_ID)) {
    const timestamp = new Date().toISOString()
    positions.push({
      id: HIDDEN_TIMELINE_POSITION_ID,
      name: '隐藏工具时间线',
      anchor: 'insert_point_4',
      side: 'before_setting_position',
      order: positions.length + 1,
      [createdAtKey]: timestamp,
      [updatedAtKey]: timestamp
    })
    changed = true
  }
  return changed ? JSON.stringify(positions) : raw
}

function json(raw: string, label: string): unknown {
  try {
    return JSON.parse(raw) as unknown
  } catch {
    throw new DesktopError(ELECKOI_FAILURE_CODES.storageCorrupt, `数据库 JSON 已损坏：${label}。`, { what: '数据库 JSON' })
  }
}

function jsonObject(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, `数据库对象格式无效：${label}。`, { what: '数据库对象' })
  }
  return value as JsonObject
}

function jsonArray(raw: string, label: string): unknown[] {
  const value = json(raw, label)
  if (!Array.isArray(value)) throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, `数据库数组格式无效：${label}。`, { what: '数据库数组' })
  return value
}
