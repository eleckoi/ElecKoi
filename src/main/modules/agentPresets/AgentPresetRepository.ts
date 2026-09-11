import { randomUUID } from 'node:crypto'
import { and, asc, eq } from 'drizzle-orm'
import {
  AGENT_TOOL_GROUPS,
  DEFAULT_AGENT_TOOL_GROUP_IDS,
  agentToolGroups
} from '@main/modules/agentTools'
import type { ElecKoiDatabase, SqliteDatabase } from '@main/platform/sqlite/SqliteDatabase'
import type { LocalMediaStore } from '@main/platform/filesystem/LocalMediaStore'
import {
  agentPresetContents,
  agentPresetEntries,
  agentPresetGroups,
  agentPresetLibraryGroups,
  agentPresets,
  agentPresetState,
  agentPresetVersionContents,
  agentPresetVersionEntries,
  agentPresetVersionGroups,
  agentPresetVersions
} from '@main/platform/sqlite/schema/common'
import type { AgentToolGroup } from '@shared/contracts/agent/tools'
import { regexRuleSchema } from '@shared/contracts/regex/schemas'
import type {
  SettingLibraryEntry,
  SettingLibraryGroup
} from '@shared/contracts/settingLibrary/schemas'
import {
  settingLibraryEntrySchema,
  settingLibraryGroupSchema,
  settingLibraryPromptPositionSchema
} from '@shared/contracts/settingLibrary/schemas'
import {
  isHistoryCompactionEntry,
  isHiddenToolTimelineEntry,
  withRequiredAgentPresetEntries
} from '@shared/contracts/presets/builtIns'
import type {
  AgentPreset,
  AgentPresetCatalog,
  AgentPresetImportDocument,
  AgentPresetImportResult,
  AgentPresetImportSource
} from '@shared/contracts/presets/schemas'
import {
  agentPresetCatalogSchema,
  agentPresetImportResultSchema,
  agentPresetModelFamilySchema,
  agentPresetModelTagSchema,
  agentPresetProfileSchema,
  agentPresetSchema,
  agentPresetTimelineItemSchema
} from '@shared/contracts/presets/schemas'
import {
  defaultRoleplayPlanSettings,
  roleplayPlanSettingsSchema
} from '@shared/contracts/presets/roleplayPlan'
import { decodeAgentPresetImport, encodeElecKoiAgentPreset } from './AgentPresetImportCodec'
import {
  disabledAgentPresetToolGroupIds,
  projectAgentPresetRuntimeContext,
  projectAgentPresetRuntimeSelection
} from './AgentPresetRuntime'

export const DEFAULT_AGENT_PRESET_ID = 'agent-preset-standard'
const DEFAULT_AGENT_PRESET_VERSION_ID = 'agent-preset-standard-v1'
const CONTENT_TIMELINE = 'timeline'
const CONTENT_PROMPT_POSITIONS = 'prompt_positions'
const CONTENT_REGEX_RULES = 'regex_rules'
const CONTENT_TOOL_POLICY = 'tool_policy'

export class AgentPresetRepository {
  private initialized = false

  constructor(
    private readonly store: SqliteDatabase,
    private readonly mediaAssets?: LocalMediaStore
  ) {}

  ensureInitialized(): void {
    if (this.initialized) return
    const current = this.store.db.select().from(agentPresetState).where(eq(agentPresetState.singletonId, 1)).get()
    if (!current?.activePresetId || !this.exists(current.activePresetId)) {
      this.store.withWriteTx((db) => {
        db.insert(agentPresets).values({
          id: DEFAULT_AGENT_PRESET_ID,
          name: '默认 Agent 预设',
          modelFamily: 'general',
          modelTagsJson: JSON.stringify([{ id: 'general', label: '通用', providerId: '' }]),
          libraryGroupId: '',
          activeVersionId: DEFAULT_AGENT_PRESET_VERSION_ID,
          authorName: '',
          authorAvatarPath: '',
          usageInstructions: '',
          sortIndex: 0,
          expandedGroupIdsJson: '[]'
        }).onConflictDoNothing().run()
        db.insert(agentPresetVersions).values({
          presetId: DEFAULT_AGENT_PRESET_ID,
          versionId: DEFAULT_AGENT_PRESET_VERSION_ID,
          versionNumber: 1,
          name: '默认 Agent 预设',
          createdAtEpochMs: Date.now(),
          expandedGroupIdsJson: '[]'
        }).onConflictDoNothing().run()
        for (const [kind, content] of defaultContents()) {
          db.insert(agentPresetContents).values({ presetId: DEFAULT_AGENT_PRESET_ID, kind, content })
            .onConflictDoNothing().run()
          db.insert(agentPresetVersionContents).values({
            presetId: DEFAULT_AGENT_PRESET_ID,
            versionId: DEFAULT_AGENT_PRESET_VERSION_ID,
            kind,
            content
          }).onConflictDoNothing().run()
        }
        db.insert(agentPresetState).values({ singletonId: 1, activePresetId: DEFAULT_AGENT_PRESET_ID })
          .onConflictDoUpdate({ target: agentPresetState.singletonId, set: { activePresetId: DEFAULT_AGENT_PRESET_ID } }).run()
      })
    }
    this.ensureRequiredEntries()
    this.initialized = true
  }

  catalog(): AgentPresetCatalog {
    this.ensureInitialized()
    const state = this.store.db.select().from(agentPresetState).where(eq(agentPresetState.singletonId, 1)).get()
    const groups = this.store.db.select().from(agentPresetLibraryGroups).orderBy(asc(agentPresetLibraryGroups.sortIndex)).all()
    const presets = this.store.db.select().from(agentPresets).orderBy(asc(agentPresets.sortIndex)).all().map((row) => {
      const contents = this.contentMap(row.id)
      const version = row.activeVersionId
        ? this.store.db.select().from(agentPresetVersions).where(and(
          eq(agentPresetVersions.presetId, row.id),
          eq(agentPresetVersions.versionId, row.activeVersionId)
        )).get()
        : undefined
      const entryCount = this.store.db.select().from(agentPresetEntries)
        .where(eq(agentPresetEntries.presetId, row.id)).all().length
      return {
        id: row.id,
        name: row.name,
        modelFamily: agentPresetModelFamilySchema.parse(row.modelFamily),
        modelTags: parseList(row.modelTagsJson, agentPresetModelTagSchema, '预设模型标签'),
        libraryGroupId: row.libraryGroupId,
        activeVersionId: row.activeVersionId,
        activeVersionNumber: version?.versionNumber ?? 1,
        entryCount,
        profile: agentPresetProfileSchema.parse({
          authorName: row.authorName,
          authorAvatarPath: row.authorAvatarPath,
          usageInstructions: row.usageInstructions,
          timeline: parseList(contents.get(CONTENT_TIMELINE) ?? '[]', agentPresetTimelineItemSchema, '预设更新时间线')
        })
      }
    })
    const activePresetId = presets.some((item) => item.id === state?.activePresetId)
      ? state?.activePresetId ?? ''
      : presets[0]?.id ?? ''
    return agentPresetCatalogSchema.parse({ activePresetId, groups, presets })
  }

  get(presetId: string): AgentPreset {
    this.ensureInitialized()
    const row = this.store.db.select().from(agentPresets).where(eq(agentPresets.id, presetId)).get()
    if (!row) throw new Error('找不到这个预设。')
    const contents = this.contentMap(row.id)
    const version = row.activeVersionId
      ? this.store.db.select().from(agentPresetVersions).where(and(
        eq(agentPresetVersions.presetId, row.id),
        eq(agentPresetVersions.versionId, row.activeVersionId)
      )).get()
      : undefined
    const entries = withoutLegacyRoleplayPlanEntries(this.store.db.select().from(agentPresetEntries).where(eq(agentPresetEntries.presetId, row.id))
      .orderBy(asc(agentPresetEntries.sortIndex)).all()
      .map((item) => settingLibraryEntrySchema.parse(parseObject(item.payloadJson, '预设提示词'))))
    const groups = this.store.db.select().from(agentPresetGroups).where(eq(agentPresetGroups.presetId, row.id))
      .orderBy(asc(agentPresetGroups.sortIndex)).all()
      .map((item) => settingLibraryGroupSchema.parse(parseObject(item.payloadJson, '预设提示词分组')))
    const toolConfiguration = this.readToolConfiguration(contents.get(CONTENT_TOOL_POLICY))
    return agentPresetSchema.parse({
      id: row.id,
      name: row.name,
      modelFamily: agentPresetModelFamilySchema.parse(row.modelFamily),
      modelTags: parseList(row.modelTagsJson, agentPresetModelTagSchema, '预设模型标签'),
      libraryGroupId: row.libraryGroupId,
      activeVersionId: row.activeVersionId || `${row.id}:v1`,
      activeVersionNumber: version?.versionNumber ?? 1,
      profile: {
        authorName: row.authorName,
        authorAvatarPath: row.authorAvatarPath,
        usageInstructions: row.usageInstructions,
        timeline: parseList(contents.get(CONTENT_TIMELINE) ?? '[]', agentPresetTimelineItemSchema, '预设更新时间线')
      },
      entries,
      groups,
      promptPositions: parseList(contents.get(CONTENT_PROMPT_POSITIONS) ?? '[]', settingLibraryPromptPositionSchema, '预设提示词位置'),
      toolGroups: toolConfiguration.toolGroups,
      subagentModelSelection: toolConfiguration.subagentModelSelection,
      roleplayPlan: toolConfiguration.roleplayPlan,
      regexRules: parseList(contents.get(CONTENT_REGEX_RULES) ?? '[]', regexRuleSchema, '预设正则'),
      expandedGroupIds: parseStrings(row.expandedGroupIdsJson, '预设展开状态')
    })
  }

  save(input: AgentPreset): AgentPreset {
    const normalized = normalizePreset(input)
    if (!this.exists(normalized.id)) throw new Error('找不到要保存的预设。')
    this.store.withWriteTx((db) => {
      db.update(agentPresets).set({
        name: normalized.name,
        modelFamily: normalized.modelFamily,
        modelTagsJson: JSON.stringify(normalized.modelTags),
        libraryGroupId: normalized.libraryGroupId,
        activeVersionId: normalized.activeVersionId,
        authorName: normalized.profile.authorName,
        authorAvatarPath: normalized.profile.authorAvatarPath,
        usageInstructions: normalized.profile.usageInstructions,
        expandedGroupIdsJson: JSON.stringify(normalized.expandedGroupIds)
      }).where(eq(agentPresets.id, normalized.id)).run()
      const contents = contentRows(normalized)
      for (const [kind, content] of contents) {
        db.insert(agentPresetContents).values({ presetId: normalized.id, kind, content })
          .onConflictDoUpdate({ target: [agentPresetContents.presetId, agentPresetContents.kind], set: { content } }).run()
      }
      replaceEntries(db, normalized.id, normalized.entries)
      replaceGroups(db, normalized.id, normalized.groups)
      db.insert(agentPresetVersions).values({
        presetId: normalized.id,
        versionId: normalized.activeVersionId,
        versionNumber: normalized.activeVersionNumber,
        name: normalized.name,
        createdAtEpochMs: Date.now(),
        expandedGroupIdsJson: JSON.stringify(normalized.expandedGroupIds)
      }).onConflictDoUpdate({
        target: [agentPresetVersions.presetId, agentPresetVersions.versionId],
        set: {
          versionNumber: normalized.activeVersionNumber,
          name: normalized.name,
          expandedGroupIdsJson: JSON.stringify(normalized.expandedGroupIds)
        }
      }).run()
      for (const [kind, content] of contents) {
        db.insert(agentPresetVersionContents).values({
          presetId: normalized.id,
          versionId: normalized.activeVersionId,
          kind,
          content
        }).onConflictDoUpdate({
          target: [agentPresetVersionContents.presetId, agentPresetVersionContents.versionId, agentPresetVersionContents.kind],
          set: { content }
        }).run()
      }
      replaceVersionEntries(db, normalized.id, normalized.activeVersionId, normalized.entries)
      replaceVersionGroups(db, normalized.id, normalized.activeVersionId, normalized.groups)
    })
    return this.get(normalized.id)
  }

  create(name: string, libraryGroupId = ''): AgentPreset {
    this.ensureInitialized()
    const id = `agent-preset-${randomUUID()}`
    const versionId = `${id}:v1`
    const catalog = this.catalog()
    const targetGroupId = this.writableGroupId(catalog, libraryGroupId)
    const preset = emptyPreset(id, uniqueName(name.trim() || '新预设', new Set(catalog.presets.map((item) => item.name))), versionId, targetGroupId)
    this.store.db.insert(agentPresets).values({
      id,
      name: preset.name,
      modelFamily: preset.modelFamily,
      modelTagsJson: JSON.stringify(preset.modelTags),
      libraryGroupId: preset.libraryGroupId,
      activeVersionId: versionId,
      authorName: '',
      authorAvatarPath: '',
      usageInstructions: '',
      sortIndex: catalog.presets.length,
      expandedGroupIdsJson: '[]'
    }).run()
    return this.save(preset)
  }

  import(document: AgentPresetImportDocument, source: AgentPresetImportSource): AgentPresetImportResult {
    const decoded = decodeAgentPresetImport(document, source)
    const created = this.create(decoded.preset.name)
    const preparedAvatar = decoded.authorAvatarBase64 && this.mediaAssets
      ? this.mediaAssets.prepareImage(presetMediaOwner(created.id), 'author-avatar', `data:image/png;base64,${decoded.authorAvatarBase64}`)
      : undefined
    try {
      const sourceGroups = distinctById(decoded.preset.groups)
      const groupIds = new Map(sourceGroups.map((group, index) => [group.id, `${created.id}-group-${index + 1}`]))
      const sourcePositions = distinctById(decoded.preset.promptPositions)
      const promptPositionIds = new Map(sourcePositions.map((position, index) => [position.id, `${created.id}-position-${index + 1}`]))
      const timestamp = new Date().toISOString()
      const imported = this.save({
        ...decoded.preset,
        id: created.id,
        name: created.name,
        libraryGroupId: '',
        activeVersionId: created.activeVersionId,
        activeVersionNumber: 1,
        profile: {
          ...decoded.preset.profile,
          authorAvatarPath: preparedAvatar?.reference ?? ''
        },
        groups: sourceGroups.map((group, index) => ({
          ...group,
          id: groupIds.get(group.id)!,
          parentId: groupIds.get(group.parentId) ?? '',
          order: index + 1,
          createdAt: timestamp,
          updatedAt: timestamp
        })),
        entries: withRequiredAgentPresetEntries(decoded.preset.entries).map((entry, index) => ({
          ...entry,
          id: isHistoryCompactionEntry(entry)
            ? entry.id
            : isHiddenToolTimelineEntry(entry) ? entry.id : `${created.id}-entry-${index + 1}`,
          groupId: groupIds.get(entry.groupId) ?? '',
          promptPositionId: promptPositionIds.get(entry.promptPositionId) ?? '',
          createdAt: timestamp,
          updatedAt: timestamp
        })),
        promptPositions: sourcePositions.map((position, index) => ({
          ...position,
          id: promptPositionIds.get(position.id)!,
          order: index + 1,
          createdAt: timestamp,
          updatedAt: timestamp
        })),
        regexRules: decoded.preset.regexRules.map((rule, index) => ({
          ...rule,
          id: `${created.id}-regex-${index + 1}`,
          order: index
        })),
        toolGroups: agentToolGroups(),
        expandedGroupIds: decoded.preset.expandedGroupIds
          .map((id) => groupIds.get(id))
          .filter((id): id is string => Boolean(id))
      })
      preparedAvatar?.commit()
      return agentPresetImportResultSchema.parse({
        preset: imported,
        source: decoded.source,
        skippedUnsupportedEntries: decoded.skippedUnsupportedEntries,
        skippedDepthRegexCount: decoded.skippedDepthRegexCount
      })
    } catch (error) {
      preparedAvatar?.rollback()
      this.store.db.delete(agentPresets).where(eq(agentPresets.id, created.id)).run()
      throw error
    }
  }

  export(presetId: string): { fileName: string; json: string } {
    const preset = this.get(presetId)
    const safeName = preset.name.replace(/[\\/:*?"<>|]/g, '-').trim() || 'ElecKoi预设'
    return { fileName: `${safeName}.json`, json: encodeElecKoiAgentPreset(preset) }
  }

  setActive(presetId: string): AgentPresetCatalog {
    if (!this.exists(presetId)) throw new Error('找不到这个预设。')
    this.store.db.insert(agentPresetState).values({ singletonId: 1, activePresetId: presetId })
      .onConflictDoUpdate({ target: agentPresetState.singletonId, set: { activePresetId: presetId } }).run()
    return this.catalog()
  }

  createGroup(name: string): AgentPresetCatalog {
    const catalog = this.catalog()
    const normalized = uniqueName(name.trim() || '新建分组', new Set(catalog.groups.map((item) => item.name)))
    this.store.db.insert(agentPresetLibraryGroups).values({
      id: `agent-preset-group-${randomUUID()}`,
      name: normalized,
      sortIndex: catalog.groups.length
    }).run()
    return this.catalog()
  }

  renameGroup(groupId: string, name: string): AgentPresetCatalog {
    const catalog = this.catalog()
    const group = catalog.groups.find((item) => item.id === groupId)
    if (!group) throw new Error('找不到这个分组。')
    const normalized = uniqueName(name.trim() || group.name, new Set(catalog.groups.filter((item) => item.id !== groupId).map((item) => item.name)))
    this.store.db.update(agentPresetLibraryGroups).set({ name: normalized }).where(eq(agentPresetLibraryGroups.id, groupId)).run()
    return this.catalog()
  }

  deleteGroup(groupId: string): AgentPresetCatalog {
    const catalog = this.catalog()
    const target = catalog.groups.find((item) => item.id === groupId)
    if (!target) throw new Error('找不到这个分组。')
    const hasAssignedPresets = catalog.presets.some((preset) => preset.libraryGroupId === groupId)
    const fallbackId = hasAssignedPresets
      ? catalog.groups.find((item) => item.id !== groupId)?.id ?? ''
      : ''
    this.store.withWriteTx((db) => {
      if (hasAssignedPresets) db.update(agentPresets).set({ libraryGroupId: fallbackId }).where(eq(agentPresets.libraryGroupId, groupId)).run()
      db.delete(agentPresetLibraryGroups).where(eq(agentPresetLibraryGroups.id, groupId)).run()
    })
    return this.catalog()
  }

  delete(presetId: string): AgentPresetCatalog {
    if (presetId === DEFAULT_AGENT_PRESET_ID) throw new Error('默认 Agent 预设不能删除。')
    this.store.db.delete(agentPresets).where(eq(agentPresets.id, presetId)).run()
    this.mediaAssets?.removeOwner(presetMediaOwner(presetId))
    const catalog = this.catalog()
    if (catalog.activePresetId === presetId && catalog.presets[0]) return this.setActive(catalog.presets[0].id)
    return catalog
  }

  active(): AgentPreset {
    const catalog = this.catalog()
    return this.get(catalog.activePresetId || catalog.presets[0]?.id || DEFAULT_AGENT_PRESET_ID)
  }

  readActiveRegexRules(db: ElecKoiDatabase = this.store.db): {
    presetId: string
    presetName: string
    rules: AgentPreset['regexRules']
  } {
    if (db === this.store.db) this.ensureInitialized()
    const state = db.select().from(agentPresetState).where(eq(agentPresetState.singletonId, 1)).get()
    const preset = state
      ? db.select().from(agentPresets).where(eq(agentPresets.id, state.activePresetId)).get()
      : undefined
    if (!preset) throw new Error('当前没有可读取正则的 Agent 预设。')
    const content = db.select().from(agentPresetContents).where(and(
      eq(agentPresetContents.presetId, preset.id),
      eq(agentPresetContents.kind, CONTENT_REGEX_RULES)
    )).get()
    return {
      presetId: preset.id,
      presetName: preset.name,
      rules: parseList(content?.content ?? '[]', regexRuleSchema, '预设正则')
    }
  }

  replaceActiveRegexRules(rules: AgentPreset['regexRules'], db: ElecKoiDatabase): void {
    const state = db.select().from(agentPresetState).where(eq(agentPresetState.singletonId, 1)).get()
    const preset = state
      ? db.select().from(agentPresets).where(eq(agentPresets.id, state.activePresetId)).get()
      : undefined
    if (!preset) throw new Error('当前没有可保存正则的 Agent 预设。')
    const content = JSON.stringify(rules.map((rule, order) => regexRuleSchema.parse({ ...rule, order })))
    db.insert(agentPresetContents).values({ presetId: preset.id, kind: CONTENT_REGEX_RULES, content })
      .onConflictDoUpdate({
        target: [agentPresetContents.presetId, agentPresetContents.kind],
        set: { content }
      }).run()
    if (!preset.activeVersionId) return
    db.insert(agentPresetVersionContents).values({
      presetId: preset.id,
      versionId: preset.activeVersionId,
      kind: CONTENT_REGEX_RULES,
      content
    }).onConflictDoUpdate({
      target: [agentPresetVersionContents.presetId, agentPresetVersionContents.versionId, agentPresetVersionContents.kind],
      set: { content }
    }).run()
  }

  runtimeContext() {
    return projectAgentPresetRuntimeContext(this.active())
  }

  disabledToolGroupIds(): string[] {
    return disabledAgentPresetToolGroupIds(this.active())
  }

  runtimeSelection(): ReturnType<typeof projectAgentPresetRuntimeSelection> {
    return projectAgentPresetRuntimeSelection(this.active())
  }

  subagentModelSelection(): AgentPreset['subagentModelSelection'] {
    return this.active().subagentModelSelection
  }

  private ensureRequiredEntries(): void {
    const presets = this.store.db.select({ id: agentPresets.id, versionId: agentPresets.activeVersionId }).from(agentPresets).all()
    this.store.withWriteTx((db) => {
      for (const preset of presets) {
        const entries = db.select().from(agentPresetEntries).where(eq(agentPresetEntries.presetId, preset.id))
          .orderBy(asc(agentPresetEntries.sortIndex)).all()
          .map((item) => settingLibraryEntrySchema.parse(parseObject(item.payloadJson, '预设提示词')))
        const required = withRequiredAgentPresetEntries(withoutLegacyRoleplayPlanEntries(entries))
        if (JSON.stringify(required) !== JSON.stringify(entries)) replaceEntries(db, preset.id, required)

        if (!preset.versionId) continue
        const versionEntries = db.select().from(agentPresetVersionEntries).where(and(
          eq(agentPresetVersionEntries.presetId, preset.id),
          eq(agentPresetVersionEntries.versionId, preset.versionId)
        )).orderBy(asc(agentPresetVersionEntries.sortIndex)).all()
          .map((item) => settingLibraryEntrySchema.parse(parseObject(item.payloadJson, '预设版本提示词')))
        const requiredVersionEntries = withRequiredAgentPresetEntries(withoutLegacyRoleplayPlanEntries(versionEntries))
        if (JSON.stringify(requiredVersionEntries) !== JSON.stringify(versionEntries)) {
          replaceVersionEntries(db, preset.id, preset.versionId, requiredVersionEntries)
        }
      }
    })
  }

  private exists(presetId: string): boolean {
    return Boolean(this.store.db.select({ id: agentPresets.id }).from(agentPresets).where(eq(agentPresets.id, presetId)).get())
  }

  private writableGroupId(catalog: AgentPresetCatalog, requestedId: string): string {
    const requested = catalog.groups.find((group) => group.id === requestedId)
    if (requested) return requested.id
    return ''
  }

  private contentMap(presetId: string): Map<string, string> {
    return new Map(this.store.db.select().from(agentPresetContents).where(eq(agentPresetContents.presetId, presetId)).all()
      .map((row) => [row.kind, row.content]))
  }

  private readToolConfiguration(raw: string | undefined): {
    toolGroups: AgentToolGroup[]
    subagentModelSelection: AgentPreset['subagentModelSelection']
    roleplayPlan: AgentPreset['roleplayPlan']
  } {
    const fallback = {
      toolGroups: presetToolGroups(DEFAULT_AGENT_TOOL_GROUP_IDS, DEFAULT_AGENT_TOOL_GROUP_IDS),
      subagentModelSelection: { configId: '', model: '' },
      roleplayPlan: defaultRoleplayPlanSettings()
    }
    if (!raw) return fallback
    try {
      const value = parseObject(raw, '预设工具配置')
      const enabled = new Set(parseUnknownStrings(value.enabledGroupIds))
      const includedValues = parseUnknownStrings(value.includedGroupIds)
      const included = new Set(includedValues.length ? includedValues : enabled)
      const rawSelection = value.subagentModelSelection
      const selection = rawSelection && typeof rawSelection === 'object' && !Array.isArray(rawSelection)
        ? rawSelection as Record<string, unknown>
        : undefined
      const roleplayPlan = roleplayPlanSettingsSchema.safeParse(value.roleplayPlan)
      return {
        toolGroups: presetToolGroups(included, enabled),
        subagentModelSelection: selection
          ? {
              configId: typeof selection.configId === 'string' ? selection.configId : '',
              model: typeof selection.model === 'string' ? selection.model : ''
            }
          : fallback.subagentModelSelection,
        roleplayPlan: roleplayPlan.success ? roleplayPlan.data : fallback.roleplayPlan
      }
    } catch (error) {
      throw new Error('预设工具配置已损坏。', { cause: error })
    }
  }
}

function normalizePreset(input: AgentPreset): AgentPreset {
  const validGroupIds = new Set(input.groups.map((group) => group.id))
  const validToolIds = new Set(AGENT_TOOL_GROUPS.map((group) => group.id))
  return agentPresetSchema.parse({
    ...input,
    name: input.name.trim().slice(0, 60) || '未命名预设',
    modelTags: input.modelTags.map((tag) => ({
      id: tag.id.trim().toLocaleLowerCase(),
      label: tag.label.trim(),
      providerId: tag.providerId.trim()
    })).filter((tag) => tag.id && tag.label).slice(0, 8),
    profile: {
      authorName: input.profile.authorName.trim().slice(0, 40),
      authorAvatarPath: input.profile.authorAvatarPath,
      usageInstructions: input.profile.usageInstructions.trim().slice(0, 1_000),
      timeline: input.profile.timeline.map((item) => ({
        ...item,
        id: item.id || `timeline-${randomUUID()}`,
        title: item.title.trim().slice(0, 80),
        dateLabel: item.dateLabel.trim().slice(0, 24),
        note: item.note.trim().slice(0, 800)
      })).filter((item) => item.title).slice(0, 100)
    },
    entries: withRequiredAgentPresetEntries(withoutLegacyRoleplayPlanEntries(input.entries)).map((entry, index) => settingLibraryEntrySchema.parse({
      ...entry,
      groupId: validGroupIds.has(entry.groupId) ? entry.groupId : '',
      viewOrder: index + 1
    })),
    groups: input.groups.map((group, index) => settingLibraryGroupSchema.parse({ ...group, order: index + 1 })),
    promptPositions: input.promptPositions.map((position, index) => settingLibraryPromptPositionSchema.parse({ ...position, order: index + 1 })),
    toolGroups: input.toolGroups.filter((group) => validToolIds.has(group.id)).map((group) => ({
      ...group,
      included: group.included ?? group.enabled
    })),
    subagentModelSelection: {
      configId: input.subagentModelSelection.configId.trim(),
      model: input.subagentModelSelection.model.trim()
    },
    roleplayPlan: roleplayPlanSettingsSchema.parse({
      steps: input.roleplayPlan.steps.map((step) => step.trim()).filter(Boolean)
    }),
    regexRules: input.regexRules.map((rule, index) => regexRuleSchema.parse({ ...rule, order: index })),
    expandedGroupIds: [...new Set(input.expandedGroupIds)].filter((id) => validGroupIds.has(id))
  })
}

function withoutLegacyRoleplayPlanEntries(entries: SettingLibraryEntry[]): SettingLibraryEntry[] {
  return entries.filter((entry) => entry.id !== 'fixed-roleplay-plan' && entry.kind !== 'roleplay_plan')
}

function emptyPreset(id: string, name: string, versionId: string, libraryGroupId: string): AgentPreset {
  return agentPresetSchema.parse({
    id,
    name,
    modelFamily: 'general',
    modelTags: [{ id: 'general', label: '通用', providerId: '' }],
    libraryGroupId,
    activeVersionId: versionId,
    activeVersionNumber: 1,
    profile: { authorName: '', authorAvatarPath: '', usageInstructions: '', timeline: [] },
    entries: withRequiredAgentPresetEntries([]),
    groups: [],
    promptPositions: [],
    toolGroups: agentToolGroups(),
    subagentModelSelection: { configId: '', model: '' },
    roleplayPlan: defaultRoleplayPlanSettings(),
    regexRules: [],
    expandedGroupIds: []
  })
}

function defaultContents(): Array<[string, string]> {
  return [
    [CONTENT_TIMELINE, '[]'],
    [CONTENT_PROMPT_POSITIONS, '[]'],
    [CONTENT_REGEX_RULES, '[]'],
    [CONTENT_TOOL_POLICY, JSON.stringify({
      version: 4,
      includedGroupIds: [...DEFAULT_AGENT_TOOL_GROUP_IDS],
      enabledGroupIds: [...DEFAULT_AGENT_TOOL_GROUP_IDS],
      subagentModelSelection: { configId: '', model: '' },
      roleplayPlan: defaultRoleplayPlanSettings()
    })]
  ]
}

function contentRows(preset: AgentPreset): Array<[string, string]> {
  return [
    [CONTENT_TIMELINE, JSON.stringify(preset.profile.timeline)],
    [CONTENT_PROMPT_POSITIONS, JSON.stringify(preset.promptPositions)],
    [CONTENT_REGEX_RULES, JSON.stringify(preset.regexRules)],
    [CONTENT_TOOL_POLICY, JSON.stringify({
      version: 4,
      includedGroupIds: preset.toolGroups.filter((group) => group.included ?? group.enabled).map((group) => group.id),
      enabledGroupIds: preset.toolGroups.filter((group) => group.enabled).map((group) => group.id),
      subagentModelSelection: preset.subagentModelSelection,
      roleplayPlan: preset.roleplayPlan
    })]
  ]
}

function presetToolGroups(includedIds: ReadonlySet<string>, enabledIds: ReadonlySet<string>): AgentToolGroup[] {
  return agentToolGroups(enabledIds).map((group) => ({ ...group, included: includedIds.has(group.id) }))
}

function replaceEntries(db: ElecKoiDatabase, presetId: string, entries: SettingLibraryEntry[]): void {
  db.delete(agentPresetEntries).where(eq(agentPresetEntries.presetId, presetId)).run()
  if (entries.length) db.insert(agentPresetEntries).values(entries.map((entry, sortIndex) => ({
    presetId,
    entryId: entry.id,
    sortIndex,
    payloadJson: JSON.stringify(entry)
  }))).run()
}

function replaceGroups(db: ElecKoiDatabase, presetId: string, groups: SettingLibraryGroup[]): void {
  db.delete(agentPresetGroups).where(eq(agentPresetGroups.presetId, presetId)).run()
  if (groups.length) db.insert(agentPresetGroups).values(groups.map((group, sortIndex) => ({
    presetId,
    groupId: group.id,
    sortIndex,
    payloadJson: JSON.stringify(group)
  }))).run()
}

function replaceVersionEntries(db: ElecKoiDatabase, presetId: string, versionId: string, entries: SettingLibraryEntry[]): void {
  db.delete(agentPresetVersionEntries).where(and(
    eq(agentPresetVersionEntries.presetId, presetId),
    eq(agentPresetVersionEntries.versionId, versionId)
  )).run()
  if (entries.length) db.insert(agentPresetVersionEntries).values(entries.map((entry, sortIndex) => ({
    presetId,
    versionId,
    entryId: entry.id,
    sortIndex,
    payloadJson: JSON.stringify(entry)
  }))).run()
}

function replaceVersionGroups(db: ElecKoiDatabase, presetId: string, versionId: string, groups: SettingLibraryGroup[]): void {
  db.delete(agentPresetVersionGroups).where(and(
    eq(agentPresetVersionGroups.presetId, presetId),
    eq(agentPresetVersionGroups.versionId, versionId)
  )).run()
  if (groups.length) db.insert(agentPresetVersionGroups).values(groups.map((group, sortIndex) => ({
    presetId,
    versionId,
    groupId: group.id,
    sortIndex,
    payloadJson: JSON.stringify(group)
  }))).run()
}

function parseObject(raw: string, label: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error()
    return value as Record<string, unknown>
  } catch (error) {
    throw new Error(`${label}已损坏。`, { cause: error })
  }
}

function parseList<T>(raw: string, schema: { parse(value: unknown): T }, label: string): T[] {
  try {
    const value: unknown = JSON.parse(raw)
    if (!Array.isArray(value)) throw new Error()
    return value.map((item) => schema.parse(item))
  } catch (error) {
    throw new Error(`${label}已损坏。`, { cause: error })
  }
}

function parseUnknownStrings(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === 'string'))] : []
}

function parseStrings(raw: string, label: string): string[] {
  try {
    return parseUnknownStrings(JSON.parse(raw))
  } catch (error) {
    throw new Error(`${label}已损坏。`, { cause: error })
  }
}

function uniqueName(base: string, names: Set<string>): string {
  if (!names.has(base)) return base
  let index = 2
  while (names.has(`${base} ${index}`)) index += 1
  return `${base} ${index}`
}

function distinctById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (!item.id || seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

function presetMediaOwner(presetId: string): string {
  return `agent-preset:${presetId}`
}
