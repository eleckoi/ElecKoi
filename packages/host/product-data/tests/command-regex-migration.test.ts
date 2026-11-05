import { CURRENT_SCHEMA_VERSION } from '../src/storage/sqlite/schemaVersion'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { expect, it } from 'vitest'
import { legacyCommonSchemaSql as commonSchemaSql } from './helpers/conversationStorageV11'
import { installSchema } from '../src/storage/sqlite/installSchema'
import { regexRuleSchema } from '../../../shared/src/contracts/regex/schemas'
import { decodeRegexDocuments } from '../../../shared/src/foundation/regexRuleTransfer'

it('consolidates editor storage and command-target removal in v11 to v12 while preserving rule text and other data after reopen', () => {
  const directory = mkdtempSync(join(tmpdir(), 'eleckoi-command-regex-')), path = join(directory, 'synthetic.sqlite3')
  let db = new Database(path)
  try {
    db.exec(commonSchemaSql.replace('PRAGMA user_version = 12', 'PRAGMA user_version = 11'))
    db.exec('DROP TABLE IF EXISTS display_template_libraries; DROP TABLE editor_library_versions')
    // Configuration rows are synthetic; foreign keys are restored before migration.
    db.pragma('foreign_keys = OFF')
    const rules = [
      { id: 'synthetic-command', name: 'Synthetic command', pattern: 'SYNTHETIC', replacement: 'CHANGED', targets: ['SlashCommand'], enabled: true, displayOnly: true, promptOnly: false, runOnEdit: false, order: 0 },
      { id: 'synthetic-mixed', name: 'Synthetic mixed', pattern: 'UNCHANGED', replacement: 'VALUE', targets: ['SlashCommand', 'Reasoning'], enabled: true, displayOnly: true, promptOnly: false, runOnEdit: false, order: 1 },
    ]
    db.prepare('INSERT INTO global_regex_rules (id,name,pattern,replacement,targetsJson,enabled,displayOnly,promptOnly,runOnEdit,sortIndex) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run(rules[0]!.id, rules[0]!.name, rules[0]!.pattern, rules[0]!.replacement, JSON.stringify(rules[0]!.targets), 1, 1, 0, 0, 0)
    db.prepare('INSERT INTO agent_preset_contents (presetId,kind,content) VALUES (?,?,?)').run('synthetic-preset', 'regex_rules', JSON.stringify(rules))
    db.prepare('INSERT INTO agent_preset_version_contents (presetId,versionId,kind,content) VALUES (?,?,?,?)')
      .run('synthetic-preset', 'synthetic-version', 'regex_rules', JSON.stringify(rules))
    // Supply the actual owner records using their existing schema defaults.
    db.prepare('INSERT INTO agent_presets (id,name,modelFamily,sortIndex,expandedGroupIdsJson,activeVersionId) VALUES (?,?,?,?,?,?)')
      .run('synthetic-preset', 'Synthetic preset', 'general', 0, '[]', 'synthetic-version')
    db.prepare('INSERT INTO agent_preset_contents (presetId,kind,content) VALUES (?,?,?)')
      .run('synthetic-preset', 'instructions', 'Preserved instructions')
    db.prepare('INSERT INTO agent_preset_versions (presetId,versionId,versionNumber,name,createdAtEpochMs,expandedGroupIdsJson) VALUES (?,?,?,?,?,?)')
      .run('synthetic-preset', 'synthetic-version', 1, 'Synthetic version', 1, '[]')
    db.pragma('foreign_keys = ON')
    installSchema(db)
    expect(db.pragma('user_version', { simple: true })).toBe(CURRENT_SCHEMA_VERSION)
    const global = db.prepare('SELECT targetsJson,enabled,pattern,replacement FROM global_regex_rules').get() as Record<string, unknown>
    expect(global).toEqual({ targetsJson: '[]', enabled: 0, pattern: 'SYNTHETIC', replacement: 'CHANGED' })
    for (const table of ['agent_preset_contents', 'agent_preset_version_contents']) {
      const row = db.prepare(`SELECT content FROM ${table} WHERE kind='regex_rules'`).get() as { content: string }
      const saved = JSON.parse(row.content)
      expect(saved[0]).toEqual({ ...rules[0], targets: [], enabled: false })
      expect(saved[1]).toEqual({ ...rules[1], targets: ['Reasoning'] })
      expect(saved.map((rule: unknown) => regexRuleSchema.parse(rule))).toHaveLength(2)
    }
    expect(db.prepare('SELECT count(*) AS count FROM editor_library_versions').get()).toEqual({ count: 0 })
    expect(db.prepare("SELECT 1 FROM sqlite_master WHERE name='display_template_libraries'").get()).toBeUndefined()
    db.close(); db = new Database(path); installSchema(db)
    expect(db.prepare("SELECT content FROM agent_preset_contents WHERE kind='instructions'").get()).toEqual({ content: 'Preserved instructions' })
    expect(db.pragma('foreign_key_check')).toEqual([])
  } finally { db.close(); rmSync(directory, { recursive: true, force: true }) }
}, 30000)

it('rejects removed command targets in imported files instead of treating them as AI reply rules', () => {
  const decoded = decodeRegexDocuments([{ displayName: 'synthetic-command.json', json: JSON.stringify({ pattern: 'SYNTHETIC', targets: ['SlashCommand'] }) }], 'Global')
  expect(decoded.rules).toEqual([])
  expect(decoded.failedFileNames).toEqual(['synthetic-command.json'])
  const empty = decodeRegexDocuments([{ displayName: 'synthetic-empty.json', json: JSON.stringify({ pattern: 'SYNTHETIC', targets: [], enabled: false }) }], 'Global')
  expect(empty.rules[0]!.rule.targets).toEqual([])
})

it('rolls the entire v11 to v12 migration back when a historical rule cannot be decoded', () => {
  const directory = mkdtempSync(join(tmpdir(), 'eleckoi-command-regex-rollback-')), path = join(directory, 'synthetic.sqlite3')
  const db = new Database(path)
  try {
    db.exec(commonSchemaSql.replace('PRAGMA user_version = 12', 'PRAGMA user_version = 11'))
    db.exec('DROP TABLE IF EXISTS display_template_libraries; DROP TABLE editor_library_versions')
    db.prepare('INSERT INTO global_regex_rules (id,name,pattern,replacement,targetsJson,enabled,displayOnly,promptOnly,runOnEdit,sortIndex) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run('synthetic-command', 'Synthetic command', 'SYNTHETIC', 'CHANGED', '["SlashCommand"]', 1, 1, 0, 0, 0)
    db.prepare('INSERT INTO agent_presets (id,name,modelFamily,sortIndex,expandedGroupIdsJson) VALUES (?,?,?,?,?)')
      .run('synthetic-preset', 'Synthetic preset', 'general', 0, '[]')
    db.prepare('INSERT INTO agent_preset_contents (presetId,kind,content) VALUES (?,?,?)').run('synthetic-preset', 'regex_rules', 'invalid JSON')
    expect(() => installSchema(db)).toThrow()
    expect(db.pragma('user_version', { simple: true })).toBe(11)
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('display_template_libraries','editor_library_versions')").all()).toEqual([])
    expect(db.prepare('SELECT targetsJson,enabled FROM global_regex_rules').get()).toEqual({ targetsJson: '["SlashCommand"]', enabled: 1 })
    expect(db.prepare('SELECT content FROM agent_preset_contents').get()).toEqual({ content: 'invalid JSON' })
  } finally { db.close(); rmSync(directory, { recursive: true, force: true }) }
}, 30000)
