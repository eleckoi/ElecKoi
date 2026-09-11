import type Database from 'better-sqlite3'
import { commonSchemaSql } from './migrations/commonSchemaSql'

export const BASELINE_ID = 'eleckoi-common-v1-2026-09-11-agent-presets'
const desktopSql = `
  CREATE TABLE desktop_schema (id INTEGER PRIMARY KEY CHECK(id = 1), baseline TEXT NOT NULL);
  CREATE TABLE desktop_preferences (key TEXT PRIMARY KEY, valueJson TEXT NOT NULL, updatedAt TEXT NOT NULL);
`

function normalized(sql: string): string {
  return sql.replace(/\bIF NOT EXISTS\s+/gi, '').replace(/\s+/g, ' ').replace(/;$/, '').trim()
}

function validateSchema(database: Database.Database): void {
  const installed = database.prepare("SELECT name, sql FROM sqlite_master WHERE sql IS NOT NULL").all() as { name: string; sql: string }[]
  const objects = new Map(installed.map((row) => [row.name, normalized(row.sql)]))
  for (const match of (commonSchemaSql + desktopSql).matchAll(/(CREATE (?:TABLE|(?:UNIQUE )?INDEX|VIEW)[\s\S]*?);/g)) {
    const sql = match[1]!
    const name = sql.match(/^CREATE (?:TABLE|(?:UNIQUE )?INDEX|VIEW) (?:IF NOT EXISTS )?`?([\w]+)`?/)?.[1]
    if (!name || objects.get(name) !== normalized(sql)) throw new Error(`公共数据库结构不匹配：${name ?? 'unknown'}。`)
  }
}

export function installSchema(database: Database.Database): void {
  database.pragma('foreign_keys = ON')
  const tables = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[]
  if (tables.length > 0) {
    const registration = tables.some(({ name }) => name === 'desktop_schema')
      ? database.prepare('SELECT baseline FROM desktop_schema WHERE id = 1').get() as { baseline: string } | undefined
      : undefined
    if (registration?.baseline !== BASELINE_ID || database.pragma('user_version', { simple: true }) !== 1) {
      throw new Error('此文件不是当前公共 SQLite 开发基线。请显式清理旧开发库或使用新的数据目录；不会自动转换或删除数据。')
    }
    const required = [...commonSchemaSql.matchAll(/^CREATE TABLE IF NOT EXISTS `([^`]+)`/gm)].map((match) => match[1]).concat(['desktop_schema', 'desktop_preferences'])
    if (required.some((name) => !tables.some((table) => table.name === name)) || tables.length !== required.length) {
      throw new Error('数据库业务表不完整或包含未知表，拒绝启动。')
    }
    validateSchema(database)
    return
  }
  // The installer owns the transaction for both the common schema and desktop registration.
  const ddl = commonSchemaSql.replace(/^PRAGMA foreign_keys = ON;\s*/m, '')
    .replace(/^BEGIN TRANSACTION;\s*/m, '').replace(/^COMMIT;\s*/m, '')
  database.transaction(() => {
    database.exec(ddl)
    database.exec(desktopSql)
    database.prepare('INSERT INTO desktop_schema(id, baseline) VALUES (1, ?)').run(BASELINE_ID)
  }).immediate()
}
