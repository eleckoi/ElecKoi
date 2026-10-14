import type Database from 'better-sqlite3'

export const globalSettingLibrarySql = 'CREATE TABLE IF NOT EXISTS `global_setting_library` (`id` TEXT NOT NULL, `payloadJson` TEXT NOT NULL, PRIMARY KEY(`id`))'

export const migration0012 = {
  fromVersion: 11, toVersion: 12, name: 'global-setting-library', acceptedBaselines: ['eleckoi-common'],
  apply(database: Database.Database): void { database.exec(globalSettingLibrarySql) }
} as const
