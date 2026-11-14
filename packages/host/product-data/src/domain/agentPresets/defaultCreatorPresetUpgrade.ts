import type Database from 'better-sqlite3'
import { DEFAULT_AGENT_PRESET_IDS, type AgentPresetPurpose } from '@shared/contracts/presets/schemas'
import { defaultCreatorPresetEntries } from '@shared/contracts/presets/builtIns'
import { defaultRoleplayPlanSettings } from '@shared/contracts/presets/roleplayPlan'
import { CREATOR_AGENT_TOOL_GROUP_IDS, DEFAULT_AGENT_TOOL_GROUP_IDS } from '@product-data/domain/agentTools'

/** Shared seed contents for new presets and the one-time built-in replacement. */
export function defaultPresetContents(purpose: AgentPresetPurpose): Array<[string, string]> {
  const enabledIds = purpose === 'creator' ? [...CREATOR_AGENT_TOOL_GROUP_IDS] : [...DEFAULT_AGENT_TOOL_GROUP_IDS]
  return [
    ['usage_instructions', ''],
    ['timeline', '[]'],
    ['prompt_positions', '[]'],
    ['regex_rules', '[]'],
    ['tool_configuration', JSON.stringify({
      version: 6,
      includedGroupIds: enabledIds,
      enabledGroupIds: enabledIds,
      roleplayPlan: defaultRoleplayPlanSettings()
    })]
  ]
}

// RETIRE WHEN: all supported installations/backups carry the complete default
// Creator replacement's completion marker. Remove the startup call and
// replacement-only tests then; retain the v13 migration until v13 upgrades retire.
// The marker belongs only to the built-in row, is not exported with presets and
// is written last in the caller's transaction. Later edits remain user-owned.
const COMPLETED = 'builtin_creator_workspace_upgrade'

/** Replace the fixed built-in completely once, including edited saved versions. Caller owns the transaction. */
export function upgradeDefaultCreatorPreset(database: Database.Database): void {
  const id = DEFAULT_AGENT_PRESET_IDS.creator
  if (database.prepare('SELECT 1 FROM agent_preset_contents WHERE presetId=? AND kind=? AND content=?').get(id, COMPLETED, '1')) return
  if (!database.prepare('SELECT 1 FROM agent_presets WHERE id=?').get(id)) return
  const versions = database.prepare('SELECT versionId FROM agent_preset_versions WHERE presetId=?').all(id) as { versionId: string }[]
  const contents = defaultPresetContents('creator')
  const entries = defaultCreatorPresetEntries()
  database.prepare(`UPDATE agent_presets SET name=?, purpose='creator', modelFamily='general', modelTagsJson=?,
    libraryGroupId='', authorName='', authorAvatarPath='', sortIndex=0, expandedGroupIdsJson='[]' WHERE id=?`)
    .run('默认创作预设', JSON.stringify([{ id: 'general', label: '通用', providerId: '' }]), id)
  database.prepare("UPDATE agent_preset_versions SET name=?, expandedGroupIdsJson='[]' WHERE presetId=?").run('默认创作预设', id)
  for (const table of ['agent_preset_contents', 'agent_preset_entries', 'agent_preset_groups',
    'agent_preset_version_contents', 'agent_preset_version_entries', 'agent_preset_version_groups']) {
    database.prepare(`DELETE FROM ${table} WHERE presetId=?`).run(id)
  }
  // Old named configurations must not restore a script or regex after replacement.
  for (const table of ['script_libraries', 'editor_library_versions', 'regex_libraries']) {
    database.prepare(`DELETE FROM ${table} WHERE presetId=?`).run(id)
  }
  const insertContent = database.prepare('INSERT INTO agent_preset_contents (presetId,kind,content) VALUES (?,?,?)')
  const insertEntry = database.prepare('INSERT INTO agent_preset_entries (presetId,entryId,sortIndex,payloadJson) VALUES (?,?,?,?)')
  const insertVersionContent = database.prepare('INSERT INTO agent_preset_version_contents (presetId,versionId,kind,content) VALUES (?,?,?,?)')
  const insertVersionEntry = database.prepare('INSERT INTO agent_preset_version_entries (presetId,versionId,entryId,sortIndex,payloadJson) VALUES (?,?,?,?,?)')
  for (const [kind, content] of contents) insertContent.run(id, kind, content)
  entries.forEach((entry, index) => insertEntry.run(id, entry.id, index, JSON.stringify(entry)))
  for (const { versionId } of versions) {
    for (const [kind, content] of contents) insertVersionContent.run(id, versionId, kind, content)
    entries.forEach((entry, index) => insertVersionEntry.run(id, versionId, entry.id, index, JSON.stringify(entry)))
  }
  insertContent.run(id, COMPLETED, '1')
}
