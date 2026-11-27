import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { AttachmentId } from '@deepseek-ai/dsh-attachment'
import { imageOffloadProjection } from '@deepseek-ai/dsh-compaction-image-offload/projection'
import { Session, SessionId, SessionLogOffset, SessionSeq, SessionStore } from '@deepseek-ai/dsh-session'
import { buildForkSeed } from '@deepseek-ai/dsh-session/fork'
import { createAssistantMessage, createToolResultMessage, createUserMessage, ToolCallId } from '@deepseek-ai/dsh-llm'
import * as JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { DELEGATED_ROLEPLAY_REPLY_EVENT, isDelegatedRoleplayReply, roleplayReplyMessages, ROLEPLAY_OUTPUT_EVENT, ROLEPLAY_REPLY_SOURCE } from '@eleckoi/dsh-product-api'
import { deleteDshSessionMessagesFrom, editDshSessionMessage, readDshSessionLog } from '@eleckoi/dsh-runtime'

const cleanups: Array<() => void | Promise<void>> = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })

async function fixture(mode: 'plain' | 'multipart' | 'delegated' | 'offloaded' = 'plain', seeded = false) {
  const root = mkdtempSync(join(tmpdir(), 'eleckoi-message-edit-'))
  cleanups.push(() => rmSync(root, { recursive: true, force: true }))
  const ctx = new Context()
  cleanups.push(() => ctx.fiber.dispose())
  await ctx.plugin(JsonlSessionPersistence, { root, compression: 'none' })
  await ctx.plugin(SessionStore)
  if (mode === 'offloaded') ctx.sessions.registerMessageProjection(imageOffloadProjection)
  let session = Session.create(SessionId('session-edit'), undefined, undefined, undefined, ctx.sessions.messageProjections)
  session.append('turn/start', { turn: 1 })
  session.append('step/start', { turn: 1, step: 1 })
  const user = createUserMessage({ content: [{ type: 'text', text: '你好' }, ...(mode === 'offloaded' ? [{
    type: 'image' as const, attachment: { attachmentId: AttachmentId(`sha256:${'a'.repeat(64)}`), mediaType: 'image/png' as const,
      bytes: 68, width: 1, height: 1 }
  }] : [])], source: { kind: 'user' } })
  const assistant = createAssistantMessage({
    content: [{ type: 'text', text: '你好，欢迎。' }], source: { provider: 'test', model: 'test' }
  })
  const userEvent = session.append('user/message', user, { surfaceOp: 'append' })
  if (mode === 'offloaded') session.append('image/offload', { targets: [{ seq: userEvent.seq, imageIndexes: [0] }] })
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
  if (mode === 'delegated') {
    const selection = { id: 'child-reply', mainSessionId: session.id, childSessionId: 'child',
      childTurn: 1, childStep: 2, speakerName: '合成角色乙', speakerId: 'actor-b' }
    const anchor = session.append(DELEGATED_ROLEPLAY_REPLY_EVENT, { ...selection, status: 'waiting' }, { ignorable: true })
    session.append(DELEGATED_ROLEPLAY_REPLY_EVENT, { ...selection, status: 'complete', anchorSeq: anchor.seq, text: '来了。' }, { ignorable: true })
  }
  if (mode === 'multipart') {
    const turn = 3, step = 1, name = 'eleckoi_roleplay_reply', callId = ToolCallId('speakers')
    const speakers = [{ speakerName: '合成发言乙', speakerId: 'speaker-b' }, { speakerName: '合成发言甲', speakerId: 'speaker-a' }]
    const argumentsJson = JSON.stringify({ names: speakers.map(speaker => speaker.speakerName) })
    session.append('turn/start', { turn })
    session.append(ROLEPLAY_OUTPUT_EVENT, { turn, nativeText: true }, { ignorable: true })
    session.append('step/start', { turn, step })
    session.append('assistant/message', { turn, step, stream: [], message: createAssistantMessage({
      content: [{ type: 'tool-call', id: callId, name, arguments: argumentsJson }], source: { provider: 'test', model: 'test' }
    }) }, { surfaceOp: 'append' })
    session.append('tool/call', { turn, step, callId, name, arguments: argumentsJson })
    session.append('tool/result', { turn, step, message: createToolResultMessage({ callId, isError: false, content: [{ type: 'text', text: '已选定发言者' }] }),
      meta: { source: ROLEPLAY_REPLY_SOURCE, speakers } }, { surfaceOp: 'append' })
    session.append('step/end', { turn, step })
    session.append('step/start', { turn, step: 2 })
    const reply = session.append('assistant/message', { turn, step: 2, stream: [], message: createAssistantMessage({
      content: [{ type: 'text', text: '<合成发言甲>门开了。</合成发言甲>\n<合成发言乙>来了。</合成发言乙>' }], source: { provider: 'test', model: 'test' }
    }) }, { surfaceOp: 'append' })
    session.append('step/end', { turn, step: 2 })
    session.append(ROLEPLAY_OUTPUT_EVENT, { turn, replySeq: reply.seq, toolBacked: true, nativeText: true }, { ignorable: true })
    session.append('turn/end', { turn, reason: { kind: 'completed' } })
  }
  if (seeded) {
    const events = session.snapshotEvents()
    session = Session.create(session.id, buildForkSeed(events, SessionSeq(events.length - 1)), { ...session.header, isSeeded: true },
      SessionLogOffset(events.length), ctx.sessions.messageProjections)
  }
  const writer = await ctx.sessionPersistence.create(session.header, { inheritedEventCount: session.inheritedEventCount })
  try {
    await writer.append(session.snapshotEvents())
    await writer.flush()
  } finally { await writer.close() }
  const readSession = async () => {
    const reader = await ctx.sessionPersistence.open(session.id, 'read')
    try { return { ...(await reader.read()), header: reader.header, inheritedEventCount: reader.inheritedEventCount } }
    finally { await reader.close() }
  }
  return { ctx, root, sessionId: session.id, readSession, userEvent, assistantEvent }
}

describe('DSH message edit', { timeout: 30_000 }, () => {
  it.each([false, true])('replays an offloaded image after editing and rewinding a stored Session (seeded=%s)', async seeded => {
    const { ctx, root, sessionId, readSession, assistantEvent } = await fixture('offloaded', seeded)
    vi.stubEnv('DSH_SESSION_ROOT', root)
    cleanups.push(() => { vi.unstubAllEnvs() })
    const hydrate = vi.fn()
    const write = vi.fn(async (_session: Session) => {})
    const provide = vi.fn()
    const entry = pathToFileURL(createRequire(import.meta.url).resolve('@eleckoi/dsh-runtime/session-edit-plugin')).href
    const { apply: installSessionEditor }: typeof import('@eleckoi/dsh-runtime/session-edit-plugin') = await import(entry)
    installSessionEditor({
      sessions: ctx.sessions,
      sessionPersistence: {
        open: ctx.sessionPersistence.open.bind(ctx.sessionPersistence),
        list: async () => [...await ctx.sessionPersistence.list()],
      },
      sessionProjections: { hydrate },
      sessionProjectionCache: { write },
      eleckoiSessionHandles: { withClosed: async <T>(_id: string, action: () => T | Promise<T>) => action() },
      attachments: { imageHostPath: vi.fn() },
      eleckoiProductData: { listInputImageReferences: () => [], runtimeSessionId: vi.fn() },
      workspaceRegistry: { list: () => [], unpinSession: vi.fn(), unarchiveSession: vi.fn() },
      get: () => undefined,
      logger: { error: vi.fn() },
      provide,
    })
    const editor = provide.mock.calls[0]![1] as {
      editMessage(id: string, seq: number, role: 'assistant', text: string): Promise<void>
      rewind(id: string, fromTurn: number): Promise<number | undefined>
    }
    const original = await readSession()
    const offload = original.events.find(event => event.type === 'image/offload')
    expect(offload).toBeDefined()

    await editor.editMessage(sessionId, assistantEvent.seq, 'assistant', '改过的回复')
    const edited = await readSession()
    expect(edited.events.find(event => event.type === 'image/offload')).toEqual(offload)
    expect(write.mock.lastCall?.[0].deriveMessages()[1]?.content).toEqual([{ type: 'text', text: '改过的回复' }])

    await expect(editor.rewind(sessionId, 2)).resolves.toBeGreaterThan(0)
    const rewound = await readSession()
    expect(rewound.events.find(event => event.type === 'image/offload')).toEqual(offload)
    expect(rewound.events.some(event => event.type === 'turn/start' && event.data.turn === 2)).toBe(false)
    expect(hydrate).toHaveBeenCalledTimes(2)
    expect(write).toHaveBeenCalledTimes(2)
    for (const [session] of write.mock.calls) {
      expect(session.deriveMessages()[0]?.content[1]).toMatchObject({ type: 'image', offloaded: true })
    }
    const reopened = Session.create(sessionId, rewound.events, rewound.header, rewound.inheritedEventCount, ctx.sessions.messageProjections)
    expect(reopened.deriveMessages()[0]?.content[1]).toEqual(write.mock.lastCall?.[0].deriveMessages()[0]?.content[1])
  })

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
    const { root, sessionId, readSession } = await fixture('multipart')
    const { events: before } = await readSession()
    const { addressSeq, event } = roleplayReplyMessages(before)[0]!
    const edits = [{ id: 'speakers:0', text: '门开了。' }, { id: 'speakers:1', text: '我进来了。' }]
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

  it('edits the delegated speaker in the main log and deletes from its displayed position', async () => {
    const { root, sessionId, readSession } = await fixture('delegated')
    const { events } = await readSession()
    const reply = events.find(isDelegatedRoleplayReply)!
    editDshSessionMessage(root, sessionId, reply.seq, 'assistant', '改过的正文。')
    expect((await readSession()).events.find(isDelegatedRoleplayReply)?.data).toMatchObject({
      speakerId: 'actor-b', text: '改过的正文。'
    })
    deleteDshSessionMessagesFrom(root, sessionId, reply.seq, 'assistant')
    expect((await readSession()).events).toEqual(events.slice(0, reply.data.anchorSeq))
  })
})
