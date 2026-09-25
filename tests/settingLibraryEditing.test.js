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
import {
  HEADLESS_TREE_ROOT_ID,
  canDropAtHeadlessTarget,
  resolveHeadlessTreeDrop,
} from '../src/renderer/src/ui/tree/headlessTreeModel.js'

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
  it('uses Headless Tree post-removal slots while keeping fixed root entries pinned', () => {
    const siblings = [
      { id: 'entry:fixed-opening-assistant', fixed: true },
      { id: 'entry:new', fixed: false },
      { id: 'entry:two', fixed: false },
      { id: 'entry:three', fixed: false }
    ]

    expect(resolveHeadlessTreeDrop({
      dragIds: ['entry:new'],
      parentId: HEADLESS_TREE_ROOT_ID,
      siblings,
      insertionIndex: 2
    })).toEqual({
      dragId: 'entry:new',
      parentId: '',
      destinationIndex: 1,
      expandParentId: ''
    })

    expect(canDropAtHeadlessTarget({
      query: '',
      draggedNodes: [siblings[1]],
      parentNode: { id: HEADLESS_TREE_ROOT_ID, nodeKind: 'root' },
      insertionIndex: 0,
      siblings
    })).toBe(false)
  })

  it('resolves a line inside another folder without requiring a folder-icon drop', () => {
    expect(resolveHeadlessTreeDrop({
      dragIds: ['entry:moving'],
      parentId: 'group:folder-b',
      siblings: [
        { id: 'entry:first', fixed: false },
        { id: 'entry:second', fixed: false }
      ],
      insertionIndex: 1
    })).toEqual({
      dragId: 'entry:moving',
      parentId: 'group:folder-b',
      destinationIndex: 1,
      expandParentId: ''
    })
  })

  it('turns an indented line after an empty folder into its first child slot', () => {
    expect(resolveHeadlessTreeDrop({
      dragIds: ['entry:moving'],
      parentId: HEADLESS_TREE_ROOT_ID,
      siblings: [
        { id: 'group:empty', nodeKind: 'group', fixed: false, children: [] },
        { id: 'entry:moving', nodeKind: 'entry', fixed: false }
      ],
      insertionIndex: 1,
      nestedParentId: 'group:empty'
    })).toEqual({
      dragId: 'entry:moving',
      parentId: 'group:empty',
      destinationIndex: 0,
      expandParentId: 'group:empty'
    })
  })

  it('creates new settings as Agent-readable entries while keeping preset prompts explicit', () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'draft-id' })
    const standard = createEntryDraft('', 1, [], 'standard')
    const reference = createEntryDraft('', 2, [standard], 'reference')
    const prompt = createEntryDraft('', 3, [standard, reference], 'prompt')
    expect(standard).toMatchObject({ title: '新建设定', enabled: false, triggerMode: 'agent_tool', agentReadStrategy: 'normal', dynamicMode: 'standard', position: null })
    expect(reference).toMatchObject({ title: '新建设定 2', enabled: true, triggerMode: 'agent_tool', agentReadStrategy: 'variable_condition', dynamicMode: 'ejs_reference' })
    expect(prompt).toMatchObject({ title: '新建设定 3', enabled: false, triggerMode: 'always', position: null, promptPositionId: '' })
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
      { id: 'source-first', title: '前置', kind: 'normal', triggerMode: 'always', position: 'insert_point_3', promptPositionId: '', insertRole: 'user', order: 1, enabled: true },
      { id: 'moving', title: '移动项', kind: 'normal', triggerMode: 'always', position: 'insert_point_3', promptPositionId: '', insertRole: 'assistant', order: 2, enabled: true },
      { id: 'target-first', title: '系统项', kind: 'normal', triggerMode: 'always', position: 'instructions', promptPositionId: '', insertRole: 'system', order: 1, enabled: true }
    ]

    const moved = moveEntryToPosition(entries, 'moving', 'instructions')
    expect(moved.find((entry) => entry.id === 'moving')).toMatchObject({ position: 'instructions', promptPositionId: '', insertRole: 'system', order: 2 })
    expect(positionOrderScope(moved, 'insert_point_3').map((entry) => [entry.id, entry.order])).toEqual([['source-first', 1]])
    expect(positionOrderScope(moved, 'instructions').map((entry) => [entry.id, entry.order])).toEqual([['target-first', 1], ['moving', 2]])

    const movedBack = moveEntryToPosition(moved, 'moving', 'insert_point_2')
    expect(movedBack.find((entry) => entry.id === 'moving')).toMatchObject({ position: 'insert_point_2', insertRole: 'user', order: 1 })
  })

  it('keeps latest user input as its own core with two independent position buckets', () => {
    expect(SETTING_LIBRARY_POSITION_OPTIONS.map((option) => option.value)).toEqual([
      'instructions',
      'insert_point_1',
      'insert_point_2',
      'insert_point_3',
      'insert_point_4',
      'insert_point_5'
    ])
    expect(SETTING_LIBRARY_PLACEMENT_ROWS.map((row) => row.type === 'context' ? `context:${row.id}` : row.value)).toEqual([
      'instructions',
      'insert_point_1',
      'context:cache',
      'insert_point_2',
      'context:history',
      'insert_point_3',
      'context:latest-user-input',
      'insert_point_4',
      'context:tool-flow',
      'insert_point_5'
    ])

    const entries = [
      { id: 'moving', title: '移动项', kind: 'normal', triggerMode: 'always', position: 'insert_point_2', promptPositionId: '', insertRole: 'user', order: 1, enabled: true },
      { id: 'latest-input-prefix', title: '输入前', kind: 'normal', triggerMode: 'always', position: 'insert_point_3', promptPositionId: '', insertRole: 'user', order: 1, enabled: true }
    ]
    const beforeLatestInput = moveEntryToPosition(entries, 'moving', 'insert_point_3')
    expect(beforeLatestInput.find((entry) => entry.id === 'moving')).toMatchObject({ position: 'insert_point_3', order: 2 })
    const afterLatestInput = moveEntryToPosition(beforeLatestInput, 'moving', 'insert_point_4')
    expect(afterLatestInput.find((entry) => entry.id === 'moving')).toMatchObject({ position: 'insert_point_4', order: 1 })
    expect(afterLatestInput.find((entry) => entry.id === 'latest-input-prefix')).toMatchObject({ position: 'insert_point_3', order: 1 })
  })

  it('lets a fixed-position click replace a preset-only custom position', () => {
    const entries = [
      { id: 'moving', title: '移动项', kind: 'normal', triggerMode: 'always', position: 'insert_point_2', promptPositionId: 'preset-position', insertRole: 'assistant', order: 1, enabled: true }
    ]

    const moved = moveEntryToPosition(entries, 'moving', 'insert_point_3')
    expect(moved[0]).toMatchObject({ position: 'insert_point_3', promptPositionId: '', insertRole: 'assistant', order: 1 })
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
