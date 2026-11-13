import { inflateRawSync } from 'node:zlib'
import { DesktopError } from '@shared/foundation/DesktopError'
import { ELECKOI_FAILURE_CODES as codes } from '@shared/contracts/errors/codes'

const invalid = (): never => { throw new DesktopError(codes.dataShapeInvalid, 'ZIP 目录、文件大小或校验值无效。', { what: 'ZIP 资源包' }) }
const table = Uint32Array.from({ length: 256 }, (_, value) => { for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0); return value >>> 0 })
function crc32(bytes: Uint8Array) { let crc = 0xffffffff; for (const byte of bytes) crc = (crc >>> 8) ^ table[(crc ^ byte) & 255]!; return (crc ^ 0xffffffff) >>> 0 }

/** Reads central-directory sizes, so arbitrary nested ZIP signatures are always file data. */
export function readZipEntries(input: Uint8Array): Map<string, Uint8Array> {
  const bytes = Buffer.from(input.buffer, input.byteOffset, input.byteLength)
  const bounds = (offset: number, size: number) => { if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(size) || offset < 0 || size < 0 || offset + size > bytes.length) invalid() }
  const u16 = (offset: number) => { bounds(offset, 2); return bytes.readUInt16LE(offset) }
  const u32 = (offset: number) => { bounds(offset, 4); return bytes.readUInt32LE(offset) }
  const u64 = (offset: number) => { bounds(offset, 8); const value = Number(bytes.readBigUInt64LE(offset)); if (!Number.isSafeInteger(value)) invalid(); return value }
  let end = bytes.length - 22
  for (; end >= Math.max(0, bytes.length - 65557); end--) if (u32(end) === 0x06054b50 && end + 22 + u16(end + 20) === bytes.length) break
  if (end < 0 || u32(end) !== 0x06054b50 || u16(end + 4) || u16(end + 6)) invalid()
  let count = u16(end + 10), offset = u32(end + 16)
  if (count === 0xffff || offset === 0xffffffff) {
    if (u32(end - 20) !== 0x07064b50 || u32(end - 16) || u32(end - 4) !== 1) invalid()
    const record = u64(end - 12)
    if (u32(record) !== 0x06064b50 || u32(record + 16) || u32(record + 20)) invalid()
    count = u64(record + 32); offset = u64(record + 48)
  }
  const result = new Map<string, Uint8Array>()
  for (let index = 0; index < count; index++) {
    if (u32(offset) !== 0x02014b50) invalid()
    const flags = u16(offset + 8), method = u16(offset + 10), crc = u32(offset + 16)
    let compressed = u32(offset + 20), size = u32(offset + 24), local = u32(offset + 42)
    const nameLength = u16(offset + 28), extraLength = u16(offset + 30), commentLength = u16(offset + 32)
    bounds(offset + 46, nameLength + extraLength + commentLength)
    const name = new TextDecoder(flags & 2048 ? 'utf-8' : 'latin1', { fatal: true }).decode(bytes.subarray(offset + 46, offset + 46 + nameLength))
    if (flags & 1 || u16(offset + 34) || result.has(name)) invalid()
    if (compressed === 0xffffffff || size === 0xffffffff || local === 0xffffffff) {
      let found = false
      for (let extra = offset + 46 + nameLength, limit = extra + extraLength; extra + 4 <= limit;) {
        const tag = u16(extra), length = u16(extra + 2); bounds(extra + 4, length)
        if (tag === 1) {
          let next = extra + 4
          if (size === 0xffffffff) { size = u64(next); next += 8 }
          if (compressed === 0xffffffff) { compressed = u64(next); next += 8 }
          if (local === 0xffffffff) local = u64(next)
          found = true; break
        }
        extra += 4 + length
      }
      if (!found) invalid()
    }
    if (u32(local) !== 0x04034b50 || u16(local + 8) !== method || u16(local + 6) !== flags) invalid()
    const localNameLength = u16(local + 26), localExtraLength = u16(local + 28)
    bounds(local + 30, localNameLength + localExtraLength)
    if (!bytes.subarray(local + 30, local + 30 + localNameLength).equals(bytes.subarray(offset + 46, offset + 46 + nameLength))) invalid()
    const start = local + 30 + localNameLength + localExtraLength; bounds(start, compressed)
    const data = bytes.subarray(start, start + compressed)
    const expanded = method === 0 ? data : method === 8 ? inflateRawSync(data, { maxOutputLength: Math.max(1, size) }) : invalid()
    if (expanded.length !== size || crc32(expanded) !== crc) invalid()
    result.set(name, expanded)
    offset += 46 + nameLength + extraLength + commentLength
  }
  return result
}
