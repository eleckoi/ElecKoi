import type Database from 'better-sqlite3'

/**
 * RETIRE WHEN: 停止支持所有低于 schema v5 的数据库直接升级后，移除此步骤、
 * installSchema 登记和旧消息高度表 fixture；当前新库仍按公共 SQL 创建。
 */
export const migration0005 = {
  fromVersion: 4,
  toVersion: 5,
  name: 'remove-rich-message-height-cache',
  acceptedBaselines: [] as const,
  apply(database: Database.Database): void {
    database.exec('DROP TABLE IF EXISTS roleplay_rich_heights')
  }
} as const
