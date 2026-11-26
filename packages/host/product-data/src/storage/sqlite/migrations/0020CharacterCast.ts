import type Database from 'better-sqlite3'
import { commonSchemaSql } from './commonSchemaSql'
import { ROLEPLAY_REPLY_GROUP_ID } from '@shared/contracts/agent/tools'
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes'
import { HIDDEN_TOOL_TIMELINE_ENTRY_ID } from '@shared/contracts/presets/builtIns'
import { DesktopError } from '@shared/foundation/DesktopError'
import { upgradeFinalReplyEntry, upgradeFinalReplyPlan, upgradeFinalReplyPosition } from '../../../domain/agentPresets/upgradeFinalRoleplayPreset'

// RETIRE WHEN: 停止支持 v19 及更早版本直接升级，且受支持数据库的
// pendingLegacyMedia 全为 0。此步补角色名册，并更新已发布版的角色预设，不写聊天。
// 届时删除本步骤、installSchema 注册和旧表结构分支及 v19 升级专项测试。
export const migration0020 = {
  fromVersion: 19, toVersion: 20, name: 'character-cast', acceptedBaselines: [] as const,
  apply(database: Database.Database): void {
    const tableSql = commonSchemaSql.match(/^CREATE TABLE IF NOT EXISTS `character_cast_members` .*;$/m)
    if (!tableSql) {
      throw new DesktopError(ELECKOI_FAILURE_CODES.dbSchemaMismatch, 'Missing canonical schema for character_cast_members', {
        what: '登场角色表', expected: 'CREATE TABLE character_cast_members'
      })
    }
    database.exec(tableSql[0])
    database.exec(`
      INSERT INTO character_cast_members (characterId, id, name, sortIndex, pendingLegacyMedia)
      SELECT id, 'primary', COALESCE(NULLIF(TRIM(assistantName), ''), NULLIF(TRIM(name), ''), '未命名角色'), 0, 1
      FROM characters
    `)
    upgradePublishedRoleplayPresets(database)
  }
} as const

function upgradePublishedRoleplayPresets(database: Database.Database): void {
  const roleplayPresets = "presetId IN (SELECT id FROM agent_presets WHERE purpose = 'roleplay')"
  for (const table of ['agent_preset_entries', 'agent_preset_version_entries']) {
    const rows = database.prepare(`SELECT rowid, payloadJson FROM ${table}
      WHERE ${roleplayPresets} AND (entryId = ? OR json_extract(payloadJson, '$.kind') = 'hidden_tool_timeline')`)
      .all(HIDDEN_TOOL_TIMELINE_ENTRY_ID) as { rowid: number; payloadJson: string }[]
    const update = database.prepare(`UPDATE ${table} SET payloadJson = ? WHERE rowid = ?`)
    for (const row of rows) {
      const entry = JSON.parse(row.payloadJson)
      const next = upgradeFinalReplyEntry(entry)
      if (next.content !== entry.content || next.title !== entry.title) update.run(JSON.stringify(next), row.rowid)
    }
  }
  for (const table of ['agent_preset_contents', 'agent_preset_version_contents']) {
    const rows = database.prepare(`SELECT rowid, kind, content FROM ${table}
      WHERE ${roleplayPresets} AND kind IN ('prompt_positions', 'tool_configuration')`)
      .all() as { rowid: number; kind: string; content: string }[]
    const update = database.prepare(`UPDATE ${table} SET content = ? WHERE rowid = ?`)
    for (const row of rows) {
      const value = JSON.parse(row.content)
      if (row.kind === 'prompt_positions') {
        const positions = value.map(upgradeFinalReplyPosition)
        if (positions.some((position: unknown, index: number) => position !== value[index])) update.run(JSON.stringify(positions), row.rowid)
        continue
      }
      const originalPlan = value.roleplayPlan
      value.roleplayPlan = upgradeFinalReplyPlan(originalPlan)
      const addReplyGroup = Array.isArray(value.includedGroupIds) && Array.isArray(value.enabledGroupIds)
        && !value.includedGroupIds.includes(ROLEPLAY_REPLY_GROUP_ID)
      if (addReplyGroup) {
        value.includedGroupIds.push(ROLEPLAY_REPLY_GROUP_ID)
        if (!value.enabledGroupIds.includes(ROLEPLAY_REPLY_GROUP_ID)) value.enabledGroupIds.push(ROLEPLAY_REPLY_GROUP_ID)
      }
      if (addReplyGroup || value.roleplayPlan !== originalPlan) update.run(JSON.stringify(value), row.rowid)
    }
  }
}
