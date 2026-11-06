import type Database from 'better-sqlite3'
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes'
import { DesktopError } from '@shared/foundation/DesktopError'
import {
  DEFAULT_HIDDEN_TOOL_TIMELINE_CONTENT,
  HIDDEN_TOOL_TIMELINE_ENTRY_ID,
  HIDDEN_TOOL_TIMELINE_PROMPT_POSITION_ID
} from '@shared/contracts/presets/builtIns'

// RETIRE WHEN: 本文件仅供 0004 的旧设定与快照转换使用；随该步骤的升级下限
// 调整一并退役，确认没有其他调用后删除本文件和对应旧格式 fixture。当前设定模型保留。

type Entry = Record<string, unknown>
type Style = 'camel' | 'snake'

const previousHiddenTimelineContent = DEFAULT_HIDDEN_TOOL_TIMELINE_CONTENT
  .replace(/^  reasoning_channel:.*\n/m, '')
const legacyHiddenTimelineContent = previousHiddenTimelineContent
  .replace(/^  mandatory:.*\n/m, '')

function entryObject(raw: string, source: string): Entry {
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { throw new DesktopError(ELECKOI_FAILURE_CODES.storageCorrupt, `设定条目数据已损坏：${source}。`, { what: '设定条目数据' }) }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, `设定条目格式无效：${source}。`, { what: '设定条目' })
  }
  return parsed as Entry
}

function normalizeEntry(raw: string, style: Style, source: string): string {
  const entry = entryObject(raw, source)
  const strategyKey = style === 'camel' ? 'agentReadStrategy' : 'agent_read_strategy'
  const dynamicKey = style === 'camel' ? 'dynamicMode' : 'dynamic_mode'
  const contentKey = style === 'camel' ? 'contentMode' : 'content_mode'
  const triggerKey = style === 'camel' ? 'triggerMode' : 'trigger_mode'
  const originalStrategy = entry[strategyKey]
  const originalDynamic = entry[dynamicKey]
  const strategy = originalStrategy === 'variable_condition' ? 'normal' : originalStrategy
  const dynamic = originalDynamic === 'ejs_controller' ? 'standard' : originalDynamic
  const allowsEjs = strategy !== 'required' && dynamic !== 'ejs_reference' && entry[triggerKey] === 'agent_tool'
  const inferredEjs = originalDynamic === 'ejs_controller' ||
    (typeof entry.content === 'string' && entry.content.includes('<%'))
  const contentMode = allowsEjs && (entry[contentKey] === 'ejs' || inferredEjs) ? 'ejs' : 'plain_text'
  const hiddenTimeline = entry.id === HIDDEN_TOOL_TIMELINE_ENTRY_ID || entry.kind === 'hidden_tool_timeline'
  const entryContent = entry.content
  const oldDefaultContent = typeof entryContent === 'string'
    && [previousHiddenTimelineContent, legacyHiddenTimelineContent]
      .some((content) => entryContent.trim().replace(/\r\n/g, '\n') === content.trim())
  const content = hiddenTimeline && oldDefaultContent ? DEFAULT_HIDDEN_TOOL_TIMELINE_CONTENT : entryContent
  const position = hiddenTimeline && entry.promptPositionId === HIDDEN_TOOL_TIMELINE_PROMPT_POSITION_ID
    && entry.position === 'insert_point_4' ? 'insert_point_5' : entry.position
  if (entry[strategyKey] === strategy && entry[dynamicKey] === dynamic && entry[contentKey] === contentMode
    && entry.content === content && entry.position === position) return raw
  entry[strategyKey] = strategy
  entry[dynamicKey] = dynamic
  entry[contentKey] = contentMode
  entry.content = content
  entry.position = position
  return JSON.stringify(entry)
}

function normalizeRows(database: Database.Database, table: string, style: Style): void {
  const rows = database.prepare(`SELECT rowid, payloadJson FROM ${table}`).all() as Array<{ rowid: number; payloadJson: string }>
  const update = database.prepare(`UPDATE ${table} SET payloadJson = ? WHERE rowid = ?`)
  for (const row of rows) {
    const next = normalizeEntry(row.payloadJson, style, `${table}/${row.rowid}`)
    if (next !== row.payloadJson) update.run(next, row.rowid)
  }
}

function normalizeSnapshots(database: Database.Database): void {
  const rows = database.prepare('SELECT rowid,stateJson FROM agent_setting_snapshots').all() as Array<{
    rowid: number; stateJson: string
  }>
  const update = database.prepare('UPDATE agent_setting_snapshots SET stateJson = ? WHERE rowid = ?')
  for (const row of rows) {
    let state: unknown
    try { state = JSON.parse(row.stateJson) } catch { throw new DesktopError(ELECKOI_FAILURE_CODES.storageCorrupt, `设定快照数据已损坏：${row.rowid}。`, { what: '设定快照数据' }) }
    if (!Array.isArray(state)) throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, `设定快照格式无效：${row.rowid}。`, { what: '设定快照' })
    let changed = false
    const next = state.map((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return item
      const change = item as Entry
      if (change.targetType !== 'entry' || change.operation !== 'upsert') return item
      if (typeof change.payloadJson !== 'string') throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, `设定快照条目格式无效：${row.rowid}/${index}。`, { what: '设定快照条目' })
      const payloadJson = normalizeEntry(change.payloadJson, 'camel', `agent_setting_snapshots/${row.rowid}/${index}`)
      if (payloadJson === change.payloadJson) return item
      changed = true
      return { ...change, payloadJson }
    })
    if (changed) update.run(JSON.stringify(next), row.rowid)
  }
}

function normalizePromptPositionRows(database: Database.Database, table: string): void {
  const rows = database.prepare(`SELECT rowid,content FROM ${table} WHERE kind='prompt_positions'`)
    .all() as Array<{ rowid: number; content: string }>
  const update = database.prepare(`UPDATE ${table} SET content = ? WHERE rowid = ?`)
  for (const row of rows) {
    let parsed: unknown
    try { parsed = JSON.parse(row.content) } catch { throw new DesktopError(ELECKOI_FAILURE_CODES.storageCorrupt, `提示词位置数据已损坏：${table}/${row.rowid}。`, { what: '提示词位置数据' }) }
    if (!Array.isArray(parsed)) throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, `提示词位置格式无效：${table}/${row.rowid}。`, { what: '提示词位置' })
    let changed = false
    const positions = parsed.map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return item
      const position = item as Entry
      if (position.id !== HIDDEN_TOOL_TIMELINE_PROMPT_POSITION_ID
        || position.anchor !== 'insert_point_4'
        || position.side !== 'before_setting_position') return item
      changed = true
      return { ...position, anchor: 'insert_point_5', side: 'after_setting_position' }
    })
    if (changed) update.run(JSON.stringify(positions), row.rowid)
  }
}

/** Consolidate existing development databases into the current setting-entry format. */
export function normalizeSettingEntryFormat(database: Database.Database): void {
  normalizeRows(database, 'setting_entry_contents', 'snake')
  normalizeRows(database, 'agent_preset_entries', 'camel')
  normalizeRows(database, 'agent_preset_version_entries', 'camel')
  normalizePromptPositionRows(database, 'agent_preset_contents')
  normalizePromptPositionRows(database, 'agent_preset_version_contents')
  const changes = database.prepare("SELECT rowid,payloadJson FROM conversation_setting_changes WHERE targetType='entry' AND operation='upsert'")
    .all() as Array<{ rowid: number; payloadJson: string }>
  const updateChange = database.prepare('UPDATE conversation_setting_changes SET payloadJson = ? WHERE rowid = ?')
  for (const row of changes) {
    const next = normalizeEntry(row.payloadJson, 'camel', `conversation_setting_changes/${row.rowid}`)
    if (next !== row.payloadJson) updateChange.run(next, row.rowid)
  }
  normalizeSnapshots(database)
}
