import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { Session, SessionId, SessionStore } from '@deepseek-ai/dsh-session'
import { SessionProjectionRegistry } from '@deepseek-ai/dsh-session-projection'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageJson from '@deepseek-ai/dsh-storage-json'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import SessionProjectionCache, { projectionCacheDomainSpec } from '@deepseek-ai/dsh-session-projection-cache'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { retireRequestContextCache } from '../../src/host/request-cache-retirement.mjs'
import { ElecKoiConversationsApi } from '../../../../../host/product-api/lib/types/index.js'
import { conversationActivityProjection } from '../../src/host/conversation-preview.mjs'
const cleanups = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })
describe('bounded conversation catalog and retired request caches', () => {
  it('advances at regeneration start before any reply and replays one bounded activity value across repeated attempts', async () => {
    const ctx = new Context(), clock = vi.spyOn(Date, 'now')
    try {
      const registry = new SessionProjectionRegistry(ctx)
      await registry.register(conversationActivityProjection)
      const session = Session.create(SessionId('synthetic-activity'))
      const start = Date.parse('2026-11-06T10:00:00.000Z')
      for (let turn = 1; turn <= 50; turn++) {
        clock.mockReturnValue(start + turn * 1000)
        session.append('turn/start', { turn })
        expect(registry.snapshot(session).values.eleckoiConversationActivity).toBe(start + turn * 1000)
        clock.mockReturnValue(start + turn * 1000 + 100)
        session.append('turn/end', { turn, reason: { kind: 'completed' } })
      }
      const final = registry.snapshot(session).values.eleckoiConversationActivity
      expect(final).toBe(start + 50000)
      const replay = Session.create(session.id, session.snapshotEvents(), session.header)
      expect(registry.snapshot(replay).values.eleckoiConversationActivity).toBe(final)
      expect(JSON.stringify(final).length).toBe(JSON.stringify(start + 1000).length)
    } finally { clock.mockRestore(); await ctx.fiber.dispose() }
  })

  it('refreshes the catalog through one official list and never inspects each Session', async () => {
    const inspect = vi.fn(() => { throw new Error('不得读取正文') })
    const lastPromptAt = Date.parse('2026-11-06T10:00:00.000Z'), regeneratedAt = lastPromptAt + 2000
    const list = vi.fn(async () => ({ items: [{ sessionId: 'session-0', updatedAt: lastPromptAt,
      projections: { values: { eleckoiConversationPreview: '合成最新消息', eleckoiConversationActivity: regeneratedAt } } },
      { sessionId: 'session-49', updatedAt: lastPromptAt + 1000 }] }))
    const records = Array.from({ length: 50 }, (_, i) => ({ id: String(i), runtimeSessionId: `session-${i}`, preview: '合成开场', updatedAt: '2026-11-01T00:00:00.000Z' }))
    const items = await ElecKoiConversationsApi.prototype.list.call({
      productData: { readConversationCatalog: () => records }, ownerContext: { sessionController: { inspect, list } }
    }, new AbortController().signal)
    expect(list).toHaveBeenCalledOnce()
    expect(inspect).not.toHaveBeenCalled()
    expect(items.slice(0, 2).map(item => item.id)).toEqual(['0', '49'])
    expect(items[0].preview).toBe('合成最新消息')
    expect(items[0].updatedAt).toBe(new Date(regeneratedAt).toISOString())
    expect(items[2].preview).toBe('合成开场')
    expect(items[2].updatedAt).toBe(records[1].updatedAt)
    expect(records[0].updatedAt).toBe('2026-11-01T00:00:00.000Z')
  })

  it('removes old derived request cache rows through the official atomic update while retaining unrelated metadata', async () => {
    let record = { identity: { createdAt: 1 }, rows: {
      eleckoiRequestContexts: { ver: 1, seq: 0, val: { contexts: { 0: ['合成重复缓存'] } } },
      eleckoiRequestInput: { ver: 1, seq: 0, val: { instructions: '合成过期变换' } },
      title: { ver: 1, seq: 0, val: '合成标题' }
    } }
    const update = vi.fn(async (_id, fn) => { record = fn(record); return record })
    const ctx = { storageDomain: { get: () => ({ table: () => ({ entries: () => [['synthetic', record]], update }) }) } }
    await retireRequestContextCache(ctx)
    expect(record.rows).toEqual({ title: { ver: 1, seq: 0, val: '合成标题' } })
    await retireRequestContextCache(ctx)
    expect(update).toHaveBeenCalledOnce()
  })

  it('persists cache retirement through the official storage backend and survives a fresh open', async () => {
    const root = mkdtempSync(join(tmpdir(), 'eleckoi-cache-retirement-'))
    cleanups.push(() => rmSync(root, { recursive: true, force: true }))
    const open = async () => {
      const ctx = new Context()
      cleanups.push(() => ctx.fiber.dispose())
      await ctx.plugin(Storage)
      for (const [plugin, config] of [[StorageJson, { root }], [StorageDomain, { backend: 'json' }]]) {
        const { name, inject, apply, Config } = plugin
        await ctx.plugin({ name, inject, apply, Config }, config)
      }
      await ctx.plugin(SessionStore)
      await ctx.plugin(SessionProjectionRegistry)
      await ctx.plugin(SessionProjectionCache, { writeEveryEvents: 100, writeIntervalMs: 60000 })
      return { ctx, table: ctx.storageDomain.get(projectionCacheDomainSpec.name).table('sessions') }
    }
    const first = await open()
    const id = SessionId('synthetic-cache')
    const record = { identity: { createdAt: 1 }, rows: {
      eleckoiRequestContexts: { ver: 1, seq: 0, val: { contexts: { 0: ['合成重复缓存'] } } },
      eleckoiRequestInput: { ver: 1, seq: 0, val: { instructions: '合成过期变换' } },
      title: { ver: 1, seq: 0, val: '合成标题' }
    } }
    await first.table.put(id, record)
    await retireRequestContextCache(first.ctx)
    await first.ctx.fiber.dispose()
    const second = await open()
    expect(second.table.get(id)).toEqual({ identity: record.identity, rows: { title: record.rows.title } })
    await retireRequestContextCache(second.ctx)
    expect(second.table.get(id).rows.title.val).toBe('合成标题')
  }, 20000)
})
