import type Database from 'better-sqlite3'
import { commonSchemaSql } from './commonSchemaSql'

// RETIRE WHEN: direct upgrades from schema v17 and earlier are no longer supported;
// remove this step, its registration and the v17 activity upgrade tests together.
export const migration0018 = {
  fromVersion: 17, toVersion: 18, name: 'character-catalog-activity', acceptedBaselines: [] as const,
  apply(database: Database.Database): void {
    database.exec(commonSchemaSql.split('\n').find(line => line.startsWith('CREATE TABLE IF NOT EXISTS `character_catalog_activity`'))!)
  }
} as const
