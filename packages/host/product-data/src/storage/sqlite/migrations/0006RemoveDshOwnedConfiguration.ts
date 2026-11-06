import type Database from 'better-sqlite3'

/**
 * Model providers, credentials and web search configuration are owned by DSH
 * profiles, credentials and plugin settings from v6. DSH Session and Agent
 * services also own execution state and stored session artifacts. The former
 * product tables duplicated those responsibilities, so no rows migrate.
 *
 * RETIRE WHEN: 停止支持所有低于 schema v6 的数据库直接升级后，移除此步骤、
 * installSchema 登记和对应旧表 fixture。开发 v6 整理及 v6 → v7 是独立入口，
 * 不能因旧配置表已从当前库消失而一起删除它们。
 */
export const migration0006 = {
  fromVersion: 5,
  toVersion: 6,
  name: 'remove-dsh-owned-configuration',
  acceptedBaselines: [] as const,
  apply(database: Database.Database): void {
    database.exec([
      'DROP TABLE IF EXISTS model_config_meta;',
      'DROP TABLE IF EXISTS model_configs;',
      'DROP TABLE IF EXISTS web_search_settings;',
      'DROP TABLE IF EXISTS generation_attempts;',
      'DROP TABLE IF EXISTS cleanup_operations;',
      'DROP TABLE IF EXISTS desktop_preferences;',
      'DROP TABLE IF EXISTS desktop_schema;'
    ].join('\n'))
  }
} as const
