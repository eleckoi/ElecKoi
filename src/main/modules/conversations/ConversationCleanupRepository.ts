import { randomUUID } from 'node:crypto'
import type { SqliteDatabase } from '@main/platform/sqlite/SqliteDatabase'
import type { ConversationFiles } from '@main/platform/filesystem/ConversationFiles'

const kind = 'desktop_conversation_files'

export class ConversationCleanupRepository {
  constructor(private readonly store: SqliteDatabase, private readonly files: Pick<ConversationFiles, 'remove'>) {}

  enqueue(conversationId: string): void {
    this.store.native.prepare(`INSERT OR IGNORE INTO cleanup_operations(id,kind,targetId,state,attemptCount,createdAtEpochMs,updatedAtEpochMs,lastError)
      VALUES (?,?,?,'queued',0,?,?,'')`).run(randomUUID(), kind, conversationId, Date.now(), Date.now())
  }

  drain(): void {
    if (this.store.native.inTransaction) return
    const pending = this.store.native.prepare('SELECT id,targetId FROM cleanup_operations WHERE kind=? ORDER BY createdAtEpochMs,id').all(kind) as { id: string; targetId: string }[]
    for (const operation of pending) {
      this.store.native.prepare("UPDATE cleanup_operations SET state='running',attemptCount=attemptCount+1,updatedAtEpochMs=? WHERE id=?").run(Date.now(), operation.id)
      try {
        this.files.remove(operation.targetId)
        this.store.native.prepare('DELETE FROM cleanup_operations WHERE id=?').run(operation.id)
      } catch (error) {
        this.store.native.prepare("UPDATE cleanup_operations SET state='failed',updatedAtEpochMs=?,lastError=? WHERE id=?")
          .run(Date.now(), String(error).slice(0, 2000), operation.id)
      }
    }
  }
}
