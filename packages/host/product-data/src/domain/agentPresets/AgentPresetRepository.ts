import { autoIllustrationSchema } from '@shared/contracts/presets/autoIllustration'
import { creatorPresetEntrySchema } from '@shared/contracts/presets/creatorPrompts'
import { upgradeAutoIllustrationConfiguration } from './autoIllustrationUpgrade'
import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { and, asc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import {
  AGENT_TOOL_GROUPS,
  CREATOR_AGENT_TOOL_GROUP_IDS,
  DEFAULT_AGENT_TOOL_GROUP_IDS,
  agentToolGroups
} from '@product-data/domain/agentTools'
import type { ElecKoiDatabase, ElecKoiSqliteStore } from '@product-data/storage/sqlite/SqliteDatabase'
import type { LocalMediaStore } from '@product-data/storage/media/LocalMediaStore'
import { ScriptLibraryRepository } from '@product-data/domain/scripts'
import { characterExists } from '@product-data/domain/personas'
import { agentPresetExists } from './agentPresetLookup'
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
} from '@product-data/storage/sqlite/schema/common'
import { pluginToolGroupSchema, portablePluginToolGroups, type AgentToolGroup } from '@shared/contracts/agent/tools'
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes'
import { DesktopError } from '@shared/foundation/DesktopError'
import { regexRuleSchema } from '@shared/contracts/regex/schemas'
import type {
  SettingLibraryEntry,
  SettingLibraryEntryUpdate,
  SettingLibraryGroup
} from '@shared/contracts/settingLibrary/schemas'
import { applySettingLibraryEntryUpdates } from '@shared/contracts/settingLibrary/entryUpdates'
import {
  settingLibraryEntrySchema,
  settingLibraryStoredEntrySchema,
  settingLibraryGroupSchema,
  settingLibraryPromptPositionSchema
} from '@shared/contracts/settingLibrary/schemas'
import {
  isHistoryCompactionEntry,
  isHiddenToolTimelineEntry,
  defaultCreatorPresetEntries,
  normalizeAgentPresetPrompts
} from '@shared/contracts/presets/builtIns'
import type {
  AgentPreset,
  AgentPresetCatalog,
  AgentPresetExportFormat,
  AgentPresetExportResult,
  AgentPresetImportDocument,
  AgentPresetImportResult,
  AgentPresetImportSource,
  AgentPresetPurpose
} from '@shared/contracts/presets/schemas'
import {
  agentPresetCatalogSchema,
  agentPresetImportResultSchema,
  agentPresetModelFamilySchema,
  agentPresetModelTagSchema,
  agentPresetProfileSchema,
  agentPresetSchema,
  agentPresetTimelineItemSchema,
  agentPresetPurposeSchema,
  DEFAULT_AGENT_PRESET_IDS
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
const TOOL_CONFIGURATION_VERSION = 6
const toolConfigurationSchema = z.object({
  version: z.literal(TOOL_CONFIGURATION_VERSION),
  includedGroupIds: z.array(z.string()),
  enabledGroupIds: z.array(z.string()),
  pluginToolGroups: z.array(pluginToolGroupSchema).default([]),
  roleplayPlan: roleplayPlanSettingsSchema,
  subagentModelSelection: z.object({ configId: z.string(), model: z.string() }).default({ configId: '', model: '' }),
  toolModelConfigIds: z.record(z.string(), z.string()).default({}),
  autoIllustration: autoIllustrationSchema.default({ enabled: false, modelConfigId: '' })
})

export class AgentPresetRepository {
  private initialized = false

  constructor(
    private readonly store: ElecKoiSqliteStore,
    private readonly mediaAssets?: LocalMediaStore,
    private readonly scripts = new ScriptLibraryRepository(store, { character: characterExists, preset: agentPresetExists }),
  ) {}

  ensureInitialized(): void {
    if (this.initialized) return
    this.store.withWriteTx((db) => {
      for (const purpose of ['roleplay', 'creator'] as const) {
        const id = DEFAULT_AGENT_PRESET_IDS[purpose]
        const versionId = purpose === 'roleplay' ? DEFAULT_AGENT_PRESET_VERSION_ID : `${id}-v1`
        const name = purpose === 'roleplay' ? '默认 Agent 预设' : '默认创作预设'
        const missing = !db.select().from(agentPresets).where(eq(agentPresets.id, id)).get()
        db.insert(agentPresets).values({
          id, purpose, name,
          modelFamily: 'general',
          modelTagsJson: JSON.stringify([{ id: 'general', label: '通用', providerId: '' }]),
          libraryGroupId: '',
          activeVersionId: versionId,
          authorName: '',
          authorAvatarPath: '',
          sortIndex: 0,
          expandedGroupIdsJson: '[]'
        }).onConflictDoNothing().run()
        db.insert(agentPresetVersions).values({
          presetId: id,
          versionId,
          versionNumber: 1,
          name,
          createdAtEpochMs: Date.now(),
          expandedGroupIdsJson: '[]'
        }).onConflictDoNothing().run()
        for (const [kind, content] of defaultContents(purpose)) {
          db.insert(agentPresetContents).values({ presetId: id, kind, content })
            .onConflictDoNothing().run()
          db.insert(agentPresetVersionContents).values({
            presetId: id,
            versionId,
            kind,
            content
          }).onConflictDoNothing().run()
        }
        if (missing && purpose === 'creator') {
          const entries = defaultCreatorPresetEntries()
          replaceEntries(db, id, entries)
          replaceVersionEntries(db, id, versionId, entries)
        }
        db.insert(agentPresetState).values({ purpose, activePresetId: id }).onConflictDoNothing().run()
      }
    })
    this.upgradeIllustrationConfiguration()
    this.ensureRequiredEntries()
    this.initialized = true
  }

  // RETIRE WHEN: all supported stored presets and versions use configuration v6.
  // Remove this startup conversion together with the v4/v5 import conversion.
  private upgradeIllustrationConfiguration(): void {
    this.store.withWriteTx(db => {
      for (const table of [agentPresetContents, agentPresetVersionContents] as const) {
        for (const row of db.select().from(table).where(eq(table.kind, CONTENT_TOOL_CONFIGURATION)).all()) {
          const value = JSON.parse(row.content)
          if (value.version !== 4 && value.version !== 5) continue
          const content = JSON.stringify(toolConfigurationSchema.parse(upgradeAutoIllustrationConfiguration(value)))
          const conditions = [eq(table.presetId, row.presetId), eq(table.kind, row.kind)]
          if (table === agentPresetVersionContents && 'versionId' in row) conditions.push(eq(agentPresetVersionContents.versionId, row.versionId as string))
          db.update(table).set({ content }).where(and(...conditions)).run()
        }
      }
    })
  }

  catalog(): AgentPresetCatalog {
    this.ensureInitialized()
    const states = this.store.db.select().from(agentPresetState).all()
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
        purpose: agentPresetPurposeSchema.parse(row.purpose),
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
    const activePresetIds = { roleplay: '', creator: '' }
    for (const purpose of ['roleplay', 'creator'] as const) {
      const state = states.find(item => item.purpose === purpose)
      if (!presets.some(item => item.id === state?.activePresetId && item.purpose === purpose)) {
        throw new DesktopError(
          ELECKOI_FAILURE_CODES.internal,
          `预设全局选择的数据不完整：${purpose}`,
          { what: '预设全局选择' }
        )
      }
      activePresetIds[purpose] = state!.activePresetId
    }
    return agentPresetCatalogSchema.parse({ activePresetIds, groups, presets })
  }

  get(presetId: string): AgentPreset {
    this.ensureInitialized()
    const row = this.store.db.select().from(agentPresets).where(eq(agentPresets.id, presetId)).get()
    if (!row) throw new DesktopError(ELECKOI_FAILURE_CODES.agentPresetNotFound, `找不到这个预设：${presetId}`, { what: '预设' })
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
      parseList(contents.get(CONTENT_PROMPT_POSITIONS) ?? '[]', currentPromptPositionSchema, '预设提示词位置'),
      agentPresetPurposeSchema.parse(row.purpose)
    )
    const toolConfiguration = this.readToolConfiguration(contents.get(CONTENT_TOOL_CONFIGURATION))
    return agentPresetSchema.parse({
      id: row.id,
      purpose: row.purpose,
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
      toolModelConfigIds: toolConfiguration.toolModelConfigIds,
      autoIllustration: toolConfiguration.autoIllustration,
      roleplayPlan: toolConfiguration.roleplayPlan,
      regexRules: parseList(contents.get(CONTENT_REGEX_RULES) ?? '[]', regexRuleSchema, '预设正则'),
      expandedGroupIds: parseStrings(row.expandedGroupIdsJson, '预设展开状态')
    })
  }

  save(input: AgentPreset, expectedRegexRules?: AgentPreset['regexRules']): AgentPreset {
    const normalized = normalizePreset(input)
    if (!this.exists(normalized.id)) throw new DesktopError(ELECKOI_FAILURE_CODES.agentPresetNotFound, `找不到要保存的预设：${normalized.id}`, { what: '预设' })
    const identity = this.store.db.select({ purpose: agentPresets.purpose }).from(agentPresets).where(eq(agentPresets.id, normalized.id)).get()!
    if (identity.purpose !== normalized.purpose) throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, '不能通过保存修改预设用途。', { field: 'purpose' })
    this.writableGroupId(this.catalog(), normalized.libraryGroupId, normalized.purpose)
    if (expectedRegexRules) {
      const expected = expectedRegexRules.map((rule, order) => regexRuleSchema.parse({ ...rule, order }))
      if (regexRulesRevision(this.get(normalized.id).regexRules) !== regexRulesRevision(expected)) {
        throw new DesktopError(
          ELECKOI_FAILURE_CODES.conflictStaleRevision,
          '当前预设正则已在其他窗口更新，请重新打开后再保存。',
          { what: '预设正则' }
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

  updateEntries(presetId: string, updates: SettingLibraryEntryUpdate[]): SettingLibraryEntry[] {
    this.ensureInitialized()
    return this.store.withWriteTx(db => {
      const current = this.get(presetId)
      const next = applySettingLibraryEntryUpdates(current.entries, updates, new Date().toISOString())
      const normalized = normalizeAgentPresetPrompts(next.entries, current.promptPositions, current.purpose)
      const groups = new Set(current.groups.map(group => group.id))
      const positions = new Set(current.promptPositions.map(position => position.id))
      for (const entry of next.changed) {
        if (current.purpose === 'creator') creatorPresetEntrySchema.parse(entry)
        if (entry.groupId && !groups.has(entry.groupId)) throw new DesktopError(
          ELECKOI_FAILURE_CODES.lookupNotFound,
          `条目所在的文件夹不存在：${entry.groupId}`,
          { what: '条目文件夹' }
        )
        if (entry.promptPositionId && !positions.has(entry.promptPositionId)) throw new DesktopError(
          ELECKOI_FAILURE_CODES.lookupNotFound,
          `条目的插入位置不存在：${entry.promptPositionId}`,
          { what: '插入位置' }
        )
        const accepted = normalized.entries.find(item => item.id === entry.id)
        if (JSON.stringify(accepted) !== JSON.stringify(entry)) {
          throw new DesktopError(
            ELECKOI_FAILURE_CODES.inputInvalid,
            `条目修改不符合预设的固定条目或插入位置规则：${entry.id}`,
            { field: 'entries' }
          )
        }
      }
      // Keep the current entries and their active version in the same transaction.
      for (const entry of next.changed) {
        const payloadJson = JSON.stringify(entry)
        const currentWrite = db.update(agentPresetEntries).set({ payloadJson }).where(and(
          eq(agentPresetEntries.presetId, presetId), eq(agentPresetEntries.entryId, entry.id)
        )).run()
        const versionWrite = db.update(agentPresetVersionEntries).set({ payloadJson }).where(and(
          eq(agentPresetVersionEntries.presetId, presetId),
          eq(agentPresetVersionEntries.versionId, current.activeVersionId),
          eq(agentPresetVersionEntries.entryId, entry.id)
        )).run()
        if (currentWrite.changes !== 1 || versionWrite.changes !== 1) throw new DesktopError(
          ELECKOI_FAILURE_CODES.internal,
          `预设条目缺少保存数据：${entry.id}`,
          { what: '预设条目' }
        )
      }
      return next.changed
    })
  }

  create(name: string, libraryGroupId = '', purpose: AgentPresetPurpose = 'roleplay'): AgentPreset {
    this.ensureInitialized()
    const id = `agent-preset-${randomUUID()}`
    const versionId = `${id}:v1`
    const catalog = this.catalog()
    agentPresetPurposeSchema.parse(purpose)
    const targetGroupId = this.writableGroupId(catalog, libraryGroupId, purpose)
    const preset = emptyPreset(id, uniqueName(name.trim() || '新预设', new Set(catalog.presets.filter(item => item.purpose === purpose).map((item) => item.name))), versionId, targetGroupId, purpose)
    this.store.db.insert(agentPresets).values({
      id,
      purpose,
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

  import(document: AgentPresetImportDocument, source: AgentPresetImportSource, purpose: AgentPresetPurpose = 'roleplay'): AgentPresetImportResult {
    const decoded = decodeAgentPresetImport(document, source, purpose)
    this.ensureInitialized()
    let preparedAvatar: ReturnType<LocalMediaStore['prepareImage']> | undefined
    try {
      const result = this.scripts.transaction((db) => {
        const created = this.create(decoded.preset.name, '', purpose)
        preparedAvatar = decoded.authorAvatarBase64 && this.mediaAssets
      ? this.mediaAssets.prepareImage(
        presetMediaOwner(created.id),
        'author-avatar',
        `data:${decoded.authorAvatarMediaType ?? 'image/png'};base64,${decoded.authorAvatarBase64}`
      )
      : undefined
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
        ...rebaseTransferContent(version, created.id, `v${index + 1}`, timestamp, decoded.source === 'eleckoi', purpose)
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
        ...(activeVersion.subagentModelSelection ? { subagentModelSelection: activeVersion.subagentModelSelection } : {}),
        ...(activeVersion.toolModelConfigIds ? { toolModelConfigIds: activeVersion.toolModelConfigIds } : {}),
        ...(activeVersion.autoIllustration ? { autoIllustration: activeVersion.autoIllustration } : {}),
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
      if (decoded.scriptLibrary) this.scripts.importInTransaction('preset', created.id, decoded.scriptLibrary, db)
      return agentPresetImportResultSchema.parse({
        preset: imported,
        source: decoded.source,
        skippedUnsupportedEntries: decoded.skippedUnsupportedEntries,
        skippedDepthRegexCount: decoded.skippedDepthRegexCount
      })
      })
      preparedAvatar?.commit()
      return result
    } catch (error) {
      preparedAvatar?.rollback()
      throw error
    }
  }

  export(presetId: string, format: AgentPresetExportFormat): AgentPresetExportResult {
    const preset = this.get(presetId)
    const safeName = preset.name.replace(/[\\/:*?"<>|]/g, '-').trim() || 'ElecKoi预设'
    const avatar = portableAvatar(preset.profile.authorAvatarPath, this.mediaAssets)
    const json = encodeElecKoiAgentPreset(preset, {
      scriptLibrary: this.scripts.portable('preset', presetId),
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
    const preset = this.get(presetId)
    this.store.db.insert(agentPresetState).values({ purpose: preset.purpose, activePresetId: presetId })
      .onConflictDoUpdate({ target: agentPresetState.purpose, set: { activePresetId: presetId } }).run()
    return this.catalog()
  }

  createGroup(name: string, purpose: AgentPresetPurpose = 'roleplay'): AgentPresetCatalog {
    agentPresetPurposeSchema.parse(purpose)
    const catalog = this.catalog()
    const normalized = uniqueName(name.trim() || '新建分组', new Set(catalog.groups.filter(item => item.purpose === purpose).map((item) => item.name)))
    this.store.db.insert(agentPresetLibraryGroups).values({
      id: `agent-preset-group-${randomUUID()}`,
      name: normalized,
      purpose,
      sortIndex: catalog.groups.length
    }).run()
    return this.catalog()
  }

  renameGroup(groupId: string, name: string): AgentPresetCatalog {
    const catalog = this.catalog()
    const group = catalog.groups.find((item) => item.id === groupId)
    if (!group) throw new DesktopError(ELECKOI_FAILURE_CODES.lookupNotFound, '找不到这个分组。', { what: '分组' })
    const normalized = uniqueName(name.trim() || group.name, new Set(catalog.groups.filter((item) => item.id !== groupId && item.purpose === group.purpose).map((item) => item.name)))
    this.store.db.update(agentPresetLibraryGroups).set({ name: normalized }).where(eq(agentPresetLibraryGroups.id, groupId)).run()
    return this.catalog()
  }

  assignGroup(presetId: string, groupId: string): AgentPresetCatalog {
    if (!this.exists(presetId)) throw new DesktopError(ELECKOI_FAILURE_CODES.agentPresetNotFound, `找不到这个预设：${presetId}`, { what: '预设' })
    const catalog = this.catalog()
    this.writableGroupId(catalog, groupId, this.get(presetId).purpose)
    this.store.db.update(agentPresets).set({ libraryGroupId: groupId }).where(eq(agentPresets.id, presetId)).run()
    return this.catalog()
  }

  deleteGroup(groupId: string): AgentPresetCatalog {
    const catalog = this.catalog()
    const target = catalog.groups.find((item) => item.id === groupId)
    if (!target) throw new DesktopError(ELECKOI_FAILURE_CODES.lookupNotFound, '找不到这个分组。', { what: '分组' })
    const hasAssignedPresets = catalog.presets.some((preset) => preset.libraryGroupId === groupId)
    const fallbackId = ''
    this.store.withWriteTx((db) => {
      if (hasAssignedPresets) db.update(agentPresets).set({ libraryGroupId: fallbackId }).where(eq(agentPresets.libraryGroupId, groupId)).run()
      db.delete(agentPresetLibraryGroups).where(eq(agentPresetLibraryGroups.id, groupId)).run()
    })
    return this.catalog()
  }

  delete(presetId: string): AgentPresetCatalog {
    if (Object.values(DEFAULT_AGENT_PRESET_IDS).includes(presetId as typeof DEFAULT_AGENT_PRESET_IDS[keyof typeof DEFAULT_AGENT_PRESET_IDS])) {
      throw new DesktopError(ELECKOI_FAILURE_CODES.safetyRefused, '默认预设不能删除。', { guard: '默认预设' })
    }
    const preset = this.get(presetId)
    this.scripts.transaction(db => {
      db.update(agentPresetState).set({ activePresetId: DEFAULT_AGENT_PRESET_IDS[preset.purpose] })
        .where(and(eq(agentPresetState.purpose, preset.purpose), eq(agentPresetState.activePresetId, presetId))).run()
      this.scripts.deleteOwnerInTransaction('preset', presetId, db)
      db.delete(agentPresets).where(eq(agentPresets.id, presetId)).run()
    })
    this.mediaAssets?.removeOwner(presetMediaOwner(presetId))
    return this.catalog()
  }

  active(purpose: AgentPresetPurpose = 'roleplay'): AgentPreset {
    const catalog = this.catalog()
    return this.get(catalog.activePresetIds[purpose])
  }

  readActiveRegexRules(db: ElecKoiDatabase = this.store.db): {
    presetId: string
    presetName: string
    rules: AgentPreset['regexRules']
    revision: string
  } {
    if (db === this.store.db) this.ensureInitialized()
    const state = db.select().from(agentPresetState).where(eq(agentPresetState.purpose, 'roleplay')).get()
    if (!state) throw new DesktopError(
      ELECKOI_FAILURE_CODES.statePrecondition,
      '当前没有可读取正则的 Agent 预设。',
      { what: '选择一个 Agent 预设' }
    )
    return this.readRegexRules(state.activePresetId, db)
  }

  readRegexRules(presetId: string, db: ElecKoiDatabase = this.store.db) {
    if (db === this.store.db) this.ensureInitialized()
    const preset = db.select().from(agentPresets).where(eq(agentPresets.id, presetId)).get()
    if (!preset) throw new DesktopError(ELECKOI_FAILURE_CODES.agentPresetNotFound, '指定预设不存在。', { what: '预设' })
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
    const state = db.select().from(agentPresetState).where(eq(agentPresetState.purpose, 'roleplay')).get()
    if (!state) throw new DesktopError(
      ELECKOI_FAILURE_CODES.statePrecondition,
      '当前没有可保存正则的 Agent 预设。',
      { what: '选择一个 Agent 预设' }
    )
    this.replaceRegexRules(state.activePresetId, rules, db)
  }

  enabledRegexRuleIds(db: ElecKoiDatabase): string[] {
    return db.select().from(agentPresetContents).where(eq(agentPresetContents.kind, CONTENT_REGEX_RULES)).all()
      .flatMap(row => parseList(row.content, regexRuleSchema, '预设正则').filter(rule => rule.enabled).map(rule => rule.id))
  }

  replaceRegexRules(presetId: string, rules: AgentPreset['regexRules'], db: ElecKoiDatabase): void {
    const preset = db.select().from(agentPresets).where(eq(agentPresets.id, presetId)).get()
    if (!preset) throw new DesktopError(ELECKOI_FAILURE_CODES.agentPresetNotFound, '指定预设不存在。', { what: '预设' })
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

  // RETIRE WHEN: all supported stored presets, saved versions and restored backups
  // already contain the current required prompt entries and positions. Remove this
  // startup scan, its call and startup-only regressions; keep normalization on reads,
  // saves and imports, and the current required-entry definitions.
  private ensureRequiredEntries(): void {
    const presets = this.store.db.select({ id: agentPresets.id, versionId: agentPresets.activeVersionId, purpose: agentPresets.purpose }).from(agentPresets).all()
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
        const normalized = normalizeAgentPresetPrompts(entries, positions, agentPresetPurposeSchema.parse(preset.purpose))
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
          const normalizedVersion = normalizeAgentPresetPrompts(versionEntries, versionPositions, agentPresetPurposeSchema.parse(preset.purpose))
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
    return agentPresetExists(this.store.db, presetId)
  }

  private writableGroupId(catalog: AgentPresetCatalog, requestedId: string, purpose: AgentPresetPurpose): string {
    if (!requestedId) return ''
    const requested = catalog.groups.find((group) => group.id === requestedId)
    if (!requested) throw new DesktopError(ELECKOI_FAILURE_CODES.lookupNotFound, '找不到这个分组。', { what: '分组' })
    if (requested.purpose !== purpose) throw new DesktopError(
      ELECKOI_FAILURE_CODES.stateMismatch,
      '预设和分组的用途不一致。',
      { what: '预设和分组的用途' }
    )
    return requested.id
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
          parseList(contents.get(CONTENT_PROMPT_POSITIONS) ?? '[]', currentPromptPositionSchema, '预设版本提示词位置'),
          this.get(presetId).purpose
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
          subagentModelSelection: toolConfiguration.subagentModelSelection,
          toolModelConfigIds: toolConfiguration.toolModelConfigIds,
          autoIllustration: toolConfiguration.autoIllustration,
          roleplayPlan: toolConfiguration.roleplayPlan,
          regexRules: parseList(contents.get(CONTENT_REGEX_RULES) ?? '[]', regexRuleSchema, '预设版本正则'),
          expandedGroupIds: parseStrings(version.expandedGroupIdsJson, '预设版本展开状态')
        }
      })
  }

  private readToolConfiguration(raw: string | undefined): {
    toolGroups: AgentToolGroup[]
    roleplayPlan: AgentPreset['roleplayPlan']
    subagentModelSelection: NonNullable<AgentPreset['subagentModelSelection']>
    toolModelConfigIds: NonNullable<AgentPreset['toolModelConfigIds']>
    autoIllustration: NonNullable<AgentPreset['autoIllustration']>
  } {
    if (!raw) throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, '预设缺少工具配置。', { what: '预设工具配置' })
    try {
      const value = toolConfigurationSchema.parse(JSON.parse(raw))
      return {
        toolGroups: [...presetToolGroups(new Set(value.includedGroupIds), new Set(value.enabledGroupIds)), ...portablePluginToolGroups(value.pluginToolGroups)],
        roleplayPlan: value.roleplayPlan,
        subagentModelSelection: value.subagentModelSelection,
        toolModelConfigIds: value.toolModelConfigIds,
        autoIllustration: value.autoIllustration
      }
    } catch (error) {
      throw new DesktopError(ELECKOI_FAILURE_CODES.storageCorrupt, '预设工具配置已损坏。', { what: '预设工具配置' })
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
    ...(preset.subagentModelSelection ? { subagentModelSelection: preset.subagentModelSelection } : {}),
    ...(preset.toolModelConfigIds ? { toolModelConfigIds: preset.toolModelConfigIds } : {}),
    ...(preset.autoIllustration ? { autoIllustration: preset.autoIllustration } : {}),
    roleplayPlan: preset.roleplayPlan,
    regexRules: preset.regexRules,
    expandedGroupIds: preset.expandedGroupIds
  }
}

function rebaseTransferContent(
  content: AgentPresetTransferContent,
  presetId: string,
  scope: string,
  timestamp: string,
  preserveIdentities: boolean,
  purpose: AgentPresetPurpose
): AgentPresetTransferContent {
  const sourceGroups = distinctById(content.groups)
  const groupIds = new Map(sourceGroups.map((group, index) => [group.id, preserveIdentities ? group.id : `${presetId}-${scope}-group-${index + 1}`]))
  const normalizedPrompts = normalizeAgentPresetPrompts(content.entries, distinctById(content.promptPositions), purpose)
  const sourcePositions = normalizedPrompts.promptPositions
  const promptPositionIds = new Map(sourcePositions.map((position, index) => [position.id, preserveIdentities ? position.id : `${presetId}-${scope}-position-${index + 1}`]))
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
      id: preserveIdentities || isHistoryCompactionEntry(entry)
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
    toolGroups: [...agentToolGroups(enabledIds).map((group) => ({
      ...group,
      included: includedIds.has(group.id),
      enabled: includedIds.has(group.id) && enabledIds.has(group.id)
    })), ...portablePluginToolGroups(content.toolGroups)],
    roleplayPlan: content.roleplayPlan,
    ...(content.subagentModelSelection ? { subagentModelSelection: content.subagentModelSelection } : {}),
    ...(content.toolModelConfigIds ? { toolModelConfigIds: content.toolModelConfigIds } : {}),
    ...(content.autoIllustration ? { autoIllustration: content.autoIllustration } : {}),
    regexRules: content.regexRules.map((rule, index) => ({
      ...rule,
      id: preserveIdentities ? rule.id : `${presetId}-${scope}-regex-${index + 1}`,
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
    ...(content.subagentModelSelection ? { subagentModelSelection: content.subagentModelSelection } : {}),
    ...(content.toolModelConfigIds ? { toolModelConfigIds: content.toolModelConfigIds } : {}),
    ...(content.autoIllustration ? { autoIllustration: content.autoIllustration } : {}),
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
  if (!bytes.length || bytes.toString('base64').replace(/=+$/, '') !== encoded.replace(/=+$/, '')) {
    throw new DesktopError(ELECKOI_FAILURE_CODES.mediaInvalid, '预设作者头像已损坏。', { what: '预设作者头像' })
  }
  return { transfer: { mediaType, base64: encoded }, bytes }
}

function normalizePreset(input: AgentPreset): AgentPreset {
  const validGroupIds = new Set(input.groups.map((group) => group.id))
  const validToolIds = new Set(AGENT_TOOL_GROUPS.map((group) => group.id))
  const prompts = normalizeAgentPresetPrompts(input.entries, input.promptPositions, input.purpose)
  return agentPresetSchema.parse({
    ...input,
    name: input.name.trim() || '未命名预设',
    modelTags: input.modelTags.map((tag) => ({
      id: tag.id.trim().toLocaleLowerCase(),
      label: tag.label.trim(),
      providerId: tag.providerId.trim()
    })).filter((tag) => tag.id && tag.label),
    profile: {
      authorName: input.profile.authorName.trim(),
      authorAvatarPath: input.profile.authorAvatarPath,
      usageInstructions: input.profile.usageInstructions,
      timeline: input.profile.timeline.map((item) => ({
        ...item,
        id: item.id || `timeline-${randomUUID()}`,
        title: item.title.trim(),
        dateLabel: item.dateLabel.trim(),
        note: item.note
      })).filter((item) => item.title || item.note)
    },
    entries: prompts.entries.map((entry, index) => settingLibraryEntrySchema.parse({
      ...entry,
      groupId: validGroupIds.has(entry.groupId) ? entry.groupId : '',
      viewOrder: index + 1
    })),
    groups: input.groups.map((group, index) => settingLibraryGroupSchema.parse({ ...group, order: index + 1 })),
    promptPositions: prompts.promptPositions.map((position, index) => settingLibraryPromptPositionSchema.parse({ ...position, order: index + 1 })),
    toolGroups: input.toolGroups.map(group => validToolIds.has(group.id) ? group : pluginToolGroupSchema.parse(group)).map(({ available: _available, ...group }) => ({
      ...group,
      included: group.included
    })),
    roleplayPlan: roleplayPlanSettingsSchema.parse(input.roleplayPlan),
    ...(input.subagentModelSelection ? { subagentModelSelection: input.subagentModelSelection } : {}),
    ...(input.toolModelConfigIds ? { toolModelConfigIds: input.toolModelConfigIds } : {}),
    ...(input.autoIllustration ? { autoIllustration: input.autoIllustration } : {}),
    regexRules: input.regexRules.map((rule, index) => regexRuleSchema.parse({ ...rule, order: index })),
    expandedGroupIds: [...new Set(input.expandedGroupIds)].filter((id) => validGroupIds.has(id))
  })
}

function emptyPreset(id: string, name: string, versionId: string, libraryGroupId: string, purpose: AgentPresetPurpose): AgentPreset {
  const prompts = normalizeAgentPresetPrompts([], [], purpose)
  return agentPresetSchema.parse({
    id,
    purpose,
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
    toolGroups: purpose === 'creator' ? agentToolGroups(CREATOR_AGENT_TOOL_GROUP_IDS) : agentToolGroups(),
    roleplayPlan: defaultRoleplayPlanSettings(),
    regexRules: [],
    expandedGroupIds: []
  })
}

function defaultContents(purpose: AgentPresetPurpose): Array<[string, string]> {
  const enabledIds = purpose === 'creator' ? [...CREATOR_AGENT_TOOL_GROUP_IDS] : [...DEFAULT_AGENT_TOOL_GROUP_IDS]
  return [
    [CONTENT_USAGE_INSTRUCTIONS, ''],
    [CONTENT_TIMELINE, '[]'],
    [CONTENT_PROMPT_POSITIONS, '[]'],
    [CONTENT_REGEX_RULES, '[]'],
    [CONTENT_TOOL_CONFIGURATION, JSON.stringify({
      version: TOOL_CONFIGURATION_VERSION,
      includedGroupIds: enabledIds,
      enabledGroupIds: enabledIds,
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
      pluginToolGroups: portablePluginToolGroups(preset.toolGroups),
      roleplayPlan: preset.roleplayPlan,
      subagentModelSelection: preset.subagentModelSelection ?? { configId: '', model: '' },
      toolModelConfigIds: preset.toolModelConfigIds ?? {},
      autoIllustration: preset.autoIllustration ?? { enabled: false, modelConfigId: '' }
    })]
  ]
}

function presetToolGroups(includedIds: ReadonlySet<string>, enabledIds: ReadonlySet<string>): AgentToolGroup[] {
  return agentToolGroups(enabledIds).map((group) => ({ ...group, included: includedIds.has(group.id) }))
}

function replaceEntries(db: ElecKoiDatabase, presetId: string, entries: SettingLibraryEntry[]): void {
  db.delete(agentPresetEntries).where(eq(agentPresetEntries.presetId, presetId)).run()
  if (entries.length) {
    const insert = db.insert(agentPresetEntries).values({
      presetId,
      entryId: sql.placeholder('entryId'),
      sortIndex: sql.placeholder('sortIndex'),
      payloadJson: sql.placeholder('payloadJson')
    }).prepare()
    entries.forEach((entry, sortIndex) => insert.run({ entryId: entry.id, sortIndex, payloadJson: JSON.stringify(entry) }))
  }
}

function replaceGroups(db: ElecKoiDatabase, presetId: string, groups: SettingLibraryGroup[]): void {
  db.delete(agentPresetGroups).where(eq(agentPresetGroups.presetId, presetId)).run()
  if (groups.length) {
    const insert = db.insert(agentPresetGroups).values({
      presetId,
      groupId: sql.placeholder('groupId'),
      sortIndex: sql.placeholder('sortIndex'),
      payloadJson: sql.placeholder('payloadJson')
    }).prepare()
    groups.forEach((group, sortIndex) => insert.run({ groupId: group.id, sortIndex, payloadJson: JSON.stringify(group) }))
  }
}

function replaceVersionEntries(db: ElecKoiDatabase, presetId: string, versionId: string, entries: SettingLibraryEntry[]): void {
  db.delete(agentPresetVersionEntries).where(and(
    eq(agentPresetVersionEntries.presetId, presetId),
    eq(agentPresetVersionEntries.versionId, versionId)
  )).run()
  if (entries.length) {
    const insert = db.insert(agentPresetVersionEntries).values({
      presetId,
      versionId,
      entryId: sql.placeholder('entryId'),
      sortIndex: sql.placeholder('sortIndex'),
      payloadJson: sql.placeholder('payloadJson')
    }).prepare()
    entries.forEach((entry, sortIndex) => insert.run({ entryId: entry.id, sortIndex, payloadJson: JSON.stringify(entry) }))
  }
}

function replaceVersionGroups(db: ElecKoiDatabase, presetId: string, versionId: string, groups: SettingLibraryGroup[]): void {
  db.delete(agentPresetVersionGroups).where(and(
    eq(agentPresetVersionGroups.presetId, presetId),
    eq(agentPresetVersionGroups.versionId, versionId)
  )).run()
  if (groups.length) {
    const insert = db.insert(agentPresetVersionGroups).values({
      presetId,
      versionId,
      groupId: sql.placeholder('groupId'),
      sortIndex: sql.placeholder('sortIndex'),
      payloadJson: sql.placeholder('payloadJson')
    }).prepare()
    groups.forEach((group, sortIndex) => insert.run({ groupId: group.id, sortIndex, payloadJson: JSON.stringify(group) }))
  }
}

function parseObject(raw: string, label: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, `${label}的形状不对。`, { what: label })
    }
    return value as Record<string, unknown>
  } catch (error) {
    if (error instanceof DesktopError) throw error
    throw new DesktopError(ELECKOI_FAILURE_CODES.storageCorrupt, `${label}已损坏。`, { what: label })
  }
}

function parseList<T>(raw: string, schema: { parse(value: unknown): T }, label: string): T[] {
  try {
    const value: unknown = JSON.parse(raw)
    if (!Array.isArray(value)) {
      throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, `${label}的形状不对。`, { what: label })
    }
    return value.map((item) => schema.parse(item))
  } catch (error) {
    if (error instanceof DesktopError) throw error
    throw new DesktopError(ELECKOI_FAILURE_CODES.storageCorrupt, `${label}已损坏。`, { what: label })
  }
}

function parseUnknownStrings(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === 'string'))] : []
}

function parseStrings(raw: string, label: string): string[] {
  try {
    return parseUnknownStrings(JSON.parse(raw))
  } catch (error) {
    throw new DesktopError(ELECKOI_FAILURE_CODES.storageCorrupt, `${label}已损坏。`, { what: label })
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
