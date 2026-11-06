import type Database from 'better-sqlite3'

// v6/v7 share this table definition. Use it only to validate an upgrade source;
// the current schema and repositories no longer contain the user counter.
export const schemaV7ChatSessionsSql = 'CREATE TABLE IF NOT EXISTS `chat_sessions` (`id` TEXT NOT NULL, `title` TEXT NOT NULL, `characterId` TEXT NOT NULL, `characterName` TEXT NOT NULL, `characterAvatar` TEXT NOT NULL, `historyMessageCount` INTEGER NOT NULL, `historyUserMessageCount` INTEGER NOT NULL, `createdAt` TEXT NOT NULL, `updatedAt` TEXT NOT NULL, PRIMARY KEY(`id`))'

/**
 * DSH Session owns the user-input history. Remove the unused product counter
 * without rebuilding conversations or changing any retained relationships.
 *
 * RETIRE WHEN: 停止支持所有低于 schema v8 的数据库直接升级后，移除此步骤、
 * 旧表定义、installSchema 登记及对应旧库 fixture。当前运行时不读写被删除的列。
 */
export const migration0008 = {
  fromVersion: 7,
  toVersion: 8,
  name: 'remove-history-user-message-count',
  acceptedBaselines: [] as const,
  apply(database: Database.Database): void {
    database.exec('ALTER TABLE chat_sessions DROP COLUMN historyUserMessageCount')
  }
} as const
