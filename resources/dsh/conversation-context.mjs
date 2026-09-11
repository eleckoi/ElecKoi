import { readFileSync } from 'node:fs'
import {
  LlmAdapter,
  createAssistantMessage,
  createUserMessage,
  freezeMessage
} from '@deepseek-ai/dsh-llm'

export const name = 'eleckoi-conversation-context'
export const inject = ['llm']

const publicProvider = 'eleckoi-runtime'
const upstreamProvider = 'eleckoi-upstream'

/**
 * Desktop equivalent of Android's DshRequestContextProjector. Product dialogue
 * is projected at the LLM adapter boundary, after DSH has assembled its native
 * request and before pi-ai selects a provider wire protocol.
 */
export function apply(ctx) {
  const contextFile = process.env.ELECKOI_CONVERSATION_CONTEXT_FILE
  if (!contextFile) return
  return ctx.llm.registerAdapter([publicProvider], new ElecKoiContextAdapter(ctx.llm, contextFile))
}

class ElecKoiContextAdapter extends LlmAdapter {
  constructor(llm, contextFile) {
    super()
    this.llm = llm
    this.contextFile = contextFile
  }

  providerInfo(provider) {
    assertPublicProvider(provider)
    return { id: publicProvider, name: 'ElecKoi configured provider' }
  }

  async listModels(provider) {
    assertPublicProvider(provider)
    return (await this.llm.listModels(upstreamProvider)).map(toPublicModel)
  }

  async resolveModel(provider, model, signal) {
    assertPublicProvider(provider)
    return toPublicModel(await this.llm.resolveModelInfo(upstreamProvider, model, signal))
  }

  stream(options) {
    const context = readContext(this.contextFile)
    return this.llm.stream(projectRequest(
      { ...options, provider: upstreamProvider },
      context,
      process.env.ELECKOI_HISTORY_COMPACTION_INSTRUCTIONS
    ))
  }
}

/** Mirrors Android's ReplacePreviousTurns projection for ProductDialogue. */
export function projectRequest(options, context, historyCompactionInstructions = '') {
  const messages = options.messages.map(toUpstreamMessage)
  if (options.purpose === 'compaction') {
    return projectCompactionRequest({ ...options, messages }, historyCompactionInstructions)
  }
  const currentUserIndex = findCurrentUser(messages, context.currentUserInput)
  if (currentUserIndex < 0) return withSystemContext({ ...options, messages }, context)

  const productHistory = (context.history || []).map((item) => historyMessage(item, options.model))
  const firstDialogue = messages.findIndex(isCleanDialogueMessage)
  const historyStart = firstDialogue >= 0 && firstDialogue <= currentUserIndex
    ? firstDialogue
    : currentUserIndex
  const nativeHistory = messages.slice(historyStart, currentUserIndex)
  const authoritativeHistory = compactedProjection(productHistory, nativeHistory) || productHistory
  messages.splice(historyStart, currentUserIndex - historyStart, ...authoritativeHistory)

  const injections = settingInjections(context)
  const beforeHistory = injections.filter((item) => item.anchor === 'before_history' || item.anchor === 'after_instructions')
  const beforeCurrent = injections.filter((item) => item.anchor === 'before_latest_user_input')
  const afterCurrent = injections.filter((item) =>
    item.anchor === 'after_history' ||
    item.anchor === 'after_latest_user_input' ||
    item.anchor === 'before_tool_flow')
  const afterToolFlow = injections.filter((item) => item.anchor === 'after_tool_flow')

  if (beforeHistory.length) messages.splice(historyStart, 0, ...beforeHistory.map(injectionMessage))
  let current = findCurrentUser(messages, context.currentUserInput)
  if (current >= 0 && beforeCurrent.length) {
    messages.splice(current, 0, ...beforeCurrent.map(injectionMessage))
    current += beforeCurrent.length
  }
  if (current >= 0 && afterCurrent.length) messages.splice(current + 1, 0, ...afterCurrent.map(injectionMessage))
  if (afterToolFlow.length) messages.push(...afterToolFlow.map(injectionMessage))

  return withSystemContext({ ...options, messages }, context, injections)
}

/** Mirrors Android's purpose-isolated DSH compaction request projection. */
export function projectCompactionRequest(options, instructions = '') {
  const messages = options.messages || []
  const finalMessage = messages.at(-1)
  if (finalMessage?.role !== 'user') return options
  const normalized = String(instructions || '').trim() || textParts(finalMessage).join('\n').trim()
  if (!normalized) return options
  const projected = {
    ...options,
    system: CompactionPlainTextDirective,
    messages: [
      ...messages.slice(0, -1),
      freezeMessage({
        ...finalMessage,
        content: [{ type: 'text', text: `${CompactionPlainTextDirective}\n\n${normalized}` }]
      })
    ]
  }
  delete projected.tools
  delete projected.stop
  return projected
}

function withSystemContext(options, context, injections = settingInjections(context)) {
  const additions = injections.filter((item) => item.anchor === 'instructions').map((item) => item.content)
  if (additions.length === 0) return options
  return {
    ...options,
    system: [options.system, ...additions].filter((value) => typeof value === 'string' && value.trim()).join('\n\n')
  }
}

function readContext(file) {
  try {
    const value = JSON.parse(readFileSync(file, 'utf8'))
    return value && typeof value === 'object' ? value : emptyContext()
  } catch {
    return emptyContext()
  }
}

function emptyContext() {
  return { currentUserInput: '', history: [], persona: {} }
}

function findCurrentUser(messages, expectedText) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.role !== 'user' || message.source?.kind !== 'user') continue
    if (!expectedText || textParts(message).includes(expectedText)) return index
  }
  return -1
}

function isCleanDialogueMessage(message) {
  return (message.role === 'user' || message.role === 'assistant') && message.source?.kind !== 'tool'
}

function textParts(message) {
  return (message.content || [])
    .filter((part) => part?.type === 'text')
    .map((part) => part.text)
}

function historyMessage(item, model) {
  const content = [{ type: 'text', text: String(item.content || '') }]
  if (item.role === 'assistant') {
    return createAssistantMessage({
      content,
      source: { provider: upstreamProvider, model }
    })
  }
  return createUserMessage({ content, source: { kind: 'user' } })
}

function toUpstreamMessage(message) {
  if (message.role !== 'assistant' || message.source?.provider !== publicProvider) return message
  return freezeMessage({
    ...message,
    source: { ...message.source, provider: upstreamProvider }
  })
}

function settingInjections(context) {
  const library = context.settingLibrary
  if (!library) return []
  const promptPositions = new Map((library.promptPositions || []).map((position) => [position.id, position]))
  return (library.entries || [])
    .filter((entry) =>
      entry?.enabled &&
      typeof entry.content === 'string' &&
      entry.content.trim() &&
      entry.kind !== 'opening' &&
      entry.kind !== 'history_compaction' &&
      entry.triggerMode === 'always')
    .map((entry) => {
      const custom = promptPositions.get(entry.promptPositionId)
      const anchor = custom?.anchor || entry.position || 'after_instructions'
      return {
        id: String(entry.id || '').slice(0, 128),
        anchor,
        role: anchor === 'instructions' ? 'system' : entry.insertRole === 'assistant' ? 'assistant' : 'user',
        content: entry.content.slice(0, 40_000),
        positionOrder: custom?.order ?? Number.MIN_SAFE_INTEGER,
        order: Number.isInteger(entry.order) ? entry.order : 1
      }
    })
    .sort((left, right) =>
      anchorOrder(left.anchor) - anchorOrder(right.anchor) ||
      left.positionOrder - right.positionOrder ||
      left.order - right.order ||
      left.id.localeCompare(right.id))
    .slice(0, 128)
}

function injectionMessage(injection) {
  const content = [{ type: 'text', text: injection.content }]
  if (injection.role === 'assistant') {
    return createAssistantMessage({
      content,
      source: { provider: upstreamProvider, model: process.env.DSH_MODEL || 'unknown' }
    })
  }
  return createUserMessage({
    content,
    source: { kind: 'plugin', plugin: name }
  })
}

function anchorOrder(anchor) {
  return [
    'instructions',
    'after_instructions',
    'before_history',
    'before_latest_user_input',
    'after_history',
    'after_latest_user_input',
    'before_tool_flow',
    'after_tool_flow'
  ].indexOf(anchor)
}

function compactedProjection(productHistory, nativeHistory) {
  let checkpointIndex = -1
  for (let index = nativeHistory.length - 1; index >= 0; index -= 1) {
    if (isCompactionCheckpoint(nativeHistory[index])) {
      checkpointIndex = index
      break
    }
  }
  if (checkpointIndex < 0) return null
  const checkpoint = nativeHistory[checkpointIndex]
  const nativeTail = nativeHistory.slice(checkpointIndex + 1).filter(isCleanDialogueMessage)
  if (nativeTail.length > productHistory.length) return null
  const productTail = nativeTail.length === 0 ? [] : productHistory.slice(-nativeTail.length)
  if (!productTail.every((product, index) => matchesNative(product, nativeTail[index]))) return null
  return [checkpoint, ...productTail]
}

function isCompactionCheckpoint(message) {
  return message?.role === 'user' && textParts(message).join('\n').includes('<compacted-summary>')
}

function matchesNative(product, native) {
  if (product?.role !== native?.role) return false
  const productText = normalizedDialogueText(product)
  if (product.role === 'assistant') return normalizedDialogueText(native) === productText
  const nativeParts = textParts(native)
  return nativeParts.some((part) => part.trim() === productText) || nativeParts.join('\n').trim() === productText
}

function normalizedDialogueText(message) {
  const value = textParts(message).join('\n').trim()
  if (message?.role !== 'assistant') return value
  const start = value.indexOf('<FINAL>')
  if (start < 0) return value
  const contentStart = start + '<FINAL>'.length
  const end = value.lastIndexOf('</FINAL>')
  return value.slice(contentStart, end >= contentStart ? end : undefined).trim()
}

function toPublicModel(model) {
  return { ...model, provider: publicProvider }
}

function assertPublicProvider(provider) {
  if (provider !== publicProvider) throw new Error(`ElecKoi context adapter cannot serve provider "${provider}"`)
}

const CompactionPlainTextDirective = '你当前只执行内部历史压缩。只返回非空的纯文本摘要正文；不要调用工具，不要输出推理过程，也不要使用 <FINAL>、<ACTION_CALL> 等主对话协议标签。'
