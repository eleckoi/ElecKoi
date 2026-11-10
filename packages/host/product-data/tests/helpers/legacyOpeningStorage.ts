import type Database from 'better-sqlite3'
import { commonSchemaSql } from '../../src/storage/sqlite/migrations/commonSchemaSql'

export const legacyOpeningSchemaSql = commonSchemaSql
  .replace(", `identityJson` TEXT NOT NULL DEFAULT '{}'", '')
  .replace(", `variableIdentityJson` TEXT NOT NULL DEFAULT '{}'", '')
  .replace(/^CREATE TABLE IF NOT EXISTS `character_openings`[^\n]*\n/m, '')
  .replace(/^CREATE TABLE IF NOT EXISTS `global_setting_libraries`[^\n]*\n/m, '')
  .replace(/^CREATE TABLE IF NOT EXISTS `global_setting_library_state`[^\n]*\n/m, '')
  .replace(', `chatBackground`', ', `showOpening` INTEGER NOT NULL, `chatBackground`')
  .replace(/PRAGMA user_version = \d+;/, 'PRAGMA user_version = 13;')

/** Restore the legacy character opening shape for synthetic historical fixtures. */
export function restoreLegacyOpeningStorage(database: Database.Database): void {
  for (const [table, column] of [['chat_session_variable_states', 'identityJson'], ['conversation_state_snapshots', 'variableIdentityJson']]) {
    if ((database.pragma(`table_info(${table})`) as Array<{ name: string }>).some(item => item.name === column)) database.exec(`ALTER TABLE ${table} DROP COLUMN ${column}`)
  }
  database.exec('DROP TABLE IF EXISTS global_setting_library_state; DROP TABLE IF EXISTS global_setting_libraries;')
  if (!database.prepare("SELECT 1 FROM sqlite_master WHERE name='character_openings'").get()) return
  const rows = database.prepare('SELECT * FROM characters').all() as Record<string, unknown>[]
  const configs = database.prepare('SELECT characterId, configurationJson FROM character_openings').all() as { characterId: string; configurationJson: string }[]
  const byId = new Map(configs.map(row => [row.characterId, JSON.parse(row.configurationJson)]))
  database.pragma('foreign_keys = OFF')
  database.exec('DROP TABLE character_openings; DROP TABLE characters;')
  database.exec(legacyOpeningSchemaSql.match(/CREATE TABLE IF NOT EXISTS `characters`[^;]+;/)![0])
  for (const row of rows) {
    const config = byId.get(row.id as string)
    const values = { ...row, showOpening: config?.enabled ? 1 : 0 }
    const columns = Object.keys(values)
    database.prepare(`INSERT INTO characters (${columns.map(name => `"${name}"`).join(',')}) VALUES (${columns.map(() => '?').join(',')})`).run(...Object.values(values))
    const primary = config?.openingMessages.find((message: { id: string }) => message.id === config.defaultOpeningMessageId)
    if (primary) database.prepare("INSERT OR REPLACE INTO character_text_contents VALUES (?, 'opening', ?)").run(row.id, primary.content)
  }
  database.pragma('foreign_keys = ON')
}
