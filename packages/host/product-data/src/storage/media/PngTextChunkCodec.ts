import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes'
import { DesktopError } from '@shared/foundation/DesktopError'

const PNG_SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
// PNG defines a chunk length as an unsigned 31-bit value.
const MAX_CHUNK_BYTES = 0x7fffffff

interface PngChunk {
  type: string
  data: Uint8Array
}

/** Private ancillary chunks keep PNG standards compliant; ordinary image decoders ignore the ZIP. */
export function writePngArchive(bytes: Uint8Array, archive: Uint8Array): Uint8Array {
  const chunks = parsePng(bytes).filter(chunk => chunk.type !== 'ekZa')
  const end = chunks.findIndex(chunk => chunk.type === 'IEND')
  const parts: PngChunk[] = []
  // This is a chunk size, never a total archive size cap.
  for (let offset = 0; offset < archive.length; offset += 16 * 1024 * 1024) parts.push({ type: 'ekZa', data: archive.subarray(offset, offset + 16 * 1024 * 1024) })
  chunks.splice(end, 0, ...parts)
  return writePngChunks(chunks, new Map())
}
export function readPngArchive(bytes: Uint8Array): Uint8Array | undefined {
  const parts = parsePng(bytes).filter(chunk => chunk.type === 'ekZa').map(chunk => chunk.data)
  return parts.length ? concat(parts) : undefined
}
export function removePngArchive(bytes: Uint8Array): Uint8Array {
  return writePngChunks(parsePng(bytes).filter(chunk => chunk.type !== 'ekZa'), new Map())
}

export function isPng(bytes: Uint8Array): boolean {
  return bytes.length >= PNG_SIGNATURE.length && PNG_SIGNATURE.every((value, index) => bytes[index] === value)
}

export function readPngText(bytes: Uint8Array): Map<string, string> {
  const result = new Map<string, string>()
  const decoder = new TextDecoder('latin1')
  for (const chunk of parsePng(bytes)) {
    if (chunk.type !== 'tEXt') continue
    const separator = chunk.data.indexOf(0)
    if (separator <= 0 || separator >= chunk.data.length - 1) continue
    result.set(decoder.decode(chunk.data.slice(0, separator)), decoder.decode(chunk.data.slice(separator + 1)))
  }
  return result
}

export function writePngText(bytes: Uint8Array, values: ReadonlyMap<string, string>): Uint8Array {
  const keywords = new Set(values.keys())
  return writePngChunks(parsePng(bytes).filter((chunk) => (
    chunk.type !== 'tEXt' || !keywords.has(textKeyword(chunk.data))
  )), values)
}

export function writePngTextOnly(bytes: Uint8Array, values: ReadonlyMap<string, string>): Uint8Array {
  return writePngChunks(parsePng(bytes).filter((chunk) => chunk.type !== 'tEXt'), values)
}

/** Remove specified text payloads while preserving the image and unrelated metadata. */
export function removePngText(bytes: Uint8Array, keywords: ReadonlySet<string>): Uint8Array {
  return writePngChunks(parsePng(bytes).filter((chunk) => (
    chunk.type !== 'tEXt' || !keywords.has(textKeyword(chunk.data))
  )), new Map())
}

function writePngChunks(chunks: PngChunk[], values: ReadonlyMap<string, string>): Uint8Array {
  const output: Uint8Array[] = [PNG_SIGNATURE]
  for (const chunk of chunks) {
    if (chunk.type === 'IEND') {
      for (const [keyword, value] of values) output.push(encodeTextChunk(keyword, value))
    }
    output.push(encodeChunk(chunk.type, chunk.data))
  }
  const result = concat(output)
  return result
}

function parsePng(bytes: Uint8Array): PngChunk[] {
  if (!isPng(bytes)) throw new DesktopError(ELECKOI_FAILURE_CODES.inputUnsupported, '这不是 PNG 图片', { what: '图片格式' })
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const decoder = new TextDecoder('ascii')
  const chunks: PngChunk[] = []
  let offset = PNG_SIGNATURE.length
  while (offset < bytes.length) {
    if (bytes.length - offset < 12) throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, 'PNG 数据不完整', { what: 'PNG 数据' })
    const length = view.getUint32(offset, false)
    if (length > MAX_CHUNK_BYTES) throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, 'PNG 数据块大小无效', { what: 'PNG 数据块' })
    const end = offset + 12 + length
    if (end > bytes.length) throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, 'PNG 数据块不完整', { what: 'PNG 数据块' })
    const type = decoder.decode(bytes.slice(offset + 4, offset + 8))
    if (type.length !== 4 || [...type].some((character) => character.charCodeAt(0) < 65 || character.charCodeAt(0) > 122)) {
      throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, 'PNG 数据块类型无效', { what: 'PNG 数据块类型' })
    }
    if (view.getUint32(offset + 8 + length, false) !== crc32(bytes.subarray(offset + 4, offset + 8 + length))) {
      throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, 'PNG 数据块校验失败', { what: 'PNG 数据块' })
    }
    chunks.push({ type, data: bytes.slice(offset + 8, offset + 8 + length) })
    offset = end
    if (type === 'IEND') {
      if (offset !== bytes.length) throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, 'PNG 结束标记后存在异常数据', { what: 'PNG 数据' })
      return chunks
    }
  }
  throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, 'PNG 缺少结束标记', { what: 'PNG 数据' })
}

function encodeTextChunk(keyword: string, value: string): Uint8Array {
  if (!keyword || keyword.length > 79 || /[^\x20-\x7e]/.test(keyword)) throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, 'PNG 文本关键字无效', { what: 'PNG 文本关键字' })
  if (/[^\x00-\xff]/.test(value)) throw new DesktopError(ELECKOI_FAILURE_CODES.inputUnsupported, 'PNG 文本数据必须使用 Latin-1', { what: 'PNG 文本编码' })
  const data = Uint8Array.from(Buffer.from(`${keyword}\0${value}`, 'latin1'))
  if (data.length > MAX_CHUNK_BYTES) throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, 'PNG 文本数据块过大', { field: 'size' })
  return encodeChunk('tEXt', data)
}

function encodeChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type)
  const result = new Uint8Array(data.length + 12)
  const view = new DataView(result.buffer)
  view.setUint32(0, data.length, false)
  result.set(typeBytes, 4)
  result.set(data, 8)
  view.setUint32(data.length + 8, crc32(concat([typeBytes, data])), false)
  return result
}

function textKeyword(data: Uint8Array): string {
  const separator = data.indexOf(0)
  return separator > 0 ? new TextDecoder('latin1').decode(data.slice(0, separator)) : ''
}

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, value) => {
  let result = value
  for (let bit = 0; bit < 8; bit++) result = (result >>> 1) ^ ((result & 1) ? 0xedb88320 : 0)
  return result >>> 0
})
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 255]!
  return (crc ^ 0xffffffff) >>> 0
}

function concat(parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }
  return result
}
