import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { createAssistantMessage, createToolResultMessage, createUserMessage, ToolCallId } from '@deepseek-ai/dsh-llm'
import * as JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { roleplayReplyMessages, ROLEPLAY_OUTPUT_EVENT, ROLEPLAY_REPLY_SOURCE } from '@eleckoi/dsh-product-api'
import { deleteDshSessionMessagesFrom, editDshSessionMessage, readDshSessionLog } from '@eleckoi/dsh-runtime'

const cleanups: Array<() => void | Promise<void>> = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })

async function fixture(multipart = false) {
  const root = mkdtempSync(join(tmpdir(), 'eleckoi-message-edit-'))
  cleanups.push(() => rmSync(root, { recursive: true, force: true }))
  const ctx = new Context()
  cleanups.push(() => ctx.fiber.dispose())
  await ctx.plugin(JsonlSessionPersistence, { root, compression: 'none' })
  const session = Session.create(SessionId('session-edit'))
  session.append('turn/start', { turn: 1 })
  session.append('step/start', { turn: 1, step: 1 })
  const user = createUserMessage({ content: [{ type: 'text', text: '你好' }], source: { kind: 'user' } })
  const assistant = createAssistantMessage({
    content: [{ type: 'text', text: '你好，欢迎。' }], source: { provider: 'test', model: 'test' }
  })
  const userEvent = session.append('user/message', user, { surfaceOp: 'append' })
  const assistantEvent = session.append('assistant/message', { turn: 1, step: 1, message: assistant, stream: [] }, { surfaceOp: 'append' })
  session.append('step/end', { turn: 1, step: 1 })
  session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  session.append('turn/start', { turn: 2 })
  session.append('step/start', { turn: 2, step: 1 })
  session.append('user/message', createUserMessage({
    content: [{ type: 'text', text: '之后的问题' }], source: { kind: 'user' }
  }), { surfaceOp: 'append' })
  session.append('assistant/message', {
    turn: 2, step: 1,
    message: createAssistantMessage({ content: [{ type: 'text', text: '之后的回答' }], source: { provider: 'test', model: 'test' } }),
    stream: []
  }, { surfaceOp: 'append' })
  session.append('step/end', { turn: 2, step: 1 })
  session.append('turn/end', { turn: 2, reason: { kind: 'completed' } })
  if (multipart) {
    const turn = 3, name = 'eleckoi_roleplay_reply'
    session.append('turn/start', { turn })
    session.append(ROLEPLAY_OUTPUT_EVENT, { turn, nativeText: true }, { ignorable: true })
    for (const [step, speakerName, speakerId, text] of [[1, '合成发言甲', 'speaker-a', ''], [2, '合成发言乙', 'speaker-b', '门开了。']] as const) {
      const callId = ToolCallId(`speaker-${step}`)
      const argumentsJson = JSON.stringify({ name: speakerName })
      session.append('step/start', { turn, step })
      session.append('assistant/message', { turn, step, stream: [], message: createAssistantMessage({
        content: [
          ...(text ? [{ type: 'text' as const, text }] : []),
          { type: 'tool-call', id: callId, name, arguments: argumentsJson }
        ], source: { provider: 'test', model: 'test' }
      }) }, { surfaceOp: 'append' })
      session.append('tool/call', { turn, step, callId, name, arguments: argumentsJson })
      session.append('tool/result', { turn, step, message: createToolResultMessage({ callId, isError: false, content: [{ type: 'text', text: '已选定发言者' }] }),
        meta: { source: ROLEPLAY_REPLY_SOURCE, speaker: { kind: 'speech', speakerId, speakerName } } }, { surfaceOp: 'append' })
      session.append('step/end', { turn, step })
    }
    session.append('step/start', { turn, step: 3 })
    const reply = session.append('assistant/message', { turn, step: 3, stream: [], message: createAssistantMessage({
      content: [{ type: 'text', text: '来了。' }], source: { provider: 'test', model: 'test' }
    }) }, { surfaceOp: 'append' })
    session.append('step/end', { turn, step: 3 })
    session.append(ROLEPLAY_OUTPUT_EVENT, { turn, replySeq: reply.seq, toolBacked: true, nativeText: true }, { ignorable: true })
    session.append('turn/end', { turn, reason: { kind: 'completed' } })
  }
  const writer = await ctx.sessionPersistence.create(session.header)
  try {
    await writer.append(session.snapshotEvents())
    await writer.flush()
  } finally { await writer.close() }
  const readSession = async () => {
    const reader = await ctx.sessionPersistence.open(session.id, 'read')
    try { return { ...(await reader.read()), header: reader.header, inheritedEventCount: reader.inheritedEventCount } }
    finally { await reader.close() }
  }
  return { root, sessionId: session.id, readSession, userEvent, assistantEvent }
}

describe('DSH message edit', { timeout: 30_000 }, () => {
  it.each([0, 1])('deletes assistant reply %s and its suffix while keeping its user input and earlier answers', async answerIndex => {
    const { root, sessionId, readSession } = await fixture()
    const original = await readSession()
    const target = original.events.filter(event => event.type === 'assistant/message')[answerIndex]!
    const index = original.events.findIndex(event => event.seq === target.seq)
    deleteDshSessionMessagesFrom(root, sessionId, target.seq, 'assistant')
    const log = await readSession()
    expect(log.events.slice(0, index)).toEqual(original.events.slice(0, index))
    expect(log.events.filter(event => event.type === 'user/message')).toHaveLength(answerIndex + 1)
    expect(log.events.filter(event => event.type === 'assistant/message')).toHaveLength(answerIndex)
    const resumed = Session.create(sessionId, log.events, log.header, log.inheritedEventCount)
    expect(resumed.deriveMessages().at(-1)?.role).toBe('user')
    expect(log.events.at(-1)).toMatchObject({ type: 'turn/end', data: { turn: answerIndex + 1, reason: { kind: 'aborted', reason: { kind: 'user' } } } })
  })
  it('edits only the selected assistant message without changing the user input or turn count', async () => {
    const { root, sessionId, readSession, assistantEvent } = await fixture()
    editDshSessionMessage(root, sessionId, assistantEvent.seq, 'assistant', '改过的回复')
    const log = await readSession()
    expect(log.events).toHaveLength(12)
    const resumed = Session.create(sessionId, log.events, log.header, log.inheritedEventCount)
    expect(resumed.deriveMessages().map((message) => message.content)).toEqual([
      [{ type: 'text', text: '你好' }], [{ type: 'text', text: '改过的回复' }],
      [{ type: 'text', text: '之后的问题' }], [{ type: 'text', text: '之后的回答' }]
    ])
  })

  it('edits only the selected user message', async () => {
    const { root, sessionId, readSession, userEvent } = await fixture()
    editDshSessionMessage(root, sessionId, userEvent.seq, 'user', '新的提问')
    const log = await readSession()
    const resumed = Session.create(sessionId, log.events, log.header, log.inheritedEventCount)
    expect(resumed.deriveMessages().map((message) => message.content)).toEqual([
      [{ type: 'text', text: '新的提问' }], [{ type: 'text', text: '你好，欢迎。' }],
      [{ type: 'text', text: '之后的问题' }], [{ type: 'text', text: '之后的回答' }]
    ])
  })

  it('refuses a mismatched role or id without touching the log', async () => {
    const { root, sessionId, assistantEvent } = await fixture()
    const { path } = readDshSessionLog(root, sessionId)!
    const before = readFileSync(path, 'utf8')
    expect(() => editDshSessionMessage(root, sessionId, assistantEvent.seq, 'user', '错误内容')).toThrow()
    expect(() => editDshSessionMessage(root, sessionId, 999, 'assistant', '错误内容')).toThrow()
    expect(readFileSync(path, 'utf8')).toBe(before)
  })

  it('saves texts for the original reply blocks without rewriting its tool result or any other event', async () => {
    const { root, sessionId, readSession } = await fixture(true)
    const { events: before } = await readSession()
    const { addressSeq, event } = roleplayReplyMessages(before)[0]!
    const edits = [{ id: 'speaker-1:0', text: '门开了。' }, { id: 'speaker-2:0', text: '我进来了。' }]
    editDshSessionMessage(root, sessionId, addressSeq, 'assistant', edits)
    const { events: after } = await readSession()
    expect(roleplayReplyMessages(after)[0]?.content).toBe('合成发言甲：门开了。\n\n合成发言乙：我进来了。')
    expect(after).toEqual(before.map(item => item === event ? {
      ...event, data: { ...event.data, editedText: '合成发言甲：门开了。\n\n合成发言乙：我进来了。', editedBlocks: edits }
    } : item))
    deleteDshSessionMessagesFrom(root, sessionId, addressSeq, 'assistant')
    const { events: deleted } = await readSession()
    expect(roleplayReplyMessages(deleted)).toHaveLength(0)
    expect(deleted.filter(event => !('turn' in event.data) || event.data.turn !== 3)).toEqual(
      before.filter(event => !('turn' in event.data) || event.data.turn !== 3))
    expect(deleted.some(event => event.type === 'assistant/message' && event.data.turn === 3)).toBe(false)
  })
})
