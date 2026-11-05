import type Database from 'better-sqlite3'
import { variableItemConfigSchema, variableObjectConfigSchema } from '@shared/contracts/variables/schemas'
import { generatedInitialStateJson } from '@shared/foundation/variables/initialState'

function removeOpeningInitialValues(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  let changed = false
  for (const key of ['openingMessages', 'opening_messages']) {
    if (!Array.isArray(record[key])) continue
    for (const message of record[key]) {
      if (!message || typeof message !== 'object') continue
      for (const field of ['initialVariableStateJson', 'initial_variable_state']) {
        if (!Object.hasOwn(message, field)) continue
        delete message[field]
        changed = true
      }
    }
  }
  for (const key of ['entries', 'versions']) {
    if (Array.isArray(record[key])) for (const child of record[key]) changed = removeOpeningInitialValues(child) || changed
  }
  return changed
}

// RETIRE WHEN: 停止支持 schema v14 及更早数据库直接升级后，连同登记和 v14 迁移回归删除。
// 只在 v14→v15 的事务中执行；不修改已创建聊天的绑定、初始/当前变量、轮次或 Session。
export const migration0015 = {
  fromVersion: 14, toVersion: 15, name: 'opening-variable-state', acceptedBaselines: [] as const,
  apply(database: Database.Database): void {
    for (const [table, column] of [
      ['character_openings', 'configurationJson'], ['setting_entry_contents', 'payloadJson'],
      ['agent_preset_entries', 'payloadJson'], ['agent_preset_version_entries', 'payloadJson'],
      ['global_setting_libraries', 'configurationJson']
    ]) {
      const rows = database.prepare(`SELECT rowid, ${column} AS content FROM ${table}`).all() as { rowid: number; content: string }[]
      const update = database.prepare(`UPDATE ${table} SET ${column}=? WHERE rowid=?`)
      for (const row of rows) {
        const value: unknown = JSON.parse(row.content)
        if (removeOpeningInitialValues(value)) update.run(JSON.stringify(value), row.rowid)
      }
    }
    const versions = database.prepare('SELECT characterId, versionId FROM variable_config_versions').all() as { characterId: string; versionId: string }[]
    const readObjects = database.prepare('SELECT payloadJson FROM variable_config_objects WHERE characterId=? AND versionId=? ORDER BY sortIndex')
    const readVariables = database.prepare('SELECT payloadJson FROM variable_config_variables WHERE characterId=? AND versionId=? ORDER BY sortIndex')
    const readState = database.prepare("SELECT content FROM variable_config_version_contents WHERE characterId=? AND versionId=? AND kind='initial_state'")
    const writeState = database.prepare("INSERT INTO variable_config_version_contents(characterId,versionId,kind,content) VALUES (?,?,'initial_state',?) ON CONFLICT(characterId,versionId,kind) DO UPDATE SET content=excluded.content")
    const changedCharacters = new Set<string>()
    for (const { characterId, versionId } of versions) {
      const objects = (readObjects.all(characterId, versionId) as { payloadJson: string }[])
        .map(row => variableObjectConfigSchema.parse(JSON.parse(row.payloadJson)))
      const variables = (readVariables.all(characterId, versionId) as { payloadJson: string }[])
        .map(row => variableItemConfigSchema.parse(JSON.parse(row.payloadJson)))
      const initialStateJson = (readState.get(characterId, versionId) as { content: string } | undefined)?.content ?? '{}'
      const next = generatedInitialStateJson(objects, variables, { initialStateJson, objects })
      if (JSON.stringify(JSON.parse(initialStateJson)) === JSON.stringify(JSON.parse(next))) continue
      writeState.run(characterId, versionId, next)
      changedCharacters.add(characterId)
    }
    const bumpRevision = database.prepare('UPDATE variable_configs SET revision=revision+1 WHERE characterId=?')
    for (const characterId of changedCharacters) bumpRevision.run(characterId)
  }
} as const
