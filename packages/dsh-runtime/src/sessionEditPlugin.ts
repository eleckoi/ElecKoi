import { DshSessionRewindUnavailableError, rewindDshSession } from './sessionRewind'
import { randomUUID } from 'node:crypto'
import { readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { SessionId } from '@deepseek-ai/dsh-session'
import { SessionWriteLease } from '@deepseek-ai/dsh-session-persistence-jsonl'
import { editDshSessionMessage } from './sessionMessageEdit'
import { mutateDshCompatibilityTimeline, type CompatibilityTimelineMutation } from './sessionCompatibilityTimeline'
import { readDshSessionLog, removeDshSessionTree, readDshTrajectory, type DshTrajectoryReadOptions } from './trajectory'
import { refreshSessionProjections, type SessionProjectionRefreshContext } from './sessionProjectionRefresh'

export const name = 'eleckoi-session-edit'
export const inject = ['eleckoiSessionHandles', 'sessionPersistence', 'sessionProjections', 'sessionProjectionCache']

export function apply(ctx: SessionProjectionRefreshContext & {
  eleckoiSessionHandles: { withClosed<T>(sessionId: string, action: () => T | Promise<T>): Promise<T> }
  sessionPersistence: { open(sessionId: SessionId, access: 'write'): Promise<{ close(): Promise<void> }> }
  provide(key: string, value: unknown): void
}): void {
  const sessionRoot = process.env.DSH_SESSION_ROOT
  if (!sessionRoot) throw new Error('DSH_SESSION_ROOT is required')
  ctx.provide('eleckoiSessionEditor', {
    readTrajectory(sessionId: string, options?: DshTrajectoryReadOptions) {
      return readDshTrajectory(sessionRoot, sessionId, options)
    },
    async mutateTimeline(sessionId: string, mutation: CompatibilityTimelineMutation) {
      return ctx.eleckoiSessionHandles.withClosed(sessionId, async () => {
        const probe = await ctx.sessionPersistence.open(SessionId(sessionId), 'write')
        await probe.close()
        const log = readDshSessionLog(sessionRoot, sessionId)
        if (!log) throw new Error('当前聊天对应的 DSH 会话日志无法读取。')
        const lease = await SessionWriteLease.acquire(dirname(log.path), SessionId(sessionId))
        try {
          const result = mutateDshCompatibilityTimeline(sessionRoot, sessionId, mutation)
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
        const probe = await ctx.sessionPersistence.open(sessionId as SessionId, 'write')
        await probe.close()
        const log = readDshSessionLog(sessionRoot, sessionId)
        if (!log) return undefined
        const lease = await SessionWriteLease.acquire(dirname(log.path), SessionId(sessionId))
        try {
          const count = rewindDshSession(sessionRoot, sessionId, fromTurn, fromEventSeq, retainInput)
          await refreshSessionProjections(ctx, sessionId)
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
        try { return { path: log.path, content: readFileSync(log.path) } }
        finally { await lease.release() }
      })
      try {
        return await operation()
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
      }
    },
    async deleteSession(sessionId: string): Promise<void> {
      await ctx.eleckoiSessionHandles.withClosed(sessionId, () => {
        removeDshSessionTree(sessionRoot, sessionId)
      })
    }
  })
}
