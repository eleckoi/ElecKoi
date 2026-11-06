import type Database from 'better-sqlite3'

export const schemaV10PresetStateSql = 'CREATE TABLE IF NOT EXISTS `agent_preset_state` (`singletonId` INTEGER NOT NULL, `activePresetId` TEXT NOT NULL, PRIMARY KEY(`singletonId`))'

// RETIRE WHEN: v10 and earlier database upgrades are no longer supported. Remove
// this step, its old-state SQL, registration and upgrade-only tests together.
export const migration0011 = {
  fromVersion: 10,
  toVersion: 11,
  name: 'preset-purposes',
  acceptedBaselines: ['eleckoi-common'],
  apply(database: Database.Database): void {
    const state = database.prepare('SELECT activePresetId FROM agent_preset_state WHERE singletonId = 1').get() as { activePresetId: string } | undefined
    database.exec("ALTER TABLE agent_presets ADD COLUMN `purpose` TEXT NOT NULL DEFAULT 'roleplay'")
    database.exec("ALTER TABLE agent_preset_library_groups ADD COLUMN `purpose` TEXT NOT NULL DEFAULT 'roleplay'")
    database.exec('DROP TABLE agent_preset_state')
    database.exec('CREATE TABLE IF NOT EXISTS `agent_preset_state` (`purpose` TEXT NOT NULL, `activePresetId` TEXT NOT NULL, PRIMARY KEY(`purpose`))')
    if (state) database.prepare('INSERT INTO agent_preset_state (purpose, activePresetId) VALUES (?, ?)').run('roleplay', state.activePresetId)
  }
} as const
