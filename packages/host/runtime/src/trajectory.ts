import {
  existsSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync
} from 'node:fs'
import { dirname, isAbsolute, join, relative } from 'node:path'
import { assistantStreamFirstTokenTime, type AssistantStreamRecord } from '@deepseek-ai/dsh-llm'
import { createSessionFormatCatalogWithChildren, historicalSessionFormatCatalog, sessionFormatCatalog, SessionFormatUnsupportedMigrationError } from '@deepseek-ai/dsh-session-format-catalog'
import { historicalChildCatalogSource } from '@deepseek-ai/dsh-session-format-v3-to-v4'

const REQUEST_PROJECTION_PLUGIN = 'eleckoi-request-projection'

export type DshTrajectoryRecordKind =
  | 'system'
  | 'user'
  | 'context'
  | 'assistant'
  | 'tool'
  | 'compaction'

export type DshTrajectoryRecordStatus = 'running' | 'complete' | 'error' | 'cancelled'

export interface DshTrajectoryUsage {
  input?: number
  cacheRead?: number
  cacheWrite?: number
  output?: number
  reasoning?: number
}

export interface DshTrajectoryRequest {
  purpose: 'assistant' | 'compaction'
  number: number
  seq: number
  turn: number | null
  step: number | null
  status: DshTrajectoryRecordStatus
  reason: string
  provider: string
  model: string
  requestConfig: Record<string, unknown> | null
  usage: DshTrajectoryUsage | null
  cumulativeUsage: DshTrajectoryUsage | null
  detail: string
  rawJson: string
  timeMillis: number | null
  durationMillis: number | null
  startedAt: number | null
  completedAt: number | null
  firstTokenTime: number | null
  resultSeq: number | null
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

type RestoredDshSessionLog = {
  path: string
} & ReturnType<ReturnType<typeof sessionFormatCatalog.createRestore>['finish']>

interface SessionLogCacheEntry {
  path: string
  fileVersion: string
  directoryVersion: string
  value: RestoredDshSessionLog
}

const SESSION_LOG_CACHE_LIMIT = 128
const sessionLogCache = new Map<string, SessionLogCacheEntry>()

export function readDshTrajectory(
  sessionLogRoot: string,
  runtimeThreadId: string,
  options: DshTrajectoryReadOptions = {},
  liveEvents: readonly DshSessionEventRecord[] = []
): DshTrajectoryPage {
  const empty = emptyPage(runtimeThreadId)
  const stored = readDshSessionLog(sessionLogRoot, runtimeThreadId)
  if (stored === undefined && liveEvents.length === 0) return empty
  const projected = projectDshTrajectory(mergeLiveEvents(stored?.events ?? [], liveEvents), stored?.header ?? {})
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

/** Decode a stored Session through the locked DSH format catalog. */
export function readDshSessionLog(
  sessionLogRoot: string,
  runtimeThreadId: string
): RestoredDshSessionLog | undefined {
  const cacheKey = `${sessionLogRoot}\u0000${runtimeThreadId}`
  const cached = sessionLogCache.get(cacheKey)
  if (cached !== undefined) {
    const fileVersion = filesystemVersion(cached.path)
    const directoryVersion = filesystemVersion(dirname(cached.path))
    if (fileVersion === cached.fileVersion && directoryVersion === cached.directoryVersion) {
      sessionLogCache.delete(cacheKey)
      sessionLogCache.set(cacheKey, cached)
      return cached.value
    }
    sessionLogCache.delete(cacheKey)
  }
  const located = locateSessionLog(sessionLogRoot, runtimeThreadId)
  if (located === undefined) return undefined
  const source = readFileSync(located, 'utf8')
  const lines = source.split(/\r?\n/)
  const headerValue = parseJsonLine(lines[0], 'DSH 轨迹日志缺少有效的会话头。')
  let restore: ReturnType<typeof sessionFormatCatalog.createRestore>
  let historical = false
  try {
    const descriptor = sessionFormatCatalog.readHeader(headerValue)
    if (descriptor.status === 'malformed' || descriptor.status === 'unsupported') {
      throw new Error('Unsupported Session header')
    }
    const catalog = descriptor.status === 'migration-required'
      ? createSessionFormatCatalogWithChildren(collectHistoricalChildren(located, descriptor.header.id))
      : sessionFormatCatalog
    historical = descriptor.status === 'migration-required'
    restore = catalog.createRestore(headerValue, {
      recovery: 'recoverable',
      validation: 'transformed'
    })
  } catch (error) {
    throw new Error('DSH 轨迹日志缺少有效的会话头。', { cause: error })
  }
  if (restore.header.id !== runtimeThreadId) throw new Error('DSH 轨迹日志缺少有效的会话头。')
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
      restore.decodeRow(stored)
    } catch (error) {
      throw new Error('DSH 轨迹日志中的流式记录无法解码。', { cause: error })
    }
  }
  try {
    const artifact = restore.finish()
    const result = { path: located, ...artifact }
    if (!historical) rememberSessionLog(cacheKey, result)
    return result
  } catch (error) {
    if (historical && error instanceof SessionFormatUnsupportedMigrationError) {
      try {
        const legacy = historicalSessionFormatCatalog.createRestore(headerValue, {
          recovery: 'recoverable', validation: 'transformed'
        })
        for (let index = 1; index < lines.length; index += 1) {
          const line = lines[index]?.trim()
          if (!line) continue
          let stored: unknown
          try { stored = JSON.parse(line) } catch { break }
          legacy.decodeRow(stored)
        }
        return { path: located, ...legacy.finish() }
      } catch (historicalError) {
        throw new Error('DSH 历史会话日志无法解码。', { cause: historicalError })
      }
    }
    throw new Error('DSH 轨迹日志中的流式记录无法解码。', { cause: error })
  }
}

/** Removes one stored Session and every persisted subagent descended from it. */
export function removeDshSessionTree(sessionLogRoot: string, runtimeThreadId: string): void {
  if (!runtimeThreadId || !existsSync(sessionLogRoot)) return
  const root = realpathSync(sessionLogRoot)
  const stored = storedSessionDirectories(root)
  const discarded = new Set([runtimeThreadId])
  let changed = true
  while (changed) {
    changed = false
    for (const item of stored) {
      if (!item.parentSession || discarded.has(item.id) || !discarded.has(item.parentSession)) continue
      discarded.add(item.id)
      changed = true
    }
  }
  for (const item of stored) {
    if (!discarded.has(item.id)) continue
    rmSync(item.directory, { recursive: true, force: true })
    sessionLogCache.delete(`${sessionLogRoot}\u0000${item.id}`)
  }
}

function storedSessionDirectories(root: string): Array<{ id: string; parentSession?: string; directory: string }> {
  const stored: Array<{ id: string; parentSession?: string; directory: string }> = []
  for (const project of readdirSync(root, { withFileTypes: true })) {
    if (!project.isDirectory() || project.isSymbolicLink()) continue
    const projectDirectory = join(root, project.name)
    for (const session of readdirSync(projectDirectory, { withFileTypes: true })) {
      if (!session.isDirectory() || session.isSymbolicLink()) continue
      const directory = realpathSync(join(projectDirectory, session.name))
      const relativePath = relative(root, directory)
      if (!relativePath || relativePath.startsWith('..') || isAbsolute(relativePath)) continue
      const log = latestSessionLog(directory)
      if (log === undefined) continue
      try {
        const firstLine = readFileSync(log, 'utf8').split(/\r?\n/, 1)[0]
        const result = sessionFormatCatalog.readHeader(JSON.parse(firstLine ?? ''))
        if (result.status === 'malformed' || result.status === 'unsupported') continue
        stored.push({
          id: result.header.id,
          ...(result.header.parentSession ? { parentSession: result.header.parentSession } : {}),
          directory
        })
      } catch {
        continue
      }
    }
  }
  return stored
}

function filesystemVersion(path: string): string | undefined {
  try {
    const stats = statSync(path, { bigint: true })
    return `${stats.dev}:${stats.ino}:${stats.size}:${stats.mtimeNs}:${stats.ctimeNs}`
  } catch {
    return undefined
  }
}

function rememberSessionLog(cacheKey: string, value: RestoredDshSessionLog): void {
  const fileVersion = filesystemVersion(value.path)
  const directoryVersion = filesystemVersion(dirname(value.path))
  if (fileVersion === undefined || directoryVersion === undefined) return
  sessionLogCache.set(cacheKey, { path: value.path, fileVersion, directoryVersion, value })
  while (sessionLogCache.size > SESSION_LOG_CACHE_LIMIT) {
    const oldest = sessionLogCache.keys().next().value
    if (oldest === undefined) break
    sessionLogCache.delete(oldest)
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
  const syntheticSeedStepSeqs = findSyntheticSeedStepSeqs(events)
  const records: DshTrajectoryRecord[] = []
  const stepStarts = new Map<string, number>()
  const firstTokenTimes = new Map<string, number>()
  const toolRecords = new Map<string, DshTrajectoryRecord>()
  const subtoolRecords = new Map<string, DshTrajectoryRecord>()
  const compactionRecords = new Map<string, DshTrajectoryRecord>()
  const approvalRecords = new Map<string, DshTrajectoryRecord>()
  const pendingRequests: PendingRequest[] = []
  let requestCount = 0
  let currentRequestHeader: {
    reason: string
    provider: string
    model: string
    requestConfig: Record<string, unknown>
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
      request.completedAt = completedAt
      request.resultSeq = item.seq
      item.requests.push(request)
    }
  }

  const settleAssistantRequests = (
    turn: number | null,
    step: number | null,
    completedAt: number | null,
    firstTokenTime: number | null,
    usage: DshTrajectoryUsage | null,
    resultSeq: number,
    interrupted: boolean
  ) => {
    for (const pending of pendingRequests) {
      const request = pending.request
      if (request.turn !== turn || request.step !== step) continue
      request.status = interrupted ? 'error' : 'complete'
      request.completedAt = completedAt
      request.firstTokenTime = firstTokenTime
      request.resultSeq = resultSeq
      request.durationMillis = duration(request.startedAt, completedAt)
      request.usage = usage
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
      if (activeTurn !== null && activeStep !== null && !syntheticSeedStepSeqs.has(event.seq)) {
        if (time !== null) stepStarts.set(stepKey(activeTurn, activeStep), time)
        pendingRequests.push({
          attached: false,
          request: {
            purpose: 'assistant',
            number: ++requestCount,
            seq: event.seq,
            turn: activeTurn,
            step: activeStep,
            status: 'running',
            reason: currentRequestHeader?.reason ?? 'step/start',
            provider: currentRequestHeader?.provider ?? '',
            model: currentRequestHeader?.model ?? '',
            requestConfig: currentRequestHeader?.requestConfig ?? null,
            usage: null,
            cumulativeUsage: null,
            detail: currentRequestHeader?.detail ?? pretty(data),
            rawJson: pretty(event),
            timeMillis: time,
            durationMillis: null,
            startedAt: time,
            completedAt: null,
            firstTokenTime: null,
            resultSeq: null
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
      const { system: _system, ...visibleRequestHeader } = requestHeader
      const reason = text(data.reason)
      const config = record(visibleRequestHeader.config)
      currentRequestHeader = {
        reason: reason || 'request/header',
        provider: text(config.provider),
        model: text(config.model),
        requestConfig: config,
        detail: pretty(visibleRequestHeader)
      }
      const activeRequest = [...pendingRequests].reverse().find((pending) => !pending.attached
        && pending.request.turn === turn
        && pending.request.step === step)
      if (activeRequest !== undefined) {
        Object.assign(activeRequest.request, currentRequestHeader)
        activeRequest.request.rawJson = pretty([
          parseJson(activeRequest.request.rawJson),
          { ...event, data: { ...data, header: visibleRequestHeader } }
        ])
      }
      continue
    }

    if (type === 'assistant/chunk' || type === 'assistant/live-chunk') {
      const chunk = record(data.chunk)
      if (turn !== null && step !== null && time !== null && isAssistantTokenDelta(chunk)) {
        const key = stepKey(turn, step)
        if (!firstTokenTimes.has(key)) firstTokenTimes.set(key, time)
      }
      continue
    }

    if (type === 'assistant/attempt') {
      if (turn !== null && step !== null) {
        const firstTokenTime = assistantFirstTokenTime(data.stream)
        if (firstTokenTime !== null && !firstTokenTimes.has(stepKey(turn, step))) {
          firstTokenTimes.set(stepKey(turn, step), firstTokenTime)
        }
      }
      continue
    }

    if (type === 'user/message') {
      const message = messageFrom(data)
      const source = record(message.source)
      if (text(source.kind) === `plugin:${REQUEST_PROJECTION_PLUGIN}`) continue
      const sourceKind = text(source.kind)
      const content = contentText(message.content)
      const kind: DshTrajectoryRecordKind = sourceKind === 'user' || sourceKind === '' ? 'user' : 'context'
      const sourceSections = array(source.sections)
      const firstSection = sourceSections.length > 0 ? record(sourceSections[0]) : {}
      const elecKoiContext = sourceKind === 'plugin:eleckoi-conversation-context'
      const item = baseRecord(event, {
        kind,
        title: kind === 'user' ? '用户消息' : elecKoiContext ? text(firstSection.name) || '设定上下文' : contextTitle(sourceKind),
        preview: preview(content),
        source: elecKoiContext ? text(source.label) || '设定位置' : sourceKind || 'user',
        input: content,
        detail: pretty(message),
        turn, step
      })
      if (elecKoiContext) item.type = 'eleckoi/context-message'
      records.push(item)
      continue
    }

    if (type === 'assistant/message') {
      const message = messageFrom(data)
      const content = contentText(message.content)
      const source = record(message.source)
      const startedAt = turn !== null && step !== null ? stepStarts.get(stepKey(turn, step)) : undefined
      const streamedFirstToken = assistantFirstTokenTime(data.stream)
      const firstTokenTime = turn !== null && step !== null
        ? firstTokenTimes.get(stepKey(turn, step)) ?? streamedFirstToken ?? null
        : streamedFirstToken ?? null
      const usage = trajectoryUsage(data.usage)
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
      settleAssistantRequests(turn, step, time, firstTokenTime, usage, event.seq, data.interrupted === true)
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
      item.requests.push({
        purpose: 'compaction',
        number: ++requestCount,
        seq: event.seq,
        turn,
        step: null,
        status: 'running',
        reason: 'compaction',
        provider: '',
        model: '',
        requestConfig: null,
        usage: null,
        cumulativeUsage: null,
        detail: pretty(data),
        rawJson: pretty(event),
        timeMillis: time,
        durationMillis: null,
        startedAt: time,
        completedAt: null,
        firstTokenTime: null,
        resultSeq: null
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
        for (const request of item.requests) {
          request.status = item.status
          request.durationMillis = item.durationMillis
          request.completedAt = time
          request.resultSeq = item.seq
          request.detail = item.detail
          request.rawJson = item.rawJson
        }
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

  const orderedRecords = records
  orderedRecords.forEach((item, index) => { item.index = index + 1 })
  attachCumulativeRequestUsage(orderedRecords)
  const times = events.map((event) => nonnegativeInteger(event.time)).filter((value): value is number => value !== null)
  const createdAt = nonnegativeInteger(header.createdAt)
  return {
    records: orderedRecords,
    startedAtMillis: createdAt ?? times[0] ?? null,
    completedAtMillis: times.at(-1) ?? createdAt
  }
}

function findSyntheticSeedStepSeqs(events: readonly NormalizedEvent[]): Set<number> {
  const syntheticStepSeqs = new Set<number>()
  let segmentStart = 0

  for (let index = 0; index < events.length; index += 1) {
    if (events[index]?.type !== 'session/end-seed') continue
    const segment = events.slice(segmentStart, index)
    if (!segment.some((event) => event.type === 'request/header')) {
      for (const event of segment) {
        if (event.type === 'step/start') syntheticStepSeqs.add(event.seq)
      }
    }
    segmentStart = index + 1
  }

  return syntheticStepSeqs
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
  if (!runtimeThreadId || !existsSync(sessionRoot)) return undefined
  const root = realpathSync(sessionRoot)
  for (const project of readdirSync(root, { withFileTypes: true })) {
    if (!project.isDirectory() || project.isSymbolicLink()) continue
    const projectDirectory = join(root, project.name)
    for (const session of readdirSync(projectDirectory, { withFileTypes: true })) {
      if (!session.isDirectory() || session.isSymbolicLink()) continue
      const resolved = realpathSync(join(projectDirectory, session.name))
      const relativePath = relative(root, resolved)
      if (!relativePath || relativePath.startsWith('..') || isAbsolute(relativePath)) continue
      const candidate = latestSessionLog(resolved)
      if (candidate === undefined) continue
      try {
        const firstLine = readFileSync(candidate, 'utf8').split(/\r?\n/, 1)[0]
        const result = sessionFormatCatalog.readHeader(JSON.parse(firstLine ?? ''))
        if (result.status !== 'malformed' && result.status !== 'unsupported' && result.header.id === runtimeThreadId) {
          return candidate
        }
      } catch {
        continue
      }
    }
  }
  return undefined
}

function latestSessionLog(directory: string): string | undefined {
  const candidates = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.isSymbolicLink())
    .map((entry) => ({ name: entry.name, version: sessionLogVersion(entry.name) }))
    .filter((entry): entry is { name: string; version: number } => entry.version !== undefined)
    .sort((left, right) => right.version - left.version)
  return candidates[0] === undefined ? undefined : join(directory, candidates[0].name)
}

function collectHistoricalChildren(parentLog: string, parentId: string): ReturnType<typeof historicalChildCatalogSource>[] {
  const facts: ReturnType<typeof historicalChildCatalogSource>[] = []
  const projectDirectory = dirname(dirname(parentLog))
  for (const entry of readdirSync(projectDirectory, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue
    const childLog = latestSessionLog(join(projectDirectory, entry.name))
    if (childLog === undefined || childLog === parentLog) continue
    try {
      const source = readFileSync(childLog, 'utf8')
      const lines = source.split(/\r?\n/)
      const headerValue = parseJsonLine(lines[0], 'DSH 子会话日志缺少有效的会话头。')
      const descriptor = sessionFormatCatalog.readHeader(headerValue)
      if (descriptor.status === 'malformed' || descriptor.status === 'unsupported'
        || descriptor.header.origin !== 'subagent' || descriptor.header.parentSession !== parentId) continue
      const catalog = descriptor.status === 'migration-required'
        ? historicalSessionFormatCatalog : sessionFormatCatalog
      const restore = catalog.createRestore(headerValue, { recovery: 'recoverable', validation: 'transformed' })
      const finalLineIndex = source.endsWith('\n') || source.endsWith('\r') ? lines.length : lines.length - 1
      for (let index = 1; index < lines.length; index += 1) {
        const line = lines[index]?.trim()
        if (!line) continue
        let row: unknown
        try { row = JSON.parse(line) }
        catch (error) {
          if (index === finalLineIndex) break
          throw error
        }
        restore.decodeRow(row)
      }
      facts.push(historicalChildCatalogSource(restore.finish()))
    } catch {
      // A damaged child cannot contribute evidence to its parent's catalog.
    }
  }
  return facts
}

function sessionLogVersion(filename: string): number | undefined {
  if (filename === 'session.jsonl') return 0
  const match = /^session\.v([1-9]\d*)\.jsonl$/.exec(filename)
  if (match === null) return undefined
  const version = Number(match[1])
  return Number.isSafeInteger(version) ? version : undefined
}

function parseJsonLine(line: string | undefined, message: string): unknown {
  try {
    return JSON.parse(line ?? '')
  } catch (error) {
    throw new Error(message, { cause: error })
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

function attachCumulativeRequestUsage(records: readonly DshTrajectoryRecord[]): void {
  const requests = records
    .flatMap((item) => item.requests)
    .filter((request, index, items) => items.findIndex((item) => item.seq === request.seq) === index)
    .sort((left, right) => left.seq - right.seq)
  let cumulative: DshTrajectoryUsage | null = null
  for (const request of requests) {
    cumulative = addTrajectoryUsage(cumulative, request.usage)
    request.cumulativeUsage = cumulative === null ? null : { ...cumulative }
  }
}

function trajectoryUsage(value: unknown): DshTrajectoryUsage | null {
  const usage = record(value)
  const input = nonnegativeInteger(usage.inputTokens)
  const cacheRead = nonnegativeInteger(usage.cacheReadTokens)
  const cacheWrite = nonnegativeInteger(usage.cacheWriteTokens)
  const output = nonnegativeInteger(usage.outputTokens)
  const reasoning = nonnegativeInteger(usage.reasoningTokens)
  if ([input, cacheRead, cacheWrite, output, reasoning].every((item) => item === null)) return null
  return {
    ...(input === null ? {} : { input }),
    ...(cacheRead === null ? {} : { cacheRead }),
    ...(cacheWrite === null ? {} : { cacheWrite }),
    ...(output === null ? {} : { output }),
    ...(reasoning === null ? {} : { reasoning })
  }
}

function addTrajectoryUsage(
  total: DshTrajectoryUsage | null,
  usage: DshTrajectoryUsage | null
): DshTrajectoryUsage | null {
  if (usage === null) return total
  const next: DshTrajectoryUsage = {}
  for (const key of ['input', 'cacheRead', 'cacheWrite', 'output', 'reasoning'] as const) {
    const current = total?.[key]
    const increment = usage[key]
    if (current !== undefined || increment !== undefined) next[key] = (current ?? 0) + (increment ?? 0)
  }
  return Object.keys(next).length === 0 ? total : next
}

function isAssistantTokenDelta(chunk: Record<string, unknown>): boolean {
  const type = text(chunk.type)
  if (type === 'text-delta' || type === 'reasoning-delta') return text(chunk.text).length > 0
  return type === 'tool-call-delta'
    && (text(chunk.argumentsDelta).length > 0 || typeof chunk.name === 'string')
}

function assistantFirstTokenTime(value: unknown): number | null {
  if (!Array.isArray(value)) return null
  try {
    return nonnegativeInteger(assistantStreamFirstTokenTime(value as AssistantStreamRecord[]))
  } catch {
    return null
  }
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
