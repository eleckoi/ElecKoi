import { join } from 'node:path'
import { z } from 'zod'
import { HIDDEN_TOOL_TIMELINE_PROMPT_POSITION_ID, isHiddenToolTimelineEntry } from '@shared/contracts/presets/builtIns'
import { settingLibraryEntrySchema, settingLibraryPromptPositionSchema } from '@shared/contracts/settingLibrary/schemas'
import type { SettingLibraryEntry, SettingLibraryPromptPosition } from '@shared/contracts/settingLibrary/schemas'
import type { ElecKoiDatabase, ElecKoiSqliteStore } from '@product-data/storage/sqlite/SqliteDatabase'
import { readOptionalPromptFile, replacePromptFile } from '../../HiddenToolTimelineFile'

const entrySettings = settingLibraryEntrySchema.pick({ enabled: true, position: true, promptPositionId: true })
const settingsSchema = z.object({
  entry: entrySettings,
  slot: settingLibraryPromptPositionSchema
})
const recordsSchema = z.record(z.string(), z.record(z.string(), settingsSchema))
export const hiddenTimelineSettingsSchema = z.object({ records: recordsSchema, migrationPending: z.literal(true).optional() })
export const hiddenTimelineSettingsPath = (directory: string) => join(directory, 'hidden-tool-timeline-settings.json')

export type HiddenToolTimelineSettings = z.output<typeof settingsSchema>
export type HiddenToolTimelineSettingsRecords = z.output<typeof recordsSchema>
export type ReadHiddenToolTimelineSettings = (id: string, versionId: string) => HiddenToolTimelineSettings | undefined

export const isHiddenToolTimelinePosition = (position: SettingLibraryPromptPosition) => position.id === HIDDEN_TOOL_TIMELINE_PROMPT_POSITION_ID

export function hiddenToolTimelineSettings(entries: SettingLibraryEntry[], positions: SettingLibraryPromptPosition[]): HiddenToolTimelineSettings {
  return settingsSchema.parse({ entry: entries.find(isHiddenToolTimelineEntry), slot: positions.find(isHiddenToolTimelinePosition) })
}

export class HiddenToolTimelineSettingsFile {
  private readonly path: string
  private pending: HiddenToolTimelineSettingsRecords | undefined

  constructor(directory: string, private readonly store: ElecKoiSqliteStore) {
    this.path = hiddenTimelineSettingsPath(directory)
  }

  /** Reuse the settings within one operation and load fresh settings for the next. */
  reader(): ReadHiddenToolTimelineSettings {
    let records = this.pending
    return (id, versionId) => (records ??= this.load())[id]?.[versionId]
  }

  set(id: string, versionId: string, settings: HiddenToolTimelineSettings): void {
    const pending = this.pending!
    pending[id] = { ...pending[id], [versionId]: settings }
  }

  delete(id: string): void {
    delete this.pending![id]
  }

  transaction<T>(operation: (db: ElecKoiDatabase) => T, snapshot?: HiddenToolTimelineSettingsRecords): T {
    if (this.pending) return this.store.withWriteTx(operation)
    const before = snapshot ?? this.load()
    this.pending = structuredClone(before)
    let installed = false
    try {
      return this.store.withWriteTx(db => {
        const result = operation(db)
        if (JSON.stringify(this.pending) !== JSON.stringify(before)) {
          replacePromptFile(this.path, JSON.stringify({ records: this.pending }, null, 2))
          installed = true
        }
        return result
      })
    } catch (error) {
      if (installed) {
        try { replacePromptFile(this.path, JSON.stringify({ records: before }, null, 2)) }
        catch (restoreError) { throw new AggregateError([error, restoreError], '恢复隐藏工具调用过程设置失败。') }
      }
      throw error
    } finally {
      this.pending = undefined
    }
  }

  private load(): HiddenToolTimelineSettingsRecords {
    const data = readOptionalPromptFile(this.path)
    return data === undefined ? {} : hiddenTimelineSettingsSchema.parse(JSON.parse(data)).records
  }
}
