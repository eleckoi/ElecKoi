import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { installSchema } from './installSchema'
import { recoverInterruptedState } from './recoverInterruptedState'
import { schema, type DatabaseSchema } from './schema'
import { closeSync, existsSync, openSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

export type ElecKoiDatabase = BetterSQLite3Database<DatabaseSchema>

export class SqliteDatabase {
  private sqlite: Database.Database | undefined
  private drizzleDatabase: ElecKoiDatabase | undefined

  constructor(private readonly path: string) {}

  get db(): ElecKoiDatabase {
    if (this.drizzleDatabase === undefined) throw new Error('数据库尚未初始化。')
    return this.drizzleDatabase
  }

  get native(): Database.Database {
    if (this.sqlite === undefined) throw new Error('数据库尚未初始化。')
    return this.sqlite
  }

  open(): void {
    if (this.sqlite !== undefined) return
    const connection = new Database(this.path)
    try {
      connection.pragma('foreign_keys = ON')
      connection.pragma('busy_timeout = 5000')
      installSchema(connection)
      connection.pragma('journal_mode = WAL')
      connection.pragma('secure_delete = FAST')
      recoverInterruptedState(connection)
      this.drizzleDatabase = drizzle(connection, { schema })
      this.sqlite = connection
    } catch (error) {
      connection.close()
      throw error
    }
  }

  withWriteTx<TResult>(operation: (db: ElecKoiDatabase) => TResult): TResult {
    const transaction = this.native.transaction(() => operation(this.db))
    return transaction.immediate()
  }

  close(): void {
    if (this.sqlite === undefined) return
    this.sqlite.pragma('wal_checkpoint(TRUNCATE)')
    this.sqlite.close()
    this.sqlite = undefined
    this.drizzleDatabase = undefined
  }

  /** Consistent database-only snapshot, including WAL; this is not an Android v3 backup archive. */
  async backupTo(path: string): Promise<void> {
    if (resolve(path) === resolve(this.path) || existsSync(path)) throw new Error('备份目标必须是新的文件。')
    const target = resolve(path)
    closeSync(openSync(target, 'wx'))
    try {
      await this.native.backup(target)
    } catch (error) {
      rmSync(target, { force: true })
      throw error
    }
  }

}
