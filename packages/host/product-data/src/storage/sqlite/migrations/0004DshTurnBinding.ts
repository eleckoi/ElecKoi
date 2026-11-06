import type Database from 'better-sqlite3'
import { normalizeSettingEntryFormat } from './settingEntryFormat'

/**
 * RETIRE WHEN: 停止支持所有低于 schema v4 的数据库直接升级后，移除此步骤、
 * installSchema 登记、installAgentMetadataTables、settingEntryFormat 和对应旧库 fixture。
 * 当前库由公共 SQL 创建同一结构；仍支持旧库时必须保留开场白与设定状态的转换。
 */
export const migration0004 = {
  fromVersion: 3,
  toVersion: 4,
  name: 'desktop-session-inputs',
  acceptedBaselines: [] as const,
  apply(database: Database.Database): void {
    const columns = database.pragma('table_info(agent_responses)') as Array<{ name: string }>
    if (!columns.some(({ name }) => name === 'dshTurn')) {
      database.exec([
        'CREATE TEMP TABLE agent_responses_v3_backup AS SELECT * FROM agent_responses;',
        'DROP TABLE agent_responses;',
        'CREATE TABLE IF NOT EXISTS `agent_responses` (`id` TEXT NOT NULL, `conversationId` TEXT NOT NULL, `turnId` TEXT NOT NULL, `responseIndex` INTEGER NOT NULL, `speakerId` TEXT NOT NULL, `status` TEXT NOT NULL, `createdAt` TEXT NOT NULL, `variableStateJson` TEXT NOT NULL, `runtimeThreadId` TEXT NOT NULL, `dshTurn` INTEGER, `storedRegexRulesJson` TEXT NOT NULL DEFAULT \'[]\', PRIMARY KEY(`id`), FOREIGN KEY(`conversationId`) REFERENCES `agent_conversations`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE , FOREIGN KEY(`turnId`) REFERENCES `agent_turns`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE , FOREIGN KEY(`speakerId`) REFERENCES `conversation_speakers`(`id`) ON UPDATE NO ACTION ON DELETE RESTRICT );',
        'CREATE INDEX IF NOT EXISTS `index_agent_responses_conversationId` ON `agent_responses` (`conversationId`);',
        'CREATE INDEX IF NOT EXISTS `index_agent_responses_speakerId` ON `agent_responses` (`speakerId`);',
        'CREATE UNIQUE INDEX IF NOT EXISTS `index_agent_responses_turnId_responseIndex` ON `agent_responses` (`turnId`, `responseIndex`);',
        'INSERT INTO agent_responses(id,conversationId,turnId,responseIndex,speakerId,status,createdAt,variableStateJson,runtimeThreadId) SELECT id,conversationId,turnId,responseIndex,speakerId,status,createdAt,variableStateJson,runtimeThreadId FROM agent_responses_v3_backup;',
        'DROP TABLE agent_responses_v3_backup;'
      ].join('\n'))
    }
    if (columns.some(({ name }) => name === 'dshTurn') && !columns.some(({ name }) => name === 'storedRegexRulesJson')) {
      database.exec("ALTER TABLE agent_responses ADD COLUMN storedRegexRulesJson TEXT NOT NULL DEFAULT '[]'")
    }
    const sessionColumns = database.pragma('table_info(chat_sessions)') as Array<{ name: string }>
    if (sessionColumns.some(({ name }) => name === 'historySummary')) {
      database.exec('ALTER TABLE chat_sessions DROP COLUMN historySummary')
    }
    installAgentMetadataTables(database)
    if (database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='agent_content_parts'").get()) {
      database.exec('DROP TABLE agent_content_parts')
    }
    normalizeSettingEntryFormat(database)
    const conversationColumns = database.pragma('table_info(agent_conversations)') as Array<{ name: string }>
    if (!conversationColumns.some(({ name }) => name === 'runtimeThreadId')) {
      database.exec("ALTER TABLE agent_conversations ADD COLUMN `runtimeThreadId` TEXT NOT NULL DEFAULT ''")
    }
    database.exec(`
      UPDATE agent_conversations SET runtimeThreadId=COALESCE((
        SELECT r.runtimeThreadId FROM agent_responses r
        JOIN agent_branch_turns p ON p.turnId=r.turnId
        WHERE r.conversationId=agent_conversations.id AND r.runtimeThreadId<>''
        ORDER BY p.sequence DESC,r.responseIndex DESC LIMIT 1
      ),id) WHERE runtimeThreadId=''
    `)
    database.exec('CREATE TABLE IF NOT EXISTS `agent_pending_inputs` (`turnId` TEXT NOT NULL, `draftJson` TEXT NOT NULL, PRIMARY KEY(`turnId`), FOREIGN KEY(`turnId`) REFERENCES `agent_turns`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE )')
  }
} as const

/** Consolidate the unpublished v4 schema and move product-owned data into dedicated tables. */
export function installAgentMetadataTables(database: Database.Database): void {
  database.exec([
    'CREATE TABLE IF NOT EXISTS `agent_openings` (`conversationId` TEXT NOT NULL, `turnId` TEXT NOT NULL, `content` TEXT NOT NULL, `payloadJson` TEXT NOT NULL, PRIMARY KEY(`turnId`), FOREIGN KEY(`conversationId`) REFERENCES `agent_conversations`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE , FOREIGN KEY(`turnId`) REFERENCES `agent_turns`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE );',
    'CREATE UNIQUE INDEX IF NOT EXISTS `index_agent_openings_conversationId` ON `agent_openings` (`conversationId`);',
    'CREATE TABLE IF NOT EXISTS `agent_setting_snapshots` (`conversationId` TEXT NOT NULL, `ownerType` TEXT NOT NULL, `ownerId` TEXT NOT NULL, `stateJson` TEXT NOT NULL, PRIMARY KEY(`ownerType`, `ownerId`), FOREIGN KEY(`conversationId`) REFERENCES `agent_conversations`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE );',
    'CREATE INDEX IF NOT EXISTS `index_agent_setting_snapshots_conversationId` ON `agent_setting_snapshots` (`conversationId`);'
  ].join('\n'))

  if (!database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='agent_content_parts'").get()) return

  const openingRows = database.prepare(`SELECT p.conversationId,p.ownerId,p.text,p.payloadJson
    FROM agent_content_parts p JOIN agent_turns t ON t.id=p.ownerId AND t.conversationId=p.conversationId
    WHERE p.ownerType='turn' AND p.kind='opening_text' AND t.kind='opening'
    ORDER BY p.ownerId,p.partIndex,p.chunkIndex`).all() as Array<{
      conversationId: string; ownerId: string; text: string; payloadJson: string
    }>
  const openings = new Map<string, { conversationId: string; content: string; payloadJson: string }>()
  for (const row of openingRows) {
    const existing = openings.get(row.ownerId)
    if (existing) existing.content += row.text
    else openings.set(row.ownerId, { conversationId: row.conversationId, content: row.text, payloadJson: row.payloadJson })
  }
  const insertOpening = database.prepare(`INSERT INTO agent_openings(conversationId,turnId,content,payloadJson)
    VALUES (?,?,?,?) ON CONFLICT(turnId) DO UPDATE SET content=excluded.content,payloadJson=excluded.payloadJson`)
  for (const [turnId, row] of openings) insertOpening.run(row.conversationId, turnId, row.content, row.payloadJson)

  const snapshotRows = database.prepare(`SELECT conversationId,ownerType,ownerId,payloadJson
    FROM agent_content_parts WHERE kind='setting_library_state'
    ORDER BY ownerType,ownerId,partIndex,chunkIndex`).all() as Array<{
      conversationId: string; ownerType: string; ownerId: string; payloadJson: string
    }>
  const insertSnapshot = database.prepare(`INSERT INTO agent_setting_snapshots(conversationId,ownerType,ownerId,stateJson)
    VALUES (?,?,?,?) ON CONFLICT(ownerType,ownerId) DO UPDATE SET stateJson=excluded.stateJson`)
  for (const row of snapshotRows) insertSnapshot.run(row.conversationId, row.ownerType, row.ownerId, row.payloadJson)
}
