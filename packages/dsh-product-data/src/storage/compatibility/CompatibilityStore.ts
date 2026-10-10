import { createHash } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'

export type CompatibilityValue = null | boolean | number | string | CompatibilityValue[] | { [key: string]: CompatibilityValue }
export interface CompatibilityStatement { sql: string; params?: CompatibilityValue[] }

/** Preserve old Author companion documents and independent plugin databases. */
export class CompatibilityStore {
  private readonly registry: Database.Database
  constructor(readonly root: string) {
    mkdirSync(root, { recursive: true })
    this.registry = new Database(join(root, 'registry.sqlite'))
    this.registry.pragma('journal_mode = WAL')
    this.registry.exec('CREATE TABLE IF NOT EXISTS documents (scope TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(scope,key))')
  }

  get(scope: string, key: string): CompatibilityValue {
    const row = this.registry.prepare('SELECT value FROM documents WHERE scope=? AND key=?').get(scope, key) as { value: string } | undefined
    return row ? JSON.parse(row.value) as CompatibilityValue : null
  }
  put(scope: string, key: string, value: CompatibilityValue): CompatibilityValue {
    this.registry.prepare('INSERT INTO documents(scope,key,value) VALUES(?,?,?) ON CONFLICT(scope,key) DO UPDATE SET value=excluded.value')
      .run(scope, key, JSON.stringify(value))
    return value
  }
  delete(scope: string, key: string): number {
    return this.registry.prepare('DELETE FROM documents WHERE scope=? AND key=?').run(scope, key).changes
  }
  deleteScope(scope: string): number {
    return this.registry.prepare('DELETE FROM documents WHERE scope=?').run(scope).changes
  }
  list(scope: string): { [key: string]: CompatibilityValue } {
    const rows = this.registry.prepare('SELECT key,value FROM documents WHERE scope=? ORDER BY key').all(scope) as Array<{ key: string; value: string }>
    return Object.fromEntries(rows.map(row => [row.key, JSON.parse(row.value) as CompatibilityValue]))
  }
  scopes(prefix: string): string[] {
    return (this.registry.prepare('SELECT DISTINCT scope FROM documents WHERE substr(scope,1,?)=? ORDER BY scope').all([...prefix].length, prefix) as Array<{ scope: string }>).map(row => row.scope)
  }
  atomic<T>(operation: () => T): T { return this.registry.transaction(operation)() }

  sql(pluginId: string, name: string, statements: CompatibilityStatement[], transaction: boolean): CompatibilityValue[] {
    const identity = createHash('sha256').update(`${pluginId}/${name}`).digest('hex')
    const database = new Database(join(this.root, `${identity}.sqlite`))
    database.defaultSafeIntegers(true)
    const execute = (): CompatibilityValue[] => statements.map(item => {
      const statement = database.prepare(item.sql)
      const params = (item.params ?? []).map(value => {
        if (value === null || typeof value === 'string' || typeof value === 'number') return value
        if (typeof value === 'boolean') return Number(value)
        throw new TypeError('SQLite parameters must be strings, numbers, booleans or null')
      })
      const rows = statement.reader ? statement.all(...params).map(row => jsonRow(row as Record<string, unknown>)) : []
      if (!statement.reader) statement.run(...params)
      const status = database.prepare('SELECT changes() AS changes,last_insert_rowid() AS lastInsertId').get() as Record<string, unknown>
      return { rows, ...jsonRow(status) }
    })
    try { return transaction ? database.transaction(execute)() : execute() }
    finally { database.close() }
  }
  deleteWorldbook(name: string): boolean {
    return this.atomic(() => {
      const removed = this.delete('worldbooks', name) > 0
      for (const [scope, value] of Object.entries(this.list('bindings'))) {
        if (!Array.isArray(value)) throw new TypeError(`Invalid worldbook binding: ${scope}`)
        if (value.includes(name)) this.put('bindings', scope, value.filter(item => item !== name))
      }
      for (const [character, value] of Object.entries(this.list('worldbook-primaries'))) {
        if (isObject(value) && value.primary === name) this.put('worldbook-primaries', character, { ...value, primary: null })
      }
      return removed
    })
  }
  close(): void { this.registry.close() }
}

function jsonRow(row: Record<string, unknown>): { [key: string]: CompatibilityValue } {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => {
    if (typeof value === 'bigint') {
      if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) return [key, value.toString()]
      return [key, Number(value)]
    }
    if (Buffer.isBuffer(value)) return [key, value.toString('base64')]
    if (value === null || typeof value === 'string' || typeof value === 'number') return [key, value]
    throw new TypeError(`Unsupported SQLite column value: ${key}`)
  }))
}
function isObject(value: CompatibilityValue): value is { [key: string]: CompatibilityValue } {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
