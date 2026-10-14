import type Database from 'better-sqlite3'
import {
  applyCurrentStorageCleanup,
  hasPreReleaseV2PresetStorage,
  isLegacyDevelopmentV2Storage,
  migration0002,
  normalizeAgentPresetStorage
} from './migrations/0002RuntimeClean'
import { migration0003 } from './migrations/0003SettingPlacements'
import { migration0004 } from './migrations/0004DshTurnBinding'
import { migration0005 } from './migrations/0005RemoveRichMessageHeights'
import { migration0006 } from './migrations/0006RemoveDshOwnedConfiguration'
import { migration0007 } from './migrations/0007RemovePresetSubagentModelSelection'
import { migration0008, schemaV7ChatSessionsSql } from './migrations/0008RemoveHistoryUserMessageCount'
import { migration0009, schemaV8AgentConversationsSql } from './migrations/0009OpeningVariableVersion'
import { migration0010 } from './migrations/0010ScriptLibraries'
import { migration0011, schemaV10PresetStateSql } from './migrations/0011PresetPurposes'
import { migration0012 } from './migrations/0012GlobalSettingLibrary'
import { migration0013 } from './migrations/0013DataBank'
import { commonSchemaSql } from './migrations/commonSchemaSql'
import { BASELINE_ID, CURRENT_SCHEMA_VERSION } from './schemaVersion'

export { BASELINE_ID, CURRENT_SCHEMA_VERSION } from './schemaVersion'
const PRE_RELEASE_V2_SCHEMA_VERSION = 2
const PRE_RELEASE_V2_BASELINES = [BASELINE_ID, 'eleckoi-common-v1-2026-09-14-runtime-clean'] as const
// TODO(迁移清理)：只有正式停止支持某个旧 schema 及更早版本直接升级后，才能删除从该版本
// 出发的步骤，并同步删除 import、登记和 tests/database.test.ts 中对应旧库 fixture。
// 当前仍支持 v1 连续升级至 v12；已升级的本机数据库不能证明其他旧安装已完成迁移。
// 剩余受支持版本必须仍有连续原子迁移链，当前 SQL、版本常量和完整性检查始终保留。
const migrations = [migration0002, migration0003, migration0004, migration0005, migration0006, migration0007, migration0008, migration0009, migration0010, migration0011, migration0012, migration0013] as const
const unreleasedGenerationTableSql = 'CREATE TABLE IF NOT EXISTS `conversation_generation_results` (`operationId` TEXT NOT NULL, `conversationId` TEXT NOT NULL, `resultJson` TEXT NOT NULL, PRIMARY KEY(`operationId`), FOREIGN KEY(`conversationId`) REFERENCES `chat_sessions`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE )'

function hasTable(database: Database.Database, name: string): boolean {
  return Boolean(database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name))
}

function normalized(sql: string): string {
  return sql.replace(/\bIF NOT EXISTS\s+/gi, '').replace(/\s+/g, ' ').replace(/;$/, '').trim()
}

function validateSchema(database: Database.Database, previousChatSessionsSql?: string, unreleasedGenerationResults = false, previousVariableBinding = false, previousScripts = false, previousPresets = false, previousGlobalSettings = false, previousDataBank = Number(database.pragma('user_version', { simple: true })) < 13): void {
  const installed = database.prepare("SELECT name, sql FROM sqlite_master WHERE sql IS NOT NULL").all() as { name: string; sql: string }[]
  const objects = new Map(installed.map((row) => [row.name, normalized(row.sql)]))
  for (const match of commonSchemaSql.matchAll(/(CREATE (?:TABLE|(?:UNIQUE )?INDEX|VIEW)[\s\S]*?);/g)) {
    let sql = match[1]!
    const name = sql.match(/^CREATE (?:TABLE|(?:UNIQUE )?INDEX|VIEW) (?:IF NOT EXISTS )?`?([\w]+)`?/)?.[1]
    if (name && /^(?:index_)?databank_/.test(name) && previousDataBank) continue
    if (name === 'global_setting_library' && previousGlobalSettings) continue
    if (name === 'script_libraries' && previousScripts) continue
    if (name === 'chat_sessions' && previousChatSessionsSql) sql = previousChatSessionsSql
    if (name === 'agent_conversations' && previousVariableBinding) sql = schemaV8AgentConversationsSql
    if (previousPresets && name === 'agent_preset_state') sql = schemaV10PresetStateSql
    if (previousPresets && (name === 'agent_presets' || name === 'agent_preset_library_groups')) {
      sql = sql.replace(", `purpose` TEXT NOT NULL DEFAULT 'roleplay'", '')
    }
    if ((name === 'global_regex_rules' || name === 'character_regex_rules') &&
      !(database.pragma(`table_info(${name})`) as Array<{ name: string }>).some(column => column.name === 'optionsJson')) {
      sql = sql.replace(", `optionsJson` TEXT NOT NULL DEFAULT '{}'", '')
    }
    if (!name || objects.get(name) !== normalized(sql)) throw new Error(`公共数据库结构不匹配：${name ?? 'unknown'}。`)
  }
  if (unreleasedGenerationResults && objects.get('conversation_generation_results') !== normalized(unreleasedGenerationTableSql)) {
    throw new Error('未发布开发库的生成结果表结构不匹配，拒绝修改数据。')
  }
}

function requiredTableNames(): string[] {
  return [...commonSchemaSql.matchAll(/^CREATE TABLE IF NOT EXISTS `([^`]+)`/gm)]
    .map((match) => match[1]!)
}

function validateTableInventory(database: Database.Database, unreleasedGenerationResults = false, previousScripts = false, previousGlobalSettings = false, previousDataBank = Number(database.pragma('user_version', { simple: true })) < 13): void {
  const installed = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all() as { name: string }[]
  const required = [...requiredTableNames().filter(name => (!previousScripts || name !== 'script_libraries')
    && (!previousGlobalSettings || name !== 'global_setting_library') && (!previousDataBank || !name.startsWith('databank_'))), ...(unreleasedGenerationResults ? ['conversation_generation_results'] : [])]
  if (required.some((name) => !installed.some((table) => table.name === name)) || installed.length !== required.length) {
    throw new Error('数据库业务表不完整或包含未知表，拒绝启动。')
  }
}

function migrate(database: Database.Database, baseline: string, version: number): void {
  let nextVersion = version
  let nextBaseline = baseline
  while (nextVersion < CURRENT_SCHEMA_VERSION) {
    const step = migrations.find((candidate) => candidate.fromVersion === nextVersion)
    if (!step) throw new Error(`数据库迁移链缺少 v${nextVersion} 的下一步，拒绝修改数据。`)
    if (nextBaseline !== BASELINE_ID && !(step.acceptedBaselines as readonly string[]).includes(nextBaseline)) {
      throw new Error(`无法识别数据库 v${nextVersion} 的结构标识，拒绝猜测或删除数据。`)
    }
    database.transaction(() => {
      step.apply(database)
      if (step.toVersion < CURRENT_SCHEMA_VERSION && hasTable(database, 'desktop_schema')) {
        database.prepare('UPDATE desktop_schema SET baseline = ? WHERE id = 1').run(BASELINE_ID)
      }
      database.pragma(`user_version = ${step.toVersion}`)
    }).immediate()
    nextVersion = step.toVersion
    nextBaseline = BASELINE_ID
  }
}

/**
 * TODO(迁移清理)：停止支持开发 schema v2 的两种旧结构直接升级后，删除本函数、
 * 调用、PRE_RELEASE_V2_* 常量及对应开发库 fixture。0002 中的共享整理函数还被
 * v1 → v2 使用；仅移除这里的开发基线入口时不能一并删除那些函数。
 */
function normalizePreReleaseV2(database: Database.Database, baseline: string, version: number): void {
  const oldStorage = isLegacyDevelopmentV2Storage(database)
  const oldPresetStorage = !oldStorage && hasPreReleaseV2PresetStorage(database)
  if (version !== PRE_RELEASE_V2_SCHEMA_VERSION || (baseline === BASELINE_ID && !oldStorage && !oldPresetStorage)) return
  if (!(PRE_RELEASE_V2_BASELINES as readonly string[]).includes(baseline)) {
    throw new Error('无法识别开发数据库 v2 的结构标识，拒绝猜测或删除数据。')
  }
  database.transaction(() => {
    if (oldStorage) {
      applyCurrentStorageCleanup(database)
    } else if (oldPresetStorage) {
      normalizeAgentPresetStorage(database)
    } else {
      validateTableInventory(database, false, true, true)
      validateSchema(database, schemaV7ChatSessionsSql, false, true, true, true, true)
    }
    database.prepare('UPDATE desktop_schema SET baseline = ? WHERE id = 1').run(BASELINE_ID)
  }).immediate()
}

/**
 * Legacy schema-v6 databases may still carry
 * execution and file-cleanup tables that are now owned by DSH Session/Agent
 * services, plus retired preference and schema-marker tables. Consolidate
 * that development baseline in place without touching current product data.
 *
 * TODO(迁移清理)：正式停止支持 schema v6 直接升级后，删除本整理函数、下方
 * version === 6 专用入口和 tests/database.test.ts 中的开发 v6 fixture。
 * 此函数只处理旧开发库，schema v7 不调用；未来提高版本号本身不满足删除条件。
 */
function normalizePreReleaseV6(database: Database.Database, version: number): void {
  if (version !== 6) return
  const retired = ['generation_attempts', 'cleanup_operations', 'desktop_preferences', 'desktop_schema'].filter((name) => database.prepare(
    "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?"
  ).get(name))
  if (retired.length === 0) return
  database.transaction(() => {
    for (const name of retired) database.exec(`DROP TABLE ${name}`)
  }).immediate()
}

export function installSchema(database: Database.Database): void {
  database.pragma('foreign_keys = ON')
  const tables = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[]
  if (tables.length > 0) {
    let version = database.pragma('user_version', { simple: true }) as number
    // 未发布的 v9/v10 开发库只在结构完整匹配时整理，保留变量版本及全部有效数据。
    if ((version === 9 || version === 10) && hasTable(database, 'conversation_generation_results')) {
      validateTableInventory(database, true, true, true)
      validateSchema(database, undefined, true, version === 9, true, true, true)
      database.transaction(() => {
        database.exec('DROP TABLE conversation_generation_results')
        if (version === 9) migration0009.apply(database)
        migration0010.apply(database)
        migration0011.apply(database)
        migration0012.apply(database)
        validateTableInventory(database)
        validateSchema(database)
        if ((database.pragma('foreign_key_check') as unknown[]).length || database.pragma('integrity_check', { simple: true }) !== 'ok') {
          throw new Error('未发布开发库整理后的完整性校验失败。')
        }
        database.pragma(`user_version = ${CURRENT_SCHEMA_VERSION}`)
      }).immediate()
      version = CURRENT_SCHEMA_VERSION
    }
    if (version < CURRENT_SCHEMA_VERSION) {
      if (version >= 6 && version <= 12) {
        normalizePreReleaseV6(database, version)
        validateTableInventory(database, false, version < 10, version < 12)
        validateSchema(database, version < 8 ? schemaV7ChatSessionsSql : undefined, false, version < 9, version < 10, version < 11, version < 12)
        migrate(database, BASELINE_ID, version)
      } else {
        if (!tables.some(({ name }) => name === 'desktop_schema')) throw new Error('此文件不是 ElecKoi 数据库的可迁移版本，拒绝修改数据。')
        const registration = database.prepare('SELECT baseline FROM desktop_schema WHERE id = 1').get() as { baseline: string } | undefined
        if (!registration) throw new Error('旧版 ElecKoi 数据库缺少结构登记，拒绝修改数据。')
        normalizePreReleaseV2(database, registration.baseline, version)
        migrate(database, registration.baseline, version)
      }
    }
    if (database.pragma('user_version', { simple: true }) !== CURRENT_SCHEMA_VERSION) {
      throw new Error(`数据库迁移未到达当前版本 ${CURRENT_SCHEMA_VERSION}。`)
    }
    validateTableInventory(database)
    validateSchema(database)
    normalizeRegexOptions(database)
    validateSchema(database)
    const foreignKeyErrors = database.pragma('foreign_key_check') as unknown[]
    if (foreignKeyErrors.length > 0 || database.pragma('integrity_check', { simple: true }) !== 'ok') {
      throw new Error('数据库迁移后的完整性校验失败。')
    }
    return
  }
  // The canonical schema stamps user_version only after all tables and views exist.
  const ddl = commonSchemaSql.replace(/^PRAGMA foreign_keys = ON;\s*/m, '')
    .replace(/^BEGIN TRANSACTION;\s*/m, '').replace(/^COMMIT;\s*/m, '')
  database.transaction(() => {
    database.exec(ddl)
  }).immediate()
}

function normalizeRegexOptions(database: Database.Database): void {
  database.transaction(() => {
    for (const name of ['global_regex_rules', 'character_regex_rules']) {
      const columns = database.pragma(`table_info(${name})`) as Array<{ name: string }>
      if (columns.some(column => column.name === 'optionsJson')) continue
      const sql = [...commonSchemaSql.matchAll(/CREATE TABLE IF NOT EXISTS `([^`]+)`[^;]+;/g)]
        .find(match => match[1] === name)?.[0]
      if (!sql) throw new Error(`正则存储结构不存在：${name}`)
      const indexes = [...commonSchemaSql.matchAll(/CREATE INDEX IF NOT EXISTS `[^`]+` ON `([^`]+)`[^;]+;/g)]
        .filter(match => match[1] === name).map(match => match[0])
      database.transaction(() => {
        const data = database.prepare(`SELECT * FROM ${name}`).all() as Array<Record<string, unknown>>
        database.exec(`DROP TABLE ${name}`)
        database.exec(sql)
        const names = columns.map(column => `\`${column.name}\``).join(',')
        const insert = database.prepare(`INSERT INTO ${name} (${names}) VALUES (${columns.map(() => '?').join(',')})`)
        for (const row of data) insert.run(...columns.map(column => row[column.name]))
        for (const index of indexes) database.exec(index)
      }).immediate()
    }
  }).immediate()
}
