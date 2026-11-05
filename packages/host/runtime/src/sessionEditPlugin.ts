import { DshSessionRewindUnavailableError, rewindDshSession } from './sessionRewind'
import { randomUUID } from 'node:crypto'
import { readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { SessionId } from '@deepseek-ai/dsh-session'
import { SessionWriteLease } from '@deepseek-ai/dsh-session-persistence-jsonl'
import { editDshSessionMessage, readEditableDshSessionLog, rewriteDshSessionEvents } from './sessionMessageEdit'
import { findGeneratedImage } from '@eleckoi/dsh-client-roleplay/host/generated-image-result.mjs'
import { removeSessionSnapshot } from '@eleckoi/dsh-client-roleplay/host/session-snapshot.mjs'
import type { GeneratedImageFrame } from '@eleckoi/dsh-product-data'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { importDshTranscript, type TranscriptMessage } from './sessionTranscriptImport'
import { readDshSessionLog, readDshSessionTreeIds, removeDshSessionTree, readDshTrajectory, type DshTrajectoryReadOptions } from './trajectory'
import { refreshSessionProjections, type SessionProjectionRefreshContext } from './sessionProjectionRefresh'
import { generatedImageReferences, imageAttachmentReferences, deleteRemovedGeneratedImages, type GeneratedImageCleanupContext } from './generatedImageCleanup'
import { ELECKOI_FAILURE_CODES, productFailure } from '@eleckoi/dsh-product-api'

export const name = 'eleckoi-session-edit'
export const inject = ['eleckoiSessionHandles', 'sessionPersistence', 'sessionProjections', 'sessionProjectionCache', 'attachments', 'sessions', 'eleckoiProductData', 'workspaceRegistry']

export function apply(ctx: SessionProjectionRefreshContext & GeneratedImageCleanupContext & {
  eleckoiSessionHandles: { withClosed<T>(sessionId: string, action: () => T | Promise<T>): Promise<T> }
  workspaceRegistry: {
    list(): Array<{ detachSession(id: SessionId): Promise<void> }>
    unpinSession(id: SessionId): Promise<void>
    unarchiveSession(id: SessionId): Promise<void>
  }
  sessionPersistence: { open(sessionId: SessionId, access: 'write'): Promise<{ close(): Promise<void> }> }
  get(key: 'spillStore'): { removeSessionResults?(sessionIds: string[]): Promise<void> } | undefined
  logger: { error(message: string): void }
  provide(key: string, value: unknown): void
}): void {
  const sessionRoot = process.env.DSH_SESSION_ROOT
  if (!sessionRoot) throw productFailure(ELECKOI_FAILURE_CODES.internal, 'DSH_SESSION_ROOT is required', { what: 'DSH 会话目录配置' })
  const transactions = new Set<string>()
  ctx.provide('eleckoiSessionEditor', {
    readTrajectory(sessionId: string, options?: DshTrajectoryReadOptions) {
      return readDshTrajectory(sessionRoot, sessionId, options)
    },
    async importTranscript(sessionId: string, messages: TranscriptMessage[]) {
      return ctx.eleckoiSessionHandles.withClosed(sessionId, async () => {
        const probe = await ctx.sessionPersistence.open(SessionId(sessionId), 'write')
        await probe.close()
        const log = readDshSessionLog(sessionRoot, sessionId)
        if (!log) throw productFailure(ELECKOI_FAILURE_CODES.lookupNotFound, '当前聊天对应的 DSH 会话日志无法读取。', { what: '当前聊天的 DSH 会话日志' })
        const lease = await SessionWriteLease.acquire(dirname(log.path), SessionId(sessionId))
        try {
          const result = importDshTranscript(sessionRoot, sessionId, messages)
          await refreshSessionProjections(ctx, sessionId)
          return result
        } finally { await lease.release() }
      })
    },
    async editMessage(sessionId: string, eventSeq: number, role: 'user' | 'assistant', content: string): Promise<void> {
      await ctx.eleckoiSessionHandles.withClosed(sessionId, async () => {
        const probe = await ctx.sessionPersistence.open(sessionId as SessionId, 'write')
        await probe.close()
        const log = readDshSessionLog(sessionRoot, sessionId)
        if (!log) throw productFailure(ELECKOI_FAILURE_CODES.lookupNotFound, '当前聊天对应的 DSH 会话日志无法读取。', { what: '当前聊天的 DSH 会话日志' })
        const lease = await SessionWriteLease.acquire(dirname(log.path), SessionId(sessionId))
        try {
          editDshSessionMessage(sessionRoot, sessionId, eventSeq, role, content)
          await refreshSessionProjections(ctx, sessionId)
        } finally { await lease.release() }
      })
    },
    async rewind(sessionId: string, fromTurn: number, fromEventSeq?: number, retainInput = false): Promise<number | undefined> {
      return ctx.eleckoiSessionHandles.withClosed(sessionId, async () => {
        if (!readDshSessionLog(sessionRoot, sessionId)) return undefined
        const probe = await ctx.sessionPersistence.open(sessionId as SessionId, 'write')
        await probe.close()
        const log = readDshSessionLog(sessionRoot, sessionId)
        if (!log) return undefined
        const lease = await SessionWriteLease.acquire(dirname(log.path), SessionId(sessionId))
        try {
          const count = rewindDshSession(sessionRoot, sessionId, fromTurn, fromEventSeq, retainInput)
          await refreshSessionProjections(ctx, sessionId)
          if (!transactions.has(sessionId)) await deleteRemovedGeneratedImages(ctx, generatedImageReferences(log.events))
          return count
        } catch (error) {
          if (error instanceof DshSessionRewindUnavailableError) return undefined
          throw error
        } finally { await lease.release() }
      })
    },
    async transaction<T>(sessionId: string, operation: () => Promise<T>): Promise<T> {
      const original = await ctx.eleckoiSessionHandles.withClosed(sessionId, async () => {
        const probe = await ctx.sessionPersistence.open(SessionId(sessionId), 'write')
        await probe.close()
        const log = readDshSessionLog(sessionRoot, sessionId)
        if (!log) throw productFailure(ELECKOI_FAILURE_CODES.lookupNotFound, '当前聊天对应的 DSH 会话日志无法读取。', { what: '当前聊天的 DSH 会话日志' })
        const lease = await SessionWriteLease.acquire(dirname(log.path), SessionId(sessionId))
        try { return { path: log.path, content: readFileSync(log.path), images: generatedImageReferences(log.events) } }
        finally { await lease.release() }
      })
      let result: T
      transactions.add(sessionId)
      try {
        result = await operation()
      } catch (error) {
        await ctx.eleckoiSessionHandles.withClosed(sessionId, async () => {
          const lease = await SessionWriteLease.acquire(dirname(original.path), SessionId(sessionId))
          const temporary = `${original.path}.${randomUUID()}.tmp`
          try {
            writeFileSync(temporary, original.content, { flag: 'wx' })
            renameSync(temporary, original.path)
          } finally {
            rmSync(temporary, { force: true })
            await lease.release()
          }
          await refreshSessionProjections(ctx, sessionId)
        })
        throw error
      } finally { transactions.delete(sessionId) }
      await deleteRemovedGeneratedImages(ctx, original.images)
      return result
    },
    async deleteSession(sessionId: string): Promise<void> {
      await ctx.eleckoiSessionHandles.withClosed(sessionId, async () => {
        const ids = readDshSessionTreeIds(sessionRoot, sessionId)
        const closeChildren = async (index: number): Promise<void> => {
          if (index < ids.length) {
            const id = ids[index]!
            if (id !== sessionId) return ctx.eleckoiSessionHandles.withClosed(id, () => closeChildren(index + 1))
            return closeChildren(index + 1)
          }
          const store = ctx.get('spillStore')
          if (!store?.removeSessionResults) throw productFailure(ELECKOI_FAILURE_CODES.lifecycleNotReady, '当前 Host 未提供工具结果删除服务。', { what: '工具结果删除服务' })
          const images = new Map(ids.flatMap(id => [...imageAttachmentReferences(readDshSessionLog(sessionRoot, id)?.events ?? [])]))
          // Keep the logs and their ownership available if a cleanup fails; retry is idempotent.
          await store.removeSessionResults(ids)
          for (const id of ids) {
            removeSessionSnapshot(process.env.ELECKOI_SESSION_SNAPSHOT_ROOT, id)
            for (const workspace of ctx.workspaceRegistry.list()) await workspace.detachSession(SessionId(id))
            await ctx.workspaceRegistry.unpinSession(SessionId(id))
            await ctx.workspaceRegistry.unarchiveSession(SessionId(id))
          }
          await deleteRemovedGeneratedImages(ctx, images, ids)
          removeDshSessionTree(sessionRoot, sessionId)
        }
        await closeChildren(0)
      })
    },
    async discardGeneratedImages(images: NonNullable<GeneratedImageFrame['attachment']>[]): Promise<void> {
      await deleteRemovedGeneratedImages(ctx, new Map(images.map(ref => [ref.attachmentId, ref])))
    },
    async regenerateImage(sessionId: string, batchId: string, frameId: number, generate: (frame: GeneratedImageFrame) => Promise<GeneratedImageFrame>): Promise<GeneratedImageFrame> {
      return ctx.eleckoiSessionHandles.withClosed(sessionId, async () => {
        const probe = await ctx.sessionPersistence.open(SessionId(sessionId), 'write')
        await probe.close()
        const original = readEditableDshSessionLog(sessionRoot, sessionId)
        const selected = findGeneratedImage(original.events, batchId, frameId)
        const lease = await SessionWriteLease.acquire(dirname(original.path), SessionId(sessionId))
        let next: GeneratedImageFrame | undefined
        try {
          next = await generate(structuredClone(selected.frame))
          if (next.id !== frameId) throw productFailure(ELECKOI_FAILURE_CODES.stateMismatch, '生图结果的分镜编号与选中图片不一致。', { what: '生图结果的分镜编号' })
          const { prompt, negative_prompt, after_paragraph, ...outcome } = next
          const frames = selected.event.data.frames.map((frame: GeneratedImageFrame) => frame.id === frameId ? outcome : frame)
          const ready = frames.filter((frame: GeneratedImageFrame) => frame.status === 'ready').length
          const errors = frames.filter((frame: GeneratedImageFrame) => frame.error).map((frame: GeneratedImageFrame) => frame.error)
          const value = { frames, status: ready === frames.length && !errors.length ? 'complete' : ready ? 'partial' : 'failed',
            ...(errors.length ? { error: errors.join('\n') } : {}) }
          const { error: previousError, ...previousData } = selected.event.data
          const events = original.events.map(event => event === selected.event ? { ...event, data: { ...previousData, ...value } } as SessionEvent : event)
          rewriteDshSessionEvents(sessionRoot, original, events)
          await refreshSessionProjections(ctx, sessionId)
          await deleteRemovedGeneratedImages(ctx, generatedImageReferences(original.events))
          return next
        } catch (error) {
          if (next?.attachment) await deleteRemovedGeneratedImages(ctx, new Map([[next.attachment.attachmentId, next.attachment]]))
          throw error
        } finally { await lease.release() }
      })
    }
  })
}
