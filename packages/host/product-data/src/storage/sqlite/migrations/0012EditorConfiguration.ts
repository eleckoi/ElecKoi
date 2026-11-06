import type Database from 'better-sqlite3'
import { removeCommandRegexTarget } from './removedRegexTargets'
import { migrateConversationStateStorage } from './conversationStateStorage'
import { addRegexLibraryEnablement } from './regexLibraryEnablement'

export const displayTemplatesSql = "CREATE TABLE IF NOT EXISTS `display_template_libraries` (`scope` TEXT NOT NULL, `ownerId` TEXT NOT NULL, `characterId` TEXT, `presetId` TEXT, `enabled` INTEGER NOT NULL, `revision` INTEGER NOT NULL, `templatesJson` TEXT NOT NULL, PRIMARY KEY(`scope`, `ownerId`), FOREIGN KEY(`characterId`) REFERENCES `characters`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE , FOREIGN KEY(`presetId`) REFERENCES `agent_presets`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE , CHECK (`enabled` IN (0, 1) AND `revision` >= 0 AND json_valid(`templatesJson`)), CHECK ((`scope` = 'global' AND `ownerId` = '' AND `characterId` IS NULL AND `presetId` IS NULL) OR (`scope` = 'character' AND `characterId` IS NOT NULL AND `ownerId` = `characterId` AND `ownerId` <> '' AND `presetId` IS NULL) OR (`scope` = 'preset' AND `presetId` IS NOT NULL AND `ownerId` = `presetId` AND `ownerId` <> '' AND `characterId` IS NULL)))"

export const editorLibraryVersionsSql = "CREATE TABLE IF NOT EXISTS `editor_library_versions` (`kind` TEXT NOT NULL, `scope` TEXT NOT NULL, `ownerId` TEXT NOT NULL, `characterId` TEXT, `presetId` TEXT, `revision` INTEGER NOT NULL, `stateJson` TEXT NOT NULL, PRIMARY KEY(`kind`, `scope`, `ownerId`), FOREIGN KEY(`characterId`) REFERENCES `characters`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE , FOREIGN KEY(`presetId`) REFERENCES `agent_presets`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE , CHECK (`kind` IN ('scripts', 'displayTemplates', 'regex') AND `revision` >= 0 AND json_valid(`stateJson`)), CHECK ((`scope` = 'global' AND `ownerId` = '' AND `characterId` IS NULL AND `presetId` IS NULL) OR (`scope` = 'character' AND `characterId` IS NOT NULL AND `ownerId` = `characterId` AND `ownerId` <> '' AND `presetId` IS NULL) OR (`scope` = 'preset' AND `presetId` IS NOT NULL AND `ownerId` = `presetId` AND `ownerId` <> '' AND `characterId` IS NULL)))"

/** 显示模板、完整编辑器版本和聊天状态存储在同一次未发布升级中建立。 */
// RETIRE WHEN: v11 and earlier database upgrades and the registered development
// structures invoking this step are no longer supported. Remove the step, its
// registration and dedicated tests; remove helpers only after their other upgrade
// or archive-import callers have retired. Keep current editor and conversation storage.
export const migration0012 = {
  fromVersion: 11, toVersion: 12, name: 'editor-configuration', acceptedBaselines: [] as const,
  apply(database: Database.Database): void {
    database.exec(displayTemplatesSql)
    database.exec(editorLibraryVersionsSql)
    removeCommandRegexTarget(database)
    migrateConversationStateStorage(database)
    addRegexLibraryEnablement(database)
  },
} as const
