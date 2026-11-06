import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { createAssistantMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import { sessionFormatCatalog } from '@deepseek-ai/dsh-session-format-catalog'
import { deleteDshSessionMessagesFrom, editDshSessionMessage, readDshSessionLog } from '@eleckoi/dsh-runtime'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'eleckoi-message-edit-'))
  roots.push(root)
  const directory = join(root, 'project', 'session')
  mkdirSync(directory, { recursive: true })
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
  const path = join(directory, `session.v${sessionFormatCatalog.currentVersion}.jsonl`)
  writeFileSync(path, [
    sessionFormatCatalog.encodeCurrentHeader({ ...session.header, delegationDepth: 0 }, session.inheritedEventCount),
    ...session.snapshotEvents().map((event) => sessionFormatCatalog.encodeCurrentEvent(
      event as Parameters<typeof sessionFormatCatalog.encodeCurrentEvent>[0]
    ))
  ].map((row) => JSON.stringify(row)).join('\n') + '\n')
  return { root, path, userEvent, assistantEvent }
}

describe('DSH message edit', { timeout: 30_000 }, () => {
  it.each([0, 1])('deletes assistant reply %s and its suffix while keeping its user input and earlier answers', answerIndex => {
    const { root } = fixture()
    const original = readDshSessionLog(root, 'session-edit')!
    const target = original.events.filter(event => event.type === 'assistant/message')[answerIndex]!
    const index = original.events.findIndex(event => event.seq === target.seq)
    deleteDshSessionMessagesFrom(root, 'session-edit', target.seq, 'assistant')
    const log = readDshSessionLog(root, 'session-edit')!
    expect(log.events.slice(0, index)).toEqual(original.events.slice(0, index))
    expect(log.events.filter(event => event.type === 'user/message')).toHaveLength(answerIndex + 1)
    expect(log.events.filter(event => event.type === 'assistant/message')).toHaveLength(answerIndex)
    const resumed = Session.create(SessionId('session-edit'),
      log.events as Parameters<typeof Session.create>[1],
      log.header as unknown as Parameters<typeof Session.create>[2],
      log.inheritedEventCount as Parameters<typeof Session.create>[3])
    expect(resumed.deriveMessages().at(-1)?.role).toBe('user')
    expect(log.events.at(-1)).toMatchObject({ type: 'turn/end', data: { turn: answerIndex + 1, reason: { kind: 'aborted', reason: { kind: 'user' } } } })
  })
  it('edits only the selected assistant message without changing the user input or turn count', () => {
    const { root, assistantEvent } = fixture()
    editDshSessionMessage(root, 'session-edit', assistantEvent.seq, 'assistant', '改过的回复')
    const log = readDshSessionLog(root, 'session-edit')!
    expect(log.events).toHaveLength(12)
    const resumed = Session.create(SessionId('session-edit'),
      log.events as unknown as Parameters<typeof Session.create>[1],
      log.header as unknown as Parameters<typeof Session.create>[2],
      log.inheritedEventCount as Parameters<typeof Session.create>[3])
    expect(resumed.deriveMessages().map((message) => message.content)).toEqual([
      [{ type: 'text', text: '你好' }], [{ type: 'text', text: '改过的回复' }],
      [{ type: 'text', text: '之后的问题' }], [{ type: 'text', text: '之后的回答' }]
    ])
  })

  it('edits only the selected user message', () => {
    const { root, userEvent } = fixture()
    editDshSessionMessage(root, 'session-edit', userEvent.seq, 'user', '新的提问')
    const log = readDshSessionLog(root, 'session-edit')!
    const resumed = Session.create(SessionId('session-edit'),
      log.events as unknown as Parameters<typeof Session.create>[1],
      log.header as unknown as Parameters<typeof Session.create>[2],
      log.inheritedEventCount as Parameters<typeof Session.create>[3])
    expect(resumed.deriveMessages().map((message) => message.content)).toEqual([
      [{ type: 'text', text: '新的提问' }], [{ type: 'text', text: '你好，欢迎。' }],
      [{ type: 'text', text: '之后的问题' }], [{ type: 'text', text: '之后的回答' }]
    ])
  })

  it('refuses a mismatched role or id without touching the log', () => {
    const { root, path, assistantEvent } = fixture()
    const before = readFileSync(path, 'utf8')
    expect(() => editDshSessionMessage(root, 'session-edit', assistantEvent.seq, 'user', '错误内容')).toThrow()
    expect(() => editDshSessionMessage(root, 'session-edit', 999, 'assistant', '错误内容')).toThrow()
    expect(readFileSync(path, 'utf8')).toBe(before)
  })
})
