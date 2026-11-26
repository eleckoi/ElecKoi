import type { ChatMessage } from '@shared/contracts/entities/chat'
import type { RegexRuleCollection, RegexRuleTarget } from '@shared/contracts/regex/schemas'
import { decorateRichDisplayReplacement } from '@shared/foundation/richMessage'
import { finalReplyText } from '@shared/foundation/finalReply'
import { rulesForSurface, transformWithRegexRules, type RegexTransformOptions } from '@shared/foundation/regex/RegexRuleProcessor'
import type { MessageDisplayCompatibility } from './MessageDisplayCompatibility'
import {
  resolveCharacterCardMacros,
  resolveCharacterCardMacrosInJson,
  type CharacterCardMacroValues
} from '@shared/foundation/characterCardMacros'

interface CachedProjection {
  messageId: string
  sourceContent: string
  variableStateJson: string
  completedAssistant: boolean
  roleplayReply: boolean
  macroScope: string
  displayContent: string
  displayVariableStateJson: string
}

export class MessageDisplayProjector {
  private readonly cache = new Map<string, CachedProjection>()
  private readonly reasoningCache = new Map<string, { messageId: string; text: string; variableStateJson: string; macroScope: string; displayText: string }>()
  private activeScope = ''

  constructor(private readonly compatibility: MessageDisplayCompatibility) {}

  retainMessages(ids: ReadonlySet<string>): void {
    for (const [key, entry] of this.cache) if (!ids.has(entry.messageId)) this.cache.delete(key)
    for (const [key, entry] of this.reasoningCache) if (!ids.has(entry.messageId)) this.reasoningCache.delete(key)
  }

  project(
    message: ChatMessage,
    collection: RegexRuleCollection,
    macroValues?: CharacterCardMacroValues,
    depth?: number
  ): ChatMessage {
    const target: RegexRuleTarget = message.role === 'user' ? 'UserInput' : 'AiOutput'
    const completedAssistant = message.role === 'assistant' && message.status !== 'streaming'
    const roleplayReply = message.roleplayReply === true
    const scope = `${message.conversationId}\u0000${collection.characterId}\u0000${collection.revision}\u0000${collection.agentPresetId}\u0000${collection.agentPresetRegexRevision}`
    if (scope !== this.activeScope) {
      this.cache.clear()
      this.reasoningCache.clear()
      this.activeScope = scope
    }
    const cacheKey = `${message.id}\u0000${target}\u0000${depth ?? ''}`
    const macroScope = macroValues
      ? `${macroValues.userName}\u0000${macroValues.characterName}`
      : ''
    const cached = this.cache.get(cacheKey)
    if (
      cached
      && cached.sourceContent === message.content
      && cached.variableStateJson === message.variableStateJson
      && cached.completedAssistant === completedAssistant
      && cached.roleplayReply === roleplayReply
      && cached.macroScope === macroScope
    ) {
      return projectedMessage(message, cached.displayContent, cached.displayVariableStateJson)
    }

    const rules = rulesForSurface(collection, target, 'Display')
    const streamingAssistant = message.role === 'assistant' && !completedAssistant
    const legacyAssistant = message.role === 'assistant' && !roleplayReply
    const opening = legacyAssistant ? message.content.indexOf('<FINAL>') : -1
    const position = { offset: opening >= 0 ? opening + '<FINAL>'.length
      : legacyAssistant && !completedAssistant ? message.content.length : 0 }
    const options: RegexTransformOptions = {
      replacementDecorator: decorateRichDisplayReplacement,
      protectDecoratedReplacements: true,
      position,
      ...(depth === undefined ? {} : { depth }),
      expandMacros: (text, escape) => {
        const source = macroValues ? resolveCharacterCardMacros(text, macroValues, escape) : text
        return this.compatibility.resolveVariableMacros(source, message.variableStateJson, escape)
      }
    }
    const transformed = streamingAssistant ? message.content : transformWithRegexRules(message.content, rules, target, options)
    const visible = legacyAssistant ? finalReplyText(transformed, {
      streaming: !completedAssistant,
      bodyStart: position.offset
    }) : transformed
    const displayVariableStateJson = macroValues
      ? resolveCharacterCardMacrosInJson(message.variableStateJson, macroValues)
      : message.variableStateJson
    const variableDisplayContent = this.compatibility.resolveVariableMacros(visible, displayVariableStateJson, undefined, roleplayReply)
    const displayContent = macroValues
      ? resolveCharacterCardMacros(variableDisplayContent, macroValues)
      : variableDisplayContent
    this.cache.set(cacheKey, {
      messageId: message.id,
      sourceContent: message.content,
      variableStateJson: message.variableStateJson,
      completedAssistant,
      roleplayReply,
      macroScope,
      displayContent,
      displayVariableStateJson
    })
    return projectedMessage(message, displayContent, displayVariableStateJson)
  }

  projectReasoning(message: ChatMessage, items: readonly { id: string; text: string }[], collection: RegexRuleCollection,
    macroValues?: CharacterCardMacroValues, depth?: number): { id: string; sourceText: string; displayText: string }[] {
    const rules = rulesForSurface(collection, 'Reasoning', 'Display')
    const macroScope = macroValues ? `${macroValues.userName}\u0000${macroValues.characterName}` : ''
    return items.map(item => {
      const key = `${message.id}\u0000${item.id}\u0000${depth ?? ''}`
      const cached = this.reasoningCache.get(key)
      if (cached?.text === item.text && cached.variableStateJson === message.variableStateJson && cached.macroScope === macroScope) {
        return { id: item.id, sourceText: item.text, displayText: cached.displayText }
      }
      const displayText = transformWithRegexRules(item.text, rules, 'Reasoning', {
        ...(depth === undefined ? {} : { depth }),
        expandMacros: (text, escape) => {
          const expanded = macroValues ? resolveCharacterCardMacros(text, macroValues, escape) : text
          return this.compatibility.resolveVariableMacros(expanded, message.variableStateJson, escape)
        },
      })
      this.reasoningCache.set(key, { messageId: message.id, text: item.text, variableStateJson: message.variableStateJson, macroScope, displayText })
      return { id: item.id, sourceText: item.text, displayText }
    })
  }
}

function projectedMessage(
  message: ChatMessage,
  displayContent: string,
  variableStateJson: string
): ChatMessage {
  if (displayContent === message.content && variableStateJson === message.variableStateJson) return message
  return {
    ...message,
    ...(displayContent === message.content ? {} : { displayContent }),
    variableStateJson
  }
}
