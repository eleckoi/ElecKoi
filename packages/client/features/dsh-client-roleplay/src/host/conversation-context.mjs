import { hasRegexEjsOutput } from '@eleckoi/dsh-product-data/regex'
import { renderRequestEjs } from './regex-ejs.mjs'
import { createSystemMessage, freezeMessage } from '@deepseek-ai/dsh-llm'
import { transformAiReplyPrompt, transformReasoningPrompt } from '@eleckoi/dsh-product-data'
import { createHash } from 'node:crypto'
import { readSessionSnapshot } from './session-snapshot.mjs'
import { requiredSettingCache } from './required-setting-cache.mjs'
import { resolvePlacedSettingTemplates } from './setting-library-tools.mjs'
import { INPUT_CONTINUATIONS_PROJECTION } from './input-continuations-projection.mjs'
import { delegatedRoleplayReplyBlocks, isDelegatedRoleplayReply, productFailure, ELECKOI_FAILURE_CODES, roleplayReplyMessages } from '@eleckoi/dsh-product-api'
import { DELEGATED_REPLY_NOTICE, roleplayReplyEnabled } from './roleplay-reply-tool.mjs'

export const name = 'eleckoi-conversation-context'
export const projectionPlugin = 'eleckoi-request-projection'

/** Install product-owned prompt contributions for every root turn. */
export function installConversationContext(agent, snapshotRoot, previews, runtimeContexts = agent.ctx.eleckoiRuntimeContexts, readHistory) {
  const { ctx: agentCtx, id: sourceSessionId, session } = agent
  let placedSource, placedContext
  let historyTurn, historyReplies
  const read = () => {
    const snapshot = readSessionSnapshot(snapshotRoot, sourceSessionId)
    const conversationContext = runtimeContexts.get(sourceSessionId).conversationContext
    return { ...snapshot, conversationContext, variablesEnabled: runtimeContexts.readVariables(sourceSessionId).enabled }
  }
  const placedSettings = context => {
    if (context !== placedSource) {
      const turn = runtimeContexts.get(sourceSessionId)
      placedContext = resolvePlacedSettingTemplates(context, turn.settings?.history, turn.variables?.state, agentCtx)
      placedSource = context
    }
    return placedContext
  }
  // Contribute before the official loop records system/message, so trajectory
  // and dispatch share the same prompt and changes use native prompt versioning.
  const disposeInstructions = agentCtx.on('system-prompt/assemble', async (_assembly, context, next) => {
    const assembly = await next()
    if (context.agent?.id !== sourceSessionId) return assembly
    const preview = context.eleckoiConversationSnapshot
    const snapshot = preview ?? read()
    const conversationContext = preview ? snapshot.conversationContext : await placedSettings(snapshot.conversationContext)
    const illustration = agentCtx.get('eleckoiAutoIllustration')?.instructions(snapshot) ?? ''
    const instructions = sessionInstructions({ ...snapshot, conversationContext }, illustration)
    return {
      ...assembly,
      sections: instructions ? [{ name: 'eleckoi:session-instructions', text: instructions, interpolate: false }, ...assembly.sections] : assembly.sections
    }
  })
  // RETIRE WHEN: DSH passes projected requests to its pressure check and final dispatch.
  // Replace this registration and remove the paired patch hunks once the roleplay pressure regressions pass on that API.
  agent.projectModelRequest = async (options, executionStep) => {
    const snapshot = read()
    const prepared = placedSettings(snapshot.conversationContext)
    if (readHistory && historyTurn !== executionStep.turn) {
      historyTurn = executionStep.turn
      historyReplies = readHistory(session.id, options.signal)
    }
    const [conversationContext, replies] = await Promise.all([prepared, historyReplies])
    const projection = requestProjectionSnapshot(conversationContext)
    const roleplayBlocks = new Map()
    const surface = projectRoleplayDialogue(options.messages, replies, executionStep.turn, roleplayBlocks)
    const currentUser = surface.findLast(isDirectUserMessage)
    const prompt = conversationContext.currentPromptText
    const transform = {
      roleplayBlocks,
      currentPromptText: typeof prompt === 'string' && prompt !== messageText(currentUser) ? prompt : null
    }
    let messages = projectRequestInput(surface, projection, transform)
    const inputState = agentCtx.sessionProjections.stateOf(session, INPUT_CONTINUATIONS_PROJECTION)
    if (!inputState) throw productFailure(ELECKOI_FAILURE_CODES.dataShapeInvalid, '实际模型请求缺少正式用户输入投影。', { what: '实际模型请求的用户输入' })
    const inputIndex = currentUser ? inputState.inputs.findIndex(input => input.messageId === currentUser.id) : -1
    if (currentUser && inputIndex < 0) throw productFailure(ELECKOI_FAILURE_CODES.lookupNotFound, '实际模型请求的用户输入不在 Session 投影中。', { what: '这次请求的用户输入' })
    const step = { ...executionStep, round: currentUser ? inputIndex + 1 : null }
    if (messages.some(message => message.content.some(block => ['text', 'reasoning'].includes(block.type) && hasRegexEjsOutput(block.text)))) {
      let variables = null
      if (snapshot.variablesEnabled) {
        const state = runtimeContexts.get(sourceSessionId).variables
        if (!state.enabled || !state.state || typeof state.state !== 'object' || Array.isArray(state.state)) throw productFailure(ELECKOI_FAILURE_CODES.dataShapeInvalid, '实际模型请求变量快照无效。', { what: '实际模型请求的变量快照' })
        variables = state.state
      }
      messages = await renderRequestEjs(messages, { conversationId: snapshot.conversationId, variables }, options.signal)
    }
    return {
      messages,
      retainFrom: currentUser?.id,
      projectSummary: selected => [
        ...selected.filter(message => message.role === 'system'),
        ...previousTurnDialogue(projectRoleplayDialogue(selected, replies))
      ],
      onDispatch: request => previews.capture(session, request, projection.plan, step)
    }
  }
  return () => { agent.projectModelRequest = undefined; disposeInstructions() }
}

export async function readRoleplayReplies(ctx, sessionId, signal) {
  const observation = await ctx.sessionQuery.observeSession(sessionId, { projectionMode: 'none', ...(signal ? { signal } : {}) })
  try {
    const delegated = observation.events.filter(isDelegatedRoleplayReply)
      .sort((left, right) => (left.data.anchorSeq ?? left.seq) - (right.data.anchorSeq ?? right.seq))
    const processOnly = []
    return [...roleplayReplyMessages(observation.events, processOnly), ...processOnly, ...delegated.map(event => {
      const blocks = delegatedRoleplayReplyBlocks(event.data)
      return { event, anchorMessageId: event.data.anchorMessageId,
        messageId: 'eleckoi-delegated-reply-' + event.data.id, blocks,
        content: blocks.map(block => `${block.speakerName}：${block.text}`).join('\n\n') }
    })]
  } finally { observation[Symbol.dispose]() }
}

/** Project finished replies at their surviving positions in the official request surface. */
export function projectRoleplayDialogue(messages, replies = [], beforeTurn = Infinity, roleplayBlocks) {
  const currentInput = beforeTurn === Infinity ? messages.length : messages.findLastIndex(isDirectUserMessage)
  if (messages.some((message, index) => index < currentInput && message.source?.kind === DELEGATED_REPLY_NOTICE)) {
    messages = messages.filter((message, index) => index >= currentInput || message.source?.kind !== DELEGATED_REPLY_NOTICE)
  }
  if (!replies.length) return messages
  const presentIds = new Set(messages.map(message => message.id))
  const bodies = new Map(), processIds = new Set()
  const delegatedAt = new Map()
  let priorIds
  const historyReply = (id, content) => freezeMessage({
    id, role: 'assistant', content: [{ type: 'text', text: content }],
    source: { kind: 'plugin:eleckoi-product-history' }
  })
  for (const reply of replies) {
    if (isDelegatedRoleplayReply(reply.event)) {
      const { anchorMessageId, messageId, content, blocks } = reply
      priorIds ??= beforeTurn === Infinity ? presentIds
        : new Set(messages.slice(0, Math.max(0, messages.findLastIndex(isDirectUserMessage))).map(message => message.id))
      if (!priorIds.has(anchorMessageId) || presentIds.has(messageId)) continue
      const anchored = delegatedAt.get(anchorMessageId) ?? []
      anchored.push(historyReply(messageId, content))
      delegatedAt.set(anchorMessageId, anchored)
      roleplayBlocks?.set(messageId, blocks)
      continue
    }
    if (reply.event.data.turn >= beforeTurn) continue
    for (const id of reply.processMessageIds) processIds.add(id)
    if (reply.event.type === 'turn/end') continue
    const { bodyParts } = reply
    if (!bodyParts.length || bodyParts.every(part => presentIds.has(part.messageId))) {
      if (!presentIds.has(reply.messageId)) continue
      bodies.set(reply.messageId, reply.content)
      roleplayBlocks?.set(reply.messageId, reply.blocks)
      continue
    }
    // DSH can cut the history between native text messages of the same turn.
    // Keep each slice's own text. A user edit replaces its whole speaker block.
    const presentBlocks = []
    let anchorId
    for (const block of reply.blocks) {
      const original = bodyParts.filter(part => part.blockId === block.id)
      const last = original.at(-1)
      const edited = block.text !== original.map(part => part.text).join('\n\n')
      const present = edited ? (presentIds.has(last.messageId) ? [last] : [])
        : original.filter(part => presentIds.has(part.messageId))
      if (!present.length) continue
      anchorId = present.at(-1).messageId
      presentBlocks.push({ ...block, text: edited ? block.text : present.map(part => part.text).join('\n\n') })
    }
    if (anchorId) {
      bodies.set(anchorId, presentBlocks.map(block => `${block.speakerName}：${block.text}`).join('\n\n'))
      roleplayBlocks?.set(anchorId, presentBlocks)
    }
  }
  if (!processIds.size && !delegatedAt.size) return messages
  return messages.flatMap(message => {
    const delegated = delegatedAt.get(message.id) ?? []
    // The summary request middleware can receive dialogue already restored before tool filtering.
    if (message.source?.kind === 'plugin:eleckoi-product-history') return [message, ...delegated]
    const content = bodies.get(message.id)
    if (content !== undefined) return [historyReply(message.id, content), ...delegated]
    return processIds.has(message.id) ? delegated : [message, ...delegated]
  })
}

/** Assemble the actual request from the official surface and this turn's active settings. */
export function projectRequestInput(surface, snapshot, transform) {
  const messages = projectRequestMessages(
    projectCurrentUserPrompt(projectProductHistory(surface, snapshot, transform.roleplayBlocks), transform), snapshot.plan
  )
  return projectRequestReasoning(prependRequestInstructions(messages, transform.instructions), snapshot.reasoningPromptRules, snapshot.regexPromptMacros)
}

/** Apply prompt rules to the active turn without mutating Session blocks or opaque adapter replay data. */
export function projectRequestReasoning(messages, rules = [], macros) {
  if (!rules.length) return messages
  const currentUserIndex = messages.findLastIndex(isDirectUserMessage)
  if (currentUserIndex < 0) return messages
  return messages.map((message, index) => {
    if (index <= currentUserIndex || message.role !== 'assistant') return message
    let changed = false
    const content = message.content.map(block => {
      if (block.type !== 'reasoning') return block
      const text = transformReasoningPrompt(block.text, rules, macros)
      if (text === block.text) return block
      if (message.source.replayState !== undefined) {
        throw productFailure(ELECKOI_FAILURE_CODES.statePrecondition, '推理文本携带模型回放数据，不能用提示词正则修改；请将该规则改为仅修改显示内容。', { what: '把这条规则改成只修改显示内容' })
      }
      changed = true
      return { ...block, text }
    })
    return changed ? freezeMessage({ ...message, content }) : message
  })
}

/** Add preset positions and instructions without replacing or filtering native Session history. */
export function extendNativeRequestInput(surface, plan = [], instructions) {
  const messages = []
  const firstDialogue = surface.findIndex(message => message.role !== 'system')
  const prefixIndex = firstDialogue < 0 ? surface.length : firstDialogue
  const currentUserIndex = surface.findLastIndex(isDirectUserMessage)
  for (let index = 0; index <= surface.length; index++) {
    if (index === prefixIndex) messages.push(...messagesForAnchor(plan, 'insert_point_1'), ...messagesForAnchor(plan, 'insert_point_2'))
    if (index === currentUserIndex) messages.push(...messagesForAnchor(plan, 'insert_point_3'))
    if (index === surface.length) {
      if (currentUserIndex < 0) messages.push(...messagesForAnchor(plan, 'insert_point_3'), ...messagesForAnchor(plan, 'insert_point_4'))
      messages.push(...messagesForAnchor(plan, 'insert_point_5'))
    } else {
      messages.push(surface[index])
      if (index === currentUserIndex) messages.push(...messagesForAnchor(plan, 'insert_point_4'))
    }
  }
  return prependRequestInstructions(messages, instructions)
}

function prependRequestInstructions(messages, instructions) {
  if (instructions) {
      const systemIndex = messages.findIndex((message) => message?.role === 'system')
      if (systemIndex >= 0) {
        const system = messages[systemIndex]
        messages[systemIndex] = freezeMessage({
          ...system,
          content: [{ type: 'text', text: `${instructions}\n\n` }, ...system.content]
        })
      } else {
        const id = `eleckoi-system-${createHash('sha256').update(instructions).digest('hex')}`
        messages.unshift(freezeMessage({ ...createSystemMessage(instructions, name), id }))
      }
  }
  return messages
}

export function sessionInstructions(snapshot, imageInstructions = '') {
  const additions = settingInjections(snapshot.conversationContext)
    .filter((entry) => entry.anchor === 'instructions')
    .map((entry) => entry.content)
  const output = roleplayReplyEnabled(snapshot)
    ? imageInstructions
    : '当前预设已关闭角色扮演正文。完成本轮所需的其他工具操作即可。'
  return [snapshot.model?.systemPrompt, ...additions, output]
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
    replyPromptRules: Array.isArray(context?.replyPromptRules) ? context.replyPromptRules : [],
    reasoningPromptRules: Array.isArray(context?.reasoningPromptRules) ? context.reasoningPromptRules : [],
    regexPromptMacros: context?.regexPromptMacros,
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

// RETIRE WHEN: supported upgrade, restore and import logs no longer contain
// eleckoi-request-projection messages. Remove this predicate and its filtering
// calls in context and request preparation with legacy-only tests; retain current projection.
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
export function projectProductHistory(messages, context, roleplayBlocks = new Map()) {
  const currentUserIndex = findCurrentUserIndex(messages)
  if (currentUserIndex < 0) return messages
  const firstDialogue = messages.findIndex((message, index) => (
    index <= currentUserIndex && isDialogueMessage(message)
  ))
  const replaceFrom = firstDialogue < 0 ? currentUserIndex : firstDialogue
  const nativeHistory = messages.slice(replaceFrom, currentUserIndex)
  const runtimeContext = messages.findLast(message => message?.source?.kind === 'runtime-context')
  const retainedContext = runtimeContext && nativeHistory.includes(runtimeContext) ? [runtimeContext] : []
  const productHistory = (Array.isArray(context?.history) ? context.history : [])
    .map(productHistoryMessage)
    .filter(Boolean)
  if (context?.historyMode === 'prefix') {
    const dialogueHistory = previousTurnDialogue(nativeHistory)
    const prefix = productHistory.filter((product, index) => !messagesMatch(product, dialogueHistory[index]))
    const rules = context.replyPromptRules
    const history = rules?.length ? dialogueHistory.map((message, index) => {
      if (message.role !== 'assistant') return message
      const source = messageText(message)
      const text = transformAiReplyPrompt(source, rules, context.regexPromptMacros,
        dialogueHistory.length - index, roleplayBlocks.get(message.id))
      return text === source ? message : freezeMessage({ ...message, content: [{ type: 'text', text }] })
    }) : dialogueHistory
    return [
      ...messages.slice(0, replaceFrom),
      ...prefix,
      ...history,
      ...retainedContext,
      ...messages.slice(currentUserIndex)
    ]
  }
  const authoritative = compactedProjection(productHistory, nativeHistory) ?? productHistory
  return [
    ...messages.slice(0, replaceFrom),
    ...authoritative,
    ...retainedContext,
    ...messages.slice(currentUserIndex)
  ]
}

/** Visible dialogue, excluding only the exact input retained by an explicit regeneration. */
export function visibleDialogueHistory(messages, retainedInputMessageId) {
  const list = Array.isArray(messages) ? messages : []
  if (retainedInputMessageId !== undefined && !list.some(message => message.id === retainedInputMessageId && isDirectUserMessage(message))) {
    throw productFailure(ELECKOI_FAILURE_CODES.lookupNotFound, '重新生成保留的用户输入不在当前 Session 中。', { what: '重新生成保留的用户输入' })
  }
  return previousTurnDialogue(list.filter(message => message.id !== retainedInputMessageId))
    .map(message => ({ role: message.role, content: messageText(message) }))
}

function previousTurnDialogue(messages) {
  const history = []
  let finalReply
  const flush = () => {
    if (finalReply) history.push(finalReply)
    finalReply = undefined
  }
  for (const message of messages) {
    if (isDirectUserMessage(message) || isCompactionCheckpoint(message)
      || (message?.role === 'assistant' && message.source?.kind === 'plugin:eleckoi-product-history')) {
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
        id: String(entry.id || ''),
        anchor,
        role: anchor === 'instructions' ? 'system' : entry.insertRole === 'assistant' ? 'assistant' : 'user',
        content: entry.content,
        placementRank: custom?.side === 'before_setting_position' ? 0 : custom?.side === 'after_setting_position' ? 2 : 1,
        positionOrder: custom?.order ?? 0,
        order: Number.isInteger(entry.order) ? entry.order : 1,
        traceTitle: entry.kind === 'hidden_tool_timeline'
          ? `预设固定条目 · ${title}`
          : String(entry.id || '').startsWith('agent-preset:') ? `预设条目 · ${title}` : `设定 · ${title}`,
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
      throw productFailure(ELECKOI_FAILURE_CODES.dataShapeInvalid, `世界书条目 ${entry.id} 缺少明确的请求位置。`, { what: '世界书条目的请求位置' })
    }
    if (!['system', 'user', 'assistant'].includes(entry.role)) throw productFailure(ELECKOI_FAILURE_CODES.dataShapeInvalid, `世界书条目 ${entry.id} 的消息角色无效。`, { what: '世界书条目的消息角色' })
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
