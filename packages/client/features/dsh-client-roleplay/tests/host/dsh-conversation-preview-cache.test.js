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
import { conversationActivityProjection, conversationPreviewProjection, rebuildConversationPreviewCache } from '../../src/host/conversation-preview.mjs'
import { ROLEPLAY_OUTPUT_EVENT, ROLEPLAY_REPLY_SOURCE, ROLEPLAY_REPLY_TOOL } from '../../src/host/roleplay-reply-tool.mjs'
const cleanups = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })
const previewKey = conversationPreviewProjection.key
const textBlock = text => [{ type: 'text', text }]
const input = text => ({ type: 'user/message', data: { source: { kind: 'user' }, content: textBlock(text) } })
const assistant = (turn, text, speaker, step = 1) => ({ type: 'assistant/message', surfaceOp: 'append', data: { turn, step,
  message: { content: [...textBlock(text), ...(speaker ? [{ type: 'tool-call', id: speaker, name: ROLEPLAY_REPLY_TOOL }] : [])] } } })
const selectSpeaker = (turn, speakerName, isError = false, step = 1) => ({ type: 'tool/result', data: {
  turn, step, message: { isError }, meta: { source: ROLEPLAY_REPLY_SOURCE, speaker: { kind: 'speech', speakerName } },
} })
const start = turn => ({ type: 'turn/start', data: { turn } })
const end = turn => ({ type: 'turn/end', data: { turn } })
const roleplayEvents = [start(1), input('你听见了吗'), assistant(1, '选角色前的文字'),
  assistant(1, '', '合成角色甲', 2), selectSpeaker(1, '合成角色甲', false, 2),
  assistant(1, '<合成角色甲>听见了。</合成角色甲>', 'ScenePartner', 3), selectSpeaker(1, 'ScenePartner', false, 3),
  assistant(1, '<ScenePartner>我再放一遍。</ScenePartner>', undefined, 4), end(1)]

describe('bounded conversation catalog and retired request caches', () => {
  it('uses the native text after each speaker selection and keeps the ordinary text path', () => {
    const preview = events => conversationPreviewProjection.wire.view(
      events.reduce(conversationPreviewProjection.apply, conversationPreviewProjection.init()))
    expect(preview(roleplayEvents)).toBe('听见了。\n\n我再放一遍。')
    const edited = [...roleplayEvents.slice(0, -1), {
      type: ROLEPLAY_OUTPUT_EVENT, data: { turn: 1, replySeq: 10, editedText: '修改后的正文', toolBacked: true },
    }, end(1)]
    expect(preview(edited)).toBe('修改后的正文')
    const multipartEdit = [...roleplayEvents.slice(0, -1), {
      type: ROLEPLAY_OUTPUT_EVENT, data: { turn: 1, replySeq: 10, editedText: '合成角色甲：等一下。\n\nScenePartner：录音机：已暂停。',
        editedBlocks: [{ id: 'one', text: '等一下。' }, { id: 'two', text: '录音机：已暂停。' }], toolBacked: true },
    }, end(1)]
    expect(preview(multipartEdit)).toBe('等一下。\n\n录音机：已暂停。')
    expect(preview([...roleplayEvents, input('下一句')])).toBe('下一句')
    const laterTurn = [start(2), selectSpeaker(2, 'ScenePartner', true), assistant(2, '直接写出的助手正文'), end(2)]
    expect(preview([...roleplayEvents, ...laterTurn])).toBe('直接写出的助手正文')
    expect(preview([start(2), { type: ROLEPLAY_OUTPUT_EVENT, data: { turn: 2, nativeText: true } }, input('开始'),
      { type: 'eleckoi/delegated-roleplay-reply', data: { status: 'complete', text: '合成角色正文' } },
      assistant(2, '合成调度总结。'), end(2)])).toBe('合成角色正文')
    expect(preview([start(2), assistant(2, '', 'ScenePartner'), selectSpeaker(2, 'ScenePartner'),
      assistant(2, `<ScenePartner>${'🌊'.repeat(300)}</ScenePartner>`, undefined, 2), end(2)])).toBe('🌊'.repeat(240))
  })

  it.each([
    [1, '已完成本轮回复。'],
    [2, { preview: '合成角色甲：听见了。\n\nScenePartner：我再放一遍。', turn: 0, reply: '' }],
  ])('replays an existing v%s catalog cache once from its own log and keeps the other stored rows', async (version, previousPreview) => {
    const ctx = new Context()
    cleanups.push(() => ctx.fiber.dispose())
    const registry = new SessionProjectionRegistry(ctx)
    await registry.register(conversationPreviewProjection)
    const session = Session.create(SessionId('synthetic-preview-upgrade'))
    const events = roleplayEvents.map((event, seq) => ({ ...event, seq, time: seq }))
    const eof = events.at(-1).seq
    const old = { identity: { formatVersion: session.header.version, createdAt: session.header.createdAt,
      cwd: session.header.cwd, isSeeded: session.header.isSeeded, inheritedEventCount: 0 }, rows: {
      [previewKey]: { ver: version, seq: eof, val: previousPreview },
      title: { ver: 1, seq: 0, val: '录音室' },
    } }
    const storage = new Map([[session.id, old], ['unrelated', old]])
    const open = vi.fn(async () => ({ header: session.header, inheritedEventCount: 0,
      read: async () => ({ events }), close: async () => {} }))
    const table = { entries: () => storage.entries(), async update(id, transform) {
      const value = transform(storage.get(id))
      storage.set(id, value)
      return value
    } }
    const publish = vi.fn()
    const upgradeCtx = { sessionProjections: registry, sessionPersistence: { open },
      storageDomain: { get: () => ({ table: () => table }) },
      eleckoiProductData: { readConversationCatalog: () => [{ runtimeSessionId: session.id }] },
      eleckoiConversationChanges: { publish }, logger: { warn: vi.fn() } }
    const signal = new AbortController().signal
    await rebuildConversationPreviewCache(upgradeCtx, signal)
    const upgraded = storage.get(session.id)
    expect(open).toHaveBeenCalledExactlyOnceWith(session.id, 'read', { signal })
    expect(upgraded.rows[previewKey].ver).toBe(conversationPreviewProjection.stateVersion)
    expect(registry.viewCheckpoint(upgraded.rows)[previewKey]).toBe('听见了。\n\n我再放一遍。')
    expect(upgraded.rows.title).toBe(old.rows.title)
    expect(storage.get('unrelated')).toBe(old)
    expect(publish).toHaveBeenCalledExactlyOnceWith({ kind: 'snapshot' })
    await rebuildConversationPreviewCache(upgradeCtx, signal)
    expect(open).toHaveBeenCalledTimes(1)
  })

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
