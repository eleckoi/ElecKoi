const PNG_SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const MAX_PNG_BYTES = 64 * 1024 * 1024
const MAX_CHUNK_BYTES = 48 * 1024 * 1024

interface PngChunk {
  type: string
  data: Uint8Array
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

function parsePng(bytes: Uint8Array): PngChunk[] {
  if (bytes.length > MAX_PNG_BYTES) throw new Error('PNG 图片不能超过 64 MB')
  if (!isPng(bytes)) throw new Error('这不是 PNG 图片')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const decoder = new TextDecoder('ascii')
  const chunks: PngChunk[] = []
  let offset = PNG_SIGNATURE.length
  while (offset < bytes.length) {
    if (bytes.length - offset < 12) throw new Error('PNG 数据不完整')
    const length = view.getUint32(offset, false)
    if (length > MAX_CHUNK_BYTES) throw new Error('PNG 数据块大小无效')
    const end = offset + 12 + length
    if (end > bytes.length) throw new Error('PNG 数据块不完整')
    const type = decoder.decode(bytes.slice(offset + 4, offset + 8))
    if (type.length !== 4 || [...type].some((character) => character.charCodeAt(0) < 65 || character.charCodeAt(0) > 122)) {
      throw new Error('PNG 数据块类型无效')
    }
    chunks.push({ type, data: bytes.slice(offset + 8, offset + 8 + length) })
    offset = end
    if (type === 'IEND') {
      if (offset !== bytes.length) throw new Error('PNG 结束标记后存在异常数据')
      return chunks
    }
  }
  throw new Error('PNG 缺少结束标记')
}
