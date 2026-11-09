// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { runInNewContext } from 'node:vm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { dshClientPlugin } from '../../../../tests/helpers/dshClientPlugin'
import { officialChatFixture } from '../../../../tests/helpers/officialTrajectory.js'
import { interruptedTurnClosers, ToolCallRecovery } from '@deepseek-ai/dsh-session'
import { turnOutcomesProjection } from '../../../../packages/client/features/dsh-client-roleplay/src/host/turn-outcomes-projection.mjs'
import { inputContinuationsProjection } from '../../../../packages/client/features/dsh-client-roleplay/src/host/input-continuations-projection.mjs'
import { useChatSessions } from '../../src/modules/chat/hooks/useChatSessions.js'
import { RoleplayInputMenu } from '../../src/modules/chat/components/RoleplayInputMenu.jsx'
import { MessageList } from '../helpers/officialMarkdown.jsx'
import { findLatestRegenerateTargetMessageId } from '../../src/modules/chat/model/chatRegeneration.js'
import { selectRoleplayChatSeat } from '../../src/modules/chat/model/chatViewSeats.js'
import { messageFloorNumber } from '../../src/modules/appearance/preferences/chatDisplay.js'
import source from '../../../../packages/client/features/dsh-client-conversations/src/client.js?raw'

vi.stubGlobal('React', React)
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
afterEach(() => { document.body.innerHTML = '' })

function observable(snapshot) {
  const listeners = new Set()
  return { getSnapshot: snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    publish() { for (const listener of listeners) listener() },
  }
}

async function fixture() {
  const official = officialChatFixture()
  let chat = official.replace([])
  let running = false
  let removed = false
  const events = []
  let outcomes = turnOutcomesProjection.init()
  let inputs = inputContinuationsProjection.init()
  let seq = 0
  const target = observable(() => chat)
  const eventSource = observable(() => ({ entries: events, hasMore: false }))
  const outcomesFace = observable(() => outcomes)
  const inputsFace = observable(() => inputs)
  const preparation = Promise.withResolvers()
  let rewindSeq
  let fixtureApi
  const session = { ...observable(() => ({ running, removed })),
    cancel: vi.fn(async () => ({ ok: true })),
    projections: { faceOf: key => key === 'eleckoiTurnOutcomes' ? outcomesFace
      : key === 'eleckoiInputContinuations' ? inputsFace : observable(() => undefined) },
  }
  const binding = { session, eventSource }
  let registration, model, dispose
  runInNewContext(source, { Date, AbortController, setTimeout, clearTimeout,
    window: { __ModuleLoader__: { load: item => { registration = item } } } })
  dshClientPlugin(registration).apply({
    remote: { session: {},
      settings: {
        describe: async () => ({ ok: true, value: { namespaces: [{ ns: 'eleckoi-client-conversations',
          value: { selection: { active_conversation_id: 'synthetic-chat', preferred_sessions: {} } } }] } }),
        mutate: async () => ({ ok: true }),
      },
      eleckoiConversationModels: { current: async () => ({ ok: true,
        value: { provider: 'synthetic-provider', model: 'synthetic-model' } }) },
      eleckoiConversations: {
      changes: async function* (signal) { await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true })) },
      list: async () => ({ ok: true, value: [{ id: 'synthetic-chat', runtimeSessionId: 'synthetic-session' }] }),
      details: async () => ({ ok: true, value: { conversation: { id: 'synthetic-chat' }, runtimeSessionId: 'synthetic-session', messages: [] } }),
      regenerateMessage: (_id, eventSeq) => { rewindSeq = eventSeq; return preparation.promise },
      startRegeneration: async () => {
        fixtureApi.setRunning(true)
        fixtureApi.append('turn/start', { turn: 3 })
        const input = events.map(entry => entry.event).find(event => event.seq === rewindSeq)
        fixtureApi.append('eleckoi/input-continuation', {
          turn: 3, inputMessageId: input.data.id, inputEventSeq: rewindSeq,
        }, { ignorable: true })
        fixtureApi.append('step/start', { turn: 3, step: 1 })
        return { ok: true, value: { accepted: true, turn: 3 } }
      },
      deleteMessagesFrom: vi.fn(async (_id, eventSeq, role) => {
        const event = events.map(entry => entry.event).find(event => event.seq === eventSeq)
        expect(event).toMatchObject({ type: `${role}/message`, surfaceOp: 'append' })
        const messages = model.getDetailsSnapshot().details.messages
        const deletedMessageCount = messages.filter(message => message.sessionEventSeq >= eventSeq).length
        // Assistant deletion rewinds its execution turn, preserving the original input.
        const turnStart = events.findIndex(entry => entry.event.type === 'turn/start'
          && entry.event.data.turn === event.data.turn)
        rewindSeq = events[turnStart - 1].event.seq
        removed = true
        session.publish()
        return { ok: true, value: { deletedMessageCount, remainingMessageCount: messages.length - deletedMessageCount } }
      }),
    } },
    sessions: { list: observable(() => ({ byId: { 'synthetic-session': {} } })),
      refresh: async () => {},
      reloadHistory: async () => {
        const retained = events.map(entry => entry.event).filter(event => event.seq <= rewindSeq)
        retained.push(...interruptedTurnClosers(retained))
        events.splice(0, events.length, ...retained.map(event => ({ type: 'event', event })))
        outcomes = retained.reduce(turnOutcomesProjection.apply, turnOutcomesProjection.init())
        inputs = retained.reduce(inputContinuationsProjection.apply, inputContinuationsProjection.init())
        seq = retained.at(-1).seq
        chat = official.replace(retained)
        removed = false
      },
      retain: () => ({ sessionId: 'synthetic-session', binding, ready: Promise.resolve(binding), release() {} }),
    },
    uiConversation: { binding: () => ({ target: () => target }) },
    provide: (_name, value) => { model = value }, effect: run => { dispose = run() }, on: () => () => {},
  })
  await model.open('synthetic-chat')
  fixtureApi = { model, dispose: () => dispose(),
    snapshot: () => chat,
    cancel: () => session.cancel(),
    lastSeq: () => seq,
    setRunning(value) { running = value; session.publish() },
    completePreparation() {
      removed = true
      session.publish()
      preparation.resolve({ ok: true, value: { prepared: true } })
    },
    recoverTools() {
      const recovery = new ToolCallRecovery()
      for (const entry of events) recovery.observe(entry.event)
      for (const event of recovery.results()) this.append(event.type, event.data, {
        surfaceOp: event.surfaceOp, sourceEventSeqs: event.sourceEventSeqs,
      })
    },
    append(type, data, extra = {}) {
      const event = { type, data, seq: ++seq, time: seq, ...extra }
      if (type !== 'assistant/live-chunk') {
        events.push({ type: 'event', event })
        outcomes = turnOutcomesProjection.apply(outcomes, event)
        inputs = inputContinuationsProjection.apply(inputs, event)
      }
      chat = official.append(event)
      target.publish(); eventSource.publish(); outcomesFace.publish(); inputsFace.publish()
      return chat
    },
  }
  return fixtureApi
}

describe('cancelled official Chat projection', () => {
  it.each(['interrupted', 'aborted', 'error'])('numbers a retained image input before its %s process row in official display order', async reason => {
    const f = await fixture()
    const user = (id, content) => ({ id, role: 'user', source: { kind: 'user' }, content })
    try {
      f.append('turn/start', { turn: 1 })
      f.append('step/start', { turn: 1, step: 1 })
      f.append('user/message', user('synthetic-first-input', [{ type: 'text', text: 'Synthetic first input' }]), { surfaceOp: 'append' })
      const inputSeq = f.lastSeq()
      f.append('step/end', { turn: 1, step: 1 })
      f.append('turn/end', { turn: 1, reason: { kind: 'interrupted' } })
      f.append('turn/start', { turn: 2 })
      f.append('eleckoi/input-continuation', { turn: 2, inputMessageId: 'synthetic-first-input', inputEventSeq: inputSeq }, { ignorable: true })
      f.append('step/start', { turn: 2, step: 1 })
      f.append('assistant/message', { turn: 2, step: 1, stream: [], message: { id: 'synthetic-first-reply', role: 'assistant',
        source: { provider: 'synthetic', model: 'synthetic' }, content: [{ type: 'text', text: '<FINAL>Synthetic reply</FINAL>' }] } }, { surfaceOp: 'append' })
      f.append('step/end', { turn: 2, step: 1 })
      f.append('turn/end', { turn: 2, reason: { kind: 'completed' } })
      f.append('turn/start', { turn: 3 })
      f.append('step/start', { turn: 3, step: 1 })
      f.append('user/message', user('synthetic-image-input', [
        { type: 'image', attachment: { attachmentId: 'sha256:synthetic-image', name: 'synthetic.png', mimeType: 'image/png', bytes: 1 } },
        { type: 'text', text: 'Synthetic retained image input' },
      ]), { surfaceOp: 'append' })
      const imageSeq = f.lastSeq()
      if (reason !== 'interrupted') f.append('llm/retry', { retryId: 'synthetic-retry', turn: 3, step: 1,
        provider: 'synthetic', mode: 'normal', policyKey: 'synthetic', retry: 1, maxRetries: 2, delayMs: 10,
        failure: { message: 'Synthetic failure' } })
      f.append('step/end', { turn: 3, step: 1 })
      f.append('turn/end', { turn: 3, reason: reason === 'aborted' ? { kind: reason, reason: { kind: 'user' } }
        : reason === 'error' ? { kind: reason, error: { message: 'Synthetic failure' } } : { kind: reason } })
      const messages = f.model.getDetailsSnapshot().details.messages
      const snapshot = f.snapshot()
      const seats = snapshot.order.map(key => selectRoleplayChatSeat(messages, 'synthetic-session', snapshot.nodes.get(key))).filter(Boolean)
      expect(seats.map(seat => messageFloorNumber(messages, seat.index))).toEqual([0, 1, 2, 3])
      expect(seats.map(seat => seat.item.role)).toEqual(['user', 'assistant', 'user', 'assistant'])
      expect(messages.map(message => message.role)).toEqual(['user', 'assistant', 'user', 'assistant'])
      expect(messages[2]).toMatchObject({ dshMessageId: 'synthetic-image-input', sessionEventSeq: imageSeq, sequence: imageSeq,
        inputImageAttachments: [{ attachmentId: 'sha256:synthetic-image' }] })
      expect(messages[3]).toMatchObject({ renderKey: 'dsh-reply-synthetic-session-3', dshTurn: 3 })
      if (reason === 'interrupted') expect(messages[3].sequence).toBeLessThan(imageSeq)
    } finally { f.dispose() }
  })

  it('unlocks the composer after interrupting regeneration in reasoning and deletes that exact reply', async () => {
    const f = await fixture()
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    let chat, regenerating, originalInputSeq
    const props = { conversations: f.model, characters: [],
      modelConfigs: [{ id: 'synthetic-provider', model: 'synthetic-model' }],
      setStatus: vi.fn(), setActiveSectionState: vi.fn(), notify: vi.fn() }
    function Probe() {
      chat = useChatSessions(props)
      const [deleteMode, setDeleteMode] = React.useState(false)
      const [selected, setSelected] = React.useState('')
      return React.createElement(React.Fragment, null,
        React.createElement(RoleplayInputMenu, {
          isSending: chat.isSending,
          canDeleteMessages: chat.messages.length > 0,
          regenerateTargetMessageId: findLatestRegenerateTargetMessageId(chat.messages),
          onRegenerate: input => { regenerating = chat.regenerateReply(input) },
          onEnterDeleteMode: () => setDeleteMode(true),
        }),
        React.createElement(MessageList, {
          messages: chat.messages, layoutMode: 'agent', profile: { reply_spacing: 10, turn_spacing: 10 },
          avatarShape: 'portrait', userAvatar: '', assistantAvatar: '',
          userName: '合成用户', assistantName: '合成角色', deleteMode,
          deleteFromMessageId: selected, onSelectDeleteFrom: setSelected,
        }),
        React.createElement('button', { 'data-delete': true, disabled: !selected,
          onClick: () => chat.deleteMessagesFrom(selected) }, '删除选中回复'))
    }
    const menu = label => [...container.querySelectorAll('[role="menuitem"]')]
      .find(button => button.textContent === label)
    const openMenu = () => container.querySelector('.roleplay-menu-trigger').click()
    try {
      for (const turn of [1, 2]) {
        f.setRunning(true)
        f.append('turn/start', { turn })
        f.append('step/start', { turn, step: 1 })
        f.append('user/message', { id: `synthetic-input-${turn}`, role: 'user', source: { kind: 'user' },
          content: [{ type: 'text', text: `合成输入 ${turn}` }] }, { surfaceOp: 'append' })
        if (turn === 2) originalInputSeq = f.lastSeq()
        f.append('assistant/message', { turn, step: 1, stream: [], message: {
          id: `synthetic-reply-${turn}`, role: 'assistant', source: { provider: 'synthetic', model: 'synthetic' },
          content: [{ type: 'text', text: '<FINAL>合成原回复</FINAL>' }],
        } }, { surfaceOp: 'append' })
        f.append('step/end', { turn, step: 1 })
        f.append('turn/end', { turn, reason: { kind: 'completed' } })
        f.setRunning(false)
      }
      await act(async () => { root.render(React.createElement(Probe)); await new Promise(resolve => setTimeout(resolve, 0)) })
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
      expect(chat.messages).toHaveLength(4)
      expect(chat.messages.some(message => message.sessionEventSeq === originalInputSeq)).toBe(true)
      await act(async () => openMenu())
      await act(async () => { menu('重新生成').click(); await Promise.resolve() })
      await act(async () => { f.completePreparation(); await new Promise(resolve => setTimeout(resolve, 0)) })
      await act(async () => {
        f.append('assistant/live-chunk', { turn: 3, step: 1,
          chunk: { type: 'block-start', index: 0, blockType: 'reasoning' } })
        f.append('assistant/live-chunk', { turn: 3, step: 1,
          chunk: { type: 'reasoning-delta', index: 0, text: '合成思考过程' } })
      })
      await act(async () => openMenu())
      expect(menu('重新生成').disabled).toBe(true)
      expect(menu('删除消息').disabled).toBe(true)
      // The native DSH stop button cancels the Session without touching the product request wrapper.
      await act(async () => { await f.cancel() })
      let replySeq
      await act(async () => {
        f.append('assistant/message', { turn: 3, step: 1, stream: [], interrupted: true, message: {
          id: 'synthetic-regenerated-interruption', role: 'assistant', source: { provider: 'synthetic', model: 'synthetic' },
          content: [{ type: 'reasoning', text: '合成思考过程' }],
        } }, { surfaceOp: 'append' })
        replySeq = f.lastSeq()
        f.append('step/end', { turn: 3, step: 1 })
        f.append('turn/end', { turn: 3, reason: { kind: 'aborted', reason: { kind: 'user' } } })
        f.setRunning(false)
        await regenerating
      })
      expect(chat.isSending).toBe(false)
      expect(menu('重新生成').disabled).toBe(false)
      expect(menu('删除消息').disabled).toBe(false)
      expect(chat.messages.at(-1)).toMatchObject({ id: 'synthetic-regenerated-interruption',
        sessionEventSeq: replySeq, inputEventSeq: originalInputSeq })
      await act(async () => menu('删除消息').click())
      const checkbox = [...container.querySelectorAll('.message-delete-checkbox')].at(-1)
      expect(checkbox.disabled).toBe(false)
      await act(async () => checkbox.click())
      await act(async () => container.querySelector('[data-delete]').click())
      expect(chat.messages.some(message => message.sessionEventSeq === replySeq)).toBe(false)
      expect(chat.messages.some(message => message.sessionEventSeq === originalInputSeq)).toBe(true)
      expect(props.notify).not.toHaveBeenCalled()
    } finally { await act(async () => root.unmount()); f.dispose() }
  })

  it.each(['reasoning-only', 'partial-final'])('retains an earlier interrupted %s floor throughout a later regeneration', async content => {
    const f = await fixture()
    const messages = () => f.model.getDetailsSnapshot().details.messages
    let stop
    try {
      f.setRunning(true)
      f.append('turn/start', { turn: 1 })
      f.append('step/start', { turn: 1, step: 1 })
      f.append('user/message', { id: 'synthetic-input-1', role: 'user', source: { kind: 'user' },
        content: [{ type: 'text', text: '合成输入一' }] }, { surfaceOp: 'append' })
      f.append('assistant/message', { turn: 1, step: 1, stream: [], interrupted: true, message: {
        id: 'synthetic-interrupted-1', role: 'assistant', source: { provider: 'synthetic', model: 'synthetic' },
        content: content === 'reasoning-only'
          ? [{ type: 'reasoning', text: '合成中断过程' }]
          : [{ type: 'text', text: '<FINAL>合成中断正文' }],
      } }, { surfaceOp: 'append' })
      const interruptedSeq = f.lastSeq()
      f.append('step/end', { turn: 1, step: 1 })
      f.append('turn/end', { turn: 1, reason: { kind: 'aborted', reason: { kind: 'user' } } })
      f.setRunning(false)
      const interrupted = messages().find(message => message.role === 'assistant')
      expect(interrupted.status).toBe('cancelled')
      expect.soft(interrupted.sessionEventSeq).toBe(interruptedSeq)

      f.setRunning(true)
      f.append('turn/start', { turn: 2 })
      f.append('step/start', { turn: 2, step: 1 })
      f.append('user/message', { id: 'synthetic-input-2', role: 'user', source: { kind: 'user' },
        content: [{ type: 'text', text: '合成输入二' }] }, { surfaceOp: 'append' })
      const inputSeq = f.lastSeq()
      f.append('assistant/message', { turn: 2, step: 1, stream: [], message: {
        id: 'synthetic-assistant-2', role: 'assistant', source: { provider: 'synthetic', model: 'synthetic' },
        content: [{ type: 'text', text: '<FINAL>合成待重生成回复</FINAL>' }],
      } }, { surfaceOp: 'append' })
      f.append('step/end', { turn: 2, step: 1 })
      f.append('turn/end', { turn: 2, reason: { kind: 'completed' } })
      f.setRunning(false)
      const snapshots = []
      stop = f.model.subscribeChat(() => snapshots.push(messages()))
      const request = f.model.regenerate({ conversationId: 'synthetic-chat', requestId: 'synthetic-regeneration', eventSeq: inputSeq })
      await Promise.resolve()
      expect.soft(messages().find(message => message.renderKey === interrupted.renderKey))
        .toMatchObject({ sequence: interrupted.sequence, status: 'cancelled', process: interrupted.process })
      expect.soft(messages().some(message => message.displayContent === '合成待重生成回复')).toBe(false)
      f.completePreparation()
      await new Promise(resolve => setTimeout(resolve, 0))
      f.append('assistant/message', { turn: 3, step: 1, stream: [], message: {
        id: 'synthetic-assistant-3', role: 'assistant', source: { provider: 'synthetic', model: 'synthetic' },
        content: [{ type: 'text', text: '<FINAL>合成重生成回复</FINAL>' }],
      } }, { surfaceOp: 'append' })
      f.append('step/end', { turn: 3, step: 1 })
      f.append('turn/end', { turn: 3, reason: { kind: 'completed' } })
      f.setRunning(false)
      await request
      expect(snapshots.every(snapshot => snapshot.some(message => message.renderKey === interrupted.renderKey
        && message.sequence === interrupted.sequence && message.status === 'cancelled'))).toBe(true)
      expect(messages().at(-1).displayContent).toBe('合成重生成回复')
      expect(messages().at(-1).sessionEventSeq).toBeGreaterThan(inputSeq)
    } finally { stop?.(); f.dispose() }
  })

  it('releases the busy state when a completed turn has only a durable reasoning reply', async () => {
    const f = await fixture()
    try {
      f.setRunning(true)
      f.append('turn/start', { turn: 1 })
      f.append('step/start', { turn: 1, step: 1 })
      f.append('user/message', { id: 'synthetic-input', role: 'user', source: { kind: 'user' },
        content: [{ type: 'text', text: '合成输入' }] }, { surfaceOp: 'append' })
      f.append('assistant/live-chunk', { turn: 1, step: 1,
        chunk: { type: 'block-start', index: 0, blockType: 'reasoning' } })
      f.append('assistant/live-chunk', { turn: 1, step: 1,
        chunk: { type: 'reasoning-delta', index: 0, text: '合成思考过程' } })
      expect(f.model.getStreamSnapshot().status).toBe('running')
      f.append('assistant/message', { turn: 1, step: 1, stream: [], message: {
        id: 'synthetic-reasoning', role: 'assistant', source: { provider: 'synthetic', model: 'synthetic' },
        content: [{ type: 'reasoning', text: '合成思考过程' }],
      } }, { surfaceOp: 'append' })
      const replySeq = f.lastSeq()
      f.append('step/end', { turn: 1, step: 1 })
      f.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
      f.setRunning(false)
      expect.soft(f.model.getStreamSnapshot().status).toBe('idle')
      expect(f.model.getDetailsSnapshot().details.messages.at(-1))
        .toMatchObject({ status: 'complete', sessionEventSeq: replySeq })
    } finally { f.dispose() }
  })

  it.each(['preparing', 'started'])('does not revive %s tools or the interrupted old floor when the next turn starts', async stage => {
    const f = await fixture()
    try {
      f.setRunning(true)
      f.append('turn/start', { turn: 1 })
      f.append('step/start', { turn: 1, step: 1 })
      f.append('user/message', { id: 'synthetic-input-1', role: 'user', source: { kind: 'user' },
        content: [{ type: 'text', text: '合成输入一' }] }, { surfaceOp: 'append' })
      f.append('assistant/live-chunk', { turn: 1, step: 1, chunk: { type: 'block-start', index: 0, blockType: 'reasoning' } })
      f.append('assistant/live-chunk', { turn: 1, step: 1, chunk: { type: 'reasoning-delta', index: 0, text: '合成处理过程' } })
      for (const [index, name] of ['synthetic_read_settings', 'synthetic_read_variables'].entries()) {
        f.append('assistant/live-chunk', { turn: 1, step: 1,
          chunk: { type: 'tool-call-delta', index: index + 1, id: `synthetic-call-${index}`, name, argumentsDelta: '{}' } })
      }
      expect(f.model.getDetailsSnapshot().details.messages.at(-1).process.filter(item => item.kind === 'tool')).toHaveLength(2)
      if (stage === 'started') {
        f.append('assistant/message', { turn: 1, step: 1, stream: [], message: {
          id: 'synthetic-assistant-1', role: 'assistant', source: { provider: 'synthetic', model: 'synthetic' },
          content: [{ type: 'reasoning', text: '合成处理过程' }, ...['synthetic_read_settings', 'synthetic_read_variables']
            .map((name, index) => ({ type: 'tool-call', id: `synthetic-call-${index}`, name, arguments: '{}' }))],
        } }, { surfaceOp: 'append' })
        for (const [index, name] of ['synthetic_read_settings', 'synthetic_read_variables'].entries()) {
          f.append('tool/call', { turn: 1, step: 1, callId: `synthetic-call-${index}`, name, arguments: '{}' })
        }
        f.append('tool/result', { turn: 1, step: 1, message: { id: 'synthetic-tool-result', role: 'tool',
          toolCallId: 'synthetic-call-0', source: { kind: 'tool', callId: 'synthetic-call-0' },
          content: [{ type: 'text', text: '合成完成结果' }],
        } }, { surfaceOp: 'append' })
        f.recoverTools()
      }
      f.append('step/end', { turn: 1, step: 1 })
      const stopped = f.append('turn/end', { turn: 1, reason: { kind: 'aborted', reason: { kind: 'user' } } })
      if (stage === 'preparing') expect([...stopped.nodes.values()].filter(node => node.kind === 'tool-call'))
        .toMatchObject([{ visibility: 'hidden' }, { visibility: 'hidden' }])
      f.setRunning(false)
      const cancelled = f.model.getDetailsSnapshot().details.messages.find(message => message.role === 'assistant')
      expect.soft(cancelled.status).toBe('cancelled')
      expect.soft(Number.isSafeInteger(cancelled.sessionEventSeq)).toBe(stage === 'started')
      expect.soft(cancelled.process.some(item => item.status === 'running')).toBe(false)
      if (stage === 'started') expect(cancelled.process.filter(item => item.kind === 'tool'))
        .toMatchObject([{ id: 'synthetic-call-0', status: 'complete' }, { id: 'synthetic-call-1', status: 'error' }])

      f.setRunning(true)
      expect.soft(f.model.getStreamSnapshot().status === 'running'
        && f.model.getStreamSnapshot().dshTurn === 1).toBe(false)
      f.append('turn/start', { turn: 2 })
      f.append('step/start', { turn: 2, step: 1 })
      f.append('user/message', { id: 'synthetic-input-2', role: 'user', source: { kind: 'user' },
        content: [{ type: 'text', text: '合成输入二' }] }, { surfaceOp: 'append' })
      const nextInputSeq = f.lastSeq()
      f.append('assistant/live-chunk', { turn: 2, step: 1, chunk: { type: 'block-start', index: 0, blockType: 'text' } })
      f.append('assistant/live-chunk', { turn: 2, step: 1, chunk: { type: 'text-delta', index: 0, text: '<FINAL>合成新回复' } })
      const messages = f.model.getDetailsSnapshot().details.messages
      expect.soft(messages.find(message => message.dshTurn === 1 && message.role === 'assistant'))
        .toMatchObject({ status: 'cancelled', process: cancelled.process })
      expect.soft(messages.filter(message => message.status === 'streaming'))
        .toMatchObject([{ role: 'assistant', dshTurn: 2 }])
      expect(messages.findIndex(message => message.role === 'assistant' && message.dshTurn === 1))
        .toBeLessThan(messages.findIndex(message => message.sessionEventSeq === nextInputSeq))
    } finally { f.dispose() }
  })
})
