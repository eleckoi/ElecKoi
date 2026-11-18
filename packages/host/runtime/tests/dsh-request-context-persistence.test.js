import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import * as JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { SessionProjectionRegistry } from '@deepseek-ai/dsh-session-projection'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { afterEach, describe, expect, it } from 'vitest'

const cleanups = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })

async function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'request-context-'))
  cleanups.push(() => rmSync(root, { recursive: true, force: true }))
  const ctx = new Context()
  await ctx.plugin(JsonlSessionPersistence, { root, compression: 'none' })
  cleanups.push(() => ctx.fiber.dispose())
  const registry = new SessionProjectionRegistry(ctx)

  const session = Session.create(SessionId('annotation-test'))
  session.append('user/message', createUserMessage({ content: [{ type: 'text', text: '合成输入' }], source: { kind: 'user' } }), { surfaceOp: 'append' })
  session.append('turn/start', { turn: 1 })
  const step = session.append('step/start', { turn: 1, step: 1 })
  const context = [{ order: 1, messageId: 'synthetic', role: 'user', kind: 'user', title: '输入', source: 'user', anchor: '', content: '合成请求' }]
  session.append('eleckoi/request-context', { requestSeq: step.seq, context }, { ignorable: true })
  session.append('step/end', { turn: 1, step: 1 })
  session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  const handle = await ctx.sessionPersistence.create(session.header)
  await handle.append(session.snapshotEvents())
  await handle.flush()
  await handle.close()
  return { root, ctx, registry, session, context }
}

async function reopen(f) {
  // Use a fresh backend to avoid a previously decoded snapshot masking a disk regression.
  const ctx = new Context()
  await ctx.plugin(JsonlSessionPersistence, { root: f.root, compression: 'none' })
  try {
    const handle = await ctx.sessionPersistence.open(f.session.id, 'read')
    try { return await handle.read() }
    finally { await handle.close() }
  } finally { await ctx.fiber.dispose() }
}

describe('request context durable event contract', { timeout: 30_000 }, () => {
  it('preserves ignorable product records in an atomic official append batch and after reopening', async () => {
    const f = await fixture()
    const before = f.session.snapshotEvents()
    expect(() => f.session.append([
      ['eleckoi/synthetic-annotation', { value: '合成标注' }, { ignorable: true }],
      ['eleckoi/synthetic-annotation', { value: NaN }, { ignorable: true }]
    ])).toThrow()
    expect(f.session.snapshotEvents()).toEqual(before)
    const appended = f.session.append([
      ['eleckoi/synthetic-annotation', { value: '合成标注' }, { ignorable: true }],
      ['eleckoi/synthetic-annotation', { value: '合成后续标注' }, { ignorable: true }]
    ])
    expect(appended.map(event => event.seq)).toEqual([before.length, before.length + 1])
    expect(appended.every(event => event.ignorable === true)).toBe(true)
    const writer = await f.ctx.sessionPersistence.open(f.session.id, 'write')
    try { await writer.append(appended); await writer.flush() }
    finally { await writer.close() }
    expect((await reopen(f)).events).toEqual(f.session.snapshotEvents())
    expect(f.session.deriveMessages()).toHaveLength(1)
  })

  it('closes and reopens a real log without requiring the downstream projection plugin', async () => {
    const f = await fixture()
    const stored = await reopen(f)
    const record = stored.events.find(event => event.type === 'eleckoi/request-context')
    expect(record.ignorable).toBe(true)
    const restored = Session.create(f.session.id, stored.events, f.session.header)
    expect(restored.deriveMessages()).toEqual(f.session.deriveMessages())
    expect(f.registry.snapshot(restored).values.eleckoiRequestContexts).toBeUndefined()
    expect(stored.events.find(event => event.type === 'eleckoi/request-context').data.context).toEqual(f.context)
  })
})
