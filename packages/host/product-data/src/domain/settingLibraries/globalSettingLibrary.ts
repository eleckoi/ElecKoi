import { GLOBAL_SETTING_LIBRARY_ID, GLOBAL_SETTING_RUNTIME_PREFIX } from '@shared/contracts/settingLibrary/scope'
import type { SettingLibrary } from '@shared/contracts/settingLibrary/schemas'
import type { AgentSettingLibraryRuntimeContext } from '@shared/contracts/agent/runtime'

export const BOUND_SETTING_RUNTIME_PREFIX = 'bound-setting:'
export type BoundSettingSelection = { characterId: string; conversationId: string; worldbookKeys?: string[] }

/** Stable scoped identities allow the existing Agent and per-chat overlay to handle global entries. */
export function selectBoundSettingLibrary(library: SettingLibrary, global: SettingLibrary, context: BoundSettingSelection): SettingLibrary {
  const groups = new Map(library.groups.map(group => [group.id, group]))
  const bookGroup = (id: string): string | undefined => {
    const group = groups.get(id)
    if (!group) return undefined
    if (group.sillyTavern?.worldbook === true) return group.id
    return group.parentId ? bookGroup(group.parentId) : undefined
  }
  const selected = (folder?: string) => {
    const key = folder ? `folder:${folder}` : `native:${library.characterId}`
    const binding = global.worldbookBindings?.[key]
    if (binding?.deleted) return false
    if (context.worldbookKeys?.includes(key)) return true
    if (!binding) return !folder && (library.characterId === GLOBAL_SETTING_LIBRARY_ID || library.characterId === context.characterId)
    return !binding.deleted && (binding.global || binding.characterIds.includes(context.characterId) || binding.conversationIds.includes(context.conversationId))
  }
  return { ...library, entries: library.entries.filter(entry => entry.kind !== 'normal' || selected(bookGroup(entry.groupId))),
    groups: library.groups.filter(group => selected(bookGroup(group.id))) }
}

export function globalSettingRuntimeContext(library: SettingLibrary, context?: BoundSettingSelection): AgentSettingLibraryRuntimeContext | undefined {
  if (context) library = selectBoundSettingLibrary(library, library, context)
  if (!library.entries.length) return undefined
  return scopedSettingRuntimeContext(library, GLOBAL_SETTING_RUNTIME_PREFIX, GLOBAL_SETTING_LIBRARY_ID)
}

export function boundSettingRuntimeContext(library: SettingLibrary): AgentSettingLibraryRuntimeContext {
  return scopedSettingRuntimeContext({ ...library, entries: library.entries.filter(entry => entry.kind === 'normal') }, `${BOUND_SETTING_RUNTIME_PREFIX}${encodeURIComponent(library.characterId)}:`, library.characterId)
}

function scopedSettingRuntimeContext(library: SettingLibrary, prefix: string, characterId: string): AgentSettingLibraryRuntimeContext {
  const id = (value: string) => value ? `${prefix}${value}` : ''
  return {
    characterId, name: library.name,
    entries: library.entries.map(entry => ({ ...entry, id: id(entry.id), groupId: id(entry.groupId), promptPositionId: id(entry.promptPositionId), sendGroupId: id(entry.sendGroupId || '') })),
    groups: library.groups.map(group => ({ ...group, id: id(group.id), parentId: id(group.parentId) })),
    promptPositions: library.promptPositions.map(position => ({ ...position, id: id(position.id) }))
  }
}
