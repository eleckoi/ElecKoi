// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChatView, chatFixture, userNode, turnNode, ManualCompactionNodeView } from '../helpers/officialChatView.jsx'
import { MessageList } from '../helpers/officialMarkdown.jsx'
import { selectRoleplayChatSeat, selectRoleplayPendingInput } from '../../src/modules/chat/model/chatViewSeats.js'
import { officialChatFixture } from '../../../../tests/helpers/officialTrajectory.js'
import { interruptedTurnClosers } from '@deepseek-ai/dsh-session'
import * as libraries from '@eleckoi/dsh-client-html-resources/browser-libraries'
import { RichMessageRenderProvider } from '../../src/modules/authorFrontend/hooks/RichMessageRenderContext.jsx'
import { decorateRichDisplayReplacement } from '../../../../packages/shared/src/foundation/richMessage'

let observers
beforeEach(() => {
  vi.stubGlobal('React', React)
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  observers = new Set()
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback) { this.callback = callback }
    observe() { observers.add(this.callback) }
    disconnect() { observers.delete(this.callback) }
  })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

function mountChat(sessionId = 'session-render', fixture = chatFixture(sessionId)) {
  const scroller = document.createElement('div')
  scroller.dataset.conversationScroll = ''
  document.body.append(scroller)
  let height = 1000
  Object.defineProperties(scroller, {
    clientHeight: { get: () => 200 }, scrollHeight: { get: () => height },
    scrollTop: { writable: true, value: 800 },
  })
  scroller.scrollTo = ({ top }) => { scroller.scrollTop = top }
  scroller.getBoundingClientRect = () => ({ top: 0, bottom: 200, left: 0, right: 800, width: 800, height: 200 })
  const root = createRoot(scroller)
  let messages = []
  const nodeRenderers = new Map()
  const richMessagePolicy = { enabled: false, floorLimit: 1 }
  const rowProps = {
    conversationId: 'chat-test', layoutMode: 'roleplay', profile: { reply_spacing: 10, turn_spacing: 10 },
    avatarShape: 'portrait', userName: '用户', assistantName: '合成角色',
    userAvatar: '', assistantAvatar: '', showRoleplayTimestamp: true, showRoleplayFloor: true,
    runtimeSessionId: sessionId, onRegenerate: vi.fn(),
  }
  const renderSlot = (name, owner, options) => {
    if (name === 'conversation.chat.node') {
      const seat = selectRoleplayChatSeat(messages, sessionId, owner.node)
      const Renderer = nodeRenderers.get(owner.node.kind)
      const fallback = Renderer ? <Renderer {...owner} /> : owner.node.kind === 'manual-compaction'
        ? <ManualCompactionNodeView node={owner.node} t={fixture.props.t} /> : options?.fallback ?? null
      return seat ? <MessageList {...rowProps} messages={messages} seat={seat} officialNode />
        : seat === undefined ? fallback : null
    }
    if (name === 'conversation.chat.pending-input') return <MessageList {...rowProps} messages={messages}
      seat={selectRoleplayPendingInput(messages, sessionId, owner.input)} />
    return options?.fallback ?? null
  }
  return { fixture, scroller, root, rowProps, richMessagePolicy, nodeRenderers,
    async render(nextMessages = messages, next = {}, viewProps = {}) {
      messages = nextMessages
      await act(async () => { fixture.update(next); root.render(<RichMessageRenderProvider messages={messages} {...richMessagePolicy}>
        <ChatView {...fixture.props} renderSlot={renderSlot} {...viewProps} />
      </RichMessageRenderProvider>) })
    },
    async grow() { await act(async () => { height += 40; for (const callback of observers) callback([]) }) },
    async move(top, end = false) { await act(async () => {
      scroller.dispatchEvent(new Event('wheel'))
      scroller.scrollTop = top
      scroller.dispatchEvent(new Event('scroll'))
      if (end) scroller.dispatchEvent(new Event('scrollend'))
    }) },
    async close() { await act(async () => root.unmount()); expect(fixture.listeners.size).toBe(0) },
  }
}

describe('official ChatView with roleplay presentation', () => {
  it('renders plugin nodes alongside roleplay messages through their registered renderers', async () => {
    const view = mountChat()
    const renderImage = vi.fn(({ node }) => <img alt={node.data.caption} src="data:image/png;base64,AA==" />)
    const renderPanel = vi.fn(({ node }) => <aside>{node.data.text}</aside>)
    view.nodeRenderers.set('synthetic-image-result', renderImage)
    view.nodeRenderers.set('synthetic-plugin-panel', renderPanel)
    const nodes = [userNode('input', 1, 'request'), turnNode('reply', 1, 'closed'),
      { key: 'plugin-image', kind: 'synthetic-image-result', anchorSeq: 20,
        location: { kind: 'session' }, data: { caption: 'Synthetic generated image' } },
      { key: 'plugin-panel', kind: 'synthetic-plugin-panel', anchorSeq: 21,
        location: { kind: 'session' }, data: { text: 'Synthetic plugin panel' } }]
    const reply = { id: 'reply', role: 'assistant', runtimeSessionId: 'session-render',
      renderKey: 'dsh-reply-session-render-1', content: 'Synthetic reply', status: 'complete' }
    try {
      await view.render([reply], { order: nodes.map(node => node.key), nodes: new Map(nodes.map(node => [node.key, node])) })
      expect(view.scroller.querySelector('img[alt="Synthetic generated image"]')).not.toBeNull()
      expect(view.scroller.querySelector('aside')?.textContent).toBe('Synthetic plugin panel')
      expect(renderImage).toHaveBeenCalled()
      expect(renderPanel).toHaveBeenCalled()
      expect(view.scroller.textContent.match(/Synthetic reply/g)).toHaveLength(1)
      expect(view.scroller.textContent.match(/合成输入/g)).toHaveLength(1)
    } finally { await view.close() }
  })
  it('restores the official reading position with deferred rich messages and keeps the same Chat owner', async () => {
    const ready = { status: 'ready', error: '' }
    window.__ElecKoiHtmlResources = { assetsBaseUrl: '/eleckoi/html/', sdk: libraries,
      getSnapshot: () => ready, subscribe: () => () => {} }
    const first = mountChat()
    first.richMessagePolicy.enabled = true
    const messages = [1, 2].map(turn => ({ id: `synthetic-rich-${turn}`, conversationId: 'chat-test', role: 'assistant',
      runtimeSessionId: 'session-render', renderKey: `dsh-reply-session-render-${turn}`, content: 'Narrative',
      displayContent: 'Narrative\n' + decorateRichDisplayReplacement('<section>Card</section>'), status: 'complete' }))
    const nodes = [userNode('rich-input', 1, 'synthetic-request'), turnNode('rich-turn-1', 1, 'closed'), turnNode('rich-turn-2', 2, 'closed')]
    const geometry = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      const top = 200 - (this.closest('[data-conversation-scroll]')?.scrollTop ?? 0)
      return { top, bottom: top + 80, left: 0, right: 800, width: 800, height: 80 }
    })
    try {
      await first.render(messages, { order: nodes.map(node => node.key), nodes: new Map(nodes.map(node => [node.key, node])) })
      expect(first.scroller.querySelectorAll('iframe')).toHaveLength(1)
      expect(first.scroller.querySelector('.rich-message-load')).not.toBeNull()
      await first.move(320, true)
      const saved = first.fixture.saved
      expect(saved.scrollTop).toBe(320)
      const chatOwner = first.scroller.querySelector('[data-chat-column]')
      first.richMessagePolicy.enabled = false
      await first.render(messages)
      expect(first.scroller.querySelector('[data-chat-column]')).toBe(chatOwner)
      expect(first.fixture.saved).toEqual(saved)
      expect(first.scroller.scrollTop).toBe(320)
      await first.close()
      const restored = mountChat('session-render', first.fixture)
      restored.richMessagePolicy.enabled = true
      try {
        await restored.render(messages)
        expect(restored.scroller.scrollTop).toBe(320)
        expect(restored.scroller.querySelectorAll('iframe')).toHaveLength(1)
        expect(restored.scroller.querySelector('[data-chat-following-tail]')).toBeNull()
      } finally { await restored.close() }
    } finally {
      if (first.scroller.querySelector('[data-chat-column]')) await first.close()
      geometry.mockRestore()
      delete window.__ElecKoiHtmlResources
    }
  })
  it.each(['roleplay', 'agent'])('keeps the retired native control from rendering a second AI row during regenerated compaction (%s)', async layoutMode => {
    const view = mountChat()
    view.rowProps.layoutMode = layoutMode
    view.rowProps.onOpenProcess = vi.fn()
    const event = (type, seq, data, surfaceOp) => ({ type, seq, time: seq * 100, data, ...(surfaceOp ? { surfaceOp } : {}) })
    const prefix = [event('turn/start', 1, { turn: 1 }),
      event('compaction/start', 2, { turn: 1, compactionId: 'retired-compaction' }),
      event('compaction/end', 3, { turn: 1, compactionId: 'retired-compaction', error: 'Synthetic interrupted summary' }),
      event('step/start', 4, { turn: 1, step: 1 }),
      event('user/message', 5, { id: 'retained-input', role: 'user', source: { kind: 'user' },
        content: [{ type: 'text', text: 'Synthetic retained input' }] }, 'append')]
    const events = [...prefix, ...interruptedTurnClosers(prefix), event('turn/start', 8, { turn: 2 }),
      event('eleckoi/input-continuation', 9, { turn: 2, inputEventSeq: 5, inputMessageId: 'retained-input' }),
      event('compaction/start', 10, { turn: 2, compactionId: 'replacement-compaction' })]
    const snapshot = officialChatFixture().replace(events)
    const message = { id: 'replacement-process', runtimeSessionId: 'session-render',
      renderKey: 'dsh-reply-session-render-2', dshTurn: 2, role: 'assistant', pending: true, status: 'streaming', content: '',
      process: [{ id: 'compaction:10', kind: 'compaction', status: 'running', startedAtMillis: 1000 }] }
    try {
      expect([...snapshot.nodes.values()].filter(node => node.kind === 'turn-process')).toHaveLength(2)
      await view.render([message], { ...snapshot, session: { ...view.fixture.state.session, running: true } })
      expect(view.scroller.querySelectorAll('.message-flow-row')).toHaveLength(2)
      expect(view.scroller.textContent.match(/Synthetic retained input/g)).toHaveLength(1)
      expect(view.scroller.querySelectorAll('[aria-label="查看处理过程：正在自动压缩"]')).toHaveLength(1)
      const oldControl = [...snapshot.nodes.values()].find(node => node.kind === 'turn-process' && node.data.turn === 1)
      expect(view.scroller.querySelector(`[data-chat-node-key="${oldControl.key}"] .message-flow-row`)).toBeNull()
    } finally { await view.close() }
  })

  it.each(['roleplay', 'agent'])('opens the live process owner and keeps compaction status in the main row (%s)', async layoutMode => {
    const view = mountChat()
    view.rowProps.layoutMode = layoutMode
    let selectedMessage
    view.rowProps.onOpenProcess = message => { selectedMessage = message }
    const control = turnNode('synthetic-process', 2)
    const compaction = { id: 'compaction:9', kind: 'compaction', status: 'running', toolName: 'compaction',
      arguments: '', summary: '', detail: '', startedAtMillis: 900 }
    const message = { id: 'synthetic-live', runtimeSessionId: 'session-render',
      renderKey: 'dsh-reply-session-render-2', dshTurn: 2, role: 'assistant',
      pending: true, status: 'streaming', content: '', process: [compaction] }
    try {
      await view.render([message], { order: [control.key], nodes: new Map([[control.key, control]]) })
      const button = view.scroller.querySelector('[aria-label="查看处理过程：正在自动压缩"]')
      expect(button).not.toBeNull()
      await act(async () => button.click())
      expect(selectedMessage.process).toEqual([compaction])
      const completed = { ...message, process: [{ ...compaction, status: 'complete', completedAtMillis: 1200,
        detail: 'Synthetic compacted summary' }] }
      await view.render([completed])
      expect(view.scroller.textContent).toContain('上下文已自动压缩')
      expect(view.scroller.textContent).not.toContain('正在自动压缩')
    } finally { await view.close() }
  })
  it('does not render a separate automatic compression checkpoint after the AI row', () => {
    expect(selectRoleplayChatSeat([], 'session-render', {
      key: 'synthetic-auto-checkpoint', kind: 'compaction', data: { kind: 'compaction', seq: 20 },
    })).toBeNull()
  })
  it.each(['turn-error', 'turn-max-tokens'])('keeps %s and tool records inside the AI process while retaining its visible status', async noticeKind => {
    const view = mountChat()
    let selectedMessage
    view.rowProps.onOpenProcess = message => { selectedMessage = message }
    const tool = { key: 'synthetic-tool', kind: 'tool-call', anchorSeq: 3,
      location: { kind: 'step', turn: { turn: 1 } }, data: { root: { kind: 'tool-result', callId: 'synthetic-call' } } }
    const notice = { key: 'synthetic-notice', kind: noticeKind, anchorSeq: 4,
      location: { kind: 'turn', turn: { turn: 1 } }, data: { turn: 1, message: 'Synthetic generation failure' } }
    const nodes = [turnNode('synthetic-process', 1, 'closed'), tool, notice]
    const process = [{ id: 'synthetic-call', kind: 'tool', toolName: 'eleckoi_glob_setting_files', status: 'error',
      summary: 'eleckoi_glob_setting_files', arguments: '{}', detail: 'Synthetic tool failure' },
    { id: 'synthetic-notice', kind: 'action', toolName: noticeKind === 'turn-error' ? 'turn_error' : 'turn_max_tokens',
      status: 'error', detail: JSON.stringify(notice.data) }]
    const message = { id: 'synthetic-reply', runtimeSessionId: 'session-render', renderKey: 'dsh-reply-session-render-1',
      role: 'assistant', content: noticeKind === 'turn-error' ? '' : 'Synthetic partial reply', status: 'error', process }
    const label = noticeKind === 'turn-error' ? '生成失败' : '输出达到模型长度上限'
    try {
      await view.render([message], { order: nodes.map(node => node.key), nodes: new Map(nodes.map(node => [node.key, node])) })
      expect(view.scroller.querySelectorAll('.message-flow-row')).toHaveLength(1)
      expect(view.scroller.textContent).not.toContain('message.unknownSurface')
      expect(view.scroller.textContent).not.toContain('Synthetic tool failure')
      const button = view.scroller.querySelector(`[aria-label="查看处理过程：${label}"]`)
      expect(button).not.toBeNull()
      await act(async () => button.click())
      expect(selectedMessage.process).toEqual(process)
      expect(selectedMessage.process.at(-1).toolName).toBe(noticeKind === 'turn-error' ? 'turn_error' : 'turn_max_tokens')
    } finally { await view.close() }
  })
  it('retains the official compression progress and failure node in roleplay', async () => {
    const node = { key: 'compact-command', kind: 'manual-compaction', anchorSeq: 12,
      data: { command: { kind: 'command', seq: 12, time: 12, commandId: 'synthetic-command', name: 'compact', outcome: null }, compaction: null } }
    const view = mountChat()
    try {
      expect(selectRoleplayChatSeat([], 'session-render', node)).toBeUndefined()
      await view.render([], { order: [node.key], nodes: new Map([[node.key, node]]) })
      expect(view.scroller.textContent).toContain('message.compaction.running')
      const failed = { ...node, data: { ...node.data, command: { ...node.data.command,
        outcome: { kind: 'error', text: '合成摘要请求失败' } } } }
      await view.render([], { nodes: new Map([[node.key, failed]]) })
      expect(view.scroller.textContent).toContain('合成摘要请求失败')
    } finally { await view.close() }
  })
  it('follows an explicit regeneration of the same image input and lets the reader interrupt following', async () => {
    const fixture = chatFixture()
    const input = userNode('image-input', 1, 'original-request')
    input.data.content.push({ type: 'image', attachment: { attachmentId: 'synthetic-image', width: 220, height: 220 } })
    const previous = turnNode('previous-turn', 1, 'closed')
    const next = turnNode('replacement-turn', 2)
    const view = mountChat('session-test', fixture)
    const oldState = { order: [input.key, previous.key], nodes: new Map([[input.key, input], [previous.key, previous]]) }
    const regenerated = { order: [input.key, next.key], nodes: new Map([[input.key, input], [next.key, next]]) }
    try {
      await view.render([], oldState)
      await view.move(300, true)
      const intent = { followTailRequestId: 'regenerate-1' }
      await view.render([], { ...regenerated, session: { ...fixture.state.session, openState: 'loading' } }, intent)
      expect(view.scroller.scrollTop).toBe(300)
      await view.render([], { session: { ...fixture.state.session, openState: 'open', running: true } }, intent)
      expect(view.scroller.scrollTop).toBe(800)
      await view.grow()
      expect(view.scroller.scrollTop).toBe(840)
      await view.move(350, true)
      await view.render([], { session: { ...fixture.state.session, running: false } }, intent)
      await view.grow()
      expect(view.scroller.scrollTop).toBe(350)
    } finally { await view.close() }
  })
  it('does not insert a history-loading row into the message flow during resync', async () => {
    const fixture = chatFixture()
    const input = userNode('input-stable', 3, 'request-stable')
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    try {
      await act(async () => {
        fixture.update({ order: [input.key], nodes: new Map([[input.key, input]]) })
        root.render(<ChatView {...fixture.props} />)
      })
      const row = host.querySelector('[data-chat-node-key="input-stable"]')
      const before = host.querySelector('[data-chat-column]').childElementCount
      await act(async () => fixture.update({ session: { ...fixture.state.session, openState: 'loading' } }))
      expect(host.textContent).not.toContain('chat.loadingHistory')
      expect(host.querySelector('[data-chat-column]').childElementCount).toBe(before)
      expect(host.querySelector('[data-chat-node-key="input-stable"]')).toBe(row)
      await act(async () => fixture.update({ session: { ...fixture.state.session, openState: 'error',
        openError: { message: 'synthetic failure', code: 'TEST' } } }))
      expect(host.textContent).toContain('chat.loadError')
    } finally { await act(async () => root.unmount()) }
  })

  it('portals the official running timer into a stable composer seat across regenerated turns', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(10000)
    const fixture = chatFixture()
    fixture.props.t = (key, values) => key + (values ? JSON.stringify(values) : '')
    const host = document.createElement('div')
    const runningSeat = document.createElement('div')
    runningSeat.dataset.chatRunningSeat = ''
    const composer = document.createElement('div')
    composer.dataset.composer = ''
    document.body.append(host, runningSeat, composer)
    const root = createRoot(host)
    const input = userNode('input-1', 3, 'original-request')
    const opened = turn => {
      const node = turnNode(`control-${turn}`, turn)
      node.location.turn.start = { time: Date.now() }
      return node
    }
    const publish = async turn => {
      const node = opened(turn)
      await act(async () => {
        fixture.update({ order: [input.key, node.key], nodes: new Map([[input.key, input], [node.key, node]]),
          rail: [{ anchorKey: node.key, turn: node.location.turn }], session: { ...fixture.state.session, running: true } })
        root.render(<ChatView {...fixture.props} runningStatusTarget={runningSeat} />)
      })
    }
    try {
      await publish(2)
      expect(host.querySelector('[data-chat-running]')).toBeNull()
      expect(runningSeat.querySelector('[data-chat-running]')).not.toBeNull()
      await act(async () => vi.advanceTimersByTime(2100))
      expect(runningSeat.textContent).toContain('chat.deepDivingFor')
      const timer = runningSeat.textContent
      await act(async () => {
        fixture.update({ session: { ...fixture.state.session, running: false } })
      })
      expect(runningSeat.textContent).toBe('')
      await publish(3)
      await act(async () => vi.advanceTimersByTime(3200))
      expect(runningSeat.textContent).not.toBe(timer)
      expect(runningSeat.nextElementSibling).toBe(composer)
      expect(host.querySelector('[data-chat-node-key="input-1"]')).not.toBeNull()
    } finally { await act(async () => root.unmount()) }
  })

  it('retires only the matching echo when the durable input arrives before product metadata', async () => {
    const chat = mountChat()
    const pending = { requestId: 'request-one', placement: 'transcript', time: 1, text: '合成输入', attachments: [] }
    const control = turnNode('control-1', 1)
    try {
      await chat.render([], { order: [control.key], nodes: new Map([[control.key, control]]),
        session: { ...chat.fixture.state.session, running: true, pendingSubmissions: [pending] } })
      expect(chat.scroller.textContent.match(/合成输入/g)).toHaveLength(1)
      const input = userNode('input-1', 1, pending.requestId)
      await chat.render([], { order: [input.key, control.key], nodes: new Map([[input.key, input], [control.key, control]]) })
      expect(chat.scroller.textContent.match(/合成输入/g)).toHaveLength(1)
      expect(chat.scroller.querySelector('[data-chat-node-key="input-1"]')).not.toBeNull()
      await chat.render([], { session: { ...chat.fixture.state.session, pendingSubmissions: [] } })
      expect(chat.scroller.textContent.match(/合成输入/g)).toHaveLength(1)
    } finally { await chat.close() }
  })

  it('keeps the same AI seat through streaming settlement and deletion followed by regeneration', async () => {
    const chat = mountChat()
    const input = userNode('input-1', 1, 'request-one')
    const control = turnNode('control-1', 1)
    const user = { id: 'product-input', runtimeSessionId: 'session-render', sessionEventSeq: 1, role: 'user', content: '合成输入', created_at: '2026-01-01T00:00:00.000Z' }
    const reply = { id: 'reply-live', runtimeSessionId: 'session-render', renderKey: 'dsh-reply-session-render-1', role: 'assistant', pending: true, content: '合成回复', created_at: '2026-01-01T00:00:01.000Z' }
    try {
      await chat.render([user, reply], { order: [input.key, control.key], nodes: new Map([[input.key, input], [control.key, control]]) })
      const aiRow = chat.scroller.querySelector('[data-chat-node-key="control-1"] .message-flow-row')
      await chat.render([user, { ...reply, id: 'reply-durable', pending: false, sessionEventSeq: 9 }], {
        nodes: new Map([[input.key, input], [control.key, turnNode(control.key, 1, 'closed')]]) })
      expect(chat.scroller.querySelector('[data-chat-node-key="control-1"] .message-flow-row')).toBe(aiRow)
      expect(chat.scroller.textContent).toContain('合成回复')
      expect(chat.scroller.querySelector('[data-chat-node-key="control-1"] time').dateTime).toBe(reply.created_at)
      expect(chat.scroller.querySelector('[data-chat-node-key="control-1"]').textContent).toContain('#1')
      await chat.render([user], { order: [input.key], nodes: new Map([[input.key, input]]) })
      expect(chat.scroller.textContent).not.toContain('合成回复')
      await chat.render([user, { ...reply, content: '重新生成正文' }], {
        order: [input.key, control.key], nodes: new Map([[input.key, input], [control.key, control]]) })
      await chat.render([user, { ...reply, content: '重新生成正文', pending: false }], {
        nodes: new Map([[input.key, input], [control.key, turnNode(control.key, 1, 'closed')]]) })
      expect(chat.scroller.textContent).toContain('合成输入')
      expect(chat.scroller.textContent).toContain('重新生成正文')
      await chat.render([], { order: [], nodes: new Map() })
      expect(chat.scroller.textContent).not.toContain('重新生成正文')
      const nextInput = userNode('input-2', 10, 'request-two', 2, '下一条输入')
      const nextControl = turnNode('control-2', 2)
      const nextReply = { ...reply, renderKey: 'dsh-reply-session-render-2', content: '下一条回复' }
      await chat.render([nextReply], { order: [nextInput.key, nextControl.key],
        nodes: new Map([[nextInput.key, nextInput], [nextControl.key, nextControl]]) })
      await chat.render([{ ...nextReply, pending: false }])
      expect(chat.scroller.textContent).toContain('下一条输入')
      expect(chat.scroller.textContent).toContain('下一条回复')
    } finally { await chat.close() }
  })

  it('uses official 500ms sampling, protects unsampled reading during growth, and resumes for new input', async () => {
    vi.useFakeTimers()
    const chat = mountChat()
    try {
      await chat.render()
      await chat.move(520)
      await chat.grow()
      expect(chat.scroller.scrollTop).toBe(520)
      await act(async () => vi.advanceTimersByTime(499))
      expect(chat.scroller.querySelector('[data-chat-following-tail]')).not.toBeNull()
      await act(async () => vi.advanceTimersByTime(1))
      expect(chat.scroller.querySelector('[data-chat-following-tail]')).toBeNull()
      await chat.grow()
      expect(chat.scroller.scrollTop).toBe(520)
      const input = userNode('input-new', 1, 'request-new')
      await chat.render([], { order: [input.key], nodes: new Map([[input.key, input]]) })
      expect(chat.scroller.querySelector('[data-chat-following-tail]')).not.toBeNull()
      expect(chat.scroller.scrollTop).toBe(880)
    } finally { await chat.close() }
  })

  it('retains official 25px tolerance and flushes sampling at native scrollend', async () => {
    vi.useFakeTimers()
    const chat = mountChat()
    try {
      await chat.render()
      await chat.move(775, true)
      expect(chat.scroller.querySelector('[data-chat-following-tail]')).not.toBeNull()
      await chat.move(774, true)
      expect(chat.scroller.querySelector('[data-chat-following-tail]')).toBeNull()
      const button = chat.scroller.querySelector('[aria-label="chat.toBottom"]')
      expect(button).not.toBeNull()
      await act(async () => button.click())
      expect(chat.scroller.querySelector('[data-chat-following-tail]')).not.toBeNull()
      expect(chat.scroller.scrollTop).toBe(800)
    } finally { await chat.close() }
  })

  it('preserves the official first-row anchor when an older page is prepended', async () => {
    const chat = mountChat()
    const current = userNode('current-input', 20, 'request-current')
    const older = userNode('older-input', 1, 'request-older')
    const positions = new Map([[current.key, 200], [older.key, 200]])
    const geometry = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      const top = (positions.get(this.dataset.chatAnchorKey) ?? 0) - chat.scroller.scrollTop
      return { top, bottom: top + 80, left: 0, right: 800, width: 800, height: 80 }
    })
    const loadOlder = vi.fn()
    chat.fixture.props.loadOlder = loadOlder
    try {
      await chat.render([], { order: [current.key], nodes: new Map([[current.key, current]]),
        session: { ...chat.fixture.state.session, hasMore: true } })
      await chat.move(120, true)
      await act(async () => chat.scroller.querySelector('[data-chat-column] > div > button').click())
      expect(loadOlder).toHaveBeenCalledOnce()
      positions.set(current.key, 400)
      await chat.render([], { order: [older.key, current.key], nodes: new Map([[older.key, older], [current.key, current]]) })
      expect(chat.scroller.scrollTop).toBe(320)
      expect(chat.fixture.saved).toMatchObject({ anchorKey: current.key, anchorTop: 80, scrollTop: 320 })
    } finally { await chat.close(); geometry.mockRestore() }
  })

  it('restores Session-owned reading memory without inheriting another Session position', async () => {
    const first = mountChat('session-a')
    const input = userNode('input-a', 1, 'request-a')
    try {
      await first.render([], { order: [input.key], nodes: new Map([[input.key, input]]) })
      await first.move(320, true)
      expect(first.fixture.saved.scrollTop).toBe(320)
    } finally { await first.close() }
    const second = mountChat('session-b')
    try { await second.render(); expect(second.scroller.scrollTop).toBe(800) }
    finally { await second.close() }
    const restored = mountChat('session-a', first.fixture)
    try {
      await restored.render([], { order: [], nodes: new Map() })
      expect(restored.scroller.scrollTop).toBe(320)
      expect(restored.scroller.querySelector('[data-chat-following-tail]')).toBeNull()
    } finally { await restored.close() }
    expect(observers.size).toBe(0)
  })

  it('uses exact Session/Turn identities even with identical content and keeps Inbox timestamps absent', () => {
    const node = turnNode('control', 1)
    const messages = [{ runtimeSessionId: 'session-other', renderKey: 'dsh-reply-session-render-1', role: 'assistant', content: '相同内容' }]
    expect(selectRoleplayChatSeat(messages, 'session-render', node)).toBeNull()
    expect(selectRoleplayChatSeat(messages, 'session-render', turnNode('control', 2))).toBeNull()
    const pending = selectRoleplayPendingInput([], 'session-render', {
      id: 'inbox-input', source: { kind: 'user', rpcId: 'request-inbox' }, content: [{ type: 'text', text: '待处理输入' }],
    })
    expect(pending.item.created_at).toBeUndefined()
    expect(pending.item.content).toBe('待处理输入')
    const image = { attachmentId: 'image-synthetic', name: '合成图片', width: 20, height: 20 }
    const user = userNode('image-input', 1, 'request-image')
    user.data.content.push({ type: 'image', attachment: image })
    expect(selectRoleplayChatSeat([], 'session-render', user).item.inputImageAttachments).toEqual([image])
    const echo = selectRoleplayPendingInput([], 'session-render', {
      requestId: 'request-local', placement: 'transcript', time: 1, text: '',
      attachments: [{ type: 'image', value: { previewUrl: 'blob:synthetic', width: 20, height: 20 } }],
    })
    expect(echo.item.inputImageAttachments[0]).toMatchObject({ attachmentId: 'pending-request-local-0', previewUrl: 'blob:synthetic', width: 20 })
  })
})
