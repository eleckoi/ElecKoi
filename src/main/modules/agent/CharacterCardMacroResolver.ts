import type {
  AgentSettingLibraryRuntimeContext,
  AgentVariableRuntimeContext
} from '@shared/contracts/agent/runtime'
import {
  resolveCharacterCardMacros,
  type CharacterCardMacroValues
} from '@shared/foundation/characterCardMacros'

export function resolveVariableContextCharacterCardMacros(
  context: AgentVariableRuntimeContext | undefined,
  values: CharacterCardMacroValues | undefined
): AgentVariableRuntimeContext | undefined {
  if (!context || !values) return context
  return {
    ...context,
    objects: context.objects.map((item) => ({
      ...item,
      description: resolveCharacterCardMacros(item.description, values),
      updateRule: resolveCharacterCardMacros(item.updateRule, values)
    })),
    variables: context.variables.map((item) => ({
      ...item,
      description: resolveCharacterCardMacros(item.description, values),
      updateRule: resolveCharacterCardMacros(item.updateRule, values)
    }))
  }
}

export function resolveSettingLibraryCharacterCardMacros(
  context: AgentSettingLibraryRuntimeContext | undefined,
  values: CharacterCardMacroValues | undefined
): AgentSettingLibraryRuntimeContext | undefined {
  if (!context || !values) return context
  return {
    ...context,
    entries: context.entries.map((entry) => ({
      ...entry,
      content: resolveCharacterCardMacros(entry.content, values),
      agentSelectionHint: resolveCharacterCardMacros(entry.agentSelectionHint, values),
      openingMessages: entry.openingMessages.map((opening) => ({
        ...opening,
        content: resolveCharacterCardMacros(opening.content, values)
      }))
    }))
  }
}
