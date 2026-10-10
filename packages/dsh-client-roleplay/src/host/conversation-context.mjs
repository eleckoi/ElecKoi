import { createSystemMessage, freezeMessage, isAgentLoopRequest } from '@deepseek-ai/dsh-llm'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { readSessionSnapshot } from './session-snapshot.mjs'
import { requiredSettingCache } from './required-setting-cache.mjs'
import { INPUT_CONTINUATIONS_PROJECTION } from './input-continuations-projection.mjs'

export const name = 'eleckoi-conversation-context'
export const projectionPlugin = 'eleckoi-request-projection'

/** Install product-owned prompt contributions for every root turn. */
export function installConversationContext(agentCtx, snapshotRoot, sourceSessionId, previews) {
  let executionStep
  const disposeStep = agentCtx.on('session/event', (session, event) => {
    if (session.id === sourceSessionId && event.type === 'step/start') executionStep = event.data
  })
  const read = () => {
    const snapshot = readSessionSnapshot(snapshotRoot, sourceSessionId)
    const conversationContext = JSON.parse(readFileSync(snapshot.contextFile, 'utf8'))
    return { ...snapshot, conversationContext }
  }
  const disposeRequestProjection = agentCtx.on('llm/stream', (options, next) => {
    if (!isAgentLoopRequest(options) || options.sessionId !== sourceSessionId) return next()
    const session = agentCtx.sessions.get(options.sessionId)
    if (!session) return next()
    const snapshot = read()
    const worldbooks = agentCtx.get?.('eleckoiWorldbookRounds', false)
    const worldbookRound = worldbooks?.current(options.sessionId)
    if (worldbookRound) snapshot.conversationContext = {
      ...snapshot.conversationContext,
      worldbookRound,
      settingLibrary: worldbooks.nativeStaticLibrary({ conversationContext: snapshot.conversationContext }, worldbookRound)
    }
    const projection = requestProjectionSnapshot(snapshot.conversationContext)
    const surface = session.deriveMessages()
    const currentUser = surface.findLast(isDirectUserMessage)
    const prompt = snapshot.conversationContext.currentPromptText
    const transform = {
      instructions: sessionInstructions(snapshot) || null,
      currentPromptText: typeof prompt === 'string' && prompt !== messageText(currentUser)
        ? prompt : null
    }
    const messages = projectRequestInput(surface, projection, transform)
    if (!executionStep) throw new Error('实际模型请求缺少 Session 步骤。')
    const inputState = agentCtx.sessionProjections.stateOf(session, INPUT_CONTINUATIONS_PROJECTION)
    if (!inputState) throw new Error('实际模型请求缺少正式用户输入投影。')
    const inputs = inputState.inputs
    const inputIndex = currentUser ? inputs.findIndex(input => input.messageId === currentUser.id) : -1
    if (currentUser && inputIndex < 0) throw new Error('实际模型请求的用户输入不在 Session 投影中。')
    previews.capture(session, { ...options, messages }, projection.plan, {
      ...executionStep, round: currentUser ? inputIndex + 1 : null
    })
    return agentCtx.llm.stream({ ...options, messages })
  })
  return () => { disposeRequestProjection(); disposeStep() }
}

/** Assemble the actual request from the official surface and this turn's active settings. */
export function projectRequestInput(surface, snapshot, transform) {
  const messages = projectRequestMessages(
    projectCurrentUserPrompt(projectProductHistory(surface, snapshot), transform), snapshot.plan
  )
  const instructions = transform.instructions
  if (instructions) {
      const systemIndex = messages.findLastIndex((message) => message?.role === 'system')
      if (systemIndex >= 0) {
        const system = messages[systemIndex]
        messages[systemIndex] = freezeMessage({
          ...system,
          content: [...system.content, { type: 'text', text: `\n\n${instructions}` }]
        })
      } else {
        const id = `eleckoi-system-${createHash('sha256').update(instructions).digest('hex')}`
        messages.unshift(freezeMessage({ ...createSystemMessage(instructions, name), id }))
      }
  }
  return messages
}

export function sessionInstructions(snapshot) {
  const additions = settingInjections(snapshot.conversationContext)
    .filter((entry) => entry.anchor === 'instructions')
    .map((entry) => entry.content)
  return [snapshot.model?.systemPrompt, ...additions]
    .filter((value) => typeof value === 'string' && value.trim())
    .join('\n\n')
}

/** Describe the active position graph for request assembly and the in-memory preview. */
export function requestProjectionPlan(context) {
  return settingInjections(context)
    .filter((entry) => entry.anchor !== 'instructions')
    .map((entry) => ({
      id: entry.id,
      anchor: entry.anchor,
      role: entry.role,
      content: entry.content,
      placementRank: entry.placementRank,
      positionOrder: entry.positionOrder,
      order: entry.order,
      traceTitle: entry.traceTitle,
      traceSource: entry.traceSource
    }))
}

/** Prepare the active settings and opening prefix without persisting a request copy. */
export function requestProjectionSnapshot(context) {
  return {
    plan: requestProjectionPlan(context),
    historyMode: context?.historyMode === 'prefix' ? 'prefix' : 'replace',
    history: (Array.isArray(context?.history) ? context.history : [])
      .flatMap((item) => isProductHistoryEntry(item)
        ? [{ role: item.role, content: item.content }]
        : [])
  }
}

/**
 * Rebuild the exact provider-facing message order for one model request.
 * Every tool continuation is assembled against the latest real user input
 * and the tool flow accumulated after it. Retired projection envelopes are
 * excluded when resuming existing Sessions.
 */
export function projectRequestMessages(messages, plan = []) {
  const visible = messages.filter((message) => !isProjectionEnvelope(message))
  if (!plan) return visible
  const system = visible.filter((message) => message?.role === 'system')
  const dialogue = visible.filter((message) => message?.role !== 'system')
  const latestUserIndex = dialogue.findLastIndex(isDirectUserMessage)
  if (latestUserIndex < 0) {
    return [
      ...system,
      ...messagesForAnchor(plan, 'insert_point_1'),
      ...messagesForAnchor(plan, 'insert_point_2'),
      ...dialogue,
      ...messagesForAnchor(plan, 'insert_point_3'),
      ...messagesForAnchor(plan, 'insert_point_4'),
      ...messagesForAnchor(plan, 'insert_point_5')
    ]
  }
  return [
    ...system,
    ...messagesForAnchor(plan, 'insert_point_1'),
    ...messagesForAnchor(plan, 'insert_point_2'),
    ...dialogue.slice(0, latestUserIndex),
    ...messagesForAnchor(plan, 'insert_point_3'),
    dialogue[latestUserIndex],
    ...messagesForAnchor(plan, 'insert_point_4'),
    ...dialogue.slice(latestUserIndex + 1),
    ...messagesForAnchor(plan, 'insert_point_5')
  ]
}

export function isProjectionEnvelope(message) {
  return message?.role === 'user'
    && message?.source?.kind === `plugin:${projectionPlugin}`
}

export function requestContextItems(messages, plan = []) {
  const projectionByMessageId = new Map(plan.map((entry) => [
    `${projectionPlugin}:${entry.id}`,
    entry
  ]))
  const latestUserIndex = messages.findLastIndex(isDirectUserMessage)
  return messages.map((message, index) => {
    const projection = projectionByMessageId.get(String(message?.id ?? ''))
    const role = message?.role === 'system' || message?.role === 'assistant' ? message.role : 'user'
    if (projection) {
      return {
        order: index + 1,
        messageId: String(message?.id ?? ''),
        role,
        kind: 'prompt',
        title: projection.traceTitle || '设定提示词',
        source: projection.traceSource || positionLabel(projection.anchor),
        anchor: projection.anchor,
        content: readableMessageContent(message)
      }
    }
    const source = message?.source && typeof message.source === 'object' ? message.source : {}
    const kind = requestContextKind(message, source)
    const directUser = source.kind === 'user'
    return {
      order: index + 1,
      messageId: String(message?.id ?? ''),
      role,
      kind,
      title: requestContextTitle(message, source, directUser && index === latestUserIndex),
      source: requestContextSource(source, directUser && index === latestUserIndex),
      anchor: '',
      content: readableMessageContent(message)
    }
  }).filter((item) => item.content)
}

function requestContextKind(message, source) {
  if (message?.role === 'system') return 'system'
  if (source.kind === 'tool' || message?.content?.some((block) => block?.type === 'tool-result')) return 'tool'
  if (source.kind === 'plugin:eleckoi-product-history') return 'history'
  if (source.kind === 'user') return 'user'
  if (message?.role === 'assistant') return 'assistant'
  return 'context'
}

function requestContextTitle(message, source, latestUser) {
  if (message?.role === 'system') return '系统提示词'
  if (source.kind === 'tool' || message?.content?.some((block) => block?.type === 'tool-result')) return '工具结果'
  if (message?.content?.some((block) => block?.type === 'tool-call')) return '助手工具调用'
  if (source.kind === 'user') return latestUser ? '用户最新输入' : '用户消息'
  if (source.kind === 'plugin:eleckoi-product-history') return message?.role === 'assistant' ? '历史助手消息' : '历史用户消息'
  if (source.kind === 'model' || message?.role === 'assistant') return '助手消息'
  return source.sections?.[0]?.name || '上下文'
}

function requestContextSource(source, latestUser) {
  if (source.kind === 'user') return latestUser ? '本轮输入' : '聊天记录'
  if (source.kind === 'tool') return source.callId ? `工具结果 · ${source.callId}` : '工具结果'
  if (source.kind === 'plugin:eleckoi-product-history') return '聊天记录'
  if (source.kind === 'model') return [source.provider, source.model].filter(Boolean).join(' · ') || '模型'
  if (source.kind?.startsWith('plugin:')) return source.kind.slice('plugin:'.length)
  return source.kind || ''
}

function readableMessageContent(message) {
  return Array.isArray(message?.content)
    ? message.content.map(readableBlock).filter(Boolean).join('\n\n')
    : ''
}

function readableBlock(block) {
  if (!block || typeof block !== 'object') return ''
  if (block.type === 'text') return String(block.text ?? '')
  if (block.type === 'reasoning') return `思考\n${String(block.text ?? '')}`
  if (block.type === 'image') {
    const attachment = block.attachment && typeof block.attachment === 'object' ? block.attachment : {}
    return `[图片] ${attachment.name || attachment.id || attachment.mediaType || '图片附件'}`
  }
  if (block.type === 'file') {
    const attachment = block.attachment && typeof block.attachment === 'object' ? block.attachment : {}
    return `[文件] ${attachment.name || attachment.id || '文件附件'}`
  }
  if (block.type === 'tool-call') {
    return `调用工具 ${String(block.name || '')}\n${prettyJsonText(block.arguments)}`.trim()
  }
  if (block.type === 'tool-result') {
    const result = Array.isArray(block.content) ? block.content.map(readableBlock).filter(Boolean).join('\n\n') : ''
    return `${block.isError ? '工具返回错误' : '工具返回结果'}${result ? `\n${result}` : ''}`
  }
  try {
    return JSON.stringify(block, null, 2)
  } catch {
    return String(block.type || '')
  }
}

function prettyJsonText(value) {
  if (typeof value !== 'string') return String(value ?? '')
  try {
    return JSON.stringify(JSON.parse(value), null, 2)
  } catch {
    return value
  }
}

function isDirectUserMessage(message) {
  return message?.role === 'user' && message?.source?.kind === 'user'
}

function messagesForAnchor(plan, anchor) {
  return plan
    .filter((entry) => entry.anchor === anchor)
    .map(projectionMessage)
}

function projectionMessage(entry) {
  return freezeMessage({
    id: `${projectionPlugin}:${entry.id}`,
    role: entry.role,
    content: [{ type: 'text', text: entry.content }],
    source: entry.role === 'assistant'
      ? { kind: 'model', provider: 'eleckoi', model: 'prompt-projection' }
      : {
          kind: `plugin:${name}`,
          form: 'snapshot',
          sections: [{ name: entry.traceTitle || entry.id || name, text: entry.content }]
        }
  })
}

/**
 * Keep prior user input and final replies, with the active turn's full flow.
 */
export function projectProductHistory(messages, context) {
  const currentUserIndex = findCurrentUserIndex(messages)
  if (currentUserIndex < 0) return messages
  const firstDialogue = messages.findIndex((message, index) => (
    index <= currentUserIndex && isDialogueMessage(message)
  ))
  const replaceFrom = firstDialogue < 0 ? currentUserIndex : firstDialogue
  const nativeHistory = messages.slice(replaceFrom, currentUserIndex)
  const productHistory = (Array.isArray(context?.history) ? context.history : [])
    .map(productHistoryMessage)
    .filter(Boolean)
  if (context?.historyMode === 'prefix') {
    const dialogueHistory = previousTurnDialogue(nativeHistory)
    const prefix = productHistory.filter((product, index) => !messagesMatch(product, dialogueHistory[index]))
    return [
      ...messages.slice(0, replaceFrom),
      ...prefix,
      ...dialogueHistory,
      ...messages.slice(currentUserIndex)
    ]
  }
  const authoritative = compactedProjection(productHistory, nativeHistory) ?? productHistory
  return [
    ...messages.slice(0, replaceFrom),
    ...authoritative,
    ...messages.slice(currentUserIndex)
  ]
}

function previousTurnDialogue(messages) {
  const history = []
  let finalReply
  const flush = () => {
    if (finalReply) history.push(finalReply)
    finalReply = undefined
  }
  for (const message of messages) {
    if (isDirectUserMessage(message) || isCompactionCheckpoint(message)) {
      flush()
      history.push(message)
    } else if (message?.role === 'assistant'
      && message?.source?.kind !== 'tool'
      && !message.content?.some(block => block?.type === 'tool-call' || block?.type === 'tool-result')) {
      const content = normalizedDialogueText(messageText(message), 'assistant')
      if (content) finalReply = freezeMessage({
        id: message.id,
        role: 'assistant',
        content: [{ type: 'text', text: content }],
        source: { kind: 'plugin:eleckoi-product-history' }
      })
    }
  }
  flush()
  return history
}

function isProductHistoryEntry(value) {
  return value && typeof value === 'object'
    && (value.role === 'user' || value.role === 'assistant')
    && typeof value.content === 'string'
    && value.content.trim().length > 0
}

/** Apply prompt transformations to the provider request while keeping the DSH user event unchanged. */
export function projectCurrentUserPrompt(messages, context) {
  const prompt = context?.currentPromptText
  if (typeof prompt !== 'string') return messages
  const index = messages.findLastIndex(isDirectUserMessage)
  if (index < 0) return messages
  const message = messages[index]
  const content = []
  let inserted = false
  for (const part of message.content ?? []) {
    if (part?.type !== 'text') {
      content.push(part)
    } else if (!inserted) {
      content.push({ type: 'text', text: prompt })
      inserted = true
    }
  }
  if (!inserted) content.unshift({ type: 'text', text: prompt })
  return messages.map((item, position) => position === index
    ? freezeMessage({ ...message, content })
    : item)
}

function productHistoryMessage(item, index) {
  if (!item || (item.role !== 'user' && item.role !== 'assistant')) return null
  const value = String(item.content ?? '')
  if (!value.trim()) return null
  return freezeMessage({
    id: `eleckoi-product-history-${index}`,
    role: item.role,
    content: [{ type: 'text', text: value }],
    source: { kind: 'plugin:eleckoi-product-history' }
  })
}

function compactedProjection(productHistory, nativeHistory) {
  const checkpointIndex = nativeHistory.findLastIndex(isCompactionCheckpoint)
  if (checkpointIndex < 0) return null
  const checkpoint = nativeHistory[checkpointIndex]
  const nativeTail = nativeHistory.slice(checkpointIndex + 1).filter(isDialogueMessage)
  if (nativeTail.length > productHistory.length) return null
  const productTail = nativeTail.length === 0 ? [] : productHistory.slice(-nativeTail.length)
  if (!productTail.every((product, index) => messagesMatch(product, nativeTail[index]))) return null
  return [checkpoint, ...productTail]
}

function findCurrentUserIndex(messages) {
  return messages.findLastIndex((message) => message?.role === 'user' && message?.source?.kind === 'user')
}

function isDialogueMessage(message) {
  return (message?.role === 'user' || message?.role === 'assistant') && message?.source?.kind !== 'tool'
}

function isCompactionCheckpoint(message) {
  return message?.role === 'user' && messageText(message).includes('<compacted-summary>')
}

function messagesMatch(left, right) {
  if (left?.role !== right?.role) return false
  return normalizedDialogueText(messageText(left), left.role) === normalizedDialogueText(messageText(right), right.role)
}

function messageText(message) {
  return Array.isArray(message?.content)
    ? message.content.filter((part) => part?.type === 'text').map((part) => String(part.text ?? '')).join('\n')
    : ''
}

function normalizedDialogueText(value, role) {
  const trimmed = value.trim()
  if (role !== 'assistant') return trimmed
  const start = trimmed.indexOf('<FINAL>')
  if (start < 0) return trimmed
  const bodyStart = start + '<FINAL>'.length
  const end = trimmed.lastIndexOf('</FINAL>')
  return trimmed.slice(bodyStart, end >= bodyStart ? end : undefined).trim()
}

/** Render a diagnostic-only text view of the current projection definition. */
export function renderRuntimeContext(context) {
  return requestProjectionPlan(context)
    .map((entry) => entry.content)
    .join('\n\n')
}

export function settingInjections(context) {
  const library = context?.settingLibrary ?? {}
  const promptPositions = new Map((library.promptPositions || []).map((position) => [position.id, position]))
  const automatic = (library.entries || [])
    .filter((entry) => entry?.enabled
      && typeof entry.content === 'string'
      && entry.content.trim()
      && entry.kind !== 'opening'
      && entry.kind !== 'history_compaction'
      && entry.triggerMode === 'always' && entry.position)
    .map((entry) => {
      const custom = promptPositions.get(entry.promptPositionId)
      const anchor = custom?.anchor || entry.position || 'insert_point_1'
      const title = String(entry.title || '').trim() || '未命名设定'
      return {
        id: String(entry.id || '').slice(0, 128),
        anchor,
        role: anchor === 'instructions' ? 'system' : entry.insertRole === 'assistant' ? 'assistant' : 'user',
        content: entry.content.slice(0, 40_000),
        placementRank: custom?.side === 'before_setting_position' ? 0 : custom?.side === 'after_setting_position' ? 2 : 1,
        positionOrder: custom?.order ?? 0,
        order: Number.isInteger(entry.order) ? entry.order : 1,
        traceTitle: entry.kind === 'hidden_tool_timeline'
            ? `预设固定条目 · ${title}`
            : String(entry.id || '').startsWith('agent-preset:')
              ? `预设条目 · ${title}`
              : `设定 · ${title}`,
        traceSource: String(custom?.name || '').trim() || positionLabel(anchor)
      }
    })
  const required = requiredSettingCache(library).map((entry, index) => ({
    id: `required-setting-${entry.reference.slice(1)}`,
    anchor: 'insert_point_1', role: 'user', content: entry.prompt,
    placementRank: 3, positionOrder: 0, order: index + 1,
    traceTitle: `Agent 必读 · ${entry.title}`, traceSource: '缓存设定区'
  }))
  return [...automatic, ...required, ...worldbookSettingInjections(context, promptPositions)]
    .sort((left, right) => anchorOrder(left.anchor) - anchorOrder(right.anchor)
      || left.placementRank - right.placementRank
      || left.positionOrder - right.positionOrder
      || left.order - right.order
      || left.id.localeCompare(right.id))
}

export function worldbookSettingInjections(context, promptPositions = new Map()) {
  const round = context?.worldbookRound
  if (!round) return []
  const entries = [...round.fragments, ...round.examples]
  if (round.authorNote?.content && round.authorNote.position !== 'none') entries.push({
    id: 'authors-note', content: round.authorNote.content, role: round.authorNote.role ?? 'system', worldbookPosition: 'at_depth'
  })
  const anchors = {
    beforeCharacterDefinition: 'insert_point_1', afterCharacterDefinition: 'insert_point_2',
    beforeExamples: 'insert_point_2', examples: 'insert_point_2', afterExamples: 'insert_point_2',
    beforeBaseInstructions: 'instructions', beforeHistory: 'insert_point_1',
    beforeLatestUserInput: 'insert_point_3', afterLatestUserInput: 'insert_point_4', afterHistory: 'insert_point_5'
  }
  return entries.filter(entry => typeof entry.content === 'string' && entry.content.trim()).map((entry, index) => {
    const native = entry.nativePlacement
    const custom = native && promptPositions.get(native.promptPositionId)
    const cache = !native && entry.worldbookPosition === 'at_depth'
    const anchor = cache ? 'insert_point_1' : native ? custom?.anchor ?? native.position : anchors[entry.anchor]
    if (!['instructions', 'insert_point_1', 'insert_point_2', 'insert_point_3', 'insert_point_4', 'insert_point_5'].includes(anchor)) {
      throw new Error(`世界书条目 ${entry.id} 缺少明确的请求位置。`)
    }
    if (!['system', 'user', 'assistant'].includes(entry.role)) throw new Error(`世界书条目 ${entry.id} 的消息角色无效。`)
    return {
      id: `worldbook:${entry.id}`, content: entry.content, role: entry.role, anchor,
      placementRank: cache ? 3 : custom?.side === 'before_setting_position' ? 0 : custom?.side === 'after_setting_position' ? 2 : 1,
      positionOrder: custom?.order ?? 0, order: Number.isInteger(entry.order) ? entry.order : index,
      traceTitle: `世界书 · ${entry.id}`, traceSource: cache ? '缓存设定区' : custom?.name || positionLabel(anchor)
    }
  })
}

function anchorOrder(anchor) {
  const index = [
    'instructions',
    'insert_point_1',
    'insert_point_2',
    'insert_point_3',
    'insert_point_4',
    'insert_point_5'
  ].indexOf(anchor)
  return index < 0 ? Number.MAX_SAFE_INTEGER : index
}

function positionLabel(anchor) {
  return ({
    instructions: '系统指令',
    insert_point_1: '设定插入点 1',
    insert_point_2: '设定插入点 2',
    insert_point_3: '设定插入点 3',
    insert_point_4: '设定插入点 4',
    insert_point_5: '设定插入点 5'
  })[anchor] || '设定位置'
}
