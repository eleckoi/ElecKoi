import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { SessionFormatUnsupportedError, SessionAlreadyOwnedError } from '@deepseek-ai/dsh-session-persistence'
import * as JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { SessionProjectionRegistry } from '@deepseek-ai/dsh-session-projection'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { afterEach, describe, expect, it } from 'vitest'


import { readDshSessionLog } from '../src/trajectory'
import { repairRequestContextLog, repairRequestContextLogs } from '../src/sessionRequestContextRepair'

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
  const path = readDshSessionLog(root, session.id).path
  return { root, ctx, registry, session, path, context, step, header: readDshSessionLog(root, session.id).header }
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

function removeMarker(f, mutate = row => row) {
  const rows = readFileSync(f.path, 'utf8').trimEnd().split('\n').map(JSON.parse)
  const record = rows.find(row => row.type === 'eleckoi/request-context')
  delete record.ignorable
  mutate(record, rows)
  writeFileSync(f.path, rows.map(JSON.stringify).join('\n') + '\n')
  return readFileSync(f.path, 'utf8')
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

  it('repairs only the marker, retains a backup, and is idempotent across Host startup', async () => {
    const f = await fixture()
    const original = removeMarker(f)
    await expect(reopen(f)).rejects.toBeInstanceOf(SessionFormatUnsupportedError)
    expect(await repairRequestContextLogs(f.root)).toBe(1)
    const after = await reopen(f)
    const expected = f.session.snapshotEvents()
    expect(after.events).toEqual(expected)
    expect(readDshSessionLog(f.root, f.session.id).header).toEqual(f.header)
    const backup = readdirSync(dirname(f.path)).find(name => name.endsWith('.bak'))
    expect(readFileSync(join(dirname(f.path), backup), 'utf8')).toBe(original)
    const repaired = readFileSync(f.path, 'utf8')
    expect(await repairRequestContextLogs(f.root)).toBe(0)
    expect(readFileSync(f.path, 'utf8')).toBe(repaired)
  })

  it.each(['payload', 'request', 'unknown', 'torn'])('refuses %s corruption without changing the file', async kind => {
    const f = await fixture()
    removeMarker(f, (record, rows) => {
      if (kind === 'payload') record.data.context[0].role = 'invalid'
      if (kind === 'request') record.data.requestSeq = 0
      if (kind === 'unknown') rows.at(-1).type = 'other/required'
    })
    if (kind === 'torn') writeFileSync(f.path, readFileSync(f.path, 'utf8') + '{broken')
    const original = readFileSync(f.path, 'utf8')
    await expect(repairRequestContextLog(f.root, f.session.id)).rejects.toThrow()
    expect(readFileSync(f.path, 'utf8')).toBe(original)
    expect(readdirSync(dirname(f.path)).some(name => name.endsWith('.bak'))).toBe(false)
  })

  it('uses the same kernel write lease as the official backend', async () => {
    const f = await fixture()
    const owner = await f.ctx.sessionPersistence.open(f.session.id, 'write')
    try {
      const original = removeMarker(f)
      await expect(repairRequestContextLog(f.root, f.session.id)).rejects.toBeInstanceOf(SessionAlreadyOwnedError)
      expect(readFileSync(f.path, 'utf8')).toBe(original)
    } finally { await owner.close() }
  })
})
