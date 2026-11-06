import type Database from 'better-sqlite3'
import { legacyConversationStates } from '@product-data/domain/conversations/legacyConversationStates'

export const conversationStatesSql = "CREATE TABLE IF NOT EXISTS `conversation_state_snapshots` (`conversationId` TEXT NOT NULL, `branchId` TEXT NOT NULL, `runtimeSessionId` TEXT NOT NULL, `boundaryType` TEXT NOT NULL, `boundaryId` TEXT NOT NULL, `phase` TEXT NOT NULL, `turn` INTEGER, `variableStateJson` TEXT, `settingLibraryStateJson` TEXT, PRIMARY KEY(`conversationId`, `branchId`, `runtimeSessionId`, `boundaryType`, `boundaryId`, `phase`), FOREIGN KEY(`conversationId`) REFERENCES `agent_conversations`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE , FOREIGN KEY(`branchId`) REFERENCES `agent_branches`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE , CHECK (`boundaryType` IN ('turn', 'input', 'reply', 'opening') AND `phase` IN ('before', 'after') AND `boundaryId` <> ''), CHECK (`turn` IS NULL OR `turn` >= 1), CHECK (`boundaryType` <> 'turn' OR (`runtimeSessionId` <> '' AND `turn` IS NOT NULL AND `boundaryId` = CAST(`turn` AS TEXT))), CHECK (`variableStateJson` IS NULL OR (json_valid(`variableStateJson`) AND json_type(`variableStateJson`) = 'object')), CHECK (`settingLibraryStateJson` IS NULL OR (json_valid(`settingLibraryStateJson`) AND json_type(`settingLibraryStateJson`) = 'array')))"
export const conversationStatesIndexSql = 'CREATE INDEX IF NOT EXISTS `index_conversation_state_snapshots_session_turn` ON `conversation_state_snapshots` (`conversationId`, `runtimeSessionId`, `turn`, `phase`)'
export const legacySettingSnapshotsSql = 'CREATE TABLE IF NOT EXISTS `agent_setting_snapshots` (`conversationId` TEXT NOT NULL, `ownerType` TEXT NOT NULL, `ownerId` TEXT NOT NULL, `stateJson` TEXT NOT NULL, PRIMARY KEY(`ownerType`, `ownerId`), FOREIGN KEY(`conversationId`) REFERENCES `agent_conversations`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE )'

// RETIRE WHEN: the 0012 migration and development repair no longer accept old
// conversation state tables. Remove this helper and their imports; keep the
// shared legacyConversationStates decoder while archive-v1 imports still need it.
export function migrateConversationStateStorage(database: Database.Database): void {
  database.exec(conversationStatesSql); database.exec(conversationStatesIndexSql)
  const columns = database.pragma('table_info(agent_responses)') as Array<{ name: string }>
  if (columns.some(column => column.name === 'variableStateJson')) {
    const tables = Object.fromEntries(['agent_conversations', 'agent_branches', 'agent_turns', 'agent_branch_turns',
      'agent_responses', 'agent_setting_snapshots'].map(table => [table, database.prepare(`SELECT * FROM ${table}`).all()]))
    const snapshots = legacyConversationStates(tables as Record<string, Array<Record<string, string | number | null>>>)
    const insert = database.prepare(`INSERT INTO conversation_state_snapshots
      (conversationId,branchId,runtimeSessionId,boundaryType,boundaryId,phase,turn,variableStateJson,settingLibraryStateJson)
      VALUES (@conversationId,@branchId,@runtimeSessionId,@boundaryType,@boundaryId,@phase,@turn,@variableStateJson,@settingLibraryStateJson)`)
    for (const snapshot of snapshots) insert.run(snapshot)
    database.exec('ALTER TABLE agent_responses DROP COLUMN variableStateJson')
    database.exec('DROP TABLE agent_setting_snapshots')
  }
  if (columns.some(column => column.name === 'storedRegexRulesJson')) database.exec('ALTER TABLE agent_responses DROP COLUMN storedRegexRulesJson')
}
