import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Session, SessionId, SessionLogOffset, SessionSeq } from '@deepseek-ai/dsh-session'
import { createUserMessage, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-agent'
import { sessionFormatCatalog } from '@deepseek-ai/dsh-session-format-catalog'
import { acceptedThrough } from '@deepseek-ai/dsh-session-log-deepseek'
import { buildForkSeed } from '@deepseek-ai/dsh-session/fork'
import { deleteDshSessionMessagesFrom, editDshSessionMessage, readDshSessionLog, rewindDshSession } from '@eleckoi/dsh-runtime'
// @ts-expect-error The installed browser bundle fixture does not publish declarations.
import { officialChatFixture } from '../../../../tests/helpers/officialTrajectory.js'

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const root of temporaryDirectories.splice(0)) rmSync(root, { recursive: true, force: true })
})

function fixture(queuedPrompts = false, trailingPrompt = false) {
  const root = mkdtempSync(join(tmpdir(), 'eleckoi-rewind-'))
  temporaryDirectories.push(root)
  const directory = join(root, 'project', 'session')
  mkdirSync(directory, { recursive: true })
  const session = Session.create(SessionId('session-a'))
  for (let turn = 1; turn <= 3; turn += 1) {
    if (queuedPrompts) {
      session.append('agent/inbox/spliced', {
        target: 'next-turn', start: 0,
        inserted: [createUserMessage({
          content: [{ type: 'text', text: `待发送第${turn}轮` }], source: { kind: 'user' }
        })]
      })
    }
    session.append('turn/start', { turn })
    session.append('step/start', { turn, step: 1 })
    session.append('user/message', createUserMessage({
      content: [{ type: 'text', text: `第${turn}轮` }], source: { kind: 'user' }
    }), { surfaceOp: 'append' })
    session.append('step/end', { turn, step: 1 })
    session.append('turn/end', { turn, reason: { kind: 'completed' } })
  }
  if (trailingPrompt) session.append('agent/inbox/spliced', {
    target: 'next-turn', start: 0,
    inserted: [createUserMessage({
      content: [{ type: 'text', text: '已取消的输入' }], source: { kind: 'user' }
    })]
  })
  const path = join(directory, `session.v${sessionFormatCatalog.currentVersion}.jsonl`)
  writeFileSync(path, [
    sessionFormatCatalog.encodeCurrentHeader({ ...session.header, delegationDepth: 0 }, session.inheritedEventCount),
    ...session.snapshotEvents().map((event) => sessionFormatCatalog.encodeCurrentEvent(
      event as unknown as Parameters<typeof sessionFormatCatalog.encodeCurrentEvent>[0]
    ))
  ].map((row) => JSON.stringify(row)).join('\n') + '\n')
  return { root, path }
}

describe('DSH Session physical rewind', { timeout: 30_000 }, () => {
  it.each(['rewind', 'edit', 'delete'])('keeps actual subagent history unchanged when %s is requested directly', operation => {
    const { root, path } = fixture()
    const log = readDshSessionLog(root, 'session-a')!
    writeFileSync(path, [sessionFormatCatalog.encodeCurrentHeader({ ...log.header, origin: 'subagent', parentSession: 'synthetic-parent', delegationDepth: 1 }, 0),
      ...log.events.map(event => sessionFormatCatalog.encodeCurrentEvent(event))].map(row => JSON.stringify(row)).join('\n') + '\n')
    const before = readFileSync(path), input = log.events.find(event => event.type === 'user/message')!
    const run = () => operation === 'rewind' ? rewindDshSession(root, 'session-a', 1, input.seq, true)
      : operation === 'edit' ? editDshSessionMessage(root, 'session-a', input.seq, 'user', 'Synthetic input')
        : deleteDshSessionMessagesFrom(root, 'session-a', input.seq, 'user')
    expect(run).toThrow('子会话')
    expect(readFileSync(path)).toEqual(before)
  })

  it.each(['rewind', 'edit', 'delete'])('allows %s on an imported root and retains foreign receipt ownership', operation => {
    const { root, path } = fixture()
    const original = readDshSessionLog(root, 'session-a')!
    const source = Session.create(SessionId('session-a'), original.events as unknown as Parameters<typeof Session.create>[1], original.header as unknown as Parameters<typeof Session.create>[2], SessionLogOffset(0))
    source.append('session-log-deepseek/delivery-accepted', { sessionId: source.id, sessionFormatVersion: 4, throughSeq: 14 as any })
    const originalEvents = source.snapshotEvents(), id = SessionId('synthetic-imported-root')
    const imported = Session.create(id, buildForkSeed(originalEvents, SessionSeq(originalEvents.length - 1)),
      { ...source.header, id, isSeeded: true }, SessionLogOffset(originalEvents.length))
    const directory = join(root, 'project', 'imported')
    mkdirSync(directory)
    const importedPath = join(directory, `session.v${sessionFormatCatalog.currentVersion}.jsonl`)
    writeFileSync(importedPath, [sessionFormatCatalog.encodeCurrentHeader({ ...imported.header, delegationDepth: 0 }, imported.inheritedEventCount),
      ...imported.snapshotEvents().map(event => sessionFormatCatalog.encodeCurrentEvent(event as unknown as Parameters<typeof sessionFormatCatalog.encodeCurrentEvent>[0]))].map(row => JSON.stringify(row)).join('\n') + '\n')
    const sourceBytes = readFileSync(path)
    const input = imported.snapshotEvents().filter(event => event.type === 'user/message')[1]!
    if (operation === 'rewind') rewindDshSession(root, imported.id, 2, input.seq, true)
    else if (operation === 'edit') editDshSessionMessage(root, imported.id, input.seq, 'user', 'Synthetic edited imported input')
    else deleteDshSessionMessagesFrom(root, imported.id, input.seq, 'user')
    const after = readDshSessionLog(root, imported.id)!
    const restored = Session.create(imported.id, after.events as unknown as Parameters<typeof Session.create>[1], after.header as unknown as Parameters<typeof Session.create>[2], SessionLogOffset(after.inheritedEventCount))
    expect(restored.id).toBe(imported.id)
    expect(acceptedThrough(restored)).toBe(-1)
    expect(readFileSync(path)).toEqual(sourceBytes)
    expect(after.events.filter(event => event.type === 'user/message')).toHaveLength(operation === 'edit' ? 3 : operation === 'rewind' ? 2 : 1)
    if (operation === 'edit') expect(after.events.find(event => event.seq === input.seq)?.data).toMatchObject({ content: [{ type: 'text', text: 'Synthetic edited imported input' }] })
    for (const receipt of after.events.filter(event => event.type === 'session-log-deepseek/delivery-accepted')) expect(receipt.data).toMatchObject({ sessionId: source.id })
  })

  it.each(['rewind', 'delete'])('keeps current model and whole Session parameter state through %s', operation => {
    const { root, path } = fixture()
    const original = readDshSessionLog(root, 'session-a')!
    const session = Session.create(SessionId('session-a'), original.events as unknown as Parameters<typeof Session.create>[1], original.header as unknown as Parameters<typeof Session.create>[2], SessionLogOffset(original.inheritedEventCount))
    const selection = { provider: 'synthetic', model: 'current-model', reasoningEffort: ReasoningEffortId('high') }
    const parameters = { revision: 2, entries: { '["synthetic","current-model"]': { temperature: 0.3, maxOutputTokens: 1500 } } }
    session.append('model/selection', selection)
    session.append('eleckoi/model-parameters', parameters, { ignorable: true })
    writeFileSync(path, [sessionFormatCatalog.encodeCurrentHeader({ ...session.header, delegationDepth: session.header.delegationDepth ?? 0 }, session.inheritedEventCount), ...session.snapshotEvents().map(event => sessionFormatCatalog.encodeCurrentEvent(event as unknown as Parameters<typeof sessionFormatCatalog.encodeCurrentEvent>[0]))].map(row => JSON.stringify(row)).join('\n') + '\n')
    const input = original.events.find(event => event.type === 'user/message')!
    if (operation === 'rewind') rewindDshSession(root, 'session-a', 1, input.seq, true)
    else deleteDshSessionMessagesFrom(root, 'session-a', input.seq, 'user')
    const after = readDshSessionLog(root, 'session-a')!
    expect(after.events.findLast(event => event.type === 'model/selection')?.data).toEqual(selection)
    expect(after.events.findLast(event => event.type === 'eleckoi/model-parameters')?.data).toEqual(parameters)
    expect(after.events.map(event => event.seq)).toEqual(after.events.map((_event, index) => index))
  })
  it.each([1, 2, 3])('deletes a message in turn %s while keeping every earlier event and closing its prefix', turn => {
    const { root } = fixture()
    const before = readDshSessionLog(root, 'session-a')!
    const target = before.events.filter(event => event.type === 'user/message')[turn - 1]!
    const index = before.events.findIndex(event => event.seq === target.seq)
    deleteDshSessionMessagesFrom(root, 'session-a', target.seq, 'user')
    const after = readDshSessionLog(root, 'session-a')!
    expect(after.events.slice(0, index)).toEqual(before.events.slice(0, index))
    expect(after.events.filter(event => event.type === 'user/message')).toHaveLength(turn - 1)
    expect(after.events.at(-1)).toMatchObject({ type: 'turn/end', data: { turn } })
    expect(() => deleteDshSessionMessagesFrom(root, 'session-a', target.seq, 'assistant')).toThrow('找不到要删除的消息')
    expect(readDshSessionLog(root, 'session-a')!.events).toEqual(after.events)
  })
  it('retains the exact edited input across repeated user rewinds without recording a process failure', () => {
    const { root } = fixture()
    const original = readDshSessionLog(root, 'session-a')!.events.find(event => event.seq === 7)!
    expect(original.type).toBe('user/message')
    editDshSessionMessage(root, 'session-a', original.seq, 'user', '合成编辑输入')
    for (let attempt = 0; attempt < 2; attempt++) {
      rewindDshSession(root, 'session-a', 2, original.seq, true)
      const log = readDshSessionLog(root, 'session-a')!
      const retained = log.events.filter(event => event.type === 'user/message' && event.seq === original.seq)
      expect(retained).toHaveLength(1)
      expect(retained[0]).toEqual({ ...original, data: { ...(original.data as Record<string, unknown>),
        content: [{ type: 'text', text: '合成编辑输入' }] } })
      expect(log.events.at(-1)).toMatchObject({ type: 'turn/end', data: { turn: 2, reason: { kind: 'aborted', reason: { kind: 'user' } } } })
      const chat = officialChatFixture().replace(log.events)
      expect([...chat.nodes.values()].filter(node => node.kind === 'turn-error')).toEqual([])
      expect(log.events.map(event => event.seq)).toEqual(log.events.map((_, index) => index))
    }
  })

  it('drops queued prompts before the rewritten first turn', () => {
    const { root, path } = fixture(true)
    expect(rewindDshSession(root, 'session-a', 1)).toBe(0)
    expect(readDshSessionLog(root, 'session-a')?.events).toHaveLength(0)
    expect(readFileSync(path, 'utf8')).not.toContain('待发送第1轮')
  })

  it('drops queued prompts after the last retained turn', () => {
    const { root, path } = fixture(true)
    expect(rewindDshSession(root, 'session-a', 2)).toBe(6)
    const events = readDshSessionLog(root, 'session-a')?.events ?? []
    expect(events.filter((event) => event.type === 'turn/start')
      .map((event) => (event.data as { turn: number }).turn)).toEqual([1])
    expect(readFileSync(path, 'utf8')).not.toContain('待发送第2轮')
  })

  it('removes the selected turn and all later turns while retaining the Session id', () => {
    const { root, path } = fixture()
    const removedAt = rewindDshSession(root, 'session-a', 2)
    expect(removedAt).toBe(5)
    const restored = readDshSessionLog(root, 'session-a')
    expect(restored?.header.id).toBe('session-a')
    expect(restored?.events.filter((event) => event.type === 'turn/start')
      .map((event) => (event.data as { turn: number }).turn)).toEqual([1])
    const disk = readFileSync(path, 'utf8')
    expect(disk).toContain('第1轮')
    expect(disk).not.toContain('第2轮')
    expect(disk).not.toContain('第3轮')
  })

  it('removes a queued input that was cancelled before its turn started', () => {
    const { root, path } = fixture(false, true)
    expect(rewindDshSession(root, 'session-a', 4)).toBe(15)
    expect(readDshSessionLog(root, 'session-a')?.events).toHaveLength(15)
    expect(readFileSync(path, 'utf8')).not.toContain('已取消的输入')
  })

  it('leaves the original log intact when the target turn is absent', () => {
    const { root, path } = fixture()
    const before = readFileSync(path, 'utf8')
    expect(() => rewindDshSession(root, 'session-a', 5)).toThrow('没有第 5 轮')
    expect(readFileSync(path, 'utf8')).toBe(before)
  })

})
