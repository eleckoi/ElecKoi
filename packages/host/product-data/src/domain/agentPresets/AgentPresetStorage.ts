import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { autoIllustrationSchema } from '@shared/contracts/presets/autoIllustration'
import { pluginToolGroupSchema } from '@shared/contracts/agent/tools'
import { roleplayPlanSettingsSchema } from '@shared/contracts/presets/roleplayPlan'
import type { AgentPresetPurpose } from '@shared/contracts/presets/schemas'
import { HIDDEN_TOOL_TIMELINE_ENTRY_ID, HIDDEN_TOOL_TIMELINE_PROMPT_POSITION_ID, isHiddenToolTimelineEntry, normalizeAgentPresetPrompts } from '@shared/contracts/presets/builtIns'
import { settingLibraryStoredEntrySchema } from '@shared/contracts/settingLibrary/schemas'
import type { SettingLibraryEntry, SettingLibraryPromptPosition } from '@shared/contracts/settingLibrary/schemas'
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes'
import { DesktopError } from '@shared/foundation/DesktopError'
import type { ElecKoiDatabase } from '@product-data/storage/sqlite/SqliteDatabase'
import { agentPresetEntries, agentPresetVersionEntries } from '@product-data/storage/sqlite/schema/common'
import { isHiddenToolTimelinePosition, type ReadHiddenToolTimelineSettings } from './HiddenToolTimelineSettings'

export const TOOL_CONFIGURATION_VERSION = 6
export const toolConfigurationSchema = z.object({
  version: z.literal(TOOL_CONFIGURATION_VERSION),
  includedGroupIds: z.array(z.string()),
  enabledGroupIds: z.array(z.string()),
  pluginToolGroups: z.array(pluginToolGroupSchema).default([]),
  roleplayPlan: roleplayPlanSettingsSchema,
  subagentModelSelection: z.object({ configId: z.string(), model: z.string() }).default({ configId: '', model: '' }),
  toolModelConfigIds: z.record(z.string(), z.string()).default({}),
  autoIllustration: autoIllustrationSchema.default({ enabled: false, modelConfigId: '' })
})

const defaultTimelineSettings = { enabled: true, position: 'insert_point_5', promptPositionId: HIDDEN_TOOL_TIMELINE_PROMPT_POSITION_ID } as const

export function readStoredPrompts(readSettings: ReadHiddenToolTimelineSettings, id: string, versionId: string, entries: SettingLibraryEntry[], positions: SettingLibraryPromptPosition[], purpose: AgentPresetPurpose) {
  if (purpose === 'creator') return normalizeAgentPresetPrompts(entries, positions, purpose)
  const settings = readSettings(id, versionId)
  const entrySettings = settings?.entry ?? defaultTimelineSettings
  return normalizeAgentPresetPrompts(
    entries.map(entry => isHiddenToolTimelineEntry(entry) ? { ...entry, ...entrySettings } : entry),
    [...positions.filter(position => !isHiddenToolTimelinePosition(position)), ...(settings ? [settings.slot] : [])],
    purpose
  )
}


export function readStoredPresetEntry(payload: string): SettingLibraryEntry {
  const entry = parseObject(payload, '预设提示词')
  return settingLibraryStoredEntrySchema.parse(entry.id === HIDDEN_TOOL_TIMELINE_ENTRY_ID || entry.kind === 'hidden_tool_timeline'
    ? { ...entry, ...defaultTimelineSettings, content: '' }
    : entry)
}

export function databasePresetEntry(entry: SettingLibraryEntry) {
  if (!isHiddenToolTimelineEntry(entry)) return entry
  const { content, enabled, position, promptPositionId, ...metadata } = entry
  return metadata
}

export function replaceEntries(db: ElecKoiDatabase, presetId: string, entries: SettingLibraryEntry[]): void {
  db.delete(agentPresetEntries).where(eq(agentPresetEntries.presetId, presetId)).run()
  if (entries.length) {
    const insert = db.insert(agentPresetEntries).values({
      presetId,
      entryId: sql.placeholder('entryId'),
      sortIndex: sql.placeholder('sortIndex'),
      payloadJson: sql.placeholder('payloadJson')
    }).prepare()
    entries.forEach((entry, sortIndex) => insert.run({ entryId: entry.id, sortIndex, payloadJson: JSON.stringify(databasePresetEntry(entry)) }))
  }
}


export function replaceVersionEntries(db: ElecKoiDatabase, presetId: string, versionId: string, entries: SettingLibraryEntry[]): void {
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
    entries.forEach((entry, sortIndex) => insert.run({ entryId: entry.id, sortIndex, payloadJson: JSON.stringify(databasePresetEntry(entry)) }))
  }
}


export function parseObject(raw: string, label: string): Record<string, unknown> {
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

export function parseList<T>(raw: string, schema: { parse(value: unknown): T }, label: string): T[] {
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
