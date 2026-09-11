import { describe, expect, it, vi } from 'vitest'
import {
  createBackupOpening,
  createEntryDraft,
  deleteOpening,
  duplicateOpening,
  moveBackupOpening,
  moveEntryToPosition,
  moveTreeNode,
  positionOrderScope,
  primaryFirstOpeningMessages,
  SETTING_LIBRARY_PLACEMENT_ROWS,
  SETTING_LIBRARY_POSITION_OPTIONS,
  updateOpening
} from '../src/renderer/src/modules/settingLibraries/model/settingLibraryEditing.js'

function openingEntry() {
  return {
    id: 'fixed-opening-assistant',
    content: '主开场',
    openingMessages: [
      { id: 'backup', title: '备用', content: '备用开场', initialVariableStateJson: '' },
      { id: 'primary', title: '主开场', content: '主开场', initialVariableStateJson: '' }
    ],
    defaultOpeningMessageId: 'primary'
  }
}

describe('setting-library editor model', () => {
  it('creates the three Android-aligned draft types without changing their semantics', () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'draft-id' })
    const standard = createEntryDraft('', 1, [], 'standard')
    const reference = createEntryDraft('', 2, [standard], 'reference')
    expect(standard).toMatchObject({ title: '新建设定', enabled: false, triggerMode: 'always', dynamicMode: 'single_condition' })
    expect(reference).toMatchObject({ title: '新建设定 2', enabled: true, triggerMode: 'agent_tool', agentReadStrategy: 'variable_condition', dynamicMode: 'ejs_reference' })
    vi.unstubAllGlobals()
  })

  it('keeps the default opening first and mirrors its content into the fixed entry', () => {
    const source = openingEntry()
    expect(primaryFirstOpeningMessages(source).map((message) => message.id)).toEqual(['primary', 'backup'])
    const changed = updateOpening(source, 'primary', { content: '修改后的主开场' })
    expect(changed.content).toBe('修改后的主开场')
    expect(changed.openingMessages[0]).toMatchObject({ id: 'primary', content: '修改后的主开场' })
  })

  it('supports creating, duplicating, reordering and deleting backup openings', () => {
    vi.stubGlobal('crypto', { randomUUID: vi.fn().mockReturnValueOnce('created').mockReturnValueOnce('copied') })
    const created = createBackupOpening(openingEntry())
    expect(created.createdId).toBe('opening-created')
    const copied = duplicateOpening(created.entry, 'backup')
    expect(copied.entry.openingMessages.map((message) => message.id)).toEqual(['primary', 'backup', 'opening-copied', 'opening-created'])
    expect(copied.entry.openingMessages[2].title).toBe('备用 副本')
    const moved = moveBackupOpening(copied.entry, 'opening-created', -1)
    expect(moved.openingMessages.map((message) => message.id)).toEqual(['primary', 'backup', 'opening-created', 'opening-copied'])
    const withoutPrimary = deleteOpening(moved, 'primary')
    expect(withoutPrimary.defaultOpeningMessageId).toBe('backup')
    expect(withoutPrimary.content).toBe('备用开场')
    vi.unstubAllGlobals()
  })

  it('moves persistent entries through the visual position model and normalizes both scopes', () => {
    const entries = [
      { id: 'source-first', title: '前置', kind: 'normal', triggerMode: 'always', position: 'after_history', promptPositionId: '', insertRole: 'user', order: 1, enabled: true },
      { id: 'moving', title: '移动项', kind: 'normal', triggerMode: 'always', position: 'after_history', promptPositionId: '', insertRole: 'assistant', order: 2, enabled: true },
      { id: 'target-first', title: '系统项', kind: 'normal', triggerMode: 'always', position: 'instructions', promptPositionId: '', insertRole: 'system', order: 1, enabled: true }
    ]

    const moved = moveEntryToPosition(entries, 'moving', 'instructions')
    expect(moved.find((entry) => entry.id === 'moving')).toMatchObject({ position: 'instructions', promptPositionId: '', insertRole: 'system', order: 2 })
    expect(positionOrderScope(moved, 'after_history').map((entry) => [entry.id, entry.order])).toEqual([['source-first', 1]])
    expect(positionOrderScope(moved, 'instructions').map((entry) => [entry.id, entry.order])).toEqual([['target-first', 1], ['moving', 2]])

    const movedBack = moveEntryToPosition(moved, 'moving', 'before_history')
    expect(movedBack.find((entry) => entry.id === 'moving')).toMatchObject({ position: 'before_history', insertRole: 'user', order: 1 })
  })

  it('keeps latest user input as its own core with two independent position buckets', () => {
    expect(SETTING_LIBRARY_POSITION_OPTIONS.map((option) => option.value)).toEqual([
      'instructions',
      'after_instructions',
      'before_history',
      'after_history',
      'before_latest_user_input',
      'after_latest_user_input',
      'before_tool_flow',
      'after_tool_flow'
    ])
    expect(SETTING_LIBRARY_PLACEMENT_ROWS.map((row) => row.type === 'context' ? `context:${row.id}` : row.value)).toEqual([
      'instructions',
      'after_instructions',
      'before_history',
      'context:history',
      'after_history',
      'before_latest_user_input',
      'context:latest-user-input',
      'after_latest_user_input',
      'before_tool_flow',
      'context:tool-flow',
      'after_tool_flow'
    ])

    const entries = [
      { id: 'moving', title: '移动项', kind: 'normal', triggerMode: 'always', position: 'after_history', promptPositionId: '', insertRole: 'user', order: 1, enabled: true },
      { id: 'latest-input-prefix', title: '输入前', kind: 'normal', triggerMode: 'always', position: 'before_latest_user_input', promptPositionId: '', insertRole: 'user', order: 1, enabled: true }
    ]
    const beforeLatestInput = moveEntryToPosition(entries, 'moving', 'before_latest_user_input')
    expect(beforeLatestInput.find((entry) => entry.id === 'moving')).toMatchObject({ position: 'before_latest_user_input', order: 2 })
    const afterLatestInput = moveEntryToPosition(beforeLatestInput, 'moving', 'after_latest_user_input')
    expect(afterLatestInput.find((entry) => entry.id === 'moving')).toMatchObject({ position: 'after_latest_user_input', order: 1 })
    expect(afterLatestInput.find((entry) => entry.id === 'latest-input-prefix')).toMatchObject({ position: 'before_latest_user_input', order: 1 })
  })

  it('lets a fixed-position click replace a preset-only custom position', () => {
    const entries = [
      { id: 'moving', title: '移动项', kind: 'normal', triggerMode: 'always', position: 'before_history', promptPositionId: 'preset-position', insertRole: 'assistant', order: 1, enabled: true }
    ]

    const moved = moveEntryToPosition(entries, 'moving', 'after_history')
    expect(moved[0]).toMatchObject({ position: 'after_history', promptPositionId: '', insertRole: 'assistant', order: 1 })
  })

  it('moves tree entries between folders and normalizes both sibling lists', () => {
    const library = {
      groups: [
        { id: 'folder-a', name: 'A', parentId: '', treeViewOrder: 1 },
        { id: 'folder-b', name: 'B', parentId: '', treeViewOrder: 3 },
        { id: 'nested', name: '嵌套', parentId: 'folder-a', treeViewOrder: 1 }
      ],
      entries: [
        { id: 'root-a', title: '根条目', groupId: '', treeViewOrder: 2 },
        { id: 'moving', title: '移动项', groupId: '', treeViewOrder: 4 },
        { id: 'inside', title: '内部条目', groupId: 'folder-a', treeViewOrder: 2 }
      ]
    }

    const moved = moveTreeNode(library, { kind: 'entry', id: 'moving' }, 'folder-a', 1)
    expect(moved.entries.find((entry) => entry.id === 'moving')).toMatchObject({ groupId: 'folder-a', treeViewOrder: 2 })
    expect(moved.entries.find((entry) => entry.id === 'inside')).toMatchObject({ groupId: 'folder-a', treeViewOrder: 3 })
    expect([
      ...moved.groups.filter((group) => group.parentId === ''),
      ...moved.entries.filter((entry) => entry.groupId === '')
    ].sort((left, right) => left.treeViewOrder - right.treeViewOrder).map((item) => [item.id, item.treeViewOrder])).toEqual([
      ['folder-a', 1],
      ['root-a', 2],
      ['folder-b', 3]
    ])
  })

  it('moves an entry out of a folder without changing the folder hierarchy', () => {
    const library = {
      groups: [
        { id: 'folder-a', name: 'A', parentId: '', treeViewOrder: 1 },
        { id: 'nested', name: '嵌套', parentId: 'folder-a', treeViewOrder: 1 }
      ],
      entries: [
        { id: 'fixed-opening-assistant', title: '开场白', groupId: '', treeViewOrder: -2 },
        { id: 'inside', title: '内部条目', groupId: 'folder-a', treeViewOrder: 2 }
      ]
    }

    const moved = moveTreeNode(library, { kind: 'entry', id: 'inside' }, '', 1)
    expect(moved.entries.find((entry) => entry.id === 'inside')).toMatchObject({ groupId: '', treeViewOrder: 2 })
    expect(moved.groups.find((group) => group.id === 'nested')).toMatchObject({ parentId: 'folder-a', treeViewOrder: 1 })
    expect(moved.entries.find((entry) => entry.id === 'fixed-opening-assistant')).toMatchObject({ groupId: '', treeViewOrder: -2 })
  })

  it('refuses to move a folder into one of its descendants', () => {
    const library = {
      groups: [
        { id: 'parent', name: '父级', parentId: '', treeViewOrder: 1 },
        { id: 'child', name: '子级', parentId: 'parent', treeViewOrder: 1 }
      ],
      entries: []
    }
    expect(moveTreeNode(library, { kind: 'group', id: 'parent' }, 'child', 0)).toBe(library)
  })

})
