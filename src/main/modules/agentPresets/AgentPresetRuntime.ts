import { createHash } from 'node:crypto'
import { ALWAYS_DISABLED_AGENT_TOOL_GROUP_IDS } from '@main/modules/agentTools'
import type { AgentSettingLibraryRuntimeContext } from '@shared/contracts/agent/runtime'
import { isHistoryCompactionEntry, presetHistoryCompactionInstructions } from '@shared/contracts/presets/builtIns'
import type { AgentPreset } from '@shared/contracts/presets/schemas'

export function projectAgentPresetRuntimeContext(
  preset: AgentPreset
): AgentSettingLibraryRuntimeContext | undefined {
  if (!preset.entries.length) return undefined
  const namespace = `agent-preset:${preset.id}:`
  const groupId = (id: string) => `${namespace}${id || 'ungrouped'}`
  const promptPositionId = (id: string) => `${namespace}${id || 'position'}`
  return {
    characterId: namespace,
    name: preset.name,
    groups: preset.groups.map((group, index) => ({
      ...group,
      id: groupId(group.id),
      parentId: group.parentId ? groupId(group.parentId) : '',
      order: index + 1
    })),
    entries: preset.entries.filter((entry) => !isHistoryCompactionEntry(entry)).map((entry) => ({
      ...entry,
      id: `${namespace}${entry.id}`,
      groupId: entry.groupId ? groupId(entry.groupId) : '',
      promptPositionId: entry.promptPositionId ? promptPositionId(entry.promptPositionId) : ''
    })),
    promptPositions: preset.promptPositions.map((position, index) => ({
      ...position,
      id: promptPositionId(position.id),
      order: index + 1
    }))
  }
}

export function disabledAgentPresetToolGroupIds(preset: AgentPreset): string[] {
  const disabled = preset.toolGroups.filter((group) => !group.enabled).map((group) => group.id)
  return [...new Set([...disabled, ...ALWAYS_DISABLED_AGENT_TOOL_GROUP_IDS])]
}

export function projectAgentPresetRuntimeSelection(preset: AgentPreset): {
  id: string
  versionId: string
  name: string
  roleplayPlan: AgentPreset['roleplayPlan']
  historyCompactionInstructions?: string
} {
  const revision = createHash('sha256').update(JSON.stringify({
    activeVersionId: preset.activeVersionId,
    profile: preset.profile,
    entries: preset.entries,
    groups: preset.groups,
    promptPositions: preset.promptPositions,
    toolGroups: preset.toolGroups,
    subagentModelSelection: preset.subagentModelSelection,
    roleplayPlan: preset.roleplayPlan,
    regexRules: preset.regexRules
  })).digest('hex').slice(0, 12)
  const historyCompactionInstructions = presetHistoryCompactionInstructions(preset.entries)
  return {
    id: preset.id,
    versionId: `${preset.activeVersionId}-${revision}`,
    name: preset.name,
    roleplayPlan: preset.roleplayPlan,
    ...(historyCompactionInstructions ? { historyCompactionInstructions } : {})
  }
}

export function mergeAgentPresetAndCharacterLibraries(
  preset: AgentSettingLibraryRuntimeContext | undefined,
  character: AgentSettingLibraryRuntimeContext | undefined
): AgentSettingLibraryRuntimeContext | undefined {
  if (!preset) return character
  if (!character) return preset
  return {
    characterId: character.characterId,
    name: character.name,
    entries: [...preset.entries, ...character.entries],
    groups: [...preset.groups, ...character.groups],
    promptPositions: [...preset.promptPositions, ...character.promptPositions]
  }
}
