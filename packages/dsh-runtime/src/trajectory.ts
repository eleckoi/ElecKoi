import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync
} from 'node:fs'
import { isAbsolute, join, relative } from 'node:path'
import { decodeStorageRecord } from '@deepseek-ai/dsh-session'

export type DshTrajectoryRecordKind =
  | 'system'
  | 'user'
  | 'context'
  | 'assistant'
  | 'tool'
  | 'compaction'

export type DshTrajectoryRecordStatus = 'running' | 'complete' | 'error' | 'cancelled'

export interface DshTrajectoryRequest {
  number: number
  seq: number
  turn: number | null
  step: number | null
  status: DshTrajectoryRecordStatus
  reason: string
  provider: string
  model: string
  detail: string
  rawJson: string
  timeMillis: number | null
  durationMillis: number | null
}

export interface DshTrajectoryRecord {
  id: string
  index: number
  seq: number
  type: string
  kind: DshTrajectoryRecordKind
  title: string
  preview: string
  source: string
  input: string
  output: string
  detail: string
  rawJson: string
  timeMillis: number | null
  durationMillis: number | null
  turn: number | null
  step: number | null
  status: DshTrajectoryRecordStatus
  requests: DshTrajectoryRequest[]
}

export interface DshTrajectoryPage {
  runtimeThreadId: string
  records: DshTrajectoryRecord[]
  totalRecords: number
  hasMore: boolean
  beforeIndex: number | null
  startedAtMillis: number | null
  completedAtMillis: number | null
}

export interface DshTrajectoryReadOptions {
  beforeIndex?: number | undefined
  limit?: number | undefined
}

export interface DshSessionHeader {
  type?: unknown
  id?: unknown
  createdAt?: unknown
}

export interface DshSessionEventRecord {
  type?: unknown
  seq?: unknown
  time?: unknown
  data?: unknown
  ignorable?: unknown
  sourceEventSeqs?: unknown
  surfaceOp?: unknown
}

interface NormalizedEvent extends DshSessionEventRecord {
  type: string
  seq: number
  time: number | null
  data: Record<string, unknown>
}

interface PendingRequest {
  request: DshTrajectoryRequest
  attached: boolean
}

export function readDshTrajectory(
  sessionRoot: string,
  runtimeThreadId: string,
  options: DshTrajectoryReadOptions = {},
  liveEvents: readonly DshSessionEventRecord[] = []
): DshTrajectoryPage {
  const empty = emptyPage(runtimeThreadId)
  const located = locateSessionLog(sessionRoot, runtimeThreadId)
  if (located === undefined && liveEvents.length === 0) return empty
  const source = located === undefined ? '' : readFileSync(located, 'utf8')
  const lines = source ? source.split(/\r?\n/) : []
  const header = located === undefined ? {} : parseHeader(lines[0], runtimeThreadId)
  const events: DshSessionEventRecord[] = []
  const finalLineIndex = source.endsWith('\n') || source.endsWith('\r') ? lines.length : lines.length - 1

  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index]?.trim()
    if (!line) continue
    let stored: unknown
    try {
      stored = JSON.parse(line)
    } catch (error) {
      if (index === finalLineIndex) break
      throw new Error('DSH 轨迹日志包含损坏的记录。', { cause: error })
    }
    try {
      for (const event of decodeStorageRecord(stored)) {
        if (isRecord(event)) events.push(event)
      }
    } catch (error) {
      throw new Error('DSH 轨迹日志中的流式记录无法解码。', { cause: error })
    }
  }

  const projected = projectDshTrajectory(mergeLiveEvents(events, liveEvents), header)
  const beforeIndex = options.beforeIndex
  const eligible = beforeIndex === undefined
    ? projected.records
    : projected.records.filter((record) => record.index < beforeIndex)
  const limit = Math.max(1, Math.min(1_000, options.limit ?? 400))
  const start = Math.max(0, eligible.length - limit)
  const records = eligible.slice(start)
  return {
    runtimeThreadId,
    records,
    totalRecords: projected.records.length,
    hasMore: start > 0,
    beforeIndex: records[0]?.index ?? null,
    startedAtMillis: projected.startedAtMillis,
    completedAtMillis: projected.completedAtMillis
  }
}

function mergeLiveEvents(
  durableEvents: readonly DshSessionEventRecord[],
  liveEvents: readonly DshSessionEventRecord[]
): DshSessionEventRecord[] {
  const merged = new Map<number, DshSessionEventRecord>()
  durableEvents.forEach((event, index) => merged.set(nonnegativeInteger(event.seq) ?? index, event))
  liveEvents.forEach((event, index) => merged.set(
    nonnegativeInteger(event.seq) ?? durableEvents.length + index,
    event
  ))
  return [...merged.entries()].sort(([left], [right]) => left - right).map(([, event]) => event)
}

export function projectDshTrajectory(
  input: readonly DshSessionEventRecord[],
  header: DshSessionHeader = {}
): Pick<DshTrajectoryPage, 'records' | 'startedAtMillis' | 'completedAtMillis'> {
  const events = input.map((event, index) => normalizeEvent(event, index))
  const records: DshTrajectoryRecord[] = []
  const initialSystemRecords: DshTrajectoryRecord[] = []
  const stepStarts = new Map<string, number>()
  const toolRecords = new Map<string, DshTrajectoryRecord>()
  const subtoolRecords = new Map<string, DshTrajectoryRecord>()
  const compactionRecords = new Map<string, DshTrajectoryRecord>()
  const approvalRecords = new Map<string, DshTrajectoryRecord>()
  const pendingRequests: PendingRequest[] = []
  let requestCount = 0
  let previousPromptSignature: string | undefined
  let currentRequestHeader: {
    reason: string
    provider: string
    model: string
    detail: string
  } | undefined
  let activeTurn: number | null = null
  let activeStep: number | null = null

  const attachRequests = (
    item: DshTrajectoryRecord,
    turn: number | null,
    step: number | null,
    completedAt: number | null
  ) => {
    const matches = pendingRequests.filter((pending) => !pending.attached
      && pending.request.turn === turn
      && pending.request.step === step)
    if (matches.length === 0) return
    for (const pending of matches) {
      const request = pending.request
      pending.attached = true
      request.status = item.status === 'error' ? 'error' : 'complete'
      request.durationMillis = duration(request.timeMillis, completedAt)
      item.requests.push(request)
    }
  }

  for (const event of events) {
    const data = record(event.data)
    const type = event.type
    const eventTurn = positiveInteger(data.turn)
    const eventStep = positiveInteger(data.step)
    const time = nonnegativeInteger(event.time)

    if (type === 'turn/start') {
      activeTurn = eventTurn
      activeStep = null
      continue
    }

    if (type === 'step/start') {
      activeTurn = eventTurn ?? activeTurn
      activeStep = eventStep
      if (activeTurn !== null && activeStep !== null) {
        if (time !== null) stepStarts.set(stepKey(activeTurn, activeStep), time)
        pendingRequests.push({
          attached: false,
          request: {
            number: ++requestCount,
            seq: event.seq,
            turn: activeTurn,
            step: activeStep,
            status: 'running',
            reason: currentRequestHeader?.reason ?? 'step/start',
            provider: currentRequestHeader?.provider ?? '',
            model: currentRequestHeader?.model ?? '',
            detail: currentRequestHeader?.detail ?? pretty(data),
            rawJson: pretty(event),
            timeMillis: time,
            durationMillis: null
          }
        })
      }
      continue
    }

    if (type === 'step/end') {
      activeStep = null
      continue
    }

    if (type === 'turn/end') {
      activeTurn = null
      activeStep = null
      continue
    }

    const turn = eventTurn ?? activeTurn
    const step = eventStep ?? activeStep

    if (type === 'request/header') {
      const requestHeader = record(data.header)
      const system = text(requestHeader.system)
      const reason = text(data.reason)
      const config = record(requestHeader.config)
      const promptSignature = pretty({ system, tools: array(requestHeader.tools) })
      const promptChanged = previousPromptSignature === undefined
        || promptSignature !== previousPromptSignature
      currentRequestHeader = {
        reason: reason || 'request/header',
        provider: text(config.provider),
        model: text(config.model),
        detail: pretty(requestHeader)
      }
      const activeRequest = [...pendingRequests].reverse().find((pending) => !pending.attached
        && pending.request.turn === turn
        && pending.request.step === step)
      if (activeRequest !== undefined) {
        Object.assign(activeRequest.request, currentRequestHeader)
        activeRequest.request.rawJson = pretty([parseJson(activeRequest.request.rawJson), event])
      }
      if (promptChanged) {
        const initial = previousPromptSignature === undefined
        const item = baseRecord(event, {
          kind: 'system',
          title: initial ? '初始系统提示词' : '系统提示词更新',
          preview: preview(system || (initial ? '初始系统提示词' : '系统提示词更新')),
          source: reason || 'request/header',
          input: system,
          detail: pretty(requestHeader),
          turn, step
        })
        if (initial) initialSystemRecords.push(item)
        else records.push(item)
      }
      previousPromptSignature = promptSignature
      continue
    }

    if (type === 'user/message') {
      const message = messageFrom(data)
      const source = record(message.source)
      const sourceKind = text(source.kind)
      const content = contentText(message.content)
      const kind: DshTrajectoryRecordKind = sourceKind === 'user' || sourceKind === '' ? 'user' : 'context'
      records.push(baseRecord(event, {
        kind,
        title: kind === 'user' ? '用户消息' : contextTitle(sourceKind),
        preview: preview(content),
        source: sourceKind || 'user',
        input: content,
        detail: pretty(message),
        turn, step
      }))
      continue
    }

    if (type === 'assistant/message') {
      const message = messageFrom(data)
      const content = contentText(message.content)
      const source = record(message.source)
      const startedAt = turn !== null && step !== null ? stepStarts.get(stepKey(turn, step)) : undefined
      const item = baseRecord(event, {
        kind: 'assistant',
        title: '助手消息',
        preview: preview(content || assistantFallback(message.content)),
        source: [text(source.provider), text(source.model)].filter(Boolean).join(' · ') || 'model',
        output: content,
        detail: pretty({ message, usage: data.usage }),
        durationMillis: duration(startedAt, time),
        turn, step
      })
      attachRequests(item, turn, step, time)
      records.push(item)
      continue
    }

    if (type === 'tool/call') {
      const callId = text(data.callId)
      if (!callId) continue
      const name = text(data.name) || 'tool'
      const inputText = prettyValue(data.arguments)
      const item = baseRecord(event, {
        kind: 'tool', title: name,
        preview: preview(toolTarget(data.arguments) || inputText || name),
        source: callId,
        input: inputText,
        detail: pretty(data),
        turn, step,
        status: 'running'
      })
      attachRequests(item, turn, step, time)
      toolRecords.set(callId, item)
      records.push(item)
      continue
    }

    if (type === 'tool/result') {
      const message = messageFrom(data)
      const source = record(message.source)
      const resultBlock = array(message.content).map(record).find((block) => text(block.type) === 'tool-result')
      const callId = text(source.callId) || text(resultBlock?.toolCallId)
      const output = contentText(resultBlock?.content ?? message.content)
      const item = callId ? toolRecords.get(callId) : undefined
      if (item !== undefined) {
        item.output = output
        item.status = resultBlock?.isError === true || resultBlock?.isError === 'true' || data.error !== undefined
          ? 'error' : 'complete'
        item.durationMillis = duration(item.timeMillis, time)
        item.detail = pretty({ call: parseJsonOrValue(item.input), result: data })
        item.rawJson = pretty([parseJson(item.rawJson), event])
      } else {
        records.push(baseRecord(event, {
          kind: 'tool', title: '工具结果', preview: preview(output), source: callId || 'tool',
          output, detail: pretty(data), turn, step,
          status: resultBlock?.isError === true || resultBlock?.isError === 'true' ? 'error' : 'complete'
        }))
      }
      continue
    }

    if (type === 'tool/code-dispatch-start') {
      const callId = text(data.subCallId)
      if (!callId) continue
      const name = text(data.name) || 'subtool'
      const inputText = prettyValue(data.arguments)
      const item = baseRecord(event, {
        kind: 'tool', title: name,
        preview: preview(toolTarget(data.arguments) || inputText || name),
        source: callId,
        input: inputText,
        detail: pretty(data),
        turn, step,
        status: 'running'
      })
      subtoolRecords.set(callId, item)
      records.push(item)
      continue
    }

    if (type === 'tool/code-dispatch') {
      const callId = text(data.subCallId)
      const output = contentText(data.content)
      const item = subtoolRecords.get(callId)
      if (item !== undefined) {
        item.output = output
        item.status = data.isError === true ? 'error' : 'complete'
        item.durationMillis = duration(item.timeMillis, time)
        item.detail = pretty(data)
        item.rawJson = pretty([parseJson(item.rawJson), event])
      }
      continue
    }

    if (type === 'compaction/start') {
      const id = text(data.compactionId) || String(event.seq)
      const item = baseRecord(event, {
        kind: 'compaction', title: '上下文压缩', preview: '正在压缩上下文', source: id,
        detail: pretty(data), turn, step, status: 'running'
      })
      compactionRecords.set(id, item)
      records.push(item)
      continue
    }

    if (type === 'compaction/summary') {
      const id = text(data.compactionId)
      const item = compactionRecords.get(id)
      if (item !== undefined) {
        item.output = contentText(data.summary)
        item.preview = preview(item.output || '上下文摘要已生成')
        item.detail = pretty(data)
        item.rawJson = appendRaw(item.rawJson, event)
      }
      continue
    }

    if (type === 'compaction/end') {
      const id = text(data.compactionId)
      const item = compactionRecords.get(id)
      if (item !== undefined) {
        item.status = data.error === undefined ? 'complete' : 'error'
        item.durationMillis = duration(item.timeMillis, time)
        item.detail = pretty(data)
        item.rawJson = appendRaw(item.rawJson, event)
      }
      continue
    }

    if (type === 'approval/asked') {
      const id = text(data.id)
      if (!id) continue
      const item = baseRecord(event, {
        kind: 'tool', title: '授权请求', preview: preview(text(data.reason)),
        source: text(data.toolName) || id, input: pretty(data), detail: pretty(data),
        turn, step, status: 'running'
      })
      approvalRecords.set(id, item)
      records.push(item)
      continue
    }

    if (type === 'approval/decided') {
      const id = text(data.id)
      const item = approvalRecords.get(id)
      if (item !== undefined) {
        const outcome = text(data.outcome)
        item.status = outcome === 'allowed-once' ? 'complete' : outcome === 'cancelled' ? 'cancelled' : 'error'
        item.output = pretty(data)
        item.durationMillis = duration(item.timeMillis, time)
        item.detail = pretty(data)
        item.rawJson = appendRaw(item.rawJson, event)
      }
    }
  }

  const orderedRecords = [...initialSystemRecords, ...records]
  orderedRecords.forEach((item, index) => { item.index = index + 1 })
  const times = events.map((event) => nonnegativeInteger(event.time)).filter((value): value is number => value !== null)
  const createdAt = nonnegativeInteger(header.createdAt)
  return {
    records: orderedRecords,
    startedAtMillis: createdAt ?? times[0] ?? null,
    completedAtMillis: times.at(-1) ?? createdAt
  }
}

function emptyPage(runtimeThreadId: string): DshTrajectoryPage {
  return {
    runtimeThreadId,
    records: [],
    totalRecords: 0,
    hasMore: false,
    beforeIndex: null,
    startedAtMillis: null,
    completedAtMillis: null
  }
}

function locateSessionLog(sessionRoot: string, runtimeThreadId: string): string | undefined {
  if (!/^[A-Za-z0-9._-]{1,160}$/.test(runtimeThreadId) || !existsSync(sessionRoot)) return undefined
  const root = realpathSync(sessionRoot)
  for (const project of readdirSync(root, { withFileTypes: true })) {
    if (!project.isDirectory() || project.isSymbolicLink()) continue
    const sessionDirectory = join(root, project.name, runtimeThreadId)
    if (!existsSync(sessionDirectory)) continue
    const stat = lstatSync(sessionDirectory)
    if (!stat.isDirectory() || stat.isSymbolicLink()) continue
    const resolved = realpathSync(sessionDirectory)
    const relativePath = relative(root, resolved)
    if (!relativePath || relativePath.startsWith('..') || isAbsolute(relativePath)) continue
    const candidate = join(resolved, 'session.jsonl')
    if (!existsSync(candidate) || !lstatSync(candidate).isFile()) continue
    const firstLine = readFileSync(candidate, 'utf8').split(/\r?\n/, 1)[0]
    try {
      const header = JSON.parse(firstLine ?? '') as DshSessionHeader
      if (header.type === 'session' && header.id === runtimeThreadId) return candidate
    } catch {
      continue
    }
  }
  return undefined
}

function parseHeader(line: string | undefined, runtimeThreadId: string): DshSessionHeader {
  try {
    const header = JSON.parse(line ?? '') as DshSessionHeader
    if (header.type !== 'session' || header.id !== runtimeThreadId) throw new Error('会话标识不匹配。')
    return header
  } catch (error) {
    throw new Error('DSH 轨迹日志缺少有效的会话头。', { cause: error })
  }
}

function normalizeEvent(event: DshSessionEventRecord, index: number): NormalizedEvent {
  return {
    ...event,
    type: text(event.type) || 'unknown',
    seq: nonnegativeInteger(event.seq) ?? index,
    time: nonnegativeInteger(event.time),
    data: record(event.data)
  }
}

function baseRecord(
  event: NormalizedEvent,
  value: {
    kind: DshTrajectoryRecordKind
    title: string
    preview: string
    source: string
    input?: string | undefined
    output?: string | undefined
    detail: string
    durationMillis?: number | null | undefined
    turn: number | null
    step: number | null
    status?: DshTrajectoryRecordStatus | undefined
  }
): DshTrajectoryRecord {
  return {
    id: `${event.type}:${event.seq}`,
    index: 0,
    seq: event.seq,
    type: event.type,
    kind: value.kind,
    title: value.title,
    preview: value.preview,
    source: value.source,
    input: value.input ?? '',
    output: value.output ?? '',
    detail: value.detail,
    rawJson: pretty(event),
    timeMillis: event.time,
    durationMillis: value.durationMillis ?? null,
    turn: value.turn,
    step: value.step,
    status: value.status ?? 'complete',
    requests: []
  }
}

function messageFrom(data: Record<string, unknown>): Record<string, unknown> {
  return isRecord(data.message) ? data.message : data
}

function contentText(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(contentText).filter(Boolean).join('\n')
  if (!isRecord(value)) return ''
  const type = text(value.type)
  if (type === 'text') return text(value.text)
  if (type === 'reasoning') return text(value.text)
  if (type === 'image') return '[图片]'
  if (type === 'tool-call') {
    const name = text(value.name) || 'tool'
    const args = prettyValue(value.arguments)
    return args ? `调用 ${name}\n${args}` : `调用 ${name}`
  }
  if (type === 'tool-result') return contentText(value.content)
  return text(value.text) || contentText(value.content)
}

function assistantFallback(content: unknown): string {
  const names = array(content).map(record).filter((block) => text(block.type) === 'tool-call').map((block) => text(block.name)).filter(Boolean)
  return names.length ? `调用 ${names.join('、')}` : '助手事件'
}

function contextTitle(source: string): string {
  const labels: Record<string, string> = {
    'agent-instructions': 'Agent 指令',
    'runtime-context': '运行时上下文',
    'system-reminder': '系统提醒',
    'tool': '工具上下文'
  }
  return labels[source] ?? '上下文'
}

function toolTarget(value: unknown): string {
  const parsed = parseJsonOrValue(value)
  if (!isRecord(parsed)) return ''
  for (const key of ['path', 'pattern', 'query', 'command', 'description', 'task', 'url']) {
    const candidate = text(parsed[key])
    if (candidate) return candidate
  }
  return ''
}

function appendRaw(rawJson: string, event: DshSessionEventRecord): string {
  const existing = parseJson(rawJson)
  return pretty(Array.isArray(existing) ? [...existing, event] : [existing, event])
}

function duration(start: number | null | undefined, end: number | null): number | null {
  if (start === undefined || start === null || end === null || end < start) return null
  return end - start
}

function preview(value: string): string {
  const compact = value.replace(/\s+/g, ' ').trim()
  return compact.length > 180 ? `${compact.slice(0, 179)}…` : compact
}

function prettyValue(value: unknown): string {
  const parsed = parseJsonOrValue(value)
  return typeof parsed === 'string' ? parsed : parsed === undefined ? '' : pretty(parsed)
}

function parseJsonOrValue(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try { return JSON.parse(value) } catch { return value }
}

function parseJson(value: string): unknown {
  try { return JSON.parse(value) } catch { return value }
}

function pretty(value: unknown): string {
  try { return JSON.stringify(value, null, 2) ?? '' } catch { return String(value) }
}

function stepKey(turn: number, step: number): string { return `${turn}\u0000${step}` }
function text(value: unknown): string { return typeof value === 'string' ? value : '' }
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : [] }
function record(value: unknown): Record<string, unknown> { return isRecord(value) ? value : {} }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function nonnegativeInteger(value: unknown): number | null { return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null }
function positiveInteger(value: unknown): number | null { return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null }
