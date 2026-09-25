import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { and, asc, eq } from 'drizzle-orm'
import { z } from 'zod'
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
import { DESKTOP_ERROR_CODES, DesktopError } from '@shared/contracts/gateway/DesktopError'
import { regexRuleSchema } from '@shared/contracts/regex/schemas'
import type {
  SettingLibraryEntry,
  SettingLibraryGroup
} from '@shared/contracts/settingLibrary/schemas'
import {
  settingLibraryEntrySchema,
  settingLibraryStoredEntrySchema,
  settingLibraryGroupSchema,
  settingLibraryPromptPositionSchema
} from '@shared/contracts/settingLibrary/schemas'
import {
  isHistoryCompactionEntry,
  isHiddenToolTimelineEntry,
  normalizeAgentPresetPrompts
} from '@shared/contracts/presets/builtIns'
import type {
  AgentPreset,
  AgentPresetCatalog,
  AgentPresetExportFormat,
  AgentPresetExportResult,
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
  subagentModelSelectionSchema,
  agentPresetTimelineItemSchema
} from '@shared/contracts/presets/schemas'
import {
  defaultRoleplayPlanSettings,
  roleplayPlanSettingsSchema
} from '@shared/contracts/presets/roleplayPlan'
import {
  decodeAgentPresetImport,
  encodeElecKoiAgentPreset,
  encodeElecKoiAgentPresetPng
} from './AgentPresetImportCodec'
import type {
  AgentPresetTransferAvatar,
  AgentPresetTransferContent,
  AgentPresetTransferVersion
} from './AgentPresetImportCodec'
import {
  disabledAgentPresetToolGroupIds,
  projectAgentPresetRuntimeContext,
  projectAgentPresetRuntimeSelection
} from './AgentPresetRuntime'

const currentEntrySchema = settingLibraryStoredEntrySchema
const currentPromptPositionSchema = settingLibraryPromptPositionSchema

export const DEFAULT_AGENT_PRESET_ID = 'agent-preset-standard'
const DEFAULT_AGENT_PRESET_VERSION_ID = 'agent-preset-standard-v1'

function regexRulesRevision(rules: AgentPreset['regexRules']): string {
  return createHash('sha256').update(JSON.stringify(rules)).digest('hex')
}
const CONTENT_TIMELINE = 'timeline'
const CONTENT_USAGE_INSTRUCTIONS = 'usage_instructions'
const CONTENT_PROMPT_POSITIONS = 'prompt_positions'
const CONTENT_REGEX_RULES = 'regex_rules'
const CONTENT_TOOL_CONFIGURATION = 'tool_configuration'
const TOOL_CONFIGURATION_VERSION = 4
const toolConfigurationSchema = z.object({
  version: z.literal(TOOL_CONFIGURATION_VERSION),
  includedGroupIds: z.array(z.string()),
  enabledGroupIds: z.array(z.string()),
  subagentModelSelection: subagentModelSelectionSchema,
  roleplayPlan: roleplayPlanSettingsSchema
})

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
          usageInstructions: contents.get(CONTENT_USAGE_INSTRUCTIONS) ?? '',
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
    const entries = this.store.db.select().from(agentPresetEntries).where(eq(agentPresetEntries.presetId, row.id))
      .orderBy(asc(agentPresetEntries.sortIndex)).all()
      .map((item) => currentEntrySchema.parse(parseObject(item.payloadJson, '预设提示词')))
    const groups = this.store.db.select().from(agentPresetGroups).where(eq(agentPresetGroups.presetId, row.id))
      .orderBy(asc(agentPresetGroups.sortIndex)).all()
      .map((item) => settingLibraryGroupSchema.parse(parseObject(item.payloadJson, '预设提示词分组')))
    const prompts = normalizeAgentPresetPrompts(
      entries,
      parseList(contents.get(CONTENT_PROMPT_POSITIONS) ?? '[]', currentPromptPositionSchema, '预设提示词位置')
    )
    const toolConfiguration = this.readToolConfiguration(contents.get(CONTENT_TOOL_CONFIGURATION))
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
        usageInstructions: contents.get(CONTENT_USAGE_INSTRUCTIONS) ?? '',
        timeline: parseList(contents.get(CONTENT_TIMELINE) ?? '[]', agentPresetTimelineItemSchema, '预设更新时间线')
      },
      entries: prompts.entries,
      groups,
      promptPositions: prompts.promptPositions,
      toolGroups: toolConfiguration.toolGroups,
      subagentModelSelection: toolConfiguration.subagentModelSelection,
      roleplayPlan: toolConfiguration.roleplayPlan,
      regexRules: parseList(contents.get(CONTENT_REGEX_RULES) ?? '[]', regexRuleSchema, '预设正则'),
      expandedGroupIds: parseStrings(row.expandedGroupIdsJson, '预设展开状态')
    })
  }

  save(input: AgentPreset, expectedRegexRules?: AgentPreset['regexRules']): AgentPreset {
    const normalized = normalizePreset(input)
    if (!this.exists(normalized.id)) throw new Error('找不到要保存的预设。')
    if (expectedRegexRules) {
      const expected = expectedRegexRules.map((rule, order) => regexRuleSchema.parse({ ...rule, order }))
      if (regexRulesRevision(this.get(normalized.id).regexRules) !== regexRulesRevision(expected)) {
        throw new DesktopError(
          DESKTOP_ERROR_CODES.CONFLICT,
          '当前预设正则已在其他窗口更新，请重新打开后再保存。'
        )
      }
    }
    this.store.withWriteTx((db) => {
      db.update(agentPresets).set({
        name: normalized.name,
        modelFamily: normalized.modelFamily,
        modelTagsJson: JSON.stringify(normalized.modelTags),
        libraryGroupId: normalized.libraryGroupId,
        activeVersionId: normalized.activeVersionId,
        authorName: normalized.profile.authorName,
        authorAvatarPath: normalized.profile.authorAvatarPath,
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
      sortIndex: catalog.presets.length,
      expandedGroupIdsJson: '[]'
    }).run()
    return this.save(preset)
  }

  import(document: AgentPresetImportDocument, source: AgentPresetImportSource): AgentPresetImportResult {
    const decoded = decodeAgentPresetImport(document, source)
    const created = this.create(decoded.preset.name)
    const preparedAvatar = decoded.authorAvatarBase64 && this.mediaAssets
      ? this.mediaAssets.prepareImage(
        presetMediaOwner(created.id),
        'author-avatar',
        `data:${decoded.authorAvatarMediaType ?? 'image/png'};base64,${decoded.authorAvatarBase64}`
      )
      : undefined
    try {
      const timestamp = new Date().toISOString()
      const currentContent = transferContentFromPreset(decoded.preset)
      const sourceVersions = decoded.versions.length ? [...decoded.versions] : [{
        id: decoded.preset.activeVersionId,
        number: decoded.preset.activeVersionNumber,
        name: decoded.preset.name,
        createdAtEpochMs: Date.now(),
        ...currentContent
      }]
      let activeSourceIndex = sourceVersions.findIndex((version) => version.id === decoded.preset.activeVersionId)
      if (activeSourceIndex < 0) {
        activeSourceIndex = sourceVersions.findIndex((version) => version.number === decoded.preset.activeVersionNumber)
      }
      if (activeSourceIndex < 0) {
        sourceVersions.push({
          id: decoded.preset.activeVersionId,
          number: decoded.preset.activeVersionNumber,
          name: decoded.preset.name,
          createdAtEpochMs: Date.now(),
          ...currentContent
        })
        activeSourceIndex = sourceVersions.length - 1
      }
      const importedVersions = sourceVersions.map((version, index) => ({
        ...version,
        id: `${created.id}:v${index + 1}`,
        ...rebaseTransferContent(version, created.id, `v${index + 1}`, timestamp)
      }))
      const activeVersion = importedVersions[activeSourceIndex]!
      const imported = this.save({
        ...decoded.preset,
        id: created.id,
        name: created.name,
        libraryGroupId: '',
        activeVersionId: activeVersion.id,
        activeVersionNumber: activeVersion.number,
        profile: {
          ...decoded.preset.profile,
          authorAvatarPath: preparedAvatar?.reference ?? '',
          usageInstructions: activeVersion.usageInstructions,
          timeline: activeVersion.timeline
        },
        entries: activeVersion.entries,
        groups: activeVersion.groups,
        promptPositions: activeVersion.promptPositions,
        toolGroups: activeVersion.toolGroups,
        subagentModelSelection: { configId: '', model: '' },
        roleplayPlan: activeVersion.roleplayPlan,
        regexRules: activeVersion.regexRules,
        expandedGroupIds: activeVersion.expandedGroupIds
      })
      this.store.withWriteTx((db) => {
        db.delete(agentPresetVersionEntries).where(eq(agentPresetVersionEntries.presetId, created.id)).run()
        db.delete(agentPresetVersionGroups).where(eq(agentPresetVersionGroups.presetId, created.id)).run()
        db.delete(agentPresetVersionContents).where(eq(agentPresetVersionContents.presetId, created.id)).run()
        db.delete(agentPresetVersions).where(eq(agentPresetVersions.presetId, created.id)).run()
        for (const version of importedVersions) {
          const versionPreset = normalizePreset(presetWithTransferContent(imported, version))
          db.insert(agentPresetVersions).values({
            presetId: created.id,
            versionId: version.id,
            versionNumber: version.number,
            name: version.name,
            createdAtEpochMs: version.createdAtEpochMs,
            expandedGroupIdsJson: JSON.stringify(versionPreset.expandedGroupIds)
          }).run()
          for (const [kind, content] of contentRows(versionPreset)) {
            db.insert(agentPresetVersionContents).values({
              presetId: created.id,
              versionId: version.id,
              kind,
              content
            }).run()
          }
          replaceVersionEntries(db, created.id, version.id, versionPreset.entries)
          replaceVersionGroups(db, created.id, version.id, versionPreset.groups)
        }
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

  export(presetId: string, format: AgentPresetExportFormat): AgentPresetExportResult {
    const preset = this.get(presetId)
    const safeName = preset.name.replace(/[\\/:*?"<>|]/g, '-').trim() || 'ElecKoi预设'
    const avatar = portableAvatar(preset.profile.authorAvatarPath, this.mediaAssets)
    const json = encodeElecKoiAgentPreset(preset, {
      ...(avatar ? { authorAvatar: avatar.transfer } : {}),
      versions: this.transferVersions(presetId)
    })
    if (format === 'json') {
      return {
        fileName: `${safeName}.json`,
        mimeType: 'application/json',
        base64: Buffer.from(json, 'utf8').toString('base64')
      }
    }
    const png = encodeElecKoiAgentPresetPng(json, avatar?.transfer.mediaType === 'image/png' ? avatar.bytes : undefined)
    return { fileName: `${safeName}.png`, mimeType: 'image/png', base64: Buffer.from(png).toString('base64') }
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

  assignGroup(presetId: string, groupId: string): AgentPresetCatalog {
    if (!this.exists(presetId)) throw new Error('找不到这个预设。')
    const catalog = this.catalog()
    if (groupId && !catalog.groups.some((group) => group.id === groupId)) {
      throw new Error('找不到这个分组。')
    }
    this.store.db.update(agentPresets).set({ libraryGroupId: groupId }).where(eq(agentPresets.id, presetId)).run()
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
    revision: string
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
    const rules = parseList(content?.content ?? '[]', regexRuleSchema, '预设正则')
    return {
      presetId: preset.id,
      presetName: preset.name,
      rules,
      revision: regexRulesRevision(rules)
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
          .map((item) => currentEntrySchema.parse(parseObject(item.payloadJson, '预设提示词')))
        const contents = db.select().from(agentPresetContents).where(and(
          eq(agentPresetContents.presetId, preset.id),
          eq(agentPresetContents.kind, CONTENT_PROMPT_POSITIONS)
        )).get()
        const positions = parseList(contents?.content ?? '[]', currentPromptPositionSchema, '预设提示词位置')
        const normalized = normalizeAgentPresetPrompts(entries, positions)
        if (JSON.stringify(normalized.entries) !== JSON.stringify(entries)) {
          replaceEntries(db, preset.id, normalized.entries)
        }
        if (JSON.stringify(normalized.promptPositions) !== JSON.stringify(positions)) {
          db.insert(agentPresetContents).values({
            presetId: preset.id,
            kind: CONTENT_PROMPT_POSITIONS,
            content: JSON.stringify(normalized.promptPositions)
          }).onConflictDoUpdate({
            target: [agentPresetContents.presetId, agentPresetContents.kind],
            set: { content: JSON.stringify(normalized.promptPositions) }
          }).run()
        }

        const versions = db.select({ versionId: agentPresetVersions.versionId }).from(agentPresetVersions)
          .where(eq(agentPresetVersions.presetId, preset.id)).all()
        for (const version of versions) {
          const versionEntries = db.select().from(agentPresetVersionEntries).where(and(
            eq(agentPresetVersionEntries.presetId, preset.id),
            eq(agentPresetVersionEntries.versionId, version.versionId)
          )).orderBy(asc(agentPresetVersionEntries.sortIndex)).all()
            .map((item) => currentEntrySchema.parse(parseObject(item.payloadJson, '预设版本提示词')))
          const versionContent = db.select().from(agentPresetVersionContents).where(and(
            eq(agentPresetVersionContents.presetId, preset.id),
            eq(agentPresetVersionContents.versionId, version.versionId),
            eq(agentPresetVersionContents.kind, CONTENT_PROMPT_POSITIONS)
          )).get()
          const versionPositions = parseList(versionContent?.content ?? '[]', currentPromptPositionSchema, '预设版本提示词位置')
          const normalizedVersion = normalizeAgentPresetPrompts(versionEntries, versionPositions)
          if (JSON.stringify(normalizedVersion.entries) !== JSON.stringify(versionEntries)) {
            replaceVersionEntries(db, preset.id, version.versionId, normalizedVersion.entries)
          }
          if (JSON.stringify(normalizedVersion.promptPositions) !== JSON.stringify(versionPositions)) {
            db.insert(agentPresetVersionContents).values({
              presetId: preset.id,
              versionId: version.versionId,
              kind: CONTENT_PROMPT_POSITIONS,
              content: JSON.stringify(normalizedVersion.promptPositions)
            }).onConflictDoUpdate({
              target: [agentPresetVersionContents.presetId, agentPresetVersionContents.versionId, agentPresetVersionContents.kind],
              set: { content: JSON.stringify(normalizedVersion.promptPositions) }
            }).run()
          }
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

  private transferVersions(presetId: string): AgentPresetTransferVersion[] {
    return this.store.db.select().from(agentPresetVersions).where(eq(agentPresetVersions.presetId, presetId))
      .orderBy(asc(agentPresetVersions.versionNumber), asc(agentPresetVersions.createdAtEpochMs)).all()
      .map((version) => {
        const contents = new Map(this.store.db.select().from(agentPresetVersionContents).where(and(
          eq(agentPresetVersionContents.presetId, presetId),
          eq(agentPresetVersionContents.versionId, version.versionId)
        )).all().map((row) => [row.kind, row.content]))
        const toolConfiguration = this.readToolConfiguration(contents.get(CONTENT_TOOL_CONFIGURATION))
        const prompts = normalizeAgentPresetPrompts(
          this.store.db.select().from(agentPresetVersionEntries).where(and(
            eq(agentPresetVersionEntries.presetId, presetId),
            eq(agentPresetVersionEntries.versionId, version.versionId)
          )).orderBy(asc(agentPresetVersionEntries.sortIndex)).all()
            .map((item) => currentEntrySchema.parse(parseObject(item.payloadJson, '预设版本提示词'))),
          parseList(contents.get(CONTENT_PROMPT_POSITIONS) ?? '[]', currentPromptPositionSchema, '预设版本提示词位置')
        )
        return {
          id: version.versionId,
          number: version.versionNumber,
          name: version.name,
          createdAtEpochMs: version.createdAtEpochMs,
          usageInstructions: contents.get(CONTENT_USAGE_INSTRUCTIONS) ?? '',
          timeline: parseList(contents.get(CONTENT_TIMELINE) ?? '[]', agentPresetTimelineItemSchema, '预设版本更新时间线'),
          entries: prompts.entries,
          groups: this.store.db.select().from(agentPresetVersionGroups).where(and(
            eq(agentPresetVersionGroups.presetId, presetId),
            eq(agentPresetVersionGroups.versionId, version.versionId)
          )).orderBy(asc(agentPresetVersionGroups.sortIndex)).all()
            .map((item) => settingLibraryGroupSchema.parse(parseObject(item.payloadJson, '预设版本提示词分组'))),
          promptPositions: prompts.promptPositions,
          toolGroups: toolConfiguration.toolGroups,
          roleplayPlan: toolConfiguration.roleplayPlan,
          regexRules: parseList(contents.get(CONTENT_REGEX_RULES) ?? '[]', regexRuleSchema, '预设版本正则'),
          expandedGroupIds: parseStrings(version.expandedGroupIdsJson, '预设版本展开状态')
        }
      })
  }

  private readToolConfiguration(raw: string | undefined): {
    toolGroups: AgentToolGroup[]
    subagentModelSelection: AgentPreset['subagentModelSelection']
    roleplayPlan: AgentPreset['roleplayPlan']
  } {
    if (!raw) throw new Error('预设缺少工具配置。')
    try {
      const value = toolConfigurationSchema.parse(JSON.parse(raw))
      return {
        toolGroups: presetToolGroups(new Set(value.includedGroupIds), new Set(value.enabledGroupIds)),
        subagentModelSelection: value.subagentModelSelection,
        roleplayPlan: value.roleplayPlan
      }
    } catch (error) {
      throw new Error('预设工具配置已损坏。', { cause: error })
    }
  }
}

function transferContentFromPreset(preset: AgentPreset): AgentPresetTransferContent {
  return {
    usageInstructions: preset.profile.usageInstructions,
    timeline: preset.profile.timeline,
    entries: preset.entries,
    groups: preset.groups,
    promptPositions: preset.promptPositions,
    toolGroups: preset.toolGroups,
    roleplayPlan: preset.roleplayPlan,
    regexRules: preset.regexRules,
    expandedGroupIds: preset.expandedGroupIds
  }
}

function rebaseTransferContent(
  content: AgentPresetTransferContent,
  presetId: string,
  scope: string,
  timestamp: string
): AgentPresetTransferContent {
  const sourceGroups = distinctById(content.groups)
  const groupIds = new Map(sourceGroups.map((group, index) => [group.id, `${presetId}-${scope}-group-${index + 1}`]))
  const normalizedPrompts = normalizeAgentPresetPrompts(content.entries, distinctById(content.promptPositions))
  const sourcePositions = normalizedPrompts.promptPositions
  const promptPositionIds = new Map(sourcePositions.map((position, index) => [position.id, `${presetId}-${scope}-position-${index + 1}`]))
  const includedIds = new Set(content.toolGroups.filter((group) => group.included).map((group) => group.id))
  const enabledIds = new Set(content.toolGroups.filter((group) => group.included && group.enabled).map((group) => group.id))
  return {
    usageInstructions: content.usageInstructions,
    timeline: content.timeline,
    groups: sourceGroups.map((group, index) => ({
      ...group,
      id: groupIds.get(group.id)!,
      parentId: groupIds.get(group.parentId) ?? '',
      order: index + 1,
      createdAt: timestamp,
      updatedAt: timestamp
    })),
    entries: normalizedPrompts.entries.map((entry, index) => ({
      ...entry,
      id: isHistoryCompactionEntry(entry)
        ? entry.id
        : isHiddenToolTimelineEntry(entry) ? entry.id : `${presetId}-${scope}-entry-${index + 1}`,
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
    toolGroups: agentToolGroups(enabledIds).map((group) => ({
      ...group,
      included: includedIds.has(group.id),
      enabled: includedIds.has(group.id) && enabledIds.has(group.id)
    })),
    roleplayPlan: content.roleplayPlan,
    regexRules: content.regexRules.map((rule, index) => ({
      ...rule,
      id: `${presetId}-${scope}-regex-${index + 1}`,
      order: index
    })),
    expandedGroupIds: content.expandedGroupIds
      .map((id) => groupIds.get(id))
      .filter((id): id is string => Boolean(id))
  }
}

function presetWithTransferContent(base: AgentPreset, content: AgentPresetTransferVersion): AgentPreset {
  return {
    ...base,
    activeVersionId: content.id,
    activeVersionNumber: content.number,
    profile: {
      ...base.profile,
      usageInstructions: content.usageInstructions,
      timeline: content.timeline
    },
    entries: content.entries,
    groups: content.groups,
    promptPositions: content.promptPositions,
    toolGroups: content.toolGroups,
    subagentModelSelection: { configId: '', model: '' },
    roleplayPlan: content.roleplayPlan,
    regexRules: content.regexRules,
    expandedGroupIds: content.expandedGroupIds
  }
}

function portableAvatar(reference: string, mediaAssets?: LocalMediaStore): {
  transfer: AgentPresetTransferAvatar
  bytes: Uint8Array
} | undefined {
  const normalized = reference.trim()
  if (!normalized) return undefined
  const dataUrl = /^data:(image\/(?:png|jpeg|webp|gif));base64,([a-z0-9+/=\r\n]+)$/i.exec(normalized)
  let mediaType: string
  let encoded: string
  let bytes: Buffer
  if (dataUrl) {
    mediaType = dataUrl[1]!.toLocaleLowerCase()
    encoded = dataUrl[2]!.replace(/\s+/g, '')
    bytes = Buffer.from(encoded, 'base64')
  } else {
    const path = mediaAssets?.pathForReference(normalized)
    if (!path) return undefined
    const extension = path.split('.').at(-1)?.toLocaleLowerCase()
    mediaType = extension === 'png'
      ? 'image/png'
      : extension === 'jpg' ? 'image/jpeg' : extension === 'webp' ? 'image/webp' : extension === 'gif' ? 'image/gif' : ''
    if (!mediaType) return undefined
    bytes = readFileSync(path)
    encoded = bytes.toString('base64')
  }
  if (!bytes.length || bytes.length > 8 * 1024 * 1024 || bytes.toString('base64').replace(/=+$/, '') !== encoded.replace(/=+$/, '')) {
    throw new Error('预设作者头像已损坏或超过 8 MB。')
  }
  return { transfer: { mediaType, base64: encoded }, bytes }
}

function normalizePreset(input: AgentPreset): AgentPreset {
  const validGroupIds = new Set(input.groups.map((group) => group.id))
  const validToolIds = new Set(AGENT_TOOL_GROUPS.map((group) => group.id))
  const prompts = normalizeAgentPresetPrompts(input.entries, input.promptPositions)
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
    entries: prompts.entries.map((entry, index) => settingLibraryEntrySchema.parse({
      ...entry,
      groupId: validGroupIds.has(entry.groupId) ? entry.groupId : '',
      viewOrder: index + 1
    })),
    groups: input.groups.map((group, index) => settingLibraryGroupSchema.parse({ ...group, order: index + 1 })),
    promptPositions: prompts.promptPositions.map((position, index) => settingLibraryPromptPositionSchema.parse({ ...position, order: index + 1 })),
    toolGroups: input.toolGroups.filter((group) => validToolIds.has(group.id)).map((group) => ({
      ...group,
      included: group.included
    })),
    subagentModelSelection: {
      configId: input.subagentModelSelection.configId.trim(),
      model: input.subagentModelSelection.model.trim()
    },
    roleplayPlan: roleplayPlanSettingsSchema.parse(input.roleplayPlan),
    regexRules: input.regexRules.map((rule, index) => regexRuleSchema.parse({ ...rule, order: index })),
    expandedGroupIds: [...new Set(input.expandedGroupIds)].filter((id) => validGroupIds.has(id))
  })
}

function emptyPreset(id: string, name: string, versionId: string, libraryGroupId: string): AgentPreset {
  const prompts = normalizeAgentPresetPrompts([], [])
  return agentPresetSchema.parse({
    id,
    name,
    modelFamily: 'general',
    modelTags: [{ id: 'general', label: '通用', providerId: '' }],
    libraryGroupId,
    activeVersionId: versionId,
    activeVersionNumber: 1,
    profile: { authorName: '', authorAvatarPath: '', usageInstructions: '', timeline: [] },
    entries: prompts.entries,
    groups: [],
    promptPositions: prompts.promptPositions,
    toolGroups: agentToolGroups(),
    subagentModelSelection: { configId: '', model: '' },
    roleplayPlan: defaultRoleplayPlanSettings(),
    regexRules: [],
    expandedGroupIds: []
  })
}

function defaultContents(): Array<[string, string]> {
  return [
    [CONTENT_USAGE_INSTRUCTIONS, ''],
    [CONTENT_TIMELINE, '[]'],
    [CONTENT_PROMPT_POSITIONS, '[]'],
    [CONTENT_REGEX_RULES, '[]'],
    [CONTENT_TOOL_CONFIGURATION, JSON.stringify({
      version: TOOL_CONFIGURATION_VERSION,
      includedGroupIds: [...DEFAULT_AGENT_TOOL_GROUP_IDS],
      enabledGroupIds: [...DEFAULT_AGENT_TOOL_GROUP_IDS],
      subagentModelSelection: { configId: '', model: '' },
      roleplayPlan: defaultRoleplayPlanSettings()
    })]
  ]
}

function contentRows(preset: AgentPreset): Array<[string, string]> {
  return [
    [CONTENT_USAGE_INSTRUCTIONS, preset.profile.usageInstructions],
    [CONTENT_TIMELINE, JSON.stringify(preset.profile.timeline)],
    [CONTENT_PROMPT_POSITIONS, JSON.stringify(preset.promptPositions)],
    [CONTENT_REGEX_RULES, JSON.stringify(preset.regexRules)],
    [CONTENT_TOOL_CONFIGURATION, JSON.stringify({
      version: TOOL_CONFIGURATION_VERSION,
      includedGroupIds: preset.toolGroups.filter((group) => group.included).map((group) => group.id),
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
