import { z } from 'zod'
import { settingLibraryEntrySchema, settingLibraryGroupSchema, settingLibraryPromptPositionSchema } from './schemas'

/** Shared resources have their own identity and never participate in character versions. */
export const globalSettingLibrarySchema = z.object({
  id: z.string().min(1), name: z.string().trim().min(1), enabled: z.boolean(),
  entries: z.array(settingLibraryEntrySchema.refine(entry => entry.kind === 'normal'
    && entry.openingMessages.length === 0 && entry.defaultOpeningMessageId === '', '全局设定库只包含普通设定，不包含角色开场白。')),
  groups: z.array(settingLibraryGroupSchema), promptPositions: z.array(settingLibraryPromptPositionSchema),
  listAllExpanded: z.boolean(), expandedGroupIds: z.array(z.string()),
  createdAt: z.string(), updatedAt: z.string()
}).strict()

export const globalSettingLibraryCollectionSchema = z.object({
  revision: z.number().int().min(0), libraries: z.array(globalSettingLibrarySchema)
}).strict()
export type GlobalSettingLibrary = z.output<typeof globalSettingLibrarySchema>
export type GlobalSettingLibraryCollection = z.output<typeof globalSettingLibraryCollectionSchema>

// Explicit, reversible identity; names and array order are never used to identify a source.
export function globalSettingRuntimeId(libraryId: string, kind: 'entry' | 'group' | 'position' | 'root', id = ''): string {
  return `global-setting:${JSON.stringify([libraryId, kind, id])}`
}
export function isGlobalSettingRuntimeId(id: string): boolean {
  if (!id.startsWith('global-setting:')) return false
  try {
    const parts = JSON.parse(id.slice('global-setting:'.length))
    return Array.isArray(parts) && parts.length === 3 && parts.every(part => typeof part === 'string')
      && typeof parts[1] === 'string' && ['entry', 'group', 'position', 'root'].includes(parts[1])
  } catch { return false }
}
