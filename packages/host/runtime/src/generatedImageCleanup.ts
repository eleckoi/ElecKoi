import { chmod, lstat, realpath, unlink } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { AttachmentId, type ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import { SessionId } from '@deepseek-ai/dsh-session'
import { storedAssistantBlocks } from './sessionFormatBoundary.mjs'

type ImageEvent = { readonly type: string; readonly data: unknown }
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function record(value: unknown): Record<string, unknown> { return isRecord(value) ? value : {} }

/** Restore attachment identity at the durable product/Session boundary. */
export function generatedImageReference(value: unknown): ImageAttachmentRef {
  const ref = record(value)
  if (typeof ref.attachmentId !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(ref.attachmentId)
    || !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(String(ref.mediaType))
    || typeof ref.bytes !== 'number' || typeof ref.width !== 'number' || typeof ref.height !== 'number') {
    throw new TypeError('生成图片附件引用不正确。')
  }
  const mediaType = ref.mediaType
  if (mediaType !== 'image/png' && mediaType !== 'image/jpeg' && mediaType !== 'image/webp' && mediaType !== 'image/gif') {
    throw new TypeError('生成图片附件类型不正确。')
  }
  const dimensions = record(ref.originalDimensions)
  return { attachmentId: AttachmentId(ref.attachmentId), mediaType, bytes: ref.bytes, width: ref.width, height: ref.height,
    ...(typeof ref.name === 'string' ? { name: ref.name } : {}),
    ...(typeof dimensions.width === 'number' && typeof dimensions.height === 'number'
      ? { originalDimensions: { width: dimensions.width, height: dimensions.height } } : {}) }
}

/** Only this tool's declared result metadata establishes generated-image ownership. */
export function generatedImageReferences(events: readonly ImageEvent[]): Map<string, ImageAttachmentRef> {
  const refs = new Map<string, ImageAttachmentRef>()
  const add = (value: unknown) => {
    const id = record(value).attachmentId
    if (typeof id !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(id)) return
    refs.set(id, generatedImageReference(value))
  }
  for (const event of events) {
    const data = record(event.data)
    if (event.type === 'eleckoi/illustration') {
      if (Array.isArray(data.frames)) for (const frame of data.frames) if (record(frame).attachment) add(record(frame).attachment)
      continue
    }
    if (event.type !== 'tool/result' || record(data.meta).source !== 'eleckoi-auto-illustration') continue
    const content = record(data.message).content
    if (Array.isArray(content)) for (const block of content) if (record(block).type === 'image') add(record(block).attachment)
  }
  return refs
}

/** Read declared image carriers, including history that remains in the log. */
export function referencedImageIds(events: readonly ImageEvent[]): Set<string> {
  const ids = new Set<string>(), illustrationBatches = new Map<string, unknown[]>()
  const attachment = (value: unknown) => { const id = record(value).attachmentId; if (typeof id === 'string') ids.add(id) }
  const content = (blocks: unknown) => {
    if (Array.isArray(blocks)) for (const block of blocks) if (record(block).type === 'image') attachment(record(block).attachment)
  }
  for (const event of events) {
    const data = record(event.data)
    if (event.type === 'eleckoi/illustration') {
      if (typeof data.batchId === 'string' && Array.isArray(data.frames)) illustrationBatches.set(data.batchId, data.frames)
      continue
    }
    switch (event.type) {
      case 'user/message': case 'tool/ptc-dispatch': content(data.content); break
      case 'system/message': case 'developer/message': case 'tool/result': case 'team/message/queued': content(record(data.message).content); break
      case 'agent/inbox/spliced': if (Array.isArray(data.inserted)) for (const message of data.inserted) content(record(message).content); break
      case 'compaction/summary': content(data.summary); content(data.rawOutput); break
      case 'assistant/message': content(record(data.message).content)
      case 'assistant/attempt': content(storedAssistantBlocks(data.stream)); break
    }
  }
  for (const frames of illustrationBatches.values()) for (const frame of frames) if (record(frame).attachment) attachment(record(frame).attachment)
  return ids
}

export interface GeneratedImageCleanupContext {
  attachments: { root?: string; imageHostPath(ref: ImageAttachmentRef): string }
  sessionPersistence: {
    list(): Promise<Array<{ header: { id: string } }>>
    open(id: SessionId, access: 'read'): Promise<{ read(): Promise<{ events: readonly ImageEvent[] }>; close(): Promise<void> }>
  }
  sessions: { list(): Array<{ id: string; snapshotEvents(): readonly ImageEvent[] }> }
  eleckoiProductData: { listInputImageReferences(): Array<{ conversationId: string; attachmentId: string }>; runtimeSessionId(conversationId: string): string }
}

/** Delete only removed generated objects after a successful record edit. */
export async function deleteRemovedGeneratedImages(ctx: GeneratedImageCleanupContext, candidates: Map<string, ImageAttachmentRef>, deletedSessionId?: string): Promise<void> {
  if (!candidates.size) return
  const retained = new Set<string>()
  const live = ctx.sessions.list()
  const liveIds = new Set(live.map(session => session.id))
  for (const stored of await ctx.sessionPersistence.list()) {
    // The current writer's Session includes updates still being persisted.
    if (liveIds.has(stored.header.id)) continue
    const handle = await ctx.sessionPersistence.open(SessionId(stored.header.id), 'read')
    try { for (const id of referencedImageIds((await handle.read()).events)) retained.add(id) }
    finally { await handle.close() }
  }
  for (const session of live) for (const id of referencedImageIds(session.snapshotEvents())) retained.add(id)
  for (const ref of ctx.eleckoiProductData.listInputImageReferences()) {
    if (!deletedSessionId || ctx.eleckoiProductData.runtimeSessionId(ref.conversationId) !== deletedSessionId) retained.add(ref.attachmentId)
  }
  if (!ctx.attachments.root) throw new Error('生成图片清理需要本地附件存储。')
  const root = resolve(ctx.attachments.root)
  for (const [id, ref] of candidates) {
    if (retained.has(id)) continue
    const hash = id.slice('sha256:'.length), path = join(root, 'objects', hash.slice(0, 2), hash)
    if (resolve(ctx.attachments.imageHostPath(ref)) !== path) throw new Error('生成图片对象路径不正确，未删除文件。')
    try {
      const canonical = await realpath(root)
      for (const segments of [['objects'], ['objects', hash.slice(0, 2)]]) {
        const directory = join(root, ...segments)
        const info = await lstat(directory)
        if (!info.isDirectory() || info.isSymbolicLink() || await realpath(directory) !== join(canonical, ...segments)) throw new Error('生成图片对象目录不正确，未删除文件。')
      }
      const info = await lstat(path)
      if (!info.isFile() || info.isSymbolicLink()) throw new Error('生成图片对象不是本地文件，未删除。')
      await chmod(path, 0o600)
      await unlink(path)
    } catch (error) { if (record(error).code !== 'ENOENT') throw error }
  }
}
