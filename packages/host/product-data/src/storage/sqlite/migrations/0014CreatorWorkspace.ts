import type Database from 'better-sqlite3'
import { upgradeDefaultCreatorPreset } from '@product-data/domain/agentPresets'

// RETIRE WHEN: v13 and earlier database upgrades are no longer supported, remove this step with its registration and regressions.
/** Replace the fixed built-in completely; the same one-time step repairs installations already past v14. */
export const migration0014 = {
  fromVersion: 13, toVersion: 14, name: 'creator-workspace', acceptedBaselines: [] as const,
  apply(database: Database.Database): void {
    upgradeDefaultCreatorPreset(database)
  },
} as const
