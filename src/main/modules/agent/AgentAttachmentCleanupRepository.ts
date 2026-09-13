import { randomUUID } from 'node:crypto'
import type { ConversationDeleteCleanup, MessageRepository } from '@main/modules/conversations'
import type { SqliteDatabase } from '@main/platform/sqlite/SqliteDatabase'
import type { DshAgentRuntime } from './DshAgentRuntime'

const kind = 'dsh_image_attachment'
export class AgentAttachmentCleanupRepository implements ConversationDeleteCleanup {
  constructor(
    private readonly store: SqliteDatabase,
    private readonly runtime: Pick<DshAgentRuntime, 'removeImage'>,
    private readonly messages: Pick<MessageRepository, 'listInputImageReferences'>
  ) {}

  enqueue(conversationId: string): void {
    const references = this.messages.listInputImageReferences()
    const targets = new Set(references
      .filter((row) => row.conversationId === conversationId)
      .map((row) => row.attachmentId))
    const retained = new Set(references
      .filter((row) => row.conversationId !== conversationId)
      .map((row) => row.attachmentId))
    this.enqueueTargets([...targets].filter((id) => !retained.has(id)))
  }

  discardPrepared(attachmentIds: readonly string[]): void {
    const retained = new Set(this.messages.listInputImageReferences().map((row) => row.attachmentId))
    this.store.withWriteTx(() => {
      this.enqueueTargets([...new Set(attachmentIds)].filter((id) => !retained.has(id)))
    })
    this.drain()
  }

  private enqueueTargets(targetIds: readonly string[]): void {
    const insert = this.store.native.prepare(`INSERT OR IGNORE INTO cleanup_operations(
      id,kind,targetId,state,attemptCount,createdAtEpochMs,updatedAtEpochMs,lastError
    ) VALUES (?,?,?,'queued',0,?,?,'')`)
    for (const id of targetIds) insert.run(randomUUID(), kind, id, Date.now(), Date.now())
  }

  drain(): void {
    if (this.store.native.inTransaction) return
    const pending = this.store.native.prepare('SELECT id,targetId FROM cleanup_operations WHERE kind=? ORDER BY createdAtEpochMs,id')
      .all(kind) as { id: string; targetId: string }[]
    for (const operation of pending) {
      if (this.isReferenced(operation.targetId)) {
        this.store.native.prepare('DELETE FROM cleanup_operations WHERE id=?').run(operation.id)
        continue
      }
      this.store.native.prepare("UPDATE cleanup_operations SET state='running',attemptCount=attemptCount+1,updatedAtEpochMs=? WHERE id=?")
        .run(Date.now(), operation.id)
      try {
        this.runtime.removeImage(operation.targetId)
        this.store.native.prepare('DELETE FROM cleanup_operations WHERE id=?').run(operation.id)
      } catch (error) {
        this.store.native.prepare("UPDATE cleanup_operations SET state='failed',updatedAtEpochMs=?,lastError=? WHERE id=?")
          .run(Date.now(), String(error).slice(0, 2000), operation.id)
      }
    }
  }

  private isReferenced(targetId: string): boolean {
    return this.messages.listInputImageReferences().some((row) => row.attachmentId === targetId)
  }
}
