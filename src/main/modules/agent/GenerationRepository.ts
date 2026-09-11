import type { SqliteDatabase } from '@main/platform/sqlite/SqliteDatabase'
import type { ConversationDeleteGuard, MessageRepository } from '@main/modules/conversations'
import type { MessageStatus } from '@shared/contracts/entities/chat'

export class GenerationRepository implements ConversationDeleteGuard {
  constructor(
    private readonly store: SqliteDatabase,
    private readonly messages: Pick<MessageRepository, 'bindPendingResponseToModel'>
  ) {}

  start(id: string, conversationId: string, messageId: string, model: string): void {
    this.store.withWriteTx(() => {
      const responseId = this.messages.bindPendingResponseToModel(conversationId, messageId, model)
      this.store.native.prepare(`INSERT INTO generation_attempts(id,conversationId,kind,ownerId,parentAttemptId,outputMessageId,attemptNumber,state,createdAtMillis,startedAtMillis,finishedAtMillis,errorMessage,outputPath,supersededByAttemptId)
        VALUES (?,?,'text',?,NULL,?,1,'running',?,?,NULL,'','',NULL)`).run(id, conversationId, responseId, messageId, Date.now(), Date.now())
    })
  }

  finish(id: string, status: MessageStatus, error = ''): void {
    this.store.native.prepare(`UPDATE generation_attempts SET state=?,finishedAtMillis=?,errorMessage=? WHERE id=? AND state='running'`)
      .run(status === 'complete' ? 'succeeded' : status === 'cancelled' ? 'cancelled' : 'failed', Date.now(), error, id)
  }

  assertCanDelete(conversationId: string): void {
    if (this.store.native.prepare(
      "SELECT 1 FROM generation_attempts WHERE conversationId = ? AND state IN ('queued', 'running') LIMIT 1"
    ).get(conversationId)) {
      throw new Error('请先停止此聊天的生成任务，再删除数据。')
    }
  }
}
