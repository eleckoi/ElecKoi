import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '../src/shared/contracts/entities/chat'
import {
  buildVariableViewerTimeline,
  changedVariablePaths,
  countVariableChanges,
  parseVariableStateDocument
} from '../src/shared/foundation/variables/viewerTimeline'

function assistant(id: string, state: string, content: string, status: ChatMessage['status'] = 'complete'): ChatMessage {
  return {
    id,
    conversationId: 'chat-1',
    role: 'assistant',
    content,
    variableStateJson: state,
    status,
    createdAt: '2026-09-11T10:00:00.000Z'
  }
}

describe('variable viewer timeline', () => {
  it('keeps every settled assistant floor and carries a missing snapshot forward', () => {
    const initial = '{"hero":{"hp":10}}'
    const changed = '{"hero":{"hp":8},"weather":"rain"}'
    const timeline = buildVariableViewerTimeline([
      assistant('opening', initial, '开场'),
      { ...assistant('user-1', changed, '继续'), role: 'user' },
      assistant('assistant-1', changed, '暴雨落下'),
      assistant('assistant-2', '', '走进屋内'),
      assistant('assistant-pending', '{"ignored":true}', '生成中', 'streaming')
    ], initial, '{"hero":{"hp":7},"weather":"rain","mood":true}')

    expect(timeline.floors.map((floor) => floor.label)).toEqual(['开场', '第 1 楼', '第 2 楼'])
    expect(timeline.floors.map((floor) => floor.changedValueCount)).toEqual([0, 2, 0])
    expect(timeline.floors[2]!.state.rawJson).toBe(changed)
    expect(timeline.floors[2]!.messagePreview).toBe('走进屋内……')
    expect(timeline.current.valueCount).toBe(3)
  })

  it('keeps arrays atomic and lists only changed values that still exist', () => {
    const previous = { world: { weather: 'clear', guard: [{ alive: true }], removed: 1 } }
    const current = { world: { weather: 'fog', guard: [{ alive: false }], newValue: 3 } }
    expect(countVariableChanges(previous, current)).toBe(4)
    expect(changedVariablePaths(previous, current)).toEqual([
      '/world/weather',
      '/world/guard',
      '/world/newValue'
    ])
  })

  it('keeps malformed and non-object snapshots inspectable', () => {
    expect(parseVariableStateDocument('{broken')).toMatchObject({
      root: null,
      rawJson: '{broken',
      errorMessage: '变量快照无法解析'
    })
    expect(parseVariableStateDocument('[]')).toMatchObject({
      root: null,
      rawJson: '[]',
      errorMessage: '变量快照的根节点不是对象'
    })
  })

  it('escapes JSON pointer paths used by change highlighting', () => {
    expect(changedVariablePaths({}, { 'a/b': { 'x~y': true } })).toEqual(['/a~1b/x~0y'])
  })
})
