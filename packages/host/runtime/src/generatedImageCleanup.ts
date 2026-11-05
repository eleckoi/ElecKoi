import { chmod, lstat, realpath, unlink } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { assistantStreamChunks } from '@deepseek-ai/dsh-llm'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { SessionId } from '@deepseek-ai/dsh-session'
import { ELECKOI_FAILURE_CODES, productFailure } from '@eleckoi/dsh-product-api'

/** Only this tool's declared result metadata establishes generated-image ownership. */
export function generatedImageReferences(events: readonly SessionEvent[]): Map<string, ImageAttachmentRef> {
  const refs = new Map<string, ImageAttachmentRef>()
  for (const event of events) {
    if (event.type === 'eleckoi/illustration') {
      for (const frame of event.data.frames) if (frame.attachment && /^sha256:[a-f0-9]{64}$/.test(frame.attachment.attachmentId)) refs.set(frame.attachment.attachmentId, frame.attachment)
      continue
    }
    if (event.type !== 'tool/result' || event.data.meta?.source !== 'eleckoi-auto-illustration') continue
    for (const block of event.data.message.content) {
      if (block.type === 'image' && /^sha256:[a-f0-9]{64}$/.test(block.attachment.attachmentId)) refs.set(block.attachment.attachmentId, block.attachment)
    }
  }
  return refs
}

/** Read declared image carriers, including history that remains in the log. */
export function imageAttachmentReferences(events: readonly SessionEvent[]): Map<string, ImageAttachmentRef> {
  const refs = new Map<string, ImageAttachmentRef>()
  const illustrationBatches = new Map<string, SessionEvent<'eleckoi/illustration'>['data']>()
  const content = (blocks: unknown) => {
    if (!Array.isArray(blocks)) return
    for (const block of blocks) if (block?.type === 'image' && /^sha256:[a-f0-9]{64}$/.test(block.attachment?.attachmentId)) refs.set(block.attachment.attachmentId, block.attachment)
  }
  for (const event of events) {
    if (event.type === 'eleckoi/illustration') {
      illustrationBatches.set(event.data.batchId, event.data)
      continue
    }
    const data = event.data as { content?: unknown; message?: { content?: unknown }; inserted?: { content?: unknown }[]; summary?: unknown; rawOutput?: unknown }
    switch (event.type as string) {
      case 'user/message': case 'tool/ptc-dispatch': content(data.content); break
      case 'system/message': case 'developer/message': case 'tool/result': case 'team/message/queued': content(data.message?.content); break
      case 'agent/inbox/spliced': if (Array.isArray(data.inserted)) for (const message of data.inserted) content(message?.content); break
      case 'compaction/summary': content(data.summary); content(data.rawOutput); break
      case 'assistant/message': content(data.message?.content)
      case 'assistant/attempt':
        for (const chunk of assistantStreamChunks((event as SessionEvent<'assistant/message' | 'assistant/attempt'>).data.stream, 'block-end')) content([chunk.block])
        break
    }
  }
  for (const batch of illustrationBatches.values()) for (const frame of batch.frames) if (frame.attachment) refs.set(frame.attachment.attachmentId, frame.attachment)
  return refs
}

export function referencedImageIds(events: readonly SessionEvent[]): Set<string> { return new Set(imageAttachmentReferences(events).keys()) }

export interface GeneratedImageCleanupContext {
  attachments: { root?: string; imageHostPath(ref: ImageAttachmentRef): string }
  sessionPersistence: {
    list(): Promise<Array<{ header: { id: string } }>>
    open(id: SessionId, access: 'read'): Promise<{ read(): Promise<{ events: readonly SessionEvent[] }>; close(): Promise<void> }>
  }
  sessions: { list(): Array<{ id: string; snapshotEvents(): readonly SessionEvent[] }> }
  eleckoiProductData: { listInputImageReferences(): Array<{ conversationId: string; attachmentId: string }>; runtimeSessionId(conversationId: string): string }
}

/** Delete only removed generated objects after a successful record edit. */
export async function deleteRemovedGeneratedImages(ctx: GeneratedImageCleanupContext, candidates: Map<string, ImageAttachmentRef>, deletedSessionId?: string | readonly string[]): Promise<void> {
  if (!candidates.size) return
  const retained = new Set<string>()
  const deleted = new Set(typeof deletedSessionId === 'string' ? [deletedSessionId] : deletedSessionId)
  const live = ctx.sessions.list().filter(session => !deleted.has(session.id))
  const liveIds = new Set(live.map(session => session.id))
  for (const stored of await ctx.sessionPersistence.list()) {
    if (deleted.has(stored.header.id)) continue
    // The current writer's Session includes updates still being persisted.
    if (liveIds.has(stored.header.id)) continue
    const handle = await ctx.sessionPersistence.open(SessionId(stored.header.id), 'read')
    try { for (const id of referencedImageIds((await handle.read()).events)) retained.add(id) }
    finally { await handle.close() }
  }
  for (const session of live) for (const id of referencedImageIds(session.snapshotEvents())) retained.add(id)
  for (const ref of ctx.eleckoiProductData.listInputImageReferences()) {
    if (!deleted.has(ctx.eleckoiProductData.runtimeSessionId(ref.conversationId))) retained.add(ref.attachmentId)
  }
  if (!ctx.attachments.root) throw productFailure(ELECKOI_FAILURE_CODES.statePrecondition, '生成图片清理需要本地附件存储。', { what: '配置本地附件存储' })
  const root = resolve(ctx.attachments.root)
  for (const [id, ref] of candidates) {
    if (retained.has(id)) continue
    const hash = id.slice('sha256:'.length), path = join(root, 'objects', hash.slice(0, 2), hash)
    if (resolve(ctx.attachments.imageHostPath(ref)) !== path) throw productFailure(ELECKOI_FAILURE_CODES.securityDenied, '生成图片对象路径不正确，未删除文件。', { what: '生成图片对象的存储路径', guard: '附件存储根目录' })
    try {
      const canonical = await realpath(root)
      for (const segments of [['objects'], ['objects', hash.slice(0, 2)]]) {
        const directory = join(root, ...segments)
        const info = await lstat(directory)
        if (!info.isDirectory() || info.isSymbolicLink() || await realpath(directory) !== join(canonical, ...segments)) throw productFailure(ELECKOI_FAILURE_CODES.securityDenied, '生成图片对象目录不正确，未删除文件。', { what: '生成图片对象的存储目录', guard: '附件存储根目录' })
      }
      const info = await lstat(path)
      if (!info.isFile() || info.isSymbolicLink()) throw productFailure(ELECKOI_FAILURE_CODES.securityDenied, '生成图片对象不是本地文件，未删除。', { what: '生成图片对象', guard: '只删除本地普通文件' })
      await chmod(path, 0o600)
      await unlink(path)
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  }
}
