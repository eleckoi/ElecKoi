import { randomUUID } from 'node:crypto'
import { copyFileSync, existsSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'
import { sessionFormatCatalog } from '@deepseek-ai/dsh-session-format-catalog'
import { readDshSessionLog } from './trajectory'
import { assistantContinuationSuffixEvents } from '@eleckoi/dsh-client-roleplay/host/assistant-continuation.mjs'
export type EditableSessionEvent = NonNullable<ReturnType<typeof readDshSessionLog>>['events'][number]
export type EditableSessionJson = EditableSessionEvent['data']
export type EditableSessionObject = Extract<EditableSessionJson, { readonly [key: string]: EditableSessionJson }>

type MessageRole = 'user' | 'assistant'

/** Edit the selected persisted message while preserving every other Session event. */
export function editDshSessionMessage(
  sessionRoot: string, sessionId: string, eventSeq: number, role: MessageRole, content: string
): void {
  if (!Number.isSafeInteger(eventSeq) || eventSeq < 0 || !content.trim()) throw new Error('消息编辑参数不正确。')
  const log = readEditableDshSessionLog(sessionRoot, sessionId)
  const type = role === 'user' ? 'user/message' : 'assistant/message'
  const matches = log.events.filter((event) => event.seq === eventSeq && event.type === type
    && event.surfaceOp === 'append'
    && isRecord(event.data))
  if (matches.length !== 1) throw new Error('找不到唯一对应的消息；原聊天记录未修改。')
  const selected = matches[0]!
  if (!isRecord(selected.data)) throw new Error('消息事件正文不是对象；原聊天记录未修改。')
  const data = selected.data
  const message = role === 'user' ? data : data.message
  if (!isRecord(message)) throw new Error('消息正文不是对象；原聊天记录未修改。')
  if (message.role !== role || !Array.isArray(message.content)) {
    throw new Error('消息角色或内容与编辑目标不一致；原聊天记录未修改。')
  }
  const continuationEvents = role === 'assistant' ? assistantContinuationSuffixEvents(log.events, message.id) : []
  if (role === 'assistant') {
    const raw = message.content.filter(isRecord).filter(block => block.type === 'text').map(block => String(block.text || '')).join('')
    const bodyStart = raw.indexOf('<FINAL>')
    const bodyEnd = raw.lastIndexOf('</FINAL>')
    if (bodyStart >= 0 && raw.slice(0, bodyStart).includes('<ACTION_CALL name="generate_image">')) {
      if (bodyEnd < bodyStart) throw new Error('原回复缺少完整的最终正文边界，未修改生图提示词。')
      content = `${raw.slice(0, bodyStart + '<FINAL>'.length)}\n${content}\n${raw.slice(bodyEnd)}`
    }
  }
  if (continuationEvents.length && !content.includes('<FINAL>')) {
    const raw = message.content.filter(isRecord).filter(block => block.type === 'text').map(block => String(block.text || '')).join('')
    const marker = raw.indexOf('<FINAL>')
    content = `${marker >= 0 ? raw.slice(0, marker) : ''}<FINAL>\n${content}\n</FINAL>`
  }
  let replaced = false
  const blocks = message.content.flatMap((part: EditableSessionJson) => {
    if (!isRecord(part) || part.type !== 'text') return [part]
    if (replaced) return []
    replaced = true
    return [{ ...part, text: content }]
  })
  if (!replaced) blocks.unshift({ type: 'text', text: content })
  const editedMessage = { ...message, content: blocks }
  const editedData = role === 'user' ? editedMessage : { ...data, message: editedMessage }
  const suffixSeqs = new Set(continuationEvents.map(event => Number(event.seq)))
  const events = log.events.map((event) => {
    if (event === selected) return { ...event, data: editedData }
    if (!suffixSeqs.has(Number(event.seq))) return event
    const data = event.data
    if (!isRecord(data) || !isRecord(data.message) || !Array.isArray(data.message.content)) throw new Error('续写正文不是可编辑的正式消息；原聊天记录未修改。')
    const message = data.message
    const content = data.message.content.filter((part: EditableSessionJson) => !isRecord(part) || part.type !== 'text')
    return { ...event, data: { ...data, message: { ...message, content: [{ type: 'text', text: '<FINAL>\n\n</FINAL>' }, ...content] } } }
  })
  rewriteDshSessionEvents(sessionRoot, log, events)
}

export function readEditableDshSessionLog(sessionRoot: string, sessionId: string): NonNullable<ReturnType<typeof readDshSessionLog>> {
  const log = readDshSessionLog(sessionRoot, sessionId)
  if (!log) throw new Error('找不到要编辑的 DSH 会话。')
  if (log.header.isSeeded || log.inheritedEventCount !== 0) {
    throw new Error('不能直接修改继承了父会话事件的 DSH 子会话。')
  }
  if (log.header.version !== sessionFormatCatalog.currentVersion
    || basename(log.path) !== `session.v${sessionFormatCatalog.currentVersion}.jsonl`) {
    throw new Error('DSH 会话必须先迁移到当前格式，才能编辑消息。')
  }
  return log
}

/** Preserve the current official format, identities and all unrelated events. */
export function rewriteDshSessionEvents(sessionRoot: string, log: NonNullable<ReturnType<typeof readDshSessionLog>>, events: readonly EditableSessionEvent[]): void {
  const sessionId = log.header.id
  const rows = [sessionFormatCatalog.encodeCurrentHeader(log.header, log.inheritedEventCount),
    ...events.map((event) => sessionFormatCatalog.encodeCurrentEvent(event))]
  const serialized = `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`
  const restore = sessionFormatCatalog.createRestore(rows[0], { recovery: 'strict', validation: 'current' })
  for (const row of rows.slice(1)) restore.decodeRow(row)
  const verified = restore.finish()
  if (verified.header.id !== sessionId || verified.events.length !== events.length) {
    throw new Error('编辑后的 DSH 会话验证失败；原聊天记录未修改。')
  }

  const revision = statSync(log.path, { bigint: true })
  const suffix = randomUUID()
  const temporary = `${log.path}.${suffix}.tmp`
  const backup = `${log.path}.${suffix}.bak`
  let committed = false
  let retainBackup = false
  try {
    writeFileSync(temporary, serialized, { encoding: 'utf8', flag: 'wx' })
    const current = statSync(log.path, { bigint: true })
    if (current.dev !== revision.dev || current.ino !== revision.ino
      || current.size !== revision.size || current.mtimeNs !== revision.mtimeNs
      || current.ctimeNs !== revision.ctimeNs) {
      throw new Error('DSH 会话日志在编辑期间发生变化；原聊天记录未修改。')
    }
    copyFileSync(log.path, backup)
    renameSync(temporary, log.path)
    committed = true
    const reread = readDshSessionLog(sessionRoot, sessionId)
    if (!reread || reread.events.length !== events.length
      || JSON.stringify(reread.events.map(event => sessionFormatCatalog.encodeCurrentEvent(event))) !== JSON.stringify(rows.slice(1))) {
      throw new Error('编辑后的 DSH 会话无法读取。')
    }
  } catch (error) {
    if (committed && existsSync(backup)) {
      try { renameSync(backup, log.path) } catch (restoreError) {
        retainBackup = true
        throw new Error(`编辑失败，原始会话日志保存在 ${backup}。`, { cause: restoreError })
      }
    }
    throw error
  } finally {
    if (existsSync(temporary)) rmSync(temporary, { force: true })
    if (!retainBackup && existsSync(backup)) rmSync(backup, { force: true })
  }
}

function isRecord(value: unknown): value is EditableSessionObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
