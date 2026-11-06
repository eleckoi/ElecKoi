import type Database from 'better-sqlite3'

export const schemaV8AgentConversationsSql = "CREATE TABLE IF NOT EXISTS `agent_conversations` (`id` TEXT NOT NULL, `activeBranchId` TEXT NOT NULL, `runtimeThreadId` TEXT NOT NULL DEFAULT '', PRIMARY KEY(`id`))"

/**
 * 为已有聊天固定升级时使用的变量版本，不改动初始值、当前值和消息。
 * RETIRE WHEN: 正式停止支持 schema v8 及更早版本直接升级后，删除此步骤、
 * 旧表定义、installSchema 登记与对应旧库 fixture；保留当前结构与完整性校验。
 */
export const migration0009 = {
  fromVersion: 8,
  toVersion: 9,
  name: 'opening-variable-version',
  acceptedBaselines: [] as const,
  apply(database: Database.Database): void {
    database.exec("ALTER TABLE agent_conversations ADD COLUMN `variableVersionId` TEXT NOT NULL DEFAULT ''")
    database.exec(`UPDATE agent_conversations SET variableVersionId = COALESCE((
      SELECT COALESCE(v.activeVersionId, 'variable-config-default') FROM chat_sessions c
      LEFT JOIN variable_configs v ON v.characterId=c.characterId
      WHERE c.id=agent_conversations.id AND c.characterId<>''
    ), '')`)
  }
} as const
