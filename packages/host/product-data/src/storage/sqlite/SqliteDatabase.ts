import type Database from 'better-sqlite3'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type { DatabaseSchema } from './schema'

export type ElecKoiDatabase = BetterSQLite3Database<DatabaseSchema>

/** Database surface supplied by the DSH Host to product repositories. */
export interface ElecKoiSqliteStore {
  readonly db: ElecKoiDatabase
  readonly native: Database.Database
  withWriteTx<TResult>(operation: (db: ElecKoiDatabase) => TResult): TResult
}
