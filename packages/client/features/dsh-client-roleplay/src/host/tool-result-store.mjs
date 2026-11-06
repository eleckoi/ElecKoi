import LocalSpillStore, { sessionDir } from '@deepseek-ai/dsh-spill-local'
import { productFailure, ELECKOI_FAILURE_CODES } from '@eleckoi/dsh-product-api'
import { canReadResult, resultDomain, RESULT_READERS } from './tool-result-access.mjs'
import { createReadStream } from 'node:fs'
import { lstat, open, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve } from 'node:path'

const ownershipSuffix = '.owner.json'
const defaultPageBytes = 32_768

/** Session-owned access to the official spill backend's complete text results. */
export default class ToolResultStore extends LocalSpillStore {
  static inject = ['sessionQuery']

  async saveText(input) {
    const ref = await super.saveText(input)
    // One small ownership record per artifact; no request or result copies.
    await writeFile(`${ref.locator}${ownershipSuffix}`, JSON.stringify({ version: 1, sessionId: input.owner.sessionId, source: input.source, locator: ref.locator }), { flag: 'wx', mode: 0o600 })
    const domain = resultDomain(input.source?.toolName)
    return domain ? { ...ref, retrievalHint: `Use ${RESULT_READERS[domain]} with ${JSON.stringify({ result: { file_path: ref.locator, offset: 0 } })}. Continue result.offset with next_offset until null; add result.query for literal search. Pass only result; do not repeat the original operation.` } : ref
  }

  /** Remove complete artifacts and ownership records for deleted Sessions. */
  async removeSessionResults(sessionIds) {
    let root
    try { root = await realpath(this.root) }
    catch (error) { if (error?.code === 'ENOENT') return; throw error }
    const failures = []
    for (const id of new Set(sessionIds)) {
      try {
        if (typeof id !== 'string' || !id) throw productFailure(ELECKOI_FAILURE_CODES.internal, '清理工具结果缺少有效会话标识。', { what: '会话标识' })
        const directory = resolve(sessionDir(root, id))
        if (dirname(directory) !== root) throw productFailure(ELECKOI_FAILURE_CODES.securityDenied, '工具结果目录超出存储范围，未删除文件。', { what: '工具结果目录', guard: '存储范围' })
        const info = await lstat(directory)
        if (!info.isDirectory() || info.isSymbolicLink() || await realpath(directory) !== directory) {
          throw productFailure(ELECKOI_FAILURE_CODES.securityDenied, `工具结果目录不是存储内的真实目录，未删除：${directory}`, { what: '工具结果目录', guard: '存储内的真实目录' })
        }
        await rm(directory, { recursive: true, force: true })
      } catch (error) {
        // 失败对象可能是 productFailure 普通对象：`String(error)` 会变成 "[object Object]"，诊断就丢了。
        // 取值统一走本文件末尾的 failureMessage（Error / 普通对象 / 字符串三种都取 .message）。
        if (error?.code !== 'ENOENT') failures.push(new Error(`会话 ${id}：${failureMessage(error)}`, { cause: error }))
      }
    }
    if (failures.length) throw new AggregateError(failures, failures.map(error => error.message).join('\n'))
  }

  async readResult(args, exec, domain) {
    exec.signal.throwIfAborted()
    const session = exec.agent?.session
    if (!session) throw productFailure(ELECKOI_FAILURE_CODES.internal, '工具结果读取缺少当前会话。', { what: '当前会话' })
    if (typeof args.file_path !== 'string' || !isAbsolute(args.file_path)) throw productFailure(ELECKOI_FAILURE_CODES.inputInvalid, 'file_path 必须是工具结果提示给出的完整路径。', { field: 'file_path' })
    const offset = integer(args.offset, 0, 0, 'offset')
    const limit = integer(args.limit, args.query === undefined ? defaultPageBytes : 50, 1, 'limit')
    if (args.query !== undefined && (typeof args.query !== 'string' || !args.query.length)) throw productFailure(ELECKOI_FAILURE_CODES.inputInvalid, 'query 必须是非空文字。', { field: 'query' })
    let path, ownership
    try {
      const root = await realpath(this.root)
      path = await realpath(args.file_path)
      const child = relative(root, path)
      if (!child || child === '..' || child.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(child)) throw productFailure(ELECKOI_FAILURE_CODES.securityDenied, '无权读取该工具结果。', { what: '工具结果', guard: '工具结果存储范围' })
      const [data, metadata] = await Promise.all([lstat(args.file_path), lstat(`${path}${ownershipSuffix}`)])
      if (!data.isFile() || data.isSymbolicLink() || !metadata.isFile() || metadata.isSymbolicLink()) throw productFailure(ELECKOI_FAILURE_CODES.securityDenied, '无权读取该工具结果。', { what: '工具结果', guard: '工具结果文件类型' })
      const ownershipJson = await readFile(`${path}${ownershipSuffix}`, 'utf8')
      try {
        ownership = JSON.parse(ownershipJson)
      } catch (error) {
        // 归属记录是已经落盘的载荷：解析不出不是「找不到」，也不是内部不变式。
        throw productFailure(ELECKOI_FAILURE_CODES.storageCorrupt, `工具结果归属记录已损坏，无法解析：${path}（${String(error)}）`, { what: '工具结果归属记录' })
      }
    } catch (error) {
      if (error?.code === 'ENOENT') throw productFailure(ELECKOI_FAILURE_CODES.lookupNotFound, '工具结果文件已失效或没有有效的读取凭据，请重新查询源数据。', { what: '工具结果文件' })
      throw error
    }
    if (ownership?.version !== 1 || typeof ownership.sessionId !== 'string' || !await this.authorized(session, ownership, path, exec.signal)) {
      throw productFailure(ELECKOI_FAILURE_CODES.securityDenied, '该工具结果不属于当前会话可读取的内容。', { what: '工具结果', guard: '所属会话' })
    }
    if (!canReadResult(domain, ownership.source?.toolName)) throw productFailure(ELECKOI_FAILURE_CODES.securityDenied, '该结果不属于本工具组，请使用溢出提示指定的读取入口。', { what: '工具结果', guard: '读取入口的工具组' })
    const handle = await open(path, 'r')
    try {
      const { size } = await handle.stat()
      if (offset > size) throw productFailure(ELECKOI_FAILURE_CODES.inputInvalid, `offset 超出结果范围，全文共有 ${size} 字节。`, { field: 'offset' })
      if (offset < size) {
        const byte = Buffer.alloc(1)
        await handle.read(byte, 0, 1, offset)
        if ((byte[0] & 0xc0) === 0x80) throw productFailure(ELECKOI_FAILURE_CODES.inputInvalid, 'offset 位于 UTF-8 字符中间，请使用返回的 next_offset。', { field: 'offset' })
      }
      exec.signal.throwIfAborted()
      const result = args.query === undefined
        ? await readPage(handle, offset, limit, size)
        : await searchPage(path, offset, limit, size, args.query, exec.signal)
      exec.signal.throwIfAborted()
      return { kind: 'tool_result_page', file_path: args.file_path, offset, total_bytes: size, ...result }
    } finally {
      await handle.close()
    }
  }

  async authorized(session, ownership, path, signal) {
    if (ownership.sessionId === session.id) return true
    if (!session.header.isSeeded || !ownership.source || ownership.source.kind !== 'tool') return false
    // A fork can read an ancestor artifact only when its actual inherited
    // tool history contains that artifact, not merely because it knows a path.
    // The inherited text embeds the path as JSON, and realpath can rewrite the
    // locator, so accept every encoding the recorded artifact may appear in.
    const forms = [path, ownership.locator].filter(value => typeof value === 'string' && value)
      .flatMap(value => [value, value.replaceAll('\\', '/'), JSON.stringify(value).slice(1, -1)])
    const inherited = session.snapshotEvents(0, session.inheritedEventCount).some(event => {
      const callId = event.type === 'tool/result' ? event.data.message.source.callId
        : event.type === 'tool/ptc-dispatch' ? event.data.subCallId : undefined
      const content = event.type === 'tool/result' ? event.data.message.content
        : event.type === 'tool/ptc-dispatch' ? event.data.content : []
      return callId === ownership.source.callId
        && content.some(block => block.type === 'text' && forms.some(form => block.text.includes(form)))
    })
    signal.throwIfAborted()
    return inherited
  }
}

/** 抛出值的诊断文案：带码失败是普通对象（不是 Error 实例），仍要取它的 message。 */
function failureMessage(error) {
  return error instanceof Error || error !== null && typeof error === 'object' && typeof error.message === 'string'
    ? error.message : String(error)
}

function integer(value, fallback, min, name) {
  const number = value ?? fallback
  if (!Number.isSafeInteger(number) || number < min) throw productFailure(ELECKOI_FAILURE_CODES.inputInvalid, `${name} 必须是大于或等于 ${min} 的安全整数。`, { field: name })
  return number
}

async function readPage(handle, offset, limit, size) {
  const count = Math.min(limit, size - offset)
  const buffer = Buffer.alloc(Math.min(size - offset, count + 3))
  let bytesRead = 0
  while (bytesRead < buffer.length) {
    const part = await handle.read(buffer, bytesRead, buffer.length - bytesRead, offset + bytesRead)
    if (!part.bytesRead) break
    bytesRead += part.bytesRead
  }
  let end = Math.min(count, bytesRead)
  while (end > 0 && end < bytesRead && (buffer[end] & 0xc0) === 0x80) end--
  if (!end && bytesRead) {
    end = 1
    while (end < bytesRead && (buffer[end] & 0xc0) === 0x80) end++
  }
  const content = new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, end))
  return { content, next_offset: offset + end < size ? offset + end : null }
}

async function searchPage(path, offset, limit, size, query, signal) {
  const matches = []
  let pending = '', base = offset
  const decoder = new TextDecoder('utf-8', { fatal: true })
  const stream = createReadStream(path, { start: offset, highWaterMark: 65_536, signal })
  const scan = (final) => {
    let from = 0, found
    while ((found = pending.indexOf(query, from)) !== -1) {
      from = found + query.length
      matches.push({ offset: base + Buffer.byteLength(pending.slice(0, found)), text: snippet(pending, found, query.length) })
      if (matches.length >= limit) return { matches, next_offset: base + Buffer.byteLength(pending.slice(0, from)) < size ? base + Buffer.byteLength(pending.slice(0, from)) : null }
    }
    let cut = final ? pending.length : Math.max(from, pending.length - query.length + 1, 0)
    if (cut > 0 && cut < pending.length && isLow(pending.charCodeAt(cut))) cut--
    base += Buffer.byteLength(pending.slice(0, cut))
    pending = pending.slice(cut)
  }
  try {
    for await (const chunk of stream) {
      pending += decoder.decode(chunk, { stream: true })
      const page = scan(false)
      if (page) return page
    }
    pending += decoder.decode()
    return scan(true) ?? { matches, next_offset: null }
  } finally {
    stream.destroy()
  }
}

function snippet(text, index, length) {
  let start = Math.max(0, index - 80), end = Math.min(text.length, index + Math.min(length, 160) + 80)
  if (isLow(text.charCodeAt(start))) start++
  if (end < text.length && isLow(text.charCodeAt(end))) end--
  return text.slice(start, end)
}
function isLow(code) { return code >= 0xdc00 && code <= 0xdfff }
