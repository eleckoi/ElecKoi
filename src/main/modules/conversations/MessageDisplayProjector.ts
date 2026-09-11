import type { ChatMessage } from '@shared/contracts/entities/chat'
import type { RegexRuleCollection, RegexRuleTarget } from '@shared/contracts/regex/schemas'
import { decorateRichDisplayReplacement } from '@shared/foundation/richMessage'
import { rulesForSurface, transformWithRegexRules } from '@shared/foundation/regex/RegexRuleProcessor'
import type { MessageDisplayCompatibility } from './MessageDisplayCompatibility'
import {
  resolveCharacterCardMacros,
  type CharacterCardMacroValues
} from '@shared/foundation/characterCardMacros'

interface CachedProjection {
  sourceContent: string
  variableStateJson: string
  completedAssistant: boolean
  macroScope: string
  displayContent: string
}

export class MessageDisplayProjector {
  private readonly cache = new Map<string, CachedProjection>()
  private activeScope = ''

  constructor(private readonly compatibility: MessageDisplayCompatibility) {}

  project(
    message: ChatMessage,
    collection: RegexRuleCollection,
    macroValues?: CharacterCardMacroValues
  ): ChatMessage {
    const target: RegexRuleTarget = message.role === 'user' ? 'UserInput' : 'AiOutput'
    const completedAssistant = message.role === 'assistant' && message.status !== 'streaming'
    const scope = `${message.conversationId}\u0000${collection.characterId}\u0000${collection.revision}`
    if (scope !== this.activeScope) {
      this.cache.clear()
      this.activeScope = scope
    }
    const cacheKey = `${message.id}\u0000${target}`
    const macroScope = macroValues
      ? `${macroValues.userName}\u0000${macroValues.characterName}`
      : ''
    const cached = this.cache.get(cacheKey)
    if (
      cached
      && cached.sourceContent === message.content
      && cached.variableStateJson === message.variableStateJson
      && cached.completedAssistant === completedAssistant
      && cached.macroScope === macroScope
    ) {
      return cached.displayContent === message.content ? message : { ...message, displayContent: cached.displayContent }
    }

    const rules = rulesForSurface(collection, target, 'Display')
    const prepared = message.role === 'assistant'
      ? this.compatibility.prepareAssistantText(
        message.content,
        completedAssistant,
        rules.map((rule) => rule.pattern)
      )
      : message.content
    const transformed = transformWithRegexRules(prepared, rules, target, {
      replacementDecorator: decorateRichDisplayReplacement,
      protectDecoratedReplacements: true
    })
    const variableDisplayContent = this.compatibility.resolveVariableMacros(transformed, message.variableStateJson)
    const displayContent = macroValues
      ? resolveCharacterCardMacros(variableDisplayContent, macroValues)
      : variableDisplayContent
    this.cache.set(cacheKey, {
      sourceContent: message.content,
      variableStateJson: message.variableStateJson,
      completedAssistant,
      macroScope,
      displayContent
    })
    return displayContent === message.content ? message : { ...message, displayContent }
  }
}
