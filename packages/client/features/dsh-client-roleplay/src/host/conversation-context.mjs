import { createSystemMessage, freezeMessage, isAgentLoopRequest } from '@deepseek-ai/dsh-llm'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { readSessionSnapshot } from './session-snapshot.mjs'
import { requiredSettingCache } from './required-setting-cache.mjs'
import { settingSendBatches, settingEntryPaths, mergedSettingText } from './setting-send-groups.mjs'
import { INPUT_CONTINUATIONS_PROJECTION } from './input-continuations-projection.mjs'
import { illustrationInstructions, prepareIllustration } from './generated-image-result.mjs'
import { projectPresetModelOptions, presetRequiresPayloadAdapter } from './preset-model-options.mjs'
import { tavernPresetPlan, projectTavernPresetMessages, isCompatibilityCharacterField } from './tavern-preset-projection.mjs'

export const name = 'eleckoi-conversation-context'
export const projectionPlugin = 'eleckoi-request-projection'

/** Install product-owned prompt contributions for every root turn. */
export function installConversationContext(agentCtx, snapshotRoot, sourceSessionId, previews, settings) {
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
    const projection = requestProjectionSnapshot(snapshot.conversationContext)
    const surface = session.deriveMessages()
    const currentUser = surface.findLast(isDirectUserMessage)
    const prompt = snapshot.conversationContext.currentPromptText
    const illustration = prepareIllustration(settings, snapshot)
    const transform = {
      instructions: sessionInstructions(snapshot, illustration ? illustrationInstructions(illustration.settings) : '') || null,
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
    const parameters = snapshot.conversationContext.generationParameters
    const request = { ...projectPresetModelOptions(options, parameters), messages }
    previews.capture(session, request, projection.plan, {
      ...executionStep, round: currentUser ? inputIndex + 1 : null
    })
    if (presetRequiresPayloadAdapter(parameters)) {
      const compatibility = agentCtx.get('eleckoiTavernCompatibilityApi')
      if (!compatibility) throw new Error('预设模型参数服务尚未加载。')
      return compatibility.streamPresetModel(request, parameters, snapshot.operationId)
    }
    return agentCtx.llm.stream(request)
  })
  return () => { disposeRequestProjection(); disposeStep() }
}

/** Assemble the actual request from the official surface and this turn's active settings. */
export function projectRequestInput(surface, snapshot, transform) {
  const messages = projectRequestMessages(
    projectCurrentUserPrompt(projectProductHistory(surface, snapshot), transform), snapshot.plan
  )
  return resolveRequestOutlets(appendRequestInstructions(messages, transform.instructions), snapshot.outlets)
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
  return appendRequestInstructions(messages, instructions)
}

function appendRequestInstructions(messages, instructions) {
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

export function sessionInstructions(snapshot, imageInstructions = '') {
  const additions = settingInjections(snapshot.conversationContext)
    .filter((entry) => entry.anchor === 'instructions' && entry.role === 'system')
    .map((entry) => entry.content)
  return [snapshot.model?.systemPrompt, ...additions, imageInstructions]
    .filter((value) => typeof value === 'string' && value.trim())
    .join('\n\n')
}

/** Describe the active position graph for request assembly and the in-memory preview. */
export function requestProjectionPlan(context) {
  return settingInjections(context)
    .filter((entry) => entry.anchor !== 'instructions' || entry.role !== 'system')
    .map((entry) => ({
      id: entry.id,
      anchor:entry.anchor,depth:entry.depth,
      section: entry.section, projectionKind: entry.projectionKind, presetPromptId: entry.presetPromptId,
      worldbookPosition: entry.worldbookPosition, authorNotePart: entry.authorNotePart,
      role:entry.role,
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
    outlets: structuredClone(context?.worldbookRound?.outlets ?? {}),
    hiddenMessageIds: [...(context?.hiddenMessageIds ?? [])],
    groupSpeakers: structuredClone(context?.groupSpeakers ?? {}),
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
  const finish = input => projectDepthMessages(projectTavernPresetMessages(input, plan, projectionMessage, projectionPlugin).messages, plan)
  const system = visible.filter((message) => message?.role === 'system')
  const dialogue = visible.filter((message) => message?.role !== 'system')
  const latestUserIndex = dialogue.findLastIndex(isDirectUserMessage)
  if (latestUserIndex < 0) {
    return finish([
      ...messagesForAnchor(plan, 'instructions'),
      ...system,
      ...messagesForAnchor(plan, 'insert_point_1'),
      ...messagesForAnchor(plan, 'insert_point_2'),
      ...messagesForAnchor(plan, 'character-definition'),
      ...messagesForAnchor(plan, 'examples'),
      ...dialogue,
      ...messagesForAnchor(plan, 'insert_point_3'),
      ...messagesForAnchor(plan, 'insert_point_4'),
      ...messagesForAnchor(plan, 'insert_point_5')
    ])
  }
  return finish([
    ...messagesForAnchor(plan, 'instructions'),
    ...system,
    ...messagesForAnchor(plan, 'insert_point_1'),
    ...messagesForAnchor(plan, 'insert_point_2'),
    ...messagesForAnchor(plan, 'character-definition'),
    ...messagesForAnchor(plan, 'examples'),
    ...dialogue.slice(0, latestUserIndex),
    ...messagesForAnchor(plan, 'insert_point_3'),
    dialogue[latestUserIndex],
    ...messagesForAnchor(plan, 'insert_point_4'),
    ...dialogue.slice(latestUserIndex + 1),
    ...messagesForAnchor(plan, 'insert_point_5')
  ])
}

/** Insert before history boundaries, keeping the active assistant/tool continuation contiguous. */
export function projectDepthMessages(messages,plan) {
  const entries=plan.filter(entry=>entry.anchor==='chat_depth');if(!entries.length)return messages;
  const current=messages.findLastIndex(isDirectUserMessage),limit=current<0?messages.length-1:current;
  const boundaries=messages.flatMap((message,index)=>index<=limit&&isDialogueMessage(message)&&!String(message.id??'').startsWith(`${projectionPlugin}:`)?[index]:[]);
  const insertions=new Map();
  for(const entry of entries){const depth=Math.max(0,Math.trunc(Number(entry.depth)||0));const index=depth===0?limit+1:boundaries[Math.max(0,boundaries.length-depth)]??0;const group=insertions.get(index)??[];group.push(entry);insertions.set(index,group);}
  const result=[];for(let index=0;index<=messages.length;index++){result.push(...(insertions.get(index)??[]).sort((a,b)=>(a.order??0)-(b.order??0)||String(a.id).localeCompare(String(b.id))).map(projectionMessage));if(index<messages.length)result.push(messages[index]);}
  return result;
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
  // Author system messages use a plugin-owned native context source. The
  // Agent's system-prompt refresh owns only its actual system/message nodes.
  messages = messages.map(message => message?.source?.kind === 'plugin:eleckoi-author-system'
    ? freezeMessage({ ...message, role: 'system', source: { kind: 'system-prompt' } }) : message)
  const hidden = new Set(context?.hiddenMessageIds ?? [])
  if (hidden.size) messages = messages.filter(message => !hidden.has(String(message?.id ?? '')))
  messages = messages.map(message => {
    const actor = context?.groupSpeakers?.[message.id]
    return actor && message.role === 'assistant' ? freezeMessage({ ...message,
      source: { ...message.source, ...actor } }) : message
  })
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
  let finalReply, continuing = false
  const flush = () => {
    if (finalReply) history.push(finalReply)
    finalReply = undefined; continuing = false
  }
  for (const message of messages) {
    if (message?.source?.kind === 'plugin:eleckoi-group-response') { flush(); continue }
    if (message?.source?.kind === 'plugin:eleckoi-assistant-continuation') {
      continuing = true
      continue
    }
    if (message?.role === 'system' || isDirectUserMessage(message) || isCompactionCheckpoint(message)) {
      flush()
      history.push(message)
    } else if (message?.role === 'assistant'
      && message?.source?.kind !== 'tool'
      && !message.content?.some(block => block?.type === 'tool-call' || block?.type === 'tool-result')) {
      const plain = normalizedDialogueText(messageText(message), 'assistant')
      const content = plain && message.source?.speakerName && !continuing ? '[' + message.source.speakerName + ']\n' + plain : plain
      if (content) finalReply = freezeMessage({
        id: continuing && finalReply ? finalReply.id : message.id,
        role: 'assistant',
        content: [{ type: 'text', text: continuing && finalReply ? messageText(finalReply) + content : content }],
        source: { kind: 'plugin:eleckoi-product-history', ...(message.source?.characterId ? { characterId: message.source.characterId, speakerName: message.source.speakerName, groupId: message.source.groupId } : {}) }
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
  return messages.findLastIndex((message) => message?.role === 'user' && ['user', 'plugin:eleckoi-group-response'].includes(message?.source?.kind))
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
  const presetPlan = tavernPresetPlan(context)
  const compatiblePreset = context?.compatibilityPreset?.compatibility === true
  const compatibleIds = compatiblePreset ? context.compatibilityPreset.prompts.map(prompt => 'agent-preset:' + context.compatibilityPreset.id + ':' + prompt.id) : []
  const managed = new Set([...(context?.worldbookRound?.managedEntryIds ?? []), ...(context?.replacedCharacterFieldIds ?? []), ...compatibleIds])
  const promptPositions = new Map((library.promptPositions || []).map((position) => [position.id, position]))
  const automatic = (library.entries || [])
    .filter((entry) => entry?.enabled
      && !managed.has(entry.id)
      && !(compatiblePreset && (entry.id === 'tavern-character-description' || isCompatibilityCharacterField(entry.id)))
      && typeof entry.content === 'string'
      && entry.content.trim()
      && entry.kind !== 'opening'
      && entry.kind !== 'history_compaction'
      && entry.triggerMode === 'always' && entry.position)
    .map((entry) => {
      const custom = promptPositions.get(entry.promptPositionId)
      const preset=entry.sillyTavern?.presetPrompt, depthPosition=preset?.position?.type==='in_chat'?preset.position:null
      const section = nativeCardSection(entry)
      const requestedAnchor = custom?.anchor || entry.position || 'insert_point_1'
      const anchor = depthPosition ? 'chat_depth' : section && requestedAnchor === 'instructions' ? section : requestedAnchor
      const title = String(entry.title || '').trim() || '未命名设定'
      return {
        id: String(entry.id || '').slice(0, 128),
        sourceEntryId: entry.id,
        anchor,depth:depthPosition?.depth,section,
        role:anchor==='instructions'?'system':['assistant','user'].includes(entry.insertRole)?entry.insertRole:'system',
        content: entry.content,
        placementRank: custom?.side === 'before_setting_position' ? 0 : custom?.side === 'after_setting_position' ? 2 : 1,
        positionOrder: custom?.order ?? 0,
        order:Number.isInteger(depthPosition?.order)?depthPosition.order:Number.isInteger(entry.order)?entry.order:1,
        traceTitle: entry.kind === 'hidden_tool_timeline'
            ? `预设固定条目 · ${title}`
            : String(entry.id || '').startsWith('agent-preset:')
              ? `预设条目 · ${title}`
              : `设定 · ${title}`,
        traceSource: String(custom?.name || '').trim() || positionLabel(anchor)
      }
    })
  const required = requiredSettingCache(library).filter(entry => !managed.has(entry.id)
    && !(compatiblePreset && (entry.id === 'tavern-character-description' || isCompatibilityCharacterField(entry.id)))).map((entry, index) => ({
    id: `required-setting-${entry.reference.slice(1)}`,
    sourceEntryId: entry.id, section: nativeCardSection(entry),
    anchor: 'insert_point_1', role: 'user', content: entry.prompt,
    placementRank: 3, positionOrder: 0, order: index + 1,
    traceTitle: `Agent 必读 · ${entry.title}`, traceSource: '缓存设定区'
  }))
  const contributions=(context?.promptContributions??[]).filter(entry=>typeof entry.content==='string'&&entry.content.trim()
    && !(compatiblePreset && !entry.source && entry.anchor !== 'chat_depth' && presetPlan.some(prompt => prompt.presetPromptId === 'personaDescription'))).map(entry=>({...entry,section:nativeCardSection(entry),anchor:nativeCardSection(entry)&&entry.anchor==='instructions'?nativeCardSection(entry):entry.anchor,placementRank:1,positionOrder:0,traceTitle:entry.title,traceSource:entry.anchor==='chat_depth'?`聊天深度 ${entry.depth??0}`:entry.source?'插件注入':'用户资料'}))
  const ordered = [...automatic,...required,...contributions,...worldbookSettingInjections(context,promptPositions),...presetPlan]
    .sort((left, right) => anchorOrder(left.anchor) - anchorOrder(right.anchor)
      || left.placementRank - right.placementRank
      || left.positionOrder - right.positionOrder
      || left.order - right.order
      || left.id.localeCompare(right.id))
  const paths = settingEntryPaths(library)
  const sourceEntries = new Map((library.entries || []).map(entry => [entry.id, entry]))
  return settingSendBatches(library, ordered, {
    entryId: item => item.sourceEntryId,
    boundary:item=>JSON.stringify([item.anchor,item.depth,item.role,item.section,item.placementRank,item.positionOrder,
      sourceEntries.get(item.sourceEntryId)?.promptPositionId || ''])
  }).map(batch => batch.merged ? {
    ...batch.items[0], id: `merged-setting:${batch.items[0].id}`,
    content: mergedSettingText(batch.items, item => paths.get(item.sourceEntryId) || item.traceTitle, item => item.content),
    traceTitle: `合并设定 · ${batch.title}（${batch.items.length}）`
  } : batch.items[0])
}

export function worldbookSettingInjections(context, promptPositions = new Map()) {
  const round = context?.worldbookRound
  if (!round) return []
  const fragments = [...(round.fragments ?? []), ...(round.examples ?? [])]
  const noteEntries = fragments.filter(entry => ['top_of_an', 'bottom_of_an'].includes(entry.worldbookPosition))
  const entries = fragments.filter(entry => !['outlet', 'top_of_an', 'bottom_of_an'].includes(entry.worldbookPosition))
  const note = round.authorNote
  const notePosition = note?.position ?? (noteEntries.length ? 'at_depth' : 'none')
  const noteDepth = Number(note?.depth) || 0, noteOrder = Number(note?.order) || 0
  const noteRole = note?.role ?? 'system'
  const notePlacement = notePosition === 'before_prompt' ? { nativePlacement: { position: 'instructions' } }
    : notePosition === 'in_prompt' ? { nativePlacement: { position: 'insert_point_2' } } : {}
  if (notePosition !== 'none') {
    const top = noteEntries.filter(entry => entry.worldbookPosition === 'top_of_an')
    const bottom = noteEntries.filter(entry => entry.worldbookPosition === 'bottom_of_an')
    const noteAtDepth = !['before_prompt', 'in_prompt'].includes(notePosition)
    for (const [index, entry] of top.entries()) entries.push({ ...entry, id: 'authors-note-top:' + entry.id, role: noteRole,
      worldbookPosition: noteAtDepth ? 'at_depth' : 'top_of_an', depth: noteDepth,
      authorNotePart: 'before', order: noteOrder - top.length + index, ...notePlacement })
    if (note?.content) entries.push({ id: 'authors-note', content: note.content, role: noteRole,
      worldbookPosition: noteAtDepth ? 'at_depth' : 'author_note', depth: noteDepth,
      authorNotePart: 'body', order: noteOrder, ...notePlacement })
    for (const [index, entry] of bottom.entries()) entries.push({ ...entry, id: 'authors-note-bottom:' + entry.id, role: noteRole,
      worldbookPosition: noteAtDepth ? 'at_depth' : 'bottom_of_an', depth: noteDepth,
      authorNotePart: 'after', order: noteOrder + index + 1, ...notePlacement })
  }
  const anchors = {
    beforeCharacterDefinition: 'beforeCharacterDefinition', afterCharacterDefinition: 'afterCharacterDefinition',
    beforeExamples: 'beforeExamples', examples: 'examples', afterExamples: 'afterExamples',
    beforeBaseInstructions: 'instructions', beforeHistory: 'beforeHistory',
    beforeLatestUserInput: 'insert_point_3', afterLatestUserInput: 'insert_point_4', afterHistory: 'insert_point_5'
  }
  return entries.filter(entry => typeof entry.content === 'string' && entry.content.trim()).map((entry, index) => {
    const native = entry.nativePlacement, custom = native && promptPositions.get(native.promptPositionId)
    const atDepth = !native && entry.worldbookPosition === 'at_depth'
    const anchor = atDepth ? 'chat_depth' : native ? custom?.anchor ?? native.position : anchors[entry.anchor]
    if (!anchor) throw new Error('世界书条目 ' + entry.id + ' 缺少明确的请求位置。')
    if (!['system', 'user', 'assistant'].includes(entry.role)) throw new Error('世界书条目 ' + entry.id + ' 的消息角色无效。')
    return {
      id: 'worldbook:' + entry.id, sourceEntryId: entry.sourceEntryId ?? entry.id, content: entry.content, role: entry.role, anchor,
      worldbookPosition: entry.worldbookPosition, authorNotePart: entry.authorNotePart,
      depth: atDepth ? entry.depth : undefined,
      placementRank: custom?.side === 'before_setting_position' ? 0 : custom?.side === 'after_setting_position' ? 2 : 1,
      positionOrder: custom?.order ?? 0, order: Number.isInteger(entry.order) ? entry.order : index,
      traceTitle: '设定 · ' + (entry.title ?? entry.id), traceSource: atDepth ? '聊天深度 ' + (entry.depth ?? 0) : custom?.name || positionLabel(anchor)
    }
  })
}

export function resolveWorldbookOutlets(content, outlets = {}) {
  return String(content).replace(/\{\{outlet::([^}]+)\}\}/gi, (_match, name) =>
    Array.isArray(outlets?.[name.trim()]) ? outlets[name.trim()].join('\n\n') : '')
}

function resolveRequestOutlets(messages, outlets) {
  if (!outlets) return messages
  return messages.map(message => {
    let changed = false
    const content = message.content.map(block => {
      if (block.type !== 'text') return block
      const text = resolveWorldbookOutlets(block.text, outlets)
      if (text === block.text) return block
      changed = true
      return { ...block, text }
    })
    return changed ? freezeMessage({ ...message, content }) : message
  })
}

function nativeCardSection(entry) {
  const id = String(entry.sourceEntryId ?? entry.id ?? '')
  if (/^compat-character:[^:]+:mes_example$/.test(id) || entry.id?.endsWith(':card:mesExamples')) return 'examples'
  if (id === 'tavern-character-description' || /^compat-character:[^:]+:(description|personality|scenario)$/.test(id)
    || /:card:(description|personality|scenario)$/.test(id)) return 'character-definition'
  return undefined
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
