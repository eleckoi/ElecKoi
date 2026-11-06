import type Database from 'better-sqlite3'
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes'
import { DesktopError } from '@shared/foundation/DesktopError'

interface LegacyToolConfigRow {
  payloadJson: string
  updatedAt: string
}

interface WebSearchSettingsRow {
  mode: 'provider_native' | 'tavily'
  maxResults: 3 | 5 | 8
  tavilyApiKey: string
  updatedAt: string
}

interface PresetContentRow {
  content: string
}

interface PresetEntryRow {
  payloadJson: string
}

const PREVIOUS_TOOL_CONFIGURATION_KIND = 'tool_policy'
const CURRENT_TOOL_CONFIGURATION_KIND = 'tool_configuration'
const CURRENT_TOOL_CONFIGURATION_VERSION = 4
const ROLEPLAY_PLAN_ENTRY_ID = 'fixed-roleplay-plan'
const CURRENT_TOOL_GROUP_IDS = new Set([
  'builtin:mcp-resources', 'builtin:workflow', 'builtin:creator', 'builtin:variables',
  'builtin:collaboration', 'builtin:plugin-discovery', 'builtin:workspace', 'builtin:web',
  'builtin:roleplay-workflow', 'builtin:auto-illustration', 'builtin:setting-library'
])
const DEFAULT_TOOL_GROUP_IDS = ['builtin:variables', 'builtin:setting-library']
const DEFAULT_ROLEPLAY_PLAN_STEPS = [
  '必须先并行调用工具调研阅读设定，这里不扮演回复，禁止未阅读设定直接回复',
  '等前置任务都完成，直接输出 <FINAL> 正文，不要再次调用 update_roleplay_plan；应用检测到正文后会自动完成最终项的标记。'
]

/**
 * RETIRE WHEN: 停止支持 schema v1 直接升级后，移除此步骤、installSchema 登记
 * 和对应 v1 fixture。本文件的整理函数也供开发 v2 入口使用；在该入口退役前保留。
 */
export const migration0002 = {
  fromVersion: 1,
  toVersion: 2,
  name: 'runtime-clean',
  acceptedBaselines: ['eleckoi-common-v1-2026-09-11-agent-presets'] as const,
  apply(database: Database.Database): void {
    database.exec(`
      DROP TABLE chat_session_model_settings;
      DROP TABLE character_frontend_settings;
      DROP TABLE frontend_projects;
      DROP TABLE agent_conversation_display_cache;

      ALTER TABLE chat_sessions DROP COLUMN workspaceId;
      ALTER TABLE chat_sessions DROP COLUMN permissionMode;

      ALTER TABLE agent_conversations DROP COLUMN surface;
      ALTER TABLE agent_conversations DROP COLUMN createdAt;
      ALTER TABLE agent_conversations DROP COLUMN updatedAt;
      ALTER TABLE agent_conversations DROP COLUMN revision;

      DROP INDEX index_agent_branches_conversationId_createdAt;
      ALTER TABLE agent_branches DROP COLUMN parentBranchId;
      ALTER TABLE agent_branches DROP COLUMN forkedFromTurnId;
      ALTER TABLE agent_branches DROP COLUMN headSequence;
      ALTER TABLE agent_branches DROP COLUMN name;
      ALTER TABLE agent_branches DROP COLUMN reason;
      ALTER TABLE agent_branches DROP COLUMN createdAt;

      DROP INDEX index_agent_turns_conversationId_sourceMessageId;
      ALTER TABLE agent_turns DROP COLUMN sourceMessageId;
      ALTER TABLE agent_turns DROP COLUMN provider;
      ALTER TABLE agent_turns DROP COLUMN model;

      ALTER TABLE agent_responses DROP COLUMN sourceMessageId;
      ALTER TABLE agent_responses DROP COLUMN provider;
      ALTER TABLE agent_responses DROP COLUMN model;
      ALTER TABLE agent_responses DROP COLUMN runtimeTurnId;
      ALTER TABLE agent_responses DROP COLUMN turnStartedAtMillis;
      ALTER TABLE agent_responses DROP COLUMN turnCompletedAtMillis;

      DROP INDEX index_generation_attempts_conversationId_kind_ownerId_attemptNumber;
      DROP INDEX index_generation_attempts_parentAttemptId;
      DROP INDEX index_generation_attempts_outputMessageId;
      ALTER TABLE generation_attempts DROP COLUMN kind;
      ALTER TABLE generation_attempts DROP COLUMN parentAttemptId;
      ALTER TABLE generation_attempts DROP COLUMN outputMessageId;
      ALTER TABLE generation_attempts DROP COLUMN attemptNumber;
      ALTER TABLE generation_attempts DROP COLUMN createdAtMillis;
      ALTER TABLE generation_attempts DROP COLUMN startedAtMillis;
      ALTER TABLE generation_attempts DROP COLUMN finishedAtMillis;
      ALTER TABLE generation_attempts DROP COLUMN errorMessage;
      ALTER TABLE generation_attempts DROP COLUMN outputPath;
      ALTER TABLE generation_attempts DROP COLUMN supersededByAttemptId;
      CREATE UNIQUE INDEX IF NOT EXISTS \`index_generation_attempts_conversationId_ownerId\`
        ON \`generation_attempts\` (\`conversationId\`, \`ownerId\`);
    `)
    applyCurrentStorageCleanup(database)
  }
} as const

export function isLegacyDevelopmentV2Storage(database: Database.Database): boolean {
  return tableExists(database, 'global_tool_config')
    && !tableExists(database, 'web_search_settings')
    && columnExists(database, 'chat_sessions', 'characterMode')
    && columnExists(database, 'characters', 'characterMode')
    && columnExists(database, 'agent_presets', 'usageInstructions')
}

export function applyCurrentStorageCleanup(database: Database.Database): void {
  database.exec('CREATE TABLE `web_search_settings` (`singletonId` INTEGER NOT NULL, `mode` TEXT NOT NULL, `maxResults` INTEGER NOT NULL, `tavilyApiKey` TEXT NOT NULL, `updatedAt` TEXT NOT NULL, PRIMARY KEY(`singletonId`));')

  const legacyToolConfig = database.prepare(
    'SELECT payloadJson, updatedAt FROM global_tool_config WHERE singletonId = 1'
  ).get() as LegacyToolConfigRow | undefined
  if (legacyToolConfig) {
    const webSearch = readLegacyWebSearchSettings(legacyToolConfig)
    database.prepare(`INSERT INTO web_search_settings(
      singletonId, mode, maxResults, tavilyApiKey, updatedAt
    ) VALUES (1, ?, ?, ?, ?)`)
      .run(webSearch.mode, webSearch.maxResults, webSearch.tavilyApiKey, webSearch.updatedAt)
  }

  normalizeAgentPresetStorage(database)

  database.exec(`
    INSERT INTO agent_preset_contents(presetId, kind, content)
      SELECT id, 'usage_instructions', usageInstructions FROM agent_presets
      WHERE true
      ON CONFLICT(presetId, kind) DO UPDATE SET content = excluded.content;

    INSERT INTO agent_preset_version_contents(presetId, versionId, kind, content)
      SELECT version.presetId, version.versionId, 'usage_instructions', preset.usageInstructions
      FROM agent_preset_versions AS version
      JOIN agent_presets AS preset ON preset.id = version.presetId
      WHERE true
      ON CONFLICT(presetId, versionId, kind) DO UPDATE SET content = excluded.content;

    ALTER TABLE chat_sessions DROP COLUMN characterMode;
    ALTER TABLE characters DROP COLUMN characterMode;
    ALTER TABLE agent_presets DROP COLUMN usageInstructions;
    DROP TABLE global_tool_config;
  `)
}

export function hasPreReleaseV2PresetStorage(database: Database.Database): boolean {
  if (database.prepare('SELECT 1 FROM agent_preset_contents WHERE kind = ? LIMIT 1')
    .get(PREVIOUS_TOOL_CONFIGURATION_KIND)) return true
  if (database.prepare('SELECT 1 FROM agent_preset_version_contents WHERE kind = ? LIMIT 1')
    .get(PREVIOUS_TOOL_CONFIGURATION_KIND)) return true
  if (database.prepare(`SELECT 1 FROM agent_presets AS preset
      WHERE NOT EXISTS (SELECT 1 FROM agent_preset_contents AS content
        WHERE content.presetId = preset.id AND content.kind = ?) LIMIT 1`)
    .get(CURRENT_TOOL_CONFIGURATION_KIND)) return true
  if (database.prepare(`SELECT 1 FROM agent_preset_versions AS version
      WHERE NOT EXISTS (SELECT 1 FROM agent_preset_version_contents AS content
        WHERE content.presetId = version.presetId AND content.versionId = version.versionId AND content.kind = ?) LIMIT 1`)
    .get(CURRENT_TOOL_CONFIGURATION_KIND)) return true
  if (hasObsoletePlanRows(database, 'agent_preset_entries', 'entryId', 'payloadJson')) return true
  if (hasObsoletePlanRows(database, 'agent_preset_version_entries', 'entryId', 'payloadJson')) return true
  if (hasObsoletePlanRows(database, 'setting_entry_contents', 'entryId', 'payloadJson')) return true
  if (hasObsoletePlanRows(database, 'conversation_setting_changes', 'targetId', 'payloadJson')) return true
  return [...readPresetConfigurationRows(database, 'agent_preset_contents'),
    ...readPresetConfigurationRows(database, 'agent_preset_version_contents')]
    .some((row) => normalizeToolConfiguration(row.content) !== row.content)
}

export function normalizeAgentPresetStorage(database: Database.Database): void {
  const presets = database.prepare('SELECT id FROM agent_presets').all() as Array<{ id: string }>
  for (const preset of presets) {
    const previous = readPresetContent(database, 'agent_preset_contents', preset.id, PREVIOUS_TOOL_CONFIGURATION_KIND)
    const current = readPresetContent(database, 'agent_preset_contents', preset.id, CURRENT_TOOL_CONFIGURATION_KIND)
    const plan = readPresetPlan(database, 'agent_preset_entries', preset.id)
    writePresetContent(database, 'agent_preset_contents', preset.id,
      normalizeToolConfiguration(current?.content ?? previous?.content, plan))
  }

  const versions = database.prepare('SELECT presetId, versionId FROM agent_preset_versions')
    .all() as Array<{ presetId: string; versionId: string }>
  for (const version of versions) {
    const previous = readPresetVersionContent(database, version, PREVIOUS_TOOL_CONFIGURATION_KIND)
    const current = readPresetVersionContent(database, version, CURRENT_TOOL_CONFIGURATION_KIND)
    const plan = readPresetVersionPlan(database, version)
    writePresetVersionContent(database, version,
      normalizeToolConfiguration(current?.content ?? previous?.content, plan))
  }

  database.prepare('DELETE FROM agent_preset_contents WHERE kind = ?').run(PREVIOUS_TOOL_CONFIGURATION_KIND)
  database.prepare('DELETE FROM agent_preset_version_contents WHERE kind = ?').run(PREVIOUS_TOOL_CONFIGURATION_KIND)
  deleteObsoletePlanRows(database)
}

function normalizeToolConfiguration(raw?: string, previousPlan?: string[]): string {
  if (!raw) return JSON.stringify(currentToolConfiguration(DEFAULT_TOOL_GROUP_IDS, DEFAULT_TOOL_GROUP_IDS, undefined, previousPlan))
  let value: unknown
  try { value = JSON.parse(raw) } catch (error) {
    throw new DesktopError(ELECKOI_FAILURE_CODES.storageCorrupt, '预设工具配置已损坏，无法整理。', { what: '预设工具配置' })
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, '预设工具配置不是对象，无法整理。', { what: '预设工具配置' })
  const source = value as Record<string, unknown>
  if (source.version !== 2 && source.version !== CURRENT_TOOL_CONFIGURATION_VERSION) {
    throw new DesktopError(ELECKOI_FAILURE_CODES.dataLegacyMismatch, '预设工具配置版本无法识别，拒绝猜测。', { what: '预设工具配置的版本' })
  }
  const enabled = currentToolIds(source.enabledGroupIds, '启用工具组')
  const included = source.version === 2 && source.includedGroupIds === undefined
    ? enabled
    : currentToolIds(source.includedGroupIds, '已收录工具组')
  // Historical v2 -> v3 output must stay byte-compatible with the published
  // migration chain. Schema v7 removes this retired field immediately after
  // the intervening migrations; current runtime code never reads it.
  const selection = source.version === CURRENT_TOOL_CONFIGURATION_VERSION
    ? readSubagentSelection(source.subagentModelSelection)
    : undefined
  const roleplayPlan = source.version === CURRENT_TOOL_CONFIGURATION_VERSION
    ? readRoleplayPlan(source.roleplayPlan)
    : previousPlan
  return JSON.stringify(currentToolConfiguration(included, enabled, selection, roleplayPlan))
}

function currentToolConfiguration(
  includedGroupIds: string[],
  enabledGroupIds: string[],
  subagentModelSelection?: { configId: string; model: string },
  roleplayPlan?: string[]
): Record<string, unknown> {
  return {
    version: CURRENT_TOOL_CONFIGURATION_VERSION,
    includedGroupIds,
    enabledGroupIds,
    subagentModelSelection: subagentModelSelection ?? { configId: '', model: '' },
    roleplayPlan: { steps: roleplayPlan ?? DEFAULT_ROLEPLAY_PLAN_STEPS }
  }
}

function currentToolIds(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, `预设${label}格式无效，无法整理。`, { what: '预设配置' })
  }
  return [...new Set(value.filter((item): item is string => typeof item === 'string' && CURRENT_TOOL_GROUP_IDS.has(item)))]
}

function readSubagentSelection(value: unknown): { configId: string; model: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, '预设子代理模型配置无效，无法整理。', { what: '预设子代理模型配置' })
  const source = value as Record<string, unknown>
  if (typeof source.configId !== 'string' || typeof source.model !== 'string') {
    throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, '预设子代理模型配置无效，无法整理。', { what: '预设子代理模型配置' })
  }
  return { configId: source.configId, model: source.model }
}

// RETIRE WHEN: support for databases preceding schema v2 is dropped and their
// complete upgrade path is removed; remove both plan readers with this migration.
function readRoleplayPlan(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, '预设角色扮演计划无效，无法整理。', { what: '预设角色扮演计划' })
  const steps = (value as Record<string, unknown>).steps
  if (!Array.isArray(steps) || steps.length < 1
    || steps.some((step) => typeof step !== 'string' || !step.trim())) {
    throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, '预设角色扮演计划无效，无法整理。', { what: '预设角色扮演计划' })
  }
  return steps as string[]
}

function readPresetConfigurationRows(database: Database.Database, table: string): PresetContentRow[] {
  return database.prepare(`SELECT content FROM ${table} WHERE kind = ?`).all(CURRENT_TOOL_CONFIGURATION_KIND) as PresetContentRow[]
}

function readPresetContent(database: Database.Database, table: string, presetId: string, kind: string): PresetContentRow | undefined {
  return database.prepare(`SELECT content FROM ${table} WHERE presetId = ? AND kind = ?`).get(presetId, kind) as PresetContentRow | undefined
}

function readPresetVersionContent(
  database: Database.Database,
  version: { presetId: string; versionId: string },
  kind: string
): PresetContentRow | undefined {
  return database.prepare(`SELECT content FROM agent_preset_version_contents
    WHERE presetId = ? AND versionId = ? AND kind = ?`).get(version.presetId, version.versionId, kind) as PresetContentRow | undefined
}

function writePresetContent(database: Database.Database, table: string, presetId: string, content: string): void {
  database.prepare(`INSERT INTO ${table}(presetId, kind, content) VALUES (?, ?, ?)
    ON CONFLICT(presetId, kind) DO UPDATE SET content = excluded.content`)
    .run(presetId, CURRENT_TOOL_CONFIGURATION_KIND, content)
}

function writePresetVersionContent(
  database: Database.Database,
  version: { presetId: string; versionId: string },
  content: string
): void {
  database.prepare(`INSERT INTO agent_preset_version_contents(presetId, versionId, kind, content) VALUES (?, ?, ?, ?)
    ON CONFLICT(presetId, versionId, kind) DO UPDATE SET content = excluded.content`)
    .run(version.presetId, version.versionId, CURRENT_TOOL_CONFIGURATION_KIND, content)
}

function readPresetPlan(database: Database.Database, table: string, presetId: string): string[] | undefined {
  const row = database.prepare(`SELECT payloadJson FROM ${table} WHERE presetId = ? AND entryId = ?`)
    .get(presetId, ROLEPLAY_PLAN_ENTRY_ID) as PresetEntryRow | undefined
  return row ? planStepsFromEntry(row.payloadJson) : undefined
}

function readPresetVersionPlan(
  database: Database.Database,
  version: { presetId: string; versionId: string }
): string[] | undefined {
  const row = database.prepare(`SELECT payloadJson FROM agent_preset_version_entries
    WHERE presetId = ? AND versionId = ? AND entryId = ?`)
    .get(version.presetId, version.versionId, ROLEPLAY_PLAN_ENTRY_ID) as PresetEntryRow | undefined
  return row ? planStepsFromEntry(row.payloadJson) : undefined
}

function planStepsFromEntry(raw: string): string[] {
  let value: unknown
  try { value = JSON.parse(raw) } catch (error) {
    throw new DesktopError(ELECKOI_FAILURE_CODES.storageCorrupt, '旧角色扮演计划已损坏，无法整理。', { what: '旧角色扮演计划' })
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, '旧角色扮演计划格式无效，无法整理。', { what: '旧角色扮演计划' })
  const content = (value as Record<string, unknown>).content
  if (typeof content !== 'string') throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, '旧角色扮演计划正文无效，无法整理。', { what: '旧角色扮演计划正文' })
  const steps = content.split(/\r?\n/).map((step) => step.trim()).filter(Boolean)
  if (steps.length < 1) {
    throw new DesktopError(ELECKOI_FAILURE_CODES.dataLegacyMismatch, '旧角色扮演计划无法完整转换，拒绝截断。', { what: '旧角色扮演计划' })
  }
  return steps
}

function hasObsoletePlanRows(database: Database.Database, table: string, idColumn: string, payloadColumn: string): boolean {
  const rows = database.prepare(`SELECT ${idColumn} AS id, ${payloadColumn} AS payload FROM ${table}`)
    .all() as Array<{ id: string; payload: string }>
  return rows.some((row) => row.id === ROLEPLAY_PLAN_ENTRY_ID || payloadKind(row.payload) === 'roleplay_plan')
}

function payloadKind(raw: string): string {
  try {
    const value: unknown = JSON.parse(raw)
    return value && typeof value === 'object' && !Array.isArray(value)
      && typeof (value as Record<string, unknown>).kind === 'string'
      ? (value as Record<string, unknown>).kind as string
      : ''
  } catch { return '' }
}

function deleteObsoletePlanRows(database: Database.Database): void {
  database.prepare(`DELETE FROM agent_preset_entries WHERE entryId = ? OR json_extract(payloadJson, '$.kind') = 'roleplay_plan'`)
    .run(ROLEPLAY_PLAN_ENTRY_ID)
  database.prepare(`DELETE FROM agent_preset_version_entries WHERE entryId = ? OR json_extract(payloadJson, '$.kind') = 'roleplay_plan'`)
    .run(ROLEPLAY_PLAN_ENTRY_ID)
  database.prepare(`DELETE FROM conversation_setting_changes WHERE targetId = ? OR json_extract(payloadJson, '$.kind') = 'roleplay_plan'`)
    .run(ROLEPLAY_PLAN_ENTRY_ID)
  database.prepare(`DELETE FROM setting_library_version_entry_links WHERE entryId IN (
      SELECT entryId FROM setting_entry_contents WHERE entryId = ? OR json_extract(payloadJson, '$.kind') = 'roleplay_plan'
    )`).run(ROLEPLAY_PLAN_ENTRY_ID)
  database.prepare(`DELETE FROM setting_library_entry_links WHERE entryId IN (
      SELECT entryId FROM setting_entry_contents WHERE entryId = ? OR json_extract(payloadJson, '$.kind') = 'roleplay_plan'
    )`).run(ROLEPLAY_PLAN_ENTRY_ID)
  database.prepare(`DELETE FROM setting_entry_contents WHERE entryId = ? OR json_extract(payloadJson, '$.kind') = 'roleplay_plan'`)
    .run(ROLEPLAY_PLAN_ENTRY_ID)
}

function tableExists(database: Database.Database, name: string): boolean {
  return Boolean(database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name))
}

function columnExists(database: Database.Database, table: string, column: string): boolean {
  return (database.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[])
    .some((item) => item.name === column)
}

function readLegacyWebSearchSettings(row: LegacyToolConfigRow): WebSearchSettingsRow {
  let value: unknown
  try {
    value = JSON.parse(row.payloadJson)
  } catch (error) {
    throw new DesktopError(ELECKOI_FAILURE_CODES.storageCorrupt, '旧联网搜索配置已损坏，无法整理。', { what: '旧联网搜索配置' })
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, '旧联网搜索配置不是对象，无法整理。', { what: '旧联网搜索配置' })
  }
  const webSearch = (value as Record<string, unknown>).webSearch
  if (webSearch === undefined) {
    return { mode: 'provider_native', maxResults: 5, tavilyApiKey: '', updatedAt: row.updatedAt }
  }
  if (!webSearch || typeof webSearch !== 'object' || Array.isArray(webSearch)) {
    throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, '旧联网搜索配置格式无效，无法整理。', { what: '旧联网搜索配置' })
  }
  const source = webSearch as Record<string, unknown>
  const mode = source.mode
  const maxResults = source.maxResults
  if (mode !== 'provider_native' && mode !== 'tavily') throw new DesktopError(ELECKOI_FAILURE_CODES.dataLegacyMismatch, '旧联网搜索模式无效，无法整理。', { what: '旧联网搜索模式' })
  if (maxResults !== 3 && maxResults !== 5 && maxResults !== 8) throw new DesktopError(ELECKOI_FAILURE_CODES.dataLegacyMismatch, '旧联网搜索结果数量无效，无法整理。', { what: '旧联网搜索结果数量' })
  if (typeof source.tavilyApiKey !== 'string') throw new DesktopError(ELECKOI_FAILURE_CODES.dataLegacyMismatch, '旧 Tavily 凭据格式无效，无法整理。', { what: '旧 Tavily 凭据' })
  return { mode, maxResults, tavilyApiKey: source.tavilyApiKey, updatedAt: row.updatedAt }
}
