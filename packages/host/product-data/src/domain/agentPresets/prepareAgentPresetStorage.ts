import { dirname } from 'node:path'
import { and, asc, eq } from 'drizzle-orm'
import { DEFAULT_AGENT_PRESET_IDS, agentPresetPurposeSchema } from '@shared/contracts/presets/schemas'
import { defaultCreatorPresetEntries, normalizeAgentPresetPrompts } from '@shared/contracts/presets/builtIns'
import { settingLibraryPromptPositionSchema } from '@shared/contracts/settingLibrary/schemas'
import type { ElecKoiSqliteStore } from '@product-data/storage/sqlite/SqliteDatabase'
import { agentPresets, agentPresetVersions, agentPresetState, agentPresetEntries, agentPresetVersionEntries, agentPresetContents, agentPresetVersionContents } from '@product-data/storage/sqlite/schema/common'
import { prepareHiddenToolTimelineFiles } from '@product-data/storage/sqlite/migrations/hiddenToolTimelineFiles'
import { defaultPresetContents, upgradeDefaultCreatorPreset } from './defaultCreatorPresetUpgrade'
import { upgradeAutoIllustrationConfiguration } from './autoIllustrationUpgrade'
import { HiddenToolTimelineSettingsFile, hiddenToolTimelineSettings, isHiddenToolTimelinePosition, type HiddenToolTimelineSettingsRecords, type ReadHiddenToolTimelineSettings } from './HiddenToolTimelineSettings'
import { databasePresetEntry, parseList, readStoredPresetEntry, readStoredPrompts, replaceEntries, replaceVersionEntries, toolConfigurationSchema } from './AgentPresetStorage'

const CONTENT_PROMPT_POSITIONS = 'prompt_positions'
const CONTENT_TOOL_CONFIGURATION = 'tool_configuration'
const DEFAULT_AGENT_PRESET_VERSION_ID = 'agent-preset-standard-v1'

export function prepareAgentPresetStorage(store: ElecKoiSqliteStore): void {
  const snapshot = prepareHiddenToolTimelineFiles(store.native)
  const settings = new HiddenToolTimelineSettingsFile(dirname(store.native.name), store)
  const readTimelineSettings = seedDefaultPresets(settings, snapshot)
  // RETIRE WHEN: all supported installations/backups carry the completed
  // default-Creator replacement and the former default roleplay name is retired.
  store.withWriteTx(db => {
    db.update(agentPresets).set({ name: '默认扮演预设' }).where(and(
      eq(agentPresets.id, DEFAULT_AGENT_PRESET_IDS.roleplay), eq(agentPresets.name, '默认 Agent 预设')
    )).run()
    upgradeDefaultCreatorPreset(store.native)
  })
  upgradeIllustrationConfiguration(store)
  ensureRequiredEntries(store, readTimelineSettings)
}

function seedDefaultPresets(settings: HiddenToolTimelineSettingsFile, snapshot: HiddenToolTimelineSettingsRecords | undefined): ReadHiddenToolTimelineSettings {
  return settings.transaction((db) => {
    for (const purpose of ['roleplay', 'creator'] as const) {
      const id = DEFAULT_AGENT_PRESET_IDS[purpose]
      const versionId = purpose === 'roleplay' ? DEFAULT_AGENT_PRESET_VERSION_ID : `${id}-v1`
      const name = purpose === 'roleplay' ? '默认扮演预设' : '默认创作预设'
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
      for (const [kind, content] of defaultPresetContents(purpose)) {
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
      if (missing && purpose === 'roleplay') {
        const prompts = normalizeAgentPresetPrompts([], [], purpose)
        settings.set(id, '', hiddenToolTimelineSettings(prompts.entries, prompts.promptPositions))
        settings.set(id, versionId, hiddenToolTimelineSettings(prompts.entries, prompts.promptPositions))
        replaceEntries(db, id, prompts.entries)
        replaceVersionEntries(db, id, versionId, prompts.entries)
      }
      db.insert(agentPresetState).values({ purpose, activePresetId: id }).onConflictDoNothing().run()
    }
    return settings.reader()
  }, snapshot)
}

// RETIRE WHEN: all supported stored presets and versions use configuration v6.
// Remove this startup conversion together with the v4/v5 import conversion.
function upgradeIllustrationConfiguration(store: ElecKoiSqliteStore): void {
  store.withWriteTx(db => {
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

// RETIRE WHEN: all supported stored presets, saved versions and restored backups
// already contain the current required entries and positions and no longer contain
// creator prompts in the former default placement.
// Remove this startup scan, its call and startup-only regressions; keep current
// normalization on reads, saves and imports and keep the shared prompt file.
function ensureRequiredEntries(store: ElecKoiSqliteStore, readTimelineSettings: ReadHiddenToolTimelineSettings): void {
  const presets = store.db.select({ id: agentPresets.id, purpose: agentPresets.purpose }).from(agentPresets).all()
  store.withWriteTx((db) => {
    for (const preset of presets) {
      const purpose = agentPresetPurposeSchema.parse(preset.purpose)
      const entries = db.select().from(agentPresetEntries).where(eq(agentPresetEntries.presetId, preset.id))
        .orderBy(asc(agentPresetEntries.sortIndex)).all()
        .map(item => readStoredPresetEntry(item.payloadJson))
      const contents = db.select().from(agentPresetContents).where(and(
        eq(agentPresetContents.presetId, preset.id),
        eq(agentPresetContents.kind, CONTENT_PROMPT_POSITIONS)
      )).get()
      const positions = parseList(contents?.content ?? '[]', settingLibraryPromptPositionSchema, '预设提示词位置')
      const normalized = readStoredPrompts(readTimelineSettings, preset.id, '', entries, positions, purpose)
      if (JSON.stringify(normalized.entries.map(databasePresetEntry)) !== JSON.stringify(entries.map(databasePresetEntry))) {
        replaceEntries(db, preset.id, normalized.entries)
      }
      const storedPositions = normalized.promptPositions.filter(position => !isHiddenToolTimelinePosition(position))
      if (JSON.stringify(storedPositions) !== JSON.stringify(positions)) {
        db.insert(agentPresetContents).values({
          presetId: preset.id,
          kind: CONTENT_PROMPT_POSITIONS,
          content: JSON.stringify(storedPositions)
        }).onConflictDoUpdate({
          target: [agentPresetContents.presetId, agentPresetContents.kind],
          set: { content: JSON.stringify(storedPositions) }
        }).run()
      }

      const versions = db.select({ versionId: agentPresetVersions.versionId }).from(agentPresetVersions)
        .where(eq(agentPresetVersions.presetId, preset.id)).all()
      for (const version of versions) {
        const versionEntries = db.select().from(agentPresetVersionEntries).where(and(
          eq(agentPresetVersionEntries.presetId, preset.id),
          eq(agentPresetVersionEntries.versionId, version.versionId)
        )).orderBy(asc(agentPresetVersionEntries.sortIndex)).all()
          .map(item => readStoredPresetEntry(item.payloadJson))
        const versionContent = db.select().from(agentPresetVersionContents).where(and(
          eq(agentPresetVersionContents.presetId, preset.id),
          eq(agentPresetVersionContents.versionId, version.versionId),
          eq(agentPresetVersionContents.kind, CONTENT_PROMPT_POSITIONS)
        )).get()
        const versionPositions = parseList(versionContent?.content ?? '[]', settingLibraryPromptPositionSchema, '预设版本提示词位置')
        const normalizedVersion = readStoredPrompts(readTimelineSettings, preset.id, version.versionId, versionEntries, versionPositions, purpose)
        if (JSON.stringify(normalizedVersion.entries.map(databasePresetEntry)) !== JSON.stringify(versionEntries.map(databasePresetEntry))) {
          replaceVersionEntries(db, preset.id, version.versionId, normalizedVersion.entries)
        }
        const storedVersionPositions = normalizedVersion.promptPositions.filter(position => !isHiddenToolTimelinePosition(position))
        if (JSON.stringify(storedVersionPositions) !== JSON.stringify(versionPositions)) {
          db.insert(agentPresetVersionContents).values({
            presetId: preset.id,
            versionId: version.versionId,
            kind: CONTENT_PROMPT_POSITIONS,
            content: JSON.stringify(storedVersionPositions)
          }).onConflictDoUpdate({
            target: [agentPresetVersionContents.presetId, agentPresetVersionContents.versionId, agentPresetVersionContents.kind],
            set: { content: JSON.stringify(storedVersionPositions) }
          }).run()
        }
      }
    }
  })
}
