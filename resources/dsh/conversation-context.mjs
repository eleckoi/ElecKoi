import { createAssistantMessage, createSystemMessage, createUserMessage, freezeMessage, isAgentLoopRequest } from '@deepseek-ai/dsh-llm'
import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { readSessionSnapshot } from './session-snapshot.mjs'
import { requiredSettingCache } from './required-setting-cache.mjs'

export const name = 'eleckoi-conversation-context'
export const projectionPlugin = 'eleckoi-request-projection'

const PROJECTION_VERSION = 1
const PROJECTION_PREFIX = `ELECKOI_REQUEST_PROJECTION_V${PROJECTION_VERSION}\n`
const recordedRequestSnapshots = new Set()
const knownRequestContextDefinitions = new Map()

/**
 * Seed a newly-created DSH Session from ElecKoi's authoritative active branch.
 * The current user input is deliberately absent: the SDK records it through
 * session/prompt, so it must never be copied into the seed.
 */
export function createConversationSeed(snapshot, modelSelection) {
  const history = Array.isArray(snapshot?.conversationContext?.history)
    ? snapshot.conversationContext.history
    : []
  const events = []
  let sequence = 0
  let turn = 0
  let openTurn = false

  const append = (type, data, surface = false) => {
    events.push({
      type,
      seq: sequence,
      time: Date.now() + sequence,
      data,
      ...(surface ? { surfaceOp: 'append' } : {})
    })
    sequence += 1
  }
  const beginTurn = () => {
    turn += 1
    append('turn/start', { turn })
    openTurn = true
  }
  const endTurn = () => {
    if (!openTurn) return
    append('turn/end', { turn, reason: { kind: 'completed' } })
    openTurn = false
  }

  for (const item of history) {
    if (!item || (item.role !== 'user' && item.role !== 'assistant')) continue
    const text = String(item.content ?? '')
    if (!text.trim()) continue
    if (item.role === 'user') {
      endTurn()
      beginTurn()
      append('user/message', createUserMessage({
        content: [{ type: 'text', text }],
        source: { kind: 'user' }
      }), true)
      continue
    }
    if (!openTurn) beginTurn()
    append('step/start', { turn, step: 1 })
    append('assistant/message', {
      turn,
      step: 1,
      stream: [],
      message: createAssistantMessage({
        content: [{ type: 'text', text }],
        source: {
          provider: modelSelection.provider,
          model: modelSelection.model
        }
      })
    }, true)
    append('step/end', { turn, step: 1 })
    endTurn()
  }
  endTurn()
  return events
}

/** Install product-owned prompt contributions for every root turn. */
export function installConversationContext(agentCtx, snapshotRoot, sourceSessionId) {
  const read = () => readSessionSnapshot(snapshotRoot, sourceSessionId)
  const disposeStepProjection = agentCtx.on('agent/pre-step', async ({ agent, signal }, next) => {
    const decision = await next()
    if (decision.kind === 'reject' || signal.aborted) return decision
    const plan = requestProjectionPlan(read().conversationContext)
    if (plan.length === 0 || activeProjectionEnvelope(agent.session)) return decision
    return {
      ...decision,
      messages: [...decision.messages, projectionEnvelope(plan)]
    }
  })
  const disposeRequestProjection = agentCtx.on('llm/stream', (options, next) => {
    if (!isAgentLoopRequest(options) || options.sessionId !== sourceSessionId) return next()
    const session = agentCtx.sessions.get(options.sessionId)
    if (!session) return next()
    const snapshot = read()
    const plan = requestProjectionPlan(snapshot.conversationContext)
    ensureProjectionEnvelope(session, plan)
    const productMessages = projectProductHistory(session.deriveMessages(), snapshot.conversationContext)
    const messages = projectRequestMessages(productMessages, plan)
    const instructions = sessionInstructions(snapshot)
    if (instructions) {
      const id = `eleckoi-system-${createHash('sha256').update(instructions).digest('hex')}`
      messages.unshift(freezeMessage({ ...createSystemMessage(instructions, name), id }))
    }
    recordRequestContextSnapshot(snapshot.requestContextFile, session, messages, plan)
    return agentCtx.llm.stream({
      ...options,
      messages
    })
  })
  return () => {
    disposeRequestProjection()
    disposeStepProjection()
  }
}

function sessionInstructions(snapshot) {
  const additions = settingInjections(snapshot.conversationContext)
    .filter((entry) => entry.anchor === 'instructions')
    .map((entry) => entry.content)
  return [snapshot.model?.systemPrompt, ...additions]
    .filter((value) => typeof value === 'string' && value.trim())
    .join('\n\n')
}

/** Freeze the complete active position graph into one durable projection definition. */
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

/**
 * Rebuild the exact provider-facing message order for one model request.
 * The projection envelope itself stays durable in the DSH log but never reaches
 * the provider. Every tool continuation is therefore reassembled against the
 * latest real user input and the tool flow accumulated after it.
 */
export function projectRequestMessages(messages, plan = projectionPlanFromMessages(messages)) {
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

export function projectionPlanFromMessages(messages) {
  const envelope = messages.findLast(isProjectionEnvelope)
  if (!envelope) return undefined
  return decodeProjectionEnvelope(envelope)
}

export function isProjectionEnvelope(message) {
  return message?.role === 'user'
    && message?.source?.kind === 'plugin'
    && message?.source?.plugin === projectionPlugin
}

/** Persist an author-readable snapshot of the exact messages sent by one loop request. */
export function recordRequestContextSnapshot(file, session, messages, plan = []) {
  if (typeof file !== 'string' || !file) return
  const boundary = session.snapshotEvents().findLast((event) => event?.type === 'step/start')
  const turn = boundary?.data?.turn
  const step = boundary?.data?.step
  const requestSeq = boundary?.seq
  if (!Number.isSafeInteger(turn) || turn < 1
    || !Number.isSafeInteger(step) || step < 1
    || !Number.isSafeInteger(requestSeq) || requestSeq < 0) return
  const key = `${file}\0${requestSeq}`
  if (recordedRequestSnapshots.has(key)) return
  const items = requestContextItems(messages, plan)
  const definitions = requestContextDefinitionKeys(file)
  const pendingDefinitions = new Set()
  const rows = []
  const itemRefs = items.map((item) => {
    const key = requestContextDefinitionKey(item)
    if (!definitions.has(key) && !pendingDefinitions.has(key)) {
      pendingDefinitions.add(key)
      rows.push({ type: 'definition', key, ...item, order: undefined })
    }
    return { order: item.order, key }
  })
  rows.push({
    type: 'request',
    version: 1,
    requestSeq,
    turn,
    step,
    timeMillis: Number.isSafeInteger(boundary.time) && boundary.time >= 0 ? boundary.time : Date.now(),
    items: itemRefs
  })
  try {
    mkdirSync(dirname(file), { recursive: true })
    appendFileSync(file, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8')
    for (const definitionKey of pendingDefinitions) definitions.add(definitionKey)
    recordedRequestSnapshots.add(key)
  } catch (error) {
    process.emitWarning(`ElecKoi could not persist request context: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function requestContextDefinitionKeys(file) {
  const existing = knownRequestContextDefinitions.get(file)
  if (existing) return existing
  const keys = new Set()
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      if (!line.trim()) continue
      try {
        const value = JSON.parse(line)
        if (value?.type === 'definition' && typeof value.key === 'string') keys.add(value.key)
      } catch {
        continue
      }
    }
  }
  knownRequestContextDefinitions.set(file, keys)
  return keys
}

function requestContextDefinitionKey(item) {
  return createHash('sha256').update([
    item.messageId,
    item.role,
    item.kind,
    item.title,
    item.source,
    item.anchor,
    item.content
  ].join('\0')).digest('hex')
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
  if (source.plugin === 'eleckoi-product-history') return 'history'
  if (source.kind === 'user') return 'user'
  if (message?.role === 'assistant') return 'assistant'
  return 'context'
}

function requestContextTitle(message, source, latestUser) {
  if (message?.role === 'system') return '系统提示词'
  if (source.kind === 'tool' || message?.content?.some((block) => block?.type === 'tool-result')) return '工具结果'
  if (message?.content?.some((block) => block?.type === 'tool-call')) return '助手工具调用'
  if (source.kind === 'user') return latestUser ? '用户最新输入' : '用户消息'
  if (source.plugin === 'eleckoi-product-history') return message?.role === 'assistant' ? '历史助手消息' : '历史用户消息'
  if (source.kind === 'model' || message?.role === 'assistant') return '助手消息'
  return source.sections?.[0]?.name || '上下文'
}

function requestContextSource(source, latestUser) {
  if (source.kind === 'user') return latestUser ? '本轮输入' : '聊天记录'
  if (source.kind === 'tool') return source.callId ? `工具结果 · ${source.callId}` : '工具结果'
  if (source.plugin === 'eleckoi-product-history') return '聊天记录'
  if (source.kind === 'model') return [source.provider, source.model].filter(Boolean).join(' · ') || '模型'
  if (source.kind === 'plugin') return source.plugin || '插件上下文'
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

function activeProjectionEnvelope(session) {
  for (const seq of session.surface.nodes.toReversed()) {
    const event = session.eventAt(seq)
    if (event?.type === 'user/message' && isProjectionEnvelope(event.data)) return event
  }
}

function ensureProjectionEnvelope(session, plan) {
  const current = activeProjectionEnvelope(session)
  const next = projectionEnvelope(plan)
  if (current && messageText(current.data) === messageText(next)) return current
  if (!current && plan.length === 0) return undefined
  if (!current) {
    return session.append('user/message', next, { surfaceOp: 'append' })
  }
  return session.append('user/message', next, {
    surfaceOp: { op: 'replace', startSeq: current.seq, endSeq: current.seq },
    sourceEventSeqs: [current.seq]
  })
}

function projectionEnvelope(plan) {
  return freezeMessage({
    id: `${projectionPlugin}:v${PROJECTION_VERSION}`,
    role: 'user',
    content: [{ type: 'text', text: `${PROJECTION_PREFIX}${JSON.stringify(plan)}` }],
    source: {
      kind: 'plugin',
      plugin: projectionPlugin,
      form: 'snapshot',
      sections: plan.map((entry) => ({ name: entry.traceTitle || entry.id, text: entry.content }))
    }
  })
}

function decodeProjectionEnvelope(message) {
  const text = messageText(message)
  if (!text.startsWith(PROJECTION_PREFIX)) return []
  try {
    const value = JSON.parse(text.slice(PROJECTION_PREFIX.length))
    return Array.isArray(value) ? value.filter(isProjectionEntry) : []
  } catch {
    return []
  }
}

function isProjectionEntry(value) {
  return value && typeof value === 'object'
    && typeof value.id === 'string'
    && typeof value.anchor === 'string'
    && (value.role === 'user' || value.role === 'assistant')
    && typeof value.content === 'string'
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
          kind: 'plugin',
          plugin: name,
          form: 'snapshot',
          sections: [{ name: entry.traceTitle || entry.id || name, text: entry.content }]
        }
  })
}

/**
 * Replace previous native provider turns with the active product branch.
 * Current-turn tool messages remain untouched because this runs only at step 1.
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
  const authoritative = compactedProjection(productHistory, nativeHistory) ?? productHistory
  return [
    ...messages.slice(0, replaceFrom),
    ...authoritative,
    ...messages.slice(currentUserIndex)
  ]
}

function productHistoryMessage(item, index) {
  if (!item || (item.role !== 'user' && item.role !== 'assistant')) return null
  const value = String(item.content ?? '')
  if (!value.trim()) return null
  return {
    id: `eleckoi-product-history-${index}`,
    role: item.role,
    content: [{ type: 'text', text: value }],
    source: { kind: 'plugin', plugin: 'eleckoi-product-history' }
  }
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
  const library = context?.settingLibrary
  if (!library) return []
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
  return [...automatic, ...required]
    .sort((left, right) => anchorOrder(left.anchor) - anchorOrder(right.anchor)
      || left.placementRank - right.placementRank
      || left.positionOrder - right.positionOrder
      || left.order - right.order
      || left.id.localeCompare(right.id))
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
