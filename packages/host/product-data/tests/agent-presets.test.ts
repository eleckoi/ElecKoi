import { and, eq } from 'drizzle-orm'
import { agentPresetContents, agentPresetVersionContents } from '../src/storage/sqlite/schema/common'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { AgentPresetRepository } from '../src/domain/agentPresets'
import { LocalMediaStore } from '@eleckoi/dsh-product-data/media'
import { readPngText } from '@eleckoi/dsh-product-data/media'
import { SqliteDatabase } from '../../../../tests/helpers/SqliteDatabase'
import { agentPresetSchema } from '../../../shared/src/contracts/presets/schemas'
import { emptyEntry } from '../src/domain/settingLibraries/index'

const databases: SqliteDatabase[] = []
const directories: string[] = []
const avatarPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')

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

describe('agent preset repository', () => {
  it('moves legacy illustration bindings out of tools in current data, versions and portable presets', () => {
    const repository = harness()
    const preset = repository.get(repository.catalog().activePresetIds.roleplay)
    const database = databases[0]!
    const legacy = { version: 5, includedGroupIds: ['builtin:variables', 'builtin:auto-illustration'],
      enabledGroupIds: ['builtin:auto-illustration'], roleplayPlan: preset.roleplayPlan,
      toolModelConfigIds: { 'builtin:auto-illustration': 'synthetic-image-model' } }
    database.withWriteTx(db => {
      db.update(agentPresetContents).set({ content: JSON.stringify(legacy) })
        .where(and(eq(agentPresetContents.presetId, preset.id), eq(agentPresetContents.kind, 'tool_configuration'))).run()
      db.update(agentPresetVersionContents).set({ content: JSON.stringify({ ...legacy, version: 4, enabledGroupIds: [] }) })
        .where(eq(agentPresetVersionContents.kind, 'tool_configuration')).run()
    })
    database.close(); database.open()
    const reopened = new AgentPresetRepository(database)
    const migrated = reopened.get(preset.id)
    expect(migrated.autoIllustration).toEqual({ enabled: true, modelConfigId: 'synthetic-image-model' })
    expect(migrated.toolModelConfigIds).toEqual({})
    expect(migrated.toolGroups.some(group => group.id === 'builtin:auto-illustration')).toBe(false)
    expect(reopened.runtimeSelection().autoIllustration).toEqual(migrated.autoIllustration)
    database.withWriteTx(db => {
      const archived = JSON.parse(db.select().from(agentPresetVersionContents).where(and(eq(agentPresetVersionContents.presetId, preset.id), eq(agentPresetVersionContents.kind, 'tool_configuration'))).get()!.content)
      expect(archived.autoIllustration).toEqual({ enabled: false, modelConfigId: 'synthetic-image-model' })
    })
    reopened.save(migrated)
    const exported = reopened.export(preset.id, 'json')
    const payload = JSON.parse(Buffer.from(exported.base64, 'base64').toString('utf8'))
    expect(JSON.stringify(payload)).not.toContain('builtin:auto-illustration')
    expect(JSON.stringify(payload)).toContain('@eleckoi/dsh-auto-illustration')
    const imported = reopened.import({ displayName: exported.fileName, mimeType: exported.mimeType, base64: exported.base64 }, 'eleckoi').preset
    expect(imported.autoIllustration).toEqual(migrated.autoIllustration)
    for (const content of [payload.preset, ...payload.preset.versions]) {
      delete content.plugin_configuration
      content.tool_configuration.included_group_ids.push('builtin:auto-illustration')
      content.tool_configuration.enabled_group_ids.push('builtin:auto-illustration')
      content.tool_configuration.tool_model_config_ids = { 'builtin:auto-illustration': 'synthetic-imported-model' }
    }
    const legacyImport = reopened.import(importDocument(payload), 'eleckoi').preset
    expect(legacyImport.autoIllustration).toEqual({ enabled: true, modelConfigId: 'synthetic-imported-model' })
    expect(legacyImport.toolGroups.some(group => group.id === 'builtin:auto-illustration')).toBe(false)
    database.withWriteTx(db => {
      const stored = JSON.parse(db.select().from(agentPresetContents).where(and(eq(agentPresetContents.presetId, preset.id), eq(agentPresetContents.kind, 'tool_configuration'))).get()!.content)
      expect(stored.version).toBe(6)
    })
  })

  it('preserves plugin tool choices through save, reopen, versions and portable JSON without installing plugins', () => {
    const repository = harness()
    const original = repository.active()
    const plugin = { id: 'plugin-tool:synthetic_dice', name: '作者命名的骰子', description: '请安装作者提供的插件', source: 'extension' as const,
      members: [{ name: 'synthetic_dice', description: '掷骰子' }], plugin: { id: 'bundle:synthetic-dice', name: '合成骰子插件' }, included: true, enabled: false, available: false }
    const saved = repository.save({ ...original, toolGroups: [...original.toolGroups, plugin] })
    const { available: _available, ...portable } = plugin
    expect(saved.toolGroups.find(group => group.id === plugin.id)).toEqual(portable)
    const activeDatabase = databases.at(-1)!
    activeDatabase.close(); activeDatabase.open()
    const reopened = new AgentPresetRepository(activeDatabase)
    expect(reopened.get(saved.id).toolGroups.find(group => group.id === plugin.id)).toEqual(portable)
    const exported = reopened.export(saved.id, 'json')
    const document = { displayName: exported.fileName, mimeType: exported.mimeType, base64: exported.base64 }
    const payload = Buffer.from(exported.base64, 'base64').toString('utf8')
    expect(payload).toContain('synthetic_dice')
    expect(payload).not.toContain('"available"')
    const imported = reopened.import(document, 'eleckoi').preset
    expect(imported.toolGroups.find(group => group.id === plugin.id)).toEqual(portable)
    const enabled = reopened.save({ ...imported, toolGroups: imported.toolGroups.map(group => group.id === plugin.id ? { ...group, enabled: true } : group) })
    expect(enabled.toolGroups.find(group => group.id === plugin.id)?.enabled).toBe(true)
    expect(reopened.runtimeSelection()).toBeTruthy()
  })
  it.each([101, 1001, 10001])('preserves %i prompts, long tasks and update records through save and database reopen', count => {
    const repository = harness()
    repository.ensureInitialized()
    const initial = repository.active()
    const body = 'Synthetic author content '.repeat(501) + 'tail-marker'
    const important = [0, Math.floor(count / 2), count - 1]
    const input = agentPresetSchema.parse({ ...initial,
      roleplayPlan: { steps: Array.from({ length: count }, (_, index) => `${index}:${important.includes(index) ? body : 'task'}`) },
      entries: [...initial.entries, ...Array.from({ length: count }, (_, index) => ({ ...emptyEntry(`synthetic-bulk-${index}`),
        title: `Synthetic prompt ${index}`, content: important.includes(index) ? body : `content-${index}` }))],
      profile: { ...initial.profile, usageInstructions: body, timeline: Array.from({ length: count }, (_, index) => ({
        id: `synthetic-update-${index}`, title: `Synthetic update ${index}`, dateLabel: '2026-10-25', note: important.includes(index) ? body : 'note',
      })) },
      regexRules: [{ id: 'synthetic-ejs', name: 'Synthetic EJS', pattern: '/test/g', replacement: `<% /* ${body} */ %><%= "tail-marker" %>`,
        enabled: true, displayOnly: true, promptOnly: false, runOnEdit: false, order: 0, targets: ['AiOutput'] }],
    })
    const saved = repository.save(input, initial.regexRules)
    const database = databases.at(-1)!
    database.close(); database.open()
    const reopened = repository.get(saved.id)
    expect(reopened.entries.filter(entry => entry.id.startsWith('synthetic-bulk-'))).toHaveLength(count)
    expect(reopened.roleplayPlan.steps).toEqual(input.roleplayPlan.steps)
    expect(reopened.profile).toEqual(input.profile)
    expect(reopened.regexRules).toEqual(input.regexRules)
    for (const index of important) expect(reopened.entries.find(entry => entry.id === `synthetic-bulk-${index}`)?.content).toBe(body)
    const removed = repository.save({ ...reopened, profile: { ...reopened.profile, timeline: [] } }, reopened.regexRules)
    database.close(); database.open()
    expect(repository.get(removed.id).profile.timeline).toEqual([])
    expect(repository.get(removed.id).entries).toEqual(reopened.entries)
  }, 60000)

  it('accepts extra editor fields without saving them into preset data', () => {
    const repository = harness()
    repository.ensureInitialized()
    const initial = repository.active()
    const request = {
      preset: agentPresetSchema.parse({
        ...initial, editorOnly: true,
        profile: { ...initial.profile, editorOnly: true },
        roleplayPlan: { ...initial.roleplayPlan, editorOnly: true },
        entries: initial.entries.map((entry) => ({ ...entry, editorOnly: true }))
      }),
      expectedRegexRules: initial.regexRules
    }
    expect(request.preset).not.toHaveProperty('editorOnly')
    expect(request.preset.profile).not.toHaveProperty('editorOnly')
    expect(request.preset.roleplayPlan).not.toHaveProperty('editorOnly')
    expect(request.preset.entries[0]).not.toHaveProperty('editorOnly')
    expect(repository.save(request.preset, request.expectedRegexRules).id).toBe(initial.id)
    expect(agentPresetSchema.safeParse({ ...initial, name: 123 }).success).toBe(false)
  })

  it('removes unfinished empty roleplay tasks before the save command reaches the repository', () => {
    const repository = harness()
    repository.ensureInitialized()
    const initial = repository.active()
    const request = {
      preset: agentPresetSchema.parse({
        ...initial,
        roleplayPlan: { steps: ['  读取设定  ', '', '   ', '  输出正文  '] }
      }),
      expectedRegexRules: initial.regexRules
    }

    expect(request.preset.roleplayPlan.steps).toEqual(['读取设定', '输出正文'])
    expect(repository.save(request.preset, request.expectedRegexRules).roleplayPlan.steps).toEqual([
      '读取设定',
      '输出正文'
    ])
  })

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
    expect(initial.promptPositions).toContainEqual(expect.objectContaining({
      id: 'hidden-tool-timeline',
      anchor: 'insert_point_5',
      side: 'after_setting_position'
    }))
    expect(initial.entries.find((entry) => entry.kind === 'hidden_tool_timeline')).toMatchObject({
      position: 'insert_point_5',
      promptPositionId: 'hidden-tool-timeline'
    })
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
        dynamicMode: 'standard', contentMode: 'plain_text', keywords: [], keywordScanDepth: 1,
        conditionKeywords: [], keywordCondition: 'none', keywordUseRegex: false, keywordIgnoreCase: true,
        keywordWholeWord: false, keywordRecursionDepth: 0, triggerMode: 'always', enabled: true,
        position: 'insert_point_1', promptPositionId: '', insertRole: 'user', order: 1,
        viewOrder: 1, groupViewOrder: 0, treeViewOrder: 1, createdAt: timestamp, updatedAt: timestamp
      }],
      toolGroups: initial.toolGroups.map((group) => ({ ...group, enabled: group.id === 'builtin:web' })),
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
    expect(saved.roleplayPlan.steps).toEqual(['读取当前设定', '输出最终正文'])
    expect(repository.runtimeSelection().roleplayPlan.steps).toEqual(['读取当前设定', '输出最终正文'])
    expect(repository.disabledToolGroupIds()).not.toContain('builtin:web')
    expect(repository.disabledToolGroupIds()).toEqual(saved.toolGroups.filter(group => !group.enabled).map(group => group.id))
    expect(repository.runtimeContext()?.entries.some((entry) => entry.kind === 'history_compaction')).toBe(false)
    expect(repository.runtimeContext()?.entries.find((entry) => entry.kind === 'hidden_tool_timeline')).toMatchObject({
      content: expect.stringContaining('最终可见回复必须且只能使用一对 <FINAL> 与 </FINAL> 标签完整包裹')
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
    expect(repository.setActive(created.id).activePresetIds.roleplay).toBe(created.id)
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
        position: 'insert_point_3',
        promptPositionId: '',
        insertRole: 'assistant',
        order: 7
      } : entry)
    })

    expect(saved.entries.find((entry) => entry.kind === 'hidden_tool_timeline')).toMatchObject({
      title: '工具流协议',
      iconId: 'note',
      triggerMode: 'always',
      position: 'insert_point_3',
      promptPositionId: '',
      insertRole: 'assistant',
      order: 7
    })
  })

  it('preserves a user-edited hidden timeline prompt', () => {
    const repository = harness()
    repository.ensureInitialized()
    const initial = repository.active()
    const saved = repository.save({
      ...initial,
      entries: initial.entries.map((entry) => entry.kind === 'hidden_tool_timeline'
        ? { ...entry, content: '用户自定义工具时间线协议。' }
        : entry)
    })

    expect(saved.entries.find((entry) => entry.kind === 'hidden_tool_timeline')?.content)
      .toBe('用户自定义工具时间线协议。')
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
    const activeBeforeImport = repository.catalog().activePresetIds.roleplay
    const result = repository.import(importDocument({
      name: '合成长篇预设',
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
    expect(result.preset.name).toBe('合成长篇预设')
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
    expect(repository.catalog().activePresetIds.roleplay).toBe(activeBeforeImport)
  })

  it('exports one complete ElecKoi payload as JSON or PNG and restores portable state', () => {
    const repository = harness(true)
    repository.ensureInitialized()
    const active = repository.active()
    repository.save({
      ...active,
      activeVersionId: `${active.id}:v2`,
      activeVersionNumber: 2,
      profile: {
        ...active.profile,
        authorName: '作者',
        authorAvatarPath: `data:image/png;base64,${avatarPng.toString('base64')}`,
        usageInstructions: '选择角色后开始对话。',
        timeline: [{ id: 'release-2', title: '第二版', dateLabel: '2026-09-15', note: '工具配置更新' }]
      },
      toolGroups: active.toolGroups.map((group) => ({
        ...group,
        included: group.id === 'builtin:variables' || group.id === 'builtin:web',
        enabled: group.id === 'builtin:web'
      })),
      roleplayPlan: { steps: ['读取设定', '输出正文'] }
    })
    const jsonExport = repository.export(repository.active().id, 'json')
    const json = Buffer.from(jsonExport.base64, 'base64').toString('utf8')
    const root = JSON.parse(json)
    expect(root).toMatchObject({ format: 'eleckoi.agent-preset', version: 3 })
    expect(root.preset.profile.usage_instructions).toBe('选择角色后开始对话。')
    expect(root.preset.profile.author_avatar).toEqual({
      media_type: 'image/png',
      data: avatarPng.toString('base64')
    })
    expect(root.preset.tool_configuration).toEqual({
      included_group_ids: ['builtin:variables', 'builtin:web'],
      enabled_group_ids: ['builtin:web']
    })
    expect(root.preset.roleplay_plan).toEqual({ steps: ['读取设定', '输出正文'] })
    expect(root.preset.active_version_number).toBe(2)
    expect(root.preset.versions).toHaveLength(2)
    expect(root.preset).not.toHaveProperty('chat_background')

    const pngExport = repository.export(repository.active().id, 'png')
    const pngBytes = Buffer.from(pngExport.base64, 'base64')
    const pngText = readPngText(pngBytes)
    expect([...pngText.keys()]).toEqual(['eleckoi_agent_preset'])
    expect(Buffer.from(pngText.get('eleckoi_agent_preset')!, 'base64').toString('utf8')).toBe(json)

    const fromJson = repository.import({
      displayName: jsonExport.fileName,
      mimeType: 'application/json',
      base64: jsonExport.base64
    }, 'eleckoi')
    const fromPng = repository.import({
      displayName: pngExport.fileName,
      mimeType: pngExport.mimeType,
      base64: pngExport.base64
    }, 'eleckoi')

    expect(fromJson.preset.entries.map((entry) => entry.id).slice(0, 2)).toEqual([
      'built-in-hidden-tool-timeline',
      'built-in-roleplay-history-compaction'
    ])
    expect(fromJson.preset.profile.usageInstructions).toBe('选择角色后开始对话。')
    expect(fromJson.preset.roleplayPlan).toEqual({ steps: ['读取设定', '输出正文'] })
    expect(fromJson.preset.activeVersionNumber).toBe(2)
    expect(fromJson.preset.toolGroups.filter((group) => group.included).map((group) => group.id)).toEqual([
      'builtin:variables',
      'builtin:web'
    ])
    expect(fromJson.preset.toolGroups.filter((group) => group.enabled).map((group) => group.id)).toEqual(['builtin:web'])
    expect(fromJson.preset.profile.authorAvatarPath).toMatch(/^eleckoi-media:\/\/asset\/v1\//)
    expect(fromPng.preset.name).toBe('默认 Agent 预设 3')
    expect(fromPng.preset.profile.authorAvatarPath).toMatch(/^eleckoi-media:\/\/asset\/v1\//)
    const roundTrip = JSON.parse(Buffer.from(repository.export(fromPng.preset.id, 'json').base64, 'base64').toString('utf8'))
    expect(roundTrip.preset.active_version_number).toBe(2)
    expect(roundTrip.preset.versions).toHaveLength(2)
  })

  it('rejects retired setting kinds in current ElecKoi preset files', () => {
    const repository = harness()
    repository.ensureInitialized()
    const root = JSON.parse(Buffer.from(repository.export(repository.active().id, 'json').base64, 'base64').toString('utf8'))
    root.preset.entries[0].kind = 'roleplay_plan'

    expect(() => repository.import(importDocument(root), 'eleckoi'))
      .toThrow('不支持的设定类型')
  })
})
