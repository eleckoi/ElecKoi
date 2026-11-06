import type Database from 'better-sqlite3'

export const scriptLibrariesSql = "CREATE TABLE IF NOT EXISTS `script_libraries` (`scope` TEXT NOT NULL, `ownerId` TEXT NOT NULL, `characterId` TEXT, `presetId` TEXT, `enabled` INTEGER NOT NULL, `revision` INTEGER NOT NULL, `treesJson` TEXT NOT NULL, `variablesJson` TEXT NOT NULL, PRIMARY KEY(`scope`, `ownerId`), FOREIGN KEY(`characterId`) REFERENCES `characters`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE , FOREIGN KEY(`presetId`) REFERENCES `agent_presets`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE , CHECK (`enabled` IN (0, 1) AND `revision` >= 0), CHECK ((`scope` = 'global' AND `ownerId` = '' AND `characterId` IS NULL AND `presetId` IS NULL) OR (`scope` = 'character' AND `characterId` IS NOT NULL AND `ownerId` = `characterId` AND `ownerId` <> '' AND `presetId` IS NULL) OR (`scope` = 'preset' AND `presetId` IS NOT NULL AND `ownerId` = `presetId` AND `ownerId` <> '' AND `characterId` IS NULL)))"

/** 新增脚本库关系，不改写已有角色、聊天、变量或预设。 */
// RETIRE WHEN: v9 and earlier database upgrades are no longer supported. Remove
// this step, its registration and upgrade-only tests; keep the current script storage.
export const migration0010 = {
  fromVersion: 9, toVersion: 10, name: 'native-script-libraries', acceptedBaselines: [] as const,
  apply(database: Database.Database): void { database.exec(scriptLibrariesSql) },
} as const
