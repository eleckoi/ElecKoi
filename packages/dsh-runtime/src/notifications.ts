import type { HarnessNotification } from '@deepseek-ai/dsh-sdk-client'
import type { DshProcessItem } from './types'

/**
 * Holds provisional assistant text until DSH publishes the completed typed message.
 * A message that also contains a tool call is process narration; a text-only message
 * is reply content. Raw text deltas cannot distinguish those two cases on their own.
 */
export class DshReplyProjector {
  private readonly streams = new Map<string, FinalReplyStream>()

  constructor(private readonly rootSessionId = '') {}

  project(notification: HarnessNotification): string | undefined {
    if (notification.method !== 'session.event') return undefined
    if (this.rootSessionId && string(notification.params.sessionId) !== this.rootSessionId) return undefined
    const event = asRecord(notification.params.event)
    const data = asRecord(event?.data) ?? {}
    const key = assistantStepKey(notification, data)
    if (event?.type === 'assistant/chunk') {
      const chunk = asRecord(data.chunk)
      if (chunk?.type === 'text-delta' && typeof chunk.text === 'string') {
        const stream = this.streams.get(key) ?? new FinalReplyStream()
        this.streams.set(key, stream)
        return stream.accept(chunk.text) || undefined
      }
      return undefined
    }
    if (event?.type !== 'assistant/message') return undefined

    const stream = this.streams.get(key)
    this.streams.delete(key)
    const message = asRecord(data.message)
    const content = Array.isArray(message?.content) ? message.content.map(asRecord).filter(Boolean) : []
    if (content.some((block) => block?.type === 'tool-call')) return undefined
    const snapshot = content
      .filter((block) => block?.type === 'text')
      .map((block) => string(block?.text))
      .join('')
    if (stream?.finalStarted) return stream.finish() || undefined
    return finalReplyText(snapshot) || undefined
  }
}

class FinalReplyStream {
  private markerTail = ''
  private contentTail = ''
  private awaitingLeadingLineBreak = false
  private consumeLeadingLineFeed = false
  private mode: 'detecting' | 'final' | 'done' = 'detecting'

  get finalStarted(): boolean { return this.mode !== 'detecting' }

  accept(chunk: string): string {
    if (this.mode === 'done') return ''
    if (this.mode === 'final') {
      return this.acceptFinalContent(this.consumeOptionalLeadingLineBreak(chunk))
    }
    const value = this.markerTail + chunk
    const markerIndex = value.indexOf(FinalOpenTag)
    if (markerIndex < 0) {
      this.markerTail = value.slice(-(FinalOpenTag.length - 1))
      return ''
    }
    this.mode = 'final'
    this.markerTail = ''
    this.awaitingLeadingLineBreak = true
    return this.acceptFinalContent(
      this.consumeOptionalLeadingLineBreak(value.slice(markerIndex + FinalOpenTag.length))
    )
  }

  finish(): string {
    if (this.mode !== 'final') return ''
    const tail = withoutPartialFinalClose(this.contentTail)
    this.contentTail = ''
    this.mode = 'done'
    return tail
  }

  private acceptFinalContent(chunk: string): string {
    const value = this.contentTail + chunk
    this.contentTail = ''
    const closingIndex = value.indexOf(FinalCloseTag)
    if (closingIndex >= 0) {
      const visible = removeTrailingLineBreak(value.slice(0, closingIndex))
      this.mode = 'done'
      return visible
    }

    let retainedLength = partialFinalCloseLength(value)
    if (retainedLength === 0) return value
    const beforeRetained = value.slice(0, -retainedLength)
    if (beforeRetained.endsWith('\r\n')) retainedLength += 2
    else if (beforeRetained.endsWith('\r') || beforeRetained.endsWith('\n')) retainedLength += 1
    this.contentTail = value.slice(-retainedLength)
    return value.slice(0, -retainedLength)
  }

  private consumeOptionalLeadingLineBreak(value: string): string {
    if (!this.awaitingLeadingLineBreak && !this.consumeLeadingLineFeed) return value
    let remainder = value
    if (this.consumeLeadingLineFeed) {
      if (remainder.startsWith('\n')) remainder = remainder.slice(1)
      this.consumeLeadingLineFeed = false
      this.awaitingLeadingLineBreak = false
      return remainder
    }
    if (!remainder) return remainder
    this.awaitingLeadingLineBreak = false
    if (remainder.startsWith('\r\n')) return remainder.slice(2)
    if (remainder.startsWith('\n')) return remainder.slice(1)
    if (remainder.startsWith('\r')) {
      remainder = remainder.slice(1)
      this.consumeLeadingLineFeed = remainder.length === 0
    }
    return remainder
  }
}

export function finalReplyText(value: string): string {
  const markerIndex = value.indexOf(FinalOpenTag)
  if (markerIndex < 0) return value
  const content = removeLeadingLineBreak(value.slice(markerIndex + FinalOpenTag.length))
  const closingIndex = content.indexOf(FinalCloseTag)
  return removeTrailingLineBreak(closingIndex < 0 ? content : content.slice(0, closingIndex))
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : undefined
}

function assistantStepKey(notification: HarnessNotification, data: Record<string, unknown>): string {
  return `${string(notification.params.sessionId)}:${number(data.turn) ?? 'turn'}:${number(data.step) ?? 'step'}`
}

function removeLeadingLineBreak(value: string): string {
  return value.replace(/^(?:\r\n|\r|\n)/, '')
}

function removeTrailingLineBreak(value: string): string {
  return value.replace(/(?:\r\n|\r|\n)$/, '')
}

function withoutPartialFinalClose(value: string): string {
  for (let length = FinalCloseTag.length - 1; length > 0; length -= 1) {
    if (value.endsWith(FinalCloseTag.slice(0, length))) {
      return removeTrailingLineBreak(value.slice(0, -length))
    }
  }
  return value
}

function partialFinalCloseLength(value: string): number {
  for (let length = FinalCloseTag.length - 1; length > 0; length -= 1) {
    if (value.endsWith(FinalCloseTag.slice(0, length))) return length
  }
  return 0
}

const FinalOpenTag = '<FINAL>'
const FinalCloseTag = '</FINAL>'

/** Stateful projection of DSH's append-only notifications into ElecKoi's stable process items. */
export class DshProcessProjector {
  private readonly tools = new Map<string, DshProcessItem>()
  private readonly compactions = new Map<string, DshProcessItem>()
  private readonly approvals = new Map<string, DshProcessItem>()
  private readonly reasoning = new Map<string, DshProcessItem>()
  private readonly reasoningEmittedAt = new Map<string, number>()
  private readonly hiddenTools = new Set<string>()
  private readonly pendingSubagentCalls = new Map<string, string[]>()
  private readonly subagentLineageBySession = new Map<string, string[]>()

  constructor(
    private readonly rootSessionId = '',
    private readonly delegatedModel = ''
  ) {}

  project(notification: HarnessNotification): DshProcessItem | undefined {
    if (notification.method === 'subagent.started') {
      this.bindStartedSubagent(notification.params)
      return undefined
    }
    if (notification.method === 'subagent.finished') {
      this.subagentLineageBySession.delete(string(notification.params.childSessionId))
      return undefined
    }
    if (notification.method !== 'session.event') return undefined
    const sessionId = string(notification.params.sessionId)
    const lineage = this.sessionLineage(sessionId)
    if (lineage === undefined) return undefined
    const event = asRecord(notification.params.event)
    const data = asRecord(event?.data) ?? {}
    const time = number(event?.time) ?? Date.now()
    if (event?.type === 'tool/call' && isSubagentTool(string(data.name))) {
      const callId = string(data.callId)
      if (callId) {
        const pending = this.pendingSubagentCalls.get(sessionId) ?? []
        pending.push(callId)
        this.pendingSubagentCalls.set(sessionId, pending)
      }
    }
    const projected = (() => { switch (event?.type) {
      case 'assistant/chunk': return this.assistantChunk(notification, data, time)
      case 'assistant/message': return this.assistantMessage(notification, data, time)
      case 'tool/call': return this.toolStarted(data, time)
      case 'tool/result': return this.toolCompleted(data, time)
      case 'tool/code-dispatch-start': return this.codeToolStarted(data, time)
      case 'tool/code-dispatch': return this.codeToolCompleted(data, time)
      case 'compaction/start': return this.compactionStarted(data, time)
      case 'compaction/summary': return this.compactionSummary(data)
      case 'compaction/end': return this.compactionCompleted(data, time)
      case 'approval/asked': return this.approvalAsked(data, time)
      case 'approval/decided': return this.approvalDecided(data, time)
      case 'todo/write': return completedEventItem('todo-write-' + time, 'tool', 'todo_write', '', '已更新任务计划', json(data), time)
      default: return undefined
    } })()
    const parentId = lineage.at(-1)
    return projected && parentId && !projected.parentId ? { ...projected, parentId } : projected
  }

  private assistantChunk(notification: HarnessNotification, data: Record<string, unknown>, time: number): DshProcessItem | undefined {
    const chunk = asRecord(data.chunk)
    const index = number(chunk?.index)
    if (index === undefined) return undefined
    const id = reasoningItemId(notification, data, index)
    if (chunk?.type === 'block-start' && chunk.blockType === 'reasoning') {
      const item: DshProcessItem = {
        id,
        kind: 'reasoning',
        status: 'running',
        toolName: 'reasoning',
        arguments: '',
        summary: '',
        detail: '',
        startedAtMillis: time
      }
      this.reasoning.set(id, item)
      this.reasoningEmittedAt.set(id, time)
      return item
    }
    if (chunk?.type === 'reasoning-delta' && typeof chunk.text === 'string') {
      const current = this.reasoning.get(id)
      const text = `${current?.detail ?? ''}${chunk.text}`
      const item: DshProcessItem = {
        id,
        kind: 'reasoning',
        status: 'running',
        toolName: 'reasoning',
        arguments: '',
        summary: text,
        detail: text,
        startedAtMillis: current?.startedAtMillis ?? time
      }
      this.reasoning.set(id, item)
      const emittedAt = this.reasoningEmittedAt.get(id) ?? -Infinity
      if (time - emittedAt < ReasoningUpdateIntervalMillis) return undefined
      this.reasoningEmittedAt.set(id, time)
      return item
    }
    const block = asRecord(chunk?.block)
    if (chunk?.type === 'block-end' && block?.type === 'reasoning') {
      return this.completeReasoning(id, string(block.text), time)
    }
    return undefined
  }

  private assistantMessage(notification: HarnessNotification, data: Record<string, unknown>, time: number): DshProcessItem | undefined {
    const message = asRecord(data.message)
    const content = Array.isArray(message?.content) ? message.content.map(asRecord).filter(Boolean) : []
    const reasoningIndex = content.findIndex((block) => block?.type === 'reasoning')
    let completedReasoning: DshProcessItem | undefined
    if (reasoningIndex >= 0) {
      const id = reasoningItemId(notification, data, reasoningIndex)
      if (this.reasoning.has(id)) {
        completedReasoning = this.completeReasoning(id, string(content[reasoningIndex]?.text), time)
      }
    }
    return this.assistantNarrative(data, time) ?? completedReasoning
  }

  private completeReasoning(id: string, snapshot: string, time: number): DshProcessItem {
    const current = this.reasoning.get(id)
    const text = snapshot || current?.detail || ''
    const item: DshProcessItem = {
      id,
      kind: 'reasoning',
      status: 'complete',
      toolName: 'reasoning',
      arguments: '',
      summary: text,
      detail: text,
      startedAtMillis: current?.startedAtMillis ?? time,
      completedAtMillis: time
    }
    this.reasoning.delete(id)
    this.reasoningEmittedAt.delete(id)
    return item
  }

  private assistantNarrative(data: Record<string, unknown>, time: number): DshProcessItem | undefined {
    const message = asRecord(data.message)
    const content = Array.isArray(message?.content) ? message.content.map(asRecord).filter(Boolean) : []
    // Like Android's toProcessBlocks(): assistant prose is a phase boundary only when
    // the same model step continues into tools. A text-only assistant message is FINAL.
    if (!content.some((block) => block?.type === 'tool-call')) return undefined
    const text = content
      .filter((block) => block?.type === 'text')
      .map((block) => string(block?.text))
      .join('')
      .trim()
    if (!text) return undefined
    const messageId = string(message?.id)
    const turn = number(data.turn)
    const step = number(data.step)
    return completedEventItem(
      `narrative-${messageId || `${turn ?? 'turn'}-${step ?? 'step'}-${time}`}`,
      'narrative',
      'assistant_narrative',
      '',
      text,
      text,
      time
    )
  }

  private approvalAsked(data: Record<string, unknown>, time: number): DshProcessItem | undefined {
    const requestId = string(data.id)
    if (!requestId) return undefined
    const id = `approval-${requestId}`
    const item: DshProcessItem = {
      id,
      kind: 'action',
      status: 'running',
      toolName: 'approval',
      arguments: json({ toolName: string(data.toolName), callId: string(data.callId) }),
      summary: string(data.reason) || '等待授权',
      detail: json(data),
      startedAtMillis: time
    }
    this.approvals.set(requestId, item)
    return item
  }

  private approvalDecided(data: Record<string, unknown>, time: number): DshProcessItem | undefined {
    const requestId = string(data.id)
    if (!requestId) return undefined
    const current = this.approvals.get(requestId)
    this.approvals.delete(requestId)
    const outcome = string(data.outcome)
    const status: DshProcessItem['status'] = outcome === 'allowed-once'
      ? 'complete'
      : outcome === 'cancelled' ? 'cancelled' : 'error'
    const summary = outcome === 'allowed-once'
      ? '已授权一次'
      : outcome === 'cancelled' ? '授权已取消' : '已安全拒绝高风险操作'
    return {
      id: `approval-${requestId}`,
      kind: 'action',
      status,
      toolName: 'approval',
      arguments: current?.arguments ?? '',
      summary,
      detail: outcome === 'rejected'
        ? '角色聊天暂未开放高风险操作授权，已安全拒绝'
        : json(data),
      startedAtMillis: current?.startedAtMillis ?? time,
      completedAtMillis: time
    }
  }

  private toolStarted(data: Record<string, unknown>, time: number): DshProcessItem | undefined {
    const id = string(data.callId)
    if (!id) return undefined
    const name = string(data.name)
    if (isCodeTransport(name)) {
      this.hiddenTools.add(id)
      return undefined
    }
    const item: DshProcessItem = {
      id, kind: toolKind(name), status: 'running', toolName: name,
      arguments: serialized(data.arguments), summary: '', detail: '', startedAtMillis: time,
      delegatedModel: isSubagentTool(name) ? this.delegatedModel || undefined : undefined
    }
    this.tools.set(id, item)
    return item
  }

  private toolCompleted(data: Record<string, unknown>, time: number): DshProcessItem | undefined {
    const message = asRecord(data.message)
    const content = Array.isArray(message?.content) ? message.content : []
    const resultBlock = content.map(asRecord).find((block) => block?.type === 'tool-result')
    const source = asRecord(message?.source)
    const id = string(source?.callId) || string(resultBlock?.toolCallId)
    if (!id) return undefined
    if (this.hiddenTools.delete(id)) return undefined
    const current = this.tools.get(id)
    const error = asRecord(data.error)
    const isError = error !== undefined || resultBlock?.isError === true || resultBlock?.isError === 'true'
    const summary = toolResultText(message?.content)
    const item: DshProcessItem = {
      id,
      kind: current?.kind ?? 'tool',
      status: isError ? 'error' : 'complete',
      toolName: current?.toolName ?? '',
      arguments: current?.arguments ?? '',
      summary,
      detail: json(data),
      startedAtMillis: current?.startedAtMillis ?? time,
      completedAtMillis: time,
      delegatedModel: current?.delegatedModel
    }
    this.tools.delete(id)
    return item
  }

  private codeToolStarted(data: Record<string, unknown>, time: number): DshProcessItem | undefined {
    const id = string(data.subCallId)
    if (!id) return undefined
    const name = string(data.name)
    const item: DshProcessItem = {
      id,
      kind: toolKind(name),
      status: 'running',
      toolName: name,
      arguments: serialized(data.arguments),
      summary: '',
      detail: '',
      startedAtMillis: time,
      parentId: string(data.parentCallId) || string(data.rootCallId) || undefined
    }
    this.tools.set(id, item)
    return item
  }

  private codeToolCompleted(data: Record<string, unknown>, time: number): DshProcessItem | undefined {
    const id = string(data.subCallId)
    if (!id) return undefined
    const current = this.tools.get(id)
    this.tools.delete(id)
    return {
      id,
      kind: current?.kind ?? toolKind(string(data.name)),
      status: data.isError === true ? 'error' : 'complete',
      toolName: current?.toolName ?? string(data.name),
      arguments: current?.arguments ?? serialized(data.arguments),
      summary: toolResultText(data.content),
      detail: json(data),
      startedAtMillis: current?.startedAtMillis ?? time,
      completedAtMillis: time,
      parentId: current?.parentId ?? (string(data.parentCallId) || string(data.rootCallId) || undefined)
    }
  }

  private compactionStarted(data: Record<string, unknown>, time: number): DshProcessItem | undefined {
    const rawId = string(data.compactionId)
    if (!rawId) return undefined
    const id = `compaction-${rawId}`
    const item: DshProcessItem = { id, kind: 'compaction', status: 'running', toolName: '', arguments: '', summary: '', detail: '', startedAtMillis: time }
    this.compactions.set(rawId, item)
    return item
  }

  private compactionSummary(data: Record<string, unknown>): undefined {
    const id = string(data.compactionId)
    const item = this.compactions.get(id)
    if (item) item.detail = contentText(data.summary)
    return undefined
  }

  private compactionCompleted(data: Record<string, unknown>, time: number): DshProcessItem | undefined {
    const rawId = string(data.compactionId)
    if (!rawId) return undefined
    const current = this.compactions.get(rawId)
    const error = string(data.error)
    const failure = compactionFailureMessage(error)
    this.compactions.delete(rawId)
    return {
      id: `compaction-${rawId}`, kind: 'compaction', status: error ? 'error' : 'complete',
      toolName: '', arguments: '', summary: failure || '上下文已自动压缩',
      detail: failure || current?.detail || '自动压缩已完成',
      startedAtMillis: current?.startedAtMillis ?? time, completedAtMillis: time
    }
  }

  private sessionLineage(sessionId: string): string[] | undefined {
    if (!this.rootSessionId || sessionId === this.rootSessionId) return []
    return this.subagentLineageBySession.get(sessionId)
  }

  private bindStartedSubagent(params: Record<string, unknown>): void {
    const parentSessionId = string(params.parentSessionId)
    const childSessionId = string(params.childSessionId)
    if (!parentSessionId || !childSessionId) return
    const parentLineage = !this.rootSessionId || parentSessionId === this.rootSessionId
      ? []
      : this.subagentLineageBySession.get(parentSessionId)
    if (parentLineage === undefined) return
    const pending = this.pendingSubagentCalls.get(parentSessionId)
    const parentCallId = pending?.shift()
    if (!parentCallId) return
    if (!pending?.length) this.pendingSubagentCalls.delete(parentSessionId)
    this.subagentLineageBySession.set(childSessionId, [...parentLineage, parentCallId])
  }
}

function reasoningItemId(notification: HarnessNotification, data: Record<string, unknown>, index: number): string {
  return `reasoning-${assistantStepKey(notification, data)}:${index}`
}

const ReasoningUpdateIntervalMillis = 50

function completedEventItem(id: string, kind: DshProcessItem['kind'], toolName: string, args: string, summary: string, detail: string, time: number): DshProcessItem {
  return { id, kind, status: 'complete', toolName, arguments: args, summary, detail, startedAtMillis: time, completedAtMillis: time }
}

function toolKind(name: string): DshProcessItem['kind'] {
  if (name === 'subagent' || name === 'subagent_fork') return 'subagent'
  if (name === 'pwsh' || name === 'bash' || name === 'shell_command' || name === 'exec_command') return 'command'
  if (name === 'write' || name === 'edit' || name === 'apply_patch') return 'file_change'
  if (name === 'update_plan' || name === 'update_roleplay_plan' || name === 'todo_write') return 'action'
  return 'tool'
}

function isSubagentTool(name: string): boolean {
  return name === 'subagent' || name === 'subagent_fork'
}

function isCodeTransport(name: string): boolean {
  return name === 'code' || name === 'run_code'
}

function toolResultText(value: unknown): string {
  if (Array.isArray(value)) return value.map(toolResultText).filter(Boolean).join('\n')
  const record = asRecord(value)
  if (!record) return typeof value === 'string' ? value : ''
  if (record.type === 'text') return string(record.text)
  if (record.type === 'tool-result') return toolResultText(record.content)
  return ''
}

function contentText(value: unknown): string {
  if (Array.isArray(value)) return value.map(contentText).filter(Boolean).join('\n')
  const record = asRecord(value)
  return record?.type === 'text' ? string(record.text) : typeof value === 'string' ? value : ''
}

function string(value: unknown): string { return typeof value === 'string' ? value : '' }
function number(value: unknown): number | undefined { return typeof value === 'number' && Number.isFinite(value) ? value : undefined }
function json(value: unknown): string { try { return JSON.stringify(value, null, 2) } catch { return String(value) } }
function serialized(value: unknown): string { return typeof value === 'string' ? value : json(value) }

function compactionFailureMessage(error: string): string {
  if (!error) return ''
  const notSmaller = /summary is not smaller than the shadowed content \((\d+) estimated framed tokens >= (\d+)\)/i.exec(error)
  if (notSmaller) {
    return `摘要没有比被替换的历史更短（摘要约 ${notSmaller[1]} Token，原历史约 ${notSmaller[2]} Token）`
  }
  if (/summarization produced no text summary content/i.test(error)) return '摘要模型没有返回可用的文本内容'
  if (/summary did not shrink history/i.test(error)) return '生成的摘要没有缩短历史上下文'
  return error
}
