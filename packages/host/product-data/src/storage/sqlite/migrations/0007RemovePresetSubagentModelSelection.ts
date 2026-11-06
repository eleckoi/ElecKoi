import type Database from 'better-sqlite3'
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes'
import { DesktopError } from '@shared/foundation/DesktopError'

const TOOL_CONFIGURATION_KIND = 'tool_configuration'
const CURRENT_TOOL_CONFIGURATION_VERSION = 5

type StoredContentRow = {
  identity: string
  content: string
}

function migrateContent(content: string, identity: string): string {
  let value: unknown
  try {
    value = JSON.parse(content)
  } catch {
    throw new DesktopError(ELECKOI_FAILURE_CODES.storageCorrupt, `预设工具配置无法解析：${identity}。`, { what: '预设工具配置' })
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, `预设工具配置格式无效：${identity}。`, { what: '预设工具配置' })
  }
  const configuration = value as Record<string, unknown>
  delete configuration.subagentModelSelection
  configuration.version = CURRENT_TOOL_CONFIGURATION_VERSION
  return JSON.stringify(configuration)
}

function migrateCurrentPresetContents(database: Database.Database): void {
  const rows = database.prepare(`
    SELECT presetId AS identity, content
    FROM agent_preset_contents
    WHERE kind = ?
  `).all(TOOL_CONFIGURATION_KIND) as StoredContentRow[]
  const update = database.prepare(`
    UPDATE agent_preset_contents
    SET content = ?
    WHERE presetId = ? AND kind = ?
  `)
  for (const row of rows) {
    update.run(migrateContent(row.content, row.identity), row.identity, TOOL_CONFIGURATION_KIND)
  }
}

function migratePresetVersionContents(database: Database.Database): void {
  const rows = database.prepare(`
    SELECT presetId || ':' || versionId AS identity, presetId, versionId, content
    FROM agent_preset_version_contents
    WHERE kind = ?
  `).all(TOOL_CONFIGURATION_KIND) as Array<StoredContentRow & { presetId: string; versionId: string }>
  const update = database.prepare(`
    UPDATE agent_preset_version_contents
    SET content = ?
    WHERE presetId = ? AND versionId = ? AND kind = ?
  `)
  for (const row of rows) {
    update.run(
      migrateContent(row.content, row.identity),
      row.presetId,
      row.versionId,
      TOOL_CONFIGURATION_KIND
    )
  }
}

/**
 * Schema v7 removes the duplicate child-model route from current and versioned
 * product presets. Subagent model authorization now belongs exclusively to
 * DSH's Host setting, while presets retain only prompts, tools and tool policy.
 *
 * This is a one-way data migration. Runtime code does not read the removed key.
 *
 * RETIRE WHEN: 停止支持所有低于 schema v7 的数据库直接升级后，移除此步骤、
 * installSchema 登记和对应 v6 fixture。当前预设与历史版本都必须完成字段转换；
 * 不能因本机已升级而删除，其他旧安装首次打开 v7+ 时仍需要执行一次。
 */
export const migration0007 = {
  fromVersion: 6,
  toVersion: 7,
  name: 'remove-preset-subagent-model-selection',
  acceptedBaselines: [] as const,
  apply(database: Database.Database): void {
    migrateCurrentPresetContents(database)
    migratePresetVersionContents(database)
  }
} as const
