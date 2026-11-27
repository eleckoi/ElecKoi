import { creatorPresetEntrySchema } from '@shared/contracts/presets/creatorPrompts'
import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { HiddenToolTimelineFile } from '../../HiddenToolTimelineFile'
import { databasePresetEntry, parseList, parseObject, readStoredPresetEntry, readStoredPrompts, replaceEntries, replaceVersionEntries, toolConfigurationSchema, TOOL_CONFIGURATION_VERSION } from './AgentPresetStorage'
import { HiddenToolTimelineSettingsFile, hiddenToolTimelineSettings, isHiddenToolTimelinePosition, type ReadHiddenToolTimelineSettings } from './HiddenToolTimelineSettings'
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import { AGENT_TOOL_GROUPS, CREATOR_AGENT_TOOL_GROUP_IDS, agentToolGroups, withRoleplayReplyGroup } from '@product-data/domain/agentTools';
import type { ElecKoiDatabase, ElecKoiSqliteStore } from '@product-data/storage/sqlite/SqliteDatabase'
import type { LocalMediaStore } from '@product-data/storage/media/LocalMediaStore'
import { ScriptLibraryRepository } from '@product-data/domain/scripts'
import { readRegexScopeEnabled, saveRegexScopeEnabled } from '@product-data/domain/regexRules'
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
  SettingLibraryGroup,
  SettingLibraryPromptPosition
} from '@shared/contracts/settingLibrary/schemas'
import { applySettingLibraryEntryUpdates } from '@shared/contracts/settingLibrary/entryUpdates'
import {
  settingLibraryEntrySchema,
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
  AgentPresetTransferVersion,
  DecodedAgentPresetImport
} from './AgentPresetImportCodec'
import {
  disabledAgentPresetToolGroupIds,
  projectAgentPresetRuntimeContext,
  projectAgentPresetRuntimeSelection
} from './AgentPresetRuntime'

const currentPromptPositionSchema = settingLibraryPromptPositionSchema

export const DEFAULT_AGENT_PRESET_ID = 'agent-preset-standard'

function regexRulesRevision(rules: AgentPreset['regexRules']): string {
  return createHash('sha256').update(JSON.stringify(rules)).digest('hex')
}
const CONTENT_TIMELINE = 'timeline'
const CONTENT_USAGE_INSTRUCTIONS = 'usage_instructions'
const CONTENT_PROMPT_POSITIONS = 'prompt_positions'
const CONTENT_REGEX_RULES = 'regex_rules'
const CONTENT_TOOL_CONFIGURATION = 'tool_configuration'

export class AgentPresetRepository {
  private readonly hiddenToolTimeline: HiddenToolTimelineFile
  private readonly hiddenTimelineSettings: HiddenToolTimelineSettingsFile

  constructor(
    private readonly store: ElecKoiSqliteStore,
    private readonly mediaAssets?: LocalMediaStore,
    private readonly scripts = new ScriptLibraryRepository(store, { character: characterExists, preset: agentPresetExists }),
  ) {
    this.hiddenToolTimeline = new HiddenToolTimelineFile(dirname(store.native.name))
    this.hiddenTimelineSettings = new HiddenToolTimelineSettingsFile(dirname(store.native.name), store)
  }

  catalog(): AgentPresetCatalog {
    const states = this.store.db.select().from(agentPresetState).all()
    const groups = this.store.db.select().from(agentPresetLibraryGroups).orderBy(asc(agentPresetLibraryGroups.sortIndex)).all()
    const profiles = new Map<string, Map<string, string>>()
    for (const content of this.store.db.select().from(agentPresetContents)
      .where(inArray(agentPresetContents.kind, [CONTENT_USAGE_INSTRUCTIONS, CONTENT_TIMELINE])).all()) {
      let profile = profiles.get(content.presetId)
      if (!profile) { profile = new Map(); profiles.set(content.presetId, profile) }
      profile.set(content.kind, content.content)
    }
    const versions = new Map(this.store.db.select({ presetId: agentPresetVersions.presetId,
      versionId: agentPresetVersions.versionId, number: agentPresetVersions.versionNumber })
      .from(agentPresetVersions).all().map(version => [JSON.stringify([version.presetId, version.versionId]), version.number]))
    const entryCounts = new Map(this.store.db.select({ presetId: agentPresetEntries.presetId, count: sql<number>`count(*)` })
      .from(agentPresetEntries).groupBy(agentPresetEntries.presetId).all().map(row => [row.presetId, row.count]))
    const presets = this.store.db.select().from(agentPresets).orderBy(asc(agentPresets.sortIndex)).all().map((row) => {
      const contents = profiles.get(row.id)
      return {
        id: row.id,
        purpose: agentPresetPurposeSchema.parse(row.purpose),
        name: row.name,
        modelFamily: agentPresetModelFamilySchema.parse(row.modelFamily),
        modelTags: parseList(row.modelTagsJson, agentPresetModelTagSchema, '预设模型标签'),
        libraryGroupId: row.libraryGroupId,
        activeVersionId: row.activeVersionId,
        activeVersionNumber: row.activeVersionId ? versions.get(JSON.stringify([row.id, row.activeVersionId])) ?? 1 : 1,
        entryCount: entryCounts.get(row.id) ?? 0,
        profile: agentPresetProfileSchema.parse({
          authorName: row.authorName,
          authorAvatarPath: row.authorAvatarPath,
          usageInstructions: contents?.get(CONTENT_USAGE_INSTRUCTIONS) ?? '',
          timeline: parseList(contents?.get(CONTENT_TIMELINE) ?? '[]', agentPresetTimelineItemSchema, '预设更新时间线')
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
    return this.readPreset(presetId, this.hiddenTimelineSettings.reader())
  }

  private readPreset(presetId: string, readTimelineSettings: ReadHiddenToolTimelineSettings): AgentPreset {
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
      .map((item) => readStoredPresetEntry(item.payloadJson))
    const groups = this.store.db.select().from(agentPresetGroups).where(eq(agentPresetGroups.presetId, row.id))
      .orderBy(asc(agentPresetGroups.sortIndex)).all()
      .map((item) => settingLibraryGroupSchema.parse(parseObject(item.payloadJson, '预设提示词分组')))
    const prompts = readStoredPrompts(readTimelineSettings, row.id, '',
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
      entries: row.purpose === 'roleplay'
        ? prompts.entries.map(entry => isHiddenToolTimelineEntry(entry) ? { ...entry, content: this.hiddenToolTimeline.read() } : entry)
        : prompts.entries,
      groups,
      promptPositions: prompts.promptPositions,
      toolGroups: withRoleplayReplyGroup(toolConfiguration.toolGroups, agentPresetPurposeSchema.parse(row.purpose)),
      subagentModelSelection: toolConfiguration.subagentModelSelection,
      toolModelConfigIds: toolConfiguration.toolModelConfigIds,
      autoIllustration: toolConfiguration.autoIllustration,
      roleplayPlan: toolConfiguration.roleplayPlan,
      regexRules: parseList(contents.get(CONTENT_REGEX_RULES) ?? '[]', regexRuleSchema, '预设正则'),
      expandedGroupIds: parseStrings(row.expandedGroupIdsJson, '预设展开状态')
    })
  }

  private saveTimelineSettings(presetId: string, versionId: string, entries: SettingLibraryEntry[], positions: SettingLibraryPromptPosition[]): void {
    this.hiddenTimelineSettings.set(presetId, versionId, hiddenToolTimelineSettings(entries, positions))
  }

  save(input: AgentPreset, expectedRegexRules?: AgentPreset['regexRules'], expectedPrompt?: string): AgentPreset {
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
    const editedPrompt = normalized.purpose === 'roleplay' && expectedPrompt !== undefined
      ? input.entries.find(isHiddenToolTimelineEntry)?.content : undefined
    const current = editedPrompt !== undefined && editedPrompt !== expectedPrompt ? normalizePreset(this.get(normalized.id)) : undefined
    const comparable = (preset: AgentPreset) => JSON.stringify({ ...preset, entries: preset.entries.map(entry =>
      isHiddenToolTimelineEntry(entry) ? { ...entry, content: '', updatedAt: '' } : entry) })
    this.withPromptEdit(expectedPrompt, editedPrompt, () => {
      if (current && comparable(current) === comparable(normalized)) return
      this.hiddenTimelineSettings.transaction((db) => {
        if (normalized.purpose === 'roleplay') {
          this.saveTimelineSettings(normalized.id, '', normalized.entries, normalized.promptPositions)
          this.saveTimelineSettings(normalized.id, normalized.activeVersionId, normalized.entries, normalized.promptPositions)
        }
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
    })
    return this.get(normalized.id)
  }

  updateEntries(presetId: string, updates: SettingLibraryEntryUpdate[]): SettingLibraryEntry[] {
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
    const oldPrompt = current.entries.find(isHiddenToolTimelineEntry)
    const newPrompt = current.purpose === 'roleplay' ? next.changed.find(isHiddenToolTimelineEntry) : undefined
    const storedChanges = next.changed.filter(entry => entry !== newPrompt || !oldPrompt ||
      JSON.stringify(databasePresetEntry({ ...entry, updatedAt: oldPrompt.updatedAt })) !== JSON.stringify(databasePresetEntry(oldPrompt)))
    // Keep the current entries and their active version in the same transaction.
    this.withPromptEdit(oldPrompt?.content, newPrompt?.content, () => {
      if (!newPrompt && !storedChanges.length) return
      this.hiddenTimelineSettings.transaction(db => {
        if (newPrompt) {
          this.saveTimelineSettings(presetId, '', normalized.entries, normalized.promptPositions)
          this.saveTimelineSettings(presetId, current.activeVersionId, normalized.entries, normalized.promptPositions)
        }
        for (const entry of storedChanges) {
          const payloadJson = JSON.stringify(databasePresetEntry(entry))
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
      })
    })
    return next.changed
  }

  private withPromptEdit<TResult>(expected: string | undefined, content: string | undefined, save: () => TResult): TResult {
    if (expected === undefined || content === undefined || content === expected) return save()
    if (this.hiddenToolTimeline.read() !== expected) throw new DesktopError(
      ELECKOI_FAILURE_CODES.conflictStaleRevision,
      '隐藏工具调用过程已更新，请重新打开预设后再保存。', { what: '隐藏工具调用过程' }
    )
    this.hiddenToolTimeline.write(content)
    try { return save() }
    catch (error) {
      try { this.hiddenToolTimeline.write(expected) }
      catch (restoreError) { throw new AggregateError([error, restoreError], '恢复隐藏工具调用过程失败。') }
      throw error
    }
  }

  create(name: string, libraryGroupId = '', purpose: AgentPresetPurpose = 'roleplay'): AgentPreset {
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
    return this.installTransferredPreset(decodeAgentPresetImport(document, source, purpose), purpose, '')
  }

  duplicate(presetId: string): AgentPreset {
    const readTimelineSettings = this.hiddenTimelineSettings.reader()
    const preset = this.readPreset(presetId, readTimelineSettings)
    const avatar = portableAvatar(preset.profile.authorAvatarPath, this.mediaAssets)
    return this.installTransferredPreset({
      preset: { ...preset, name: `${preset.name}（副本）` },
      source: 'eleckoi',
      skippedUnsupportedEntries: 0,
      skippedDepthRegexCount: 0,
      regexEnabled: readRegexScopeEnabled(this.store.db, 'preset', presetId),
      scriptLibrary: this.scripts.portable('preset', presetId),
      ...(avatar ? { authorAvatarBase64: avatar.transfer.base64, authorAvatarMediaType: avatar.transfer.mediaType } : {}),
      versions: this.transferVersions(preset, readTimelineSettings)
    }, preset.purpose, preset.libraryGroupId).preset
  }

  private installTransferredPreset(decoded: DecodedAgentPresetImport, purpose: AgentPresetPurpose, libraryGroupId: string): AgentPresetImportResult {
    let preparedAvatar: ReturnType<LocalMediaStore['prepareImage']> | undefined
    try {
      const result = this.hiddenTimelineSettings.transaction(() => this.scripts.transaction((db) => {
        const created = this.create(decoded.preset.name, libraryGroupId, purpose)
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
        libraryGroupId: created.libraryGroupId,
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
          if (purpose === 'roleplay') this.saveTimelineSettings(created.id, version.id, versionPreset.entries, versionPreset.promptPositions)
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
      if (decoded.regexEnabled !== undefined) saveRegexScopeEnabled(db, 'preset', created.id, decoded.regexEnabled)
      return agentPresetImportResultSchema.parse({
        preset: imported,
        source: decoded.source,
        skippedUnsupportedEntries: decoded.skippedUnsupportedEntries,
        skippedDepthRegexCount: decoded.skippedDepthRegexCount
      })
      }))
      preparedAvatar?.commit()
      return result
    } catch (error) {
      preparedAvatar?.rollback()
      throw error
    }
  }

  export(presetId: string, format: AgentPresetExportFormat): AgentPresetExportResult {
    const readTimelineSettings = this.hiddenTimelineSettings.reader()
    const preset = this.readPreset(presetId, readTimelineSettings)
    const safeName = preset.name.replace(/[\\/:*?"<>|]/g, '-').trim() || 'ElecKoi预设'
    const avatar = portableAvatar(preset.profile.authorAvatarPath, this.mediaAssets)
    const json = encodeElecKoiAgentPreset({ ...preset, entries: preset.entries.map(storedPresetEntry) }, {
      regexEnabled: readRegexScopeEnabled(this.store.db, 'preset', presetId),
      scriptLibrary: this.scripts.portable('preset', presetId),
      ...(avatar ? { authorAvatar: avatar.transfer } : {}),
      versions: this.transferVersions(preset, readTimelineSettings)
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

  reorderGroups(groupIds: string[], purpose: AgentPresetPurpose): AgentPresetCatalog {
    agentPresetPurposeSchema.parse(purpose)
    const groups = this.catalog().groups.filter(group => group.purpose === purpose)
    const ids = z.array(z.string()).parse(groupIds)
    const known = new Set(groups.map(group => group.id))
    if (ids.length !== groups.length || new Set(ids).size !== ids.length || ids.some(id => !known.has(id))) {
      throw new DesktopError(ELECKOI_FAILURE_CODES.conflictStaleRevision, '分组已在其他位置更新，请按最新列表重试。', { what: '预设分组' })
    }
    this.store.withWriteTx(db => {
      ids.forEach((id, sortIndex) => db.update(agentPresetLibraryGroups).set({ sortIndex }).where(eq(agentPresetLibraryGroups.id, id)).run())
    })
    return this.catalog()
  }

  assignGroup(presetId: string, groupId: string): AgentPresetCatalog {
    return this.assignGroups([presetId], groupId, this.get(presetId).purpose)
  }

  assignGroups(presetIds: string[], groupId: string, purpose: AgentPresetPurpose): AgentPresetCatalog {
    const ids = [...new Set(z.array(z.string().min(1)).min(1).parse(presetIds))]
    agentPresetPurposeSchema.parse(purpose)
    return this.store.withWriteTx(db => {
      const catalog = this.catalog()
      const presets = new Map(catalog.presets.map(preset => [preset.id, preset]))
      const target = this.writableGroupId(catalog, groupId, purpose)
      for (const id of ids) {
        const preset = presets.get(id)
        if (!preset) throw new DesktopError(ELECKOI_FAILURE_CODES.agentPresetNotFound, `找不到这个预设：${id}`, { what: '预设' })
        if (preset.purpose !== purpose) throw new DesktopError(
          ELECKOI_FAILURE_CODES.stateMismatch, '只能移动同一分类的预设。', { what: '预设分类' }
        )
        if (preset.libraryGroupId !== target) {
          db.update(agentPresets).set({ libraryGroupId: target }).where(eq(agentPresets.id, id)).run()
        }
      }
      return this.catalog()
    })
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
    this.hiddenTimelineSettings.transaction(() => this.scripts.transaction(db => {
      db.update(agentPresetState).set({ activePresetId: DEFAULT_AGENT_PRESET_IDS[preset.purpose] })
        .where(and(eq(agentPresetState.purpose, preset.purpose), eq(agentPresetState.activePresetId, presetId))).run()
      this.scripts.deleteOwnerInTransaction('preset', presetId, db)
      db.delete(agentPresets).where(eq(agentPresets.id, presetId)).run()
      this.hiddenTimelineSettings.delete(presetId)
    }))
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
    const state = db.select().from(agentPresetState).where(eq(agentPresetState.purpose, 'roleplay')).get()
    if (!state) throw new DesktopError(
      ELECKOI_FAILURE_CODES.statePrecondition,
      '当前没有可读取正则的 Agent 预设。',
      { what: '选择一个 Agent 预设' }
    )
    return this.readRegexRules(state.activePresetId, db)
  }

  readRegexRules(presetId: string, db: ElecKoiDatabase = this.store.db) {
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

  private transferVersions(preset: AgentPreset, readTimelineSettings: ReadHiddenToolTimelineSettings): AgentPresetTransferVersion[] {
    const { id: presetId, purpose } = preset
    const db = this.store.db
    const versions = db.select().from(agentPresetVersions).where(eq(agentPresetVersions.presetId, presetId))
      .orderBy(asc(agentPresetVersions.versionNumber), asc(agentPresetVersions.createdAtEpochMs)).all()
    if (!versions.length) return []
    const contentsByVersion = Map.groupBy(db.select().from(agentPresetVersionContents)
      .where(eq(agentPresetVersionContents.presetId, presetId)).all(), row => row.versionId)
    const entriesByVersion = Map.groupBy(db.select().from(agentPresetVersionEntries)
      .where(eq(agentPresetVersionEntries.presetId, presetId)).orderBy(asc(agentPresetVersionEntries.sortIndex)).all(), row => row.versionId)
    const groupsByVersion = Map.groupBy(db.select().from(agentPresetVersionGroups)
      .where(eq(agentPresetVersionGroups.presetId, presetId)).orderBy(asc(agentPresetVersionGroups.sortIndex)).all(), row => row.versionId)
    return versions.map((version) => {
      const { versionId } = version
      const contents = new Map(contentsByVersion.get(versionId)?.map(row => [row.kind, row.content]))
      const toolConfiguration = this.readToolConfiguration(contents.get(CONTENT_TOOL_CONFIGURATION))
      const prompts = readStoredPrompts(readTimelineSettings, presetId, versionId,
        (entriesByVersion.get(versionId) ?? []).map(item => readStoredPresetEntry(item.payloadJson)),
        parseList(contents.get(CONTENT_PROMPT_POSITIONS) ?? '[]', currentPromptPositionSchema, '预设版本提示词位置'),
        purpose
      )
      return {
        id: versionId,
        number: version.versionNumber,
        name: version.name,
        createdAtEpochMs: version.createdAtEpochMs,
        usageInstructions: contents.get(CONTENT_USAGE_INSTRUCTIONS) ?? '',
        timeline: parseList(contents.get(CONTENT_TIMELINE) ?? '[]', agentPresetTimelineItemSchema, '预设版本更新时间线'),
        entries: prompts.entries.map(storedPresetEntry),
        groups: (groupsByVersion.get(versionId) ?? [])
          .map(item => settingLibraryGroupSchema.parse(parseObject(item.payloadJson, '预设版本提示词分组'))),
        promptPositions: prompts.promptPositions,
        toolGroups: withRoleplayReplyGroup(toolConfiguration.toolGroups, purpose),
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
    toolGroups: withRoleplayReplyGroup([...agentToolGroups(enabledIds).map((group) => ({
      ...group,
      included: includedIds.has(group.id),
      enabled: includedIds.has(group.id) && enabledIds.has(group.id)
    })), ...portablePluginToolGroups(content.toolGroups)], purpose),
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
  const { basicToolGroups: _runtimeReaders, ...storedInput } = input
  const validGroupIds = new Set(input.groups.map((group) => group.id))
  const validToolIds = new Set(AGENT_TOOL_GROUPS.map((group) => group.id))
  const prompts = normalizeAgentPresetPrompts(input.entries, input.promptPositions, input.purpose)
  return agentPresetSchema.parse({
    ...storedInput,
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
    toolGroups: withRoleplayReplyGroup(input.toolGroups.map(group => validToolIds.has(group.id) ? group : pluginToolGroupSchema.parse(group)).map(({ available: _available, ...group }) => ({
      ...group,
      included: group.included
    })), input.purpose),
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
    toolGroups: withRoleplayReplyGroup(purpose === 'creator' ? agentToolGroups(CREATOR_AGENT_TOOL_GROUP_IDS) : agentToolGroups(), purpose),
    roleplayPlan: defaultRoleplayPlanSettings(),
    regexRules: [],
    expandedGroupIds: []
  })
}

function contentRows(preset: AgentPreset): Array<[string, string]> {
  return [
    [CONTENT_USAGE_INSTRUCTIONS, preset.profile.usageInstructions],
    [CONTENT_TIMELINE, JSON.stringify(preset.profile.timeline)],
    [CONTENT_PROMPT_POSITIONS, JSON.stringify(preset.promptPositions.filter(position => !isHiddenToolTimelinePosition(position)))],
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

function storedPresetEntry(entry: SettingLibraryEntry): SettingLibraryEntry {
  return isHiddenToolTimelineEntry(entry) ? { ...entry, content: '' } : entry
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
