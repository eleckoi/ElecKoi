// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TurnNavigator, mergeTurnRailItems, ActivityPill, ChatView, chatFixture, userNode } from '../helpers/officialChatView.jsx'
import { createInputRoundIndex, presentChatTurnNavigation, adaptChatSessionStats } from '../helpers/roleplayPresentation.js'
import { inputContinuationsProjection } from '../../../../packages/client/features/dsh-client-roleplay/src/host/input-continuations-projection.mjs'
import { historyStatsProjection } from '../../../../packages/client/features/dsh-client-roleplay/src/host/history-stats-projection.mjs'

const identities = {
  inputs: [1, 3, 5].map((turn, index) => ({ turn, eventSeq: turn * 10 + 1, messageId: `input-${index + 1}` })),
  links: [2, 4, 6].map((turn, index) => ({ turn, inputEventSeq: (turn - 1) * 10 + 1, inputMessageId: `input-${index + 1}` })),
}
const outline = [1, 2, 3, 4, 5, 6].map(turn => ({ turn, seq: turn * 10,
  prompt: turn % 2 ? `合成输入 ${turn}` : '', response: turn % 2 ? '' : `合成回复 ${turn}` }))
const translate = (key, values = {}) => key === 'stats.counts' ? `${values.turns} 轮 ${values.steps} 步`
  : key === 'message.tokensPerSecond' ? `${values.tps} tok/s` : `${key}:${values.turn ?? ''}`

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback) { this.callback = callback }
    observe(element) {
      if (element.parentElement?.tagName !== 'NAV') return
      element.scrollTo = options => { element.scrollTop = options.top ?? 0 }
      queueMicrotask(() => { if (element.isConnected) act(() => this.callback([{
        borderBoxSize: [{ inlineSize: 28, blockSize: 300 }],
        contentRect: { width: 28, height: 300 },
      }])) })
    }
    disconnect() {}
    unobserve() {}
  })
})
afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = '' })

describe('chat rounds presented by native DSH components', () => {
  it('collapses execution turns by exact input identity while keeping original input anchors', () => {
    const loaded = outline.map(item => ({ ...item, anchorKey: `node-${item.turn}` }))
    const navigation = presentChatTurnNavigation({ items: mergeTurnRailItems(loaded, outline), activeTurn: 6, busyTurn: 6 }, createInputRoundIndex(identities))
    expect(navigation.items.map(item => [item.turn, item.labelTurn, item.anchor.key])).toEqual([[1, 1, 'node-1'], [3, 2, 'node-3'], [5, 3, 'node-5']])
    expect(navigation.items[2]).toMatchObject({ prompt: '合成输入 5', response: '合成回复 6' })
    expect(navigation).toMatchObject({ activeTurn: 5, busyTurn: 5 })
  })

  it('retains the official whole-log paging anchors when the original input is unloaded', () => {
    const loaded = [{ turn: 6, anchorKey: 'reply-6', prompt: '', response: '合成回复 6' }]
    const navigation = presentChatTurnNavigation({ items: mergeTurnRailItems(loaded, outline), activeTurn: 6, busyTurn: null }, createInputRoundIndex(identities))
    expect(navigation.items[2]).toMatchObject({ turn: 5, labelTurn: 3, anchor: { kind: 'unloaded', seq: 50 } })
  })

  it('uses neither text nor adjacent turns to associate unlinked executions', () => {
    const index = createInputRoundIndex({ ...identities, links: [{ turn: 6, inputEventSeq: 51, inputMessageId: 'different-id' }] })
    const navigation = presentChatTurnNavigation({ items: mergeTurnRailItems([], outline), activeTurn: 6, busyTurn: null }, index)
    expect(navigation.items.map(item => item.turn)).toEqual([1, 3, 5])
    expect(navigation.activeTurn).toBeNull()
    expect(navigation.items[2].response).toBe('')
  })

  it('renders native rail marks with logical labels and passes the raw input Turn to official navigation', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    const onNavigate = vi.fn()
    const render = async (inputIndex, rawOutline, activeTurn) => {
      const navigation = presentChatTurnNavigation({ items: mergeTurnRailItems([], rawOutline), activeTurn, busyTurn: null }, createInputRoundIndex(inputIndex))
      await act(async () => root.render(<TurnNavigator {...navigation} onNavigate={onNavigate} t={translate} />))
    }
    try {
      await render(identities, outline, 6)
      const marks = [...host.querySelectorAll('nav button')]
      expect(marks.map(mark => mark.getAttribute('aria-label'))).toEqual(['chat.turnNavigation.jumpLoad:1', 'chat.turnNavigation.jumpLoad:2', 'chat.turnNavigation.jumpLoad:3'])
      expect(marks[2].getAttribute('aria-current')).toBe('true')
      await act(async () => marks[2].click())
      expect(onNavigate.mock.calls[0][0]).toMatchObject({ turn: 5, labelTurn: 3, anchor: { kind: 'unloaded', seq: 50 } })
      await render({ inputs: identities.inputs.slice(0, 2), links: identities.links.slice(0, 2) }, outline.slice(0, 4), 4)
      expect(host.querySelectorAll('nav button')).toHaveLength(2)
      await render({ inputs: identities.inputs.slice(0, 1), links: identities.links.slice(0, 1) }, outline.slice(0, 2), 2)
      expect(host.querySelector('nav')).toBeNull()
    } finally { await act(async () => root.unmount()) }
  })

  it('forwards the merged rail through the installed ChatView without rewriting its nodes', async () => {
    const fixture = chatFixture()
    const input = userNode('stable-input', 11, 'stable-rpc', 1)
    fixture.update({ order: [input.key], nodes: new Map([[input.key, input]]), rail: [{ turn: 1, anchorKey: input.key, prompt: '合成输入', response: '' }] })
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    const present = vi.fn(navigation => presentChatTurnNavigation(navigation, createInputRoundIndex(identities)))
    try {
      await act(async () => root.render(<ChatView {...fixture.props} presentTurnNavigation={present} />))
      expect(present).toHaveBeenCalled()
      expect(present.mock.calls.at(-1)[0].items[0]).toMatchObject({ turn: 1, anchor: { kind: 'loaded', key: input.key } })
      expect(fixture.state.nodes.get(input.key)).toBe(input)
    } finally { await act(async () => root.unmount()) }
  })

  it('renders official statistics with logical rounds and unchanged timing, throughput and token data', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    const upstream = { turns: 6, steps: 12, llmMs: 0, toolMs: 0, ttftSteps: 0, decodeMs: 1000, decodeTokens: 200 }
    const stats = adaptChatSessionStats(upstream, { steps: 3 }, createInputRoundIndex(identities))
    try {
      await act(async () => root.render(<ActivityPill usePerformanceUsage={select => select('full')}
        useChat={select => select({ legacy: { nodes: [] } })} useProjection={key => key === 'sessionStats' ? stats : undefined} t={translate} />))
      expect(host.textContent).toContain('3 轮 9 步')
      expect(host.textContent).toContain('200 tok/s')
      expect(upstream).toMatchObject({ turns: 6, steps: 12 })
      expect(adaptChatSessionStats(upstream, null, createInputRoundIndex({ inputs: [], links: [] })).turns).toBe(0)
    } finally { await act(async () => root.unmount()) }
  })

  it('rebuilds round identity from events after repeated regeneration, input edits and deletion', () => {
    const events = [
      { type: 'turn/start', data: { turn: 1 } },
      { type: 'user/message', seq: 11, data: { id: 'input-1', source: { kind: 'user' }, content: [{ type: 'text', text: '编辑后的合成输入' }] } },
      { type: 'turn/end', data: { turn: 1 } },
      ...[2, 3, 4].map(turn => ({ type: 'eleckoi/input-continuation', data: { turn, inputEventSeq: 11, inputMessageId: 'input-1' } })),
      { type: 'turn/start', data: { turn: 5 } },
      { type: 'user/message', seq: 51, data: { id: 'input-2', source: { kind: 'user' }, content: [{ type: 'text', text: '编辑后的合成输入' }] } },
    ]
    const read = rows => createInputRoundIndex(inputContinuationsProjection.wire.view(rows.reduce(inputContinuationsProjection.apply, inputContinuationsProjection.init())))
    const index = read(events)
    expect(index.inputs.size).toBe(2)
    expect(index.turns.get(4)).toMatchObject({ round: 1, messageId: 'input-1' })
    expect(read(events.slice(0, 6)).inputs.size).toBe(1)
    expect(index.turns.get(5).round).toBe(2)
  })

  it('discounts only input boundaries explicitly retained for continuation, not real failed or cancelled work', () => {
    const event = (type, data = {}, seq = 0) => ({ type, data, seq })
    const events = [event('step/start', { turn: 1, step: 1 }),
      event('user/message', { id: 'retained-input', source: { kind: 'user' } }, 11),
      event('step/end', { turn: 1, step: 1 }), event('turn/end', { turn: 1 }),
      event('eleckoi/input-continuation', { turn: 2, inputEventSeq: 11, inputMessageId: 'retained-input' }),
      event('eleckoi/input-continuation', { turn: 3, inputEventSeq: 11, inputMessageId: 'retained-input' }),
      event('step/start', { turn: 3, step: 1 }), event('assistant/chunk'), event('step/end', { turn: 3, step: 1 })]
    const fold = rows => historyStatsProjection.wire.view(rows.reduce(historyStatsProjection.apply, historyStatsProjection.init()))
    expect(fold(events.slice(0, 4))).toEqual({ steps: 0, turns: 0 })
    expect(fold(events)).toEqual({ steps: 1, turns: 1 })
    expect(fold([events[0], events[1], event('request/header'), ...events.slice(2)])).toEqual({ steps: 0, turns: 0 })
  })

  it('keeps late child results attached to their delegation and changes ownership only after a successful follow-up', () => {
    let state = inputContinuationsProjection.init(), seq = 0
    const apply = (type, data) => { state = inputContinuationsProjection.apply(state, { type, data, seq: ++seq }) }
    const human = (turn, id) => {
      apply('turn/start', { turn })
      apply('user/message', { id, source: { kind: 'user' } })
    }
    const wake = turn => {
      apply('turn/start', { turn })
      apply('user/message', { id: `wake-${turn}`, source: { kind: 'subagent-settled', senderSessionId: 'child' } })
      apply('turn/end', { turn })
    }
    const send = isError => {
      apply('tool/call', { callId: 'send', name: 'send_message', arguments: JSON.stringify({ agent_id: 'child', message: 'Synthetic follow-up' }) })
      apply('tool/result', { message: { toolCallId: 'send', isError } })
    }
    human(1, 'original-input')
    apply('subagent/catalog', { childId: 'child' })
    apply('turn/end', { turn: 1 })
    human(2, 'unrelated-input')
    apply('turn/end', { turn: 2 })
    wake(3)
    expect(state.links.at(-1)).toMatchObject({ turn: 3, inputMessageId: 'original-input' })
    human(4, 'rejected-follow-up')
    send(true)
    apply('turn/end', { turn: 4 })
    wake(5)
    expect(state.links.at(-1).inputMessageId).toBe('original-input')
    human(6, 'accepted-follow-up')
    send(false)
    apply('turn/end', { turn: 6 })
    wake(7)
    expect(state.links.at(-1)).toMatchObject({ turn: 7, inputMessageId: 'accepted-follow-up' })
    expect(state.sends).toEqual({})
    expect(Object.keys(state.children)).toEqual(['child'])
  })
})
