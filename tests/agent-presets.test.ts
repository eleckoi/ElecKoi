import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { AgentPresetRepository } from '../src/main/modules/agentPresets'
import { LocalMediaStore } from '../src/main/platform/filesystem/LocalMediaStore'
import { SqliteDatabase } from '../src/main/platform/sqlite/SqliteDatabase'

const databases: SqliteDatabase[] = []
const directories: string[] = []
const encoder = new TextEncoder()

afterEach(() => {
  databases.splice(0).forEach((database) => database.close())
  directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true }))
})

function harness(withMedia = false) {
  const directory = mkdtempSync(join(tmpdir(), 'eleckoi-agent-presets-'))
  directories.push(directory)
  const database = new SqliteDatabase(join(directory, 'data.sqlite3'))
  database.open()
  databases.push(database)
  return new AgentPresetRepository(
    database,
    withMedia ? new LocalMediaStore(join(directory, 'media')) : undefined
  )
}

function importDocument(value: unknown, displayName = 'preset.json') {
  return {
    displayName,
    mimeType: 'application/json',
    base64: Buffer.from(JSON.stringify(value)).toString('base64')
  }
}

function pngPresetDocument(json: string, avatar?: Uint8Array) {
  const signature = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const encoded = Buffer.from(json).toString('base64')
  const chunk = (type: string, data: Uint8Array) => {
    const result = new Uint8Array(data.length + 12)
    new DataView(result.buffer).setUint32(0, data.length, false)
    result.set(encoder.encode(type), 4)
    result.set(data, 8)
    return result
  }
  const textChunk = (key: string, value: string) => chunk(
    'tEXt',
    Uint8Array.from(Buffer.from(`${key}\0${value}`, 'latin1'))
  )
  const parts = [
    signature,
    textChunk('eleckoi_agent_preset', encoded),
    ...(avatar ? [textChunk('eleckoi_agent_preset_avatar', Buffer.from(avatar).toString('base64'))] : []),
    chunk('IEND', new Uint8Array())
  ]
  const bytes = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))
  let offset = 0
  for (const part of parts) { bytes.set(part, offset); offset += part.length }
  return { displayName: 'preset.png', mimeType: 'image/png', base64: Buffer.from(bytes).toString('base64') }
}

describe('agent preset repository', () => {
  it('persists the four editor areas and projects the active preset into runtime context', () => {
    const repository = harness()
    repository.ensureInitialized()
    const initial = repository.active()
    expect(repository.catalog().groups).toEqual([])
    expect(initial.libraryGroupId).toBe('')
    expect(initial.toolGroups.filter((group) => group.enabled).map((group) => group.id)).toEqual([
      'builtin:variables',
      'builtin:setting-library'
    ])
    expect(initial.entries.map((entry) => entry.id)).toEqual([
      'built-in-hidden-tool-timeline',
      'built-in-roleplay-history-compaction'
    ])
    const timestamp = new Date().toISOString()
    const saved = repository.save({
      ...initial,
      profile: {
        authorName: '作者',
        authorAvatarPath: '',
        usageInstructions: '保持角色设定一致，并按需启用工具。',
        timeline: [{ id: 'update-1', title: '首发', dateLabel: '2026-09-11', note: '说明' }]
      },
      entries: [{
        id: 'prompt-1', title: '角色核心', iconId: '', kind: 'normal', groupId: '', content: '保持角色一致。',
        openingMessages: [], defaultOpeningMessageId: '', agentSelectionHint: '', agentReadStrategy: 'normal',
        agentReadCondition: '', dynamicMode: 'single_condition', keywords: [], keywordScanDepth: 1,
        conditionKeywords: [], keywordCondition: 'none', keywordUseRegex: false, keywordIgnoreCase: true,
        keywordWholeWord: false, keywordRecursionDepth: 0, triggerMode: 'always', enabled: true,
        position: 'after_instructions', promptPositionId: '', insertRole: 'user', order: 1,
        viewOrder: 1, groupViewOrder: 0, treeViewOrder: 1, createdAt: timestamp, updatedAt: timestamp
      }],
      toolGroups: initial.toolGroups.map((group) => ({ ...group, enabled: group.id === 'builtin:web' })),
      subagentModelSelection: { configId: 'child-config', model: 'child-model' },
      roleplayPlan: { steps: ['读取当前设定', '输出最终正文'] },
      regexRules: [{
        id: 'regex-1', name: '清理', pattern: '/x/g', replacement: '', targets: ['AiOutput'], enabled: true,
        displayOnly: false, promptOnly: true, runOnEdit: false, order: 0
      }]
    })

    expect(saved.profile.timeline[0]?.title).toBe('首发')
    expect(saved.profile.usageInstructions).toBe('保持角色设定一致，并按需启用工具。')
    expect(saved.regexRules).toHaveLength(1)
    expect(saved.toolGroups.filter((group) => group.enabled).map((group) => group.id)).toEqual(['builtin:web'])
    expect(saved.subagentModelSelection).toEqual({ configId: 'child-config', model: 'child-model' })
    expect(repository.subagentModelSelection()).toEqual({ configId: 'child-config', model: 'child-model' })
    expect(saved.roleplayPlan.steps).toEqual(['读取当前设定', '输出最终正文'])
    expect(repository.runtimeSelection().roleplayPlan.steps).toEqual(['读取当前设定', '输出最终正文'])
    expect(repository.disabledToolGroupIds()).not.toContain('builtin:web')
    expect(repository.runtimeContext()?.entries.some((entry) => entry.kind === 'history_compaction')).toBe(false)
    expect(repository.runtimeContext()?.entries.find((entry) => entry.kind === 'hidden_tool_timeline')).toMatchObject({
      content: expect.stringContaining('<roleplay_output_protocol>')
    })
    expect(repository.runtimeContext()?.entries.find((entry) => entry.id.endsWith(':prompt-1'))).toMatchObject({
      id: `agent-preset:${saved.id}:prompt-1`,
      content: '保持角色一致。'
    })
    expect(repository.runtimeSelection().historyCompactionInstructions).toContain('较早的角色扮演对话')
  })

  it('creates groups and presets and switches the active preset', () => {
    const repository = harness()
    const grouped = repository.createGroup('剧情')
    const group = grouped.groups.find((item) => item.name === '剧情')
    expect(group).toBeTruthy()
    const created = repository.create('长篇故事', group?.id)
    expect(created.libraryGroupId).toBe(group?.id)
    expect(created.entries.map((entry) => entry.kind)).toEqual(['hidden_tool_timeline', 'history_compaction'])
    expect(repository.setActive(created.id).activePresetId).toBe(created.id)
  })

  it('creates an ungrouped preset without inventing a personal group', () => {
    const repository = harness()
    const created = repository.create('临时预设')
    expect(created.libraryGroupId).toBe('')
    expect(repository.catalog().groups).toEqual([])
  })

  it('preserves the hidden timeline setting trigger and insertion fields when saving', () => {
    const repository = harness()
    repository.ensureInitialized()
    const initial = repository.active()
    const saved = repository.save({
      ...initial,
      entries: initial.entries.map((entry) => entry.kind === 'hidden_tool_timeline' ? {
        ...entry,
        title: '工具流协议',
        iconId: 'note',
        triggerMode: 'always',
        position: 'before_latest_user_input',
        promptPositionId: '',
        insertRole: 'assistant',
        order: 7
      } : entry)
    })

    expect(saved.entries.find((entry) => entry.kind === 'hidden_tool_timeline')).toMatchObject({
      title: '工具流协议',
      iconId: 'note',
      triggerMode: 'always',
      position: 'before_latest_user_input',
      promptPositionId: '',
      insertRole: 'assistant',
      order: 7
    })
  })

  it('moves presets out of a deleted user group without creating a fallback group', () => {
    const repository = harness()
    const createdGroup = repository.createGroup('空分组').groups.find((group) => group.name === '空分组')
    expect(createdGroup).toBeTruthy()
    const preset = repository.create('临时预设', createdGroup!.id)

    repository.deleteGroup(createdGroup!.id)

    expect(repository.catalog().groups).toEqual([])
    expect(repository.get(preset.id).libraryGroupId).toBe('')
  })

  it('converts a SillyTavern preset with required prompts and only the default tool groups enabled', () => {
    const repository = harness()
    repository.ensureInitialized()
    const activeBeforeImport = repository.catalog().activePresetId
    const result = repository.import(importDocument({
      name: '酒馆长篇预设',
      prompts: [
        { identifier: 'main', name: '正文', content: '保持叙事。', role: 'system' },
        { identifier: 'reply', name: '正文', content: '回复用户。', role: 'assistant' },
        { identifier: 'divider', name: '分隔', marker: true }
      ],
      prompt_order: [{
        character_id: 100001,
        order: [
          { identifier: 'main', enabled: true },
          { identifier: 'divider', enabled: true },
          { identifier: 'reply', enabled: false }
        ]
      }],
      extensions: {
        regex_scripts: [
          { scriptName: '保留', findRegex: '/foo/g', replaceString: 'bar', placement: [2] },
          { scriptName: '跳过深度规则', findRegex: '/x/g', replaceString: '', placement: [2], minDepth: 1 }
        ]
      }
    }), 'sillytavern')

    expect(result.source).toBe('sillytavern')
    expect(result.skippedUnsupportedEntries).toBe(1)
    expect(result.skippedDepthRegexCount).toBe(1)
    expect(result.preset.name).toBe('酒馆长篇预设')
    expect(result.preset.entries.map((entry) => entry.id).slice(0, 2)).toEqual([
      'built-in-hidden-tool-timeline',
      'built-in-roleplay-history-compaction'
    ])
    expect(result.preset.entries.slice(2).map((entry) => ({ title: entry.title, enabled: entry.enabled, role: entry.insertRole }))).toEqual([
      { title: '正文', enabled: true, role: 'system' },
      { title: '正文 (2)', enabled: false, role: 'assistant' }
    ])
    expect(result.preset.toolGroups.filter((group) => group.enabled).map((group) => group.id)).toEqual([
      'builtin:variables',
      'builtin:setting-library'
    ])
    expect(result.preset.regexRules).toHaveLength(1)
    expect(repository.catalog().activePresetId).toBe(activeBeforeImport)
  })

  it('exports the Android-aligned JSON format and imports it from JSON or PNG', () => {
    const repository = harness(true)
    repository.ensureInitialized()
    const exported = repository.export(repository.active().id)
    const root = JSON.parse(exported.json)
    expect(root).toMatchObject({ format: 'eleckoi.agent-preset', version: 1 })
    expect(root.preset.profile).not.toHaveProperty('author_avatar_base64')

    const fromJson = repository.import({
      displayName: exported.fileName,
      mimeType: 'application/json',
      base64: Buffer.from(exported.json).toString('base64')
    }, 'eleckoi')
    const fromPng = repository.import(
      pngPresetDocument(exported.json, Uint8Array.from([0x89, 0x50, 0x4e, 0x47])),
      'eleckoi'
    )

    expect(fromJson.preset.entries.map((entry) => entry.id).slice(0, 2)).toEqual([
      'built-in-hidden-tool-timeline',
      'built-in-roleplay-history-compaction'
    ])
    expect(fromPng.preset.name).toBe('默认 Agent 预设 3')
    expect(fromPng.preset.profile.authorAvatarPath).toMatch(/^eleckoi-media:\/\/asset\/v1\//)
    expect(fromPng.preset.toolGroups.filter((group) => group.enabled).map((group) => group.id)).toEqual([
      'builtin:variables',
      'builtin:setting-library'
    ])
  })
})
