import type Database from 'better-sqlite3'
import { dirname } from 'node:path'
import {
  HIDDEN_TOOL_TIMELINE_ENTRY_ID,
  HIDDEN_TOOL_TIMELINE_PROMPT_POSITION_ID,
  withRequiredAgentPresetPromptPositions
} from '@shared/contracts/presets/builtIns'
import type { SettingLibraryPromptPosition } from '@shared/contracts/settingLibrary/schemas'
import { HiddenToolTimelineFile, readOptionalPromptFile, replacePromptFile } from '../../../HiddenToolTimelineFile'
import { hiddenTimelineSettingsPath, hiddenTimelineSettingsSchema, isHiddenToolTimelinePosition, type HiddenToolTimelineSettingsRecords } from '../../../domain/agentPresets/HiddenToolTimelineSettings'

// RETIRE WHEN: 支持的旧安装与数据库恢复入口都已迁出本条目的旧字段。
// 正式停止支持仍在 SQLite 保存这些字段的版本后，移除此入口、数据库打开阶段的调用和专项回归。
// 仅在设置文件尚未完成搬迁时执行，转存当前位置和历史版本位置，清除 SQLite 中的旧字段。
// 退役时改由设置文件事务加载启动快照。
export function prepareHiddenToolTimelineFiles(database: Database.Database): HiddenToolTimelineSettingsRecords | undefined {
  if (database.memory) return
  const directory = dirname(database.name)
  const settingsPath = hiddenTimelineSettingsPath(directory)
  const stored = readOptionalPromptFile(settingsPath)
  const settings = stored === undefined ? { records: {} } : hiddenTimelineSettingsSchema.parse(JSON.parse(stored))
  if (stored !== undefined && !('migrationPending' in settings)) return settings.records
  new HiddenToolTimelineFile(directory).read()
  const records = settings.records
  const updates: Array<() => void> = []
  for (const versioned of [false, true]) {
    const entries = versioned ? 'agent_preset_version_entries' : 'agent_preset_entries'
    const contents = versioned ? 'agent_preset_version_contents' : 'agent_preset_contents'
    const rows = database.prepare(`SELECT e.rowid AS entryRow, e.presetId, ${versioned ? 'e.versionId' : "''"} AS versionId,
        e.payloadJson, c.rowid AS positionRow, c.content AS positions
      FROM ${entries} e JOIN agent_presets p ON p.id=e.presetId
      LEFT JOIN ${contents} c ON c.presetId=e.presetId AND c.kind='prompt_positions' ${versioned ? 'AND c.versionId=e.versionId' : ''}
      WHERE p.purpose='roleplay' AND (e.entryId=? OR json_extract(e.payloadJson, '$.kind')='hidden_tool_timeline')`)
      .all(HIDDEN_TOOL_TIMELINE_ENTRY_ID) as Array<{ entryRow: number; presetId: string; versionId: string; payloadJson: string; positionRow: number | null; positions: string | null }>
    const cleanEntry = database.prepare(`UPDATE ${entries}
      SET payloadJson=json_remove(payloadJson,'$.content','$.enabled','$.position','$.promptPositionId') WHERE rowid=?`)
    const cleanPositions = database.prepare(`UPDATE ${contents} SET content=? WHERE rowid=?`)
    for (const row of rows) {
      const entry = JSON.parse(row.payloadJson)
      const positions: SettingLibraryPromptPosition[] = row.positions === null ? [] : JSON.parse(row.positions)
      const slot = withRequiredAgentPresetPromptPositions(positions).find(isHiddenToolTimelinePosition)!
      records[row.presetId] ??= {}
      records[row.presetId]![row.versionId] ??= {
        entry: {
          position: entry.position === undefined ? slot.anchor : entry.position,
          promptPositionId: entry.promptPositionId ?? HIDDEN_TOOL_TIMELINE_PROMPT_POSITION_ID
        },
        slot
      }
      updates.push(() => { cleanEntry.run(row.entryRow) })
      if (row.positionRow !== null && positions.some(isHiddenToolTimelinePosition)) {
        updates.push(() => { cleanPositions.run(JSON.stringify(positions.filter(position => !isHiddenToolTimelinePosition(position))), row.positionRow) })
      }
    }
  }
  const validated = hiddenTimelineSettingsSchema.parse({ records, migrationPending: true })
  replacePromptFile(settingsPath, JSON.stringify(validated, null, 2))
  database.transaction(() => updates.forEach(update => update())).immediate()
  replacePromptFile(settingsPath, JSON.stringify({ records }, null, 2))
  return validated.records
}
