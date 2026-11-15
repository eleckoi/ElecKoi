import { describe, expect, it } from 'vitest'
import { trajectoryAssistantDefinition, officialTrajectoryFixture, officialTrajectoryLayout as deriveTrajectoryLayout,
  registerOfficialTrajectoryTools as registerTrajectoryToolDefinition, officialTrajectoryZh as zh } from '../../../../../../tests/helpers/officialTrajectory.js'
import { adaptTrajectorySnapshot } from '../../../../../../apps/web/src/modules/chat/model/trajectorySnapshotAdapter.js'
import { inputContinuationsProjection } from '../../../dsh-client-roleplay/src/host/input-continuations-projection.mjs'

function event(type, seq, data) {
  return { type, seq, time: seq * 10, data }
}

function match(value) {
  return {
    event: value,
    location: {
      kind: 'step',
      turn: { turn: 1, status: 'open' },
      step: { step: 1, status: 'open' }
    }
  }
}

function context(state, matches, start) {
  return {
    key: 'trajectory-assistant-step\u00001:1',
    kind: 'trajectory-assistant-step',
    id: '1:1',
    matches,
    start,
    state,
    current: new Map()
  }
}

describe('DSH trajectory assistant request evidence', () => {
  it('projects every nested tool call beyond 256 levels while refusing a cycle', () => {
    let definition
    registerTrajectoryToolDefinition({ uiConversation: { events: { register(value) { definition = value } } } })
    const start = match(event('tool/call', 0, { callId: 'root', name: 'synthetic', arguments: '{}', turn: 1, step: 1 }))
    let state = definition.start(context(undefined, [], start), start)
    for (let index = 1; index <= 1001; index++) {
      state = definition.update(context(state, [], start), match(event('tool/ptc-dispatch-start', index, {
        rootCallId: 'root', parentCallId: index === 1 ? 'root' : `child-${index - 1}`, subCallId: `child-${index}`, name: 'synthetic', arguments: {},
      })))
    }
    expect(definition.update(context(state, [], start), match(event('tool/ptc-dispatch-start', 1002, {
      rootCallId: 'root', parentCallId: 'child-1001', subCallId: 'root', name: 'invalid-cycle', arguments: {},
    })))).toBe(state)
    const node = definition.buildViewNode(context(state, [], start))
    let call = node.data.root, depth = 0
    while (call.subCalls.length) { call = call.subCalls[0]; depth++ }
    expect(depth).toBe(1001)
    expect(call.callId).toBe('child-1001')
  })

  it('does not invent a failed request for a closed bootstrap-only step', () => {
    const start = match(event('step/start', 1, { turn: 1, step: 1 }))
    const initial = trajectoryAssistantDefinition.start(
      context(undefined, [start], start),
      start,
      { previous: () => undefined }
    )
    const end = match(event('step/end', 2, { turn: 1, step: 1 }))
    const settled = trajectoryAssistantDefinition.update(
      context(initial, [start, end], start),
      end
    )

    expect(trajectoryAssistantDefinition.buildViewNode(
      context(settled, [start, end], start)
    )?.data).toEqual({ kind: 'assistant', partial: null })
  })

  it('keeps a real failed model attempt visible', () => {
    const start = match(event('step/start', 1, { turn: 1, step: 1 }))
    const initial = trajectoryAssistantDefinition.start(
      context(undefined, [start], start),
      start,
      { previous: () => undefined }
    )
    const attempt = match(event('assistant/attempt', 2, { turn: 1, step: 1, stream: [] }))
    const attempted = trajectoryAssistantDefinition.update(
      context(initial, [start, attempt], start),
      attempt
    )
    const end = match(event('step/end', 3, { turn: 1, step: 1 }))
    const settled = trajectoryAssistantDefinition.update(
      context(attempted, [start, attempt, end], start),
      end
    )
    const node = trajectoryAssistantDefinition.buildViewNode(
      context(settled, [start, attempt, end], start)
    )

    expect(node?.data?.request).toMatchObject({ purpose: 'assistant', status: 'error' })
  })

  it('does not present a user-cancelled attempt as a failed request', () => {
    const completed = { purpose: 'assistant', startSeq: 20, turn: 2, step: 1, status: 'complete' }
    const cancelled = { purpose: 'assistant', startSeq: 5, turn: 1, step: 1, status: 'error' }
    const actualFailure = { purpose: 'assistant', startSeq: 30, turn: 3, step: 1, status: 'error' }
    const official = {
      eventNodes: [{ seq: 1, source: { kind: 'user' } }],
      eventLocations: new Map(),
      requests: [cancelled, completed, actualFailure],
      callSchemas: new Map(),
      partial: null,
      runningCalls: []
    }

    const adapted = adaptTrajectorySnapshot(official, {
      abortedTurns: [1]
    })

    expect(adapted.requests).toEqual([completed, actualFailure])
  })
})

const t = (key, values = {}) => Object.entries(values).reduce(
  (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), zh[key] ?? key,
)

function regenerationEvents(systemPrompt = '合成系统二') {
  return [
    event('turn/start', 1, { turn: 1 }),
    event('step/start', 2, { turn: 1, step: 1 }),
    { ...event('system/message', 3, { turn: 1, step: 1,
      message: { id: 'system-original', role: 'system', content: [{ type: 'text', text: '合成系统一' }], source: { kind: 'system' } } }), surfaceOp: 'append' },
    { ...event('user/message', 4, {
      id: 'input-stable', role: 'user', content: [{ type: 'text', text: '合成输入' }], source: { kind: 'user' } }), surfaceOp: 'append' },
    event('step/end', 5, { turn: 1, step: 1 }),
    event('turn/end', 6, { turn: 1, reason: { kind: 'interrupted' } }),
    event('turn/start', 7, { turn: 2 }),
    event('eleckoi/input-continuation', 8, { turn: 2, inputEventSeq: 4, inputMessageId: 'input-stable' }),
    event('step/start', 9, { turn: 2, step: 1 }),
    { ...event('system/message', 10, { turn: 2, step: 1,
      message: { id: 'system-replacement', role: 'system', content: [{ type: 'text', text: systemPrompt }], source: { kind: 'system' } } }), surfaceOp: { op: 'replace', startSeq: 3, endSeq: 3 } },
    event('request/header', 11, { reason: 'initial', startsSeries: true, header: { config: {}, tools: [] } }),
    { ...event('assistant/message', 12, { turn: 2, step: 1, stream: [],
      message: { id: 'reply-new', role: 'assistant', content: [{ type: 'text', text: '合成回复' }], source: { provider: 'synthetic', model: 'synthetic' } } }), surfaceOp: 'append' },
    event('step/end', 13, { turn: 2, step: 1 }),
    event('turn/end', 14, { turn: 2, reason: { kind: 'completed' } }),
  ]
}

function adapt(events, official) {
  const state = events.reduce(inputContinuationsProjection.apply, inputContinuationsProjection.init())
  return adaptTrajectorySnapshot(official, {}, inputContinuationsProjection.wire.view(state))
}

function layout(snapshot) {
  return deriveTrajectoryLayout({ ...snapshot, nodes: snapshot.eventNodes }, t)
}

function cells(snapshot) {
  return layout(snapshot).flatMap(turn => turn.groups.flatMap(group => group.cells))
}

describe('installed trajectory bundle after existing-input regeneration', () => {
  it('does not infer a prompt edit from an identical surface replacement', () => {
    const events = regenerationEvents('合成系统一')
    const fixture = officialTrajectoryFixture()
    fixture.replace([])
    let official
    for (const value of events) official = fixture.append(value)
    expect(official.requests[0].prompt.system).toBe('合成系统一')
    expect(official.requests[0].promptChange).toBeUndefined()
    expect(cells(adapt(events, official)).filter(cell => cell.kind === 'system'))
      .toMatchObject([{ text: '初始系统提示词', sourceSeq: 3 }])
    const reloaded = officialTrajectoryFixture().replace(events)
    expect(reloaded.requests[0].promptChange).toBeUndefined()
    expect(cells(adapt(events, reloaded)).filter(cell => cell.kind === 'system')).toHaveLength(1)
  })

  it.each(['合成系统一', '合成系统三'])(
    'compares multiple pre-request rewrites to the known initial prompt: %s', finalPrompt => {
      const events = regenerationEvents()
      events.splice(10, 0, {
        ...event('system/message', 11, { turn: 2, step: 1,
          message: { id: 'system-final', role: 'system', content: [{ type: 'text', text: finalPrompt }], source: { kind: 'system' } } }),
        surfaceOp: { op: 'replace', startSeq: 10, endSeq: 10 },
      })
      for (const value of events.slice(11)) { value.seq += 1; value.time += 10 }
      const official = officialTrajectoryFixture().replace(events)
      expect(official.requests[0].prompt.system).toBe(finalPrompt)
      if (finalPrompt === '合成系统一') expect(official.requests[0].promptChange).toBeUndefined()
      else expect(official.requests[0].promptChange).toMatchObject({ seq: 11, kind: 'system' })
      expect(cells(adapt(events, official)).filter(cell => cell.kind === 'system'))
        .toMatchObject([{ text: '初始系统提示词', sourceSeq: 3 },
          ...(finalPrompt === '合成系统一' ? [] : [{ text: '系统提示词已更新', sourceSeq: 11, promptDetail: { system: finalPrompt } }])])
    },
  )

  it('keeps native prompt-change notices and their actual request details', () => {
    const events = regenerationEvents('合成运行端点 http://127.0.0.1:41002')
    events[2].data.message.content[0].text = '合成运行端点 http://127.0.0.1:41001'
    events.push(event('turn/start', 15, { turn: 3 }),
      event('step/start', 16, { turn: 3, step: 1 }),
      { ...event('user/message', 17, { id: 'input-next', role: 'user',
        content: [{ type: 'text', text: '合成后续输入' }], source: { kind: 'user' } }), surfaceOp: 'append' },
      { ...event('system/message', 18, { turn: 3, step: 1,
        message: { id: 'system-next', role: 'system', content: [{ type: 'text', text: '合成运行端点 http://127.0.0.1:41003' }], source: { kind: 'system' } } }),
        surfaceOp: { op: 'replace', startSeq: 10, endSeq: 10 } },
      event('request/header', 19, { reason: 'initial', startsSeries: true, header: { config: {}, tools: [] } }),
      { ...event('assistant/message', 20, { turn: 3, step: 1, stream: [],
        message: { id: 'reply-next', role: 'assistant', content: [{ type: 'text', text: '合成后续回复' }], source: { provider: 'synthetic', model: 'synthetic' } } }), surfaceOp: 'append' },
      event('step/end', 21, { turn: 3, step: 1 }),
      event('turn/end', 22, { turn: 3, reason: { kind: 'completed' } }))
    const official = officialTrajectoryFixture().replace(events)
    expect(official.requests.map(request => request.prompt.system)).toEqual([
      '合成运行端点 http://127.0.0.1:41002', '合成运行端点 http://127.0.0.1:41003',
    ])
    expect(official.requests.map(request => request.promptChange.kind)).toEqual(['system', 'system'])
    expect(cells(adapt(events, official)).filter(cell => cell.kind === 'system'))
      .toMatchObject([
        { text: '初始系统提示词', systemPromptDetail: '合成运行端点 http://127.0.0.1:41001' },
        { text: '系统提示词已更新', promptDetail: { system: '合成运行端点 http://127.0.0.1:41002' } },
        { text: '系统提示词已更新', promptDetail: { system: '合成运行端点 http://127.0.0.1:41003' } },
      ])
  })

  it.each(['合成系统一', '合成系统二'])(
    'preserves tool changes independently of system prompt notices: %s', systemPrompt => {
      const events = regenerationEvents('合成系统一')
      events.push(event('turn/start', 15, { turn: 3 }),
        event('step/start', 16, { turn: 3, step: 1 }),
        { ...event('system/message', 17, { turn: 3, step: 1,
          message: { id: 'system-next', role: 'system', content: [{ type: 'text', text: systemPrompt }], source: { kind: 'system' } } }),
          surfaceOp: { op: 'replace', startSeq: 10, endSeq: 10 } },
        event('request/header', 18, { reason: 'initial', startsSeries: true,
          header: { config: {}, tools: [{ name: 'synthetic_tool', description: '合成工具', parameters: { type: 'object' } }] } }),
        { ...event('assistant/message', 19, { turn: 3, step: 1, stream: [],
          message: { id: 'reply-next', role: 'assistant', content: [{ type: 'text', text: '合成后续回复' }], source: { provider: 'synthetic', model: 'synthetic' } } }), surfaceOp: 'append' },
        event('step/end', 20, { turn: 3, step: 1 }),
        event('turn/end', 21, { turn: 3, reason: { kind: 'completed' } }))
      const official = officialTrajectoryFixture().replace(events)
      expect(official.requests[0].promptChange).toBeUndefined()
      expect(official.requests[1].promptChange.kind)
        .toBe(systemPrompt === '合成系统一' ? 'tools' : 'system-and-tools')
      expect(official.requests[1].prompt).toMatchObject({ system: systemPrompt, tools: [{ name: 'synthetic_tool' }] })
      expect(cells(adapt(events, official)).filter(cell => cell.kind === 'system'))
        .toMatchObject([{ text: '初始系统提示词' }, { text: systemPrompt === '合成系统一' ? '工具已更新' : '系统提示词和工具已更新' }])
    },
  )

  it('indexes restored inputs outside an execution without assigning them to turn zero', () => {
    const events = [
      event('turn/start', 1, { turn: 1 }),
      event('turn/end', 2, { turn: 1, reason: { kind: 'completed' } }),
      { ...event('user/message', 3, { id: 'restored-input', role: 'user',
        content: [{ type: 'text', text: '合成恢复输入' }], source: { kind: 'user' } }), surfaceOp: 'append' },
    ]
    let state = events.reduce(inputContinuationsProjection.apply, inputContinuationsProjection.init())
    expect(state.inputs).toEqual([{ turn: 0, eventSeq: 3, messageId: 'restored-input' }])
    const official = officialTrajectoryFixture().replace(events)
    let snapshot = adaptTrajectorySnapshot(official, {}, inputContinuationsProjection.wire.view(state))
    expect(snapshot.inputTurns.has(3)).toBe(false)
    expect(snapshot.turnLabels.has(0)).toBe(false)
    const continued = event('eleckoi/input-continuation', 5, {
      turn: 2, inputEventSeq: 3, inputMessageId: 'restored-input',
    })
    state = inputContinuationsProjection.apply(state, continued)
    snapshot = adaptTrajectorySnapshot(official, {}, inputContinuationsProjection.wire.view(state))
    expect(snapshot.inputTurns.get(3)).toBe(2)
    expect(snapshot.turnLabels.get(2)).toBe(1)
  })

  it('closes an already published input-only step without withdrawing its stable node', () => {
    const fixture = officialTrajectoryFixture()
    fixture.replace([])
    const events = regenerationEvents()
    let official
    for (const value of events.slice(0, 4)) official = fixture.append(value)
    expect(official.requests).toMatchObject([{ turn: 1, status: 'running' }])
    for (const value of events.slice(4, 6)) official = fixture.append(value)
    expect(official.requests).toHaveLength(0)
    expect(official.eventNodes.find(node => node.kind === 'user')).toMatchObject({ seq: 4 })
    for (const value of events.slice(6)) official = fixture.append(value)
    expect(official.requests).toMatchObject([{ turn: 2, status: 'complete' }])
    expect(layout(adapt(events, official)).map(turn => turn.turn)).toEqual([2])
  })

  it('keeps an actual failed regenerated request in order with its original error', () => {
    const events = regenerationEvents().slice(0, 11)
    events.push(event('assistant/attempt', 12, { turn: 2, step: 1, stream: [] }),
      event('llm/retry', 13, { turn: 2, step: 1, mode: 'normal', retry: 1, maxRetries: 1,
        delayMs: 0, failure: { name: 'SyntheticError', message: '合成请求失败', code: 'TEST' } }),
      event('step/end', 14, { turn: 2, step: 1 }),
      event('turn/end', 15, { turn: 2, reason: { kind: 'error', error: {
        name: 'SyntheticError', message: '合成请求失败', code: 'TEST' } } }))
    const fixture = officialTrajectoryFixture()
    fixture.replace([])
    let official
    for (const value of events) official = fixture.append(value)
    expect(official.requests).toHaveLength(1)
    expect(official.requests[0]).toMatchObject({ turn: 2, status: 'error', errorCode: 'TEST' })
    expect(layout(adapt(events, official)).map(turn => turn.turn)).toEqual([2])
  })

  it('distinguishes the retained boundary, real request and system replacement after reload', () => {
    const events = regenerationEvents()
    const official = officialTrajectoryFixture().replace(events)
    expect(official.requests).toHaveLength(1)
    expect(official.requests[0]).toMatchObject({ turn: 2, step: 1, status: 'complete', startSeq: 9,
      prompt: { system: '合成系统二' }, promptChange: { seq: 10, kind: 'system' } })
    expect(official.systemPrompts).toMatchObject([{ seq: 3, text: '合成系统一' }])
    const snapshot = adapt(events, official)
    expect(snapshot.turnLabels.get(2)).toBe(1)
    expect(snapshot.inputTurns.get(4)).toBe(2)
    expect(snapshot.eventNodes.find(node => node.kind === 'user')).toMatchObject({ seq: 4, time: 40 })
    const turns = layout(snapshot)
    expect(turns.map(turn => turn.turn)).toEqual([2])
    const cells = turns.flatMap(turn => turn.groups.flatMap(group => group.cells))
    expect(cells.filter(cell => cell.text === '初始系统提示词')).toHaveLength(1)
    expect(cells.filter(cell => cell.kind === 'system')).toMatchObject([
      { text: '初始系统提示词', systemPromptDetail: '合成系统一' },
      { text: '系统提示词已更新', promptDetail: { system: '合成系统二' } },
    ])
    expect(cells.some(cell => cell.requestOnly === true || cell.isError === true)).toBe(false)
  })

  it('keeps the pending existing input in its explicit execution bucket before a chunk arrives', () => {
    const events = regenerationEvents().slice(0, 11)
    const fixture = officialTrajectoryFixture()
    fixture.replace(events.slice(0, 6))
    let official
    for (const value of events.slice(6)) official = fixture.append(value)
    const snapshot = adapt(events, official)
    expect(layout(snapshot).map(turn => turn.turn)).toEqual([2])
    expect(snapshot.turnLabels.get(2)).toBe(1)
    expect(official.requests).toMatchObject([{ turn: 2, status: 'running' }])
  })

  it('replays an older page without treating unknown prompt history as a replacement', () => {
    const events = regenerationEvents()
    const fixture = officialTrajectoryFixture()
    const tail = fixture.replace(events.slice(6), true)
    expect(tail.systemPrompts ?? []).toHaveLength(0)
    const replayed = fixture.prepend(events.slice(0, 6))
    expect(replayed.requests).toMatchObject([{ status: 'complete', promptChange: { kind: 'system' } }])
    expect(layout(adapt(events, replayed)).map(turn => turn.turn)).toEqual([2])
  })

  it('uses canonical input identity for subsequent rounds, including repeated text and edited input', () => {
    const events = regenerationEvents()
    events[3].data.content[0].text = '合成编辑输入'
    events.push(event('turn/start', 15, { turn: 3 }),
      { ...event('user/message', 16, { id: 'input-next', role: 'user',
        content: [{ type: 'text', text: '合成编辑输入' }], source: { kind: 'user' } }), surfaceOp: 'append' },
      event('turn/end', 17, { turn: 3, reason: { kind: 'interrupted' } }),
      event('turn/start', 18, { turn: 4 }),
      event('eleckoi/input-continuation', 19, { turn: 4, inputEventSeq: 16, inputMessageId: 'input-next' }),
      event('user/message', 20, { id: 'plugin-context', role: 'user', content: [], source: { kind: 'plugin:synthetic' } }))
    const snapshot = adapt(events, officialTrajectoryFixture().replace(events))
    expect([...snapshot.turnLabels]).toEqual([[1, 1], [3, 2], [2, 1], [4, 2]])
    expect([...snapshot.inputTurns]).toEqual([[4, 2], [16, 4]])
    expect(snapshot.eventNodes.find(node => node.seq === 4)?.content[0].text).toBe('合成编辑输入')
    const invalid = adaptTrajectorySnapshot(snapshot, {}, {
      inputs: [{ turn: 1, eventSeq: 4, messageId: 'input-stable' }],
      links: [{ turn: 99, inputEventSeq: 4, inputMessageId: 'unrelated-input' }],
    })
    expect(invalid.turnLabels.has(99)).toBe(false)
  })
})
