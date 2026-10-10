import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { SqliteDatabase } from '../packages/dsh-product-data/src/storage/sqlite/SqliteDatabase'
import { CompatibilityStore } from '../packages/dsh-product-data/src/storage/compatibility/CompatibilityStore'
import { CompatibilityWorldbookHost } from '../packages/dsh-product-api/lib/types/compatibility-worldbook-host.js'

const cleanup: (() => void)[] = []
afterEach(() => { for (const dispose of cleanup.splice(0).reverse()) dispose() })
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'eleckoi-compat-isolation-'))
  cleanup.push(() => {
    const child = relative(tmpdir(), directory)
    if (!child || child.startsWith('..') || isAbsolute(child)) throw new Error('Unexpected test cleanup path')
    rmSync(directory, { recursive: true, force: true })
  })
  const path = join(directory, 'product.sqlite3'), root = join(directory, 'author-plugins')
  const product = new SqliteDatabase(path)
  product.open()
  cleanup.push(() => product.close())
  const store = new CompatibilityStore(root)
  cleanup.push(() => store.close())
  const schema = () => product.native.prepare("SELECT name,sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY name").all()
  return { directory, path, root, product, store, schema }
}

describe('PR compatibility storage stays outside the main product schema', () => {
  it('preserves the product schema and version while saving SDK documents and plugin SQL across reopen', () => {
    const f = fixture(), before = f.schema()
    f.store.put('worldbooks', 'synthetic-book', { entries: [{ uid: 1, depth: 99, content: 'synthetic setting' }] })
    f.store.put('settings', 'synthetic-plugin', { enabled: true })
    f.store.sql('synthetic-plugin', 'cache', [{ sql: 'CREATE TABLE plugin_items (id TEXT PRIMARY KEY, value TEXT)' },
      { sql: 'INSERT INTO plugin_items VALUES (?,?)', params: ['item', 'synthetic'] }], true)
    expect(f.schema()).toEqual(before)
    expect(f.product.native.pragma('user_version', { simple: true })).toBe(9)
    const registry = new Database(join(f.root, 'registry.sqlite'), { readonly: true })
    try {
      expect(registry.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()).toEqual([{ name: 'documents' }])
      expect(registry.prepare("SELECT value FROM documents WHERE scope='worldbooks'").get()).toBeDefined()
    } finally { registry.close() }
    const reopened = new CompatibilityStore(f.root)
    try {
      expect(reopened.get('worldbooks', 'synthetic-book')).toMatchObject({ entries: [{ depth: 99 }] })
      expect(reopened.sql('synthetic-plugin', 'cache', [{ sql: 'SELECT * FROM plugin_items' }], false)[0])
        .toMatchObject({ rows: [{ id: 'item', value: 'synthetic' }] })
      expect(f.schema()).toEqual(before)
    } finally { reopened.close() }
  }, 30_000)

  it('rolls back failed compatibility and plugin transactions without touching product tables', () => {
    const f = fixture(), before = f.schema()
    f.store.put('settings', 'plugin', { value: 'original' })
    expect(() => f.store.atomic(() => {
      f.store.put('settings', 'plugin', { value: 'changed' })
      throw new Error('synthetic failure')
    })).toThrow('synthetic failure')
    expect(f.store.get('settings', 'plugin')).toEqual({ value: 'original' })
    expect(() => f.store.sql('plugin', 'failed', [{ sql: 'CREATE TABLE items (id INTEGER PRIMARY KEY)' },
      { sql: 'INSERT INTO items VALUES (1)' }, { sql: 'INSERT INTO items VALUES (1)' }], true)).toThrow('UNIQUE')
    expect(f.store.sql('plugin', 'failed', [{ sql: "SELECT name FROM sqlite_master WHERE type='table' AND name='items'" }], false)[0])
      .toMatchObject({ rows: [] })
    expect(f.schema()).toEqual(before)
  }, 30_000)

  it('scans actual message history, retains timing in the separate store, and keeps scan bodies in Host memory', async () => {
    const f = fixture(), before = f.schema()
    f.store.put('worldbooks', 'synthetic-book', { entries: [{ uid: 1, content: 'activated setting',
      strategy: { type: 'selective', keys: ['earlier-key'], scan_depth: 3 }, position: { type: 'at_depth', depth: 99 } }] })
    f.store.put('bindings', 'global', ['synthetic-book'])
    const data = { compatibilityStore: () => f.store, readConversationDetails: () => ({ metadata: { characterId: '', characterName: '' } }) }
    const providers = { get: (key: string) => key === 'eleckoiCompatibilityGeneration' ? { tokenCount: () => 1 } : undefined }
    const catalog = { currentPersona: () => '', invoke: async () => ({}) }
    const messages = { read: async () => [{ content: 'earlier-key' }, { content: 'recent' }, { content: 'latest' }] }
    const host = new CompatibilityWorldbookHost(data as any, providers, catalog as any, messages as any, () => {})
    try {
      const request = { conversationId: 'chat', runtimePreparation: { conversationContext: { history: [{ role: 'assistant', content: 'opening only' }] } } as any,
        modelSnapshot: { contextWindow: 1000 }, currentPromptText: 'next input' }
      const dry = await host.prepareRound({ ...request, dryRun: true })
      expect(dry.capture.messages).toEqual(['earlier-key', 'recent', 'latest'])
      expect(dry.fragments[0]).toMatchObject({ content: 'activated setting', depth: 99 })
      expect(host.rounds.lastScan('chat')).toBeNull()
      expect(f.store.get('worldbook-timing', 'chat')).toBeNull()
      const round = await host.prepareRound(request)
      expect(host.rounds.lastScan('chat')).toMatchObject({ entries: [{ content: 'activated setting' }] })
      expect(f.store.get('worldbook-timing', 'chat')).not.toBeNull()
      expect(f.store.get('worldbook-scans', 'chat')).toBeNull()
      host.activate('session', round)
      expect(host.current('session')).toBe(round)
      host.release('session', 'chat')
      expect(host.current('session')).toBeUndefined()
      expect(host.rounds.lastScan('chat')).toBeNull()
      expect(f.schema()).toEqual(before)
    } finally { host.dispose() }
  }, 30_000)
})
