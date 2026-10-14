import { DshSessionRewindUnavailableError, rewindDshSession } from './sessionRewind'
import { randomUUID } from 'node:crypto'
import { readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { SessionId } from '@deepseek-ai/dsh-session'
import { SessionWriteLease } from '@deepseek-ai/dsh-session-persistence-jsonl'
import { editDshSessionMessage, readEditableDshSessionLog, rewriteDshSessionEvents } from './sessionMessageEdit'
import { runtimeEventToFormat } from './sessionFormatBoundary.mjs'
import { findGeneratedImage } from '@eleckoi/dsh-client-roleplay/host/generated-image-result.mjs'
import type { GeneratedImageFrame } from '@eleckoi/dsh-product-data'
import { importDshTranscript, type TranscriptMessage } from './sessionTranscriptImport'
import { batchDshSessionMessages, type SessionMessageBatchItem } from './sessionMessageBatch'
import { readDshSessionLog, removeDshSessionTree, readDshTrajectory, type DshTrajectoryReadOptions } from './trajectory'
import { refreshSessionProjections, type SessionProjectionRefreshContext } from './sessionProjectionRefresh'
import { generatedImageReferences, generatedImageReference, deleteRemovedGeneratedImages, type GeneratedImageCleanupContext } from './generatedImageCleanup'

export const name = 'eleckoi-session-edit'
export const inject = ['eleckoiSessionHandles', 'sessionPersistence', 'sessionProjections', 'sessionProjectionCache', 'attachments', 'sessions', 'eleckoiProductData']

export function apply(ctx: SessionProjectionRefreshContext & GeneratedImageCleanupContext & {
  eleckoiSessionHandles: { withClosed<T>(sessionId: string, action: () => T | Promise<T>): Promise<T> }
  sessionPersistence: { open(sessionId: SessionId, access: 'write'): Promise<{ close(): Promise<void> }> }
  provide(key: string, value: unknown): void
}): void {
  const sessionRoot = process.env.DSH_SESSION_ROOT
  if (!sessionRoot) throw new Error('DSH_SESSION_ROOT is required')
  const transactions = new Set<string>()
  ctx.provide('eleckoiSessionEditor', {
    async batchMessages(sessionId: string, previous: SessionMessageBatchItem[], desired: SessionMessageBatchItem[]) {
      return ctx.eleckoiSessionHandles.withClosed(sessionId, async () => {
        const probe = await ctx.sessionPersistence.open(SessionId(sessionId), 'write')
        await probe.close()
        const log = readEditableDshSessionLog(sessionRoot, sessionId)
        const lease = await SessionWriteLease.acquire(dirname(log.path), SessionId(sessionId))
        try {
          const result = batchDshSessionMessages(sessionRoot, sessionId, previous, desired)
          await refreshSessionProjections(ctx, sessionId)
          if (!transactions.has(sessionId)) await deleteRemovedGeneratedImages(ctx, generatedImageReferences(log.events))
          return result
        } finally { await lease.release() }
      })
    },
    readTrajectory(sessionId: string, options?: DshTrajectoryReadOptions) {
      return readDshTrajectory(sessionRoot, sessionId, options)
    },
    async importTranscript(sessionId: string, messages: TranscriptMessage[]) {
      return ctx.eleckoiSessionHandles.withClosed(sessionId, async () => {
        const probe = await ctx.sessionPersistence.open(SessionId(sessionId), 'write')
        await probe.close()
        const log = readDshSessionLog(sessionRoot, sessionId)
        if (!log) throw new Error('当前聊天对应的 DSH 会话日志无法读取。')
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
        const probe = await ctx.sessionPersistence.open(SessionId(sessionId), 'write')
        await probe.close()
        const log = readDshSessionLog(sessionRoot, sessionId)
        if (!log) throw new Error('当前聊天对应的 DSH 会话日志无法读取。')
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
        const probe = await ctx.sessionPersistence.open(SessionId(sessionId), 'write')
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
        if (!log) throw new Error('当前聊天对应的 DSH 会话日志无法读取。')
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
        const images = generatedImageReferences(readDshSessionLog(sessionRoot, sessionId)?.events || [])
        removeDshSessionTree(sessionRoot, sessionId)
        await deleteRemovedGeneratedImages(ctx, images, sessionId)
      })
    },
    async discardGeneratedImages(images: NonNullable<GeneratedImageFrame['attachment']>[]): Promise<void> {
      await deleteRemovedGeneratedImages(ctx, new Map(images.map(ref => [ref.attachmentId, generatedImageReference(ref)])))
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
          if (next.id !== frameId) throw new Error('生图结果的分镜编号与选中图片不一致。')
          const { prompt, negative_prompt, after_paragraph, ...outcome } = next
          const frames = selected.data.frames.map(frame => frame.id === frameId ? outcome : frame)
          const ready = frames.filter(frame => frame.status === 'ready').length
          const errors = frames.filter(frame => frame.error).map(frame => frame.error)
          const value = { frames, status: ready === frames.length && !errors.length ? 'complete' : ready ? 'partial' : 'failed',
            ...(errors.length ? { error: errors.join('\n') } : {}) }
          const { error: previousError, ...previousData } = selected.data
          const events = original.events.map(event => event === selected.event ? runtimeEventToFormat({ ...event, data: { ...previousData, ...value } }) : event)
          rewriteDshSessionEvents(sessionRoot, original, events)
          await refreshSessionProjections(ctx, sessionId)
          await deleteRemovedGeneratedImages(ctx, generatedImageReferences(original.events))
          return next
        } catch (error) {
          if (next?.attachment) await deleteRemovedGeneratedImages(ctx, new Map([[next.attachment.attachmentId, generatedImageReference(next.attachment)]]))
          throw error
        } finally { await lease.release() }
      })
    }
  })
}
