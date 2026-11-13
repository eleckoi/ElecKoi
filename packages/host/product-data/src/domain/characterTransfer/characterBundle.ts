import { readZipEntries } from '@product-data/storage/archive/readZipEntries'
import { createHash } from 'node:crypto'
import { Zip, ZipDeflate } from 'fflate'
import { DesktopError } from '@shared/foundation/DesktopError'
import { ELECKOI_FAILURE_CODES as codes } from '@shared/contracts/errors/codes'

const digest = (value: Uint8Array) => createHash('sha256').update(value).digest('hex')
const invalid = (message: string): never => { throw new DesktopError(codes.dataShapeInvalid, message, { what: '角色卡资源包' }) }
type Json = Record<string, unknown>
function object(value: unknown): Json { if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('资源包清单无效。'); return value as Json }
function path(value: string): string {
  if (!value || /[\\:\0]/.test(value) || value.split('/').some(part => !part || part === '.' || part === '..')) invalid('资源包包含不安全的路径。')
  return value
}
export function isZip(bytes: Uint8Array): boolean { return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3 && bytes[3] === 4 }
export function writeBundle(root: Json): Buffer {
  const files = new Map<string, Uint8Array>(), document = structuredClone(root)
  const take = (item: Json, name: string, field = 'data') => {
    if (typeof item[field] !== 'string') invalid('资源包二进制数据无效。')
    files.set(name, Buffer.from(item[field] as string, 'base64')); item[field] = { file: name }
  }
  for (const [index, value] of (document.assets as Json[]).entries()) take(value, `portraits/${index}`)
  for (const [index, value] of ((document.library_assets ?? []) as Json[]).entries()) take(value, `assets/${index}`)
  const frontends = document.frontends as { projects: Json[] } | undefined
  for (const [index, project] of (frontends?.projects ?? []).entries()) {
    for (const raw of project.files as unknown[]) { const file = object(raw); take(file, path(`frontends/${index}/${String(file.path)}`), 'content') }
  }
  files.set('character.json', Buffer.from(JSON.stringify(document), 'utf8'))
  const manifest = { format: 'eleckoi.character-bundle', version: 1, files: [...files].map(([path, data]) => ({ path, size: data.length, sha256: digest(data) })) }
  files.set('manifest.json', Buffer.from(JSON.stringify(manifest), 'utf8'))
  const chunks: Uint8Array[] = []; let complete = false
  const zip = new Zip((error, bytes, final) => { if (error) throw error; chunks.push(bytes); complete = final })
  // Level-zero DEFLATE preserves stream boundaries even when media contains nested ZIP signatures; it avoids recompressing media.
  for (const [name, bytes] of files) { const file = new ZipDeflate(name, { level: 0 }); zip.add(file); file.push(bytes, true) }
  zip.end(); if (!complete) invalid('资源包没有完成写入。')
  return Buffer.concat(chunks)
}
export function readBundle(bytes: Uint8Array): Json {
  const files = readZipEntries(bytes), names = new Set<string>()
  for (const name of files.keys()) {
    path(name)
    if (!/^(?:manifest\.json|character\.json|portraits\/\d+|assets\/\d+|frontends\/\d+\/.+)$/.test(name) || names.has(name.toLowerCase())) invalid('资源包文件路径无效或重复。')
    names.add(name.toLowerCase())
  }
  const manifest = object(JSON.parse(Buffer.from(files.get('manifest.json') ?? []).toString('utf8')))
  if (manifest.format !== 'eleckoi.character-bundle' || manifest.version !== 1 || !Array.isArray(manifest.files)) invalid('不支持的角色卡资源包。')
  const declared = new Set<string>()
  for (const raw of manifest.files as unknown[]) {
    const entry = object(raw), name = path(String(entry.path)), data = files.get(name)
    if (declared.has(name) || !data || data.length !== entry.size || digest(data) !== entry.sha256) invalid(`资源包文件缺失或摘要不一致：${name}（${data?.length ?? 'missing'} / ${entry.size}）`)
    declared.add(name)
  }
  if (declared.size + 1 !== files.size || !declared.has('character.json')) invalid('资源包存在未登记或缺失的文件。')
  const root = object(JSON.parse(Buffer.from(files.get('character.json')!).toString('utf8')))
  const used = new Set(['character.json'])
  const restore = (entry: Json, field = 'data') => {
    const name = path(String(object(entry[field]).file)), data = files.get(name)
    if (!data || !declared.has(name) || name === 'character.json') invalid('角色卡的资源引用无效。')
    used.add(name); entry[field] = Buffer.from(data!).toString('base64')
  }
  for (const raw of (root.assets as unknown[])) restore(object(raw))
  for (const raw of ((root.library_assets ?? []) as unknown[])) restore(object(raw))
  const frontends = root.frontends === undefined ? undefined : object(root.frontends)
  for (const raw of ((frontends?.projects ?? []) as unknown[])) for (const file of object(raw).files as unknown[]) restore(object(file), 'content')
  if (used.size !== declared.size) invalid('资源包有未归属的文件。')
  return root
}
